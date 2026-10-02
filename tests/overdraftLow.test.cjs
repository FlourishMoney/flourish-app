// tests/overdraftLow.test.cjs
// -----------------------------------------------------------------------------
// WATCH'S "PROJECTED OVERDRAFT" CARD QUOTES THE LOW POINT OF THE SAME FORECAST THAT RAISED IT
// (prelaunch-copy round 2, item 3; KNOWN-DEFECTS 3).
//
// The card's flag (willGoNegative) comes from ForecastEngine.generate(data, Math.max(range, 30)), at least
// 30 days. Its figure came from only the days on screen, so on the 7-day view a red overdraft warning
// quoted a healthy balance. MATH-LOCK, hand-worked:
//   $1,000 in chequing, no income, no spending history, one $1,500 rent bill due in 20 days.
//   Days 1 to 19: $1,000. Day 20: $1,000 - $1,500 = -$500.
//   before (7 days on screen):  the card said "$1,000", which is not an overdraft.
//   after  (the whole forecast): the card says "-$500", on day 20, within today and the next 30 days.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");

(async () => {
  const t = create();
  const { ForecastEngine } = await import("../src/lib/forecastEngine.js");
  const { forecastLow } = await import("../src/lib/forecastView.js");
  const T = new Date("2026-10-01T12:00:00");
  const due = new Date(T); due.setDate(due.getDate() + 20);
  const data = {
    accounts: [{ id: "a1", name: "Chequing", type: "depository", subtype: "checking", balance: 1000 }],
    incomes: [], transactions: [], debts: [],
    bills: [{ id: "b1", name: "Rent", amount: "1500", freq: "monthly", date: String(due.getDate()) }],
    profile: { country: "CA" },
  };
  const range = 7;
  const g = ForecastEngine.generate(data, Math.max(range, 30), null, T);
  t.eq(g.willGoNegative, true, "1a the forecast raises the overdraft flag");
  const onScreen = Math.min(...g.forecast.slice(0, range).map(f => f.balance));
  t.eq(onScreen, 1000, "1b (before: the 7 days on screen bottom out at $1,000, which is what the card used to quote)");
  const low = forecastLow(g.forecast);
  t.eq([low.balance, low.day], [-500, 20], "1c after: the card quotes -$500, on day 20, the low point of the same forecast");
  t.ok(low.date instanceof Date && low.date.getDate() === due.getDate(), "1d …on the rent's due date");
  t.eq([g.forecast.length, g.forecast[0].day, g.forecast[g.forecast.length - 1].day], [31, 0, 30], "1e …within the 30 days that forecast covers (today, then days 1 to 30)");
  t.eq(forecastLow([]), null, "1f an empty forecast has no low point");

  const app = fs.readFileSync(path.join(__dirname, "..", "src", "App.jsx"), "utf8");
  t.ok(/const \{ forecast: _forecast, willGoNegative: willGoNeg[^}]*\} = ForecastEngine\.generate\(data, Math\.max\(range, 30\)\);/.test(app)
    && /const lowPoint = forecastLow\(_forecast\);/.test(app), "2a Watch takes the low point from _forecast, the array willGoNeg came from");
  // watch-meet-fixes item 1: the card and the range summary quote ONE lowest balance. The flag is still
  // raised over at least 30 days (1a), so a 7-day view still hears about the day-20 rent; the figure is
  // the range's own low (summary.low, lib/watchRange.js), which at 30 and 90 days is the whole forecast's.
  t.ok(/within \{rangePhrase\(range\)\}\./.test(app) && !/before your next deposit/.test(app.slice(app.indexOf("Projected overdraft"), app.indexOf("Projected overdraft") + 1500)),
    "2b the card names the range it quotes, and no longer claims \"before your next deposit\"");
  t.ok(/could go below zero on \{firstNegative\?fmtOccDay\(firstNegative\.date\):"a day ahead"\}, after the range shown \(\{rangePhrase\(range\)\}\)\./.test(app) && /const dipInRange = !!\(rangeLow && rangeLow\.balance < 0\);/.test(app),
    "2c …and when the dip is after the range on screen (7 days, rent on day 20) it names the day and quotes no figure, so it cannot contradict the summary's lowest balance (tapFigures/watchRange tests pin both)");

  // ── 3. Rendered: the card names a day, and the list below shows that day ────────────────────
  // The low point is usually the eve of a payday, when nothing lands, so the list (paydays and bill
  // days only) used to skip it while the card pointed at it. The CA demo with $0 in cash, as of today.
  {
    const { loadApp, textOf, describe } = require("./_renderApp.cjs");
    const D = await import("../src/lib/demoFixture.js");
    const now = new Date();
    const broke = { accounts: D.demoAccountsFor("CA").map(a => (a.type === "checking" || a.type === "savings") ? { ...a, balance: 0 } : a),
      debts: D.demoDebtsFor("CA"), incomes: D.buildDemoIncomes(now, "CA"), bills: D.buildDemoBills(now, "CA"),
      transactions: D.buildDemoTxns(now, "CA"), profile: D.demoProfileFor("CA") };
    const gg = ForecastEngine.generate(broke, 30, null, now);
    const lp = forecastLow(gg.forecast);
    t.eq(gg.willGoNegative && lp.balance < 0, true, "3a (the $0-cash demo projects an overdraft)");
    let A = {}, txt = "";
    try { A = loadApp(["PlanAhead"]); txt = textOf(A.render(A.h(A.PlanAhead, { data: broke, setAppData: () => {}, setScreen: () => {} }))); }
    catch (e) { t.ok(false, `3 Watch renders: ${describe(e)}`); }
    const label = lp.date.toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric" });
    t.ok(txt.includes(`on ${label}, within today and the next 30 days.`), `3b the card names the low day (${label})`);
    t.ok(txt.split(label).length - 1 >= 2, "3c …and the day-by-day list shows that day too, under the card");
    t.ok(txt.includes("The day-by-day list below shows that day, and what lands on it."), "3d …which is what the card says");
  }

  t.summary("overdraftLow.test");
})();
