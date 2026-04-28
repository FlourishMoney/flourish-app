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

// ── 9. detectScenarioType ────────────────────────────────────────────────────
// Inspects free-form user input to decide which simulator path to run:
//   "purchase" — default: any one-time spend ("Buy a $800 laptop")
//   "debt"     — pay off / pay down debt ("Pay off my credit card", "$200 extra on Amex")
//   "invest"   — recurring investment ("Invest $300/month", "$500/mo into TFSA")
//
// Caller may override by passing a tagged preset's type directly to simulate().
// This function is used only for free-form input where no tag is available.
//
// Detection rules (priority top to bottom — first match wins):
//   1. Investment markers: "/month" or "per month" or "monthly" + investing verb
//   2. Debt markers: "pay off" / "payoff" / "pay down" / "extra on" / "credit card"
//   3. Default: "purchase"
//
// This is intentionally conservative. False positives on debt/invest are worse
// than false negatives — a missed scenario falls back to the safe purchase path.

export function detectScenarioType(text) {
  if (!text || typeof text !== "string") return "purchase";
  const t = text.toLowerCase();

  // Investment: must have a recurring marker AND an investing verb
  const recurring  = /\b(\/\s*month|per\s+month|monthly|\/mo\b)/i.test(t);
  const investVerb = /\b(invest|contribut|put\s+\$?\d|deposit|save\s+\$?\d+\s*\/?\s*mo)/i.test(t);
  if (recurring && investVerb) return "invest";

  // Debt payoff
  const debtVerb = /\b(pay\s*off|payoff|pay\s*down|extra\s+on)\b/.test(t);
  const debtNoun = /\b(credit\s*card|debt|loan|mortgage|amex|visa|mastercard|line\s+of\s+credit|loc)\b/.test(t);
  if (debtVerb || debtNoun) return "debt";

  return "purchase";
}

// ── 9. Account-type classification helpers (Phase B1) ────────────────────────
// Plaid returns a 2-level type taxonomy: top-level `type` ("depository",
// "credit", "loan", "investment") and granular `subtype` ("checking", "savings",
// "credit card", "rrsp", "tfsa", "401k", etc.). These helpers centralise the
// classification logic so consumers never have to know the dichotomy.
//
// Each helper accepts an account object and returns true/false.
// All checks are case-insensitive and null-safe.

function _accountKey(a) {
  return {
    type:    String(a?.type || "").toLowerCase(),
    subtype: String(a?.subtype || "").toLowerCase(),
  };
}

// Cash: anything that contributes to spendable balance (safe-to-spend math).
// Top-level depository = checking, savings, money market, CD, prepaid, paypal.
export function isCashAccount(a) {
  const { type, subtype } = _accountKey(a);
  if (type === "depository") return true;
  // Backward-compat: pre-B1 data may have type === "checking" / "savings" directly.
  if (type === "checking" || type === "savings") return true;
  return false;
}

export function isCheckingAccount(a) {
  const { type, subtype } = _accountKey(a);
  if (type === "depository" && subtype === "checking") return true;
  if (type === "checking") return true; // back-compat
  return false;
}

export function isSavingsAccount(a) {
  const { type, subtype } = _accountKey(a);
  if (type === "depository" && subtype === "savings") return true;
  if (type === "savings") return true; // back-compat
  return false;
}

// Credit liabilities: credit cards, lines of credit, PayPal credit, etc.
// These should be treated as negative-balance items in net-worth math.
export function isCreditLiability(a) {
  const { type, subtype } = _accountKey(a);
  if (type === "credit") return true;
  if (subtype === "credit card" || subtype === "line of credit") return true;
  // Loans (mortgage, student, auto, personal) are also liabilities.
  if (type === "loan") return true;
  return false;
}

