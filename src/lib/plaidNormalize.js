// src/lib/plaidNormalize.js
// -----------------------------------------------------------------------------
// Flourish — Plaid → app transaction pipeline (Sprint MATH-LOCK Group C).
//
// PURE: input → output, no React/localStorage/side effects. The Plaid ingestion
// pipeline in one place: raw Plaid txns → normaliseTxns → markTransfers →
// detectRecurringBills / detectIncomeFromTxns. Shared classifiers + CAT_META live
// in financialCalculations.js (the leaf); this module imports them.
// -----------------------------------------------------------------------------

import {
  CAT_META,
  CC_PAYMENT_KEYWORDS,
  isInternalTransfer,
  isCCPayment,
  isCashAdvance,
  dateToISO,
} from "./financialCalculations.js";

// Normalize raw Plaid transactions into the app's standard shape (id, cat meta, day-of-week, etc.).
// `today` is threaded for testability: it's only the fallback when a txn has no date (rare), so the
// default (now) preserves the original behavior.
export function normaliseTxns(plaidTxns, today = new Date()) {
  return plaidTxns.map((t, i) => {
    // Match exact key, then try stripping underscores for legacy, then prefix
    const rawCat = t.category || "OTHER";
    const meta = CAT_META[rawCat]
      || CAT_META[rawCat.replace(/_/g," ")]
      || Object.entries(CAT_META).find(([k]) => rawCat.startsWith(k))?.[1]
      || { cat:"Other", icon:"💳", color:"#888" };
    // Compute day-of-week (0=Sun) — used by spending charts & patterns
    const d = t.date ? new Date(t.date + "T12:00:00") : today;
    return {
      id:         t.id || `plaid_${i}`,
      date:       t.date,
      name:       t.name,
      amount:     t.amount,     // positive = expense (matches MOCK_TXN convention)
      cat:        meta.cat,
      icon:       meta.icon,
      color:      meta.color,
      dow:        d.getDay(),   // 0–6; matches shape expected by spend screens
      pending:    t.pending || false,
      account_id: t.account_id,
      currency:   t.currency || "CAD",
      logo:       t.logo_url || null,
    };
  });
}

// ── Cadence detection ────────────────────────────────────────────────────────
// Derive a pay frequency from observed deposit DATES. Both Plaid write sites used to stamp
// freq:"biweekly" unconditionally, so a monthly earner was projected at ~2.2x their real income —
// the amount was right after the per-deposit fix, but the multiplier was not.
//
// PRIMARY SIGNAL: the gap between consecutive deposits, which separates the dangerous confusions
// cleanly — monthly (~30d) vs biweekly (14d) is a 2.17x income error and the gaps are nowhere near
// each other, so that call is reliable.
//
// THE ONE GENUINELY AMBIGUOUS CASE is biweekly (every 14 days) vs semimonthly (twice a calendar
// month, ~15.2d average). Gap length CANNOT separate these, and gap regularity cannot either — pay on
// the 1st and 15th yields gaps of 14,17,14,14,14 across Jan-Mar, i.e. four of five gaps are exactly
// 14, indistinguishable from a fixed fortnightly cycle.
//
// The property that actually differs is DAY-OF-MONTH STABILITY:
//   semimonthly → anchored to TWO calendar days (1st/15th, or 15th/month-end) that never drift.
//   biweekly    → anchored to a 14-day cycle, so its day-of-month walks backwards through the month
//                 and visits many distinct days over a few months.
// So: cluster the observed days-of-month (tolerance 2 for weekend shifts, with month-end treated as a
// single anchor so the 28th/30th/31st count as one). Two or fewer anchors means semimonthly.
// This needs ~4 deposits to be meaningful; below that we fall back to gap length alone.
//
// Worth stating plainly: getting biweekly vs semimonthly wrong is a PHASE error, not an amount error
// (26 vs 24 pay periods a year — under 8% apart), so the cost of an ambiguous call here is small. The
// large error, monthly vs biweekly, is the one the gap signal resolves reliably.
export function detectCadence(dates) {
  const ds = (dates || [])
    .map(d => (d instanceof Date ? d : new Date(String(d) + "T12:00:00")))
    .filter(d => !isNaN(d.getTime()))
    .sort((a, b) => a - b);
  if (ds.length < 2) return null;                 // one deposit tells us nothing about frequency

  const gaps = [];
  for (let i = 1; i < ds.length; i++) gaps.push(Math.round((ds[i] - ds[i - 1]) / 86400000));
  const sorted = [...gaps].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const medianGap = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;

  if (medianGap <= 10) return "weekly";
  if (medianGap >= 21) return "monthly";

  // 11..20 day band — biweekly vs semimonthly.
  // With fewer than 4 deposits there aren't enough days-of-month to see drift, so use gap length:
  // a fortnightly cycle sits at 14, semimonthly averages ~15.2.
  if (ds.length < 4) return medianGap <= 14 ? "biweekly" : "semimonthly";

  // Cluster days-of-month. Month-end collapses to one anchor ("EOM") because the 28th of February and
  // the 31st of March are the same pay day; tolerance 2 absorbs weekend shifts without merging
  // genuinely distinct anchors (a looser tolerance wrongly merges the 27th into the 30th).
  const dim = (d) => new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const anchors = [];
  let sawMonthEnd = false;
  for (const d of ds) {
    const day = d.getDate();
    if (day >= dim(d) - 2) { sawMonthEnd = true; continue; }
    if (!anchors.some(a => Math.abs(a - day) <= 2)) anchors.push(day);
  }
  return (anchors.length + (sawMonthEnd ? 1 : 0)) <= 2 ? "semimonthly" : "biweekly";
}

