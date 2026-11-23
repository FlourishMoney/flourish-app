// tests/plusEntitlement.test.cjs
// -----------------------------------------------------------------------------
// THE PLUS ADD-ON'S ENTITLEMENT (2026-11-10, _lib/plusAddon.js, migration 0044). Runs the real billing and webhook
// handlers against a stand-in database and a mocked Stripe and RevenueCat.
//   1  the row rule: only a live row whose product is one of Plus's own (never a main-plan price, never no period end)
//   2  the stores: RevenueCat's plus_addon entitlement AND the store purchase must agree; a promotional grant is no Plus
//   3  the read fails closed: flag off reads nothing; a failed read is "unavailable", never Plus and never "no Plus"
//   4  a founding household keeps every feature it has today and is offered Plus as an extra
//   5  a monthly household buys Plus on the website and keeps its monthly plan, untouched
//   6  a household with no Plus sees no Plus feature and no half-open screen
//   7  a billing read that fails: a plain line, never a number
//   8  the website and the iPhone: one answer from one row, whichever way round it was bought
//   9  deleting the account cancels a live Plus subscription at Stripe
// -----------------------------------------------------------------------------
"use strict";
const fs = require("fs");
const path = require("path");
const { create } = require("./_runner.cjs");
const { signPayload } = require("../netlify/functions/_lib/stripeSignature.js");

const AUTH_PATH = require.resolve("../netlify/functions/_lib/auth.js");
const API_PATH = require.resolve("../netlify/functions/_lib/stripeApi.js");
const LIVE_PATH = require.resolve("../netlify/functions/_lib/stripeLive.js");
const ALERT_PATH = require.resolve("../netlify/functions/_lib/supportAlert.js");
const PLUS_PATH = require.resolve("../netlify/functions/_lib/plusAddon.js");
const HOOK_PATH = require.resolve("../netlify/functions/stripe-webhook.js");
const BILLING_PATH = require.resolve("../netlify/functions/billing.js");
const PLAID_PATH = require.resolve("../netlify/functions/plaid.js");
const REPO = path.join(__dirname, "..");
const U = "11111111-1111-4111-8111-111111111111";
const P = "22222222-2222-4222-8222-222222222222";
const DAY = 86400;

function makeDb({ failPlusRead = false, missingPlus = false } = {}) {
  const state = { rows: { subscriptions: [], billing_events: [], plaid_items: [], plus_addon_subscriptions: [], household_members: [], profiles: [] }, writes: [], reads: [], rpcs: [], attempts: {}, rpcHook: null };
  const api = (table) => {
    const q = {
      f: {},
      select() { state.reads.push(table); return q; },
      eq(c, v) { q.f[c] = v; return q; },
      not() { return q; },
      _err() {
        if (table !== "plus_addon_subscriptions") return null;
        if (missingPlus) return { code: "PGRST205", message: "Could not find the table in the schema cache" };
        if (failPlusRead) return { code: "57014", message: "canceling statement due to statement timeout" };
        return null;
      },
      _hits() { return (state.rows[table] || []).filter((r) => Object.entries(q.f).every(([k, v]) => r[k] === v)); },
      async maybeSingle() { const e = q._err(); return e ? { data: null, error: e } : { data: q._hits()[0] || null, error: null }; },
      then(res, rej) { const e = q._err(); return Promise.resolve(e ? { data: null, error: e } : { data: q._hits(), error: null }).then(res, rej); },
      insert(row) {
        state.writes.push(table);
        const rows = state.rows[table]; const pk = table === "billing_events" ? "event_id" : "user_id";
        const dup = rows.some((r) => r[pk] === row[pk]); if (!dup) rows.push({ ...row });
        return { select: async () => ({ data: dup ? [] : [row], error: null }) };
      },
      // Writes as the service-role client answers them: awaited as they are, or with .select() for the rows written.
      // upsert's ignoreDuplicates (insert only if the row is not there) and update's further filters (eq, is) are what
      // plusAddon.writePlusRow uses to write a row only if it is still as it was read (review 2026-11-22).
      upsert(row, opts = {}) {
        state.writes.push(table);
        let done = null;
        const go = async () => {
          const e = q._err(); if (e) return { data: null, error: e };
          const pk = table === "billing_events" ? "event_id" : "user_id";
          const rows = state.rows[table] = state.rows[table] || []; const i = rows.findIndex((r) => r[pk] === row[pk]);
          if (i >= 0) { if (opts.ignoreDuplicates) return { data: [], error: null }; rows[i] = { ...rows[i], ...row }; return { data: [rows[i]], error: null }; }
          rows.push({ ...row }); return { data: [row], error: null };
        };
        const run = () => (done = done || go());
        return { select: () => run(), then: (res, rej) => run().then(res, rej) };
      },
      update(p) {
        state.writes.push(table);
        const f = []; let done = null;
        const go = async () => { const hit = (state.rows[table] || []).filter((r) => f.every((x) => x(r))); hit.forEach((r) => Object.assign(r, p)); return { data: hit.map((r) => ({ ...r })), error: null }; };
        const run = () => (done = done || go());
        const w = { eq(c, v) { f.push((r) => r[c] === v); return w; }, is(c, v) { f.push((r) => (r[c] === undefined ? null : r[c]) === v); return w; }, select: () => run(), then: (res, rej) => run().then(res, rej) };
        return w;
      },
      delete() {
        state.writes.push(table);
        const f = []; let done = null;
        const go = async () => { state.rows[table] = (state.rows[table] || []).filter((r) => !f.every((x) => x(r))); return { error: null }; };
        const run = () => (done = done || go());
        const w = { eq(c, v) { f.push((r) => r[c] === v); return w; }, in: async () => ({ error: null }), then: (res, rej) => run().then(res, rej) };
        return w;
      },
    };
    return q;
  };
  const admin = {
    from: api,
    // The two Plus attempt functions answer as migration 0052 does (tests/plusPurchaseHold.sql.test.cjs holds the real
    // ones in a real Postgres): one live attempt per person, and per household.
    rpc: async (fn, a = {}) => {
      state.rpcs.push([fn, a]);
      if (state.rpcHook) { const r = await state.rpcHook(fn, a); if (r) return r; }
      const held = { data: { result: "held" }, error: null };
      if (fn === "purchase_attempt_begin") return held;
      if (fn === "plus_purchase_attempt_begin") {
        const hh = (u) => (state.rows.household_members.find((m) => m.user_id === u) || {}).household_id || null;
        const mine = state.attempts[a.p_user];
        if (mine) {
          if (mine.attempt === a.p_attempt && mine.provider === a.p_provider && !mine.pending) return held;
          if (!(mine.provider === "stripe" && a.p_provider === "stripe" && !mine.pending)) return { data: { result: "held_elsewhere", mine: true, provider: mine.provider, pending: mine.pending }, error: null };
        }
        const h = hh(a.p_user);
        const other = h && Object.keys(state.attempts).find((u) => u !== a.p_user && hh(u) === h);
        if (other) return { data: { result: "held_elsewhere", mine: false, provider: state.attempts[other].provider, pending: state.attempts[other].pending }, error: null };
        state.attempts[a.p_user] = { attempt: a.p_attempt, provider: a.p_provider, pending: false };
        return held;
      }
      if (fn === "plus_purchase_attempt_pending") {
        const m = state.attempts[a.p_user];
        if (m && m.attempt === a.p_attempt && m.provider !== "stripe") { m.pending = true; return { data: { result: "pending" }, error: null }; }
        return { data: { result: "not_held" }, error: null };
      }
      return { data: null, error: null };
    },
    auth: { admin: { getUserById: async () => ({ data: { user: { email: "x@example.invalid", email_confirmed_at: "2026-10-01T00:00:00Z" } } }), deleteUser: async () => ({ error: null }) } },
  };
  return { state, admin };
}

