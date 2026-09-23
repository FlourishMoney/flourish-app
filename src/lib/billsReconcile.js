// src/lib/billsReconcile.js
// -----------------------------------------------------------------------------
// WHAT CHANGED ABOUT THE HOUSEHOLD'S BILLS, AS QUESTIONS.
//
// Item 2 of the learning loop: a bill that appears, disappears, or changes amount becomes
// a question the meeting can ask, and the answer is remembered. Same four parts as income
// (src/lib/reconcileLoop.js): detect, ask, apply, remember.
//
// ONE SIGNATURE PER CHANGE, NOT ONE FOR THE SET. Income has a single finding, so a single
// signature works. Bills do not: if "Netflix went up" and "a new gym bill appeared" shared
// a signature, declining one would silence the other, and adding a third would un-silence
// both. Each change carries its own signature and its own dismissal.
//
// WHAT COUNTS AS A DISAPPEARANCE. Only a bill the BANK found can stop being found. A bill
// the household typed in during onboarding has no detection behind it, so its absence from
// a detection run means nothing and must never be raised — that is the difference between
// "your gym charge stopped" and "we cannot see the rent you pay by e-transfer".
// Detected bills are marked origin:"observed" (App.jsx:5960); bills predating that tag have
// origin undefined and are treated as typed, which is the safe direction.
// -----------------------------------------------------------------------------

import { decidePrompt, activeDismissedSignatures, DISMISSAL_REOPEN_DAYS } from "./reconcileLoop.js";

// Matches income's tolerance: below this is rounding and variable-charge noise, not news.
export const BILL_AMOUNT_TOLERANCE = 0.05;

// Bills are matched by name, and a name arrives with different casing and spacing from
// different sources. This is the one place that decides two names are the same bill.
export function billKey(name) {
  return String(name || "").toLowerCase().replace(/\s+/g, " ").trim();
}

const amt = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
const isObserved = (bill) => (bill || {}).origin === "observed";
// The detector writes type:"variable"; bills typed in onboarding may carry variable:true instead.
const isVariable = (bill) => { const b = bill || {}; return b.type === "variable" || b.variable === true; };

/**
 * Compare what the bank shows against what the household has.
 * Returns a sorted array of { kind, key, name, currentAmount, detectedAmount }.
 *   appeared     — the bank sees a recurring charge the household has not recorded
 *   disappeared  — a previously observed bill is no longer being detected
 *   amount       — both agree it exists, and the amount moved beyond tolerance
 * Sorted by kind then key so the same facts always produce the same order, which is what
 * makes the signatures below stable.
 */
export function billChanges(detectedBills, currentBills) {
  const detected = (Array.isArray(detectedBills) ? detectedBills : []).filter(Boolean);
  const current = (Array.isArray(currentBills) ? currentBills : []).filter(Boolean);
  const byKeyDetected = new Map(detected.map(b => [billKey(b.name), b]));
  const byKeyCurrent = new Map(current.map(b => [billKey(b.name), b]));
  const changes = [];

  for (const [key, det] of byKeyDetected) {
    if (!key) continue;
    const cur = byKeyCurrent.get(key);
    if (!cur) {
      changes.push({ kind: "appeared", key, name: det.name, currentAmount: null, detectedAmount: amt(det.amount) });
      continue;
    }
    // A VARIABLE bill is one whose amount is SUPPOSED to move — the detector marks it variable
    // when its spread exceeds 15% (plaidNormalize.js), which is three times this tolerance. Asking
    // "did your hydro bill change?" every single month is the loop making itself unusable, and it
    // could never be silenced either: the signature carries the amount, so each month's new figure
    // is a new question the previous dismissal does not cover.
    if (isVariable(cur) || isVariable(det)) continue;
    const c = amt(cur.amount), d = amt(det.amount);
    if (c > 0 && d > 0 && Math.abs(d - c) / c > BILL_AMOUNT_TOLERANCE) {
      changes.push({ kind: "amount", key, name: cur.name, currentAmount: c, detectedAmount: d });
    }
  }

  for (const [key, cur] of byKeyCurrent) {
    if (!key || byKeyDetected.has(key)) continue;
    // Only a bill the bank once found can stop being found.
    if (!isObserved(cur)) continue;
    changes.push({ kind: "disappeared", key, name: cur.name, currentAmount: amt(cur.amount), detectedAmount: null });
  }

  return changes.sort((a, b) => (a.kind + a.key).localeCompare(b.kind + b.key));
}

