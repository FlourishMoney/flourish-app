// src/lib/billReconcile.js
// -----------------------------------------------------------------------------
// Flourish — manual-bill ⇄ Plaid-observed reconciliation (MATH-LOCK).
//
// Users can enter bills BEFORE they're paid so the forecast isn't blind to them.
// Once Plaid observes the actual payment, the manual estimate must NOT double-count
// against the observed transaction for the same bill. reconcileBills() is a PURE
// function (no Date.now, no I/O) so it is unit-testable and deterministic.
//
// MANUAL BILL SHAPE
//   { id, name, amount, dayOfMonth (1-31), recurring, variable, origin:"manual", createdAt }
//   variable:true  → amount is an estimate; match on the date window only (ignore amount),
//                    and once matched, learn the observed amount for future months.
//
// MATCH (manual bill ↔ observed transaction), ALL must hold:
//   • the transaction is a payment: money out, not pending, not one side of a paired transfer, not a
//     refund or reversal (the exclusions of financialCalculations.paysABill)
//   • transaction date within ±3 days of the bill's clamped day-of-month for that month
//   • (variable:false) transaction amount within ±5% of the manual amount, AND the payment's name is the bill's
//     (round 3 of the review, R3-2). The right amount on the right days with another name is "maybe" only
//     (maybeMatched): it settles nothing, and uses that transaction up for no other bill's maybe.
//   • (variable:true)  amount ignored — but the payment's name must be the bill's (billNameMatches,
//     the name rule of paysABill), because with no amount to go by, the date alone matched ANY
//     transaction: a $4.75 coffee on the due day became the hydro bill's stored amount, and so did a
//     deposit (review 2026-11-22, P4-01).
//   • ONE TO ONE: a transaction confirms at most one bill, and a bill takes at most one transaction.
//     One $80 payment used to confirm, and re-price, every bill due within three days of it.
//     Pairs are settled best first: the nearest date, then the nearest amount.
// On match: use the OBSERVED amount in the forecast (never the estimate), emit ONE entry
// (never the manual estimate AND the observed txn), and for variable bills update the
// stored manual amount so future forecasts improve.
// -----------------------------------------------------------------------------

import { billNameMatches, NOT_A_PAYMENT_RX } from "./financialCalculations.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const MATCH_WINDOW_DAYS = 3;   // ±3 days
const AMOUNT_TOLERANCE = 0.05; // ±5% for non-variable bills

// Last calendar day of a given year/month (month is 0-indexed). Day 0 of the next
// month is the last day of this one — so Feb 2026 → 28, April → 30, etc.
export function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