// Investment accounts: brokerages, retirement accounts (RRSP, TFSA, 401k, IRA).
export function isInvestmentAccount(a) {
  const { type, subtype } = _accountKey(a);
  if (type === "investment") return true;
  if (type === "brokerage") return true;
  // Some Plaid responses put retirement subtypes under depository — guard against:
  if (["rrsp","tfsa","fhsa","resp","rrif","lira","401k","ira","roth","529","hsa"].includes(subtype)) return true;
  return false;
}

// ── 10. buildDebtListForSimulator (Phase B4) ────────────────────────────────
// Combines Plaid Liabilities (authoritative APR + payment data) with manual
// debts (user-entered IOUs / unconnected accounts) into a unified list the
// simulator can consume. Plaid wins for any debt that has a connected source.
//
// Inputs:
//   manualDebts  — array from data.debts (shape: {name, balance, rate, min, fromBank?})
//   liabilities  — object from appData.liabilities ({credit:[], mortgage:[], student:[]})
//
// Output:
//   Array of normalized debt objects ready for sort-by-APR + simulate.
//   Each entry: {name, balance:number, rate:number, min:number, source:string, account_id?:string}
//
// Logic:
//   1. Map all liabilities.credit entries (Plaid-authoritative)
//   2. Add manual debts that are NOT fromBank:true (user-entered standalones)
//   3. Skip fromBank:true manual debts entirely when liabilities are present —
//      Plaid is the source of truth for those. If liabilities is missing/empty,
//      fall back to using manual debts as-is.

export function buildDebtListForSimulator(manualDebts, liabilities) {
  const manual = Array.isArray(manualDebts) ? manualDebts : [];
  const plaidCredit = liabilities && Array.isArray(liabilities.credit) ? liabilities.credit : [];

  // No Plaid liabilities → use manual debts unchanged (back-compat for users without bank-connected liabilities)
  if (plaidCredit.length === 0) {
    return manual
      .filter(d => parseFloat(d.balance || 0) > 0)
      .map(d => ({
        name: d.name || "Debt",
        balance: parseFloat(d.balance || 0),
        rate: parseFloat(d.rate || 0) || 20, // fallback 20% APR if user left blank
        min: parseFloat(d.min || 0) || Math.max(25, parseFloat(d.balance || 0) * 0.02),
        source: "manual",
      }));
  }

  // Plaid liabilities present → build authoritative list
  const plaidEntries = plaidCredit
    .filter(c => (c.balance || 0) > 0)
    .map(c => ({
      name: c.name || "Credit Card",
      balance: c.balance || 0,
      rate: c.apr || 20, // Plaid sometimes returns null APR; fallback 20%
      min: c.minPayment || Math.max(25, (c.balance || 0) * 0.02),
      source: "plaid_liability",
      account_id: c.account_id,
    }));

  // Add manual debts that are NOT fromBank (user-entered standalones — IOUs, unconnected cards, etc.)
  const manualStandalones = manual
    .filter(d => !d.fromBank && parseFloat(d.balance || 0) > 0)
    .map(d => ({
      name: d.name || "Debt",
      balance: parseFloat(d.balance || 0),
      rate: parseFloat(d.rate || 0) || 20,
      min: parseFloat(d.min || 0) || Math.max(25, parseFloat(d.balance || 0) * 0.02),
      source: "manual",
    }));

  return [...plaidEntries, ...manualStandalones];
}

