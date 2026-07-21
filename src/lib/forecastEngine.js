// src/lib/forecastEngine.js
// -----------------------------------------------------------------------------
// Flourish — 90-day cash-flow forecast engine (Sprint MATH-LOCK Group E).
//
// Projects daily balance forward with overdraft-risk + low-balance detection.
// PURE: `today` is injected (default = now preserves behavior; tests pass a frozen
// date). Uses only SafeSpendEngine.calculate(...).balance + avgDailySpend — no
// cashFlow, so no catOverrides needed.
// -----------------------------------------------------------------------------

import { FinancialCalcEngine, isBillArchived, billOccursOnDate, clampDayToMonth, semimonthlyDays, parseMoney } from "./financialCalculations.js";
import { SafeSpendEngine, lowBalanceThreshold } from "./safeSpendEngine.js";

export const ForecastEngine = {
generate(data, days = 90, scenario = null, today = new Date()) {
  // ── Data-quality tracking ───────────────────────────────────────────────────
  // Every money value entering the projection goes through money(); anything present-but-unparseable
  // is recorded AND coerced to 0. Coercion alone would stop the crash but tell a different lie — a
  // confident balance built from garbage — so the issues travel out with the result (see canProject).
  const dataIssues = [];
  const money = (raw, label) => {
    const r = parseMoney(raw);
    if (!r.ok) dataIssues.push({ field: label, value: String(raw) });
    return r.value;
  };

  // Validate the raw account balances HERE rather than trusting SafeSpendEngine's own coercion: it
  // now returns a clean 0 for a corrupt balance, so a bad value would otherwise reach us looking
  // perfectly healthy. Each input is checked where it enters, not where it happens to be sanitised.
  (data.accounts||[]).forEach(a => money(a.balance, `account "${a.name || a.id || "?"}" balance`));

  const ss           = SafeSpendEngine.calculate(data, today);
  const rawBalance   = ss.balance;
  const balance      = Number.isFinite(rawBalance) ? rawBalance : (dataIssues.push({ field: "accounts.balance", value: String(rawBalance) }), 0);
  const rawAvgDaily  = FinancialCalcEngine.avgDailySpend(data);
  const avgDaily     = Number.isFinite(rawAvgDaily) ? rawAvgDaily : (dataIssues.push({ field: "transactions.amount (avg daily spend)", value: String(rawAvgDaily) }), 0);
  const bills        = data.bills || [];

  const lowBalThreshold = lowBalanceThreshold({ balance, safetyBuf: ss.safetyBuf });

  let running = balance;
  const forecast          = [];
  const overdraftRisk     = [];
  const lowBalanceWarnings = [];

  // income.amount is the per-deposit amount for all freq types. Parsed ONCE, up front, into {inc, amt}
  // so a bad value is reported a single time rather than on every filter pass and loop iteration.
  const incomes = (data.incomes||[])
    .map(inc => ({ inc, amt: money(inc.amount, `income "${inc.label || inc.id || "?"}" amount`) }))
    .filter(x => x.amt > 0);

  // ── Payday projection — EVERY income, its own cadence and anchor ────────────
  // There is deliberately no primary/secondary split. The old code projected only incomes[0] with a
  // weekly/biweekly cadence and filtered the rest to monthly/semimonthly, so a SECOND biweekly earner
  // — the default cadence on the Add Income button — never appeared in the forecast at all. Income is
  // accumulated into a date->amount map so N incomes landing on the same day simply sum.
  // Bug 2: key paydays by LOCAL calendar date (not UTC toISOString) so NA users' paydays land on the right forecast day.
  const localYMD = (dt) => `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}-${String(dt.getDate()).padStart(2,"0")}`;
  const incomeByDate = new Map(); // "YYYY-MM-DD" -> total income landing that day
  const addIncome = (dt, amt) => {
    if(!(amt > 0)) return;
    const k = localYMD(dt);
    incomeByDate.set(k, (incomeByDate.get(k) || 0) + amt);
  };

  const txns    = data.transactions || [];
  const horizon = new Date(today); horizon.setDate(horizon.getDate() + days); // Sprint Z #7: DST-safe calendar offset

  // Most recent real deposit belonging to THIS income (8% amount tolerance OR name match), so the
  // cadence is phased off an actual paycheque rather than off "today". Matched per-income, not once
  // globally — each earner in a household has their own pay phase.
  const findAnchor = (inc, incAmt) => {
    const incLabel = (inc.label||"").toLowerCase();
    return txns
      .filter(t => {
        if(t.amount >= 0) return false; // income is negative (money in)
        const name = (t.name||"").toLowerCase();
        const amtOk  = incAmt > 0 && Math.abs(Math.abs(t.amount)-incAmt)/incAmt < 0.08;
        const nameOk = incLabel.length > 3 && name.includes(incLabel.substring(0,6));
        const isInc  = t.cat==="Income" || name.includes("payroll") ||
                       name.includes("direct deposit") || name.includes("deposit");
        return (amtOk||nameOk) && isInc;
      })
      .map(t => new Date(t.date+"T12:00:00"))
      .filter(d => !isNaN(d.getTime()))
      .sort((a,b) => b-a)[0] || null;
  };

  // Day-of-month this income lands on. Explicit user/Plaid-derived anchorDay wins; otherwise fall back
  // to the day of this income's most recent observed deposit; only then to the 1st. Returning 1 when
  // there is genuinely no signal is a last resort, not the default it used to be in practice —
  // anchorDay was read but never written anywhere, so EVERY monthly income silently landed on the 1st.
  const anchorDayOf = (inc, amt) => {
    const explicit = parseInt(inc.anchorDay, 10);
    if(Number.isFinite(explicit) && explicit >= 1 && explicit <= 31) return explicit;
    const observed = findAnchor(inc, amt);
    if(observed) return observed.getDate();
    return 1;
  };

  for(const { inc, amt } of incomes) {
    const freq     = inc.freq || "biweekly";
    const freqDays = freq==="weekly" ? 7 : freq==="biweekly" ? 14 : null;

    if(freqDays) {
      const anchor = findAnchor(inc, amt);
      if(anchor) {
        // Advance from the last real deposit until we pass the horizon.
        let next = new Date(anchor);
        next.setDate(next.getDate() + freqDays);
        while(next <= horizon) {
          addIncome(next, amt);
          next = new Date(next); next.setDate(next.getDate() + freqDays);
        }
      } else {
        // No anchor found — fallback: count forward from today at frequency.
        for(let k = freqDays; k <= days; k += freqDays) {
          const d2 = new Date(today); d2.setDate(today.getDate()+k);
          addIncome(d2, amt);
        }
      }
    } else if(freq==="monthly" || freq==="semimonthly") {
      // Anchor day precedence: an explicit anchorDay, else the day-of-month of this income's most
      // recent real deposit, else the 1st. findAnchor is the SAME observed-deposit lookup the
      // weekly/biweekly arm phases off, so there is one anchor concept here, not two competing ones —
      // weekly/biweekly consume the anchor's full date, monthly/semimonthly consume its day-of-month.
      const d1 = anchorDayOf(inc, amt);
      // Semimonthly's second target day: the anchor +15 (explicit anchor), or the historical 1st-and-
      // 15th default (second = 15) when none is set. Sprint C Fix 4: semimonthlyDays clamps BOTH days
      // and, when a high anchor's +15 overflows to the same clamped day, relocates the second so the
      // income still pays TWICE — the clamp-collision that dropped one of two deposits for anchors at
      // month-end. Monthly is a single clamped day as before.
      const d2n = freq==="semimonthly" ? (parseInt(inc.anchorDay,10) > 0 ? d1 + 15 : 15) : null;
      for(let k = 1; k <= days; k++) {
        const d2 = new Date(today); d2.setDate(today.getDate()+k);
        const y = d2.getFullYear(), m = d2.getMonth(), dom = d2.getDate();
        const hit = freq==="semimonthly"
          ? semimonthlyDays(d1, d2n, y, m).includes(dom)
          : dom === clampDayToMonth(d1, y, m);
        if(hit) addIncome(d2, amt);
      }
    }
  }

  // Tier 5 / Sprint Q item 1: freq-aware bill placement anchored on nextDueDate (not today /
  // day-of-month). One-offs may land on day 0; recurring bills skip day 0 (today's balance already
  // reflects them). billOccursOnDate also fixes quarterly/annual (was firing EVERY month).
  const billOccursOn = (b, d, i) => (b.type === "one_off" ? billOccursOnDate(b, d, today) : (i > 0 && billOccursOnDate(b, d, today)));

  // Bill amounts are parsed once each and memoised, so a malformed amount is reported a single time
  // instead of once per day it recurs across the horizon.
  const billAmtCache = new Map();
  const billAmt = (b) => {
    if(!billAmtCache.has(b)) billAmtCache.set(b, money(b.amount, `bill "${b.name || "?"}" amount`));
    return billAmtCache.get(b);
  };
  bills.forEach(b => { if(!isBillArchived(b, today)) billAmt(b); }); // surface bad amounts up front

  for(let i = 0; i <= days; i++) {
    const d       = new Date(today); d.setDate(today.getDate()+i);
    const dayNum  = d.getDate();
    const dateKey = localYMD(d);
    // Day 0 credits NO income, for EVERY income without exception — today's deposits are already in
    // the posted balance we seeded from. The old shape applied this guard to incomes[0] only, while
    // secondary income came from a helper that took day-of-month and could not see the loop index, so
    // it fired on day 0 and left a permanent overstatement on all 90 days (which could mask a real
    // overdraft). Guarding the single summed lookup makes the rule uniform by construction.
    const inc      = i > 0 ? (incomeByDate.get(dateKey) || 0) : 0;
    const isPayday = inc > 0;
    const dayBills = bills.filter(b => !isBillArchived(b, today) && billOccursOn(b, d, i));
    const out      = dayBills.reduce((s,b)=>s+billAmt(b),0) + (i===0?0:avgDaily);
    // Phase 3d-B: apply active scenario impact (purchase day-1, debt/invest monthly on the 1st, never day 0)
    let scenarioOut = 0;
    if (scenario && i > 0) {
      if (scenario.type === "purchase" && i === 1)         scenarioOut += money(scenario.amount, "scenario.amount");
      if (scenario.type === "debt"     && dayNum === 1)    scenarioOut += money(scenario.extraPayment, "scenario.extraPayment");
      if (scenario.type === "invest"   && dayNum === 1)    scenarioOut += money(scenario.monthlyContribution, "scenario.monthlyContribution");
    }
    running = running + inc - out - scenarioOut;

    const entry = { day:i, date:d, balance:running, income:inc, expenses:out,
                    isPayday, bills:dayBills };
    forecast.push(entry);

    if(running < 0) overdraftRisk.push({ day:i, date:d, balance:running });
    // Proportional band OR absolute floor, whichever is higher — see lowBalanceThreshold. Using the
    // proportional band alone meant a $0 balance produced a $0 threshold and the warning could never
    // fire for the people living closest to the edge.
    if(running < lowBalThreshold && running >= 0 && !isPayday)
      lowBalanceWarnings.push({ day:i, date:d, balance:running });
  }

  // ── Data-quality signal ─────────────────────────────────────────────────────
  // Coercing bad input to 0 keeps the engine running but produces a CONFIDENT WRONG ANSWER, which is
  // the more dangerous failure: a user with corrupt income data would see a clean forecast implying
  // safety. So the result carries the verdict rather than hiding it.
  //
  // Chosen shape: a field on the existing result object, not a throw and not null.
  //  - A THROW turns a data problem into a blank dashboard. generate() is called from render paths and
  //    from notificationPlanner (which swallows exceptions), so throwing would either crash the UI or
  //    be silently discarded — losing the signal precisely where it matters.
  //  - NULL forces every existing call site to null-check or crash, for what is a degraded-but-usable
  //    result that is still worth showing behind a warning.
  //  - A FIELD is backward compatible and lets each caller respond appropriately: the UI shows "we
  //    can't project this right now", the notification planner declines to schedule.
  //
  // willGoNegative becomes NULL (not false) when we cannot project. That is the safety-critical part:
  // `if (willGoNegative)` still reads falsy so no false alarm fires, but any caller asking whether the
  // user is SAFE (`=== false`) no longer gets a yes. Unknown must never masquerade as safe.
  const dedupedIssues = dataIssues.filter((it, idx) =>
    dataIssues.findIndex(o => o.field === it.field && o.value === it.value) === idx);
  const canProject = dedupedIssues.length === 0;

  return { forecast, overdraftRisk, lowBalanceWarnings,
           willGoNegative: canProject ? overdraftRisk.length > 0 : null,
           firstNegativeDay: overdraftRisk[0] || null,
           canProject,
           dataIssues: dedupedIssues };
}
};
