// tests/balanceTruth.test.cjs
// -----------------------------------------------------------------------------
// MATH-LOCK: WHAT THE APP MAY SAY ABOUT A BANK BALANCE (balance-truth, 2026-11-06).
//
// The report: two households saw balances from a bank link whose sign-in had run out. Every refresh failed (Plaid's
// ITEM_LOGIN_REQUIRED), so the app showed the balances from the last time the bank answered and called them
// "Live · up to date"; the reconnect warning was only inside Settings; a bank window that closed from Settings said
// nothing; a new bank's history had no "loading" state; new transactions came in only once per app load; and a card's
// debt kept the balance it had on the day it was linked. Six fixes, each held here:
//   1  freshness: "live" only while every linked account's bank answered within the hour (lib/balanceTruth.js), and
//      every site that maps a bank's answer stamps the moment (bankAnsweredAt); Today says when, never "up to date"
//   2  a sign-in that has run out is recorded on the bank's row (plaid.js), listed (itemsNeedingSignIn), cleared by a
//      good answer, and shown on Today with its bank and the way to sign in again
//   3  a bank window that closes from Settings says why and what it means (linkExitMessage), for every exit
//   4  a new bank's first pull: plaid.js says how far it has got (update_status) and never fails on NOT_READY; the app
//      keeps "loading your history" up until it is done, and asks every 20 seconds
//   5  new transactions keep coming: the webhook's flag is listed and cleared, the refresh can be forced, and it runs
//      when the app comes back on screen
//   6  one card, from the bank: a card's debt takes the card's balance at every answer, and one debt per card
// The words were approved word for word on 2026-11-06 (ChatGPT and Grok agreed); section 7 pins each line.
// -----------------------------------------------------------------------------
"use strict";
const fs = require("fs");
const path = require("path");
const { create } = require("./_runner.cjs");
const { loadApp, textOf, describe } = require("./_renderApp.cjs");

const REPO = path.join(__dirname, "..");
const SUPA_PATH = require.resolve("@supabase/supabase-js", { paths: [path.join(REPO, "netlify", "functions")] });
const PLAID_PATH = require.resolve("../netlify/functions/plaid.js");
const AUTH_PATH = require.resolve("../netlify/functions/_lib/auth.js");

// A stand-in for the service-role client: every call is recorded, and `answer` decides what comes back.
function fakeSupabase(state) {
  state.calls = [];
  const from = (table) => {
    const q = { table, op: "select", cols: null, filters: [], payload: null };
    const done = (single) => {
      const call = { table, op: q.op, cols: q.cols, filters: q.filters.slice(), payload: q.payload, single };
      state.calls.push(call);
      return state.answer(call) || { data: single ? null : [], error: null };
    };
    const api = {
      select(cols) { if (q.op !== "update") q.cols = cols; return api; },
      update(obj) { q.op = "update"; q.payload = obj; return api; },
      upsert: async (rows) => { state.calls.push({ table, op: "upsert", rows }); return { data: null, error: null }; },
      delete() { q.op = "delete"; return api; },
      eq(k, v) { q.filters.push([k, v]); return api; },
      in(k, v) { q.filters.push([k, v]); return api; },
      order() { return api; },
      limit() { return api; },
      single: async () => done(true),
      maybeSingle: async () => done(true),
      then(res, rej) { return Promise.resolve(done(false)).then(res, rej); },
    };
    return api;
  };
  return { from, rpc: async () => ({ data: null, error: null }), auth: { admin: {} } };
}

// plaid.js's handler against the stand-in database and a stand-in Plaid (nothing leaves the machine).
async function server(action, body, { answer, plaid }) {
  const saved = { ...process.env };
  Object.assign(process.env, { SUPABASE_URL: "https://example.supabase.test", SUPABASE_SECRET_KEY: "test-service-role", PLAID_CLIENT_ID: "test-client", PLAID_SECRET: "test-secret", PLAID_ENV: "sandbox" });
  delete process.env.HOUSEHOLD_ENABLED;
  const state = { answer };
  require.cache[SUPA_PATH] = { id: SUPA_PATH, filename: SUPA_PATH, loaded: true, exports: { createClient: () => fakeSupabase(state) } };
  delete require.cache[AUTH_PATH]; delete require.cache[PLAID_PATH];
  const auth = require(AUTH_PATH);
  auth.getUserFromRequest = async () => ({ user_id: "u-owner", error: null });
  const handler = require(PLAID_PATH).handler;
  const realFetch = global.fetch; const plaidCalls = [];
  global.fetch = async (url, init) => {
    const u = String(url);
    if (!/plaid\.com/.test(u)) throw new Error("network blocked in test: " + u);
    const ep = u.replace(/^https:\/\/[^/]+/, ""); plaidCalls.push(ep);
    const [status, json] = plaid(ep, JSON.parse(init.body || "{}"));
    return { ok: status === 200, status, json: async () => json, text: async () => JSON.stringify(json) };
  };
  try {
    const res = await handler({ httpMethod: "POST", headers: { origin: "https://flourishmoney.app", authorization: "Bearer x" }, body: JSON.stringify({ action, ...body }) });
    return { status: res.statusCode, body: JSON.parse(res.body || "{}"), calls: state.calls, plaidCalls };
  } finally {
    global.fetch = realFetch; process.env = saved;
    delete require.cache[PLAID_PATH]; delete require.cache[AUTH_PATH]; delete require.cache[SUPA_PATH];
  }
}
const ok = (o) => [200, o];
const plaidError = (code) => [400, { error_code: code, error_type: "ITEM_ERROR", error_message: code.toLowerCase() }];
const itemRow = (status = "active") => ({ data: { access_token: "access-sandbox-test", status, next_cursor: null }, error: null });
const updates = (calls, table = "plaid_items") => calls.filter((c) => c.table === table && c.op === "update");

