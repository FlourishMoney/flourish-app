// tests/suggestedDaily.test.cjs
// -----------------------------------------------------------------------------
// Consolidation 1: the ONE suggested daily-spend pace. Pins the floored-14 divisor
// (kept from computeDailySpendLimit), that a weekly figure is EXACTLY daily*7 (never a
// second division of safe), and that the number is single-valued given the facts.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");

(async () => {
  const { suggestedDailyView } = await import("../src/lib/suggestedDaily.js");
  const t = create();

  const P = (date, amt) => ({ name: "Payroll Deposit", amount: -amt, cat: "Income", date });
  const incomes = [{ id: 1, label: "Job", amount: "2000", freq: "biweekly" }];
  const txns = [P("2026-06-24", 2000)];

  // Deposit is tomorrow (Jul 8) → the divisor is floored to 14, not 1.
  const v = suggestedDailyView(2100, incomes, txns, new Date("2026-07-07T12:00:00"));
  t.eq(v.daysLeft, 14, "divisor floored at 14 even when the deposit is tomorrow");
  t.eq(v.daily, 150, "daily = floor(2100 / 14) = 150 (not floor(2100/1))");
  t.eq(v.weekly, v.daily * 7, "weekly is EXACTLY daily * 7");
  t.eq(v.weekly, 1050, "weekly = 1050");
  t.eq(v.dailyText, "$150", "daily formatted through the shared formatter");
  t.eq(v.weeklyText, "$1,050", "weekly formatted with a separator");

  // A genuinely longer horizon (16 days) is used as-is, above the floor.
  const v2 = suggestedDailyView(3000, [{ amount: "4000", freq: "monthly", anchorDay: 1 }], [], new Date("2026-06-15T12:00:00"));
  t.eq(v2.daysLeft, 16, "a 16-day horizon is used (above the 14 floor)");
  t.eq(v2.daily, 187, "daily = floor(3000 / 16) = 187");
  t.eq(v2.weekly, v2.daily * 7, "weekly = daily * 7 for the longer horizon too");

  // The pace is strictly the 14-floored number, never the old safe/7.
  t.ok(v.daily <= Math.floor(2100 / 7), "the daily pace is <= the old safe/7 figure (uses the floored divisor)");

  // Zero / no safe → zero pace, no NaN.
  const v3 = suggestedDailyView(0, incomes, txns, new Date("2026-07-07T12:00:00"));
  t.eq(v3.daily, 0, "zero safe → zero daily");
  t.eq(v3.weekly, 0, "zero safe → zero weekly");

  // Single-valued: same inputs → same output.
  const a = suggestedDailyView(2100, incomes, txns, new Date("2026-07-07T12:00:00"));
  t.eq(a.daily, v.daily, "single-valued: identical inputs yield the identical daily figure");

  t.summary("suggestedDaily.test");
})();
