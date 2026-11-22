// src/lib/multibank.js
// -----------------------------------------------------------------------------
// Flourish — pure multi-bank retention helpers (Sprint Z3 #10).
//
// Extracted from the App.jsx setAppData closures (backgroundRefresh + the post-onboarding refresh)
// so the MONEY-VISIBLE account/liability retention is unit-testable in isolation. No React, no
// localStorage, no Supabase, no ambient clock — pure (input → output), so tests run under bare node.
//
// The hard rule these encode: a refresh must never DROP a real account/debt the user still has, and
// must never KEEP one a clean refresh proved is gone. When uncertain, KEEP (never lose data).
// -----------------------------------------------------------------------------

import { stripAccounts } from "./household.js";

// ── A BANK IS DISCONNECTED (review 2026-11-22, P9-02) ───────────────────────────────────────────────────────────
// One rule for what a disconnected bank takes with it, the rule a household already had when a member's bank left
// (lib/household.js stripAccounts, migration 0031): its accounts, the transactions, liabilities and holdings on
// them, the debts made from its cards and every link to those. Settings used to drop the accounts only, so the
// bank's transactions and card debts stayed behind, frozen, and were there a second time (under the new ids Plaid
// gives a new connection) when the bank was connected again.
//   isGone(account) → true for the accounts that leave. Left out: every bank account (not Manual, not Statement).
// Pure; returns a new object, or the same one when nothing leaves.
const HAND_KEPT = new Set(["", "manual", "statement"]);
const isBankAccount = (a) => !!a && (!!a._item || !HAND_KEPT.has(String(a.institution || "").toLowerCase()));
export function dropBankData(appData, isGone = isBankAccount) {
  if (!appData || typeof appData !== "object") return appData;
  const ids = (Array.isArray(appData.accounts) ? appData.accounts : [])
    .filter((a) => a && a.id != null && isGone(a)).map((a) => String(a.id));
  return stripAccounts(appData, ids);
}

// ── THE WEEKLY FULL RE-READ, PER BANK (review 2026-11-22, P7-02) ────────────────────────────────────────────────
// The weekly full re-read of every bank's transactions was stamped done for all of them even when one bank's read
// failed, so that bank waited another week for it. The stamp stays as it is (one full round a week); a bank whose
// full read failed is remembered here and read in full again on the next refresh, until it works.
//   owedBefore  item ids that owed a full read going into this round
//   items       the banks of this round; results[i] is items[i]'s Promise.allSettled result
//   fullResync  this round asked every bank for a full read
// Returns the item ids that still owe one. A bank no longer connected owes nothing. Pure.
export const FULL_SYNC_OWED_KEY = "flourish_full_sync_owed";
export function fullSyncOwedAfter(owedBefore, items, results, fullResync) {
  const owed = new Set((Array.isArray(owedBefore) ? owedBefore : []).map(String));
  const live = new Set();
  (Array.isArray(items) ? items : []).forEach((it, i) => {
    const id = it && it.item_id != null ? String(it.item_id) : null;
    if (!id) return;
    live.add(id);
    const readInFull = !!fullResync || owed.has(id);
    if (!readInFull) return;
    const worked = !!(Array.isArray(results) && results[i] && results[i].status === "fulfilled");
    if (worked) owed.delete(id); else owed.add(id);
  });
  return [...owed].filter((id) => live.has(id));
}

// ── Sprint D Fix: pure core of the connected-account PROMOTE ─────────────────
// Every successful account fetch (onboarding, Settings add-bank, server-truth reconciliation) funnels
// through this. Extracted so the money-visible parts are testable without React.
//
// The bug this encodes against: connected accounts used to live in component-local state and only
// reached the persisted appData at onboarding's finish(), so any unmount lost them while the
// plaid_items row persisted server-side — leaving accounts:[] / bankConnected:false with no recovery.
//
//   prevAccounts / prevDebts — current persisted state
//   incoming                 — freshly fetched accounts
// Returns { accounts, bankConnected, debts }:
//   • accounts     — merged, DEDUPED BY id (a re-fetch replaces, never appends, so balances can't double)
//   • bankConnected— DERIVED from the merged set (Manual/Statement are not bank connections), never
//                    from a caller-supplied flag or a component-local array
//   • debts        — prior debts plus any new credit-card accounts, keyed by account_id (no dupes)
// Stable identity for the SAME real-world account seen through DIFFERENT Plaid items. Plaid issues a
// fresh account_id per item, so id-matching cannot collapse a duplicate connection — institution +
// mask + type can. Returns null when there is no mask (Manual/Statement rows), so those fall back to
// id-only matching and can never be wrongly merged with each other.
export function accountStableKey(a) {
  if (!a || !a.mask) return null;
  return `${String(a.institution||"").toLowerCase()}|${String(a.mask)}|${String(a.type||"").toLowerCase()}`;
}

