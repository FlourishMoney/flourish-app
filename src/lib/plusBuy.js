// src/lib/plusBuy.js
// -----------------------------------------------------------------------------
// BUYING THE FLOURISH PLUS ADD-ON (2026-11-20, 1.1.8). Behind PLUS_ENABLED on the server: while it is off the server
// answers 404 to plus_status and nothing here shows, offers or sells anything.
//
// WHERE IT IS SOLD
//   the website        Stripe Checkout, opened by the server (billing.js plus_checkout); Manage is Stripe's portal
//                      (plus_portal). $4.99 a month or $49.99 a year, CAD plus tax (lib/pricing.js).
//   iPhone, Android    the store's own purchase, through RevenueCat: the offering PLUS_OFFERING_ID holds the two add-on
//                      products and nothing else. The price shown is the store's own price string. A store app never
//                      names the website, never links to it and never shows the website's price.
//   a store build that does not sell (VITE_IAP_ENABLED off)   no offer at all.
//
// THE SERVER DECIDES, NOT THE STORE SDK AND NOT THIS FILE. Plus is whatever plus_status says. After a store purchase
// the app asks the server to look (plus_store_sync) and waits for its yes; after Stripe, the webhook writes the row
// and the app only reads it. A return URL sets nothing.
//
// THE PRODUCTS MAY NOT EXIST YET. Until Amanda creates them (docs/ops/PLUS-ADDON-CONSOLES.md) the stores and Stripe
// have nothing to sell. Every such answer (no offering, no package, RevenueCat's "product not available" or
// "configuration" error, the server's price_not_configured or 404) is one calm outcome, "not_available": nothing is
// charged, nothing throws, and the screen says so in one line.
//
// WORDS. New lines are placeholders (lib/netWorthWords.js, plus-buy-*; drafts in docs/review/PLUS-BUY-COPY.md). The
// rest are approved lines reused exactly as they are: the store disclosure, "Restore purchases", "Terms of Use",
// "Privacy Policy", "Close", "Check again", the plan names and price pattern (lib/storeOffer.js), "CAD plus tax" and
// "Go to secure checkout" (the website's plans).
// -----------------------------------------------------------------------------
import { netWorthWords } from "./netWorthWords.js";
import { PAYWALL_COPY, offerCopy } from "./storeOffer.js";
import { attemptFor } from "./storeBilling.js";
import { HOUSEHOLD_WORDS } from "./householdWords.js";
import { UPGRADE_COPY } from "./upgradeFlow.js";
import { PLUS_ADDON_PRICING, formatPrice } from "./pricing.js";

// The add-on's own ids. NEVER the main plan's (app.flourishmoney.plus.*, flourish_plus, entitlement "plus").
// tests/plusBuy.test.cjs holds this table to the server's (netlify/functions/_lib/plusAddon.js PLUS_PRODUCTS).
export const PLUS_ADDON_ENTITLEMENT_ID = "plus_addon";
export const PLUS_OFFERING_ID = "plus_addon";
export const PLUS_PRODUCT_IDS = Object.freeze({
  ios: Object.freeze({ plus_monthly: "app.flourishmoney.plusaddon.monthly", plus_annual: "app.flourishmoney.plusaddon.annual" }),
  android: Object.freeze({ plus_monthly: "flourish_plus_addon:monthly", plus_annual: "flourish_plus_addon:annual" }),
});
export const PLUS_PLAN_KEYS = Object.freeze(["plus_monthly", "plus_annual"]);
// The household's fair use limit of bank connections with Plus, for the line that states it (the server enforces
// its own: netlify/functions/_lib/bankLimits.js PLUS_HOUSEHOLD_FAIR_USE; the test holds the two together).
export const PLUS_HOUSEHOLD_BANKS = 10;

export function plusPlanForProduct(productId) {
  for (const ids of Object.values(PLUS_PRODUCT_IDS)) {
    for (const [plan, id] of Object.entries(ids)) if (id === productId) return plan;
  }
  return null;
}

