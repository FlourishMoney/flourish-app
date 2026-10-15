// src/lib/storeBilling.js
// -----------------------------------------------------------------------------
// IN-APP PURCHASE IN THE STORE APPS (version 1.1), THROUGH REVENUECAT.
//
// OFF BY DEFAULT. Everything here is inert unless the build sets VITE_IAP_ENABLED to exactly "true", and it is
// only ever true in a store build (iOS or Android). With it off — every web build, and every store build until
// 1.1 — no RevenueCat code loads, no purchase can start, nothing is shown, and the app is exactly what it was.
//
// THE SERVER DECIDES, NOT THE STORE SDK. What a household may do comes from one place: the server's
// period-aware plan answer, read from the household's one subscription row (netlify/functions/_lib/planRules.js).
// RevenueCat is the source for store purchases and Stripe for web purchases; both land in that row
// (netlify/functions/_lib/storeSubscriptions.js). The app asks the server (billing.js store_status) and shows
// what it says. The SDK's own customerInfo is never treated as access: after a purchase the app asks the server
// to look again (store_sync), and waits for the server's yes.
//
// ONE PAID STATE AT A TIME. Before a purchase starts, the server is asked whether this household already pays
// (on the web, or in the other store): if it does, nothing is sold. The server refuses a second paid state in
// the row as well (storeSubscriptions.mayReplace), so a race cannot leave two.
//
// THE PUBLIC KEYS. VITE_REVENUECAT_IOS_KEY and VITE_REVENUECAT_ANDROID_KEY are RevenueCat's public SDK keys
// (appl_…, goog_…), which RevenueCat designs to ship inside apps. The secret key (sk_…) is server-only
// (REVENUECAT_SECRET_KEY in Netlify) and never appears here.
// -----------------------------------------------------------------------------

export const ENTITLEMENT_ID = "plus";

// The store product identifiers, one per plan. Apple: one subscription group, three products. Google: two
// subscriptions with base plans, named "<subscription>:<base plan>" as RevenueCat names them.
// docs/ops/IAP-1.1.md is Amanda's list for creating them; tests/storeBilling.test.cjs holds this table and the
// server's (_lib/storeSubscriptions.js PRODUCT_PLANS) together.
export const PRODUCT_IDS = Object.freeze({
  ios: Object.freeze({
    monthly: "app.flourishmoney.plus.monthly",
    annual: "app.flourishmoney.plus.annual",
    founding_annual: "app.flourishmoney.founding.annual",
  }),
  android: Object.freeze({
    monthly: "flourish_plus:monthly",
    annual: "flourish_plus:annual",
    founding_annual: "flourish_founding:annual",
  }),
});

// RevenueCat offerings: "default" holds monthly and annual; "founding" holds the founding annual, shown only
// when the server says this household may have the founding price (the first 50 waitlist households).
export const OFFERING_IDS = Object.freeze({ standard: "default", founding: "founding" });

export function planKeyForProduct(productId) {
  for (const ids of Object.values(PRODUCT_IDS)) {
    for (const [plan, id] of Object.entries(ids)) if (id === productId) return plan;
  }
  return null;
}

/** Is in-app purchase switched on in this build? Only a store build, and only with VITE_IAP_ENABLED "true". */
export function storeBillingOn({ native = false, env = {} } = {}) {
  return !!native && env.VITE_IAP_ENABLED === "true";
}

/** The body field a selling build adds to plan-dependent requests (_lib/cors.js isStoreBillingRequest). */
export function storeBillingFields(on) {
  return on ? { store_billing: true } : {};
}

/** RevenueCat's public SDK key for this platform, or "" (then nothing is configured and nothing is sold). */
export function revenueCatKey(platform, env = {}) {
  const k = platform === "ios" ? env.VITE_REVENUECAT_IOS_KEY : platform === "android" ? env.VITE_REVENUECAT_ANDROID_KEY : "";
  const v = typeof k === "string" ? k.trim() : "";
  if (platform === "ios" && !/^appl_/.test(v)) return "";
  if (platform === "android" && !/^goog_/.test(v)) return "";
  return v;
}

/**
 * The packages to offer, from RevenueCat's offerings and the server's founding answer:
 *   { monthly, annual, founding } — any may be null. The founding package is offered in place of the standard
 *   annual, and only when the server says this household may have it.
 */
