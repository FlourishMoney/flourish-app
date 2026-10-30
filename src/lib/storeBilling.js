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

// The store product identifiers, one per plan. Apple: one subscription group, three products. Google: one
// subscription with three base plans, named "<subscription>:<base plan>" as RevenueCat names them, so Google
// never lets a household hold two at once.
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
    founding_annual: "flourish_plus:founding",
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
    // A conflict after the store's sheet means the store took this purchase while the household already had a
    // subscription: it was charged twice (or will be when a trial ends), and must be told so, honestly.
    if (last && last.conflict) return { outcome: "charged_twice", provider: last.provider || null };
    if (last && last.paid) return { outcome: "paid", provider: last.provider || null };
  }
  return { outcome: "unconfirmed" };
}

/**
 * One purchase, start to finish. Resolves one of:
 *   paid          the server confirms the subscription
 *   already_paid  the household already pays (web or the other store): nothing was sold
 *   web_attention its web subscription's last payment failed and Stripe is retrying: nothing was sold; the card
 *                 is fixed on the website, or the subscription would charge twice
 *   charged_twice the store took the purchase although the household already had a subscription (a race)
 *   cancelled     the household closed the store's sheet
 *   pending       the store is waiting (Ask to Buy, a slow payment); access follows when it completes
 *   failed        the store refused it (a declined payment, a store problem)
 *   unconfirmed   the store took it but the server has not confirmed yet ("Check again" / Restore)
 * deps: serverStatus(), serverHold(attemptId, state?), purchasePackage(pkg), serverSync(), sleep(ms), newAttemptId(),
 *       attempt (a { current } holder kept across taps, e.g. a React ref), now()
 *
 * COUPLE MODE (audit H5, round 2 a): each purchase is one ATTEMPT, with an id of its own. Just before the
 * store's sheet opens, the server is asked to hold the household for that attempt (billing.js store_hold), so no
 * other attempt (the other member's, or this person's own on the website or the other store) can buy at the same
 * moment. Only { held: true } opens the sheet; anything else sells nothing. If the store answers "pending", the
 * server is told, which keeps the household held for 7 days from the tap.
 * Round 3 a: the app never ENDS a hold. A cancelled or failed sheet tells the server nothing; its hold lapses on
 * its own (32 minutes from the tap), and nothing ends one sooner (round 4: not a store's report either). So one
 * attempt id is kept across taps (deps.attempt) for ATTEMPT_MS: a tap after a cancelled sheet is the same attempt
 * again, and the person is not kept waiting on their own hold. 20 minutes leaves the store's sheet at least 12 of
 * the hold's 32; a tap after that is a new attempt, refused until the old hold lapses. A paid purchase starts afresh.
 */
