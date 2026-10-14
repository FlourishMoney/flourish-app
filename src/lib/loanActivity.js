// src/lib/loanActivity.js
// -----------------------------------------------------------------------------
// A LOAN'S OWN ENTRIES NEVER BECOME THE HOUSEHOLD'S MONEY (loan-account-txns, 2026-10-14).
//
// Since 2026-10-05 Plaid returns transactions on more loan accounts: auto loans, home equity, lines of
// credit, commercial loans, not only student loans and mortgages. On a loan account the entries are
// the loan's bookkeeping: a payment RECEIVED shows as money in, and interest or a draw as money out.
// Read as the household's own transactions they become a paycheque that is not one, spending that
// never left chequing, a bill, or a payment counted twice (once leaving chequing, once arriving on
// the loan).
//
// THE RULE, in one place: a transaction on an account of type "loan" (any subtype, the ones Plaid
// added on 2026-10-11, home equity loan and commercial line of credit, and any it adds later) is loan
// activity. It never joins the working set that every figure is computed from (data.transactions:
// income, spending, bills, Budget, Patterns, the forecast, What-If, Meet and the coach). It is kept
// in its own store, for that account's own activity screen, labelled as loan activity.
//
// What stays exactly as it was:
//   - credit cards, and anything Plaid reports as type "credit" (a line of credit reported that way
//     included): those entries are spending, and card payments are already matched as transfers;
//   - a transaction whose account is missing, or whose type is unknown: nothing is guessed.
//
// Where it is applied (App.jsx): fetchItemTxns, the one door every synced Plaid transaction comes
// through, and once at load, for rows a device saved before this rule existed. The server labels each
// synced row with its account's type (netlify/functions/plaid.js normalizeTxns); stored accounts are
// the fallback when a row carries no label.
// -----------------------------------------------------------------------------

export const LOAN_ACTIVITY_KEY = "flourish_loan_activity"; // local only: cleared on sign-out with every flourish_ key, never synced

export function isLoanAccount(account) {
  return String((account && account.type) || "").trim().toLowerCase() === "loan";
}

const accountMap = (accounts) => {
  const m = new Map();
  for (const a of accounts || []) if (a && a.id != null) m.set(String(a.id), a);
  return m;
};

// Is this transaction loan activity? The row's own label first (the server stamps the account type
// Plaid returned with it), then the stored account. No account, or no type: no.
export function isLoanActivity(t, accounts = []) {
  if (!t || t.account_id == null) return false;
  const label = t.account_type;
  if (label != null && String(label).trim() !== "") return String(label).trim().toLowerCase() === "loan";
  const byId = accounts instanceof Map ? accounts : accountMap(accounts);
  const a = byId.get(String(t.account_id));
  return !!a && isLoanAccount(a);
}

// Split rows into the working set and the loan activity. Order is kept within each side.
export function splitLoanActivity(transactions = [], accounts = []) {
  const byId = accountMap(accounts);
  const working = [], loanActivity = [];
  for (const t of transactions || []) (isLoanActivity(t, byId) ? loanActivity : working).push(t);
  return { transactions: working, loanActivity };
}

// ── The store: one localStorage key, merged by transaction id ────────────────
const storageOf = (s) => {
  if (s) return s;
  try { return globalThis.localStorage || null; } catch { return null; }
};

export function readLoanActivity(storage) {
  const s = storageOf(storage);
  if (!s) return [];
  try {
    const v = JSON.parse(s.getItem(LOAN_ACTIVITY_KEY) || "[]");
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}

// Merge new loan rows in (a modified row replaces the stored one), drop removed ids, newest first.
export function storeLoanActivity(rows = [], removedIds = [], storage) {
  const s = storageOf(storage);
  if (!s) return readLoanActivity(storage);
  const removed = new Set((removedIds || []).map(String));
  const byId = new Map();
  for (const t of readLoanActivity(s)) if (t && t.id != null) byId.set(String(t.id), t);
  for (const t of rows || []) if (t && t.id != null) byId.set(String(t.id), t);
  for (const id of removed) byId.delete(id);
  if (!(rows || []).length && !removed.size) return [...byId.values()];
  const all = [...byId.values()].sort((a, b) => (String(a.date) < String(b.date) ? 1 : String(a.date) > String(b.date) ? -1 : 0));
  try { s.setItem(LOAN_ACTIVITY_KEY, JSON.stringify(all)); } catch { /* full or blocked storage: the working set is still clean */ }
  return all;
}

export function loanActivityFor(accountId, storage) {
  if (accountId == null) return [];
  return readLoanActivity(storage).filter((t) => t && String(t.account_id) === String(accountId));
}

// Once at load: a device that synced loan rows before this rule has them in its saved working set.
// They move to the store; nothing else in the saved state changes.
export function moveSavedLoanActivity(saved, storage) {
  const appData = saved && saved.appData;
  if (!appData || !Array.isArray(appData.transactions) || !appData.transactions.length) return saved;
  const { transactions, loanActivity } = splitLoanActivity(appData.transactions, appData.accounts);
  if (!loanActivity.length) return saved;
  storeLoanActivity(loanActivity, [], storage);
  return { ...saved, appData: { ...appData, transactions } };
}
