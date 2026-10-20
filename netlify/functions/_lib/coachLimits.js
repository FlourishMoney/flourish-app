// netlify/functions/_lib/coachLimits.js
// -----------------------------------------------------------------------------
// WHETHER THIS COACH MESSAGE IS ALLOWED, and what to say when it is not.
//
// Pure: it takes counts and returns a decision, so the rule can be tested without a database, an
// HTTP request or an Anthropic key. coach.js does the counting and the answering.
//
// TWO SEPARATE LIMITS, and they mean different things:
//   the ABUSE CEILING  (CHAT_DAILY_CEILING, day-keyed) applies to EVERY account, paid or not. It
//                      exists to cap cost and stop a runaway client, not to sell anything.
//   the FREE LIMIT     (FREE_CHAT_WEEKLY, week-keyed, Monday 00:00 UTC) applies only to accounts
//                      with no entitlement, and only while ENFORCE_PLAN_LIMITS is on.
//
// The free limit was 1 a DAY on the server while src/lib/usageLimits.js and DECISIONS.md item 2
// both said 2 a WEEK. The server is the authority, so the server now enforces what was decided.
//
// WHEN THE WEEKLY COUNTER IS DOWN, THE FREE LIMIT STILL APPLIES. A counter that cannot be read is
// not a licence to chat: countFreeWeek() swallows the failure and reports weeklyCounterOk false,
// and decideChatLimit() then refuses a free account with the ordinary free-limit message. This is
// the case that matters on the day of the rollout, when the code is live and migration 0008 is not
// yet applied, so increment_coach_usage_weekly does not exist. Accounts WITH an entitlement —
// founder, plus/pro, an unexpired trial — are never counted and never refused by this path.
// -----------------------------------------------------------------------------

"use strict";

// DECISIONS.md item 2: free coaching after the trial is 2 messages a week.
const FREE_CHAT_WEEKLY = 2;

// One wording for the free limit, whether we counted to it or could not count at all. A free user
// should not be able to tell the difference, and support should not have two messages to explain.
function freeLimitMessage(freeWeekly) {
  return `You've used your ${freeWeekly} free Coach messages this week. Upgrade to Plus for unlimited, or come back on Monday when this week's messages reset.`;
}

/**
 * Counts this message in the caller's week and reports whether the counter worked.
 *
 * NEVER THROWS, and that is the whole point. If this threw, the failure would land in coach.js's
 * outer catch, which exists for a different problem (the per-user counter being down) and answers
 * it by letting the request through under an emergency per-IP cap. A free account would then get
 * the 50-a-day abuse ceiling instead of 2 a week. So the weekly counter carries its own failure.
 *
 * Call it only for accounts the free limit can apply to; coach.js does.
 *
 * @param {{rpc: Function}} admin supabase client holding the secret key
 * @param {string} userId
 * @returns {Promise<{usedWeek: number|null, weeklyCounterOk: boolean}>}
 */
async function countFreeWeek(admin, userId) {
  try {
    const { data, error } = await admin.rpc("increment_coach_usage_weekly", { p_user: userId });
    if (error) throw error;
    // A missing function, a revoked grant or a schema-cache miss can come back as data null with no
    // error object depending on the client. A count that is not a number is not a count.
    if (typeof data !== "number") throw new Error(`weekly counter returned ${data === null ? "null" : typeof data}`);
    return { usedWeek: data, weeklyCounterOk: true };
  } catch (e) {
    // Named so it is greppable in the Netlify log on rollout day: this is what "0008 not applied
    // yet" looks like from the function's side.
    console.error("[coach] weekly counter unavailable — free accounts fail closed:", (e && e.message) || e);
    return { usedWeek: null, weeklyCounterOk: false };
  }
}

/**
 * @param {object} a
 * @param {boolean} a.enforce       ENFORCE_PLAN_LIMITS
 * @param {boolean} a.unlimited     from getUserPlan: founder, plus/pro, or an unexpired trial
 * @param {number|null} a.usedToday count AFTER this message, from the day-keyed counter
 * @param {number} a.dailyCeiling   CHAT_DAILY_CEILING
 * @param {number|null} a.usedWeek  count AFTER this message, from the weekly counter; null when not counted
 * @param {boolean} [a.weeklyCounterOk] false when the weekly counter could not be read or does not exist
 * @param {number} [a.freeWeekly]
 * @returns {{allowed: boolean, message: string|null, reason: string|null}}
 */