/**
 * Stable id for one change. Amounts are rounded to whole dollars for the same reason income
 * rounds: a $14.99 → $15.01 redetection must not defeat a dismissal.
 */
export function billChangeSignature(change) {
  if (!change || !change.kind || !change.key) return null;
  const c = change.currentAmount == null ? "?" : Math.round(change.currentAmount);
  const d = change.detectedAmount == null ? "?" : Math.round(change.detectedAmount);
  return `${change.kind}|${change.key}|${c}|${d}`;
}

/**
 * Which of these changes should be asked about?
 * dismissedSignatures is an ARRAY (one per declined change) — see the header.
 * Returns one decision per change, each shaped exactly like income's, plus the change itself.
 */
export function shouldPromptBills({ detectedBills, currentBills, dismissedSignatures = [], now = Date.now() } = {}) {
  // Entries may be bare signatures (pre-clock) or { signature, at }. One that has passed its
  // twelve months stops suppressing, so the question reopens once — see reconcileLoop.
  const dismissed = new Set(activeDismissedSignatures(dismissedSignatures, now));
  return billChanges(detectedBills, currentBills).map(change => {
    const signature = billChangeSignature(change);
    const decision = decidePrompt({
      signature,
      differences: [change.kind],
      dismissedSignature: dismissed.has(signature) ? signature : null,
    });
    return { ...decision, change };
  });
}

// Just the ones worth asking, in order.
export function billPrompts(args) {
  return shouldPromptBills(args).filter(d => d.prompt);
}

/**
 * Apply an accepted change to the household's bills. Returns a NEW array; never mutates.
 *   appeared    -> add it, marked origin:"observed" so a later disappearance can be raised
 *   amount      -> update that bill's amount only; name, due day and type are left alone
 *   disappeared -> remove it
 * An unknown kind returns the list unchanged rather than guessing.
 */
export function applyBillChange(currentBills, change, detectedBill = null) {
  const list = (Array.isArray(currentBills) ? currentBills : []).filter(Boolean);
  if (!change || !change.kind) return list;
  const key = change.key || billKey(change.name);

  if (change.kind === "appeared") {
    if (list.some(b => billKey(b.name) === key)) return list;      // already there: nothing to add
    const src = detectedBill || {};
    return [...list, {
      name: change.name,
      amount: String(change.detectedAmount ?? amt(src.amount)),
      date: src.date != null ? String(src.date) : "",
      type: src.type || "fixed",
      ...(src.freq ? { freq: src.freq } : {}),
      origin: "observed",
    }];
  }
  if (change.kind === "amount") {
    return list.map(b => billKey(b.name) === key ? { ...b, amount: String(change.detectedAmount) } : b);
  }
  if (change.kind === "disappeared") {
    return list.filter(b => billKey(b.name) !== key);
  }
  return list;
}

// Declining adds this change's signature to the remembered set, leaving the others alone.
// The date is part of the record: it is what lets the question reopen after twelve months, and
// dismissing the same thing again REPLACES the old entry so the clock restarts rather than the
// question reopening on the first dismissal's anniversary.
export function rememberBillDismissal(dismissedSignatures, change, now = new Date()) {
  const sig = billChangeSignature(change);
  const existing = (Array.isArray(dismissedSignatures) ? dismissedSignatures : []).filter(Boolean);
  if (!sig) return existing;
  const at = (now instanceof Date ? now : new Date(now)).toISOString();
  const others = existing.filter(e => (typeof e === "string" ? e : e && e.signature) !== sig);
  return [...others, { signature: sig, at }];
}

// Human-readable, for the meeting to speak out loud. Short: it has to be answerable in a sentence.
export function billChangeQuestion(change) {
  if (!change) return "";
  const money = (n) => `$${Math.round(Number(n) || 0).toLocaleString()}`;
  if (change.kind === "appeared") return `${change.name} looks like a new regular bill at ${money(change.detectedAmount)}. Add it?`;
  if (change.kind === "disappeared") return `${change.name} at ${money(change.currentAmount)} has stopped showing up. Has it ended?`;
  if (change.kind === "amount") {
    const dir = change.detectedAmount > change.currentAmount ? "went up" : "went down";
    return `${change.name} ${dir} from ${money(change.currentAmount)} to ${money(change.detectedAmount)}. Is that right?`;
  }
  return "";
}
