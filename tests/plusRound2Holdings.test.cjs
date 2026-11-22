// tests/plusRound2Holdings.test.cjs
// -----------------------------------------------------------------------------
// ROUND 2 OF THE PLUS REVIEW (2026-11-22, on 05fb6a7): INVESTMENT HOLDINGS WITH PLUS, PRIVATE AND NEVER LOST.
// Amanda's rule: "private holdings must never reach the shared household blob, AND a person must never lose their
// holdings. Don't trade one for the other."
//   1  GN1 + B1, the server   a bank's holdings are kept in a private store on the server (migration 0055) when they
//                             come; when the bank cannot be read the kept list is answered, to the same people through
//                             the same filter; before 0055 is run nothing changes and nothing breaks
//   2  GN1 + B1, the app      the old shared copy is cleared bank by bank, each once ITS OWNER has a lasting private
//                             copy (this device for one's own bank, or the server); never before, and never by adding
//   3  GN1                    nothing Plus sends is ever written into the household's data, by any path
//   4  N2 (as on fix-review-1122)  without Plus: a holding's bank decides whether it stays, and a round where every
//                             bank answers with nothing is applied
//   5  H8 (NOT REAL)          a device last told "today" stays "today" through a check that did not get through
//   6  M5                     who linked each bank is refreshed every time the banks are read
// -----------------------------------------------------------------------------
"use strict";
const fs = require("fs");
const path = require("path");
const { create } = require("./_runner.cjs");

const AUTH_PATH = require.resolve("../netlify/functions/_lib/auth.js");
const PLUS_PATH = require.resolve("../netlify/functions/_lib/plusAddon.js");
const LIM_PATH = require.resolve("../netlify/functions/_lib/bankLimits.js");
const PLAID_PATH = require.resolve("../netlify/functions/plaid.js");
const REPO = path.join(__dirname, "..");
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const future = new Date(Date.now() + 20 * 86400000).toISOString();
const PK = { plaid_items: ["user_id", "item_id"], net_worth_shares: ["user_id", "account_id"], plaid_account_owners: ["user_id", "account_id"], plus_holdings: ["user_id", "item_id"] };
const safe = (fn) => { try { return fn(); } catch (e) { return `THREW ${String(e && e.message).slice(0, 70)}`; } };
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); }, m }; };
const broken = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); }, removeItem() { throw new Error("blocked"); } };

// A stand-in service-role client. state.missing[table]: the table is not there (0055 not run). state.failWrite[table]:
// writes to it are refused. state.fail[table]: reads fail.
function makeDb({ items = {}, partner = false, plus = null, shares = [] } = {}) {
  const state = { rows: { plaid_items: [], household_members: [], plus_addon_subscriptions: [], complimentary_access: [], net_worth_shares: [], plaid_account_owners: [], plus_holdings: [] }, writes: [], reads: [], fail: {}, missing: {}, failWrite: {} };
  for (const [user, n] of Object.entries(items)) for (let i = 0; i < n; i++) state.rows.plaid_items.push({ user_id: user, item_id: `${user.slice(0, 1)}-item-${i}`, status: "active", access_token: `access-${user.slice(0, 1)}-${i}`, institution_id: `ins_${user.slice(0, 1)}_${i}`, institution_name: `Bank ${i}`, created_at: new Date(Date.now() - (10 - i) * 1000).toISOString() });
  if (partner) state.rows.household_members.push({ user_id: A, household_id: "h1", role: "owner" }, { user_id: B, household_id: "h1", role: "partner" });
  if (plus) state.rows.plus_addon_subscriptions.push({ user_id: plus, provider: "stripe", plan_key: "plus_monthly", status: "active", product_id: "price_pm", current_period_end: future });
  for (const [user, account_id, shared] of shares) state.rows.net_worth_shares.push({ user_id: user, account_id, shared });
  const NOT_THERE = { code: "PGRST205", message: "Could not find the table 'public.plus_holdings' in the schema cache" };
  const from = (table) => {
    const rows = () => (state.rows[table] = state.rows[table] || []);
    const pkOf = (row, keys) => (r) => keys.every((k) => r[k] === row[k]);
    const filtered = (f) => rows().filter((r) => f.every((fn) => fn(r)));
    const readErr = () => (state.missing[table] ? NOT_THERE : state.fail[table] ? { code: "57014", message: "timeout" } : null);
    const writeErr = () => (state.missing[table] ? NOT_THERE : state.failWrite[table] ? { code: "57014", message: "write refused" } : null);
    const q = {
      f: [],
      select() { return q; }, eq(c, v) { q.f.push((r) => r[c] === v); return q; }, in(c, vs) { q.f.push((r) => vs.includes(r[c])); return q; }, not() { return q; }, order() { return q; }, limit() { return q; },
      async maybeSingle() { state.reads.push(table); const e = readErr(); return e ? { data: null, error: e } : { data: filtered(q.f)[0] || null, error: null }; },
      async single() { state.reads.push(table); const e = readErr(); if (e) return { data: null, error: e }; const h = filtered(q.f)[0]; return h ? { data: h, error: null } : { data: null, error: { message: "none" } }; },
      then(res, rej) { state.reads.push(table); const e = readErr(); const h = e ? null : filtered(q.f); return Promise.resolve(e ? { data: null, error: e } : { data: h, error: null, count: h.length }).then(res, rej); },
      async upsert(row, opts) {
        const e = writeErr(); if (e) { state.writes.push([table, "upsert refused"]); return { error: e }; }
        state.writes.push([table, "upsert"]);
        for (const one of Array.isArray(row) ? row : [row]) {
          const keys = opts && opts.onConflict ? opts.onConflict.split(",") : (PK[table] || ["user_id"]);
          const i = rows().findIndex(pkOf(one, keys));
          if (i >= 0) rows()[i] = { ...rows()[i], ...one }; else rows().push({ ...one });
        }
        return { error: null };
      },
      update(p) {
        const u = { f: [], eq(c, v) { u.f.push((r) => r[c] === v); return u; },
          _run() { state.writes.push([table, "update"]); const hit = filtered(u.f); hit.forEach((r) => Object.assign(r, p)); return { data: hit.map((r) => ({ id: r.id })), error: null }; },
          async select() { return u._run(); }, then(res, rej) { return Promise.resolve(u._run()).then(res, rej); } };
        return u;
      },
      delete() {
        const d = { f: [], eq(c, v) { d.f.push((r) => r[c] === v); return d; }, in(c, vs) { d.f.push((r) => vs.includes(r[c])); return d; },
          then(res, rej) { const e = writeErr(); if (e) return Promise.resolve({ error: e }).then(res, rej); state.writes.push([table, "delete"]); state.rows[table] = rows().filter((r) => !d.f.every((fn) => fn(r))); return Promise.resolve({ error: null }).then(res, rej); } };
        return d;
      },
    };
    return q;
  };
  const rpc = async (name, args) => {
    if (name === "household_disconnect_item") {
      const n = state.rows.plaid_items.length;
      state.rows.plaid_items = state.rows.plaid_items.filter((r) => !(r.user_id === args.p_user && r.item_id === args.p_item));
      return { data: { result: state.rows.plaid_items.length < n ? "removed" : "not_found" }, error: null };
    }
    return { data: null, error: null };
  };
  return { state, admin: { from, rpc, auth: { admin: {} } } };
}
function load(db, user) {
  for (const p of [AUTH_PATH, PLUS_PATH, LIM_PATH, PLAID_PATH]) delete require.cache[p];
  for (const k of Object.keys(require.cache)) if (/netlify\/functions\/_lib\/(plusHoldingsStore|household)\.js$/.test(k)) delete require.cache[k];
  const real = require(AUTH_PATH);
  require.cache[AUTH_PATH].exports = { ...real, getAdminClient: () => db.admin, getUserFromRequest: async () => ({ user_id: user, error: null }), getUserPlan: async () => ({ plan: "plus", unlimited: true, status_unavailable: false }) };
  return require(PLAID_PATH);
}
const call = async (fn, body, version = "1.1.8") => {
  const r = await fn.handler({ httpMethod: "POST", headers: { origin: "https://flourishmoney.app", authorization: "Bearer x" }, body: JSON.stringify({ ...(version ? { client_version: version } : {}), ...body }) });
  let b = null; try { b = JSON.parse(r.body); } catch { b = null; }
  return { status: r.statusCode, body: b };
};

