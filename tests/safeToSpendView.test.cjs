// tests/safeToSpendView.test.cjs
// -----------------------------------------------------------------------------
// Truth-fix item 5: the single safe-to-spend presentation view-model. The point of
// this suite is the RECONCILIATION invariant — the displayed rows sum EXACTLY to the
// displayed headline — plus the rounding policy (balance down, deductions up, headline
// from the displayed components so it never overstates the raw safe amount).
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");

(async () => {
  const { safeToSpendView } = await import("../src/lib/safeToSpendView.js");
  const t = create();

  // The exact scenario from the brief: 3083 - 65 - 348 - 335 - 224 = 2111 against a raw 2111.88.
  const ss = { balance: 3083.88, upcomingBills: 64.2, debtPayments: 348, safetyBuf: 334.1, savingsAlloc: 223.4, safeAmount: 2111.88 };
  const v = safeToSpendView(ss);

  t.eq(v.balanceDisplay, 3083, "balance rounds DOWN (3083.88 -> 3083)");
  t.eq(v.deductions.find(d => d.key === "upcomingBills").display, 65, "deduction rounds UP (64.2 -> 65)");
  t.eq(v.deductions.find(d => d.key === "safetyBuf").display, 335, "deduction rounds UP (334.1 -> 335)");
  t.eq(v.deductions.find(d => d.key === "savingsAlloc").display, 224, "deduction rounds UP (223.4 -> 224)");
  t.eq(v.deductions.find(d => d.key === "debtPayments").display, 348, "a whole-dollar deduction is unchanged");
  t.eq(v.headline, 2111, "headline = 3083 - 65 - 348 - 335 - 224 = 2111 (from the DISPLAYED components)");
  t.eq(v.headlineText, "$2,111", "headline is formatted with the shared formatter");
  t.eq(v.headlineNumber, "2,111", "headlineNumber has separators but no symbol (for surfaces with their own $)");

  // Reconciliation invariant: the displayed rows sum EXACTLY to the displayed headline.
  const rowSum = v.rows.reduce((s, r) => s + (r.kind === "balance" ? r.display : -r.display), 0);
  t.eq(rowSum, v.headline, "displayed rows reconcile EXACTLY to the displayed headline");

  // Never overstates the raw safe amount.
  t.ok(v.headline <= ss.safeAmount, "displayed headline never exceeds the raw safe amount");

  // Zero deductions are hidden but still leave the equation exact.
  const v2 = safeToSpendView({ balance: 1000, upcomingBills: 0, debtPayments: 0, safetyBuf: 0, savingsAlloc: 0, safeAmount: 1000 });
  t.eq(v2.rows.length, 1, "zero deductions are hidden — only the balance row shows");
  t.eq(v2.headline, 1000, "headline equals the balance when there are no deductions");

  // Headline floors at 0 (never negative).
  const v3 = safeToSpendView({ balance: 100, upcomingBills: 200, debtPayments: 0, safetyBuf: 0, savingsAlloc: 0, safeAmount: 0 });
  t.eq(v3.headline, 0, "headline never goes negative");

  // Non-finite inputs coerce to 0 (never NaN in the UI).
  const v4 = safeToSpendView({ balance: "oops", upcomingBills: undefined, debtPayments: null, safetyBuf: NaN, savingsAlloc: 50 });
  t.eq(v4.balanceDisplay, 0, "a non-numeric balance coerces to 0");
  t.eq(v4.headline, 0, "and the headline stays 0, not NaN");

  t.summary("safeToSpendView.test");
})();
