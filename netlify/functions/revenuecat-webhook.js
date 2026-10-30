// netlify/functions/revenuecat-webhook.js
// -----------------------------------------------------------------------------
// REVENUECAT SAYS A STORE PURCHASE CHANGED. Version 1.1, in-app purchase.
//
// The App Store and Google Play report a subscription's life (bought, renewed, cancelled, refunded, expired,
// moved to another account) to RevenueCat, and RevenueCat calls this URL. Nothing in the delivery is trusted
// beyond "this account's store purchase changed": for each account it names, the server fetches the account's
// subscriber record from RevenueCat's REST API with the secret key and writes the household's one subscription
// row from that (_lib/storeSubscriptions.js syncStoreSubscription), exactly as the app's own "check again" does.
//
// OFF UNTIL IT IS SWITCHED ON: 404 unless IAP_ENABLED is exactly "true" (read per request).
// FAIL CLOSED, in that order:
//   no REVENUECAT_WEBHOOK_AUTH configured   -> 500, nothing read, nothing written
//   Authorization header missing or wrong   -> 401, body never parsed
//   unparseable body or no event id         -> 400
//   the sync throws                          -> 500 so RevenueCat retries, the event marked 'failed'
// IDEMPOTENCY: the same billing_events lock as stripe-webhook.js, keyed "rc:<event id>".
// Nothing here logs the Authorization header, a key, an email address or a receipt.
// -----------------------------------------------------------------------------
"use strict";
const crypto = require("crypto");
const { getAdminClient } = require("./_lib/auth");
const { syncStoreSubscription, isUuid } = require("./_lib/storeSubscriptions");
const { mayBuyFoundingPrice } = require("./_lib/foundingCohort");
const { reconcileHouseholdBilling } = require("./_lib/household");

// COUPLE MODE (audit round 4 a3): a report ends no purchase hold. RevenueCat never carries our attempt id, so it
// cannot say WHICH hold it is about; every hold ends at its fixed time (_lib/household.js). A purchase it reports as
// paid is covered at once anyway: every later check reads the paid row before it looks at a hold.

const reply = (statusCode, body) => ({ statusCode, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const iapEnabled = () => process.env.IAP_ENABLED === "true";

function authorized(header, expected) {
  const a = Buffer.from(String(header || "")), b = Buffer.from(String(expected || ""));
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
}

// Every account a delivery names: the buyer, and both sides of a TRANSFER (RevenueCat moved a store purchase
// from one account to another, e.g. on Restore). Anonymous RevenueCat ids are not accounts and are skipped.
function accountsIn(evt) {
  const ids = [evt.app_user_id, evt.original_app_user_id, ...(Array.isArray(evt.transferred_from) ? evt.transferred_from : []),
    ...(Array.isArray(evt.transferred_to) ? evt.transferred_to : [])];
  return [...new Set(ids.filter(isUuid))];
}

async function handle(event, deps = {}) {
  if (!iapEnabled()) return reply(404, { error: "not_found" });
  if (event.httpMethod !== "POST") return reply(405, { error: "Method not allowed" });

  const expected = (process.env.REVENUECAT_WEBHOOK_AUTH || "").trim();
  if (!expected) {
    console.error("[revenuecat-webhook] REVENUECAT_WEBHOOK_AUTH is missing: refusing to process");
    return reply(500, { error: "server_misconfigured" });
  }
  const header = event.headers?.authorization || event.headers?.Authorization;
  if (!authorized(header, expected)) {
    console.warn("[revenuecat-webhook] rejected: authorization");
    return reply(401, { error: "unauthorized" });
  }

  const raw = event.isBase64Encoded ? Buffer.from(event.body || "", "base64").toString("utf8") : (event.body || "");
  let body;
  try { body = JSON.parse(raw); } catch { return reply(400, { error: "invalid_json" }); }
  const evt = body && body.event;
  if (!evt || !evt.id || !evt.type) return reply(400, { error: "invalid_event" });

  let admin;
  try { admin = deps.admin || getAdminClient(); }
  catch (e) { console.error("[revenuecat-webhook] admin client:", e.message); return reply(500, { error: "server_misconfigured" }); }

  const eventId = `rc:${evt.id}`;
  const accounts = accountsIn(evt);
  // The account id is recorded as text (customer_id), not as user_id: user_id references auth.users, and an event
  // for an account that has since been deleted must be acknowledged, not fail the insert and be retried for days.
  const { data: claimed, error: claimErr } = await admin.from("billing_events").insert({
    event_id: eventId, provider: "revenuecat", type: String(evt.type).slice(0, 80), status: "received",
    customer_id: isUuid(evt.app_user_id) ? evt.app_user_id : null,
  }, { ignoreDuplicates: true }).select("event_id");
  if (claimErr) { console.error("[revenuecat-webhook] could not claim event:", claimErr.message); return reply(500, { error: "claim_failed" }); }
  if (!claimed || claimed.length === 0) {
    const { data: prior } = await admin.from("billing_events").select("status, attempts").eq("event_id", eventId).maybeSingle();
    if (!prior || prior.status !== "failed") return reply(200, { received: true, replay: true });
    await admin.from("billing_events").update({ status: "received", attempts: (prior.attempts || 1) + 1, error: null }).eq("event_id", eventId);
  }

  if (accounts.length === 0) {
    await admin.from("billing_events").update({ status: "ignored", processed_at: new Date().toISOString(), error: "no account id" }).eq("event_id", eventId);
    return reply(200, { received: true, ignored: true });
  }

  try {
    const notes = [];
    let conflict = false;
    for (const userId of accounts) {
      let user = null;
      try { const { data } = await admin.auth.admin.getUserById(userId); user = data && data.user ? data.user : null; } catch { user = null; }
      if (!user) continue;                      // an account that no longer exists has nothing to update
      const r = await syncStoreSubscription(admin, userId, { user, fetchSubscriber: deps.fetchSubscriber, now: deps.now, mayBuyFounding: deps.mayBuyFounding || mayBuyFoundingPrice });
      if (r.conflict) {
        conflict = true;
        notes.push(r.conflictKind === "web_needs_attention"
          ? "conflict: a store purchase while the web subscription is still live (past_due); the household pays twice once the card works: cancel one"
          : "conflict: the household already pays on the web and bought in the store too; cancel the web subscription or have the household ask the store for a refund (Apple refunds only on the customer's request; Google Play from Play Console)");
      }
      // COUPLE MODE (audit H5): a store purchase in a household the other member already pays for: one is the extra.
      if (r.paid) await reconcileHouseholdBilling(admin, userId);
      if (r.flag === "two_store_subscriptions") notes.push("flag: two live store subscriptions for one household; refund one");
      if (r.flag === "founding_not_eligible") notes.push("flag: the founding price was bought by a household it was not offered to");
    }
    await admin.from("billing_events").update({
      status: conflict ? "ignored" : "processed",
      processed_at: new Date().toISOString(),
      error: notes.length ? notes.join(" | ").slice(0, 500) : null,
    }).eq("event_id", eventId);
    return reply(200, { received: true, conflict });
  } catch (e) {
    console.error("[revenuecat-webhook]", evt.type, e.message);
    await admin.from("billing_events").update({ status: "failed", error: String(e.message).slice(0, 500) }).eq("event_id", eventId);
    return reply(500, { error: "processing_failed" });
  }
}

// Netlify's second argument is its own context, never test seams: the live handler passes none.
exports.handler = (event) => handle(event, {});
exports._test = { handle, accountsIn, authorized };
