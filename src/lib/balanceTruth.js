// src/lib/balanceTruth.js
// -----------------------------------------------------------------------------
// WHAT THE APP MAY SAY ABOUT A BANK BALANCE (balance-truth, 2026-11-06).
//
// The report: two households saw balances from a bank link whose sign-in had run out. Every refresh failed, so the
// app kept the balances from the last time the bank answered and still called them "Live · up to date", because
// the label read "up to date" whenever the last refresh was over an hour old or missing. The reconnect warning was
// only inside Settings, a bank window that closed from Settings said nothing, a new bank's history had no
// "loading" state, and a card from the bank kept the balance it had on the day it was linked.
//
// These pure functions are the rules; App.jsx and lib/demoStatus.js render what they return.
//   - A bank balance is "live" only when the bank answered for EVERY linked account within the last hour and no
//     linked bank needs a fresh sign-in. Otherwise the app says when the bank last answered, or that it can't say.
//   - balanceAsOf is stamped on an account only when the bank answers for it (stampBalanceAsOf at every site that
//     maps a get_accounts answer). An account kept from an earlier answer keeps its stamp.
// The words are in lib/balanceWords.js.
// -----------------------------------------------------------------------------
import { balanceWords } from "./balanceWords.js";

export const LIVE_WINDOW_MS = 60 * 60 * 1000;
// plaid_items.status values that mean the person has to sign in to the bank again. login_required is written by
// netlify/functions/plaid.js when Plaid answers ITEM_LOGIN_REQUIRED; error by the webhook's ITEM:ERROR.
export const SIGN_IN_STATUSES = Object.freeze(["login_required", "error"]);

// An account whose balance came from a bank link (Plaid): stamped with its item, or an older row with no stamp
// that is not one the household entered or imported from a statement.
export function isBankAccount(a) {
  if (!a || typeof a !== "object") return false;
  if (a._item) return true;
  const inst = String(a.institution || "");
  return !!inst && inst !== "Manual" && inst !== "Statement" && !a.balanceEntered;
}

/** Each account the bank just answered for, stamped with that moment (ISO). */
export function stampBalanceAsOf(accounts, nowMs) {
  const at = new Date(nowMs).toISOString();
  return (Array.isArray(accounts) ? accounts : []).map((a) => (a && typeof a === "object" ? { ...a, balanceAsOf: at } : a));
}

// The banks that need a fresh sign-in, from list_items' rows ({ item_id, institution_name, status, linked_by }).
export function itemsNeedingSignIn(items) {
  return (Array.isArray(items) ? items : [])
    .filter((it) => it && SIGN_IN_STATUSES.includes(it.status))
    .map((it) => ({ item_id: it.item_id, bank: it.institution_name || null, partner: !!it.linked_by }));
}

/**
 * How fresh the bank balances are. { state, at }:
 *   "none"    no account from a bank link (nothing to say about a bank)
 *   "live"    every linked account answered within the hour, and none of their banks needs a sign-in; at = oldest
 *   "stale"   all have a time, but the oldest is over an hour old or a bank needs a sign-in; at = oldest
 *   "unknown" at least one linked account has no time (saved before the stamp existed); at = null
 */
export function bankFreshness({ accounts, nowMs, signIn = [] } = {}) {
  const linked = (Array.isArray(accounts) ? accounts : []).filter(isBankAccount);
  if (!linked.length) return { state: "none", at: null };
  const times = linked.map((a) => Date.parse(a.balanceAsOf));
  if (times.some((t) => !Number.isFinite(t))) return { state: "unknown", at: null };
  const at = Math.min(...times);
  const needing = new Set((Array.isArray(signIn) ? signIn : []).map((s) => s && s.item_id).filter(Boolean));
  const blocked = linked.some((a) => a._item && needing.has(a._item));
  return { state: !blocked && nowMs - at < LIVE_WINDOW_MS ? "live" : "stale", at };
}

