// src/lib/planFromProfile.js
// -----------------------------------------------------------------------------
// ONE RULE for turning a profiles row into what the user may do.
//
// The server profile is the authority (decision P13). Before this, the client read the row and
// derived the answer inline in App.jsx, the server derived its own answer in
// netlify/functions/_lib/auth.js, and localStorage held a plan that could outlive both. Three
// places, three chances to disagree about whether someone is on trial.
//
// This module is the client's copy of the rule. The server keeps its own in
// netlify/functions/_lib/planRules.js, because a Netlify function is CommonJS and bundled
// separately; tests/planParity.test.cjs runs both over the same matrix and fails if they ever
// answer differently. That is deliberate duplication with a tripwire, not two owners.
//
// THE RULE, in order:
//   founder_flag true            -> "beta_founder"   (existing founders keep their status)
//   plan "plus" or "pro"         -> "premium"
//   plan "trial", not yet ended  -> "trial"
//   grace_ends_at not yet passed -> "grace"  (the 30 days from go-live of no free plan, migration 0029)
//   anything else                -> "free"   (since 2026-10-23: no plan at all)
//
// When a trial ends: trial_ends_at if the row has one, otherwise trial_started_at + 14 days. The
// fallback exists because rows created before migration 0007 have no trial_ends_at, and their
// trials must not move. A row on plan "trial" with no dates at all is NOT on trial: with nothing
// to say when it started, "free" is the answer that cannot over-grant.
//
// PURE. No storage, no network, no clock of its own: pass `now` in.
// -----------------------------------------------------------------------------

export const TRIAL_DAYS = 14;
export const TRIAL_MS = TRIAL_DAYS * 86400000;

const _time = (v) => {
  if (!v) return null;
  const t = v instanceof Date ? v.getTime() : Date.parse(v);
  return Number.isFinite(t) ? t : null;
};

/**
 * When this row's trial ends, in ms since epoch, or null if it has no trial dates at all.
 * trial_ends_at wins; otherwise trial_started_at + 14 days.
 */
export function trialEndsAtMs(profile) {
  if (!profile) return null;
  const explicit = _time(profile.trial_ends_at);
  if (explicit !== null) return explicit;
  const started = _time(profile.trial_started_at);
  return started === null ? null : started + TRIAL_MS;
}

/**
 * The client-facing plan for a profiles row: "beta_founder" | "premium" | "trial" | "grace" | "free".
 * @param {object|null} profile row with plan, trial_started_at, trial_ends_at, founder_flag
 * @param {number|Date} [now]
 */
export function derivePlan(profile, now = Date.now()) {
  if (!profile) return "free";
  if (profile.founder_flag) return "beta_founder";
  const plan = profile.plan;
  if (plan === "plus" || plan === "pro") return "premium";
  const t = now instanceof Date ? now.getTime() : now;
  if (plan === "trial") {
    const ends = trialEndsAtMs(profile);
    if (ends !== null && t < ends) return "trial";
  }
  // NO FREE PLAN (2026-10-23): an account already past its trial when that went live has every feature until its
  // grace_ends_at (migration 0029, go-live + 30 days). Never a founder's or a paid profile's answer (both above).
  const grace = _time(profile.grace_ends_at);
  if (grace !== null && t < grace) return "grace";
  return "free";
}

/** Whether this row gets unlimited coaching. The server asks the same question of its own copy. */
export function isUnlimitedProfile(profile, now = Date.now()) {
  const p = derivePlan(profile, now);
  return p === "beta_founder" || p === "premium" || p === "trial" || p === "grace";
}

const PLANS = ["beta_founder", "premium", "trial", "grace", "free"];

/** Whether a derived plan opens every feature: every plan but "free", which since 2026-10-23 is no plan at all. */
export function planEntitled(plan) {
  return plan === "beta_founder" || plan === "premium" || plan === "trial" || plan === "grace";
}

/**
 * THE WEB APP'S PLAN: the profile's, plus a paid subscription as the SERVER answers it.
 *
 * `profilePlan` is derivePlan()'s answer for the profiles row. `paid` is the billing status call's own
 * `paid` (netlify/functions/billing.js), which the server works out from Stripe's status and the paid
 * period (planRules.isPaidSubscription): the app never reads a subscription row itself. While billing is
 * off that call answers 404, so `paid` is false and this returns the profile's plan, exactly as before.
 *
 * Mirrors planRules.deriveEntitlement, and tests/webPaidPlan.test.cjs holds the two together:
 *   founder, trial, plus   unchanged: a payment only ever adds, so nobody loses trial days by paying early
 *   free, and paid         "premium"
 *   free, not paid         "free" (a cancelled subscription, once its paid period is over)
 * The same in a store app (founder's decision, 2026-10-20): a household paying on the web keeps full
 * access in the iOS and Android apps, which learn `paid` from the same status call (billing.js tells a
 * store app nothing else). There is no store-app argument, so no caller can give a store app its own rule.
 */
export function webPlan(profilePlan, { paid = false } = {}) {
  const p = PLANS.includes(profilePlan) ? profilePlan : "free";
  if (p === "grace" && paid === true) return "premium";   // as planRules.deriveEntitlement: paying ends the 30 days' notice
  if (p !== "free") return p;
  return paid === true ? "premium" : "free";
}

/**
 * A STORE APP THAT SELLS (version 1.1, in-app purchase, lib/storeBilling.js): the same rule as the web's
 * (founder's decisions, 2026-10-20). The profile's plan, plus a paid subscription from ANY provider as the server
 * answers it (billing.js store_status `paid`, from the same row and the same period-aware rule as the web's). The
 * 14-day account trial counts here exactly as on the web: it is the only trial, and no store product has a free
 * trial or an introductory offer. Mirrors planRules.deriveEntitlement; tests/storeBilling.test.cjs holds them together.
 */
export function storePlan(profilePlan, { paid = false } = {}) {
  return webPlan(profilePlan, { paid });
}
