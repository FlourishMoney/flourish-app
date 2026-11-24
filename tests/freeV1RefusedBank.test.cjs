// tests/freeV1RefusedBank.test.cjs
// -----------------------------------------------------------------------------
// FREE V1, REVIEW ROUND 1 (PR #158, 2026-11-23): A REFUSED BANK IS CLEANED UP DURABLY, AND THE OLD-BANK IMPORT NEVER
// GUESSES. Runs the REAL plaid.js (and plaid-webhook.js) against a stand-in database that keeps its rows and can be
// made to fail on purpose, and a stand-in Plaid whose /item/remove can fail or say the Item is already gone.
//
//   R  the exchange on the website's free plan, for a bank the account does not hold:
//      R1 Plaid will not remove it: a refused row keeps it (its token; never listed, counted or read), the answer is
//         still the refusal, and the error tracker is told (the Item and the path, never the token)
//      R2 the next time the banks are listed, the removal is tried again; once Plaid removes it, the row goes
//      R3 Plaid says the Item is already gone: the same as removed, no row is left, no alert
//      R4 Plaid will not remove it AND the row cannot be written: "unavailable", and a person is told
//   H  the exchange when whether the account holds the bank CANNOT be read:
//      H1 a bank it does not hold: found out by writing the refused row only if none is there, then removed and refused
//      H2 a bank it holds (a reconnect): never removed at Plaid, the reconnect goes on
//      H3 neither can be read: nothing is removed at Plaid, "unavailable", the error tracker is told
//   N  a refused row is no one's bank: not counted toward the store apps' one bank, not readable (get_accounts), not
//      reconnectable (create_link_token's update mode), not "held" by the old-bank import, not revived by a webhook
//   M  migrate_items: either read that builds the list of banks the account holds fails: a retryable 503 before any
//      token is looked at (no /item/get, no write)
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const path = require("path");

const AUTH_PATH = require.resolve("../netlify/functions/_lib/auth.js");
const PLAID_PATH = require.resolve("../netlify/functions/plaid.js");
const HOOK_PATH = require.resolve("../netlify/functions/plaid-webhook.js");
const VERIFY_PATH = require.resolve("../netlify/functions/_lib/webhook-verify.js");

const WEB = "https://flourishmoney.app", IOS = "capacitor://localhost";
const TOKEN = "access-new-SECRET";
const SENTRY_DSN = "https://pubkey123@o1.ingest.sentry.test/42";