(async () => {
  const t = create();
  const saved = { ...process.env };
  const quiet = { e: console.error, w: console.warn, l: console.log }; console.error = () => {}; console.warn = () => {};
  const realFetch = global.fetch;
  // The pretend Plaid: what each bank (by its access token) holds now, or "fail".
  const P = { calls: [], by: {} };
  const bank = (acctRows) => ({
    accounts: [...new Set(acctRows.map((r) => r[0]))].map((account_id) => ({ account_id, subtype: "tfsa", balances: { iso_currency_code: "CAD" } })),
    securities: [...new Set(acctRows.map((r) => r[1]))].map((security_id) => ({ security_id, name: `Fund ${security_id}`, ticker_symbol: security_id.toUpperCase(), type: "etf", close_price: 10, iso_currency_code: "CAD" })),
    holdings: acctRows.map(([account_id, security_id, institution_value]) => ({ account_id, security_id, quantity: 1, institution_value, iso_currency_code: "CAD" })),
  });
  const ok = (j) => ({ ok: true, status: 200, json: async () => j });
  const no = () => ({ ok: false, status: 500, json: async () => ({ error_code: "INTERNAL_SERVER_ERROR", error_message: "plaid is down" }) });
  global.fetch = async (url, init) => {
    const u = String(url).replace(/^https:\/\/[^/]+/, ""); const body = init && init.body ? JSON.parse(init.body) : {};
    P.calls.push({ url: u, token: body.access_token || null });
    if (/investments\/holdings\/get/.test(u)) { const h = P.by[body.access_token]; return h === "fail" || !h ? no() : ok(h); }
    if (/item\/remove/.test(u)) return ok({ removed: true });
    return ok({});
  };
  const asked = () => P.calls.filter((c) => /holdings\/get/.test(c.url)).length;
  for (const k of Object.keys(process.env)) if (/^PLUS_ENABLED$|^PLUS_TESTER_USER_IDS$|^HOUSEHOLD_ENABLED$|^ENFORCE_PLAN_LIMITS$|^STRIPE_PRICE_/.test(k)) delete process.env[k];
  Object.assign(process.env, { PLAID_CLIENT_ID: "test-client", PLAID_SECRET: "test-secret", PLAID_ENV: "sandbox", HOUSEHOLD_ENABLED: "true",
    STRIPE_PRICE_MONTHLY_CAD: "price_m", STRIPE_PRICE_ANNUAL_CAD: "price_a", STRIPE_PRICE_FOUNDING_ANNUAL_CAD: "price_f", STRIPE_PRICE_PLUS_MONTHLY_CAD: "price_pm", STRIPE_PRICE_PLUS_ANNUAL_CAD: "price_pa" });
  const src = (...p) => fs.readFileSync(path.join(REPO, ...p), "utf8");
  const app = src("src", "App.jsx");
  const show = (l) => (Array.isArray(l) ? l.map((h) => `${h.account_id}:${h.ticker}:${h.value}`).sort() : l);
  const kept = (db, user, item) => { const r = db.state.rows.plus_holdings.find((x) => x.user_id === user && x.item_id === item); return r ? show(r.holdings) : null; };

  try {
    process.env.PLUS_ENABLED = "true";
    const GET_A = { action: "get_investments", item_id: "a-item-0" };
    const GET_B = { action: "get_investments", item_id: "b-item-0" };
    const A_HOLDS = bank([["acct-a1", "s1", 100], ["acct-a1", "s2", 200], ["acct-a2", "s1", 50]]);
    const B_HOLDS = bank([["acct-b1", "s1", 300], ["acct-b2", "s3", 400]]);

    // ── 1. THE SERVER'S PRIVATE STORE ──────────────────────────────────────────────────────────────
    {
      // one's own bank: the holdings come, and are kept
      P.calls.length = 0; P.by = { "access-a-0": A_HOLDS };
      const db = makeDb({ items: { [A]: 1 }, plus: A });
      const live = await call(load(db, A), GET_A);
      t.eq([live.status, show(live.body.holdings), live.body.plus_mode, live.body.stored], [200, ["acct-a1:S1:100", "acct-a1:S2:200", "acct-a2:S1:50"], true, true],
        "GN1a with Plus, a bank's holdings come as before, and the answer now says they are kept on the server (stored: true)");
      t.eq([kept(db, A, "a-item-0"), db.state.rows.plus_holdings.length], [["acct-a1:S1:100", "acct-a1:S2:200", "acct-a2:S1:50"], 1], "GN1b …one row, in the name of the person who linked the bank, holding that bank's list");
      t.eq(live.body.holdings.map((h) => h.id), ["acct-a1_s1", "acct-a1_s2", "acct-a2_s1"], "GN1c (the holding as the server really makes it: account_id, and an id of account + security)");
      t.ok(!("stale" in live.body) && !("unavailable" in live.body) && !("as_of" in live.body), "GN1d a live answer is not marked stale or unavailable");
      const row = db.state.rows.plus_holdings[0] || {};
      t.ok(typeof row.fetched_at === "string" && Number.isFinite(Date.parse(row.fetched_at)) && JSON.stringify(row.holdings) === JSON.stringify(live.body.holdings), "GN1e what is kept is exactly what was sent, with when it came");

      // the bank cannot be read: the kept list is answered
      P.by = { "access-a-0": "fail" };
      const down = await call(load(db, A), GET_A);
      t.eq([down.status, show(down.body.holdings), down.body.stale, down.body.as_of, down.body.plus_mode, "unavailable" in down.body, "stored" in down.body],
        [200, ["acct-a1:S1:100", "acct-a1:S2:200", "acct-a2:S1:50"], true, row.fetched_at, true, false, false],
        "B1a the bank cannot be read: the person is answered the list the server kept, marked stale with when it came (was: no holdings at all)");
      t.eq((kept(db, A, "a-item-0") || []).length, 3, "B1b …and the kept list is left as it was");

      // nothing kept yet: exactly today's answer
      const fresh = makeDb({ items: { [A]: 1 }, plus: A });
      const none = await call(load(fresh, A), GET_A);
      t.eq(none.body, { holdings: [], unavailable: true, plus_mode: true }, "B1c the bank cannot be read and nothing was ever kept: unavailable, exactly as before");

      // the bank answers again: the kept list is replaced (sold holdings go)
      P.by = { "access-a-0": bank([["acct-a1", "s1", 110]]) };
      const again = await call(load(db, A), GET_A);
      t.eq([show(again.body.holdings), again.body.stored, kept(db, A, "a-item-0")], [["acct-a1:S1:110"], true, ["acct-a1:S1:110"]], "B1d when the bank answers again the kept list is that answer: what was sold is gone from it");
      P.by = { "access-a-0": bank([]) };
      const sold = await call(load(db, A), GET_A);
      t.eq([sold.body.holdings, sold.body.stored, kept(db, A, "a-item-0")], [[], true, []], "B1e a bank that holds nothing now: an empty list is kept, so a later failed read does not bring the old holdings back");
      P.by = { "access-a-0": "fail" };
      const emptyStale = await call(load(db, A), GET_A);
      t.eq([emptyStale.body.holdings, emptyStale.body.stale], [[], true], "B1f …it answers that kept empty list");
    }
    {
      // 0055 not run, or the save refused: nothing breaks, and the answer says the list is NOT kept
      P.calls.length = 0; P.by = { "access-a-0": A_HOLDS };
      const before = makeDb({ items: { [A]: 1 }, plus: A }); before.state.missing.plus_holdings = true;
      const r = await call(load(before, A), GET_A);
      t.eq([r.status, r.body.holdings.length, r.body.plus_mode, r.body.stored], [200, 3, true, false], "GN1f before migration 0055 is run: the holdings come as before, and the answer says stored: false (never a 500)");
      P.by = { "access-a-0": "fail" };
      const d = await call(load(before, A), GET_A);
      t.eq([d.status, d.body], [200, { holdings: [], unavailable: true, plus_mode: true }], "GN1g …and a bank that cannot be read answers exactly as it did before the store existed");
      P.by = { "access-a-0": A_HOLDS };
      const refused = makeDb({ items: { [A]: 1 }, plus: A }); refused.state.failWrite.plus_holdings = true;
      const w = await call(load(refused, A), GET_A);
      t.eq([w.status, w.body.holdings.length, w.body.stored, refused.state.rows.plus_holdings.length], [200, 3, false, 0], "GN1h the save refused: the holdings still come, stored: false");
      const unreadable = makeDb({ items: { [A]: 1 }, plus: A }); unreadable.state.rows.plus_holdings.push({ user_id: A, item_id: "a-item-0", holdings: [{ id: "x" }], fetched_at: new Date().toISOString() }); unreadable.state.fail.plus_holdings = true;
      P.by = { "access-a-0": "fail" };
      const u = await call(load(unreadable, A), GET_A);
      t.eq(u.body, { holdings: [], unavailable: true, plus_mode: true }, "GN1i the kept list cannot be read either: unavailable, as before");
    }
    {
      // a partner's bank: the same people, through the same filter
      P.calls.length = 0; P.by = { "access-b-0": B_HOLDS };
      const db = makeDb({ items: { [B]: 1 }, partner: true, plus: A, shares: [[B, "acct-b1", true], [B, "acct-b2", false]] });
      const live = await call(load(db, A), GET_B);
      t.eq([show(live.body.holdings), live.body.stored], [["acct-b1:S1:300"], true], "GN1j a partner's bank: only the accounts its owner shared are sent, as before");
      t.eq([kept(db, B, "b-item-0"), kept(db, A, "b-item-0")], [["acct-b1:S1:300", "acct-b2:S3:400"], null], "GN1k the server keeps the bank's WHOLE list in its OWNER's name (so the owner can never lose it), and nothing in the asker's");
      P.by = { "access-b-0": "fail" };
      const down = await call(load(db, A), GET_B);
      t.eq([show(down.body.holdings), down.body.stale], [["acct-b1:S1:300"], true], "GN1l the bank cannot be read: the partner is answered the kept list through the SAME filter (the shared account only)");
      t.ok(!JSON.stringify(down.body).includes("acct-b2"), "GN1m …the owner's private account is in no part of that answer");
      const mine = await call(load(db, B), GET_B);
      t.eq([show(mine.body.holdings), mine.body.stale], [["acct-b1:S1:300", "acct-b2:S3:400"], true], "GN1n its owner is answered all of it");
      // the owner stops sharing: nothing of the kept list reaches the partner, and Plaid is not asked
      db.state.rows.net_worth_shares.forEach((s) => { s.shared = false; });
      P.calls.length = 0;
      const unshared = await call(load(db, A), GET_B);
      t.eq([unshared.body.holdings, unshared.body.plus_mode, unshared.body.stored, asked(), "stale" in unshared.body], [[], true, true, 0, false], "GN1o nothing shared: no holdings, Plaid is not asked (as before), and stored says whether the OWNER's list is kept");
      const never = makeDb({ items: { [B]: 1 }, partner: true, plus: A });
      const nv = await call(load(never, A), GET_B);
      t.eq([nv.body.holdings, nv.body.stored], [[], false], "GN1p nothing shared and nothing kept yet for that bank: stored: false, so the app does not clear the owner's old copy");
    }
    {
      // nobody without Plus, and no older app, is sent any of it
      P.calls.length = 0; P.by = { "access-a-0": "fail" };
      const db = makeDb({ items: { [A]: 1 } });   // no Plus
      db.state.rows.plus_holdings.push({ user_id: A, item_id: "a-item-0", holdings: [{ id: "acct-a1_s1", account_id: "acct-a1", ticker: "S1", value: 100 }], fetched_at: new Date().toISOString() });
      const locked = await call(load(db, A), GET_A);
      t.eq([locked.body, asked()], [{ holdings: [], locked: true, plus_mode: true }, 0], "GN1q Plus ended: nothing is sent, kept or not (and the row is left alone: nothing is deleted when Plus ends)");
      t.eq(db.state.rows.plus_holdings.length, 1, "GN1r …the kept list is still there for when Plus is back");
      const withPlus = makeDb({ items: { [A]: 1 }, plus: A });
      withPlus.state.rows.plus_holdings.push({ user_id: A, item_id: "a-item-0", holdings: [{ id: "acct-a1_s1", account_id: "acct-a1", ticker: "S1", value: 100 }], fetched_at: new Date().toISOString() });
      const old = await call(load(withPlus, A), GET_A, null);
      t.eq([old.body.holdings, old.body.locked, old.body.update_required, "stale" in old.body], [[], true, true, false], "GN1s an app older than 1.1.8 (it would put them in the shared data) is sent none, kept or not");
      const old117 = await call(load(withPlus, A), GET_A, "1.1.7");
      t.eq([old117.body.holdings, old117.body.locked], [[], true], "GN1t …1.1.7 the same");
      // Plus not switched on at all: nothing is kept and the answer is today's
      delete process.env.PLUS_ENABLED; P.by = { "access-a-0": A_HOLDS };
      const offDb = makeDb({ items: { [A]: 1 } });
      const off = await call(load(offDb, A), GET_A);
      t.eq([off.body.holdings.length, "plus_mode" in off.body, "stored" in off.body, offDb.state.rows.plus_holdings.length, offDb.state.writes.filter((w) => w[0] === "plus_holdings").length], [3, false, false, 0, 0],
        "GN1u Plus off: holdings as today, nothing kept, and the store is not touched");
      P.by = { "access-a-0": "fail" };
      const offDown = await call(load(offDb, A), GET_A);
      t.eq(offDown.body, { holdings: [] }, "GN1v …and a failed read answers as today");
      // the tester-only switch: the owner is a tester, the asker sees no Plus: shared accounts only, and nothing kept is read
      process.env.PLUS_TESTER_USER_IDS = B; P.by = { "access-b-0": B_HOLDS };
      const tdb = makeDb({ items: { [B]: 1 }, partner: true, shares: [[B, "acct-b1", true]] });
      const tr = await call(load(tdb, A), GET_B);
      t.eq([show(tr.body.holdings), "plus_mode" in tr.body, "stored" in tr.body], [["acct-b1:S1:300"], false, false], "GN1w a tester's bank asked by a partner who sees no Plus: the shared account only, as before");
      delete process.env.PLUS_TESTER_USER_IDS; process.env.PLUS_ENABLED = "true";
    }
    {
      // a bank that is disconnected takes its kept list with it
      P.calls.length = 0; P.by = { "access-a-0": A_HOLDS, "access-a-1": bank([["acct-a9", "s9", 9]]) };
      const db = makeDb({ items: { [A]: 2 }, plus: A });
      await call(load(db, A), GET_A); await call(load(db, A), { action: "get_investments", item_id: "a-item-1" });
      t.eq(db.state.rows.plus_holdings.length, 2, "GN1x (two banks, two kept lists)");
      const gone = await call(load(db, A), { action: "delete_item", item_id: "a-item-0" });
      t.eq([gone.body.removed, kept(db, A, "a-item-0"), kept(db, A, "a-item-1")], [true, null, ["acct-a9:S9:9"]], "GN1y disconnecting a bank removes its kept list, and only its own");
      const pre = makeDb({ items: { [A]: 1 }, plus: A }); pre.state.missing.plus_holdings = true;
      const preGone = await call(load(pre, A), { action: "delete_item", item_id: "a-item-0" });
      t.eq([preGone.status, preGone.body.removed], [200, true], "GN1z before 0055 is run, disconnecting a bank works as before");
    }
    {
      const sql = (() => { try { return src("supabase", "migrations", "0055_plus_holdings_private.sql"); } catch { return ""; } })();
      t.ok(/create table if not exists public\.plus_holdings \(/.test(sql) && /user_id\s+uuid\s+not null references auth\.users\(id\) on delete cascade/.test(sql) && /primary key \(user_id, item_id\)/.test(sql), "GN1-sql-a 0055: one row per person and bank, gone with the account");
      t.ok(/alter table public\.plus_holdings enable row level security;/.test(sql) && /revoke all on table public\.plus_holdings from anon, authenticated;/.test(sql) && /grant all privileges on table public\.plus_holdings to service_role;/.test(sql) && !/create policy/i.test(sql),
        "GN1-sql-b row level security on, no policy, nothing for the app's own roles: only the server reads it");
      t.ok(/after delete on public\.plaid_items\s+for each row execute function public\.plus_holdings_follow_item\(\);/.test(sql), "GN1-sql-c a bank's row going takes its kept holdings with it, whatever removed it");
      t.ok(/NOT APPLIED/.test(sql) && /RUN THIS BEFORE PLUS IS SWITCHED ON/.test(sql), "GN1-sql-d the file says it is not applied, and when it must be");
    }

    // ── 2. THE APP: THE OLD SHARED COPY ────────────────────────────────────────────────────────────
    const H = await import("../src/lib/plusHoldings.js");
    const X = await import("../src/lib/netWorthAccess.js");
    {
      const items = [{ item_id: "i-mine" }, { item_id: "i-mine2" }, { item_id: "i-theirs", linked_by: "partner" }];
      const live = (holdings, extra = {}) => ({ status: "fulfilled", value: { holdings, plus_mode: true, ...extra } });
      const failed = { status: "rejected", reason: new Error("offline") };
      const h = (id, account_id, value) => ({ id, account_id, value, ticker: id });
      const accounts = [{ id: "m1", _item: "i-mine" }, { id: "m2", _item: "i-mine2" }, { id: "p1", _item: "i-theirs" }, { id: "typed" }];
      const OLD = [h("m1_s", "m1", 1), h("m2_s", "m2", 2), h("p1_s", "p1", 3), h("orphan_s", "nowhere", 4)];
      const data = () => ({ profile: { name: "x" }, accounts, investments: OLD.map((x) => ({ ...x })) });
      const left = (d) => (d && "investments" in d ? d.investments.map((x) => x.id) : "cleared");
      const after = (results, savedOnDevice) => safe(() => left(H.withoutCoveredSharedCopy(data(), H.mergeHoldings([], items, results), savedOnDevice)));

      t.eq(after([live([h("m1_n", "m1", 9)], { stored: true }), live([], { stored: true }), live([], { stored: true })], false), "cleared",
        "GN1-app-a storage blocked on this device, but the server kept every bank's list: the old shared copy is cleared (was: never cleared, so it stayed in the household's data)");
      t.eq(after([live([h("m1_n", "m1", 9)], { stored: false }), live([], { stored: false }), live([], { stored: false })], false), ["m1_s", "m2_s", "p1_s", "orphan_s"],
        "B1-app-a storage blocked AND the server kept nothing: nothing has a lasting private home, so nothing is cleared");
      t.eq(after([live([h("m1_n", "m1", 9)], { stored: false }), live([], { stored: false }), live([], { stored: false })], true), ["p1_s", "orphan_s"],
        "B1-app-b saved on this device, not on the server (before 0055): this person's OWN banks' old holdings go; the partner's stay until the partner has a lasting copy of their own (was: this device cleared the partner's too)");
      t.eq(after([live([h("m1_n", "m1", 9)], { stored: true }), failed, live([], { stored: true })], true), ["m2_s", "orphan_s"],
        "B1-app-c one bank could not be read: ITS old holdings stay in the shared copy (nothing private has replaced them); the banks that came are cleared (was: all cleared on one bank's answer)");
      t.eq(after([live([h("m1_n", "m1", 9)], { stored: true }), live([], { stale: true, as_of: new Date().toISOString() }), live([], { stored: true })], true), ["m2_s", "orphan_s"],
        "B1-app-d a stale answer (the server's kept list) is shown but clears nothing");
      t.eq(after([live([], { locked: true }), live([], { locked: true }), live([], { locked: true })], true), ["m1_s", "m2_s", "p1_s", "orphan_s"], "B1-app-e locked (no Plus): nothing is cleared");
      t.eq(after([live([], { unavailable: true }), failed, failed], true), ["m1_s", "m2_s", "p1_s", "orphan_s"], "B1-app-f nothing came at all: nothing is cleared");
      t.eq(after([live([], { stored: true }), live([], { stored: true }), live([], { stored: false })], true), ["p1_s", "orphan_s"],
        "B1-app-g the partner's bank says its owner's list is not kept: their old holdings stay, whatever this device saved");
      // never adds, never touches anything else
      const before = data(); const merged = H.mergeHoldings([], items, [live([h("NEW_PRIVATE", "m1", 999)], { stored: true }), failed, failed]);
      const out = safe(() => H.withoutCoveredSharedCopy(before, merged, true));
      t.ok(out && typeof out === "object" && !JSON.stringify(out).includes("NEW_PRIVATE") && Array.isArray(out.investments) && out.investments.every((x) => OLD.some((o) => o.id === x.id)) && out.accounts === before.accounts && out.profile === before.profile,
        "GN1-app-b what is left is only ever a part of the old copy: nothing Plus sent is put in the household's data, and nothing else is touched");
      t.eq(before.investments.length, 4, "GN1-app-c (the data handed in is not changed)");
      const none = { profile: {}, accounts };
      t.ok(safe(() => H.withoutCoveredSharedCopy(none, merged, true)) === none, "GN1-app-d no old copy: the same data back, and no `investments` key is ever made");
      t.ok(safe(() => H.withoutCoveredSharedCopy(null, merged, true)) === null, "GN1-app-e no data at all: nothing");

      // what a round delivers
      const now = Date.parse("2026-11-22T12:00:00Z");
      let m = safe(() => H.mergeHoldings([{ id: "old", account_id: "m1", value: 1, _item: "i-mine", _at: now - 86400000 }], [{ item_id: "i-mine" }], [live([h("kept", "m1", 5)], { stale: true, as_of: new Date(now - 3600000).toISOString() })], now));
      t.eq(safe(() => [m.holdings.map((x) => x.id), m.delivered, m.stale, m.plusMode]), [["kept"], false, true, true], "B1-app-h the bank could not be read and the server's kept list is NEWER than what this device holds: it is shown, and counts as nothing delivered");
      m = safe(() => H.mergeHoldings([{ id: "mine-newer", account_id: "m1", value: 1, _item: "i-mine", _at: now - 60000 }], [{ item_id: "i-mine" }], [live([h("kept-older", "m1", 5)], { stale: true, as_of: new Date(now - 3600000).toISOString() })], now));
      t.eq(safe(() => [m.holdings.map((x) => x.id), m.stale]), [["mine-newer"], false], "B1-app-i …an OLDER kept list never replaces what this device already holds");
      m = safe(() => H.mergeHoldings([], [{ item_id: "i-mine" }], [live([h("kept", "m1", 5)], { stale: true, as_of: "not a date" })], now));
      t.eq(safe(() => [m.holdings.map((x) => x.id), m.stale]), [["kept"], true], "B1-app-j a device holding nothing for that bank shows the kept list whatever its date");
      m = safe(() => H.mergeHoldings([], [{ item_id: "i-mine" }, { item_id: "i-theirs", linked_by: "partner" }], [live([h("a", "m1", 5)], { stored: true }), live([], {})], now));
      t.eq(safe(() => [m.banks, m.holdings[0]._at, m.holdings[0]._item]), [[{ item: "i-mine", mine: true, got: "live", stored: true }, { item: "i-theirs", mine: false, got: "live", stored: false }], now, "i-mine"],
        "B1-app-k each bank's outcome is recorded (whose it is, whether it came, whether the server kept it), and a holding carries when it came");

      // the device copy: a stale round is kept without a time, so the banks are asked again
      const s = mem();
      t.eq([safe(() => H.keepPrivateHoldings(s, A, [h("kept", "m1", 5)])), safe(() => H.loadPrivateHoldings(s, A)).length, safe(() => H.holdingsStale(s, A))], [true, 1, true],
        "B1-app-l a kept list shown on this device is saved without a time: the banks are asked again at the next plan check");
      H.savePrivateHoldings(s, A, [h("live", "m1", 6)], now);
      t.eq([safe(() => H.keepPrivateHoldings(s, A, [h("kept2", "m1", 5)])), safe(() => H.holdingsStale(s, A, now + 1000)), safe(() => H.holdingsStale(s, A, now + 31 * 60000))], [true, false, true], "B1-app-m …and it leaves the time of the last live answer as it was");
      t.eq([safe(() => H.keepPrivateHoldings(broken, A, [])), safe(() => H.keepPrivateHoldings(null, A, []))], [false, false], "B1-app-n a device that can save nothing says so");
    }
    {
      const sync = app.slice(app.indexOf("const syncHoldings = useCallback("), app.indexOf("const takePlusAnswer = useCallback("));
      t.ok(/if \(!\(merged\.delivered \|\| merged\.stale\) \|\| getNetWorthState\(\)\.user !== forUser\) return;\s+setPlusHoldings\(allHoldings\);/.test(sync),
        "B1-app-o the app shows a round that brought something: a live answer, or the server's kept list when the bank could not be read");
      t.ok(/const onDevice = merged\.delivered \? savePrivateHoldings\(deviceStore\(\), forUser, allHoldings\) : \(keepPrivateHoldings\(deviceStore\(\), forUser, allHoldings\), false\);/.test(sync),
        "B1-app-p a live round is saved on this device with its time; a kept list alone is saved without one and never counts as saved");
      t.ok(/setAppData\(prev => withoutCoveredSharedCopy\(prev, merged, onDevice\)\);/.test(sync) && !/investments, \.\.\.rest/.test(app),
        "GN1-app-f the old shared copy is cleared in ONE place, by the one rule (lib/plusHoldings.js withoutCoveredSharedCopy)");
      const plusBranch = sync.slice(sync.indexOf("if (plusMode) {"), sync.indexOf("} else if ("));
      t.eq((plusBranch.match(/setAppData\(/g) || []).length, 1, "GN1-app-g with Plus the sync touches the household's data once only, to clear");
      t.ok(!/investments\s*:/.test(plusBranch), "GN1-app-h …and never writes holdings into it");
    }

    // ── 3. NOTHING PLUS SENDS REACHES THE HOUSEHOLD'S DATA ─────────────────────────────────────────
    {
      const P2 = await import("../src/lib/persistence.js");
      const store = mem();
      store.setItem("flourish_plus_holdings", JSON.stringify({ user: A, holdings: [{ id: "SECRET_HOLDING" }] }));
      store.setItem("flourish_nw_mode", "plus"); store.setItem("flourish_nw_user", A); store.setItem("flourish_nw_plus_told", "1");
      store.setItem("flourish_custom_cats", "[]");
      const real = global.localStorage;
      global.localStorage = { getItem: (k) => store.getItem(k), setItem: (k, v) => store.setItem(k, v), removeItem: (k) => store.removeItem(k), get length() { return store.m.size; }, key: (i) => [...store.m.keys()][i] };
      const side = safe(() => P2.readSideKeys());
      global.localStorage = real;
      t.ok(side && typeof side === "object" && "flourish_custom_cats" in side && !JSON.stringify(side).includes("SECRET_HOLDING") && !Object.keys(side).some((k) => /^flourish_(plus_holdings|nw_)/.test(k)),
        "GN1-blob-a the device's private Plus copy is not one of the device keys that are saved to the cloud");
      const payload = app.slice(app.indexOf("const householdPayload = ("), app.indexOf("const householdGone = ()"));
      t.ok(/buildHouseholdBlob\(\{ onboarded: ob, slimAppData, checkInBonus: cb \}/.test(payload) && !/getNetWorthState|plusHoldings|loadPrivate/.test(payload), "GN1-blob-b the household's save is built from the household's data and those keys only: the Plus state is not read for it");
      const beacon = app.slice(app.indexOf("const beaconPersist = (payload) => {"), app.indexOf("const beaconPersist = (payload) => {") + 2200);
      t.ok(beacon.length > 300 && !/getNetWorthState|plusHoldings|loadPrivate/.test(beacon), "GN1-blob-c the exit save sends that same payload and nothing of the Plus state");
      const ctx = app.slice(app.indexOf("const buildContext = (userText = \"\")=>{"), app.indexOf("const buildContext = (userText = \"\")=>{") + 9000);
      t.ok(ctx.length > 500 && !/getNetWorthState|nwState\.holdings|plusHoldings|loadPrivate|\.investments/.test(ctx), "GN1-blob-d the coach's context holds no holdings, Plus or old");
      t.eq((app.match(/setPlusHoldings\(/g) || []).length, 1, "GN1-blob-e Plus holdings are put in the page's Plus state in one place (the sync), and that state is never saved with the household's data");
      const writers = (app.match(/investments\s*:/g) || []).length;
      t.eq(writers, 1, "GN1-blob-f one line in the whole app writes `investments` into the household's data, and it is the path without Plus");
      const exp = app.slice(app.indexOf("const exportMyData = () => {"), app.indexOf("const exportMyData = () => {") + 3200);
      t.ok(/plusExport\(getNetWorthState\(\)\)/.test(exp), "GN1-blob-g the export of one's own data is the only other reader of the Plus state, and it is a file for that person");
      const X2 = X; X2._resetForTests(); X2.setPlusUser(A, mem()); X2.setPlusAnswer({ status: 200, body: { enabled: true, plus: true } }, mem(), A);
      X2.setPlusHoldings([{ id: "mine", _item: "i1" }, { id: "theirs", _item: "i2" }], A); X2.setItemOwners([{ item_id: "i1" }, { item_id: "i2", linked_by: "partner" }], A, mem());
      t.eq(safe(() => X2.plusExport(X2.getNetWorthState()).holdings.map((x) => x.id)), ["mine"], "GN1-blob-h …and holds only their own");
      X2._resetForTests();
    }

    // ── 4. N2 (as fixed on fix-review-1122): WITHOUT PLUS ───────────────────────────────────────────
    {
      const items = [{ item_id: "item-A" }, { item_id: "item-B" }];
      const accounts = [{ id: "a-tfsa", _item: "item-A" }, { id: "b-rrsp", _item: "item-B" }, { id: "typed" }];
      const A1 = { id: "a-tfsa_s1", account_id: "a-tfsa", name: "A Fund", value: 12000 };
      const B1 = { id: "b-rrsp_s1", account_id: "b-rrsp", name: "B Fund", value: 8000 };
      const okp = (holdings, more = {}) => ({ status: "fulfilled", value: { holdings, ...more } });
      const failed = { status: "rejected", reason: new Error("bank down") };
      const ids = (l) => (Array.isArray(l) ? l.map((x) => `${x.account_id}:${x.value}`).sort() : l);
      const after = (results, prev = [A1, B1], accts = accounts) => safe(() => ids(H.plainHoldingsAfter(prev, H.mergeHoldings([], items, results), accts)));
      const bare = (l) => l.map(({ id, ...rest }) => rest);
      t.eq(after([failed, okp(bare([{ ...B1, value: 8100 }]))], bare([A1, B1])), ["a-tfsa:12000", "b-rrsp:8100"],
        "N2a holdings with NO id: bank A failed and bank B answered: A's stays and B's is replaced, by their BANK (was: both old ones dropped, undefined matched undefined)");
      t.eq(after([okp([]), okp([])]), [], "N2b every bank answered and holds nothing now: the old holdings go (was: null, so they stayed for ever)");
      t.eq(after([okp([]), failed]), ["b-rrsp:8000"], "N2c one answered with nothing and one failed: the failed bank's stays, the other's goes (was: null, nothing changed)");
      t.eq(after([failed, failed]), null, "N2d no bank answered: nothing to change (null), as before");
      t.eq(after([okp([], { unavailable: true }), okp([], { unavailable: true })]), null, "N2e the server could read neither bank: the same");
      const typed = { id: "typed_x", account_id: "typed", name: "Typed", value: 50 };
      t.eq(after([okp([]), okp([{ ...B1, value: 8100 }])], [typed, A1, B1]), ["b-rrsp:8100", "typed:50"], "N2f a holding on an account no bank linked is not a bank's to remove");
      t.eq(after([okp([]), okp([{ ...B1, value: 8100 }])], [{ id: "x_s1", account_id: "gone", name: "Orphan", value: 5 }, B1]), ["b-rrsp:8100"], "N2g a holding whose account is gone, in a round where every bank answered: it is no failed bank's, so it goes");
      t.eq(after([failed, okp([{ ...B1, value: 8100 }])], [{ id: "x_s1", account_id: "gone", name: "Orphan", value: 5 }, B1]), ["b-rrsp:8100", "gone:5"], "N2h …while a bank failed it may be that bank's: it stays");
      t.eq(after([failed, okp([{ id: "acc_undefined", account_id: "b-rrsp", name: "Three", value: 3 }])], [{ id: "acc_undefined", account_id: "gone", name: "One", value: 1 }, { id: "acc_undefined", account_id: "gone", name: "Two", value: 2 }]),
        ["b-rrsp:3", "gone:1", "gone:2"], "N2i an id made from a missing security is no identity: different holdings are never matched on it");
      t.eq(after([okp(bare([A1])), okp(bare([{ ...B1, value: 8100 }]))], bare([A1, B1]), []), ["a-tfsa:12000", "b-rrsp:8100"], "N2j accounts not stamped with their bank, every bank answered: what came, once, nothing twice");
      // Plus's own path already goes by the bank and already takes an all-empty round
      const lv = (holdings) => ({ status: "fulfilled", value: { holdings, plus_mode: true, stored: true } });
      let m = safe(() => H.mergeHoldings(bare([A1, B1]).map((x, i) => ({ ...x, _item: i ? "item-B" : "item-A" })), items, [failed, lv(bare([{ ...B1, value: 8100 }]))]));
      t.eq(safe(() => [ids(m.holdings), m.delivered]), [["a-tfsa:12000", "b-rrsp:8100"], true], "N2k with Plus the same holds: a holding with no id stays or goes with its bank");
      m = safe(() => H.mergeHoldings([{ ...A1, _item: "item-A" }, { ...B1, _item: "item-B" }], items, [lv([]), lv([])]));
      t.eq(safe(() => [m.holdings, m.delivered]), [[], true], "N2l …and a round where every bank answers with nothing is delivered: nothing is held");
      const sync = app.slice(app.indexOf("const syncHoldings = useCallback("), app.indexOf("const takePlusAnswer = useCallback("));
      t.ok(/\} else if \(merged\.plainAnswered\.length > 0\) \{/.test(sync) && !/allHoldings\.length > 0/.test(sync), "N2m the app applies a round whenever a bank ANSWERED, also when all of them answered with nothing");
    }

    // ── 5. H8: A DEVICE LAST TOLD "today" ──────────────────────────────────────────────────────────
    {
      const TODAY = { status: 404, body: null };
      const GONE = [null, { status: 500, body: null }, { status: 502, body: null }, { status: 503, body: null }, { status: 504, body: null }, { status: 401, body: { error: "unauthorized" } }, { status: 429, body: {} }, { status: 500, body: { error: "server_error" } }];
      const told = (failure, reload) => {
        const d = mem(); X._resetForTests(); X.setPlusUser(A, d);
        const first = X.setPlusAnswer(TODAY, d, A);
        if (reload) { X._resetForTests(); X.setPlusUser(A, d); }
        return [first, X.setPlusAnswer(failure, d, A)];
      };
      t.eq(GONE.map((f) => told(f, false)), Array(GONE.length).fill(["today", "today"]), "H8a last told \"today\", then a check that did not get through (no answer, 500, 502, 503, 504, 401, 429): still \"today\", never \"unavailable\"");
      t.eq(GONE.map((f) => told(f, true)), Array(GONE.length).fill(["today", "today"]), "H8b …the same after a reload of the app");
      t.eq(GONE.map((f) => { X._resetForTests(); X.setPlusUser(A, broken); X.setPlusAnswer(TODAY, broken, A); return X.setPlusAnswer(f, broken, A); }), Array(GONE.length).fill("today"), "H8c …and on a device that can save nothing");
      t.eq(GONE.map((f) => X.netWorthMode(f, "today", true)), Array(GONE.length).fill("today"), "H8d the rule itself: last mode \"today\" on a device never told Plus is on");
      t.eq(told({ status: 503, body: { error: "status_unavailable" } }, false), ["today", "unavailable"],
        "H8e the one answer that ends it is not a failed check at all: the server's OWN Plus code saying Plus is on here now and it could not read the plan. Net worth is then behind Plus, so no figure is shown on a guess");
      X._resetForTests();
    }

    // ── 6. M5: WHO LINKED EACH BANK, EVERY TIME THE BANKS ARE READ ─────────────────────────────────
    {
      const i = app.indexOf("async function getUserItems() {"); const fn = app.slice(i, app.indexOf("\n}\n", i) + 2);
      t.ok(/const forUser = getNetWorthState\(\)\.user;/.test(fn) && fn.indexOf("const forUser = getNetWorthState().user;") < fn.indexOf("await getJwt()"), "M5a the one function that reads the banks notes who is signed in before it asks");
      t.ok(/const items = resp\.items \|\| \[\];\s+if \(getNetWorthState\(\)\.mode === "plus"\) setItemOwners\(items, forUser\);\s+return items;/.test(fn),
        "M5b …and with Plus, every successful read of the banks refreshes who linked each one (was: only at the plan check and the first load, so a bank connected later stayed \"unknown\" and out of net worth until a reload)");
      const failAt = fn.indexOf("} catch (err) {");
      t.ok(failAt > 0 && !/setItemOwners/.test(fn.slice(failAt)), "M5c a read that FAILED changes nothing: the owners already known are kept (an empty list would hide every account)");
      X._resetForTests(); X.setPlusUser(A, mem()); X.setItemOwners([{ item_id: "i1" }], A, mem());
      X.setItemOwners([{ item_id: "i1" }, { item_id: "i2" }], B, mem());
      t.eq(Object.keys(X.getNetWorthState().owners), ["i1"], "M5d a read that lands after another account signed in is dropped (it says whose it is)");
      // getUserItems answers [] when the read FAILED, and two older call sites still hand that straight on.
      const dev = mem(); X._resetForTests(); X.setPlusUser(A, dev); X.setItemOwners([{ item_id: "i1" }, { item_id: "i2", linked_by: "partner" }], A, dev);
      X.setItemOwners([], A, dev);
      t.eq([X.getNetWorthState().owners, H.loadPrivateCopy(dev, A).owners], [{ i1: "me", i2: "partner" }, { i1: "me", i2: "partner" }],
        "M5e an EMPTY bank list never replaces owners already known, in the page or on the device (a failed read used to blank them, hiding every linked account until the next read)");
      X.setItemOwners([{ item_id: "i3" }], A, dev);
      t.eq(X.getNetWorthState().owners, { i3: "me" }, "M5f a real list still replaces them");
      X._resetForTests(); X.setPlusUser(A, mem()); X.setItemOwners([], A, mem());
      t.eq(X.getNetWorthState().owners, {}, "M5g with nothing known yet an empty list is simply empty");
      X._resetForTests();
    }

    // ── ROUND 3 (2026-11-22), NEW-2: THE BANK'S OWN ROW CANNOT BE READ ─────────────────────────────
    // The kept list was answered only when Plaid failed. When the bank's row itself could not be read (the database
    // blinked on plaid_items), the request stopped before that with "item not found", so a device with no copy of
    // its own showed no holdings though the server had them. Now, for someone signed in, with Plus, on 1.1.8: the
    // kept list in their own name, or a household partner's through the same share filter. Nobody else's, ever.
    {
      process.env.PLUS_ENABLED = "true";
      const C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
      P.by = { "access-a-0": A_HOLDS, "access-b-0": B_HOLDS };
      const db = makeDb({ items: { [A]: 1, [B]: 1 }, partner: true, plus: A, shares: [[A, "acct-a1", true], [A, "acct-a2", false]] });
      const liveA = await call(load(db, A), GET_A);
      const liveForB = await call(load(db, B), GET_A);                      // the partner, live: A's shared account only
      t.eq([liveA.body.stored, show(liveForB.body.holdings)], [true, ["acct-a1:S1:100", "acct-a1:S2:200"]], "NEW2-0 (set-up: A's list is kept; live, the partner is sent A's shared account only)");
      const asOf = db.state.rows.plus_holdings.find((r) => r.user_id === A).fetched_at;
      db.state.fail.plaid_items = true; P.calls.length = 0;
      const mine = await call(load(db, A), GET_A);
      t.eq([mine.status, show(mine.body.holdings), mine.body.stale, mine.body.as_of, mine.body.plus_mode, "stored" in mine.body, "error" in mine.body],
        [200, ["acct-a1:S1:100", "acct-a1:S2:200", "acct-a2:S1:50"], true, asOf, true, false, false],
        "NEW2-a the bank's row cannot be read: its owner is answered the kept list, stale, with when it came (was: 400 item not found, and nothing)");
      const theirs = await call(load(db, B), GET_A);
      t.eq([theirs.status, show(theirs.body.holdings), theirs.body.stale, theirs.body.as_of], [200, show(liveForB.body.holdings), true, asOf],
        "NEW2-b the partner is answered exactly what a live answer would send them: the shared account, never the private one");
      t.ok(!JSON.stringify(theirs.body).includes("acct-a2"), "NEW2-c …the owner's private account is nowhere in it");
      t.eq(P.calls.filter((c) => /holdings\/get/.test(c.url)).length, 0, "NEW2-d Plaid is not asked: there is no token to ask with");
      t.eq(db.state.writes.filter((w) => w[0] === "plus_holdings").length, 2, "NEW2-e nothing is written to the store by it (the two saves are the set-up's)");
      // somebody outside the household, with Plus of their own
      const dbC = makeDb({ items: { [A]: 1 }, plus: C });
      dbC.state.rows.plus_holdings.push({ user_id: A, item_id: "a-item-0", holdings: liveA.body.holdings, fetched_at: asOf });
      dbC.state.fail.plaid_items = true;
      const stranger = await call(load(dbC, C), GET_A);
      t.eq([stranger.status, stranger.body.error, "holdings" in stranger.body], [400, "item not found for this user", false], "NEW2-f someone who is neither the owner nor their partner is refused as before, whatever the store holds");
      // nothing shared with the partner
      const dbN = makeDb({ items: { [A]: 1 }, partner: true, plus: A, shares: [[A, "acct-a1", false]] });
      dbN.state.rows.plus_holdings.push({ user_id: A, item_id: "a-item-0", holdings: liveA.body.holdings, fetched_at: asOf });
      dbN.state.fail.plaid_items = true;
      const unshared = await call(load(dbN, B), GET_A);
      t.eq([unshared.status, "holdings" in unshared.body], [400, false], "NEW2-g a partner with nothing shared is sent nothing");
      // the sharing choices cannot be read: nothing, never a guess
      db.state.fail.net_worth_shares = true;
      const blind = await call(load(db, B), GET_A);
      t.eq([blind.status, "holdings" in blind.body], [400, false], "NEW2-h the owner's sharing choices cannot be read: the partner is sent nothing");
      db.state.fail.net_worth_shares = false;
      // an older app, and an account without Plus
      const old = await call(load(db, A), GET_A, null);
      t.eq([old.status, "holdings" in old.body], [400, false], "NEW2-i an app before 1.1.8 is never sent the kept list (it would put it in the household's shared data)");
      const dbNoPlus = makeDb({ items: { [A]: 1 } });
      dbNoPlus.state.rows.plus_holdings.push({ user_id: A, item_id: "a-item-0", holdings: liveA.body.holdings, fetched_at: asOf });
      dbNoPlus.state.fail.plaid_items = true;
      const noPlus = await call(load(dbNoPlus, A), GET_A);
      t.eq([noPlus.status, "holdings" in noPlus.body], [400, false], "NEW2-j without Plus nothing kept is read or sent");
      // nothing kept, the table not there yet, and Plus off: as before
      const dbEmpty = makeDb({ items: { [A]: 1 }, plus: A }); dbEmpty.state.fail.plaid_items = true;
      t.eq((await call(load(dbEmpty, A), GET_A)).status, 400, "NEW2-k nothing kept for that bank: the same 400 as before");
      const dbMissing = makeDb({ items: { [A]: 1 }, plus: A }); dbMissing.state.fail.plaid_items = true; dbMissing.state.missing.plus_holdings = true;
      t.eq((await call(load(dbMissing, A), GET_A)).status, 400, "NEW2-l before 0055 is run: the same 400 as before, no crash");
      delete process.env.PLUS_ENABLED;
      const off = await call(load(db, A), GET_A);
      t.eq([off.status, "holdings" in off.body], [400, false], "NEW2-m with Plus switched off nothing changes at all");
      process.env.PLUS_ENABLED = "true";
      t.eq((await call(load(db, A), { action: "get_investments" })).status, 400, "NEW2-n no bank named: 400, as before");
      // NEW-1, the server's side: a save the database refuses because the bank is gone is "not stored", never an error
      const dbGone = makeDb({ items: { [A]: 1 }, plus: A }); dbGone.state.failWrite.plus_holdings = true;
      const gone = await call(load(dbGone, A), GET_A);
      t.eq([gone.status, gone.body.stored, show(gone.body.holdings).length], [200, false, 3], "NEW1-a a save the database refuses answers stored: false; the read itself is not failed");
    }
  } finally {
    global.fetch = realFetch; console.error = quiet.e; console.warn = quiet.w;
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  }
  t.summary("plusRound2Holdings");
})().catch((e) => { console.error(e); process.exit(1); });
