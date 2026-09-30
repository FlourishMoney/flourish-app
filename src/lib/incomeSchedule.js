// src/lib/incomeSchedule.js
// -----------------------------------------------------------------------------
// Flourish — income timing, ONE source of truth (Truth-fix item 2).
//
// This module owns "when does money land, and how much". It sits at the BOTTOM of
// the stack and imports NEITHER engine (safeSpendEngine / forecastEngine), so the
// clean layering financialCalculations -> incomeSchedule -> safeSpendEngine ->
// forecastEngine -> decisionEngine holds with no cycle. Every surface that needs a
// payday DATE, AMOUNT, or "is today a payday" reads it from here — there is no
// second hardcoded calendar guess anywhere else.
//
// The anchor detection (most-recent real deposit) and the cadence stepping were
// MOVED DOWN from forecastEngine verbatim, not copied: forecastEngine now calls
// depositDatesFor() and sums the result, so its projection output is unchanged.
//
// PURE: `today` is injected (default = now preserves behaviour; tests pass a frozen
// date). No I/O, no React, no storage.
// -----------------------------------------------------------------------------

import { clampDayToMonth, semimonthlyDays, semimonthlyPair, num } from "./financialCalculations.js";

const _DAY_MS = 86400000;
function _startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function _dayGap(from, to) { return Math.round((_startOfDay(to) - _startOfDay(from)) / _DAY_MS); }

// Cadence length in days for the pure-interval frequencies; null for calendar-day cadences.
function _freqDays(freq) { return freq === "weekly" ? 7 : freq === "biweekly" ? 14 : null; }

// ── Which deposits are THIS income's, and where its pay cycle sits ────────────────────────────
// A deposit is this income's only when its AMOUNT is within this income's bounds, always: ±8% of the
// entered pay, or for "My pay varies" 0.6x to 1.5x of what the household entered (amount, expected,
// typical). A name alone never makes a deposit this income's. The old rule accepted any amount when
// the name matched, so an off-cycle bonus under the employer's name became the anchor.
//
// Money in that is within bounds counts as income when it looks like pay (the Income category,
// "payroll", "direct deposit", "deposit") or carries the income's label as a whole word, so a
// two-letter label ("UW") works; the old rule ignored any label of three characters or fewer.
function _amountBounds(inc, incAmt, loose = false) {
  if (!(incAmt > 0)) return null;
  if (inc && inc.isVariable) {
    const refs = [incAmt, num(inc.expectedAmount), num(inc.typicalAmount)].filter(a => a > 0);
    return [Math.min(...refs) * 0.6, Math.max(...refs) * 1.5];
  }
  return loose ? [incAmt * 0.6, incAmt * 1.5] : [incAmt * 0.92, incAmt * 1.08];
}
const _escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function _incomeDepositDates(inc, incAmt, transactions, loose = false) {
  const bounds = _amountBounds(inc, incAmt, loose);
  if (!bounds) return [];
  const label = String((inc && inc.label) || "").toLowerCase().trim();
  const labelRx = label.length >= 2 ? new RegExp(`(^|[^a-z0-9])${_escape(label)}([^a-z0-9]|$)`) : null;
  const seen = new Set();
  return (transactions || [])
    .filter(t => {
      if (!(t && t.amount < 0)) return false; // income is negative (money in)
      const a = Math.abs(t.amount);
      if (a < bounds[0] || a > bounds[1]) return false; // bounded, always
      const name = String(t.name || "").toLowerCase();
      const labelOk = (labelRx && labelRx.test(name)) || (label.length > 3 && name.includes(label.substring(0, 6)));
      const isInc = t.cat === "Income" || name.includes("payroll") || name.includes("direct deposit") || name.includes("deposit");
      return labelOk || isInc;
    })
    .map(t => new Date(t.date + "T12:00:00"))
    .filter(d => !isNaN(d.getTime()) && !seen.has(d.getTime()) && seen.add(d.getTime()))
    .sort((a, b) => b - a);
}

// How far a weekly or biweekly pay date may drift and still be the same cycle (weekends, holidays).
const _PHASE_TOL = { 7: 2, 14: 3 };

