// tests/plusReviewApp.test.cjs
// -----------------------------------------------------------------------------
// THE APP'S HALF OF THE 1.1.8 CODE REVIEW (2026-11-22: ChatGPT, Grok and Gemini on plus-1.1.8 at cdb50f0).
//   1  B4  one person's private net worth never shows to the next person on the same running app
//   2  B1  Plus holdings have a copy of their own on this device, for this account; a failed fetch blanks nothing, and
//          the old shared copy is cleared only once that private copy is safely saved
//   3  H8  a person whose last answer was "plus" keeps it through a check that did not get through
//   4  M4  a new entry carries an id of its own, so a second tap after a lost answer is the same entry
//   5  M5  a bank linked later in the session is counted: who linked it is refreshed with the sync
//   6  Gemini low (NOT REAL): a holding always has an id, so a row's key is never its place in the list
// -----------------------------------------------------------------------------
"use strict";
const fs = require("fs");
const path = require("path");
const { create } = require("./_runner.cjs");

const REPO = path.join(__dirname, "..");
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); }, m }; };
const broken = { getItem() { throw new Error("private window"); }, setItem() { throw new Error("private window"); }, removeItem() { throw new Error("private window"); } };
const deaf = { getItem: () => null, setItem: () => {}, removeItem: () => {} };   // takes a write and keeps nothing
// A call that may not exist yet (before the fix) is a failed check, never a crash that hides the others.
const safe = (fn) => { try { return fn(); } catch (e) { return `THREW ${String(e && e.message).slice(0, 60)}`; } };

