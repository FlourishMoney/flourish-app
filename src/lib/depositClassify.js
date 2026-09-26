// src/lib/depositClassify.js
// -----------------------------------------------------------------------------
// ASK, DON'T GUESS: when does money coming in count as income?
//
// Income detection used to take any deposit with "deposit" in its name, or any Income category, as
// pay. One expense reimbursement near the paycheque amount then skewed the detected pay, and it could
// even become the "anchor" the forecast phases every future payday from. A single e-transfer from a
// friend could create an income out of nothing.
//
// The rule now, for every kind of household (salaried, hourly and shift work, gig and tips,
// self-employment, EI, pensions and OAS, government benefits, separated parents, roommates, foster
// families):
//
//   A deposit counts as income only once it REPEATS in a pay-like pattern, or the user CONFIRMS it.
//
// Resolution order for one deposit, most specific first:
//   1. the user's answer for this deposit        (depositDecisions, keyed by transaction)
//   2. the user's rule for its payer              (depositRules, keyed by merchant, "Always for ...")
//   3. a certain move between the user's own accounts (a paired transfer leg) or a card payment: never
//   4. the payer's deposits repeat on a pay-like cadence: yes
//   5. otherwise: held out, and raised once ("Is this income?") when it is big enough to matter
//
// Deposits that LOOK like non-income (e-transfers from people, refunds and credits, reimbursements,
// transfers, cash deposits) need a stricter pattern to count on their own: three or more, at a steady
// amount. A payer we cannot identify (the bank shows only "E-TRANSFER DEPOSIT") never forms a pattern,
// because deposits from different people would be counted as one "payer".
//
// Actual bank transactions are never altered. Every function here returns new values.
// PURE: `today` is injected; no storage, no React.
// -----------------------------------------------------------------------------

import { merchantKey } from "./billReeval.js";
import { isUsableMerchantKey, stripBankingPhrases, MIN_MERCHANT_KEY } from "./categoryOverrides.js";
import { CC_PAYMENT_KEYWORDS } from "./financialCalculations.js";

// The answers offered for a deposit. "income" is the only one that counts; the rest are held out.
export const DEPOSIT_REASONS = Object.freeze([
  { key: "income",        label: "Yes, it's income" },
  { key: "reimbursement", label: "Reimbursement" },
  { key: "refund",        label: "Refund" },
  { key: "gift",          label: "Gift" },
  { key: "shared",        label: "Shared bill" },
  { key: "transfer",      label: "Transfer" },
]);
export const NOT_INCOME_REASONS = Object.freeze(DEPOSIT_REASONS.filter(r => r.key !== "income").map(r => r.key));
const REASON_KEYS = new Set(DEPOSIT_REASONS.map(r => r.key));
// "Not now" is remembered too, so a deposit is raised once and never nags.
export const NOT_NOW = "notnow";

// The same answer, as it reads inside a sentence: "treated as a reimbursement", "count as income".
const PHRASES = { income: "income", reimbursement: "a reimbursement", refund: "a refund", gift: "a gift", shared: "a shared bill", transfer: "a transfer" };
export function reasonPhrase(key) { return PHRASES[key] || ""; }

export function reasonLabel(key) {
  const r = DEPOSIT_REASONS.find(x => x.key === key);
  return r ? r.label : "";
}

// Raised only when it matters to the forecast, and only while it is recent.
export const ASK_MIN_AMOUNT = 50;
export const ASK_WINDOW_DAYS = 30;

// ── What a deposit looks like ────────────────────────────────────────────────────────────────────
const RX_ETRANSFER = /\be-?\s?transfer|\betfr\b|\be-tfr\b|\binterac\b|\bzelle\b|\bvenmo\b|\bcash ?app\b/i;
const RX_REIMB     = /\breimb|\bexpense|\bexp\.? ?claim|\bexpns\b/i;
const RX_REFUND    = /\brefund|\breturn(ed)?\b|\breversal|\breversed\b|\brebate\b|\bcash ?back\b|\bcredit memo\b|\bmerchant credit\b|\bchargeback\b|\bstatement credit\b|\badjustment\b/i;
const RX_CASH      = /\bcash deposit|\batm deposit|\babm deposit|\bbranch deposit|\bdeposit (at|in) branch|\bteller\b|\bnight deposit|\bmobile (cheque |check )?deposit|\bcheque deposit|\bcheck deposit/i;
const RX_OWN       = /\b(transfer|tfr|xfer)\b.*\b(from|to)\b.*\b(savings|chequing|checking|tfsa|rrsp|account|acct)\b|\b(from|to) (savings|chequing|checking)\b|\binternal transfer|\bonline (banking )?transfer|\btfr-fr\b|\btfr-to\b/i;
const RX_PAY       = /\bpayroll|\bsalary|\bwages?\b|\bdirect dep|\bpay ?(cheque|check)\b|\bpension|\bcpp\b|\bqpp\b|\boas\b|\bold age security|\bgis\b|\bemployment insurance|\bei benefit|\bchild benefit|\bccb\b|\bgst|\bhst credit|\bclimate action|\bcarbon rebate|\btrillium|\bbenefit|\bdisability|\bodsp\b|\baish\b|\bsocial security|\bssa\b|\bssi\b|\btreas 310|\bunemployment|\bcommission|\bgratuit|\bpayout|\bchild support|\bsupport payment|\bfed govt|\bcanada fed|\bprov(incial)? govt|\bfoster/i;

