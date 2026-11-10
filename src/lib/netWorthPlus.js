// src/lib/netWorthPlus.js
// -----------------------------------------------------------------------------
// NET WORTH WITH PLUS: THE FIGURES (2026-11-10, docs/product/NET-WORTH-SPEC.md). Pure: it reads the household's data
// as the app already holds it and makes no call of any kind (no Plaid call, no Investments call: holdings are only
// what the existing sync already fetched). Behind the Plus entitlement and PLUS_ENABLED; no screen shows it yet.
//
// THE RULES, from the brief:
//   - every figure keeps the currency it arrived in, and nothing is ever summed across currencies
//   - no figure is estimated, no projection, no gain, no advice
//   - nothing is shown as a household total unless every part of it is real
// So a part is "real" only when its value is a number we were given (by the bank, or typed by the household) and its
// currency is stated. One part that is not real (a missing value, a currency not stated, a card that may be counted
// twice until the household answers) means NO total at all, for any currency: the parts are listed, each with what is
// missing, and that is all.
//
// What a part is:
//   linked cash, investment, credit and loan accounts   the bank's balance, as it is (an overdrawn account is negative)
//   investment holdings                                 detail under their account, in their own currency; never added
//                                                       (the account's balance already holds them)
//   debts the household entered (not a linked card)     their balance, negative
//   entries for a home, a car or a pension              the household's own figure, with its currency and date
// -----------------------------------------------------------------------------

import { likelyDebtAccountMatches } from "./financialCalculations.js";

export const ENTRY_KINDS = Object.freeze(["home", "car", "pension"]);
export const ENTRY_CURRENCIES = Object.freeze(["CAD", "USD"]);
// Canadian registered plans, by Plaid's subtype. "brokerage" is non-registered. Anything else is not stated: never guessed.
export const REGISTERED_SUBTYPES = Object.freeze(["rrsp", "tfsa", "fhsa", "resp", "rrif", "lira", "lrsp", "lif", "lrif", "rlif", "prif", "rdsp"]);
export const NON_REGISTERED_SUBTYPES = Object.freeze(["brokerage"]);

const ISO = /^[A-Z]{3}$/;
const lower = (v) => String(v || "").toLowerCase();
const currencyOf = (v) => { const c = String(v || "").toUpperCase(); return ISO.test(c) ? c : null; };
// A value we were given: a finite number (a string of digits from storage counts), never a blank or a word.
const given = (v) => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v.trim())) return Number(v);
  return null;
};
const toCents = (v) => (v === null ? null : Math.round(v * 100));

function accountKind(a) {
  const t = lower(a.type), s = lower(a.subtype);
  if (t === "depository" || t === "checking" || t === "savings") return "cash";
  if (t === "investment" || t === "brokerage" || REGISTERED_SUBTYPES.includes(s)) return "investment";
  if (t === "credit" || t === "credit card" || s === "credit card" || t === "line of credit") return "credit";
  if (t === "loan") return "loan";
  return null;
}
export function registrationOf(a) {
  const s = lower(a && a.subtype);
  if (REGISTERED_SUBTYPES.includes(s)) return "registered";
  if (NON_REGISTERED_SUBTYPES.includes(s)) return "non_registered";
  return "not_stated";
}

// The account's balance as stored: a number, or { current } as the server sends it.
function balanceOf(a) {
  if (a && a.balance && typeof a.balance === "object") return given(a.balance.current);
  return given(a && a.balance);
}

/**
 * The household's net worth parts and, only when every part is real, its totals per currency.
 *   { parts, currencies, complete, totals, problems }
 *   totals    null unless complete; then [{ currency, assetsCents, debtsCents, netCents }], one per currency, never
 *             added together
 * data: the household's data as the app holds it (accounts, debts, investments, netWorthEntries, profile).
 */
