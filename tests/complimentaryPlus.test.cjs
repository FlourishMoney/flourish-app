// tests/complimentaryPlus.test.cjs
// -----------------------------------------------------------------------------
// COMPLIMENTARY PLUS, READ ON THE SERVER (2026-11-20, migration 0051, _lib/plusAddon.js). An account given the Plus
// add-on free, by hand. The real plusAddon module and the real billing handler, against a stand-in database.
//   1  the flag: off, nothing is read and nobody has Plus, complimentary or not
//   2  a complimentary row gives Plus; a row for the main plan alone does not; no row, no Plus
//   3  it covers the household the way paid Plus does: the partner has Plus, "covered by partner"
//   4  0051 not applied: nobody has complimentary Plus, and paid Plus is read as before
//   5  a read that fails is "unavailable": never Plus, never "no Plus"; paid Plus never waits on it
//   6  the billing handler: plus_status says Plus; Plus is never SOLD to an account that has it free
//   7  it is set on the server only: no function writes it, the app never names it, the repo holds no name
// -----------------------------------------------------------------------------
"use strict";
const fs = require("fs");
const path = require("path");
const { create } = require("./_runner.cjs");

const REPO = path.join(__dirname, "..");
const read = (...p) => fs.readFileSync(path.join(REPO, ...p), "utf8");
const AUTH_PATH = require.resolve("../netlify/functions/_lib/auth.js");
const API_PATH = require.resolve("../netlify/functions/_lib/stripeApi.js");
const ALERT_PATH = require.resolve("../netlify/functions/_lib/supportAlert.js");
const PLUS_PATH = require.resolve("../netlify/functions/_lib/plusAddon.js");
const BILLING_PATH = require.resolve("../netlify/functions/billing.js");
const U = "11111111-1111-4111-8111-111111111111";
const P = "22222222-2222-4222-8222-222222222222";
const H = "33333333-3333-4333-8333-333333333333";
const MISSING = { code: "PGRST205", message: "Could not find the table 'public.complimentary_access' in the schema cache" };
const TIMEOUT = { code: "57014", message: "canceling statement due to statement timeout" };

function makeDb({ compError = null } = {}) {
  const state = { rows: { plus_addon_subscriptions: [], complimentary_access: [], household_members: [], profiles: [], subscriptions: [] }, reads: [], writes: [] };
  const from = (table) => {
    const q = {
      f: {},
      select() { state.reads.push(table); return q; },
      eq(c, v) { q.f[c] = v; return q; },
      not() { return q; },
      _err() { return table === "complimentary_access" ? compError : null; },
      _hits() { return (state.rows[table] || []).filter((r) => Object.entries(q.f).every(([k, v]) => r[k] === v)); },
      async maybeSingle() { const e = q._err(); return e ? { data: null, error: e } : { data: q._hits()[0] || null, error: null }; },
      then(res, rej) { const e = q._err(); return Promise.resolve(e ? { data: null, error: e } : { data: q._hits(), error: null }).then(res, rej); },
      insert() { state.writes.push(table); return { select: async () => ({ data: [], error: null }) }; },
      async upsert() { state.writes.push(table); return { error: null }; },
      update() { state.writes.push(table); return { eq: async () => ({ error: null }) }; },
      delete() { state.writes.push(table); return { eq: async () => ({ error: null }) }; },
    };
    return q;
  };
  return { state, admin: { from, rpc: async (fn) => { state.writes.push(`rpc:${fn}`); return { data: null, error: null }; }, auth: { admin: { getUserById: async () => ({ data: { user: { email: "x@example.invalid" } } }) } } } };
}
const couple = (db) => db.state.rows.household_members.push({ household_id: H, user_id: U, role: "owner" }, { household_id: H, user_id: P, role: "member" });

