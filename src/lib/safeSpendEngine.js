// src/lib/safeSpendEngine.js
// -----------------------------------------------------------------------------
// Flourish — Safe-to-Spend engine (Sprint MATH-LOCK Group D).
//
// "What is truly safe to spend right now?"
//   safeAmount = balance − upcomingBills(10d) − debtPayments − savingsBuffer − safetyBuffer
//
// PURE: `todayDate` is injected (default = now preserves behavior; tests pass a frozen date).
// Reads only cashFlow().monthlyIncome (override-independent, verified Group B), so it passes {}
// for catOverrides rather than threading them.
// -----------------------------------------------------------------------------

import {
  FinancialCalcEngine,
  isCashAccount,
  billOccursOnDate,
  isBillArchived,
} from "./financialCalculations.js";

export const SafeSpendEngine = {
  calculate(data, todayDate = new Date()) {
    const accounts = data.accounts || [];
    const bills    = data.bills    || [];
    const debts    = data.debts    || [];

    const balance  = accounts
      .filter(a => isCashAccount(a))
      .reduce((s,a) => s + parseFloat(a.balance||0), 0) ||
      0;

    // Detect bills already paid this month by matching transactions (current month per todayDate).
    const _normName = s => (s||"").toLowerCase().replace(/[^a-z0-9 ]/g," ").replace(/\s+/g," ").trim();
    const txnList = (data.transactions||[])
      .filter(t => { try { const d=new Date(t.date+"T12:00:00"); return d.getMonth()===todayDate.getMonth()&&d.getFullYear()===todayDate.getFullYear(); } catch{return false;} })
      .map(t => ({ name: _normName(t.name), amount: Math.abs(parseFloat(t.amount||0)) }));
    // Bug 3: match on full normalized-name containment AND amount tolerance (±5% / ±$2),
    // so loose prefixes ("Rent"↔"Rentals", "Bell"↔"Bell Media") no longer false-positive.
    const isBillPaid = (bill) => {
      const billName = _normName(bill.vendorPattern||bill.name);
      const billAmt  = parseFloat(bill.amount||0);
      if(billName.length < 3) return false;
      // Sprint 4 (item 6): a $0 placeholder bill is "not applicable" — we can't confirm payment.
      if(billAmt <= 0) return false;
      return txnList.some(t => {
        const nameMatch = t.name && (t.name.includes(billName) || billName.includes(t.name));
        const amtMatch  = Math.abs(t.amount - billAmt) <= Math.max(2, billAmt*0.05);
        return nameMatch && amtMatch;
      });
    };
    // Tier 5: count occurrences of each bill in the next 10 days (freq-aware + one-off + skip archived).
    const occurrencesInWindow = (b) => {
      if (isBillArchived(b, todayDate)) return 0;
      if (parseFloat(b.amount||0) <= 0) return 0;
      // Sprint Q items 1 & 3: count ACTUAL occurrences in the 10-day window via the nextDueDate
      // anchor. A monthly+ bill already paid this month is done; sub-monthly bills recur multiple
      // times a month, so the anchor (not "paid this month") governs them.
      const subMonthly = b.freq === "weekly" || b.freq === "biweekly" || b.freq === "semimonthly";
      if (b.type !== "one_off" && !subMonthly && isBillPaid(b)) return 0;
      // MATH-LOCK Group D: pure, DST-safe counter loop (days 0..10 inclusive) — was a date-mutating
      // `for (dd=todayDate; dd<=in10Days; dd.setDate+1)`. Equivalent 11-day window; setDate keeps it
      // calendar-correct across DST.
      let count = 0;
      for (let i = 0; i <= 10; i++) {
        const checkDate = new Date(todayDate);
        checkDate.setDate(checkDate.getDate() + i);
        if (billOccursOnDate(b, checkDate, todayDate)) count++;
      }
      return count;
    };
    const upcomingBills = bills.reduce((s,b) => s + parseFloat(b.amount||0) * occurrencesInWindow(b), 0);

    // Minimum debt payments due this month
    const debtPayments = debts
      .reduce((s,d) => s + parseFloat(d.min||0), 0);

    // Safety buffer: 10 days of average daily spend (Sprint Q item 3: NaN-guarded)
    const avgDaily   = FinancialCalcEngine.avgDailySpend(data);
    const safetyBuf  = Math.round((Number.isFinite(avgDaily) ? avgDaily : 0) * 10);

    // Savings allocation: 10% of monthly income. cashFlow's catOverrides omitted: only monthlyIncome
    // is read here and it's override-independent (verified Group B). todayDate threaded for consistency.
    const { monthlyIncome } = FinancialCalcEngine.cashFlow(data, {}, todayDate);
    const mIncome    = Number.isFinite(monthlyIncome) ? monthlyIncome : 0;
    const savingsAlloc = Math.round(mIncome * 0.10 / 30 * 10); // 10 days' worth
    const noIncome   = !(mIncome > 0); // Sprint Q item 3: signal "set up income" instead of a misleading number

    const safeAmount = Math.max(0, balance - upcomingBills - debtPayments - safetyBuf - savingsAlloc);
    const riskLevel  = safeAmount <= 0 ? "critical" :
                       safeAmount < balance * 0.15 ? "high" :
                       safeAmount < balance * 0.30 ? "medium" : "low";

    return {
      balance, upcomingBills, debtPayments, safetyBuf, savingsAlloc,
      safeAmount, riskLevel, noIncome,
      overdraft: upcomingBills > balance,
      soonBills: bills.filter(b => occurrencesInWindow(b) > 0),
    };
  }
};
