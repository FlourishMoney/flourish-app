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

module.exports = { FREE_CHAT_WEEKLY, freeLimitMessage, countFreeWeek, decideChatLimit };
