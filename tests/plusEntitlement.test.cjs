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
  const state = { rows: { subscriptions: [], billing_events: [], plaid_items: [], plus_addon_subscriptions: [], household_members: [], profiles: [] }, writes: [], reads: [] };
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
      async upsert(row) {
        state.writes.push(table);
        const e = q._err(); if (e) return { error: e };
        const rows = state.rows[table]; const i = rows.findIndex((r) => r.user_id === row.user_id);
        if (i >= 0) rows[i] = { ...rows[i], ...row }; else rows.push({ ...row }); return { error: null };
      },
      update(p) { state.writes.push(table); return { eq: async (c, v) => { (state.rows[table] || []).forEach((r) => { if (r[c] === v) Object.assign(r, p); }); return { error: null }; } }; },
      delete() { state.writes.push(table); return { eq: async (c, v) => { state.rows[table] = (state.rows[table] || []).filter((r) => r[c] !== v); return { error: null }; }, in: async () => ({ error: null }) }; },
    };
    return q;
  };
  const admin = {
    from: api,
    rpc: async (fn) => (fn === "purchase_attempt_begin" ? { data: { result: "held" }, error: null } : { data: null, error: null }),
    auth: { admin: { getUserById: async () => ({ data: { user: { email: "x@example.invalid", email_confirmed_at: "2026-10-01T00:00:00Z" } } }), deleteUser: async () => ({ error: null }) } },
  };
  return { state, admin };
}

function makeStripe() {
  const log = []; const stripe = { subs: [], sessions: [] };
  const get = async (p) => {
    log.push(`GET ${p}`);
    if (p.startsWith("/subscriptions?")) { const cus = decodeURIComponent((/customer=([^&]+)/.exec(p) || [])[1] || ""); return { data: stripe.subs.filter((s) => s.customer === cus) }; }
    if (p.startsWith("/checkout/sessions?")) return { data: [] };
    const id = decodeURIComponent(p.split("/").pop());
    const s = stripe.subs.find((x) => x.id === id);
    if (!s) { const e = new Error("no such subscription"); e.statusCode = 404; throw e; }
    return s;
  };
  const post = async (p, body) => {
    log.push(`POST ${p}`);
    if (p === "/customers") return { id: body && body.metadata && body.metadata.kind === "plus_addon" ? "cus_P" : "cus_M" };
    if (p === "/checkout/sessions") { stripe.sessions.push(body); return { id: "cs_plus", url: "https://stripe.test/pay" }; }
    if (p === "/billing_portal/sessions") return { url: `https://stripe.test/portal/${body.customer}` };
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
  for (const k of Object.keys(process.env)) if (/^STRIPE_PRICE_|^PLUS_ENABLED$|^IAP_ENABLED$|^HOUSEHOLD_ENABLED$/.test(k)) delete process.env[k];
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
      await send(hook, "customer.subscription.updated", plusSub("sub_P"));
      await send(hook, "customer.subscription.updated", { ...mainMonthly(), id: "sub_M", object: "subscription", customer: "cus_M", metadata: { user_id: U, plan_key: "monthly" }, items: { data: [{ price: { id: "price_m" }, current_period_end: now + 30 * DAY }] }, current_period_end: now + 30 * DAY });
      t.eq([(db.state.rows.subscriptions[0] || {}).provider_subscription_id, (db.state.rows.subscriptions[0] || {}).support_flag || null], ["sub_M", null], "5f later events for each go to their own row, and nothing is flagged");
      const again = await call(billing, { action: "plus_checkout", plan_key: "plus_annual" });
      t.eq([again.status, again.body && again.body.error], [409, "already_plus"], "5g a household with Plus is not sold it twice");
      await send(hook, "customer.subscription.deleted", plusSub("sub_P", "canceled"));
      const after = await call(billing, { action: "plus_status" });
      t.eq([after.body && after.body.plus, (db.state.rows.subscriptions[0] || {}).status], [false, "active"], "5h Plus ending ends Plus only: the monthly plan stays active");
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
      t.ok(!/plus_checkout|plus_status|plusAccess/.test(appSrc), "6e no screen calls a Plus action yet (the Plus screens are not built: see the spec), so none can be half open");
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
  } finally {
    console.error = quiet.e; console.warn = quiet.w; global.fetch = realFetch;
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  }
  t.summary("plusEntitlement.test");
})();
