// src/lib/decisionEngine.js
// -----------------------------------------------------------------------------
// Flourish — behavior / autopilot / health-score engines (Sprint MATH-LOCK Group F).
//
// PURE: catOverrides + currentDate injected where the underlying cashFlow math depends
// on them (defaults preserve behavior; tests inject frozen values). BehaviorEngine.analyze
// returns only the consumed metrics (spikeRatio / subTotal / diningTotal / spendingStability);
// its old themed `insights` array was dead output and was removed (MATH-LOCK finding #3).
// -----------------------------------------------------------------------------

import { FinancialCalcEngine, isInvestmentAccount, simulateDebtPayoffForDebt, isCashAccount, num } from "./financialCalculations.js";
import { SafeSpendEngine } from "./safeSpendEngine.js";
import { ForecastEngine } from "./forecastEngine.js";
import { shelterLabel } from "./locale.js";
import { safeToSpendView } from "./safeToSpendView.js";
import { computeDailySpendLimit, suggestedDailyView } from "./suggestedDaily.js";

// ── DecisionEngine "what to do today" math (Sprint MATH-LOCK Group F) ─────────────────────────────
// Pure helpers extracted from the DecisionEngine UI component. The component calls these, then builds
// the themed advice cards (colors / labels / toLocaleString) — those stay in the component.

// Payday timing moved to lib/incomeSchedule.js (Truth-fix item 2): the old computePaydayGap hardcoded
// payday as the 1st/15th of the month — a second source of truth divorced from the user's real cadence.
// Callers now read daysToNextFutureDeposit(incomes, transactions, today) from incomeSchedule instead.

// Daily safe-to-spend until payday. The function itself now lives in suggestedDaily.js, beside
// suggestedDailyView, which is the one thing every surface reads. It is re-exported here so callers
// that have always imported it from decisionEngine keep working, and so there is still exactly one
// implementation of the division.
export { computeDailySpendLimit };

// Highest-APR debt (copy before sort — never mutate the caller's array). Returns null if none.
export function selectHighestRateDebt(debts) {
  return [...(debts || [])].sort((a,b) => parseFloat(b.rate||0) - parseFloat(a.rate||0))[0] || null;
}

// Months shaved off the payoff date by paying `extraPayment` extra/month on the given debt: the
// payoff at the minimum less the payoff with the extra, both from debtPayoffMonths below, so the
// figure Decisions prints and the before/after Meet prints are one model.
export function computeDebtPayoffImpact(topDebt, extraPayment) {
  if (!topDebt) return 0;
  return Math.max(0, debtPayoffMonths(topDebt, 0) - debtPayoffMonths(topDebt, extraPayment));
}

// The safe-to-spend figure exactly as Today shows it: safeToSpendView's integer headline, behind
// Today's own setup gate. What-If, Meet and Decisions start from THIS number, not the engine's raw
// safeAmount, so "spend $800" leaves Today's figure less $800 ($1,944 - $800 = $1,144 in the demo,
// not $1,144.88). With no cash account Today shows no figure; callers get 0, which is what the
// engine's clamped amount was in that case. Today also shows no figure when there is no income
// (it asks for the income instead), so that is 0 too.
export function displayedSafeToSpend(data = {}, todayDate = new Date()) {
  const ss = SafeSpendEngine.calculate(data, todayDate);
  if (ss.noIncome) return 0;
  const view = safeToSpendView(ss, {
    hasCashAccount: (data.accounts || []).filter(a => isCashAccount(a)).length > 0,
    hasIncome: (data.incomes || []).some(i => num(i && i.amount) > 0),
  });
  return view.headline == null ? 0 : view.headline;
}

// Safe amount to move to savings now (25% of safe-to-spend, floored).
export function computeSavingsOpportunity(safe) {
  return Math.max(0, Math.floor(safe * 0.25));
}

// Months to pay off `debt` while paying `extraPayment` extra per month. The model is
// financialCalculations.simulateDebtPayoffForDebt (the one amortization, at the debt's own minimum,
// or max($25, 2% of balance) only when it has none), capped at the 240-month ceiling Meet and
// Decisions display as "20+ yrs": a payment that never clears the debt reads as 240.
export function debtPayoffMonths(debt, extraPayment = 0) {
  if (!debt) return 0;
  const m = simulateDebtPayoffForDebt(debt, extraPayment).boosted.monthsToPayoff;
  return Number.isFinite(m) ? Math.min(m, 240) : 240;
}

