// src/lib/decisionEngine.js
// -----------------------------------------------------------------------------
// Flourish — behavior / autopilot / health-score engines (Sprint MATH-LOCK Group F).
//
// PURE: catOverrides + currentDate injected where the underlying cashFlow math depends
// on them (defaults preserve behavior; tests inject frozen values). BehaviorEngine.analyze
// returns only the consumed metrics (spikeRatio / subTotal / diningTotal / spendingStability);
// its old themed `insights` array was dead output and was removed (MATH-LOCK finding #3).
// -----------------------------------------------------------------------------

import { FinancialCalcEngine, isInvestmentAccount } from "./financialCalculations.js";
import { SafeSpendEngine } from "./safeSpendEngine.js";
import { ForecastEngine } from "./forecastEngine.js";

// ── DecisionEngine "what to do today" math (Sprint MATH-LOCK Group F) ─────────────────────────────
// Pure helpers extracted from the DecisionEngine UI component. The component calls these, then builds
// the themed advice cards (colors / labels / toLocaleString) — those stay in the component.

// Days until the next payday (income on the 15th or the 1st, whichever is sooner).
// Sprint Z2 #9: `today` is a Date; days-in-month is DERIVED from it so the month-end wraparound is
// exact (Feb 28/29, 30-day months) instead of a hardcoded 31. Defaults to now; tests inject a Date.
export function computePaydayGap(today = new Date()) {
  const dom = today.getDate();
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const paydayGuess = dom < 15 ? 15 : 1;
  const daysToPayday = paydayGuess >= dom ? paydayGuess - dom : (daysInMonth - dom + paydayGuess);
  return { paydayGuess, daysToPayday };
}

// Daily safe-to-spend until payday. daysLeft floors at 14 to avoid a tiny window inflating the limit.
export function computeDailySpendLimit(safe, daysToPayday) {
  const daysLeft = daysToPayday > 0 ? daysToPayday : 14;
  const safePerDay = safe > 0 ? safe / daysLeft : 0;
  const safeToday = Math.floor(safePerDay);
  return { daysLeft, safePerDay, safeToday };
}

// Highest-APR debt (copy before sort — never mutate the caller's array). Returns null if none.
export function selectHighestRateDebt(debts) {
  return [...(debts || [])].sort((a,b) => parseFloat(b.rate||0) - parseFloat(a.rate||0))[0] || null;
}

// Months shaved off the payoff date by paying `extraPayment` extra/month on the given debt,
// via month-by-month amortization (240-month ceiling). Default APR 19.99% if the debt has none.
export function computeDebtPayoffImpact(topDebt, extraPayment) {
  if (!topDebt) return 0;
  const rate = parseFloat(topDebt.rate || 19.99) / 100 / 12;
  const balance = parseFloat(topDebt.balance || 0);
  const minPay = Math.max(25, balance * 0.02);
  const calcMonths = (bal, pay) => {
    if (pay <= 0 || bal <= 0) return 0;
    let m = 0, b = bal;
    while (b > 0 && m < 240) { b = b * (1 + rate) - pay; m++; }
    return m;
  };
  return Math.max(0, calcMonths(balance, minPay) - calcMonths(balance, minPay + extraPayment));
}

// Safe amount to move to savings now (25% of safe-to-spend, floored).
export function computeSavingsOpportunity(safe) {
  return Math.max(0, Math.floor(safe * 0.25));
}

// Cash-tight warning: safe-to-spend below 15% of monthly income.
export function detectLowCashWarning(safe, monthlyIncome) {
  return safe < monthlyIncome * 0.15;
}

