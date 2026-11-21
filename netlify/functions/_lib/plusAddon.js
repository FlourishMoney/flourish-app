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
const { peerIdsOf, isMissing, isAttemptId, HOLD_MINUTES, PENDING_BACKSTOP_DAYS } = require("./household");
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
// Where a buyer manages their own Plus purchase: Stripe's portal, or the store it was bought in.
const MANAGED_PROVIDERS = Object.freeze(["stripe", ...STORE_PROVIDERS]);
// Is a store product id (as a RevenueCat event names it) one of the add-on's? Google's may come as the subscription
// alone ("flourish_plus_addon") or with its base plan. The main plan's ids (app.flourishmoney.plus.*, flourish_plus)
// are never the add-on's.
const PLUS_STORE_SUBSCRIPTIONS = Object.freeze([...new Set(Object.keys(PLUS_PRODUCTS).map((k) => k.split(":")[0]))]);
const isPlusStoreProductId = (id) => typeof id === "string" && PLUS_STORE_SUBSCRIPTIONS.includes(id.trim().split(":")[0]);
const TABLE = "plus_addon_subscriptions";
// COMPLIMENTARY PLUS (migration 0051): an account given Plus free, by hand, on the server. Its own table, written only
// by the service role; who and why is recorded outside this repo. Never a subscription: nothing here reads a price.
const COMP_TABLE = "complimentary_access";

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
 * The household's Plus answer: { enabled, plus, covered_by, status_unavailable, provider }.
 *   provider             where the CALLER'S OWN live Plus purchase is ("stripe", "app_store", "play_store"), so the app
 *                        can say where it is managed. null for a partner's Plus (theirs to manage), for complimentary
 *                        Plus (nothing to manage) and for no Plus.
 *   enabled false        PLUS_ENABLED is off: nothing is read, nothing is offered, nothing changes.
 *   status_unavailable   a read failed (or 0044 is not applied): plus is false and the caller says so plainly
 *                        (503), never "you don't have Plus" and never a limit worked out from a guess.
 * Either member's live row covers the household (the fair-use limit of 10 bank connections is per household).
 */
/**
 * Does this account hold complimentary Plus? true or false; null when the read failed (never read as "no").
 * A table that is not there yet (0051 not applied) is false: nobody can have been given it.
 */
