// netlify/functions/stripe-webhook.js
// -----------------------------------------------------------------------------
// STRIPE TELLS US WHAT WAS PAID. This writes public.subscriptions for the website; from version 1.1 the
// store apps' purchases reach the same one-row-per-household table from RevenueCat
// (_lib/storeSubscriptions.js). Neither replaces a row the other has PAID for (storePaidRow below).
//
// FAIL CLOSED, in that order:
//   no secret configured        -> 500, nothing read, nothing written
//   signature missing or wrong  -> 400, body never parsed
//   unparseable body            -> 400
//   handler throws              -> 500 so Stripe retries, row marked 'failed'
// An event is only ever acknowledged as done after the write it describes succeeded.
//
// IDEMPOTENCY. The INSERT into billing_events is the lock, claimed BEFORE the work:
// the first delivery inserts and processes, a replay hits the primary key and is
// acknowledged without repeating anything. A row left 'failed' may be retried — that is
// a delivery that never completed, not one that completed twice.
//
// Stripe retries until it gets a 2xx, so a 200 means "this is finished with".
// -----------------------------------------------------------------------------
"use strict";

const { getAdminClient } = require("./_lib/auth");
const { verifyStripeSignature } = require("./_lib/stripeSignature");
const { isPaidSubscription, isStoreRow } = require("./_lib/planRules");
const { isLiveStripeStatus, holdsHousehold } = require("./_lib/stripeLive");
const { alertSupport } = require("./_lib/supportAlert");
const { takeSeat, releaseSeat, releaseTrialSeat } = require("./_lib/foundingSeats");
const { reconcileHouseholdBilling } = require("./_lib/household");
const { creatorsEnabled, creditStripeInvoice, clawbackStripeCharge, settleStripeDispute } = require("./_lib/creators");
const { stripeGet } = require("./_lib/stripeApi");
const plusAddon = require("./_lib/plusAddon");
// The full funnel (migration 0042): the website's payment, cancellation or refund, first time only.
const { stripeMilestone, recordMilestone } = require("./_lib/funnel");
const { trialPlanFirstSince } = require("./_lib/planRules");
const stripeApi = require("./_lib/stripeApi");   // TRIAL_PLAN_FIRST only: a trial checkout's subscription
// GIFTS (migration 0050): a paid gift checkout makes its one code; a refunded gift voids it while unused.
const gifts = require("./_lib/gifts");
// The stores, asked the moment a website Plus ends (applyPlusEvent).
const { fetchSubscriber, acceptSandboxFor } = require("./_lib/storeSubscriptions");

const HANDLED = Object.freeze([
  "checkout.session.completed",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "charge.refunded",
]);
// THE CREATOR PROGRAM (behind CREATORS_ENABLED). invoice.paid is the only event that says what each payment was, renewals
// included. With the flag off it is ignored like any other event not handled here.
const CREATOR_EVENT = "invoice.paid";
// And a chargeback that is over: a lost one takes the commission on that payment back, as a refund does, and one that later
// turns into a win gives it back. Stripe's docs don't say which event a late win sends, so both are read. Off, ignored.
const CREATOR_DISPUTE_EVENTS = Object.freeze(["charge.dispute.closed", "charge.dispute.funds_reinstated"]);

const reply = (statusCode, body) => ({
  statusCode, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});

const isoOrNull = (unixSeconds) =>
  Number.isFinite(unixSeconds) ? new Date(unixSeconds * 1000).toISOString() : null;

// Stripe → our row. plan_key comes from the metadata we set at checkout; price_id is stored for
// support, never used to decide anything (it differs between test and live mode).
function subscriptionPatch(sub, extra = {}) {
  const item = sub?.items?.data?.[0] || {};
  return {
    provider: "stripe",
    provider_subscription_id: sub.id,
    provider_customer_id: typeof sub.customer === "string" ? sub.customer : sub.customer?.id,
    status: sub.status,
    plan_key: sub.metadata?.plan_key || null,
    price_id: item.price?.id || null,
    currency: (sub.currency || "cad").toUpperCase(),
    // Stripe API 2025-03-31 moved the period onto the subscription's items. Either place is read, so the
    // paid period is stored whichever API version the endpoint uses; without it, access would follow
    // the status alone and a missed cancellation would never run out.
    current_period_end: isoOrNull(Number.isFinite(sub.current_period_end) ? sub.current_period_end : item.current_period_end),
    // Renewal off. A dashboard "cancel at period end" now sets cancel_at (the period's end) and leaves
    // cancel_at_period_end false (Stripe's current API), so either one means it will not renew.
    cancel_at_period_end: !!sub.cancel_at_period_end || (Number.isFinite(sub.cancel_at) && sub.cancel_at > 0),
    automatic_tax: !!sub.automatic_tax?.enabled,
    updated_at: new Date().toISOString(),
    ...extra,
  };
}