(async () => {
  const t = create();
  const X = await import("../src/lib/netWorthAccess.js");
  const N = await import("../src/lib/netWorthPlus.js");
  let H = {};
  try { H = await import("../src/lib/plusHoldings.js"); } catch { H = {}; }
  const app = fs.readFileSync(path.join(REPO, "src", "App.jsx"), "utf8");
  const screen = fs.readFileSync(path.join(REPO, "src", "NetWorthPlusScreen.jsx"), "utf8");
  const plaid = fs.readFileSync(path.join(REPO, "netlify", "functions", "plaid.js"), "utf8");

  const PLUS = { status: 200, body: { enabled: true, plus: true } };
  const LOCKED = { status: 200, body: { enabled: true, plus: false } };
  const GONE = [null, { status: 500, body: null }, { status: 502, body: null }, { status: 503, body: null }, { status: 504, body: null }, { status: 401, body: { error: "unauthorized" } }, { status: 429, body: {} }];
  const LIST_A = { mine: { entries: [{ id: "e-a", kind: "home", label: "A's home", value_cents: 50000000, currency: "CAD", shared: false, entered_at: "2026-11-01T00:00:00Z" }], shared_accounts: [] }, partner: null };
  const HOLD_A = [{ id: "acc-a_sec1", account_id: "acc-a", name: "A Fund", value: 1234, currency: "CAD", _item: "item-a" }];
  const view = () => { const s = X.getNetWorthState(); return [s.mode, s.holdings.length, s.list === undefined ? "none" : "list", Object.keys(s.owners).length, s.answer === undefined ? "none" : "answer", s.user === undefined ? "no-user-field" : s.user]; };

  // ── 1. B4: THE NEXT PERSON ON THE SAME RUNNING APP ─────────────────────────────────────────────────────────
  {
    const asA = (s) => { X._resetForTests(); safe(() => X.setPlusUser(A, s)); X.setPlusAnswer(PLUS, s); X.setNetWorthList(LIST_A, A, s); X.setPlusHoldings(HOLD_A, A); X.setItemOwners([{ item_id: "item-a" }], A, s); };
    let s = mem(); asA(s);
    t.eq(view(), ["plus", 1, "list", 1, "answer", A], "1a person A, with Plus: their own list, holdings and banks are held");
    safe(() => X.setPlusUser(B, s));
    t.eq(view(), ["pending", 0, "none", 0, "none", B], "1b person B signs in on the same running app: nothing of A's is left, and nothing shows until B's own answer");
    safe(() => X.setNetWorthList(LIST_A, A, s)); safe(() => X.setPlusHoldings(HOLD_A, A)); safe(() => X.setItemOwners([{ item_id: "item-a" }], A, s)); const late = safe(() => X.setPlusAnswer(PLUS, s, A));
    t.eq([view(), late], [["pending", 0, "none", 0, "none", B], "pending"], "1c an answer for A that arrives after the switch is dropped: the list, the holdings, the banks and the plan answer alike");
    t.eq([s.getItem(X.NW_MODE_KEY), s.getItem(X.NW_TOLD_KEY), s.getItem(X.NW_USER_KEY)], [null, null, B], "1d what this device had saved about A's plan is gone, and the saved answer now belongs to B");
    t.eq(GONE.map((r) => { const d = mem(); asA(d); safe(() => X.setPlusUser(B, d)); return X.setPlusAnswer(r, d); }), Array(GONE.length).fill("today"),
      "1e B's first check does not get through: B is never shown Plus from A's saved answer");
    s = mem(); asA(s); safe(() => X.setPlusUser(null, s));
    t.eq([view(), s.getItem(X.NW_MODE_KEY), s.getItem(X.NW_USER_KEY)], [["pending", 0, "none", 0, "none", null], "plus", A], "1f signed out: nothing is held in the page, and the saved answer stays for the same person");
    safe(() => X.setPlusUser(A, s));
    t.eq([X.setPlusAnswer(null, s), s.getItem(X.NW_USER_KEY)], ["plus", A], "1g the same person signs back in offline: their last answer is kept, as before");
    s = mem(); asA(s); safe(() => H.savePrivateHoldings(s, A, HOLD_A)); safe(() => X.setPlusUser(B, s)); X.setPlusAnswer(PLUS, s);
    t.eq([view(), s.m.has(H.PLUS_HOLDINGS_KEY)], [["plus", 0, "none", 0, "answer", B], false], "1h B has Plus too: A's copy on this device is never loaded for B, and it is gone from the device");
    t.ok(/^import \{[^}]*\buseLayoutEffect\b[^}]*\} from "react";/m.test(app) && /useLayoutEffect\(\(\)=>\{ setPlusUser\(user\?\.id \|\| null\); \},\[user\?\.id\]\);/.test(app)
      && app.indexOf("setPlusUser(user?.id || null)") < app.indexOf("const res = await askPlusStatus({ apiBase: API_BASE, jwt });") && app.indexOf("setPlusUser(user?.id || null)") > 0,
      "1i the app names the signed-in account before anything is painted, and before the plan is asked");
    const take = app.slice(app.indexOf("const takePlusAnswer = useCallback("), app.indexOf("// BUYING FLOURISH PLUS", app.indexOf("const takePlusAnswer = useCallback(")));
    t.ok(/const mode = setPlusAnswer\(res, undefined, forUser\);/.test(take) && /setNetWorthList\(l\.body, forUser\)/.test(take) && /setItemOwners\(items, forUser\)/.test(take) && /\},\[user\?\.id\]\);/.test(take),
      "1j every answer the app takes says whose it is");
    const callAt = app.indexOf("const nwCall = async (action, params) => {");
    const goals = app.slice(callAt, app.indexOf("// manual-balances: the account whose entered balance", callAt));
    t.ok(/const forUser = getNetWorthState\(\)\.user;/.test(goals) && (goals.match(/setNetWorthList\((l|r)\.body, forUser\)/g) || []).length === 2 && !/setNetWorthList\((l|r)\.body\)/.test(app),
      "1k …and so does the Net Worth tab when it reads the list again");
    X._resetForTests();
  }

  // ── 2. B1: PLUS HOLDINGS ON THIS DEVICE, AND THE OLD SHARED COPY ─────────────────────────────────────────────
  {
    const items = [{ item_id: "i1" }, { item_id: "i2" }];
    const prev = [{ id: "a_s", value: 10, _item: "i1" }, { id: "b_s", value: 20, _item: "i2" }, { id: "gone", value: 5, _item: "i9" }];
    const ok = (holdings, extra = {}) => ({ status: "fulfilled", value: { holdings, plus_mode: true, ...extra } });
    const ids = (m) => (m && Array.isArray(m.holdings) ? m.holdings.map((h) => `${h.id}@${h._item}`) : m);
    const merge = (...a) => safe(() => H.mergeHoldings(...a));
    let m = merge(prev, items, [ok([{ id: "a2", value: 11 }]), { status: "rejected", reason: new Error("offline") }]);
    t.eq([ids(m), m.delivered, m.plusMode, m.locked], [["a2@i1", "b_s@i2"], true, true, false], "2a one bank answers and one fails: the first is replaced, the second keeps what it had, a bank no longer connected is dropped");
    m = merge(prev, items, [ok([], { unavailable: true }), ok([], { unavailable: true })]);
    t.eq([ids(m), m.delivered, m.plusMode], [["a_s@i1", "b_s@i2"], false, true], "2b the server says it could not get them (unavailable): nothing is blanked");
    m = merge(prev, items, [ok([], { locked: true }), ok([], { locked: true, update_required: true })]);
    t.eq([ids(m), m.delivered, m.locked], [["a_s@i1", "b_s@i2"], false, true], "2c a locked answer (no Plus, or an update is needed): nothing delivered, nothing changed");
    m = merge(prev, items, [ok([]), ok([{ id: "b3", value: 1 }])]);
    t.eq([ids(m), m.delivered], [["b3@i2"], true], "2d a bank that really holds nothing now: its holdings go, on the server's word");
    m = merge(prev, items, [{ status: "fulfilled", value: { holdings: [{ id: "x", value: 3 }] } }, { status: "fulfilled", value: { holdings: [] } }]);
    t.eq([m.plusMode, m.delivered, m.plain], [false, false, [{ id: "x", value: 3 }]], "2e Plus off: not Plus's answer at all, and the holdings come as they are (today's path)");
    m = merge([], items, [{ status: "fulfilled", value: null }, { status: "fulfilled", value: { holdings: "no", plus_mode: true } }]);
    t.eq([ids(m), m.delivered, m.plusMode], [[], false, false], "2f an answer that makes no sense delivers nothing");

    const s = mem();
    t.eq([safe(() => H.savePrivateHoldings(s, A, HOLD_A)), safe(() => H.loadPrivateHoldings(s, A)), safe(() => H.loadPrivateHoldings(s, B)), safe(() => H.loadPrivateHoldings(s, null)), safe(() => H.loadPrivateHoldings(null, A)), safe(() => H.loadPrivateHoldings(broken, A))],
      [true, HOLD_A, [], [], [], []], "2g the copy is saved for one account and loaded only for that account");
    t.eq([safe(() => H.savePrivateHoldings(broken, A, HOLD_A)), safe(() => H.savePrivateHoldings(deaf, A, HOLD_A)), safe(() => H.savePrivateHoldings(null, A, HOLD_A)), safe(() => H.savePrivateHoldings(s, null, HOLD_A))], [false, false, false, false],
      "2h a device that cannot keep it says so (the write is read back), so the old copy is not cleared on a hope");
    t.eq([s.m.size, s.m.has(H.PLUS_HOLDINGS_KEY), H.PLUS_HOLDINGS_KEY], [1, true, "flourish_plus_holdings"], "2i one key, cleared with the rest at sign-out (it starts flourish_)");
    safe(() => H.savePrivateHoldings(s, B, [{ id: "b-only", _item: "ib" }]));
    t.eq([safe(() => H.loadPrivateHoldings(s, A)), safe(() => H.loadPrivateHoldings(s, B)).length], [[], 1], "2j another account saving on this device replaces the copy: never two people's at once");

    // a reload, offline, or a failed check: the copy is what the screen shows
    const d = mem();
    X._resetForTests(); safe(() => X.setPlusUser(A, d)); X.setPlusAnswer(PLUS, d); safe(() => H.savePrivateHoldings(d, A, HOLD_A)); X.setNetWorthList(LIST_A, A, d); X.setItemOwners([{ item_id: "item-a" }], A, d);
    X._resetForTests(); safe(() => X.setPlusUser(A, d)); X.setPlusAnswer(PLUS, d);
    t.eq([X.getNetWorthState().holdings, X.getNetWorthState().list, X.getNetWorthState().owners], [HOLD_A, LIST_A, { "item-a": "me" }], "2k after a reload, a person with Plus has their holdings, their list and their banks before anything is fetched");
    t.eq(GONE.map((r) => { X._resetForTests(); safe(() => X.setPlusUser(A, d)); return [X.setPlusAnswer(r, d), X.getNetWorthState().holdings.length, !!X.getNetWorthState().list]; }), Array(GONE.length).fill(["plus", 1, true]),
      "2l …and when the check does not get through, too");
    X._resetForTests(); safe(() => X.setPlusUser(A, d)); X.setPlusAnswer(LOCKED, d);
    t.eq([X.getNetWorthState().holdings.length, safe(() => H.loadPrivateHoldings(d, A)).length], [0, 1], "2m Plus ended: nothing is shown, and the copy on the device is left alone");
    X._resetForTests();

    const sync = app.slice(app.indexOf("const syncHoldings = useCallback("), app.indexOf("const takePlusAnswer = useCallback("));
    t.ok(sync.length > 200 && /callPlaid\("get_investments",\{item_id:it\.item_id, \.\.\.plusClientFields\(\)\}, \{jwt\}\)/.test(sync) && /const merged = mergeHoldings\(/.test(sync), "2n one holdings sync, used at first load and when Plus is confirmed");
    t.ok(/if \(plusMode\) \{[\s\S]{0,400}if \(!merged\.delivered \|\| getNetWorthState\(\)\.user !== forUser\) return;\s+setPlusHoldings\(allHoldings\);/.test(sync),
      "2o with Plus: a locked or failed answer changes nothing at all, and an answer for someone else is dropped");
    t.ok(/if \(savePrivateHoldings\(deviceStore\(\), forUser, allHoldings\)\) setAppData\(prev => \(prev && "investments" in prev\) \? \(\(\{ investments, \.\.\.rest \}\) => rest\)\(prev\) : prev\);/.test(sync)
      && (app.match(/investments, \.\.\.rest/g) || []).length === 1, "2p the old shared copy is cleared in one place only, and only after the private copy is saved and read back");
    t.ok(/\} else if \(allHoldings\.length > 0\) \{\s+setAppData\(prev => \(\{ \.\.\.prev, investments: allHoldings \}\)\);/.test(sync) && (app.match(/investments: allHoldings/g) || []).length === 1,
      "2q Plus off: exactly as today, and Plus holdings are never written into the shared data");
    const take = app.slice(app.indexOf("const takePlusAnswer = useCallback("), app.indexOf("// BUYING FLOURISH PLUS", app.indexOf("const takePlusAnswer = useCallback(")));
    t.ok(/if\(mode === "plus"\)\{[\s\S]{0,1200}if\(!isCancelled\(\) && holdingsStale\(deviceStore\(\), forUser\)\) syncHoldings\(items, jwt, forUser\);/.test(take),
      "2r with Plus the holdings are fetched when the plan is confirmed (before: only on the first load after a bank was connected), at most every 30 minutes");
    t.eq([safe(() => H.holdingsStale(mem(), A)), safe(() => { const z = mem(); H.savePrivateHoldings(z, A, HOLD_A, 1000); return [H.holdingsStale(z, A, 1000 + H.HOLDINGS_REFRESH_MS - 1), H.holdingsStale(z, A, 1000 + H.HOLDINGS_REFRESH_MS), H.holdingsStale(z, B, 1001)]; }), H.HOLDINGS_REFRESH_MS],
      [true, [false, true, true], 30 * 60 * 1000], "2s never fetched, 30 minutes old, or another account's: fetch; fresher than that: not again");
  }

  // ── 3. H8: A PERSON WITH PLUS KEEPS THEIR FIGURE THROUGH A CHECK THAT DID NOT GET THROUGH ────────────────────
  {
    const FAILED = [...GONE, { status: 503, body: { error: "status_unavailable" } }];
    t.eq(FAILED.map((r) => X.netWorthMode(r, "plus")), Array(FAILED.length).fill("plus"), "3a last answer 'plus', and no answer or a failed one (the server's own 503 too): still 'plus'");
    t.eq(FAILED.map((r) => { X._resetForTests(); const s = mem(); X.setPlusAnswer(PLUS, s); return [X.setPlusAnswer(r, s), s.getItem(X.NW_MODE_KEY)]; }), Array(FAILED.length).fill(["plus", "plus"]), "3b …through the store every screen reads, and the saved answer is untouched");
    t.eq([X.netWorthMode({ status: 404 }, "plus"), X.netWorthMode({ status: 400, body: { error: "unknown_action" } }, "plus"), X.netWorthMode(LOCKED, "plus"), X.netWorthMode({ status: 200, body: {} }, "plus"), X.netWorthMode({ status: 200, body: { enabled: true, plus: true, min_client: "9.9.9" } }, "plus")],
      ["today", "today", "locked", "unavailable", "unavailable"], "3c only a real answer changes it: Plus off, no Plus, or an answer this app cannot use");
    t.eq(FAILED.map((r) => { X._resetForTests(); const s = mem(); X.setPlusAnswer(LOCKED, s); return X.setPlusAnswer(r, s); }), Array(FAILED.length).fill("unavailable"), "3d a household told it has no Plus still never gets a figure from a failed check");
    t.eq([X.netWorthMode(null), X.netWorthMode({ status: 503 }), X.netWorthMode(null, "today"), X.netWorthMode(null, "locked"), X.netWorthMode({ status: 502 }, "today")], ["unavailable", "unavailable", "today", "unavailable", "unavailable"],
      "3e and nothing else moved: with no saved 'plus', every answer is as it was");
    X._resetForTests();
  }

  // ── 4. M4: A NEW ENTRY HAS AN ID OF ITS OWN ───────────────────────────────────────────────────────────
  {
    const a = safe(() => X.newEntryId()), b = safe(() => X.newEntryId()), c = safe(() => X.newEntryId(null)), d = safe(() => X.newEntryId({}));
    t.ok([a, b, c, d].every((v) => UUID.test(String(v))) && new Set([a, b, c, d]).size === 4, "4a every new entry gets an id the server accepts, on a device with no crypto too");
    t.ok(/import \{[^}]*\bnewEntryId\b[^}]*\} from "\.\/lib\/netWorthAccess\.js";/.test(screen) && /setDraft\(\{ client_id: newEntryId\(\), kind: "home",/.test(screen), "4b the id is made once, when the form opens");
    t.ok(/onSaveEntry\(\{ client_id: draft\.client_id, kind: draft\.kind,/.test(screen) && (screen.match(/newEntryId\(\)/g) || []).length === 1 && (screen.match(/setDraft\(\{ \.\.\.draft, /g) || []).length >= 4,
      "4c …and sent with every try of that form, so a second tap after a lost answer is the same entry");
  }

  // ── 5. M5: A BANK LINKED LATER IN THE SESSION IS COUNTED ────────────────────────────────────────────────
  {
    const data = { profile: { country: "CA" }, accounts: [{ id: "acc-old", _item: "i1", type: "depository", name: "Chequing", balance: 100, currency: "CAD" }, { id: "acc-new", _item: "i2", type: "depository", name: "Savings", balance: 50, currency: "CAD" }] };
    const list = { mine: { entries: [], shared_accounts: [] }, partner: null };
    const seen = () => { const v = N.viewerNetWorth({ data, holdings: [], list, ownerOf: X.ownerOfFrom(X.getNetWorthState().owners) }); return [v.mine.map((p) => p.id), v.totals ? v.totals.map((x) => x.netCents) : null]; };
    X._resetForTests(); X.setItemOwners([{ item_id: "i1" }]);
    t.eq(seen(), [["acc-old"], [10000]], "5a who linked the new bank is not known yet: its account is left out (it could be a partner's)");
    X.setItemOwners([{ item_id: "i1" }, { item_id: "i2" }]);
    t.eq(seen(), [["acc-old", "acc-new"], [15000]], "5b once the banks are read again it is counted");
    t.ok(/const items = await getUserItems\(\);\s+if\(getNetWorthState\(\)\.mode === "plus"\) setItemOwners\(items, getNetWorthState\(\)\.user\);\s+if\(items\.length === 0\) return;/.test(app),
      "5c the sync reads who linked each bank every time it reads the banks (before: only when the plan was asked)");
    X._resetForTests();
  }

  // ── 6. GEMINI LOW, NOT REAL: a holding always has an id ───────────────────────────────────────────────────
  {
    t.ok(/id:\s+h\.account_id \+ "_" \+ h\.security_id,/.test(plaid) && (plaid.match(/const holdings = \(data\.holdings \|\| \[\]\)/g) || []).length === 1 && (plaid.match(/"\/investments\/holdings\/get"/g) || []).length === 1, "6a the server gives every holding an id (its account and its security): the only place holdings are built");
    const v = N.viewerNetWorth({ data: { profile: { country: "CA" }, accounts: [{ id: "acc-i", type: "investment", subtype: "tfsa", name: "TFSA", balance: 300, currency: "CAD" }] },
      holdings: [{ id: "acc-i_s1", account_id: "acc-i", name: "Fund", value: 200, currency: "CAD" }, { id: "acc-i_s2", account_id: "acc-i", name: "Other", value: 100, currency: "CAD" }], list: { mine: { entries: [], shared_accounts: [] }, partner: null } });
    const hs = (v.household[0] && v.household[0].holdings) || (v.mine[0] && v.mine[0].holdings) || [];
    t.eq(hs.map((h) => h.id), ["acc-i_s1", "acc-i_s2"], "6b …and the screen's rows carry it, so `key={h.id || i}` is always the id");
  }

  t.summary("plusReviewApp.test");
})();
