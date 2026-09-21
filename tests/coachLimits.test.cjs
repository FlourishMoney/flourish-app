// tests/coachLimits.test.cjs
// -----------------------------------------------------------------------------
// THE FREE COACH LIMIT IS 2 A WEEK, AND THE SERVER IS THE ONE ENFORCING IT.
//
// The server enforced 1 a DAY (FREE_CHAT_DAILY) while src/lib/usageLimits.js and DECISIONS.md item
// 2 both said 2 a week resetting Monday 00:00 UTC. A free user who sent one message on Monday was
// told to come back tomorrow, and could then send one every day: seven a week against a limit of
// two. The server is the authority, so the server now counts a week.
//
// Two limits, and they are not the same thing:
//   CHAT_DAILY_CEILING  applies to EVERY account, to cap cost. Unchanged.
//   FREE_CHAT_WEEKLY    applies only to accounts with no entitlement, only while the flag is on.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");
const { FREE_CHAT_WEEKLY, decideChatLimit } = require("../netlify/functions/_lib/coachLimits.js");

const CEILING = 50;
const call = (o) => decideChatLimit({ enforce: true, unlimited: false, usedToday: 1, dailyCeiling: CEILING, usedWeek: null, ...o });

(async () => {
  const t = create();

  // ── 1. The decided limit ─────────────────────────────────────────────────────────────────────
  t.eq(FREE_CHAT_WEEKLY, 2, "1a the free limit is 2, matching DECISIONS.md item 2 and usageLimits.js");

  // ── 2. A free user's week ────────────────────────────────────────────────────────────────────
  {
    t.eq(call({ usedWeek: 1 }).allowed, true, "2a the first free message of the week is allowed");
    t.eq(call({ usedWeek: 2 }).allowed, true, "2b the second is allowed");
    const third = call({ usedWeek: 3 });
    t.eq(third.allowed, false, "2c the THIRD is rejected");
    t.eq(third.reason, "free_weekly", "2d …as a free-limit rejection, not an abuse one");
    t.ok(/this week/.test(third.message), "2e …and the message says this week, not today");
    t.ok(!/tomorrow/.test(third.message), "2f …and never says tomorrow, which was the old daily wording");
    t.ok(/Monday/.test(third.message), "2g …and says when it resets");
    t.ok(/\b2\b/.test(third.message), "2h …and names the limit");
    // The next week starts the count again: the counter is week-keyed, so message one of the new
    // week arrives as usedWeek 1, whatever last week's total was.
    t.eq(call({ usedWeek: 1 }).allowed, true, "2i the first message of the NEXT week is allowed again");
  }

  // ── 3. Entitlement skips the free limit, but nobody skips the abuse ceiling ──────────────────
  {
    t.eq(call({ unlimited: true, usedWeek: 99 }).allowed, true, "3a an unlimited account is not held to the free limit");
    t.eq(call({ enforce: false, usedWeek: 99 }).allowed, true, "3b with the flag off, the free limit does not apply to anyone");
    t.eq(call({ usedWeek: null }).allowed, true, "3c no weekly count taken (not a free account) means no free-limit rejection");

    const over = call({ unlimited: true, usedToday: CEILING + 1, usedWeek: null });
    t.eq(over.allowed, false, "3d the abuse ceiling still stops an unlimited account");
    t.eq(over.reason, "daily_ceiling", "3e …as an abuse rejection");
    t.ok(/today/.test(over.message) && /tomorrow/.test(over.message), "3f …with the daily wording, which is correct for a daily ceiling");
    t.eq(call({ enforce: false, unlimited: false, usedToday: CEILING + 1 }).allowed, false, "3g …and it applies with the flag off too");
    t.eq(call({ usedToday: CEILING }).allowed, true, "3h exactly at the ceiling is still allowed; over it is not");
  }

  // ── 4. The ceiling outranks the free limit when both are blown ───────────────────────────────
  {
    const both = call({ usedToday: CEILING + 1, usedWeek: 99 });
    t.eq(both.reason, "daily_ceiling", "4a both limits blown reports the abuse ceiling, the one that applies to everyone");
  }

  // ── 5. Bad inputs never open the gate wider than intended ────────────────────────────────────
  {
    t.eq(call({ usedWeek: "3" }).allowed, true, "5a a non-number weekly count is not compared (the caller failing is handled by coach.js failing closed, not here)");
    t.eq(call({ usedToday: null, usedWeek: 3 }).allowed, false, "5b a missing daily count does not stop the free limit from applying");
  }

  // ── 6. coach.js actually uses this, and the old daily rule is gone ───────────────────────────
  {
    const coach = fs.readFileSync(path.join(__dirname, "..", "netlify", "functions", "coach.js"), "utf8");
    t.ok(/decideChatLimit\(/.test(coach), "6a coach.js decides through this module");
    t.ok(/increment_coach_usage_weekly/.test(coach), "6b …counting the week with the new RPC");
    t.ok(/rpc\("increment_coach_usage"/.test(coach), "6c …while the day-keyed abuse counter is still called, unchanged");
    t.ok(!/FREE_CHAT_DAILY\s*=/.test(coach), "6d the 1-a-day free constant is gone");
    t.ok(/CHAT_DAILY_CEILING = 50/.test(coach), "6e CHAT_DAILY_CEILING is untouched");
    t.ok(/EMERGENCY_IP_DAILY|IP_DAILY_CAP/.test(coach), "6f the IP backstop is still there");
    t.ok(/failing closed/i.test(coach), "6g …and so is the fail-closed comment and its branch");
    t.ok(!/come back tomorrow/.test(coach), "6h no message still tells a free user to come back tomorrow");
    // The weekly counter must not be written for accounts the free limit cannot apply to.
    t.ok(/if \(ENFORCE_PLAN_LIMITS && !unlimited\) \{[\s\S]{0,200}increment_coach_usage_weekly/.test(coach),
      "6i the weekly counter is only incremented when the free limit can actually apply");
  }

  t.summary("coachLimits.test");
})();
