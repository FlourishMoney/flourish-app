// src/lib/manualBalances.js
// -----------------------------------------------------------------------------
// Flourish — balances the household enters itself (manual-balances).
//
// A household without a bank connection used to have no way to give an account a balance: manual and
// statement-import (PDF, CSV) accounts were created at $0 and nothing edited them, so safe to spend,
// Watch and net worth all started from $0. Here the household enters the balance of any manual or
// imported account (chequing, savings, card, loan) with the date it was true ("as of").
//
// An entered account is stored in the SAME shape bank sync stores a linked one: Plaid's type/subtype
// (depository/checking, credit/credit card, loan/auto…), what is owed as a negative balance, and a card
// or loan's own debt row (fromBank, account_id). So every engine reads it exactly as it reads a linked
// account, and an entered household gets the same figures as the same household linked
// (tests/manualBalances.test.cjs). It also carries balanceEntered:true and balanceAsOf ("YYYY-MM-DD").
//
// A linked bank account is never edited here: its balance comes from the bank.
//
// PURE: `today` is injected; no React, no storage.
// -----------------------------------------------------------------------------

import { parseMoney, baseCurrencyOf, isCheckingAccount, isSavingsAccount, isCreditLiability, dateToISO } from "./financialCalculations.js";
import { isUS } from "./locale.js";

export const BALANCE_KINDS = ["chequing", "savings", "card", "loan"];
export const KIND_LABEL = { chequing: "Chequing", savings: "Savings", card: "Card", loan: "Loan" };
export const LOAN_TYPES = [
  { value: "auto", label: "Car loan" },
  { value: "mortgage", label: "Mortgage" },
  { value: "student", label: "Student loan" },
  { value: "other", label: "Other loan" },
];
// A kind as this household's country says it: "Chequing" in Canada, "Checking" in the US.
export function kindLabel(kind, country) {
  return kind === "chequing" && isUS(country) ? "Checking" : KIND_LABEL[kind] || "";
}
// The name a new account gets when the household does not type one.
const defaultName = (kind, country) => (kind === "card" ? "Credit card" : kindLabel(kind, country));
// "Entered N days ago." shows once the as-of date is more than this many days old.
export const STALE_AFTER_DAYS = 7;
// Every fixed string this module shows, for the copy checks in the test.
export const BALANCE_COPY_STRINGS = [
  "Type the amount as a number, like 1250.00.",
  "The date can't be after today.",
  "Pick the date this balance was true.",
];

const OWED = new Set(["card", "loan"]);
const round2 = (n) => Math.round(n * 100) / 100;

// Manual and statement-import accounts, never a bank's. Mirrors Settings' isPlaidLinked and
// persistence.manualTransactions: an account stamped with a Plaid item, or from any institution other
// than the local "Manual"/"Statement" placeholders, is a bank's.
export function isEditableAccount(a) {
  if (!a || a._item) return false;
  return !a.institution || a.institution === "Manual" || a.institution === "Statement";
}

// "chequing" | "savings" | "card" | "loan" | null, from the account's type/subtype (legacy shapes too).
export function accountKindOf(a) {
  if (!a) return null;
  const t = String(a.type || "").toLowerCase(), s = String(a.subtype || "").toLowerCase();
  if (isSavingsAccount(a)) return "savings";
  if (isCheckingAccount(a)) return "chequing";
  if (t === "credit" || t === "credit card" || s === "credit card" || t === "line of credit") return "card";
  if (t === "loan") return "loan";
  if (t === "depository") return "chequing";
  return null;
}

// The shape bank sync gives each kind.
function shapeFor(kind, loanType) {
  if (kind === "savings") return { type: "depository", subtype: "savings" };
  if (kind === "card") return { type: "credit", subtype: "credit card" };
  if (kind === "loan") return { type: "loan", subtype: LOAN_TYPES.some(l => l.value === loanType) ? loanType : "other" };
  return { type: "depository", subtype: "checking" };
}

// The stored balance: a card or loan owes, so it is negative, as normalizeAccountBalance stores a
// linked one. A chequing or savings balance is as typed (below zero when overdrawn).
export function balanceForKind(kind, amount) {
  const v = round2(Number(amount) || 0);
  return OWED.has(kind) ? -Math.abs(v) : v;
}

// What the editor shows for an account: what is owed, as a positive amount, for a card or loan.
export function amountShownFor(a) {
  const v = round2(Number(a && a.balance) || 0);
  return OWED.has(accountKindOf(a)) ? Math.abs(v) : v;
}

const _isoDate = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return d.getMonth() === +m[2] - 1 && d.getDate() === +m[3] ? d : null;
};
const _midnight = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