// ── 11. markTransfers (Phase B6-A) ──────────────────────────────────────────
// Cross-account transfer detection: pairs transactions across the user's own
// connected accounts. When the same amount appears at two of the user's
// accounts within ±2 days with opposite signs, it's a transfer (e.g., a credit
// card payment from checking).
//
// This complements existing keyword/category detection (isInternalTransfer,
// isCCPayment in App.jsx). Either signal flags isTransfer:true.
//
// Inputs:
//   txns — array of normalized transactions, each with {id, date, amount,
//          account_id, name, cat, ...}
//   keywordIsTransferFn — optional function (txn) => boolean. If provided,
//          its result is OR'd with the cross-account match. Pass in App.jsx's
//          isInternalTransfer to compose with existing keyword detection.
//   isCashAdvanceFn — optional function (txn) => boolean. If provided, txns
//          flagged as cash advances are excluded from cross-account matching
//          (they look like transfers but functionally aren't).
//
// Output:
//   New array (does not mutate input). Each txn gets:
//     isTransfer:      boolean    — true if either keyword OR cross-account match
//     transferPairId?: string     — shared id between two paired txns (for cross-account only)
//
// Algorithm:
//   1. Group all positive (outflow) txns and all negative (inflow) txns by amount.
//   2. For each outflow, find an inflow at a DIFFERENT account_id within ±2 days
//      whose amount is the exact opposite (within $0.01).
//   3. Skip outflows/inflows already matched (one counterpart only).
//   4. Skip cash advances if isCashAdvanceFn is provided and returns true.
//   5. Mark both as isTransfer:true and assign a shared transferPairId.
//   6. After cross-account pass, run keywordIsTransferFn on every remaining
//      txn to catch single-sided transfers (e.g., transfer to disconnected account).

export function markTransfers(txns, keywordIsTransferFn, isCashAdvanceFn) {
  if (!Array.isArray(txns) || txns.length === 0) return [];

  // Defensive copy with isTransfer flag initialized
  const result = txns.map(t => ({ ...t, isTransfer: false }));

  // Track matched indices to prevent double-pairing
  const matched = new Set();

  // Pre-filter: skip cash advances entirely from cross-account matching
  const isAdvance = (idx) => {
    const t = result[idx];
    return isCashAdvanceFn && isCashAdvanceFn(t);
  };

  // Build amount-keyed buckets for fast lookup
  // Use absolute amount (rounded to 2 decimals) as key
  const keyOf = (amt) => Math.round(Math.abs(amt) * 100) / 100;

  // Index inflows by amount: amount → [{idx, txn}, ...]
  const inflowsByAmount = new Map();
  result.forEach((t, idx) => {
    if (t.amount < 0 && !isAdvance(idx)) {
      const k = keyOf(t.amount);
      if (!inflowsByAmount.has(k)) inflowsByAmount.set(k, []);
      inflowsByAmount.get(k).push({ idx, txn: t });
    }
  });

  // For each outflow, look for a matching inflow at different account_id within ±2 days
  result.forEach((outflow, outIdx) => {
    if (outflow.amount <= 0 || matched.has(outIdx) || isAdvance(outIdx)) return;
    const k = keyOf(outflow.amount);
    const candidates = inflowsByAmount.get(k);
    if (!candidates) return;

    const outDate = new Date(outflow.date + "T12:00:00");
    if (isNaN(outDate.getTime())) return;

    for (const { idx: inIdx, txn: inflow } of candidates) {
      if (matched.has(inIdx)) continue;
      if (inflow.account_id === outflow.account_id) continue; // must be different accounts
      if (!inflow.date) continue;
      const inDate = new Date(inflow.date + "T12:00:00");
      if (isNaN(inDate.getTime())) continue;
      const dayDiff = Math.abs((outDate - inDate) / (1000 * 60 * 60 * 24));
      if (dayDiff > 2) continue;

      // Match found — mark both
      const pairId = `${outflow.id || outIdx}+${inflow.id || inIdx}`;
      result[outIdx].isTransfer = true;
      result[outIdx].transferPairId = pairId;
      result[inIdx].isTransfer = true;
      result[inIdx].transferPairId = pairId;
      matched.add(outIdx);
      matched.add(inIdx);
      break; // one pair per outflow
    }
  });

  // Apply keyword detection for any txn not yet flagged
  if (keywordIsTransferFn) {
    result.forEach(t => {
      if (!t.isTransfer && keywordIsTransferFn(t)) {
        t.isTransfer = true;
      }
    });
  }

  return result;
}

// -----------------------------------------------------------------------------
// STRIPE / PREMIUM NOTE
//   These functions are plan-agnostic. Usage limits live in usageLimits.js
//   (Phase 2). Do not add plan checks here — keep the math layer pure.
// -----------------------------------------------------------------------------