export function promoteAccounts(prevAccounts, prevDebts, incoming) {
  const rawInc = Array.isArray(incoming) ? incoming : [];
  const prevA = Array.isArray(prevAccounts) ? prevAccounts : [];
  // Review 2026-11-22 (P5-06): the stable key says "the same real account" only ACROSS bank connections. Two
  // accounts that ONE connection returns under different ids are two accounts, whatever their last four digits
  // (a credit union's chequing and savings share a member number), so they are never collapsed into one.
  const sameConnection = (a, b) => !!(a && b && a._item && b._item && a._item === b._item);
  // Collapse duplicates WITHIN the incoming batch first (two items returning the same real account),
  // newest wins — the caller passes newest-item-first after the server-side collapse.
  const seenByKey = new Map(), seenIds = new Set(), inc = [];
  for (const a of rawInc) {
    if (!a) continue;
    const k = accountStableKey(a);
    if (k && (seenByKey.get(k) || []).some(first => !sameConnection(first, a))) continue;
    if (a.id && seenIds.has(a.id)) continue;
    if (k) seenByKey.set(k, [...(seenByKey.get(k) || []), a]);
    if (a.id) seenIds.add(a.id);
    inc.push(a);
  }
  const incIds = new Set(inc.map(a => a && a.id).filter(Boolean));
  // The incoming account that supersedes a prior one by stable key (the duplicate-item case: same real
  // account, different account_id), or null.
  const supersededBy = (a) => {
    const k = accountStableKey(a);
    return k ? ((seenByKey.get(k) || []).find(n => !sameConnection(n, a)) || null) : null;
  };
  // Drop a prior account when the incoming batch supersedes it by id OR by stable key.
  // Review 2026-11-22 (P5-04): remember which new account id took each superseded one's place, so the debt made
  // from that card follows it instead of staying behind beside a second, new debt for the same card.
  const movedTo = new Map();
  const accounts = [
    ...prevA.filter(a => {
      if (!a || !a.id) return false;
      if (incIds.has(a.id)) return false;
      const next = supersededBy(a);
      if (next && next.id) movedTo.set(String(a.id), next.id);
      return !next;
    }),
    ...inc,
  ];
  const moved = (id) => (id != null && movedTo.has(String(id)) ? movedTo.get(String(id)) : null);
  const prevD = (Array.isArray(prevDebts) ? prevDebts : []).map(d => {
    if (!d || typeof d !== "object") return d;
    if (d.fromBank && moved(d.account_id)) return { ...d, account_id: moved(d.account_id) };
    if (!d.fromBank && moved(d.sameAsAccountId)) return { ...d, sameAsAccountId: moved(d.sameAsAccountId) };
    return d;
  });
  const isCard = (a) => a && (a.type === "credit" || a.type === "credit card" ||
                              a.subtype === "credit card" || a.type === "line of credit");
  const existingDebtAcctIds = new Set(prevD.map(x => x && x.account_id).filter(Boolean));
  const newCCDebts = inc.filter(a => isCard(a) && a.id && !existingDebtAcctIds.has(a.id)).map(a => ({
    name: a.name || "Credit Card",
    balance: Math.abs(Number(a.balance) || 0).toFixed(2),
    rate: "", min: "", fromBank: true, account_id: a.id,
  }));
  return {
    accounts,
    bankConnected: accounts.some(a => a && a.institution !== "Manual" && a.institution !== "Statement"),
    debts: [...prevD.filter(x => x && (x.name || x.balance)), ...newCCDebts],
  };
}

