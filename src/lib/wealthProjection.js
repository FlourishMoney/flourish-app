// src/lib/wealthProjection.js
// -----------------------------------------------------------------------------
// THE WEALTH TAB'S FIGURES (Goals > Wealth, "Future Wealth Forecast"). PURE: no React, no clock, no storage.
//
// The screen used to add the slider's extra to the monthly contribution first and work every figure out from that
// sum, so "Current Path" already held the extra, the two fixed bars held it on top of their own, and the line under
// the slider added it a second time (audit of 2026-11-13, finding 13: "+$200/mo → $422k vs $323k now" where the
// true figures are $323k and $225k).
//
// THE RULE: "now" (Current Path) is what the household puts in today and never moves with the slider. Each other
// figure adds its own extra to that, once.
//
// A projection, not a prediction: the screen says "assumed 7% a year" beside it.
// -----------------------------------------------------------------------------

export const WEALTH_ASSUMED_RETURN = 0.07;
// The two fixed bars beside Current Path: this much more a month.
export const WEALTH_SCENARIO_EXTRAS = Object.freeze([0, 200, 500]);

const _n = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };

/** `startingBal` after `years` years: it grows by the assumed return each year, then that year's contributions are added. */
export function projectWealth(startingBal, monthly, years, annualReturn = WEALTH_ASSUMED_RETURN) {
  let val = _n(startingBal);
  for (let y = 0; y < _n(years); y++) val = val * (1 + annualReturn) + _n(monthly) * 12;
  return Math.max(0, Math.round(val));
}

/**
 * Every figure the Wealth card shows.
 *   scenarios: the three bars, [{ extra, monthly, value }]: today's contribution, and that plus $200 and plus $500.
 *   now:       today's contribution projected (the same figure as the first bar).
 *   withExtra: today's contribution plus the slider's extra, projected.
 */
export function wealthForecastView({ startingBal, monthlyContrib, extra, horizon }) {
  const base = _n(monthlyContrib);
  const scenarios = WEALTH_SCENARIO_EXTRAS.map((x) => ({ extra: x, monthly: base + x, value: projectWealth(startingBal, base + x, horizon) }));
  return { scenarios, now: scenarios[0].value, withExtra: projectWealth(startingBal, base + _n(extra), horizon) };
}
