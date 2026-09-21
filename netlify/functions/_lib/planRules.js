// netlify/functions/_lib/planRules.js
// -----------------------------------------------------------------------------
// The SERVER's copy of the rule that turns a profiles row into an entitlement.
//
// It is a copy, and that is deliberate: a Netlify function is CommonJS and bundled on its own, so
// it cannot import the client's ESM src/lib/planFromProfile.js without depending on how the
// bundler resolves a cross-tree dynamic import. Two small files are safer than one clever one.
//
// The tripwire that makes the duplication safe: tests/planParity.test.cjs runs THIS file and the
// client's over the same matrix of rows and times, and fails if they ever disagree. Change one,
// change the other, or the gate stops you.
//
// THE RULE, in order:
//   founder_flag true            -> unlimited
//   plan "plus" or "pro"         -> unlimited
//   plan "trial", not yet ended  -> unlimited
//   anything else                -> free
//
// When a trial ends: trial_ends_at if the row has one, otherwise trial_started_at + 14 days (rows
// created before migration 0007 have no trial_ends_at, and their trials must not move). A row on
// plan "trial" with no dates at all is not on trial.
// -----------------------------------------------------------------------------

"use strict";

const TRIAL_DAYS = 14;
const TRIAL_MS = TRIAL_DAYS * 86400000;

function _time(v) {
  if (!v) return null;
  const t = v instanceof Date ? v.getTime() : Date.parse(v);
  return Number.isFinite(t) ? t : null;
}

function trialEndsAtMs(profile) {
  if (!profile) return null;
  const explicit = _time(profile.trial_ends_at);
  if (explicit !== null) return explicit;
  const started = _time(profile.trial_started_at);
  return started === null ? null : started + TRIAL_MS;
}

// "beta_founder" | "premium" | "trial" | "free" — the same four answers the client derives.
function derivePlan(profile, now = Date.now()) {
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

function isUnlimitedProfile(profile, now = Date.now()) {
  const p = derivePlan(profile, now);
  return p === "beta_founder" || p === "premium" || p === "trial";
}

module.exports = { TRIAL_DAYS, TRIAL_MS, trialEndsAtMs, derivePlan, isUnlimitedProfile };
