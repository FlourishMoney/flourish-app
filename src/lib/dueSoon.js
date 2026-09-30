// src/lib/dueSoon.js
// -----------------------------------------------------------------------------
// WHAT IS DUE SOON: the one list Today's "Due soon" tile and the desktop / iPad right-column card read.
//
// The right-column card used to build its own list: bills whose day-of-month fell between today and
// today + 10, as plain numbers. Near a month end that range never wraps (on the 29th it looks for days
// 29 to 39), so the demo said "No bills due in the next 10 days" beside a Due soon tile counting Phone
// $65 on the 5th. Both now read SafeSpendEngine's own window (today to the next deposit): the bills it
// reserves and the debt minimums the forecast pays in that window.
//
// dueSoonList(ss) -> { items: [{ key, name, amount, date, kind }], total }
//   - items, soonest first: bills (and money the household said is going out) and debt minimums;
//   - total: exactly what the Due soon tile shows, the engine's upcomingBills (every occurrence in the
//     window, so a weekly bill due twice counts twice) plus those minimums.
// -----------------------------------------------------------------------------

import { num } from "./financialCalculations.js";

const _dateOf = (b) => {
  if (b && b.nextDueDate) { const d = new Date(String(b.nextDueDate).slice(0, 10) + "T12:00:00"); if (!isNaN(d)) return d; }
  return null;
};

export function dueSoonList(ss) {
  const s = ss || {};
  const bills = (s.soonBills || []).map((b, i) => ({
    key: `bill-${b.id != null ? b.id : i}-${b.name}`,
    name: b.name || "Bill",
    amount: num(b.amount),
    date: _dateOf(b),
    kind: b._expected ? "expected" : "bill",
  }));
  const mins = (s.minimumsDueSoon || []).map((m, i) => ({
    key: `min-${i}-${m.name}`,
    name: m.name,
    amount: num(m.amount),
    date: m.date instanceof Date ? m.date : (m.date ? new Date(m.date) : null),
    kind: "minimum",
  }));
  const items = [...bills, ...mins].sort((a, b) => (a.date ? a.date.getTime() : Infinity) - (b.date ? b.date.getTime() : Infinity));
  const total = num(s.upcomingBills) + mins.reduce((t, m) => t + m.amount, 0);
  return { items, total };
}
