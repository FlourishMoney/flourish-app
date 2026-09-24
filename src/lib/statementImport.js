// src/lib/statementImport.js — Step 2b: safe statement import.
//
// The model TRANSCRIBES a bank statement into rows; it never computes or fills in a number. Every
// row is validated here in deterministic JavaScript, a confidence is derived from those checks (no
// model self-rating), and NOTHING enters the app's data until the user reviews and confirms exactly
// which rows to import. A non-numeric amount is a REJECTED row — never coerced to 0.
//
// Row shape from the parser: { date, name, amount, source } where `source` is the verbatim
// substring the model read the amount from. Statement anchors (optional, where visible on the
// statement): { period:{start,end}, openingBalance, closingBalance, totalDebits, totalCredits }.
//
// Amount sign convention (matches the parser prompt): positive = money out (debit), negative =
// money in (credit).

import { FALLBACK_CATEGORY } from "./categoryOverrides.js";

export const IMPORT_SOURCE = "statement-import";
export const RECONCILE_TOLERANCE = 0.02; // dollars — a missed/duplicated row should break this

const _num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : NaN; };

// Does the amount's magnitude appear VERBATIM in the source substring the model claims it read?
// Strips currency symbols, thousands separators and spaces before matching, so "$1,234.56" matches
// 1234.56. A whole-dollar amount printed without cents ("1234") is matched on a digit boundary.
export function amountAppearsInSource(amount, source) {
  const amt = _num(amount);
  if (!Number.isFinite(amt)) return false;
  const normSrc = String(source == null ? "" : source).replace(/[,$\s]/g, "");
  const abs = Math.abs(amt);
  if (normSrc.includes(abs.toFixed(2))) return true;                 // "1234.56"
  if (Number.isInteger(abs) && new RegExp(`(^|[^0-9.])${abs}([^0-9]|$)`).test(normSrc)) return true; // "1234"
  return false;
}

// Parse a "YYYY-MM-DD" (or Date-parseable) date to a UTC-noon Date, or null.
export function parseRowDate(s) {
  const str = String(s == null ? "" : s).trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str);
  if (m) {
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12));
    return (d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3]) ? d : null; // reject 2026-02-31
  }
  const d = new Date(str);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Classify one row. status: "ok" | "questionable" | "failed". `reasons` explains any flag.
// failed  = structurally invalid (cannot be imported until the user edits it into a valid row).
// questionable = valid but flagged (selectable): outside the statement period, or a likely duplicate.
// `trustAmount` skips the source-substring check — used only when the USER hand-edits a row in the
// review screen (they are the authoritative source for a manual correction, not the statement text).
export function classifyRow(row, ctx = {}) {
  const { periodStart = null, periodEnd = null, seen = null, trustAmount = false } = ctx;
  const reasons = [];
  let hardFail = false;

  const amount = _num(row && row.amount);
  if (!Number.isFinite(amount)) { reasons.push("amount is not a number"); hardFail = true; }
  else if (!trustAmount && !amountAppearsInSource(amount, row && row.source)) {
    reasons.push("amount not found in the statement text"); hardFail = true;
  }

  const date = parseRowDate(row && row.date);
  if (!date) { reasons.push("unreadable date"); hardFail = true; }

  const name = String((row && row.name) || "").trim();
  if (!name) { reasons.push("missing description"); hardFail = true; }

  if (hardFail) {
    return { status: "failed", reasons, amount: Number.isFinite(amount) ? amount : null,
             date: date ? date.toISOString().slice(0, 10) : String((row && row.date) || ""), name };
  }

  // soft flags → questionable but selectable
  if (periodStart && periodEnd && (date < periodStart || date > periodEnd)) {
    reasons.push("date is outside the statement period");
  }
  const key = `${date.toISOString().slice(0, 10)}|${name.toLowerCase()}|${amount.toFixed(2)}`;
  if (seen && seen.has(key)) reasons.push("possible duplicate of another row");
  if (seen) seen.add(key);

  return {
    status: reasons.length ? "questionable" : "ok",
    reasons,
    amount,
    date: date.toISOString().slice(0, 10),
    name,
  };
}