// The chain of cycle-spaced deposits that ends at each date (newest first), and the one to phase from.
function _bestChain(dates, F, tol) {
  const chains = [];
  for (let i = 0; i < dates.length; i++) {
    let len = 1, dev = 0, cur = dates[i];
    for (;;) {
      let pick = null, pickDev = Infinity;
      for (const d of dates) {
        if (d >= cur) continue;
        const dv = Math.abs(_dayGap(d, cur) - F);
        if (dv <= tol && dv < pickDev) { pick = d; pickDev = dv; }
      }
      if (!pick) break;
      len++; dev += pickDev; cur = pick;
    }
    if (len >= 2) chains.push({ len, dev, date: dates[i] });
  }
  if (!chains.length) return null;
  // The CURRENT phase: only chains that end within the drift tolerance of the newest chain compete.
  // So a pay date that moved to the other week wins over a longer history on the old one, while a
  // same-amount deposit a day or two off the cycle loses to the payday beside it (longer, then closer
  // to an exact cycle, then newer).
  const newest = chains.reduce((m, c) => (c.date > m ? c.date : m), chains[0].date);
  let best = null;
  for (const c of chains) {
    if (_dayGap(c.date, newest) > tol) continue;
    if (!best || c.len > best.len || (c.len === best.len && (c.dev < best.dev || (c.dev === best.dev && c.date > best.date)))) best = c;
  }
  return best;
}

// The deposit this income's cycle is phased from. Returns a Date (noon) or null.
//
// Weekly and biweekly: the newest deposit on a CHAIN of at least two of this income's deposits whose
// gaps are each about one cycle (7 ±2 or 14 ±3 days); among chains ending within that drift of the
// newest one, the longest, then the one closest to an exact cycle. A bonus, a reimbursement or any
// other off-cycle deposit is on no chain and is ignored. Amounts are bounded (±8% of the entered pay,
// or the variable range); only when that finds no chain at all (a raise not yet in the history, pay
// that swings with hours) is the band widened to 0.6x-1.5x, never unbounded. One deposit alone is not
// a phase: with no chain the cycle is unknown and the forecast counts forward from today, "estimated".
//
// Monthly and semimonthly: the newest of this income's (bounded) deposits.
export function findAnchor(inc, incAmt, transactions) {
  const F = _freqDays((inc && inc.freq) || "biweekly");
  if (!F) return _incomeDepositDates(inc, incAmt, transactions)[0] || null;
  const tol = _PHASE_TOL[F];
  const tight = _bestChain(_incomeDepositDates(inc, incAmt, transactions), F, tol);
  if (tight) return tight.date;
  const loose = _bestChain(_incomeDepositDates(inc, incAmt, transactions, true), F, tol);
  return loose ? loose.date : null;
}

// Day-of-month this income lands on. Explicit user/Plaid-derived anchorDay wins; otherwise the day
// of this income's most recent observed deposit; only then the 1st (genuine no-signal last resort).
export function anchorDayOf(inc, incAmt, transactions) {
  const explicit = parseInt(inc.anchorDay, 10);
  if (Number.isFinite(explicit) && explicit >= 1 && explicit <= 31) return explicit;
  const observed = findAnchor(inc, incAmt, transactions);
  if (observed) return observed.getDate();
  return 1;
}

// The real per-deposit amount for a single income record — read straight from the record (whose
// `amount` field already stores the per-deposit figure), NEVER derived by dividing a monthly total.
// Returns null when it cannot be determined (no record, or a non-positive/unparseable amount) so a
// surface can show an explicit unknown instead of a manufactured estimate.
export function perDepositAmount(income) {
  const a = num(income && income.amount);
  return a > 0 ? a : null;
}

// All deposit dates for ONE income within (today, today+days]. This is the exact stepping that used
// to live inline in forecastEngine.generate — weekly/biweekly advance from the real anchor (fallback:
// count forward from today at cadence when no anchor), monthly/semimonthly match the anchor day(s).
// Returns an array of Date objects. Amount is not carried (the caller already holds the per-deposit
// amount) — this function answers only "on which dates".
export function depositDatesFor(inc, incAmt, transactions, today, days) {
  const out = [];
  if (!(incAmt > 0)) return out;
  const freq = inc.freq || "biweekly";
  const freqDays = _freqDays(freq);

  if (freqDays) {
    const anchor = findAnchor(inc, incAmt, transactions);
    if (anchor) {
      // Advance from the last real deposit until we pass the horizon.
      const horizon = new Date(today); horizon.setDate(horizon.getDate() + days);
      let next = new Date(anchor);
      next.setDate(next.getDate() + freqDays);
      while (next <= horizon) {
        out.push(new Date(next));
        next = new Date(next); next.setDate(next.getDate() + freqDays);
      }
    } else {
      // No anchor found — fallback: count forward from today at frequency.
      for (let k = freqDays; k <= days; k += freqDays) {
        const d2 = new Date(today); d2.setDate(today.getDate() + k);
        out.push(d2);
      }
    }
  } else if (freq === "monthly" || freq === "semimonthly") {
    const d1 = anchorDayOf(inc, incAmt, transactions);
    // An explicit anchorDay takes the shared pair (semimonthlyPair); without one, the observed day
    // (or the 1st) and the 15th, as before.
    const [sA, sB] = freq === "semimonthly" ? (parseInt(inc.anchorDay, 10) > 0 ? semimonthlyPair(d1) : [d1, 15]) : [null, null];
    for (let k = 1; k <= days; k++) {
      const d2 = new Date(today); d2.setDate(today.getDate() + k);
      const y = d2.getFullYear(), m = d2.getMonth(), dom = d2.getDate();
      const hit = freq === "semimonthly"
        ? semimonthlyDays(sA, sB, y, m).includes(dom)
        : dom === clampDayToMonth(d1, y, m);
      if (hit) out.push(d2);
    }
  }
  return out;
}

