// tests/review1122Bank.test.cjs
// -----------------------------------------------------------------------------
// THE FULL-APP REVIEW OF 2026-11-22, BANK CONNECTIONS AND IMPORTED DATA.
// One section per finding, each assertion named with the finding's id.
//   P3-01  a bank's webhook that could not be applied is not remembered as done
//   P7-01  an old on-device bank token leaves the device only once the server has it (or never can)
//   P9-02  a disconnected bank takes its transactions, card debts, liabilities and holdings with it
//   P3-05  a holding's currency is the holding's own, and "not stated" is said
//   P3-06  (not real on the live app: a trace)
//   P3-07  a card whose statement balance the bank does not state is not sent as owing nothing
//   P3-09  "could not fetch the holdings" is told apart from "there are none"
//   P7-02  a bank whose weekly full re-read failed still owes it
//   P5-04  one card seen again under a new account id keeps ONE debt
//   P5-06  two accounts at one bank with the same last four digits stay two accounts
//   P5-08  a statement total that was not read is not the number 0
//   G9     a CSV description with a comma in quotes keeps its amount
//   G12    (not real: a trace)
// Synthetic data only; nothing leaves the machine.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");

const REPO = path.join(__dirname, "..");
const APP = fs.readFileSync(path.join(REPO, "src", "App.jsx"), "utf8");
const FN = path.join(REPO, "netlify", "functions");
const SUPA_PATH = require.resolve("@supabase/supabase-js", { paths: [FN] });
const PLAID_PATH = require.resolve("../netlify/functions/plaid.js");
const HOOK_PATH = require.resolve("../netlify/functions/plaid-webhook.js");
const VERIFY_PATH = require.resolve("../netlify/functions/_lib/webhook-verify.js");
const AUTH_PATH = require.resolve("../netlify/functions/_lib/auth.js");
const ENV = { SUPABASE_URL: "https://example.supabase.test", SUPABASE_SECRET_KEY: "test-service-role", PLAID_CLIENT_ID: "test-client", PLAID_SECRET: "test-secret", PLAID_ENV: "sandbox" };

// A stand-in service-role client. `answer(call)` decides what each finished query returns; every call is recorded.
// call = { table, op: "select"|"insert"|"update"|"upsert"|"delete", filters: [[kind, column, value]], payload }
function fakeDb(answer) {
  const calls = [];
  const from = (table) => {
    const call = { table, op: "select", filters: [], payload: null };
    const done = () => { calls.push(call); return Promise.resolve().then(() => answer(call)).then((r) => r || { data: null, error: null }); };
    const api = {
      select() { return api; },
      insert(p) { call.op = "insert"; call.payload = p; return api; },
      update(p) { call.op = "update"; call.payload = p; return api; },
      upsert(p) { call.op = "upsert"; call.payload = p; return api; },
      delete() { call.op = "delete"; return api; },
      eq(k, v) { call.filters.push(["eq", k, v]); return api; },
      lt(k, v) { call.filters.push(["lt", k, v]); return api; },
      in(k, v) { call.filters.push(["in", k, v]); return api; },
      is(k, v) { call.filters.push(["is", k, v]); return api; },
      order() { return api; }, limit() { return api; },
      single: () => done(), maybeSingle: () => done(),
      then(res, rej) { return done().then(res, rej); },
    };
    return api;
  };
  return { from, rpc: async () => ({ data: null, error: null }), auth: { admin: {} }, calls };
}
const eqOf = (call, col) => (call.filters.find((f) => f[0] === "eq" && f[1] === col) || [])[2];
const quiet = async (fn) => {
  const keep = { log: console.log, warn: console.warn, error: console.error };
  console.log = console.warn = console.error = () => {};
  try { return await fn(); } finally { Object.assign(console, keep); }
};

// ── the webhook, with the signature check replaced and a database that remembers what it was told ──────────────
function webhookWorld() {
  const seen = new Set();
  const state = { failUpdate: false, throwUpdate: false, failLookup: false, updates: [], item: { transactions_pending: false } };
  const db = fakeDb((c) => {
    if (c.table === "webhook_seen") {
      if (c.op === "insert") { if (seen.has(c.payload.jti)) return { data: null, error: { code: "23505", message: "duplicate key" } }; seen.add(c.payload.jti); return { data: null, error: null }; }
      if (c.op === "delete") { if (eqOf(c, "jti") && state.failDelete > 0) { state.failDelete--; return { data: null, error: { message: "delete down" } }; } const jti = eqOf(c, "jti"); if (jti) seen.delete(jti); return { data: null, error: null }; }
    }
    if (c.table === "plaid_items" && c.op === "select") return state.failLookup ? { data: null, error: { message: "lookup down" } } : { data: { user_id: "u-owner" }, error: null };
    if (c.table === "plaid_items" && c.op === "update") {
      if (state.throwUpdate) throw new Error("connection reset");
      if (state.failUpdate) return { data: null, error: { message: "write down" } };
      state.updates.push(c.payload); Object.assign(state.item, c.payload); return { data: null, error: null };
    }
    return { data: null, error: null };
  });
  const deliver = async (jti, code = "SYNC_UPDATES_AVAILABLE", type = "TRANSACTIONS") => quiet(async () => {
    const saved = { ...process.env }; Object.assign(process.env, ENV);
    require.cache[VERIFY_PATH] = { id: VERIFY_PATH, filename: VERIFY_PATH, loaded: true, exports: { verifyPlaidWebhook: async () => ({ verified: true, jti }) } };
    delete require.cache[AUTH_PATH]; delete require.cache[HOOK_PATH];
    const auth = require(AUTH_PATH); auth.getAdminClient = () => db;
    try {
      let res;
      try { res = await require(HOOK_PATH).handler({ httpMethod: "POST", headers: {}, body: JSON.stringify({ webhook_type: type, webhook_code: code, item_id: "item-1" }) }); }
      catch (e) { res = { statusCode: 599, body: JSON.stringify({ threw: String(e.message) }) }; }
      return { status: res.statusCode, body: JSON.parse(res.body || "{}") };
    } finally { process.env = saved; delete require.cache[HOOK_PATH]; delete require.cache[AUTH_PATH]; delete require.cache[VERIFY_PATH]; }
  });
  return { seen, state, deliver };
}

