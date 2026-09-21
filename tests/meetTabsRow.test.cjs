// tests/meetTabsRow.test.cjs
// -----------------------------------------------------------------------------
// A TAB ROW HOLDING ONE ALREADY-SELECTED TAB IS A DEAD CONTROL.
//
// Week-2 defect c. The Meet screen builds its tab row from HOUSEHOLD_ENABLED, which
// is false — Household Sharing is switched off — so the row rendered exactly one
// button, "Money Meeting", already selected, that did nothing when tapped.
//
// The guard is already in App.jsx (commit f3d5692, "truth-fix item 1: stop
// advertising switched-off Household Sharing"), so this commit adds the test, not the
// fix. Without a test the guard is one refactor away from being dropped, and the flag
// is meant to be flipped on one day — so this pins BOTH directions: hidden while the
// row would hold one tab, rendered as soon as it holds two.
//
// The row is READ OUT OF App.jsx at test time and executed, so this tests the real
// expression rather than a description of it.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");

(async () => {
  const t = create();
  const app = fs.readFileSync(path.join(__dirname, "..", "src", "App.jsx"), "utf8");

  // ── 1. The flag, as shipped ──────────────────────────────────────────────────────────────────
  const flagLine = /const HOUSEHOLD_ENABLED = (true|false);/.exec(app);
  t.ok(!!flagLine, "1a HOUSEHOLD_ENABLED is declared in App.jsx");
  t.eq(flagLine[1], "false", "1b …and Household Sharing is OFF, which is why the row held one tab");

  // ── 2. The real row, compiled and run ────────────────────────────────────────────────────────
  const start = app.indexOf("const meetTabs=[");
  t.ok(start > 0, "2a the Meet tab row is where this test reads it from");
  const declEnd = app.indexOf(";", start) + 1;                       // the meetTabs declaration alone
  const guard = /if\(meetTabs\.length<2\) return null;/.exec(app.slice(declEnd, declEnd + 400));
  t.ok(!!guard, "2a2 …and the single-tab guard sits directly under it");
  // Without the guard, rowSrc is the declaration alone — so the assertions below report a rendered
  // row rather than crashing on JSX, which is what a deleted guard should look like in the output.
  const rowSrc = guard ? app.slice(start, declEnd + guard.index + guard[0].length) : app.slice(start, declEnd);

  // Returns null when the row is hidden, or the tab list when it renders.
  const run = (HOUSEHOLD_ENABLED, isCouple) => new Function("HOUSEHOLD_ENABLED", "isCouple",
    `return (() => { ${rowSrc} return meetTabs; })();`)(HOUSEHOLD_ENABLED, isCouple);

  t.eq(run(false, false), null, "2b OFF + solo: the row is hidden, not a single dead tab");
  t.eq(run(false, true), null, "2c OFF + couple: hidden too");

  // What it would have rendered — the dead control this defect is about.
  const wouldHaveShown = new Function("HOUSEHOLD_ENABLED", "isCouple",
    `return (() => { ${app.slice(start, app.indexOf(";", start) + 1)} return meetTabs; })();`);
  t.eq(wouldHaveShown(false, true).length, 1, "2d …and it really would have been ONE tab");
  t.eq(wouldHaveShown(false, true)[0][1], "Money Meeting", "2e …labelled 'Money Meeting' for a couple");
  t.eq(wouldHaveShown(false, false)[0][1], "Check-In", "2f …'Check-In' for a solo user");

  // ── 3. The day the flag is flipped, the row comes back ───────────────────────────────────────
  {
    const tabs = run(true, true);
    t.ok(Array.isArray(tabs), "3a ON: the row renders again");
    t.eq(tabs.length, 2, "3b …with two tabs");
    t.eq(tabs.map(x => x[0]).join(","), "meeting,household", "3c …Money Meeting and Household");
    t.eq(run(true, false).length, 2, "3d …and the same for a solo user");
  }

  // ── 4. Hiding the row did not hide the meeting ───────────────────────────────────────────────
  t.ok(/\{tab==="meeting"&&<MeetAgenda/.test(app), "4a the meeting agenda still renders on the Meet screen");
  t.ok(/meetTabs\.length<2/.test(app), "4b the guard is a length check, so any future single-tab row is hidden too");

  t.summary("meetTabsRow.test");
})();
