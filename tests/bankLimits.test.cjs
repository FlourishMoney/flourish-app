// tests/bankLimits.test.cjs
// -----------------------------------------------------------------------------
// BANK CONNECTION LIMITS (2026-11-10, _lib/bankLimits.js, behind PLUS_ENABLED). Amanda's decisions: the basic plan has 2
// bank connections PER PERSON (a two-person household 4, never pooled); Plus is unlimited with a fair-use limit of 10 per
// household. A limit only ever refuses a NEW bank: it never disconnects one.
//   1  one person at the limit
//   2  a two-person household where one partner has used both of theirs
//   3  a household moving from basic to Plus
//   4  Plus lapses while more than 4 are connected: every one stays, and only a person under 2 may add one
//   5  the handlers: asked before Plaid opens, checked again at exchange, a reconnect never limited, a failed read
//      refuses the new bank with 503 and touches nothing, and with the flag off nothing changes from today
//   6  nothing disconnects or stops updating because of a limit
//   7  the app's lines carry the server's numbers only
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

function makeDb({ items = {}, partner = false, plus = null, failPlus = false, failItems = false } = {}) {
  const state = { rows: { plaid_items: [], household_members: [], plus_addon_subscriptions: [], subscriptions: [], profiles: [] }, writes: [] };
  for (const [user, list] of Object.entries(items)) for (const [i, st] of list.entries()) state.rows.plaid_items.push({ user_id: user, item_id: `${user.slice(0, 1)}-item-${i}`, status: st, access_token: "access-sandbox-x" });
  if (partner) state.rows.household_members.push({ user_id: A, household_id: "h1", role: "owner" }, { user_id: B, household_id: "h1", role: "partner" });
  if (plus) state.rows.plus_addon_subscriptions.push({ user_id: plus, provider: "stripe", plan_key: "plus_monthly", status: "active", product_id: "price_pm", current_period_end: future });
  const from = (table) => {
    const q = {
      f: {},
      select() { return q; }, eq(c, v) { q.f[c] = v; return q; }, in() { return q; }, not() { return q; },
      _err() { if (table === "plus_addon_subscriptions" && failPlus) return { code: "57014", message: "timeout" }; if (table === "plaid_items" && failItems) return { code: "57014", message: "timeout" }; return null; },
      _hits() { return (state.rows[table] || []).filter((r) => Object.entries(q.f).every(([k, v]) => r[k] === v)); },
      async maybeSingle() { const e = q._err(); return e ? { data: null, error: e } : { data: q._hits()[0] || null, error: null }; },
      async single() { const h = q._hits()[0]; return h ? { data: h, error: null } : { data: null, error: { message: "none" } }; },
      then(res, rej) { const e = q._err(); return Promise.resolve(e ? { data: null, error: e } : { data: q._hits(), error: null, count: q._hits().length }).then(res, rej); },
      async upsert(row) { state.writes.push([table, "upsert"]); (state.rows[table] = state.rows[table] || []).push({ ...row }); return { error: null }; },
      update() { state.writes.push([table, "update"]); return { eq: async () => ({ error: null }) }; },
      delete() { state.writes.push([table, "delete"]); return { eq: () => ({ eq: async () => ({ error: null }) }) }; },
    };
    return q;
  };
  return { state, admin: { from, rpc: async () => ({ data: null, error: null }), auth: { admin: {} } } };
}

function load(db, user) {
  for (const p of [AUTH_PATH, PLUS_PATH, LIM_PATH, PLAID_PATH]) delete require.cache[p];
  const real = require(AUTH_PATH);
  require.cache[AUTH_PATH].exports = { ...real, getAdminClient: () => db.admin, getUserFromRequest: async () => ({ user_id: user, error: null }), getUserPlan: async () => ({ plan: "plus", unlimited: true, status_unavailable: false }) };
  return { plaid: require(PLAID_PATH), lim: require(LIM_PATH) };
}

