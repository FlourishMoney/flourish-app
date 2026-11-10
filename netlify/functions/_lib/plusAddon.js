// netlify/functions/_lib/plusAddon.js
// -----------------------------------------------------------------------------
// THE PLUS ADD-ON (2026-11-10). Behind PLUS_ENABLED (Netlify), off until Amanda switches it on.
//
// Amanda's decisions, fixed: Plus is an add-on on top of any plan, $4.99 a month or $49.99 a year plus tax; the
// founding households get no Plus discount and keep $79.99 a year on the main plan; nothing a household can use
// today moves behind Plus.
//
// NOT THE MAIN PLAN. The main plan is already called "plus" inside the code: profiles.plan "plus", RevenueCat's
// entitlement "plus", the App Store products app.flourishmoney.plus.*, the Play subscription flourish_plus. None of
// those is this add-on, and nothing here reads them. The add-on has its own ids everywhere:
//   plan keys           plus_monthly, plus_annual
//   table               public.plus_addon_subscriptions (migration 0044), never public.subscriptions
//   Stripe              its own prices (STRIPE_PRICE_PLUS_MONTHLY_CAD, STRIPE_PRICE_PLUS_ANNUAL_CAD) and its own
//                       customer per buyer, so a main-plan refund, portal or live-subscription check never sees it
//   RevenueCat          the entitlement "plus_addon", attached to the add-on's products only
//   App Store / Play    the products in PLUS_PRODUCTS below, in a subscription group / subscription of their own
//
// FAILS CLOSED, BOTH WAYS:
//   - Plus is granted only from a row read successfully that is live, and whose product is one of Plus's own: a
//     Stripe price that is configured as a Plus price (and is not a main-plan price), or a store product in
//     PLUS_PRODUCTS confirmed by RevenueCat's "plus_addon" entitlement AND the store purchase itself. A read that
//     fails, a missing table, an unknown price, a promotional grant: no Plus.
//   - Nothing here can take away anything the main plan gives. getUserPlan (_lib/auth.js) never reads this file,
//     and this file never writes public.subscriptions.
// Nothing here logs a key, a token, an email address, a price or an amount.
// -----------------------------------------------------------------------------
"use strict";

const { isPaidSubscription } = require("./planRules");
const { peerIdsOf, isMissing } = require("./household");
const { PRICE_ENV: MAIN_PRICE_ENV } = require("./billingPlans");

const plusEnabled = (env = process.env) => env.PLUS_ENABLED === "true";

const PLUS_PLAN_KEYS = Object.freeze(["plus_monthly", "plus_annual"]);
const PLUS_PRICE_ENV = Object.freeze({
  plus_monthly: "STRIPE_PRICE_PLUS_MONTHLY_CAD",
  plus_annual:  "STRIPE_PRICE_PLUS_ANNUAL_CAD",
});
const PLUS_ENTITLEMENT_ID = "plus_addon";
// The store products (docs/product/NET-WORTH-SPEC.md, "Products to create"). Apple: one subscription group of its
// own, two products. Google: one subscription of its own (flourish_plus_addon) with two base plans; RevenueCat names
// a Google product "<subscription>:<base plan>".
const PLUS_PRODUCTS = Object.freeze({
  "app.flourishmoney.plusaddon.monthly": "plus_monthly",
  "app.flourishmoney.plusaddon.annual":  "plus_annual",
  "flourish_plus_addon:monthly":         "plus_monthly",
  "flourish_plus_addon:annual":          "plus_annual",
});
const STORE_PROVIDERS = Object.freeze(["app_store", "play_store"]);
const TABLE = "plus_addon_subscriptions";

const isPlusPlanKey = (k) => typeof k === "string" && PLUS_PLAN_KEYS.includes(k);
const clean = (v) => (typeof v === "string" ? v.trim() : "");
const ms = (v) => { const t = v ? Date.parse(v) : NaN; return Number.isFinite(t) ? t : null; };
const nowMs = (now) => (now instanceof Date ? now.getTime() : now);

// The configured Plus price ids. A Plus price that is also a main-plan price is a misconfiguration: then NO Plus
// price counts, so a main-plan subscription can never be read as Plus.
function plusPriceIds(env = process.env) {
  const main = new Set(Object.values(MAIN_PRICE_ENV).map((n) => clean(env[n])).filter(Boolean));
  const ids = Object.values(PLUS_PRICE_ENV).map((n) => clean(env[n])).filter(Boolean);
  if (ids.some((id) => main.has(id))) return new Set();
  return new Set(ids);
}
function plusPlanForPrice(priceId, env = process.env) {
  const id = clean(priceId);
  if (!id || !plusPriceIds(env).has(id)) return null;
  for (const [key, name] of Object.entries(PLUS_PRICE_ENV)) if (clean(env[name]) === id) return key;
  return null;
}
// { priceId } or { error }. Never throws, never guesses a price.
function plusPriceIdFor(planKey, env = process.env) {
  if (!isPlusPlanKey(planKey)) return { error: "unknown_plan" };
  const id = clean(env[PLUS_PRICE_ENV[planKey]]);
  if (!id || !plusPriceIds(env).has(id)) return { error: "price_not_configured" };
  return { priceId: id };
}

