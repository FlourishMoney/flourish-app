// src/lib/watchRange.js
// -----------------------------------------------------------------------------
// WATCH: WHAT THE SELECTED RANGE ADDS UP TO (watch-meet-fixes, item 1).
//
// Watch's only headline figure was "Starting balance", which is the same at 7, 30 and 90 days, so
// switching the range changed nothing at the top of the screen and read as broken. This is the
// summary that sits under it, and it is built from the SAME forecast array as the day-by-day list:
//
//   Lowest balance          the lowest projected balance in the range, and its day
//   Balance on <last day>   the projected balance on the range's last day
//   Money in                every deposit the forecast credits in the range
//   Bills and minimum payments   every bill, expected payment out and debt minimum in the range
//   Everyday spending       the usual daily spending the forecast takes off each day after today
//
// and the check line: starting balance + money in − bills − spending = balance on the last day.
//
// THE RANGE. "The next 7 days" is today and the 7 days after it: forecast days 0 to `range`, which
// is range + 1 entries. The day list uses the same slice (rangeWindow), so its last row is the day
// the summary names.
//
// CENTS, AND WHERE THE REMAINDER GOES. Same rule as lib/forecastWalk.js: the check line is the one
// place a household adds the numbers up for themselves, so it is printed to the cent and computed
// in integer cents. The starting balance, the money in, the bills and the closing balance are the
// forecast's own figures. The spending term is what is left: the engine's daily figure times the
// days, to within a cent or two of float residue, and it is the one term labelled as an estimate.
//
// PURE. No React; callers pass the forecast they already hold (ForecastEngine.generate(...).forecast)
// and the engine's own daily spending figure (ForecastEngine.generate(...).avgDailySpend).
// -----------------------------------------------------------------------------

import { formatMoney, formatBalance } from "./format.js";
import { forecastLow } from "./forecastView.js";
import { parseMoney } from "./financialCalculations.js";

export const WATCH_RANGES = [7, 30, 90];

const _cents = (n) => Math.round((Number(n) || 0) * 100);
const _money = (cents) => formatMoney(cents / 100, { cents: true });
// Spending the forecast took off a day: the daily figure on every day after today, none on today.
const _spendOn = (f, avg) => (f && f.day > 0 ? (Number(avg) || 0) : 0);

// The days a range covers: today and the `range` days after it.
export function rangeWindow(forecast, range) {
  const n = Math.max(0, Math.floor(Number(range) || 0));
  return (forecast || []).slice(0, n + 1);
}

// Lines grouped by name, in first-seen order: [{ label, count, cents, text }].
function _group(items) {
  const by = new Map();
  for (const it of items) {
    if (!(it.cents > 0)) continue;
    const g = by.get(it.label) || { label: it.label, count: 0, cents: 0 };
    g.count += 1; g.cents += it.cents;
    by.set(it.label, g);
  }
  return [...by.values()].map(g => ({ ...g, text: _money(g.cents) }));
}

/**
 * The summary of forecast days 0..range.
 * @returns null when the forecast does not reach that far, else {
 *   range, days, endDay, endDate, lowDay, lowDate,
 *   startCents, inCents, billsCents, spendCents, endCents, lowCents,
 *   spendPerDay, spendDays, spendEstimateCents,
 *   deposits: [{label,count,cents,text}], bills: [...],   // the money in and out, by name
 *   text: { start, in, bills, spend, end, low },          // whole dollars, as the rest of Watch shows them
 *   check: { start, in, bills, spend, end, line } }       // to the cent; line is the printed equation
 */
export function rangeSummary(forecast, range, { avgDailySpend = 0 } = {}) {
  const w = rangeWindow(forecast, range);
  const n = Math.max(0, Math.floor(Number(range) || 0));
  if (w.length !== n + 1 || !w.every(f => f && Number.isFinite(f.balance))) return null;
  const avg = Number(avgDailySpend) || 0;

  const deposits = [], bills = [];
  let inCents = 0, billsCents = 0;
  for (const f of w) {
    const inc = _cents(f.income);
    inCents += inc;
    // Money out that day less the spending estimate is the bills (the engine adds the two).
    const out = _cents((Number(f.expenses) || 0) - _spendOn(f, avg));
    billsCents += out;
    const deps = (f.deposits || []).map(d => ({ label: (d && d.label) || "Deposit", cents: _cents(d && d.amount) }));
    if (deps.reduce((s, d) => s + d.cents, 0) === inc) deposits.push(...deps);
    else if (inc > 0) deposits.push({ label: "Deposit", cents: inc });
    const bl = (f.bills || []).map(b => ({ label: (b && b.name) || "Bill", cents: _cents(parseMoney(b && b.amount).value) }));
    if (bl.reduce((s, b) => s + b.cents, 0) === out) bills.push(...bl);
    else if (out > 0) bills.push({ label: "Bills", cents: out });
  }
  const first = w[0], last = w[w.length - 1];
  // Day 0 has no deposit and no spending, only what is due today, so the balance before it is the
  // day-0 balance plus today's bills: what is in the accounts now, the figure the screen starts from.
  const startCents = _cents(first.balance) + _cents((Number(first.expenses) || 0) - _spendOn(first, avg));
  const endCents = _cents(last.balance);
  const spendCents = startCents + inCents - billsCents - endCents;
  const spendDays = Math.max(0, w.length - 1);
  const low = forecastLow(w);

  const check = {
    start: _money(startCents), in: _money(inCents), bills: _money(billsCents), spend: _money(spendCents), end: _money(endCents),
  };
  check.line = `${check.start} + ${check.in} − ${check.bills} − ${check.spend} = ${check.end}`;
  return {
    range: n, days: w.length, endDay: last.day, endDate: last.date, lowDay: low.day, lowDate: low.date,
    startCents, inCents, billsCents, spendCents, endCents, lowCents: _cents(low.balance), low,
    spendPerDay: avg, spendDays, spendEstimateCents: _cents(avg * spendDays),
    deposits: _group(deposits), bills: _group(bills),
    text: {
      start: formatBalance(startCents / 100),
      in: formatMoney(inCents / 100),
      bills: formatMoney(billsCents / 100),
      spend: formatMoney(spendCents / 100),
      end: formatBalance(last.balance),
      low: formatBalance(low.balance),
    },
    check,
  };
}
