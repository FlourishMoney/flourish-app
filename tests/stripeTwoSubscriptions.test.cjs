// tests/stripeTwoSubscriptions.test.cjs
// -----------------------------------------------------------------------------
// ONE HOUSEHOLD, ONE STRIPE SUBSCRIPTION (audit 2026-10-26, B3).
//
// The 409 guard ran only against our own row and the checkout idempotency key changed every minute, so two tabs,
// or two checkouts a minute apart, could both complete. The webhook then wrote the second over the first: both
// charged, cancelling one marked the row cancelled while the other kept billing, and deleting the account
// cancelled only the one on the row. Runs the real handlers against a stand-in database and a mocked Stripe:
//   1  two checkouts a minute apart: the row keeps the first; the second is flagged for support, once
//   2  cancel one: cancelling the extra changes nothing; the household's own subscription still ends normally
//   3  two tabs: checkout asks Stripe first (409 when one is live, 503 when Stripe cannot be asked), and expires
//      the customer's other open checkouts, so an older tab cannot complete a second subscription
//   4  delete: every live subscription Stripe has for the customer is cancelled, not only the row's
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const { signPayload } = require("../netlify/functions/_lib/stripeSignature.js");

const AUTH_PATH = require.resolve("../netlify/functions/_lib/auth.js");
const API_PATH = require.resolve("../netlify/functions/_lib/stripeApi.js");
const LIVE_PATH = require.resolve("../netlify/functions/_lib/stripeLive.js");
const ALERT_PATH = require.resolve("../netlify/functions/_lib/supportAlert.js");
const HOOK_PATH = require.resolve("../netlify/functions/stripe-webhook.js");
const BILLING_PATH = require.resolve("../netlify/functions/billing.js");
const PLAID_PATH = require.resolve("../netlify/functions/plaid.js");
const U = "11111111-1111-4111-8111-111111111111";

// A stand-in database: subscriptions keyed by user_id, billing_events by event_id.
function makeDb() {
  const state = { rows: { subscriptions: [], billing_events: [], plaid_items: [] }, deletes: [] };
  const api = (table) => {
    const q = {
      f: {},
      select() { return q; },
      eq(c, v) { q.f[c] = v; return q; },
      not() { return q; },
      _hits() { return (state.rows[table] || []).filter((r) => Object.entries(q.f).every(([k, v]) => r[k] === v)); },
      async maybeSingle() { return { data: q._hits()[0] || null, error: null }; },
      then(res, rej) { return Promise.resolve({ data: q._hits(), error: null }).then(res, rej); },
      insert(row) {
        const rows = state.rows[table]; const pk = table === "billing_events" ? "event_id" : "user_id";
        const dup = rows.some((r) => r[pk] === row[pk]); if (!dup) rows.push({ ...row });
        return { select: async () => ({ data: dup ? [] : [row], error: null }) };
      },
      async upsert(row) { const rows = state.rows[table]; const i = rows.findIndex((r) => r.user_id === row.user_id); if (i >= 0) rows[i] = { ...rows[i], ...row }; else rows.push({ ...row }); return { error: null }; },
      update(p) { return { eq: async (c, v) => { (state.rows[table] || []).forEach((r) => { if (r[c] === v) Object.assign(r, p); }); return { error: null }; } }; },
      delete() { return { eq: async (c, v) => { state.deletes.push(table); state.rows[table] = (state.rows[table] || []).filter((r) => r[c] !== v); return { error: null }; } }; },
    };
    return q;
  };
  const admin = {
    from: api, rpc: async () => ({ data: null, error: null }),
    auth: { admin: { getUserById: async () => ({ data: { user: { email: "x@example.invalid", email_confirmed_at: "2026-10-01T00:00:00Z" } } }), deleteUser: async () => ({ error: null }) } },
  };
  return { state, admin };
}

