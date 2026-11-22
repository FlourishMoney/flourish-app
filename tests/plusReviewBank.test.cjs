// tests/plusReviewBank.test.cjs
// -----------------------------------------------------------------------------
// THE 2026-11-22 REVIEW OF PLUS 1.1.8 (ChatGPT, Grok, Gemini), THE BANK AND NET WORTH SERVER FINDINGS. Each finding is
// held here as REAL (a check that failed before its fix) or NOT REAL (a check that shows it cannot happen).
//   1  holdings that could not be fetched say so (unavailable), so the app keeps what it had; a real "none" does not
//   2  H3   two new banks finishing at the same moment cannot both pass the limit: checked again after the write
//   3  M2   a refused new item is removed at Plaid in up to three tries, and one that cannot be is named for a person
//   4  M3   the 50-entry cap holds when two entries are saved at the same moment
//   5  M4   a new entry saved twice with the app's own id for it is one entry
//   6  NOT REAL: H1 (three tiers by design), H2 (a second sign-in at a bank already held adds no bank), M1 (a reconnect
//      always names its item), Grok LOW 1 (a household has at most two members)
// -----------------------------------------------------------------------------
"use strict";
const fs = require("fs");
const path = require("path");
const { create } = require("./_runner.cjs");

const AUTH_PATH = require.resolve("../netlify/functions/_lib/auth.js");
const PLUS_PATH = require.resolve("../netlify/functions/_lib/plusAddon.js");
const LIM_PATH = require.resolve("../netlify/functions/_lib/bankLimits.js");
const NW_PATH = require.resolve("../netlify/functions/networth.js");
const PLAID_PATH = require.resolve("../netlify/functions/plaid.js");
const REPO = path.join(__dirname, "..");
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const future = new Date(Date.now() + 20 * 86400000).toISOString();
const PK = { plaid_items: ["user_id", "item_id"], net_worth_entries: ["id"], net_worth_shares: ["user_id", "account_id"], plaid_account_owners: ["user_id", "account_id"] };
let uuidN = 0;
const newId = () => `00000000-0000-4000-8000-${String(++uuidN).padStart(12, "0")}`;