// Detect income deposits from transactions. Returns null, or:
//   { monthlyAvg, monthlyLow, monthlyHigh, perDeposit, perDepositLow, perDepositHigh,
//     depositsPerMonth, isVariable, label }
//
// UNITS ARE PART OF THE CONTRACT. `monthly*` are per-CALENDAR-MONTH totals; `perDeposit*` are single
// paycheque amounts. income.amount is a PER-DEPOSIT field — forecastEngine's perDeposit() and
// financialCalculations' toMonthly() both read it that way — so anything populating it must use
// perDeposit, never monthlyAvg.
//
// This previously shipped a field named `typical` that was Math.round(avg) of the MONTHLY totals, i.e.
// byte-identical to monthlyAvg, and every caller stored it in income.amount. A biweekly earner on
// $2,000/cheque was detected as ~$4,333 and then forecast at $4,333 × 26/yr — roughly 2.2× their real
// income. `typical` / `low` / `high` are deliberately GONE rather than aliased: an un-migrated caller
// now throws on undefined instead of silently doubling someone's income.
//
// CRITICAL: TRANSFER is excluded — credit card payments show as TRANSFER_IN and must never count as income.
export function detectIncomeFromTxns(txns) {
  if (!txns || txns.length === 0) return null;
  let incomeTxns = txns.filter(t => {
    if (t.amount >= 0) return false; // must be money IN (negative in Plaid convention)
    const name = (t.name || "").toLowerCase();
    const cat  = (t.cat  || "").toUpperCase();
    if (CC_PAYMENT_KEYWORDS.some(kw => name.includes(kw))) return false;
    if (cat.includes("TRANSFER")) return false;
    return (
      cat.includes("INCOME") ||
      cat.includes("PAYROLL") ||
      name.includes("payroll") ||
      name.includes("direct deposit") ||
      name.includes("salary") ||
      name.includes("pay ") ||
      name.includes("deposit")
    );
  });
  // Sprint D Fix (Bug 3, second risk): the keyword/category filter above misses payroll that posts
  // under the EMPLOYER'S NAME with no "payroll"/"deposit"/"salary" text and no Income category —
  // common at Canadian banks. Fall back to shape rather than wording: a deposit that recurs at least
  // 3 times, at a consistent amount (≤10% spread), on a detectable cadence IS income whatever it is
  // called. Deliberately strict — a stable, repeating, same-size deposit is not a refund or a gift.
  if (incomeTxns.length === 0) {
    const deposits = (txns || []).filter(t => {
      if (!t || t.amount >= 0) return false;                     // money IN only
      const name = (t.name || "").toLowerCase();
      const cat  = (t.cat  || "").toUpperCase();
      if (cat.includes("TRANSFER") || t.isTransfer) return false;  // not an internal move
      if (CC_PAYMENT_KEYWORDS.some(kw => name.includes(kw))) return false;
      return true;
    });
    const groups = {};
    for (const t of deposits) {
      const k = (t.name || "").toLowerCase().trim();
      if (!k) continue;
      (groups[k] = groups[k] || []).push(t);
    }
    let best = null;
    for (const list of Object.values(groups)) {
      if (list.length < 3) continue;                              // needs a real repeat, not a one-off
      const amounts = list.map(t => Math.abs(t.amount));
      const mean = amounts.reduce((a, b) => a + b, 0) / amounts.length;
      if (!(mean > 0)) continue;
      const spread = (Math.max(...amounts) - Math.min(...amounts)) / mean;
      if (spread > 0.10) continue;                                // pay is stable; refunds/gifts are not
      if (!detectCadence(list.map(t => t.date))) continue;         // must land on a real cadence
      if (!best || mean > best.mean) best = { list, mean };        // the largest such deposit is the paycheque
    }
    if (best) incomeTxns = best.list;
  }
  if (incomeTxns.length === 0) return null;

  // Group by month
  const byMonth = {};
  incomeTxns.forEach(t => {
    const month = t.date.substring(0, 7); // "YYYY-MM"
    byMonth[month] = (byMonth[month] || 0) + Math.abs(t.amount);
  });
  const monthlyTotals = Object.values(byMonth);
  if (monthlyTotals.length === 0) return null;

  const monthlyMean = monthlyTotals.reduce((a,b) => a+b, 0) / monthlyTotals.length;
  const monthlyLow  = Math.min(...monthlyTotals);
  const monthlyHigh = Math.max(...monthlyTotals);

  // ── Per-deposit amounts — this is what income.amount wants ───────────────────
  // MEDIAN of the individual deposits, not a mean and not monthlyTotal/count. A partial first or last
  // month (Plaid's window rarely aligns to month boundaries), a bonus, or a retro-pay deposit all skew
  // a mean; a median barely moves and is by construction the size of a real cheque the user received.
  const deposits = incomeTxns.map(t => Math.abs(t.amount)).sort((a, b) => a - b);
  const median = (sorted) => {
    const m = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2;
  };
  const perDeposit     = median(deposits);
  const perDepositLow  = deposits[0];
  const perDepositHigh = deposits[deposits.length - 1];

  // isVariable describes the PER-DEPOSIT amount — that is what income.amount holds and what the UI
  // calls "your typical paycheque". Measuring spread on MONTHLY totals (the old behaviour) flagged
  // every biweekly earner as variable, because a 3-cheque month is ~50% above a 2-cheque month even
  // when every single cheque is identical.
  const isVariable = deposits.length > 1 && perDeposit > 0 &&
                     (perDepositHigh - perDepositLow) / perDeposit > 0.15;

  // ── Anchor day-of-month (for monthly / semimonthly cadences) ─────────────────
  // MODE, not mean and not median. Deposits shift EARLIER for weekends and holidays but never later,
  // so the most frequently observed day is the true scheduled day, and ties break to the LATEST day
  // for that same reason. A mean is catastrophically wrong across a month boundary — pay on the 1st
  // that occasionally lands on the 31st averages to the 16th.
  const dayCounts = {};
  incomeTxns.forEach(t => {
    const dom = parseInt(String(t.date).substring(8, 10), 10);
    if(dom >= 1 && dom <= 31) dayCounts[dom] = (dayCounts[dom] || 0) + 1;
  });
  const anchorDay = Object.keys(dayCounts).length
    ? Number(Object.entries(dayCounts)
        .sort((a, b) => (b[1] - a[1]) || (Number(b[0]) - Number(a[0])))[0][0])
    : null;

  const nameCount = {};
  incomeTxns.forEach(t => { nameCount[t.name] = (nameCount[t.name]||0)+1; });
  const topName = Object.entries(nameCount).sort((a,b)=>b[1]-a[1])[0]?.[0] || "Employment";

  return {
    monthlyAvg:       Math.round(monthlyMean),   // average total across a calendar month
    monthlyLow:       Math.round(monthlyLow),
    monthlyHigh:      Math.round(monthlyHigh),
    perDeposit:       Math.round(perDeposit),    // single paycheque — the one income.amount wants
    perDepositLow:    Math.round(perDepositLow),
    perDepositHigh:   Math.round(perDepositHigh),
    depositsPerMonth: Math.round((incomeTxns.length / monthlyTotals.length) * 100) / 100,
    anchorDay,                                   // modal day-of-month, or null when there is no signal
    freq: detectCadence(incomeTxns.map(t => t.date)), // observed cadence, or null when undeterminable
    isVariable,
    label: topName,
  };
}