(async () => {
  const t = create();
  const saved = { ...process.env };
  const quiet = console.error; console.error = () => {};
  for (const k of Object.keys(process.env)) if (/^STRIPE_PRICE_|^PLUS_ENABLED$|^IAP_ENABLED$/.test(k)) delete process.env[k];
  Object.assign(process.env, { BILLING_ENABLED: "true", STRIPE_SECRET_KEY: "sk_test_mock_never_sent", STRIPE_PRICE_PLUS_MONTHLY_CAD: "price_pm", STRIPE_PRICE_PLUS_ANNUAL_CAD: "price_pa" });
  const ON = { PLUS_ENABLED: "true", STRIPE_PRICE_PLUS_MONTHLY_CAD: "price_pm", STRIPE_PRICE_PLUS_ANNUAL_CAD: "price_pa" };
  const future = new Date(Date.now() + 20 * 86400000).toISOString();
  const paidRow = (id) => ({ user_id: id, provider: "stripe", plan_key: "plus_monthly", status: "active", product_id: "price_pm", current_period_end: future });
  try {
    delete require.cache[PLUS_PATH];
    const plus = require(PLUS_PATH);
    t.eq(plus.COMP_TABLE, "complimentary_access", "0a the table is migration 0051's");

    // ── 1. the flag ──
    {
      const db = makeDb(); db.state.rows.complimentary_access.push({ user_id: U, main_plan: true, plus_addon: true });
      const off = await plus.getPlusEntitlement(db.admin, U, { env: {} });
      t.eq([off.enabled, off.plus, db.state.reads.length], [false, false, 0], "1a PLUS_ENABLED unset: nothing is read, and a complimentary row gives nothing");
    }

    // ── 2. the row ──
    {
      const db = makeDb(); db.state.rows.complimentary_access.push({ user_id: U, main_plan: true, plus_addon: true });
      const e = await plus.getPlusEntitlement(db.admin, U, { env: ON });
      t.eq([e.enabled, e.plus, e.covered_by, e.status_unavailable, e.complimentary], [true, true, null, false, true], "2a a complimentary row gives Plus, as the account's own");
      t.eq(await plus.hasComplimentaryPlus(db.admin, U), true, "2b …and the one read says so");
      const mainOnly = makeDb(); mainOnly.state.rows.complimentary_access.push({ user_id: U, main_plan: true, plus_addon: false });
      const m = await plus.getPlusEntitlement(mainOnly.admin, U, { env: ON });
      t.eq([m.plus, m.status_unavailable], [false, false], "2c the main plan given free is not Plus");
      const none = makeDb();
      const n = await plus.getPlusEntitlement(none.admin, U, { env: ON });
      t.eq([n.plus, n.status_unavailable, n.complimentary], [false, false, undefined], "2d no row, no Plus");
      const other = makeDb(); other.state.rows.complimentary_access.push({ user_id: P, main_plan: false, plus_addon: true });
      t.eq((await plus.getPlusEntitlement(other.admin, U, { env: ON })).plus, false, "2e another account's row gives this one nothing (no household)");
      t.eq(db.state.writes.concat(mainOnly.state.writes, none.state.writes, other.state.writes), [], "2f reading it writes nothing");
    }

    // ── 3. the household ──
    {
      const db = makeDb(); couple(db); db.state.rows.complimentary_access.push({ user_id: P, main_plan: false, plus_addon: true });
      const mine = await plus.getPlusEntitlement(db.admin, U, { env: ON });
      const theirs = await plus.getPlusEntitlement(db.admin, P, { env: ON });
      t.eq([mine.plus, mine.covered_by, theirs.plus, theirs.covered_by], [true, "partner", true, null], "3a the partner of a complimentary account has Plus, covered by the partner");
      const paid = makeDb(); couple(paid); paid.state.rows.plus_addon_subscriptions.push(paidRow(U)); paid.state.rows.complimentary_access.push({ user_id: P, main_plan: false, plus_addon: true });
      const e = await plus.getPlusEntitlement(paid.admin, U, { env: ON });
      t.eq([e.plus, e.covered_by, e.complimentary], [true, null, undefined], "3b a household that pays for Plus is read as paying: the paid row is found first");
    }

    // ── 4. 0051 not applied ──
    {
      const db = makeDb({ compError: MISSING });
      const e = await plus.getPlusEntitlement(db.admin, U, { env: ON });
      t.eq([e.plus, e.status_unavailable], [false, false], "4a no table yet: nobody has complimentary Plus, and that is an answer, not a failure");
      const pg = makeDb({ compError: { code: "42P01", message: 'relation "public.complimentary_access" does not exist' } });
      t.eq(await plus.hasComplimentaryPlus(pg.admin, U), false, "4b …whichever way Postgres says it");
      const paid = makeDb({ compError: MISSING }); paid.state.rows.plus_addon_subscriptions.push(paidRow(U));
      t.eq((await plus.getPlusEntitlement(paid.admin, U, { env: ON })).plus, true, "4c paid Plus is read as before");
    }

    // ── 5. a read that fails ──
    {
      const db = makeDb({ compError: TIMEOUT }); db.state.rows.complimentary_access.push({ user_id: U, main_plan: true, plus_addon: true });
      const e = await plus.getPlusEntitlement(db.admin, U, { env: ON });
      t.eq([e.plus, e.status_unavailable], [false, true], "5a a failed read is unavailable: never Plus, never \"no Plus\"");
      t.eq(await plus.hasComplimentaryPlus(db.admin, U), null, "5b …the one read answers null, not false");
      const paid = makeDb({ compError: TIMEOUT }); paid.state.rows.plus_addon_subscriptions.push(paidRow(U));
      const p = await plus.getPlusEntitlement(paid.admin, U, { env: ON });
      t.eq([p.plus, p.status_unavailable, paid.state.reads.includes("complimentary_access")], [true, false, false], "5c a household that pays never waits on the complimentary read");
    }

    // ── 6. the billing handler ──
    {
      const db = makeDb(); db.state.rows.complimentary_access.push({ user_id: U, main_plan: true, plus_addon: true });
      const posts = [];
      for (const p of [AUTH_PATH, API_PATH, ALERT_PATH, PLUS_PATH, BILLING_PATH]) delete require.cache[p];
      const real = require(AUTH_PATH);
      require.cache[AUTH_PATH].exports = { ...real, getAdminClient: () => db.admin, getUserFromRequest: async () => ({ user_id: U, error: null }) };
      require.cache[API_PATH] = { id: API_PATH, filename: API_PATH, loaded: true, exports: { stripeGet: async () => ({ data: [] }), stripePost: async (p) => { posts.push(p); return { id: "x", url: "https://stripe.test/pay" }; }, stripeDelete: async () => ({}), formEncode: () => "", STRIPE_BASE: "https://stripe.test" } };
      require.cache[ALERT_PATH] = { id: ALERT_PATH, filename: ALERT_PATH, loaded: true, exports: { alertSupport: async () => true, supportAlertMessage: () => ({}), DEFAULT_TO: "x" } };
      const billing = require(BILLING_PATH);
      const call = async (body) => {
        const r = await billing.handler({ httpMethod: "POST", headers: { origin: "https://flourishmoney.app", authorization: "Bearer x" }, body: JSON.stringify(body) });
        let b = null; try { b = JSON.parse(r.body); } catch { b = null; }
        return { status: r.statusCode, body: b };
      };
      const off = await call({ action: "plus_status" });
      t.eq(off.status, 404, "6a PLUS_ENABLED unset: the Plus answers are not there at all, complimentary row or not");
      process.env.PLUS_ENABLED = "true";
      const st = await call({ action: "plus_status" });
      t.eq([st.status, st.body], [200, { enabled: true, plus: true, covered_by: null, manage: null, min_client: "1.1.8" }], "6b on: plus_status says Plus, tells the app nothing about why, and offers nothing to manage (there is no purchase)");
      const buy = await call({ action: "plus_checkout", plan_key: "plus_monthly" });
      t.eq([buy.status, buy.body && buy.body.error, posts], [409, "already_plus", []], "6c Plus is never sold to an account that has it free: no Stripe customer, no checkout");
      t.ok(!db.state.writes.includes("complimentary_access") && !db.state.writes.some((w) => /^rpc:complimentary/.test(w)), "6d …and nothing the app can ask for writes the complimentary row");
      delete process.env.PLUS_ENABLED;
      for (const p of [AUTH_PATH, API_PATH, ALERT_PATH, PLUS_PATH, BILLING_PATH]) delete require.cache[p];
    }

    // ── 7. server side only, and no name ──
    {
      const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)]);
      const fnFiles = walk(path.join(REPO, "netlify", "functions")).filter((f) => f.endsWith(".js"));
      const naming = fnFiles.filter((f) => /complimentary_access|COMP_TABLE/.test(fs.readFileSync(f, "utf8"))).map((f) => path.relative(REPO, f));
      t.eq(naming, [path.join("netlify", "functions", "_lib", "plusAddon.js")], "7a one server file names the table");
      const lib = read("netlify", "functions", "_lib", "plusAddon.js");
      t.eq((lib.match(/from\(COMP_TABLE\)/g) || []).length, 1, "7b …in one place");
      t.ok(/admin\.from\(COMP_TABLE\)\.select\("plus_addon"\)\.eq\("user_id", userId\)\.maybeSingle\(\)/.test(lib), "7c …a read of one column for one account");
      t.ok(!fnFiles.some((f) => /complimentary_access_set/.test(fs.readFileSync(f, "utf8"))), "7d no function calls the one that sets it: it is set by hand, with the service role");
      const srcFiles = walk(path.join(REPO, "src")).filter((f) => /\.(js|jsx)$/.test(f));
      t.ok(!srcFiles.some((f) => /complimentary_access|complimentary:/.test(fs.readFileSync(f, "utf8"))), "7e the app never names it");
      const sql = read("supabase", "migrations", "0051_complimentary_access.sql");
      t.ok(!/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}/.test(sql) && !/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(sql) && (sql.match(/insert into public\.complimentary_access/g) || []).length === 1 && /insert into public\.complimentary_access as c \(user_id, main_plan, plus_addon, prior_plan\)\s+values \(p_user_id, p_main_plan, p_plus_addon, prior\)/.test(sql),
        "7f the migration holds no email address and no account id, and gives nobody anything by itself");
      t.ok(/^[ \t]*--[ \t]*grants:[ \t]*service_role only[ \t]*$/im.test(sql) && /revoke all on table public\.complimentary_access from anon, authenticated;/.test(sql)
        && /revoke all on function public\.complimentary_access_set\(uuid, boolean, boolean\) from public, anon, authenticated;/.test(sql)
        && /grant execute on function public\.complimentary_access_set\(uuid, boolean, boolean\) to service_role;/.test(sql), "7g the table and its function are the service role's alone");
      t.ok(!fs.existsSync(path.join(REPO, "docs", "ops", "COMPLIMENTARY-ACCESS.md")) && !walk(path.join(REPO, "docs")).some((f) => /complimentary_access_set/.test(fs.readFileSync(f, "utf8"))),
        "7h who has it, and the steps to give it, are not in this repo");
    }
  } catch (e) {
    t.ok(false, `the suite ran: ${e && e.stack ? e.stack.split("\n").slice(0, 3).join(" | ") : e}`);
  } finally {
    console.error = quiet;
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  }
  t.summary("complimentaryPlus.test");
})();
