// src/lib/financialCalculations.js
// -----------------------------------------------------------------------------
// Flourish — Financial Trust Layer
// -----------------------------------------------------------------------------
// PURPOSE
//   Every scenario/simulation number the user sees must be produced here, in
//   JavaScript, with explicit formulas and inputs. Claude (the AI Coach) may
//   ONLY explain the numbers returned by these functions. It must never
//   invent dollar amounts, percentages, or dates on its own.
//
// RULES FOR THIS FILE
//   1. Pure functions only — no I/O, no side effects, no React, no DOM.
//   2. Every formula is commented with what it computes and why.
//   3. Inputs are coerced defensively; NaN/undefined → 0 (never throws).
//   4. Outputs are plain data objects that can be JSON-stringified for Claude.
//   5. Do NOT duplicate logic from FinancialCalcEngine / SafeSpendEngine in
//      App.jsx. Those remain the source of truth for portfolio-level math.
//      Functions here are for *scenario* math (what happens IF…).
//
// NAMING
//   simulate*  → projects a hypothetical forward (what happens if user does X)
//   calculate* → deterministic rule applied to signals
//   parse*     → pulls structured data out of free-text input
// -----------------------------------------------------------------------------

// ── Input coercion helpers (internal) ────────────────────────────────────────
function _num(v, fallback = 0) {
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}
function _pos(v, fallback = 0) {
  const n = _num(v, fallback);
  return n > 0 ? n : fallback;
}
function _round(v, decimals = 2) {
  const p = Math.pow(10, decimals);
  return Math.round(v * p) / p;
}

// ── 1. parseAmountFromQuery ──────────────────────────────────────────────────
// Pulls a dollar amount out of a natural-language scenario string.
// Examples:  "Buy a $800 laptop" → 800 ; "Pay off 5k of debt" → 5000
// Returns 0 if nothing parseable is found.
export function parseAmountFromQuery(text) {
  if (!text || typeof text !== "string") return 0;
  const normalized = text.replace(/(\d),(\d)/g, "$1$2");
  const dollar = normalized.match(/\$\s*(\d+(?:\.\d+)?)/);
  if (dollar) return _num(dollar[1]);
  const k = normalized.match(/(\d+(?:\.\d+)?)\s*k\b/i);
  if (k) return _num(k[1]) * 1000;
  const bare = normalized.match(/\b(\d{2,}(?:\.\d+)?)\b/);
  if (bare) {
    const n = _num(bare[1]);
    return n >= 50 ? n : 0;
  }
  return 0;
}

// ── 2. simulatePurchaseImpact ────────────────────────────────────────────────
// Deterministic model for "what happens to my finances if I spend $X once".
// Inputs come from FinancialCalcEngine / SafeSpendEngine in App.jsx — we do
// NOT recompute them here.
//
// cashImpact rule:
//   safe   → newSafeToSpend ≥ 0.5 × currentSafeToSpend
//   tight  → newSafeToSpend ≥ 0   AND  < 0.5 × current
//   risky  → newSafeToSpend  < 0
//
// healthScoreDelta rule:
//   risky purchase  → -8
//   tight purchase  → -4
//   safe but > 20% of monthly income → -2
//   safe and ≤ 20% of monthly income → 0
export function simulatePurchaseImpact({
  amount,
  currentBalance,
  currentSafeToSpend,
  avgDailySpend,
  monthlyIncome,
  monthlySurplus,
}) {
  const amt     = _pos(amount);
  const bal     = _num(currentBalance);
  const safe    = _num(currentSafeToSpend);
  const daily   = _pos(avgDailySpend, 1);
  const income  = _pos(monthlyIncome, 1);
  const surplus = _num(monthlySurplus);

  const newBalance     = _round(bal - amt);
  const newSafeToSpend = _round(safe - amt);

  let cashImpact;
  if (newSafeToSpend < 0)                cashImpact = "risky";
  else if (newSafeToSpend < safe * 0.5)  cashImpact = "tight";
  else                                    cashImpact = "safe";

  const savingsDelayDays  = _round(amt / daily, 0);
  const savingsDelayWeeks = _round(savingsDelayDays / 7, 0);

  let healthScoreDelta;
  if      (cashImpact === "risky")  healthScoreDelta = -8;
  else if (cashImpact === "tight")  healthScoreDelta = -4;
  else if (amt > income * 0.20)     healthScoreDelta = -2;
  else                               healthScoreDelta = 0;

  const recoveryMonths = surplus > 0 ? _round(amt / surplus, 1) : null;

  return {
    amount: amt,
    newBalance,
    newSafeToSpend,
    cashImpact,
    savingsDelayDays,
    savingsDelayWeeks,
    healthScoreDelta,
    recoveryMonths,
  };
}