// Small Levenshtein for fuzzy bill-name dedupe (Tier 4). Inputs are short merchant names.
// Exported so the test harness can cover it directly.
export function _levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

// Known Canadian banking/financial acronyms — preserved as uppercase at ANY length (CIBC, HSBC,
// TFSA, RRSP…). The short ones (TD, BC, GST…) live here too so the rule is UNIFORM: a token is kept
// uppercase iff it's in this Set. A blanket "≤3 all-caps" rule was rejected — it mis-preserved common
// words ("MY"→"MY", "OF"→"OF"); the explicit allowlist Title-Cases those while keeping real acronyms.
const CA_BANKING_ACRONYMS = new Set([
  'CIBC','HSBC','AMEX','TFSA','RRSP','RESP','FHSA','GIC','ETF',
  'PCMC','BMO','RBC','TD','BC','PC','GST','HST','PST','QST','EI','CPP','OAS',
]);

// Title-case a bank merchant name for display (MATH-LOCK finding #1 — restores the long-corrupted
// `/\b\w/g` intent), preserving the acronyms above. "NETFLIX SUBSCRIPTION" → "Netflix Subscription";
// "TD VISA" → "TD Visa"; "CIBC MORTGAGE" → "CIBC Mortgage"; "MY TFSA CONTRIBUTION" → "My TFSA Contribution".
// POS-terminal / acquirer prefixes banks staple onto a merchant name. They are noise, and leaving
// them in produced display names like "Fpos Reid'S Dairy Company".
const POS_PREFIX_RX = /^(?:fpos|pos|sq\s*\*|sqc\*|tst\*|tst\s|sp\s+|ic\*|pp\*|paypal\s*\*|dd\s*\*|ext\s)\s*/i;
export function stripPosPrefix(s) {
  let out = String(s || "").trim();
  // Strip repeatedly — some banks stack them ("POS FPOS MERCHANT").
  for (let i = 0; i < 3 && POS_PREFIX_RX.test(out); i++) out = out.replace(POS_PREFIX_RX, "").trim();
  return out || String(s || "").trim();   // never return empty
}

