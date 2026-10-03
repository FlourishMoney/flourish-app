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
import { effectiveCategory } from "./categoryOverrides.js";
import { monthlyIncomeBasis, correctionsOf } from "./forecastEdits.js";

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

// ── 4b. THE debt payoff model every surface uses ─────────────────────────────
// Today's Decisions card, the Meet decision and the What-If simulator all say how long a debt takes
// to clear, and all three ask this. Decisions and Meet used to run their own loop at max($25, 2% of
// balance) and ignore the minimum the household entered, while What-If used the entered minimum, so
// the demo car loan ($8,200 at 6.99%, $280 minimum) cleared in 60 months on two screens and 33 on
// the third.
//
// The payment is the debt's own minimum whenever it has one. Only a debt with no minimum at all
// falls back to the estimate, max($25, 2% of the balance).
export function debtMinimumPayment(debt) {
  const min = num(debt && debt.min);
  return min > 0 ? min : Math.max(25, num(debt && debt.balance) * 0.02);
}

// Payoff at the minimum (baseline) and at the minimum plus `extraPayment` (boosted), through the one
// amortization above. A debt with no rate is modelled at 19.99%, as Decisions and Meet always did.
export function simulateDebtPayoffForDebt(debt, extraPayment = 0) {
  return simulateDebtPayoffBoost({
    balance: num(debt && debt.balance),
    apr: num((debt && debt.rate) || 19.99),
    currentPayment: debtMinimumPayment(debt),
    extraPayment: Math.max(0, num(extraPayment)),
  });
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

// ── 7. (calculateScenarioVerdict removed, prompt 3d) ────────────────────────
// It graded a purchase "Go for it", "Proceed carefully", "Think twice" or "Not recommended". What-If
// stopped showing or sending verdicts in prompt 3c; the function is gone so none can come back.

// ── 8. summarizeScenarioForCoach ─────────────────────────────────────────────
// Frozen, read-only block of pre-computed facts the What-If explanation may cite: the amounts only.
// No verdict, no cash rating ("safe" / "tight" / "risky") and no health score change (a fixed -4 / -8
// the health score engine never computed), so the model is never handed a judgment to repeat.
export function summarizeScenarioForCoach(impact) {
  return {
    amount:            impact.amount,
    newBalance:        impact.newBalance,
    newSafeToSpend:    impact.newSafeToSpend,
    savingsDelayWeeks: impact.savingsDelayWeeks,
    savingsDelayDays:  impact.savingsDelayDays,
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
// Plaid returned null). Every fabricated rate is tagged rateEstimated:true so the UI labels it
// "Assumed rate, tap to enter yours" (prompt 3b), so the payoff math then never silently presents an
// assumed rate as the user's real one, and the household can replace it with theirs (applyDebtRate).
const DEFAULT_APR_CREDIT    = 20; // typical Canadian credit-card APR
const DEFAULT_RATE_MORTGAGE = 5;  // mortgages typically 3–6%
const DEFAULT_RATE_STUDENT  = 6;  // student loans typically 5–7%

// demo-fixes C8a: `data` (the household: accounts, debtLinkDismissed) lets the list treat a linked pair
// as one debt and mark an unanswered pair. A hand-entered debt the household linked to a bank account
// (sameAsAccountId) and that account's own entries (its live-balance row, or the bank's liability
// entry) are ONE entry: the bank's balance as it is now, with the hand-entered debt's rate and minimum
// when it has them, else the bank's. A likely pair not yet answered stays two entries, each with
// mayBeSame ("card" or "line of credit").
export function buildDebtListForSimulator(manualDebts, liabilities, data = {}) {
  const manual = Array.isArray(manualDebts) ? manualDebts : [];
  const accounts = Array.isArray(data && data.accounts) ? data.accounts : [];
  const linkedHand = new Map(); // bank account id → [the hand-entered debt linked to it, its index]
  manual.forEach((d, i) => {
    const id = d && !d.fromBank && d.sameAsAccountId != null && d.sameAsAccountId !== "" ? String(d.sameAsAccountId) : null;
    if (id && !linkedHand.has(id)) linkedHand.set(id, [d, i]);
  });
  const handFor = (accountId) => accountId != null ? linkedHand.get(String(accountId)) || null : null;
  const isFoldedRow = (d) => !!(d && d.fromBank && handFor(d.account_id)); // the bank's row of a linked pair
  // One entry for a linked pair, when the bank sends no liability entry for the account.
  const linkedEntry = (d, manualIndex) => {
    const accountId = String(d.sameAsAccountId);
    const acct = accounts.find(a => a && String(a.id) === accountId);
    const row = manual.find(m => m && m.fromBank && String(m.account_id) === accountId);
    const balance = acct ? Math.abs(num(acct.balance)) : row ? num(row.balance) : num(d.balance);
    const rate = num(d.rate) > 0 ? num(d.rate) : row && num(row.rate) > 0 ? num(row.rate) : 0;
    const min = num(d.min) > 0 ? num(d.min) : row ? num(row.min) : 0;
    return {
      name: (acct && acct.name) || (row && row.name) || d.name || "Debt",
      balance,
      rate: rate > 0 ? rate : DEFAULT_APR_CREDIT,
      rateEstimated: !(rate > 0),
      min: debtMinimumPayment({ min, balance }),
      source: "manual",
      debtType: "manual",
      manualIndex, // a rate entered here is saved on the hand-entered debt, which is read first
      account_id: accountId,
      linked: true,
    };
  };
  const isLinkedHand = (d, manualIndex) => !!(d && !d.fromBank && handFor(d.sameAsAccountId) && handFor(d.sameAsAccountId)[1] === manualIndex);
  // Unanswered likely pairs (B4): the hand-entered debt and the bank's entry for that account are marked.
  const markByIndex = new Map(), markByAccount = new Map();
  if (accounts.length) {
    for (const m of likelyDebtAccountMatches({ accounts, debts: manual, debtLinkDismissed: data.debtLinkDismissed })) {
      const word = m.accountKind === "loc" ? "line of credit" : "card";
      markByIndex.set(m.debtIndex, word);
      markByAccount.set(String(m.accountId), word);
      manual.forEach((x, i) => { if (x && x.fromBank && String(x.account_id) === String(m.accountId)) markByIndex.set(i, word); });
    }
  }
  const marked = (list) => list.map(e => {
    const word = (e.source === "manual" && Number.isInteger(e.manualIndex) && markByIndex.get(e.manualIndex)) || (e.source !== "manual" && e.account_id != null && markByAccount.get(String(e.account_id)));
    return word ? { ...e, mayBeSame: word } : e;
  });
  const plaidCredit   = liabilities && Array.isArray(liabilities.credit)   ? liabilities.credit   : [];
  const plaidMortgage = liabilities && Array.isArray(liabilities.mortgage) ? liabilities.mortgage : [];
  const plaidStudent  = liabilities && Array.isArray(liabilities.student)  ? liabilities.student  : [];
  const hasAnyPlaid = (plaidCredit.length + plaidMortgage.length + plaidStudent.length) > 0;

  // No Plaid liabilities → use manual debts unchanged (back-compat for users without bank-connected liabilities)
  if (!hasAnyPlaid) {
    return marked(manual
      .map((d, manualIndex) => [d, manualIndex])
      .filter(([d, manualIndex]) => !isFoldedRow(d) && (isLinkedHand(d, manualIndex) || num(d.balance) > 0))
      .map(([d, manualIndex]) => {
        if (isLinkedHand(d, manualIndex)) return linkedEntry(d, manualIndex);
        const real = num(d.rate);
        return {
          name: d.name || "Debt",
          balance: num(d.balance),
          rate: real > 0 ? real : DEFAULT_APR_CREDIT,
          rateEstimated: !(real > 0), // Sprint 4b: flag fabricated APRs so the UI can label them
          min: debtMinimumPayment(d),
          source: "manual",
          debtType: "manual",
          manualIndex, // where applyDebtRate writes a rate the household enters
        };
      })
      .filter(e => e.balance > 0));
  }

  // Plaid liabilities present → build authoritative list across all 3 categories.
  // When the bank sends no rate, a rate the household entered for that account (kept on its debt
  // entry, matched by account_id) is used before any assumed default.
  const entered = (accountId) => {
    const d = accountId ? manual.find(m => m && m.account_id === accountId && num(m.rate) > 0) : null;
    return d ? num(d.rate) : 0;
  };
  const creditEntries = plaidCredit
    .filter(c => (c.balance || 0) > 0)
    .map(c => {
      const pair = handFor(c.account_id); // C8a: the hand-entered debt linked to this card, if any
      const hand = pair ? pair[0] : null;
      const real = (hand && num(hand.rate)) || num(c.apr) || entered(c.account_id);
      return {
        name: c.name || "Credit Card",
        balance: c.balance || 0,
        rate: real > 0 ? real : DEFAULT_APR_CREDIT, // Plaid sometimes returns null APR
        rateEstimated: !(real > 0),
        min: debtMinimumPayment({ min: hand && num(hand.min) > 0 ? hand.min : c.minPayment, balance: c.balance }),
        source: "plaid_liability",
        debtType: "credit_card",
        account_id: c.account_id,
        ...(hand ? { linked: true } : {}),
      };
    });
  const fedIds = new Set(plaidCredit.map(c => String(c.account_id)));

  const mortgageEntries = plaidMortgage
    .filter(m => (m.balance || 0) > 0)
    .map(m => {
      const real = num(m.interestRate) || entered(m.account_id);
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
      const real = num(s.interestRate) || entered(s.account_id);
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
    .map((d, manualIndex) => [d, manualIndex])
    // C8a: a linked hand-entered debt is folded into the bank's entry for its account; with no such
    // entry, it is one entry built from the account (linkedEntry).
    .filter(([d, manualIndex]) => !d.fromBank && !(isLinkedHand(d, manualIndex) && fedIds.has(String(d.sameAsAccountId))) && (isLinkedHand(d, manualIndex) || num(d.balance) > 0))
    .map(([d, manualIndex]) => {
      if (isLinkedHand(d, manualIndex)) return linkedEntry(d, manualIndex);
      const real = num(d.rate);
      return {
        name: d.name || "Debt",
        balance: num(d.balance),
        rate: real > 0 ? real : DEFAULT_APR_CREDIT,
        rateEstimated: !(real > 0),
        min: debtMinimumPayment(d),
        source: "manual",
        debtType: "manual",
        manualIndex,
      };
    });

  return marked([...creditEntries, ...mortgageEntries, ...studentEntries, ...manualStandalones.filter(e => e.balance > 0)]);
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

// Days from `today` until the NEXT occurrence of a day-of-month due date. Never negative: a due day
// that has already passed this month rolls to next month.
//
// Sprint D Fix (Bug 1): three sites did the naive `parseInt(bill.date) - today`, where both sides are
// days-of-month — so on the 22nd a bill due the 3rd yielded -19 ("due in -19 days"), and because the
// SELECTION used the same arithmetic, `-19 <= 2` was true and every past-due bill was picked as the
// most urgent. Correct roll-forward logic already existed elsewhere; this is now the single
// implementation all callers share. Pure integer arithmetic — no Date mutation, DST-safe.
// Returns null for an undatable bill.
export function daysUntilDueDay(dueDay, today = new Date()) {
  const raw = parseInt(dueDay, 10);
  if (!Number.isFinite(raw) || raw < 1) return null;
  const y = today.getFullYear(), m = today.getMonth(), dom = today.getDate();
  const dueThisMonth = clampDayToMonth(raw, y, m);       // day 31 → Feb 28, etc.
  if (dueThisMonth >= dom) return dueThisMonth - dom;
  const nm = m === 11 ? 0 : m + 1, ny = m === 11 ? y + 1 : y;
  return (daysInMonth(y, m) - dom) + clampDayToMonth(raw, ny, nm);
}

// The two in-month paydays for a semimonthly income, clamped and GUARANTEED distinct.
// `dayA`/`dayB` are the intended days of month (e.g. the anchor and anchor+15). Both are clamped into
// month (y, m). Bug this fixes: when a high anchor's +15 overflows month-end, dayA and dayB both clamp
// to the last day and collapse into a SINGLE payday — half the month's income. On that collision the
// second deposit is relocated to its half-month partner on the other side (dayB±15) so the income
// still pays TWICE. Returns a sorted array of two day-numbers (or one only in a degenerate case that
// valid semimonthly inputs cannot reach). Low anchors and the 1st-and-15th default are unchanged: they
// never collide, so they fall straight through.
// THE semimonthly pair for a known anchor day, shared by income and bills: the anchor and the day
// half a month away IN THE SAME MONTH, +15 when that fits in a 31-day month and -15 when it does
// not. So a 10th-and-25th schedule is (10, 25) whether it was anchored on the 10th or the 25th, and
// a 15th-and-month-end one is (15, 30) from either end. The old anchor + 15, clamped, piled both
// dates at month end for any anchor after the 16th (anchor 25: the 25th and the 31st, and no 10th).
// semimonthlyDays then clamps the pair into each month (Feb 28/29, 30-day months). With no anchor
// at all: the 1st and the 15th.
export function semimonthlyPair(anchorDay) {
  const d = parseInt(anchorDay, 10);
  if (!(d >= 1 && d <= 31)) return [1, 15];
  return d + 15 <= 31 ? [d, d + 15] : [d - 15, d];
}

export function semimonthlyDays(dayA, dayB, y, m) {
  const a = clampDayToMonth(dayA, y, m);
  let b = clampDayToMonth(dayB, y, m);
  if (b === a) {
    // Overflow collision — take the half-month partner on the opposite side of dayA.
    b = clampDayToMonth(dayB > dayA ? dayA - 15 : dayA + 15, y, m);
  }
  if (b === a) return [a];
  return a < b ? [a, b] : [b, a];
}

const _daysInMonth = daysInMonth;
function _domDate(y, m, day) { return new Date(y, m, clampDayToMonth(day, y, m), 12, 0, 0); }

// A semimonthly bill's two intended days: semimonthlyPair of its anchor day (nextDueDate, or its
// day of month), the same rule income uses, so a bill and an income on the same schedule land on
// the same days. The old ((d1 + 14) % 28) + 1 put a bill anchored on the 15th on the 2nd.
function _billSemimonthlyPair(bill) {
  const anchor = _isoToDate(bill.nextDueDate);
  return semimonthlyPair(anchor ? anchor.getDate() : bill.date);
}

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
    const [dA, dB] = _billSemimonthlyPair(bill);
    const cands = [];
    for (let mo = 0; mo <= 1; mo++) {
      const first = new Date(t.getFullYear(), t.getMonth() + mo, 1, 12);
      const y = first.getFullYear(), m = first.getMonth();
      for (const day of semimonthlyDays(dA, dB, y, m)) cands.push(_domDate(y, m, day));
    }
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
    // The same two days billNextDue schedules, and the same two an income on this schedule pays.
    const [dA, dB] = _billSemimonthlyPair(bill);
    return semimonthlyDays(dA, dB, target.getFullYear(), target.getMonth()).includes(target.getDate());
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

// ── Loan payments ───────────────────────────────────────────────────────────
// A payment on a loan (car, student, line of credit, mortgage) is money moving to a debt, not
// spending. The forecast pays each debt's minimum by itself, so a loan payment also counted in the
// average daily spend would be paid twice. Money out only, and by name only, never by amount.
export const LOAN_PAYMENT_PATTERNS = [
  "loan payment", "loan pmt", "loan pymt", "auto loan", "car loan", "student loan",
  "auto finance", "car finance", "vehicle finance", "auto financing",
  "line of credit", "mortgage payment", "mortgage pmt",
  // Lenders and servicers whose payments carry only their name.
  "navient", "nelnet", "mohela", "aidvantage", "nslsc", "student aid",
  "honda financial", "toyota financial", "ford credit", "ally auto", "gm financial", "santander consumer",
  "capital one auto", "td auto",
];
// Card issuers whose payment lines carry only the issuer's name.
const CARD_PAYEE_PATTERNS = ["capital one", "discover", "american express", "amex", "chase card", "citi card", "barclaycard"];
export function isLoanPayment(txn) {
  if (!txn || !(txn.amount > 0)) return false;
  const name = (txn.name || "").toLowerCase();
  return LOAN_PAYMENT_PATTERNS.some(p => name.includes(p));
}

// Is this outflow the payment of one of `minimums` (the minimums the forecast pays)? It must look
// like a debt payment (a card payment, a loan payment, a card issuer, or a transfer) AND match a
// minimum's amount within $2 or 5%. Both, because either alone would take real spending out: a card
// paid in full, or a $68 dinner on the day the Visa minimum is $68.
export function paysADebtMinimum(txn, minimums, debts = []) {
  if (!txn || !(txn.amount > 0) || !(minimums && minimums.length)) return false;
  const name = (txn.name || "").toLowerCase();
  const looksLikePayment = !!txn.isTransfer || isCCPayment(txn, debts) || isLoanPayment(txn) ||
    CARD_PAYEE_PATTERNS.some(p => name.includes(p));
  if (!looksLikePayment) return false;
  return minimums.some(m => Math.abs(txn.amount - m) <= Math.max(2, m * 0.05));
}

// ── Which bill IS a debt's payment ──────────────────────────────────────────
// Only when the bill says so: its debtId names the debt, by the debt's own id or by its bank
// account id. Never by amount, date or name. A $68 phone bill due on the 1st is not the Visa
// minimum, and a bill someone called "Car Loan" is not the car loan until it is linked to it.
export function billPaysDebt(bill, debt) {
  const link = bill && bill.debtId;
  if (link == null || link === "" || !debt) return false;
  const l = String(link);
  return (debt.id != null && debt.id !== "" && l === String(debt.id)) ||
         (debt.account_id != null && debt.account_id !== "" && l === String(debt.account_id));
}

// A debt's link key: what a bill's debtId holds to say "I pay this debt". The debt's own id, or for a
// bank-imported debt its bank account id; null while it has neither (withDebtIds gives it an id).
export function debtLinkKey(debt) {
  if (!debt) return null;
  if (debt.id != null && debt.id !== "") return String(debt.id);
  if (debt.account_id != null && debt.account_id !== "") return String(debt.account_id);
  return null;
}
export function newDebtId() {
  return `debt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
// A debt's id when it is first given one on load (demo-fixes C1): derived from its place in the list
// and what it holds, so two loads of the same saved data, on this device or another, give it the same
// id even before that id has been saved. Once saved the id is kept, whatever the debt later becomes.
function _fnv(s) { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(36); }
export function stableDebtId(debt, index) {
  const d = debt || {};
  return `debt-${index}-${_fnv([index, d.name, d.balance, d.rate, d.min, d.dueDay].map(x => String(x ?? "")).join("|"))}`;
}
// Give every debt that has no link key an id, once. Returns the SAME array when nothing needed one,
// so a caller can tell there is nothing to write. The id is stableDebtId's unless a caller passes its
// own maker; it never repeats an id already in the list. (A bank-imported debt keeps its bank account
// id as its key: it is identified by that, stably, and a bank resync replaces the object.)
export function withDebtIds(debts, makeId = stableDebtId) {
  const list = Array.isArray(debts) ? debts : [];
  if (!list.some(d => d && !debtLinkKey(d))) return debts;
  const taken = new Set(list.map(d => d && d.id).filter(x => x != null && x !== "").map(String));
  return list.map((d, i) => {
    if (!d || debtLinkKey(d)) return d;
    let id = String(makeId(d, i)), n = 2;
    while (taken.has(id)) id = `${id}-${n++}`;
    taken.add(id);
    return { ...d, id };
  });
}

// The debt minimums still to pay on their own: every debt with a minimum above zero that no bill
// already pays. Safe to spend reserves these and the forecast subtracts them, so both screens count
// the same money once. [{ debt, amount }]
export function unbilledDebtMinimums(debts, bills) {
  const bs = bills || [];
  return (debts || [])
    .map(debt => ({ debt, amount: num(debt && debt.min) }))
    .filter(x => x.amount > 0 && !bs.some(b => billPaysDebt(b, x.debt)));
}

// The day of the month a debt's minimum is due: its dueDay when it has one, otherwise the 1st.
export function debtMinimumDueDay(debt) {
  const d = parseInt(debt && debt.dueDay, 10);
  return d >= 1 && d <= 31 ? d : 1;
}

// Every debt minimum paid in days 1..days after `today` (today, day 0, is never included, as
// recurring bills are not: today's balance already reflects anything paid today), each on its due
// day clamped to the month. [{ debt, amount, day, date }]. The forecast and Today's "Due soon" both
// read this, so they list the same minimums on the same days.
export function debtMinimumDates(data, today = new Date(), days = 90) {
  const out = [];
  for (const { debt, amount } of unbilledDebtMinimums(data && data.debts, data && data.bills)) {
    const dueDay = debtMinimumDueDay(debt);
    for (let i = 1; i <= days; i++) {
      const d = new Date(today); d.setDate(today.getDate() + i);
      if (d.getDate() === clampDayToMonth(dueDay, d.getFullYear(), d.getMonth())) out.push({ debt, amount, day: i, date: d });
    }
  }
  return out;
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

// The currency an account is held in. An ABSENT currency means "not stated", and the only safe
// reading of that is the user's OWN currency — not a hardcoded CAD.
//
// Five call sites plus netWorth used `String(a.currency || "CAD")`. For a Canadian that is invisibly
// correct. For an American it is catastrophic and silent: every unstamped account fails the
// base-currency test, so the balance, net worth and every total collapse to $0 with a "held in
// another currency" notice — which is exactly what a US user got after uploading a bank statement,
// because the statement importer creates its account with no currency at all. Defaulting to the
// user's base currency means an unstamped account is counted as theirs, and a CAD user's behaviour
// is bit-for-bit unchanged (their base IS CAD).
export function accountCurrencyOf(account, data) {
  return String((account && account.currency) || baseCurrencyOf(data)).toUpperCase();
}

// Is this account held in the user's own currency? (Unstamped counts as yes — see above.)
export function isBaseCurrencyAccount(account, data) {
  return accountCurrencyOf(account, data) === baseCurrencyOf(data);
}

// THE SAME CARD, ENTERED TWICE (demo-fixes B4). A household that links its bank and also adds the
// card as a debt by hand has one card in two places: a bank credit account, and a debt with no link to
// it. Net worth counts both (it never pairs them by name, Sprint Z3 #8), so it is off by the balance.
// likelyDebtAccountMatches finds the likely pairs and the Worth screen and the debt editor ask once:
// "Is this the same as your Visa ••1234?". Yes sets debt.sameAsAccountId (linkDebtToAccount); No
// stores the pair in data.debtLinkDismissed (dismissDebtAccountMatch) so it is never asked again.
//
// sameAsAccountId is read by netWorthRows and nothing else. It is deliberately not account_id: that
// field also lends the debt's rate to the bank's card in the debt simulator, and disconnecting the
// bank deletes debts carrying it. Saying "yes, it's the same card" changes net worth and nothing else.
//
// THE MATCH RULE. A debt that is not linked (no fromBank, no account_id or sameAsAccountId that names
// a bank credit account) and is a card or a line of credit (the app records a debt's type as its name:
// "Credit Card", "Line of Credit", or a name that says card or credit or names a card network or
// issuer), paired with a bank credit account no other debt is linked to (the live-balance row bank sync
// makes for that account is the account itself, not another debt, C6), when any of these hold:
//   - they share the last 4 digits (from the name or the account's mask); or
//   - the names share an issuer or network (Visa, Mastercard, Amex, Chase, TD, RBC, ...).
// Balances alone never make a pair (C2): the closer balance only ranks pairs that already qualify.
// A debt named only by its type, as the debt editor names it ("Credit Card", "Line of Credit": no digits,
// issuer or network), qualifies when exactly one bank account of its kind (a credit card for a card, a line
// of credit for a line of credit) is linked to no other debt and not dismissed for this debt (C5). With two
// or more, nothing is asked.
// Each debt is paired with at most one account and each account with at most one debt, the strongest
// first (last 4 digits, then issuer, then the only account of its kind, then the smaller balance gap).
// Debts are identified by id only (C1).
const _ISSUERS = ["visa", "mastercard", "master card", "amex", "american express", "discover", "chase", "sapphire", "capital one", "citi", "citibank",
  "barclays", "synchrony", "wells fargo", "bank of america", "us bank", "u.s. bank", "td", "rbc", "bmo", "scotia", "scotiabank", "cibc", "tangerine",
  "simplii", "desjardins", "national bank", "pc financial", "mbna", "rogers", "triangle", "hsbc", "neo", "koho", "brim", "home trust", "costco"];
const _words = (s) => " " + String(s || "").toLowerCase().replace(/[^a-z0-9.]+/g, " ").trim() + " ";
const _issuersIn = (s) => { const w = _words(s); return new Set(_ISSUERS.filter(x => w.includes(" " + x + " "))); };
const _last4 = (s) => { const m = String(s || "").match(/(\d{4})(?!.*\d{4})/); return m ? m[1] : null; };
const _isBankCreditAccount = (a) => {
  const t = (a && a.type || "").toLowerCase(), s = (a && a.subtype || "").toLowerCase();
  return t === "credit" || t === "credit card" || s === "credit card" || t === "line of credit";
};
// demo-fixes C5: the generic type names, and the kind each one is.
const _GENERIC_DEBT_KIND = { "credit card": "card", "card": "card", "line of credit": "loc", "credit line": "loc", "loc": "loc" };
const _genericDebtKind = (d) => { const n = String(d && d.name || "").toLowerCase(); return /\d/.test(n) ? null : _GENERIC_DEBT_KIND[n.replace(/[^a-z]+/g, " ").trim()] || null; };
const _accountKind = (a) => ((a && a.type || "").toLowerCase() === "line of credit" || (a && a.subtype || "").toLowerCase() === "line of credit" ? "loc" : "card");
const _isCardLikeDebt = (d) => { const n = String(d && d.name || ""); return /credit card|line of credit|\bloc\b|\bcard\b|\bcredit\b/i.test(n) || _issuersIn(n).size > 0; };
// demo-fixes C1: a debt is identified by its id and nothing else. Names are usually the debt's type
// ("Credit Card"), so two cards can share one; keying on the name linked both. Every debt is given a
// stable id on load (withDebtIds); one without an id is never offered, linked or dismissed.
export function debtKey(d) {
  return d && d.id != null && d.id !== "" ? String(d.id) : null;
}
export function accountLabelWithMask(a) {
  const name = String((a && a.name) || "your card");
  return /••\s?\d{4}/.test(name) || !(a && a.mask) ? name : `${name} ••${a.mask}`;
}
export function likelyDebtAccountMatches(data = {}) {
  const accounts = data.accounts || [], debts = data.debts || [];
  const cards = accounts.filter(_isBankCreditAccount);
  const cardIds = new Set(cards.map(a => a.id));
  // demo-fixes C6: bank sync gives every bank card a live-balance debt row (fromBank, carrying the card's
  // account_id). That row is the card, so it never counts as another debt linked to it.
  const linkedIds = new Set(debts.filter(d => d && !d.fromBank).flatMap(d => [d.account_id, d.sameAsAccountId]).filter(id => id != null && cardIds.has(id)));
  const dismissed = new Set(Array.isArray(data.debtLinkDismissed) ? data.debtLinkDismissed : []);
  const candidates = [];
  debts.forEach((d, debtIndex) => {
    if (!d || debtKey(d) == null || d.fromBank || (d.account_id && cardIds.has(d.account_id)) || (d.sameAsAccountId && cardIds.has(d.sameAsAccountId))) return;
    if (!_isCardLikeDebt(d) || !(num(d.balance) > 0)) return;
    const open = cards.filter(a => !linkedIds.has(a.id) && !dismissed.has(`${debtKey(d)}|${a.id}`));
    const kind = _genericDebtKind(d), ofKind = kind ? open.filter(a => _accountKind(a) === kind) : [];
    for (const a of open) {
      const pairKey = `${debtKey(d)}|${a.id}`;
      const aName = `${a.name || ""} ${a.institution || ""}`;
      const d4 = _last4(d.name), a4 = a.mask ? String(a.mask).slice(-4) : _last4(a.name);
      const shared = [..._issuersIn(d.name)].filter(x => _issuersIn(aName).has(x));
      // demo-fixes C2: only a shared last 4 digits or a shared issuer or network makes a pair. Two
      // cards with the same balance are not the same card; closeness of balance only ranks pairs that
      // already qualify.
      const reasons = [];
      if (d4 && a4 && d4 === a4) reasons.push("last4");
      if (shared.length) reasons.push("issuer");
      // demo-fixes C5: a name that is only a type pairs with the one open account of that kind, or none.
      if (ofKind.length === 1 && ofKind[0] === a) reasons.push("onlyAccount");
      const balanceGap = Math.round(Math.abs(num(d.balance) - Math.abs(num(a.balance))) * 100) / 100;
      if (reasons.length) candidates.push({ debtIndex, debtKey: debtKey(d), accountId: a.id, pairKey, reasons, balanceGap,
        debtLabel: String(d.name || "Debt"), accountLabel: accountLabelWithMask(a), accountKind: _accountKind(a),
        score: (reasons.includes("last4") ? 4 : 0) + (reasons.includes("issuer") ? 2 : 0) + (reasons.includes("onlyAccount") ? 1 : 0) });
    }
  });
  candidates.sort((x, y) => y.score - x.score || x.balanceGap - y.balanceGap || x.debtIndex - y.debtIndex);
  const usedDebts = new Set(), usedAccounts = new Set(), out = [];
  for (const c of candidates) {
    if (usedDebts.has(c.debtIndex) || usedAccounts.has(c.accountId)) continue;
    usedDebts.add(c.debtIndex); usedAccounts.add(c.accountId);
    const { score, ...m } = c; out.push(m);
  }
  return out.sort((x, y) => x.debtIndex - y.debtIndex);
}
// "Yes, link them": the debt is the same card as the account. Net worth counts it once.
export function linkDebtToAccount(data = {}, match) {
  if (!match) return data;
  if (!match || match.debtKey == null) return data;
  return { ...data, debts: (data.debts || []).map(d => debtKey(d) != null && debtKey(d) === String(match.debtKey) && !d.sameAsAccountId ? { ...d, sameAsAccountId: match.accountId } : d) };
}
// "No, they're different": never ask about this pair again.
export function dismissDebtAccountMatch(data = {}, match) {
  if (!match || match.debtKey == null) return data;
  const prev = Array.isArray(data.debtLinkDismissed) ? data.debtLinkDismissed : [];
  return prev.includes(match.pairKey) ? data : { ...data, debtLinkDismissed: [...prev, match.pairKey] };
}

// NET WORTH, ROW BY ROW (demo-fixes B1). The ONE owner of what net worth is made of: every account and
// debt it counts, each as a signed row, in the order a household reads them (cash, investments, cards,
// debts). netWorth() below is the sum of these rows, and the Worth screen lists exactly these rows and
// shows the sum in How we got this, so the headline is always the signed sum of what is listed under it.
// The rules are netWorth's own, unchanged:
//   - foreign-currency accounts are left out (no FX in v1), and so are debts owned by one;
//   - a cash or investment account counts its balance, never below $0 (an overdrawn account is not an
//     asset; its label says it was counted as $0);
//   - a bank credit account counts its balance owed;
//   - a debt counts unless it IS a bank credit account already listed (fromBank, or the same
//     account_id). A debt entered by hand with no account_id always counts: two entries for one card
//     can only be told apart by the account_id, never by a name.
// Returns { rows: [{ id, label, kind, value, cents }], totalCents, total }.
export function netWorthRows(data = {}) {
  const accounts = data.accounts || [];
  const debts    = data.debts    || [];
  const base = baseCurrencyOf(data);
  const isBase = a => accountCurrencyOf(a, data) === base;
  const isBankCredit = a => {
    const t = (a.type||"").toLowerCase(), s = (a.subtype||"").toLowerCase();
    return t==="credit" || t==="credit card" || s==="credit card" || t==="line of credit";
  };
  const cents = (n) => Math.round((Number(n) || 0) * 100);
  const rows = [];
  const label = (a) => String((a && a.name) || (a && a.type) || "Account");
  for (const kind of ["cash", "investment"]) {
    for (const a of accounts.filter(isBase).filter(a => kind === "cash" ? isCashAccount(a) : isInvestmentAccount(a))) {
      const bal = num(a.balance), v = Math.max(0, bal);
      rows.push({ id: a.id ?? null, label: bal < 0 ? `${label(a)} (overdrawn, counted as $0)` : label(a), kind, value: v, cents: cents(v) });
    }
  }
  for (const a of accounts.filter(isBase).filter(isBankCredit)) {
    const v = -Math.abs(num(a.balance));
    rows.push({ id: a.id ?? null, label: label(a), kind: "credit", value: v, cents: cents(v) });
  }
  // Every bank-credit account, foreign ones included, so a foreign card's debt is not re-added. A debt
  // the household said is the same card (sameAsAccountId, B4) is that account too.
  const bankCreditAcctIds = new Set(accounts.filter(isBankCredit).map(a => a.id));
  const linked = (d) => (d.account_id && bankCreditAcctIds.has(d.account_id)) || (d.sameAsAccountId && bankCreditAcctIds.has(d.sameAsAccountId));
  debts.forEach((d, debtIndex) => {
    if (!d || d.fromBank || linked(d)) return;
    const v = -Math.max(0, num(d.balance));
    rows.push({ id: d.id ?? null, label: String(d.name || "Debt"), kind: "debt", value: v, cents: cents(v), debtIndex });
  });
  // B4: a likely pair not yet answered stays in, both rows marked. The total is still the sum of
  // the rows shown: nothing is dropped on a guess.
  const matches = likelyDebtAccountMatches(data);
  for (const m of matches) {
    for (const r of rows) {
      if ((r.kind === "credit" && r.id === m.accountId) || (r.kind === "debt" && r.debtIndex === m.debtIndex)) r.mayCountTwice = true;
    }
  }
  const totalCents = rows.reduce((s, r) => s + r.cents, 0);
  return { rows, totalCents, total: totalCents / 100, matches };
}

export const FinancialCalcEngine = {
  /** Net Worth = all assets − all liabilities: the sum of netWorthRows (demo-fixes B1, B4). */
  netWorth(data) {
    // Sprint Z3 #6: currency-mix safety. v1 has no FX conversion, so foreign-currency accounts are
    // detected and left out (netWorthRows applies the same rule to every row).
    const accounts = data.accounts || [];
    const base = baseCurrencyOf(data);
    const mixedCurrencyDetected = accounts.some(a => accountCurrencyOf(a, data) !== base);
    // The rows are the one owner (each counted account and debt, signed, with a debt linked to its
    // bank card by account_id or by the household's yes counted once); these sums are read from them,
    // so the headline, the Today tile and the Worth list cannot disagree.
    const { rows } = netWorthRows(data);
    const sumCents = (kinds) => rows.filter(r => kinds.includes(r.kind)).reduce((s, r) => s + r.cents, 0);
    const assets = sumCents(["cash", "investment"]) / 100;
    const bankCreditLiabilities = -sumCents(["credit"]) / 100;
    const manualNonBankDebts = -sumCents(["debt"]) / 100;
    const liabilities = bankCreditLiabilities + manualNonBankDebts;
    return { assets, liabilities, netWorth: assets - liabilities, bankCreditLiabilities, manualNonBankDebts, mixedCurrencyDetected };
  },

  /** Monthly cash flow = income − bills − discretionary spend (no double-counting).
   *  catOverrides { txnId: category } reassign txn categories; currentDate scopes the spend month. */
  cashFlow(data, catOverrides = {}, currentDate = new Date()) {
    // num(), not parseFloat: `parseFloat("$1,200") > 0` is NaN > 0 === false, which silently dropped
    // a perfectly valid income from the monthly-income total.
    // A "My pay varies" income may carry only the household's expected amount.
    const incomes = (data.incomes || []).filter(i => num(i.amount) > 0 || (i.isVariable && num(i.expectedAmount) > 0));
    const bills   = data.bills || [];
    const accounts = data.accounts || [];
    // Resolution order lives in categoryOverrides.js: this transaction's own override, then a
    // rule for its merchant, then the category it arrived with. A legacy flat { [id]: cat } map
    // — which is what every existing household has stored — behaves exactly as it always did.
    const getEffCat = (t) => effectiveCategory(t, catOverrides);
    // Sprint Z3 #6: exclude transactions from foreign-currency accounts (no FX in v1) so monthly spend
    // isn't summed 1:1 across currencies. account.currency defaults CAD → single-currency users unchanged.
    const base = baseCurrencyOf(data);
    const foreignAcctIds = new Set(accounts.filter(a => accountCurrencyOf(a, data) !== base).map(a => a.id));
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
    // The going per-deposit rate (forecastEdits.monthlyIncomeBasis): the entered amount, unless the
    // household changed it from a date on, stopped it, or said the pay varies (then its low end).
    const monthlyIncome = incomes.reduce((s,i) => s + toMonthly(monthlyIncomeBasis(i, data, currentDate), i.freq), 0);
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
  // The daily spend every projection uses: the household's own figure when they set one on Watch,
  // otherwise Flourish's estimate below.
  avgDailySpend(data) {
    // Never below zero: correctionsOf already drops a negative override, and this holds the line for any
    // other path (prelaunch-copy round 2, item 4).
    const override = correctionsOf(data).dailySpend;
    return Math.max(0, override != null ? override : FinancialCalcEngine.avgDailySpendEstimate(data));
  },

  avgDailySpendEstimate(data) {
    // A payment of a debt minimum the forecast already subtracts is not also daily spend, or the
    // forecast would take it twice. Only that payment: a card, loan or transfer payment whose amount
    // matches one of those minimums (paysADebtMinimum). Everything else is as it always was, because
    // for a statement import a card paid in full, a loan with no debt entered, or a bill paid by
    // online banking IS the household's spending, and nothing else would count it.
    const minimums = unbilledDebtMinimums(data.debts, data.bills).map(x => x.amount);
    const txns = (data.transactions || []).filter(t =>
      t.amount > 0 &&
      !t.pending &&
      !isInternalTransfer(t) &&
      t.cat !== "Income" &&
      t.cat !== "Fees" &&
      !BILL_CATS.has(t.cat) &&
      !CC_PAYMENT_KEYWORDS.some(kw => (t.name||"").toLowerCase().includes(kw)) &&
      !paysADebtMinimum(t, minimums, data.debts || [])
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

// ── applyDebtRate (prompt 3b) ────────────────────────────────────────────────────────────────────
// Writes the rate a household enters for a debt whose rate was assumed (an entry from
// buildDebtListForSimulator with rateEstimated:true). A manual debt gets it on its own entry; a
// bank-linked one gets it on the debt entry for that account (matched by account_id), which is
// created if there is none, so the next build uses it instead of the assumed default.
export function applyDebtRate(debts, entry, rate) {
  const list = Array.isArray(debts) ? debts.slice() : [];
  const r = String(rate);
  if (!entry || !(num(rate) > 0)) return list;
  if (entry.source === "manual" && Number.isInteger(entry.manualIndex) && list[entry.manualIndex]) {
    list[entry.manualIndex] = { ...list[entry.manualIndex], rate: r };
    return list;
  }
  if (entry.account_id) {
    const i = list.findIndex(d => d && d.account_id === entry.account_id);
    if (i >= 0) list[i] = { ...list[i], rate: r };
    else list.push({ id: newDebtId(), name: entry.name, balance: String(entry.balance), rate: r, account_id: entry.account_id, fromBank: true });
  }
  return list;
}
