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
//
// COUPLE MODE (2026-10-29): the mock Household tab and its HOUSEHOLD_ENABLED flag are gone (Amanda: nothing
// may suggest a feature that is not real). The real household is Settings > Household. Sections 1 and 3 now
// pin that: no flag and no Household tab here, and a row given a second tab still renders.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");

(async () => {
  const t = create();
  const app = fs.readFileSync(path.join(__dirname, "..", "src", "App.jsx"), "utf8");

  // ── 1. The mock is gone ──────────────────────────────────────────────────────────────────────
  t.ok(!/HOUSEHOLD_ENABLED/.test(app), "1a the mock's HOUSEHOLD_ENABLED flag is gone from App.jsx");
  t.ok(!/\["household",\s*"Household"\]/.test(app), "1b …and the Meet row has no Household tab (the real one is Settings > Household)");

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
  // extra: a second tab put into the row's own declaration, to show the guard lets a real row of two through.
  const run = (isCouple, extra = false) => new Function("isCouple",
    `return (() => { ${extra ? rowSrc.replace("const meetTabs=[", 'const meetTabs=[["extra","Extra"],') : rowSrc} return meetTabs; })();`)(isCouple);

  t.eq(run(false), null, "2b solo: the row is hidden, not a single dead tab");
  t.eq(run(true), null, "2c couple: hidden too");

  // What it would have rendered — the dead control this defect is about.
  const wouldHaveShown = new Function("isCouple",
    `return (() => { ${app.slice(start, app.indexOf(";", start) + 1)} return meetTabs; })();`);
  t.eq(wouldHaveShown(true).length, 1, "2d …and it really would have been ONE tab");
  t.eq(wouldHaveShown(true)[0][1], "Money Meeting", "2e …labelled 'Money Meeting' for a couple");
  t.eq(wouldHaveShown(false)[0][1], "Check-In", "2f …'Check-In' for a solo user");

  // ── 3. The day the row holds a second, real tab, it renders ──────────────────────────────────
  {
    const tabs = run(true, true);
    t.ok(Array.isArray(tabs), "3a two tabs: the row renders");
    t.eq(tabs.length, 2, "3b …with both");
    t.eq(tabs.map(x => x[0]).join(","), "extra,meeting", "3c …the added one and the meeting");
    t.eq(run(false, true).length, 2, "3d …and the same for a solo user");
  }

  // ── 4. Hiding the row did not hide the meeting ───────────────────────────────────────────────
  t.ok(/\{tab==="meeting"&&<MeetAgenda/.test(app), "4a the meeting agenda still renders on the Meet screen");
  t.ok(/meetTabs\.length<2/.test(app), "4b the guard is a length check, so any future single-tab row is hidden too");

  t.summary("meetTabsRow.test");
})();