// Does this row give Plus now? Live (Stripe active or trialing, or a store's active) with a period that has not
// ended, and its product one of Plus's own for the plan it names. A row with no period end does not count: a
// webhook we never received must not hand out Plus.
function isLivePlusRow(row, env = process.env, now = Date.now()) {
  if (!row || !isPlusPlanKey(row.plan_key)) return false;
  if (ms(row.current_period_end) === null) return false;
  if (!isPaidSubscription(row, now)) return false;
  if (row.provider === "stripe") return plusPlanForPrice(row.product_id, env) === row.plan_key;
  if (STORE_PROVIDERS.includes(row.provider)) return PLUS_PRODUCTS[row.product_id] === row.plan_key;
  return false;
}

/**
 * The household's Plus answer: { enabled, plus, covered_by, status_unavailable }.
 *   enabled false        PLUS_ENABLED is off: nothing is read, nothing is offered, nothing changes.
 *   status_unavailable   a read failed (or 0044 is not applied): plus is false and the caller says so plainly
 *                        (503), never "you don't have Plus" and never a limit worked out from a guess.
 * Either member's live row covers the household (the fair-use limit of 10 bank connections is per household).
 */
async function getPlusEntitlement(admin, userId, { env = process.env, now = Date.now() } = {}) {
  if (!plusEnabled(env)) return { enabled: false, plus: false, covered_by: null, status_unavailable: false };
  const unavailable = { enabled: true, plus: false, covered_by: null, status_unavailable: true };
  try {
    const peers = await peerIdsOf(admin, userId);
    for (const id of [userId, ...peers]) {
      const { data, error } = await admin.from(TABLE)
        .select("provider, plan_key, status, product_id, current_period_end")
        .eq("user_id", id).maybeSingle();
      if (error) { console.error("[plus] read failed (status unavailable):", error.code || "error"); return unavailable; }
      if (isLivePlusRow(data, env, now)) return { enabled: true, plus: true, covered_by: id === userId ? null : "partner", status_unavailable: false };
    }
    return { enabled: true, plus: false, covered_by: null, status_unavailable: false };
  } catch (e) {
    console.error("[plus] read failed (status unavailable):", e.message);
    return unavailable;
  }
}

// ── STRIPE ───────────────────────────────────────────────────────────────────────────────────────────
// Every price on a Stripe subscription object.
function stripePricesOf(sub) {
  return ((sub && sub.items && sub.items.data) || []).map((it) => it && it.price && it.price.id).filter(Boolean);
}
// Is this webhook object the add-on's? A checkout we made for Plus says so in its metadata (only the server sets
// Stripe metadata); a subscription says so by its price, or its metadata. Either way it never reaches the main
// plan's handling, whether or not it turns out to be a real Plus price.
const MAIN_PLAN_KEYS = Object.freeze(Object.keys(MAIN_PRICE_ENV));
function isPlusStripeObject(object, env = process.env) {
  if (!object) return false;
  if (object.metadata && object.metadata.kind === "plus_addon") return true;
  // A main-plan subscription (our checkout tagged it with a main plan key) is never routed to Plus, even if a Plus
  // price was set to an old main price that still has subscribers (review 2026-11-10).
  if (object.metadata && MAIN_PLAN_KEYS.includes(object.metadata.plan_key)) return false;
  return stripePricesOf(object).some((p) => plusPriceIds(env).has(p));
}
// A Stripe subscription -> the add-on's row, or null when it is not a Plus price (never granted on metadata alone).
function plusRowFromStripe(sub, env = process.env, extra = {}) {
  const prices = stripePricesOf(sub);
  if (prices.length !== 1) return null;                 // a Plus subscription has exactly one item: its price
  const planKey = plusPlanForPrice(prices[0], env);
  if (!planKey) return null;
  const item = sub.items.data[0] || {};
  const end = Number.isFinite(sub.current_period_end) ? sub.current_period_end : item.current_period_end;
  return {
    provider: "stripe",
    plan_key: planKey,
    status: String(sub.status || ""),
    product_id: prices[0],
    provider_subscription_id: sub.id || null,
    provider_customer_id: typeof sub.customer === "string" ? sub.customer : (sub.customer && sub.customer.id) || null,
    current_period_end: Number.isFinite(end) ? new Date(end * 1000).toISOString() : null,
    cancel_at_period_end: !!sub.cancel_at_period_end || (Number.isFinite(sub.cancel_at) && sub.cancel_at > 0),
    updated_at: new Date().toISOString(),
    ...extra,
  };
}

// ── THE STORES (through RevenueCat) ──────────────────────────────────────────────────────────────────
function storeProductKey(key, sub) {
  if (PLUS_PRODUCTS[key]) return key;
  if (sub && sub.product_plan_identifier && !String(key).includes(":")) {
    const k = `${key}:${sub.product_plan_identifier}`;
    if (PLUS_PRODUCTS[k]) return k;
  }
  return null;
}
/**
 * RevenueCat's subscriber record -> { row, reason }. Plus only when BOTH agree, now:
 *   the "plus_addon" entitlement is active (an expiry in the future) and names one of Plus's products, and
 *   that product's store purchase (App Store or Google Play) is live: not expired, not refunded, not sandbox
 *   (unless acceptSandbox: the App Review account), not Family Sharing.
 * A promotional grant (an entitlement with no store purchase), or a purchase the entitlement does not name, is no Plus.
 */