// How sure are we of THIS income's next date: "high" when phased off real history or an explicit
// anchor day, "estimated" when we can only count forward from today at the stated cadence.
function _confidenceFor(inc, incAmt, transactions) {
  const freq = inc.freq || "biweekly";
  if (_freqDays(freq)) return findAnchor(inc, incAmt, transactions) ? "high" : "estimated";
  const explicit = parseInt(inc.anchorDay, 10);
  if (Number.isFinite(explicit) && explicit >= 1 && explicit <= 31) return "high";
  return findAnchor(inc, incAmt, transactions) ? "high" : "estimated";
}

// Exported for the edit-aware next deposit (forecastEdits.nextDepositFor), which reports the same
// confidence for the same income.
export function depositConfidence(inc, incAmt, transactions) { return _confidenceFor(inc, incAmt, transactions); }

// The NEXT deposit strictly AFTER today, across every income (earliest wins). A deposit that lands
// TODAY is deliberately excluded: it is already in the posted balance, so any horizon must run to the
// next FUTURE money. Returns { date, amount, sourceLabel, confidence } or null when none can project.
export function nextFutureDeposit(incomes, transactions, today = new Date(), horizonDays = 400) {
  const t0 = _startOfDay(today).getTime();
  let best = null;
  for (const inc of (incomes || [])) {
    const amt = num(inc.amount);
    if (!(amt > 0)) continue;
    const dates = depositDatesFor(inc, amt, transactions, today, horizonDays)
      .map(_startOfDay)
      .filter(d => d.getTime() > t0)
      .sort((a, b) => a - b);
    if (!dates.length) continue;
    const date = dates[0];
    if (!best || date.getTime() < best.date.getTime()) {
      best = { date, amount: amt, sourceLabel: inc.label || "Income", confidence: _confidenceFor(inc, amt, transactions) };
    }
  }
  return best;
}

// Whole days from today until the next FUTURE deposit (>=1), or null if none can project.
export function daysToNextFutureDeposit(incomes, transactions, today = new Date(), horizonDays = 400) {
  const n = nextFutureDeposit(incomes, transactions, today, horizonDays);
  return n ? _dayGap(today, n.date) : null;
}

// Is a deposit landing TODAY? Separate fact from nextFutureDeposit: if money landed today the balance
// already holds it, but callers still want to say "payday". Weekly/biweekly need a known anchor (no
// anchor -> phase unknown -> not claimed); monthly/semimonthly match today's day-of-month.
export function isDepositToday(incomes, transactions, today = new Date()) {
  const t = new Date(today);
  const tY = t.getFullYear(), tM = t.getMonth(), tDom = t.getDate();
  for (const inc of (incomes || [])) {
    const amt = num(inc.amount);
    if (!(amt > 0)) continue;
    const freq = inc.freq || "biweekly";
    const freqDays = _freqDays(freq);
    if (freqDays) {
      const anchor = findAnchor(inc, amt, transactions);
      if (!anchor) continue; // phase unknown
      const gap = _dayGap(anchor, t);
      if (gap >= 0 && gap % freqDays === 0) return true;
    } else if (freq === "monthly" || freq === "semimonthly") {
      const d1 = anchorDayOf(inc, amt, transactions);
      const [sA, sB] = freq === "semimonthly" ? (parseInt(inc.anchorDay, 10) > 0 ? semimonthlyPair(d1) : [d1, 15]) : [null, null];
      const hit = freq === "semimonthly"
        ? semimonthlyDays(sA, sB, tY, tM).includes(tDom)
        : tDom === clampDayToMonth(d1, tY, tM);
      if (hit) return true;
    }
  }
  return false;
}
