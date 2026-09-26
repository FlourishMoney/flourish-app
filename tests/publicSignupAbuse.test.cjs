// tests/publicSignupAbuse.test.cjs
// -----------------------------------------------------------------------------
// THE DOOR NOW FACES THE OPEN INTERNET.
//
// While signup needed an invite code, everyone who could reach the paid surfaces had been handed a
// code by Amanda. Once OPEN_SIGNUP is on, anyone can make an account, so the guards that were a
// backstop become the only thing standing between a stranger and a bill.
//
// This file changes nothing about those guards. It pins the two that matter most, so that opening the
// door cannot quietly move them:
//   • an unauthenticated coach request is refused before any model is called
//   • a free account cannot exceed 2 coach messages a week
//
// The real handler runs here with the network blocked, so a request that reached Anthropic would fail
// the test rather than pass it.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");

const COACH_PATH = require.resolve("../netlify/functions/coach.js");

(async () => {
  const { decideChatLimit, FREE_CHAT_WEEKLY } = require("../netlify/functions/_lib/coachLimits.js");
  const t = create();
  const REPO = path.join(__dirname, "..");

  // ── 1. No token, no coach ─────────────────────────────────────────────────────────────────────
  {
    const savedEnv = { ...process.env };
    const savedFetch = global.fetch;
    const calls = [];
    global.fetch = async (url) => { calls.push(String(url)); throw new Error("network blocked in test"); };
    process.env.SUPABASE_URL = "https://supabase.test.invalid";
    process.env.SUPABASE_SECRET_KEY = "test-secret-not-real";
    process.env.ANTHROPIC_API_KEY = "test-key-not-real";
    delete require.cache[COACH_PATH];
    let coach;
    try {
      coach = require(COACH_PATH);
      const call = (headers) => coach.handler({
        httpMethod: "POST",
        headers: { origin: "https://flourishmoney.app", ...headers },
        body: JSON.stringify({ message: "what can I spend?", capability: "text" }),
      });

      for (const [label, headers] of [
        ["no Authorization header at all", {}],
        ["an empty bearer", { authorization: "Bearer " }],
        ["a junk token", { authorization: "Bearer not-a-real-token" }],
        ["the word Bearer alone", { authorization: "Bearer" }],
        ["a raw token with no scheme", { authorization: "not-a-real-token" }],
      ]) {
        const res = await call(headers);
        t.eq(res.statusCode, 401, `${label}: 401`);
        const body = JSON.parse(res.body);
        t.ok(!!body.error, `${label}: …with an error and no answer`);
        t.ok(!body.reply && !body.content, `${label}: …and no model output`);
      }
      t.eq(calls.filter(u => u.includes("api.anthropic.com")).length, 0, "no unauthenticated request ever reaches Anthropic");
    } finally {
      delete require.cache[COACH_PATH];
      process.env = savedEnv;
      global.fetch = savedFetch;
    }
  }

  // ── 2. A fresh free account gets 2 coach messages a week ──────────────────────────────────────
  // decideChatLimit is the rule coach.js applies. usedWeek is the count AFTER this message, so the
  // 3rd message arrives as usedWeek 3 and is the first one refused.
  {
    t.eq(FREE_CHAT_WEEKLY, 2, "the free limit is 2 a week, as DECISIONS.md item 2 settled");
    const free = (usedWeek, over = {}) => decideChatLimit({
      enforce: true, unlimited: false, usedToday: usedWeek, dailyCeiling: 50, usedWeek, ...over,
    });
    t.eq(free(1).allowed, true, "a fresh free account: the 1st message of the week is allowed");
    t.eq(free(2).allowed, true, "…the 2nd is allowed");
    t.eq(free(3).allowed, false, "…the 3rd is refused");
    t.eq(free(3).reason, "free_weekly", "…for the free weekly limit, not the abuse ceiling");
    t.ok(/2 free Coach messages this week/.test(free(3).message || ""), "…and says so in the message");
    for (const n of [4, 9, 50, 500]) t.eq(free(n).allowed, false, `…and every later message that week is refused (${n})`);

    // The counter being down is not a licence to chat.
    t.eq(free(1, { weeklyCounterOk: false }).allowed, false, "a free account is refused when the weekly counter cannot be read");
    t.eq(free(1, { weeklyCounterOk: false }).reason, "free_weekly_unavailable", "…and the reason says why");
    t.eq(free(null, { usedWeek: null }).allowed, true, "…but an uncounted message with a working counter still passes");

    // An entitlement is never touched by the free limit, and nobody escapes the abuse ceiling.
    t.eq(decideChatLimit({ enforce: true, unlimited: true, usedToday: 3, dailyCeiling: 50, usedWeek: 3 }).allowed, true,
         "a trial or paid account is not subject to the free weekly limit");
    t.eq(decideChatLimit({ enforce: true, unlimited: true, usedToday: 51, dailyCeiling: 50, usedWeek: 1 }).reason, "daily_ceiling",
         "…but no plan talks its way past the 50-a-day abuse ceiling");
    t.eq(decideChatLimit({ enforce: false, unlimited: false, usedToday: 3, dailyCeiling: 50, usedWeek: 3 }).allowed, true,
         "with ENFORCE_PLAN_LIMITS off the server applies only the abuse ceiling (KNOWN-DEFECTS 21)");
  }

  // ── 3. The guards this work must not have moved ───────────────────────────────────────────────
  {
    const coach = fs.readFileSync(path.join(REPO, "netlify", "functions", "coach.js"), "utf8");
    t.ok(/const CHAT_DAILY_CEILING = 50;/.test(coach), "CHAT_DAILY_CEILING is still 50");
    t.ok(/const IP_DAILY_CAP = 100;/.test(coach) && /const EMERGENCY_IP_DAILY = 10;/.test(coach), "the per-IP caps are unchanged");
    t.ok(/if \(!user_id\) \{\s*return \{ statusCode: 401/.test(coach), "the auth gate is still the first thing after the method check");
    t.ok(/const MAX_BODY_BYTES = 100000;/.test(coach), "the body-size guard is unchanged");
    // The open door is a signup concern and has no business in the coach.
    t.ok(!/OPEN_SIGNUP|openSignupEnabled|signup_status/.test(coach), "coach.js knows nothing about the signup flag");
  }

  t.summary("publicSignupAbuse.test");
})();
