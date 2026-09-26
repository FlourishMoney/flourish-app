// src/lib/forecastView.js
// -----------------------------------------------------------------------------
// Tiny view-model helpers for rendering forecast events. Pure and dependency-free so the display
// contract can be tested without a DOM.
//
// The forecast EVENT is the single source of truth for what a day is worth. The payday drill-down
// previously rendered the monthly cashFlow total (monthlyIncome), so a biweekly earner saw ~$4,333 in
// the "💰 Paycheck" breakdown while the collapsed row correctly showed the $2,000 the forecast had
// actually credited. By deriving the amount ONLY from the event, the monthly total can never leak into
// the display again — this helper does not even receive it.
// -----------------------------------------------------------------------------

// The amount to show for a payday event: exactly the income the forecast credited that day. ev.income
// already combines multiple same-day deposits (e.g. primary + secondary), so this is the correct
// combined figure with no re-derivation. Non-payday / malformed events yield 0.
export function paydayLineAmount(ev) {
  const n = Number(ev?.income);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

// One line per projected deposit, named after the income entry that generated it: "+$560 Canada Child
// Benefit", "+$2,840 Full-time Job". The name comes from ev.deposits, which the forecast engine records
// at the moment it credits each income; it is never inferred from the amount. "deposit" is the fallback,
// used for an income entry with no name and for any event that does not carry its deposits (or whose
// deposits do not add up to the credited income, in which case one summed line is the honest answer).
// Each line: { amount, label, named }. The amounts always sum to paydayLineAmount(ev).
export function depositLines(ev) {
  const total = paydayLineAmount(ev);
  if (!(total > 0)) return [];
  const fallback = [{ amount: total, label: "deposit", named: false }];
  const deps = Array.isArray(ev.deposits) ? ev.deposits.filter(d => Number(d && d.amount) > 0) : [];
  if (!deps.length) return fallback;
  const cents = (n) => Math.round(Number(n) * 100);
  if (deps.reduce((s, d) => s + cents(d.amount), 0) !== cents(total)) return fallback;
  return deps.map(d => {
    const name = typeof d.label === "string" ? d.label.trim() : "";
    const line = { amount: Number(d.amount), label: name || "deposit", named: !!name };
    // For a tap to open the edit sheet, the "Edited" tag, and a "My pay varies" range.
    if (d.occurrence) line.occurrence = d.occurrence;
    if (d.edited) line.edited = true;
    if (Number.isFinite(d.low) && Number.isFinite(d.high) && d.high > d.low) { line.low = d.low; line.high = d.high; }
    return line;
  });
}

// The money-out lines of a day, in the order ev.bills lists them, each with the occurrence behind it
// (for the edit sheet) and whether the household edited it. { label, amount, occurrence, edited, expected }
export function billLines(ev) {
  const bills = Array.isArray(ev && ev.bills) ? ev.bills : [];
  const occs = Array.isArray(ev && ev.billOccurrences) ? ev.billOccurrences : [];
  return bills.map((b, i) => {
    const o = occs[i] || null;
    return { label: (b && b.name) || "Bill", amount: Number(b && b.amount) || 0, occurrence: o || null,
             edited: !!(b && b._edited) || !!(o && o.edited), expected: !!(b && b._expected), bill: b };
  });
}

// Occurrences the household skipped on this day: shown struck through, so they can be reset.
export function skippedLines(ev) {
  return (Array.isArray(ev && ev.occurrences) ? ev.occurrences : []).filter(o => o.skipped)
    .map(o => ({ label: o.label || (o.kind === "bill" ? "Bill" : "deposit"), amount: o.amount, occurrence: o,
                 moneyIn: o.kind === "income" || (o.kind === "expected" && o.direction === "in") }));
}
