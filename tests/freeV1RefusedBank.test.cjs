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
// Review round 2 (Grok 100, ChatGPT 88, on e60a9c4):
//   C  R2-1 the refused row's write meets a row already there: its status is read. Refused (an older refusal, or this
//      exchange's own insert whose reply was lost) is not a bank the account holds: removed, never saved as connected.
//      Unreadable: 503, the support inbox told, nothing removed, nothing activated
//   G  R2-2 migrate_items never turns a refused row back into a connected bank, on any plan, in the write itself
//   S  R2-3 a save that fails for a bank the account already held (a reconnect) removes nothing at Plaid and marks
//      nothing refused: a retryable 503. Only an item with no row before this exchange is rolled back
//   F  R2-4 every refused row gets its turn (the least recently tried first), a row is deleted only while it is still
//      refused, and two clean-ups of the same Item at once are harmless
// Review round 3 (Grok 100, ChatGPT 90, on 894b697):
//   A  R3-1 the exchange's save of a connected bank never overwrites a refused row (insert if none, else update only
//      while not refused): a refused row is not saved, the answer is the plan refusal. A save racing the clean-up
//      never ends as a connected row whose Item was removed at Plaid; a save that wins keeps its Item at Plaid
//   B  R3-2 a save that answers an error is read back first: saved (its reply lost) is a success, nothing removed;
//      another row there is never overwritten or removed; the Item is removed only after the refused row is claimed
//   D  R3-3 absent, refused, connected and unreadable are told apart: only a row read as refused is permanent
//      (migrate_items retry true otherwise; the claim answers "unknown", nothing removed)
//   E  R3-4 the clean-up claims a row (refused, last tried over 5 minutes ago) before calling Plaid: overlapping
//      listings call Plaid once for an Item
//   P  a paying or trialing person's connected bank is never removed at Plaid by any of these paths
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
const LONG_AGO = "2026-11-01T00:00:00.000Z";