async function hasComplimentaryPlus(admin, userId) {
  const { data, error } = await admin.from(COMP_TABLE).select("plus_addon").eq("user_id", userId).maybeSingle();
  if (error) {
    if (isMissing(error)) return false;
    console.error("[plus] complimentary read failed (status unavailable):", error.code || "error");
    return null;
  }
  return !!data && data.plus_addon === true;
}
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
      if (isLivePlusRow(data, env, now)) return { enabled: true, plus: true, covered_by: id === userId ? null : "partner", status_unavailable: false, provider: id === userId ? data.provider : null };
    }
    // No paid Plus in the household: complimentary Plus (0051) covers it the same way, the buyer's partner included.
    for (const id of [userId, ...peers]) {
      const comp = await hasComplimentaryPlus(admin, id);
      if (comp === null) return unavailable;
      if (comp) return { enabled: true, plus: true, covered_by: id === userId ? null : "partner", status_unavailable: false, complimentary: true };
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

// ── ONE PLUS PURCHASE AT A TIME (migration 0052) ─────────────────────────────────────────────────────────
// Every Plus purchase is one ATTEMPT (a Stripe checkout the server is about to open, or one tap in a store app). A
// person has at most one live attempt, and while one member of a household has one the other member's is refused, so
// two partners can never each buy Plus at the same moment. The same design, the same 32 minutes and the same 7 days
// once the store says "pending" as the main plan's hold (_lib/household.js holdPurchase), in a table of its own, so a
// household that has just bought the main plan can add Plus straight away.
//   holdPlusPurchase   { held: true } | { held: false, mine }   (mine: this person's own other attempt)
// THROWS on anything else (the call failed, or 0052 is not applied): the caller sells nothing rather than risk two
// purchases. There is no "legacy" yes here: no attempt recorded, no Plus sold.
async function holdPlusPurchase(admin, userId, provider, attemptId) {
  const { data, error } = await admin.rpc("plus_purchase_attempt_begin", { p_user: userId, p_provider: provider, p_attempt: attemptId, p_ttl: `${HOLD_MINUTES} minutes` });
  if (error) throw new Error(`plus hold: ${error.code || "error"}`);
  const r = (data && data.result) || "";
  if (r === "held") return { held: true };
  if (r === "held_elsewhere") return { held: false, mine: data.mine === true };
  throw new Error(`plus hold: ${r || "no_answer"}`);
}
// The store said the purchase is pending: the attempt lasts PENDING_BACKSTOP_DAYS from its start. true when it was
// this person's live store attempt.
async function holdPlusPending(admin, userId, attemptId) {
  const { data, error } = await admin.rpc("plus_purchase_attempt_pending", { p_user: userId, p_attempt: attemptId, p_backstop: `${PENDING_BACKSTOP_DAYS} days` });
  if (error) throw new Error(`plus pending: ${error.code || "error"}`);
  return !!data && data.result === "pending";
}

// ── THE PLUS PORTAL HAS A CONFIGURATION OF ITS OWN (2026-11-21) ─────────────────────────────────────────────
// Stripe's customer portal has one DEFAULT configuration, shared by everyone the main plan sends there. In this
// account it lets a customer switch plans, and its product list is the main plan's prices. A Plus buyer sent to it
// could switch their Plus subscription into the main plan: they would pay the main plan's price, lose Plus (the row is
// no longer a Plus price) and get no main plan either (the subscription is tagged as the add-on's). The shared setting
// stays as it is, because main-plan customers use it. Instead every Plus portal session names a configuration of its
// own, made through Stripe's API (the Dashboard edits only the default one):
//   switching plans   OFF (features.subscription_update.enabled false)
//   cancelling        on, at the end of the paid period
//   the card          on
//   invoices          shown; the customer's own details are not editable there
// It is found by its metadata (kind: PLUS_PORTAL_KIND) among the account's active, non-default configurations, and
// made the first time it is needed. Test mode and live mode each get their own: a configuration belongs to the mode of
// the key that made it. Only one that still has switching off, cancelling on and the card on is ever used.
// FAILS CLOSED: if it can be neither found nor made, this throws, and the caller opens no portal at all. A Plus
// customer is never sent to the default configuration.
const PLUS_PORTAL_KIND = "plus_addon_portal";
const PLUS_PORTAL_FEATURES = Object.freeze({
  subscription_update: Object.freeze({ enabled: false }),
  subscription_cancel: Object.freeze({ enabled: true, mode: "at_period_end" }),
  payment_method_update: Object.freeze({ enabled: true }),
  invoice_history: Object.freeze({ enabled: true }),
  customer_update: Object.freeze({ enabled: false }),
});
const on = (f) => !!f && f.enabled === true;
function isPlusPortalConfiguration(c) {
  return !!c && typeof c.id === "string" && c.id.length > 0 && c.active === true && c.is_default !== true
    && !!c.metadata && c.metadata.kind === PLUS_PORTAL_KIND
    && !!c.features && !!c.features.subscription_update && c.features.subscription_update.enabled === false
    && on(c.features.subscription_cancel) && on(c.features.payment_method_update);
}
// One per mode, kept for the life of this function instance. Keyed by the key's public prefix (sk_test_ / sk_live_ /
// rk_…), never the key: a test key and a live key never share a configuration.
const portalCache = new Map();
const modeOf = (env) => String((env && env.STRIPE_SECRET_KEY) || "").trim().slice(0, 8);
/**
 * The id of Plus's own portal configuration. deps: { stripeGet, stripePost }. opts.fresh: look again at Stripe (after
 * a session it was used for failed). Throws when Stripe cannot be asked, or answers with something that is not it.
 */
async function plusPortalConfigurationId(deps, { env = process.env, fresh = false } = {}) {
  const mode = modeOf(env);
  if (!fresh && portalCache.has(mode)) return portalCache.get(mode);
  portalCache.delete(mode);
  const listed = await deps.stripeGet("/billing_portal/configurations?active=true&is_default=false&limit=100");
  let found = ((listed && listed.data) || []).find(isPlusPortalConfiguration) || null;
  if (!found) {
    // No idempotency key on purpose: a replayed answer would describe the configuration as it was first made, not as
    // it is now. Two made at the same moment are both right, and the next lookup uses the first it finds.
    const made = await deps.stripePost("/billing_portal/configurations", { features: PLUS_PORTAL_FEATURES, metadata: { kind: PLUS_PORTAL_KIND } });
    if (!isPlusPortalConfiguration(made)) throw new Error("plus portal configuration: not as asked");
    found = made;
  }
  portalCache.set(mode, found.id);
  return found.id;
}
/**
 * A portal session for a Plus customer, on Plus's own configuration, and never without one. If the session is refused
 * with a remembered configuration (it was switched off at Stripe), the configuration is looked up once more.
 */
async function createPlusPortalSession(deps, customerId, returnUrl, { env = process.env } = {}) {
  const open = async (fresh) => {
    const configuration = await plusPortalConfigurationId(deps, { env, fresh });
    if (typeof configuration !== "string" || !configuration) throw new Error("plus portal configuration: none");
    return deps.stripePost("/billing_portal/sessions", { customer: customerId, configuration, return_url: returnUrl });
  };
  const remembered = portalCache.has(modeOf(env));
  try { return await open(false); }
  catch (e) { if (!remembered) throw e; return open(true); }
}

module.exports = {
  PLUS_PORTAL_KIND, PLUS_PORTAL_FEATURES, isPlusPortalConfiguration, plusPortalConfigurationId, createPlusPortalSession,
  isAttemptId, holdPlusPurchase, holdPlusPending,
  TABLE, COMP_TABLE, PLUS_PLAN_KEYS, PLUS_PRICE_ENV, PLUS_ENTITLEMENT_ID, PLUS_PRODUCTS, STORE_PROVIDERS, MANAGED_PROVIDERS,
  plusEnabled, isPlusPlanKey, isPlusStoreProductId, plusPriceIds, plusPlanForPrice, plusPriceIdFor, isLivePlusRow, hasComplimentaryPlus, getPlusEntitlement,
  stripePricesOf, isPlusStripeObject, plusRowFromStripe, plusFromSubscriber, syncPlusFromStore, isMissing,
};