(async () => {
  const t = create();
  const BT = await import("../src/lib/balanceTruth.js");
  const BW = await import("../src/lib/balanceWords.js");
  const DS = await import("../src/lib/demoStatus.js");
  const W = (id, vars) => BW.balanceWords(id, vars);
  const NOW = Date.parse("2026-11-06T15:40:00-05:00");
  const MIN = 60000, HR = 3600000, DAY = 86400000;
  const iso = (ms) => new Date(ms).toISOString();
  const bank = (id, at, item = "item-scotia", extra = {}) => ({ id, name: id, type: "depository", subtype: "checking", institution: "Scotiabank", _item: item, balance: 779.25, ...(at == null ? {} : { bankAnsweredAt: iso(at) }), ...extra });

  // ── 1. Freshness: live only while the bank answered within the hour ─────────────────────────
  {
    t.eq(BT.LIVE_WINDOW_MS, HR, "1a the live window is one hour");
    const f = (accounts, signIn) => BT.bankFreshness({ accounts, nowMs: NOW, signIn });
    t.eq(f([bank("a", NOW - 59 * MIN)]).state, "live", "1b answered 59 minutes ago: live");
    t.eq(f([bank("a", NOW - 61 * MIN)]), { state: "stale", at: NOW - 61 * MIN }, "1c answered 61 minutes ago: stale, with when");
    t.eq(f([bank("a", NOW - 5 * MIN), bank("b", NOW - 8 * DAY, "item-2")]), { state: "stale", at: NOW - 8 * DAY }, "1d two banks: the oldest answer decides");
    t.eq(f([bank("a", null)]), { state: "unknown", at: null }, "1e an account with no answer on record (saved before this change): unknown, never live");
    t.eq(f([bank("a", NOW - 5 * MIN)], [{ item_id: "item-scotia" }]).state, "stale", "1f a fresh answer from a bank now needing a sign-in: not live");
    t.eq(f([{ id: "m1", institution: "Manual", balance: 10 }, { id: "s", institution: "Statement", balance: 5 }, { id: "e", institution: "TD", balanceEntered: true }]).state, "none",
      "1g typed, statement and entered balances are not bank balances: nothing to say about a bank");
    t.ok(BT.isBankAccount({ id: "old", institution: "TD Bank", balance: 1 }), "1h an older bank row with no item stamp still counts as a bank balance");
    t.eq(BT.whenText(NOW - 2 * HR, NOW), new Date(NOW - 2 * HR).toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit" }), "1i {when} today is the time");
    t.eq(BT.whenText(Date.parse("2026-10-30T12:00:00-04:00"), NOW), "Oct 30", "1j {when} on another day is the date");
    t.eq(BT.whenText(Date.parse("2025-12-30T12:00:00-05:00"), NOW), "Dec 30, 2025", "1k …with the year when it is not this year");
    t.eq(BT.lastUpdatedLine({ state: "stale", at: Date.parse("2026-10-30T12:00:00-04:00") }, NOW), "Last updated Oct 30", "1l the not-live line carries the date");
    t.eq(BT.lastUpdatedLine({ state: "unknown", at: null }, NOW), W("balance-last-updated-unknown"), "1m …or says it can't say when");
    const stamped = BT.stampBankAnswer([bank("a", null)], NOW);
    t.eq(stamped[0].bankAnsweredAt, iso(NOW), "1n stampBankAnswer stamps the moment the bank answered");
    // The Today chip, stamp and suffix over Amanda's case: Scotiabank last answered on Oct 30.
    const fresh = f([bank("chq", Date.parse("2026-10-30T12:00:00-04:00"))]);
    const chip = DS.statusChip({ demo: false, nowMs: NOW, bankConnected: true, freshness: fresh });
    t.ok(chip.stale && /Oct 30/.test(chip.label) && !/Live|up to date/.test(chip.label + chip.detail), `1o the chip says when ("${chip.label}"), not "Live · up to date"`);
    t.eq(DS.refreshStamp({ demo: false, bankConnected: true, isRefreshing: false, nowMs: NOW, freshness: fresh }), chip.label, "1p the stamp under the figure says the same, never \"updated today\"");
    t.eq(DS.heroFreshness({ demo: false, bankConnected: true, nowMs: NOW, freshness: fresh }).text, "", "1q and the figure has no \"· live\"");
    // Every site in App.jsx that turns a bank's answer into an account stamps the moment.
    const APP = fs.readFileSync(path.join(REPO, "src", "App.jsx"), "utf8");
    const mapSites = [...APP.matchAll(/balance:\s*normalizeAccountBalance\(a\)/g)].length;
    const stampedSites = [...APP.matchAll(/balance:\s*normalizeAccountBalance\(a\),\s*(?:\/\/[^\n]*\n\s*)?bankAnsweredAt:/g)].length;
    t.ok(mapSites >= 5 && stampedSites === mapSites, `1r every site that maps a bank's answer stamps bankAnsweredAt (${stampedSites} of ${mapSites})`);
    t.ok(/statusChip\(\{[^}]*freshness:bankFresh\}\)/.test(APP) && /heroFreshness\(\{[^}]*freshness:bankFresh/.test(APP) && /refreshStamp\(\{[^}]*freshness:bankFresh\}\)/.test(APP),
      "1s Today's chip, suffix and stamp are all given the bank freshness");
  }

  // ── Today, rendered (App.jsx bundled with react-dom/server) ───────────────────────────────────
  let A = null;
  try { A = loadApp(["Dashboard", "BankStatusCards", "HowWeGotThis", "SettingsSectionContent", "backgroundRefresh", "fetchItemTxns"]); } catch (e) { t.ok(false, `App.jsx bundles: ${describe(e)}`); }
  const noop = () => {};
  const render = (C, props) => { try { return textOf(A.render(A.h(C, props))); } catch (e) { return `render failed: ${describe(e)}`; } };
  const household = (accounts, bankStatus, extra = {}) => ({
    profile: { name: "Amanda", country: "CA", province: "ON" }, incomes: [{ id: "i", label: "Pay", amount: "2600", freq: "biweekly", nextPayDate: "2026-11-13", type: "employment" }],
    bills: [], transactions: [], debts: [], goals: [], accounts, bankConnected: true, ...(bankStatus ? { bankStatus } : {}), ...extra,
  });
  if (A) {
    const realNow = Date.now;
    Date.now = () => NOW;
    try {
      const home = (data, props = {}) => render(A.Dashboard, { data, setAppData: noop, setScreen: noop, setShowNotifs: noop, onUpgrade: noop, onWhatIf: noop, setGoalsTab: noop, ...props });
      const old = household([bank("chq", Date.parse("2026-10-30T12:00:00-04:00"))]);
      const T = home(old);
      t.ok(T.includes("Last updated Oct 30") && !/Live\s*·/.test(T) && !/up to date|updated today|· live/.test(T), "1t Today, last answer Oct 30: \"Last updated\" with the date, and no \"Live\" anywhere");
      const L = home(household([bank("chq", NOW - 2 * MIN)]));
      t.ok(/Live\s*·\s*updated 2m ago/.test(L) && /· live/.test(L), "1u Today, answered 2 minutes ago: Live, as before");

      // ── 2. The sign-in card on Today ─────────────────────────────────────────────────────────
      const signIn = [{ item_id: "item-scotia", bank: "Scotiabank", partner: false }];
      const S = home(household([bank("chq", Date.parse("2026-10-30T12:00:00-04:00"))], { signIn, history: [], fresh: BT.bankFreshness({ accounts: [bank("chq", Date.parse("2026-10-30T12:00:00-04:00"))], nowMs: NOW, signIn }) }), { onReconnectBank: noop });
      t.ok(S.includes("Scotiabank needs you to sign in again") && S.includes("Until then, its balances may be out of date and new transactions can't come in.") && S.includes("Sign in to Scotiabank"),
        "2a Today shows the card: Scotiabank needs a sign-in, what that means, and the button to sign in");
      const html = A.render(A.h(A.BankStatusCards, { status: { signIn, history: [] }, onReconnect: noop }));
      t.ok(/role="alert"/.test(html) && /data-bank-signin="item-scotia"/.test(html) && /<button/.test(html), "2b …as an alert, with a real button for that bank");
      const P = textOf(A.render(A.h(A.BankStatusCards, { status: { signIn: [{ item_id: "item-p", bank: "RBC", partner: true }], history: [] }, onReconnect: noop })));
      t.ok(P.includes("RBC needs your partner to sign in again") && !P.includes("Sign in to"), "2c a bank the partner linked: says so, and no button (only the linker can sign in to it)");
      t.eq(BT.itemsNeedingSignIn([{ item_id: "a", institution_name: "Scotiabank", status: "login_required" }, { item_id: "b", status: "error", linked_by: "partner" }, { item_id: "c", status: "active" }, { item_id: "d", status: "pending_expiration" }]),
        [{ item_id: "a", bank: "Scotiabank", partner: false }, { item_id: "b", bank: null, partner: true }], "2d list_items' rows: login_required and error need a sign-in; active and pending_expiration still answer");
      const how = render(A.HowWeGotThis, { title: "Safe to spend", value: "$1", inputs: [], onClose: noop, bankNotes: ["note one", "note two"] });
      t.ok(/note one/.test(how) && /note two/.test(how), "2e How we got this shows the bank notes it is given");
      const APP = fs.readFileSync(path.join(REPO, "src", "App.jsx"), "utf8");
      t.ok(/bankNotes=\{data\.demo\?\[\]:bankNotesFor\(bankStatus, bankFresh, Date\.now\(\)\)\}/.test(APP), "2f …and the safe-to-spend sheet passes when, the sign-in and the history (never in demo)");
      t.ok(/<Dashboard onReconnectBank=\{reconnectFromToday\}/.test(APP) && (APP.match(/<Dashboard onReconnectBank=\{reconnectFromToday\}/g) || []).length === 3,
        "2g every Today (phone, tablet, desktop) gets the reconnect action");
      t.ok(/const reconnectFromToday = \(itemId\)=> \{ reconnectTargetRef\.current = itemId \|\| null; setShowSettings\(true\); setPendingPlaid\("reconnect"\); \};/.test(APP),
        "2h Today's button opens the bank consent first (as every Plaid open does), for that bank");
      t.ok(/needsReconnect=\{needsReconnect\|\|bankSignIn\.some\(x=>!x\.partner\)\}/.test(APP), "2i Settings' own reconnect banner shows for it too");

      // ── 4 (rendered). History still coming ───────────────────────────────────────────────────
      const H = textOf(A.render(A.h(A.BankStatusCards, { status: { signIn: [], history: [{ item_id: "item-t", bank: "Tangerine", state: "loading" }, { item_id: "item-u", bank: "EQ Bank", state: "slow" }] } })));
      t.ok(H.includes("Loading your history from Tangerine…") && H.includes("Your balances are in. Up to 90 days of transactions can take a few minutes to arrive.") && H.includes("EQ Bank is still sending your history. flourish checks again each time you open it."),
        "4a Today: \"loading your history\" for a new bank, and the slow line after 10 minutes");
      t.eq(/needs you to sign in again|Loading your history/.test(render(A.Dashboard, { data: { ...household([bank("chq", NOW)], { signIn, history: [{ item_id: "x", bank: "X", state: "loading" }] }), demo: true }, setAppData: noop, setScreen: noop, setShowNotifs: noop, onUpgrade: noop, onWhatIf: noop, setGoalsTab: noop })), false,
        "4b never in demo");

      // ── 6 (rendered). Debts in Settings say live only when it is ─────────────────────────────
      const card = { id: "amex", name: "Scotiabank Gold Amex Card", type: "credit", subtype: "credit card", institution: "Scotiabank", _item: "item-scotia", balance: -4980.93 };
      const debtsOf = (at) => render(A.SettingsSectionContent, { sectionKey: "debts", data: { accounts: [{ ...card, bankAnsweredAt: iso(at) }], debts: [{ name: "Scotiabank Gold Amex Card", balance: "4980.93", rate: "", min: "", fromBank: true, account_id: "amex" }] }, setAppData: noop, color: "#888" });
      const staleDebts = debtsOf(Date.parse("2026-10-30T12:00:00-04:00")), liveDebts = debtsOf(NOW - MIN);
      t.ok(staleDebts.includes("Balances from your bank · Last updated Oct 30") && !/imported live/.test(staleDebts), "6a Debts: an old card balance is \"from your bank\" with the date, not \"imported live\"");
      t.ok(/Balances imported live from your bank/.test(liveDebts), "6b …and a fresh one is still \"imported live\"");
    } finally { Date.now = realNow; }
  }

  // ── 2 (server). A run-out sign-in is recorded, answered with its bank, and cleared by a good answer ──
  {
    const r = await server("get_accounts", { item_id: "item-scotia" }, {
      answer: (c) => (c.table === "plaid_items" && c.op === "select" && c.single ? itemRow("active") : null),
      plaid: (ep) => (ep === "/accounts/get" ? plaidError("ITEM_LOGIN_REQUIRED") : ok({})),
    });
    t.eq([r.status, r.body.needs_reconnect, r.body.item_id], [400, true, "item-scotia"], "2j Plaid says ITEM_LOGIN_REQUIRED: the app is told to reconnect, and which bank");
    t.eq(updates(r.calls).map((c) => [c.payload, c.filters]), [[{ status: "login_required" }, [["user_id", "u-owner"], ["item_id", "item-scotia"]]]],
      "2k …and the bank's own row says login_required, so every device and list_items know");
    const again = await server("get_accounts", { item_id: "item-scotia" }, {
      answer: (c) => (c.table === "plaid_items" && c.op === "select" && c.single ? itemRow("login_required") : null),
      plaid: (ep) => (ep === "/accounts/get" ? plaidError("ITEM_LOGIN_REQUIRED") : ok({})),
    });
    t.eq(updates(again.calls).length, 0, "2l already recorded: not written again");
    const fixed = await server("get_accounts", { item_id: "item-scotia" }, {
      answer: (c) => (c.table === "plaid_items" && c.op === "select" && c.single ? itemRow("login_required") : null),
      plaid: (ep) => (ep === "/accounts/get" ? ok({ accounts: [{ account_id: "chq", name: "Chequing", type: "depository", subtype: "checking", mask: "0001", balances: { available: 812.5, current: 812.5, iso_currency_code: "CAD" } }] }) : ok({})),
    });
    t.eq([fixed.status, (fixed.body.accounts || []).length, updates(fixed.calls).map((c) => c.payload)], [200, 1, [{ status: "active" }]], "2m the bank answers again (after a sign-in): accounts come back and the row is active again");
    const quiet = await server("get_accounts", { item_id: "item-scotia" }, {
      answer: (c) => (c.table === "plaid_items" && c.op === "select" && c.single ? itemRow("active") : null),
      plaid: (ep) => (ep === "/accounts/get" ? ok({ accounts: [] }) : ok({})),
    });
    t.eq(updates(quiet.calls).length, 0, "2n an active bank answering: nothing written");
    const liab = await server("get_liabilities", { item_id: "item-scotia" }, {
      answer: (c) => (c.table === "plaid_items" && c.op === "select" && c.single ? itemRow("active") : null),
      plaid: () => plaidError("ITEM_LOGIN_REQUIRED"),
    });
    t.ok(updates(liab.calls).some((c) => c.payload.status === "login_required") || liab.body.liabilitiesUnavailable, "2o liabilities and investments go through the same door");
  }

  // ── 3. The bank window closing without linking ───────────────────────────────────────────────
  {
    const m = (err, o) => BT.linkExitMessage(err, o);
    t.eq(m(null, { intent: "add" }).reasonId, "balance-link-closed", "3a closed by the person: that is the reason");
    t.eq(["INSTITUTION_NOT_RESPONDING", "INSTITUTION_DOWN", "INSTITUTION_NOT_AVAILABLE"].map((c) => m({ error_code: c }, { bank: "RBC" }).reasonId), ["balance-link-bank-down", "balance-link-bank-down", "balance-link-bank-down"],
      "3b the bank didn't respond (InstitutionNotResponding, as a real second try did)");
    t.eq(m({ error_code: "INVALID_MFA" }).reasonId, "balance-link-code-wrong", "3c the security code didn't match (InvalidMfa, as a real first try did)");
    t.eq(["INVALID_CREDENTIALS", "ITEM_LOCKED"].map((c) => m({ error_code: c }).reasonId), ["balance-link-login-wrong", "balance-link-login-wrong"], "3d the bank didn't accept the sign-in");
    t.eq(m({ error_code: "INTERNAL_SERVER_ERROR" }).reasonId, "balance-link-other", "3e anything else");
    const add = m({ error_code: "INSTITUTION_NOT_RESPONDING" }, { intent: "add", bank: "RBC" });
    t.eq(add.message, "RBC didn't respond. Nothing was added.", "3f0 the words, whole");
    t.ok(add.message.startsWith("RBC didn't respond.") && add.message.endsWith("Nothing was added."), `3f adding a bank: the reason, then that nothing was added ("${add.message}")`);
    const re = m(null, { intent: "reconnect", bank: "Scotiabank" });
    t.eq(re.message, "You closed the bank window before it finished. Scotiabank still needs you to sign in again.", "3g signing in again: the reason, then that the bank still needs it");
    const APP = fs.readFileSync(path.join(REPO, "src", "App.jsx"), "utf8");
    t.ok(/usePlaidLinkSDK\(reconnectToken, onReconnectSuccess, onReconnectExit\)/.test(APP), "3h the Settings bank window (add and reconnect) now hears every exit");
    t.ok(/const onReconnectExit = useCallback\(\(err, meta\) => \{[\s\S]{0,400}setReconnectToken\(null\);\s*alertModal\(\{ message: linkExitMessage\(err, \{ intent, bank \}\)\.message \}\);/.test(APP),
      "3i …and says it in a dialog, with the spent token cleared so the next tap starts fresh");
    t.ok(/const onPlaidExit=useCallback\(\(err\)=>\{\s*(\/\/[^\n]*\n\s*)?if \(err\) count\("bank_link_failed", linkFailDetail\(currentPlatform\(\), err\.error_code\)\); else count\("bank_link_cancelled"\);\s*setBankOutcome\(err \? "failed" : "cancelled"\);/.test(APP), "3j onboarding keeps its approved W4 answer (a failure counted with its platform and Plaid code)");
    // Settings' consent sheet "Connect My Bank" is the only way in, and a bank already linked is not added twice.
    t.ok(/\.find\(it => it\.status === "login_required" \|\| it\.status === "error" \|\| it\.status === "pending_expiration"\)/.test(APP), "3k Reconnect picks a bank that needs a sign-in, login_required included");
  }

  // ── 4 (server). The first pull ───────────────────────────────────────────────────────────────
  {
    const sync = (status, added = []) => ok({ added, modified: [], removed: [], next_cursor: status === "NOT_READY" ? "" : "c1", has_more: false, transactions_update_status: status, accounts: [] });
    const answer = (c) => (c.table === "plaid_items" && c.op === "select" && c.single ? itemRow("active") : null);
    const nr = await server("get_transactions", { item_id: "item-new", days: 90, full_resync: true }, { answer, plaid: (ep) => (ep === "/transactions/sync" ? sync("NOT_READY") : plaidError("PRODUCT_NOT_READY")) });
    t.eq([nr.status, nr.body.update_status, nr.body.transactions.length], [200, "NOT_READY", 0], "4c a brand-new bank: 200, nothing yet, and \"NOT_READY\" (it used to be a 500)");
    t.ok(!nr.plaidCalls.includes("/transactions/get"), "4d …and no /transactions/get, which can only answer PRODUCT_NOT_READY then");
    const old = await server("get_transactions", { item_id: "item-new", days: 90, full_resync: true }, { answer, plaid: (ep) => (ep === "/transactions/sync" ? ok({ added: [], modified: [], removed: [], next_cursor: "c0", has_more: false, accounts: [] }) : plaidError("PRODUCT_NOT_READY")) });
    t.eq([old.status, old.body.update_status], [200, "NOT_READY"], "4e a sync that doesn't say, and the fallback answers PRODUCT_NOT_READY: still 200, and \"not ready\"");
    const day = (n) => new Date(NOW - n * DAY).toISOString().slice(0, 10);
    const tx = (id, n, amt, name) => ({ transaction_id: id, account_id: "chq", date: day(n), amount: amt, name, merchant_name: null, iso_currency_code: "CAD", pending: false, personal_finance_category: { primary: "GENERAL_MERCHANDISE" } });
    const realNow = Date.now; Date.now = () => NOW;
    let initial, hist;
    try {
      initial = await server("get_transactions", { item_id: "item-new", days: 90, full_resync: true }, { answer, plaid: (ep) => (ep === "/transactions/sync" ? sync("INITIAL_UPDATE_COMPLETE", [tx("a", 3, 12, "COFFEE")]) : ok({})) });
      hist = await server("get_transactions", { item_id: "item-new", days: 90 }, { answer, plaid: (ep) => (ep === "/transactions/sync" ? sync("HISTORICAL_UPDATE_COMPLETE", [tx("b", 80, 40, "GAS")]) : ok({})) });
    } finally { Date.now = realNow; }
    t.eq([initial.body.update_status, initial.body.transactions.length, hist.body.update_status, hist.body.transactions.length], ["INITIAL_UPDATE_COMPLETE", 1, "HISTORICAL_UPDATE_COMPLETE", 1], "4f the last 30 days, then the rest: each answer says how far it has got");
    t.eq([BT.historyDone("NOT_READY"), BT.historyDone("INITIAL_UPDATE_COMPLETE"), BT.historyDone("HISTORICAL_UPDATE_COMPLETE"), BT.historyDone(null)], [false, false, true, true],
      "4g only the full history is done; a server that doesn't say never leaves \"loading\" up");
    t.eq(BT.historyCards({ a: { since: NOW - 9 * MIN, bank: "Tangerine" }, b: { since: NOW - 11 * MIN, bank: "EQ" }, c: { bank: "no time" } }, NOW),
      [{ item_id: "a", bank: "Tangerine", state: "loading" }, { item_id: "b", bank: "EQ", state: "slow" }], "4h loading for 10 minutes, then slow (the app keeps checking each time it opens)");
    t.eq([BT.HISTORY_POLL_MS, BT.HISTORY_SLOW_MS], [20000, 600000], "4i it asks every 20 seconds, for 10 minutes");
    if (A) {
      const realFetch = global.fetch;
      global.fetch = async (url) => ({ ok: true, status: 200, json: async () => ({ transactions: [], removed: [], truncated: false, full: true, update_status: "NOT_READY" }) });
      try { const r = await A.fetchItemTxns("item-new", "jwt", true); t.eq(r.updateStatus, "NOT_READY", "4j the app's one door for transactions passes it on"); }
      catch (e) { t.ok(false, `4j fetchItemTxns: ${describe(e)}`); } finally { global.fetch = realFetch; }
    }
    const APP = fs.readFileSync(path.join(REPO, "src", "App.jsx"), "utf8");
    t.ok(/onAccountsConnected\?\.\(mappedAccounts, fetchedTxns, \{ item_id: ex\.item_id, bank: ex\.institution_name, updateStatus: firstPull \}\);/.test(APP)
      && /promoteConnectedAccounts\(accounts, enrichedReconnectTxns, newBank \? \{ item_id: itemId, bank: instName, updateStatus: txnFetchFailed \? "NOT_READY" : txnData\.updateStatus \} : null\);/.test(APP),
      "4k both ways a new bank is linked (onboarding, Settings) start the history watch with how far Plaid has got");
    t.ok(/setInterval\(\(\)=>\{ refreshBanksRef\.current\?\.\(\{ force: true \}\); \}, HISTORY_POLL_MS\)/.test(APP), "4l the app asks again every 20 seconds while a history is loading");
    t.ok(/data-history-loading="1"/.test(APP), "4m onboarding says the history is still coming, once the bank is linked");
  }

  // ── 5. New transactions keep coming ──────────────────────────────────────────────────────────
  {
    const answer = (c) => (c.table === "plaid_items" && c.op === "select" && c.single ? { data: { access_token: "access-sandbox-test", status: "active", next_cursor: "c1" }, error: null } : null);
    const r = await server("get_transactions", { item_id: "item-scotia", days: 90 }, { answer, plaid: (ep) => (ep === "/transactions/sync" ? ok({ added: [], modified: [], removed: [], next_cursor: "c2", has_more: false, transactions_update_status: "HISTORICAL_UPDATE_COMPLETE", accounts: [] }) : ok({})) });
    t.ok(updates(r.calls).some((c) => c.payload.transactions_pending === false), "5a a sync that took everything clears the webhook's \"new transactions waiting\" flag");
    const trunc = await server("get_transactions", { item_id: "item-scotia", days: 90 }, { answer, plaid: (ep) => (ep === "/transactions/sync" ? ok({ added: [], modified: [], removed: [], next_cursor: "c3", has_more: true, transactions_update_status: "HISTORICAL_UPDATE_COMPLETE", accounts: [] }) : ok({})) });
    t.ok(!updates(trunc.calls).some((c) => c.payload && c.payload.transactions_pending === false), "5b …but not while more pages remain");
    const listed = await server("list_items", {}, { answer: (c) => (c.table === "plaid_items" && c.op === "select" && !c.single ? { data: [{ item_id: "item-scotia", institution_name: "Scotiabank", status: "login_required", transactions_pending: true }], error: null } : null), plaid: () => ok({}) });
    t.eq([listed.status, listed.body.items[0].transactions_pending, listed.body.items[0].status], [200, true, "login_required"], "5c list_items says which banks have new transactions waiting, and which need a sign-in");
    let tries = 0;
    const fallback = await server("list_items", {}, { answer: (c) => {
      if (!(c.table === "plaid_items" && c.op === "select" && !c.single)) return null;
      tries++;
      return /transactions_pending/.test(c.cols) ? { data: null, error: { code: "42703", message: "column plaid_items.transactions_pending does not exist" } } : { data: [{ item_id: "x", status: "active" }], error: null };
    }, plaid: () => ok({}) });
    t.eq([fallback.status, fallback.body.items.length, tries], [200, 1, 2], "5d a database without that column (built from the migration files) still lists every bank");
    if (A) {
      // backgroundRefresh: forced past the 30-minute wait, and reporting what it learned.
      A.store.set("flourish_last_refresh", String(Date.now() - 60 * 1000));
      const realFetch = global.fetch;
      const asked = [];
      global.fetch = async (url, init) => {
        const b = JSON.parse((init && init.body) || "{}"); asked.push(b.action);
        const answers = {
          get_accounts: [400, { error: "Bank session expired. Please reconnect.", needs_reconnect: true, item_id: b.item_id }],
          get_transactions: [400, { error: "Bank session expired. Please reconnect.", needs_reconnect: true }],
        };
        const [status, json] = answers[b.action] || [404, {}];
        return { ok: status === 200, status, json: async () => json };
      };
      let state = household([bank("chq", Date.parse("2026-10-30T12:00:00-04:00"))]);
      const setAppData = (fn) => { state = typeof fn === "function" ? fn(state) : fn; };
      try {
        const skipped = await A.backgroundRefresh(true, setAppData, false, { items: [{ item_id: "item-scotia" }], jwt: "test-jwt" });
        t.eq([skipped.ran, asked.length], [false, 0], "5e refreshed a minute ago: the 30-minute wait still holds");
        const forced = await A.backgroundRefresh(true, setAppData, false, { items: [{ item_id: "item-scotia", institution_name: "Scotiabank" }], force: true, jwt: "test-jwt" });
        t.eq([forced.ran, forced.signIn, forced.answered], [true, ["item-scotia"], []], "5f forced (new transactions waiting, or a history loading): it runs, and reports the bank that needs a sign-in");
        t.eq(state.accounts[0].bankAnsweredAt, iso(Date.parse("2026-10-30T12:00:00-04:00")), "5g a refresh the bank refused keeps the old balance AND its old time: nothing is re-stamped as fresh");
        // Two banks, one answers and one refuses: only the one that answered is stamped fresh.
        global.fetch = async (url, init) => {
          const q = JSON.parse((init && init.body) || "{}");
          if (q.item_id === "item-td" && q.action === "get_accounts") return { ok: true, status: 200, json: async () => ({ accounts: [{ id: "td-chq", name: "TD Chequing", type: "depository", subtype: "checking", mask: "0002", balance: { available: 410, current: 410, currency: "CAD" } }] }) };
          if (q.item_id === "item-td" && q.action === "get_transactions") return { ok: true, status: 200, json: async () => ({ transactions: [], removed: [], truncated: false, full: false, update_status: "HISTORICAL_UPDATE_COMPLETE" }) };
          return { ok: false, status: 400, json: async () => ({ error: "Bank session expired. Please reconnect.", needs_reconnect: true }) };
        };
        state = household([bank("chq", Date.parse("2026-10-30T12:00:00-04:00")), { ...bank("td-chq", Date.parse("2026-10-30T12:00:00-04:00"), "item-td"), institution: "TD" }]);
        const mixed = await A.backgroundRefresh(true, setAppData, false, { items: [{ item_id: "item-scotia" }, { item_id: "item-td" }], force: true, jwt: "test-jwt" });
        const byId = Object.fromEntries(state.accounts.map((a) => [a.id, a]));
        t.ok(mixed.answered.join() === "item-td" && mixed.signIn.join() === "item-scotia" && byId["td-chq"].balance === 410 && Date.parse(byId["td-chq"].bankAnsweredAt) > Date.parse("2026-11-01")
          && byId.chq.bankAnsweredAt === iso(Date.parse("2026-10-30T12:00:00-04:00")), "5j two banks, one answers: it is stamped fresh, and the one that refused keeps its old time (so Today still says when)");
      } catch (e) { t.ok(false, `5e-5g backgroundRefresh: ${describe(e)}`); } finally { global.fetch = realFetch; }
    }
    const APP = fs.readFileSync(path.join(REPO, "src", "App.jsx"), "utf8");
    t.ok(/document\.addEventListener\("visibilitychange", onShow\)/.test(APP) && /if \(document\.visibilityState === "visible" && !isPlaidLinkOpen\(\)\) refreshBanksRef\.current\?\.\(\)/.test(APP),
      "5h the app looks again each time it comes back on screen (a phone app resumed, a tab shown), except while Plaid Link is open (1.1.7)");
    t.ok(/const waiting = items\.some\(it => it && it\.transactions_pending\);/.test(APP) && /const forced = force \|\| waiting \|\| pending\.length > 0;/.test(APP),
      "5i new transactions waiting (the webhook's flag) or a history loading: no 30-minute wait");
  }

  // ── 6. One card, from the bank ───────────────────────────────────────────────────────────────
  {
    const card = { id: "amex", type: "credit", subtype: "credit card", balance: -4980.93 };
    const stale = { name: "Scotiabank Gold Amex Card", balance: "4859.17", rate: "", min: "", fromBank: true, account_id: "amex" };
    const hand = { name: "Visa I typed", balance: "300", rate: "19.99", min: "25" };
    const synced = BT.syncBankDebts([stale, hand], [card]);
    t.eq(synced.map((d) => [d.name, d.balance]), [["Scotiabank Gold Amex Card", "4980.93"], ["Visa I typed", "300"]], "6c the card's debt takes the card's balance owed ($4,980.93, not $4,859.17); a typed debt is untouched");
    const dup = BT.syncBankDebts([stale, { ...stale, rate: "20.99", min: "60" }], [card]);
    t.eq(dup.map((d) => [d.balance, d.rate, d.min]), [["4980.93", "20.99", "60"]], "6d two debts for one card become one, keeping the rate and minimum entered on either");
    const same = [{ ...stale, balance: "4980.93" }];
    t.ok(BT.syncBankDebts(same, [card]) === same, "6e nothing to change: the same array (no needless save)");
    t.eq(BT.syncBankDebts([stale], []).map((d) => d.balance), ["4859.17"], "6f the bank didn't answer for the card this time: its debt is left as it was");
    const APP = fs.readFileSync(path.join(REPO, "src", "App.jsx"), "utf8");
    t.ok(/debts: syncBankDebts\(newCCDebts\.length > 0/.test(APP) && /debts: syncBankDebts\(debts, incoming\.filter\(a => isCreditLiability\(a\)\)\)/.test(APP),
      "6g both doors a bank's answer comes through (refresh, and a new or healed link) keep one card at the bank's balance");
    if (A) {
      // The real refresh, end to end: Amanda's two Amex figures become one.
      const realFetch = global.fetch;
      global.fetch = async (url, init) => {
        const b = JSON.parse((init && init.body) || "{}");
        if (b.action === "get_accounts") return { ok: true, status: 200, json: async () => ({ accounts: [{ id: "amex", name: "Scotiabank Gold Amex Card", type: "credit", subtype: "credit card", mask: "0003", balance: { available: 5019.07, current: 4980.93, limit: 10000, currency: "CAD" } }] }) };
        if (b.action === "get_transactions") return { ok: true, status: 200, json: async () => ({ transactions: [], removed: [], truncated: false, full: false, update_status: "HISTORICAL_UPDATE_COMPLETE" }) };
        return { ok: false, status: 404, json: async () => ({}) };
      };
      let state = household([{ id: "amex", name: "Scotiabank Gold Amex Card", type: "credit", subtype: "credit card", institution: "Scotiabank", _item: "item-scotia", balance: -4859.17 }], null, { debts: [stale] });
      const setAppData = (fn) => { state = typeof fn === "function" ? fn(state) : fn; };
      try {
        const out = await A.backgroundRefresh(true, setAppData, false, { items: [{ item_id: "item-scotia" }], force: true, jwt: "test-jwt" });
        t.eq([state.debts.length, state.debts[0].balance, state.accounts[0].balance, out.answered, out.updateStatus["item-scotia"]], [1, "4980.93", -4980.93, ["item-scotia"], "HISTORICAL_UPDATE_COMPLETE"],
          "6h a refresh: one Amex, at the bank's $4,980.93, in both the account and the debt");
        t.ok(Date.parse(state.accounts[0].bankAnsweredAt) > 0, "6i …stamped with when the bank answered");
      } catch (e) { t.ok(false, `6h backgroundRefresh: ${describe(e)}`); } finally { global.fetch = realFetch; }
    }
  }

  // ── 7. The approved words, word for word (ChatGPT and Grok agreed, 2026-11-06) ─────────────
  {
    const APPROVED = {
      "balance-last-updated": "Last updated {when}",
      "balance-last-updated-unknown": "Last update time not available",
      "balance-signin-title": "{bank} needs you to sign in again",
      "balance-signin-partner": "{bank} needs your partner to sign in again",
      "balance-signin-body": "Until then, its balances may be out of date and new transactions can't come in.",
      "balance-signin-button": "Sign in to {bank}",
      "balance-link-closed": "You closed the bank window before it finished.",
      "balance-link-bank-down": "{bank} didn't respond.",
      "balance-link-code-wrong": "The security code didn't match.",
      "balance-link-login-wrong": "Your bank didn't accept that sign-in.",
      "balance-link-other": "The connection didn't finish.",
      "balance-link-nothing-added": "Nothing was added.",
      "balance-link-still-needed": "{bank} still needs you to sign in again.",
      "balance-history-loading": "Loading your history from {bank}…",
      "balance-history-loading-body": "Your balances are in. Up to 90 days of transactions can take a few minutes to arrive.",
      "balance-history-slow": "{bank} is still sending your history. flourish checks again each time you open it.",
      "balance-debts-from-bank": "Balances from your bank",
      "balance-bank-unnamed": "Your bank",
    };
    const PW = require("./_pendingWords.cjs");
    const ids = Object.keys(BW.BALANCE_WORDS);
    t.eq(BW.BALANCE_WORDS, APPROVED, `7a all ${ids.length} lines in lib/balanceWords.js are the approved text, word for word`);
    const doc = fs.readFileSync(path.join(REPO, "docs", "product", "BALANCE-TRUTH-WORDS.md"), "utf8");
    const rows = [...doc.matchAll(/^\| `(balance-[a-z0-9-]+)` \| [^|]+ \| [^|]+ \| ([^|]+) \| (\d+) \|$/gm)].map((m) => ({ id: m[1], line: m[2], limit: Number(m[3]) }));
    t.eq(rows.map((r) => [r.id, r.line]), Object.entries(APPROVED), "7b the words doc lists every line, in order, as approved");
    const sized = (line) => line.replace(/\{bank\}/g, "x".repeat(20)).replace(/\{when\}/g, "x".repeat(8)).length;
    t.eq(rows.filter((r) => sized(r.line) > r.limit).map((r) => `${r.id}: ${sized(r.line)} > ${r.limit}`), [], "7c each line fits its limit ({bank} as 20, {when} as 8)");
    t.eq(PW.pendingBalanceWordIds(), [], "7d no balance- line is still a placeholder, so the test exception covers nothing");
    t.eq(PW.strayPlaceholders("[WORDS: balance-signin-title]", "src/lib/balanceWords.js"), ["balance-signin-title"], "7e …and a placeholder would now be refused even in lib/balanceWords.js");
    const APP = fs.readFileSync(path.join(REPO, "src", "App.jsx"), "utf8");
    t.eq((APP.match(/\[WORDS:/g) || []).length, 0, "7f App.jsx holds no placeholder: it asks balanceWords()");
    const literal = (src) => [...src.matchAll(/"(balance-[a-z0-9-]+)"/g)].map((m) => m[1]);
    const wordsSrc = fs.readFileSync(path.join(REPO, "src", "lib", "balanceWords.js"), "utf8");
    const used = [...new Set([...literal(APP), ...literal(fs.readFileSync(path.join(REPO, "src", "lib", "balanceTruth.js"), "utf8")), ...[...wordsSrc.matchAll(/BALANCE_WORDS\["(balance-[a-z0-9-]+)"\]/g)].map((m) => m[1])])];
    t.eq(used.filter((id) => !ids.includes(id)), [], "7g every id the app asks for exists");
    t.eq(ids.filter((id) => !used.includes(id)), [], "7h …and every line is used somewhere");
    t.eq([W("balance-link-bank-down", { bank: "" }), W("balance-signin-title", { bank: "TD" }), W("balance-last-updated", { when: "3:40 p.m." })],
      ["Your bank didn't respond.", "TD needs you to sign in again", "Last updated 3:40 p.m."], "7i {bank} and {when} are filled in; a bank Plaid didn't name is \"Your bank\" (this once called itself forever, found when the words went in)");
    const { execFileSync } = require("child_process");
    let guard = 0;
    try { execFileSync(process.execPath, [path.join(REPO, "scripts", "check-pending-words.mjs"), "src", "netlify/functions", "public"], { cwd: REPO, stdio: "pipe" }); } catch (e) { guard = e.status; }
    // trial plan first (2026-11-10): its listed placeholders hold the build back the same way.
    t.eq(guard, PW.pendingCreatorWordIds().length || PW.pendingTrialWordIds().length || PW.pendingFirstRunWordIds().length ? 1 : 0, "7j the production and store builds' guard finds no balance placeholder");
  }

  t.summary("balanceTruth.test");
})();