// ── 3. simulateDebtPayoff ────────────────────────────────────────────────────
// Standard debt amortization.
// Formula (monthly compounding):
//   months = -ln(1 - balance * r / payment) / ln(1 + r)   where r = APR/12/100
// Guard: if payment ≤ monthly interest, debt never pays off.
export function simulateDebtPayoff({ balance, apr, monthlyPayment }) {
  const bal = _pos(balance);
  const r   = _num(apr) / 100 / 12;
  const pmt = _pos(monthlyPayment);

  if (bal === 0) {
    return { monthsToPayoff: 0, totalInterest: 0, totalPaid: 0, payoffInMonths: 0, payoffDate: _monthsFromNow(0) };
  }
  if (pmt === 0) {
    return { monthsToPayoff: Infinity, totalInterest: Infinity, totalPaid: Infinity, payoffInMonths: Infinity, payoffDate: null };
  }

  let months;
  if (r === 0) {
    months = bal / pmt;
  } else {
    const argument = 1 - (bal * r) / pmt;
    if (argument <= 0) {
      return { monthsToPayoff: Infinity, totalInterest: Infinity, totalPaid: Infinity, payoffInMonths: Infinity, payoffDate: null };
    }
    months = -Math.log(argument) / Math.log(1 + r);
  }

  const monthsRounded = Math.ceil(months);
  const totalPaid     = _round(monthsRounded * pmt);
  const totalInterest = _round(totalPaid - bal);

  return {
    monthsToPayoff: monthsRounded,
    payoffInMonths: monthsRounded,
    totalPaid,
    totalInterest,
    payoffDate: _monthsFromNow(monthsRounded),
  };
}

// ── 4. simulateDebtPayoffBoost ───────────────────────────────────────────────
export function simulateDebtPayoffBoost({ balance, apr, currentPayment, extraPayment }) {
  const baseline = simulateDebtPayoff({ balance, apr, monthlyPayment: currentPayment });
  const boosted  = simulateDebtPayoff({ balance, apr, monthlyPayment: _num(currentPayment) + _num(extraPayment) });

  const monthsSaved = Number.isFinite(baseline.monthsToPayoff) && Number.isFinite(boosted.monthsToPayoff)
    ? baseline.monthsToPayoff - boosted.monthsToPayoff
    : null;

  const interestSaved = Number.isFinite(baseline.totalInterest) && Number.isFinite(boosted.totalInterest)
    ? _round(baseline.totalInterest - boosted.totalInterest)
    : null;

  return { baseline, boosted, monthsSaved, interestSaved };
}