/**
 * The add-on's packages from RevenueCat's offerings: { plus_monthly, plus_annual }, either may be null. Only the
 * add-on's own offering is read, and only its own product ids count: the main plan's products can never be shown
 * or sold as Plus, whatever RevenueCat marks as the current offering.
 */
export function choosePlusPackages(offerings) {
  const o = offerings && offerings.all && offerings.all[PLUS_OFFERING_ID];
  const pkgs = o && Array.isArray(o.availablePackages) ? o.availablePackages : [];
  const byPlan = (plan) => pkgs.find((p) => plusPlanForProduct(p && p.product && p.product.identifier) === plan) || null;
  return { plus_monthly: byPlan("plus_monthly"), plus_annual: byPlan("plus_annual") };
}

const errorCode = (e) => (e && e.code != null ? String(e.code) : "");
const CANCELLED = "1";            // PURCHASE_CANCELLED_ERROR
const NOT_AVAILABLE = ["5", "23"]; // PRODUCT_NOT_AVAILABLE_FOR_PURCHASE_ERROR, CONFIGURATION_ERROR (no product in the store)
const PENDING = "20";             // PAYMENT_PENDING_ERROR (Ask to Buy, a slow payment)
const sleepFor = (ms) => new Promise((r) => setTimeout(r, ms));

