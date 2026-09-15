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

import { clampDayToMonth, semimonthlyDays, num } from "./financialCalculations.js";

const _DAY_MS = 86400000;
function _startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function _dayGap(from, to) { return Math.round((_startOfDay(to) - _startOfDay(from)) / _DAY_MS); }

// Cadence length in days for the pure-interval frequencies; null for calendar-day cadences.
function _freqDays(freq) { return freq === "weekly" ? 7 : freq === "biweekly" ? 14 : null; }

// Most recent real deposit belonging to THIS income (8% amount tolerance OR name match), so a
// cadence is phased off an actual paycheque rather than off "today". Matched per-income — each
// earner in a household has their own pay phase. Returns a Date (noon) or null.
export function findAnchor(inc, incAmt, transactions) {
  const incLabel = (inc.label || "").toLowerCase();
  return (transactions || [])
    .filter(t => {
      if (t.amount >= 0) return false; // income is negative (money in)
      const name = (t.name || "").toLowerCase();
      const amtOk = incAmt > 0 && Math.abs(Math.abs(t.amount) - incAmt) / incAmt < 0.08;
      const nameOk = incLabel.length > 3 && name.includes(incLabel.substring(0, 6));
      const isInc = t.cat === "Income" || name.includes("payroll") ||
        name.includes("direct deposit") || name.includes("deposit");
      return (amtOk || nameOk) && isInc;
    })
    .map(t => new Date(t.date + "T12:00:00"))
    .filter(d => !isNaN(d.getTime()))
    .sort((a, b) => b - a)[0] || null;
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
    const d2n = freq === "semimonthly" ? (parseInt(inc.anchorDay, 10) > 0 ? d1 + 15 : 15) : null;
    for (let k = 1; k <= days; k++) {
      const d2 = new Date(today); d2.setDate(today.getDate() + k);
      const y = d2.getFullYear(), m = d2.getMonth(), dom = d2.getDate();
      const hit = freq === "semimonthly"
        ? semimonthlyDays(d1, d2n, y, m).includes(dom)
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
      const d2n = freq === "semimonthly" ? (parseInt(inc.anchorDay, 10) > 0 ? d1 + 15 : 15) : null;
      const hit = freq === "semimonthly"
        ? semimonthlyDays(d1, d2n, tY, tM).includes(tDom)
        : tDom === clampDayToMonth(d1, tY, tM);
      if (hit) return true;
    }
  }
  return false;
}
