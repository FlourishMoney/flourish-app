// netlify/functions/_lib/storeSubscriptions.js
// -----------------------------------------------------------------------------
// A STORE PURCHASE BECOMES THE HOUSEHOLD'S ONE SUBSCRIPTION ROW (version 1.1, in-app purchase).
//
// ONE PLACE DECIDES WHAT A HOUSEHOLD MAY DO: the server's period-aware plan answer (_lib/planRules.js),
// read from public.subscriptions, one row per household. A web purchase reaches that row from Stripe
// (stripe-webhook.js). A store purchase reaches it from RevenueCat, here, in the same shape:
//   provider              'app_store' | 'play_store'
//   status                'trialing' while the store's free month runs, 'active' while paid, 'canceled' once over
//   plan_key              'monthly' | 'annual' | 'founding_annual' (from the product, below)
//   current_period_end    when access ends unless the store renews it (the store's expiry, grace included)
//   cancel_at_period_end  the household turned renewal off in the store
// so isPaidSubscription, the billing status call and every plan check read a store purchase exactly as they
// read a web one. The app never decides; it asks.
//
// WHAT IS TRUSTED. Never the app's word, and never a webhook body's details: every write starts from the
// subscriber record fetched from RevenueCat's REST API with the server's secret key (fetchSubscriber), which
// RevenueCat has validated with Apple or Google. A webhook only says "look again".
//
// ONE PAID STATE AT A TIME (mayReplace). A writer never replaces a row that another provider has PAID for:
// a store purchase does not overwrite a paid web subscription, and a web event does not overwrite a paid store
// one. The billing status call tells the app the household already pays, so it never offers a second purchase;
// checkout refuses one (billing.js); and if a second payment happens anyway, the row keeps the first, and the
// conflict is logged and recorded for support to refund.
//
// NOT COUNTED, deliberately (fail closed):
//   a sandbox purchase, unless IAP_ACCEPT_SANDBOX is "true" or the account is the App Review account (whose
//     purchases are sandbox purchases); otherwise a TestFlight build would unlock everything for free;
//   a Family Sharing purchase (ownership FAMILY_SHARED): Family Sharing is off on every product, and this line
//     is what decides if anyone ever turns it on (docs/ops/IAP-1.1.md, item 5);
//   anything RevenueCat holds that is not an App Store or Google Play purchase (a promotional grant, say).
// Nothing here logs a key, a token, an email address or a receipt.
// -----------------------------------------------------------------------------
"use strict";
const crypto = require("crypto");
const { isPaidSubscription, STORE_PROVIDERS } = require("./planRules");

const ENTITLEMENT_ID = "plus";

// The product identifiers the stores and RevenueCat use, and the plan each one is. Apple: one subscription
// group, three products. Google: two subscriptions with base plans; RevenueCat names a Google product
// "<subscription>:<base plan>". docs/ops/IAP-1.1.md lists them for App Store Connect and Play Console, and
// tests/storeBilling.test.cjs holds this table and the app's (src/lib/storeBilling.js) together.
const PRODUCT_PLANS = Object.freeze({
  "app.flourishmoney.plus.monthly":   "monthly",
  "app.flourishmoney.plus.annual":    "annual",
  "app.flourishmoney.founding.annual": "founding_annual",
  "flourish_plus:monthly":            "monthly",
  "flourish_plus:annual":             "annual",
  "flourish_founding:annual":         "founding_annual",
});

const RC_API = "https://api.revenuecat.com/v1";
const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REVIEW_ACCOUNT_SHA256 = "af552e5b3f4529120915257ae8073ff990043c65e6163630d694fe2b6516dc7b";

const isUuid = (v) => typeof v === "string" && UUID_RX.test(v);
const ms = (v) => { const t = v ? Date.parse(v) : NaN; return Number.isFinite(t) ? t : null; };

function planKeyFor(productId, basePlan) {
  if (typeof productId !== "string" || !productId) return null;
  if (PRODUCT_PLANS[productId]) return PRODUCT_PLANS[productId];
  if (basePlan && !productId.includes(":")) return PRODUCT_PLANS[`${productId}:${basePlan}`] || null;
  return null;
}

// The App Review account, by the SHA-256 of its normalised address only (as in activation.js).
function isReviewAccountEmail(email) {
  const e = typeof email === "string" ? email.replace(/\s+/g, "").toLowerCase() : "";
  return !!e && crypto.createHash("sha256").update(e).digest("hex") === REVIEW_ACCOUNT_SHA256;
}

function acceptSandboxFor(user, env = process.env) {
  return env.IAP_ACCEPT_SANDBOX === "true" || isReviewAccountEmail(user && user.email);
}

/**
 * RevenueCat's subscriber record -> { row } for the subscriptions table, or { row: null, reason }.
 * The "plus" entitlement decides which purchase this is; its subscription record adds the details.
 */
