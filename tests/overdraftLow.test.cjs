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
//   after  (the whole forecast): the card says "-$500", on day 20, within the next 30 days.
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
    && /const low = forecastLow\(_forecast\);/.test(app), "2a Watch takes the low point from _forecast, the array willGoNeg came from");
  t.ok(/const forecastDays = Math\.max\(range, 30\);/.test(app) && /within the next \{forecastDays\} days\./.test(app) && !/dip to <strong[^>]*>\{formatBalance\(minBalance\)\}<\/strong> before your next deposit/.test(app),
    "2b the card names the window it looked at, and no longer claims \"before your next deposit\"");
  t.ok(/low\.day > range \? "That day is past the range shown\. Pick a longer range above to see it\."/.test(app), "2c …and says when that day is past the range on screen");

  t.summary("overdraftLow.test");
})();
