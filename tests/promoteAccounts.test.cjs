// tests/promoteAccounts.test.cjs
// -----------------------------------------------------------------------------
// Sprint D Fix — connected bank data must land in the PERSISTED appData, not a component-local store.
//
// THE BUG: accounts fetched during onboarding lived in `connAccts`, a useState inside the Onboarding
// component. They reached appData only via finish(). Any unmount before that (reload, backgrounding,
// abandoning the flow) discarded them — while exchange_token had ALREADY committed the plaid_items row
// server-side. Result: appData.accounts = [], bankConnected = false, with no recovery path, because
// every re-fetch (post-onboarding sync, backgroundRefresh) is gated on bankConnected. The user saw
// "Connected Banks: Scotiabank" (read from the server) next to "Connected Accounts: 0" (read from
// appData), 0 debts, no credit card, 0 transactions — and therefore no payroll detection.
//
// promoteAccounts is the pure core every path now funnels through: onboarding, Settings add-bank, and
// the server-truth reconciliation.
// -----------------------------------------------------------------------------
"use strict";

const { create } = require("./_runner.cjs");

(async () => {
  const { promoteAccounts } = await import("../src/lib/multibank.js");
  const { buildDbBlob, isBlobEmpty } = await import("../src/lib/persistence.js");
  const t = create();

  const chq  = (id, bal, inst="Scotiabank") => ({ id, name:`${inst} ••1234`, type:"depository", subtype:"checking", balance:bal, institution:inst });
  const card = (id, bal, inst="Scotiabank") => ({ id, name:`${inst} ••9999`, type:"credit", subtype:"credit card", balance:bal, institution:inst });

  // ── A connect promotes accounts AND flips bankConnected ────────────────────────────────────────
  {
    const r = promoteAccounts([], [], [chq("a1", 2500)]);
    t.eq(r.accounts.length, 1, "a connected account lands in appData.accounts");
    t.eq(r.bankConnected, true,
         "bankConnected is DERIVED from the merged account set — this is the flag whose staying false " +
         "gated every recovery path and made the breakage permanent");
    t.eq(r.debts.length, 0, "a chequing account adds no debt");
  }

  // ── Credit card imports as a debt, keyed by account_id ─────────────────────────────────────────
  {
    const r = promoteAccounts([], [], [chq("a1", 2500), card("c1", 840.5)]);
    t.eq(r.accounts.length, 2, "both accounts land");
    t.eq(r.debts.length, 1, "the credit card becomes a tracked debt (Manage Debts showed 0)");
    t.eq(r.debts[0].account_id, "c1", "the debt is keyed by account_id, not name");
    t.eq(r.debts[0].balance, "840.50", "…with the absolute balance");
    t.eq(r.debts[0].fromBank, true, "…and flagged as bank-derived");
  }

  // ── REQUIREMENT 5: dedupe by account id — no double-count ──────────────────────────────────────
  {
    // The same account arriving twice (reconciliation running twice, or a re-fetch) must REPLACE.
    const first  = promoteAccounts([], [], [chq("a1", 2500)]);
    const second = promoteAccounts(first.accounts, first.debts, [chq("a1", 2500)]);
    t.eq(second.accounts.length, 1,
         "re-promoting the SAME account id replaces rather than appends — balances cannot double-count");
    t.eq(second.accounts.reduce((s,a)=>s+a.balance,0), 2500, "…so the total stays $2,500, not $5,000");

    // A refreshed balance for the same id wins.
    const third = promoteAccounts(second.accounts, second.debts, [chq("a1", 2700)]);
    t.eq(third.accounts.length, 1, "still one account");
    t.eq(third.accounts[0].balance, 2700, "the fresh balance replaces the stale one");

    // A card promoted twice must not create two debts.
    const c1 = promoteAccounts([], [], [card("c1", 100)]);
    const c2 = promoteAccounts(c1.accounts, c1.debts, [card("c1", 100)]);
    t.eq(c2.debts.length, 1, "the same card does not produce a duplicate debt entry");
  }

  // ── Adding a SECOND, genuinely different bank does not clobber the first ───────────────────────
  {
    const first  = promoteAccounts([], [], [chq("a1", 2500, "Scotiabank")]);
    const second = promoteAccounts(first.accounts, first.debts, [chq("b1", 900, "RBC")]);
    t.eq(second.accounts.length, 2, "multi-bank: the second bank is added, the first retained");
    t.eq(second.bankConnected, true, "still connected");
  }

  // ── Manual / Statement accounts are not bank connections ──────────────────────────────────────
  {
    const manual = promoteAccounts([], [], [{ id:"m1", name:"Cash", type:"depository", balance:100, institution:"Manual" }]);
    t.eq(manual.bankConnected, false, "a Manual account must NOT set bankConnected");
    const stmt = promoteAccounts([], [], [{ id:"s1", name:"Statement", type:"checking", balance:0, institution:"Statement" }]);
    t.eq(stmt.bankConnected, false, "a Statement upload must NOT set bankConnected");
    const mixed = promoteAccounts(manual.accounts, [], [chq("a1", 2500)]);
    t.eq(mixed.bankConnected, true, "…but a real bank alongside a Manual account does");
    t.eq(mixed.accounts.length, 2, "…and the Manual account is retained");
  }

  // ── REQUIREMENT 2/5: the broken-state user HEALS via reconciliation ────────────────────────────
  {
    // Amanda's exact production state: onboarded, real profile, but zero accounts and bankConnected
    // false, while plaid_items exist server-side.
    const broken = {
      profile: { name: "Amanda" }, incomes: [{ id:1, amount:"2600", freq:"biweekly" }],
      bills: [], debts: [], accounts: [], transactions: [], bankConnected: false,
    };
    t.eq(broken.accounts.length, 0, "precondition: broken state has no accounts");
    t.eq(broken.bankConnected, false, "precondition: bankConnected false");

    // Reconciliation fetches from server truth and promotes.
    const healed = promoteAccounts(broken.accounts, broken.debts, [chq("a1", 2500), card("c1", 840.5)]);
    t.eq(healed.accounts.length, 2, "reconciliation restores the accounts WITHOUT a reconnect");
    t.eq(healed.bankConnected, true, "…flips bankConnected true, unsealing every gated refresh path");
    t.eq(healed.debts.length, 1, "…and imports the credit card into Manage Debts");
  }

  // ── The promoted state SURVIVES the save path (buildDbBlob keeps accounts) ─────────────────────
  {
    const r = promoteAccounts([], [], [chq("a1", 2500), card("c1", 840.5)]);
    const state = {
      onboarded: true,
      appData: { profile:{name:"Amanda"}, accounts:r.accounts, debts:r.debts,
                 bankConnected:r.bankConnected, transactions:[], incomes:[], bills:[] },
    };
    const blob = buildDbBlob(state, { userId:"u1", nowIso:"2026-07-21T19:00:00.000Z" });
    t.eq(blob.core.appData.accounts.length, 2,
         "accounts survive buildDbBlob — they reach the persisted blob (the production blob had 0)");
    t.eq(blob.core.appData.bankConnected, true, "bankConnected survives into the saved blob");
    t.eq(blob.core.appData.debts.length, 1, "the imported card survives into the saved blob");
    t.eq(isBlobEmpty(blob), false,
         "a blob with real accounts is NOT empty, so upsertUserData's safety net will not refuse it");
  }

  // ── Degenerate input never corrupts state ──────────────────────────────────────────────────────
  {
    t.eq(promoteAccounts(null, null, null).accounts.length, 0, "null inputs → empty, no throw");
    t.eq(promoteAccounts(null, null, null).bankConnected, false, "…and not connected");
    const keep = promoteAccounts([chq("a1", 2500)], [], []);
    t.eq(keep.accounts.length, 1, "an empty incoming set never drops existing accounts");
    t.eq(keep.bankConnected, true, "…and does not clear bankConnected");
    const noId = promoteAccounts([], [], [{ name:"no id", type:"depository", balance:5, institution:"X" }]);
    t.eq(noId.debts.length, 0, "an account with no id creates no debt row");
  }

  t.summary("promoteAccounts.test");
})();