export function choosePackages(offerings, { foundingAvailable = false } = {}) {
  const all = (offerings && offerings.all) || {};
  const std = all[OFFERING_IDS.standard] || (offerings && offerings.current) || null;
  const pkgs = (o) => (o && Array.isArray(o.availablePackages) ? o.availablePackages : []);
  const byPlan = (o, plan) => pkgs(o).find((p) => planKeyForProduct(p && p.product && p.product.identifier) === plan) || null;
  const monthly = byPlan(std, "monthly");
  const founding = foundingAvailable ? byPlan(all[OFFERING_IDS.founding], "founding_annual") : null;
  const annual = founding ? null : byPlan(std, "annual");
  return { monthly, annual, founding };
}

const CANCELLED = "1";       // RevenueCat PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR
const PENDING = "20";        // PAYMENT_PENDING_ERROR (Ask to Buy, a slow card)
const sleepFor = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Wait for the server to say the household pays. deps.serverSync() asks it to look at RevenueCat again and
 * returns { paid, provider, conflict }. A few tries, because the store's confirmation can lag the sheet.
 */
export async function confirmWithServer(deps, { tries = 5, delayMs = 1500 } = {}) {
  const sleep = deps.sleep || sleepFor;
  let last = null;
  for (let i = 0; i < tries; i++) {
    if (i > 0) await sleep(delayMs);
    try { last = await deps.serverSync(); } catch { last = null; }
    if (last && last.paid) return { outcome: last.conflict ? "already_paid" : "paid", provider: last.provider || null };
  }
  return { outcome: "unconfirmed" };
}

/**
 * One purchase, start to finish. Resolves one of:
 *   paid          the server confirms the subscription
 *   already_paid  the household already pays (web or the other store): nothing was sold
 *   cancelled     the household closed the store's sheet
 *   pending       the store is waiting (Ask to Buy, a slow payment); access follows when it completes
 *   failed        the store refused it (a declined payment, a store problem)
 *   unconfirmed   the store took it but the server has not confirmed yet ("Check again" / Restore)
 * deps: serverStatus(), purchasePackage(pkg), serverSync(), sleep(ms)
 */
export async function buy(deps, pkg) {
  let status = null;
  try { status = await deps.serverStatus(); } catch { return { outcome: "failed", reason: "status_unavailable" }; }
  if (status && status.paid) return { outcome: "already_paid", provider: status.provider || null };
  if (!pkg) return { outcome: "failed", reason: "no_package" };
  try {
    await deps.purchasePackage(pkg);
  } catch (e) {
    const code = e && (e.code != null ? String(e.code) : "");
    if (code === CANCELLED || (e && e.userCancelled === true)) return { outcome: "cancelled" };
    if (code === PENDING) return { outcome: "pending" };
    return { outcome: "failed", reason: "store_refused" };
  }
  return confirmWithServer(deps);
}

/** Restore: the store re-reports this Apple or Google account's purchases, then the server is asked. */
export async function restore(deps) {
  try { await deps.restorePurchases(); } catch { return { outcome: "failed", reason: "store_refused" }; }
  const r = await confirmWithServer(deps, { tries: 2 });
  return r.outcome === "unconfirmed" ? { outcome: "nothing_to_restore" } : r;
}

/**
 * VERSION 1.1, ITEM 3: WHEN THE PAYWALL MAY APPEAR. Nobody is cut off in the middle of something.
 *
 * The paywall is decided only at a safe point: the first answer for this account after the app starts or the
 * household signs in, and each return from the background. Between those, an answer that changes (a refresh,
 * a profile reload) never puts the paywall in front of someone; it waits for the next safe point. An answer the
 * app does not have (offline, the server not reached) never puts it up either: unknown is not "not paid".
 * Taking it down is always safe, so a confirmed subscription removes it at once.
 *
 * open:     a safe point is pending (set at start, at sign-in, on return from the background)
 * entitled: true, false, or null (not known yet)
 * Returns { up: true | false | null (leave as it is), open: whether a safe point is still pending }.
 */
export function paywallDecision({ open = false, entitled = null } = {}) {
  if (entitled === true) return { up: false, open: false };
  if (entitled === false && open) return { up: true, open: false };
  return { up: null, open };
}
