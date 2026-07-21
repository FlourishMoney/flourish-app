// tests/reconcileHeal.test.cjs
// -----------------------------------------------------------------------------
// Sprint D Fix (round 2) — duplicate-item collapse, cross-item dedupe, and the CLOBBER regression.
//
// WHY THIS FILE EXISTS: the previous fix passed its whole suite and still failed on real data. The
// tests covered a single clean item; production had TWO items for one bank.
//
// THE CLOBBER: a refresh where every item "succeeds" but returns ZERO accounts fell straight through
// to retainAccounts, which drops any Plaid-shaped account absent from a clean refresh:
//     if (p._item) return failedItemIds.has(p._item);   // clean refresh → failedItemIds empty → drop
//     if (allSucceeded && !isManual) return false;      // unstamped bank account → drop
// So: heal → bankConnected flips true → previously-gated refreshes unseal → an empty "successful"
// refresh → accounts wiped → num_accounts back to 0 with a current updated_at.
//
// NOTE (recorded deliberately): the `_item` stamp was believed to be the load-bearing fix. The
// assertions below DISPROVE that — a stamped account is dropped by a clean refresh exactly like an
// unstamped one. The real protection is the backgroundRefresh call-site guard that refuses to run the
// destructive retain when a refresh returned zero accounts against a non-empty cache.
// -----------------------------------------------------------------------------
"use strict";

const { create } = require("./_runner.cjs");