// Parse a transaction date ("YYYY-MM-DD" or Date) to a noon-anchored Date (noon avoids
// any DST / timezone edge that could shift a date across midnight).
function toNoonDate(v) {
  if (v instanceof Date) return isNaN(v.getTime()) ? null : new Date(v.getFullYear(), v.getMonth(), v.getDate(), 12);
  if (typeof v === "string" && v.length >= 10) {
    const d = new Date(v.slice(0, 10) + "T12:00:00");
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

const absNum = (v) => Math.abs(Number(v) || 0);

// reconcileBills(manualBills, observedTransactions, monthDate) → { forecastBills, updatedManualBills }
//   monthDate: any Date within the target month. Bills are placed on their clamped day in THAT month.
//   forecastBills:      one entry per manual bill, amount = observed (if matched) else the estimate.
//   updatedManualBills: a clone of manualBills with variable+matched bills' amount corrected to observed.
export function reconcileBills(manualBills = [], observedTransactions = [], monthDate = new Date()) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const dim = daysInMonth(year, month);

  // Payments only: money out, settled, not a paired transfer, not a refund or reversal.
  const txns = (observedTransactions || [])
    .filter(t => t && Number(t.amount) > 0 && !t.pending && !t.transferPairId && !NOT_A_PAYMENT_RX.test(String(t.name || "")))
    .map(t => ({ tx: t, date: toNoonDate(t.date), amt: absNum(t.amount) }))
    .filter(x => x.date);

  const updatedManualBills = (manualBills || []).map(b => ({ ...b }));
  const forecastBills = [];

  // Clamp the entered day-of-month into the real month — e.g. day 31 in a 30-day month → 30.
  const dueOf = (mb) => {
    const dueDay = Math.min(Math.max(1, Math.floor(Number(mb.dayOfMonth) || 1)), dim);
    return { dueDay, dueDate: new Date(year, month, dueDay, 12) };
  };

  // Every (bill, payment) pair that satisfies the rule, then settled one to one, best first.
  const pairs = [];
  (manualBills || []).forEach((mb, idx) => {
    const { dueDate } = dueOf(mb);
    const estimate = absNum(mb.amount);
    txns.forEach((x, ti) => {
      const dayDist = Math.abs(Math.round((x.date.getTime() - dueDate.getTime()) / DAY_MS));
      if (dayDist > MATCH_WINDOW_DAYS) return;
      const named = billNameMatches(x.tx.name, mb.name);
      if (mb.variable) {
        if (!named) return; // no amount to go by, so the name has to be the bill's
      } else {
        if (estimate <= 0) return;
        if (Math.abs(x.amt - estimate) > AMOUNT_TOLERANCE * estimate) return; // outside ±5%
      }
      pairs.push({ idx, ti, named, dayDist, amtGap: Math.abs(x.amt - estimate) });
    });
  });
  pairs.sort((a, b) => (a.named === b.named ? 0 : a.named ? -1 : 1) || a.dayDist - b.dayDist || a.amtGap - b.amtGap || a.idx - b.idx || a.ti - b.ti);
  // SETTLED only by a payment that carries the bill's name (round 3 of the review, R3-2). A payment of the right
  // amount on the right days with another name is "maybe" at most: $200 insurance due the 15th is not paid by an
  // unrelated $200 purchase on the 14th. (A bill whose amount varies only ever pairs by name, above.)
  const matchOf = new Map(), maybeOf = new Map(), used = new Set();
  for (const p of pairs) {
    if (!p.named || matchOf.has(p.idx) || used.has(p.ti)) continue;
    matchOf.set(p.idx, txns[p.ti]); used.add(p.ti);
  }
  for (const p of pairs) {
    if (p.named || matchOf.has(p.idx) || maybeOf.has(p.idx) || used.has(p.ti)) continue;
    maybeOf.set(p.idx, txns[p.ti]); used.add(p.ti);
  }

  (manualBills || []).forEach((mb, idx) => {
    const { dueDay, dueDate } = dueOf(mb);
    const estimate = absNum(mb.amount);
    const match = matchOf.get(idx) || null;

    const base = {
      id: mb.id, name: mb.name,
      dayOfMonth: mb.dayOfMonth, dueDay, dueDate,
      date: String(dueDay),                 // day-of-month string — ForecastEngine/billOccursOnDate shape
      recurring: mb.recurring !== false,    // default recurring
      variable: !!mb.variable,
      origin: mb.origin || "manual",
    };

    if (match) {
      // Confirmed by Plaid: use the observed amount, single entry, no double-count.
      forecastBills.push({ ...base, amount: match.amt, observedAmount: match.amt, matched: true, estimated: false });
      // Variable bills learn their real amount so next month's estimate is better.
      if (mb.variable) updatedManualBills[idx] = { ...updatedManualBills[idx], amount: match.amt };
    } else {
      // Not yet observed: the manual estimate stands (flagged estimated so the UI can mark it). maybeMatched: a
      // payment of the right amount on the right days, with another name, is there (maybeAmount). It settles nothing:
      // the bill is still expected at its own amount until a payment carries its name, or the person says so.
      const maybe = maybeOf.get(idx) || null;
      forecastBills.push({ ...base, amount: estimate, matched: false, estimated: true, ...(maybe ? { maybeMatched: true, maybeAmount: maybe.amt } : {}) });
    }
  });

  return { forecastBills, updatedManualBills };
}