// THE AMOUNTS (Stripe Tax on, 2026-10-20). The checkout session says what the first payment was, in cents:
// before tax, the tax, and the total. A subscription event carries none of them, so they come from here only.
// A value that is not a whole, non-negative number of cents is left out rather than guessed.
function checkoutAmounts(session) {
  const cents = (v) => (Number.isInteger(v) && v >= 0 ? v : null);
  const out = {};
  const subtotal = cents(session?.amount_subtotal), tax = cents(session?.total_details?.amount_tax), total = cents(session?.amount_total);
  if (subtotal !== null) out.amount_subtotal_cents = subtotal;
  if (tax !== null) out.amount_tax_cents = tax;
  if (total !== null) out.amount_total_cents = total;
  return out;
}

// A FOUNDING SUBSCRIPTION THAT HAS ENDED (rule of 2026-10-07). The founding price is "for as long as
// you stay subscribed": once a founding subscription is over, that household is offered the regular
// prices only, and its waitlist number is never given to anyone else. Stripe's last word on an ended
// subscription is status "canceled" (customer.subscription.deleted carries it too). plan_key is ours,
// written into the subscription's metadata at checkout. past_due and unpaid are NOT ended: Stripe is
// still trying to collect, and the subscription can recover.
function foundingSubscriptionEnded(evtType, sub) {
  if (sub?.metadata?.plan_key !== "founding_annual") return false;
  return evtType === "customer.subscription.deleted" || sub?.status === "canceled";
}

// TRIAL_PLAN_FIRST: a subscription that ended inside its free trial, never charged (cancelled before day 14). It held
// the founding price only as a trial: its seat goes back, and the founding price is not marked as ended for it.
function endedInTrialUnpaid(sub) {
  const trialEnd = Number(sub && sub.trial_end);
  const endedAt = Number((sub && (sub.ended_at || sub.canceled_at)) || 0);
  return Number.isFinite(trialEnd) && trialEnd > 0 && endedAt > 0 && endedAt <= trialEnd;
}

function userIdFrom(object) {
  return object?.metadata?.user_id || object?.client_reference_id || null;
}

// A FOUNDING SEAT (2026-10-29, migration 0032): the first 50 households who subscribe to the founding price hold
// one. Taken when a founding checkout completes with its first payment made ("paid"; "no_payment_required" too, a
// promotion code that covers it, since that household holds the price all the same), never for "unpaid".
function foundingCheckoutPaid(session) {
  return session?.metadata?.plan_key === "founding_annual" && session?.mode !== "payment"
    && ["paid", "no_payment_required"].includes(session?.payment_status);
}