// Looks that need a stricter pattern before they count on their own.
const NON_INCOME_LOOKS = new Set(["etransfer", "reimbursement", "refund", "cash", "transfer"]);

const isMoneyIn = (t) => !!t && Number(t.amount) < 0;

// A move between the user's OWN accounts we can be certain of: markTransfers paired it with an
// outgoing leg of the same amount at another of their accounts. (isTransfer alone is not certainty:
// the keyword rule behind it also flags every Interac e-transfer, including one from a friend.)
function isCertainOwnMove(t) {
  if (t.transferPairId) return true;
  const name = String(t.name || "").toLowerCase();
  return CC_PAYMENT_KEYWORDS.some(kw => name.includes(kw));
}

export function depositLook(t) {
  if (!isMoneyIn(t)) return null;
  const name = String(t.name || "");
  const cat = String(t.cat || "").toUpperCase();
  if (t.transferPairId) return "transfer";
  if (RX_ETRANSFER.test(name)) return "etransfer";
  if (RX_REIMB.test(name)) return "reimbursement";
  if (RX_REFUND.test(name)) return "refund";
  if (RX_CASH.test(name)) return "cash";
  if (RX_OWN.test(name)) return "transfer";
  if (RX_PAY.test(name) || cat.includes("INCOME") || cat.includes("PAYROLL")) return "pay";
  if (cat.includes("TRANSFER")) return "transfer";
  return "other";
}

// ── The deposit-specific bank-noise guard ────────────────────────────────────────────────────────
// categoryOverrides' guard is built for spending descriptors. Deposit descriptors carry their own
// generic wording ("MOBILE DEPOSIT", "E-TRANSFER DEPOSIT FROM", "BRANCH DEPOSIT") that would pass it
// and let "Always for deposits from mobile" swallow every cheque the household ever deposits.
const DEPOSIT_NOISE = new Set([
  "mobile", "branch", "from", "cheque", "check", "cash", "atm", "abm", "night", "teller", "refund",
  "reversal", "rebate", "reimbursement", "reimb", "expense", "interest", "memo", "ref", "reference",
  "deposit", "direct", "tfr", "xfer", "received", "incoming", "money", "request", "req", "autodeposit",
  "auto", "the", "and", "you", "your", "savings", "chequing", "checking", "account", "acct",
  // Payment networks and generic wording, which name no sender on their own.
  "zelle", "venmo", "paypal", "cashout", "internet", "wire", "paid", "thank", "thanks", "incoming",
  "outgoing", "pmt", "send", "sent", "remittance",
]);
export function isUsableDepositKey(key) {
  if (!isUsableMerchantKey(key)) return false;
  return stripBankingPhrases(key).split(" ")
    .some(tok => tok.length >= MIN_MERCHANT_KEY && !/^\d+$/.test(tok) && !DEPOSIT_NOISE.has(tok));
}

// ── Identity of a deposit for the user's answer ──────────────────────────────────────────────────
// Plaid ids are stable. Statement and CSV rows are re-numbered on every import (stmt_N), so those are
// keyed on what the row says instead, which does not move.
export function depositTxnKey(t) {
  if (!t) return "";
  const id = t.id != null ? String(t.id) : "";
  if (id && !/^(stmt|csv|import)_/i.test(id)) return id;
  return `${t.date || ""}|${merchantKey(t.name || "")}|${Math.round(Math.abs(Number(t.amount) || 0) * 100)}`;
}

const own = (obj, key) => (obj && Object.prototype.hasOwnProperty.call(obj, key)) ? obj[key] : undefined;
function decisionFor(t, decisions) {
  const d = own(decisions, depositTxnKey(t));
  if (!d) return null;
  const reason = typeof d === "string" ? d : d.reason;
  return (REASON_KEYS.has(reason) || reason === NOT_NOW) ? reason : null;
}
function ruleFor(key, rules) {
  if (!isUsableDepositKey(key)) return null;
  const r = own(rules, key);
  const reason = typeof r === "string" ? r : r && r.reason;
  return REASON_KEYS.has(reason) ? reason : null;
}

