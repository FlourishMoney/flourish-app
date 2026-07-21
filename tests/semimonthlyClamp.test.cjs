// tests/semimonthlyClamp.test.cjs
// -----------------------------------------------------------------------------
// Sprint C Fix 4 — semimonthly high-anchor paycheque drop (clamp collision).
//
// The unified income path computed the two semimonthly days as anchor and anchor+15, then clamped
// both. For anchor ≥ month-end, anchor+15 overflowed and BOTH clamped to the last day — the two
// deposits collapsed into one, halving the month's income (anchor 31 → 1 payday, full amount lost).
// A semimonthly income must pay TWICE; the fix relocates the colliding second deposit to a distinct
// earlier day rather than dropping it.
//
// Frozen dates only.
// -----------------------------------------------------------------------------
"use strict";

const { create } = require("./_runner.cjs");

(async () => {
  const { semimonthlyDays } = await import("../src/lib/financialCalculations.js");
  const { ForecastEngine } = await import("../src/lib/forecastEngine.js");
  const t = create();

  // ── The pure calendar helper — two DISTINCT days, across every month length ──────────────────────
  // anchor 31 → (31, 46). Feb non-leap, Feb leap, 30-day, 31-day.
  t.eq(semimonthlyDays(31, 46, 2026, 1), [16, 28], "anchor 31, Feb 2026 (28d) → two distinct days [16,28], not [28]");
  t.eq(semimonthlyDays(31, 46, 2028, 1), [16, 29], "anchor 31, Feb 2028 LEAP (29d) → [16,29]");
  t.eq(semimonthlyDays(31, 46, 2026, 3), [16, 30], "anchor 31, Apr 2026 (30d) → [16,30]");
  t.eq(semimonthlyDays(31, 46, 2026, 2), [16, 31], "anchor 31, Mar 2026 (31d) → [16,31]");
  // anchor 30 → (30, 45) collides in Feb and 30-day months.
  t.eq(semimonthlyDays(30, 45, 2026, 1), [15, 28], "anchor 30, Feb → collision resolved to [15,28]");
  t.eq(semimonthlyDays(30, 45, 2026, 3), [15, 30], "anchor 30, Apr (30d) → [15,30]");
  t.eq(semimonthlyDays(30, 45, 2026, 2), [30, 31], "anchor 30, Mar (31d) → [30,31]: 30 exists and 45 clamps to 31, distinct (no collision)");

  // NON-collision anchors must be UNCHANGED (minimal change guarantee).
  t.eq(semimonthlyDays(20, 35, 2026, 1), [20, 28], "anchor 20, Feb → [20,28] UNCHANGED (already 2 paydays)");
  t.eq(semimonthlyDays(16, 31, 2026, 1), [16, 28], "anchor 16, Feb → [16,28], two distinct");
  t.eq(semimonthlyDays(15, 30, 2026, 1), [15, 28], "anchor 15, Feb → [15,28] (15th-and-month-end) UNCHANGED");
  t.eq(semimonthlyDays(1, 15, 2026, 1), [1, 15], "no-anchor default (1,15) → [1,15] UNCHANGED");
  t.eq(semimonthlyDays(1, 15, 2026, 5), [1, 15], "default holds in a 30-day month too");

  // ── Integration: every high anchor pays TWICE with FULL income, across month types ──────────────
  const AMT = 1000;
  const mk = (anchorDay) => ({
    accounts: [{ id: "chq", name: "Chq", type: "depository", subtype: "checking", balance: 100 }],
    incomes: [{ id: 1, label: "Semi", amount: String(AMT), freq: "semimonthly", anchorDay }],
    bills: [], debts: [], transactions: [],
  });
  const paydaysIn = (fc, y, m) => fc.filter(e => e.isPayday && e.date.getFullYear() === y && e.date.getMonth() === m);
  const incomeIn  = (fc, y, m) => fc.filter(e => e.date.getFullYear() === y && e.date.getMonth() === m)
                                     .reduce((s, e) => s + e.income, 0);

  // 2026 is NOT a leap year; run the whole year so Feb (28), 30-day and 31-day months are all covered.
  const START_2026 = new Date(2026, 0, 1, 12, 0, 0);
  for (const anchor of [16, 20, 25, 28, 30, 31]) {
    const { forecast } = ForecastEngine.generate(mk(anchor), 365, null, START_2026);
    for (const [label, y, m] of [["Feb(28)", 2026, 1], ["Apr(30)", 2026, 3], ["Mar(31)", 2026, 2], ["Jun(30)", 2026, 5]]) {
      const pds = paydaysIn(forecast, y, m);
      t.eq(pds.length, 2,
           `anchor ${anchor}, ${label}: TWO distinct paydays (was 1 for high anchors — the collapse bug)`);
      t.eq(new Set(pds.map(e => e.date.getDate())).size, 2,
           `anchor ${anchor}, ${label}: the two paydays are on DISTINCT days`);
      t.eq(incomeIn(forecast, y, m), 2 * AMT,
           `anchor ${anchor}, ${label}: FULL month income $${2 * AMT} (two $${AMT} deposits), not half`);
    }
  }

  // Leap-year February: anchor 31 must pay on the 29th (and a distinct earlier day).
  {
    const { forecast } = ForecastEngine.generate(mk(31), 90, null, new Date(2028, 0, 15, 12, 0, 0));
    const feb = paydaysIn(forecast, 2028, 1);
    t.eq(feb.length, 2, "anchor 31, Feb 2028 LEAP: two paydays");
    t.ok(feb.some(e => e.date.getDate() === 29), "…one of them lands on Feb 29 (the clamped month-end)");
    t.eq(incomeIn(forecast, 2028, 1), 2 * AMT, "…and full income in leap February");
  }

  // ── anchor 15 and no-anchor default: unchanged end-to-end ───────────────────────────────────────
  {
    const anchored15 = ForecastEngine.generate(mk(15), 90, null, START_2026).forecast;
    const feb15 = paydaysIn(anchored15, 2026, 1).map(e => e.date.getDate()).sort((a, b) => a - b);
    t.eq(feb15.join(","), "15,28", "anchor 15 still pays 15th and month-end (Feb 28) — unchanged");

    const noAnchor = {
      accounts: [{ id: "chq", name: "Chq", type: "depository", subtype: "checking", balance: 100 }],
      incomes: [{ id: 1, label: "Semi", amount: "1000", freq: "semimonthly" }], // no anchorDay
      bills: [], debts: [], transactions: [],
    };
    const fcNo = ForecastEngine.generate(noAnchor, 90, null, START_2026).forecast;
    const febNo = paydaysIn(fcNo, 2026, 1).map(e => e.date.getDate()).sort((a, b) => a - b);
    t.eq(febNo.join(","), "1,15", "no-anchor default still pays the 1st and 15th — unchanged");
  }

  // ── Day-0 exclusion preserved: a payday landing on 'today' is not credited on day 0 ─────────────
  {
    // Start ON the 15th, a default-semimonthly payday. Day 0 must still credit nothing.
    const noAnchor = {
      accounts: [{ id: "chq", name: "Chq", type: "depository", subtype: "checking", balance: 5000 }],
      incomes: [{ id: 1, label: "Semi", amount: "1000", freq: "semimonthly" }],
      bills: [], debts: [], transactions: [],
    };
    const fc = ForecastEngine.generate(noAnchor, 30, null, new Date(2026, 5, 15, 12, 0, 0)).forecast;
    t.eq(fc[0].income, 0, "day 0 credits no semimonthly income even when today is a payday (already banked)");
    t.eq(fc[0].balance, 5000, "…so day 0 holds the real opening balance");
  }

  t.summary("semimonthlyClamp.test");
})();