// ── 5. simulateInvestmentGrowth ──────────────────────────────────────────────
// Compound growth with periodic contributions.
// FV = P × (1 + r)^n  +  C × [((1 + r)^n − 1) / r]
export function simulateInvestmentGrowth({
  monthlyContribution,
  annualReturnPct,
  years,
  initialPrincipal = 0,
}) {
  const c = _num(monthlyContribution);
  const r = _num(annualReturnPct) / 100 / 12;
  const n = Math.max(0, Math.round(_num(years) * 12));
  const p = _num(initialPrincipal);

  if (n === 0) {
    return { finalValue: _round(p), totalContributed: _round(p), totalGrowth: 0, yearByYear: [] };
  }

  const growthFactor = Math.pow(1 + r, n);
  const fvPrincipal  = p * growthFactor;
  const fvContribs   = r === 0 ? c * n : c * ((growthFactor - 1) / r);

  const finalValue       = _round(fvPrincipal + fvContribs);
  const totalContributed = _round(p + c * n);
  const totalGrowth      = _round(finalValue - totalContributed);

  const yearByYear = [];
  for (let y = 1; y <= Math.round(_num(years)); y++) {
    const periods = y * 12;
    const gf      = Math.pow(1 + r, periods);
    const fvP     = p * gf;
    const fvC     = r === 0 ? c * periods : c * ((gf - 1) / r);
    yearByYear.push({
      year: y,
      value: _round(fvP + fvC),
      contributed: _round(p + c * periods),
    });
  }

  return { finalValue, totalContributed, totalGrowth, yearByYear };
}

// ── 6. simulateSavingsTimeline ───────────────────────────────────────────────
// No-interest savings timeline. Use simulateInvestmentGrowth for long-horizon.
export function simulateSavingsTimeline({ targetAmount, currentSaved, monthlyContribution }) {
  const target = _pos(targetAmount);
  const saved  = _num(currentSaved);
  const pmt    = _num(monthlyContribution);
  const needed = Math.max(0, target - saved);

  if (needed === 0) {
    return { monthsToGoal: 0, projectedDate: _monthsFromNow(0), shortfall: 0, reachable: true };
  }
  if (pmt <= 0) {
    return { monthsToGoal: Infinity, projectedDate: null, shortfall: needed, reachable: false };
  }

  const monthsToGoal = Math.ceil(needed / pmt);
  return {
    monthsToGoal,
    projectedDate: _monthsFromNow(monthsToGoal),
    shortfall: 0,
    reachable: true,
  };
}

// ── 7. calculateScenarioVerdict ──────────────────────────────────────────────
// Rule-based verdict engine — no AI involved.
export function calculateScenarioVerdict({ cashImpact, healthScoreDelta, recoveryMonths }) {
  if (cashImpact === "risky") {
    return { verdict: "Not recommended", priority: 4 };
  }
  if (cashImpact === "tight") {
    if (recoveryMonths == null || recoveryMonths > 3) {
      return { verdict: "Think twice", priority: 3 };
    }
    return { verdict: "Proceed carefully", priority: 2 };
  }
  if (_num(healthScoreDelta) <= -2) {
    return { verdict: "Proceed carefully", priority: 2 };
  }
  return { verdict: "Go for it", priority: 1 };
}

// ── 8. summarizeScenarioForCoach ─────────────────────────────────────────────
// Frozen, read-only block of pre-computed numbers that the Coach may cite.
export function summarizeScenarioForCoach(impact, verdict) {
  return {
    amount:            impact.amount,
    newBalance:        impact.newBalance,
    newSafeToSpend:    impact.newSafeToSpend,
    cashImpact:        impact.cashImpact,
    savingsDelayWeeks: impact.savingsDelayWeeks,
    savingsDelayDays:  impact.savingsDelayDays,
    healthScoreDelta:  impact.healthScoreDelta,
    recoveryMonths:    impact.recoveryMonths,
    verdict:           verdict.verdict,
  };
}

// ── Internal: date helper ────────────────────────────────────────────────────
function _monthsFromNow(months) {
  if (!Number.isFinite(months)) return null;
  const d = new Date();
  d.setMonth(d.getMonth() + Math.round(months));
  const y  = d.getFullYear();
  const m  = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

// -----------------------------------------------------------------------------
// STRIPE / PREMIUM NOTE
//   These functions are plan-agnostic. Usage limits live in usageLimits.js
//   (Phase 2). Do not add plan checks here — keep the math layer pure.
// -----------------------------------------------------------------------------