// ONE PLUS PURCHASE AT A TIME (server: billing.js plus_store_hold, migration 0052), as the main plan's store_hold.
// Each purchase is one ATTEMPT with an id of its own. Just before the store's sheet opens the server is asked to hold
// this person, and their household, for that attempt: only { held: true } opens the sheet. The app never ENDS a hold:
// a cancelled or failed sheet tells the server nothing, and its hold lapses on its own (32 minutes). So one attempt id
// is kept across taps (lib/storeBilling.js attemptFor, 20 minutes): a tap after a closed sheet is the same attempt
// again, and the person is not kept waiting on their own hold. A confirmed purchase starts afresh.
export const PLUS_ATTEMPT = { current: null };
const newPlusAttemptId = () => {
  try { if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") return `plus-${globalThis.crypto.randomUUID()}`; } catch { /* fall through */ }
  return `plus-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
};

/**
 * What the store has to sell: { state: "ready", packages } | { state: "not_available" } | { state: "store_unavailable" }.
 * Never throws. No offering, an empty one, or RevenueCat saying the products are not there: "not_available".
 */
export async function loadPlusPackages(purchases) {
  if (!purchases || typeof purchases.getOfferings !== "function") return { state: "store_unavailable" };
  let offerings = null;
  try { offerings = await purchases.getOfferings(); }
  catch (e) { return { state: NOT_AVAILABLE.includes(errorCode(e)) ? "not_available" : "store_unavailable" }; }
  const packages = choosePlusPackages(offerings);
  if (!packages.plus_monthly && !packages.plus_annual) return { state: "not_available" };
  return { state: "ready", packages };
}

// ── what the screen may show ─────────────────────────────────────────────────────────────────────
/**
 * From the server's plus_status answer ({ status, body }, null for no answer, undefined for not asked yet):
 *   { mode, line, manage }
 *   mode "hidden"       nothing about buying Plus: not asked yet, PLUS_ENABLED off (404), an answer that makes no
 *                       sense, or a store build that does not sell and a household without Plus
 *   mode "unavailable"  the plan could not be read (no answer, 503): one plain line, never an offer, never "no Plus"
 *   mode "offer"        no Plus in the household: the purchase screen
 *   mode "have"         the household has Plus. manage:
 *                         "portal"  bought on the website, seen on the website: Stripe's portal
 *                         "store"   bought in this phone's own store: the store's own subscriptions screen
 *                         null      nothing to open here; `note` then says where it is managed, when there is
 *                                   somewhere (a partner's Plus and complimentary Plus have none)
 * platform: "web" | "ios" | "android". selling: this build can sell (the website, or a store build with purchases on).
 */
export function plusScreenView(res, { platform = "web", selling = false } = {}) {
  const hidden = { mode: "hidden", line: null, manage: null, note: null };
  if (res === undefined) return hidden;
  if (res === null || (res && res.status === 503)) return { mode: "unavailable", line: netWorthWords("plus-status-unavailable"), manage: null, note: null };
  const b = res && res.body;
  if (!res || res.status !== 200 || !b || b.enabled !== true || typeof b.plus !== "boolean") return hidden;
  if (b.plus === true) {
    if (b.covered_by) return { mode: "have", line: netWorthWords("plus-buy-have-partner"), manage: null, note: null };
    const have = { mode: "have", line: netWorthWords("plus-buy-have"), manage: null, note: null };
    const web = platform === "web";
    if (b.manage === "stripe") return web ? { ...have, manage: "portal" } : { ...have, note: netWorthWords("plus-buy-manage-elsewhere") };
    if (b.manage === "app_store") return web ? { ...have, note: netWorthWords("plus-buy-manage-app-store") } : platform === "ios" && selling ? { ...have, manage: "store" } : { ...have, note: netWorthWords("plus-buy-manage-elsewhere") };
    if (b.manage === "play_store") return web ? { ...have, note: netWorthWords("plus-buy-manage-play") } : platform === "android" ? { ...have, manage: "store" } : { ...have, note: netWorthWords("plus-buy-manage-elsewhere") };
    return have;
  }
  if (b.covered_by) return hidden;
  return selling ? { mode: "offer", line: netWorthWords("plus-buy-lead"), manage: null, note: null } : hidden;
}

/** What flourish Plus includes, in the screen's order. */
export function plusIncludes() {
  return [
    netWorthWords("plus-buy-includes-networth"),
    netWorthWords("plus-buy-includes-investments"),
    netWorthWords("plus-buy-includes-banks", { limit: PLUS_HOUSEHOLD_BANKS }),
  ];
}

/** The website's two plans: the price is ours (lib/pricing.js), in CAD, plus tax. Never rendered in a store app. */
export function plusWebCards() {
  const p = PLUS_ADDON_PRICING.CA;
  return [
    { planKey: "plus_monthly", name: "Monthly", price: `${formatPrice(p.monthly)} a month`, note: `${p.currency} plus tax`, button: UPGRADE_COPY.reviewConfirm },
    { planKey: "plus_annual", name: "Annual", price: `${formatPrice(p.annual)} a year`, note: `${p.currency} plus tax`, button: UPGRADE_COPY.reviewConfirm },
  ];
}

/** The store's plans: the store's own price string, and the approved pattern for the name, price and button. */
export function plusStoreCards(packages, platform = "ios") {
  const cards = [];
  for (const [planKey, plan] of [["plus_monthly", "monthly"], ["plus_annual", "annual"]]) {
    const pkg = packages && packages[planKey];
    const copy = pkg && pkg.product ? offerCopy({ plan, priceString: pkg.product.priceString, platform }) : null;
    if (copy) cards.push({ planKey, pkg, name: copy.name, price: copy.price, note: null, button: copy.button });
  }
  return cards;
}

// ── the store's purchase ─────────────────────────────────────────────────────────────────────────
const said = (r) => (r && r.status === 200 && r.body && r.body.enabled === true && typeof r.body.plus === "boolean" ? r.body : null);

/**
 * Wait for the server's yes. deps.serverSync() asks it to look at RevenueCat again (plus_store_sync) and returns
 * { status, body } or null. Resolves { outcome: "plus" | "charged_twice" | "unconfirmed", answer }.
 */
export async function confirmPlusWithServer(deps, { tries = 5, delayMs = 1500 } = {}) {
  const sleep = deps.sleep || sleepFor;
  for (let i = 0; i < tries; i++) {
    if (i > 0) await sleep(delayMs);
    let r = null;
    try { r = await deps.serverSync(); } catch { r = null; }
    const b = said(r);
    if (b && b.conflict === true) return { outcome: "charged_twice", answer: r };
    if (b && b.plus === true) return { outcome: "plus", answer: r };
  }
  return { outcome: "unconfirmed", answer: null };
}

/**
 * One purchase in the store, start to finish. Resolves { outcome, answer? }:
 *   plus                the server confirms flourish Plus
 *   already_plus        the household already has it: nothing was sold
 *   not_available       the store has no such product yet: nothing was sold
 *   status_unavailable  the server could not say whether the household has Plus: nothing is sold on a guess
 *   cancelled           the person closed the store's sheet
 *   pending             the store is waiting (Ask to Buy, a slow payment)
 *   failed              the store refused it
 *   unconfirmed         the store took it; the server has not confirmed yet ("Check again", Restore purchases)
 *   charged_twice       the store took it although this person's Plus was already live on the website
 *   in_progress_mine    another Plus purchase this person started is not finished: nothing is sold
 *   in_progress_partner the other member of the household is buying Plus right now: nothing is sold
 * deps: serverStatus(), serverHold(attemptId, state?), purchasePackage(pkg), serverSync(), sleep(ms), and optionally
 *       attempt (a { current } holder), newAttemptId(), now()
 */
export async function buyPlusInStore(deps, pkg) {
  let status = null;
  try { status = await deps.serverStatus(); } catch { status = null; }
  const b = said(status);
  if (!b) return { outcome: "status_unavailable" };
  if (b.plus === true) return { outcome: "already_plus", answer: status };
  if (!pkg) return { outcome: "not_available" };
  // The hold. No answer, or one that makes no sense, is not a yes: the sheet opens only on { held: true }.
  if (typeof deps.serverHold !== "function") return { outcome: "status_unavailable" };
  const holder = deps.attempt || PLUS_ATTEMPT;
  const attempt = attemptFor(holder, deps.now ? deps.now() : Date.now(), deps.newAttemptId || newPlusAttemptId);
  let hold = null;
  try { hold = await deps.serverHold(attempt); } catch { hold = null; }
  const h = hold && hold.status === 200 && hold.body && typeof hold.body.held === "boolean" ? hold.body : null;
  if (!h) return { outcome: "status_unavailable" };
  if (!h.held) return h.plus === true ? { outcome: "already_plus" } : { outcome: h.mine === true ? "in_progress_mine" : "in_progress_partner" };
  // "Pending", told to the server for this attempt (it then lasts its 7 days); never holds up what the person sees.
  const tellPending = async () => {
    for (let i = 0; i < 3; i++) { try { const r = await deps.serverHold(attempt, "pending"); if (r && r.status === 200 && r.body && r.body.pending === true) return; } catch { /* try again */ } }
  };
  try {
    await deps.purchasePackage(pkg);
  } catch (e) {
    const code = errorCode(e);
    if (code === CANCELLED || (e && e.userCancelled === true)) return { outcome: "cancelled" };
    if (code === PENDING) { await tellPending(); return { outcome: "pending" }; }
    if (NOT_AVAILABLE.includes(code)) return { outcome: "not_available" };
    return { outcome: "failed" };
  }
  const done = await confirmPlusWithServer(deps);
  if (done.outcome === "plus") holder.current = null;
  return done;
}

/** Restore: the store re-reports this Apple or Google account's purchases, then the server is asked. */
export async function restorePlus(deps) {
  try { await deps.restorePurchases(); } catch { return { outcome: "failed" }; }
  const r = await confirmPlusWithServer(deps, { tries: 2 });
  return r.outcome === "unconfirmed" ? { outcome: "nothing_to_restore" } : r;
}

// ── the website ──────────────────────────────────────────────────────────────────────────────────
const stripeUrl = (u) => (typeof u === "string" && /^https:\/\/[a-z0-9.-]+\.stripe\.com\//i.test(u) ? u : null);

/**
 * Ask the server for a Stripe Checkout for Plus. deps.ask(action, params) returns { status, body } or null.
 * Resolves { outcome: "redirect", url } or { outcome: "already_plus" | "not_available" | "status_unavailable" | "web_failed"
 * | "in_progress_mine" | "in_progress_partner" } (the last two: another Plus purchase is open in this household).
 * A url that is not Stripe's own is never followed.
 */
export async function startPlusCheckout(deps, planKey) {
  if (!PLUS_PLAN_KEYS.includes(planKey)) return { outcome: "not_available" };
  let r = null;
  try { r = await deps.ask("plus_checkout", { plan_key: planKey }); } catch { r = null; }
  if (!r) return { outcome: "web_failed" };
  const err = r.body && r.body.error;
  if (r.status === 200) { const url = stripeUrl(r.body && r.body.url); return url ? { outcome: "redirect", url } : { outcome: "web_failed" }; }
  if (r.status === 409 && err === "already_plus") return { outcome: "already_plus" };
  if (r.status === 409 && err === "purchase_in_progress") return { outcome: r.body.mine === true ? "in_progress_mine" : "in_progress_partner" };
  if (r.status === 404 || err === "price_not_configured" || err === "unknown_plan") return { outcome: "not_available" };
  if (r.status === 503 && err === "status_unavailable") return { outcome: "status_unavailable" };
  return { outcome: "web_failed" };
}

/** Stripe's portal for this person's own Plus (cancel, card). { outcome: "redirect", url } or { outcome: "web_failed" }. */
export async function openPlusPortal(deps) {
  let r = null;
  try { r = await deps.ask("plus_portal", {}); } catch { r = null; }
  const url = r && r.status === 200 ? stripeUrl(r.body && r.body.url) : null;
  return url ? { outcome: "redirect", url } : { outcome: "web_failed" };
}

/**
 * Back from Stripe after paying: the webhook writes the row, so the server is asked a few times. deps.serverStatus().
 * Resolves { outcome: "plus", answer } or { outcome: "started" } (not confirmed yet: the screen says it will show).
 */
export async function confirmPlusOnWeb(deps, { tries = 6, delayMs = 2000 } = {}) {
  const sleep = deps.sleep || sleepFor;
  for (let i = 0; i < tries; i++) {
    if (i > 0) await sleep(delayMs);
    let r = null;
    try { r = await deps.serverStatus(); } catch { r = null; }
    const b = said(r);
    if (b && b.plus === true) return { outcome: "plus", answer: r };
  }
  return { outcome: "started" };
}

// Coming back from Stripe. THIS SETS NOTHING: a return URL is one anyone can type. It only opens the screen and has
// the server asked again.
export const PLUS_RETURN_PARAMS = Object.freeze(["plus", "session_id"]);
export function plusReturnNotice(search) {
  let v = null;
  try { v = new URLSearchParams(String(search || "")).get("plus"); } catch { v = null; }
  return v === "success" || v === "cancelled" || v === "portal_return" ? v : null;
}

// ── the one line for each outcome (null: nothing to say) ──────────────────────────────────────────────────
export function plusOutcomeLine(outcome) {
  switch (outcome) {
    case "already_plus": return netWorthWords("plus-buy-already");
    case "not_available": return netWorthWords("plus-buy-not-available");
    case "status_unavailable": return netWorthWords("plus-status-unavailable");
    case "pending": return netWorthWords("plus-buy-pending");
    case "charged_twice": return netWorthWords("plus-buy-charged-twice");
    case "web_failed": return netWorthWords("plus-buy-web-failed");
    case "started": return netWorthWords("plus-buy-started");
    case "web_cancelled": return netWorthWords("plus-buy-web-cancelled");
    // Approved 2026-10-29 for couple mode (lib/householdWords.js), reused exactly: a purchase is already open.
    case "in_progress_mine": return HOUSEHOLD_WORDS.errors.purchase_in_progress;
    case "in_progress_partner": return HOUSEHOLD_WORDS.errors.partner_purchase_in_progress;
    // Approved 2026-10-20 for the store paywall, reused exactly: each is true of any store purchase.
    case "failed": return PAYWALL_COPY.outcomes.failed;
    case "unconfirmed": return PAYWALL_COPY.outcomes.unconfirmed;
    case "nothing_to_restore": return PAYWALL_COPY.outcomes.nothing_to_restore;
    case "store_unavailable": return PAYWALL_COPY.storeUnavailable;
    default: return null;   // plus, cancelled, portal_return: nothing to say
  }
}