// ── a stand-in database that keeps its rows ─────────────────────────────────────────────────────────────────────
// fail: functions of { table, op, filters, opts } answering an error to return, or nothing to go on as normal.
function makeDb({ items = [], fail = [] } = {}) {
  const tables = { plaid_items: items.map((r) => ({ user_id: "u1", institution_name: "Old Bank", ...r })), household_members: [], webhook_seen: [] };
  const log = [];
  const rows = (t) => (tables[t] = tables[t] || []);
  const db = {
    tables, log, fail,
    from(table) {
      const q = { table, op: "select", filters: [], eqs: {}, head: false, payload: null, opts: {}, returning: false };
      const failed = () => { for (const f of fail) { const e = f(q); if (e) return e; } return null; };
      const match = (r) => q.filters.every((f) => f(r));
      const run = () => {
        log.push({ table, op: q.op, eqs: { ...q.eqs }, payload: q.payload, opts: q.opts });
        const err = failed();
        if (err) return { data: null, error: err, count: null };
        if (q.op === "select") {
          const out = rows(table).filter(match);
          return q.head ? { count: out.length, error: null } : { data: out.map((r) => ({ ...r })), error: null };
        }
        if (q.op === "upsert" || q.op === "insert") {
          const list = Array.isArray(q.payload) ? q.payload : [q.payload];
          const keys = String(q.opts.onConflict || "").split(",").filter(Boolean);
          const inserted = [];
          for (const v of list) {
            const hit = keys.length ? rows(table).find((r) => keys.every((k) => r[k] === v[k])) : null;
            if (hit) { if (!q.opts.ignoreDuplicates) Object.assign(hit, v); continue; }
            const row = { ...v }; rows(table).push(row); inserted.push({ ...row });
          }
          return { data: q.returning ? inserted : null, error: null };
        }
        if (q.op === "update") { for (const r of rows(table).filter(match)) Object.assign(r, q.payload); return { data: null, error: null }; }
        if (q.op === "delete") { tables[table] = rows(table).filter((r) => !match(r)); return { data: null, error: null }; }
        return { data: null, error: null };
      };
      Object.assign(q, {
        select(_c, o) { if (q.op === "select") { if (o && o.head) q.head = true; } else q.returning = true; return q; },
        eq(c, v) { q.eqs[c] = v; q.filters.push((r) => r[c] === v); return q; },
        neq(c, v) { q.eqs[`!${c}`] = v; q.filters.push((r) => r[c] !== v); return q; },
        in(c, vs) { q.filters.push((r) => vs.includes(r[c])); return q; },
        lt() { return q; }, order() { return q; }, limit() { return q; },
        upsert(v, o) { q.op = "upsert"; q.payload = v; q.opts = o || {}; return q; },
        insert(v, o) { q.op = "insert"; q.payload = v; q.opts = o || {}; return q; },
        update(v) { q.op = "update"; q.payload = v; return q; },
        delete() { q.op = "delete"; return q; },
        async maybeSingle() { const r = run(); return r.error ? r : { data: (r.data || [])[0] || null, error: null }; },
        async single() { const r = run(); if (r.error) return r; const d = (r.data || [])[0]; return d ? { data: d, error: null } : { data: null, error: { code: "PGRST116", message: "no rows" } }; },
        then(res, rej) { return Promise.resolve(run()).then(res, rej); },
      });
      return q;
    },
    async rpc(name, args) {
      log.push({ table: "rpc", op: name, eqs: args });
      for (const f of fail) { const e = f({ table: "rpc", op: name, eqs: args || {} }); if (e) return { data: null, error: e }; }
      if (name === "household_disconnect_item") {
        const before = tables.plaid_items.length;
        tables.plaid_items = tables.plaid_items.filter((r) => !(r.user_id === args.p_user && r.item_id === args.p_item));
        return { data: { result: before !== tables.plaid_items.length ? "removed" : "not_found" }, error: null };
      }
      return { data: null, error: { code: "PGRST202", message: `Could not find the function public.${name}` } };
    },
    auth: { admin: {} },
  };
  return db;
}
const item = (db, id) => db.tables.plaid_items.find((r) => r.item_id === id) || null;
const DOWN = { message: "database down" };
// Fail the read that asks whether this account holds one particular bank (plaid_items, by user and item).
const failHeldRead = (q) => q.table === "plaid_items" && q.op === "select" && q.eqs.item_id && !q.head ? DOWN : null;
// Fail every write of a plaid_items row (the refused row included).
const failItemWrites = (q) => q.table === "plaid_items" && (q.op === "upsert" || q.op === "insert") ? DOWN : null;

// ── a stand-in Plaid and error tracker ─────────────────────────────────────────────────────────────────────────
const net = { removeFails: 0, removeCode: "INTERNAL_SERVER_ERROR", exchangeItem: "it-new", legacyItem: "it-legacy", asked: [], sentry: [] };
global.fetch = async (url, init = {}) => {
  const u = String(url);
  net.asked.push(u);
  const answer = (status, body) => ({ ok: status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });
  if (u.includes("ingest.sentry.test")) { net.sentry.push(String(init.body || "")); return answer(200, {}); }
  if (/\/link\/token\/create$/.test(u)) return answer(200, { link_token: "link-sandbox-test", expiration: new Date(Date.now() + 3600e3).toISOString() });
  if (/\/item\/public_token\/exchange$/.test(u)) return answer(200, { access_token: TOKEN, item_id: net.exchangeItem });
  if (/\/item\/get$/.test(u)) return answer(200, { item: { item_id: net.legacyItem, institution_id: "ins_1" } });
  if (/\/item\/remove$/.test(u)) {
    if (net.removeFails > 0) { net.removeFails--; return answer(400, { error_code: net.removeCode, error_message: "no" }); }
    return answer(200, { request_id: "removed" });
  }
  if (/\/accounts\/get$/.test(u)) return answer(200, { accounts: [] });
  throw new Error("network blocked in test");
};
const removes = (before) => net.asked.slice(before).filter((u) => /\/item\/remove$/.test(u)).length;
const reset = (o = {}) => { Object.assign(net, { removeFails: 0, removeCode: "INTERNAL_SERVER_ERROR", exchangeItem: "it-new", legacyItem: "it-legacy", sentry: [] }, o); };