// THE PLUS ADD-ON'S STRIPE EVENTS (migration 0044). Written to public.plus_addon_subscriptions only. A checkout is read
// back from Stripe (its subscription, for the price and the period), never from the session alone. Anything that is not
// a real Plus price is acknowledged and grants nothing.
//
// ORDER AND TWO AT ONCE (review 2026-11-22). Stripe does not promise the order events arrive in, two can be handled at
// the same moment, and an event's time is to the second, so "created" and "updated" for one checkout often carry the
// same one. So:
//   - events are ordered by their own time ONLY against the row of the SAME subscription. An older one changes nothing.
//   - the SAME second cannot be ordered at all: then the subscription is read from Stripe, and what Stripe says now is
//     written, whichever event arrived last.
//   - every write goes through plusAddon.writePlusRow: it lands only if the row is still as this handler read it. If
//     another handler wrote in between, this one reads the row again, reads Stripe again, and decides again.
//   - an event for ANOTHER subscription than the one on the row never takes a live row away: one that is not live is
//     ignored; one that is live beside a live row is a second purchase (below); one that is live when the row is not
//     becomes the row.
// A SECOND PLUS (the buyer already has a live one in a store, or a second live website subscription): the row is kept,
// the extra website subscription is set to end at its period end so it is never charged again (as the main plan does
// for a household's extra one), and support is told once (plusAddon.flagSecondPlus). If Stripe cannot be told, the
// event fails and Stripe sends it again.
// WHEN A WEBSITE PLUS ENDS, the stores are asked at once (when the store apps sell): a store Plus the same buyer also
// pays for must count from that moment, not from its next renewal.
async function applyPlusEvent(admin, evt, object, reply, { stripeGet: get }) {
  const T = plusAddon.TABLE;
  const settle = (status, error = null) => admin.from("billing_events")
    .update({ status, processed_at: new Date().toISOString(), error }).eq("event_id", evt.id);
  const eventAtIso = isoOrNull(evt.created);
  const deps = { stripeGet: get, stripePost: stripeApi.stripePost, alertSupport };
  try {
    let sub = object;
    let userId = userIdFrom(object);
    const isCheckout = evt.type === "checkout.session.completed";
    let subId = object && object.id;
    if (isCheckout) {
      subId = typeof object.subscription === "string" ? object.subscription : object.subscription?.id;
      if (!subId) { await settle("ignored", "plus: a checkout with no subscription"); return reply(200, { received: true, ignored: true }); }
      sub = await get(`/subscriptions/${encodeURIComponent(subId)}`);
    }
    const deleted = evt.type === "customer.subscription.deleted";
    for (let attempt = 0; attempt < plusAddon.WRITE_TRIES; attempt++) {
      // After another handler wrote in between, Stripe is asked again: this write must not carry an older answer.
      if (attempt > 0) sub = await get(`/subscriptions/${encodeURIComponent(subId)}`);
      let row = plusAddon.plusRowFromStripe(sub, process.env, deleted ? { status: "canceled" } : {});
      if (!row) { await settle("ignored", "plus: not a Plus price, nothing granted"); return reply(200, { received: true, ignored: true }); }
      // The account: our own row for this subscription first, then the metadata the server put on it.
      const { data: bySub, error: subErr } = await admin.from(T).select(`user_id, ${plusAddon.ROW_COLS}`).eq("provider_subscription_id", row.provider_subscription_id).maybeSingle();
      if (subErr) throw Object.assign(new Error(`plus read: ${subErr.code || "error"}`), { pg: subErr });
      if (bySub && bySub.user_id) userId = bySub.user_id;
      if (!userId) userId = sub && sub.metadata && sub.metadata.user_id;
      if (!userId) throw new Error("plus: no account for the subscription");
      const { data: cur, error: curErr } = bySub ? { data: bySub, error: null }
        : await admin.from(T).select(`user_id, ${plusAddon.ROW_COLS}`).eq("user_id", userId).maybeSingle();
      if (curErr) throw Object.assign(new Error(`plus read: ${curErr.code || "error"}`), { pg: curErr });
      if (bySub) {
        const applied = Date.parse(bySub.last_event_at || "");
        if (Number.isFinite(evt.created) && Number.isFinite(applied)) {
          if (evt.created * 1000 < applied) {
            await settle("ignored", "stale: a newer event has already been applied to this Plus subscription");
            return reply(200, { received: true, stale: true });
          }
          if (evt.created * 1000 === applied && attempt === 0 && !isCheckout) {
            // The same second as the event already applied: no order between them. Stripe says what is true now.
            sub = await get(`/subscriptions/${encodeURIComponent(subId)}`);
            row = plusAddon.plusRowFromStripe(sub, process.env, deleted ? { status: "canceled" } : {});
            if (!row) { await settle("ignored", "plus: not a Plus price, nothing granted"); return reply(200, { received: true, ignored: true }); }
          }
        }
      } else if (cur) {
        const liveNew = plusAddon.isLivePlusRow(row);
        const liveCur = plusAddon.isLivePlusRow(cur);
        const store = cur.provider !== "stripe";
        const otherWebSub = !store && !!cur.provider_subscription_id;     // the row is another website subscription's
        if ((store && liveCur) || (otherWebSub && liveCur && liveNew)) {
          // One Plus per buyer: the live row is never written over. A live second one is set to end, and support is told.
          if (liveNew) {
            console.error(store ? "[stripe-webhook] plus conflict: a website Plus subscription for a buyer whose Plus is in a store"
              : "[stripe-webhook] plus conflict: a second website Plus subscription for a buyer who has one");
            await plusAddon.endExtraStripePlus(sub, deps);
            await plusAddon.flagSecondPlus(admin, userId, "stripe", deps);
          }
          await settle("ignored", store ? "plus conflict: the buyer already has Plus through a store; refund the website one"
            : "plus conflict: the buyer already has a website Plus subscription; refund the second one");
          return reply(200, { received: true, conflict: true });
        }
        if (otherWebSub && !liveNew) {
          await settle("ignored", "plus: an event for another Plus subscription that is not live; the row is a different subscription's");
          return reply(200, { received: true, ignored: true });
        }
      }
      if (eventAtIso) row.last_event_at = eventAtIso;
      if (!(await plusAddon.writePlusRow(admin, userId, cur || null, row))) continue;
      if (plusAddon.isLivePlusRow(row)) await plusAddon.flagHouseholdSecondPlus(admin, userId, "stripe", deps);
      else if (process.env.IAP_ENABLED === "true") {
        // The website Plus is not live any more: a store Plus the same buyer pays for takes its place now.
        try { await plusAddon.syncPlusFromStore(admin, userId, { ...deps, fetchSubscriber, acceptSandbox: acceptSandboxFor(null) || plusAddon.isPlusTester(userId) }); }
        catch (e) { console.error("[stripe-webhook] plus: the stores could not be asked after a website Plus ended:", e.message); }
      }
      await settle("processed");
      return reply(200, { received: true });
    }
    throw new Error("plus write: busy");
  } catch (e) {
    // 0044 not applied while Plus is off: nothing of ours could have sold this; acknowledged, not retried for days.
    if (e && e.pg && plusAddon.isMissing(e.pg) && !plusAddon.plusEnabled()) {
      await settle("ignored", "plus: migration 0044 not applied");
      return reply(200, { received: true, ignored: true });
    }
    console.error("[stripe-webhook] plus", evt.type, e.message);
    await settle("failed", String(e.message).slice(0, 500));
    return reply(500, { error: "processing_failed" });
  }
}