// items: { [user]: n } banks each (institutions ins_<user letter>_<i>). plus: the account that bought Plus.
// state.before: (table, op, row) => void, run before every write (a test puts "the other request" there).
// state.fail[table] = true: every read of that table fails from then on.
function makeDb({ items = {}, partner = false, plus = null, entries = {} } = {}) {
  const state = { rows: { plaid_items: [], household_members: [], plus_addon_subscriptions: [], complimentary_access: [], net_worth_entries: [], net_worth_shares: [], plaid_account_owners: [] }, writes: [], before: null, fail: {} };
  for (const [user, n] of Object.entries(items)) for (let i = 0; i < n; i++) state.rows.plaid_items.push({ user_id: user, item_id: `${user.slice(0, 1)}-item-${i}`, status: "active", access_token: `access-${user.slice(0, 1)}-${i}`, institution_id: `ins_${user.slice(0, 1)}_${i}`, institution_name: `Bank ${user.slice(0, 1)}${i}` });
  for (const [user, n] of Object.entries(entries)) for (let i = 0; i < n; i++) state.rows.net_worth_entries.push({ id: newId(), user_id: user, kind: "home", label: `e${i}`, value_cents: 100, currency: "CAD", shared: false });
  if (partner) state.rows.household_members.push({ user_id: A, household_id: "h1", role: "owner" }, { user_id: B, household_id: "h1", role: "partner" });
  if (plus) state.rows.plus_addon_subscriptions.push({ user_id: plus, provider: "stripe", plan_key: "plus_monthly", status: "active", product_id: "price_pm", current_period_end: future });
  const from = (table) => {
    const rows = () => (state.rows[table] = state.rows[table] || []);
    const pkOf = (row, keys) => (r) => keys.every((k) => r[k] === row[k]);
    const filtered = (f) => rows().filter((r) => f.every((fn) => fn(r)));
    const err = () => (state.fail[table] ? { code: "57014", message: "timeout" } : null);
    const q = {
      f: [],
      select() { return q; }, eq(c, v) { q.f.push((r) => r[c] === v); return q; }, in(c, vs) { q.f.push((r) => vs.includes(r[c])); return q; }, not() { return q; },
      async maybeSingle() { const e = err(); return e ? { data: null, error: e } : { data: filtered(q.f)[0] || null, error: null }; },
      async single() { const e = err(); if (e) return { data: null, error: e }; const h = filtered(q.f)[0]; return h ? { data: h, error: null } : { data: null, error: { message: "none" } }; },
      then(res, rej) { const e = err(); const h = e ? null : filtered(q.f); return Promise.resolve(e ? { data: null, error: e } : { data: h, error: null, count: h.length }).then(res, rej); },
      async upsert(row, opts) {
        if (state.before) state.before(table, "upsert", row);
        state.writes.push([table, "upsert"]);
        for (const one of Array.isArray(row) ? row : [row]) {
          const keys = opts && opts.onConflict ? opts.onConflict.split(",") : (PK[table] || ["user_id"]);
          const i = rows().findIndex(pkOf(one, keys));
          if (i >= 0) rows()[i] = { ...rows()[i], ...one }; else rows().push({ ...one });
        }
        return { error: null };
      },
      insert(row) {
        if (state.before) state.before(table, "insert", row);
        state.writes.push([table, "insert"]);
        const r = { ...row }; if (table === "net_worth_entries" && !r.id) r.id = newId();
        const dup = PK[table] && rows().some(pkOf(r, PK[table]));
        if (!dup) rows().push(r);
        const out = dup ? { data: null, error: { code: "23505", message: "duplicate key value violates unique constraint" } } : { data: [r], error: null };
        return { select: async () => out, then: (res, rej) => Promise.resolve(out).then(res, rej) };
      },
      update(p) {
        const u = { f: [], eq(c, v) { u.f.push((r) => r[c] === v); return u; },
          _run() { state.writes.push([table, "update"]); const hit = filtered(u.f); hit.forEach((r) => Object.assign(r, p)); return { data: hit.map((r) => ({ id: r.id })), error: null }; },
          async select() { return u._run(); }, then(res, rej) { return Promise.resolve(u._run()).then(res, rej); } };
        return u;
      },
      delete() {
        const d = { f: [], eq(c, v) { d.f.push((r) => r[c] === v); return d; },
          then(res, rej) { state.writes.push([table, "delete"]); state.rows[table] = rows().filter((r) => !d.f.every((fn) => fn(r))); return Promise.resolve({ error: null }).then(res, rej); } };
        return d;
      },
    };
    return q;
  };
  const rpc = async (name, args) => {
    if (name === "household_disconnect_item") {
      const n = state.rows.plaid_items.length;
      state.rows.plaid_items = state.rows.plaid_items.filter((r) => !(r.user_id === args.p_user && r.item_id === args.p_item));
      state.writes.push(["plaid_items", "disconnect"]);
      return { data: { result: state.rows.plaid_items.length < n ? "removed" : "not_found" }, error: null };
    }
    return { data: null, error: null };
  };
  return { state, admin: { from, rpc, auth: { admin: {} } } };
}

// plan: what the main plan says of this person ({ unlimited: true } a paid plan or its trial; false the free plan).
function load(db, user, plan = { unlimited: true }) {
  for (const p of [AUTH_PATH, PLUS_PATH, LIM_PATH, NW_PATH, PLAID_PATH]) delete require.cache[p];
  const real = require(AUTH_PATH);
  require.cache[AUTH_PATH].exports = { ...real, getAdminClient: () => db.admin, getUserFromRequest: async () => ({ user_id: user, error: null }), getUserPlan: async () => ({ plan: plan.unlimited ? "plus" : "free", unlimited: !!plan.unlimited, status_unavailable: false }) };
  return { plaid: require(PLAID_PATH), nw: require(NW_PATH), lim: require(LIM_PATH) };
}
const call = async (fn, body) => {
  const r = await fn.handler({ httpMethod: "POST", headers: { origin: "https://flourishmoney.app", authorization: "Bearer x" }, body: JSON.stringify({ client_version: "1.1.8", ...body }) });
  let b = null; try { b = JSON.parse(r.body); } catch { b = null; }
  return { status: r.statusCode, body: b };
};

