// tests/watchRange.test.cjs
// -----------------------------------------------------------------------------
// THE WATCH SCREEN MUST SHOW AS FAR AS ITS HEADER PROMISES.
//
// The header has always read "The next 90 days", and the range toggle offered 7 or 14. So the list
// stopped a fortnight out, and in the demo household that meant the only events a viewer could ever
// see were a $65 phone bill and a paycheque. Rent — $1,650, the largest bill and the one that
// actually makes a week tight — falls on day 26 and was never on screen at any setting.
//
// This is not a cosmetic range. The forecast's lowest point IS the rent dip, so a 14-day view
// showed a household whose balance only ever goes up.
//
// Frozen "now", so the assertions do not drift with the calendar.
// -----------------------------------------------------------------------------
"use strict";

const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");

const NOW = new Date("2026-09-24T12:00:00Z");

(async () => {
  const t = create();
  const { ForecastEngine } = await import("../src/lib/forecastEngine.js");
  const demo = await import("../src/lib/demoFixture.js");

  const data = {
    accounts: demo.demoAccountsFor("CA"),
    bills: demo.buildDemoBills(NOW, "CA"),
    incomes: demo.buildDemoIncomes(NOW, "CA"),
    debts: demo.demoDebtsFor("CA"),
    transactions: demo.buildDemoTxns(NOW, "CA"),
    profile: demo.demoProfileFor("CA"),
  };

  const billNamesWithin = (days) => {
    const { forecast } = ForecastEngine.generate(data, days, null, NOW);
    return new Set(forecast.slice(0, days).flatMap((f) => (f.bills || []).map((b) => b.name)));
  };
  const lowestWithin = (days) => {
    const { forecast } = ForecastEngine.generate(data, Math.max(days, 30), null, NOW);
    return Math.min(...forecast.slice(0, days).map((f) => f.balance));
  };

  // ── 1. What each range can actually show ─────────────────────────────────────────────────────
  const at14 = billNamesWithin(14);
  const at30 = billNamesWithin(30);
  const at90 = billNamesWithin(90);
  t.ok(at14.has("Phone"), "1a the old 14-day view showed the phone bill");
  t.eq(at14.has("Rent"), false, "1b …and could never show the rent, which falls on day 26");
  t.ok(at30.has("Rent"), "1c 30 days reaches the rent — which is why 30 is the default");
  t.ok(at30.has("Hydro") && at30.has("Netflix"), "1d …and the other two bills with it");
  t.ok(at90.has("Rent"), "1e 90 days still shows it");
  t.ok(at90.size >= at30.size, "1f a longer range never shows fewer bills than a shorter one");

  // ── 2. How much of the household's month is actually visible ─────────────────────────────────
  // Worth recording what this fix does NOT do: the forecast's lowest balance is in the first two
  // weeks, before the first paycheque lands — not at the rent. Rent is the biggest thing coming,
  // not the deepest dip. The range change is about what a household can SEE coming.
  const billTotalWithin = (days) => {
    const { forecast } = ForecastEngine.generate(data, Math.max(days, 30), null, NOW);
    return forecast.slice(0, days).reduce((sum, f) => sum + (f.bills || []).reduce((a, b) => a + Number(b.amount || 0), 0), 0);
  };
  const owed14 = billTotalWithin(14), owed30 = billTotalWithin(30);
  t.ok(owed30 > owed14 * 3, `2a a month shows far more of what is owed than a fortnight ($${Math.round(owed14)} vs $${Math.round(owed30)})`);
  t.ok(owed30 - owed14 >= 1650, "2b …including the rent, the largest single bill, which 14 days never reached");
  const low14 = lowestWithin(14), low30 = lowestWithin(30);
  t.ok(low30 <= low14, "2c a longer view never reports a HIGHER low than a shorter one");

  // ── 3. The engine is asked for the range that was picked ─────────────────────────────────────
  // Math.max(range, 30) is what the screen calls: the risk flags read 30 days ahead even on the
  // 7d view, and 90 must pass straight through rather than being clamped to 30.
  // The engine returns today plus N days, so 90 days is 91 entries.
  t.eq(ForecastEngine.generate(data, Math.max(90, 30), null, NOW).forecast.length, 91,
    "3a asking for 90 returns today plus 90 days");
  t.eq(ForecastEngine.generate(data, Math.max(7, 30), null, NOW).forecast.length, 31,
    "3b …and the 7d view still projects 30 behind the scenes, so the risk flags keep their horizon");

  // ── 4. The screen offers those ranges ────────────────────────────────────────────────────────
  const app = fs.readFileSync(path.join(__dirname, "..", "src", "App.jsx"), "utf8");
  t.ok(/const RANGES = \[7, 30, 90\];/.test(app), "4a the Watch screen offers 7, 30 and 90 days");
  t.ok(/const \[range,setRange\]=useState\(30\);/.test(app), "4b …and opens on 30");
  t.ok(!/\{\[7,14\]\.map/.test(app), "4c the old 7/14 toggle is gone");
  t.ok(/ForecastEngine\.generate\(data, Math\.max\(range, 30\)\)/.test(app),
    "4d the engine is still called with Math.max(range, 30), so 90 passes through and 7 does not shrink the risk window");
  t.ok(/The next 90 days\./.test(app), "4e the header still promises 90 days — now it can keep the promise");

  // ── 5. The balance bar must not call a healthy forecast dangerous ────────────────────────────
  // Bar paints RED when its value exceeds its max. The old scale was "balance + one paycheque",
  // which a fortnight never outgrew and a month does — so widening the range without widening the
  // scale would have turned every balance after the second paycheque into a danger bar.
  {
    const { forecast } = ForecastEngine.generate(data, 30, null, NOW);
    const balances = forecast.slice(0, 30).map((f) => f.balance);
    const highest = Math.max(...balances);
    const oldScale = balances[0] + 2840;          // starting balance + one real paycheque
    t.ok(highest > oldScale,
      `5a the demo's 30-day forecast does outgrow the old scale ($${Math.round(highest)} vs $${Math.round(oldScale)}) — the red-bar bug was real`);
    t.ok(/const barMax = Math\.max\(bal \+ income, \.\.\.days\.map\(d => d\.balance\), 1\);/.test(app),
      "5b the scale now covers the whole range on screen");
    t.ok(/<Bar v=\{Math\.max\(0,day\.balance\)\} max=\{barMax\}/.test(app),
      "5c …and the day-by-day bar uses it");
    t.ok(!/max=\{bal\+income\}/.test(app), "5d the fortnight-only scale is gone");
  }

  t.summary("watchRange.test");
})();