// ── ENGINE: BEHAVIOR ANALYSIS — spending patterns (payday spikes, sub creep, dining inflation) ──
export const BehaviorEngine = {
  analyze(data) {
    const txns   = (data.transactions || []).filter(t => t.amount > 0);  // expenses are positive
    // MATH-LOCK finding #3: the `insights` array (themed cards) was never consumed anywhere — removed,
    // along with the cashFlow `income` read that only fed those cards. The consumed values
    // (spikeRatio / subTotal / diningTotal / spendingStability) are unchanged.

    // ① Payday spending spike: compare spend in days 1-5 vs rest of month
    const earlyMonthSpend = txns.filter(t => {
      const d = new Date(t.date); return d.getDate() <= 5;
    }).reduce((s,t) => s + Math.abs(t.amount), 0);
    const restSpend = txns.filter(t => {
      const d = new Date(t.date); return d.getDate() > 5;
    }).reduce((s,t) => s + Math.abs(t.amount), 0);
    const restDailyAvg = (restSpend / 25) || 1;
    const earlyDailyAvg = (earlyMonthSpend / 5) || 0;
    const spikeRatio = earlyDailyAvg / restDailyAvg;

    // ② Subscription creep total
    const subTxns  = txns.filter(t => t.cat === "Subscriptions");
    const subTotal = subTxns.reduce((s,t) => s + Math.abs(t.amount), 0);

    // ③ Dining / delivery total
    const diningTxns  = txns.filter(t => ["Food","Coffee","Dining"].includes(t.cat));
    const diningTotal = diningTxns.reduce((s,t) => s + Math.abs(t.amount), 0);

    // ④ Spending stability (variance) — low variance = better score
    const daily = {};
    txns.forEach(t => {
      const k = t.date?.slice(0,10) || "na";
      daily[k] = (daily[k]||0) + Math.abs(t.amount);
    });
    const vals = Object.values(daily);
    const mean = vals.reduce((s,v)=>s+v,0) / (vals.length||1);
    const variance = vals.reduce((s,v)=>s+Math.pow(v-mean,2),0) / (vals.length||1);
    const cv = Math.sqrt(variance) / (mean||1); // coefficient of variation

    return { spikeRatio, subTotal, diningTotal, spendingStability: Math.max(0, 1 - cv) };
  }
};