function storeRowFromSubscriber(subscriber, now = Date.now(), { acceptSandbox = false } = {}) {
  const ent = subscriber && subscriber.entitlements && subscriber.entitlements[ENTITLEMENT_ID];
  if (!ent || !ent.product_identifier) return { row: null, reason: "no_entitlement" };
  const subs = (subscriber && subscriber.subscriptions) || {};
  const id = ent.product_identifier;
  const sub = subs[id] || (id.includes(":") ? subs[id.split(":")[0]] : null);
  if (!sub) return { row: null, reason: "no_subscription_record" };
  if (!STORE_PROVIDERS.includes(sub.store)) return { row: null, reason: "not_a_store_purchase" };
  if (sub.is_sandbox && !acceptSandbox) return { row: null, reason: "sandbox" };
  if (sub.ownership_type === "FAMILY_SHARED") return { row: null, reason: "family_shared" };
  const planKey = planKeyFor(id, sub.product_plan_identifier);
  if (!planKey) return { row: null, reason: "unknown_product" };

  const expires = Math.max(ms(ent.expires_date) || 0, ms(ent.grace_period_expires_date) || 0, ms(sub.expires_date) || 0, ms(sub.grace_period_expires_date) || 0) || null;
  const refunded = ms(sub.refunded_at);
  const t = now instanceof Date ? now.getTime() : now;
  let status;
  if (refunded !== null) status = "canceled";
  else if (expires !== null && t >= expires) status = "canceled";
  else status = sub.period_type === "trial" ? "trialing" : "active";   // a billing retry inside the grace period stays active
  return {
    row: {
      provider: sub.store,
      status,
      plan_key: planKey,
      current_period_end: new Date(refunded !== null ? refunded : (expires !== null ? expires : t)).toISOString(),
      cancel_at_period_end: !!sub.unsubscribe_detected_at,
      updated_at: new Date(t).toISOString(),
    },
    reason: null,
  };
}

/**
 * May `incoming` (a row patch from one provider) replace `existing`? Not when existing is a PAID row from a
 * different provider: one paid state per household. A store row may always replace a store row (the household
 * moved between Apple and Google once the first ran out, or RevenueCat moved the purchase). An unpaid row of
 * any provider may always be replaced.
 */
function mayReplace(existing, incoming, now = Date.now()) {
  if (!existing || !existing.provider) return true;
  if (!isPaidSubscription(existing, now)) return true;
  const fromStore = (p) => STORE_PROVIDERS.includes(p);
  if (existing.provider === incoming.provider) return true;
  if (fromStore(existing.provider) && fromStore(incoming.provider)) return true;
  return false;
}

async function fetchSubscriber(appUserId, { key = (process.env.REVENUECAT_SECRET_KEY || "").trim(), fetchImpl = globalThis.fetch } = {}) {
  if (!key) throw new Error("revenuecat_not_configured");
  if (!isUuid(appUserId)) throw new Error("not_an_account_id");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7500);
  try {
    const res = await fetchImpl(`${RC_API}/subscribers/${encodeURIComponent(appUserId)}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`revenuecat_${res.status}`);
    const data = await res.json();
    return (data && data.subscriber) || null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Bring this household's row up to date from RevenueCat. Returns what the app needs to know:
 *   { paid, provider, plan_key, conflict }  (conflict: a second paid state was refused; the row kept the first)
 * deps: fetchSubscriber, user (Supabase Auth's record, for the sandbox rule and the founding end), now, env.
 */
async function syncStoreSubscription(admin, userId, deps = {}) {
  const now = deps.now != null ? deps.now : Date.now();
  const nowIso = new Date(now).toISOString();
  const fetchSub = deps.fetchSubscriber || fetchSubscriber;
  const user = deps.user || null;
  const subscriber = await fetchSub(userId);
  const { row, reason } = storeRowFromSubscriber(subscriber, now, { acceptSandbox: acceptSandboxFor(user, deps.env || process.env) });

  const { data: existing, error: readErr } = await admin
    .from("subscriptions")
    .select("provider, status, current_period_end, plan_key, founding_ended_at, cancel_at_period_end")
    .eq("user_id", userId).maybeSingle();
  if (readErr) throw new Error(`subscriptions read: ${readErr.message}`);

  let next = null;
  if (row) {
    next = { ...row, last_event_at: nowIso };
  } else if (existing && STORE_PROVIDERS.includes(existing.provider) && isPaidSubscription(existing, now)) {
    // The store no longer reports it (refunded, or RevenueCat moved it to another account): it ends now.
    next = { provider: existing.provider, status: "canceled", current_period_end: nowIso, updated_at: nowIso, last_event_at: nowIso };
  }
  if (!next) {
    return { paid: isPaidSubscription(existing, now), provider: existing ? existing.provider : null, plan_key: existing ? existing.plan_key : null, conflict: false, reason };
  }
  if (!mayReplace(existing, next, now)) {
    console.error("[store-sync] conflict: a store purchase for a household that already pays on", existing.provider);
    return { paid: true, provider: existing.provider, plan_key: existing.plan_key, conflict: true, reason: "already_paid_elsewhere" };
  }

  // A FOUNDING SUBSCRIPTION THAT HAS ENDED (rule of 2026-10-07), as stripe-webhook.js applies it: stamped once
  // on the account and on the waitlist number, never cleared, so the founding price never comes back.
  const wasFounding = existing && existing.plan_key === "founding_annual" && STORE_PROVIDERS.includes(existing.provider) && isPaidSubscription(existing, now);
  const foundingEnded = wasFounding && !isPaidSubscription(next, now) && !existing.founding_ended_at;
  if (foundingEnded) next.founding_ended_at = nowIso;

  const { error: writeErr } = await admin.from("subscriptions").upsert({ user_id: userId, ...next }, { onConflict: "user_id" });
  if (writeErr) throw new Error(`subscriptions write: ${writeErr.message}`);
  if (foundingEnded && user && user.email) {
    const { error: endErr } = await admin.rpc("waitlist_founding_mark_ended", { p_email: user.email });
    if (endErr) throw new Error(`founding end: ${endErr.message}`);
  }
  return { paid: isPaidSubscription(next, now), provider: next.provider, plan_key: next.plan_key || (existing && existing.plan_key) || null, conflict: false, reason };
}

module.exports = {
  ENTITLEMENT_ID, STORE_PROVIDERS, PRODUCT_PLANS, RC_API, REVIEW_ACCOUNT_SHA256,
  isUuid, planKeyFor, isReviewAccountEmail, acceptSandboxFor, storeRowFromSubscriber, mayReplace,
  fetchSubscriber, syncStoreSubscription,
};
