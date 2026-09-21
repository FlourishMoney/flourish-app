// tests/planFromProfile.test.cjs
// -----------------------------------------------------------------------------
// WHAT AN ACCOUNT MAY DO COMES FROM ITS PROFILE ROW, AND FROM NOTHING ELSE.
//
// Before this, three places answered "is this person on trial": App.jsx inline, auth.js inline, and
// a plan string in localStorage that could outlive both. The client copy of the rule lives in
// src/lib/planFromProfile.js, the server's in netlify/functions/_lib/planRules.js, and the parity
// section below fails if they ever disagree.
//
// The rule, in order: founder_flag -> beta_founder; plus/pro -> premium; an unexpired trial ->
// trial; anything else -> free. A trial ends at trial_ends_at, or at trial_started_at + 14 days
// when the row predates migration 0007.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const path = require("path");

const DAY = 86400000;
const NOW = Date.parse("2026-09-21T12:00:00Z");
const ago = (days) => new Date(NOW - days * DAY).toISOString();
const ahead = (days) => new Date(NOW + days * DAY).toISOString();

(async () => {
  const C = await import("../src/lib/planFromProfile.js");
  const S = require("../netlify/functions/_lib/planRules.js");
  const t = create();

  // ── 1. The four answers ──────────────────────────────────────────────────────────────────────
  {
    t.eq(C.derivePlan({ founder_flag: true, plan: "free" }, NOW), "beta_founder",
      "1a an existing founder keeps founder status whatever the plan column says");
    t.eq(C.derivePlan({ plan: "plus" }, NOW), "premium", "1b plus is premium");
    t.eq(C.derivePlan({ plan: "pro" }, NOW), "premium", "1c pro is premium");
    t.eq(C.derivePlan({ plan: "trial", trial_started_at: ago(3) }, NOW), "trial", "1d a 3-day-old trial is on trial");
    t.eq(C.derivePlan({ plan: "free" }, NOW), "free", "1e free is free");
    t.eq(C.derivePlan(null, NOW), "free", "1f no row at all is free, never unlimited");
    t.eq(C.derivePlan({}, NOW), "free", "1g an empty row is free");
    t.eq(C.derivePlan({ plan: "enterprise_unicorn" }, NOW), "free", "1h a plan value nobody recognises is free, not unlimited");
  }

  // ── 2. When a trial ends ─────────────────────────────────────────────────────────────────────
  {
    t.eq(C.derivePlan({ plan: "trial", trial_started_at: ago(13.9) }, NOW), "trial", "2a day 13 of 14: still on trial");
    t.eq(C.derivePlan({ plan: "trial", trial_started_at: ago(15) }, NOW), "free", "2b a 15-day-old trial with no end date has expired");
    t.eq(C.derivePlan({ plan: "trial", trial_started_at: ago(14) }, NOW), "free", "2c exactly 14 days is over: the window is [start, start+14d)");
    // The row the migration creates.
    t.eq(C.derivePlan({ plan: "trial", trial_started_at: ago(1), trial_ends_at: ahead(13) }, NOW), "trial", "2d a fresh row with an explicit end is on trial");
    // Decision P18: the founder extends the cohort with one UPDATE, and a 20-day-old trial holds.
    t.eq(C.derivePlan({ plan: "trial", trial_started_at: ago(20), trial_ends_at: ahead(8) }, NOW), "trial",
      "2e an EXTENDED trial_ends_at keeps a 20-day-old trial alive, which is what the extension statement is for");
    t.eq(C.derivePlan({ plan: "trial", trial_started_at: ago(1), trial_ends_at: ago(0.5) }, NOW), "free",
      "2f trial_ends_at WINS over the 14-day fallback when it is earlier, so an ended trial cannot be revived by its start date");
    t.eq(C.derivePlan({ plan: "trial" }, NOW), "free",
      "2g a trial row with NO dates at all is free: with nothing saying when it began, free is the answer that cannot over-grant");
    t.eq(C.derivePlan({ plan: "trial", trial_started_at: "not-a-date" }, NOW), "free", "2h an unparseable date is free, not unlimited");
    t.eq(C.derivePlan({ plan: "trial", trial_started_at: ago(3), trial_ends_at: "not-a-date" }, NOW), "trial",
      "2i an unparseable END falls back to the 14-day window rather than discarding the trial");
  }

  // ── 3. founder_flag outranks everything, including an expired trial ──────────────────────────
  {
    t.eq(C.derivePlan({ founder_flag: true, plan: "trial", trial_started_at: ago(400) }, NOW), "beta_founder",
      "3a a founder whose trial ended long ago is still a founder");
    t.eq(C.isUnlimitedProfile({ founder_flag: true }, NOW), true, "3b founders are unlimited");
    t.eq(C.isUnlimitedProfile({ plan: "trial", trial_started_at: ago(3) }, NOW), true, "3c an unexpired trial is unlimited");
    t.eq(C.isUnlimitedProfile({ plan: "trial", trial_started_at: ago(15) }, NOW), false, "3d an expired trial is NOT unlimited");
    t.eq(C.isUnlimitedProfile({ plan: "free" }, NOW), false, "3e free is not unlimited");
  }

  // ── 4. Client and server answer identically, or the gate stops the branch ────────────────────
  // Two copies of the rule exist on purpose (ESM client, CommonJS function). This is the tripwire.
  {
    const rows = [
      null, {}, { plan: "free" }, { plan: "plus" }, { plan: "pro" }, { plan: "trial" },
      { founder_flag: true }, { founder_flag: true, plan: "pro" }, { founder_flag: false, plan: "trial", trial_started_at: ago(1) },
      { plan: "trial", trial_started_at: ago(3) }, { plan: "trial", trial_started_at: ago(14) }, { plan: "trial", trial_started_at: ago(15) },
      { plan: "trial", trial_started_at: ago(20), trial_ends_at: ahead(8) }, { plan: "trial", trial_started_at: ago(1), trial_ends_at: ago(1) },
      { plan: "trial", trial_ends_at: ahead(2) }, { plan: "trial", trial_started_at: "nope" }, { plan: "trial", trial_started_at: ago(3), trial_ends_at: "nope" },
      { plan: "unknown" }, { plan: null, founder_flag: null }, { plan: "trial", trial_started_at: new Date(NOW - 2 * DAY) },
    ];
    const times = [NOW, NOW - 30 * DAY, NOW + 30 * DAY];
    const mismatches = [];
    for (const row of rows) {
      for (const now of times) {
        const c = C.derivePlan(row, now), s = S.derivePlan(row, now);
        const cu = C.isUnlimitedProfile(row, now), su = S.isUnlimitedProfile(row, now);
        if (c !== s || cu !== su) mismatches.push(`${JSON.stringify(row)} @${new Date(now).toISOString().slice(0, 10)}: client ${c}/${cu} vs server ${s}/${su}`);
      }
    }
    t.eq(mismatches.join(" | "), "", "4a the client rule and the server rule agree on every row, at every time");
    t.eq(C.TRIAL_MS, S.TRIAL_MS, "4b …and on how long a trial is");
    t.eq(C.trialEndsAtMs({ plan: "trial", trial_started_at: ago(1) }), S.trialEndsAtMs({ plan: "trial", trial_started_at: ago(1) }), "4c …and on when one ends");
  }

  // ── 5. The client no longer derives a plan of its own, and localStorage is only a cache ──────
  {
    const fs = require("fs");
    const app = fs.readFileSync(path.join(__dirname, "..", "src", "App.jsx"), "utf8").replace(/\/\/[^\n]*/g, "");
    t.ok(/refreshPlanFromProfile/.test(app), "5a App.jsx reads the plan through refreshPlanFromProfile");
    t.ok(/derivePlan\(prof\)/.test(app), "5b …which derives it with the shared rule, not its own inline copy");
    t.ok(!/const TRIAL_MS = 14 \* 86400000/.test(app), "5c the old inline 14-day arithmetic is gone from App.jsx");
    t.ok(/select\("plan,trial_started_at,trial_ends_at,founder_flag"\)/.test(app), "5d …and it asks for trial_ends_at, which the rule needs");
    const auth = fs.readFileSync(path.join(__dirname, "..", "netlify", "functions", "_lib", "auth.js"), "utf8");
    t.ok(/isUnlimitedProfile\(data\)/.test(auth), "5e the server asks planRules rather than re-deriving the trial window");
    t.ok(/trial_ends_at/.test(auth), "5f …and selects trial_ends_at");
    t.ok(!/14 \* 86400000/.test(auth), "5g the old 14-day arithmetic is gone from auth.js");
  }

  t.summary("planFromProfile.test");
})();
