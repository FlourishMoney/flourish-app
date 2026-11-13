// src/lib/trialPlanFirst.js
// -----------------------------------------------------------------------------
// TRIAL_PLAN_FIRST (Amanda, 2026-11-10): the usual app-store trial. A new person picks a plan on day one with Apple,
// Google or Stripe, gets 14 days free there, and is charged automatically unless they cancel. Off by default; the
// server decides (netlify/functions/_lib/trialPlanFirst.js) and says so in its billing status calls, so the store
// builds follow the switch with no new upload. With it off the server sends no trial_plan_first key, and every
// answer here is today's exactly.
//
// PURE, except the small device cache (a storage object is passed in).
// -----------------------------------------------------------------------------

/** The server's trial_plan_first answer when the switch is on, or null (off, no answer, or a shape not known). */
export function trialPlanFirstOf(status) {
  const t = status && typeof status === "object" ? status.trial_plan_first : null;
  return t && typeof t === "object" && t.on === true ? t : null;
}

/** Does this account keep the 14-day account trial? Only an explicit false from the server takes it away. */
export function accountTrialFrom(status) {
  const t = trialPlanFirstOf(status);
  return t ? t.account_trial !== false : true;
}

// THE DEVICE CACHE of that one answer, per account, so the plan read at sign-in (before the status call answers) is
// already right on a device that has heard it once. A status answer with the switch off clears it.
const KEY = (uid) => `flourish_tpf_account_trial_${uid}`;
export function rememberAccountTrial(storage, uid, status) {
  if (!storage || !uid || !status) return;
  try {
    const t = trialPlanFirstOf(status);
    if (t && t.account_trial === false) storage.setItem(KEY(uid), "false");
    else storage.removeItem(KEY(uid));
  } catch { /* storage refused: the status call's own answer still applies */ }
}
export function recalledAccountTrial(storage, uid) {
  if (!storage || !uid) return true;
  try { return storage.getItem(KEY(uid)) !== "false"; } catch { return true; }
}

// ── ITEM 1: THE PLANS SCREEN FIRST ────────────────────────────────────────────────────────────────
// WHICH ACCOUNTS SEE IT, AND HOW (only while the switch is on; null means today's app, unchanged):
//   "required"    a new account (no account trial) with no plan, no partner's cover, not a founder and no
//                 complimentary access: after the first safe-to-spend number, the plans screen comes before the rest
//                 of the app, and cannot be closed (only "Sign out", and Restore purchases in a store app).
//   "offer_once"  an account whose own account trial has ended and who has no plan: the new plans screen opens once
//                 on this device, and can be closed. Nothing they already have is taken away (item 2).
// canSell: the screen can actually sell here (the website with billing on; a store build that sells). Where it
// cannot, nobody is held at a screen with nothing to buy.
export function plansFirstStage({ tpf, paid = false, coveredBy = null, profilePlan = null, demo = false, canSell = false, pendingInvite = false } = {}) {
  if (!tpf || tpf.on !== true || demo || !canSell) return null;
  // A partner's invite waiting to be accepted (couple mode): never held at the plans; once joined, the partner's plan covers.
  if (pendingInvite) return null;
  if (paid === true || coveredBy) return null;
  if (profilePlan === "beta_founder" || profilePlan === "premium") return null;
  if (tpf.account_trial === false) return "required";
  if (profilePlan === "free") return "offer_once";
  return null;   // inside the account trial: unchanged, the plans open when asked (item 2)
}

// "offer_once": shown once per account on this device. Signing out keeps it (App.jsx signOut): the same account.
export const PLANS_OFFERED_PREFIX = "flourish_tpf_plans_offered_";
const OFFER_KEY = (uid) => `${PLANS_OFFERED_PREFIX}${uid}`;
export function plansOfferedBefore(storage, uid) {
  try { return !!storage && !!uid && storage.getItem(OFFER_KEY(uid)) === "1"; } catch { return true; }
}
export function notePlansOffered(storage, uid) {
  try { if (storage && uid) storage.setItem(OFFER_KEY(uid), "1"); } catch { /* the screen may open once more */ }
}

