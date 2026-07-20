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
    // Sprint 4: a bare 4-digit year (1900–2099) is not a dollar amount ("spending in 2026").
    // Amounts in that range must use a $ prefix (handled above).
    if (/^\d{4}$/.test(bare[1]) && n >= 1900 && n <= 2099) return 0;
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

  // Guard: if the payment never exceeds the monthly interest, the debt never amortizes.
  if (r > 0 && pmt <= bal * r) {
    return { monthsToPayoff: Infinity, totalInterest: Infinity, totalPaid: Infinity, payoffInMonths: Infinity, payoffDate: null };
  }

  // Sprint-1 audit fix: amortize month-by-month for EXACT totals. The final month is a
  // partial payment, so the old closed-form (Math.ceil(months) * pmt) overstated totalPaid
  // and totalInterest (e.g. $1000 @ 12% / $100 → returned 1100/100 vs the true 1058.98/58.98).
  let remaining = bal, paid = 0, n = 0;
  while (remaining > 0 && n < 1200) {
    const interest = remaining * r;
    const pay = Math.min(pmt, remaining + interest);
    paid += pay;
    remaining = remaining + interest - pay;
    n++;
  }
  const totalPaid     = _round(paid);
  const totalInterest = _round(paid - bal);

  return {
    monthsToPayoff: n,
    payoffInMonths: n,
    totalPaid,
    totalInterest,
    payoffDate: _monthsFromNow(n),
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
// Sprint 4: contributions are END-of-month by default (ordinary annuity). Pass
// contributionTiming:"begin" for start-of-month (annuity due — one extra period of growth).
// Negative contribution/principal inputs are clamped to 0 (no silent garbage).
export function simulateInvestmentGrowth({
  monthlyContribution,
  annualReturnPct,
  years,
  initialPrincipal = 0,
  contributionTiming = "end",
}) {
  const c = Math.max(0, _num(monthlyContribution));
  const r = _num(annualReturnPct) / 100 / 12;
  const n = Math.max(0, Math.round(_num(years) * 12));
  const p = Math.max(0, _num(initialPrincipal));
  const due = contributionTiming === "begin" ? (1 + r) : 1;

  if (n === 0) {
    return { finalValue: _round(p), totalContributed: _round(p), totalGrowth: 0, yearByYear: [] };
  }

  const growthFactor = Math.pow(1 + r, n);
  const fvPrincipal  = p * growthFactor;
  const fvContribs   = (r === 0 ? c * n : c * ((growthFactor - 1) / r)) * due;

  const finalValue       = _round(fvPrincipal + fvContribs);
  const totalContributed = _round(p + c * n);
  const totalGrowth      = _round(finalValue - totalContributed);

  const yearByYear = [];
  for (let y = 1; y <= Math.round(_num(years)); y++) {
    const periods = y * 12;
    const gf      = Math.pow(1 + r, periods);
    const fvP     = p * gf;
    const fvC     = (r === 0 ? c * periods : c * ((gf - 1) / r)) * due;
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
  // Sprint 4: month-end clamp. Plain setMonth() overflows (Jan 31 + 1mo → Mar 3); instead pin
  // to the 1st of the target month, find that month's last valid day, and clamp (→ Feb 28/29).
  const now = new Date();
  const day = now.getDate();
  const target = new Date(now.getFullYear(), now.getMonth() + Math.round(months), 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(day, lastDay));
  const y  = target.getFullYear();
  const m  = String(target.getMonth() + 1).padStart(2, "0");
  const dd = String(target.getDate()).padStart(2, "0");
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

// Phase D8: Detect lump-sum vs recurring investment.
// Returns true if user's text contains lump-sum markers (one-time deposit intent).
// False means "interpret amount as monthly contribution" (default).
export function detectLumpSum(text) {
  if (!text || typeof text !== "string") return false;
  const t = text.toLowerCase();
  // If text contains recurring markers (/mo, monthly, per month, /month), it's NOT a lump sum
  // even if it also contains "today" or similar — recurring intent wins.
  const recurring = /\b(\/\s*month|per\s+month|monthly|\/mo\b)/i.test(t);
  if (recurring) return false;
  return /\b(today|right\s+now|lump\s*sum|one[\s-]*time|all\s+at\s+once|put\s+in\s+\$?\d|deposit\s+\$?\d)\b/i.test(t);
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

// ── 10. buildDebtListForSimulator (Phase B4 + D9) ───────────────────────────
// Combines Plaid Liabilities (authoritative APR + payment data) with manual
// debts (user-entered IOUs / unconnected accounts) into a unified list the
// simulator can consume. Plaid wins for any debt that has a connected source.
//
// Phase D9: now also handles liabilities.mortgage and liabilities.student.
// Each entry carries a `debtType` field so the UI can label it correctly:
//   "credit_card" | "mortgage" | "student" | "manual"
//
// Inputs:
//   manualDebts  — array from data.debts (shape: {name, balance, rate, min, fromBank?})
//   liabilities  — object from appData.liabilities ({credit:[], mortgage:[], student:[]})
//
// Output:
//   Array of normalized debt objects ready for sort-by-APR + simulate.
//   Each entry: {name, balance:number, rate:number, min:number,
//                source:string, debtType:string, account_id?:string}
//
// Logic:
//   1. Map all liabilities.credit / .mortgage / .student entries (Plaid-authoritative)
//   2. Add manual debts that are NOT fromBank:true (user-entered standalones)
//   3. Skip fromBank:true manual debts entirely when ANY Plaid liabilities are present —
//      Plaid is the source of truth for those. If liabilities is missing/empty,
//      fall back to using manual debts as-is.

// Sprint 4b: fallback rates used ONLY when the real APR is missing (user left it blank, or
// Plaid returned null). Every fabricated rate is tagged rateEstimated:true so the UI can show
// "(est.)" — the payoff math then never silently presents an assumed rate as the user's real one.
const DEFAULT_APR_CREDIT    = 20; // typical Canadian credit-card APR
const DEFAULT_RATE_MORTGAGE = 5;  // mortgages typically 3–6%
const DEFAULT_RATE_STUDENT  = 6;  // student loans typically 5–7%

export function buildDebtListForSimulator(manualDebts, liabilities) {
  const manual = Array.isArray(manualDebts) ? manualDebts : [];
  const plaidCredit   = liabilities && Array.isArray(liabilities.credit)   ? liabilities.credit   : [];
  const plaidMortgage = liabilities && Array.isArray(liabilities.mortgage) ? liabilities.mortgage : [];
  const plaidStudent  = liabilities && Array.isArray(liabilities.student)  ? liabilities.student  : [];
  const hasAnyPlaid = (plaidCredit.length + plaidMortgage.length + plaidStudent.length) > 0;

  // No Plaid liabilities → use manual debts unchanged (back-compat for users without bank-connected liabilities)
  if (!hasAnyPlaid) {
    return manual
      .filter(d => num(d.balance) > 0)
      .map(d => {
        const real = num(d.rate);
        return {
          name: d.name || "Debt",
          balance: num(d.balance),
          rate: real > 0 ? real : DEFAULT_APR_CREDIT,
          rateEstimated: !(real > 0), // Sprint 4b: flag fabricated APRs so the UI can label them
          min: num(d.min) || Math.max(25, num(d.balance) * 0.02),
          source: "manual",
          debtType: "manual",
        };
      });
  }

  // Plaid liabilities present → build authoritative list across all 3 categories
  const creditEntries = plaidCredit
    .filter(c => (c.balance || 0) > 0)
    .map(c => {
      const real = num(c.apr);
      return {
        name: c.name || "Credit Card",
        balance: c.balance || 0,
        rate: real > 0 ? real : DEFAULT_APR_CREDIT, // Plaid sometimes returns null APR
        rateEstimated: !(real > 0),
        min: c.minPayment || Math.max(25, (c.balance || 0) * 0.02),
        source: "plaid_liability",
        debtType: "credit_card",
        account_id: c.account_id,
      };
    });

  const mortgageEntries = plaidMortgage
    .filter(m => (m.balance || 0) > 0)
    .map(m => {
      const real = num(m.interestRate);
      return {
        name: m.name || "Mortgage",
        balance: m.balance || 0,
        rate: real > 0 ? real : DEFAULT_RATE_MORTGAGE,
        rateEstimated: !(real > 0),
        min: m.monthlyPayment || Math.max(25, (m.balance || 0) * 0.005), // 0.5%/mo as last-resort default
        source: "plaid_liability",
        debtType: "mortgage",
        account_id: m.account_id,
      };
    });

  const studentEntries = plaidStudent
    .filter(s => (s.balance || 0) > 0)
    .map(s => {
      const real = num(s.interestRate);
      return {
        name: s.name || "Student Loan",
        balance: s.balance || 0,
        rate: real > 0 ? real : DEFAULT_RATE_STUDENT,
        rateEstimated: !(real > 0),
        min: Math.max(25, (s.balance || 0) * 0.01), // Plaid student liabilities don't return min payment; default 1% of balance
        source: "plaid_liability",
        debtType: "student",
        account_id: s.account_id,
      };
    });

  // Add manual debts that are NOT fromBank (user-entered standalones — IOUs, unconnected cards, etc.)
  const manualStandalones = manual
    .filter(d => !d.fromBank && num(d.balance) > 0)
    .map(d => {
      const real = num(d.rate);
      return {
        name: d.name || "Debt",
        balance: num(d.balance),
        rate: real > 0 ? real : DEFAULT_APR_CREDIT,
        rateEstimated: !(real > 0),
        min: num(d.min) || Math.max(25, num(d.balance) * 0.02),
        source: "manual",
        debtType: "manual",
      };
    });

  return [...creditEntries, ...mortgageEntries, ...studentEntries, ...manualStandalones];
}

// Sprint MATH-LOCK Group C: markTransfers moved to plaidNormalize.js (it belongs with the Plaid
// ingestion pipeline). It takes its classifier predicates as injected params, so it stayed pure.

// ── 12. enrichTxns (Phase C1) ───────────────────────────────────────────────
// Wraps Plaid's /transactions/enrich endpoint. Cleans up transaction names,
// returns merchant logos and refined categories. Billed per transaction.
//
// Inputs:
//   newTxns      — array of normalized transactions just fetched
//   existingTxns — array of previously-enriched txns (for dedup)
//   accounts     — array of account objects (to filter Plaid-backed only)
//   callPlaidFn  — function(action, body) => Promise — the existing callPlaid helper
//
// Output:
//   Promise<array> — same length and order as newTxns, with enrichments merged.
//   Each returned txn has: ...all original fields, plus enriched: true,
//                          and if available: logo (url), name (cleaner), category metadata.
//
// Logic:
//   1. Identify which txns to enrich: from Plaid-backed accounts, not pending,
//      not already enriched. Skip everything else (manual, demo, statement uploads).
//   2. If nothing to enrich, return newTxns unchanged.
//   3. Call backend enrich_transactions with the eligible txns.
//   4. Merge enriched fields by id back into newTxns. Stamp `enriched: true` on
//      every enriched txn so future enrichTxns calls skip it.
//   5. On any error: return newTxns unchanged. Enrichment is non-critical —
//      the txns still display fine without it.

// Canonical income frequency → monthly converter (Tier 4 bug 1). Single source of
// truth; handles `annually` (a/12). Unknown freq is treated as monthly (a).
export function toMonthly(amount, frequency) {
  const a = num(amount) || 0;
  switch (frequency) {
    case "weekly":      return a * 4.333; // 52/12
    case "biweekly":    return a * 2.167; // 26/12
    case "semimonthly": return a * 2;     // 24/12
    case "annually":    return a / 12;
    case "monthly":
    default:            return a;
  }
}

// Tier 5: canonical bill amount → monthly-equivalent. Use everywhere bills are summed into
// a MONTHLY total. One-offs are not recurring, so they contribute 0 to monthly totals (their
// impact lands in the forecast on their date + the SafeSpend upcoming-window instead).
export function billMonthlyAmount(bill) {
  if (!bill) return 0;
  const a = num(bill.amount) || 0;
  if (a <= 0) return 0;
  if (bill.type === "one_off") return 0;
  switch (bill.freq) {
    case "weekly":      return a * 4.333; // 52/12
    case "biweekly":    return a * 2.167; // 26/12
    case "semimonthly": return a * 2;     // 24/12
    case "quarterly":   return a / 3;
    case "annual":
    case "annually":    return a / 12;
    case "monthly":
    default:            return a;
  }
}

// ── Quality Sprint item 1: nextDueDate cadence anchoring ─────────────────────
// Sub-monthly bills (weekly/biweekly) must recur from their actual next due date, not from
// "today". `bill.nextDueDate` ("YYYY-MM-DD") is the phase anchor — set at detection (last
// occurrence + cadence) and backfilled for legacy bills. Pure + unit-tested.
const _DAY_MS = 86400000;
function _atNoon(d) { const x = new Date(d); x.setHours(12, 0, 0, 0); return x; }
function _isoToDate(s) {
  if (typeof s !== "string") return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
  return isNaN(d.getTime()) ? null : d;
}
export function dateToISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
// ── Money parsing — the ONE place a user-supplied amount becomes a number ─────
// The `parseFloat(x || 0)` idiom formerly used across this codebase is a FALSE safeguard: `x || 0` only catches
// null / undefined / "", so a perfectly ordinary "$1,200" still yields NaN. NaN then propagates
// silently through sums and — because every comparison against NaN is false — disables the very
// guards meant to catch trouble (`running < 0` is false for NaN, so an overdraft check reports safe).
//
// parseMoney reports whether the value was genuinely numeric so callers can SIGNAL bad data instead of
// quietly substituting a zero. num() is the terse form for places that only need a safe number.
// Absent / empty is legitimately zero and is NOT an error; "abc" or "12abc" is an error, and "12abc"
// deliberately does not truncate to 12 — silently keeping half a number is its own kind of lie.
export function parseMoney(v) {
  if (v == null || String(v).trim() === "") return { value: 0, ok: true };
  if (typeof v === "number") return Number.isFinite(v) ? { value: v, ok: true } : { value: 0, ok: false };
  const cleaned = String(v).replace(/[$,\s]/g, "").replace(/[−–—]/g, "-");
  const n = parseFloat(cleaned);
  return /^-?(\d+\.?\d*|\.\d+)$/.test(cleaned) && Number.isFinite(n)
    ? { value: n, ok: true }
    : { value: 0, ok: false };
}
export function num(v, fallback = 0) {
  const r = parseMoney(v);
  return r.ok ? r.value : fallback;
}

export function daysInMonth(y, m) { return new Date(y, m + 1, 0).getDate(); }

// THE single source of truth for "a day-of-month that may not exist in this month".
// 31 -> Feb 28 (or 29 in a leap year), Apr 30. Bills, income anchors, and any future recurrence rule
// must all call this: two implementations of the same date rule is exactly how they drift apart, which
// is what let bills clamp correctly while monthly income silently vanished in short months.
export function clampDayToMonth(day, y, m) {
  return Math.min(Math.max(1, day), daysInMonth(y, m));
}

const _daysInMonth = daysInMonth;
function _domDate(y, m, day) { return new Date(y, m, clampDayToMonth(day, y, m), 12, 0, 0); }

// Next occurrence Date on/after `today`. Returns null for non-datable bills.
export function billNextDue(bill, today = new Date()) {
  if (!bill) return null;
  const t = _atNoon(today);
  if (bill.type === "one_off") { const d = _isoToDate(bill.isoDate); return d && d >= t ? d : null; }
  const freq = bill.freq || "monthly";
  if (freq === "weekly" || freq === "biweekly") {
    const step = freq === "weekly" ? 7 : 14;
    let a = _isoToDate(bill.nextDueDate) || t; // no legacy anchor → today (phase unknown)
    if (a < t) { const k = Math.ceil((t - a) / (step * _DAY_MS)); a = new Date(a.getTime() + k * step * _DAY_MS); }
    return _atNoon(a);
  }
  if (freq === "semimonthly") {
    const anchor = _isoToDate(bill.nextDueDate);
    const d1 = anchor ? anchor.getDate() : (parseInt(bill.date) || 1);
    const d2 = ((d1 + 14) % 28) + 1;
    const cands = [];
    for (let mo = 0; mo <= 1; mo++) for (const day of [d1, d2]) cands.push(_domDate(t.getFullYear(), t.getMonth() + mo, day));
    return cands.filter(c => c >= t).sort((a, b) => a - b)[0] || null;
  }
  // monthly / quarterly / annual
  const anchor = _isoToDate(bill.nextDueDate);
  const stepM = freq === "quarterly" ? 3 : (freq === "annual" || freq === "annually") ? 12 : 1;
  if (anchor) {
    // O(1) jump to the next occurrence on/after today — immune to very stale (imported) anchors.
    const monthsBehind = (t.getFullYear() - anchor.getFullYear()) * 12 + (t.getMonth() - anchor.getMonth());
    const steps = Math.max(0, Math.ceil(monthsBehind / stepM));
    let a = _domDate(anchor.getFullYear(), anchor.getMonth() + steps * stepM, anchor.getDate());
    if (a < t) a = _domDate(anchor.getFullYear(), anchor.getMonth() + (steps + 1) * stepM, anchor.getDate());
    return _atNoon(a);
  }
  const dueDay = parseInt(bill.date);
  if (!dueDay) return null;
  let cand = _domDate(t.getFullYear(), t.getMonth(), dueDay);
  if (cand < t) cand = _domDate(t.getFullYear(), t.getMonth() + 1, dueDay);
  return cand;
}

// True if `bill` has an occurrence on calendar date `d` (day granularity, on/after today).
export function billOccursOnDate(bill, d, today = new Date()) {
  if (!bill) return false;
  const t = _atNoon(today);
  const target = _atNoon(d);
  if (target < t) return false;
  if (bill.type === "one_off") { const iso = _isoToDate(bill.isoDate); return !!iso && dateToISO(iso) === dateToISO(target); }
  const freq = bill.freq || "monthly";
  const first = billNextDue(bill, today);
  if (!first) return false;
  if (freq === "weekly" || freq === "biweekly") {
    const step = freq === "weekly" ? 7 : 14;
    if (target < first) return false;
    return Math.round((target - first) / _DAY_MS) % step === 0;
  }
  if (freq === "semimonthly") {
    const anchor = _isoToDate(bill.nextDueDate);
    const d1 = anchor ? anchor.getDate() : (parseInt(bill.date) || 1);
    const d2 = ((d1 + 14) % 28) + 1;
    // clamp to month length (parity with billNextDue's _domDate) so a day 29–31 anchor still
    // matches in short months — otherwise the occurrence would be silently dropped.
    const ty = target.getFullYear(), tm = target.getMonth();
    const day = target.getDate();
    return day === clampDayToMonth(d1, ty, tm) || day === clampDayToMonth(d2, ty, tm);
  }
  // monthly / quarterly / annual — match day-of-month, and (quarterly/annual) the right month
  const aDay = _isoToDate(bill.nextDueDate);
  const dueDay = (aDay ? aDay.getDate() : 0) || parseInt(bill.date);
  if (!dueDay) return false;
  if (target.getDate() !== clampDayToMonth(dueDay, target.getFullYear(), target.getMonth())) return false;
  if (freq === "monthly") return true;
  const stepM = freq === "quarterly" ? 3 : 12;
  const monthsApart = (target.getFullYear() - first.getFullYear()) * 12 + (target.getMonth() - first.getMonth());
  return monthsApart >= 0 && monthsApart % stepM === 0;
}

// Storable nextDueDate ISO for backfilling a bill that lacks one.
export function computeNextDueDate(bill, today = new Date()) {
  const d = billNextDue(bill, today);
  return d ? dateToISO(d) : null;
}

export async function enrichTxns(newTxns, existingTxns, accounts, callPlaidFn, jwt, onError) {
  if (!Array.isArray(newTxns) || newTxns.length === 0) return newTxns || [];
  if (!callPlaidFn) return newTxns;

  // Build set of Plaid-backed account ids (skip Manual, Statement uploads, etc.)
  const plaidAccountIds = new Set(
    (accounts || [])
      .filter(a => a.institution !== "Manual" && a.institution !== "Statement")
      .map(a => a.id)
  );

  // Build set of already-enriched txn ids from existing data
  const alreadyEnriched = new Set(
    (existingTxns || []).filter(t => t.enriched).map(t => t.id)
  );

  // Eligible txns: Plaid-backed account, not pending, not already enriched
  const eligible = newTxns.filter(t =>
    plaidAccountIds.has(t.account_id) &&
    !t.pending &&
    !alreadyEnriched.has(t.id)
  );

  if (eligible.length === 0) return newTxns;

  try {
    const resp = await callPlaidFn("enrich_transactions", { transactions: eligible }, { jwt });
    const enrichedById = new Map();
    (resp.enriched || []).forEach(e => enrichedById.set(e.id, e));

    // Merge enriched fields back into newTxns by id
    return newTxns.map(t => {
      const e = enrichedById.get(t.id);
      if (!e) return t; // not enriched (manual, pending, or no enrichment returned)
      return {
        ...t,
        name: e.name || t.name,
        logo: e.logo || t.logo,
        // Keep original cat for now (user overrides via getEffCat take precedence).
        // Enrich category metadata stored separately for future use.
        enriched: true,
        enrichCategory: e.category_primary || null,
        enrichCategoryDetailed: e.category_detailed || null,
        enrichLocation: e.location_city ? `${e.location_city}, ${e.location_region || ""}`.trim() : null,
      };
    });
  } catch (err) {
    // Non-critical: enrichment failed, return original txns. Report via the injected reporter (if
    // provided) — keeps this trust-layer file dependency-free (no direct Sentry import). Sprint Z #10.
    console.warn("Enrich call failed:", err?.message || err);
    if (typeof onError === "function") { try { onError(err); } catch {} }
    return newTxns;
  }
}

// -----------------------------------------------------------------------------
// STRIPE / PREMIUM NOTE
//   These functions are plan-agnostic. Usage limits live in usageLimits.js
//   (Phase 2). Do not add plan checks here — keep the math layer pure.
// -----------------------------------------------------------------------------

// ═════════════════════════════════════════════════════════════════════════════
// Sprint MATH-LOCK — shared transaction/bill classification constants + pure
// helpers (extracted from App.jsx so the engines + the Plaid pipeline import one
// source of truth). All pure: input → output, no React/localStorage/side effects.
// ═════════════════════════════════════════════════════════════════════════════

// Compound phrases only — single words like "payment","visa","amex" are too broad.
// Real CC payments are caught by Transfer category; these catch non-Transfer settlements.
export const CC_PAYMENT_KEYWORDS = [
  "credit card payment",
  "card payment",
  "minimum payment",
  "balance payment",
  "autopay",
  "amex payment",
  "visa payment",
  "mastercard payment",
  "credit card autopay",
];

// Canadian/US bank online payment names — catch BNS SCOTIAONLINE etc.
// NOT "bill payment" — too broad, catches Enbridge/Hydro One.
export const CC_INSTITUTION_PATTERNS = [
  "scotiaonline",
  "mb-credit card",
  "credit card/loc",
  "mb-visa",
  "mb-mastercard",
  "mb-amex",
  "online bill pay",
  "web payment",
  "telephone banking",
];

// Internal transfer patterns — Interac e-Transfer, wire, own-account moves.
export const INTERNAL_TRANSFER_PATTERNS = [
  "interac e-transfer",
  "interac etransfer",
  "e-transfer",
  "etransfer",
  "wire transfer",
  "online transfer",
  "account transfer",
  "transfer to savings",
  "transfer from savings",
  "transfer to chequing",
  "transfer from chequing",
  "transfer to checking",
  "transfer from checking",
  "internal transfer",
  "own transfer",
  "tfr to",
  "tfr from",
  "funds transfer",
  "swift transfer",
  "ach transfer",
];

export function isInternalTransfer(txn) {
  if(!txn) return false;
  const name = (txn.name || "").toLowerCase();
  const cat  = (txn.cat  || "").toLowerCase();
  if(cat === "transfer") return true;
  return INTERNAL_TRANSFER_PATTERNS.some(p => name.includes(p));
}

// Categories that represent fixed/variable bill commitments — NOT discretionary spending.
// Excluded from budget category suggestions and discretionary spend calcs to prevent double-counting.
export const BILL_CATS = new Set([
  "Utilities","Housing","Bills","Phone & Internet","Insurance",
  "Other Bills","Rent","Mortgage","Transportation" // Transportation when it's a bill payment
]);

// Categories always excluded from spending breakdowns (non-expense flows).
export const NON_SPEND_CATS = new Set(["Transfer","Income","Fees"]);

// Identifies transactions that are credit card payments (not spending). Plaid shows CC payments as:
// Transfer category OR matching CC keywords in name. Also detects by amount matching a known debt
// balance/min (±$5 tolerance).
export function isCCPayment(txn, debts=[]) {
  if(!txn || txn.amount <= 0) return false;
  const name = (txn.name || "").toLowerCase();
  const cat  = (txn.cat  || "").toUpperCase();
  // Compound keyword match (safe — no broad single words)
  if(CC_PAYMENT_KEYWORDS.some(kw => name.includes(kw))) return true;
  // Institution-specific online banking payment names
  if(CC_INSTITUTION_PATTERNS.some(p => name.includes(p))) return true;
  // CC network name + payment verb — catches "MB-RBC ROYAL BANK MASTERCARD"
  if((name.includes("mastercard") || name.includes("amex") || name.includes("visa")) &&
     (name.includes("payment") || name.includes("/loc pay") || name.includes("credit card"))) return true;
  // Transfer category + debt amount match (specific, not broad)
  if(cat === "TRANSFER" || cat.includes("TRANSFER")) {
    if(debts.length > 0) {
      const matchesDet = debts.some(d => {
        const min = num(d.min);
        const bal = num(d.balance);
        return (min > 0 && Math.abs(txn.amount - min) < 5) ||
               (bal > 0 && Math.abs(txn.amount - bal) < 5);
      });
      if(matchesDet) return true;
    }
  }
  return false;
}

export function isCashAdvance(txn) {
  if(!txn) return false; // both directions — CC charge and bank transfer
  const name = (txn.name || "").toLowerCase();
  return name.includes("cash advance") ||
         name.includes("cash adv") ||
         name.includes("atm advance") ||
         name.includes("credit advance") ||
         (name.includes("advance") && (name.includes("credit") || name.includes("card")));
}

// Plaid Personal Finance Category (PFC) primary → Flourish display meta (category, icon, color).
export const CAT_META = {
  FOOD_AND_DRINK:            { cat:"Coffee & Dining", icon:"🍕", color:"#D97A3A" },
  GROCERIES:                 { cat:"Groceries",       icon:"🛒", color:"#2E8B2E" },
  GENERAL_MERCHANDISE:       { cat:"Shopping",        icon:"🛍️", color:"#C45898" },
  CLOTHING_AND_ACCESSORIES:  { cat:"Shopping",        icon:"👕", color:"#C45898" },
  TRANSPORTATION:            { cat:"Gas & Transport", icon:"⛽", color:"#CFA03E" },
  TRAVEL:                    { cat:"Travel",          icon:"✈️", color:"#4A8FCC" },
  ENTERTAINMENT:             { cat:"Entertainment",   icon:"🎬", color:"#8A5FC8" },
  PERSONAL_CARE:             { cat:"Health",          icon:"💊", color:"#4A8FCC" },
  MEDICAL:                   { cat:"Health",          icon:"💊", color:"#4A8FCC" },
  UTILITIES:                 { cat:"Utilities",       icon:"⚡", color:"#CFA03E" },
  LOAN_PAYMENTS:             { cat:"Bills",           icon:"📱", color:"#CFA03E" },
  RENT_AND_UTILITIES:        { cat:"Utilities",       icon:"🏠", color:"#CFA03E" },
  HOME_IMPROVEMENT:          { cat:"Home",            icon:"🔨", color:"#CFA03E" },
  INCOME:                    { cat:"Income",          icon:"💰", color:"#6FE494" },
  TRANSFER_IN:               { cat:"Transfer",        icon:"↔️", color:"#888"    },
  TRANSFER_OUT:              { cat:"Transfer",        icon:"↔️", color:"#888"    },
  CREDIT_CARD_PAYMENT:       { cat:"Transfer",        icon:"💳", color:"#888"    },
  BANK_FEES:                 { cat:"Fees",            icon:"🏦", color:"#888"    },
  GENERAL_SERVICES:          { cat:"Services",        icon:"⚙️", color:"#888"    },
  GOVERNMENT_AND_NON_PROFIT: { cat:"Services",        icon:"🏛️", color:"#888"    },
  EDUCATION:                 { cat:"Education",       icon:"📚", color:"#4A8FCC" },
  // Legacy Plaid category strings (pre-PFC API)
  "Food and Drink":          { cat:"Coffee & Dining", icon:"🍕", color:"#D97A3A" },
  "Shops":                   { cat:"Shopping",        icon:"🛍️", color:"#C45898" },
  "Travel":                  { cat:"Gas & Transport", icon:"⛽", color:"#CFA03E" },
  "Transfer":                { cat:"Transfer",        icon:"↔️", color:"#888"    },
  "Payment":                 { cat:"Bills",           icon:"📱", color:"#CFA03E" },
  "Recreation":              { cat:"Entertainment",   icon:"🎬", color:"#8A5FC8" },
  "Healthcare":              { cat:"Health",          icon:"💊", color:"#4A8FCC" },
};

// A one-off expense is archived once its date has passed (skip in forecast/upcoming). isoDate is
// "YYYY-MM-DD" which sorts lexicographically = chronologically. Sprint MATH-LOCK: `today` threaded
// for testability — the default (now) preserves the original behavior.
export function isBillArchived(b, today = new Date()) {
  if (!b || b.type !== "one_off" || !b.isoDate) return false;
  const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}-${String(today.getDate()).padStart(2,"0")}`;
  return b.isoDate < todayStr;
}

// ═════════════════════════════════════════════════════════════════════════════
// Sprint MATH-LOCK Group B — FinancialCalcEngine (core ratios). PURE: the user's
// per-transaction category reassignments (`catOverrides`, shape { txnId: category })
// and `currentDate` are INJECTED — the caller loads catOverrides from localStorage
// and passes it, so re-categorization is preserved without this layer touching
// storage or the ambient clock. Defaults preserve the original behavior.
// ═════════════════════════════════════════════════════════════════════════════
// Sprint Z3 #6: base reporting currency — explicit profile.baseCurrency, else USD for US profiles, else
// CAD. Single source of truth for netWorth/cashFlow AND the net-worth UI (so they can't drift).
export function baseCurrencyOf(data) {
  return String(data?.profile?.baseCurrency || (data?.profile?.country === "US" ? "USD" : "CAD")).toUpperCase();
}

export const FinancialCalcEngine = {
  /** Net Worth = all assets − all liabilities */
  netWorth(data) {
    const accounts = data.accounts || [];
    const debts    = data.debts    || [];
    // Sprint Z3 #6: currency-mix safety. v1 has no FX conversion, so summing CAD+USD 1:1 gives
    // cross-border users wrong totals. DETECT + EXCLUDE foreign-currency accounts (FX is a v1.x feature).
    // Base = profile.baseCurrency, else USD for US profiles, else CAD. account.currency is stamped from
    // Plaid (balance.iso_currency_code) and defaults CAD for legacy/unstamped accounts — so a
    // single-currency CAD user sees IDENTICAL totals to before (every account stays in-base).
    const base = baseCurrencyOf(data);
    const isBase = a => String(a.currency || "CAD").toUpperCase() === base;
    const mixedCurrencyDetected = accounts.some(a => !isBase(a));
    const baseAccts = accounts.filter(isBase); // foreign-currency accounts are excluded from every sum
    // Assets: only positive-balance accounts (cash + investment). Credit accounts have
    // negative balances and are already captured in liabilities.
    const assets = baseAccts
      .filter(a => isCashAccount(a) || isInvestmentAccount(a))
      .reduce((s,a) => s + Math.max(0, num(a.balance)), 0);
    const isBankCredit = a => {
      const t = (a.type||"").toLowerCase(), s = (a.subtype||"").toLowerCase();
      return t==="credit" || t==="credit card" || s==="credit card" || t==="line of credit";
    };
    const bankCreditAccounts = baseAccts.filter(isBankCredit);
    const bankCreditLiabilities = bankCreditAccounts
      .reduce((s,a) => s + Math.abs(num(a.balance)), 0);
    // Sprint Z3 #8: dedupe Plaid debts by ACCOUNT_ID, not name. fromBank debts are already represented by
    // the credit ACCOUNTS above, and any debt whose account_id matches a bank-credit account is that same
    // account — skip it. Manual debts (no account_id, not fromBank) ALWAYS count: a name coincidence with a
    // bank account no longer silently drops a real user-entered debt. (ids from ALL bank-credit accounts,
    // incl. excluded foreign ones, so a foreign-account debt isn't re-added into the base-currency total.)
    const bankCreditAcctIds = new Set(accounts.filter(isBankCredit).map(a => a.id));
    const manualNonBankDebts = debts
      .filter(d => !d.fromBank && !(d.account_id && bankCreditAcctIds.has(d.account_id)))
      .reduce((s,d) => s + Math.max(0, num(d.balance)), 0);
    const liabilities = bankCreditLiabilities + manualNonBankDebts;
    return { assets, liabilities, netWorth: assets - liabilities, bankCreditLiabilities, manualNonBankDebts, mixedCurrencyDetected };
  },

  /** Monthly cash flow = income − bills − discretionary spend (no double-counting).
   *  catOverrides { txnId: category } reassign txn categories; currentDate scopes the spend month. */
  cashFlow(data, catOverrides = {}, currentDate = new Date()) {
    // num(), not parseFloat: `parseFloat("$1,200") > 0` is NaN > 0 === false, which silently dropped
    // a perfectly valid income from the monthly-income total.
    const incomes = (data.incomes || []).filter(i => num(i.amount) > 0);
    const bills   = data.bills || [];
    const accounts = data.accounts || [];
    const getEffCat = (t) => catOverrides[t.id] || t.cat;
    // Sprint Z3 #6: exclude transactions from foreign-currency accounts (no FX in v1) so monthly spend
    // isn't summed 1:1 across currencies. account.currency defaults CAD → single-currency users unchanged.
    const base = baseCurrencyOf(data);
    const foreignAcctIds = new Set(accounts.filter(a => String(a.currency || "CAD").toUpperCase() !== base).map(a => a.id));
    const mixedCurrencyDetected = foreignAcctIds.size > 0;
    // Filter to the current month only.
    const txns = (data.transactions || []).filter(t => {
      if(t.amount <= 0) return false;
      if(!t.date) return false;
      if(t.pending) return false; // pending txns not yet settled — exclude from spending
      if(foreignAcctIds.has(t.account_id)) return false; // Sprint Z3 #6: skip foreign-currency txns
      const d = new Date(t.date + "T12:00:00");
      return d.getFullYear() === currentDate.getFullYear() && d.getMonth() === currentDate.getMonth();
    });
    // No invented income fallback — 0 when none entered (ratio calcs guard >0).
    const monthlyIncome = incomes.reduce((s,i) => s + toMonthly(i.amount, i.freq), 0);
    const monthlyBills  = bills.reduce((s,b) => s + billMonthlyAmount(b), 0);
    // Discretionary: excludes non-spend flows, bill categories (already in monthlyBills), CC payments.
    const monthlySpend  = txns.filter(t => {
      const cat = getEffCat(t);
      return !NON_SPEND_CATS.has(cat) &&
             !BILL_CATS.has(cat) &&
             !isInternalTransfer(t) &&
             !CC_PAYMENT_KEYWORDS.some(kw => (t.name||"").toLowerCase().includes(kw));
    }).reduce((s,t) => s + t.amount, 0);
    const totalExpenses = monthlyBills + monthlySpend;
    return { monthlyIncome, monthlyBills, monthlySpend, totalExpenses,
             cashFlow: monthlyIncome - totalExpenses, mixedCurrencyDetected };
  },

  /** Savings rate = (income − expenses) / income */
  savingsRate(data, catOverrides = {}, currentDate = new Date()) {
    const { monthlyIncome, totalExpenses } = FinancialCalcEngine.cashFlow(data, catOverrides, currentDate);
    return monthlyIncome > 0 ? Math.max(0, (monthlyIncome - totalExpenses) / monthlyIncome) : 0;
  },

  /** Debt ratio = total debt / annual income (uses only monthlyIncome, override-independent — threaded for API uniformity) */
  debtRatio(data, catOverrides = {}, currentDate = new Date()) {
    const { monthlyIncome } = FinancialCalcEngine.cashFlow(data, catOverrides, currentDate);
    const totalDebt = (data.debts||[]).reduce((s,d) => s + num(d.balance), 0);
    return monthlyIncome > 0 ? totalDebt / (monthlyIncome * 12) : 0;
  },

  /** Emergency fund months = liquid savings / monthly expenses */
  emergencyFundMonths(data, catOverrides = {}, currentDate = new Date()) {
    const accounts = data.accounts || [];
    const { totalExpenses } = FinancialCalcEngine.cashFlow(data, catOverrides, currentDate);
    const liquidSavings = accounts
      .filter(a => ["savings","checking","depository"].includes(a.type))
      .reduce((s,a) => s + num(a.balance), 0) || 0;
    return totalExpenses > 0 ? liquidSavings / totalExpenses : 0;
  },

  /** Average daily spend from transaction history. Uses raw t.cat (never respected overrides) and
   *  derives its window from the txn dates themselves — already pure, no params threaded. */
  avgDailySpend(data) {
    const txns = (data.transactions || []).filter(t =>
      t.amount > 0 &&
      !t.pending &&
      !isInternalTransfer(t) &&
      t.cat !== "Income" &&
      t.cat !== "Fees" &&
      !BILL_CATS.has(t.cat) &&
      !CC_PAYMENT_KEYWORDS.some(kw => (t.name||"").toLowerCase().includes(kw))
    );
    if(txns.length === 0) return 0;
    const total = txns.reduce((s,t) => s + Math.abs(t.amount), 0);
    const dates = txns.map(t => new Date(t.date)).filter(d => !isNaN(d));
    const daySpan = dates.length > 1
      ? Math.max(1, Math.round((Math.max(...dates) - Math.min(...dates)) / (1000*60*60*24)))
      : 30;
    const normalisedDays = Math.min(90, Math.max(14, daySpan));
    return total / normalisedDays;
  },
};
