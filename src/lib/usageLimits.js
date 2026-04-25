// src/lib/usageLimits.js
// -----------------------------------------------------------------------------
// Flourish — Usage Limits & Plan Tier
// -----------------------------------------------------------------------------
// PURPOSE
//   Single source of truth for: (a) the user's current plan tier, and (b) the
//   per-day usage counters that gate free-tier features. Designed to be the
//   one place we connect Stripe / Supabase plan state when ready.
//
// PLAN TIERS
//   "free"          — default for new signups; daily caps apply
//   "premium"       — paid tier; no daily caps; saved scenarios; etc.
//   "beta_founder"  — grandfathered users (existing accounts before paywall);
//                     no daily caps; permanent (or until policy change).
//
// CURRENT FREE-TIER LIMITS
//   Coach messages: 5 per day
//   Simulations:    3 per day
//
// STORAGE
//   Plan tier:        localStorage key  "flourish_plan"
//   Coach counter:    localStorage key  "flourish_coach_usage"  (daily-resetting)
//   Simulator counter:localStorage key  "flourish_sim_usage"    (daily-resetting)
//
// KNOWN LIMITATION
//   localStorage is trivially bypassable (clear site data → counter resets).
//   For the current beta this is acceptable — we're validating willingness to
//   pay, not enforcing DRM. STRIPE_INTEGRATION_POINT comments below mark
//   where to swap localStorage for server-authoritative state later.
// -----------------------------------------------------------------------------

const PLAN_KEY        = "flourish_plan";
const COACH_USAGE_KEY = "flourish_coach_usage";
const SIM_USAGE_KEY   = "flourish_sim_usage";

export const FREE_TIER_LIMITS = {
  coachMessagesPerDay: 5,
  simulationsPerDay:   3,
};

// ── Plan tier ────────────────────────────────────────────────────────────────
// STRIPE_INTEGRATION_POINT: when Stripe is wired, getPlan() should resolve
// the plan from the server (Supabase row keyed by user) rather than localStorage.
// The function signature should remain the same so callers don't change.

export function getPlan() {
  try {
    const stored = localStorage.getItem(PLAN_KEY);
    if (stored === "premium" || stored === "beta_founder" || stored === "free") {
      return stored;
    }
  } catch {}
  return "free";
}

export function setPlan(plan) {
  if (plan !== "free" && plan !== "premium" && plan !== "beta_founder") {
    return false;
  }
  try { localStorage.setItem(PLAN_KEY, plan); } catch {}
  return true;
}

export function isPremiumOrFounder() {
  const p = getPlan();
  return p === "premium" || p === "beta_founder";
}

// ── Daily counters (internal) ────────────────────────────────────────────────
// Counter shape: { date: "YYYY-MM-DD", count: <number> }
// On read, if stored date != today, the counter is treated as 0.

function _todayStr() {
  const d = new Date();
  const y  = d.getFullYear();
  const m  = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function _readCounter(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return 0;
    const obj = JSON.parse(raw);
    if (obj && obj.date === _todayStr() && Number.isFinite(obj.count)) {
      return obj.count;
    }
  } catch {}
  return 0;
}

function _writeCounter(key, count) {
  try {
    localStorage.setItem(key, JSON.stringify({ date: _todayStr(), count }));
  } catch {}
}

// ── Coach message gate ───────────────────────────────────────────────────────
export function getCoachMessagesUsedToday() {
  return _readCounter(COACH_USAGE_KEY);
}

export function getCoachMessagesRemaining() {
  if (isPremiumOrFounder()) return Infinity;
  return Math.max(0, FREE_TIER_LIMITS.coachMessagesPerDay - getCoachMessagesUsedToday());
}

export function canUseCoach() {
  return getCoachMessagesRemaining() > 0;
}

export function recordCoachUse() {
  if (isPremiumOrFounder()) return; // don't bother counting for unlimited tiers
  _writeCounter(COACH_USAGE_KEY, getCoachMessagesUsedToday() + 1);
}

// ── Simulator gate ───────────────────────────────────────────────────────────
export function getSimulationsUsedToday() {
  return _readCounter(SIM_USAGE_KEY);
}

export function getSimulationsRemaining() {
  if (isPremiumOrFounder()) return Infinity;
  return Math.max(0, FREE_TIER_LIMITS.simulationsPerDay - getSimulationsUsedToday());
}

export function canRunSimulation() {
  return getSimulationsRemaining() > 0;
}

export function recordSimulationUse() {
  if (isPremiumOrFounder()) return;
  _writeCounter(SIM_USAGE_KEY, getSimulationsUsedToday() + 1);
}

// ── Beta founder grandfathering ──────────────────────────────────────────────
// Idempotent: safe to call on every app load. If the user is already on a
// non-free plan, nothing changes. If they're on "free" but had an account
// before the cutoff, they get upgraded to "beta_founder" once.
//
// "Had an account before" is detected via:
//   1. localStorage flag "flourish_account_existed_pre_paywall" set to "1"
//   2. OR: a pre-existing localStorage key from before this update
//      (we check for either "flourish_coach_msgs" or "flourish_coach_history"
//      — anyone who used the Coach before today has at least one of these set)
//
// STRIPE_INTEGRATION_POINT: once Stripe + Supabase plan rows are live, this
// grandfather check should run server-side at signup based on account creation
// date, not client-side via localStorage.

const PRE_PAYWALL_FLAG  = "flourish_account_existed_pre_paywall";
const LEGACY_COACH_KEY     = "flourish_coach_msgs";
const LEGACY_COACH_HISTORY = "flourish_coach_history";

export function applyGrandfatherIfEligible() {
  try {
    if (getPlan() !== "free") return false; // already on a non-free plan

    const hasPreFlag       = localStorage.getItem(PRE_PAYWALL_FLAG) === "1";
    const hasLegacyCoach   = localStorage.getItem(LEGACY_COACH_KEY) !== null;
    const hasLegacyHistory = localStorage.getItem(LEGACY_COACH_HISTORY) !== null;

    if (hasPreFlag || hasLegacyCoach || hasLegacyHistory) {
      setPlan("beta_founder");
      localStorage.setItem(PRE_PAYWALL_FLAG, "1"); // ensure flag persists
      return true;
    }
  } catch {}
  return false;
}

// Call once at app boot to mark fresh installs that happen AFTER paywall day —
// they will NOT get grandfathered. Safe to call repeatedly.
export function markAccountIfNew() {
  try {
    if (localStorage.getItem(PRE_PAYWALL_FLAG) === null) {
      // No flag yet. If we also see no legacy coach key, this is a brand-new
      // post-paywall user — set the flag to "0" so future grandfather checks
      // explicitly know this account did NOT pre-date the paywall.
      if (localStorage.getItem(LEGACY_COACH_KEY) === null &&
          localStorage.getItem(LEGACY_COACH_HISTORY) === null) {
        localStorage.setItem(PRE_PAYWALL_FLAG, "0");
      }
    }
  } catch {}
}

// ── Beta-code signup → beta_founder ──────────────────────────────────────────
// Called by the signup flow when a valid BETA_CODE is supplied. New beta-code
// signups also get founder status, permanently.
export function applyBetaCodeFounderUpgrade() {
  setPlan("beta_founder");
  try { localStorage.setItem(PRE_PAYWALL_FLAG, "1"); } catch {}
}

// -----------------------------------------------------------------------------
// END
// -----------------------------------------------------------------------------
