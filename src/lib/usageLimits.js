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
//   Coach messages: 2 per week (resets Monday 00:00 UTC)
//   Simulations:    1 per day
//
// STORAGE
//   Plan tier:        localStorage key  "flourish_plan"
//   Coach counter:    localStorage key  "flourish_coach_usage"  (weekly-resetting, Mon 00:00 UTC)
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
  coachMessagesPerWeek: 2,   // free tier — resets Monday 00:00 UTC (DECISIONS.md item 2)
  simulationsPerDay:   1,
};

// Phase D7: 14-day trial window for new signups (unlimited Coach + sim).
export const TRIAL_DURATION_DAYS = 14;

// ── Plan tier ────────────────────────────────────────────────────────────────
// STRIPE_INTEGRATION_POINT: when Stripe is wired, getPlan() should resolve
// the plan from the server (Supabase row keyed by user) rather than localStorage.
// The function signature should remain the same so callers don't change.

export function getPlan() {
  try {
    const stored = localStorage.getItem(PLAN_KEY);
    if (stored === "premium" || stored === "beta_founder" || stored === "free" || stored === "trial") {
      return stored;
    }
  } catch {}
  return "free";
}

export function setPlan(plan) {
  if (plan !== "free" && plan !== "premium" && plan !== "beta_founder" && plan !== "trial") {
    return false;
  }
  try { localStorage.setItem(PLAN_KEY, plan); } catch {}
  return true;
}

export function isPremiumOrFounder() {
  const p = getPlan();
  return p === "premium" || p === "beta_founder";
}

// ── Period counters (internal) ───────────────────────────────────────────────
// Counter shape: { period: "<key>", count: <number> }, where <key> is a day (sim) or the current
// week's Monday (coach). On read, if the stored period != the current one, the counter is 0.
// Legacy counters stored as { date } are still read, for backward compatibility.