(async () => {
  const t = create();
  const saved = { ...process.env };
  const quiet = { e: console.error, w: console.warn }; console.error = () => {}; console.warn = () => {};
  const realFetch = global.fetch;
  const plaidCalls = [];
  global.fetch = async (url) => {
    plaidCalls.push(String(url).replace(/^https:\/\/[^/]+/, ""));
    if (/link\/token\/create/.test(url)) return { ok: true, status: 200, json: async () => ({ link_token: "link-sandbox-x" }) };
    if (/public_token\/exchange/.test(url)) return { ok: true, status: 200, json: async () => ({ access_token: "access-sandbox-new", item_id: "item-new" }) };
    return { ok: true, status: 200, json: async () => ({ accounts: [], item: { item_id: "item-new" } }) };
  };
  for (const k of Object.keys(process.env)) if (/^PLUS_ENABLED$|^HOUSEHOLD_ENABLED$|^ENFORCE_PLAN_LIMITS$|^STRIPE_PRICE_/.test(k)) delete process.env[k];
  Object.assign(process.env, { PLAID_CLIENT_ID: "test-client", PLAID_SECRET: "test-secret", PLAID_ENV: "sandbox", HOUSEHOLD_ENABLED: "true",
    STRIPE_PRICE_MONTHLY_CAD: "price_m", STRIPE_PRICE_ANNUAL_CAD: "price_a", STRIPE_PRICE_FOUNDING_ANNUAL_CAD: "price_f", STRIPE_PRICE_PLUS_MONTHLY_CAD: "price_pm", STRIPE_PRICE_PLUS_ANNUAL_CAD: "price_pa" });
  const call = async (plaid, body) => {
    const r = await plaid.handler({ httpMethod: "POST", headers: { origin: "https://flourishmoney.app", authorization: "Bearer x" }, body: JSON.stringify(body) });
    let b = null; try { b = JSON.parse(r.body); } catch { b = null; }
    return { status: r.statusCode, body: b };
  };
  const V = await import("../src/lib/bankLimitView.js");
  const L = require(LIM_PATH);

  try {
    process.env.PLUS_ENABLED = "true";
    // ── 1. One person at the limit ────────────────────────────────────────────────────────────────
    {
      t.eq([L.BASIC_PER_PERSON, L.PLUS_HOUSEHOLD_FAIR_USE], [2, 10], "1a the decided numbers: 2 per person, 10 per household with Plus");
      t.eq(L.mayAddBank({ plus: false, personUsed: 1, householdUsed: 1 }).allowed, true, "1b one person with 1 bank may add a second");
      t.eq(L.mayAddBank({ plus: false, personUsed: 2, householdUsed: 2 }), { allowed: false, scope: "person", used: 2, limit: 2 }, "1c …and at 2 of 2 may not add a third");
      const db = makeDb({ items: { [A]: ["active", "error"] } });
      const { lim } = load(db, A);
      const r = await lim.bankLimitFor(db.admin, A);
      t.eq([r.allowed, r.used, r.limit, r.over], [false, 2, 2, false], "1d a bank that needs a fresh sign-in is still a login held: 2 of 2");
      const revoked = makeDb({ items: { [A]: ["active", "revoked"] } });
      t.eq((await load(revoked, A).lim.bankLimitFor(revoked.admin, A)).used, 1, "1e one the bank has revoked does not count");
    }
    // ── 2. Two people, one has used both of theirs ─────────────────────────────────────────────────
    {
      const db = makeDb({ items: { [A]: ["active", "active"] }, partner: true });
      const { lim } = load(db, A);
      const a = await lim.bankLimitFor(db.admin, A);
      const b = await lim.bankLimitFor(db.admin, B);
      t.eq([a.allowed, a.used, a.limit], [false, 2, 2], "2a the partner who used both of theirs may not add another");
      t.eq([b.allowed, b.used, b.limit, b.household_used], [true, 0, 2, 2], "2b the other partner still has both of theirs: per person, never pooled (the household's 4 is 2 each)");
      const both = makeDb({ items: { [A]: ["active", "active"], [B]: ["active", "active"] }, partner: true });
      t.eq((await load(both, B).lim.bankLimitFor(both.admin, B)).allowed, false, "2c once each has used 2, the household's 4 are used");
    }
    // ── 3. Basic to Plus ───────────────────────────────────────────────────────────────────────────
    {
      const db = makeDb({ items: { [A]: ["active", "active"], [B]: ["active"] }, partner: true, plus: B });
      const { lim } = load(db, A);
      const a = await lim.bankLimitFor(db.admin, A);
      t.eq([a.plus, a.allowed, a.scope, a.used, a.limit], [true, true, "household", 3, 10], "3a with Plus (bought by either partner) the person at 2 may add more: 3 of the household's 10");
      t.eq([L.mayAddBank({ plus: true, personUsed: 7, householdUsed: 9 }).allowed, L.mayAddBank({ plus: true, personUsed: 10, householdUsed: 10 }).allowed], [true, false], "3b …up to the fair-use limit of 10 for the household, whoever holds them");
    }
    // ── 4. Plus lapses with more than 4 connected ──────────────────────────────────────────────────
    {
      const db = makeDb({ items: { [A]: ["active", "active", "active", "active"], [B]: ["active", "active"] }, partner: true });
      const { lim } = load(db, A);
      const a = await lim.bankLimitFor(db.admin, A);
      const b = await lim.bankLimitFor(db.admin, B);
      t.eq([a.plus, a.connected, a.over, a.allowed, b.allowed], [false, 6, true, false, false], "4a Plus ended with 6 connected (4 and 2): all 6 are still there, the household is over its plan, and neither may add one");
      t.eq(V.overLimitLine({ over: true, connected: 6, limit: 2 }), "[WORDS: banks-over-limit-kept] [limit 2, count 6]", "4b Settings says so with the server's numbers (placeholder until approved)");
      const uneven = makeDb({ items: { [A]: ["active", "active", "active", "active", "active"], [B]: ["active"] }, partner: true });
      const ub = await load(uneven, B).lim.bankLimitFor(uneven.admin, B);
      t.eq([ub.allowed, ub.used], [true, 1], "4c 5 and 1: the partner with 1 may still add their second");
      t.eq(db.state.writes, [], "4d working out the limit writes nothing: no bank is disconnected or changed");
    }
    // ── 5. The handlers ────────────────────────────────────────────────────────────────────────────
    {
      const db = makeDb({ items: { [A]: ["active", "active"] } });
      const { plaid } = load(db, A);
      plaidCalls.length = 0;
      const lt = await call(plaid, { action: "create_link_token", country: "CA" });
      t.eq([lt.status, lt.body, plaidCalls.length], [402, { error: "bank_limit", scope: "person", used: 2, limit: 2 }, 0], "5a at 2 of 2, a new bank is refused before Plaid opens (nobody signs in to a bank for nothing)");
      const re = await call(plaid, { action: "create_link_token", country: "CA", item_id: "a-item-0" });
      t.eq([re.status, plaidCalls.some((u) => /link\/token\/create/.test(u))], [200, true], "5b a reconnect of a bank already held is never limited");
      plaidCalls.length = 0;
      const ex = await call(plaid, { action: "exchange_token", public_token: "public-sandbox-x", institution_name: "Bank" });
      t.eq([ex.status, ex.body && ex.body.error, plaidCalls.length, db.state.writes.filter(([tb]) => tb === "plaid_items").length], [402, "bank_limit", 0, 0], "5c exchange checks again: refused, Plaid not asked, nothing written");
      const room = makeDb({ items: { [A]: ["active"] } });
      const ok = await call(load(room, A).plaid, { action: "exchange_token", public_token: "public-sandbox-x", institution_name: "Bank" });
      t.ok(ok.status !== 402 && room.state.writes.some(([tb]) => tb === "plaid_items"), "5d with room, the bank is exchanged and saved as before");
      const failing = makeDb({ items: { [A]: ["active"] }, failPlus: true });
      plaidCalls.length = 0;
      const f = await call(load(failing, A).plaid, { action: "create_link_token", country: "CA" });
      const fx = await call(load(failing, A).plaid, { action: "exchange_token", public_token: "public-sandbox-x" });
      t.eq([f.status, fx.status, plaidCalls.length, failing.state.writes], [503, 503, 0, []], "5e the plan read fails: the new bank waits (503, a plain line), never a guessed count, and nothing is touched");
      const itemsFail = makeDb({ failItems: true });
      t.eq((await call(load(itemsFail, A).plaid, { action: "create_link_token", country: "CA" })).status, 503, "5f the bank count read fails: the same");
      delete process.env.PLUS_ENABLED;
      const off = makeDb({ items: { [A]: ["active", "active", "active"] } });
      const o = await call(load(off, A).plaid, { action: "create_link_token", country: "CA" });
      const os = await call(load(off, A).plaid, { action: "bank_limit_status" });
      t.eq([o.status, os.status], [200, 404], "5g PLUS_ENABLED off: a third bank opens as today, and the status action is absent");
      process.env.PLUS_ENABLED = "true";
      const st = await call(load(makeDb({ items: { [A]: ["active", "active", "active"] } }), A).plaid, { action: "bank_limit_status" });
      t.eq(st.body, { plus: false, scope: "person", used: 3, limit: 2, allowed: false, connected: 3, over: true }, "5h the status action: numbers only");
      const mig = makeDb({ items: { [A]: ["active", "active"] } });
      const m = await call(load(mig, A).plaid, { action: "migrate_items", tokens: [{ token: "access-sandbox-1" }] });
      t.eq([m.status, m.body && m.body.failures && m.body.failures[0] && m.body.failures[0].error, mig.state.writes.filter(([tb]) => tb === "plaid_items").length],
        [200, "bank_limit", 0], "5i migrate_items, the second way in: a NEW bank past the limit is refused the same way, nothing saved");
    }
    // ── 6. Nothing disconnects or stops because of a limit ─────────────────────────────────────────
    {
      const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
      const limSrc = strip(fs.readFileSync(LIM_PATH, "utf8"));
      t.ok(!/\.delete\(|\.update\(|\.upsert\(|\.insert\(|item\/remove/.test(limSrc), "6a the limit code writes nothing and removes nothing");
      const plaidSrc = fs.readFileSync(PLAID_PATH, "utf8");
      const uses = [...plaidSrc.matchAll(/bankLimitFor\(/g)].map((m) => { const before = plaidSrc.slice(0, m.index); const a = before.lastIndexOf('action === "'); return before.slice(a + 12, before.indexOf("\"", a + 12)); });
      t.eq([...new Set(uses)].sort(), ["bank_limit_status", "create_link_token", "exchange_token", "migrate_items"], "6b asked only where a NEW bank is added (and the status), never in sync, accounts, transactions, investments or liabilities");
      for (const f of ["plaid-webhook.js"]) t.ok(!/bankLimits/.test(fs.readFileSync(path.join(REPO, "netlify", "functions", f), "utf8")), `6c ${f} never reads the limit`);
    }
    // ── 7. The app's lines ─────────────────────────────────────────────────────────────────────────
    {
      const e = (body) => Object.assign(new Error(body.error), { body });
      t.eq(V.bankLimitMessage(e({ error: "bank_limit", scope: "person", used: 2, limit: 2 })), "[WORDS: banks-limit-person] [used 2, limit 2]", "7a the person's line, with the server's numbers");
      t.eq(V.bankLimitMessage(e({ error: "bank_limit", scope: "household", used: 10, limit: 10 })), "[WORDS: banks-limit-household] [used 10, limit 10]", "7b the household's fair-use line");
      t.eq(V.bankLimitMessage(e({ error: "bank_limit", scope: "person", used: "2", limit: null })), "[WORDS: plus-status-unavailable]", "7c numbers that are not whole are never shown: the plain line");
      t.eq([V.bankLimitMessage(e({ error: "plan_limit" })), V.bankLimitMessage(new Error("x")), V.bankLimitMessage(null)], [null, null, null], "7d any other error is left to what the screen said before");
      const app = fs.readFileSync(path.join(REPO, "src", "App.jsx"), "utf8");
      t.ok((app.match(/bankLimitMessage\(err\)/g) || []).length >= 4 && /err\.body = data;/.test(app), "7e the app words the server's answer where a new bank is started or exchanged, on the website and in the store apps");
    }
  } finally {
    console.error = quiet.e; console.warn = quiet.w; global.fetch = realFetch;
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  }
  t.summary("bankLimits.test");
})();
