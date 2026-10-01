// src/lib/decisionEngine.js
// -----------------------------------------------------------------------------
// Flourish — behavior / autopilot / health-score engines (Sprint MATH-LOCK Group F).
//
// PURE: catOverrides + currentDate injected where the underlying cashFlow math depends
// on them (defaults preserve behavior; tests inject frozen values). BehaviorEngine.analyze
// returns only the consumed metrics (spikeRatio / subTotal / diningTotal / spendingStability);
// its old themed `insights` array was dead output and was removed (MATH-LOCK finding #3).
// -----------------------------------------------------------------------------

import { FinancialCalcEngine, isInvestmentAccount, simulateDebtPayoffForDebt, isCashAccount, num, buildDebtListForSimulator } from "./financialCalculations.js";
import { SafeSpendEngine } from "./safeSpendEngine.js";
import { ForecastEngine } from "./forecastEngine.js";
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

// The safe-to-spend line in the coach's context: the figure Today shows, never the engine's raw
// amount. The prompt used to carry "$1944.88" while Today said $1,944, and a positive figure when
// Today showed none at all (no cash account, or no income). Round-2 fix.
export function coachSafeToSpendLine(data = {}, todayDate = new Date()) {
  const ss = SafeSpendEngine.calculate(data, todayDate);
  const hasCash = (data.accounts || []).filter(a => isCashAccount(a)).length > 0;
  if (!hasCash || ss.noIncome) {
    return "- Safe-to-spend RIGHT NOW: none shown (Today shows no figure until the household has a cash account and has entered income; do not estimate one)";
  }
  const shown = displayedSafeToSpend(data, todayDate);
  const text = `${shown < 0 ? "-" : ""}$${Math.abs(shown).toLocaleString("en-US")}`;
  return `- Safe-to-spend RIGHT NOW: ${text} (the figure Today shows; this is the truthful "can-I-afford" number, balance minus upcoming bills, minimum debt payments, safety buffer, savings allocation)`;
}

// For a purchase question ("can I afford a $600 phone?"), the purchase against the figure Today shows
// and what would be left of it after, computed here so the coach states it and never does the
// arithmetic itself (round-3: the coach compares, it gives no affordable / not affordable verdict).
// "" when the message is not a purchase question or Today shows no figure.
export function coachPurchaseLine(data = {}, userText = "", todayDate = new Date()) {
  const text = String(userText || "");
  // Only an explicit purchase question, and only one unambiguous amount: "2 tickets at $150 each" or
  // "$600 or $900" would need arithmetic or a choice, so there is no line and the coach offers a What-If.
  if (!/\b(afford|buy|buying|purchase)\b/i.test(text)) return "";
  if (/\beach\b|\bper\b|\bx\s*\d|\d\s*x\b/i.test(text)) return "";
  const amounts = [...text.replace(/(\d),(?=\d{3}\b)/g, "$1").matchAll(/\$\s*(\d+(?:\.\d+)?)\s*(k\b)?|\b(\d+(?:\.\d+)?)\s*k\b|\b(\d{2,}(?:\.\d+)?)\b/gi)];
  if (amounts.length !== 1) return "";
  const m = amounts[0];
  const amount = m[1] != null ? Number(m[1]) * (m[2] ? 1000 : 1) : m[3] != null ? Number(m[3]) * 1000 : Number(m[4]);
  if (!(amount > 0) || (m[4] != null && (amount < 50 || (/^\d{4}$/.test(m[4]) && amount >= 1900 && amount <= 2099)))) return "";
  const ss = SafeSpendEngine.calculate(data, todayDate);
  if (!(data.accounts || []).some(a => isCashAccount(a)) || ss.noIncome) return "";
  const shown = displayedSafeToSpend(data, todayDate);
  const after = Math.round(shown - amount);
  const fmt = (n) => `${n < 0 ? "-" : ""}$${Math.abs(Math.round(n)).toLocaleString("en-US")}`;
  return `- Purchase in the user's latest message: ${fmt(amount)} | Safe to spend after it (computed by Flourish): ${fmt(after)}`;
}