function _todayStr() {
  // UTC day boundary — deterministic regardless of timezone; resets at 00:00 UTC.
  const d = new Date();
  const y  = d.getUTCFullYear();
  const m  = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

// The current week's fixed reset point: the most recent Monday at 00:00 UTC, as a YYYY-MM-DD key.
// Every day of the week maps to the same key, so the coach counter resets once a week on Monday.
export function _weekKey() {
  const d = new Date();
  const daysSinceMonday = (d.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - daysSinceMonday));
  const y  = monday.getUTCFullYear();
  const m  = String(monday.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(monday.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function _readCounter(key, period) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return 0;
    const obj = JSON.parse(raw);
    const stored = obj && (obj.period != null ? obj.period : obj.date); // accept legacy {date}
    if (obj && stored === period && Number.isFinite(obj.count)) return obj.count;
  } catch {}
  return 0;
}

function _writeCounter(key, period, count) {
  try {
    localStorage.setItem(key, JSON.stringify({ period, count }));
  } catch {}
}

// ── Coach message gate ───────────────────────────────────────────────────────
export function getCoachMessagesUsedThisWeek() {
  return _readCounter(COACH_USAGE_KEY, _weekKey());
}

export function getCoachMessagesRemaining() {
  if (isUnlimited()) return Infinity;
  return Math.max(0, FREE_TIER_LIMITS.coachMessagesPerWeek - getCoachMessagesUsedThisWeek());
}

export function canUseCoach() {
  return getCoachMessagesRemaining() > 0;
}

export function recordCoachUse() {
  if (isUnlimited()) return; // don't bother counting for unlimited tiers
  _writeCounter(COACH_USAGE_KEY, _weekKey(), getCoachMessagesUsedThisWeek() + 1);
}

// ── Simulator gate ───────────────────────────────────────────────────────────
export function getSimulationsUsedToday() {
  return _readCounter(SIM_USAGE_KEY, _todayStr());
}

export function getSimulationsRemaining() {
  if (isUnlimited()) return Infinity;
  return Math.max(0, FREE_TIER_LIMITS.simulationsPerDay - getSimulationsUsedToday());
}

export function canRunSimulation() {
  return getSimulationsRemaining() > 0;
}

export function recordSimulationUse() {
  if (isUnlimited()) return;
  _writeCounter(SIM_USAGE_KEY, _todayStr(), getSimulationsUsedToday() + 1);
}

// ── Beta founder grandfathering — DISABLED (Tier 1.5, 2026-06-06) ─────────────
// This previously auto-upgraded any "free" user to PERMANENT "beta_founder" when
// localStorage held flourish_account_existed_pre_paywall==="1", flourish_coach_msgs,
// or flourish_coach_history. Because the AI Coach writes flourish_coach_history on
// first use, effectively EVERY user who opened the Coach became unlimited once their
// trial expired — a 100% paywall bypass.
//
// applyGrandfatherIfEligible() is now a NO-OP. Genuine grandfathered testers will be
// re-flagged authoritatively by the planned server-side profiles/plan table
// (account-creation-date check) — the only trustworthy signal, since localStorage is
// client-controlled. This stops all new/repeat grandfathering; it does NOT strip a
// "beta_founder" value already in a user's localStorage (the server table reconciles
// those). The constants below remain — markAccountIfNew still uses them.

const PRE_PAYWALL_FLAG  = "flourish_account_existed_pre_paywall";
const LEGACY_COACH_KEY     = "flourish_coach_msgs";
const LEGACY_COACH_HISTORY = "flourish_coach_history";

export function applyGrandfatherIfEligible() {
  // Intentionally a no-op — see the block above. Real founders are re-flagged
  // server-side; never auto-promote from client-controlled localStorage.
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

// ── Beta code → no plan grant (decision P13, 2026-09-14) ─────────────────────
// applyBetaCodeFounderUpgrade() USED TO LIVE HERE. It set a PERMANENT
// "beta_founder" plan in localStorage, client-side, on a valid beta code. That
// made a code an entitlement: localStorage is user-controlled, so anyone who saw
// a code (or edited the key) had unlimited coaching for good, and nothing on the
// server knew about it.
//
// A beta code now only opens the door at signup. What the account is entitled to
// comes from the server profile, which the client reads and caches. Removed
// rather than kept as a no-op, so nothing can call it by accident.
//
// Existing "beta_founder" values already in a user's localStorage are NOT
// stripped here; the server profile reconcile decides, and a real founder_flag
// row keeps its status.

// ── Phase D7: Trial state helpers ────────────────────────────────────────────
// New users start a 14-day "trial" plan with unlimited Coach + sim. After 14
// days, plan auto-transitions to "free" with the harder daily caps.
//
// Existing free-tier users (those with the legacy "flourish_trial_start" key
// already set) do NOT retroactively get a trial — they stay on "free".

export function getTrialStartedAt() {
  try {
    const v = localStorage.getItem("flourish_trial_started_at");
    return v ? new Date(v) : null;
  } catch { return null; }
}

// When the trial ends, by the same rule the server applies in _lib/planRules.js: an explicit
// trial_ends_at if the profile has one, otherwise trial_started_at + 14 days. The explicit date is
// what Decision P18 moves if billing is late — migration 0007 pushes every unexpired trial forward
// — so ignoring it here would cap a cohort the SERVER is still treating as unlimited.
function trialEndsAtMs() {
  try {
    const explicit = localStorage.getItem("flourish_trial_ends_at");
    if (explicit) {
      const t = new Date(explicit).getTime();
      if (Number.isFinite(t)) return t;
    }
  } catch { /* fall through to the started_at rule */ }
  const start = getTrialStartedAt();
  return start ? start.getTime() + TRIAL_DURATION_DAYS * 86400000 : null;
}

export function getTrialDaysLeft() {
  const ends = trialEndsAtMs();
  if (ends === null) return null;
  const msLeft = ends - Date.now();
  if (msLeft <= 0) return 0;
  return Math.ceil(msLeft / (1000 * 60 * 60 * 24));
}

export function isTrialActive() {
  if (getPlan() !== "trial") return false;
  const left = getTrialDaysLeft();
  return left !== null && left > 0;
}

// Returns true if user has unlimited access (premium, beta_founder, or active trial)
export function isUnlimited() {
  return isPremiumOrFounder() || isTrialActive();
}

// Start a trial for new users only.
// Skips if: user already has a plan other than "free", trial already started, OR
// user has the legacy "flourish_trial_start" key (existing free user, not new).
export function startTrialIfEligible() {
  try {
    if (getPlan() !== "free") return false;
    if (localStorage.getItem("flourish_trial_started_at")) return false;
    if (localStorage.getItem("flourish_trial_start")) return false; // legacy: existing user
    const now = new Date().toISOString();
    localStorage.setItem("flourish_trial_started_at", now);
    setPlan("trial");
    return true;
  } catch { return false; }
}

// Auto-transition expired trials to free.
export function expireTrialIfNeeded() {
  try {
    if (getPlan() !== "trial") return false;
    const left = getTrialDaysLeft();
    if (left === 0) {
      setPlan("free");
      return true;
    }
    return false;
  } catch { return false; }
}

// -----------------------------------------------------------------------------
// END
// -----------------------------------------------------------------------------
