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

// Detect income deposits from transactions — returns {monthlyAvg, low, high, typical, isVariable, label}.
// CRITICAL: TRANSFER is excluded — credit card payments show as TRANSFER_IN and must never count as income.
export function detectIncomeFromTxns(txns) {
  if (!txns || txns.length === 0) return null;
  const incomeTxns = txns.filter(t => {
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
  if (incomeTxns.length === 0) return null;

  // Group by month
  const byMonth = {};
  incomeTxns.forEach(t => {
    const month = t.date.substring(0, 7); // "YYYY-MM"
    byMonth[month] = (byMonth[month] || 0) + Math.abs(t.amount);
  });
  const monthlyTotals = Object.values(byMonth);
  if (monthlyTotals.length === 0) return null;

  const avg = monthlyTotals.reduce((a,b) => a+b, 0) / monthlyTotals.length;
  const low = Math.min(...monthlyTotals);
  const high = Math.max(...monthlyTotals);
  const isVariable = monthlyTotals.length > 1 && (high - low) / avg > 0.15;

  const nameCount = {};
  incomeTxns.forEach(t => { nameCount[t.name] = (nameCount[t.name]||0)+1; });
  const topName = Object.entries(nameCount).sort((a,b)=>b[1]-a[1])[0]?.[0] || "Employment";

  return {
    monthlyAvg: Math.round(avg),
    low: Math.round(low),
    high: Math.round(high),
    typical: Math.round(avg),
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
export function titleCaseBillName(s) {
  return String(s || "").replace(/\S+/g, w =>
    CA_BANKING_ACRONYMS.has(w.toUpperCase())                    // known acronym (any length) → keep uppercase
      ? w.toUpperCase()
      : w.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())  // else Title Case
  );
}

// Scan transactions for recurring bills (same merchant, regular cadence). Returns
// [{ name, amount, date, type, freq, nextDueDate, auto, avgNote }]. opts = { overrides, debts }.
export function detectRecurringBills(txns, opts = {}) {
  if (!txns || txns.length === 0) return [];

  // Tier 4: consult user overrides — never re-add a removed merchant; honor manual type.
  const { overrides = {}, debts = [] } = opts;
  const removedSet = new Set((overrides.removed || []).map(s => String(s).toLowerCase()));
  const typedMap = overrides.typed || {};
  const cadenceMap = overrides.cadence || {}; // Sprint Q item 2: user cadence corrections (keyed by name)

  // Categories that indicate a bill (not groceries, dining, etc.). Named distinctly from
  // the module-level BILL_CATS (the budget-exclusion set) to end the prior shadowing.
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

  // Only look at expenses (positive = money out). Exclude inter-account moves (cash advances,
  // card payments, balance transfers) so they never surface as bills.
  // Sprint Z3 Phase D #2: also exclude PENDING txns. cashFlow / SafeSpendEngine / the pipeline all
  // drop pending; a pending charge must not prematurely create or distort a recurring bill (it can
  // shift amount/date or vanish on settle). A bill needs two POSTED occurrences.
  const TRANSFER_RX = /cash advance|payment to|transfer to|balance transfer|e-?transfer|pymt|autopay/i;
  const expenses = txns.filter(t =>
    t.amount > 0 &&
    !t.pending &&
    t.cat !== "Income" &&
    t.cat !== "Transfer" &&
    t.cat !== "Fees" &&
    !t.isTransfer &&
    !isInternalTransfer(t) &&
    !isCashAdvance(t) &&
    !isCCPayment(t, debts) &&
    !TRANSFER_RX.test(t.name || "")
  );

  // Group by normalized merchant name
  const byMerchant = {};
  expenses.forEach(t => {
    const key = t.name.toLowerCase().trim();
    if (!byMerchant[key]) byMerchant[key] = [];
    byMerchant[key].push(t);
  });

  const bills = [];

  Object.entries(byMerchant).forEach(([key, txList]) => {
    // Must appear at least 2 times in 90 days to be "recurring"
    if (txList.length < 2) return;

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
      txList[0].name.replace(/\s+\d{4,}.*$/, "").trim()  // strip trailing account numbers
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
      amount:  (avg||0).toFixed(2),
      date:    String(dayMode),
      type:    finalType,   // Tier 4: "fixed" | "variable"
      freq:    finalFreq, // Sprint 4 (item 8) + Sprint Q item 2: detected cadence, or user override
      nextDueDate: _nextDue, // Sprint Q item 1: cadence phase anchor
      auto:    true,   // flag so UI can show "detected" badge
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
  return kept;
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