// The real plaid.js, its database the one given, the plan free (or the one given).
function load(db, { plan = { plan: "free", unlimited: false, paid: false, status_unavailable: false } } = {}) {
  Object.assign(process.env, {
    SUPABASE_URL: "https://example.supabase.test", SUPABASE_SECRET_KEY: "test-service-role", ENFORCE_PLAN_LIMITS: "true",
    PLAID_CLIENT_ID: "test-client", PLAID_SECRET: "test-secret", PLAID_ENV: "sandbox", SENTRY_DSN,
  });
  delete process.env.RESEND_API_KEY;
  for (const p of [AUTH_PATH, PLAID_PATH, HOOK_PATH]) delete require.cache[p];
  const auth = require(AUTH_PATH);
  auth.getUserFromRequest = async () => ({ user_id: "u1", error: null });
  auth.getUserPlan = async () => ({ ...plan });
  auth.getAdminClient = () => db;
  return require(PLAID_PATH);
}
const quiet = async (fn) => { const e = console.error, w = console.warn, l = console.log; console.error = console.warn = console.log = () => {}; try { return await fn(); } finally { console.error = e; console.warn = w; console.log = l; } };
const call = (db, body, { origin = WEB, plan } = {}) => quiet(async () => {
  const res = await load(db, { plan }).handler({ httpMethod: "POST", headers: { origin, authorization: "Bearer x" }, body: JSON.stringify(body) });
  let json = {}; try { json = JSON.parse(res.body || "{}"); } catch {}
  return { status: res.statusCode, json };
});
const exchange = (db, o) => call(db, { action: "exchange_token", public_token: "public-sandbox-1", institution_name: "New Bank" }, o);

