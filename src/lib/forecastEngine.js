// src/lib/forecastEngine.js
// -----------------------------------------------------------------------------
// Flourish — 90-day cash-flow forecast engine (Sprint MATH-LOCK Group E).
//
// Projects daily balance forward with overdraft-risk + low-balance detection.
// PURE: `today` is injected (default = now preserves behavior; tests pass a frozen
// date). Uses only SafeSpendEngine.calculate(...).balance + avgDailySpend — no
// cashFlow, so no catOverrides needed.
// -----------------------------------------------------------------------------

import { FinancialCalcEngine, isBillArchived, billOccursOnDate, parseMoney } from "./financialCalculations.js";
import { SafeSpendEngine, lowBalanceThreshold } from "./safeSpendEngine.js";
import { incomeOccurrences, billOccurrences } from "./forecastEdits.js";

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

  // income.amount is the per-deposit amount for all freq types. Parsed here only to REPORT a bad value
  // (once per income); the projection itself comes from forecastEdits below.
  (data.incomes||[]).forEach(inc => money(inc.amount, `income "${inc.label || inc.id || "?"}" amount`));

  // ── Money in and money out — ONE list, with the household's corrections applied ─────────────────
  // forecastEdits owns "what lands on which day": every income on its own cadence and anchor (there is
  // deliberately no primary/secondary split, so a second biweekly earner is projected too), every bill,
  // every expected item, each "just this one" / "from this date on" edit, variable pay at its low end,
  // and a real deposit or bill that already arrived replacing its projection. Incomes landing on the
  // same day simply sum. Keyed by LOCAL calendar day index, never a UTC date string.
  const byDay = new Map(); // day index -> { deposits: [], bills: [], occurrences: [] }
  const slot = (i) => { if(!byDay.has(i)) byDay.set(i, { deposits: [], bills: [], occurrences: [] }); return byDay.get(i); };
  for(const o of incomeOccurrences(data, today, days)) {
    const sl = slot(o.day);
    sl.occurrences.push(o);
    if(o.skipped || !(o.amount > 0)) continue;
    sl.deposits.push({ incomeId: o.kind === "income" ? o.sourceId : null, srcKey: o.srcKey, kind: o.kind, label: o.label,
                       amount: o.amount, low: o.variable ? o.low : null, high: o.variable ? o.high : null,
                       edited: !!o.edited, occurrence: o });
  }

  // Bill amounts are parsed once each and memoised, so a malformed amount is reported a single time
  // instead of once per day it recurs across the horizon.
  const billAmtCache = new Map();
  const billAmt = (b) => {
    if(!billAmtCache.has(b)) billAmtCache.set(b, money(b.amount, `bill "${b.name || "?"}" amount`));
    return billAmtCache.get(b);
  };
  bills.forEach(b => { if(!isBillArchived(b, today)) billAmt(b); }); // surface bad amounts up front

  // Tier 5 / Sprint Q item 1: freq-aware bill placement anchored on nextDueDate. One-offs may land on
  // day 0; recurring bills skip day 0 (today's balance already reflects them). An unedited bill is the
  // bill object itself; an edited one is a copy carrying the edited amount.
  for(const o of billOccurrences(data, today, days)) {
    const sl = slot(o.day);
    sl.occurrences.push(o);
    if(o.skipped) continue;
    if(o.kind === "bill") {
      const amt = o.edited ? o.amount : billAmt(o.bill);
      sl.bills.push({ bill: o.edited ? { ...o.bill, amount: amt, _edited: true } : o.bill, amt, occ: o });
    } else {
      sl.bills.push({ bill: { name: o.label, amount: o.amount, _expected: true, _edited: !!o.edited, id: o.srcKey }, amt: o.amount, occ: o });
    }
  }

  for(let i = 0; i <= days; i++) {
    const d       = new Date(today); d.setDate(today.getDate()+i);
    const dayNum  = d.getDate();
    // Day 0 credits NO income, for EVERY income without exception — today's deposits are already in
    // the posted balance we seeded from. The old shape applied this guard to incomes[0] only, while
    // secondary income came from a helper that took day-of-month and could not see the loop index, so
    // it fired on day 0 and left a permanent overstatement on all 90 days (which could mask a real
    // overdraft). Guarding the single summed lookup makes the rule uniform by construction.
    const sl       = byDay.get(i) || { deposits: [], bills: [], occurrences: [] };
    const deposits = i > 0 ? sl.deposits : [];
    const inc      = deposits.reduce((s, x) => s + x.amount, 0);
    // Payday means an income SOURCE lands. An expected gift is money in, but not payday.
    const isPayday = deposits.some(x => x.kind === "income");
    const dayBills = sl.bills.map(x => x.bill);
    const out      = sl.bills.reduce((s, x) => s + x.amt, 0) + (i===0?0:avgDaily);
    // Phase 3d-B: apply active scenario impact (purchase day-1, debt/invest monthly on the 1st, never day 0)
    let scenarioOut = 0;
    if (scenario && i > 0) {
      if (scenario.type === "purchase" && i === 1)         scenarioOut += money(scenario.amount, "scenario.amount");
      if (scenario.type === "debt"     && dayNum === 1)    scenarioOut += money(scenario.extraPayment, "scenario.extraPayment");
      if (scenario.type === "invest"   && dayNum === 1)    scenarioOut += money(scenario.monthlyContribution, "scenario.monthlyContribution");
    }
    running = running + inc - out - scenarioOut;

    const entry = { day:i, date:d, balance:running, income:inc, deposits, expenses:out,
                    isPayday, bills:dayBills, occurrences: sl.occurrences,
                    billOccurrences: sl.bills.map(x => x.occ) }; // parallel to `bills`, for the edit sheet
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