(async () => {
  const t = create();
  const saved = { ...process.env };
  const errors = [];
  const quiet = { e: console.error, w: console.warn }; console.error = (...a) => { errors.push(a.map(String).join(" ")); }; console.warn = () => {};
  const realFetch = global.fetch;
  // The pretend Plaid. removeFails: how many /item/remove calls fail before one works. holdings: "fail" | "none" | "some".
  const P = { calls: [], nextItem: "item-new", removeFails: 0, holdings: "some", byToken: {} };
  const ok = (j) => ({ ok: true, status: 200, json: async () => j });
  const no = () => ({ ok: false, status: 500, json: async () => ({ error_code: "INTERNAL_SERVER_ERROR", error_message: "plaid is down" }) });
  global.fetch = async (url, init) => {
    const u = String(url).replace(/^https:\/\/[^/]+/, ""); const body = init && init.body ? JSON.parse(init.body) : {};
    P.calls.push({ url: u, token: body.access_token || null });
    if (/item\/remove/.test(u)) { if (P.removeFails > 0) { P.removeFails--; return no(); } return ok({ removed: true }); }
    if (/link\/token\/create/.test(u)) return ok({ link_token: "link-sandbox-x" });
    if (/public_token\/exchange/.test(u)) return ok({ access_token: "access-sandbox-new", item_id: P.nextItem });
    if (/item\/get/.test(u)) return ok({ item: P.byToken[body.access_token] || { item_id: "item-legacy", institution_id: "ins_legacy" } });
    if (/investments\/holdings\/get/.test(u)) {
      if (P.holdings === "fail") return no();
      if (P.holdings === "none") return ok({ accounts: [{ account_id: "acct-1" }], securities: [], holdings: [] });
      return ok({ accounts: [{ account_id: "acct-1", subtype: "tfsa" }], securities: [{ security_id: "s1", name: "Fund", ticker_symbol: "TEST", close_price: 10, iso_currency_code: "CAD" }], holdings: [{ account_id: "acct-1", security_id: "s1", quantity: 3, institution_value: 30 }] });
    }
    return ok({});
  };
  const removes = () => P.calls.filter((c) => /item\/remove/.test(c.url));
  const reset = () => { P.calls.length = 0; P.nextItem = "item-new"; P.removeFails = 0; P.holdings = "some"; errors.length = 0; };
  for (const k of Object.keys(process.env)) if (/^PLUS_ENABLED$|^PLUS_TESTER_USER_IDS$|^HOUSEHOLD_ENABLED$|^ENFORCE_PLAN_LIMITS$|^STRIPE_PRICE_/.test(k)) delete process.env[k];
  Object.assign(process.env, { PLAID_CLIENT_ID: "test-client", PLAID_SECRET: "test-secret", PLAID_ENV: "sandbox", HOUSEHOLD_ENABLED: "true",
    STRIPE_PRICE_MONTHLY_CAD: "price_m", STRIPE_PRICE_ANNUAL_CAD: "price_a", STRIPE_PRICE_FOUNDING_ANNUAL_CAD: "price_f", STRIPE_PRICE_PLUS_MONTHLY_CAD: "price_pm", STRIPE_PRICE_PLUS_ANNUAL_CAD: "price_pa" });
  const src = (...p) => fs.readFileSync(path.join(REPO, ...p), "utf8");
  const banks = (db, user) => db.state.rows.plaid_items.filter((r) => !user || r.user_id === user).length;
  const NEW_BANK = { action: "exchange_token", public_token: "public-sandbox-x", institution_name: "New Bank", institution_id: "ins_new" };

  try {
    process.env.PLUS_ENABLED = "true";

    // ── 1. Holdings that could not be fetched say so ─────────────────────────────────────────────────
    {
      const GET = { action: "get_investments", item_id: "a-item-0" };
      reset(); P.holdings = "fail";
      const down = await call(load(makeDb({ items: { [A]: 1 }, plus: A }), A).plaid, GET);
      t.eq([down.status, down.body], [200, { holdings: [], unavailable: true, plus_mode: true }], "1a Plaid could not be asked: no holdings, and the answer says it could not fetch them (the app keeps what it had)");
      reset();
      const planDb = makeDb({ items: { [A]: 1 }, plus: A }); planDb.state.fail.plus_addon_subscriptions = true;
      const plan = await call(load(planDb, A).plaid, GET);
      t.eq([plan.body.unavailable, plan.body.holdings, P.calls.filter((c) => /holdings/.test(c.url)).length], [true, [], 0], "1b the plan could not be read: the same, and Plaid is not asked");
      reset();
      const shareDb = makeDb({ items: { [B]: 1 }, partner: true, plus: A }); shareDb.state.fail.net_worth_shares = true;
      const share = await call(load(shareDb, A).plaid, { action: "get_investments", item_id: "b-item-0" });
      t.eq([share.body.unavailable, share.body.holdings], [true, []], "1c a partner's bank whose sharing choices could not be read: the same");
      reset();
      const locked = await call(load(makeDb({ items: { [A]: 1 } }), A).plaid, GET);
      const unshared = await call(load(makeDb({ items: { [B]: 1 }, partner: true, plus: A }), A).plaid, { action: "get_investments", item_id: "b-item-0" });
      P.holdings = "none";
      const none = await call(load(makeDb({ items: { [A]: 1 }, plus: A }), A).plaid, GET);
      P.holdings = "some";
      const some = await call(load(makeDb({ items: { [A]: 1 }, plus: A }), A).plaid, GET);
      t.eq([locked.body, unshared.body, none.body, some.body.holdings.length, "unavailable" in some.body],
        [{ holdings: [], locked: true, plus_mode: true }, { holdings: [], plus_mode: true }, { holdings: [], plus_mode: true }, 1, false],
        "1d a real 'none' (no Plus, nothing shared, the bank holds none) and a real answer never say unavailable");
      delete process.env.PLUS_ENABLED; reset(); P.holdings = "fail";
      const off = await call(load(makeDb({ items: { [A]: 1 } }), A).plaid, GET);
      t.eq(off.body, { holdings: [] }, "1e PLUS_ENABLED off: a failed fetch answers exactly as today");
      process.env.PLUS_ENABLED = "true";
    }

    // ── 2. H3: two new banks at the same moment ──────────────────────────────────────────────────────
    {
      // The other request's bank lands between this request's limit read and its write.
      const meanwhile = (db, row) => { db.state.before = (table, op) => { if (table === "plaid_items" && op === "upsert") { db.state.before = null; db.state.rows.plaid_items.push({ status: "active", access_token: "access-other", institution_id: "ins_other", institution_name: "Other Bank", ...row }); } }; };
      reset();
      const hh = makeDb({ items: { [A]: 5, [B]: 4 }, partner: true, plus: A });
      meanwhile(hh, { user_id: B, item_id: "b-item-other" });
      const r = await call(load(hh, A).plaid, NEW_BANK);
      t.eq([r.status, r.body, banks(hh), hh.state.rows.plaid_items.some((x) => x.item_id === "item-new"), hh.state.rows.plaid_items.some((x) => x.item_id === "b-item-other"), removes().map((c) => c.token)],
        [402, { error: "bank_limit", scope: "household", used: 10, limit: 10 }, 10, false, true, ["access-sandbox-new"]],
        "2a H3 with Plus at 9 of 10, the partner's new bank lands first: this one is refused after the write, removed at Plaid and from the table, and 10 stay (not 11)");
      reset();
      const one = makeDb({ items: { [A]: 1 } });
      meanwhile(one, { user_id: A, item_id: "a-item-other" });
      const p = await call(load(one, A).plaid, NEW_BANK);
      t.eq([p.status, p.body, banks(one, A), removes().length], [402, { error: "bank_limit", scope: "person", used: 2, limit: 2 }, 2, 1],
        "2b H3 on the basic plan at 1 of 2, the same person's other device lands first: refused, and 2 stay (not 3)");
      reset();
      const room = makeDb({ items: { [A]: 5, [B]: 4 }, partner: true, plus: A });
      const fine = await call(load(room, A).plaid, NEW_BANK);
      t.eq([fine.status, fine.body && fine.body.ok, banks(room), removes().length], [200, true, 10, 0], "2c nobody else at that moment: the tenth bank is saved and nothing is removed");
      reset();
      const blind = makeDb({ items: { [A]: 1 } });
      blind.state.before = (table, op) => { if (table === "plaid_items" && op === "upsert") { blind.state.before = null; blind.state.fail.plus_addon_subscriptions = true; } };
      const kept = await call(load(blind, A).plaid, NEW_BANK);
      t.eq([kept.status, banks(blind, A), removes().length], [200, 2, 0], "2d the second look cannot be read: the bank just saved stays connected, and nothing is undone on a guess");
      reset(); P.removeFails = 3;
      const stuck = makeDb({ items: { [A]: 1 } });
      meanwhile(stuck, { user_id: A, item_id: "a-item-other" });
      const st = await call(load(stuck, A).plaid, NEW_BANK);
      t.eq([st.status, banks(stuck, A), removes().length, stuck.state.rows.plaid_items.some((x) => x.item_id === "item-new")], [200, 3, 3, true],
        "2e Plaid cannot remove the extra one (three tries): it stays connected with its row, never live at Plaid with no row");
      reset(); P.nextItem = "item-relink";
      const over = makeDb({ items: { [A]: 4 } });
      const re = await call(load(over, A).plaid, { ...NEW_BANK, institution_id: "ins_a_1", institution_name: "Bank a1" });
      t.eq([re.status, banks(over, A), over.state.rows.plaid_items.filter((x) => x.item_id.startsWith("a-item-")).length], [200, 4, 3],
        "2f a household already over its plan loses nothing: a re-link of a bank it holds goes through, and only the older sign-in at that bank is replaced");
      // migrate_items: the same second look after each new bank; a bank from an old device is never removed at Plaid.
      reset(); P.byToken["access-legacy-1"] = { item_id: "item-legacy-1", institution_id: "ins_l1" };
      const mig = makeDb({ items: { [A]: 1 } });
      meanwhile(mig, { user_id: A, item_id: "a-item-other" });
      const m = await call(load(mig, A).plaid, { action: "migrate_items", tokens: [{ token: "access-legacy-1", institution_name: "Legacy" }] });
      t.eq([m.status, m.body.successes, m.body.failures, banks(mig, A), mig.state.rows.plaid_items.some((x) => x.item_id === "item-legacy-1"), removes().length],
        [200, [], [{ error: "bank_limit", scope: "person", used: 2, limit: 2 }], 2, false, 0],
        "2g H3 migrate_items: the same, and the refused bank's row is taken back out without touching it at Plaid");
      reset();
      const migOk = makeDb({ items: { [A]: 1 } });
      const mo = await call(load(migOk, A).plaid, { action: "migrate_items", tokens: [{ token: "access-legacy-1", institution_name: "Legacy" }] });
      t.eq([mo.body.successes, mo.body.failures, banks(migOk, A)], [[{ item_id: "item-legacy-1" }], [], 2], "2h migrate_items with room: saved as before");
    }

    // ── 3. M2: a refused new item that Plaid will not remove at once ─────────────────────────────────
    {
      reset(); P.removeFails = 2;
      const db = makeDb({ items: { [A]: 2 } });
      const r = await call(load(db, A).plaid, NEW_BANK);
      t.eq([r.status, r.body && r.body.error, removes().length, banks(db, A), errors.some((e) => /item-new/.test(e))], [402, "bank_limit", 3, 2, false],
        "3a M2 a new bank past the limit: Plaid fails twice, the third try removes it, and nothing is left to do by hand");
      reset(); P.removeFails = 3;
      const db2 = makeDb({ items: { [A]: 2 } });
      const r2 = await call(load(db2, A).plaid, NEW_BANK);
      const line = errors.find((e) => /item-new/.test(e)) || "";
      t.eq([r2.status, removes().length, /item-new/.test(line), /access-sandbox-new/.test(errors.join("\n"))], [402, 3, true, false],
        "3b M2 Plaid fails three times: the refusal stands, and one error line names the item (never its token) so it can be removed by hand");
    }

    // ── 4. M3: the 50-entry cap at the same moment ───────────────────────────────────────────────────
    {
      const ENTRY = { action: "save_entry", kind: "car", label: "Car", value: 9000, currency: "CAD" };
      const db = makeDb({ plus: A, entries: { [A]: 49 } });
      db.state.before = (table, op) => { if (table === "net_worth_entries" && op === "insert") { db.state.before = null; db.state.rows.net_worth_entries.push({ id: newId(), user_id: A, kind: "home", label: "other tab", value_cents: 1, currency: "CAD", shared: false }); } };
      const r = await call(load(db, A).nw, ENTRY);
      t.eq([r.status, r.body, db.state.rows.net_worth_entries.length, db.state.rows.net_worth_entries.some((e) => e.label === "Car")], [409, { error: "too_many_entries" }, 50, false],
        "4a M3 at 49 entries, another tab's entry lands first: this one is taken back out and refused, and 50 stay (not 51)");
      const room = makeDb({ plus: A, entries: { [A]: 49 } });
      const ok50 = await call(load(room, A).nw, ENTRY);
      t.eq([ok50.status, room.state.rows.net_worth_entries.length], [200, 50], "4b nobody else at that moment: the fiftieth is saved");
      const full = makeDb({ plus: A, entries: { [A]: 50 } });
      t.eq([(await call(load(full, A).nw, ENTRY)).status, full.state.rows.net_worth_entries.length], [409, 50], "4c at 50 a new one is refused before anything is written, as before");
    }

    // ── 5. M4: a new entry saved twice is one entry ──────────────────────────────────────────────────
    {
      const CID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
      const ENTRY = { action: "save_entry", kind: "home", label: "Home", value: 500000, currency: "CAD", client_id: CID };
      const db = makeDb({ plus: A });
      const nw = load(db, A).nw;
      const first = await call(nw, ENTRY);
      const again = await call(nw, { ...ENTRY, value: 510000 });
      const mine = db.state.rows.net_worth_entries.filter((e) => e.user_id === A);
      t.eq([first.status, first.body, again.status, again.body, mine.length, mine[0] && mine[0].id, mine[0] && mine[0].value_cents], [200, { ok: true, id: CID }, 200, { ok: true, id: CID }, 1, CID, 51000000],
        "5a M4 the same new entry sent twice (the first answer was lost): one entry, and the second send's values are the ones kept");
      t.eq([(await call(nw, { ...ENTRY, client_id: "not-an-id" })).status, (await call(nw, { ...ENTRY, client_id: 7 })).status, db.state.rows.net_worth_entries.length], [400, 400, 1], "5b an id that is not one is refused, and nothing is written");
      const theirs = makeDb({ plus: A, partner: true });
      theirs.state.rows.net_worth_entries.push({ id: CID, user_id: B, kind: "car", label: "Partner's", value_cents: 100, currency: "CAD", shared: false });
      const taken = await call(load(theirs, A).nw, ENTRY);
      t.eq([taken.status, taken.body, theirs.state.rows.net_worth_entries.length, theirs.state.rows.net_worth_entries[0].label], [409, { error: "invalid_entry" }, 1, "Partner's"], "5c an id that is somebody else's entry changes nothing of theirs");
      const plain = makeDb({ plus: A });
      const { client_id, ...NO_ID } = ENTRY;
      await call(load(plain, A).nw, NO_ID); await call(load(plain, A).nw, NO_ID);
      t.eq(plain.state.rows.net_worth_entries.length, 2, "5d with no id (an app that sends none) every save is a new entry, as before");
      const cap = makeDb({ plus: A, entries: { [A]: 49 } });
      const capNw = load(cap, A).nw;
      await call(capNw, ENTRY);
      const retry = await call(capNw, ENTRY);
      t.eq([retry.status, cap.state.rows.net_worth_entries.length], [200, 50], "5e a second send of the fiftieth entry is still that entry, never 'too many'");
      const race = makeDb({ plus: A });
      race.state.before = (table, op) => { if (table === "net_worth_entries" && op === "insert") { race.state.before = null; race.state.rows.net_worth_entries.push({ id: CID, user_id: A, kind: "home", label: "first send", value_cents: 1, currency: "CAD", shared: false }); } };
      const both = await call(load(race, A).nw, ENTRY);
      t.eq([both.status, both.body, race.state.rows.net_worth_entries.length, race.state.rows.net_worth_entries[0].label], [200, { ok: true, id: CID }, 1, "Home"], "5f both sends arriving together: still one entry");
    }

    // ── 6. NOT REAL ──────────────────────────────────────────────────────────────────────────────────
    {
      // H1: three tiers, by design. The free plan connects one bank (as today); the paid main plan ("basic") 2 per
      // person; Plus 10 per household, and Plus lifts the free plan's cap.
      process.env.ENFORCE_PLAN_LIMITS = "true";
      reset();
      const paid = makeDb({ items: { [A]: 1 } });
      const second = await call(load(paid, A, { unlimited: true }).plaid, NEW_BANK);
      t.eq([second.status, banks(paid, A)], [200, 2], "6a H1 a person on the paid main plan with 1 bank connects a second: exchange_token does not refuse it");
      reset(); P.nextItem = "item-third";
      const third = await call(load(paid, A, { unlimited: true }).plaid, { ...NEW_BANK, institution_id: "ins_third" });
      t.eq([third.status, third.body], [402, { error: "bank_limit", scope: "person", used: 2, limit: 2 }], "6b …and a third is the basic plan's limit of 2, from the one rule (bankLimits.js)");
      reset();
      const free = makeDb({ items: { [A]: 1 } });
      const freeSecond = await call(load(free, A, { unlimited: false }).plaid, NEW_BANK);
      t.eq([freeSecond.status, freeSecond.body && freeSecond.body.error, banks(free, A), P.calls.length], [402, "plan_limit", 1, 0], "6c H1 the free plan's second bank is refused with plan_limit before Plaid is asked: the answer the server gives today");
      reset();
      const freePlus = makeDb({ items: { [A]: 1 }, plus: A });
      t.eq([(await call(load(freePlus, A, { unlimited: false }).plaid, NEW_BANK)).status, banks(freePlus, A)], [200, 2], "6d …and Plus lifts the free plan's cap, as the spec says");
      const spec = src("docs", "product", "NET-WORTH-SPEC.md");
      t.ok(/\*\*Basic:\*\* 2 per person, counted per person, never pooled\. \*\*Plus:\*\* 10 for the household/.test(spec) && /\*\*Plus also lifts the free plan's one-bank cap\.\*\*/.test(spec),
        "6e the spec states the three tiers: the free plan's one-bank cap, basic 2 per person, Plus 10 per household");
      delete process.env.ENFORCE_PLAN_LIMITS;

      // H2: a second sign-in at a bank this person already holds replaces the first: it adds no bank.
      reset(); P.nextItem = "item-second-login";
      const full = makeDb({ items: { [A]: 2 } });
      const same = await call(load(full, A).plaid, { ...NEW_BANK, institution_id: "ins_a_0", institution_name: "Bank a0" });
      t.eq([same.status, banks(full, A), full.state.rows.plaid_items.map((x) => x.item_id).sort(), removes().map((c) => c.token)], [200, 2, ["a-item-1", "item-second-login"], ["access-a-0"]],
        "6f H2 at 2 of 2, a new sign-in at a bank already held: the older sign-in is removed (at Plaid and here), so 2 stay 2. No way past the limit");
      reset(); P.nextItem = "item-other-bank";
      t.eq([(await call(load(full, A).plaid, NEW_BANK)).status, banks(full, A)], [402, 2], "6g …and a bank they do not hold is still refused");

      // M1: a reconnect always names its item, so it is never treated as a new bank.
      reset();
      const lim = makeDb({ items: { [A]: 3 } });
      const reconnect = await call(load(lim, A).plaid, { action: "create_link_token", country: "CA", item_id: "a-item-0" });
      const fresh = await call(load(lim, A).plaid, { action: "create_link_token", country: "CA" });
      t.eq([reconnect.status, fresh.status, fresh.body && fresh.body.error], [200, 402, "bank_limit"], "6h M1 over the limit, a reconnect (item_id) opens Plaid; only a link with no item is a new bank");
      const app = src("src", "App.jsx");
      const fn = app.slice(app.indexOf("const doReconnectBank = async ()=>{"), app.indexOf("const doAddNewBank = async ()=>{"));
      t.ok(/const target = named \|\| broken \|\| items\[0\];/.test(fn) && /if \(target\?\.item_id\) \{\s*payload = \{ item_id: target\.item_id, country \};/.test(fn),
        "6i M1 the app's reconnect sends the item of the bank it is reconnecting whenever this person holds any bank");

      // Grok LOW 1: the networth list loop sees at most one other member.
      const m30 = src("supabase", "migrations", "0030_couple_household.sql"), m31 = src("supabase", "migrations", "0031_couple_household_private.sql");
      t.eq([(m30.match(/if n >= 2 then raise exception 'household_full'/g) || []).length, (m31.match(/if n >= 2 then return jsonb_build_object\('result', 'household_full'\)/g) || []).length], [1, 2],
        "6j Grok LOW 1 a household is refused a third member in the database (household_full at 2), so there is never more than one partner to list");
    }
  } catch (e) {
    t.ok(false, `the run threw: ${e && e.stack ? e.stack.split("\n").slice(0, 3).join(" | ") : e}`);
  } finally {
    global.fetch = realFetch; console.error = quiet.e; console.warn = quiet.w;
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  }
  t.summary("plusReviewBank.test");
})();
