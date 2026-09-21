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
//   anything else                -> "free"
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
 * The client-facing plan for a profiles row: "beta_founder" | "premium" | "trial" | "free".
 * @param {object|null} profile row with plan, trial_started_at, trial_ends_at, founder_flag
 * @param {number|Date} [now]
 */
export function derivePlan(profile, now = Date.now()) {
  if (!profile) return "free";
  if (profile.founder_flag) return "beta_founder";
  const plan = profile.plan;
  if (plan === "plus" || plan === "pro") return "premium";
  if (plan === "trial") {
    const ends = trialEndsAtMs(profile);
    const t = now instanceof Date ? now.getTime() : now;
    if (ends !== null && t < ends) return "trial";
  }
  return "free";
}

/** Whether this row gets unlimited coaching. The server asks the same question of its own copy. */
export function isUnlimitedProfile(profile, now = Date.now()) {
  const p = derivePlan(profile, now);
  return p === "beta_founder" || p === "premium" || p === "trial";
}
