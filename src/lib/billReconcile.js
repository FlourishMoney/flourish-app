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
//   • transaction date within ±3 days of the bill's clamped day-of-month for that month
//   • (variable:false) transaction amount within ±5% of the manual amount
//   • (variable:true)  amount ignored — date window only
// On match: use the OBSERVED amount in the forecast (never the estimate), emit ONE entry
// (never the manual estimate AND the observed txn), and for variable bills update the
// stored manual amount so future forecasts improve.
// -----------------------------------------------------------------------------

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

  const txns = (observedTransactions || [])
    .map(t => ({ tx: t, date: toNoonDate(t.date), amt: absNum(t.amount) }))
    .filter(x => x.date);

  const updatedManualBills = (manualBills || []).map(b => ({ ...b }));
  const forecastBills = [];

  (manualBills || []).forEach((mb, idx) => {
    // Clamp the entered day-of-month into the real month — e.g. day 31 in a 30-day month → 30.
    const dueDay = Math.min(Math.max(1, Math.floor(Number(mb.dayOfMonth) || 1)), dim);
    const dueDate = new Date(year, month, dueDay, 12);
    const estimate = absNum(mb.amount);

    // Nearest-by-date observed transaction that satisfies the window (+ amount unless variable).
    let match = null;
    let bestDayDist = Infinity;
    for (const x of txns) {
      const dayDist = Math.abs(Math.round((x.date.getTime() - dueDate.getTime()) / DAY_MS));
      if (dayDist > MATCH_WINDOW_DAYS) continue;
      if (!mb.variable) {
        if (estimate <= 0) continue;
        if (Math.abs(x.amt - estimate) > AMOUNT_TOLERANCE * estimate) continue; // outside ±5%
      }
      if (dayDist < bestDayDist) { bestDayDist = dayDist; match = x; }
    }

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
      // Not yet observed: the manual estimate stands (flagged estimated so the UI can mark it).
      forecastBills.push({ ...base, amount: estimate, matched: false, estimated: true });
    }
  });

  return { forecastBills, updatedManualBills };
}