// A PLUS PAYMENT TAKEN BACK ENDS PLUS (review 2026-11-22). A charge refunded IN FULL, or lost to a chargeback, for a
// Plus customer (the add-on has a Stripe customer of its own, so its charges are never the main plan's): when it is
// the charge for the period the subscription is in now, the subscription is cancelled at Stripe, so it is not left
// live and charging, and the row ends now. A partial refund, or a refund of an earlier period, changes nothing: that
// is support's call. Returns true when Plus was ended. Throws when Stripe or the row could not be reached, so the
// event is sent again.
async function endPlusForChargeBack(admin, evt, object, deps = {}) {
  if (!plusAddon.plusOnForAnyone()) return false;
  const get = deps.stripeGet || stripeGet, del = deps.stripeDelete || stripeApi.stripeDelete;
  let charge = object;
  if (evt.type === "charge.dispute.closed") {
    if (object.status !== "lost") return false;
    const chargeId = typeof object.charge === "string" ? object.charge : object.charge?.id;
    if (!chargeId) return false;
    charge = typeof object.charge === "object" && object.charge ? object.charge : await get(`/charges/${encodeURIComponent(chargeId)}`);
  } else if (!(evt.type === "charge.refunded" && object.refunded === true)) return false;
  const customerId = typeof charge.customer === "string" ? charge.customer : charge.customer?.id;
  if (!customerId) return false;
  for (let attempt = 0; attempt < plusAddon.WRITE_TRIES; attempt++) {
    const { data: row, error } = await admin.from(plusAddon.TABLE).select(`user_id, ${plusAddon.ROW_COLS}`).eq("provider_customer_id", customerId).maybeSingle();
    if (error) { if (plusAddon.isMissing(error)) return false; throw new Error(`plus read: ${error.code || "error"}`); }
    if (!row || row.provider !== "stripe" || !row.provider_subscription_id) return false;
    const sub = await get(`/subscriptions/${encodeURIComponent(row.provider_subscription_id)}`);
    const item = (sub && sub.items && sub.items.data && sub.items.data[0]) || {};
    const periodStart = Number.isFinite(sub && sub.current_period_start) ? sub.current_period_start : item.current_period_start;
    // A day's slack: the first charge can be made a moment before the period Stripe records. An earlier period's is a month older.
    if (!Number.isFinite(periodStart) || !Number.isFinite(charge.created) || charge.created < periodStart - 86400) return false;
    if (sub.status !== "canceled") await del(`/subscriptions/${encodeURIComponent(sub.id)}`);
    if (!plusAddon.isLivePlusRow(row)) return true;
    const nowIso = new Date().toISOString();
    if (await plusAddon.writePlusRow(admin, row.user_id, row, { status: "canceled", current_period_end: nowIso, cancel_at_period_end: false })) return true;
  }
  throw new Error("plus write: busy");
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return reply(405, { error: "Method not allowed" });

  const secret = (process.env.STRIPE_WEBHOOK_SECRET || "").trim();
  if (!secret) {
    console.error("[stripe-webhook] STRIPE_WEBHOOK_SECRET is missing — refusing to process");
    return reply(500, { error: "server_misconfigured" });
  }

  // The RAW body, before any parse. Netlify base64-encodes when the request is binary.
  const raw = event.isBase64Encoded
    ? Buffer.from(event.body || "", "base64").toString("utf8")
    : (event.body || "");
  const sigHeader = event.headers?.["stripe-signature"] || event.headers?.["Stripe-Signature"];

  const verdict = verifyStripeSignature(raw, sigHeader, secret);
  if (!verdict.ok) {
    console.warn("[stripe-webhook] rejected:", verdict.reason);
    return reply(400, { error: "invalid_signature" });
  }

  let evt;
  try { evt = JSON.parse(raw); } catch { return reply(400, { error: "invalid_json" }); }
  if (!evt?.id || !evt?.type) return reply(400, { error: "invalid_event" });

  let admin;
  try { admin = getAdminClient(); }
  catch (e) { console.error("[stripe-webhook] admin client:", e.message); return reply(500, { error: "server_misconfigured" }); }

  const object = evt.data?.object || {};
  const claim = {
    event_id: evt.id,
    provider: "stripe",
    type: evt.type,
    status: "received",
    customer_id: typeof object.customer === "string" ? object.customer : object.customer?.id || null,
    subscription_id: typeof object.subscription === "string" ? object.subscription
      : (evt.type.startsWith("customer.subscription.") ? object.id : null),
    user_id: userIdFrom(object),
  };

  // The claim. `ignoreDuplicates` makes this insert-or-nothing; a replay selects zero rows.
  const { data: claimed, error: claimErr } = await admin
    .from("billing_events").insert(claim, { ignoreDuplicates: true }).select("event_id");

  if (claimErr) {
    console.error("[stripe-webhook] could not claim event:", claimErr.message);
    return reply(500, { error: "claim_failed" });          // 5xx so Stripe retries
  }
  if (!claimed || claimed.length === 0) {
    // Already seen. Unless the earlier attempt failed, in which case let it run again.
    const { data: prior } = await admin
      .from("billing_events").select("status, attempts").eq("event_id", evt.id).maybeSingle();
    if (!prior || prior.status !== "failed") {
      return reply(200, { received: true, replay: true });
    }
    await admin.from("billing_events")
      .update({ status: "received", attempts: (prior.attempts || 1) + 1, error: null })
      .eq("event_id", evt.id);
  }

  // THE PLUS ADD-ON (migration 0044, _lib/plusAddon.js). Its checkout and its subscription events are handled here and
  // never reach the main plan's handling below: a Plus subscription written into public.subscriptions would replace the
  // household's main plan, or be flagged as a second subscription. It is the add-on's when our checkout says so in its
  // metadata or the subscription carries a Plus price; Plus is granted only for a real Plus price.
  const PLUS_SUB_EVENTS = ["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"];
  if ((evt.type === "checkout.session.completed" && object?.metadata?.kind === "plus_addon")
      || (PLUS_SUB_EVENTS.includes(evt.type) && plusAddon.isPlusStripeObject(object))) {
    return await applyPlusEvent(admin, evt, object, reply, { stripeGet });
  }

  // A Plus payment taken back (endPlusForChargeBack). Beside everything below, never instead of it: the same event
  // still reaches the gift, the founding seat and the creator handling.
  let plusEnded = false;
  if (evt.type === "charge.refunded" || evt.type === "charge.dispute.closed") {
    try { plusEnded = await endPlusForChargeBack(admin, evt, object); }
    catch (e) {
      console.error("[stripe-webhook] plus", evt.type, e.message);
      await admin.from("billing_events").update({ status: "failed", error: String(e.message).slice(0, 500) }).eq("event_id", evt.id);
      return reply(500, { error: "processing_failed" });
    }
  }

  const creatorInvoice = evt.type === CREATOR_EVENT && creatorsEnabled();
  const creatorDispute = CREATOR_DISPUTE_EVENTS.includes(evt.type) && creatorsEnabled();
  // TRIAL_PLAN_FIRST: a Stripe trial starts as "trialing" with its end date on customer.subscription.created, which
  // nothing else reports until the trial ends. Heard only while the switch is on; off, ignored as before.
  const trialCreated = evt.type === "customer.subscription.created" && trialPlanFirstSince() !== null;
  // A website trial's reminder is Stripe's own (Amanda, 2026-11-10: the card networks require one before a trial
  // converts): customer.subscription.trial_will_end is not handled here, and we send none for it.
  if (!HANDLED.includes(evt.type) && !creatorInvoice && !creatorDispute && !trialCreated) {
    await admin.from("billing_events")
      .update(plusEnded ? { status: "processed", processed_at: new Date().toISOString(), error: "plus: ended, the payment was lost to a chargeback" }
        : { status: "ignored", processed_at: new Date().toISOString() }).eq("event_id", evt.id);
    return reply(200, { received: true, ...(plusEnded ? {} : { ignored: true }) });
  }

  // ORDERING. Stripe does not guarantee the order events arrive in, and it retries a failed
  // delivery for days. Without this check a stale customer.subscription.updated landing after a
  // cancellation flips a cancelled household back to active, and a stale cancellation landing
  // after a renewal takes away access somebody paid for. Every write stamps the row with the
  // EVENT's own created time — not the processing time, which is the order they happened to
  // arrive in — and an event older than the one already applied to that row changes nothing.
  //
  // Ordering only. An event carrying no `created` is applied rather than dropped: the signature
  // already proved it is real, and refusing it would silently lose a payment. Equal timestamps
  // apply too — same second, and the later writer wins, which is what it did before.
  const eventAtMs = Number.isFinite(evt.created) ? evt.created * 1000 : null;
  const eventAtIso = isoOrNull(evt.created);
  const staleAgainst = (row) => {
    if (!row || eventAtMs === null) return false;
    const applied = Date.parse(row.last_event_at || "");
    return Number.isFinite(applied) && eventAtMs < applied;
  };
  const acknowledgeStale = async () => {
    await admin.from("billing_events").update({
      status: "ignored",
      processed_at: new Date().toISOString(),
      error: "stale: a newer event has already been applied to this subscription",
    }).eq("event_id", evt.id);
    return reply(200, { received: true, stale: true });   // 200: retrying will not make it newer
  };
  const subscriptionRowFor = async (column, value) => {
    if (!value) return null;
    const { data } = await admin
      .from("subscriptions").select("user_id, last_event_at, provider, status, current_period_end").eq(column, value).maybeSingle();
    return data || null;
  };
  // ONE PAID STATE AT A TIME (version 1.1). A household whose row is a PAID store purchase keeps it: a Stripe
  // event for the same household is acknowledged and recorded, never written over it. Checkout refuses a
  // household that already pays (billing.js), so this only happens if a second payment got through anyway,
  // and the record is support's prompt to refund it.
  const storePaidRow = async (user_id) => {
    if (!user_id) return false;
    const { data } = await admin
      .from("subscriptions").select("provider, status, current_period_end").eq("user_id", user_id).maybeSingle();
    return !!data && isStoreRow(data) && isPaidSubscription(data);
  };
  const acknowledgeConflict = async () => {
    console.error("[stripe-webhook] conflict: a Stripe event for a household that already pays in a store");
    await admin.from("billing_events").update({
      status: "ignored",
      processed_at: new Date().toISOString(),
      error: "conflict: the household already pays through a store; refund the web subscription",
    }).eq("event_id", evt.id);
    return reply(200, { received: true, conflict: true });
  };

  // TWO STRIPE SUBSCRIPTIONS FOR ONE HOUSEHOLD (audit 2026-10-26, B3). The row holds one subscription. An event
  // for a DIFFERENT Stripe subscription, while the row's own is still live, is never written over it: both would
  // charge, and cancelling one would mark the row cancelled while the other kept billing. It is recorded on the
  // row (support_flag, as the store's double subscriptions are) and support is told once, to cancel and refund the
  // extra one. Checkout asks Stripe first (billing.js), so this is the backstop.
  const otherLiveStripe = async (user_id, subId) => {
    if (!user_id || !subId) return null;
    const { data, error } = await admin
      .from("subscriptions").select("provider, provider_subscription_id, status, current_period_end, support_flag")
      .eq("user_id", user_id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data || (data.provider || "stripe") !== "stripe" || !data.provider_subscription_id) return null;
    return data.provider_subscription_id !== subId && holdsHousehold(data, isPaidSubscription) ? data : null;
  };
  const acknowledgeDuplicate = async (user_id, row, incomingLive) => {
    const FLAG = "two_stripe_subscriptions";
    if (incomingLive && row.support_flag !== FLAG) {
      const { error } = await admin.from("subscriptions")
        .update({ support_flag: FLAG, support_flag_at: new Date().toISOString() }).eq("user_id", user_id);
      if (error) console.error("[stripe-webhook] support flag:", error.message);
      await alertSupport({ flag: FLAG, userId: user_id, provider: "stripe" });
    }
    console.error("[stripe-webhook] duplicate: an event for a second Stripe subscription while the household's is live");
    await admin.from("billing_events").update({
      status: "ignored",
      processed_at: new Date().toISOString(),
      error: incomingLive
        ? "duplicate: the household already holds a live Stripe subscription; cancel and refund the extra one"
        : "duplicate: an extra Stripe subscription ended; the household's own is unchanged",
    }).eq("event_id", evt.id);
    return reply(200, { received: true, duplicate: true });
  };

  // GIFTS (_lib/gifts.js). A gift's checkout and a gift's refund end here: no subscription row, no founding seat, no
  // creator commission and no funnel milestone. The event is already claimed above, and the code is made once per
  // Stripe session (gift_create), so a repeated delivery never makes a second code or a second Email 1.
  const giftDone = async (note) => {
    await admin.from("billing_events")
      .update({ status: "processed", processed_at: new Date().toISOString(), error: note || null }).eq("event_id", evt.id);
    return reply(200, { received: true, gift: true });
  };
  const giftFailed = async (e) => {
    console.error("[stripe-webhook] gift", evt.type, e.message);
    await admin.from("billing_events").update({ status: "failed", error: String(e.message).slice(0, 500) }).eq("event_id", evt.id);
    return reply(500, { error: "processing_failed" });    // 5xx so Stripe retries
  };
  if (evt.type === "checkout.session.completed" && gifts.isGiftSession(object)) {
    try {
      const r = await gifts.fulfilGift({ admin, session: object });
      if (!r.ok) throw new Error(`gift not fulfilled: ${r.reason}`);
      return await giftDone(r.unpaid ? "gift: not paid" : r.skipped ? `gift: buyer email ${r.skipped}` : null);
    } catch (e) { return await giftFailed(e); }
  }
  if (evt.type === "charge.refunded") {
    let r;
    try { r = await gifts.refundGift({ admin, charge: object }); }
    catch (e) { return await giftFailed(e); }
    if (r.gift) return await giftDone(r.voided ? "gift: voided" : r.redeemed ? "gift: refunded after redeem, code kept" : r.partial ? "gift: partial refund, code kept" : null);
  }

  // THE FULL FUNNEL. Best effort, before the handling below (whose early answers would skip it); first time only, so a
  // retried event adds nothing. The account is the one the event names, or, for a refund, the one our own row holds
  // for that Stripe customer.
  const milestone = stripeMilestone(evt);
  if (milestone) {
    try {
      let accountId = userIdFrom(object);
      const customerId = typeof object.customer === "string" ? object.customer : object.customer?.id;
      if (!accountId && customerId) {
        const { data: owner } = await admin.from("subscriptions").select("user_id").eq("provider_customer_id", customerId).maybeSingle();
        accountId = owner?.user_id || null;
      }
      if (accountId) await recordMilestone(admin, accountId, milestone.milestone, "web", milestone.at);
    } catch { console.error("[funnel] not recorded", milestone.milestone); }
  }

  let creatorNotes = [];
  try {
    if (evt.type === "checkout.session.completed") {
      const user_id = userIdFrom(object);
      if (!user_id) throw new Error("checkout session carried no user_id");
      const amounts = checkoutAmounts(object);
      const sessionSubId = typeof object.subscription === "string" ? object.subscription : object.subscription?.id;
      if (staleAgainst(await subscriptionRowFor("user_id", user_id))) {
        // Stale for the plan: a subscription event already wrote the row (they often arrive first). The amounts
        // come from nowhere else, so they are filled in, once, onto the same subscription, and change nothing else.
        if (Object.keys(amounts).length && sessionSubId) {
          const { data: cur, error: curErr } = await admin
            .from("subscriptions").select("provider_subscription_id, amount_total_cents").eq("user_id", user_id).maybeSingle();
          if (curErr) throw new Error(curErr.message);
          if (cur && cur.provider_subscription_id === sessionSubId && cur.amount_total_cents == null) {
            const { error } = await admin.from("subscriptions").update(amounts).eq("user_id", user_id);
            if (error) throw new Error(error.message);
          }
        }
        // The seat is the payment's, not the row's: taken however the row was written.
        if (foundingCheckoutPaid(object)) await takeSeat(admin, user_id, "stripe", sessionSubId || null);
        return await acknowledgeStale();
      }
      if (await storePaidRow(user_id)) return await acknowledgeConflict();
      { const other = await otherLiveStripe(user_id, sessionSubId); if (other) return await acknowledgeDuplicate(user_id, other, true); }
      const patch = {
        user_id,
        provider: "stripe",
        provider_customer_id: typeof object.customer === "string" ? object.customer : object.customer?.id,
        provider_subscription_id: sessionSubId,
        plan_key: object.metadata?.plan_key || null,
        status: "active",
        ...amounts,
        updated_at: new Date().toISOString(),
      };
      // TRIAL_PLAN_FIRST (review round, M3): a checkout that charged nothing may be a 14-day trial. Stripe is asked for
      // the subscription, so the row says trialing with the trial's end from the start (the chip, the status). If Stripe
      // cannot be asked, the row is "active" as before and the next subscription event corrects it.
      if (trialPlanFirstSince() !== null && object.payment_status === "no_payment_required" && sessionSubId) {
        try {
          const live = await stripeApi.stripeGet(`/subscriptions/${encodeURIComponent(sessionSubId)}`);
          if (live && live.status === "trialing" && Number.isFinite(Number(live.trial_end))) {
            patch.status = "trialing";
            patch.current_period_end = new Date(Number(live.trial_end) * 1000).toISOString();
          }
        } catch { console.error("[stripe-webhook] trial read:", "no_status"); }
      }
      // DECISIONS.md item 1: the founding price is locked WHILE CONTINUOUSLY SUBSCRIBED. The
      // clock starts here and is cleared on deletion, so "continuously" stays checkable.
      if (patch.plan_key === "founding_annual") patch.founding_locked_at = new Date().toISOString();
      if (eventAtIso) patch.last_event_at = eventAtIso;
      const { error } = await admin.from("subscriptions").upsert(patch, { onConflict: "user_id" });
      if (error) throw new Error(error.message);
      // Past 50 (two checkouts completing at the last seat) the seat is still recorded, and logged: they paid.
      if (foundingCheckoutPaid(object)) await takeSeat(admin, user_id, "stripe", sessionSubId || null);
      // COUPLE MODE (audit H5): the other member already paid too (a race the hold did not stop, or a store
      // purchase): one of the two is the extra; if it is this Stripe one, it is set to end and is never charged again.
      await reconcileHouseholdBilling(admin, user_id);
    }

    // A REFUND GIVES THE FOUNDING SEAT BACK (2026-10-29). A charge refunded in full, for a customer whose account
    // holds a seat taken on the website: the seat is released (a store purchase's seat is never touched by a
    // Stripe refund). A partial refund changes nothing. The account comes from our own row for the customer,
    // never from the charge.
    if (evt.type === "charge.refunded") {
      const customerId = typeof object.customer === "string" ? object.customer : object.customer?.id;
      if (object.refunded === true && customerId) {
        const { data: owner, error: ownerErr } = await admin
          .from("subscriptions").select("user_id").eq("provider_customer_id", customerId).maybeSingle();
        if (ownerErr) throw new Error(ownerErr.message);
        if (owner?.user_id) await releaseSeat(admin, owner.user_id, { reason: "refund", provider: "stripe" });
      }
      // THE CREATOR PROGRAM: a clawback of the commission on that one payment, partial refunds included.
      if (creatorsEnabled()) creatorNotes = await clawbackStripeCharge(admin, object);
    }

    // THE CREATOR PROGRAM: a payment, the first or a renewal. Changes nothing about the household's plan.
    if (creatorInvoice) creatorNotes = await creditStripeInvoice(admin, object, evt.created);
    // THE CREATOR PROGRAM: a chargeback over, or its money back. Changes nothing about the household's plan.
    if (creatorDispute) creatorNotes = await settleStripeDispute(admin, evt.type, object);

    if (evt.type === "customer.subscription.updated" || evt.type === "customer.subscription.deleted" || trialCreated) {
      const user_id = userIdFrom(object);
      const trialOnly = foundingSubscriptionEnded(evt.type, object) && endedInTrialUnpaid(object);
      const foundingEnded = foundingSubscriptionEnded(evt.type, object) && !trialOnly;
      const patch = subscriptionPatch(object,
        evt.type === "customer.subscription.deleted"
          ? { status: "canceled", founding_locked_at: null }     // the lock ends with the subscription
          : (foundingEnded ? { founding_locked_at: null } : {}));
      let q = admin.from("subscriptions");
      // Prefer the subscription id; fall back to metadata's user_id for a row written at checkout
      // before the first subscription event arrived.
      const existing = await subscriptionRowFor("provider_subscription_id", object.id);
      // Staleness is judged against whichever row this event would write — including the row the
      // checkout wrote, which the subscription id does not find until the first update lands.
      if (staleAgainst(existing || await subscriptionRowFor("user_id", user_id))) return await acknowledgeStale();
      // A row is never written over while it holds a paid store purchase, however it was found: by account (a
      // store purchase made since), or by this Stripe subscription's id (a store row that replaced it, should the
      // id still be on it).
      if (existing && isStoreRow(existing) && isPaidSubscription(existing)) return await acknowledgeConflict();
      if (!existing && await storePaidRow(user_id)) return await acknowledgeConflict();
      if (!existing) {
        const other = await otherLiveStripe(user_id, object.id);
        if (other) return await acknowledgeDuplicate(user_id, other, evt.type !== "customer.subscription.deleted" && isLiveStripeStatus(object.status));
      }
      if (eventAtIso) patch.last_event_at = eventAtIso;
      const accountId = existing?.user_id || user_id;
      if (foundingEnded && accountId) {
        // Stamped once: the first end is the one that counts, and nothing ever clears it.
        const { data: cur, error: curErr } = await admin
          .from("subscriptions").select("founding_ended_at").eq("user_id", accountId).maybeSingle();
        if (curErr) throw new Error(curErr.message);
        if (!cur?.founding_ended_at) patch.founding_ended_at = eventAtIso || new Date().toISOString();
      }
      const subscriptionOver = evt.type === "customer.subscription.deleted" || object.status === "canceled";
      const accountGone = async () => {
        // Only Supabase saying the user does not exist counts. A lookup that fails for any other reason
        // is thrown, so Stripe retries rather than the event being dropped.
        const { data: who, error: whoErr } = await admin.auth.admin.getUserById(user_id);
        if (whoErr) {
          if (whoErr.status === 404 || /not found/i.test(String(whoErr.message || ""))) return true;
          throw new Error(`account lookup: ${whoErr.message}`);
        }
        return !(who && who.user);
      };
      if (!existing?.user_id && user_id && subscriptionOver && !(await subscriptionRowFor("user_id", user_id)) && (await accountGone())) {
        // THE ACCOUNT WAS DELETED (KNOWN-DEFECTS 23). delete_account cancels the subscription first, then erases
        // this row and the sign-in, so Stripe's cancellation arrives with nothing left to update, and writing a
        // row for an account that no longer exists would fail and be retried for days. It is acknowledged
        // instead. delete_account has already stamped the founding number if there was one.
        await admin.from("billing_events").update({
          status: "ignored", processed_at: new Date().toISOString(), error: "no account: the subscription ended with the account",
        }).eq("event_id", evt.id);
        return reply(200, { received: true, ignored: true });
      }
      if (existing?.user_id) {
        const { error } = await q.update(patch).eq("user_id", existing.user_id);
        if (error) throw new Error(error.message);
      } else if (user_id) {
        const { error } = await q.upsert({ user_id, ...patch }, { onConflict: "user_id" });
        if (error) throw new Error(error.message);
      } else {
        throw new Error(`no account for subscription ${object.id}`);
      }
      // COUPLE MODE (audit H5): a subscription that became paid in a household the other member pays for.
      if (!subscriptionOver && isLiveStripeStatus(object.status)) await reconcileHouseholdBilling(admin, existing?.user_id || user_id);
      // A founding trial cancelled before its first charge: the seat it held goes back, and the price is not ended.
      if (trialOnly && accountId) {
        const { error: lockErr } = await admin.from("subscriptions").update({ founding_locked_at: null }).eq("user_id", accountId);
        if (lockErr) throw new Error(lockErr.message);
        await releaseTrialSeat(admin, accountId, "stripe");
      }
      if (foundingEnded) {
        // And on the waitlist number, which outlives the account (deleting an account deletes its waitlist
        // row, not the number's ledger entry). A failure here is a 5xx, so Stripe retries the event.
        const { data: u, error: uErr } = await admin.auth.admin.getUserById(accountId);
        if (uErr) throw new Error(`founding end: ${uErr.message}`);
        const email = u?.user?.email;
        if (email) {
          const { error: endErr } = await admin.rpc("waitlist_founding_mark_ended", { p_email: email });
          if (endErr) throw new Error(`founding end: ${endErr.message}`);
        }
      }
    }

    await admin.from("billing_events")
      .update({ status: "processed", processed_at: new Date().toISOString(), ...(creatorNotes.length ? { error: creatorNotes.join(" | ").slice(0, 500) } : {}) }).eq("event_id", evt.id);
    return reply(200, { received: true });
  } catch (e) {
    console.error("[stripe-webhook]", evt.type, e.message);
    await admin.from("billing_events")
      .update({ status: "failed", error: String(e.message).slice(0, 500) }).eq("event_id", evt.id);
    return reply(500, { error: "processing_failed" });    // 5xx so Stripe retries
  }
};
