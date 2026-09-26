// src/lib/safeSpendEngine.js
// -----------------------------------------------------------------------------
// Flourish — Safe-to-Spend engine (Sprint MATH-LOCK Group D).
//
// "What is truly safe to spend right now?"
//   safeAmount = balance − upcomingBills(H) − debtPayments − savingsBuffer(H) − safetyBuffer(H)
//   where H = days until the next FUTURE deposit (dynamic horizon; item 3), 10 as a no-income fallback
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
  num,
  baseCurrencyOf,
  accountCurrencyOf,
} from "./financialCalculations.js";
import { daysToNextDepositFor, billOccurrences, billSrcKey, isoOf } from "./forecastEdits.js";

// ── Low-balance threshold — THE definition of "this balance is low" ──────────
// The larger of a proportional band and an absolute floor. Proportional-only degrades to nonsense at
// the bottom of the range: at balance 0 the old `running < balance * 0.12 && running >= 0` reduced to
// `running < 0 && running >= 0`, which is never true, so the users with no cash — the ones who most
// need the warning — were the only ones who never got it. A negative balance was worse still, making
// the threshold negative.
//
// The floor is `safetyBuf` (SafeSpendEngine's existing spending-buffer concept: ~10 days of the user's
// own average daily spend), NOT a new flat constant. That resolves the real tension here — a flat
// number is either too high for someone who spends little (firing constantly) or too low for someone
// who spends a lot (never a real warning), whereas a personal 10-day runway is calibrated per user by
// construction. $100 applies only when there is no spending history to derive a runway from.
// notificationPlanner already anchored on exactly this (`safetyBuf > 0 ? safetyBuf : 100`), so this
// keeps the on-screen warning and the push notification talking about the same idea.
export const LOW_BALANCE_FALLBACK_FLOOR = 100;
export function lowBalanceThreshold(ss) {
  const bal   = Number.isFinite(ss?.balance)   ? ss.balance   : 0;
  const buf   = Number.isFinite(ss?.safetyBuf) ? ss.safetyBuf : 0;
  const floor = buf > 0 ? buf : LOW_BALANCE_FALLBACK_FLOOR;
  return Math.max(bal * 0.12, floor);
}

