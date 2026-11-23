// tests/plusNew01.test.cjs
// -----------------------------------------------------------------------------
// PLUS-NEW-01 (High; ChatGPT and Grok, confirmed by Amanda in the code, 2026-11-23). The real-world proof fixed the
// as-of line for a round where the SERVER answered "unavailable" with plus_mode. It did not cover a refresh call that
// fails OUTRIGHT (no answer at all: offline, a 502, a timeout): then mergeHoldings marks what this device held for the
// bank (marked: true) but nothing in the round says Plus (plusMode stays false), and the app's sync applied a round
// only inside `if (plusMode)`. So a one-bank Plus person whose refresh failed outright never saw "We couldn't reach
// this bank just now. These holdings are from {date}."
// The rule now (Amanda's brief):
//   - a marked-only round (marked, not plusMode) reaches the Plus display ONLY for an account this device knows is in
//     Plus mode (told Plus is on, or holding this account's private holdings). Never for a Plus-off household: there
//     the kept holdings are the shared ones, and nothing changes;
//   - the signed-in user check and the locked-round protection stay; stale is never counted as fresh (nothing is
//     saved with a time); the household's shared copy is never cleared on this path.
// 1-3 run the app's own round code (src/App.jsx applyHoldingsRound, bundled with its real modules), 4 the rules.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const { loadApp, textOf, describe } = require("./_renderApp.cjs");

const ME = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const ITEM = "item-only-bank";
const AS_OF = Date.parse("2026-11-20T15:00:00.000Z");
const h = (id, value) => ({ id, account_id: "acc-tfsa", name: id, ticker: id.toUpperCase(), quantity: 1, value, currency: "CAD", _item: ITEM, _at: AS_OF });
const ACCOUNTS = [{ id: "acc-tfsa", name: "My TFSA", type: "investment", subtype: "tfsa", balance: 300, currency: "CAD", _item: ITEM }];
const ITEMS = [{ item_id: ITEM }];
const FAILED = [{ status: "rejected", reason: new Error("fetch failed") }];
const LIST = { mine: { entries: [], shared_accounts: [] }, partner: null };
const plusOn = { status: 200, body: { enabled: true, plus: true, covered_by: null, manage: "stripe", min_client: "1.1.8" } };
const plusOff = { status: 404, body: { error: "not_found" } };
const locked = { status: 200, body: { enabled: true, plus: false, covered_by: null, manage: null, min_client: "1.1.8" } };

