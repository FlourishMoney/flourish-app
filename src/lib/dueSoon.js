// src/lib/dueSoon.js
// -----------------------------------------------------------------------------
// WHAT IS DUE SOON: the one list Today's "Due soon" tile and the desktop / iPad right-column card read.
//
// The right-column card used to build its own list: bills whose day-of-month fell between today and
// today + 10, as plain numbers. Near a month end that range never wraps (on the 29th it looks for days
// 29 to 39), so the demo said "No bills due in the next 10 days" beside a Due soon tile counting Phone
// $65 on the 5th. Both now read SafeSpendEngine's own window (today to the next deposit, or 10 days
// when there is none): every bill occurrence it reserves and the debt minimums the forecast pays.
//
// dueSoonList(ss) -> { items: [{ key, name, amount, date, kind }], total, windowLabel }
//   - items, soonest first, one per due date (a weekly bill due twice is two rows), each with its date;
//   - total: the sum of the rows, which is the engine's upcomingBills plus those minimums;
//   - windowLabel: "before next payday" or "next 10 days", the window both surfaces describe.
// -----------------------------------------------------------------------------

import { num } from "./financialCalculations.js";

const _date = (d) => (d instanceof Date ? d : d ? new Date(d) : null);

export function dueSoonList(ss) {
  const s = ss || {};
  const bills = (s.billsDueSoon || []).map((b, i) => ({
    key: `bill-${i}-${b.key || ""}`,
    name: b.name || "Bill",
    amount: num(b.amount),
    date: _date(b.date),
    kind: b._expected ? "expected" : "bill",
  }));
  const mins = (s.minimumsDueSoon || []).map((m, i) => ({
    key: `min-${i}-${m.name}`,
    name: m.name,
    amount: num(m.amount),
    date: _date(m.date),
    kind: "minimum",
  }));
  const items = [...bills, ...mins].sort((a, b) => (a.date ? a.date.getTime() : Infinity) - (b.date ? b.date.getTime() : Infinity));
  const total = items.reduce((t, i) => t + i.amount, 0);
  return { items, total, windowLabel: s.dueSoonToDeposit ? "before next payday" : "next 10 days" };
}