function makeStripe() {
  // portalConfigs: the account's portal configurations, as Stripe lists them. bpc_default is the shared one the main
  // plan uses: it lets a customer switch plans. portalSessions: every portal session asked for. fail: paths that throw.
  const log = []; const stripe = { subs: [], sessions: [], portalSessions: [], fail: {},
    portalConfigs: [{ id: "bpc_default", active: true, is_default: true, metadata: {}, features: { subscription_update: { enabled: true }, subscription_cancel: { enabled: true }, payment_method_update: { enabled: true } } }] };
  const boom = (what) => { const e = new Error("stripe said no"); e.statusCode = stripe.fail[what]; return e; };
  const get = async (p) => {
    log.push(`GET ${p}`);
    if (p.startsWith("/subscriptions?")) { const cus = decodeURIComponent((/customer=([^&]+)/.exec(p) || [])[1] || ""); return { data: stripe.subs.filter((s) => s.customer === cus) }; }
    if (p.startsWith("/checkout/sessions?")) return { data: [] };
    if (p.startsWith("/billing_portal/configurations?")) {
      if (stripe.fail.list) throw boom("list");
      const want = (k) => (new RegExp(`${k}=(true|false)`).exec(p) || [])[1];
      return { data: stripe.portalConfigs.filter((c) => (want("active") === undefined || String(c.active) === want("active")) && (want("is_default") === undefined || String(c.is_default) === want("is_default"))) };
    }
    const id = decodeURIComponent(p.split("/").pop());
    const s = stripe.subs.find((x) => x.id === id);
    if (!s) { const e = new Error("no such subscription"); e.statusCode = 404; throw e; }
    return s;
  };
  const post = async (p, body) => {
    log.push(`POST ${p}`);
    if (p === "/customers") return { id: body && body.metadata && body.metadata.kind === "plus_addon" ? "cus_P" : "cus_M" };
    if (p === "/checkout/sessions") { stripe.sessions.push(body); return { id: "cs_plus", url: "https://stripe.test/pay" }; }
    if (p === "/billing_portal/configurations") {
      if (stripe.fail.create) throw boom("create");
      const made = { id: `bpc_made_${stripe.portalConfigs.length}`, active: true, is_default: false, metadata: { ...(body.metadata || {}) }, features: JSON.parse(JSON.stringify(body.features || {})), ...(stripe.madeAs || {}) };
      stripe.portalConfigs.push(made); return made;
    }
    if (p === "/billing_portal/sessions") {
      const cfg = stripe.portalConfigs.find((c) => c.id === body.configuration);
      if (stripe.fail.session || (body.configuration && (!cfg || !cfg.active))) throw boom("session");
      stripe.portalSessions.push({ ...body }); return { url: `https://stripe.test/portal/${body.customer}` };
    }
    return {};
  };
  const del = async (p) => { log.push(`DELETE ${p}`); const id = decodeURIComponent(p.split("/").pop()); const s = stripe.subs.find((x) => x.id === id); if (s) s.status = "canceled"; return { id, status: "canceled" }; };
  return { stripe, log, exports: { stripeGet: get, stripePost: post, stripeDelete: del, formEncode: () => "", STRIPE_BASE: "https://stripe.test" } };
}

function loadWith(db, sm, user = U) {
  for (const p of [AUTH_PATH, API_PATH, LIVE_PATH, ALERT_PATH, PLUS_PATH, HOOK_PATH, BILLING_PATH, PLAID_PATH]) delete require.cache[p];
  const real = require(AUTH_PATH);
  require.cache[AUTH_PATH].exports = { ...real, getAdminClient: () => db.admin, getUserFromRequest: async () => ({ user_id: user, error: null }) };
  require.cache[API_PATH] = { id: API_PATH, filename: API_PATH, loaded: true, exports: sm.exports };
  require.cache[ALERT_PATH] = { id: ALERT_PATH, filename: ALERT_PATH, loaded: true, exports: { alertSupport: async () => true, supportAlertMessage: () => ({}), DEFAULT_TO: "x" } };
  return { hook: require(HOOK_PATH), billing: require(BILLING_PATH), plaid: require(PLAID_PATH), plus: require(PLUS_PATH) };
}

