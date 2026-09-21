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
const { FREE_CHAT_WEEKLY, freeLimitMessage, countFreeWeek, decideChatLimit } = require("../netlify/functions/_lib/coachLimits.js");

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
    const lib = fs.readFileSync(path.join(__dirname, "..", "netlify", "functions", "_lib", "coachLimits.js"), "utf8");
    t.ok(/decideChatLimit\(/.test(coach), "6a coach.js decides through this module");
    t.ok(/countFreeWeek\(admin, user_id\)/.test(coach) && /increment_coach_usage_weekly/.test(lib),
      "6b …counting the week with the new RPC, which now lives in countFreeWeek so its failure is its own");
    t.ok(/rpc\("increment_coach_usage"/.test(coach), "6c …while the day-keyed abuse counter is still called, unchanged");
    t.ok(!/FREE_CHAT_DAILY\s*=/.test(coach), "6d the 1-a-day free constant is gone");
    t.ok(/CHAT_DAILY_CEILING = 50/.test(coach), "6e CHAT_DAILY_CEILING is untouched");
    t.ok(/EMERGENCY_IP_DAILY|IP_DAILY_CAP/.test(coach), "6f the IP backstop is still there");
    t.ok(/failing closed/i.test(coach), "6g …and so is the fail-closed comment and its branch");
    t.ok(!/come back tomorrow/.test(coach), "6h no message still tells a free user to come back tomorrow");
    // The weekly counter must not be written for accounts the free limit cannot apply to.
    t.ok(/if \(ENFORCE_PLAN_LIMITS && !unlimited\) \{[\s\S]{0,200}countFreeWeek\(/.test(coach),
      "6i the weekly counter is only incremented when the free limit can actually apply");
    t.ok(!/increment_coach_usage_weekly/.test(coach),
      "6j …and coach.js calls the weekly RPC nowhere else, so there is one place for it to fail");
  }

  // ── 7. The weekly counter fails CLOSED for free accounts, and only for them ──────────────────
  // ChatGPT's HIGH 1 on PR #2: the weekly RPC used to sit in the same try as the day-keyed one, so
  // any weekly failure landed in the "counter is down" handler — which lets the request through
  // under an emergency per-IP cap. A free user whose weekly counter failed got the 50-a-day abuse
  // ceiling instead of 2 a week. Deploying the code before migration 0008 would have done exactly
  // that to every free account at once.
  //
  // This runs the REAL enforcement block, read out of coach.js at test time and compiled with
  // stubs, so it tests what ships rather than a restatement of it. ipCount is 1 — a healthy IP —
  // because that is the case where the old code allowed the message.
  {
    const coach = fs.readFileSync(path.join(__dirname, "..", "netlify", "functions", "coach.js"), "utf8");
    const from = coach.indexOf("        let userRpcOk = false;");
    const to = coach.indexOf("        // Healthy-mode per-IP abuse/cost cap");
    t.ok(from > 0 && to > from, "7a the enforcement block is where this test reads it from");
    const block = coach.slice(from, to);

    const CORS = { "x-test": "1" };
    // Three ways the weekly counter can fail. The third is rollout day: code live, 0008 not applied.
    const MODES = {
      throws:  () => { throw new Error("fetch failed"); },
      errors:  () => ({ data: null, error: { message: "permission denied for function increment_coach_usage_weekly" } }),
      missing: () => ({ data: null, error: { code: "PGRST202", message: "Could not find the function public.increment_coach_usage_weekly(p_user) in the schema cache" } }),
    };

    const run = async ({ mode, unlimited, enforce = true }) => {
      const calls = { weekly: 0, daily: 0 };
      const logs = [];
      const admin = {
        rpc: async (name) => {
          if (name === "increment_coach_usage") { calls.daily++; return { data: 1, error: null }; }
          calls.weekly++;
          return MODES[mode]();
        },
      };
      const fn = new Function(
        "getUserPlan", "getAdminClient", "ENFORCE_PLAN_LIMITS", "CHAT_DAILY_CEILING", "FREE_CHAT_WEEKLY",
        "countFreeWeek", "decideChatLimit", "corsHeaders", "user_id", "ipCount", "EMERGENCY_IP_DAILY", "console",
        `return (async () => {\n${block}\n  return { allowedThrough: true };\n})();`
      );
      // countFreeWeek logs through the module's own console, not the one injected into the block,
      // so the real one is captured for the duration of the call and put back afterwards.
      const quiet = console.error;
      console.error = (...a) => logs.push(a.map(String).join(" "));
      let out;
      try {
        out = await fn(
          async () => ({ unlimited }), () => admin, enforce, CEILING, FREE_CHAT_WEEKLY,
          countFreeWeek, decideChatLimit, CORS, "user-1", 1, 10, { error: (...a) => logs.push(a.map(String).join(" ")) }
        );
      } finally { console.error = quiet; }
      const body = out && out.body ? JSON.parse(out.body) : null;
      return { out, body, calls, logs };
    };

    for (const mode of Object.keys(MODES)) {
      // A free account is refused, with the ordinary free-limit message.
      const free = await run({ mode, unlimited: false });
      t.eq(free.out.statusCode, 429, `7b[${mode}] a free account is REFUSED when the weekly counter ${mode}`);
      t.eq(free.body && free.body.error, "rate_limited", `7c[${mode}] …as a rate limit`);
      t.eq(free.body && free.body.message, freeLimitMessage(FREE_CHAT_WEEKLY),
        `7d[${mode}] …with the normal limit message, not an outage message`);
      t.ok(!/briefly unavailable/.test((free.body && free.body.message) || "(allowed through — no refusal at all)"),
        `7e[${mode}] …so it never falls through to the IP backstop's wording`);
      t.eq(free.calls.weekly, 1, `7f[${mode}] …having actually attempted the count once`);
      t.ok(free.logs.some(l => /weekly counter unavailable/.test(l)),
        `7g[${mode}] …and the failure is logged where the rollout can be seen`);

      // An account with an entitlement is never counted and never blocked by this path.
      const trial = await run({ mode, unlimited: true });
      t.eq(trial.out.allowedThrough, true, `7h[${mode}] an active trial is ALLOWED through`);
      t.eq(trial.calls.weekly, 0, `7i[${mode}] …and its week is never counted at all`);
      const founder = await run({ mode, unlimited: true });
      t.eq(founder.out.allowedThrough, true, `7j[${mode}] a founder is ALLOWED through`);
      t.eq(founder.calls.weekly, 0, `7k[${mode}] …and is never counted either`);

      // Rollout order: the flag goes on LAST. With it off, a broken counter blocks nobody.
      const flagOff = await run({ mode, unlimited: false, enforce: false });
      t.eq(flagOff.out.allowedThrough, true, `7l[${mode}] with ENFORCE_PLAN_LIMITS off, a free account is unaffected`);
      t.eq(flagOff.calls.weekly, 0, `7m[${mode}] …and nothing is counted before the flag is on`);

      // The day-keyed abuse ceiling still ran in every one of those cases.
      t.eq(free.calls.daily, 1, `7n[${mode}] the day-keyed abuse counter still ran`);
    }

    // And the unit beneath it: countFreeWeek reports the failure instead of throwing it upward.
    for (const mode of Object.keys(MODES)) {
      const admin = { rpc: async () => MODES[mode]() };
      const quiet = console.error;
      console.error = () => {};
      const r = await countFreeWeek(admin, "user-1");
      console.error = quiet;
      t.eq(r.weeklyCounterOk, false, `7o[${mode}] countFreeWeek reports the counter as unavailable`);
      t.eq(r.usedWeek, null, `7p[${mode}] …with no count invented`);
    }
    // A working counter is unchanged.
    const good = await countFreeWeek({ rpc: async () => ({ data: 3, error: null }) }, "user-1");
    t.eq(good.weeklyCounterOk, true, "7q a working weekly counter still reports ok");
    t.eq(good.usedWeek, 3, "7r …and returns the count");
    const nan = await (async () => { const q = console.error; console.error = () => {}; const r = await countFreeWeek({ rpc: async () => ({ data: "3", error: null }) }, "u"); console.error = q; return r; })();
    t.eq(nan.weeklyCounterOk, false, "7s a count that is not a number is not a count");
  }

  t.summary("coachLimits.test");
})();
