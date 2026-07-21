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
  const prevD = Array.isArray(prevDebts) ? prevDebts : [];
  // Collapse duplicates WITHIN the incoming batch first (two items returning the same real account),
  // newest wins — the caller passes newest-item-first after the server-side collapse.
  const seenKeys = new Set(), seenIds = new Set(), inc = [];
  for (const a of rawInc) {
    if (!a) continue;
    const k = accountStableKey(a);
    if (k && seenKeys.has(k)) continue;
    if (a.id && seenIds.has(a.id)) continue;
    if (k) seenKeys.add(k);
    if (a.id) seenIds.add(a.id);
    inc.push(a);
  }
  const incIds = new Set(inc.map(a => a && a.id).filter(Boolean));
  const incKeys = new Set(inc.map(accountStableKey).filter(Boolean));
  // Drop a prior account when the incoming batch supersedes it by id OR by stable key (the latter is
  // the duplicate-item case: same real account, different account_id).
  const accounts = [
    ...prevA.filter(a => {
      if (!a || !a.id) return false;
      if (incIds.has(a.id)) return false;
      const k = accountStableKey(a);
      return !(k && incKeys.has(k));
    }),
    ...inc,
  ];
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