function decideChatLimit({ enforce, unlimited, usedToday, dailyCeiling, usedWeek, weeklyCounterOk = true, freeWeekly = FREE_CHAT_WEEKLY }) {
  // The abuse ceiling first: it applies to everyone, so no plan can talk its way past it.
  if (typeof usedToday === "number" && usedToday > dailyCeiling) {
    return {
      allowed: false,
      reason: "daily_ceiling",
      message: "You've hit today's Coach message limit. It resets tomorrow.",
    };
  }
  // Then the free limit, which only exists for accounts with no entitlement. Note the order of the
  // two conditions below: BOTH are behind `enforce && !unlimited`, so nothing here can touch a
  // founder, a paid plan or a live trial, and nothing happens at all while the flag is off.
  if (enforce && !unlimited) {
    // Fail closed. No readable count means no way to know this account is under its 2, and the
    // honest answer to a free account is the limit, not an unmetered conversation.
    if (!weeklyCounterOk) {
      return { allowed: false, reason: "free_weekly_unavailable", message: freeLimitMessage(freeWeekly) };
    }
    if (typeof usedWeek === "number" && usedWeek > freeWeekly) {
      return { allowed: false, reason: "free_weekly", message: freeLimitMessage(freeWeekly) };
    }
  }
  return { allowed: true, message: null, reason: null };
}

// ── WHAT-IF AND THE MEET FACILITATOR (2026-10-20) ────────────────────────────────────────────────
// Until this date only `chat` was checked here. `simulator` (the What-If explanation) and `facilitator`
// (the coach-run meeting) went to Anthropic for any signed-in account, so a store app, which opened both
// to everyone, cost the same for a free household as for a paid one, and an old install keeps doing so
// whatever its own code says. The server now applies the free plan to both, the same for every app:
//   simulator    the free plan has 1 a day (usageLimits.js FREE_TIER_LIMITS.simulationsPerDay), counted
//                on the UTC day, the boundary the client's own counter uses
//   facilitator  not on the free plan (src/lib/featureAccess.js facilitatorAvailable)
// A trial, a paid plan or a founder flag lifts both, and nothing here applies while ENFORCE_PLAN_LIMITS
// is off. The web never sends either call for a free household, so the web is unchanged.

const FREE_SIMULATIONS_DAILY = 1;

// Neither reaches a store app's screen: old installs show their own neutral line for any refusal, and the
// current app words both itself (src/lib/freePlan.js). Neither names a price, a plan to buy or a website.
const SIMULATOR_LIMIT_MESSAGE = "You've used today's What-If explanation. It resets tomorrow.";
const FACILITATOR_FREE_MESSAGE = "The coach-run meeting isn't part of the free plan. Your agenda is unchanged.";

/**
 * Counts one What-If explanation on the caller's UTC day (migration 0024) and reports whether that worked.
 * Never throws, for the reason countFreeWeek gives. A missing function (0024 not applied yet) is a failure
 * like any other, so a free account fails closed: the What-If figures still show, with the app's own
 * explanation in place of the coach's. Call it only for accounts the free limit can apply to.
 * @returns {Promise<{usedToday: number|null, counterOk: boolean}>}
 */
async function countFreeDay(admin, userId, kind) {
  try {
    const { data, error } = await admin.rpc("increment_ai_usage_daily", { p_user: userId, p_kind: kind });
    if (error) throw error;
    if (typeof data !== "number") throw new Error(`daily counter returned ${data === null ? "null" : typeof data}`);
    return { usedToday: data, counterOk: true };
  } catch (e) {
    console.error(`[coach] daily ${kind} counter unavailable, free accounts fail closed:`, (e && e.message) || e);
    return { usedToday: null, counterOk: false };
  }
}

/**
 * @param {object} a
 * @param {boolean} a.enforce        ENFORCE_PLAN_LIMITS
 * @param {boolean} a.unlimited      from getUserPlan
 * @param {number|null} a.usedToday  count AFTER this call, from countFreeDay; null when not counted
 * @param {boolean} [a.counterOk]
 * @returns {{allowed: boolean, status: number|null, error: string|null, message: string|null, reason: string|null}}
 */
function decideSimulatorLimit({ enforce, unlimited, usedToday, counterOk = true, freeDaily = FREE_SIMULATIONS_DAILY }) {
  if (enforce && !unlimited) {
    if (!counterOk) return { allowed: false, status: 429, error: "rate_limited", reason: "free_daily_unavailable", message: SIMULATOR_LIMIT_MESSAGE };
    if (typeof usedToday === "number" && usedToday > freeDaily) {
      return { allowed: false, status: 429, error: "rate_limited", reason: "free_daily", message: SIMULATOR_LIMIT_MESSAGE };
    }
  }
  return { allowed: true, status: null, error: null, message: null, reason: null };
}

function decideFacilitator({ enforce, unlimited }) {
  if (enforce && !unlimited) return { allowed: false, status: 402, error: "plan_limit", reason: "free_plan", message: FACILITATOR_FREE_MESSAGE };
  return { allowed: true, status: null, error: null, message: null, reason: null };
}

module.exports = {
  FREE_CHAT_WEEKLY, freeLimitMessage, countFreeWeek, decideChatLimit,
  FREE_SIMULATIONS_DAILY, SIMULATOR_LIMIT_MESSAGE, FACILITATOR_FREE_MESSAGE, countFreeDay, decideSimulatorLimit, decideFacilitator,
};
