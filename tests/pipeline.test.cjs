// tests/pipeline.test.cjs — MATH-LOCK integration suite.
// Runs the full Plaid → display pipeline on frozen fixtures:
//   raw server txns → normaliseTxns → markTransfers → sync-merge (mergeById/removeByIds) →
//   detectRecurringBills → SafeSpendEngine + ForecastEngine.
// Fixtures: pending→posted, deleted, modified, multi-bank merge, transfers, recurring across cadences.
"use strict";

const { create } = require("./_runner.cjs");
const D = (iso) => new Date(iso + "T12:00:00");

(async () => {
  const fc = await import("../src/lib/financialCalculations.js");
  const pn = await import("../src/lib/plaidNormalize.js");
  const ss = await import("../src/lib/safeSpendEngine.js");
  const fe = await import("../src/lib/forecastEngine.js");
  const t = create();

  const NOW = D("2026-06-15");

  // Compose the client pipeline exactly as App.jsx's refresh does: server-normalized txns →
  // normaliseTxns → markTransfers → (sync merge into prev) → detectRecurringBills.
  const pipeline = (serverTxns, prevTxns = [], removedIds = []) => {
    const normalised = pn.normaliseTxns(serverTxns);
    const marked = pn.markTransfers(normalised, fc.isInternalTransfer, fc.isCashAdvance);
    const merged = pn.removeByIds(pn.mergeById(prevTxns, marked), removedIds);
    return merged;
  };

  // ── 1. Full happy-path pipeline (multi-bank) → bills + safe-spend + forecast ─────────────────────
  // Two banks: TD chequing (a1) + Tangerine chequing (a2). Recurring Netflix + Hydro, plus noise.
  const server = [
    { id: "td_rent_apr", date: "2026-04-01", name: "Rent Payment", amount: 1500, category: "RENT_AND_UTILITIES", account_id: "a1" },
    { id: "td_rent_may", date: "2026-05-01", name: "Rent Payment", amount: 1500, category: "RENT_AND_UTILITIES", account_id: "a1" },
    { id: "td_rent_jun", date: "2026-06-01", name: "Rent Payment", amount: 1500, category: "RENT_AND_UTILITIES", account_id: "a1" },
    { id: "td_nflx_apr", date: "2026-04-22", name: "Netflix", amount: 18.99, category: "ENTERTAINMENT", account_id: "a1" },
    { id: "td_nflx_may", date: "2026-05-22", name: "Netflix", amount: 18.99, category: "ENTERTAINMENT", account_id: "a1" },
    { id: "td_nflx_jun", date: "2026-06-22", name: "Netflix", amount: 18.99, category: "ENTERTAINMENT", account_id: "a1" },
    { id: "tg_coffee", date: "2026-06-10", name: "Starbucks", amount: 5.25, category: "FOOD_AND_DRINK", account_id: "a2" }, // one-off, not recurring
  ];
  const txns = pipeline(server);
  t.eq(txns.length, 7, "pipeline: all 7 txns flow through (multi-bank)");
  t.ok(txns.some(x => x.account_id === "a1") && txns.some(x => x.account_id === "a2"), "pipeline: both banks present (multi-bank merge)");
  const bills = pn.detectRecurringBills(txns);
  t.eq(bills.length, 2, "pipeline: detects 2 recurring bills (Rent, Netflix) — Starbucks one-off excluded");
  t.ok(bills.find(b => b.name.toLowerCase().includes("rent") && b.freq === "monthly"), "pipeline: Rent detected monthly");
  t.ok(bills.find(b => b.name === "Netflix" && b.amount === "18.99"), "pipeline: Netflix detected with exact amount");
  // Feed into the engines
  const data = { accounts: [{ type: "checking", balance: "3000", id: "a1" }], bills, debts: [], incomes: [{ amount: "4000", freq: "monthly", anchorDay: 1 }], transactions: txns };
  const sd = ss.SafeSpendEngine.calculate(data, NOW);
  t.ok(Number.isFinite(sd.safeAmount) && sd.balance === 3000, "pipeline → SafeSpend produces finite safeAmount");
  const fcast = fe.ForecastEngine.generate(data, 30, null, NOW);
  t.eq(fcast.forecast[0].balance, 3000, "pipeline → Forecast day0 = balance");

  // ── 2. pending → posted transition ──────────────────────────────────────────────────────────────
  // Round 1: a pending coffee (id P1). Round 2: it posts as a NEW id X1, and P1 arrives in `removed`.
  const round1 = pipeline([{ id: "P1", date: "2026-06-12", name: "Cafe", amount: 4.50, category: "FOOD_AND_DRINK", account_id: "a1", pending: true }]);
  t.eq(round1.length === 1 && round1[0].pending === true, true, "pending→posted: round1 has the pending txn");
  const round2 = pipeline([{ id: "X1", date: "2026-06-12", name: "Cafe", amount: 4.75, category: "FOOD_AND_DRINK", account_id: "a1", pending: false }], round1, ["P1"]);
  t.eq(round2.length, 1, "pending→posted: round2 has exactly one txn (pending replaced, not duplicated)");
  t.eq(round2[0].id, "X1", "pending→posted: the posted txn (X1) survives");
  t.eq(round2.some(x => x.id === "P1"), false, "pending→posted: the pending txn (P1) was removed");
  t.eq(round2[0].pending, false, "pending→posted: surviving txn is posted");

  // ── 3. deleted txn ──────────────────────────────────────────────────────────────────────────────
  const existing3 = pipeline([
    { id: "k1", date: "2026-06-10", name: "Keep", amount: 10, category: "GENERAL_MERCHANDISE", account_id: "a1" },
    { id: "d1", date: "2026-06-11", name: "Delete", amount: 20, category: "GENERAL_MERCHANDISE", account_id: "a1" },
  ]);
  const afterDelete = pn.removeByIds(existing3, ["d1"]);
  t.eq(afterDelete.length, 1, "deleted: removed txn gone");
  t.eq(afterDelete[0].id, "k1", "deleted: the kept txn remains");

  // ── 4. modified txn (amount/category change) ────────────────────────────────────────────────────
  const existing4 = pipeline([{ id: "m1", date: "2026-06-10", name: "Shop", amount: 50, category: "GENERAL_MERCHANDISE", account_id: "a1" }]);
  const modified = pipeline([{ id: "m1", date: "2026-06-10", name: "Shop", amount: 75, category: "GROCERIES", account_id: "a1" }], existing4);
  t.eq(modified.length, 1, "modified: no duplicate (merge by id)");
  t.eq(modified[0].amount, 75, "modified: fresh amount wins (50 → 75)");
  t.eq(modified[0].cat, "Groceries", "modified: fresh category wins");

  // ── 5. multi-bank incremental merge (new bank's txns added, existing kept) ───────────────────────
  const bankA = pipeline([{ id: "a_1", date: "2026-06-01", name: "A txn", amount: 30, category: "GENERAL_MERCHANDISE", account_id: "a1" }]);
  const bankBdelta = pipeline([{ id: "b_1", date: "2026-06-02", name: "B txn", amount: 40, category: "GENERAL_MERCHANDISE", account_id: "a2" }], bankA);
  t.eq(bankBdelta.length, 2, "multi-bank: both banks' txns coexist after merge");
  t.ok(bankBdelta.some(x => x.account_id === "a1") && bankBdelta.some(x => x.account_id === "a2"), "multi-bank: account_ids preserved");

  // ── 6. transfers excluded from bills + spend ─────────────────────────────────────────────────────
  // A cross-account transfer (checking → savings) must be flagged isTransfer and NOT become a bill.
  const withTransfer = pipeline([
    { id: "tf_out", date: "2026-06-05", name: "Transfer to Savings", amount: 500, category: "TRANSFER_OUT", account_id: "a1" },
    { id: "tf_in", date: "2026-06-05", name: "Transfer to Savings", amount: -500, category: "TRANSFER_IN", account_id: "a2" },
    { id: "tf_out2", date: "2026-07-05", name: "Transfer to Savings", amount: 500, category: "TRANSFER_OUT", account_id: "a1" },
    { id: "tf_in2", date: "2026-07-05", name: "Transfer to Savings", amount: -500, category: "TRANSFER_IN", account_id: "a2" },
  ]);
  t.ok(withTransfer.filter(x => x.isTransfer).length >= 2, "transfers: cross-account moves flagged isTransfer");
  const transferBills = pn.detectRecurringBills(withTransfer);
  t.eq(transferBills.length, 0, "transfers: a recurring transfer never becomes a bill");

  // ── 7. recurring detection across cadences (weekly / monthly / semimonthly) ─────────────────────
  const cadenceTxns = pn.normaliseTxns([
    // Weekly gym (~7d) — "gym" is a bill keyword
    { id: "g1", date: "2026-05-25", name: "GoodLife Gym", amount: 22, category: "GENERAL_SERVICES", account_id: "a1" },
    { id: "g2", date: "2026-06-01", name: "GoodLife Gym", amount: 22, category: "GENERAL_SERVICES", account_id: "a1" },
    { id: "g3", date: "2026-06-08", name: "GoodLife Gym", amount: 22, category: "GENERAL_SERVICES", account_id: "a1" },
    { id: "g4", date: "2026-06-15", name: "GoodLife Gym", amount: 22, category: "GENERAL_SERVICES", account_id: "a1" },
    // Monthly Spotify (~30d)
    { id: "s1", date: "2026-04-12", name: "Spotify", amount: 11.99, category: "ENTERTAINMENT", account_id: "a1" },
    { id: "s2", date: "2026-05-12", name: "Spotify", amount: 11.99, category: "ENTERTAINMENT", account_id: "a1" },
    { id: "s3", date: "2026-06-12", name: "Spotify", amount: 11.99, category: "ENTERTAINMENT", account_id: "a1" },
    // Semimonthly insurance (1st & 15th — biweekly cadence, ≤2 days-of-month → reclassified semimonthly)
    { id: "i1", date: "2026-05-01", name: "Aviva Insurance", amount: 60, category: "GENERAL_SERVICES", account_id: "a1" },
    { id: "i2", date: "2026-05-15", name: "Aviva Insurance", amount: 60, category: "GENERAL_SERVICES", account_id: "a1" },
    { id: "i3", date: "2026-06-01", name: "Aviva Insurance", amount: 60, category: "GENERAL_SERVICES", account_id: "a1" },
    { id: "i4", date: "2026-06-15", name: "Aviva Insurance", amount: 60, category: "GENERAL_SERVICES", account_id: "a1" },
  ]);
  const cadenceBills = pn.detectRecurringBills(cadenceTxns);
  const gym = cadenceBills.find(b => b.name.toLowerCase().includes("gym"));
  const spotify = cadenceBills.find(b => b.name === "Spotify");
  const aviva = cadenceBills.find(b => b.name.toLowerCase().includes("aviva"));
  t.eq(gym && gym.freq, "weekly", "cadence: GoodLife Gym (7-day gaps) → weekly");
  t.eq(spotify && spotify.freq, "monthly", "cadence: Spotify (30-day gaps) → monthly");
  t.eq(aviva && aviva.freq, "semimonthly", "cadence: Aviva on 1st & 15th → semimonthly (reclassified from biweekly)");

  // ── 8. end-to-end: detected bills drive the SafeSpend 10-day window deterministically ───────────
  // Spotify due ~the 12th; with today = Jun 10, its next occurrence (Jun 12) is inside the window.
  const e2eBills = pn.detectRecurringBills(cadenceTxns);
  const e2eData = { accounts: [{ type: "checking", balance: "1000", id: "a1" }], bills: e2eBills, debts: [], incomes: [{ amount: "3000", freq: "monthly" }], transactions: cadenceTxns };
  const e2eSafe = ss.SafeSpendEngine.calculate(e2eData, D("2026-06-10"));
  t.ok(e2eSafe.soonBills.length > 0, "end-to-end: detected bills surface in SafeSpend's soon-due window");
  t.ok(Number.isFinite(e2eSafe.safeAmount) && e2eSafe.safeAmount >= 0, "end-to-end: safeAmount finite + non-negative");

  // ── Sprint Z3 #10: multi-bank retention (pure retainAccounts / retainLiabilities) ────────────────
  const mb = await import("../src/lib/multibank.js");
  const acct = (id, _item, institution = "Bank") => ({ id, _item, institution, name: id, type: "checking", balance: 100 });

  // (1) single bank failing → keep its prior accounts; refreshed-this-round wins
  {
    const prev = [acct("a1", "itemA"), acct("a2", "itemB")];
    const fresh = [acct("a1", "itemA")];            // itemA refreshed; itemB failed
    const failed = new Set(["itemB"]);
    const kept = mb.retainAccounts(prev, fresh, failed, failed.size === 0);
    t.eq(kept.map(a => a.id).join(","), "a2", "#10 retain: failed bank's account (a2) kept; refreshed a1 falls to fresh");
  }
  // (2) all banks fail → keep ALL prior (no data loss)
  {
    const prev = [acct("a1", "itemA"), acct("a2", "itemB")];
    const failed = new Set(["itemA", "itemB"]);
    const kept = mb.retainAccounts(prev, [], failed, failed.size === 0);
    t.eq(kept.length, 2, "#10 retain: ALL banks fail → keep every prior account (no data loss)");
  }
  // (3) legacy unstamped account on a CLEAN refresh → drop Plaid-shaped, keep Manual/Statement
  {
    const prev = [acct("legacy", null, "Royal Bank"), acct("stmt", null, "Statement"), acct("manual", null, "Manual")];
    const kept = mb.retainAccounts(prev, [], new Set(), true); // clean refresh, nothing returned
    t.eq(kept.map(a => a.id).sort().join(","), "manual,stmt", "#10 retain: clean refresh drops legacy Plaid acct, keeps Manual/Statement");
    t.eq(mb.retainAccounts([acct("legacy", null, "Royal Bank")], [], new Set(["itemX"]), false).length, 1, "#10 retain: legacy Plaid acct kept when refresh was NOT clean");
  }
  // (4) paid-off loan on an AVAILABLE bank → dropped; loan on an UNAVAILABLE bank → kept
  {
    const empty = { credit: [], mortgage: [], student: [] };
    const offA = mb.retainLiabilities({ ...empty, mortgage: [{ account_id: "m1", balance: 0 }] }, empty, new Map([["m1", "itemA"]]), new Set(["itemA"]));
    t.eq(offA.mortgage.length, 0, "#10 retain liab: paid-off loan on an AVAILABLE bank → dropped");
    const downB = mb.retainLiabilities({ ...empty, mortgage: [{ account_id: "m1", balance: 5000 }] }, empty, new Map([["m1", "itemB"]]), new Set(["itemA"]));
    t.eq(downB.mortgage.length, 1, "#10 retain liab: loan on an UNAVAILABLE bank (itemB) → kept");
  }
  // (5) manual debt + Plaid debt of the same name → BOTH preserved (dedupe by account_id, #8)
  {
    const nw = fc.FinancialCalcEngine.netWorth({
      accounts: [{ id: "acc1", type: "credit", balance: "-500", currency: "CAD" }],
      debts: [{ name: "Visa", fromBank: true, account_id: "acc1", balance: "500" }, { name: "Visa", balance: "300" }],
    });
    t.eq(nw.liabilities, 800, "#10/#8 manual Visa ($300) + Plaid Visa ($500 via account) BOTH counted");
  }

  // ── Sprint Z3 Phase D #2: PENDING txns excluded from bill detection ───────────────────────────────
  {
    // a pending occurrence + a single posted occurrence must NOT yet create a recurring bill
    const pendThenPost = pipeline([
      { id: "nf_pend", date: "2026-05-22", name: "Netflix", amount: 18.99, category: "ENTERTAINMENT", account_id: "a1", pending: true },
      { id: "nf_post", date: "2026-06-22", name: "Netflix", amount: 18.99, category: "ENTERTAINMENT", account_id: "a1", pending: false },
    ]);
    const billsPend = pn.detectRecurringBills(pendThenPost);
    t.eq(billsPend.filter(b => b.name.toLowerCase().includes("netflix")).length, 0, "#2 pending: pending + 1 posted Netflix → NO bill (pending excluded, only 1 posted occurrence)");

    // two POSTED occurrences DO create the bill — the filter must not break normal detection
    const twoPosted = pipeline([
      { id: "nf_p1", date: "2026-05-22", name: "Netflix", amount: 18.99, category: "ENTERTAINMENT", account_id: "a1", pending: false },
      { id: "nf_p2", date: "2026-06-22", name: "Netflix", amount: 18.99, category: "ENTERTAINMENT", account_id: "a1", pending: false },
    ]);
    const billsPosted = pn.detectRecurringBills(twoPosted);
    t.eq(billsPosted.filter(b => b.name.toLowerCase().includes("netflix")).length, 1, "#2 pending: two POSTED Netflix occurrences DO create the recurring bill");
  }

  return t.summary("pipeline.test");
})().catch(e => { console.error("pipeline.test crashed:", e); process.exitCode = 1; });
