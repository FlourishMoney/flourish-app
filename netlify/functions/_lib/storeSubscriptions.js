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
// ONE PAID STATE AT A TIME (mayReplace). A writer never replaces a row that another provider still holds: a
// store purchase does not overwrite a web subscription that is paid or still LIVE (a renewal that failed and
// Stripe is retrying, past_due, will charge again when the card works), and a web event does not overwrite a paid
// store one. The billing status call tells the app the household already pays (or that its web subscription
// needs attention), so it never offers a second purchase; checkout refuses one (billing.js); and if a second
// payment happens anyway, the row keeps the first, and the conflict is logged and recorded for support.
// One household, one store subscription too: on Android all three prices are base plans of ONE subscription
// (flourish_plus), so Google never holds two at once; on the App Store all three are one subscription group.
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
const { alertSupport } = require("./supportAlert");
const crypto = require("crypto");
const { isPaidSubscription, STORE_PROVIDERS } = require("./planRules");

const ENTITLEMENT_ID = "plus";

// The product identifiers the stores and RevenueCat use, and the plan each one is. Apple: one subscription
// group, three products. Google: one subscription (flourish_plus) with three base plans, so a household can
// never hold two; RevenueCat names a Google product "<subscription>:<base plan>". docs/ops/IAP-1.1.md lists
// them for App Store Connect and Play Console, and tests/storeBilling.test.cjs holds this table and the app's
// (src/lib/storeBilling.js) together.
const PRODUCT_PLANS = Object.freeze({
  "app.flourishmoney.plus.monthly":   "monthly",
  "app.flourishmoney.plus.annual":    "annual",
  "app.flourishmoney.founding.annual": "founding_annual",
  "flourish_plus:monthly":            "monthly",
  "flourish_plus:annual":             "annual",
  "flourish_plus:founding":           "founding_annual",
});

// A WEB SUBSCRIPTION THAT IS STILL LIVE: paid now, or not paid now but not over either (Stripe is retrying a
// failed renewal, or the first payment is still pending). Such a row can still charge, so a store purchase must
// not be sold on top of it.
const STRIPE_LIVE_UNPAID = Object.freeze(["past_due", "unpaid", "incomplete", "paused"]);
function isLiveRow(row, now = Date.now()) {
  if (!row) return false;
  if (isPaidSubscription(row, now)) return true;
  return (row.provider || "stripe") === "stripe" && STRIPE_LIVE_UNPAID.includes(row.status);
}

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
 * RevenueCat's subscriber record -> { row, reason, activeCount } for the subscriptions table.
 * Built from the store subscriptions themselves (App Store or Google Play purchases of our products), never from
 * whatever RevenueCat's "plus" entitlement currently points at: a promotional grant or another source must not
 * stand in for, or cancel, a real store purchase. The live one with the latest expiry wins; activeCount says how
 * many are live (more than one is a household paying twice, which sync reports).
 */
function storeRowFromSubscriber(subscriber, now = Date.now(), { acceptSandbox = false } = {}) {
  const subs = (subscriber && subscriber.subscriptions) || {};
  const t = now instanceof Date ? now.getTime() : now;
  const found = [];
  let reason = "no_store_purchase";
  for (const [key, sub] of Object.entries(subs)) {
    if (!sub || typeof sub !== "object") continue;
    const planKey = planKeyFor(key, sub.product_plan_identifier);
    if (!planKey) { reason = reason === "no_store_purchase" ? "unknown_product" : reason; continue; }
    if (!STORE_PROVIDERS.includes(sub.store)) { reason = "not_a_store_purchase"; continue; }
    if (sub.is_sandbox && !acceptSandbox) { reason = "sandbox"; continue; }
    if (sub.ownership_type === "FAMILY_SHARED") { reason = "family_shared"; continue; }
    const expires = Math.max(ms(sub.expires_date) || 0, ms(sub.grace_period_expires_date) || 0) || null;
    const refunded = ms(sub.refunded_at);
    let status;
    if (refunded !== null) status = "canceled";
    else if (expires !== null && t >= expires) status = "canceled";
    else status = sub.period_type === "trial" ? "trialing" : "active";   // a billing retry inside the grace period stays active
    found.push({
      live: status !== "canceled",
      sortAt: refunded !== null ? refunded : (expires !== null ? expires : t),
      row: {
        provider: sub.store,
        status,
        plan_key: planKey,
        current_period_end: new Date(refunded !== null ? refunded : (expires !== null ? expires : t)).toISOString(),
        cancel_at_period_end: !!sub.unsubscribe_detected_at,
        updated_at: new Date(t).toISOString(),
      },
    });
  }
  if (!found.length) return { row: null, reason, activeCount: 0 };
  const live = found.filter((f) => f.live);
  const pick = (live.length ? live : found).sort((x, y) => y.sortAt - x.sortAt)[0];
  return { row: pick.row, reason: null, activeCount: live.length };
}