// The spare amount until the next deposit: 25% of safe to spend, rounded down to the dollar. It is
// never assigned to savings, a debt or a goal (prompt 3e); spareUntilDeposit decides when it is shown.
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
// ── THE spare amount (prompt 3e) ─────────────────────────────────────────────────────────────────
// The one figure Today (the Decisions card and the Money Plan) and Meet show as spare until the next
// deposit: a quarter of the safe-to-spend figure Today shows (computeSavingsOpportunity), worked out
// from that figure and nothing else. It is nothing when cash is tight (cashIsTight) or the 30-day
// forecast shows an overdraft. It is never split: the Money Plan used to assign 40% of its own
// surplus to savings, 40% to a debt and 50% of the rest to a goal; no surface assigns any of it now.
export function spareUntilDeposit(data = {}, todayDate = new Date()) {
  const { tight, safe } = cashIsTight(data, todayDate);
  const overdraft = ((ForecastEngine.generate(data, 30, null, todayDate) || {}).overdraftRisk || []).length > 0;
  const spare = tight || overdraft ? 0 : computeSavingsOpportunity(safe);
  return { spare, safe, tight, overdraft };
}

export const AutopilotEngine = {
  generate(data, catOverrides = {}, currentDate = new Date()) {
    const ss = SafeSpendEngine.calculate(data, currentDate);
    const { riskLevel: rawRisk } = ss;
    const { overdraftRisk, lowBalanceWarnings } = ForecastEngine.generate(data, 30, null, currentDate);
    const { spendingStability, spikeRatio } = BehaviorEngine.analyze(data);
    const goals  = data.goals || [];

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

    // ── Risk mode: what the engine found (the card's label) ───────────────────
    const forecastDanger = overdraftRisk.length > 0;
    // The one tight-cash rule (cashIsTight), the same call Decisions makes. When it fires the card
    // says "Cash is tight" and nothing is spare.
    const cashTight = cashIsTight(data, currentDate).tight;
    const mode = forecastDanger ? "high" :
                 rawRisk === "critical" || rawRisk === "high" ? "high" :
                 rawRisk === "medium" || nearTermLow || cashTight ? "medium" : "low";

    // ── The spare amount (prompt 3e): the one figure, never split ───────────────────────────────
    // The plan used to compute its own surplus and assign fixed shares of it (savings 40%, debt 40%,
    // goal 50% of the rest, scaled down by "mode"), so the card showed amounts nobody had sourced and
    // a "spare" that differed from the Decisions card's. It now reads spareUntilDeposit, the figure
    // Decisions and Meet read, and lists the household's goals and debts with their own balances only.
    const spareInfo = spareUntilDeposit(data, currentDate);
    const spare = spareInfo.spare;
    const spareFrom = spareInfo.safe;
    const dailySpendLimit = Math.max(0, safeDaily);
    const debtsOwed = buildDebtListForSimulator(data.debts, data.liabilities)
      .map(d => ({ name: d.name, balance: d.balance, rate: d.rate, rateEstimated: !!d.rateEstimated }));
    const goalsSaved = goals.map(g => ({ name: g.name || "Goal", saved: num(g.saved), target: num(g.target) }));

    // ── ⑥ Adaptive alerts (contextual, not generic) ──────────────────────────
    const alerts = [];
    if (mode === "high") {
      const msg = forecastDanger
        ? `Balance projected to go negative in ${overdraftRisk[0]?.day} days.`
        : "Cash is critically low.";
      alerts.push({ type:"danger", msg });
    } else if (cashTight) {
      alerts.push({ type:"warning", msg:"Safe to spend is below 15% of your monthly income, so nothing is spare until your next deposit." });
    } else if (nearTermLow) {
      alerts.push({ type:"warning", msg:`Balance drops near your safety floor in ${nearTermLow.day} days.` });
    }
    if (spikeRatio > 1.4 && mode !== "high") {
      alerts.push({ type:"tip", msg:`Payday spike habit detected (+${Math.round((spikeRatio-1)*100)}%). Most of your spending lands in the days just after payday.` });
    }

    // ── ⑦ Adherence — based on spending stability (0-100) ────────────────────
    const adherence = Math.min(100, Math.round(spendingStability * 100));

    // ── ⑧ Mode label for UI ──────────────────────────────────────────────────
    // Prompt 3d: what the engine found, not a grade. ("On Track" / "Monitor" / "At Risk" read as verdicts.)
    const modeLabel = mode === "low" ? "Bills covered" : mode === "medium" ? "Cash is tight" : "Overdraft risk";
    // Signals, not adjustments: the daily pace is the same number on every surface, so a chip may
    // report what was detected but must never claim the limit was moved by it.
    const adaptations = [
      spikeRatio > 1.4 && `Payday spike habit`,
      nearTermLow && `Low balance in ${nearTermLow.day}d`,
      spendingStability > 0.85 && `Consistent spending`,
      mode === "high" && `Nothing spare (bills first)`,
      mode !== "high" && cashTight && `Nothing spare (cash is tight)`,
    ].filter(Boolean);

    return {
      dailySpendLimit, spare, spareFrom, debtsOwed, goalsSaved,
      spareReason: spareInfo.tight ? "tight" : spareInfo.overdraft ? "overdraft" : spare > 0 ? null : "none",
      cashTight, alerts, mode, modeLabel,
      daysLeft, adherence, adaptations,
      riskLevel: rawRisk,
    };
  }
};