// Decide which PRIOR accounts to carry forward after a refresh.
//   prev          — the existing accounts array
//   fresh         — the accounts returned/built THIS round (their ids win)
//   failedItemIds — Set of item_ids whose get_accounts call FAILED this round
//   allSucceeded  — caller passes failedItemIds.size === 0
// Retain a prior account when: it wasn't refreshed this round AND
//   - it's stamped (_item): only if ITS bank failed this round (a succeeded bank that dropped it = gone);
//   - it's unstamped (legacy): Manual/Statement accounts aren't Plaid-refreshable → always keep; a
//     Plaid-shaped legacy account that a CLEAN refresh didn't return is genuinely gone → drop.
// NOTE: accounts identify by `id` and carry `institution` (Manual/Statement vs a bank) — they do NOT
// carry `account_id` (that's on debts/txns), so `institution` is the manual-vs-Plaid signal here.
export function retainAccounts(prev, fresh, failedItemIds, allSucceeded) {
  const freshIds = new Set((fresh || []).map(a => a.id));
  return (prev || []).filter(p => {
    if (freshIds.has(p.id)) return false;
    if (p._item) return failedItemIds.has(p._item);
    const isManual = !p.institution || ["Manual", "Statement"].includes(p.institution);
    if (allSucceeded && !isManual) return false;
    return true;
  });
}

// Per-ITEM liability retention, returning the merged { credit, mortgage, student }.
//   prevLiab        — prior liabilities object
//   fresh           — this round's liabilities object (from AVAILABLE items only)
//   acctItemMap     — Map(account_id → owning item_id) built from the stamped accounts
//   availableItemIds— Set of item_ids that returned liabilities this round
// Keep a prior entry only when its owning bank item was UNAVAILABLE this round (couldn't fetch). If its
// item WAS available and no longer returns it → confirmed paid-off → drop. Unknown owner → keep
// (conservative; self-heals once its account is stamped). Fresh entries always included.
export function retainLiabilities(prevLiab, fresh, acctItemMap, availableItemIds) {
  const prev = prevLiab || { credit: [], mortgage: [], student: [] };
  const f = fresh || { credit: [], mortgage: [], student: [] };
  const pick = (cat) => {
    const freshCat = f[cat] || [];
    const freshIds = new Set(freshCat.map(e => e.account_id));
    const retained = (prev[cat] || []).filter(e => {
      if (freshIds.has(e.account_id)) return false;
      const item = acctItemMap.get(e.account_id);
      return item == null ? true : !availableItemIds.has(item);
    });
    return [...retained, ...freshCat];
  };
  return { credit: pick("credit"), mortgage: pick("mortgage"), student: pick("student") };
}

// Per-ITEM investment holdings, the same rule (review 2026-11-22, P10-06 with P3-09; round 2, N2). The banks that
// answered used to replace the whole list, so one bank's failed read wiped its holdings whenever another answered.
//   prev             the holdings held now
//   fresh            this round's holdings, from the banks that ANSWERED only
//   acctItemMap      Map(account_id -> owning item_id, or null for an account no bank linked) from the accounts
//   availableItemIds Set of item_ids that answered (not failed, and not marked `unavailable` by the server)
//   someBankFailed   false only when every bank of the round answered
// A holding's BANK decides, whatever its id: kept when its bank did not answer, gone when its bank answered (what
// that bank holds now is in `fresh`, which may be nothing: sold). Only a holding with no known bank is matched by
// identity, so that it is not listed twice when it comes again: its id, or account + security/ticker/name when it
// has none (an id ending in "_undefined" is none). One with no identity at all is never matched to another.
// Of those with no known bank and not come again: on an account no bank linked, kept (not a bank's to remove); on an
// account that is gone, kept only while some bank failed (it may be that bank's). Pure.
const holdingKey = (h) => {
  if (!h) return null;
  if (typeof h.id === "string" && h.id && !/_(undefined|null)$/.test(h.id)) return `id:${h.id}`;
  const what = h.security_id ?? h.ticker ?? h.name;
  return h.account_id != null && what != null && what !== "" ? `at:${h.account_id}|${what}` : null;
};
export function retainHoldings(prev, fresh, acctItemMap, availableItemIds, someBankFailed = true) {
  const came = Array.isArray(fresh) ? fresh : [];
  const cameKeys = new Set(came.map(holdingKey).filter(Boolean));
  const kept = (Array.isArray(prev) ? prev : []).filter(h => {
    if (!h) return false;
    const item = acctItemMap.get(h.account_id);
    if (item != null) return !availableItemIds.has(item);
    const key = holdingKey(h);
    if (key && cameKeys.has(key)) return false;
    return acctItemMap.has(h.account_id) ? true : !!someBankFailed;
  });
  return [...kept, ...came];
}
