// tests/usageLimits.test.cjs — Step 5: free coach limit is 2/week (weekly reset); sim stays daily.
"use strict";
const { create } = require("./_runner.cjs");
const t = create();

function shimLocalStorage() {
  const store = new Map();
  global.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  };
  return store;
}

(async () => {
  const store = shimLocalStorage();
  const U = await import("../src/lib/usageLimits.js");

  U.setPlan("free"); // free tier, no trial → the weekly gate applies
  t.eq(U.FREE_TIER_LIMITS.coachMessagesPerWeek, 2, "1a free coach limit is 2 per week");
  t.ok(!("coachMessagesPerDay" in U.FREE_TIER_LIMITS), "1b the per-day coach limit is gone");
  t.eq(U.getCoachMessagesRemaining(), 2, "1c starts with 2 remaining");
  t.ok(U.canUseCoach(), "1d coach available");

  U.recordCoachUse();
  t.eq(U.getCoachMessagesRemaining(), 1, "2a one used → 1 left");
  U.recordCoachUse();
  t.eq(U.getCoachMessagesRemaining(), 0, "2b two used → 0 left");
  t.ok(!U.canUseCoach(), "2c blocked at the weekly limit");

  // weekly reset — a counter stamped with a PAST week reads as 0 this week
  store.set("flourish_coach_usage", JSON.stringify({ period: "2000-01-03", count: 99 }));
  t.eq(U.getCoachMessagesUsedThisWeek(), 0, "3a stale-week counter resets to 0");
  t.ok(U.canUseCoach(), "3b coach available again after the weekly reset");

  const wk = U._weekKey();
  t.ok(/^\d{4}-\d{2}-\d{2}$/.test(wk), "3c week key is a date");
  t.eq(new Date(wk + "T00:00:00Z").getUTCDay(), 1, "3d week key is a Monday (fixed weekday reset)");

  // simulator stays DAILY and unchanged — the weekly coach change does not conflict with it
  t.eq(U.FREE_TIER_LIMITS.simulationsPerDay, 1, "4a simulator still 1 per day");
  t.eq(U.getSimulationsRemaining(), 1, "4b sim starts at 1");
  U.recordSimulationUse();
  t.eq(U.getSimulationsRemaining(), 0, "4c sim daily gate works independently");

  // unlimited tiers ignore the gate
  U.setPlan("beta_founder");
  t.eq(U.getCoachMessagesRemaining(), Infinity, "5a beta_founder is unlimited");
  t.ok(U.canUseCoach(), "5b founder can always coach");
  U.setPlan("premium");
  t.eq(U.getCoachMessagesRemaining(), Infinity, "5c premium is unlimited");

  t.summary("usageLimits");
})();