// A mocked Stripe: `subs` is what Stripe lists for the customer, `open` the open checkout sessions.
function makeStripe(o = {}) {
  const log = [];
  const stripe = { subs: o.subs || [], open: o.open || [], listFails: !!o.listFails, created: 0 };
  const get = async (p) => {
    log.push(`GET ${p}`);
    if (stripe.listFails) { const e = new Error("stripe down"); e.statusCode = 500; throw e; }
    if (p.startsWith("/subscriptions?")) return { data: stripe.subs };
    if (p.startsWith("/checkout/sessions?")) return { data: stripe.open };
    const id = decodeURIComponent(p.split("/").pop());
    const s = stripe.subs.find((x) => x.id === id);
    if (!s) { const e = new Error("no such subscription"); e.statusCode = 404; throw e; }
    return s;
  };
  const post = async (p) => {
    log.push(`POST ${p}`);
    if (p === "/customers") return { id: "cus_1" };
    if (p === "/checkout/sessions") { stripe.created++; return { id: "cs_new", url: "https://stripe.test/pay" }; }
    const m = /^\/checkout\/sessions\/([^/]+)\/expire$/.exec(p);
    if (m) { stripe.open = stripe.open.filter((s) => s.id !== decodeURIComponent(m[1])); return { id: m[1], status: "expired" }; }
    return {};
  };
  const del = async (p) => { log.push(`DELETE ${p}`); const id = decodeURIComponent(p.split("/").pop()); const s = stripe.subs.find((x) => x.id === id); if (s) s.status = "canceled"; return { id, status: "canceled" }; };
  return { stripe, log, exports: { stripeGet: get, stripePost: post, stripeDelete: del, formEncode: () => "", STRIPE_BASE: "https://stripe.test" } };
}

function loadWith(db, stripeMock, alerts) {
  for (const p of [AUTH_PATH, API_PATH, LIVE_PATH, ALERT_PATH, HOOK_PATH, BILLING_PATH, PLAID_PATH]) delete require.cache[p];
  const real = require(AUTH_PATH);
  require.cache[AUTH_PATH].exports = { ...real, getAdminClient: () => db.admin, getUserFromRequest: async () => ({ user_id: U, error: null }) };
  require.cache[API_PATH] = { id: API_PATH, filename: API_PATH, loaded: true, exports: stripeMock.exports };
  require.cache[ALERT_PATH] = { id: ALERT_PATH, filename: ALERT_PATH, loaded: true,
    exports: { alertSupport: async (a) => { alerts.push(a); return true; }, supportAlertMessage: () => ({}), DEFAULT_TO: "x" } };
  return { hook: require(HOOK_PATH), billing: require(BILLING_PATH), plaid: require(PLAID_PATH) };
}