export function householdNetWorth(data = {}) {
  const parts = [];
  const accounts = Array.isArray(data.accounts) ? data.accounts : [];
  const holdings = Array.isArray(data.investments) ? data.investments : [];
  // The currency the household types amounts in, only when the profile says it: a debt or an entry typed in the app.
  const typedCurrency = currencyOf(data.profile && (data.profile.baseCurrency || (data.profile.country === "US" ? "USD" : data.profile.country === "CA" ? "CAD" : null)));
  const matches = likelyDebtAccountMatches(data) || [];
  const pairAccount = new Set(matches.map((m) => m.accountId));
  const pairDebt = new Set(matches.map((m) => m.debtIndex));

  const creditIds = new Set();
  for (const a of accounts) {
    if (!a) continue;
    const kind = accountKind(a);
    if (!kind) {
      // An account of a type not listed here (Plaid's "other", say) is never dropped quietly: it is a part with no
      // kind, so no total can be called complete without it (review 2026-11-10).
      parts.push({ id: a.id ?? null, source: "linked", kind: "other", label: String(a.name || a.type || "Account"), cents: toCents(balanceOf(a)), currency: currencyOf(a.currency), problems: ["kind_not_stated"] });
      continue;
    }
    if (kind === "credit" || kind === "loan") creditIds.add(a.id);
    const raw = balanceOf(a);
    // A card or loan balance is what is owed (Plaid's sign), so a credit in the household's favour stays positive.
    const signed = raw === null ? null : (kind === "credit" || kind === "loan" ? -raw : raw);
    const currency = currencyOf(a.currency || (a.balance && a.balance.currency));
    const problems = [];
    if (signed === null) problems.push("value_missing");
    if (!currency) problems.push("currency_not_stated");
    if (pairAccount.has(a.id)) problems.push("may_count_twice");
    const part = { id: a.id ?? null, source: "linked", kind, label: String(a.name || a.type || "Account"), cents: toCents(signed), currency, problems };
    if (kind === "investment") {
      part.registration = registrationOf(a);
      part.holdings = holdings.filter((h) => h && h.account_id === a.id).map((h) => ({
        id: h.id ?? null, name: String(h.name || ""), ticker: h.ticker || null, quantity: given(h.quantity),
        cents: toCents(given(h.value)), currency: currencyOf(h.currency),
      }));
    }
    parts.push(part);
  }

  (Array.isArray(data.debts) ? data.debts : []).forEach((d, i) => {
    if (!d || d.fromBank) return;
    if ((d.account_id && creditIds.has(d.account_id)) || (d.sameAsAccountId && creditIds.has(d.sameAsAccountId))) return;   // the linked card itself
    const v = given(d.balance);
    const problems = [];
    if (v === null) problems.push("value_missing");
    if (!typedCurrency) problems.push("currency_not_stated");
    if (pairDebt.has(i)) problems.push("may_count_twice");
    parts.push({ id: d.id ?? null, source: "entered", kind: "debt", label: String(d.name || "Debt"), cents: v === null ? null : toCents(-Math.abs(v)), currency: typedCurrency, problems });
  });

  for (const e of (Array.isArray(data.netWorthEntries) ? data.netWorthEntries : [])) {
    if (!e) continue;
    const v = given(e.value);
    const currency = ENTRY_CURRENCIES.includes(String(e.currency || "").toUpperCase()) ? String(e.currency).toUpperCase() : null;
    const problems = [];
    if (!ENTRY_KINDS.includes(e.kind)) problems.push("kind_not_allowed");
    if (v === null || v < 0) problems.push("value_missing");
    if (!currency) problems.push("currency_not_stated");
    parts.push({ id: e.id ?? null, source: "entered", kind: ENTRY_KINDS.includes(e.kind) ? e.kind : "other", label: String(e.label || ""), cents: v === null || v < 0 ? null : toCents(v), currency, enteredAt: e.enteredAt || null, problems });
  }

  return { parts, ...totalsOf(parts) };
}

/** The sums of some parts: per currency, never added together, and only when every one of them is real. */
export function totalsOf(parts) {
  const problems = [...new Set(parts.flatMap((p) => p.problems))];
  const complete = parts.length > 0 && problems.length === 0;
  const currencies = [...new Set(parts.map((p) => p.currency).filter(Boolean))].sort();
  const totals = complete
    ? currencies.map((currency) => {
        const mine = parts.filter((p) => p.currency === currency);
        const assetsCents = mine.filter((p) => p.cents > 0).reduce((s, p) => s + p.cents, 0);
        const debtsCents = mine.filter((p) => p.cents < 0).reduce((s, p) => s + p.cents, 0);
        return { currency, assetsCents, debtsCents, netCents: assetsCents + debtsCents };
      })
    : null;
  return { currencies, complete, totals, problems };
}