// ── ProsperityEngine: 100-point financial health score (6 weighted pillars) ──
// The credit score the household entered themselves, or null. Flourish never assumes or estimates one
// (prompt 3b): the onboarding form keeps a slider default of 680 in profile.creditScore even when the
// household chose "Not sure / skip", so creditKnown must be true for the number to count.
export function creditScoreEntered(profile) {
  if (!profile || profile.creditKnown !== true) return null;
  const n = Math.round(parseFloat(profile.creditScore));
  return Number.isFinite(n) && n >= 300 && n <= 900 ? n : null;
}

// Shown beside a health score worked out without the credit part (prompt 3c).
export const HEALTH_SCORE_PARTIAL_LABEL = "Based on 5 of 6 parts. Add your credit score in Settings for the full score.";
// The short form, for small places (a widget tile, a chip, a metric line), and the line the coach is given.
export const HEALTH_SCORE_PARTIAL_SHORT = "5 of 6 parts";
export const HEALTH_SCORE_PARTIAL_COACH = "based on 5 of 6 parts, because no credit score is entered";

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

  // ⑥ Credit Health: 10 pts, from the score the household entered. With none entered there is no
  // score to rate (the engine used to assume 680), so this pillar is left out and the other five,
  // worth 90 points, are scaled up to 100 (× 100 / 90). That is a score on 5 of 6 parts, and it can
  // differ from the score the same household gets once a credit score is entered, in either direction:
  // pillars worth 80 give 89 with no score, 86 with a score of 718 (6 points) and 90 with 780 (10).
  // So the result carries basisLabel, and the screens show it beside the score.
  const rawCredit = creditScoreEntered(data.profile);
  const hasCredit = rawCredit != null;
  const crScore = !hasCredit ? 0 : rawCredit >= 760 ? 10 : rawCredit >= 720 ? 8 : rawCredit >= 670 ? 6 : rawCredit >= 620 ? 4 : 2;
  const others = srScore + drScore + efScore + ssScore + ivScore;

  const score = Math.min(100, Math.max(8, hasCredit ? others + crScore : Math.round(others * 100 / 90)));

  const pillars = [
    {label:"Savings Rate",    pts:srScore, max:25, detail:`${Math.round(savingsRate*100)}% savings rate`},
    {label:"Debt Ratio",      pts:drScore, max:20, detail:`${Math.round(debtRatio*100)}% of annual income`},
    {label:"Emergency Fund",  pts:efScore, max:20, detail:`${(efMonths||0).toFixed(1)} months covered`},
    {label:"Stability",       pts:ssScore, max:15, detail:`Spending consistency`},
    {label:"Investments",     pts:ivScore, max:10, detail:hasInv?`$${(invBal||0).toFixed(0)} invested`:`Not started`},
    {label:"Credit",          pts:crScore, max:hasCredit ? 10 : 0, detail:hasCredit ? `Score you entered: ${rawCredit}` : "Not entered"},
  ];
  return { score, pillars, breakdown:{ srScore, drScore, efScore, ssScore, ivScore, crScore },
    partial: !hasCredit, basisLabel: hasCredit ? null : HEALTH_SCORE_PARTIAL_LABEL };
}
