// tests/dailySpendWindow.test.cjs — MATH-LOCK
// -----------------------------------------------------------------------------
// EST. DAILY SPEND IS THE LAST 90 DAYS OF SPENDING, HOWEVER MUCH HISTORY THE DEVICE HOLDS
// (audit of 2026-11-13, finding 12).
//
// avgDailySpendEstimate added up EVERY transaction held and divided by the span of their dates, capped at 90 days.
// Nothing trims old transactions on a device, so once it held more than 90 days of history the total kept growing
// and the divisor did not: a steady $50 a day read $100 after 180 days and $203 after a year. The figure feeds
// "Est. daily spend", every day of the forecast, the spending buffer in safe to spend and what the coach is told.
//
// THE RULE: only spending in the 90 days up to the latest transaction held is added up, and it is divided by the
// span of those dates (at least 14 days, as before). The window ends at the latest transaction, not at the clock,
// so a device that has not refreshed for a while still averages the last 90 days it knows about.
//
//   1  a steady $50 a day reads the same with 90, 180, 365 or 730 days of history (and as before with less)
//   2  spending older than 90 days does not leak in, however large
//   3  safe to spend's buffer and the forecast's daily figure follow
//   4  the household's own "Est. daily spend" still wins
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");

(async () => {
  const t = create();
  const { FinancialCalcEngine } = await import("../src/lib/financialCalculations.js");
  const { SafeSpendEngine } = await import("../src/lib/safeSpendEngine.js");
  const { ForecastEngine } = await import("../src/lib/forecastEngine.js");

  const END = "2026-11-12";                                   // the latest transaction held
  const iso = (daysAgo) => new Date(Date.UTC(2026, 10, 12) - daysAgo * 86400000).toISOString().slice(0, 10);
  // One purchase a day for `days` days ending on END; `amountFor(daysAgo)` is that day's amount.
  const history = (days, amountFor = () => 50) => Array.from({ length: days }, (_, k) => ({ id: "s" + k, name: "Corner Grocery", amount: amountFor(k), date: iso(k), cat: "Groceries" }));
  const est = (txns, extra = {}) => Math.round(FinancialCalcEngine.avgDailySpendEstimate({ transactions: txns, bills: [], debts: [], ...extra }) * 100) / 100;

  // ── 1. A steady $50 a day ───────────────────────────────────────────────────────────────────────
  {
    t.eq(est(history(10)), 35.71, "1a 10 days of history: as before (the divisor is never under 14 days)");
    t.eq(est(history(30)), 51.72, "1b 30 days: as before");
    t.eq(est(history(90)), 50.56, "1c 90 days: as before");
    t.eq(est(history(180)), 50.56, "1d 180 days: the same $50.56 (was $100.00)");
    t.eq(est(history(365)), 50.56, "1e a year: the same (was $202.78)");
    t.eq(est(history(730)), 50.56, "1f two years: the same (was $405.56)");
  }

  // ── 2. Old spending does not leak in ───────────────────────────────────────────────────────────
  {
    t.eq(est(history(200, (k) => (k >= 90 ? 500 : 50))), 50.56, "2a $500 a day until 90 days ago, $50 a day since: $50.56");
    t.eq(est([...history(20), { id: "old", name: "Furniture Store", amount: 3000, date: iso(400), cat: "Shopping" }]), est(history(20)),
         "2b one large purchase 400 days ago changes nothing");
    t.eq(est(history(120, (k) => (k < 30 ? 80 : 40))), Math.round(((30 * 80 + 60 * 40) / 89) * 100) / 100, "2c the window is the latest 90 days: 30 at $80 and 60 at $40");
    // The window ends at the latest transaction held, not at today's date.
    const stale = history(180).map((x) => ({ ...x, date: new Date(Date.parse(x.date) - 60 * 86400000).toISOString().slice(0, 10) }));
    t.eq(est(stale), 50.56, "2d a device whose newest transaction is 60 days old still averages its last 90 days");
  }

  // ── 3. What reads it ──────────────────────────────────────────────────────────────────────────
  {
    const today = new Date(2026, 10, 13, 10);
    const house = (txns) => ({ profile: { country: "CA" }, accounts: [{ id: "a", type: "depository", subtype: "checking", balance: 5000 }],
      incomes: [{ id: 1, label: "Job", amount: "2400", freq: "biweekly", nextPayDate: "2026-11-26" }], bills: [], debts: [], transactions: txns });
    const buf = (txns) => SafeSpendEngine.calculate(house(txns), today).safetyBuf;
    t.eq(buf(history(365)), buf(history(90)), "3a the spending buffer with a year of history equals the one with 90 days");
    t.eq(buf(history(365)), 657.3, "3b 13 days at $4,500 / 89 a day: $657.30 (was $2,636.11)");
    const day5 = (txns) => Math.round(ForecastEngine.generate(house(txns), 14, null, today).forecast[5].balance);
    t.eq(day5(history(365)), day5(history(90)), "3c the forecast takes the same daily spending either way");
  }

  // ── 4. The household's own figure ──────────────────────────────────────────────────────────────
  {
    const d = { transactions: history(365), bills: [], debts: [], forecastEdits: { dailySpend: 42 } };
    t.eq(FinancialCalcEngine.avgDailySpend(d), 42, "4a an Est. daily spend the household set is used as it is");
    t.eq(est([]), 0, "4b no spending: 0");
  }

  t.summary("dailySpendWindow");
})();
