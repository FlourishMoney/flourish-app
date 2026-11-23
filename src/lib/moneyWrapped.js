// src/lib/moneyWrapped.js
// -----------------------------------------------------------------------------
// Pure formatting for the Money Wrapped net-worth headline.
//
// Money Wrapped previously rendered CURRENT net worth under "Your net worth changed by … / You grew
// richer this year" with a leading "+", over ~90 days of Plaid data — a materially false, shareable
// claim. There is no trustworthy historical baseline: the only net-worth history is an opportunistic
// monthly localStorage snapshot (flourish_nw_history) that is usually far shorter than a year, so it
// cannot support a "this year" delta.
//
// This helper therefore treats the figure as CURRENT STATE by default: a signed magnitude
// ($75.0k / -$12.4k) with NO leading "+" on gains, and a label that never says "changed". A caller
// that one day has a genuine, appropriately-dated baseline may pass it to get a real, correctly-signed
// delta — the "change" path exists and is tested, but the app does not currently supply a baseline.
// -----------------------------------------------------------------------------

import { isCardPaymentCharge } from "./budgetSpend.js";

// WHAT COUNTS AS "SPENT" ON MONEY WRAPPED (and in Money Personality's shares).
// The screen used to take every amount above zero, so a $1,500 credit card payment and a $500 move to
// savings were "spent", the card payment was the "biggest splurge", and "Transfer" could be the top
// category. This is the Activity screen's own total (Transactions, totalSpent): money out, not a
// Transfer or Income, and not a credit card payment (isCardPaymentCharge, the budget tally's rule,
// which keeps a subscription paid by a bare "autopay"). A bank fee is money spent, as it is there.
// `categoryOf` lets the caller pass the household's corrected category.
const WRAPPED_NOT_SPENT = new Set(["Transfer", "Income"]);
export function wrappedSpend(transactions, { categoryOf = (t) => t.cat, debts = [] } = {}) {
  return (Array.isArray(transactions) ? transactions : [])
    .filter(t => t && t.amount > 0 && !WRAPPED_NOT_SPENT.has(categoryOf(t)) && !isCardPaymentCharge(t, debts));
}

// `netWorth` — the current net worth (any finite number; NaN/undefined → 0).
// `baseline` — an EARLIER net worth on the same currency basis, or null when none is trustworthy.
//              The caller is responsible for only passing a baseline that is appropriately dated.
export function formatWrappedNetWorth(netWorth, baseline = null) {
  const nw = Number.isFinite(netWorth) ? Math.round(netWorth) : 0;
  // Signed magnitude in $k. Negatives get a minus; positives get NOTHING (no "+" implying a gain).
  const money = (n) => `${n < 0 ? "-" : ""}$${(Math.abs(n) / 1000).toFixed(1)}k`;

  if (baseline != null && Number.isFinite(baseline)) {
    const delta = nw - Math.round(baseline);
    return {
      mode: "change",
      value: delta,
      display: money(delta),
      positive: delta >= 0,
      label: "Your net worth changed by",
      caption: delta >= 0 ? "Up over this period 📈" : "Down over this period 📉",
    };
  }

  return {
    mode: "current",
    value: nw,
    display: money(nw),
    positive: nw >= 0,
    label: "Your net worth today",              // current-state — never "changed"
    caption: "Where your money stands right now",
  };
}
