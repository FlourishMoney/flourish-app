// tests/noNegativeDeduction.test.cjs
// -----------------------------------------------------------------------------
// SAFE TO SPEND NEVER SHOWS A NEGATIVE DEDUCTION (prelaunch-copy round 2, item 4).
//
// A deduction is money committed: bills, debt minimums, the spending buffer, savings. None can be below
// zero. Clamped at the source (SafeSpendEngine's four components, and avgDailySpend under the buffer) and
// where safeToSpendView builds its rows. MATH-LOCK, hand-worked:
//   the CA demo on 2026-09-29 is unchanged: $3,083 - $65 - $348 - $435 - $291 = $1,944.
//   a negative daily-spend override (-$50/day) is never used: the buffer stays $435, headline $1,944.
//   a view handed a -$200 buffer: before, the row was hidden but still counted, so $1,000 - $100 + $200
//   - $50 = $1,050 under rows that add up to $850; after, the buffer is $0 and the headline is $850.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");

(async () => {
  const t = create();
  const { SafeSpendEngine } = await import("../src/lib/safeSpendEngine.js");
  const { safeToSpendView } = await import("../src/lib/safeToSpendView.js");
  const { FinancialCalcEngine } = await import("../src/lib/financialCalculations.js");
  const D = await import("../src/lib/demoFixture.js");
  const T = new Date("2026-09-29T12:00:00");
  const demo = () => ({ accounts: D.demoAccountsFor("CA"), debts: D.demoDebtsFor("CA"), incomes: D.buildDemoIncomes(T, "CA"),
    bills: D.buildDemoBills(T, "CA"), transactions: D.buildDemoTxns(T, "CA"), profile: D.demoProfileFor("CA") });
  const parts = (v) => v.deductions.map(d => d.display);

  // ── 1. The demo is unchanged ─────────────────────────────────────────────────────────────────
  const base = safeToSpendView(SafeSpendEngine.calculate(demo(), T));
  t.eq([base.balanceDisplay, ...parts(base), base.headline], [3083, 65, 348, 435, 291, 1944], "1a the CA demo: $3,083 - $65 - $348 - $435 - $291 = $1,944");

  // ── 2. A negative daily-spend override is never used ─────────────────────────────────────────
  const withNeg = { ...demo(), forecastEdits: { dailySpend: -50 } };
  t.ok(FinancialCalcEngine.avgDailySpend(withNeg) >= 0, "2a avgDailySpend never returns a negative figure, whatever the override says");
  const v2 = safeToSpendView(SafeSpendEngine.calculate(withNeg, T));
  t.eq([...parts(v2), v2.headline], [65, 348, 435, 291, 1944], "2b with a -$50/day override, the buffer stays $435 and the headline $1,944");
  t.ok(parts(v2).every(n => n >= 0), "2c …and no deduction is negative");

  // ── 3. The view never shows one, whatever it is handed ───────────────────────────────────────
  const v3 = safeToSpendView({ balance: 1000, upcomingBills: 100, debtPayments: 0, safetyBuf: -200, savingsAlloc: 50 });
  t.eq(parts(v3), [100, 0, 0, 50], "3a a -$200 buffer is shown as $0 (and its row is hidden)");
  t.eq(v3.headline, 850, "3b the headline is $1,000 - $100 - $50 = $850, not $1,050");
  const rowsSum = v3.rows.reduce((s, r) => s + (r.kind === "balance" ? r.display : -r.display), 0);
  t.eq(rowsSum, v3.headline, "3c the rows on screen add up to the headline");
  for (const k of ["upcomingBills", "debtPayments", "savingsAlloc"]) {
    const v = safeToSpendView({ balance: 500, upcomingBills: 0, debtPayments: 0, safetyBuf: 0, savingsAlloc: 0, [k]: -75 });
    t.eq([Math.min(...parts(v)), v.headline], [0, 500], `3d a negative ${k} is $0 too, and the headline is the balance`);
  }

  // ── 4. The engine never produces one ─────────────────────────────────────────────────────────
  const odd = [
    ["a negative income", { ...demo(), incomes: [{ id: 9, label: "Job", amount: "-3000", freq: "biweekly", type: "employment" }] }],
    ["refunds only", { ...demo(), transactions: [{ date: "2026-09-20", amount: -500, name: "Refund", cat: "Shopping" }] }],
    ["a negative debt minimum", { ...demo(), debts: [{ id: "d", name: "Visa", balance: "100", min: "-68" }] }],
  ];
  for (const [label, data] of odd) {
    const ss = SafeSpendEngine.calculate(data, T);
    t.ok([ss.upcomingBills, ss.debtPayments, ss.safetyBuf, ss.savingsAlloc].every(n => n >= 0), `4 ${label}: every engine deduction is $0 or more`);
  }

  t.summary("noNegativeDeduction.test");
})();