// The savings buffer before and after moving `extra` into it. The buffer is the sum of savings-type
// account balances (data.accounts). Pure — the single source for Meet's "what the buffer becomes"
// outcome, parallel to the debt option's before/after payoff. Returns { current, after } in dollars.
export function savingsBufferAfter(accounts, extra) {
  const cur = (accounts || []).reduce((s, a) => {
    const t = String((a && (a.type || a.subtype)) || "").toLowerCase();
    return t === "savings" ? s + (parseFloat(a.balance) || 0) : s;
  }, 0);
  const add = Math.max(0, Math.floor(Number(extra) || 0));
  const round2 = (n) => Math.round(n * 100) / 100;
  return { current: round2(cur), after: round2(cur + add) };
}

// Cash-tight warning: safe-to-spend below 15% of monthly income. THE tight-cash rule: Decisions'
// "Cash is running tight" card and Today's Money Plan both decide it here, from the same two
// inputs (cashIsTight), so one screen can never warn while the other says "On Track" and moves
// money to savings.
export function detectLowCashWarning(safe, monthlyIncome) {
  return safe < monthlyIncome * 0.15;
}

// The inputs every surface uses for that rule: the safe-to-spend figure Today shows, and the
// engine's monthly income. { tight, safe, monthlyIncome }.
export function cashIsTight(data = {}, todayDate = new Date()) {
  const safe = displayedSafeToSpend(data, todayDate);
  const { monthlyIncome } = FinancialCalcEngine.cashFlow(data, {}, todayDate);
  const income = Number.isFinite(monthlyIncome) ? monthlyIncome : 0;
  return { tight: detectLowCashWarning(safe, income), safe, monthlyIncome: income };
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
    const ss = SafeSpendEngine.calculate(data, currentDate);
    const { balance, soonBills, riskLevel: rawRisk } = ss;
    const { monthlyIncome, cashFlow, totalExpenses } = FinancialCalcEngine.cashFlow(data, catOverrides, currentDate);
    const { forecast, overdraftRisk, lowBalanceWarnings } = ForecastEngine.generate(data, 30, null, currentDate);
    const { spendingStability, spikeRatio } = BehaviorEngine.analyze(data);
    const debts = [...(data.debts || [])].sort((a,b) => parseFloat(b.rate||0) - parseFloat(a.rate||0)); // copy before sort — never mutate data.debts
    const goals  = data.goals || [];
    const today  = currentDate;
    const todayNum = today.getDate();

    // ── Derive payday from ForecastEngine (anchor-based, not modulo) ─────────
    const nextPayday = forecast.find(f => f.day > 0 && f.isPayday);
    // The REAL days to payday. Used below to forecast the rest of this period's spending — and NOT
    // to divide the safe amount, which is the whole of week-2 defect a.
    const daysToPayday = Math.max(1, nextPayday ? nextPayday.day : 14);

    // ── THE DAILY PACE — read, not derived ───────────────────────────────────
    // This card used to compute its own: floor(safeAmount / daysToPayday), then adjust the result by
    // ±8-15% for behaviour. Two things were wrong with that. The divisor was the true days to payday
    // while suggestedDailyView floors it at 14, so on the day before payday the card offered the
    // entire safe balance as one day's spending. And the behaviour multipliers made it a second
    // answer to a question Today and Decisions had already answered, under the same label.
    //
    // It now reads the one helper, on the same input Today and Decisions use: the DISPLAYED
    // safe-to-spend headline, not the engine's raw safeAmount. All three surfaces print one number.
    const pace = suggestedDailyView(safeToSpendView(ss).headline, data.incomes, data.transactions, currentDate, data);
    const daysLeft = pace.daysLeft;   // the pace window (floored at 14) — what the card's label must say
    const safeDaily = pace.daily;

    const nearTermLow = lowBalanceWarnings.find(w => w.day <= 7);

    // ── ADAPTIVE: Risk mode gates all downstream allocations ─────────────────
    const forecastDanger = overdraftRisk.length > 0;
    // The one tight-cash rule (cashIsTight), the same call Decisions makes. When it fires the plan is
    // not "On Track", and it moves nothing to savings, debt or goals.
    const cashTight = cashIsTight(data, currentDate).tight;
    const mode = forecastDanger ? "high" :
                 rawRisk === "critical" || rawRisk === "high" ? "high" :
                 rawRisk === "medium" || nearTermLow || cashTight ? "medium" : "low";
    const extrasPaused = mode === "high" || cashTight;

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
      - (totalExpenses / 30 * daysToPayday)   // forecast remaining spend this period (the REAL window)
      - safeFloor
    );

    // ── ① Daily spend limit (adaptive) ───────────────────────────────────────
    const dailySpendLimit = Math.max(0, safeDaily);

    // ── ② Savings transfer (mode-gated, adaptive amount) ─────────────────────
    let savingsTransfer = 0;
    let savingsTarget = "Emergency Fund";
    if (!extrasPaused && surplus > monthlyIncome * 0.12) {
      const efMonths = FinancialCalcEngine.emergencyFundMonths(data, catOverrides, currentDate);
      const invAcct  = (data.accounts||[]).find(a => isInvestmentAccount(a));
      savingsTarget  = efMonths < 3 ? "Emergency Fund" : invAcct ? shelterLabel(data.profile?.country) : "Savings";
      // Adaptive: reduce savings amount if spending is volatile
      const volatilityFactor = spendingStability > 0.7 ? 1.0 : 0.7;
      savingsTransfer = Math.round(surplus * mult.savings * volatilityFactor);
    }

    // ── ③ Debt acceleration (mode-gated) ─────────────────────────────────────
    let debtPayment = 0;
    let debtTarget  = null;
    const remainAfterSavings = surplus - savingsTransfer;
    if (!extrasPaused && remainAfterSavings > 30 && debts.length > 0 && parseFloat(debts[0].rate||0) > 8) {
      debtPayment = Math.round(Math.min(remainAfterSavings * mult.debt, 200));
      debtTarget  = debts[0];
    }

    // ── ④ Goal contribution (mode-gated) ─────────────────────────────────────
    let goalContribution = 0;
    let goalTarget = null;
    const remainAfterDebt = remainAfterSavings - debtPayment;
    if (!extrasPaused && mode === "low" && remainAfterDebt > 20 && goals.length > 0) {
      goalContribution = Math.round(remainAfterDebt * mult.goal);
      goalTarget = goals[0];
    }

    // ── ⑤ Left over ──────────────────────────────────────────────────────────
    // What stays in the account after everything due before the next deposit (the bills and the
    // debt minimums safe to spend reserves) and after today's plan. It used to take off only today's
    // plan, so it read $2,909 in a demo with $1,650 of rent and $348 of minimums leaving first.
    const dueBeforeDeposit = (ss.upcomingBills || 0) + (ss.debtPayments || 0);
    const buffer = Math.max(0, balance - dueBeforeDeposit - dailySpendLimit - savingsTransfer - debtPayment - goalContribution);

    // ── ⑥ Adaptive alerts (contextual, not generic) ──────────────────────────
    const alerts = [];
    if (mode === "high") {
      const msg = forecastDanger
        ? `Balance projected to go negative in ${overdraftRisk[0]?.day} days. Hold all non-essential spending.`
        : "Cash is critically low. Bills protection mode active. Savings and extras paused.";
      alerts.push({ type:"danger", msg });
    } else if (cashTight) {
      alerts.push({ type:"warning", msg:"Safe to spend is below 15% of your monthly income, so savings and extra debt payments are paused." });
    } else if (nearTermLow) {
      alerts.push({ type:"warning", msg:`Balance drops near your safety floor in ${nearTermLow.day} days.` });
    }
    if (spikeRatio > 1.4 && mode !== "high") {
      alerts.push({ type:"tip", msg:`Payday spike habit detected (+${Math.round((spikeRatio-1)*100)}%). Most of your spending lands in the days just after payday.` });
    }

    // ── ⑦ Adherence — based on spending stability (0-100) ────────────────────
    const adherence = Math.min(100, Math.round(spendingStability * 100));

    // ── ⑧ Mode label for UI ──────────────────────────────────────────────────
    const modeLabel = mode === "low" ? "On Track" : mode === "medium" ? "Monitor" : "At Risk";
    // Signals, not adjustments: the daily pace is the same number on every surface, so a chip may
    // report what was detected but must never claim the limit was moved by it.
    const adaptations = [
      spikeRatio > 1.4 && `Payday spike habit`,
      nearTermLow && `Low balance in ${nearTermLow.day}d`,
      spendingStability > 0.85 && `Consistent spending`,
      mode === "high" && `Extras paused (protect bills first)`,
      mode !== "high" && cashTight && `Extras paused (cash is tight)`,
    ].filter(Boolean);

    return {
      dailySpendLimit, savingsTransfer, savingsTarget,
      debtPayment, debtTarget, goalContribution, goalTarget,
      buffer, dueBeforeDeposit, cashTight, alerts, mode, modeLabel,
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
