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


// ── THE SUBSCRIPTION, from 2026-10-26 ────────────────────────────────────────────────────────────
// Everything above answers from the profiles row alone, and that stays true: it is the half the
// client also computes, and tests/planParity.test.cjs holds the two copies together. A subscription
// is server-only knowledge — the client has no row for it and must never be asked.
//
// WHICH STATUSES COUNT AS PAID. Stripe's own lifecycle has eight values; only these two mean the
// household currently has what it paid for:
const SUBSCRIPTION_PAID_STATUSES = Object.freeze(["active", "trialing"]);
//
// past_due is deliberately NOT here. It means a renewal charge failed and Stripe is retrying, and
// including it would be a product decision about a grace period that nobody has made yet — so the
// conservative reading applies until someone makes it: access follows a payment that succeeded.
// The day a grace period is decided, it is one entry in this array and a line in the report; the
// schema does not change, because 0009 stores Stripe's status verbatim and constrains nothing here.
//
// current_period_end is checked as well as status. An 'active' row whose period ended is a webhook
// we never received, and trusting status alone would hand out the product on a delivery failure.
function isPaidSubscription(sub, now = Date.now()) {
  if (!sub || !SUBSCRIPTION_PAID_STATUSES.includes(sub.status)) return false;
  const end = _time(sub.current_period_end);
  if (end === null) return true;               // no period on the row yet: status is all we have
  const t = now instanceof Date ? now.getTime() : now;
  return t < end;
}

// The whole entitlement answer: the profile rule above, plus the subscription.
//
// A paid subscription can only ADD. It never downgrades someone the profile already entitles —
// a founder stays a founder, and an unexpired trial stays a trial even after the card is charged,
// so nobody loses trial days by paying early.
function deriveEntitlement(profile, subscription, now = Date.now()) {
  const fromProfile = derivePlan(profile, now);
  if (fromProfile !== "free") {
    return { plan: fromProfile, unlimited: true, paidSubscription: isPaidSubscription(subscription, now) };
  }
  if (isPaidSubscription(subscription, now)) {
    return { plan: "premium", unlimited: true, paidSubscription: true };
  }
  return { plan: "free", unlimited: false, paidSubscription: false };
}

module.exports = {
  TRIAL_DAYS, TRIAL_MS, trialEndsAtMs, derivePlan, isUnlimitedProfile,
  SUBSCRIPTION_PAID_STATUSES, isPaidSubscription, deriveEntitlement,
};
