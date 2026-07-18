// tests/reconcileBills.test.cjs — MATH-LOCK suite for manual-bill ⇄ observed reconciliation.
// Pure function, frozen fixtures, exact assertions. See src/lib/billReconcile.js.
"use strict";

const { create } = require("./_runner.cjs");

(async () => {
  const { reconcileBills, daysInMonth } = await import("../src/lib/billReconcile.js");
  const t = create();

  // Month anchors (any day within the month works; the fn uses year+month only).
  const APRIL = new Date(2026, 3, 10);  // April 2026 — 30 days
  const MARCH = new Date(2026, 2, 10);  // March 2026 — 31 days
  const FEB   = new Date(2026, 1, 10);  // Feb 2026 — 28 days (2026 not a leap year)

  // ── 1. Manual bill, NO matching transaction → appears at the entered amount ──────────────────────
  {
    const manual = [{ id: "b1", name: "Rent", amount: 1850, dayOfMonth: 1, recurring: true, variable: false, origin: "manual" }];
    const { forecastBills } = reconcileBills(manual, [], APRIL);
    t.eq(forecastBills.length, 1, "1: one forecast bill");
    t.eq(forecastBills[0].amount, 1850, "1: uses the entered amount");
    t.eq(forecastBills[0].matched, false, "1: not matched");
    t.eq(forecastBills[0].estimated, true, "1: flagged estimated");
  }

  // ── 2. Manual bill MATCHED by an observed txn → observed amount, not double-counted ─────────────
  {
    const manual = [{ id: "b2", name: "Hydro", amount: 120, dayOfMonth: 15, recurring: true, variable: false, origin: "manual" }];
    const observed = [{ id: "t1", name: "Hydro One", amount: 118.00, date: "2026-04-14" }]; // 14th, within ±3 of 15; 118 within ±5% of 120
    const { forecastBills } = reconcileBills(manual, observed, APRIL);
    t.eq(forecastBills.length, 1, "2: single entry (no double-count)");
    t.eq(forecastBills[0].amount, 118.00, "2: OBSERVED amount used, not the 120 estimate");
    t.ok(forecastBills[0].amount !== 120, "2: not the manual estimate");
    t.eq(forecastBills[0].matched, true, "2: matched");
    t.eq(forecastBills[0].estimated, false, "2: confirmed, not estimated");
  }

  // ── 3. VARIABLE bill matched → stored amount updated to observed (learns) ───────────────────────
  {
    const manual = [{ id: "b3", name: "Hydro", amount: 120, dayOfMonth: 15, recurring: true, variable: true, origin: "manual" }];
    const observed = [{ id: "t2", name: "Hydro One", amount: 143.50, date: "2026-04-16" }]; // variable → amount ignored, date within window
    const { forecastBills, updatedManualBills } = reconcileBills(manual, observed, APRIL);
    t.eq(forecastBills[0].amount, 143.50, "3: forecast uses observed amount");
    t.eq(forecastBills[0].matched, true, "3: matched on date window alone");
    t.eq(updatedManualBills[0].amount, 143.50, "3: stored manual amount LEARNED to observed");
    t.eq(manual[0].amount, 120, "3: original input not mutated (pure)");
  }

  // ── 4. Manual bill OUTSIDE the ±3-day window → not matched; both appear (different bills) ────────
  {
    const manual = [{ id: "b4", name: "Gym", amount: 60, dayOfMonth: 5, recurring: true, variable: false, origin: "manual" }];
    const observed = [{ id: "t3", name: "Something", amount: 60, date: "2026-04-20" }]; // 15 days away → NOT the same bill
    const { forecastBills } = reconcileBills(manual, observed, APRIL);
    t.eq(forecastBills[0].matched, false, "4: unmatched — 15 days apart");
    t.eq(forecastBills[0].amount, 60, "4: manual bill still appears at its amount");
  }

  // ── 5. dayOfMonth 31 in a 30-day month → clamps to the last day ─────────────────────────────────
  {
    const manual = [{ id: "b5", name: "Card", amount: 100, dayOfMonth: 31, recurring: true, variable: false, origin: "manual" }];
    const aprBill = reconcileBills(manual, [], APRIL).forecastBills[0];
    t.eq(aprBill.dueDay, 30, "5: April (30d) → day 30");
    t.eq(aprBill.date, "30", "5: date string clamped to 30");
    const marBill = reconcileBills(manual, [], MARCH).forecastBills[0];
    t.eq(marBill.dueDay, 31, "5: March (31d) → day 31 unchanged");
    const febBill = reconcileBills(manual, [], FEB).forecastBills[0];
    t.eq(febBill.dueDay, 28, "5: Feb 2026 (28d) → day 28");
  }

  // ── 6. VARIABLE match ignores amount entirely (huge diff still matches on date) ──────────────────
  {
    const manual = [{ id: "b6", name: "Var", amount: 50, dayOfMonth: 10, recurring: true, variable: true, origin: "manual" }];
    const observed = [{ id: "t4", name: "Var", amount: 210, date: "2026-04-11" }];
    const { forecastBills } = reconcileBills(manual, observed, APRIL);
    t.eq(forecastBills[0].matched, true, "6: variable matches on date despite 4x amount");
    t.eq(forecastBills[0].amount, 210, "6: uses observed 210");
  }

  // ── 7. Non-variable JUST outside ±5% amount → no match ──────────────────────────────────────────
  {
    const manual = [{ id: "b7", name: "Phone", amount: 100, dayOfMonth: 12, recurring: true, variable: false, origin: "manual" }];
    const observed = [{ id: "t5", name: "Phone", amount: 106, date: "2026-04-12" }]; // 6% off, same day → still no match
    const { forecastBills } = reconcileBills(manual, observed, APRIL);
    t.eq(forecastBills[0].matched, false, "7: 6% > ±5% tolerance → not matched");
    t.eq(forecastBills[0].amount, 100, "7: manual estimate stands");
  }

  // ── 8. Boundary: exactly ±3 days and exactly ±5% both match ─────────────────────────────────────
  {
    const manual = [{ id: "b8", name: "Net", amount: 100, dayOfMonth: 15, recurring: true, variable: false, origin: "manual" }];
    const observed = [{ id: "t6", name: "Net", amount: 105, date: "2026-04-18" }]; // +3 days, +5% exactly
    const { forecastBills } = reconcileBills(manual, observed, APRIL);
    t.eq(forecastBills[0].matched, true, "8: exactly +3 days / +5% is inclusive");
    t.eq(forecastBills[0].amount, 105, "8: observed used");
  }

  // ── 9. daysInMonth helper sanity ────────────────────────────────────────────────────────────────
  {
    t.eq(daysInMonth(2026, 1), 28, "9: Feb 2026 = 28");
    t.eq(daysInMonth(2024, 1), 29, "9: Feb 2024 (leap) = 29");
    t.eq(daysInMonth(2026, 3), 30, "9: April = 30");
    t.eq(daysInMonth(2026, 11), 31, "9: Dec = 31");
  }

  t.summary("reconcileBills.test");
})();