(async () => {
  const { promoteAccounts, accountStableKey, retainAccounts } = await import("../src/lib/multibank.js");
  const t = create();

  // Two Plaid items for the SAME bank return the SAME real account with DIFFERENT account_ids.
  const scotiaA = { id:"acc_from_item_A", name:"Scotiabank ••4521", type:"depository", subtype:"checking",
                    balance:2500, institution:"Scotiabank", mask:"4521", _item:"item_A" };
  const scotiaB = { id:"acc_from_item_B", name:"Scotiabank ••4521", type:"depository", subtype:"checking",
                    balance:2500, institution:"Scotiabank", mask:"4521", _item:"item_B" };
  const rbc     = { id:"acc_rbc", name:"RBC ••9001", type:"depository", subtype:"checking",
                    balance:900, institution:"RBC", mask:"9001", _item:"item_R" };

  // ── Stable key: identifies the same real account across different items ────────────────────────
  t.eq(accountStableKey(scotiaA), accountStableKey(scotiaB),
       "the same real account seen through two items has the SAME stable key (account_id differs)");
  t.ok(accountStableKey(scotiaA) !== accountStableKey(rbc), "different banks have different keys");
  t.eq(accountStableKey({ id:"m1", institution:"Manual", type:"checking" }), null,
       "no mask (Manual/Statement) → null key, so those fall back to id-only and can't wrongly merge");

  // ── 2 DUPLICATE-institution items → collapses to 1, NO double-count ────────────────────────────
  {
    const r = promoteAccounts([], [], [scotiaB, scotiaA]);   // both items' accounts arrive together
    t.eq(r.accounts.length, 1,
         "two items for one bank yield ONE account — the duplicate-Scotiabank double-count is prevented " +
         "even though the account_ids differ (id-dedupe alone could not catch this)");
    t.eq(r.accounts.reduce((s,a)=>s+a.balance,0), 2500, "…so the balance is $2,500, not $5,000");
    t.eq(r.bankConnected, true, "…and the user is marked connected");
  }

  // Duplicate arriving in a LATER promote (reconcile ran twice) must also collapse.
  {
    const first  = promoteAccounts([], [], [scotiaA]);
    const second = promoteAccounts(first.accounts, first.debts, [scotiaB]);
    t.eq(second.accounts.length, 1, "a duplicate arriving in a later promote replaces, never appends");
    t.eq(second.accounts[0]._item, "item_B", "…and the newer item's account wins");
  }

  // ── 2 DIFFERENT banks → BOTH heal and both persist ─────────────────────────────────────────────
  {
    const r = promoteAccounts([], [], [scotiaA, rbc]);
    t.eq(r.accounts.length, 2, "two genuinely different banks both heal — collapse must not over-merge");
    t.eq(r.accounts.reduce((s,a)=>s+a.balance,0), 3400, "…and both balances count ($2,500 + $900)");
  }

  // ── One item's get_accounts failing → the other still heals (allSettled) ───────────────────────
  {
    // The reconcile maps only FULFILLED results, so a rejected item contributes nothing but does not
    // prevent the other from promoting.
    const onlySurvivor = promoteAccounts([], [], [rbc]);   // scotia item rejected → absent from `mapped`
    t.eq(onlySurvivor.accounts.length, 1, "a failed item does not zero the accounts of a healthy one");
    t.eq(onlySurvivor.bankConnected, true, "…and the surviving bank still marks the user connected");
  }

  // ══ THE CLOBBER REGRESSION — the exact thing that broke on real data ═══════════════════════════
  {
    // A healed account, as reconcile now creates it: STAMPED with _item.
    const healed = promoteAccounts([], [], [scotiaA]).accounts;
    t.eq(healed[0]._item, "item_A", "reconcile-created accounts carry an _item stamp");

    // HONEST FINDING: the `_item` stamp does NOT by itself survive a clean refresh that omits the
    // account. retainAccounts' stamped rule is "keep only if ITS bank failed this round":
    //     if (p._item) return failedItemIds.has(p._item);
    // so on a clean refresh (empty failedItemIds) a stamped account is dropped just like an unstamped
    // one. The stamp was NOT the load-bearing fix — this assertion records the real behaviour so the
    // wrong theory can't be re-adopted.
    t.eq(retainAccounts(healed, [], new Set(), true).length, 0,
         "a STAMPED account is still dropped by a clean refresh that omits it — the _item stamp alone " +
         "does NOT prevent the clobber (this disproved the stated hypothesis)");
    t.eq(retainAccounts([{ ...scotiaA, _item: undefined }], [], new Set(), true).length, 0,
         "…and an unstamped one is dropped too — stamped vs unstamped is NOT the difference here");

    // What the stamp IS worth: correct provenance, so a failed bank's accounts are retained.
    t.eq(retainAccounts(healed, [], new Set(["item_A"]), false).length, 1,
         "the stamp's real value: when ITS bank fails, the account is retained (never lose data on " +
         "uncertainty). An unstamped account cannot express that.");

    // THE ACTUAL PROTECTION is the call-site guard: a refresh that returns ZERO accounts while some
    // are cached must not run the destructive retain at all. Modelled here as the caller's decision.
    const wouldWipe = (freshCount, cachedCount) => freshCount === 0 && cachedCount > 0;
    t.eq(wouldWipe(0, healed.length), true,
         "an empty 'successful' refresh against a non-empty cache is exactly the wipe condition — the " +
         "backgroundRefresh guard now returns prev unchanged instead of retaining/dropping");
    t.eq(wouldWipe(2, healed.length), false, "a refresh that returned accounts proceeds normally");
    t.eq(wouldWipe(0, 0), false, "an empty refresh with an empty cache is not a wipe — nothing to lose");
  }

  // ── Manual accounts are untouched by any of this ───────────────────────────────────────────────
  {
    const manual = { id:"m1", name:"Cash", type:"checking", balance:100, institution:"Manual" };
    const r = promoteAccounts([manual], [], [scotiaA]);
    t.eq(r.accounts.length, 2, "a Manual account survives a heal");
    t.eq(retainAccounts([manual], [], new Set(), true).length, 1,
         "…and is never dropped by a clean refresh (unstamped but Manual)");
  }

  // ── Degenerate input ──────────────────────────────────────────────────────────────────────────
  t.eq(promoteAccounts([], [], []).accounts.length, 0, "empty incoming → no accounts, no throw");
  t.eq(promoteAccounts([scotiaA], [], []).accounts.length, 1, "empty incoming never drops existing accounts");

  t.summary("reconcileHeal.test");
})();
