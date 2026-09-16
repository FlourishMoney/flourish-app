// src/lib/safeToSpendView.js
// -----------------------------------------------------------------------------
// Truth-fix item 5: the ONE presentation view-model for safe-to-spend.
//
// Every surface (Today hero + breakdown, First Visit breakdown) consumes THIS, so
// the displayed rows and the displayed headline are computed together, once, and
// always reconcile. Flooring each value independently does not guarantee that the
// rows sum to the shown total; this helper decides the rounding centrally.
//
// Rounding policy (fixed — do not change):
//   - whole dollars
//   - the balance rounds DOWN
//   - every deduction rounds UP
//   - the headline is derived from the DISPLAYED components, never the raw total,
//     so the shown number can never overstate what is actually available.
//
// PURE. Input is SafeSpendEngine.calculate(...)'s result (or any object with the
// same numeric fields). No React, no rounding is done by the caller.
// -----------------------------------------------------------------------------

import { formatMoney, formatNumber, roundBalanceDown } from "./format.js";

// "The balance rounds DOWN" is not defined here — it is the single shared rule roundBalanceDown in
// format.js (also behind formatBalance), so Today, Watch and the timelines cannot drift apart.
const _ceil = (n) => Math.ceil(Number(n) || 0);

export function safeToSpendView(ss) {
  const balanceDisplay = roundBalanceDown(ss && ss.balance);

  // Order + labels match the Today card exactly, so both screens render identical rows.
  const deductions = [
    { key: "upcomingBills", label: "Upcoming bills", raw: ss && ss.upcomingBills },
    { key: "debtPayments", label: "Min. debt payments", raw: ss && ss.debtPayments },
    { key: "safetyBuf", label: "Spending buffer", raw: ss && ss.safetyBuf },
    { key: "savingsAlloc", label: "Savings set aside", raw: ss && ss.savingsAlloc },
  ].map(d => ({ key: d.key, label: d.label, display: _ceil(d.raw), value: formatMoney(_ceil(d.raw)) }));

  const totalDeductions = deductions.reduce((s, d) => s + d.display, 0);
  const headline = Math.max(0, balanceDisplay - totalDeductions);

  // rows = the balance row + every NON-ZERO deduction (a deduction that rounds to $0 is hidden),
  // formatted and tagged so a surface can colour by kind/key. The rows always sum to `headline`.
  const rows = [
    { key: "balance", kind: "balance", label: "In your accounts", sign: "", display: balanceDisplay, value: formatMoney(balanceDisplay) },
    // `sign` is U+2212, and `value` is the POSITIVE amount. That is deliberate and is the minus-glyph
    // rule in format.js: the "−" here is an arithmetic operator printed beside the label, not part of
    // the number, so the number itself stays a plain positive value a user can copy. A negative value
    // (what formatMoney emits for n < 0) uses the ASCII hyphen instead.
    ...deductions.filter(d => d.display > 0).map(d => ({ key: d.key, kind: "deduction", label: d.label, sign: "−", display: d.display, value: d.value })),
  ];

  return {
    balanceDisplay,
    balanceText: formatMoney(balanceDisplay), // "$3,083" — the ONE displayed balance string (Today row, Watch starting balance)
    deductions,           // all four, with display values (whether zero or not)
    rows,                 // balance + non-zero deductions, formatted; rows reconcile to headline
    totalDeductions,
    headline,             // integer displayed headline (>= 0)
    headlineText: formatMoney(headline),     // "$2,111" — for surfaces that show the whole string
    headlineNumber: formatNumber(headline),  // "2,111" — for surfaces that render their own "$" glyph
    totalLabel: "= Safe until next payday",
  };
}