/**
 * May `incoming` (a row patch from one provider) replace `existing`? Not when existing is another provider's
 * row that is still live (paid, or a web subscription Stripe is still collecting): one paid state per household.
 * A store row may always replace a store row (the household moved between Apple and Google once the first ran
 * out, or RevenueCat moved the purchase). A row that is over, from any provider, may always be replaced.
 */
function mayReplace(existing, incoming, now = Date.now()) {
  if (!existing) return true;
  const fromStore = (p) => STORE_PROVIDERS.includes(p);
  const was = existing.provider || "stripe";
  if (was === incoming.provider) return true;
  if (fromStore(was) && fromStore(incoming.provider)) return true;
  return !isLiveRow(existing, now);
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
 *   { paid, provider, plan_key, conflict, conflictKind, flag }
 *   conflict      a second paid state was refused (the row kept the first); conflictKind says which
 *   flag          something for support, not for the household: "two_store_subscriptions" (paying twice in the
 *                 stores: a regular plan and the founding annual are separate App Store groups, so both can be
 *                 live), "store_and_web_subscriptions" (a store purchase on top of a paid website subscription),
 *                 "founding_not_eligible" (the founding price bought by a household it was not offered to).
 *                 The household keeps its access. A flag is recorded on the row (support_flag, support_flag_at,
 *                 migration 0022; a repeat keeps the first time) and, when it is new, the support inbox is told
 *                 at once (_lib/supportAlert.js), so it is seen the same day.
 * deps: fetchSubscriber, user (Supabase Auth's record, for the sandbox rule and the founding end), now, env,
 *       mayBuyFounding(admin, userId, user) (the founding rule, _lib/foundingCohort.js), alertSupport (tests).
 */
async function syncStoreSubscription(admin, userId, deps = {}) {
  const now = deps.now != null ? deps.now : Date.now();
  const nowIso = new Date(now).toISOString();
  const fetchSub = deps.fetchSubscriber || fetchSubscriber;
  const user = deps.user || null;
  const subscriber = await fetchSub(userId);
  const { row, reason, activeCount } = storeRowFromSubscriber(subscriber, now, { acceptSandbox: acceptSandboxFor(user, deps.env || process.env) });

  const { data: existing, error: readErr } = await admin
    .from("subscriptions")
    .select("provider, status, current_period_end, plan_key, founding_ended_at, cancel_at_period_end, provider_subscription_id, support_flag, support_flag_at")
    .eq("user_id", userId).maybeSingle();
  if (readErr) throw new Error(`subscriptions read: ${readErr.message}`);
  // A flag for support: on the row, and to the inbox the first time it is raised. Never blocks the sync.
  const alert = deps.alertSupport || alertSupport;
  const flagFields = (flag) => ({ support_flag: flag,
    support_flag_at: existing && existing.support_flag === flag && existing.support_flag_at ? existing.support_flag_at : nowIso });
  const tellSupport = async (flag, provider) => {
    if (existing && existing.support_flag === flag) return;
    try { await alert({ flag, userId, provider }, { env: deps.env || process.env }); } catch { /* logged inside; the row has it */ }
  };
  const existingProvider = existing ? existing.provider || "stripe" : null;
  const answer = (o) => ({ paid: isPaidSubscription(existing, now), provider: existingProvider, plan_key: existing ? existing.plan_key : null, conflict: false, conflictKind: null, flag: null, reason, ...o });

  let next = null;
  if (row) {
    // An unpaid store record never writes over another provider's row: there is nothing to say, and stamping it
    // would also make a web event delivered late look stale (stripe-webhook.js orders by last_event_at).
    if (existing && !STORE_PROVIDERS.includes(existingProvider) && !isPaidSubscription(row, now)) return answer({});
    next = { ...row, last_event_at: nowIso };
  } else if (existing && STORE_PROVIDERS.includes(existingProvider) && isPaidSubscription(existing, now)) {
    // The store no longer reports any live purchase (refunded, or RevenueCat moved it to another account): it ends now.
    next = { provider: existingProvider, status: "canceled", current_period_end: nowIso, updated_at: nowIso, last_event_at: nowIso };
  }
  if (!next) return answer({});
  if (!mayReplace(existing, next, now)) {
    console.error("[store-sync] conflict: a store purchase for a household whose subscription is with", existingProvider);
    const paidElsewhere = isPaidSubscription(existing, now);
    // Paying on the website and in a store at once: recorded on the (website's) row for support, which stays as it is.
    let flag = null;
    if (paidElsewhere && isPaidSubscription(next, now)) {
      flag = "store_and_web_subscriptions";
      const { error: flagErr } = await admin.from("subscriptions").update(flagFields(flag)).eq("user_id", userId);
      if (flagErr) console.error("[store-sync] flag write failed:", flagErr.message);
      await tellSupport(flag, next.provider);
      console.error("[store-sync] flag for support:", flag);
    }
    return answer({ paid: paidElsewhere, conflict: true, conflictKind: paidElsewhere ? "already_paid_elsewhere" : "web_needs_attention", flag });
  }
  // A store purchase replacing a web row: the old Stripe subscription id no longer names this row, so a late
  // Stripe event cannot find it by that id and write over the store purchase. The Stripe customer id stays, for
  // the web's invoice history.
  if (existing && existingProvider === "stripe" && STORE_PROVIDERS.includes(next.provider)) next.provider_subscription_id = null;

  // A FOUNDING SUBSCRIPTION THAT HAS ENDED (rule of 2026-10-07), as stripe-webhook.js applies it: stamped once on
  // the account and on the waitlist number, never cleared, so the founding price never comes back. "Ended" is the
  // last state we knew being live (trialing or active) and the store's state now being over: RevenueCat's
  // expiration arrives after the period end, so "paid at the moment of syncing" would never see it.
  const wasFounding = existing && existing.plan_key === "founding_annual" && STORE_PROVIDERS.includes(existingProvider)
    && ["trialing", "active"].includes(existing.status);
  const foundingEnded = wasFounding && !isPaidSubscription(next, now) && !existing.founding_ended_at;
  if (foundingEnded) next.founding_ended_at = nowIso;

  // A FOUNDING PRICE NOBODY OFFERED. On the App Store a subscription group lists all its prices to its members,
  // so a household could pick the founding annual without the server ever offering it. The purchase still counts
  // (it was paid for), and it is flagged for support. Checked once, when the row first becomes founding.
  let flag = activeCount > 1 ? "two_store_subscriptions" : null;
  if (!flag && next.plan_key === "founding_annual" && !(existing && existing.plan_key === "founding_annual") && typeof deps.mayBuyFounding === "function") {
    try { if (!(await deps.mayBuyFounding(admin, userId, user))) flag = "founding_not_eligible"; } catch { flag = "founding_not_eligible"; }
  }

  if (flag) Object.assign(next, flagFields(flag));
  const { error: writeErr } = await admin.from("subscriptions").upsert({ user_id: userId, ...next }, { onConflict: "user_id" });
  if (writeErr) throw new Error(`subscriptions write: ${writeErr.message}`);
  if (flag) await tellSupport(flag, next.provider);
  if (foundingEnded && user && user.email) {
    const { error: endErr } = await admin.rpc("waitlist_founding_mark_ended", { p_email: user.email });
    if (endErr) throw new Error(`founding end: ${endErr.message}`);
  }
  if (flag) console.error("[store-sync] flag for support:", flag);
  return { paid: isPaidSubscription(next, now), provider: next.provider, plan_key: next.plan_key || (existing && existing.plan_key) || null, conflict: false, conflictKind: null, flag, reason };
}

module.exports = {
  ENTITLEMENT_ID, STORE_PROVIDERS, PRODUCT_PLANS, RC_API, REVIEW_ACCOUNT_SHA256, STRIPE_LIVE_UNPAID,
  isUuid, planKeyFor, isReviewAccountEmail, acceptSandboxFor, storeRowFromSubscriber, mayReplace, isLiveRow,
  fetchSubscriber, syncStoreSubscription,
};