export const SafeSpendEngine = {
  calculate(data, todayDate = new Date()) {
    const accounts = data.accounts || [];
    const bills    = data.bills    || [];
    const debts    = data.debts    || [];

    // Sprint C Fix 1: never sum cash across currencies 1:1 — there is no FX source (excluding is
    // correct, converting is not). Include only BASE-currency cash; foreign cash is excluded and
    // surfaced so the UI can say "US$X not included in your CAD safe-to-spend". Mirrors the net-worth
    // logic in financialCalculations (baseCurrencyOf + "account.currency defaults CAD"), so a
    // single-currency user sees an IDENTICAL balance to before — every account is in-base.
    const base = baseCurrencyOf(data);
    const isBaseCurrency = a => accountCurrencyOf(a, data) === base;
    const cashAccounts = accounts.filter(a => isCashAccount(a));
    const balance  = cashAccounts.filter(isBaseCurrency).reduce((s,a) => s + num(a.balance), 0) || 0;
    const excludedForeignCash = cashAccounts.filter(a => !isBaseCurrency(a)).reduce((s,a) => s + num(a.balance), 0);
    const mixedCurrencyDetected = cashAccounts.some(a => !isBaseCurrency(a));

    // Truth-fix item 3 (Option A): the reservation horizon is DYNAMIC — the days until the next FUTURE
    // deposit (from incomeSchedule, the one source), not a fixed 10. "Safe to spend until next payday"
    // must actually reserve everything between today and that payday, or it over-promises coverage it
    // never set aside (payday 14 days out but only 10 reserved = 4 unfunded days). When no deposit can be
    // projected (no income), fall back to the historical 10-day window so income-less behaviour is unchanged.
    // Edit-aware (forecastEdits): a payday the household moved, skipped or stopped moves the horizon with it.
    const _daysToDeposit = daysToNextDepositFor(data, todayDate);
    const horizonDays = (_daysToDeposit != null && _daysToDeposit > 0) ? _daysToDeposit : 10;

    // Detect bills already paid this month by matching transactions (current month per todayDate).
    const _normName = s => (s||"").toLowerCase().replace(/[^a-z0-9 ]/g," ").replace(/\s+/g," ").trim();
    const txnList = (data.transactions||[])
      .filter(t => { try { const d=new Date(t.date+"T12:00:00"); return d.getMonth()===todayDate.getMonth()&&d.getFullYear()===todayDate.getFullYear(); } catch{return false;} })
      .map(t => ({ name: _normName(t.name), amount: Math.abs(num(t.amount)) }));
    // Bug 3: match on full normalized-name containment AND amount tolerance (±5% / ±$2),
    // so loose prefixes ("Rent"↔"Rentals", "Bell"↔"Bell Media") no longer false-positive.
    const isBillPaid = (bill) => {
      const billName = _normName(bill.vendorPattern||bill.name);
      const billAmt  = num(bill.amount);
      if(billName.length < 3) return false;
      // Sprint 4 (item 6): a $0 placeholder bill is "not applicable" — we can't confirm payment.
      if(billAmt <= 0) return false;
      return txnList.some(t => {
        const nameMatch = t.name && (t.name.includes(billName) || billName.includes(t.name));
        const amtMatch  = Math.abs(t.amount - billAmt) <= Math.max(2, billAmt*0.05);
        return nameMatch && amtMatch;
      });
    };
    // Tier 5: each bill's occurrences in the window, from the ONE occurrence list (forecastEdits), so a
    // bill the household skipped, moved or re-priced is reserved exactly as the forecast shows it.
    // Window: days 0..horizonDays inclusive (Truth-fix item 3: runs to the next deposit, not 10 days).
    const occ = billOccurrences(data, todayDate, horizonDays, { includeToday: true }).filter(o => !o.skipped);
    const occByBill = new Map();
    for (const o of occ) {
      if (o.kind !== "bill") continue;
      const k = billSrcKey(o.bill);
      if (!occByBill.has(k)) occByBill.set(k, []);
      occByBill.get(k).push(o);
    }
    const occurrencesFor = (b) => {
      if (num(b.amount) <= 0) return [];
      const all = (occByBill.get(billSrcKey(b)) || []).filter(o => o.bill === b);
      // An occurrence the household edited (moved, re-priced) stands on its own: it is reserved even when
      // the bill looks archived or already paid this month. A real payment of it is handled by the
      // forecastEdits arrival rule, which already removed it from the list.
      const editedOnly = all.filter(o => o.edited);
      if (isBillArchived(b, todayDate)) return editedOnly;
      // Sprint Q items 1 & 3: a monthly+ bill already paid this month is done; sub-monthly bills recur
      // multiple times a month, so the anchor (not "paid this month") governs them.
      const subMonthly = b.freq === "weekly" || b.freq === "biweekly" || b.freq === "semimonthly";
      if (b.type !== "one_off" && !subMonthly && isBillPaid(b)) return editedOnly;
      return all;
    };
    const occurrencesInWindow = (b) => occurrencesFor(b).length;
    // Money the household told us is going out (Watch "Add expected money in or out") is reserved too.
    const expectedOut = occ.filter(o => o.kind === "expected");
    const upcomingBills = bills.reduce((s,b) => s + occurrencesFor(b).reduce((t,o) => t + num(o.amount), 0), 0)
                        + expectedOut.reduce((s,o) => s + num(o.amount), 0);

    // Minimum debt payments due this month
    const debtPayments = debts
      .reduce((s,d) => s + num(d.min), 0);

    // Safety buffer: `horizonDays` of average daily spend (Truth-fix item 3: scales to the next deposit,
    // not a fixed 10; Sprint Q item 3: NaN-guarded).
    const avgDaily   = FinancialCalcEngine.avgDailySpend(data);
    const safetyBuf  = Math.round((Number.isFinite(avgDaily) ? avgDaily : 0) * horizonDays);

    // Savings allocation: 10% of monthly income. cashFlow's catOverrides omitted: only monthlyIncome
    // is read here and it's override-independent (verified Group B). todayDate threaded for consistency.
    const { monthlyIncome } = FinancialCalcEngine.cashFlow(data, {}, todayDate);
    const mIncome    = Number.isFinite(monthlyIncome) ? monthlyIncome : 0;
    const savingsAlloc = Math.round(mIncome * 0.10 / 30 * horizonDays); // Truth-fix item 3: horizonDays' worth, not 10
    const noIncome   = !(mIncome > 0); // Sprint Q item 3: signal "set up income" instead of a misleading number

    const safeAmount = Math.max(0, balance - upcomingBills - debtPayments - safetyBuf - savingsAlloc);
    const riskLevel  = safeAmount <= 0 ? "critical" :
                       safeAmount < balance * 0.15 ? "high" :
                       safeAmount < balance * 0.30 ? "medium" : "low";

    return {
      balance, upcomingBills, debtPayments, safetyBuf, savingsAlloc,
      safeAmount, riskLevel, noIncome,
      overdraft: upcomingBills > balance,
      // A bill whose next occurrence was edited is shown as edited (amount, day); otherwise the bill itself.
      soonBills: [...bills.map(b => {
                    const o = occurrencesFor(b)[0];
                    if (!o) return null;
                    return o.edited ? { ...b, amount: o.amount, date: String(o.date.getDate()), nextDueDate: isoOf(o.date), _edited: true } : b;
                  }).filter(Boolean),
                  ...expectedOut.map(o => ({ name: o.label, amount: o.amount, _expected: true, id: o.srcKey,
                                             date: String(o.date.getDate()), nextDueDate: isoOf(o.date) }))],
      // Sprint C Fix 1: base currency + what was left out, so the UI can disclose the exclusion.
      baseCurrency: base,
      mixedCurrencyDetected,
      excludedForeignCash,
    };
  }
};