// ── plaid.js's real handler against a stand-in database and a stand-in Plaid ───────────────────────────────────
async function plaidCall(body, { plaid = {}, db = null, plan = { unlimited: true, status_unavailable: false } } = {}) {
  return quiet(async () => {
    const saved = { ...process.env }; Object.assign(process.env, ENV);
    const data = db || fakeDb((c) => {
      if (c.table === "plaid_items" && c.op === "select") return { data: { access_token: "access-sandbox-test", status: "active" }, error: null };
      return { data: null, error: null };
    });
    require.cache[SUPA_PATH] = { id: SUPA_PATH, filename: SUPA_PATH, loaded: true, exports: { createClient: () => data } };
    delete require.cache[AUTH_PATH]; delete require.cache[PLAID_PATH];
    const auth = require(AUTH_PATH);
    auth.getUserFromRequest = async () => ({ user_id: "u-owner", error: null });
    auth.getUserPlan = async () => plan;
    const handler = require(PLAID_PATH).handler;
    const realFetch = global.fetch; const sent = [];
    global.fetch = async (url, init) => {
      const u = String(url);
      if (!/plaid\.com/.test(u)) throw new Error("network blocked in test: " + u);
      const ep = u.replace(/^https:\/\/[^/]+/, ""); const req = JSON.parse(init.body || "{}"); sent.push({ ep, req });
      const a = typeof plaid[ep] === "function" ? plaid[ep](req) : plaid[ep];
      if (a instanceof Error) throw a;
      if (a && a.__status) return { ok: false, status: a.__status, json: async () => a.body, text: async () => JSON.stringify(a.body) };
      return { ok: true, status: 200, json: async () => a || {}, text: async () => JSON.stringify(a || {}) };
    };
    try {
      const res = await handler({ httpMethod: "POST", headers: { origin: "https://flourishmoney.app", authorization: "Bearer x" }, body: JSON.stringify(body) });
      return { status: res.statusCode, body: JSON.parse(res.body || "{}"), sent, calls: data.calls };
    } finally {
      global.fetch = realFetch; process.env = saved;
      delete require.cache[PLAID_PATH]; delete require.cache[AUTH_PATH]; delete require.cache[SUPA_PATH];
    }
  });
}

// A localStorage stand-in.
function memStore(init = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); }, _m: m };
}