// ── Pay-like repetition ──────────────────────────────────────────────────────────────────────────
// Weekly, every two weeks or twice a month, monthly, quarterly (the GST/HST credit). The gaps between
// the deposits must sit on one of these, consistently.
const BANDS = [
  { min: 5,  max: 9,  tol: 2 },
  { min: 12, max: 18, tol: 3 },
  { min: 26, max: 35, tol: 5 },
  { min: 84, max: 98, tol: 8 },
];
const DAY_MS = 86400000;
const atNoon = (s) => new Date(String(s) + "T12:00:00");

export function repeatsLikePay(list, { strict = false, minCount = 2 } = {}) {
  const byDay = new Map();
  for (const t of list || []) {
    if (!isMoneyIn(t) || !t.date) continue;
    const d = atNoon(t.date);
    if (isNaN(d.getTime())) continue;
    byDay.set(t.date, (byDay.get(t.date) || 0) + Math.abs(Number(t.amount)));
  }
  const days = [...byDay.keys()].sort();
  if (days.length < Math.max(2, minCount)) return false;
  const gaps = [];
  for (let i = 1; i < days.length; i++) gaps.push(Math.round((atNoon(days[i]) - atNoon(days[i - 1])) / DAY_MS));
  const sorted = [...gaps].sort((a, b) => a - b);
  const m = Math.floor(sorted.length / 2);
  const med = sorted.length % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2;
  const band = BANDS.find(b => med >= b.min && med <= b.max);
  if (!band) return false;
  if (gaps.length >= 2 && gaps.filter(g => Math.abs(g - med) <= band.tol).length < Math.ceil(gaps.length * 2 / 3)) return false;
  const amounts = days.map(d => byDay.get(d));
  const lo = Math.min(...amounts), hi = Math.max(...amounts);
  const mean = amounts.reduce((a, b) => a + b, 0) / amounts.length;
  if (!(lo > 0)) return false;
  if (strict) return (hi - lo) / mean <= 0.25;
  return hi / lo <= 5; // gig, tips and commission swing a lot, but not by more than this
}

// ── The per-household context, computed once per (transactions, decisions, rules) ───────────────
const _ctxCache = new WeakMap();
// Shared, so a household with no answers yet (the usual case) still hits the cache below.
const EMPTY = Object.freeze({});
const NO_TXNS = Object.freeze([]);
export function depositContext(data) {
  const txns = Array.isArray(data && data.transactions) ? data.transactions : NO_TXNS;
  const decisions = (data && data.depositDecisions) || EMPTY;
  const rules = (data && data.depositRules) || EMPTY;
  const hit = _ctxCache.get(txns);
  if (hit && hit.decisions === decisions && hit.rules === rules) return hit;

  // Group money in by payer. Deposits the household has already said are not income do not help a
  // payer look like an employer.
  const groups = new Map();
  for (const t of txns) {
    if (!isMoneyIn(t)) continue;
    const d = decisionFor(t, decisions);
    if (d && d !== "income" && d !== NOT_NOW) continue;
    const key = merchantKey(t.name || "");
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
  }
  const repeating = new Set();
  for (const [key, list] of groups) {
    const looks = list.map(depositLook);
    const nonIncomeLook = looks.some(l => NON_INCOME_LOOKS.has(l));
    const usable = isUsableDepositKey(key);
    // An unidentifiable payer only forms a pattern when every deposit looks like pay, and needs three.
    if (!usable && !looks.every(l => l === "pay")) continue;
    const strict = nonIncomeLook;
    const minCount = nonIncomeLook || !usable ? 3 : 2;
    if (repeatsLikePay(list, { strict, minCount })) repeating.add(key);
  }
  const ctx = { transactions: txns, decisions, rules, repeating, _status: new WeakMap() };
  _ctxCache.set(txns, ctx);
  return ctx;
}

// Why a deposit does or does not count. { counts, why, look, key, reason? }
export function depositStatus(t, ctx) {
  if (!isMoneyIn(t)) return { counts: false, why: "not-money-in", look: null, key: "" };
  const memo = ctx && ctx._status && ctx._status.get(t);
  if (memo) return memo;
  const look = depositLook(t);
  const key = merchantKey(t.name || "");
  let res;
  const decided = decisionFor(t, ctx && ctx.decisions);
  const ruled = ruleFor(key, ctx && ctx.rules);
  if (decided && decided !== NOT_NOW) res = { counts: decided === "income", why: "decided", reason: decided };
  else if (ruled) res = { counts: ruled === "income", why: "rule", reason: ruled };
  else if (isCertainOwnMove(t)) res = { counts: false, why: "own-move" };
  else if (ctx && ctx.repeating.has(key)) res = { counts: true, why: "repeats" };
  else res = { counts: false, why: decided === NOT_NOW ? "not-now" : "held" };
  res = { ...res, look, key };
  if (ctx && ctx._status) ctx._status.set(t, res);
  return res;
}