// Whole calendar days from the as-of date to today (0 = today).
export function daysSince(iso, today = new Date()) {
  const d = _isoDate(iso);
  if (!d) return null;
  return Math.round((_midnight(today) - d) / 86400000);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
// "Oct 14", or "Oct 14, 2025" when it is not this year.
export function formatAsOf(iso, today = new Date()) {
  const d = _isoDate(iso);
  if (!d) return "";
  const md = `${MONTHS[d.getMonth()]} ${d.getDate()}`;
  return d.getFullYear() === today.getFullYear() ? md : `${md}, ${d.getFullYear()}`;
}

export function todayISO(today = new Date()) { return dateToISO(today); }

// What is wrong with an entry, as the editor says it, or null.
export function balanceEntryProblem({ amount, asOf } = {}, today = new Date()) {
  const p = parseMoney(amount);
  if (String(amount == null ? "" : amount).trim() === "" || !p.ok) return BALANCE_COPY_STRINGS[0];
  const d = _isoDate(asOf);
  if (!d) return BALANCE_COPY_STRINGS[2];
  if (d > _midnight(today)) return BALANCE_COPY_STRINGS[1];
  return null;
}

// Enter (or update) one balance. entry: { accountId?, kind, loanType?, name?, amount, asOf }.
// With accountId, that manual or imported account takes the balance (a linked one is refused); without
// it, a new Manual account is added. A card or loan keeps its own debt row in step, as bank sync makes
// for a linked card or loan; an account that is no longer a card or loan loses that row. Hand-entered
// debts are never touched. Returns `data` itself when nothing changes (an invalid entry, a linked account).
export function enterBalance(data = {}, entry = {}, today = new Date()) {
  if (balanceEntryProblem(entry, today)) return data;
  const accounts = Array.isArray(data.accounts) ? data.accounts : [];
  const existing = entry.accountId != null ? accounts.find(a => a && a.id === entry.accountId) : null;
  if (entry.accountId != null && !existing) return data;
  if (existing && !isEditableAccount(existing)) return data;
  const kind = BALANCE_KINDS.includes(entry.kind) ? entry.kind : (accountKindOf(existing) || "chequing");
  const loanType = kind === "loan" ? (entry.loanType || (existing && accountKindOf(existing) === "loan" ? existing.subtype : null)) : null;
  const typed = String(entry.name || "").trim();
  const name = typed || (existing && existing.name) || (kind === "loan" ? (LOAN_TYPES.find(l => l.value === loanType) || LOAN_TYPES[3]).label : defaultName(kind, data.profile && data.profile.country));
  const fields = {
    ...shapeFor(kind, loanType),
    name,
    balance: balanceForKind(kind, parseMoney(entry.amount).value),
    balanceEntered: true,
    balanceAsOf: _isoDate(entry.asOf) ? String(entry.asOf) : todayISO(today),
  };
  let id, nextAccounts;
  if (existing) {
    id = existing.id;
    nextAccounts = accounts.map(a => (a === existing ? { ...a, ...fields } : a));
  } else {
    const taken = new Set(accounts.map(a => a && a.id));
    let n = 0;
    while (taken.has(`manual_${kind}_${n}`)) n++;
    id = `manual_${kind}_${n}`;
    nextAccounts = [...accounts, { id, institution: "Manual", currency: baseCurrencyOf(data), ...fields }];
  }
  const debts = Array.isArray(data.debts) ? data.debts : [];
  const isOwnRow = (d) => d && d.fromBank && d.account_id === id;
  let nextDebts;
  if (OWED.has(kind)) {
    const owed = Math.abs(fields.balance).toFixed(2);
    nextDebts = debts.some(isOwnRow)
      ? debts.map(d => (isOwnRow(d) ? { ...d, balance: owed } : d))
      : [...debts, { name, balance: owed, rate: "", min: "", fromBank: true, account_id: id }];
  } else {
    nextDebts = debts.some(isOwnRow) ? debts.filter(d => !isOwnRow(d)) : debts;
  }
  return { ...data, accounts: nextAccounts, debts: nextDebts };
}

// What How we got this says about the entered balances behind a figure. `accounts` are the accounts
// the figure used. { lines, stale }: lines is "Balance you entered, as of Oct 14." (one line per date,
// named by account when the dates differ); stale is the oldest one more than STALE_AFTER_DAYS old,
// { accountId, name, days, text: "Entered 9 days ago." }, or null.
export function enteredBalanceNote(accounts = [], today = new Date()) {
  const entered = (accounts || []).filter(a => a && a.balanceEntered && isEditableAccount(a) && _isoDate(a.balanceAsOf));
  if (!entered.length) return { lines: [], stale: null };
  const dates = [...new Set(entered.map(a => a.balanceAsOf))];
  const lines = dates.length === 1
    ? [`Balance you entered, as of ${formatAsOf(dates[0], today)}.`]
    : entered.map(a => `${a.name || KIND_LABEL[accountKindOf(a)] || "Account"}: balance you entered, as of ${formatAsOf(a.balanceAsOf, today)}.`);
  const oldest = entered.map(a => ({ a, days: daysSince(a.balanceAsOf, today) }))
    .filter(x => x.days > STALE_AFTER_DAYS)
    .sort((x, y) => y.days - x.days)[0];
  const stale = oldest ? { accountId: oldest.a.id, name: oldest.a.name || "", days: oldest.days, text: `Entered ${oldest.days} days ago.` } : null;
  return { lines, stale };
}

// Where Today's safe to spend came from, said as a fact, for the accounts it starts from (the base-
// currency cash accounts). Only entered balances: "From the balance you entered." Entered and linked
// together: "From your bank and the balances you entered." No entered balance (a linked bank, the
// demos, a statement whose balance was never entered): null, and Today reads as it always did.
export const SOURCE_ENTERED = "From the balance you entered.";
export const SOURCE_MIXED = "From your bank and the balances you entered.";
export function balanceSourceLine(accounts = []) {
  const list = (accounts || []).filter(Boolean);
  if (!list.some(a => a.balanceEntered && isEditableAccount(a))) return null;
  return list.some(a => !isEditableAccount(a)) ? { kind: "mixed", text: SOURCE_MIXED } : { kind: "entered", text: SOURCE_ENTERED };
}

// Today's debt tile. "total" when anything is owed; "free" ("All entered debts are at $0.") only when the household has
// debts on record (a debt entered, or a card or loan account, linked or entered) and none of it is
// owed; "none" when there is no record at all, so nothing can be celebrated: "No debts entered", Add.
export function debtTileKind(data = {}, totalDebt = 0) {
  if (Number(totalDebt) > 0) return "total";
  const onRecord = (data.debts || []).some(Boolean) || (data.accounts || []).some(a => a && isCreditLiability(a));
  return onRecord ? "free" : "none";
}
