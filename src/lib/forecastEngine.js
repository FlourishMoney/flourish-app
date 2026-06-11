// src/lib/forecastEngine.js
// -----------------------------------------------------------------------------
// Flourish — 90-day cash-flow forecast engine (Sprint MATH-LOCK Group E).
//
// Projects daily balance forward with overdraft-risk + low-balance detection.
// PURE: `today` is injected (default = now preserves behavior; tests pass a frozen
// date). Uses only SafeSpendEngine.calculate(...).balance + avgDailySpend — no
// cashFlow, so no catOverrides needed.
// -----------------------------------------------------------------------------

import { FinancialCalcEngine, isBillArchived, billOccursOnDate } from "./financialCalculations.js";
import { SafeSpendEngine } from "./safeSpendEngine.js";

export const ForecastEngine = {
generate(data, days = 90, scenario = null, today = new Date()) {
  const { balance }  = SafeSpendEngine.calculate(data, today);
  const avgDaily     = FinancialCalcEngine.avgDailySpend(data);
  const bills        = data.bills || [];

  let running = balance;
  const forecast          = [];
  const overdraftRisk     = [];
  const lowBalanceWarnings = [];

  const incomes       = (data.incomes||[]).filter(i=>parseFloat(i.amount)>0);
  const primaryIncome = incomes[0];
  const primaryFreq   = primaryIncome?.freq || "biweekly";
  // income.amount is the per-deposit amount for all freq types
  const perDeposit    = (inc) => parseFloat(inc.amount||0);
  const paycheque     = primaryIncome ? perDeposit(primaryIncome) : 0;
  const hasIncome     = incomes.length > 0;
  const secondaryMo   = incomes.slice(1).filter(i=>i.freq==="monthly"||i.freq==="semimonthly");

  // ── Anchor-based payday projection ─────────────────────────────────────────
  // Find the last real deposit from transactions, project forward from that date.
  // Bug 2: key paydays by LOCAL calendar date (not UTC toISOString) so NA users' paydays land on the right forecast day.
  const localYMD = (dt) => `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}-${String(dt.getDate()).padStart(2,"0")}`;
  const paydayDates = new Set(); // Set of "YYYY-MM-DD" strings that are paydays
  if(hasIncome && primaryIncome) {
    const txns      = data.transactions || [];
    const incAmt    = parseFloat(primaryIncome.amount||0);
    const incLabel  = (primaryIncome.label||"").toLowerCase();
    const freqDays  = primaryFreq==="weekly" ? 7 : primaryFreq==="biweekly" ? 14 : null;

    // Find last deposit matching this income source (within 8% amount tolerance OR name match)
    let anchor = null;
    if(freqDays) {
      const deposits = txns
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
        .sort((a,b) => b-a);
      anchor = deposits[0] || null;
    }

    if(freqDays && anchor) {
      // Advance from last deposit until we pass today, then keep projecting forward
      let next = new Date(anchor);
      next.setDate(next.getDate() + freqDays);
      const horizon = new Date(today); horizon.setDate(horizon.getDate() + days); // Sprint Z #7: DST-safe calendar offset
      while(next <= horizon) {
        paydayDates.add(localYMD(next));
        next = new Date(next); next.setDate(next.getDate() + freqDays);
      }
    } else if(freqDays) {
      // No anchor found — fallback: count forward from today at frequency
      for(let k = freqDays; k <= days; k += freqDays) {
        const d2 = new Date(today); d2.setDate(today.getDate()+k);
        paydayDates.add(localYMD(d2));
      }
    } else if(primaryFreq==="monthly") {
      const payDay = primaryIncome.anchorDay || 1;
      for(let k = 1; k <= days; k++) {
        const d2 = new Date(today); d2.setDate(today.getDate()+k);
        if(d2.getDate()===payDay) paydayDates.add(localYMD(d2));
      }
    } else if(primaryFreq==="semimonthly") {
      for(let k = 1; k <= days; k++) {
        const d2 = new Date(today); d2.setDate(today.getDate()+k);
        if(d2.getDate()===1||d2.getDate()===15) paydayDates.add(localYMD(d2));
      }
    }
  }

  const getSecondary = (dayNum) =>
    secondaryMo.filter(i=>(i.freq==="monthly"?dayNum===1:(dayNum===1||dayNum===15)))
               .reduce((s,i)=>s+perDeposit(i),0);

  // Tier 5 / Sprint Q item 1: freq-aware bill placement anchored on nextDueDate (not today /
  // day-of-month). One-offs may land on day 0; recurring bills skip day 0 (today's balance already
  // reflects them). billOccursOnDate also fixes quarterly/annual (was firing EVERY month).
  const billOccursOn = (b, d, i) => (b.type === "one_off" ? billOccursOnDate(b, d, today) : (i > 0 && billOccursOnDate(b, d, today)));

  for(let i = 0; i <= days; i++) {
    const d       = new Date(today); d.setDate(today.getDate()+i);
    const dayNum  = d.getDate();
    const dateKey = localYMD(d);
    const isPayday = i > 0 && paydayDates.has(dateKey);
    const dayBills = bills.filter(b => !isBillArchived(b, today) && billOccursOn(b, d, i));
    const inc      = (isPayday ? paycheque : 0) + getSecondary(dayNum);
    const out      = dayBills.reduce((s,b)=>s+parseFloat(b.amount||0),0) + (i===0?0:avgDaily);
    // Phase 3d-B: apply active scenario impact (purchase day-1, debt/invest monthly on the 1st, never day 0)
    let scenarioOut = 0;
    if (scenario && i > 0) {
      if (scenario.type === "purchase" && i === 1)         scenarioOut += scenario.amount;
      if (scenario.type === "debt"     && dayNum === 1)    scenarioOut += scenario.extraPayment;
      if (scenario.type === "invest"   && dayNum === 1)    scenarioOut += scenario.monthlyContribution;
    }
    running = running + inc - out - scenarioOut;

    const entry = { day:i, date:d, balance:running, income:inc, expenses:out,
                    isPayday, bills:dayBills };
    forecast.push(entry);

    if(running < 0) overdraftRisk.push({ day:i, date:d, balance:running });
    if(running < balance*0.12 && running >= 0 && !isPayday)
      lowBalanceWarnings.push({ day:i, date:d, balance:running });
  }

  return { forecast, overdraftRisk, lowBalanceWarnings,
           willGoNegative: overdraftRisk.length > 0,
           firstNegativeDay: overdraftRisk[0] || null };
}
};