(async () => {
  const t = create();
  const M = await import("../src/lib/multibank.js");
  const S = await import("../src/lib/statementImport.js");
  const F = await import("../src/lib/financialCalculations.js");
  let L = null;
  try { L = await import("../src/lib/legacyTokenMigration.js"); } catch { L = null; }

  // ════ P3-01 ══ the webhook: a delivery that could not be applied is not remembered as done ═══════════════════
  {
    const w = webhookWorld();
    w.state.failUpdate = true;
    const first = await w.deliver("jti-A");
    t.eq(first.status, 500, "P3-01a a delivery whose bank update could not be written answers 500, so Plaid sends it again");
    t.ok(!w.seen.has("jti-A"), "P3-01b …and it is NOT left marked as seen (the mark went in before the work, and stayed)");
    w.state.failUpdate = false;
    const again = await w.deliver("jti-A");
    t.eq(again.status, 200, "P3-01c the same delivery sent again is answered 200");
    t.ok(again.body.duplicate !== true, "P3-01d …and is not skipped as a duplicate");
    t.eq(w.state.item.transactions_pending, true, "P3-01e …so the bank's \"new transactions are waiting\" flag is set after all");
    const third = await w.deliver("jti-A");
    t.ok(third.status === 200 && third.body.duplicate === true && w.state.updates.length === 1,
      "P3-01f once it HAS been applied, an exact replay is still acknowledged and skipped (unchanged)");
  }
  {
    const w = webhookWorld();
    w.state.failLookup = true;
    const r = await w.deliver("jti-B");
    t.ok(r.status === 500 && !w.seen.has("jti-B"), "P3-01g the bank's owner could not be looked up: 500, and the mark is taken back");
    w.state.failLookup = false;
    const r2 = await w.deliver("jti-B");
    t.ok(r2.status === 200 && r2.body.duplicate !== true && w.state.updates.length === 1, "P3-01h …so the retry is applied");
  }
  {
    const w = webhookWorld();
    w.state.throwUpdate = true;
    const r = await w.deliver("jti-C");
    t.ok(r.status === 500 && !w.seen.has("jti-C"), "P3-01i the write threw: still a 500 (not a crash), and the mark is taken back");
  }
  {
    const w = webhookWorld();
    const ok = await w.deliver("jti-D", "SOMETHING_NEW");
    t.ok(ok.status === 200 && w.seen.has("jti-D"), "P3-01j a delivery that needed no write stays marked (nothing to retry)");
  }

  // ════ P7-01 ══ old on-device bank tokens ═════════════════════════════════════════════════════════════════════
  {
    const item = (token) => ({ item: { item_id: "item-" + token.slice(-1), institution_id: "ins_1" } });
    // three tokens: A saves, B's bank lookup times out (no Plaid code), C is refused by Plaid for good
    const db = fakeDb((c) => {
      if (c.table === "plaid_items" && c.op === "upsert") return { data: null, error: null };
      return { data: [], error: null };
    });
    const r = await plaidCall({ action: "migrate_items", tokens: [{ token: "tok-A", institution_name: "Bank A" }, { token: "tok-B", institution_name: "Bank B" }, { token: "tok-C", institution_name: "Bank C" }] }, {
      db,
      plaid: { "/item/get": (req) => req.access_token === "tok-A" ? item("tok-A")
        : req.access_token === "tok-B" ? new Error("fetch failed")
        : { __status: 400, body: { error_code: "INVALID_ACCESS_TOKEN", error_message: "bad token" } } },
    });
    const ok = r.body.successes || [], bad = r.body.failures || [];
    t.ok(ok.length === 1 && ok[0].index === 0, "P7-01a the server says WHICH token it saved (index 0)");
    const b = bad.find((f) => f.index === 1), c = bad.find((f) => f.index === 2);
    t.ok(!!b && b.retry === true, "P7-01b a token whose bank could not be reached is marked to try again");
    t.ok(!!c && c.retry === false, "P7-01c a token Plaid refuses for good is not");
    t.ok(!JSON.stringify(r.body).includes("tok-"), "P7-01d no token is ever echoed back");
    const dbFail = fakeDb((cl) => (cl.table === "plaid_items" && cl.op === "upsert") ? { data: null, error: { message: "db down" } } : { data: [], error: null });
    const r2 = await plaidCall({ action: "migrate_items", tokens: [{ token: "tok-A", institution_name: "Bank A" }] }, { db: dbFail, plaid: { "/item/get": item("tok-A") } });
    t.ok((r2.body.failures || []).length === 1 && r2.body.failures[0].index === 0 && r2.body.failures[0].retry === true,
      "P7-01e a token the database could not save is marked to try again");
  }
  t.ok(!!L && typeof L.afterTokenMigration === "function", "P7-01f the rule for what leaves the device is one tested function");
  if (L && typeof L.afterTokenMigration === "function") {
    const sent = [{ token: "tok-A", institution_name: "Bank A" }, { token: "tok-B", institution_name: "Bank B" }, { token: "tok-C", institution_name: "Bank C" }];
    const partial = L.afterTokenMigration(sent, { successes: [{ item_id: "i1", index: 0 }], failures: [{ index: 1, retry: true }, { index: 2, retry: false }] }, 0);
    t.eq(partial.done, false, "P7-01g one token still to try: the migration is NOT marked done");
    t.eq(partial.keep, [{ token: "tok-B", institution: "Bank B" }], "P7-01h only that token stays on the device; the saved one and the dead one go");
    t.eq(partial.tries, 1, "P7-01i the try is counted");
    const all = L.afterTokenMigration(sent, { successes: [{ item_id: "i1", index: 0 }, { item_id: "i2", index: 1 }], failures: [{ index: 2, retry: false }] }, 0);
    t.ok(all.done === true && all.keep.length === 0, "P7-01j nothing left to try: done, nothing kept");
    const last = L.afterTokenMigration(sent, { successes: [], failures: [{ index: 0, retry: true }, { index: 1, retry: true }, { index: 2, retry: true }] }, L.LEGACY_TOKEN_MAX_TRIES - 1);
    t.ok(last.done === true && last.keep.length === 0, "P7-01k after the last allowed try a bank credential is not left on the device for ever");
    const silent = L.afterTokenMigration(sent, { successes: [{ item_id: "i1", index: 0 }], failures: [] }, 0);
    t.ok(silent.done === false && silent.keep.length === 2, "P7-01l a token the answer says nothing about is kept, not assumed saved");
    const old = L.afterTokenMigration(sent, { successes: [{ item_id: "i1" }], failures: [{ error: "Could not migrate this bank." }] }, 0);
    t.ok(old.done === true, "P7-01m an answer with no indexes at all (an older server) behaves as before");
  }
  {
    const fn = APP.slice(APP.indexOf("async function migrateLocalStorageTokensToSupabase()"), APP.indexOf("// Phase D1-F-B: fetch the current Supabase JWT"));
    t.ok(/afterTokenMigration\(/.test(fn), "P7-01n the app asks that function before it clears anything");
    t.ok(!/Mark done regardless/.test(fn), "P7-01o …and no longer marks the migration done regardless of failures");
  }

  // ════ P9-02 ══ a disconnected bank takes what came from it ═══════════════════════════════════════════════════
  {
    const data = {
      bankConnected: true,
      accounts: [
        { id: "a-chq", name: "Bank A ••1111", type: "depository", institution: "Bank A", _item: "item-A", balance: 900 },
        { id: "a-card", name: "Bank A ••2222", type: "credit", institution: "Bank A", _item: "item-A", balance: 500 },
        { id: "b-chq", name: "Bank B ••3333", type: "depository", institution: "Bank B", _item: "item-B", balance: 400 },
        { id: "m1", name: "Cash", type: "checking", institution: "Manual", balance: 20 },
      ],
      transactions: [
        { id: "t1", account_id: "a-chq", amount: 12, name: "COFFEE" }, { id: "t2", account_id: "a-card", amount: 40, name: "GAS" },
        { id: "t3", account_id: "b-chq", amount: 7, name: "BUS" }, { id: "t4", account_id: "m1", amount: 3, name: "CASH SNACK" },
      ],
      debts: [
        { name: "Bank A card", balance: "500.00", rate: "19.99", min: "", fromBank: true, account_id: "a-card" },
        { name: "Loan from a friend", balance: "300", rate: "", min: "" },
      ],
      liabilities: { credit: [{ account_id: "a-card", name: "Bank A card", balance: 480, minPayment: 10 }], mortgage: [], student: [] },
      investments: [{ id: "a-inv_s1", account_id: "a-chq", value: 100 }, { id: "b-inv_s1", account_id: "b-chq", value: 50 }],
    };
    t.ok(typeof M.dropBankData === "function", "P9-02a there is one rule for what a disconnected bank takes with it");
    if (typeof M.dropBankData === "function") {
      const after = M.dropBankData(data, (a) => a._item === "item-A");
      t.eq(after.accounts.map((a) => a.id), ["b-chq", "m1"], "P9-02b the bank's accounts go");
      t.eq(after.transactions.map((x) => x.id), ["t3", "t4"], "P9-02c …and the transactions on them (kept before, and doubled when the bank was connected again)");
      t.eq(after.debts.map((d) => d.name), ["Loan from a friend"], "P9-02d …and the debt made from its card; a debt typed by hand stays");
      t.eq(after.liabilities.credit.length, 0, "P9-02e …and the bank's own liability entry");
      t.eq(after.investments.map((h) => h.id), ["b-inv_s1"], "P9-02f …and its holdings");
      t.eq(after.bankConnected, true, "P9-02g another bank is still connected");
      t.eq(data.transactions.length, 4, "P9-02h the input is not changed (pure)");
      const all = M.dropBankData(data);
      t.eq(all.accounts.map((a) => a.id), ["m1"], "P9-02i with no bank named, every bank account goes and the hand-kept one stays");
      t.eq(all.transactions.map((x) => x.id), ["t4"], "P9-02j …with only the hand-entered transaction left");
      t.eq(all.bankConnected, false, "P9-02k …and no bank is connected");
      // the reconnect: the same card comes back under a new account id
      const back = M.promoteAccounts(after.accounts, after.debts, [{ id: "a-card-NEW", name: "Bank A ••2222", type: "credit", institution: "Bank A", mask: "2222", _item: "item-A2", balance: 500 }]);
      t.eq(back.debts.filter((d) => d.fromBank).length, 1, "P9-02l connected again, the card is ONE debt, not two");
    }
    const settings = APP.slice(APP.indexOf("One of several banks: delete_item removed"), APP.indexOf("One of several banks: delete_item removed") + 1400);
    t.ok(/dropBankData\(prev,\s*a\s*=>\s*a\._item\s*===\s*b\.item_id\)/.test(settings), "P9-02m Settings uses that rule for one of several banks");
    const off = APP.slice(APP.indexOf("const disconnectBank = async ()=>{"), APP.indexOf("// A function DECLARATION, so it exists for the whole render"));
    t.ok((off.match(/dropBankData\(/g) || []).length === 2, "P9-02n …and so does disconnecting the last bank, in a household and out of one");
  }

  // ════ P3-05, P3-06 ══ holdings ═══════════════════════════════════════════════════════════════════════════════
  {
    const holdingsAnswer = {
      accounts: [{ account_id: "acc-usd", subtype: "401k", balances: { iso_currency_code: "USD" } }, { account_id: "acc-x", subtype: "tfsa", balances: {} }],
      securities: [
        { security_id: "s1", name: "US Fund", ticker_symbol: "USF", type: "etf", close_price: 10, iso_currency_code: "USD" },
        { security_id: "s2", name: "Listed in USD, held in CAD", ticker_symbol: "DUAL", type: "equity", close_price: 5, iso_currency_code: "USD" },
        { security_id: "s3", name: "No currency anywhere", ticker_symbol: null, type: "other", close_price: null, iso_currency_code: null },
        { security_id: "s4", name: "Only the account says", ticker_symbol: null, type: "other", close_price: 2, iso_currency_code: null },
      ],
      holdings: [
        { account_id: "acc-usd", security_id: "s1", quantity: 3, institution_value: 30, iso_currency_code: "USD" },
        { account_id: "acc-x", security_id: "s2", quantity: 2, institution_value: 13.5, iso_currency_code: "CAD" },
        { account_id: "acc-x", security_id: "s3", quantity: 1, institution_value: 7, iso_currency_code: null },
        { account_id: "acc-usd", security_id: "s4", quantity: 1, institution_value: 2, iso_currency_code: null },
      ],
    };
    const r = await plaidCall({ action: "get_investments", item_id: "item-1" }, { plaid: { "/investments/holdings/get": holdingsAnswer } });
    const h = (r.body.holdings || []);
    t.eq(h.length, 4, "P3-05a every holding is returned");
    t.eq(h[0].currency, "USD", "P3-05b a holding in US dollars says USD");
    t.eq(h[1].currency, "CAD", "P3-05c the value's currency is the HOLDING's own, not the currency the security is listed in");
    t.ok(h[2].currency === "CAD" && h[2].currencyKnown === false, "P3-05d nobody stated a currency: the old default is still sent for older apps, and currencyKnown:false says it was not stated");
    t.ok(h[3].currency === "USD" && h[3].currencyKnown !== false, "P3-05e a holding with no currency of its own takes its account's");
    t.ok(h[0].currencyKnown === undefined && h[1].currencyKnown === undefined, "P3-05f a stated currency carries no flag (the answer's shape is unchanged for those)");
    t.ok(h.every((x) => typeof x.currency === "string" && typeof x.value === "number" && typeof x.price === "number"),
      "P3-05g currency stays a string and value and price stay numbers, as the apps in people's hands expect");
    // P3-06, not real on the live app: the price is never read by a screen, and Plaid always sends institution_value.
    t.eq(h[0].value, 30, "P3-06a a stated value is passed through untouched");
    t.ok(!/\b(h|inv|holding|item)\.price\b/.test(APP), "P3-06b no screen in the live app reads a holding's price, so an unknown price cannot be shown as $0");
    t.ok(/data\.investments\.reduce\(\(s,h\) => s \+ \(h\.value\|\|0\), 0\)/.test(APP), "P3-06c the one figure shown from holdings is the sum of the values the bank reported");
  }

  // ════ P3-09 ══ could not fetch is not "there are none" ═══════════════════════════════════════════════════════
  {
    const down = await plaidCall({ action: "get_investments", item_id: "item-1" }, { plaid: { "/investments/holdings/get": new Error("fetch failed") } });
    t.eq(down.status, 200, "P3-09a a holdings read that failed still answers 200 (older apps expect it)");
    t.eq(down.body.holdings, [], "P3-09b …with the empty list they expect");
    t.eq(down.body.unavailable, true, "P3-09c …and now says unavailable:true, so \"could not fetch\" can be told apart from \"none\"");
    const none = await plaidCall({ action: "get_investments", item_id: "item-1" }, { plaid: { "/investments/holdings/get": { accounts: [], securities: [], holdings: [] } } });
    t.ok(Array.isArray(none.body.holdings) && none.body.holdings.length === 0 && none.body.unavailable === undefined, "P3-09d a bank that truly holds nothing is NOT marked unavailable");
  }

  // ════ P3-01, round 2 ══ taking the mark back is tried twice ══════════════════════════════════════════════════
  {
    const w = webhookWorld();
    w.state.failUpdate = true; w.state.failDelete = 1;
    const r = await w.deliver("jti-R2");
    t.ok(r.status === 500 && !w.seen.has("jti-R2"), "P3-01k the bank update failed AND the first try at taking the mark back failed: the second try takes it back (was: left for the 15-minute cleanup)");
    w.state.failUpdate = false;
    const again = await w.deliver("jti-R2");
    t.ok(again.status === 200 && again.body.duplicate !== true && w.state.item.transactions_pending === true, "P3-01l …so Plaid's retry is applied, not skipped");
    const w2 = webhookWorld();
    w2.state.failUpdate = true; w2.state.failDelete = 5;
    const r2 = await w2.deliver("jti-R3");
    t.eq(r2.status, 500, "P3-01m when the mark cannot be taken back at all the answer is still 500 (the cleanup removes the mark within 15 minutes, and Plaid keeps retrying for a day)");
  }

  // ════ N2 (round 2 review, 2026-11-22) ══ the server's REAL holding shape through the app's keep rule ═════════════
  // The reviewer read the holding as having no id. It has one (account + security), made by plaid.js; these holdings
  // are that function's own output, not a hand-written copy. The rule must also hold for a saved copy with no id.
  {
    const bank = (acct, rows) => ({
      accounts: [{ account_id: acct, subtype: "tfsa", balances: { iso_currency_code: "CAD" } }],
      securities: rows.map(([sid, name]) => ({ security_id: sid, name, ticker_symbol: null, type: "etf", close_price: 1, iso_currency_code: "CAD" })),
      holdings: rows.map(([sid, , value]) => ({ account_id: acct, security_id: sid, quantity: 1, institution_value: value, iso_currency_code: "CAD" })),
    });
    const fromServer = async (item, acct, rows) => (await plaidCall({ action: "get_investments", item_id: item }, { plaid: { "/investments/holdings/get": bank(acct, rows) } })).body.holdings;
    const a = await fromServer("item-A", "acc-A", [["s1", "Fund One", 100], ["s2", "Fund Two", 200]]);
    const b = await fromServer("item-B", "acc-B", [["s1", "Fund One", 300]]);          // the same security, at another bank
    const bNew = await fromServer("item-B", "acc-B", [["s1", "Fund One", 310]]);
    t.eq(a.map((h) => [h.id, h.account_id]), [["acc-A_s1", "acc-A"], ["acc-A_s2", "acc-A"]], "N2a the server's holding carries account_id and an id of its own (account + security)");
    t.ok(a[0].id !== b[0].id, "N2b the same security at two banks is two holdings, told apart");
    const map = new Map([["acc-A", "item-A"], ["acc-B", "item-B"]]);
    const show = (l) => (Array.isArray(l) ? l.map((h) => `${h.account_id}:${h.name}:${h.value}`).sort() : l);
    const keep = (...args) => { try { return show(M.retainHoldings(...args)); } catch (e) { return "THREW " + e.message; } };
    t.eq(keep([...a, ...b], bNew, map, new Set(["item-B"]), true), ["acc-A:Fund One:100", "acc-A:Fund Two:200", "acc-B:Fund One:310"], "N2c bank A failed, bank B answered: A's two holdings stay, B's is the new figure");
    const bare = (l) => l.map(({ id, ...rest }) => rest);
    t.eq(keep(bare([...a, ...b]), bare(bNew), map, new Set(["item-B"]), true), ["acc-A:Fund One:100", "acc-A:Fund Two:200", "acc-B:Fund One:310"], "N2d the same with NO id on any holding: the failed bank's holdings still stay (was: all dropped, undefined matched undefined)");
    t.eq(keep([...a, ...b], [], map, new Set(["item-A", "item-B"]), false), [], "N2e every bank answered and holds nothing now: the old holdings go (was: kept for ever)");
    t.eq(keep([...a, ...b], [], map, new Set(["item-A"]), true), ["acc-B:Fund One:300"], "N2f A answered with nothing and B failed: A's go, B's stay");
    t.eq(keep(bare([...a, ...b]), bare([...a, ...bNew]), new Map(), new Set(["item-A", "item-B"]), false), ["acc-A:Fund One:100", "acc-A:Fund Two:200", "acc-B:Fund One:310"], "N2g accounts not stamped with their bank, every bank answered: what came, once, nothing twice");
  }

  // ════ P3-07 ══ liabilities: unknown is not zero ══════════════════════════════════════════════════════════════
  {
    const liab = {
      accounts: [
        { account_id: "card-known", balances: { current: 410 } }, { account_id: "card-unknown", balances: { current: 275.5 } },
        { account_id: "card-blank", balances: { current: null } }, { account_id: "mort", balances: { current: 200000 } }, { account_id: "stu", balances: { current: 9000 } },
      ],
      liabilities: {
        credit: [
          { account_id: "card-known", name: "Known", last_statement_balance: 400, minimum_payment_amount: 25, aprs: [{ apr_percentage: 19.99 }] },
          { account_id: "card-unknown", name: "Unknown", last_statement_balance: null, minimum_payment_amount: null, aprs: [] },
          { account_id: "card-blank", name: "Blank", last_statement_balance: null, minimum_payment_amount: null, aprs: [] },
          { account_id: "card-zero", name: "Paid off", last_statement_balance: 0, minimum_payment_amount: 0, aprs: [] },
        ],
        mortgage: [{ account_id: "mort", name: "Home", outstanding_principal_balance: null, next_monthly_payment: null, interest_rate: { percentage: 4.5 } }],
        student: [{ account_id: "stu", name: "Loan", outstanding_principal_balance: null, outstanding_interest_amount: null, interest_rate_percentage: 5 }],
      },
    };
    const r = await plaidCall({ action: "get_liabilities", item_id: "item-1" }, { plaid: { "/liabilities/get": liab } });
    const c = Object.fromEntries((r.body.credit || []).map((x) => [x.account_id, x]));
    t.ok(c["card-known"] && c["card-known"].balance === 400 && c["card-known"].minPayment === 25 && c["card-known"].balanceKnown === undefined && c["card-known"].minPaymentKnown === undefined,
      "P3-07a a card the bank states in full is sent exactly as before, with no new field");
    t.eq(c["card-unknown"] && c["card-unknown"].balance, 275.5, "P3-07b no statement balance stated: the card's balance owed now is sent, not $0");
    t.eq(c["card-unknown"] && c["card-unknown"].balanceFrom, "current", "P3-07c …and the answer says where that figure came from");
    t.ok(c["card-unknown"] && c["card-unknown"].minPayment === 0 && c["card-unknown"].minPaymentKnown === false, "P3-07d a minimum the bank did not state stays the number 0 for older apps, marked minPaymentKnown:false");
    t.ok(c["card-blank"] && c["card-blank"].balance === 0 && c["card-blank"].balanceKnown === false, "P3-07e no figure at all: 0 for older apps, marked balanceKnown:false");
    t.ok(c["card-zero"] && c["card-zero"].balance === 0 && c["card-zero"].balanceKnown === undefined && c["card-zero"].minPaymentKnown === undefined, "P3-07f a stated $0 is a real $0: no flag");
    const m = (r.body.mortgage || [])[0] || {}, s = (r.body.student || [])[0] || {};
    t.ok(m.balance === 200000 && m.balanceFrom === "current" && m.monthlyPayment === 0 && m.monthlyPaymentKnown === false, "P3-07g a mortgage with no principal stated: the account's balance, and its payment marked not stated");
    t.ok(s.balance === 9000 && s.balanceFrom === "current", "P3-07h a student loan with no principal stated: the account's balance");
    // what the live app does with them (lib/financialCalculations.js, untouched): the card is in the payoff list again
    const list = F.buildDebtListForSimulator([{ name: "Unknown", balance: "275.50", rate: "", min: "", fromBank: true, account_id: "card-unknown" }], { credit: r.body.credit || [], mortgage: [], student: [] }, {});
    t.ok(list.some((d) => d.account_id === "card-unknown" && d.balance === 275.5), "P3-07i so the payoff list no longer loses a card that owes $275.50");
    // NOT REAL half of the finding: an unknown minimum never read as "nothing due"
    const est = F.buildDebtListForSimulator([], { credit: [{ account_id: "x", name: "X", balance: 1000, minPayment: 0 }], mortgage: [], student: [] }, {});
    t.ok(est.length === 1 && est[0].min > 0 && est[0].minEstimated === true, "P3-07j (trace) a minimum of 0 from the bank was never shown as nothing due: the app estimates one and labels it estimated");
  }

  // ════ P7-02 ══ the weekly full re-read, per bank ═════════════════════════════════════════════════════════════
  {
    t.ok(typeof M.fullSyncOwedAfter === "function", "P7-02a which banks still owe a full re-read is one tested rule");
    if (typeof M.fullSyncOwedAfter === "function") {
      const items = [{ item_id: "A" }, { item_id: "B" }];
      const okR = { status: "fulfilled", value: {} }, badR = { status: "rejected", reason: new Error("x") };
      t.eq(M.fullSyncOwedAfter([], items, [okR, badR], true), ["B"], "P7-02b a full round where bank B failed: B still owes it");
      t.eq(M.fullSyncOwedAfter(["B"], items, [okR, okR], false), [], "P7-02c the next round reads B in full; it worked, so nothing is owed");
      t.eq(M.fullSyncOwedAfter(["B"], items, [okR, badR], false), ["B"], "P7-02d …and if B fails again it still owes it");
      t.eq(M.fullSyncOwedAfter([], items, [okR, badR], false), [], "P7-02e an ordinary round that failed owes nothing extra");
      t.eq(M.fullSyncOwedAfter(["Z"], items, [okR, okR], false), [], "P7-02f a bank no longer connected owes nothing");
      t.eq(M.fullSyncOwedAfter(null, items, [okR, okR], true), [], "P7-02g a clean full round owes nothing");
    }
    const bg = APP.slice(APP.indexOf("async function backgroundRefresh("), APP.indexOf("// ─── DATA TRANSPARENCY PANEL"));
    t.ok(/fetchItemTxns\(it\.item_id, jwt, fullResync \|\| owed\.includes\(it\.item_id\)\)/.test(bg), "P7-02h the refresh reads an owing bank in full");
    t.ok(/noteFullSyncRound\(owed, items, txnResults, fullResync\)/.test(bg), "P7-02i …and records who still owes after the round");
    const first = APP.slice(APP.indexOf("// ── Fetch transactions on first dashboard load after bank connect"), APP.indexOf("// ── Fetch transactions on first dashboard load after bank connect") + 14000);
    t.ok(/noteFullSyncRound\(owed, items, results, fullResync\)/.test(first), "P7-02j the app-open sync records it too");
  }

  // ════ P5-04 ══ one card, one debt, when its account id changes ═══════════════════════════════════════════════
  {
    const cardOld = { id: "card-old", name: "Scotiabank ••9999", type: "credit", subtype: "credit card", balance: 840.5, institution: "Scotiabank", mask: "9999", _item: "item-old" };
    const cardNew = { ...cardOld, id: "card-new", _item: "item-new", balance: 800 };
    const first = M.promoteAccounts([], [], [cardOld]);
    const withRate = first.debts.map((d) => ({ ...d, rate: "19.99", min: "25" }));   // the household typed these in
    const hand = { name: "Same card, typed", balance: "840", rate: "", min: "", sameAsAccountId: "card-old" };
    const second = M.promoteAccounts(first.accounts, [...withRate, hand], [cardNew]);
    t.eq(second.accounts.length, 1, "P5-04a the same card under a new account id is still one account (unchanged)");
    const bank = second.debts.filter((d) => d.fromBank);
    t.eq(bank.length, 1, "P5-04b …and ONE debt, not two (the old row stayed and a new one was added)");
    t.eq(bank[0] && bank[0].account_id, "card-new", "P5-04c the debt now names the account the bank reports");
    t.ok(bank[0] && bank[0].rate === "19.99" && bank[0].min === "25", "P5-04d the rate and minimum the household entered are kept");
    t.eq((second.debts.find((d) => d.name === "Same card, typed") || {}).sameAsAccountId, "card-new", "P5-04e a hand-entered debt linked to the card follows it");
    const other = M.promoteAccounts(first.accounts, first.debts, [{ id: "card-2", name: "RBC ••1000", type: "credit", balance: 10, institution: "RBC", mask: "1000", _item: "item-r" }]);
    t.eq(other.debts.filter((d) => d.fromBank).length, 2, "P5-04f a different card still adds its own debt");
  }

  // ════ P5-06 ══ same bank, same last four, two accounts ═══════════════════════════════════════════════════════
  {
    const chq = { id: "cu-chq", name: "Credit Union ••0042", type: "depository", subtype: "checking", balance: 1200, institution: "Credit Union", mask: "0042", _item: "item-cu" };
    const sav = { id: "cu-sav", name: "Credit Union ••0042", type: "depository", subtype: "savings", balance: 5000, institution: "Credit Union", mask: "0042", _item: "item-cu" };
    const r = M.promoteAccounts([], [], [chq, sav]);
    t.eq(r.accounts.length, 2, "P5-06a two accounts from ONE bank connection with the same last four are both kept");
    t.eq(r.accounts.reduce((s, a) => s + a.balance, 0), 6200, "P5-06b …so $5,000 of savings is not lost from the total");
    const later = M.promoteAccounts(r.accounts, r.debts, [{ ...sav, balance: 5100 }]);
    t.eq(later.accounts.length, 2, "P5-06c a later refresh of one does not remove the other");
    t.eq((later.accounts.find((a) => a.id === "cu-chq") || {}).balance, 1200, "P5-06d …and the chequing balance is untouched");
    const dupA = { ...chq, id: "dup-a", _item: "item-1" }, dupB = { ...chq, id: "dup-b", _item: "item-2" };
    t.eq(M.promoteAccounts([], [], [dupB, dupA]).accounts.length, 1, "P5-06e the same account seen through TWO connections is still collapsed to one (unchanged)");
    t.eq(M.promoteAccounts([dupA], [], [dupB]).accounts.length, 1, "P5-06f …also when the second connection arrives later (unchanged)");
  }

  // ════ P5-08 ══ a statement figure that was not read is not 0 ═════════════════════════════════════════════════
  {
    const rows = [{ status: "ok", amount: 54.2 }, { status: "ok", amount: -2000 }];
    const nulls = S.reconcile(rows, { totalDebits: null, totalCredits: null, openingBalance: null, closingBalance: null });
    t.eq(nulls.applicable, false, "P5-08a totals the reader sent as null are \"not printed\", so there is nothing to check against");
    t.eq(nulls.checks.length, 0, "P5-08b …and no check against an invented $0");
    t.eq(S.reconcile(rows, { totalDebits: "", totalCredits: false }).applicable, false, "P5-08c the same for an empty string or a false");
    const real = S.reconcile(rows, { totalDebits: 0, totalCredits: "2000" });
    t.ok(real.applicable && real.checks.length === 2 && real.checks[0].ok === false && real.checks[1].ok === true, "P5-08d a printed total of 0, or a number sent as text, is still a real anchor");
    const batch = S.validateStatementImport({ rows: [{ date: "2026-08-03", name: "GROCER", amount: 54.2, source: "Aug 3 GROCER 54.20" }], anchors: { period: { start: "2026-08-01", end: "2026-08-31" }, openingBalance: null, closingBalance: null, totalDebits: null, totalCredits: null } });
    t.eq(batch.confidence.level, "high", "P5-08e so a clean statement with no printed totals is not marked low confidence");
    t.ok(S.classifyRow({ date: "2026-08-03", name: "X", amount: null, source: "0" }).status === "failed", "P5-08f a row with no amount fails as \"not a number\" instead of becoming $0");
  }

  // ════ G9 ══ CSV: a comma inside quotes ═══════════════════════════════════════════════════════════════════════
  {
    t.ok(typeof S.splitCsvLine === "function", "G9a there is one quote-aware way to split a CSV line");
    if (typeof S.splitCsvLine === "function") {
      t.eq(S.splitCsvLine('2026-01-05,"UBER EATS, TORONTO",23.45', ","), ["2026-01-05", "UBER EATS, TORONTO", "23.45"], "G9b a comma inside quotes stays in its field");
      t.eq(S.splitCsvLine('a,"say ""hi""",c', ","), ["a", 'say "hi"', "c"], "G9c a doubled quote inside quotes is one quote");
      t.eq(S.splitCsvLine("a,b,,d", ","), ["a", "b", "", "d"], "G9d plain lines split as before, empty fields kept");
      t.eq(S.splitCsvLine('x\t"1,234.56"\ty', "\t"), ["x", "1,234.56", "y"], "G9e tab-separated files too");
    }
    const src = APP.slice(APP.indexOf("function parseCSVStatement(text) {"), APP.indexOf("let _pdfjsLib = null;"));
    const parse = new Function("splitCsvLine", src + "\nreturn parseCSVStatement;")(S.splitCsvLine || (() => { throw new Error("no splitter"); }));
    const csv = ['Date,Description,Amount,Balance', '2026-01-05,"UBER EATS, TORONTO",23.45,"1,476.55"', '2026-01-06,COFFEE,4.10,"1,472.45"'].join("\n");
    let out = null; try { out = parse(csv); } catch { out = null; }
    t.ok(Array.isArray(out) && out.length === 2, "G9f the app's CSV reader reads both rows");
    t.eq(out && out[0] && out[0].name, "UBER EATS, TORONTO", "G9g the description is whole");
    t.eq(out && out[0] && out[0].amount, 23.45, "G9h …and the amount is $23.45, not $0 (the next column was read as the amount)");
    t.eq(out && out[1] && out[1].amount, 4.1, "G9i a plain row is read as before");
    const bal = S.csvClosingBalance(csv);
    t.ok(bal && bal.amount === 1472.45 && bal.asOf === "2026-01-06", "G9j the closing balance offered is the Balance column's, not a shifted column");
  }

  // ════ G12 ══ not real: the nested update gives the same answer however often it runs ═════════════════════════
  {
    const edit = APP.slice(APP.indexOf("const edit = (id, field, value) => setRows("), APP.indexOf("const toggle = (id) => setSelected("));
    t.ok(/setSelected\(s => \{ const n = new Set\(s\); n\.delete\(id\); return n; \}\)/.test(edit), "G12a (trace) the update made inside the row update is a functional delete from a copied Set");
    const drop = (id) => (s) => { const n = new Set(s); n.delete(id); return n; };
    const once = drop("r1")(new Set(["r1", "r2"])), twice = drop("r1")(drop("r1")(new Set(["r1", "r2"])));
    t.eq([...once], [...twice], "G12b …so running it twice (React's development double-run) leaves the same selection as running it once");
  }

  // ════ Production's own columns (Claude in Chrome's read-only check, 2026-11-23) ═════════════════════════════════
  // plaid_items was made by hand in the dashboard; supabase/migrations/00001 is a guess at it. Read on production:
  // it has transactions_pending and holdings_pending and NO liabilities_pending. The webhook wrote that column on
  // every LIABILITIES:DEFAULT_UPDATE, so the write failed there, and since P3-01 a failed write answers 500 and takes
  // its mark back: Plaid would have resent each of those webhooks for its whole retry schedule once #157 was live.
  // Nothing on any branch reads liabilities_pending. The use is dropped; and every column the webhook does write is
  // now made by a migration (0056, guarded, not run by this change), so a database built from this repo has them all.
  {
    const hookSrc = fs.readFileSync(path.join(__dirname, "..", "netlify", "functions", "plaid-webhook.js"), "utf8");
    const written = [...new Set([...hookSrc.matchAll(/updates = \{([^}]*)\}/g)].flatMap((m) => [...m[1].matchAll(/([a-z_]+)\s*:/g)].map((x) => x[1])))].sort();
    t.ok(!written.includes("liabilities_pending") && !/liabilities_pending\s*:/.test(hookSrc), "COLS-a the webhook no longer writes liabilities_pending (production has no such column, and nothing reads it)");
    const w = webhookWorld();
    const r = await w.deliver("jti-L1", "DEFAULT_UPDATE", "LIABILITIES");
    t.eq([r.status, r.body.received, w.state.updates.length], [200, true, 0], "COLS-b a liabilities webhook is acknowledged and writes nothing");
    t.ok(w.seen.has("jti-L1"), "COLS-c …and stays marked as seen: there is nothing to retry");
    const h = await w.deliver("jti-H1", "DEFAULT_UPDATE", "HOLDINGS");
    t.eq([h.status, w.state.updates[0]], [200, { holdings_pending: true }], "COLS-d a holdings webhook still sets its flag (production has holdings_pending)");
    // Every column the webhook can write is made by a migration in this repo.
    const dir = path.join(__dirname, "..", "supabase", "migrations");
    const made = new Set();
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) {
      const sql = fs.readFileSync(path.join(dir, f), "utf8").replace(/--[^\n]*/g, "");
      const create = sql.match(/create table if not exists public\.plaid_items\s*\(([\s\S]*?)\n\);/);
      if (create) for (const line of create[1].split("\n")) { const m = line.match(/^\s*([a-z_]+)\s+(uuid|text|boolean|timestamptz|jsonb|integer)\b/); if (m) made.add(m[1]); }
      for (const alter of sql.matchAll(/alter table public\.plaid_items([\s\S]*?);/g)) for (const m of alter[1].matchAll(/add column if not exists\s+([a-z_]+)/g)) made.add(m[1]);
    }
    t.eq(written.filter((c) => !made.has(c)), [], `COLS-e every column the webhook writes (${written.join(", ")}) is made by a migration in this repo`);
    t.ok(made.has("transactions_pending") && made.has("holdings_pending") && made.has("next_cursor") && made.has("last_error") && made.has("new_accounts_available"),
      "COLS-f …including the two production got by hand (transactions_pending, holdings_pending), so a local database and the nightly test have them too");
    const m56 = fs.readdirSync(dir).find((f) => /^0056_/.test(f));
    const sql56 = m56 ? fs.readFileSync(path.join(dir, m56), "utf8") : "";
    const body56 = sql56.replace(/--[^\n]*/g, "");
    t.ok(m56 && /alter table public\.plaid_items/.test(body56) && !/\bdrop\b|\bdelete\b|\btruncate\b|\bupdate\s+public/i.test(body56) && [...body56.matchAll(/add column\b(?! if not exists)/g)].length === 0,
      "COLS-g the new migration only adds columns, each guarded (add column if not exists): it changes nothing where a column is already there");
    t.ok(!/liabilities_pending/.test(body56), "COLS-h …and it does not add liabilities_pending: the use is gone, so no column is needed");
    const plaidSrc = fs.readFileSync(path.join(__dirname, "..", "netlify", "functions", "plaid.js"), "utf8");
    t.ok(!/liabilities_pending/.test(plaidSrc) && !/liabilities_pending/.test(fs.readFileSync(path.join(__dirname, "..", "src", "App.jsx"), "utf8")), "COLS-i nothing else in the server or the app names liabilities_pending");
  }

  t.summary("review1122Bank");
})().catch((e) => { console.error("review1122Bank crashed:", e); process.exit(1); });