export function titleCaseBillName(s) {
  return String(s || "").replace(/\S+/g, w =>
    CA_BANKING_ACRONYMS.has(w.toUpperCase())                    // known acronym (any length) → keep uppercase
      ? w.toUpperCase()
      // Title Case, but NOT after an apostrophe: /\b\w/ treated the "s" in "reid's" as a word start
      // and produced "Reid'S". Capitalise a letter only at the start or after a non-letter that is
      // not an apostrophe.
      : w.toLowerCase().replace(/(^|[^a-z'])([a-z])/gi, (_m, pre, ch) => pre + ch.toUpperCase())
  );
}

// Scan transactions for recurring bills (same merchant, regular cadence). Returns
// [{ name, amount, date, type, freq, nextDueDate, auto, avgNote }]. opts = { overrides, debts }.
// ── Sprint D Fix (Bug 2) — recurring-bill admission thresholds ───────────────
// Exported so the tests assert the real constants rather than duplicating magic numbers.
export const MIN_BILL_OCCURRENCES = 3;          // 3 occurrences ⇒ 2 gaps that must agree (2 ⇒ 1 gap, trivially "regular")
export const BILL_SPREAD_MAX_KEYWORD  = 1.20;   // recognised biller: allow real seasonal swing (hydro $80→$220 ≈ 0.93)
export const BILL_SPREAD_MAX_CATEGORY = 0.40;   // category-only evidence: amounts must be tight to prove it's a bill

// Transactions eligible to be evidence for a recurring bill. Only expenses (positive = money out);
// inter-account moves (cash advances, card payments, balance transfers) are excluded so they never
// surface as bills. PENDING is excluded too — cashFlow / SafeSpendEngine / the pipeline all drop
// pending, and a pending charge must not prematurely create or distort a bill (it can shift
// amount/date or vanish on settle).
//
// Exported so bill RE-EVALUATION judges a stored bill against exactly the transactions the detector
// would have used. If these two ever diverge, re-evaluation starts deleting bills on evidence the
// detector never saw — so there is deliberately only one definition.
const BILL_TRANSFER_RX = /cash advance|payment to|transfer to|balance transfer|e-?transfer|pymt|autopay/i;
export function billCandidateExpenses(txns, debts = []) {
  return (txns || []).filter(t =>
    t &&
    t.amount > 0 &&
    !t.pending &&
    t.cat !== "Income" &&
    t.cat !== "Transfer" &&
    t.cat !== "Fees" &&
    !t.isTransfer &&
    !isInternalTransfer(t) &&
    !isCashAdvance(t) &&
    !isCCPayment(t, debts) &&
    !BILL_TRANSFER_RX.test(t.name || "")
  );
}

// Module scope so bill HEALING evaluates the identical spread bound the detector applies. Formerly
// declared inside detectRecurringBills; hoisted unchanged.
const DETECT_BILL_CATS = new Set([
  "Utilities","Bills","Services","Health","Education","Home",
  "Gas & Transport","Entertainment","Shopping",
]);

// Also catch by name keywords regardless of category
const BILL_KEYWORDS = [
  "hydro","electric","gas","water","internet","wifi","rogers","bell","telus",
  "shaw","videotron","fido","koodo","virgin","netflix","spotify","apple",
  "google","amazon prime","disney","crave","insurance","allstate","intact",
  "aviva","manulife","sunlife","great-west","rent","mortgage","condo","strata",
  "gym","goodlife","ymca","planet fitness","adobe","microsoft","dropbox","icloud",
  "hulu","paramount","phone","mobile","wireless","hydro one","enbridge","atco",
  "fortis","toronto hydro","bc hydro","epcor","alectra",
];

// The amount-spread verdict per raw merchant key — the ONE detector gate that healing may delete on.
//
// The detector rejects a merchant for four different reasons, and they are not equally trustworthy
// when history is short (a fetch is capped at 90 days, and the DB blob keeps no Plaid rows at all):
//
//   occurrence count  — a monthly bill shows only ~3 times in 90 days. Proves nothing.
//   category/keyword  — `some()` over the visible rows; can flip if the categorised row ages out.
//   cadence           — compares the MEAN visible gap to a band. A mean is not monotone under
//                       truncation; this is the gate that made healing unsafe at any low count bar.
//   amount spread     — stable amounts stay stable in ANY window. A bill charging the same figure
//                       every month reads identically from 3 occurrences or 30.
//
// So healing asks only the last question: are this merchant's amounts too erratic to be a bill?
// That is positive evidence about the merchant rather than an artefact of how much history is
// visible, and it is exactly the gate that rejects a warehouse run or a fuel stop.
//
// Deliberately evaluated for merchants BELOW the detector's occurrence threshold too: a phantom
// with two wildly different charges is still demonstrably not a bill, and the detector never
// reaches its spread test because it returns at the count gate first.
export function billSpreadVerdicts(byMerchant) {
  const out = new Map();
  Object.entries(byMerchant || {}).forEach(([key, txList]) => {
    if (!Array.isArray(txList) || txList.length < 2) return;   // need 2 points for a spread
    const amts = txList.map(t => t && t.amount).filter(n => Number.isFinite(n));
    if (amts.length < 2) return;
    // Mirrors the detector: average of the LAST 3 occurrences, range over all of them.
    const recent = amts.slice(-3);
    const avg = recent.reduce((s, n) => s + n, 0) / recent.length;
    if (!(avg > 0)) return;
    const spread = (Math.max(...amts) - Math.min(...amts)) / avg;
    const isKeyword = BILL_KEYWORDS.some(kw => key.includes(kw));
    const limit = isKeyword ? BILL_SPREAD_MAX_KEYWORD : BILL_SPREAD_MAX_CATEGORY;
    out.set(key, { n: txList.length, spread, limit, isKeyword, rejected: spread > limit });
  });
  return out;
}

// Group candidate expenses by the detector's merchant key (raw name, lowercased/trimmed).
export function groupByMerchant(expenses) {
  // Null-prototype: with a plain `{}` a merchant named "constructor" or "__proto__" made
  // `!byMerchant[key]` false (it resolved an inherited member), the array was never created, and
  // `.push` threw — taking down bill detection entirely. Pre-dates the extraction of this function,
  // but bill healing now depends on it too, so it is fixed here rather than left as a latent crash.
  const byMerchant = Object.create(null);
  (expenses || []).forEach(t => {
    const key = String(t.name || "").toLowerCase().trim();
    if (!byMerchant[key]) byMerchant[key] = [];
    byMerchant[key].push(t);
  });
  return byMerchant;
}

// Returns { bills, admitted }:
//   bills    — the display list, after the near-duplicate collapse at the end of this function
//   admitted — EVERY merchant that passed the admission gates, BEFORE that collapse
//
// The distinction matters to bill healing. The collapse is a display decision: "Bell" is hidden
// when "Bell Mobility" is already listed. A merchant suppressed that way still passed the
// occurrence, cadence and spread gates — so treating the display list as "what currently
// qualifies" would let healing delete a stored bill the rules had actually accepted.
export function detectRecurringBillsDetailed(txns, opts = {}) {
  if (!txns || txns.length === 0) return { bills: [], admitted: [] };

  // Tier 4: consult user overrides — never re-add a removed merchant; honor manual type.
  const { overrides = {}, debts = [] } = opts;
  const removedSet = new Set((overrides.removed || []).map(s => String(s).toLowerCase()));
  const typedMap = overrides.typed || {};
  const cadenceMap = overrides.cadence || {}; // Sprint Q item 2: user cadence corrections (keyed by name)
  const amountsMap = overrides.amounts || {}; // user amount override for a detected bill (persists across resyncs; wins over the freshly-detected average)

  // Categories that indicate a bill (not groceries, dining, etc.). Named distinctly from
  // the module-level BILL_CATS (the budget-exclusion set) to end the prior shadowing.
  // Sprint D Fix (Bug 2a): categories in which a charge CAN be a bill. Costco (Shopping) used to be
  // admitted here, but the fix for that is the AMOUNT-SPREAD GATE below, not deleting categories:
  // removing Entertainment / Gas & Transport was measured to break real subscriptions that the
  // keyword list does not cover — HBO Max, DAZN, Audible, PlayStation Plus, transit passes. The
  // keyword list catches only the best-known billers (netflix/spotify/disney/amazon prime), so the
  // category path is what carries the long tail.
  //
  // Groceries and Coffee & Dining stay OUT: those are per-visit spend with no subscription analogue.
  // Everything else is admitted on category and then must PROVE it is a bill by holding a stable
  // amount across occurrences — the precise instrument, rather than the blunt one.
  const expenses = billCandidateExpenses(txns, debts);

  // Group by normalized merchant name
  const byMerchant = groupByMerchant(expenses);

  const bills = [];

  Object.entries(byMerchant).forEach(([key, txList]) => {
    // Sprint D Fix (Bug 2b): require 3 occurrences, not 2. With 2 there is exactly ONE gap, so the
    // "every gap within band" cadence check below is trivially satisfied — two Costco trips 28-35
    // days apart read as a perfect "monthly" bill. Three occurrences means two gaps that must AGREE,
    // which is the weakest evidence that actually establishes a cadence rather than a coincidence.
    if (txList.length < MIN_BILL_OCCURRENCES) return;

    // Tier 4: respect user removals — never re-detect a merchant the user deleted.
    if (removedSet.has(key)) return;

    // Check if it's a bill category OR matches a bill keyword
    const isBillCat     = txList.some(t => DETECT_BILL_CATS.has(t.cat));
    const isBillKeyword = BILL_KEYWORDS.some(kw => key.includes(kw));
    if (!isBillCat && !isBillKeyword) return;

    // Sprint 4 (items 3 & 8): classify cadence — EVERY gap must sit within a tight band of a
    // known cadence, so a 2-occurrence bill with random spacing is no longer accepted, and the
    // proposed freq reflects reality (weekly/biweekly/semimonthly/monthly/quarterly).
    const dates = txList.map(t => new Date(t.date + "T12:00:00")).sort((a,b) => a-b);
    const gaps = [];
    for (let i = 1; i < dates.length; i++) gaps.push((dates[i] - dates[i-1]) / 86400000);
    const cadence = (() => {
      if (gaps.length === 0) return null;
      const avg = gaps.reduce((a,b) => a+b, 0) / gaps.length;
      const bands = [["weekly",7,3],["biweekly",14,4],["monthly",30,5],["quarterly",91,12]];
      for (const [freq, anchor, tol] of bands) {
        if (Math.abs(avg - anchor) <= tol && gaps.every(g => Math.abs(g - anchor) <= tol + 3)) {
          if (freq === "biweekly") {
            const doms = new Set(dates.map(d => d.getDate()));   // two fixed days ⇒ semimonthly (1st & 15th)
            return { freq: doms.size <= 2 ? "semimonthly" : "biweekly" };
          }
          return { freq };
        }
      }
      return null;
    })();
    if (!cadence) return;   // irregular spacing — not a recurring bill

    // Average of the last 3 occurrences
    const recent = txList.slice(-3);
    const avg    = recent.reduce((s,t) => s + t.amount, 0) / recent.length;

    // Tier 4: Fixed vs Variable — >15% spread across occurrences ⇒ variable (hydro,
    // phone), else fixed (rent, subscriptions). A user override always wins.
    const amts     = txList.map(t => t.amount);
    const spread   = avg > 0 ? (Math.max(...amts) - Math.min(...amts)) / avg : 0;

    // Sprint D Fix (Bug 2c) — THE ADMISSION GATE. `spread` was computed and then used ONLY to LABEL
    // the bill fixed/variable; nothing ever required amount consistency, so a merchant charging $8.79
    // one visit and $250 the next was admitted as a "variable bill". A recurring bill is defined as
    // much by a STABLE AMOUNT as by a stable date — that is what separates hydro from groceries.
    //
    // Two bounds, because the evidence differs:
    //   • keyword match (hydro/phone/insurance/streaming — a merchant we RECOGNISE as a biller):
    //     lenient, since a real utility swings seasonally (e.g. $80 summer → $220 winter ⇒ ~0.93).
    //   • category-only match: strict. Category alone is weak evidence, so the amounts must be tight
    //     to prove this is a bill and not simply a frequently-visited merchant.
    // Costco at $8.79/$250 gives a spread near 1.9 and is rejected by BOTH bounds.
    const spreadLimit = isBillKeyword ? BILL_SPREAD_MAX_KEYWORD : BILL_SPREAD_MAX_CATEGORY;
    if (spread > spreadLimit) return;   // amounts too erratic to be a bill — reject outright

    const billType = typedMap[key] || (spread > 0.15 ? "variable" : "fixed");

    // Estimate due date from most common day of month
    const days     = txList.map(t => new Date(t.date + "T12:00:00").getDate());
    const dayMode  = days.sort((a,b) =>
      days.filter(d=>d===b).length - days.filter(d=>d===a).length
    )[0];

    // Clean up display name — strip trailing account numbers, then Title Case (acronym-preserving).
    // MATH-LOCK finding #1: restores the case-normalization the original code intended but never ran
    // (a corrupted `/<BS>\w/g` was a silent no-op for years, so bank names shipped raw, e.g. all-caps).
    const displayName = titleCaseBillName(
      stripPosPrefix(txList[0].name.replace(/\s+\d{4,}.*$/, "").trim())  // strip account numbers, then POS prefixes
    );

    // Tier 4: overrides are keyed by the cleaned display name (what the user removes/types).
    const _dnl = displayName.toLowerCase().trim();
    if (removedSet.has(_dnl)) return;
    const finalType = typedMap[_dnl] || billType;
    // Sprint Q item 2: a persisted user cadence correction wins over the freshly-detected cadence.
    const finalFreq = cadenceMap[_dnl] || cadence.freq;

    // Sprint Q item 1: anchor nextDueDate from the LAST observed occurrence + cadence, so the
    // forecast/SafeSpend recur from the real phase (e.g. biweekly last seen 7d ago → due in 7d).
    const _last = dates[dates.length - 1];
    let _nextDue;
    if (_last) {
      if (finalFreq === "weekly" || finalFreq === "biweekly") {
        // Sprint Z #7: DST-safe calendar offset (setDate, not +days*86400000 — which drifts a day across a DST boundary).
        const _d = new Date(_last);
        _d.setDate(_d.getDate() + (finalFreq === "weekly" ? 7 : 14));
        _nextDue = dateToISO(_d);
      } else {
        _nextDue = dateToISO(_last); // monthly/semimonthly/quarterly: last-occurrence anchor; billNextDue steps it forward
      }
    }

    bills.push({
      name:    displayName,
      amount:  (amountsMap[_dnl] != null ? Number(amountsMap[_dnl]) : (avg||0)).toFixed(2),
      date:    String(dayMode),
      type:    finalType,   // Tier 4: "fixed" | "variable"
      freq:    finalFreq, // Sprint 4 (item 8) + Sprint Q item 2: detected cadence, or user override
      nextDueDate: _nextDue, // Sprint Q item 1: cadence phase anchor
      auto:    true,   // flag so UI can show "detected" badge
      origin:  "observed", // Plaid-observed (vs origin:"manual" for user-entered future bills)
      avgNote: txList.length >= 3 ? `avg of last ${Math.min(txList.length,3)}` : "estimated",
    });
  });

  // Sort by amount desc, then fuzzy-dedupe. Sprint 4 (item 4): name similarity ALONE is not
  // enough — also require amount-within-10% OR same due-day, so "Bell" and "Bell Insurance"
  // (genuinely different bills) don't collapse into one.
  const kept = [];
  bills.sort((a,b) => Number(b.amount) - Number(a.amount));
  for (const b of bills) {
    const k = b.name.toLowerCase().trim();
    const dupe = kept.some(x => {
      const j = x.name.toLowerCase().trim();
      const nameMatch = j === k || j.includes(k) || k.includes(j) || _levenshtein(j, k) <= 3;
      if (!nameMatch) return false;
      const amtA = Number(b.amount), amtB = Number(x.amount);
      const amtClose = amtA > 0 && amtB > 0 && Math.abs(amtA - amtB) / Math.max(amtA, amtB) <= 0.10;
      const sameDay  = b.date && x.date && b.date === x.date;
      return amtClose || sameDay;
    });
    if (!dupe) kept.push(b);
  }
  return { bills: kept, admitted: bills };
}

// The long-standing contract: the display list only. Unchanged for every existing caller.
export function detectRecurringBills(txns, opts = {}) {
  return detectRecurringBillsDetailed(txns, opts).bills;
}

// ─── markTransfers (Sprint MATH-LOCK Group C: moved from financialCalculations.js) ───────────
// Cross-account transfer detection: when the same amount appears at two of the user's accounts
// within ±2 days with opposite signs AND a transfer-like word in a description, it's a transfer
// (e.g. a credit card payment from checking). keywordIsTransferFn / isCashAdvanceFn are injected
// (App.jsx passes isInternalTransfer / isCashAdvance) so this stays dependency-free.
const _TRANSFER_NAME_RX = /transfer|xfer|e-?transfer|interac|to (savings|chequing|checking)|from (savings|chequing|checking)|move to|withdrawal|wire/i;

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

  // Build amount-keyed buckets for fast lookup. Use absolute amount (rounded to 2 decimals) as key.
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
      // Sprint 4: require a transfer-like signal in either description — opposite-sign,
      // same-amount, different-account is necessary but not sufficient (refund + purchase).
      if (!_TRANSFER_NAME_RX.test(outflow.name || "") && !_TRANSFER_NAME_RX.test(inflow.name || "")) continue;

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

// ── Sync merge helpers (Sprint MATH-LOCK: extracted from App.jsx for pipeline testability) ───────
// The incremental /transactions/sync merge step: added/modified merge by id (fresh wins), removed
// drop by id, and liabilities keep-stale merge by account_id. Pure — the inverse pair of the sync.

// Merge two arrays of {id,...} by id; fresh entries win (added + modified).
export function mergeById(existing, fresh) {
  const safeExisting = Array.isArray(existing) ? existing : [];
  const safeFresh = Array.isArray(fresh) ? fresh : [];
  const freshIds = new Set(safeFresh.map(x => x?.id).filter(Boolean));
  return [...safeExisting.filter(x => x?.id && !freshIds.has(x.id)), ...safeFresh];
}

// Like mergeById but keyed by account_id — keeps last-known entries whose source wasn't refreshed
// this round (Sprint Z #2: liabilities keep-stale).
export function mergeByAccountId(existing, fresh) {
  const safeExisting = Array.isArray(existing) ? existing : [];
  const safeFresh = Array.isArray(fresh) ? fresh : [];
  const freshIds = new Set(safeFresh.map(x => x?.account_id).filter(Boolean));
  return [...safeExisting.filter(x => x?.account_id && !freshIds.has(x.account_id)), ...safeFresh];
}

// Remove transactions by id — the inverse of mergeById, for /transactions/sync `removed` (Sprint Z #1).
export function removeByIds(list, ids) {
  const safe = Array.isArray(list) ? list : [];
  if (!Array.isArray(ids) || ids.length === 0) return safe;
  const rm = new Set(ids);
  return safe.filter(x => x?.id && !rm.has(x.id));
}

// Normalize a Plaid account into a single signed balance number (the app's canonical account.balance).
// Cash/depository: prefer AVAILABLE (excludes held/pending funds, e.g. a cheque on hold), falling back to
// CURRENT only when Plaid omits available. Credit/loan: the amount owed is the CURRENT balance, stored negative.
export function normalizeAccountBalance(a) {
  return (a.type === "credit" || a.type === "loan")
    ? -(a.balance?.current || 0)
    : (a.balance?.available ?? a.balance?.current ?? 0);
}