(async () => {
  const t = create();
  let A;
  const NAMES = ["NetWorthPlusScreen", "C", "setPlusUser", "setPlusAnswer", "getNetWorthState", "savePrivateHoldings", "loadPrivateHoldings"];
  try { A = loadApp(["applyHoldingsRound", ...NAMES]); }
  catch (e) {
    // Before the fix there is no applyHoldingsRound in src/App.jsx: the rest is still bundled, so every check below runs
    // and fails for what it is.
    try { A = loadApp(NAMES); } catch (e2) { t.ok(false, `the app bundles: ${describe(e2)}`); process.exit(t.summary("plusNew01") ? 1 : 0); }
  }
  A.PLUS_HOLDINGS_KEY = "flourish_plus_holdings";
  const store = globalThis.localStorage;
  const fresh = () => { for (const k of [...A.store.keys()]) A.store.delete(k); A.setPlusUser(null); };
  const appData = (inv = []) => ({ profile: { country: "CA" }, accounts: ACCOUNTS, investments: inv });
  const setAppDataSpy = () => { const calls = []; const fn = (f) => { calls.push(typeof f === "function" ? f(appData([h("shared-1", 999)])) : f); }; fn.calls = calls; return fn; };
  const asOfText = (holdings) => textOf(A.render(A.h(A.NetWorthPlusScreen, { data: appData(), holdings, list: LIST, ownerOf: (a) => (a && a._item === ITEM ? "me" : null), C: A.C, onSaveEntry: async () => true, onDeleteEntry: async () => true, onShareAccount: async () => true })));
  const LINE = "We couldn't reach this bank just now. These holdings are from November 20, 2026.";
  const apply = typeof A.applyHoldingsRound === "function" ? A.applyHoldingsRound : () => { throw new Error("applyHoldingsRound is not in src/App.jsx"); };
  const safe = (fn) => { try { return fn(); } catch (e) { return `THREW ${String(e && e.message).slice(0, 80)}`; } };

  // ── 1. One bank, Plus on, private holdings saved on this device, the refresh call fails outright ──────────────
  {
    fresh();
    A.setPlusUser(ME);
    t.eq(A.savePrivateHoldings(store, ME, [h("vfv", 200), h("xeqt", 100)], AS_OF), true, "1a setup: this account's private holdings are saved on this device");
    A.setPlusAnswer(plusOn, store, ME);
    t.eq([A.getNetWorthState().mode, A.getNetWorthState().holdings.length], ["plus", 2], "1b setup: the server said Plus is on; the page holds the 2 private holdings");
    const before = A.store.get(A.PLUS_HOLDINGS_KEY);
    const setAppData = setAppDataSpy();
    const merged = safe(() => apply(FAILED, ITEMS, ME, setAppData));
    t.eq(merged && [merged.marked, merged.plusMode, merged.delivered, merged.stale], [true, false, false, false], "1c the round: the call failed outright, so it is marked, and nothing in it says Plus (plusMode false)");
    const shown = A.getNetWorthState().holdings;
    t.ok(merged && shown === merged.holdings && shown.length === 2 && shown.every((x) => x._stale === true && x._at === AS_OF), "1d setPlusHoldings was called with the marked holdings (it was not: the round was dropped)");
    t.ok(asOfText(shown).includes(LINE), "1e and the Plus net worth screen shows the as-of line under that account's holdings");
    t.eq(A.store.get(A.PLUS_HOLDINGS_KEY), before, "1f stale is never counted as fresh: nothing on the device changed (no new time, no marks saved)");
    t.eq(setAppData.calls.length, 0, "1g the household's shared copy is never touched on this path");
  }
  // ── 2. The same failure for a Plus-off household: nothing changes ─────────────────────────────────────────────
  {
    fresh();
    A.setPlusUser(ME);
    A.setPlusAnswer(plusOff, store, ME);
    t.eq(A.getNetWorthState().mode, "today", "2a setup: Plus is off (the server answers 404)");
    const setAppData = setAppDataSpy();
    const merged = safe(() => apply(FAILED, ITEMS, ME, setAppData));
    t.eq([A.getNetWorthState().holdings.length, setAppData.calls.length], [0, 0], "2b Plus off, the same failed call: no holdings are put on the Plus screen and the household's data is not touched");
    t.eq(merged && merged.marked, false, "2c (nothing private was held for this account, so there was nothing to mark)");
    // A Plus-off household on a device that still has an old private copy (Plus ended, or another visit): still nothing.
    fresh();
    A.setPlusUser(ME);
    A.savePrivateHoldings(store, ME, [h("vfv", 200)], AS_OF);
    A.setPlusAnswer(plusOff, store, ME);
    const setAppData2 = setAppDataSpy();
    const merged2 = safe(() => apply(FAILED, ITEMS, ME, setAppData2));
    t.eq([merged2 && merged2.marked, A.getNetWorthState().holdings.length, setAppData2.calls.length], [true, 0, 0], "2d Plus off with an old private copy on the device: the round is marked, but nothing reaches the Plus screen and nothing else changes");
  }
  // ── 3. The guards that stay ───────────────────────────────────────────────────────────────────────────────────
  {
    fresh(); A.setPlusUser(ME); A.savePrivateHoldings(store, ME, [h("vfv", 200)], AS_OF); A.setPlusAnswer(locked, store, ME);
    safe(() => apply(FAILED, ITEMS, ME, setAppDataSpy()));
    t.eq([A.getNetWorthState().mode, A.getNetWorthState().holdings.length], ["locked", 0], "3a Plus ended (locked): nothing is shown");
    fresh(); A.setPlusUser(ME); A.savePrivateHoldings(store, ME, [h("vfv", 200)], AS_OF); A.setPlusAnswer(plusOn, store, ME);
    const heldBefore = A.getNetWorthState().holdings;
    A.setPlusUser(OTHER);                                         // another account signed in while the call was out
    safe(() => apply(FAILED, ITEMS, ME, setAppDataSpy()));
    t.eq([A.getNetWorthState().user, A.getNetWorthState().holdings.length], [OTHER, 0], "3b the round was for someone no longer signed in: dropped");
    t.ok(heldBefore.length === 1, "3c (setup check: the first account held its holdings)");
    fresh(); A.setPlusUser(ME); A.savePrivateHoldings(store, ME, [h("vfv", 200)], AS_OF); A.setPlusAnswer(plusOn, store, ME);
    const two = [{ item_id: ITEM }, { item_id: "item-locked" }];
    const lockedRound = [FAILED[0], { status: "fulfilled", value: { holdings: [], locked: true, plus_mode: true } }];
    const m3 = safe(() => apply(lockedRound, two, ME, setAppDataSpy()));
    t.ok(m3 && m3.locked === true && A.getNetWorthState().holdings.every((x) => x._stale !== true), "3d a round with a locked answer changes nothing (the locked-round protection stays)");
  }
  // ── 4. The rules themselves ───────────────────────────────────────────────────────────────────────────────────
  {
    const H = await import("../src/lib/plusHoldings.js");
    const N = await import("../src/lib/netWorthAccess.js");
    t.eq([typeof H.markedRoundShows, typeof N.plusKnownFor], ["function", "function"], "4a the two rules exist: markedRoundShows (plusHoldings) and plusKnownFor (netWorthAccess)");
    if (typeof H.markedRoundShows === "function") {
      const m = (o) => ({ holdings: [], plain: [], plainAnswered: [], plusMode: false, delivered: false, stale: false, marked: true, locked: false, banks: [], ...o });
      const ok = { forUser: ME, signedIn: ME, knownPlus: true };
      t.eq(H.markedRoundShows(m({}), ok), true, "4b marked only, a known Plus account, still signed in: shown");
      t.eq([H.markedRoundShows(m({}), { ...ok, knownPlus: false }), H.markedRoundShows(m({}), { ...ok, signedIn: OTHER }), H.markedRoundShows(m({}), { ...ok, forUser: null, signedIn: null })], [false, false, false], "4c not known to be Plus, another account, or nobody: never");
      t.eq([H.markedRoundShows(m({ marked: false }), ok), H.markedRoundShows(m({ plusMode: true }), ok), H.markedRoundShows(m({ locked: true }), ok), H.markedRoundShows(m({ delivered: true }), ok), H.markedRoundShows(m({ stale: true }), ok), H.markedRoundShows(m({ plainAnswered: [ITEM] }), ok), H.markedRoundShows(null, ok)],
        [false, false, false, false, false, false, false], "4d nothing marked, a Plus round (its own path), a locked answer, a live or server-kept answer, a bank that answered without Plus, or no round: never this path");
    }
    if (typeof N.plusKnownFor === "function") {
      const mem = new Map(); const st = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
      N.setPlusUser(ME, st);
      t.eq(N.plusKnownFor(ME, st), false, "4e not told anything yet (pending, nothing saved): not known");
      st.setItem(N.NW_MODE_KEY, "plus");
      t.eq(N.plusKnownFor(ME, st), true, "4f pending, and this device's saved answer for this account is plus: known");
      N.setPlusAnswer({ status: 200, body: { enabled: true, plus: true, min_client: "1.1.8" } }, st, ME);
      t.eq([N.plusKnownFor(ME, st), N.plusKnownFor(OTHER, st), N.plusKnownFor(null, st)], [true, false, false], "4g told Plus is on: known, for this account only");
      N.setPlusAnswer({ status: 404 }, st, ME);
      t.eq(N.plusKnownFor(ME, st), false, "4h Plus off (today): never known, whatever the device holds");
      N.setPlusAnswer({ status: 200, body: { enabled: true, plus: false, min_client: "1.1.8" } }, st, ME);
      t.eq(N.plusKnownFor(ME, st), false, "4i locked: not known");
    }
  }
  process.exit(t.summary("plusNew01") ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