(async () => {
  const t = create();
  const saved = { ...process.env };
  const quiet = { e: console.error, w: console.warn }; console.error = () => {}; console.warn = () => {};
  const realFetch = global.fetch; global.fetch = async () => ({ ok: true, status: 200, json: async () => ({ removed: true }) });
  for (const k of Object.keys(process.env)) if (/^STRIPE_PRICE_|^PLUS_ENABLED$|^PLUS_TESTER_USER_IDS$|^IAP_ENABLED$|^HOUSEHOLD_ENABLED$/.test(k)) delete process.env[k];
  Object.assign(process.env, {
    STRIPE_WEBHOOK_SECRET: "whsec_test", BILLING_ENABLED: "true", STRIPE_SECRET_KEY: "sk_test_mock_never_sent",
    PLAID_CLIENT_ID: "test-client", PLAID_SECRET: "test-secret",
    STRIPE_PRICE_MONTHLY_CAD: "price_m", STRIPE_PRICE_ANNUAL_CAD: "price_a", STRIPE_PRICE_FOUNDING_ANNUAL_CAD: "price_f",
    STRIPE_PRICE_PLUS_MONTHLY_CAD: "price_pm", STRIPE_PRICE_PLUS_ANNUAL_CAD: "price_pa",
  });
  const now = Math.floor(Date.now() / 1000);
  const future = new Date((now + 20 * DAY) * 1000).toISOString();
  const past = new Date((now - DAY) * 1000).toISOString();
  let clock = now - 5000;
  const send = async (hook, type, object) => {
    clock += 60;
    const evt = { id: "evt_" + clock, type, created: clock, data: { object } }; const raw = JSON.stringify(evt);
    return hook.handler({ httpMethod: "POST", body: raw, headers: { "stripe-signature": signPayload(raw, "whsec_test", now) } });
  };
  const call = async (billing, body, origin = "https://flourishmoney.app") => {
    const r = await billing.handler({ httpMethod: "POST", headers: { origin, authorization: "Bearer x" }, body: JSON.stringify(body) });
    let b = null; try { b = JSON.parse(r.body); } catch { b = null; }
    return { status: r.statusCode, body: b };
  };
  const view = await import("../src/lib/plusAccess.js");
  const words = await import("../src/lib/netWorthWords.js");
  const mainMonthly = () => ({ user_id: U, provider: "stripe", provider_customer_id: "cus_M", provider_subscription_id: "sub_M", status: "active", plan_key: "monthly", price_id: "price_m", current_period_end: future, cancel_at_period_end: false });
  const plusSub = (id, status = "active", price = "price_pm") => ({ id, object: "subscription", customer: "cus_P", status, metadata: { user_id: U, plan_key: "plus_monthly", kind: "plus_addon" },
    items: { data: [{ price: { id: price }, current_period_end: now + 30 * DAY }] }, current_period_end: now + 30 * DAY });

  try {
    // ── 1. The row rule ────────────────────────────────────────────────────────────────────────────
    {
      const A = require(PLUS_PATH);
      const env = process.env;
      const row = (o) => ({ provider: "stripe", plan_key: "plus_monthly", status: "active", product_id: "price_pm", current_period_end: future, ...o });
      t.eq(A.isLivePlusRow(row({}), env), true, "1a a live website row on the Plus monthly price gives Plus");
      t.eq(A.isLivePlusRow(row({ product_id: "price_m" }), env), false, "1b …never on the main plan's monthly price");
      t.eq(A.isLivePlusRow(row({ product_id: "price_pa" }), env), false, "1c …nor on a Plus price for the other plan key");
      t.eq(A.isLivePlusRow(row({ current_period_end: null }), env), false, "1d a row with no period end does not count (a webhook we never received)");
      t.eq(A.isLivePlusRow(row({ current_period_end: past }), env), false, "1e a period that ended does not count");
      t.eq(["past_due", "incomplete", "canceled", "unpaid"].map((s) => A.isLivePlusRow(row({ status: s }), env)), [false, false, false, false], "1f only active or trialing counts");
      t.eq(A.isLivePlusRow(row({ provider: "app_store", product_id: "app.flourishmoney.plusaddon.monthly" }), env), true, "1g a store row on Plus's own product gives Plus");
      t.eq(A.isLivePlusRow(row({ provider: "app_store", product_id: "app.flourishmoney.plus.monthly" }), env), false, "1h …never the main plan's App Store product (app.flourishmoney.plus.monthly)");
      t.eq(A.isLivePlusRow(row({ provider: "play_store", product_id: "flourish_plus:monthly" }), env), false, "1i …nor the main plan's Play base plan (flourish_plus:monthly)");
      t.eq(A.plusPriceIds({ ...env, STRIPE_PRICE_PLUS_MONTHLY_CAD: "price_m" }).size, 0, "1j a Plus price set to a main-plan price: no Plus price counts at all");
      t.eq(A.isLivePlusRow(row({}), { ...env, STRIPE_PRICE_PLUS_MONTHLY_CAD: "" }), false, "1k a Plus price not configured: no website row counts");
      t.eq([A.PLUS_ENTITLEMENT_ID, Object.keys(A.PLUS_PRODUCTS).some((k) => /^app\.flourishmoney\.plus\.|^flourish_plus:/.test(k))], ["plus_addon", false], "1l the add-on's RevenueCat entitlement and products are its own, never the main plan's \"plus\"");
    }

    // ── 2. The stores ──────────────────────────────────────────────────────────────────────────────
    {
      const A = require(PLUS_PATH);
      const purchase = (o = {}) => ({ store: "app_store", expires_date: future, is_sandbox: false, ownership_type: "PURCHASED", ...o });
      const subscriber = (ent, subs) => ({ entitlements: ent, subscriptions: subs });
      const ent = (o = {}) => ({ plus_addon: { expires_date: future, product_identifier: "app.flourishmoney.plusaddon.annual", ...o } });
      const both = A.plusFromSubscriber(subscriber(ent(), { "app.flourishmoney.plusaddon.annual": purchase() }));
      t.eq([both.row && both.row.provider, both.row && both.row.plan_key, both.row && A.isLivePlusRow(both.row)], ["app_store", "plus_annual", true], "2a the entitlement and the store purchase agree: Plus annual from the App Store");
      t.eq(A.plusFromSubscriber(subscriber(ent(), {})).row, null, "2b the entitlement with no store purchase (a promotional grant): no Plus");
      t.eq(A.plusFromSubscriber(subscriber({}, { "app.flourishmoney.plusaddon.annual": purchase() })).row, null, "2c a store purchase the entitlement does not name: no Plus");
      t.eq(A.plusFromSubscriber(subscriber(ent({ expires_date: past }), { "app.flourishmoney.plusaddon.annual": purchase() })).row, null, "2d the entitlement expired: no Plus");
      t.eq(A.plusFromSubscriber(subscriber({ plus: { expires_date: future, product_identifier: "app.flourishmoney.plus.monthly" } }, { "app.flourishmoney.plus.monthly": purchase() })).row, null, "2e the MAIN plan's \"plus\" entitlement and purchase: no Plus add-on");
      t.eq(A.plusFromSubscriber(subscriber(ent(), { "app.flourishmoney.plusaddon.annual": purchase({ is_sandbox: true }) })).reason, "sandbox", "2f a sandbox purchase: no Plus…");
      t.ok(!!A.plusFromSubscriber(subscriber(ent(), { "app.flourishmoney.plusaddon.annual": purchase({ is_sandbox: true }) }), Date.now(), { acceptSandbox: true }).row, "2g …unless it is the App Review account's");
      t.eq(["family_shared", "refunded", "expired"].map((r, i) => A.plusFromSubscriber(subscriber(ent(), { "app.flourishmoney.plusaddon.annual": purchase([{ ownership_type: "FAMILY_SHARED" }, { refunded_at: past }, { expires_date: past }][i]) })).reason),
        ["family_shared", "refunded", "expired"], "2h Family Sharing, a refund, an expiry: no Plus");
      const g = A.plusFromSubscriber(subscriber({ plus_addon: { expires_date: future, product_identifier: "flourish_plus_addon:monthly" } }, { flourish_plus_addon: purchase({ store: "play_store", product_plan_identifier: "monthly" }) }));
      t.eq([g.row && g.row.provider, g.row && g.row.product_id], ["play_store", "flourish_plus_addon:monthly"], "2i Google: the subscription and its base plan, read the way RevenueCat names them");
    }

    // ── 3. The read fails closed ───────────────────────────────────────────────────────────────────
    {
      const A = require(PLUS_PATH);
      let touched = 0;
      const tripwire = { from: () => { touched++; throw new Error("read while off"); } };
      const off = await A.getPlusEntitlement(tripwire, U, { env: { ...process.env, PLUS_ENABLED: "" } });
      t.eq([off.enabled, off.plus, touched], [false, false, 0], "3a PLUS_ENABLED off: no Plus, and nothing is read");
      const on = { ...process.env, PLUS_ENABLED: "true" };
      const failing = makeDb({ failPlusRead: true });
      const f = await A.getPlusEntitlement(failing.admin, U, { env: on });
      t.eq([f.plus, f.status_unavailable], [false, true], "3b a read that fails: unavailable, and no Plus");
      const missing = makeDb({ missingPlus: true });
      const m = await A.getPlusEntitlement(missing.admin, U, { env: on });
      t.eq([m.plus, m.status_unavailable], [false, true], "3c 0044 not applied with the flag on: unavailable, never Plus");
      const thrown = await A.getPlusEntitlement({ from: () => { throw new Error("down"); } }, U, { env: on });
      t.eq([thrown.plus, thrown.status_unavailable], [false, true], "3d a client that throws: unavailable, never Plus");
      const hh = makeDb();
      hh.state.rows.household_members.push({ user_id: U, household_id: "h1", role: "owner" }, { user_id: P, household_id: "h1", role: "partner" });
      hh.state.rows.plus_addon_subscriptions.push({ user_id: P, provider: "stripe", plan_key: "plus_annual", status: "active", product_id: "price_pa", current_period_end: future });
      const cov = await A.getPlusEntitlement(hh.admin, U, { env: { ...on, HOUSEHOLD_ENABLED: "true" } });
      t.eq([cov.plus, cov.covered_by], [true, "partner"], "3e the other member's Plus covers the household");
      const src = fs.readFileSync(PLUS_PATH, "utf8").replace(/\/\/[^\n]*/g, "");
      t.ok(!/from\("subscriptions"\)/.test(src) && !/"profiles"/.test(src), "3f the Plus code never reads or writes the main plan's subscriptions row or the profile");
      const authSrc = fs.readFileSync(AUTH_PATH, "utf8");
      t.ok(!/plusAddon/.test(authSrc), "3g getUserPlan (the main plan's answer) never reads Plus, so Plus can never take a feature away");
    }

    // ── 4. A founding household keeps everything and is offered Plus as an extra ──────────────────────
    {
      process.env.PLUS_ENABLED = "true";
      const db = makeDb(); const sm = makeStripe();
      const founding = { user_id: U, provider: "stripe", provider_customer_id: "cus_M", provider_subscription_id: "sub_F", status: "active", plan_key: "founding_annual", price_id: "price_f", current_period_end: future };
      db.state.rows.subscriptions.push({ ...founding });
      const { billing } = loadWith(db, sm);
      const { deriveEntitlement } = require("../netlify/functions/_lib/planRules.js");
      const st = await call(billing, { action: "status" });
      const ps = await call(billing, { action: "plus_status" });
      const v = view.plusView(ps);
      t.eq([st.status, st.body && st.body.paid, deriveEntitlement({ plan: "free" }, founding).plan], [200, true, "premium"], "4a the founding household still pays and keeps the full plan (status and the server's rule unchanged)");
      t.eq([ps.status, ps.body && ps.body.plus, v.offer, view.plusFeatureVisible(v)], [200, false, true, false], "4b …is offered Plus as an extra, and shows no Plus feature before buying it");
      await call(billing, { action: "plus_checkout", plan_key: "plus_annual" });
      const sess = sm.stripe.sessions[0] || {};
      t.eq([sess.line_items && sess.line_items[0].price, sess.allow_promotion_codes, sess.customer], ["price_pa", false, "cus_P"], "4c its Plus checkout is the full Plus price, no promotion codes (no founding discount), on its own Plus customer");
      t.eq(db.state.rows.subscriptions, [founding], "4d …and the founding row is exactly as it was: $79.99 a year stays");
    }

    // ── 5. A monthly household buys Plus and keeps its monthly plan ─────────────────────────────────
    {
      const db = makeDb(); const sm = makeStripe();
      db.state.rows.subscriptions.push(mainMonthly());
      const before = JSON.stringify(db.state.rows.subscriptions);
      const { billing, hook } = loadWith(db, sm);
      const co = await call(billing, { action: "plus_checkout", plan_key: "plus_monthly" });
      t.eq([co.status, co.body && co.body.url], [200, "https://stripe.test/pay"], "5a a monthly household can open a Plus checkout (its monthly plan is not 'already subscribed' for Plus)");
      t.ok(sm.log.includes("POST /customers") && sm.stripe.sessions[0].metadata.kind === "plus_addon", "5b …on a Plus customer of its own, tagged as the add-on");
      sm.stripe.subs.push(plusSub("sub_P"));
      const done = await send(hook, "checkout.session.completed", { customer: "cus_P", subscription: "sub_P", client_reference_id: U, metadata: { user_id: U, plan_key: "plus_monthly", kind: "plus_addon" } });
      const pr = db.state.rows.plus_addon_subscriptions.find((r) => r.user_id === U) || {};
      t.eq([done.statusCode, pr.provider_subscription_id, pr.plan_key, pr.product_id, pr.status], [200, "sub_P", "plus_monthly", "price_pm", "active"], "5c the checkout lands on the Plus row, read back from Stripe's subscription");
      t.eq(JSON.stringify(db.state.rows.subscriptions), before, "5d the monthly plan's row is untouched: no overwrite, no 'second subscription' flag");
      const ps = await call(billing, { action: "plus_status" });
      const st = await call(billing, { action: "status" });
      t.eq([ps.body && ps.body.plus, st.body && st.body.paid], [true, true], "5e the household has Plus AND its monthly plan");
      t.eq([ps.body && ps.body.manage, Object.keys(ps.body || {}).sort().join(",")], ["stripe", "covered_by,enabled,manage,min_client,plus"], "5e2 …and the answer says where the buyer's own Plus is managed (Stripe) and the oldest app that is sent Plus data, and nothing else: no price, date or customer id");
      t.eq(ps.body && ps.body.min_client, "1.1.8", "5e3 …that oldest app is 1.1.8");
      await send(hook, "customer.subscription.updated", plusSub("sub_P"));
      await send(hook, "customer.subscription.updated", { ...mainMonthly(), id: "sub_M", object: "subscription", customer: "cus_M", metadata: { user_id: U, plan_key: "monthly" }, items: { data: [{ price: { id: "price_m" }, current_period_end: now + 30 * DAY }] }, current_period_end: now + 30 * DAY });
      t.eq([(db.state.rows.subscriptions[0] || {}).provider_subscription_id, (db.state.rows.subscriptions[0] || {}).support_flag || null], ["sub_M", null], "5f later events for each go to their own row, and nothing is flagged");
      const again = await call(billing, { action: "plus_checkout", plan_key: "plus_annual" });
      t.eq([again.status, again.body && again.body.error], [409, "already_plus"], "5g a household with Plus is not sold it twice");
      await send(hook, "customer.subscription.deleted", plusSub("sub_P", "canceled"));
      const after = await call(billing, { action: "plus_status" });
      t.eq([after.body && after.body.plus, (db.state.rows.subscriptions[0] || {}).status], [false, "active"], "5h Plus ending ends Plus only: the monthly plan stays active");
      t.eq(after.body && after.body.manage, null, "5h2 …and with no Plus there is nothing to manage");
      const fake = await send(hook, "checkout.session.completed", { customer: "cus_P", subscription: "sub_X", client_reference_id: U, metadata: { user_id: U, kind: "plus_addon" } });
      sm.stripe.subs.push({ ...plusSub("sub_Y"), items: { data: [{ price: { id: "price_m" } }] } });
      const wrongPrice = await send(hook, "checkout.session.completed", { customer: "cus_P", subscription: "sub_Y", client_reference_id: U, metadata: { user_id: U, kind: "plus_addon" } });
      t.eq([fake.statusCode, wrongPrice.statusCode, JSON.parse(wrongPrice.body).ignored], [500, 200, true],
        "5i a Plus-tagged checkout Stripe cannot find is retried (500); one on a non-Plus price is acknowledged and grants nothing");
      t.ok(!db.state.rows.plus_addon_subscriptions.some((r) => r.provider_subscription_id === "sub_Y") && (db.state.rows.subscriptions[0] || {}).provider_subscription_id === "sub_M",
        "5j …and neither reaches the main plan's row");
    }

    // ── 6. No Plus: no Plus feature, no half-open screen ─────────────────────────────────────────────
    {
      const db = makeDb(); const sm = makeStripe();
      delete process.env.PLUS_ENABLED;
      const { billing } = loadWith(db, sm);
      const offRes = await call(billing, { action: "plus_status" });
      const offCo = await call(billing, { action: "plus_checkout", plan_key: "plus_monthly" });
      t.eq([offRes.status, offCo.status, db.state.reads.length], [404, 404, 0], "6a flag off: every Plus action is absent (404, even with billing on) and nothing is read");
      t.eq(view.plusView(offRes), view.PLUS_HIDDEN, "6b …so the app shows nothing about Plus");
      process.env.PLUS_ENABLED = "true";
      const b2 = loadWith(makeDb(), makeStripe()).billing;
      const none = view.plusView(await call(b2, { action: "plus_status" }));
      t.eq([none.show, none.plus, view.plusFeatureVisible(none)], [true, false, false], "6c flag on, no Plus: no Plus feature");
      t.eq([null, undefined, { status: 200 }, { status: 200, body: { enabled: true } }, { status: 200, body: { enabled: true, plus: "yes" } }, { status: 500, body: {} }].map((r) => view.plusFeatureVisible(view.plusView(r))),
        [false, false, false, false, false, false], "6d no answer, a partial answer or an odd one: no Plus feature");
      const appSrc = fs.readFileSync(path.join(REPO, "src", "App.jsx"), "utf8");
      // 1.1.8 (2026-11-20): the Plus screen is built (src/PlusAddonScreen.jsx). It still cannot be half open: App.jsx sends
      // no Plus action itself (lib/netWorthAccess.js askPlus does), and mounts the screen in one place, only for a signed-in
      // account the server has answered, never in the demo and never while PLUS_ENABLED is off.
      t.ok(!/plusAccess/.test(appSrc) && !/action:\s*"plus_/.test(appSrc)
        && /if\(plusRoot\.buy && user\?\.id && !appData\?\.demo && plusRoot\.mode!=="today" && plusRoot\.mode!=="pending"\)return /.test(appSrc)
        && (appSrc.match(/<PlusAddonScreen\b/g) || []).length === 1,
        "6e the Plus screen is mounted in one place, only once the server has answered and never while PLUS_ENABLED is off, so none can be half open");
      const planSrc = fs.readFileSync(path.join(REPO, "src", "lib", "planFromProfile.js"), "utf8");
      t.ok(!/plusAccess|plus_addon/.test(planSrc), "6f the main plan's client rule never reads Plus");
    }

    // ── 7. A billing read that fails: a plain line, never a number ──────────────────────────────────
    {
      const db = makeDb({ failPlusRead: true });
      const { billing } = loadWith(db, makeStripe());
      const r = await call(billing, { action: "plus_status" });
      const v = view.plusView(r);
      t.eq([r.status, r.body && r.body.error, v.show, v.plus, v.notice], [503, "status_unavailable", false, false, "plus-status-unavailable"], "7a the read fails: 503, no Plus, and the plain line's id");
      const co = await call(billing, { action: "plus_checkout", plan_key: "plus_monthly" });
      t.eq(co.status, 503, "7b …and nothing is sold on a read that failed");
      t.ok(!/\d/.test(words.netWorthWords("plus-status-unavailable")), "7c the line carries no number");
    }

    // ── 8. The website and the iPhone: one answer from one row ──────────────────────────────────────
    {
      const db = makeDb();
      db.state.rows.plus_addon_subscriptions.push({ user_id: U, provider: "stripe", plan_key: "plus_monthly", status: "active", product_id: "price_pm", provider_customer_id: "cus_P", current_period_end: future });
      const { billing } = loadWith(db, makeStripe());
      const web = await call(billing, { action: "plus_status" });
      const ios = await call(billing, { action: "plus_status" }, "capacitor://localhost");
      t.eq([web.body.plus, ios.body.plus], [true, true], "8a bought on the website: the iPhone app reads the same row and has Plus");
      const iosCo = await call(billing, { action: "plus_checkout", plan_key: "plus_monthly" }, "capacitor://localhost");
      t.eq(iosCo.status, 403, "8b a store app is never handed a website checkout");
      const A = require(PLUS_PATH);
      const sub = { entitlements: { plus_addon: { expires_date: future, product_identifier: "app.flourishmoney.plusaddon.monthly" } }, subscriptions: { "app.flourishmoney.plusaddon.monthly": { store: "app_store", expires_date: future } } };
      const clash = await A.syncPlusFromStore(db.admin, U, { fetchSubscriber: async () => sub, env: process.env });
      t.eq([clash.plus, clash.conflict, db.state.rows.plus_addon_subscriptions[0].provider], [true, true, "stripe"], "8c bought in the store as well: logged as a conflict, the website row kept, Plus stays");
      const db2 = makeDb();
      const B = loadWith(db2, makeStripe());
      await B.plus.syncPlusFromStore(db2.admin, U, { fetchSubscriber: async () => sub, env: process.env });
      const web2 = await call(B.billing, { action: "plus_status" });
      const co2 = await call(B.billing, { action: "plus_checkout", plan_key: "plus_monthly" });
      t.eq([db2.state.rows.plus_addon_subscriptions[0].provider, web2.body.plus, co2.status], ["app_store", true, 409], "8d bought on the iPhone: the website reads the same row, has Plus, and sells none");
      t.eq(db2.state.rows.subscriptions, [], "8e …and the store's Plus never wrote the main plan's row");
      await B.plus.syncPlusFromStore(db2.admin, U, { fetchSubscriber: async () => ({ entitlements: {}, subscriptions: {} }), env: process.env });
      t.eq(db2.state.rows.plus_addon_subscriptions[0].status, "canceled", "8f the store no longer reports it: the store's Plus ends");
      // Review 2026-11-10: a store purchase over a website Plus row that is not live (a checkout left open, past_due)
      // keeps the Stripe customer, so a website Plus that recovers can still be cancelled, and is never written over.
      const db3 = makeDb();
      db3.state.rows.plus_addon_subscriptions.push({ user_id: U, provider: "stripe", plan_key: "plus_monthly", status: "past_due", product_id: "price_pm", provider_customer_id: "cus_P", provider_subscription_id: "sub_P", current_period_end: future });
      const C = loadWith(db3, makeStripe());
      await C.plus.syncPlusFromStore(db3.admin, U, { fetchSubscriber: async () => sub, env: process.env });
      const r3 = db3.state.rows.plus_addon_subscriptions[0];
      t.eq([r3.provider, r3.provider_customer_id, r3.provider_subscription_id], ["app_store", "cus_P", null], "8g the store's row keeps the buyer's Stripe customer, and drops the old subscription id");
      const sm3 = makeStripe(); sm3.stripe.subs.push(plusSub("sub_P"));
      const D = loadWith(db3, sm3);
      clock = now + 60;   // a Stripe event after the store sync, so it is not merely stale
      const back = await send(D.hook, "customer.subscription.updated", plusSub("sub_P"));
      t.eq([JSON.parse(back.body).conflict, db3.state.rows.plus_addon_subscriptions[0].provider], [true, "app_store"], "8h the website subscription recovering is a conflict for support, never a write over the store's Plus");
      await D.plaid.handler({ httpMethod: "POST", headers: { origin: "https://flourishmoney.app", authorization: "Bearer x" }, body: JSON.stringify({ action: "delete_account" }) });
      t.ok(sm3.log.includes("DELETE /subscriptions/sub_P"), "8i …and deleting the account still cancels it, through the customer kept on the store's row");
      t.eq(require(PLUS_PATH).isPlusStripeObject({ metadata: { plan_key: "monthly", user_id: U }, items: { data: [{ price: { id: "price_pm" } }] } }), false, "8j a main-plan subscription is never routed to Plus, even on a price set as a Plus price");
    }

    // ── 9. Deleting the account cancels a live Plus subscription ────────────────────────────────────
    {
      const db = makeDb(); const sm = makeStripe();
      db.state.rows.plus_addon_subscriptions.push({ user_id: U, provider: "stripe", plan_key: "plus_monthly", status: "active", product_id: "price_pm", provider_customer_id: "cus_P", provider_subscription_id: "sub_P", current_period_end: future });
      sm.stripe.subs.push(plusSub("sub_P"));
      const { plaid } = loadWith(db, sm);
      await plaid.handler({ httpMethod: "POST", headers: { origin: "https://flourishmoney.app", authorization: "Bearer x" }, body: JSON.stringify({ action: "delete_account" }) });
      t.ok(sm.log.includes("DELETE /subscriptions/sub_P"), "9a delete_account cancels the Plus subscription at Stripe, on its own customer, before erasing anything");
    }

    // ── 10. ONE PLUS PURCHASE AT A TIME (migration 0052): two partners are held apart, as for the main plan ───────────
    {
      const NATIVE = "capacitor://localhost";
      const couple = (db) => db.state.rows.household_members.push({ user_id: U, household_id: "h1", role: "owner" }, { user_id: P, household_id: "h1", role: "partner" });
      const A1 = "plus-aaaaaaaa-1111", A2 = "plus-aaaaaaaa-2222", B1 = "plus-bbbbbbbb-1111";
      const hold = (billing, attempt_id, extra = {}) => call(billing, { action: "plus_store_hold", platform: "ios", attempt_id, ...extra }, NATIVE);
      process.env.PLUS_ENABLED = "true"; process.env.IAP_ENABLED = "true";

      // Switched off, or asked badly: nothing is read and nothing is held.
      {
        const db = makeDb(); const { billing } = loadWith(db, makeStripe());
        delete process.env.IAP_ENABLED;
        const noIap = await hold(billing, A1);
        process.env.IAP_ENABLED = "true"; delete process.env.PLUS_ENABLED;
        const noPlus = await hold(billing, A1);
        process.env.PLUS_ENABLED = "true";
        const bad = [await hold(billing, "short"), await hold(billing, undefined), await hold(billing, A1, { state: "cancelled" }), await hold(billing, A1, { state: "done" })];
        t.eq([noIap.status, noPlus.status, bad.map((r) => [r.status, r.body && r.body.error]), db.state.rpcs.length, db.state.reads.length],
          [404, 404, [[400, "attempt_required"], [400, "attempt_required"], [400, "invalid_state"], [400, "invalid_state"]], 0, 0],
          "10a in-app purchase or Plus switched off: 404. A bad attempt id, or any state but 'pending' (the app can never end a hold): 400. Nothing is read or held");
      }
      // A person alone.
      {
        const db = makeDb(); const { billing } = loadWith(db, makeStripe());
        const ios = await hold(billing, A1);
        const begin = db.state.rpcs.find(([fn]) => fn === "plus_purchase_attempt_begin");
        t.eq([ios.status, ios.body, begin && begin[1]], [200, { held: true }, { p_user: U, p_provider: "app_store", p_attempt: A1, p_ttl: "32 minutes" }],
          "10b one tap in the iPhone app: the attempt is recorded for 32 minutes, as the main plan's is, and the sheet may open");
        const again = await hold(billing, A1);
        const other = await hold(billing, A2);
        t.eq([again.body, other.status, other.body], [{ held: true }, 200, { held: false, plus: false, reason: "purchase_in_progress", mine: true }],
          "10c the same attempt again is still held (a tap after a closed sheet); a second attempt of this person's own is refused while the first lives");
        const android = makeDb(); const b2 = loadWith(android, makeStripe()).billing;
        await call(b2, { action: "plus_store_hold", platform: "android", attempt_id: A1 }, NATIVE);
        t.eq((android.state.rpcs.find(([fn]) => fn === "plus_purchase_attempt_begin") || [])[1].p_provider, "play_store", "10d Android's attempt is labelled Google Play's");
        t.ok(!db.state.rpcs.some(([fn]) => fn === "purchase_attempt_begin") && !db.state.writes.includes("subscriptions"), "10e the main plan's own attempt and its row are never touched: a household that just bought the main plan can add Plus straight away");
      }
      // Two partners, in the store, at the same moment.
      {
        const db = makeDb(); couple(db); const sm = makeStripe();
        const first = await hold(loadWith(db, sm, U).billing, A1);
        const second = await hold(loadWith(db, sm, P).billing, B1);
        t.eq([first.body, second.status, second.body], [{ held: true }, 200, { held: false, plus: false, reason: "purchase_in_progress", mine: false }],
          "10f two partners tap Buy at the same moment: the first is held, the second is refused and no sheet opens for them");
        const web = await call(loadWith(db, sm, P).billing, { action: "plus_checkout", plan_key: "plus_monthly" });
        t.eq([web.status, web.body, sm.stripe.sessions.length], [409, { error: "purchase_in_progress", mine: false }, 0], "10g …and the second partner cannot buy it on the website either: no Stripe checkout is created");
        const firstAgain = await hold(loadWith(db, sm, U).billing, A1);
        t.eq(firstAgain.body, { held: true }, "10h the first partner's own attempt is still theirs");
      }
      // One on the website, the other in the store.
      {
        const db = makeDb(); couple(db); const sm = makeStripe();
        const web = await call(loadWith(db, sm, U).billing, { action: "plus_checkout", plan_key: "plus_annual" });
        const begin = db.state.rpcs.find(([fn]) => fn === "plus_purchase_attempt_begin");
        t.ok(web.status === 200 && sm.stripe.sessions.length === 1 && begin && begin[1].p_provider === "stripe" && /^plusweb-[0-9a-f-]{36}$/.test(begin[1].p_attempt)
          && db.state.rpcs.findIndex(([fn]) => fn === "plus_purchase_attempt_begin") >= 0 && sm.log.indexOf("POST /checkout/sessions") === sm.log.lastIndexOf("POST /checkout/sessions"),
          "10i a website checkout records its attempt before the checkout is created");
        const store = await hold(loadWith(db, sm, P).billing, B1);
        t.eq(store.body, { held: false, plus: false, reason: "purchase_in_progress", mine: false }, "10j …so the other partner's store purchase is refused while that checkout is open");
        const reopen = await call(loadWith(db, sm, U).billing, { action: "plus_checkout", plan_key: "plus_monthly" });
        t.eq([reopen.status, sm.stripe.sessions.length], [200, 2], "10k the buyer can open the website checkout again (their earlier one is expired first, and its attempt replaced)");
        const ownStore = await hold(loadWith(db, sm, U).billing, A1);
        t.eq(ownStore.body, { held: false, plus: false, reason: "purchase_in_progress", mine: true }, "10l …but not buy it in the store while their own checkout is open");
      }
      // The household already has Plus.
      {
        const db = makeDb(); couple(db);
        db.state.rows.plus_addon_subscriptions.push({ user_id: P, provider: "app_store", plan_key: "plus_monthly", status: "active", product_id: "app.flourishmoney.plusaddon.monthly", current_period_end: future });
        const r = await hold(loadWith(db, makeStripe(), U).billing, A1);
        t.eq([r.status, r.body, db.state.rpcs.length], [200, { held: false, plus: true, covered_by: "partner" }, 0], "10m a household that has Plus (the partner's) is sold none: no attempt is even recorded");
      }
      // The partner's purchase lands between the read and the hold.
      {
        const db = makeDb(); couple(db);
        db.state.rpcHook = async (fn) => { if (fn === "plus_purchase_attempt_begin") db.state.rows.plus_addon_subscriptions.push({ user_id: P, provider: "play_store", plan_key: "plus_annual", status: "active", product_id: "flourish_plus_addon:annual", current_period_end: future }); return null; };
        const r = await hold(loadWith(db, makeStripe(), U).billing, A1);
        t.eq(r.body, { held: false, plus: true, covered_by: "partner" }, "10n Plus that landed between the first read and the hold is seen after it: still no sheet");
      }
      // The hold cannot be recorded (0052 not applied, or the database is down): nothing is sold.
      {
        const db = makeDb(); const sm = makeStripe();
        db.state.rpcHook = async (fn) => (/^plus_purchase_attempt_/.test(fn) ? { data: null, error: { code: "PGRST202", message: "function not found" } } : null);
        const { billing } = loadWith(db, sm);
        const store = await hold(billing, A1);
        const web = await call(billing, { action: "plus_checkout", plan_key: "plus_monthly" });
        const pend = await hold(billing, A1, { state: "pending" });
        t.eq([store.status, store.body, web.status, web.body, sm.stripe.sessions.length, pend.status], [503, { error: "unavailable" }, 503, { error: "unavailable" }, 0, 503],
          "10o an attempt that cannot be recorded sells nothing, in the store or on the website (no 'yes' without it)");
        db.state.rpcHook = async (fn) => (fn === "plus_purchase_attempt_begin" ? { data: { result: "something_else" }, error: null } : null);
        t.eq((await hold(billing, A2)).status, 503, "10p …and neither does an answer that is not one of the two it knows");
      }
      // Pending.
      {
        const db = makeDb(); const { billing } = loadWith(db, makeStripe());
        await hold(billing, A1);
        const pend = await hold(billing, A1, { state: "pending" });
        const args = (db.state.rpcs.find(([fn]) => fn === "plus_purchase_attempt_pending") || [])[1];
        const notMine = await hold(billing, A2, { state: "pending" });
        t.eq([pend.body, args, notMine.body], [{ pending: true }, { p_user: U, p_attempt: A1, p_backstop: "7 days" }, { pending: false }],
          "10q the store says pending: this attempt keeps 7 days, as the main plan's does; an attempt that is not this person's live one is not");
      }
      // The answer tells the app nothing it should not know.
      {
        const src = fs.readFileSync(path.join(REPO, "netlify", "functions", "billing.js"), "utf8");
        const blk = src.slice(src.indexOf('if (action === "plus_store_hold") {'), src.indexOf("const ent = await plusAddon.getPlusEntitlement(admin, user_id);"));
        t.ok(blk.length > 500 && !/attempt_id:|expires_at|provider:/.test(blk.replace(/body\.attempt_id|body\.platform/g, "")), "10r a refusal never names the other attempt's id, its store or when it ends");
      }
      delete process.env.IAP_ENABLED;
    }

    // ── 11. THE PLUS PORTAL HAS A CONFIGURATION OF ITS OWN: a Plus buyer can never switch Plus into the main plan ─────────
    {
      process.env.PLUS_ENABLED = "true";
      const plusRow = () => ({ user_id: U, provider: "stripe", plan_key: "plus_monthly", status: "active", product_id: "price_pm", provider_customer_id: "cus_P", provider_subscription_id: "sub_P", current_period_end: future });
      const setup = () => { const db = makeDb(); const sm = makeStripe(); db.state.rows.plus_addon_subscriptions.push(plusRow()); db.state.rows.subscriptions.push(mainMonthly()); return { db, sm }; };
      const portal = (billing) => call(billing, { action: "plus_portal" });
      const PLUS = require(PLUS_PATH);
      {
        const { db, sm } = setup(); const { billing } = loadWith(db, sm);
        const r = await portal(billing);
        const made = sm.stripe.portalConfigs.find((c) => c.id !== "bpc_default");
        t.eq([r.status, sm.stripe.portalSessions.length, sm.stripe.portalSessions[0] && sm.stripe.portalSessions[0].configuration, sm.stripe.portalSessions[0] && sm.stripe.portalSessions[0].customer], [200, 1, made && made.id, "cus_P"],
          "11a Manage for Plus: the session names a portal configuration, on the buyer's own Plus customer");
        t.eq([made && made.features, made && made.metadata, made && made.is_default], [{ subscription_update: { enabled: false }, subscription_cancel: { enabled: true, mode: "at_period_end" }, payment_method_update: { enabled: true }, invoice_history: { enabled: true }, customer_update: { enabled: false } }, { kind: "plus_addon_portal" }, false],
          "11b …made for Plus the first time: switching plans OFF, cancelling on (at the end of the paid period), the card on; marked as Plus's, and not the default");
        t.ok(sm.stripe.portalSessions[0].configuration !== "bpc_default" && sm.stripe.portalConfigs[0].features.subscription_update.enabled === true && sm.stripe.portalConfigs.length === 2,
          "11c the shared default (switching on, the main plan's prices) is never the one used, and it is left exactly as it was");
        const before = sm.log.length;
        await portal(billing);
        const again = sm.log.slice(before);
        t.eq([again, sm.stripe.portalSessions[1].configuration, sm.stripe.portalConfigs.length], [["POST /billing_portal/sessions"], made.id, 2], "11d the next time, the same configuration is used without asking Stripe for it again, and no second one is made");
        const cold = await portal(loadWith(db, sm).billing);
        t.eq([cold.status, sm.stripe.portalConfigs.length, sm.stripe.portalSessions[2].configuration, sm.log.filter((l) => l === "POST /billing_portal/configurations").length], [200, 2, made.id, 1],
          "11e a fresh server instance finds the one already made (by its mark) instead of making another");
        const main = await call(billing, { action: "create_portal_session" });
        const mainSession = sm.stripe.portalSessions[sm.stripe.portalSessions.length - 1];
        t.eq([main.status, mainSession.customer, "configuration" in mainSession], [200, "cus_M", false], "11f the main plan's own portal is unchanged: its customer, and the shared default configuration");
      }
      // A configuration that carries Plus's mark but would let a customer switch, is inactive, or is the default, is never used.
      {
        const bad = [
          { id: "bpc_switch", active: true, is_default: false, metadata: { kind: "plus_addon_portal" }, features: { subscription_update: { enabled: true }, subscription_cancel: { enabled: true }, payment_method_update: { enabled: true } } },
          { id: "bpc_off", active: false, is_default: false, metadata: { kind: "plus_addon_portal" }, features: { subscription_update: { enabled: false }, subscription_cancel: { enabled: true }, payment_method_update: { enabled: true } } },
          { id: "bpc_nocancel", active: true, is_default: false, metadata: { kind: "plus_addon_portal" }, features: { subscription_update: { enabled: false }, subscription_cancel: { enabled: false }, payment_method_update: { enabled: true } } },
          { id: "bpc_other", active: true, is_default: false, metadata: { kind: "something_else" }, features: { subscription_update: { enabled: false }, subscription_cancel: { enabled: true }, payment_method_update: { enabled: true } } },
          { id: "bpc_unmarked", active: true, is_default: false, metadata: null, features: { subscription_update: { enabled: false }, subscription_cancel: { enabled: true }, payment_method_update: { enabled: true } } },
        ];
        const { db, sm } = setup(); sm.stripe.portalConfigs.push(...bad);
        sm.stripe.portalConfigs[0].metadata = { kind: "plus_addon_portal" };   // even the default, marked by mistake
        const r = await portal(loadWith(db, sm).billing);
        const used = sm.stripe.portalSessions[0] && sm.stripe.portalSessions[0].configuration;
        t.ok(r.status === 200 && /^bpc_made_/.test(used) && ![...bad.map((c) => c.id), "bpc_default"].includes(used), "11g one that lets a customer switch, is switched off, cannot cancel, is someone else's or is the default is never used: a right one is made");
        t.eq([...bad, sm.stripe.portalConfigs[0], null, undefined, {}, { id: "", active: true }].map((c) => PLUS.isPlusPortalConfiguration(c)), Array(10).fill(false), "11h …and the check itself says no to each of them, and to nothing at all");
      }
      // FAILS CLOSED: no configuration, no portal. Never the default.
      {
        for (const [what, said] of [["list", "Stripe cannot list the configurations"], ["create", "Stripe will not make one"]]) {
          const { db, sm } = setup(); sm.stripe.fail[what] = 500;
          const r = await portal(loadWith(db, sm).billing);
          t.eq([r.status, r.body, sm.stripe.portalSessions.length], [502, { error: "billing_provider_error" }, 0], `11i ${said}: no portal session is made at all (an error, and never the shared portal)`);
        }
        const { db, sm } = setup(); sm.stripe.madeAs = { features: { subscription_update: { enabled: true }, subscription_cancel: { enabled: true }, payment_method_update: { enabled: true } } };
        const r = await portal(loadWith(db, sm).billing);
        t.eq([r.status, sm.stripe.portalSessions.length], [502, 0], "11j Stripe answers with a configuration that would allow switching: it is not used, and no portal opens");
      }
      // The remembered configuration was switched off at Stripe: looked up once more, and a right one used.
      {
        const { db, sm } = setup(); const { billing } = loadWith(db, sm);
        await portal(billing);
        const first = sm.stripe.portalSessions[0].configuration;
        sm.stripe.portalConfigs.find((c) => c.id === first).active = false;
        const r = await portal(billing);
        const second = sm.stripe.portalSessions[1] && sm.stripe.portalSessions[1].configuration;
        t.ok(r.status === 200 && second && second !== first && second !== "bpc_default" && PLUS.isPlusPortalConfiguration(sm.stripe.portalConfigs.find((c) => c.id === second)), "11k a remembered configuration that Stripe no longer accepts is replaced by a right one, not by the default");
      }
      // Test mode and live mode never share one.
      {
        const calls = []; let n = 0;
        const deps = { stripeGet: async () => ({ data: [] }), stripePost: async (p, b) => { calls.push(p); return { id: `bpc_${++n}`, active: true, is_default: false, metadata: b.metadata, features: b.features }; } };
        const a = await PLUS.plusPortalConfigurationId(deps, { env: { STRIPE_SECRET_KEY: "sk_test_aaaaaaaa" } });
        const b = await PLUS.plusPortalConfigurationId(deps, { env: { STRIPE_SECRET_KEY: "sk_live_bbbbbbbb" } });
        const a2 = await PLUS.plusPortalConfigurationId(deps, { env: { STRIPE_SECRET_KEY: "sk_test_aaaaaaaa" } });
        t.eq([a !== b, a2 === a, calls.length], [true, true, 2], "11l a test key and a live key each get a configuration of their own");
      }
      {
        const src = fs.readFileSync(path.join(REPO, "netlify", "functions", "billing.js"), "utf8");
        const blk = src.slice(src.indexOf('if (action === "plus_portal") {'), src.indexOf("// plus_checkout: the website only"));
        t.ok(/plusAddon\.createPlusPortalSession\(\{ stripeGet, stripePost \}, plusCustomer,/.test(blk) && !/stripePost\("\/billing_portal\/sessions"/.test(blk),
          "11m the Plus portal action has one way to open a portal, and it is the one that names Plus's configuration");
      }
    }
    // ── 12. THE TESTER-ONLY SWITCH (PLUS_TESTER_USER_IDS): with PLUS_ENABLED off, Plus is on for the named accounts only ──
    {
      const O = "33333333-3333-4333-8333-333333333333";   // somebody else: no household with the tester
      const couple = (db) => db.state.rows.household_members.push({ user_id: U, household_id: "h1", role: "owner" }, { user_id: P, household_id: "h1", role: "partner" });
      const NOT_FOUND = [404, { error: "not_found" }];
      const st = async (db, sm, who, body = { action: "plus_status" }, origin) => { const r = await call(loadWith(db, sm, who).billing, body, origin); return [r.status, r.body]; };
      const reset = () => { delete process.env.PLUS_ENABLED; delete process.env.PLUS_TESTER_USER_IDS; delete process.env.IAP_ENABLED; };
      reset();
      // Off for everyone.
      {
        const db = makeDb(); couple(db);
        t.eq([await st(db, makeStripe(), U), await st(db, makeStripe(), P), db.state.reads.length, db.state.rpcs.length], [NOT_FOUND, NOT_FOUND, 0, 0], "12a no flag and no tester named: 404 for everyone, and nothing is read");
      }
      // One tester.
      process.env.PLUS_TESTER_USER_IDS = U;
      {
        const db = makeDb(); couple(db); const sm = makeStripe();
        t.eq(await st(db, sm, U), [200, { enabled: true, plus: false, covered_by: null, manage: null, min_client: "1.1.8" }], "12b the tester: Plus is on for their account, with PLUS_ENABLED off (no Plus yet, so the offer)");
        const before = db.state.reads.length;
        t.eq([await st(db, sm, P), await st(db, sm, O), db.state.reads.length - before], [NOT_FOUND, NOT_FOUND, 0], "12c the tester's partner, and anybody else: the same 404 as when Plus is off, and nothing is read for them");
        const co = await call(loadWith(db, sm, U).billing, { action: "plus_checkout", plan_key: "plus_monthly" });
        sm.stripe.subs.push(plusSub("sub_T"));
        await send(loadWith(db, sm, U).hook, "checkout.session.completed", { customer: "cus_P", subscription: "sub_T", client_reference_id: U, metadata: { user_id: U, plan_key: "plus_monthly", kind: "plus_addon" } });
        t.eq([co.status, await st(db, sm, U)], [200, [200, { enabled: true, plus: true, covered_by: null, manage: "stripe", min_client: "1.1.8" }]], "12d the tester can buy Plus and then has it: the whole path works for them");
        t.eq([await st(db, sm, P), await st(db, sm, P, { action: "plus_checkout", plan_key: "plus_monthly" }), await st(db, sm, P, { action: "plus_portal" })], [NOT_FOUND, NOT_FOUND, NOT_FOUND],
          "12e …and their partner still sees nothing of Plus, though the household now has it: the switch is per account");
        const main = await call(loadWith(db, sm, P).billing, { action: "status" });
        t.eq(main.status, 200, "12f the partner's main plan answers as before");
        process.env.IAP_ENABLED = "true";
        const NATIVE = "capacitor://localhost";
        const db2 = makeDb(); couple(db2);
        const hold = await st(db2, makeStripe(), U, { action: "plus_store_hold", platform: "ios", attempt_id: "plus-tester-attempt-1" }, NATIVE);
        const holdP = await st(db2, makeStripe(), P, { action: "plus_store_hold", platform: "ios", attempt_id: "plus-partner-attempt-1" }, NATIVE);
        t.eq([hold, holdP, db2.state.rpcs.filter(([fn]) => fn === "plus_purchase_attempt_begin").length], [[200, { held: true }], NOT_FOUND, 1], "12g in the store apps too: the tester's purchase may start, the partner's is a 404 and holds nothing");
        delete process.env.IAP_ENABLED;
      }
      // What counts as naming a tester.
      {
        const PLUS = require(PLUS_PATH);
        const said = [];
        for (const v of ["*", "all", "true", "everyone", "", " ", U.replace(/-/g, ""), U.slice(0, 35), `${U}x`, "null", "undefined", "%"]) {
          process.env.PLUS_TESTER_USER_IDS = v;
          const db = makeDb();
          said.push((await st(db, makeStripe(), U))[0]);
        }
        t.eq([...new Set(said)], [404], "12h a star, a word, an empty value or a malformed id names nobody: only PLUS_ENABLED can switch Plus on for everyone");
        process.env.PLUS_TESTER_USER_IDS = `  ${O} ,\n ${U.toUpperCase()} , not-an-id,${O}`;
        t.eq([(await st(makeDb(), makeStripe(), U))[0], (await st(makeDb(), makeStripe(), O))[0], (await st(makeDb(), makeStripe(), P))[0], PLUS.plusTesterIds().length], [200, 200, 404, 2],
          "12i several ids, with spaces, new lines, capitals and a stray word: each named account, once, and nobody else");
        t.eq([PLUS.isPlusTester(U), PLUS.isPlusTester(P), PLUS.isPlusTester(null), PLUS.isPlusTester(undefined), PLUS.isPlusTester(""), PLUS.plusEnabledFor(P), PLUS.plusOnForAnyone()], [true, false, false, false, false, false, true],
          "12j the check itself: a named account yes; a partner, nobody and nothing no");
      }
      // A tester's sandbox purchase counts; nobody else's does.
      {
        const PLUS = require(PLUS_PATH);
        const sandbox = { entitlements: { plus_addon: { expires_date: future, product_identifier: "app.flourishmoney.plusaddon.monthly" } },
          subscriptions: { "app.flourishmoney.plusaddon.monthly": { store: "app_store", is_sandbox: true, expires_date: future, ownership_type: "PURCHASED" } } };
        const no = PLUS.plusFromSubscriber(sandbox, Date.now(), { acceptSandbox: false }), yes = PLUS.plusFromSubscriber(sandbox, Date.now(), { acceptSandbox: true });
        t.eq([no.row, no.reason, yes.row && yes.row.plan_key, yes.row && yes.row.provider], [null, "sandbox", "plus_monthly", "app_store"], "12k a sandbox purchase (TestFlight) gives Plus only when it is accepted");
        const bsrc = fs.readFileSync(path.join(REPO, "netlify", "functions", "billing.js"), "utf8"), rsrc = fs.readFileSync(path.join(REPO, "netlify", "functions", "revenuecat-webhook.js"), "utf8");
        t.ok(bsrc.includes("acceptSandbox: acceptSandboxFor(user) || plusAddon.isPlusTester(user_id) })") && rsrc.includes("if (plusAddon.plusEnabledFor(userId)) {") && rsrc.includes("acceptSandbox: acceptSandboxFor(user) || plusAddon.isPlusTester(userId), now: deps.now })"),
          "12l …and it is accepted for a tester's own account only, in the app's sync and in the store's own report; the report syncs Plus for a tester only");
        t.ok(/if \(!plusAddon\.plusOnForAnyone\(\)\) return json\(404/.test(bsrc) && bsrc.indexOf("if (plusAction && !plusAddon.plusEnabledFor(user_id)) return json(404") > bsrc.indexOf("const { user_id, error: authError } = await getUserFromRequest(event);")
          && bsrc.indexOf("if (plusAction && !plusAddon.plusEnabledFor(user_id)) return json(404") < bsrc.indexOf("admin = getAdminClient();"),
          "12m in the code: off for everyone is answered before auth; who is calling is checked right after auth, before the database is opened");
      }
      // PLUS_ENABLED on: everyone, whatever the list says.
      {
        process.env.PLUS_ENABLED = "true";
        const answers = [];
        for (const list of [undefined, "", U, "*", `${O},${U}`]) {
          if (list === undefined) delete process.env.PLUS_TESTER_USER_IDS; else process.env.PLUS_TESTER_USER_IDS = list;
          const db = makeDb(); couple(db);
          answers.push([(await st(db, makeStripe(), U))[0], (await st(db, makeStripe(), P))[0], (await st(db, makeStripe(), O))[0]].join(","));
        }
        t.eq([...new Set(answers)], ["200,200,200"], "12n PLUS_ENABLED on: Plus answers for everyone (the tester, their partner and anybody else), whatever the tester list holds");
      }
      reset();
      process.env.PLUS_ENABLED = "true";
    }
  } finally {
    console.error = quiet.e; console.warn = quiet.w; global.fetch = realFetch;
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  }
  t.summary("plusEntitlement.test");
})();