(async () => {
  const t = create();

  // ── R1-R2: Plaid will not remove a refused new bank ───────────────────────────────────────────────────────────
  reset({ removeFails: 3 });
  let db = makeDb();
  let before = net.asked.length;
  let r = await exchange(db);
  t.eq(r.status, 402, "R1a Free on the website, a bank it does not hold: refused (402)");
  t.eq(r.json.error, "plan_limit", "R1b …with the free plan's refusal");
  t.eq(removes(before), 3, "R1c Plaid's removal was tried three times");
  t.eq(item(db, "it-new") && item(db, "it-new").status, "refused", "R1d a refused row keeps the bank that Plaid would not remove");
  t.eq(item(db, "it-new") && item(db, "it-new").access_token, TOKEN, "R1e …with its token, so the removal can be tried again");
  t.eq(net.sentry.length >= 1, true, "R1f the error tracker is told");
  t.ok(net.sentry.some((b) => b.includes("it-new") && /exchange_token/.test(b)), "R1g …naming the Item and the path");
  t.ok(net.sentry.every((b) => !b.includes(TOKEN)), "R1h …and never the token");

  reset({ removeFails: 1 });
  before = net.asked.length;
  r = await call(db, { action: "list_items" });
  t.eq(r.status, 200, "R2a the banks are listed");
  t.eq((r.json.items || []).length, 0, "R2b a refused bank is never listed");
  t.eq(removes(before), 1, "R2c …its removal is tried again when the banks are listed");
  t.eq(item(db, "it-new") && item(db, "it-new").status, "refused", "R2d Plaid failed again: the row stays, still refused");
  before = net.asked.length;
  r = await call(db, { action: "list_items" });
  t.eq(removes(before), 1, "R2e …and again the next time");
  t.eq(item(db, "it-new"), null, "R2f Plaid removed it: the row is gone");

  // ── R3: Plaid says the Item is already gone ────────────────────────────────────────────────────────────────
  reset({ removeFails: 1, removeCode: "ITEM_NOT_FOUND" });
  db = makeDb();
  r = await exchange(db);
  t.eq(r.status, 402, "R3a already gone at Plaid: still the refusal");
  t.eq(item(db, "it-new"), null, "R3b …and no row is left");
  t.eq(net.sentry.length, 0, "R3c …and no alert");

  // ── R4: Plaid will not remove it, and the row cannot be written ───────────────────────────────────────────
  reset({ removeFails: 3 });
  db = makeDb({ fail: [failItemWrites] });
  r = await exchange(db);
  t.eq(r.status, 503, "R4a neither Plaid nor the database: \"unavailable\", never the ordinary refusal");
  t.ok(net.sentry.some((b) => b.includes("plaid_item_no_record") && b.includes("it-new")), "R4b the error tracker is told the Item has no record");
  t.ok(net.sentry.every((b) => !b.includes(TOKEN)), "R4c …never with the token");

  // ── R5: the ordinary case: Plaid removes it at once ───────────────────────────────────────────────────────
  reset();
  db = makeDb();
  before = net.asked.length;
  r = await exchange(db);
  t.eq(r.status, 402, "R5a Plaid removes it: refused");
  t.eq(removes(before), 1, "R5b …removed once");
  t.eq(item(db, "it-new"), null, "R5c …and no row is left");
  t.eq(net.sentry.length, 0, "R5d …and no alert");

  // ── H: whether the account holds the bank cannot be read ──────────────────────────────────────────────────
  reset();
  db = makeDb({ fail: [failHeldRead] });
  before = net.asked.length;
  r = await exchange(db);
  t.eq(r.status, 402, "H1a the read failed, a bank it does not hold (the refused row went in, so none was there): refused");
  t.eq(removes(before), 1, "H1b …removed at Plaid");
  t.eq(item(db, "it-new"), null, "H1c …and its row is gone");
  t.ok(db.log.some((l) => l.table === "plaid_items" && l.op === "upsert" && l.opts.ignoreDuplicates === true && l.payload && l.payload.status === "refused"),
    "H1d (not vacuous: the refused row was written only if none was there)");

  reset();
  db = makeDb({ items: [{ item_id: "it-new", status: "error", access_token: "access-old" }], fail: [failHeldRead] });
  before = net.asked.length;
  r = await exchange(db);
  t.eq(removes(before), 0, "H2a the read failed, a bank it holds (a reconnect): never removed at Plaid");
  t.eq(r.status, 200, "H2b …the reconnect goes on");
  t.eq(item(db, "it-new") && item(db, "it-new").status, "active", "H2c …and the bank is connected again");

  reset();
  db = makeDb({ fail: [failHeldRead, failItemWrites] });
  before = net.asked.length;
  r = await exchange(db);
  t.eq(removes(before), 0, "H3a nothing can be read or written: nothing is removed at Plaid (it may be the account's own)");
  t.eq(r.status, 503, "H3b …\"unavailable\"");
  t.ok(net.sentry.some((b) => b.includes("it-new") && /exchange_token/.test(b)), "H3c …and the error tracker is told the Item and the path");
  t.ok(net.sentry.every((b) => !b.includes(TOKEN)), "H3d …never the token");

  // ── N: a refused row is no one's bank ──────────────────────────────────────────────────────────────────────
  reset({ exchangeItem: "it-second" });
  db = makeDb({ items: [{ item_id: "it-out", status: "refused", access_token: "access-out" }] });
  r = await exchange(db, { origin: IOS });
  t.eq(r.status, 200, "N1 a store app's one bank: a refused row does not count toward it");
  reset({ removeFails: 9 });
  db = makeDb({ items: [{ item_id: "it-out", status: "refused", access_token: "access-out" }] });
  r = await call(db, { action: "get_accounts", item_id: "it-out" }, { plan: { plan: "annual", unlimited: true, paid: true, status_unavailable: false } });
  t.eq(r.status, 400, "N2 a refused bank cannot be read (get_accounts)");
  r = await call(db, { action: "create_link_token", item_id: "it-out" }, { plan: { plan: "annual", unlimited: true, paid: true, status_unavailable: false } });
  t.eq(r.status, 400, "N3 a refused bank cannot be reconnected (update mode)");
  reset({ legacyItem: "it-out", removeFails: 9 });
  db = makeDb({ items: [{ item_id: "it-out", status: "refused", access_token: "access-out" }] });
  r = await call(db, { action: "migrate_items", tokens: [{ token: "legacy-1", institution_name: "Old" }] });
  t.eq((r.json.failures || [])[0] && r.json.failures[0].error, "plan_limit", "N4 the old-bank import: a refused row is not a bank the account holds");
  t.eq(item(db, "it-out").status, "refused", "N5 …and it is not turned back into a connected bank");

  // The webhook: Plaid saying the sign-in is repaired never turns a refused row back into a connected bank.
  db = makeDb({ items: [{ item_id: "it-out", status: "refused", access_token: "access-out" }] });
  const hook = await quiet(async () => {
    load(db);
    require.cache[VERIFY_PATH] = { id: VERIFY_PATH, filename: VERIFY_PATH, loaded: true, exports: { verifyPlaidWebhook: async () => ({ verified: true, jti: "jti-1" }) } };
    delete require.cache[HOOK_PATH];
    try { return await require(HOOK_PATH).handler({ httpMethod: "POST", headers: {}, body: JSON.stringify({ webhook_type: "ITEM", webhook_code: "LOGIN_REPAIRED", item_id: "it-out" }) }); }
    finally { delete require.cache[VERIFY_PATH]; delete require.cache[HOOK_PATH]; }
  });
  t.eq(hook.statusCode, 200, "N6a the webhook is acknowledged");
  t.eq(item(db, "it-out").status, "refused", "N6b …and a refused row stays refused");

  // ── M: migrate_items never guesses which banks the account holds ──────────────────────────────────────────
  const legacy = { action: "migrate_items", tokens: [{ token: "legacy-1", institution_name: "Old" }, { token: "legacy-2", institution_name: "Old 2" }] };
  const failActiveRead = (q) => q.table === "plaid_items" && q.op === "select" && q.eqs.status === "active" && !q.eqs.item_id ? DOWN : null;
  const failAllRead = (q) => q.table === "plaid_items" && q.op === "select" && !q.eqs.status && !q.eqs.item_id && !q.head ? DOWN : null;
  for (const [name, origin, rule] of [["the website, the connected-bank read", WEB, failActiveRead], ["the website, the held-bank read", WEB, failAllRead], ["a store app, the connected-bank read", IOS, failActiveRead]]) {
    reset();
    db = makeDb({ fail: [rule] });
    before = net.asked.length;
    r = await call(db, legacy, { origin });
    t.eq(r.status, 503, `M ${name} fails: a retryable 503`);
    t.eq(net.asked.slice(before).filter((u) => /\/item\/get$/.test(u)).length, 0, `M ${name} fails: no token is looked at`);
    t.eq(db.log.filter((l) => l.table === "plaid_items" && l.op !== "select").length, 0, `M ${name} fails: nothing is written`);
  }
  reset();
  db = makeDb();
  r = await call(db, legacy, { origin: IOS });
  t.eq(r.status, 200, "M (not vacuous: with both reads working, the import runs)");

  t.summary("FREE V1 REFUSED BANK");
})().catch((e) => { console.error(e); process.exitCode = 1; });