// Transactions that are evidence of INCOME: every money-out row unchanged, and only the money-in rows
// that count. This is what income detection reads.
const _evCache = new WeakMap();
export function incomeEvidence(data) {
  const ctx = depositContext(data);
  const hit = _evCache.get(ctx);
  if (hit) return hit;
  const out = ctx.transactions.filter(t => !isMoneyIn(t) || depositStatus(t, ctx).counts);
  _evCache.set(ctx, out);
  return out;
}

// Transactions that may PHASE a known income (the payday anchor, and "has this deposit arrived").
// Looser than incomeEvidence: the income itself is already established, so a single payroll deposit
// is good evidence of its date. What must never anchor a payday is a deposit the household said is
// not income, or one that looks like a refund, reimbursement, e-transfer, cash or transfer and was
// never confirmed.
const _anchorCache = new WeakMap();
export function anchorEvidence(data) {
  const ctx = depositContext(data);
  const hit = _anchorCache.get(ctx);
  if (hit) return hit;
  const out = ctx.transactions.filter(t => {
    if (!isMoneyIn(t)) return true;
    const s = depositStatus(t, ctx);
    if (s.why === "decided" || s.why === "rule") return s.counts;
    if (s.why === "own-move") return false;
    return s.counts || !NON_INCOME_LOOKS.has(s.look);
  });
  _anchorCache.set(ctx, out);
  return out;
}

// The deposits to raise, newest first: held out, never answered, recent, and big enough to matter.
export function depositsToAsk(data, today = new Date()) {
  const ctx = depositContext(data);
  const t0 = new Date(today); t0.setHours(12, 0, 0, 0);
  return ctx.transactions
    .filter(t => {
      if (!isMoneyIn(t) || t.pending) return false;
      if (Math.abs(Number(t.amount)) < ASK_MIN_AMOUNT) return false;
      const d = atNoon(t.date);
      if (isNaN(d.getTime())) return false;
      const age = Math.round((t0 - d) / DAY_MS);
      if (age < 0 || age > ASK_WINDOW_DAYS) return false;
      return depositStatus(t, ctx).why === "held";
    })
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

// How the "Is this income?" / "This isn't income" sheet opens. The "Always for deposits from ..." rule
// is never on by default: a rule changes every future deposit from that payer, so it is only ever the
// household's own choice, every time the sheet opens.
export function depositSheetInitial(t, ctx, mode = "ask") {
  const st = depositStatus(t, ctx);
  const allowed = mode === "mark" ? NOT_INCOME_REASONS : DEPOSIT_REASONS.map(r => r.key);
  const decided = st.why === "decided" ? st.reason : null;
  return { reason: decided && allowed.includes(decided) ? decided : null, always: false };
}

// ── Writers. Each returns a new map and never mutates. ───────────────────────────────────────────
export function decideDeposit(decisions, t, reason, now = new Date()) {
  const next = { ...(decisions || {}) };
  const k = depositTxnKey(t);
  if (!k || !(REASON_KEYS.has(reason) || reason === NOT_NOW)) return next;
  next[k] = { reason, at: now.toISOString() };
  return next;
}
export function clearDepositDecision(decisions, t) {
  const next = { ...(decisions || {}) };
  delete next[depositTxnKey(t)];
  return next;
}
// "Always for deposits from <merchant>". Refused for a payer the guard cannot identify.
export function setDepositRule(rules, name, reason, now = new Date()) {
  const key = merchantKey(name || "");
  const next = { ...(rules || {}) };
  if (!isUsableDepositKey(key) || !REASON_KEYS.has(reason)) return next;
  next[key] = { reason, at: now.toISOString() };
  return next;
}
export function clearDepositRule(rules, name) {
  const next = { ...(rules || {}) };
  delete next[merchantKey(name || "")];
  return next;
}
export function depositRuleFor(rules, name) {
  return ruleFor(merchantKey(name || ""), rules);
}
// How many deposits a rule for this payer would cover, for the confirmation copy.
export function countDepositsFrom(transactions, name) {
  const key = merchantKey(name || "");
  if (!isUsableDepositKey(key)) return 0;
  return (transactions || []).filter(t => isMoneyIn(t) && merchantKey(t.name || "") === key).length;
}