function plusFromSubscriber(subscriber, now = Date.now(), { acceptSandbox = false } = {}) {
  const t = nowMs(now);
  const ent = subscriber && subscriber.entitlements && subscriber.entitlements[PLUS_ENTITLEMENT_ID];
  const entExpires = ent ? ms(ent.expires_date) : null;
  if (!ent || entExpires === null || t >= entExpires) return { row: null, reason: "no_entitlement" };
  const subs = (subscriber && subscriber.subscriptions) || {};
  const entProduct = String(ent.product_identifier || "");
  for (const [key, sub] of Object.entries(subs)) {
    if (!sub || typeof sub !== "object") continue;
    const productKey = storeProductKey(key, sub);
    if (!productKey) continue;
    if (entProduct !== key && entProduct !== productKey) continue;          // the entitlement must name this purchase
    if (!STORE_PROVIDERS.includes(sub.store)) return { row: null, reason: "not_a_store_purchase" };
    if (sub.is_sandbox && !acceptSandbox) return { row: null, reason: "sandbox" };
    if (sub.ownership_type === "FAMILY_SHARED") return { row: null, reason: "family_shared" };
    if (ms(sub.refunded_at) !== null) return { row: null, reason: "refunded" };
    const expires = Math.max(ms(sub.expires_date) || 0, ms(sub.grace_period_expires_date) || 0) || null;
    if (expires === null || t >= expires) return { row: null, reason: "expired" };
    return {
      reason: null,
      row: {
        provider: sub.store,
        plan_key: PLUS_PRODUCTS[productKey],
        status: "active",
        product_id: productKey,
        // The subscription id is cleared, so a website Plus subscription that recovers later is a conflict, never a
        // write over this row. The Stripe customer is NOT in the row: the upsert keeps any the buyer already has, so
        // delete_account can still cancel a website Plus charge and the portal can still reach it (review 2026-11-10).
        provider_subscription_id: null,
        current_period_end: new Date(expires).toISOString(),
        cancel_at_period_end: !!sub.unsubscribe_detected_at,
        updated_at: new Date(t).toISOString(),
      },
    };
  }
  return { row: null, reason: "not_a_store_purchase" };
}

/**
 * Bring this buyer's Plus row up to date from RevenueCat (never from anything the app says). Returns
 * { plus, conflict }. A live Stripe Plus row is never written over by a store record (one Plus per buyer: paying
 * twice is logged for support, and the household keeps Plus). A store row the store no longer reports ends now.
 * deps: fetchSubscriber (from _lib/storeSubscriptions.js), acceptSandbox, env, now.
 */
async function syncPlusFromStore(admin, userId, deps = {}) {
  const env = deps.env || process.env;
  const now = deps.now != null ? deps.now : Date.now();
  const nowIso = new Date(now).toISOString();
  const subscriber = await deps.fetchSubscriber(userId);
  const { row } = plusFromSubscriber(subscriber, now, { acceptSandbox: !!deps.acceptSandbox });
  const { data: existing, error } = await admin.from(TABLE)
    .select("provider, plan_key, status, product_id, current_period_end").eq("user_id", userId).maybeSingle();
  if (error) throw new Error(`plus read: ${error.code || "error"}`);
  let next = null;
  if (row) {
    if (existing && existing.provider === "stripe" && isLivePlusRow(existing, env, now)) {
      console.error("[plus] conflict: a store Plus purchase for a buyer whose Plus is on the website");
      return { plus: true, conflict: true };
    }
    next = { ...row, last_event_at: nowIso };
  } else if (existing && STORE_PROVIDERS.includes(existing.provider) && isLivePlusRow(existing, env, now)) {
    next = { provider: existing.provider, plan_key: existing.plan_key, product_id: existing.product_id, status: "canceled", current_period_end: nowIso, updated_at: nowIso, last_event_at: nowIso };
  }
  if (!next) return { plus: isLivePlusRow(existing, env, now), conflict: false };
  const { error: wErr } = await admin.from(TABLE).upsert({ user_id: userId, ...next }, { onConflict: "user_id" });
  if (wErr) throw new Error(`plus write: ${wErr.code || "error"}`);
  return { plus: isLivePlusRow(next, env, now), conflict: false };
}

module.exports = {
  TABLE, PLUS_PLAN_KEYS, PLUS_PRICE_ENV, PLUS_ENTITLEMENT_ID, PLUS_PRODUCTS, STORE_PROVIDERS,
  plusEnabled, isPlusPlanKey, plusPriceIds, plusPlanForPrice, plusPriceIdFor, isLivePlusRow, getPlusEntitlement,
  stripePricesOf, isPlusStripeObject, plusRowFromStripe, plusFromSubscriber, syncPlusFromStore, isMissing,
};