// "required" survives a status call that fails: once the server has said this account must choose, the screen stays
// until an answer says it has a plan (a blip on the network never lets the rest of the app open, and never closes it).
const REQ_KEY = (uid) => `flourish_tpf_required_${uid}`;
export function rememberRequired(storage, uid, required) {
  try { if (!storage || !uid) return; if (required) storage.setItem(REQ_KEY(uid), "1"); else storage.removeItem(REQ_KEY(uid)); } catch { /* fine */ }
}
export function recalledRequired(storage, uid) {
  try { return !!storage && !!uid && storage.getItem(REQ_KEY(uid)) === "1"; } catch { return false; }
}

// ── THE DISCLOSURE, above each plan's button ──────────────────────────────────────────────────────
export const TRIAL_DAYS_FIRST = 14;
/** The first charge: 14 days from now (Stripe trial_period_days 14; Apple's and Google's 2-week free trial). */
export function firstChargeAt(now = Date.now(), days = TRIAL_DAYS_FIRST) {
  const t = now instanceof Date ? now.getTime() : now;
  return new Date(t + days * 86400000);
}
/** "November 24, 2026", in the person's own time zone (the day the trial ends where they are). */
export function chargeDateLabel(date) {
  return date.toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric" });
}
// THE DATES THE SCREEN STATES, never later than the store can act (review round, 2026-11-10). Apple may charge up to
// 24 hours before a period ends, and a cancellation in those 24 hours still renews: on an iPhone the first charge is
// stated as the day 24 hours before the trial ends. Everywhere, "cancel before" is that same day: cancelling before it
// is always in time (Stripe and Google Play charge at the end itself, so this is a day of margin there).
export function trialDates(platform, now = Date.now()) {
  const end = firstChargeAt(now);
  const dayBefore = new Date(end.getTime() - 86400000);
  return { charge: platform === "ios" ? dayBefore : end, cancelBy: dayBefore };
}
export const periodOfPlan = (planKey) => (planKey === "monthly" ? "month" : (planKey === "annual" || planKey === "founding_annual") ? "year" : null);

/**
 * The lines above one plan's button, in order. platform: "ios" | "android" | "web". eligible: the store (RevenueCat)
 * or the server (Stripe) says this person gets the 14 days. price: the full price and how often, as the plan card
 * already shows it ("$11.99 a month": pricing.js on the website, the store's own price string in the apps).
 * words: the words function (lib/trialWords.js trialWords), passed in so this stays pure.
 *   eligible:     14 days free; then the price and how often; the first charge's date; cancel before it and nothing
 *                 is charged; how to cancel on this platform.
 *   not eligible: the price, charged now, and how to cancel. No trial claim of any kind.
 */
export function trialDisclosure({ platform, eligible, price, planKey, now = Date.now(), words }) {
  if (!periodOfPlan(planKey) || !price || typeof words !== "function") return null;
  const cancel = words(platform === "ios" ? "trialfirst-cancel-ios" : platform === "android" ? "trialfirst-cancel-android" : "trialfirst-cancel-web");
  if (!eligible) return { claim: false, lines: [words("trialfirst-no-trial", { price }), cancel] };
  const { charge, cancelBy } = trialDates(platform, now);
  return {
    claim: true,
    lines: [
      words("trialfirst-free-days"),
      words("trialfirst-then", { price }),
      words("trialfirst-first-charge", { date: chargeDateLabel(charge) }),
      words("trialfirst-cancel-before", { date: chargeDateLabel(cancelBy) }),
      cancel,
    ],
  };
}

