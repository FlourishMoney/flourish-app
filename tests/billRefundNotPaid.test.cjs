// tests/billRefundNotPaid.test.cjs — MATH-LOCK
// -----------------------------------------------------------------------------
// A REFUND NEVER MARKS A BILL PAID (code audit of e94b112, item 15).
//
// The old calendar-month matcher compared amounts with Math.abs, so money IN with a bill's amount and merchant
// dropped the bill: $2,000 in chequing, $500 rent due Oct 28, payday Oct 30, and a $500 rent refund received:
// safe to spend went $1,442 -> $1,942. The one "already paid" rule (forecastEdits.js billArrived, the B1 fix) takes
// only a payment out, and never a transfer between the household's own accounts, a refund, a reversal or a return,
// and it marks the one occurrence the payment is nearest to.
//   1  the exact case, to the dollar, on Today, Due soon and Watch
//   2  a real payment still pays it; a transfer, a refund or reversal paid out, or a pending payment does not
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");

(async () => {
  const t = create();
  const { SafeSpendEngine } = await import("../src/lib/safeSpendEngine.js");
  const { safeToSpendView } = await import("../src/lib/safeToSpendView.js");
  const { ForecastEngine } = await import("../src/lib/forecastEngine.js");
  const FE = await import("../src/lib/forecastEdits.js");
  const today = new Date(2026, 9, 26, 10);
  const house = (transactions = []) => ({
    accounts: [{ id: "a", type: "depository", subtype: "checking", balance: 2000 }],
    incomes: [{ id: "i", label: "Job", amount: 2000, freq: "biweekly", nextPayDate: "2026-10-30" }],
    bills: [{ id: "r", name: "Rent", amount: 500, date: "28", freq: "monthly" }], debts: [], transactions,
  });
  const safe = (d) => safeToSpendView(SafeSpendEngine.calculate(d, today)).headline;
  // Money out also starts a spending buffer, so part 2 reads the bill reservation itself.
  const rent = (d) => SafeSpendEngine.calculate(d, today).upcomingBills;

  // ── 1. The exact case ───────────────────────────────────────────────────────────────────────────
  {
    t.eq(safe(house()), 1442, "1a no transactions: $2,000 − $500 rent − $58 savings = $1,442");
    const refund = house([{ id: "x", name: "Rent", amount: -500, date: "2026-10-25" }]);
    const ss = SafeSpendEngine.calculate(refund, today);
    t.eq([safe(refund), ss.upcomingBills, ss.billsDueSoon.map((b) => `${b.name} ${b.amount} ${FE.isoOf(b.date)}`)], [1442, 500, ["Rent 500 2026-10-28"]],
      "1b a $500 rent refund received: still $1,442 (was $1,942), and Due soon still lists Oct 28 rent");
    const fc = ForecastEngine.generate(refund, 4, null, today);
    t.ok(fc.forecast.some((f) => FE.isoOf(f.date) === "2026-10-28" && f.bills.some((b) => b.name === "Rent" && b.amount === 500)), "1c Watch still takes the rent out on Oct 28");
  }

  // ── 2. What pays a bill, and what does not ──────────────────────────────────────────────────────
  {
    const tx = (o) => [{ id: "p", name: "Rent", amount: 500, date: "2026-10-25", ...o }];
    t.eq(rent(house(tx({}))), 0, "2a a real $500 rent payment out three days early pays the Oct 28 rent: nothing reserved");
    t.eq(rent(house(tx({ isTransfer: true }))), 500, "2b a transfer between the household's own accounts does not pay it");
    t.eq(rent(house(tx({ name: "RENT REFUND" }))), 500, "2c a refund recorded as money out does not pay it");
    t.eq(rent(house(tx({ name: "Rent reversal" }))), 500, "2d a reversal does not pay it");
    t.eq(rent(house(tx({ name: "RETURNED PAYMENT RENT" }))), 500, "2e a returned payment does not pay it");
    t.eq(rent(house(tx({ pending: true }))), 500, "2f a pending payment does not pay it yet");
    t.eq(rent(house([...tx({}), { id: "x", name: "Rent", amount: -500, date: "2026-10-26" }])), 0, "2g paid, then refunded: the payment pays it and the refund changes nothing here");
  }

  t.summary("billRefundNotPaid");
})();