(async () => {
  const t = create();
  const saved = { ...process.env };
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
  process.env.BILLING_ENABLED = "true";
  process.env.STRIPE_SECRET_KEY = "sk_test_mock_never_sent";
  process.env.PLAID_CLIENT_ID = "test-client"; process.env.PLAID_SECRET = "test-secret";
  for (const k of Object.keys(process.env)) if (/^STRIPE_PRICE_/.test(k)) delete process.env[k];
  process.env.STRIPE_PRICE_MONTHLY_CAD = "price_m"; process.env.STRIPE_PRICE_ANNUAL_CAD = "price_a"; process.env.STRIPE_PRICE_FOUNDING_ANNUAL_CAD = "price_f";
  const quiet = { e: console.error, w: console.warn }; console.error = () => {}; console.warn = () => {};
  const realFetch = global.fetch; global.fetch = async () => ({ ok: true, status: 200, json: async () => ({ removed: true }) });
  let clock = Math.floor(Date.now() / 1000) - 1000;
  const send = async (hook, type, object) => {
    clock += 60; // a minute apart
    const evt = { id: "evt_" + clock, type, created: clock, data: { object } }; const raw = JSON.stringify(evt);
    const now = Math.floor(Date.now() / 1000); // signed now; the event's own time is a minute after the last
    return hook.handler({ httpMethod: "POST", body: raw, headers: { "stripe-signature": signPayload(raw, "whsec_test", now) } });
  };
  const sub = (id, status, plan = "monthly") => ({ id, object: "subscription", customer: "cus_1", status, metadata: { user_id: U, plan_key: plan },
    items: { data: [{ price: { id: "price_m" }, current_period_end: clock + 30 * 86400 }] }, current_period_end: clock + 30 * 86400 });
  const row = (db) => db.state.rows.subscriptions.find((r) => r.user_id === U) || {};

  try {
    // ── 1 and 2. Two checkouts a minute apart; then cancel one ────────────────────────────────────
    {
      const db = makeDb(); const sm = makeStripe(); const alerts = [];
      const { hook } = loadWith(db, sm, alerts);
      await send(hook, "checkout.session.completed", { customer: "cus_1", subscription: "sub_A", metadata: { user_id: U, plan_key: "monthly" }, client_reference_id: U });
      await send(hook, "customer.subscription.updated", sub("sub_A", "active"));
      const second = await send(hook, "checkout.session.completed", { customer: "cus_1", subscription: "sub_B", metadata: { user_id: U, plan_key: "annual" }, client_reference_id: U });
      const upd = await send(hook, "customer.subscription.updated", sub("sub_B", "active", "annual"));
      t.eq([row(db).provider_subscription_id, row(db).status, row(db).plan_key], ["sub_A", "active", "monthly"], "1a after two checkouts a minute apart the row still holds the first subscription (was overwritten by the second)");
      t.eq([second.statusCode, JSON.parse(second.body).duplicate, upd.statusCode, JSON.parse(upd.body).duplicate], [200, true, 200, true], "1b the second checkout and its update are acknowledged as a duplicate (200, so Stripe does not retry)");
      t.eq([row(db).support_flag, alerts.length, alerts[0] && alerts[0].flag], ["two_stripe_subscriptions", 1, "two_stripe_subscriptions"], "1c the row is flagged for support, and support is told once");
      const ev = db.state.rows.billing_events.filter((e) => e.status === "ignored" && /duplicate/.test(e.error || ""));
      t.eq(ev.length, 2, "1d both duplicate events are recorded in billing_events");

      const cancelExtra = await send(hook, "customer.subscription.deleted", sub("sub_B", "canceled", "annual"));
      t.eq([cancelExtra.statusCode, row(db).provider_subscription_id, row(db).status, alerts.length], [200, "sub_A", "active", 1], "2a cancelling the extra subscription leaves the household's own active (no lock-out), and raises nothing new");
      await send(hook, "customer.subscription.deleted", sub("sub_A", "canceled"));
      t.eq([row(db).provider_subscription_id, row(db).status], ["sub_A", "canceled"], "2b cancelling the household's own subscription still ends it");
      const again = await send(hook, "checkout.session.completed", { customer: "cus_1", subscription: "sub_C", metadata: { user_id: U, plan_key: "annual" }, client_reference_id: U });
      t.eq([JSON.parse(again.body).duplicate, row(db).provider_subscription_id, row(db).status], [undefined, "sub_C", "active"], "2c once it has ended, subscribing again is written as usual");
    }

    // ── 2d. A first payment that never went through (incomplete) holds no one (review of 2026-10-26) ──
    {
      const db = makeDb(); const sm = makeStripe(); const alerts = [];
      const { hook } = loadWith(db, sm, alerts);
      await send(hook, "checkout.session.completed", { customer: "cus_1", subscription: "sub_A", metadata: { user_id: U, plan_key: "monthly" }, client_reference_id: U });
      await send(hook, "customer.subscription.updated", sub("sub_A", "incomplete"));
      const retry = await send(hook, "checkout.session.completed", { customer: "cus_1", subscription: "sub_B", metadata: { user_id: U, plan_key: "annual" }, client_reference_id: U });
      t.eq([JSON.parse(retry.body).duplicate, row(db).provider_subscription_id, row(db).status, alerts.length], [undefined, "sub_B", "active", 0],
        "2d an incomplete first attempt, then a paid retry: the retry is written (paid, access), not flagged as a second subscription");
    }

    // ── 3. Two tabs ───────────────────────────────────────────────────────────────────────────────
    {
      const checkout = (billing) => billing.handler({ httpMethod: "POST", headers: { origin: "https://flourishmoney.app" }, body: JSON.stringify({ action: "create_checkout_session", plan_key: "annual" }) });
      // Tab 1 opened a session; tab 2 asks for another before tab 1 pays.
      let db = makeDb(); let sm = makeStripe({ open: [{ id: "cs_tab1", mode: "subscription" }] });
      let r = await checkout(loadWith(db, sm, []).billing);
      t.eq([r.statusCode, sm.stripe.open.map((s) => s.id), sm.stripe.created], [200, [], 1], "3a a second tab's checkout expires the first tab's open session, so only one can complete");
      t.ok(sm.log.indexOf("POST /checkout/sessions/cs_tab1/expire") < sm.log.indexOf("POST /checkout/sessions"), "3b …before the new session is made");
      // Tab 1 already paid; the webhook has not written the row yet.
      db = makeDb(); sm = makeStripe({ subs: [sub("sub_A", "active")] });
      r = await checkout(loadWith(db, sm, []).billing);
      t.eq([r.statusCode, JSON.parse(r.body).error, sm.stripe.created], [409, "already_subscribed", 0], "3c a subscription Stripe has and the row does not show yet: 409, nothing created");
      db = makeDb(); sm = makeStripe({ subs: [sub("sub_A", "past_due")] });
      r = await checkout(loadWith(db, sm, []).billing);
      t.eq([r.statusCode, sm.stripe.created], [409, 0], "3d a past_due subscription at Stripe counts too");
      db = makeDb(); sm = makeStripe({ subs: [sub("sub_X", "incomplete"), sub("sub_Y", "canceled")] });
      r = await checkout(loadWith(db, sm, []).billing);
      t.eq([r.statusCode, sm.stripe.created], [200, 1], "3e a first payment that failed (incomplete) or an ended one does not block trying again");
      db = makeDb(); sm = makeStripe({ listFails: true });
      r = await checkout(loadWith(db, sm, []).billing);
      t.eq([r.statusCode, sm.stripe.created], [503, 0], "3f if Stripe cannot be asked, nothing is created (503, try again)");
    }

    // ── 4. Delete ─────────────────────────────────────────────────────────────────────────────────
    {
      const db = makeDb();
      db.state.rows.subscriptions.push({ user_id: U, provider: "stripe", provider_customer_id: "cus_1", provider_subscription_id: "sub_A", status: "active", plan_key: "monthly" });
      const sm = makeStripe({ subs: [sub("sub_A", "active"), sub("sub_B", "active", "annual"), sub("sub_Z", "canceled")] });
      const { plaid } = loadWith(db, sm, []);
      const res = await plaid.handler({ httpMethod: "POST", headers: { origin: "https://flourishmoney.app" }, body: JSON.stringify({ action: "delete_account" }) });
      const body = JSON.parse(res.body || "{}");
      t.eq([body.deleted, sm.log.filter((l) => l.startsWith("DELETE")).sort()], [true, ["DELETE /subscriptions/sub_A", "DELETE /subscriptions/sub_B"]],
        "4a deleting the account cancels both live subscriptions (the row's and the one it never showed), not the ended one");
      const db2 = makeDb();
      db2.state.rows.subscriptions.push({ user_id: U, provider: "stripe", provider_customer_id: "cus_1", provider_subscription_id: "sub_A", status: "active" });
      const sm2 = makeStripe({ subs: [sub("sub_A", "active")], listFails: true });
      const r2 = await loadWith(db2, sm2, []).plaid.handler({ httpMethod: "POST", headers: {}, body: JSON.stringify({ action: "delete_account" }) });
      const b2 = JSON.parse(r2.body || "{}");
      t.eq([b2.deleted, (b2.errors || []).map((e) => e.step), db2.state.deletes], [false, ["billing_cancel"], []], "4b if Stripe cannot list them, nothing is deleted (billing_cancel)");
    }
  } finally {
    console.error = quiet.e; console.warn = quiet.w; global.fetch = realFetch;
    for (const p of [AUTH_PATH, API_PATH, LIVE_PATH, ALERT_PATH, HOOK_PATH, BILLING_PATH, PLAID_PATH]) delete require.cache[p];
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  }
  t.summary("stripeTwoSubscriptions");
})();