// ── ENGINE: ADAPTIVE AUTOPILOT — daily money plan gated by behavior + forecast risk + risk mode ──
export const AutopilotEngine = {
  generate(data, catOverrides = {}, currentDate = new Date()) {
    const { safeAmount, balance, soonBills, riskLevel: rawRisk } = SafeSpendEngine.calculate(data, currentDate);
    const { monthlyIncome, cashFlow, totalExpenses } = FinancialCalcEngine.cashFlow(data, catOverrides, currentDate);
    const { forecast, overdraftRisk, lowBalanceWarnings } = ForecastEngine.generate(data, 30, null, currentDate);
    const { spendingStability, spikeRatio } = BehaviorEngine.analyze(data);
    const debts = [...(data.debts || [])].sort((a,b) => parseFloat(b.rate||0) - parseFloat(a.rate||0)); // copy before sort — never mutate data.debts
    const goals  = data.goals || [];
    const today  = currentDate;
    const todayNum = today.getDate();

    // ── ADAPTIVE: Derive payday from ForecastEngine (anchor-based, not modulo) ─
    const nextPayday = forecast.find(f => f.day > 0 && f.isPayday);
    const daysLeft   = Math.max(1, nextPayday ? nextPayday.day : 14);

    // ── ADAPTIVE: Base safeDaily, then adjust for behavior ───────────────────
    let safeDaily = daysLeft > 0 ? Math.floor(safeAmount / daysLeft) : safeAmount;

    // Behavior adjustment ①: spike ratio → tighten daily limit
    if (spikeRatio > 1.4) {
      const reduction = Math.round(safeDaily * 0.15);
      safeDaily = Math.max(0, safeDaily - reduction);
    }
    // Behavior adjustment ②: consistent underspend → loosen daily limit
    if (spendingStability > 0.85 && spikeRatio < 1.1) {
      safeDaily = Math.round(safeDaily * 1.08);
    }

    // ── ADAPTIVE: Forecast-driven pre-emptive tightening ─────────────────────
    const nearTermLow = lowBalanceWarnings.find(w => w.day <= 7);
    if (nearTermLow) {
      const daysUntilLow = nearTermLow.day;
      const urgency = 1 - (daysUntilLow / 7); // 0 = 7 days away, 1 = tomorrow
      safeDaily = Math.round(safeDaily * (1 - urgency * 0.30));
    }

    // ── ADAPTIVE: Risk mode gates all downstream allocations ─────────────────
    const forecastDanger = overdraftRisk.length > 0;
    const mode = forecastDanger ? "high" :
                 rawRisk === "critical" || rawRisk === "high" ? "high" :
                 rawRisk === "medium" || nearTermLow ? "medium" : "low";

    const modeMultipliers = {
      low:    { savings: 0.40, debt: 0.40, goal: 0.50 },
      medium: { savings: 0.20, debt: 0.30, goal: 0.25 },
      high:   { savings: 0,    debt: 0,    goal: 0    },
    };
    const mult = modeMultipliers[mode];

    // ── Safe floor & surplus ──────────────────────────────────────────────────
    const safeFloor = monthlyIncome * 0.15;
    const surplus = Math.max(0,
      balance
      - soonBills.reduce((s,b) => s + parseFloat(b.amount||0), 0)
      - (totalExpenses / 30 * daysLeft)   // forecast remaining spend this period
      - safeFloor
    );

    // ── ① Daily spend limit (adaptive) ───────────────────────────────────────
    const dailySpendLimit = Math.max(0, safeDaily);

    // ── ② Savings transfer (mode-gated, adaptive amount) ─────────────────────
    let savingsTransfer = 0;
    let savingsTarget = "Emergency Fund";
    if (mode !== "high" && surplus > monthlyIncome * 0.12) {
      const efMonths = FinancialCalcEngine.emergencyFundMonths(data, catOverrides, currentDate);
      const invAcct  = (data.accounts||[]).find(a => isInvestmentAccount(a));
      savingsTarget  = efMonths < 3 ? "Emergency Fund" : invAcct ? "TFSA / Investment" : "Savings";
      // Adaptive: reduce savings amount if spending is volatile
      const volatilityFactor = spendingStability > 0.7 ? 1.0 : 0.7;
      savingsTransfer = Math.round(surplus * mult.savings * volatilityFactor);
    }

    // ── ③ Debt acceleration (mode-gated) ─────────────────────────────────────
    let debtPayment = 0;
    let debtTarget  = null;
    const remainAfterSavings = surplus - savingsTransfer;
    if (mode !== "high" && remainAfterSavings > 30 && debts.length > 0 && parseFloat(debts[0].rate||0) > 8) {
      debtPayment = Math.round(Math.min(remainAfterSavings * mult.debt, 200));
      debtTarget  = debts[0];
    }

    // ── ④ Goal contribution (mode-gated) ─────────────────────────────────────
    let goalContribution = 0;
    let goalTarget = null;
    const remainAfterDebt = remainAfterSavings - debtPayment;
    if (mode === "low" && remainAfterDebt > 20 && goals.length > 0) {
      goalContribution = Math.round(remainAfterDebt * mult.goal);
      goalTarget = goals[0];
    }

    // ── ⑤ Buffer ─────────────────────────────────────────────────────────────
    const buffer = Math.max(0, balance - dailySpendLimit - savingsTransfer - debtPayment - goalContribution);

    // ── ⑥ Adaptive alerts (contextual, not generic) ──────────────────────────
    const alerts = [];
    if (mode === "high") {
      const msg = forecastDanger
        ? `Balance projected to go negative in ${overdraftRisk[0]?.day} days. Hold all non-essential spending.`
        : "Cash is critically low. Bills protection mode active — savings and extras paused.";
      alerts.push({ type:"danger", msg });
    } else if (nearTermLow) {
      alerts.push({ type:"warning", msg:`Balance drops near your safety floor in ${nearTermLow.day} days — daily limit tightened by 15% as a precaution.` });
    }
    if (spikeRatio > 1.4 && mode !== "high") {
      alerts.push({ type:"tip", msg:`Payday spike habit detected (+${Math.round((spikeRatio-1)*100)}%). Daily limit reduced by 15% to smooth your cash flow.` });
    }

    // ── ⑦ Adherence — based on spending stability (0-100) ────────────────────
    const adherence = Math.min(100, Math.round(spendingStability * 100));

    // ── ⑧ Mode label for UI ──────────────────────────────────────────────────
    const modeLabel = mode === "low" ? "On Track" : mode === "medium" ? "Monitor" : "At Risk";
    const adaptations = [
      spikeRatio > 1.4 && `Limit -15% (payday spike habit)`,
      nearTermLow && `Limit tightened (low balance in ${nearTermLow.day}d)`,
      spendingStability > 0.85 && `Limit +8% (consistent spending)`,
      mode === "high" && `Extras paused (protect bills first)`,
    ].filter(Boolean);

    return {
      dailySpendLimit, savingsTransfer, savingsTarget,
      debtPayment, debtTarget, goalContribution, goalTarget,
      buffer, alerts, mode, modeLabel,
      daysLeft, adherence, surplus, adaptations,
      riskLevel: rawRisk,
    };
  }
};