// ── a stand-in database that keeps its rows ─────────────────────────────────────────────────────────────────────
// fail: functions of { table, op, filters, opts } answering an error to return, or nothing to go on as normal.
function makeDb({ items = [], fail = [] } = {}) {
  // Like the table: created_at and updated_at are never null (a row given here was last touched long ago).
  const tables = { plaid_items: items.map((r) => ({ user_id: "u1", institution_name: "Old Bank", created_at: LONG_AGO, updated_at: LONG_AGO, ...r })), household_members: [], webhook_seen: [] };
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
        if (err && !err.applied) return { data: null, error: err, count: null };
        if (err && err.applied) { q._apply(); return { data: null, error: { message: err.message }, count: null }; }
        return q._apply();
      };
      q._apply = () => {
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
            const stamp = new Date().toISOString();
            const row = { created_at: stamp, updated_at: stamp, ...v }; rows(table).push(row); inserted.push({ ...row });
          }
          return { data: q.returning ? inserted : null, error: null };
        }
        if (q.op === "update") { const hit = rows(table).filter(match); for (const r of hit) Object.assign(r, q.payload); return { data: q.returning ? hit.map((r) => ({ ...r })) : null, error: null }; }
        if (q.op === "delete") { tables[table] = rows(table).filter((r) => !match(r)); return { data: null, error: null }; }
        return { data: null, error: null };
      };
      Object.assign(q, {
        select(_c, o) { if (q.op === "select") { if (o && o.head) q.head = true; } else q.returning = true; return q; },
        eq(c, v) { q.eqs[c] = v; q.filters.push((r) => r[c] === v); return q; },
        neq(c, v) { q.eqs[`!${c}`] = v; q.filters.push((r) => r[c] !== v); return q; },
        in(c, vs) { q.filters.push((r) => vs.includes(r[c])); return q; },
        lt(c, v) { q.eqs[`<${c}`] = v; q.filters.push((r) => r[c] != null && r[c] < v); return q; },
        order() { return q; }, limit() { return q; },
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
// The row was last tried long enough ago for the clean-up to try it again ("five minutes later").
const later = (db, id) => { const r = item(db, id); if (r) r.updated_at = LONG_AGO; };
const DOWN = { message: "database down" };
// Fail the read that asks whether this account holds one particular bank (plaid_items, by user and item).
const failHeldRead = (q) => q.table === "plaid_items" && q.op === "select" && q.eqs.item_id && !q.head ? DOWN : null;
// Fail every write of a plaid_items row (the refused row included).
const failItemWrites = (q) => q.table === "plaid_items" && (q.op === "upsert" || q.op === "insert") ? DOWN : null;
// Only the first n times the rule matches.
const failFirst = (n, rule) => { let left = n; return (q) => { const e = rule(q); if (!e || left <= 0) return null; left--; return e; }; };
// The write goes in, and its reply is lost (the caller sees an error).
const LOST = { message: "connection reset after commit", applied: true };
// Fail the save of a bank as connected.
const failActiveSave = (q) => q.table === "plaid_items" && (q.op === "upsert" || q.op === "insert") && q.payload && q.payload.status === "active" ? DOWN : null;

// ── a stand-in Plaid and error tracker ─────────────────────────────────────────────────────────────────────────
const net = { removeFails: 0, removeCode: "INTERNAL_SERVER_ERROR", exchangeItem: "it-new", legacyItem: "it-legacy", asked: [], sentry: [], support: [], removed: new Set(), failTokens: new Set(), onRemove: null, removeAsked: [] };
global.fetch = async (url, init = {}) => {
  const u = String(url);
  net.asked.push(u);
  const answer = (status, body) => ({ ok: status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });
  if (u.includes("ingest.sentry.test")) { net.sentry.push(String(init.body || "")); return answer(200, {}); }
  if (u.includes("api.resend.com")) { net.support.push(String(init.body || "")); return answer(200, { id: "email-1" }); }
  if (/\/link\/token\/create$/.test(u)) return answer(200, { link_token: "link-sandbox-test", expiration: new Date(Date.now() + 3600e3).toISOString() });
  if (/\/item\/public_token\/exchange$/.test(u)) return answer(200, { access_token: TOKEN, item_id: net.exchangeItem });
  if (/\/item\/get$/.test(u)) return answer(200, { item: { item_id: net.legacyItem, institution_id: "ins_1" } });
  if (/\/item\/remove$/.test(u)) {
    let tok = ""; try { tok = JSON.parse(init.body || "{}").access_token || ""; } catch {}
    net.removeAsked.push(tok);
    if (net.onRemove) { const f = net.onRemove; net.onRemove = null; await f(tok); }
    // Plaid no longer knows an Item it has removed.
    if (net.removed.has(tok)) return answer(400, { error_code: "ITEM_NOT_FOUND", error_message: "gone" });
    if (net.failTokens.has(tok)) return answer(400, { error_code: "INTERNAL_SERVER_ERROR", error_message: "no" });
    if (net.removeFails > 0) { net.removeFails--; return answer(400, { error_code: net.removeCode, error_message: "no" }); }
    await new Promise((ok) => setTimeout(ok, 5));
    net.removed.add(tok);
    return answer(200, { request_id: "removed" });
  }
  if (/\/accounts\/get$/.test(u)) return answer(200, { accounts: [] });
  throw new Error("network blocked in test");
};
const removes = (before) => net.asked.slice(before).filter((u) => /\/item\/remove$/.test(u)).length;
const reset = (o = {}) => { Object.assign(net, { removeFails: 0, removeCode: "INTERNAL_SERVER_ERROR", exchangeItem: "it-new", legacyItem: "it-legacy", sentry: [], support: [], removed: new Set(), failTokens: new Set(), onRemove: null, removeAsked: [] }, o); };

// The real plaid.js, its database the one given, the plan free (or the one given).
function load(db, { plan = { plan: "free", unlimited: false, paid: false, status_unavailable: false } } = {}) {
  Object.assign(process.env, {
    SUPABASE_URL: "https://example.supabase.test", SUPABASE_SECRET_KEY: "test-service-role", ENFORCE_PLAN_LIMITS: "true",
    PLAID_CLIENT_ID: "test-client", PLAID_SECRET: "test-secret", PLAID_ENV: "sandbox", SENTRY_DSN,
  });
  process.env.RESEND_API_KEY = "re_test_key";
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
// The same call, not quieted (for several at once inside one quiet()).
const callRaw = async (db, body, { origin = WEB, plan } = {}) => {
  const res = await load(db, { plan }).handler({ httpMethod: "POST", headers: { origin, authorization: "Bearer x" }, body: JSON.stringify(body) });
  let json = {}; try { json = JSON.parse(res.body || "{}"); } catch {}
  return { status: res.statusCode, json };
};
const PAID = { plan: "annual", unlimited: true, paid: true, status_unavailable: false };

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
  later(db, "it-new");   // round 3 (R3-4): a row is tried again once its last try is five minutes old
  before = net.asked.length;
  r = await call(db, { action: "list_items" });
  t.eq(r.status, 200, "R2a the banks are listed");
  t.eq((r.json.items || []).length, 0, "R2b a refused bank is never listed");
  t.eq(removes(before), 1, "R2c …its removal is tried again when the banks are listed");
  t.eq(item(db, "it-new") && item(db, "it-new").status, "refused", "R2d Plaid failed again: the row stays, still refused");
  later(db, "it-new");
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
  db = makeDb({ items: [{ item_id: "it-new", status: "error", access_token: "access-old" }], fail: [failFirst(1, failHeldRead)] });
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

  // ── C (R2-1): the refused row's write meets a row already there ──────────────────────────────────────────
  // An older refused row for this Item: the held read fails once, the conflict's read says "refused".
  reset();
  db = makeDb({ items: [{ item_id: "it-new", status: "refused", access_token: "access-old" }], fail: [failFirst(1, failHeldRead)] });
  before = net.asked.length;
  r = await exchange(db);
  t.eq(r.status, 402, "C1a an existing refused row for the Item: not a bank the account holds, refused");
  t.eq(removes(before) >= 1, true, "C1b …removed at Plaid");
  t.eq(item(db, "it-new"), null, "C1c …its row is gone");
  t.ok(!db.log.some((l) => l.table === "plaid_items" && l.payload && l.payload.status === "active"), "C1d …and it was never saved as connected");
  // This exchange's own refused row went in, and the reply was lost: the next try meets it.
  reset();
  db = makeDb({ fail: [failFirst(1, failHeldRead), failFirst(1, (q) => q.table === "plaid_items" && q.op === "upsert" && q.opts.ignoreDuplicates ? LOST : null)] });
  before = net.asked.length;
  r = await exchange(db);
  t.eq(r.status, 402, "C2a our own refused row went in, its reply lost: still refused");
  t.eq(removes(before) >= 1, true, "C2b …removed at Plaid");
  t.eq(item(db, "it-new"), null, "C2c …its row is gone");
  t.ok(!db.log.some((l) => l.table === "plaid_items" && l.payload && l.payload.status === "active"), "C2d …never saved as connected");
  // The row there cannot be read either.
  reset();
  db = makeDb({ items: [{ item_id: "it-new", status: "error", access_token: "access-old" }], fail: [failHeldRead] });
  before = net.asked.length;
  r = await exchange(db);
  t.eq(r.status, 503, "C3a a row is there and cannot be read: 503");
  t.eq(removes(before), 0, "C3b …nothing removed at Plaid");
  t.eq(item(db, "it-new").status, "error", "C3c …nothing activated (the row is as it was)");
  t.eq(item(db, "it-new").access_token, "access-old", "C3d …its token untouched");
  t.ok(net.support.some((b) => b.includes("plaid_item_owner_unread") && b.includes("it-new")), "C3e …and the support inbox is told");
  t.ok(net.support.concat(net.sentry).every((b) => !b.includes(TOKEN)), "C3f …never with the token");

  // ── G (R2-2): migrate_items never revives a refused row, on any plan ─────────────────────────────────────
  for (const [name, origin, plan] of [["a paid account on the website", WEB, PAID], ["a paid account in a store app", IOS, PAID], ["a free account in a store app, under its one bank", IOS, undefined]]) {
    reset({ legacyItem: "it-out" });
    db = makeDb({ items: [{ item_id: "it-out", status: "refused", access_token: "access-out" }] });
    r = await call(db, { action: "migrate_items", tokens: [{ token: "legacy-1", institution_name: "Old" }] }, { origin, plan });
    t.eq(item(db, "it-out").status, "refused", `G ${name}: a refused row is never turned back into a connected bank`);
    t.eq(item(db, "it-out").access_token, "access-out", `G ${name}: …its token untouched`);
    t.eq([(r.json.successes || []).length, (r.json.failures || [])[0] && r.json.failures[0].retry], [0, false], `G ${name}: …it is a failure that trying again cannot help`);
  }
  reset({ legacyItem: "it-old" });
  db = makeDb({ items: [{ item_id: "it-old", status: "error", access_token: "access-old" }] });
  r = await call(db, { action: "migrate_items", tokens: [{ token: "legacy-1", institution_name: "Old" }] }, { plan: PAID });
  t.eq([(r.json.successes || []).length, item(db, "it-old").status, item(db, "it-old").access_token], [1, "active", "legacy-1"], "G (not vacuous: a bank the account holds is imported, as before)");
  reset({ legacyItem: "it-fresh" });
  db = makeDb();
  r = await call(db, { action: "migrate_items", tokens: [{ token: "legacy-1", institution_name: "Old" }] }, { plan: PAID });
  t.eq([(r.json.successes || []).length, item(db, "it-fresh") && item(db, "it-fresh").status], [1, "active"], "G (not vacuous: a new bank on a paid plan is imported, as before)");

  // ── S (R2-3): a save that fails for a bank the account already held ─────────────────────────────────────
  for (const [name, origin, plan] of [["a paid account", WEB, PAID], ["a store app", IOS, undefined], ["the website's free plan", WEB, undefined]]) {
    reset();
    db = makeDb({ items: [{ item_id: "it-new", status: "error", access_token: "access-old" }], fail: [failActiveSave] });
    before = net.asked.length;
    r = await exchange(db, { origin, plan });
    t.eq(removes(before), 0, `S ${name}: its own bank's save failed on a reconnect: nothing removed at Plaid`);
    t.eq([item(db, "it-new") && item(db, "it-new").status, item(db, "it-new") && item(db, "it-new").access_token], ["error", "access-old"], `S ${name}: …the row is as it was, never marked refused`);
    t.eq(r.status, 503, `S ${name}: …a retryable 503`);
  }
  reset();
  db = makeDb({ fail: [failActiveSave] });
  before = net.asked.length;
  r = await exchange(db, { plan: PAID });
  t.eq([r.status, removes(before), item(db, "it-new")], [500, 1, null], "S an item with no row before: its failed save is rolled back at Plaid, as before");
  reset();
  db = makeDb({ fail: [failActiveSave, (q) => q.table === "plaid_items" && q.op === "select" && q.eqs.item_id ? DOWN : null] });
  before = net.asked.length;
  r = await exchange(db, { plan: PAID });
  t.eq([r.status, removes(before), item(db, "it-new")], [503, 0, null], "S whether a row was there before cannot be read: nothing removed, 503");
  t.ok(net.support.some((b) => b.includes("it-new")), "S …and the support inbox is told");

  // ── F (R2-4): the clean-up ─────────────────────────────────────────────────────────────────────────────
  // Starvation: three refused rows, the two oldest never removable. The third is tried by the second listing.
  reset({ failTokens: new Set(["tok-a", "tok-b"]) });
  db = makeDb({ items: [
    { item_id: "it-a", status: "refused", access_token: "tok-a", created_at: "2026-11-01T00:00:00Z", updated_at: "2026-11-01T00:00:00Z" },
    { item_id: "it-b", status: "refused", access_token: "tok-b", created_at: "2026-11-02T00:00:00Z", updated_at: "2026-11-02T00:00:00Z" },
    { item_id: "it-c", status: "refused", access_token: "tok-c", created_at: "2026-11-03T00:00:00Z", updated_at: "2026-11-03T00:00:00Z" },
  ] });
  await call(db, { action: "list_items" });
  await call(db, { action: "list_items" });
  t.eq(item(db, "it-c"), null, "F1a a row behind two that never go is still tried, and removed");
  t.eq([!!item(db, "it-a"), !!item(db, "it-b")], [true, true], "F1b …the two Plaid will not remove stay, still refused");
  // Two clean-ups of the same Item at once.
  reset();
  db = makeDb({ items: [{ item_id: "it-x", status: "refused", access_token: "tok-x" }, { item_id: "it-keep", status: "active", access_token: "tok-keep" }] });
  const both = await quiet(() => Promise.all([callRaw(db, { action: "list_items" }), callRaw(db, { action: "list_items" })]));
  t.eq(both.map((x) => x.status), [200, 200], "F2a two clean-ups of the same Item at once: both answer");
  t.eq(item(db, "it-x"), null, "F2b …the refused row is gone");
  t.eq(item(db, "it-keep") && item(db, "it-keep").status, "active", "F2c …the connected bank is untouched");
  t.eq(net.sentry.length + net.support.length, 0, "F2d …and nobody is alerted");
  // A row that stops being refused while its clean-up runs is never deleted.
  reset();
  db = makeDb({ items: [{ item_id: "it-y", status: "refused", access_token: "tok-y" }] });
  net.onRemove = () => { item(db, "it-y").status = "active"; };
  await call(db, { action: "list_items" });
  t.eq(item(db, "it-y") && item(db, "it-y").status, "active", "F3 a row no longer refused when the delete runs is left alone (the delete asks for status refused)");

  // ── A (R3-1): the exchange never saves a connected bank over a refused row ─────────────────────────────────
  const TRIAL = { plan: "trial", unlimited: true, paid: false, status_unavailable: false };
  for (const [name, origin, plan] of [["a paid account", WEB, PAID], ["a trial in a store app", IOS, TRIAL], ["a store app's free plan", IOS, undefined]]) {
    reset();
    db = makeDb({ items: [{ item_id: "it-new", status: "refused", access_token: "access-out" }] });
    r = await exchange(db, { origin, plan });
    t.eq([r.status, r.json.error], [402, "plan_limit"], `A1 ${name}: an Item whose row is refused is not saved: the plan refusal`);
    t.eq([item(db, "it-new").status, item(db, "it-new").access_token], ["refused", "access-out"], `A1 ${name}: …its row stays refused, its token untouched`);
  }
  // The exchange lands while the clean-up is removing that Item at Plaid.
  for (const [name, plan] of [["a paid account", PAID], ["a trial", TRIAL]]) {
    reset();
    db = makeDb({ items: [{ item_id: "it-new", status: "refused", access_token: "access-out" }] });
    let during = null;
    net.onRemove = async () => { during = await callRaw(db, { action: "exchange_token", public_token: "public-sandbox-1", institution_name: "New Bank" }, { plan }); };
    await quiet(() => callRaw(db, { action: "list_items" }));
    const row = item(db, "it-new");
    const itemRemoved = net.removed.has("access-out") || net.removed.has(TOKEN);
    t.ok(!(row && row.status === "active" && itemRemoved), `A2 ${name}: a save racing the clean-up never ends as a connected bank whose Item was removed at Plaid`);
    t.eq([during && during.status, row], [402, null], `A2 ${name}: …the clean-up had begun: the save is refused and the row is finished`);
  }
  // The save wins: the row was saved as connected before the clean-up reached it (its listing was older).
  reset();
  db = makeDb({ items: [{ item_id: "it-new", status: "refused", access_token: "access-out" }] });
  db.fail.push(failFirst(1, (q) => {
    if (q.table === "plaid_items" && q.eqs.item_id === "it-new") Object.assign(item(db, "it-new"), { status: "active", access_token: TOKEN });
    return null;
  }));
  await call(db, { action: "list_items" }, { plan: PAID });
  t.eq([item(db, "it-new") && item(db, "it-new").status, net.removeAsked.length, net.removed.has(TOKEN)], ["active", 0, false], "A3 the save won: the bank stays connected AND its Item survives at Plaid (never asked to remove)");

  // ── B (R3-2): a save that answered an error is read back before anything is removed ────────────────────────
  const lostActive = (q) => q.table === "plaid_items" && ["upsert", "insert", "update"].includes(q.op) && q.payload && q.payload.status === "active" ? LOST : null;
  for (const [name, origin, plan] of [["a paid account", WEB, PAID], ["a trial in a store app", IOS, TRIAL]]) {
    reset();
    db = makeDb({ fail: [failFirst(1, lostActive)] });
    r = await exchange(db, { origin, plan });
    t.eq([net.removeAsked.length, net.removed.has(TOKEN)], [0, false], `B1 ${name}: a new bank's save went in and its reply was lost: never removed at Plaid`);
    t.eq([r.status, item(db, "it-new") && item(db, "it-new").status], [200, "active"], `B1 ${name}: …it is a success, the bank connected`);
    reset();
    // The write that saves over a row already there loses its reply.
    db = makeDb({ items: [{ item_id: "it-new", status: "error", access_token: "access-old" }], fail: [failFirst(1, (q) => (q.op === "update" || (q.op === "upsert" && !q.opts.ignoreDuplicates)) && lostActive(q))] });
    r = await exchange(db, { origin, plan });
    t.eq([net.removeAsked.length, r.status, item(db, "it-new").status], [0, 200, "active"], `B2 ${name}: a reconnect's save went in, its reply lost: a success, nothing removed`);
    // Another request saved this Item as connected meanwhile: never removed, never overwritten as refused.
    reset();
    db = makeDb({ fail: [failFirst(1, (q) => {
      if (!failActiveSave(q)) return null;
      db.tables.plaid_items.push({ user_id: "u1", item_id: "it-new", status: "active", access_token: "access-other", created_at: LONG_AGO, updated_at: LONG_AGO });
      return DOWN;
    })] });
    r = await exchange(db, { origin, plan });
    t.eq([net.removeAsked.length, item(db, "it-new").status, item(db, "it-new").access_token], [0, "active", "access-other"], `B3 ${name}: a connected row there after a failed save is never removed at Plaid or marked refused`);
    t.eq([r.status, r.json.retry], [503, true], `B3 ${name}: …"try again"`);
  }

  // ── D (R3-3): absent, refused, connected and unreadable are told apart ───────────────────────────────────
  // migrate_items: the row was there for the insert and gone before the update.
  const vanishBeforeUpdate = (id) => (q) => { if (q.table === "plaid_items" && q.op === "update" && q.payload && q.payload.status === "active") db.tables.plaid_items = db.tables.plaid_items.filter((x) => x.item_id !== id); return null; };
  reset({ legacyItem: "it-old" });
  db = makeDb({ items: [{ item_id: "it-old", status: "error", access_token: "access-old" }] });
  db.fail.push(vanishBeforeUpdate("it-old"));
  r = await call(db, { action: "migrate_items", tokens: [{ token: "legacy-1", institution_name: "Old" }] }, { plan: PAID });
  t.eq([(r.json.failures || [])[0] && r.json.failures[0].retry, (r.json.failures || [])[0] && r.json.failures[0].error !== "refused"], [true, true], "D1 migrate: the row vanished between the two writes: retryable, never a permanent refusal");
  reset({ legacyItem: "it-old" });
  db = makeDb({ items: [{ item_id: "it-old", status: "error", access_token: "access-old" }] });
  db.fail.push(vanishBeforeUpdate("it-old"), (q) => q.table === "plaid_items" && q.op === "select" && q.eqs.item_id ? DOWN : null);
  r = await call(db, { action: "migrate_items", tokens: [{ token: "legacy-1", institution_name: "Old" }] }, { plan: PAID });
  t.eq((r.json.failures || [])[0] && r.json.failures[0].retry, true, "D2 migrate: nothing saved and the row cannot be read: retryable");
  // The claim: its write met a row, and the read after it finds none.
  reset();
  db = makeDb({ items: [{ item_id: "it-new", status: "error", access_token: "access-old" }], fail: [failFirst(1, failHeldRead), failFirst(1, (q) => {
    if (q.table === "plaid_items" && q.op === "select" && q.eqs.item_id && !q.head) db.tables.plaid_items = db.tables.plaid_items.filter((x) => x.item_id !== "it-new");
    return null;
  })] });
  r = await exchange(db);
  t.eq([net.removeAsked.length, r.status], [0, 503], "D3 claim: the row it met is gone when read: \"unknown\", nothing removed at Plaid, 503");
  t.ok(net.support.some((b) => b.includes("plaid_item_owner_unread") && b.includes("it-new")), "D3 …and the support inbox is told");

  // ── E (R3-4): the clean-up claims a row before it calls Plaid ─────────────────────────────────────────────
  reset({ failTokens: new Set(["tok-z"]) });
  db = makeDb({ items: [{ item_id: "it-z", status: "refused", access_token: "tok-z" }] });
  await quiet(() => Promise.all([callRaw(db, { action: "list_items" }), callRaw(db, { action: "list_items" })]));
  await call(db, { action: "list_items" });
  t.eq(net.removeAsked.filter((x) => x === "tok-z").length, 1, "E1 overlapping listings within five minutes: Plaid is asked once for the Item");
  t.ok(item(db, "it-z") && item(db, "it-z").updated_at > LONG_AGO, "E2 …the claim stamped the row's try time");
  later(db, "it-z");
  await call(db, { action: "list_items" });
  t.eq(net.removeAsked.filter((x) => x === "tok-z").length, 2, "E3 five minutes later: tried again (not vacuous)");

  // ── P: a paying or trialing person's connected bank is never removed at Plaid by any of these paths ──────
  for (const [name, plan] of [["paid", PAID], ["trial", TRIAL]]) {
    reset({ legacyItem: "it-keep" });
    db = makeDb({ items: [
      { item_id: "it-keep", status: "active", access_token: "tok-keep" },
      { item_id: "it-out", status: "refused", access_token: "tok-out" },
    ] });
    await call(db, { action: "list_items" }, { plan });                                                              // the clean-up
    db.fail.push(failFirst(1, lostActive));
    await call(db, { action: "migrate_items", tokens: [{ token: "tok-keep", institution_name: "Keep" }] }, { plan }); // the import, reply lost
    net.exchangeItem = "it-keep";
    db.fail.push(failFirst(1, failActiveSave));
    await exchange(db, { plan });                                                                                      // a reconnect whose save fails
    db.fail.push(failFirst(1, lostActive));
    await exchange(db, { plan });                                                                                      // …whose reply is lost
    later(db, "it-keep");
    await call(db, { action: "list_items" }, { plan });                                                              // the clean-up again
    t.eq([net.removeAsked.includes("tok-keep") || net.removeAsked.includes(TOKEN), item(db, "it-keep") && item(db, "it-keep").status], [false, "active"], `P ${name}: the connected bank is never removed at Plaid and stays connected`);
  }

  t.summary("FREE V1 REFUSED BANK");
})().catch((e) => { console.error(e); process.exitCode = 1; });
