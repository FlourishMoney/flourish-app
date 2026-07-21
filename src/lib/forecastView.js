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
