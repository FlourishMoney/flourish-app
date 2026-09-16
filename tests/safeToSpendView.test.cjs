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
  // THE ASSERTION THIS SUITE OMITTED. It built the over-committed fixture by hand and then checked
  // only that the headline was clamped — never the one invariant the suite exists to defend. That is
  // how a breakdown that prints 100 − 200 = 0 shipped past a suite whose header claims the rows always
  // sum to the headline.
  {
    const rowSum3 = v3.rows.reduce((s, r) => s + (r.kind === "balance" ? r.display : -r.display), 0);
    t.eq(rowSum3, v3.headline, "the rows reconcile to the headline WHEN DEDUCTIONS EXCEED THE BALANCE too — the case the suite built and never checked");
  }

  // Non-finite inputs coerce to 0 (never NaN in the UI).
  const v4 = safeToSpendView({ balance: "oops", upcomingBills: undefined, debtPayments: null, safetyBuf: NaN, savingsAlloc: 50 });
  t.eq(v4.balanceDisplay, 0, "a non-numeric balance coerces to 0");
  // CHANGED, and deliberately: this asserted 0 only because the headline used to be clamped. Its real
  // intent is "never NaN in the UI", which is preserved and tightened. With balance "oops" (-> $0) and
  // savingsAlloc 50, $0 − $50 = −$50 is the honest answer, and the rows say so.
  t.ok(Number.isFinite(v4.headline), "the headline is always a finite number, never NaN");
  t.eq(v4.headline, -50, "…and with a $0 balance against $50 set aside it is -50, not a clamped 0");
  {
    const rowSum4 = v4.rows.reduce((s, r) => s + (r.kind === "balance" ? r.display : -r.display), 0);
    t.eq(rowSum4, v4.headline, "…and even that degenerate case reconciles");
  }
  t.eq(v4.isShort, true, "…and is flagged as over-committed so no surface calls it breathing room");
  t.eq(v4.shortfall, 50, "…with the shortfall named");

  // ── The minus glyph rule, on the other side of the line ────────────────────────────────────────
  // A breakdown row's "−" is an OPERATOR beside the label, so it is U+2212 and the value it sits next
  // to stays POSITIVE. (format.test pins the other half: a negative VALUE uses the ASCII hyphen.)
  {
    const v = safeToSpendView({ balance: 3083.88, upcomingBills: 65, debtPayments: 348, safetyBuf: 435, savingsAlloc: 291 });
    const ded = v.rows.filter(r => r.kind === "deduction");
    t.ok(ded.length > 0, "the sample has deduction rows to check");
    t.eq([...new Set(ded.map(r => r.sign))].join(""), "−", "a deduction row's sign is U+2212, the arithmetic operator — not an ASCII hyphen");
    t.eq(ded.filter(r => r.value.includes("-")).length, 0, "…and no row VALUE carries a sign: the operator is in the label, the number stays positive");
    t.eq(ded.filter(r => r.display <= 0).length, 0, "…which is only honest because every displayed deduction is a positive amount");
    t.eq(v.rows.find(r => r.kind === "balance").sign, "", "the balance row has no operator — it is the term being subtracted FROM");
  }

  t.summary("safeToSpendView.test");
})();
