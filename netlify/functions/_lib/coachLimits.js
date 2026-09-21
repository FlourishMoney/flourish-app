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
// -----------------------------------------------------------------------------

"use strict";

// DECISIONS.md item 2: free coaching after the trial is 2 messages a week.
const FREE_CHAT_WEEKLY = 2;

/**
 * @param {object} a
 * @param {boolean} a.enforce       ENFORCE_PLAN_LIMITS
 * @param {boolean} a.unlimited     from getUserPlan: founder, plus/pro, or an unexpired trial
 * @param {number|null} a.usedToday count AFTER this message, from the day-keyed counter
 * @param {number} a.dailyCeiling   CHAT_DAILY_CEILING
 * @param {number|null} a.usedWeek  count AFTER this message, from the weekly counter; null when not counted
 * @param {number} [a.freeWeekly]
 * @returns {{allowed: boolean, message: string|null, reason: string|null}}
 */
function decideChatLimit({ enforce, unlimited, usedToday, dailyCeiling, usedWeek, freeWeekly = FREE_CHAT_WEEKLY }) {
  // The abuse ceiling first: it applies to everyone, so no plan can talk its way past it.
  if (typeof usedToday === "number" && usedToday > dailyCeiling) {
    return {
      allowed: false,
      reason: "daily_ceiling",
      message: "You've hit today's Coach message limit. It resets tomorrow.",
    };
  }
  // Then the free limit, which only exists for accounts with no entitlement.
  if (enforce && !unlimited && typeof usedWeek === "number" && usedWeek > freeWeekly) {
    return {
      allowed: false,
      reason: "free_weekly",
      message: `You've used your ${freeWeekly} free Coach messages this week. Upgrade to Plus for unlimited, or come back on Monday when this week's messages reset.`,
    };
  }
  return { allowed: true, message: null, reason: null };
}

module.exports = { FREE_CHAT_WEEKLY, decideChatLimit };