// ── THE STORES' OWN ANSWER ON ELIGIBILITY ─────────────────────────────────────────────────────────
// iPhone: RevenueCat's checkTrialOrIntroductoryPriceEligibility must say ELIGIBLE (2) for the product, and the product
// must carry a free introductory offer of exactly 2 weeks (14 days). UNKNOWN (0), INELIGIBLE (1) or no intro offer (3):
// no trial claim (RevenueCat: "The best course of action on unknown status is to display the non-intro pricing").
// Android: Play's subscription options hold only the offers this person is eligible for, and the purchase applies the
// default option; so the claim is made only when that default option has a free phase of exactly 14 days.
export const INTRO_ELIGIBLE = 2;
const fourteenDays = (unit, n) => {
  const u = String(unit || "").toUpperCase();
  return (u === "DAY" && n === 14) || (u === "WEEK" && n === 2);
};
const isoFourteenDays = (iso) => iso === "P2W" || iso === "P14D";
export function storeTrialEligible({ platform, product, eligibility }) {
  if (!product) return false;
  if (platform === "ios") {
    const e = eligibility && eligibility[product.identifier];
    const intro = product.introPrice;
    return !!e && e.status === INTRO_ELIGIBLE && !!intro && intro.price === 0
      && fourteenDays(intro.periodUnit, (intro.periodNumberOfUnits || 0) * (intro.cycles || 1));
  }
  if (platform === "android") {
    const free = product.defaultOption && product.defaultOption.freePhase;
    return !!free && !!free.billingPeriod && isoFourteenDays(free.billingPeriod.iso8601)
      && (free.billingCycleCount == null || free.billingCycleCount === 1);
  }
  return false;
}

// ANDROID BUYS THE OPTION THE SCREEN SHOWED. Play applies a product's default option, which is its free trial when one
// exists and the person is eligible. Where the screen made no trial claim (the switch off, or the claim not made), the
// base plan is bought by name, so nobody is put on a trial, or a price, they were not shown. With no offer in Play
// Console (today) the base plan is the default option, so this changes nothing. null: buy the package as it is.
export function androidPurchaseOption(product, claimed) {
  if (claimed || !product || !Array.isArray(product.subscriptionOptions)) return null;
  return product.subscriptionOptions.find((o) => o && o.isBasePlan) || null;
}

// ── ITEM 5: BEFORE SIGN-IN ────────────────────────────────────────────────────────────────────────
// The landing and the first onboarding screen must not say "no card" once a card is needed. They ask the server
// (GET /api/trial-plan-first): true (200), false (404, the switch off), or null when there is no answer, which keeps
// today's line (the switch off is by far the likely case, and nothing else changes on a failed call).
export async function askTrialPlanFirstOn(fetchImpl, base = "") {
  const a = await askTrialPlanFirst(fetchImpl, base);
  return a === false ? false : a ? true : null;
}
// The same answer with the switch's time: { on: true, since } (since: a full ISO time, or null if the server sent none),
// false (off), or null (no answer). The Terms' section 7 (lib/freePlan.js trialFirstTermsSection7) names its date.
export async function askTrialPlanFirst(fetchImpl, base = "") {
  try {
    const res = await fetchImpl(`${base}/api/trial-plan-first`, { method: "GET" });
    if (res.status === 404) return false;
    if (!res.ok) return null;
    const body = await res.json().catch(() => null);
    if (!body || body.on !== true) return null;
    const since = typeof body.since === "string" && Number.isFinite(Date.parse(body.since)) ? body.since : null;
    return { on: true, since };
  } catch { return null; }
}

// THE CHIP'S DATE (reviewers' check, 2026-11-10): the expected first charge from the store's or Stripe's own trial end
// (the server's trial_ends: RevenueCat's expiry, or Stripe's trial_end), never an estimate. On an iPhone, the day before:
// Apple may charge up to 24 hours before the trial ends (as the plans screen and the reminder email state it).
export function chipChargeDate(platform, trialEndsIso) {
  const t = Date.parse(trialEndsIso || "");
  if (!Number.isFinite(t)) return null;
  return new Date(platform === "ios" ? t - 86400000 : t);
}

// WHERE THE TRIAL WAS BOUGHT decides that date, not the device it is read on (go-live review, 2026-11-13). The chip
// took the device's platform, so an iPhone trial read on the website or on Android stated the trial's end, a day after
// Apple may charge, and a website trial read on an iPhone stated the day before Stripe charges. provider is the
// server's own (billing.js status and store_status): "app_store" | "play_store" | "stripe". Not known: the earliest
// the charge could be (the day before), so the date stated is never later than the charge.
const PROVIDER_PLATFORM = Object.freeze({ app_store: "ios", play_store: "android", stripe: "web" });
export function chipChargeDateFor(provider, trialEndsIso) {
  return chipChargeDate(PROVIDER_PLATFORM[provider] || "ios", trialEndsIso);
}