const randomAttemptId = () => {
  try { if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") return `store-${globalThis.crypto.randomUUID()}`; } catch { /* fall through */ }
  return `store-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
};
export const ATTEMPT_MS = 20 * 60000;
export function attemptFor(holder, now = Date.now(), make = randomAttemptId) {
  const kept = holder && holder.current;
  if (kept && typeof kept.id === "string" && now - kept.at >= 0 && now - kept.at < ATTEMPT_MS) return kept.id;
  const id = make();
  if (holder) holder.current = { id, at: now };
  return id;
}
export async function buy(deps, pkg) {
  let status = null;
  try { status = await deps.serverStatus(); } catch { status = null; }
  // No answer is not "not paid": nothing is sold until the server has said this household does not pay.
  if (!status) return { outcome: "failed", reason: "status_unavailable" };
  if (status.paid) return { outcome: "already_paid", provider: status.provider || null };
  if (status.web_attention) return { outcome: "web_attention", provider: "stripe" };
  if (!pkg) return { outcome: "failed", reason: "no_package" };
  const attempt = deps.serverHold ? attemptFor(deps.attempt || null, deps.now ? deps.now() : Date.now(), deps.newAttemptId || randomAttemptId) : null;
  if (deps.serverHold) {
    let hold = null;
    try { hold = await deps.serverHold(attempt); } catch { hold = null; }
    if (!hold) return { outcome: "failed", reason: "hold_unavailable" };
    if (!hold.held) return hold.paid ? { outcome: "already_paid", provider: hold.provider || null } : { outcome: "failed", reason: "purchase_in_progress" };
  }
  // "Pending", told to the server for this attempt; never holds up what the person sees.
  const tellPending = async () => {
    if (!deps.serverHold) return;
    for (let i = 0; i < 3; i++) { try { if (await deps.serverHold(attempt, "pending")) return; } catch { /* try again */ } }
  };
  try {
    await deps.purchasePackage(pkg);
  } catch (e) {
    const code = e && (e.code != null ? String(e.code) : "");
    if (code === CANCELLED || (e && e.userCancelled === true)) return { outcome: "cancelled" };
    if (code === PENDING) { await tellPending(); return { outcome: "pending" }; }
    return { outcome: "failed", reason: "store_refused" };
  }
  const done = await confirmWithServer(deps);
  if (done.outcome === "paid" && deps.attempt) deps.attempt.current = null;
  return done;
}

/** Restore: the store re-reports this Apple or Google account's purchases, then the server is asked. */
export async function restore(deps) {
  try { await deps.restorePurchases(); } catch { return { outcome: "failed", reason: "store_refused" }; }
  const r = await confirmWithServer(deps, { tries: 2 });
  return r.outcome === "unconfirmed" ? { outcome: "nothing_to_restore" } : r;
}

/**
 * THE LAST DEFINITE PAYWALL ANSWER FOR THIS ACCOUNT, kept on the phone (version 1.1, review fix). Without it, a
 * household that launched offline, or blocked the billing call, would never meet the paywall. With it: a known
 * "not entitled" stays known; a known "entitled" is trusted only until its paid period ends (or 3 days when the
 * period is not known). Anything else is unknown, which never puts the paywall up.
 */
export const STORE_GATE_KEY = "flourish_store_gate";
// The same, for the web billing status (code audit of e94b112, item 16): a status read that fails leaves a web
// payer paid until the paid period it last confirmed ends, instead of free.
export const WEB_PAID_KEY = "flourish_web_paid";
/** The phone's storage, or null where even reading window.localStorage throws (storage blocked). */
export function deviceStorage(win = typeof window === "undefined" ? undefined : window) {
  try { return win ? win.localStorage : null; } catch { return null; }
}
const GATE_GRACE_MS = 3 * 86400000;
export function rememberGate(storage, userId, entitled, periodEnd = null, now = Date.now(), key = STORE_GATE_KEY) {
  if (!storage || !userId || typeof entitled !== "boolean") return;
  const until = entitled ? (Date.parse(periodEnd || "") || now + GATE_GRACE_MS) : null;
  try { storage.setItem(key, JSON.stringify({ uid: userId, entitled, until })); } catch { /* storage full or blocked */ }
}
export function recalledGate(storage, userId, now = Date.now(), key = STORE_GATE_KEY) {
  if (!storage || !userId) return null;
  let rec = null;
  try { rec = JSON.parse(storage.getItem(key) || "null"); } catch { rec = null; }
  if (!rec || rec.uid !== userId || typeof rec.entitled !== "boolean") return null;
  if (rec.entitled === false) return false;
  return Number.isFinite(rec.until) && now < rec.until ? true : null;
}

/**
 * A household that holds a founding position while a regular store subscription is live:
 * store_status founding.held_on_regular_plan (netlify/functions/billing.js). The founding annual is an App Store
 * group of its own and Apple bills each group separately, so it is never bought on top: the paywall says so and
 * opens the store's own screen to cancel the regular one; the founding price is offered once that has ended.
 * Returns { renews, periodEnd } or null.
 */
export function foundingSwitch(status) {
  const h = status && status.founding && status.founding.held_on_regular_plan;
  if (!h || typeof h !== "object") return null;
  return { renews: h.renews !== false, periodEnd: typeof h.period_end === "string" ? h.period_end : null };
}

