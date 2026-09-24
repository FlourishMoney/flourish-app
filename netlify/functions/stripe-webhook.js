// netlify/functions/stripe-webhook.js
// -----------------------------------------------------------------------------
// STRIPE TELLS US WHAT WAS PAID. This is the only writer of public.subscriptions.
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

const HANDLED = Object.freeze([
  "checkout.session.completed",
  "customer.subscription.updated",
  "customer.subscription.deleted",
]);

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
    current_period_end: isoOrNull(sub.current_period_end),
    cancel_at_period_end: !!sub.cancel_at_period_end,
    automatic_tax: !!sub.automatic_tax?.enabled,
    updated_at: new Date().toISOString(),
    ...extra,
  };
}

function userIdFrom(object) {
  return object?.metadata?.user_id || object?.client_reference_id || null;
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

  if (!HANDLED.includes(evt.type)) {
    await admin.from("billing_events")
      .update({ status: "ignored", processed_at: new Date().toISOString() }).eq("event_id", evt.id);
    return reply(200, { received: true, ignored: true });
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
      .from("subscriptions").select("user_id, last_event_at").eq(column, value).maybeSingle();
    return data || null;
  };

  try {
    if (evt.type === "checkout.session.completed") {
      const user_id = userIdFrom(object);
      if (!user_id) throw new Error("checkout session carried no user_id");
      if (staleAgainst(await subscriptionRowFor("user_id", user_id))) return await acknowledgeStale();
      const patch = {
        user_id,
        provider: "stripe",
        provider_customer_id: typeof object.customer === "string" ? object.customer : object.customer?.id,
        provider_subscription_id: typeof object.subscription === "string" ? object.subscription : object.subscription?.id,
        plan_key: object.metadata?.plan_key || null,
        status: "active",
        updated_at: new Date().toISOString(),
      };
      // DECISIONS.md item 1: the founding price is locked WHILE CONTINUOUSLY SUBSCRIBED. The
      // clock starts here and is cleared on deletion, so "continuously" stays checkable.
      if (patch.plan_key === "founding_annual") patch.founding_locked_at = new Date().toISOString();
      if (eventAtIso) patch.last_event_at = eventAtIso;
      const { error } = await admin.from("subscriptions").upsert(patch, { onConflict: "user_id" });
      if (error) throw new Error(error.message);
    }

    if (evt.type === "customer.subscription.updated" || evt.type === "customer.subscription.deleted") {
      const user_id = userIdFrom(object);
      const patch = subscriptionPatch(object,
        evt.type === "customer.subscription.deleted"
          ? { status: "canceled", founding_locked_at: null }     // the lock ends with the subscription
          : {});
      let q = admin.from("subscriptions");
      // Prefer the subscription id; fall back to metadata's user_id for a row written at checkout
      // before the first subscription event arrived.
      const existing = await subscriptionRowFor("provider_subscription_id", object.id);
      // Staleness is judged against whichever row this event would write — including the row the
      // checkout wrote, which the subscription id does not find until the first update lands.
      if (staleAgainst(existing || await subscriptionRowFor("user_id", user_id))) return await acknowledgeStale();
      if (eventAtIso) patch.last_event_at = eventAtIso;
      if (existing?.user_id) {
        const { error } = await q.update(patch).eq("user_id", existing.user_id);
        if (error) throw new Error(error.message);
      } else if (user_id) {
        const { error } = await q.upsert({ user_id, ...patch }, { onConflict: "user_id" });
        if (error) throw new Error(error.message);
      } else {
        throw new Error(`no account for subscription ${object.id}`);
      }
    }

    await admin.from("billing_events")
      .update({ status: "processed", processed_at: new Date().toISOString() }).eq("event_id", evt.id);
    return reply(200, { received: true });
  } catch (e) {
    console.error("[stripe-webhook]", evt.type, e.message);
    await admin.from("billing_events")
      .update({ status: "failed", error: String(e.message).slice(0, 500) }).eq("event_id", evt.id);
    return reply(500, { error: "processing_failed" });    // 5xx so Stripe retries
  }
};