/** {when}: the time if it is today, else the date (with the year when it is not this year). */
export function whenText(atMs, nowMs, locale = "en-CA") {
  const at = new Date(atMs), now = new Date(nowMs);
  if (!Number.isFinite(at.getTime())) return "";
  const sameDay = at.getFullYear() === now.getFullYear() && at.getMonth() === now.getMonth() && at.getDate() === now.getDate();
  if (sameDay) return at.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });
  return at.toLocaleDateString(locale, at.getFullYear() === now.getFullYear() ? { month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" });
}

/** The line for a balance that is not live: when the bank last answered, or that it can't be said. */
export function lastUpdatedLine(fresh, nowMs) {
  if (!fresh || fresh.state === "unknown" || !Number.isFinite(fresh.at)) return balanceWords("balance-last-updated-unknown");
  return balanceWords("balance-last-updated", { when: whenText(fresh.at, nowMs) });
}

// Plaid's error codes for a bank window that closed without linking (Link's onExit), grouped by what to say.
const BANK_DOWN = new Set(["INSTITUTION_NOT_RESPONDING", "INSTITUTION_DOWN", "INSTITUTION_NOT_AVAILABLE", "INSTITUTION_NO_LONGER_SUPPORTED"]);
const CODE_WRONG = new Set(["INVALID_MFA", "INVALID_SEND_METHOD"]);
const LOGIN_WRONG = new Set(["INVALID_CREDENTIALS", "INVALID_UPDATED_USERNAME", "ITEM_LOCKED"]);

/**
 * What to say when the bank window closes without linking. err is Link's onExit error (null when the person
 * closed it); intent "add" (a new bank) or "reconnect" (signing in again to one). Returns the reason and the
 * outcome, each one line; the message is the two together.
 */
export function linkExitMessage(err, { intent = "add", bank = null } = {}) {
  const code = err && (err.error_code || err.errorCode || err.code) ? String(err.error_code || err.errorCode || err.code) : null;
  const reasonId = !err ? "balance-link-closed"
    : BANK_DOWN.has(code) ? "balance-link-bank-down"
    : CODE_WRONG.has(code) ? "balance-link-code-wrong"
    : LOGIN_WRONG.has(code) ? "balance-link-login-wrong"
    : "balance-link-other";
  const reason = balanceWords(reasonId, { bank });
  const outcome = intent === "reconnect" ? balanceWords("balance-link-still-needed", { bank }) : balanceWords("balance-link-nothing-added");
  return { reasonId, reason, outcome, message: `${reason} ${outcome}` };
}

// A new bank's history. Plaid's /transactions/sync says how far its first pull has got (transactions_update_status):
// NOT_READY (nothing yet), INITIAL_UPDATE_COMPLETE (the last 30 days), HISTORICAL_UPDATE_COMPLETE (everything it
// will send). Only the last one is done. An unknown or missing status counts as done, so an older server or a
// sandbox answer never leaves a "loading" card up forever.
export const HISTORY_POLL_MS = 20 * 1000;
export const HISTORY_SLOW_MS = 10 * 60 * 1000;
export function historyDone(updateStatus) {
  return !(updateStatus === "NOT_READY" || updateStatus === "INITIAL_UPDATE_COMPLETE");
}
// The banks whose history is still coming, from the pending record { [item_id]: { since, bank } }: "loading" until
// HISTORY_SLOW_MS has passed, then "slow" (the app keeps checking each time it opens).
export function historyCards(pending, nowMs) {
  return Object.entries(pending && typeof pending === "object" ? pending : {})
    .filter(([, p]) => p && Number.isFinite(p.since))
    .map(([item_id, p]) => ({ item_id, bank: p.bank || null, state: nowMs - p.since >= HISTORY_SLOW_MS ? "slow" : "loading" }));
}

/**
 * ONE CARD, FROM THE BANK. A debt made from a bank card (fromBank, account_id) takes the card's balance owed every
 * time the bank answers for the card; two such debts for one card become one (the first, keeping a rate or minimum
 * the household entered on either). Hand-entered debts, and bank debts whose card is not in this answer, are left
 * exactly as they are. Returns the same array when nothing changes.
 */
export function syncBankDebts(debts, accounts) {
  const list = Array.isArray(debts) ? debts : [];
  const owed = new Map();
  for (const a of Array.isArray(accounts) ? accounts : []) {
    if (a && a.id != null && Number.isFinite(Number(a.balance))) owed.set(String(a.id), Math.abs(Number(a.balance)));
  }
  let changed = false;
  const seen = new Map(); // account_id -> index in out
  const out = [];
  for (const d of list) {
    if (!d || !d.fromBank || d.account_id == null) { out.push(d); continue; }
    const key = String(d.account_id);
    if (seen.has(key)) {
      const i = seen.get(key), first = out[i];
      out[i] = { ...first, rate: first.rate || d.rate || "", min: first.min || d.min || "" };
      changed = true;
      continue;
    }
    let next = d;
    if (owed.has(key)) {
      const bal = owed.get(key).toFixed(2);
      if (String(d.balance) !== bal) { next = { ...d, balance: bal }; changed = true; }
    }
    seen.set(key, out.length);
    out.push(next);
  }
  return changed ? out : list;
}