// Reconcile the row amounts against whatever statement anchors exist. Returns { applicable, checks }.
export function reconcile(classified, anchors = {}) {
  const usable = classified.filter(r => r.status !== "failed");
  const checks = [];
  const tol = RECONCILE_TOLERANCE;

  const debits  = usable.filter(r => r.amount > 0).reduce((s, r) => s + r.amount, 0);
  const credits = usable.filter(r => r.amount < 0).reduce((s, r) => s + Math.abs(r.amount), 0);

  if (anchors && _num(anchors.totalDebits) >= 0 && Number.isFinite(_num(anchors.totalDebits))) {
    const delta = Math.abs(debits - _num(anchors.totalDebits));
    checks.push({ label: "debits vs printed total", expected: _num(anchors.totalDebits), actual: _round(debits), delta: _round(delta), ok: delta <= tol });
  }
  if (anchors && Number.isFinite(_num(anchors.totalCredits))) {
    const delta = Math.abs(credits - _num(anchors.totalCredits));
    checks.push({ label: "credits vs printed total", expected: _num(anchors.totalCredits), actual: _round(credits), delta: _round(delta), ok: delta <= tol });
  }
  if (anchors && Number.isFinite(_num(anchors.openingBalance)) && Number.isFinite(_num(anchors.closingBalance))) {
    const sumSigned = usable.reduce((s, r) => s + r.amount, 0);       // debits + (−credits)
    const expectedClosing = _num(anchors.openingBalance) - sumSigned; // closing = opening − Σamount
    const delta = Math.abs(expectedClosing - _num(anchors.closingBalance));
    checks.push({ label: "opening + rows vs closing", expected: _num(anchors.closingBalance), actual: _round(expectedClosing), delta: _round(delta), ok: delta <= tol });
  }

  return { applicable: checks.length > 0, checks, allOk: checks.length > 0 && checks.every(c => c.ok) };
}

// Deterministic confidence from the checks above — NOT a model self-rating.
export function computeConfidence(classified, reconciliation) {
  const total = classified.length;
  const failed = classified.filter(r => r.status === "failed").length;
  const questionable = classified.filter(r => r.status === "questionable").length;
  const selectable = total - failed;
  if (total === 0) return { level: "none", score: 0, failed, questionable, selectable, total };

  let level;
  const reconBad = reconciliation.applicable && !reconciliation.allOk;
  if (failed === 0 && questionable === 0 && (!reconciliation.applicable || reconciliation.allOk)) level = "high";
  else if (selectable === 0 || (reconBad && failed / total > 0.25)) level = "low";
  else if (reconBad || failed / total > 0.15) level = "low";
  else level = "medium";

  const score = _round(Math.max(0, (selectable / total) - (reconBad ? 0.3 : 0)), 2);
  return { level, score, failed, questionable, selectable, total };
}

// Top-level: take the parser's { rows, anchors } and produce the review batch.
//   proceed=false → a failed parse: nothing selectable. The caller imports NOTHING and offers
//                   CSV upload or manual entry.
//   proceed=true  → show the review screen; the user selects exactly which rows enter the data.
export function validateStatementImport(parsed = {}) {
  const rawRows = Array.isArray(parsed.rows) ? parsed.rows : [];
  const anchors = parsed.anchors || {};
  const periodStart = anchors.period && parseRowDate(anchors.period.start);
  const periodEnd   = anchors.period && parseRowDate(anchors.period.end);
  const seen = new Set();

  const rows = rawRows.map((r, i) => ({ id: `stmt_${i}`, raw: r, source: r && r.source,
    ...classifyRow(r, { periodStart, periodEnd, seen }) }));

  const reconciliation = reconcile(rows, anchors);
  const confidence = computeConfidence(rows, reconciliation);
  const proceed = confidence.selectable > 0;   // at least one non-failed row to review
  return { rows, anchors, reconciliation, confidence, proceed };
}

// A row's id may be SELECTED only if it is not failed.
export function isSelectable(row) { return !!row && row.status !== "failed"; }

// PURE import gate — the "no write before confirm" rule lives here. Given the classified rows and
// the ids the user selected, return the transactions to write. Throws if any selected id is a failed
// row (the UI must not allow it) or unknown. Stamps every imported row source:"statement-import".
export function rowsToImport(classified, selectedIds, accountId = null) {
  const byId = new Map((classified || []).map(r => [r.id, r]));
  const out = [];
  for (const id of (selectedIds || [])) {
    const r = byId.get(id);
    if (!r) throw new Error(`unknown row ${id}`);
    if (!isSelectable(r)) throw new Error(`row ${id} failed validation and cannot be imported`);
    const edited = !!r.edited;
    const orig = r.raw || {};
    out.push({
      id: `stmt_${id}`,
      date: r.date,
      name: r.name,
      amount: r.amount,
      // `category` is the statement-side label and nothing reads it. `cat` is what the app reads
      // everywhere (engines, the transaction list, the category filter), and a statement row used
      // to arrive without one at all: the chip rendered blank, the filter grew an `undefined`
      // entry, and the row could not be corrected because there was nothing to correct.
      // FALLBACK_CATEGORY is the same "Other" a Plaid transaction of unknown type gets.
      category: "OTHER",
      cat: FALLBACK_CATEGORY,
      pending: false,
      source: IMPORT_SOURCE,
      edited,
      // An edited row is USER-ENTERED data: the typed amount was NOT verbatim-matched against the
      // statement text, so never claim it was. Un-edited rows passed the verbatim source check.
      // The model's original extraction is kept for provenance.
      verbatimSourceMatch: !edited,
      ...(edited ? { originalExtracted: { amount: orig.amount, date: orig.date, name: orig.name } } : {}),
      ...(accountId ? { account_id: accountId } : {}),
    });
  }
  return out;
}

function _round(n, dp = 2) { const f = 10 ** dp; return Math.round((Number(n) || 0) * f) / f; }