// ── PRIVATE BY DEFAULT BETWEEN PARTNERS (Amanda, 2026-11-10) ─────────────────────────────────────
// What could reveal a health or disability fact is marked, so the screen warns before it is shared and never shares
// it as part of anything else. An RDSP is open only to a person eligible for the disability tax credit.
export const SENSITIVE_SUBTYPES = Object.freeze(["rdsp", "hsa", "health reimbursement arrangement"]);
export const isSensitiveAccount = (a) => SENSITIVE_SUBTYPES.includes(lower(a && a.subtype));

/**
 * Net worth with Plus as ONE person sees it.
 *   data          the household's data (accounts, debts, profile) as the app holds it
 *   holdings      the holdings the server gave this person: their own, and their partner's shared accounts' only
 *   list          /api/networth list: { mine: { entries, shared_accounts }, partner: null | { entries, shared_accounts,
 *                 all_shared } }
 *   ownerOf(a)    "me" | "partner" | null for an account (null: no bank linked it, e.g. typed or from a statement)
 * Returns { mine, partner, household, showing, totals, complete, problems }:
 *   mine          this person's own parts (their accounts, their entries), each with shared true or false
 *   partner       only what the partner shared
 *   household     what both already see as the household's (debts typed in the app, accounts no bank linked)
 *   showing       "household" when there is no partner, or the partner shared everything (all_shared) and every
 *                 visible part is real; otherwise "mine". totals are for what is showing, and null unless all of it is
 *                 real (totalsOf). A partner's private things are never in any number here.
 */
export function viewerNetWorth({ data = {}, holdings = [], list = null, ownerOf = () => null } = {}) {
  // FAILS CLOSED: until this person's list has come from the server, nothing is known about who shares what, so
  // nothing is shown and nothing is totalled.
  if (!list || !list.mine) return { mine: [], partner: [], household: [], showing: "mine", currencies: [], complete: false, totals: null, problems: ["not_loaded"] };
  const accounts = Array.isArray(data.accounts) ? data.accounts : [];
  const mineList = (list && list.mine) || { entries: [], shared_accounts: [] };
  const partnerList = (list && list.partner) || null;
  const myShared = new Set(mineList.shared_accounts || []);
  const theirShared = new Set((partnerList && partnerList.shared_accounts) || []);
  // An account a bank linked (it carries _item) whose owner this device does not know is never shown: it may be the
  // partner's. Its absence blocks the household total (unknown_owner). One no bank linked is the household's.
  const owner = new Map(accounts.map((a) => [a.id, ownerOf(a) || (a && a._item ? "unknown" : null)]));
  const unknownOwner = accounts.some((a) => owner.get(a.id) === "unknown");
  const visibleAccounts = accounts.filter((a) => owner.get(a.id) !== "unknown" && (owner.get(a.id) !== "partner" || theirShared.has(a.id)));
  const toEntry = (who) => (e) => ({ id: e.id, kind: e.kind, label: e.label, value: Number(e.value_cents) / 100, currency: e.currency, enteredAt: e.entered_at, _who: who, _shared: e.shared === true });
  const entries = [...(mineList.entries || []).map(toEntry("me")), ...((partnerList && partnerList.entries) || []).map(toEntry("partner"))];
  const model = householdNetWorth({ ...data, accounts: visibleAccounts, investments: holdings, netWorthEntries: entries });
  const entryWho = new Map(entries.map((e) => [e.id, e]));
  const groupOf = (p) => {
    if (p.source === "entered" && entryWho.has(p.id)) return entryWho.get(p.id)._who === "me" ? "mine" : "partner";
    if (p.source === "linked") { const o = owner.get(p.id); return o === "me" ? "mine" : o === "partner" ? "partner" : "household"; }
    return "household";
  };
  const tag = (p) => {
    const a = p.source === "linked" ? accounts.find((x) => x.id === p.id) : null;
    const shared = p.source === "linked" ? myShared.has(p.id) : !!(entryWho.get(p.id) && entryWho.get(p.id)._shared);
    return { ...p, shared, sensitive: !!(a && isSensitiveAccount(a)) };
  };
  const groups = { mine: [], partner: [], household: [] };
  for (const p of model.parts) groups[groupOf(p)].push(tag(p));
  const all = [...groups.mine, ...groups.partner, ...groups.household];
  const partnerAll = (!partnerList || partnerList.all_shared === true) && !unknownOwner;
  const whole = totalsOf(all);
  const showing = partnerAll && whole.complete ? "household" : "mine";
  const shown = showing === "household" ? whole : totalsOf(groups.mine);
  return { mine: groups.mine, partner: groups.partner, household: groups.household, showing, ...shown };
}
