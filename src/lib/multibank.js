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