// ── ProsperityEngine: 100-point financial health score (6 weighted pillars) ──
export function calcHealthScore(data, catOverrides = {}, currentDate = new Date()) {
  // Pull from engines for consistency
  const { monthlyIncome, totalExpenses, monthlySpend } = FinancialCalcEngine.cashFlow(data, catOverrides, currentDate);
  const efMonths      = FinancialCalcEngine.emergencyFundMonths(data, catOverrides, currentDate);
  const debtRatio     = FinancialCalcEngine.debtRatio(data, catOverrides, currentDate);
  const savingsRate   = FinancialCalcEngine.savingsRate(data, catOverrides, currentDate);
  const { spendingStability } = BehaviorEngine.analyze(data);
  const accounts      = data.accounts || [];

  // ① Savings Rate — 25 pts (20%+ = full; 0% = 0)
  const srScore = Math.min(25, Math.round(savingsRate * 125));

  // ② Debt Ratio — 20 pts (no debt = 20; debt > 1× annual income = 0)
  const drScore = Math.max(0, Math.round(20 * (1 - Math.min(1, debtRatio * 1.25))));

  // ③ Emergency Fund — 20 pts (3mo = 15; 6mo = full 20)
  const efScore = efMonths >= 6 ? 20 : efMonths >= 3 ? 15 : efMonths >= 1 ? 9 : Math.round(efMonths * 6);

  // ④ Spending Stability — 15 pts (low variance = higher)
  const ssScore = Math.round(spendingStability * 15);

  // ⑤ Investments — 10 pts
  const hasInv = accounts.some(a => isInvestmentAccount(a));
  const invBal = accounts.filter(a => isInvestmentAccount(a)).reduce((s,a) => s + parseFloat(a.balance||0), 0);
  // Sprint Z2 #5: guard div-by-zero — monthlyIncome is 0 when no income is entered, which made
  // invBal/(income*3) → NaN (0/0, poisoning the whole score) or Infinity. denom=1 floors it.
  const denom = monthlyIncome > 0 ? monthlyIncome * 3 : 1;
  const ivScore = hasInv ? Math.min(10, 5 + Math.round(Math.min(5, invBal / denom))) : 0;

  // ⑥ Credit Health — 10 pts
  const rawCredit = data.profile?.creditScore ? parseFloat(data.profile.creditScore) : 680;
  const crScore = rawCredit >= 760 ? 10 : rawCredit >= 720 ? 8 : rawCredit >= 670 ? 6 : rawCredit >= 620 ? 4 : 2;

  const score = Math.min(100, Math.max(8, srScore + drScore + efScore + ssScore + ivScore + crScore));

  const pillars = [
    {label:"Savings Rate",    pts:srScore, max:25, detail:`${Math.round(savingsRate*100)}% savings rate`},
    {label:"Debt Ratio",      pts:drScore, max:20, detail:`${Math.round(debtRatio*100)}% of annual income`},
    {label:"Emergency Fund",  pts:efScore, max:20, detail:`${(efMonths||0).toFixed(1)} months covered`},
    {label:"Stability",       pts:ssScore, max:15, detail:`Spending consistency`},
    {label:"Investments",     pts:ivScore, max:10, detail:hasInv?`$${(invBal||0).toFixed(0)} invested`:`Not started`},
    {label:"Credit",          pts:crScore, max:10, detail:`Score ~${rawCredit}`},
  ];
  return { score, pillars, breakdown:{ srScore, drScore, efScore, ssScore, ivScore, crScore } };
}
