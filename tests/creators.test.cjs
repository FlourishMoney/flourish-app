// tests/creators.test.cjs
// -----------------------------------------------------------------------------
// THE CREATOR PROGRAM ON THE SERVER, AND ITS WORDS (the database's own rules: tests/creators.sql.test.cjs).
//
// The real beta.js, stripe-webhook.js, revenuecat-webhook.js, creator.js and sweep, against a stand-in database that
// records what it is asked and answers as the migration does:
//   1  with CREATORS_ENABLED off, nothing happens anywhere: not a read, not a write, not a field
//   2  sign-up: a wrong code, a creator's own code, a check that fails; a right code goes on the new account
//   3  Settings: /api/creator's answers, a partner, a code after the first payment; never whose address a code is
//   4  Stripe: invoice.paid counts total_excluding_tax, the first payment and renewals; what it won't guess
//   5  Stripe refunds: that one payment's commission, whole or in part, however the charge names its invoice
//   6  the stores: the base is proceeds after the store's fee; null percentages, sandbox and Family Sharing earn nothing
//   7  store refunds, and a refund the store takes back
//   8  the sweep
//   9  the words: every line listed, in one file, the same in the code and the doc, within its limit, none left a placeholder
//  10  the code on a computer: the form's starting value, and the address it leaves
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const { signPayload } = require("../netlify/functions/_lib/stripeSignature.js");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const REPO = path.join(__dirname, "..");
const read = (...p) => fs.readFileSync(path.join(REPO, ...p), "utf8");
const AUTH_PATH = require.resolve("../netlify/functions/_lib/auth.js");
const API_PATH = require.resolve("../netlify/functions/_lib/stripeApi.js");
const ALERT_PATH = require.resolve("../netlify/functions/_lib/supportAlert.js");
const BLOBS_PATH = require.resolve("@netlify/blobs");
const LIB_PATH = require.resolve("../netlify/functions/_lib/creators.js");
const BETA_PATH = require.resolve("../netlify/functions/beta.js");
const HOOK_PATH = require.resolve("../netlify/functions/stripe-webhook.js");
const RC_PATH = require.resolve("../netlify/functions/revenuecat-webhook.js");
const API_FN_PATH = require.resolve("../netlify/functions/creator.js");
const SWEEP_PATH = require.resolve("../netlify/functions/creator-commissions-sweep.js");

const NOW = Date.parse("2026-11-02T15:00:00Z");
const T = Math.floor(NOW / 1000);
const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const WHSEC = "whsec_creators_test";
const RC_AUTH = "Bearer rc-creators-test";

// The stand-in database: records every rpc, and answers the creator functions from `db.answers`.
function makeDb(over = {}) {
  const db = { users: {}, rows: { subscriptions: [], billing_events: [], profiles: [] }, rpcs: [], created: [], alerts: [], stripeGets: [], answers: {}, ...over };
  const from = (table) => {
    const q = {
      f: [],
      select() { return q; },
      eq(c, v) { q.f.push([c, v]); return q; },
      _hits() { return (db.rows[table] = db.rows[table] || []).filter((r) => q.f.every(([c, v]) => r[c] === v)); },
      async maybeSingle() { return { data: q._hits()[0] ? { ...q._hits()[0] } : null, error: null }; },
      insert(row) {
        const rows = (db.rows[table] = db.rows[table] || []); const pk = table === "billing_events" ? "event_id" : "user_id";
        const dup = rows.some((r) => r[pk] === row[pk]); if (!dup) rows.push({ ...row });
        return { select: async () => ({ data: dup ? [] : [row], error: null }) };
      },
      async upsert(row) { const rows = (db.rows[table] = db.rows[table] || []); const i = rows.findIndex((r) => r.user_id === row.user_id); if (i >= 0) rows[i] = { ...rows[i], ...row }; else rows.push({ ...row }); return { error: null }; },
      update(p) { return { eq: async (c, v) => { (db.rows[table] || []).forEach((r) => { if (r[c] === v) Object.assign(r, p); }); return { error: null }; } }; },
      delete() { return { eq: async () => ({ error: null }) }; },
    };
    return q;
  };
  const rpc = async (name, a = {}) => {
    db.rpcs.push([name, a]);
    const answer = db.answers[name];
    if (typeof answer === "function") return answer(a);
    if (answer !== undefined) return { data: answer, error: null };
    if (name === "founding_seat_release") return { data: false, error: null };
    if (name === "founding_seat_take") return { data: [{ taken: false, seats: 0, over_cap: false }], error: null };
    if (name === "reserve_beta_seat") return { data: "ok", error: null };
    return { data: null, error: null };
  };
  const admin = { from, rpc, auth: { admin: {
    getUserById: async (id) => ({ data: { user: db.users[id] || { id, email: "someone@example.test" } }, error: null }),
    createUser: async (u) => { db.created.push(u); return { data: { user: { id: uid(900) } }, error: null }; },
  } } };
  return { db, admin };
}
const creatorCalls = (D) => D.db.rpcs.filter(([n]) => n.startsWith("creator_"));
const callsTo = (D, name) => D.db.rpcs.filter(([n]) => n === name).map(([, a]) => a);
const noteOn = (D, id) => (D.db.rows.billing_events.find((e) => e.event_id === id) || {}).error || "";

function withStubs(D, as, fn) {
  for (const p of [LIB_PATH, BETA_PATH, HOOK_PATH, RC_PATH, API_FN_PATH, SWEEP_PATH, AUTH_PATH, API_PATH, ALERT_PATH, BLOBS_PATH]) delete require.cache[p];
  const real = require(AUTH_PATH);
  require.cache[AUTH_PATH].exports = { ...real, getUserFromRequest: async () => ({ user_id: as, error: as ? null : "unauthorized" }), getAdminClient: () => D.admin,
    getPublicClient: () => ({ auth: { resend: async () => ({ error: null }) } }) };
  require.cache[API_PATH] = { id: API_PATH, filename: API_PATH, loaded: true, exports: {
    stripeGet: async (p) => { D.db.stripeGets.push(p); return (typeof D.db.stripeAnswer === "function" ? D.db.stripeAnswer(p) : D.db.stripeAnswer) || { data: [] }; }, stripePost: async () => ({}) } };
  require.cache[ALERT_PATH] = { id: ALERT_PATH, filename: ALERT_PATH, loaded: true, exports: { alertSupport: async (a) => { D.db.alerts.push(a); return true; }, supportAlertMessage: () => ({}), DEFAULT_TO: "x" } };
  const d = new Map();
  require.cache[BLOBS_PATH] = { id: BLOBS_PATH, filename: BLOBS_PATH, loaded: true, exports: { getStore: () => ({ async get(k) { return d.has(k) ? d.get(k) : null; }, async setJSON(k, v) { d.set(k, v); } }) } };
  return fn();
}

async function signup(D, body, origin = "https://flourishmoney.app") {
  return withStubs(D, null, async () => {
    const beta = require(BETA_PATH);
    const r = await beta.handler({ httpMethod: "POST", headers: { origin }, body: JSON.stringify({ action: "signup", email: "new@example.test", password: "long-enough-password", ...body }) });
    return { code: r.statusCode, body: JSON.parse(r.body) };
  });
}
async function stripeEvent(D, id, type, object, created = T) {
  return withStubs(D, uid(0), async () => {
    const hook = require(HOOK_PATH);
    const body = JSON.stringify({ id, created, type, data: { object } });
    return (await hook.handler({ httpMethod: "POST", headers: { "stripe-signature": signPayload(body, WHSEC) }, body })).statusCode;
  });
}
async function rcEvent(D, evt) {
  return withStubs(D, evt.app_user_id, async () => {
    const wh = require(RC_PATH)._test;
    const r = await wh.handle({ httpMethod: "POST", headers: { authorization: RC_AUTH }, body: JSON.stringify({ event: { id: `rc-${evt.transaction_id || evt.type}`, ...evt } }) },
      { admin: D.admin, fetchSubscriber: async () => ({ entitlements: {}, subscriptions: {} }), now: NOW, mayBuyFounding: async () => true });
    return r.statusCode;
  });
}
async function api(D, as, { method = "POST", body, origin = "https://flourishmoney.app" } = {}) {
  return withStubs(D, as, async () => {
    const fn = require(API_FN_PATH);
    const r = await fn.handler({ httpMethod: method, headers: { origin, authorization: "Bearer x" }, body: body ? JSON.stringify(body) : undefined });
    return { code: r.statusCode, body: r.body ? JSON.parse(r.body) : null };
  });
}
const invoice = (o = {}) => ({ id: "in_1", customer: "cus_1", subscription: "sub_1", amount_paid: 1356, total_excluding_tax: 1199, currency: "cad", status: "paid",
  status_transitions: { paid_at: T - 60 }, billing_reason: "subscription_cycle", ...o });
const storeEvt = (o = {}) => ({ type: "RENEWAL", app_user_id: uid(1), store: "APP_STORE", environment: "PRODUCTION", is_family_share: false, product_id: "app.flourishmoney.plus.monthly",
  transaction_id: "txn_1", original_transaction_id: "orig_1", purchased_at_ms: NOW - 60000, price_in_purchased_currency: 11.99, currency: "CAD", tax_percentage: 0.1304, commission_percentage: 0.1304, period_type: "NORMAL", ...o });

(async () => {
  const t = create();
  const saved = { ...process.env };
  Object.assign(process.env, { IAP_ENABLED: "true", STRIPE_WEBHOOK_SECRET: WHSEC, REVENUECAT_WEBHOOK_AUTH: RC_AUTH, SUPABASE_URL: "https://supabase.test.invalid", SUPABASE_SECRET_KEY: "test-not-real", OPEN_SIGNUP: "true" });
  delete process.env.RESEND_API_KEY;
  const quiet = { e: console.error, l: console.log, w: console.warn };
  console.error = console.log = console.warn = () => {};
  const realFetch = global.fetch;
  global.fetch = async () => { throw new Error("network blocked in test"); };
  try {
    // 1 ── OFF ───────────────────────────────────────────────────────────────────────────────────────────────────
    delete process.env.CREATORS_ENABLED;
    {
      const D = makeDb();
      const r = await signup(D, { creator_code: "NOPE" });
      t.eq([r.body.ok, D.db.created.length, creatorCalls(D).length], [true, 1, 0], "1a off: a code sent at sign-up is ignored, and the account is made as ever");
      t.eq([(await api(D, uid(1), { method: "GET" })).code, (await api(D, uid(1), { body: { action: "status" } })).code], [404, 404], "1b off: /api/creator answers 404 to everything");
      const D2 = makeDb();
      t.eq([await stripeEvent(D2, "evt_off", "invoice.paid", invoice()), (D2.db.rows.billing_events.find((e) => e.event_id === "evt_off") || {}).status, creatorCalls(D2).length], [200, "ignored", 0], "1c off: invoice.paid is ignored like any other event not handled");
      const D3 = makeDb();
      await stripeEvent(D3, "evt_refund_off", "charge.refunded", { id: "ch_1", customer: "cus_1", refunded: true, amount: 1356, amount_refunded: 1356, invoice: "in_1" });
      t.eq([creatorCalls(D3).length, D3.db.stripeGets.length], [0, 0], "1d off: a refund touches nothing of the program");
      const D3b = makeDb();
      t.eq([await stripeEvent(D3b, "evt_dispute_off", "charge.dispute.closed", { id: "du_1", charge: "ch_1", amount: 1356, status: "lost" }), (D3b.db.rows.billing_events.find((e) => e.event_id === "evt_dispute_off") || {}).status, creatorCalls(D3b).length, D3b.db.stripeGets.length], [200, "ignored", 0, 0], "1d2 off: a lost chargeback is ignored like any other event: no read, no write");
      const D3c = makeDb();
      t.eq([await stripeEvent(D3c, "evt_back_off", "charge.dispute.funds_reinstated", { id: "du_1", charge: "ch_1", amount: 1356, status: "won" }), (D3c.db.rows.billing_events.find((e) => e.event_id === "evt_back_off") || {}).status, creatorCalls(D3c).length, D3c.db.stripeGets.length], [200, "ignored", 0, 0], "1d3 off: funds coming back too");
      const D4 = makeDb();
      await rcEvent(D4, storeEvt());
      t.eq(creatorCalls(D4).length, 0, "1e off: a store payment touches nothing of the program");
      const D5 = makeDb();
      const sw = await withStubs(D5, null, () => require(SWEEP_PATH).handler({}, {}, { admin: D5.admin }));
      t.eq([JSON.parse(sw.body).skipped, D5.db.rpcs.length], ["creators_off", 0], "1f off: the sweep reads and writes nothing");
    }
    process.env.CREATORS_ENABLED = "true";
    t.eq([require(LIB_PATH).creatorsEnabled({ CREATORS_ENABLED: "yes" }), require(LIB_PATH).creatorsEnabled({})], [false, false], "1g only exactly \"true\" turns it on");

    // 2 ── SIGN-UP ───────────────────────────────────────────────────────────────────────────────────────────────
    {
      const ok = () => makeDb({ answers: { creator_code_check: { result: "ok" }, creator_attribute: { result: "attributed" } } });
      let D = makeDb({ answers: { creator_code_check: { result: "invalid" } } });
      let r = await signup(D, { creator_code: "WRONG" });
      t.eq([r.body.error, D.db.created.length, callsTo(D, "creator_attribute").length], ["creator_code_invalid", 0, 0], "2a a wrong code: refused before any account exists");
      D = makeDb({ answers: { creator_code_check: { result: "ok" }, creator_attribute: { result: "invalid" } } });
      r = await signup(D, { creator_code: "MINE", email: "creator@example.test" });
      t.eq([r.body.ok, r.body.error, callsTo(D, "creator_code_check")[0], D.db.created.length], [true, undefined, { p_code: "MINE" }, 1],
        "2b a creator's own code: sign-up asks about the code alone, so the answer can't test a guessed address; the account is made, and the database puts no code on it");
      D = ok();
      r = await signup(D, { creator_code: "a b" });
      t.eq([r.body.error, creatorCalls(D).length, D.db.created.length], ["creator_code_invalid", 0, 0], "2c something that could not be a code: refused without asking");
      D = makeDb({ answers: { creator_code_check: () => ({ data: null, error: { code: "XX000" } }) } });
      r = await signup(D, { creator_code: "ALICE" });
      t.eq([r.body.error, D.db.created.length], ["creator_code_unavailable", 0], "2d the check itself fails: the person is told, and nothing is created");
      D = ok();
      r = await signup(D, { creator_code: " alice " });
      t.eq([r.body.ok, D.db.created.length, callsTo(D, "creator_attribute")[0]], [true, 1, { p_user: uid(900), p_code: "ALICE", p_source: "web" }], "2e a right code goes on the new account, uppercase, from the web");
      D = ok();
      await signup(D, { creator_code: "ALICE" }, "capacitor://localhost");
      t.eq(callsTo(D, "creator_attribute")[0].p_source, "ios", "2f from the iPhone app");
      D = ok();
      await signup(D, { creator_code: "ALICE" }, "https://localhost");
      t.eq(callsTo(D, "creator_attribute")[0].p_source, "android", "2g from the Android app");
      D = ok();
      r = await signup(D, { creator_code: "   " });
      t.eq([r.body.ok, creatorCalls(D).length], [true, 0], "2h the field is optional: empty, nothing is asked");
      D = ok();
      r = await signup(D, {});
      t.eq([r.body.ok, creatorCalls(D).length], [true, 0], "2i …and an older app that sends no field signs up as ever");
      D = makeDb({ answers: { creator_code_check: { result: "ok" }, creator_attribute: () => ({ data: null, error: { code: "XX000" } }) } });
      r = await signup(D, { creator_code: "ALICE" });
      t.eq([r.body.ok, D.db.created.length], [true, 1], "2j the code can't be recorded after the account is made: the account stands (it can be added in Settings)");
    }

    // 3 ── SETTINGS ──────────────────────────────────────────────────────────────────────────────────────────────
    {
      const U = uid(1);
      let D = makeDb();
      t.eq((await api(D, null, { method: "GET" })).body, { enabled: true }, "3a on: the sign-up form asks, signed out, and is told");
      t.eq(creatorCalls(D).length, 0, "3b …and nothing is read to say so");
      t.eq((await api(D, null, { body: { action: "status" } })).code, 401, "3c anything else needs a sign-in");
      D = makeDb({ answers: { creator_status: { may_add: true, why: null } } });
      t.eq((await api(D, U, { body: { action: "status" } })).body, { enabled: true, may_add: true }, "3d Settings is told whether a code can be added, and never why not");
      const add = async (result, code = "ALICE") => { const d = makeDb({ answers: { creator_attribute: result } }); return { r: await api(d, U, { body: { action: "add", code } }), d }; };
      let x = await add({ result: "attributed" });
      t.eq([x.r.code, x.r.body, callsTo(x.d, "creator_attribute")[0]], [200, { ok: true }, { p_user: U, p_code: "ALICE", p_source: "web" }], "3e a right code is added");
      x = await add({ result: "invalid" });
      t.eq([x.r.code, x.r.body.error], [400, "creator_code_invalid"], "3f a wrong code, or a creator's own: the same answer, which never says whose address it is");
      for (const why of ["already", "not_owner", "too_late", "paid"]) {
        x = await add({ result: why });
        t.eq([x.r.code, x.r.body.error], [409, "creator_code_closed"], `3g ${why}: one answer (a code after the first payment, past 14 days, a partner, a second code)`);
      }
      x = await add(() => ({ data: null, error: { code: "XX000" } }));
      t.eq([x.r.code, x.r.body.error], [503, "creator_code_unavailable"], "3h the database fails: nothing changed, and the person is told");
      D = makeDb();
      t.eq([(await api(D, U, { body: { action: "add", code: "a!" } })).body.error, creatorCalls(D).length], ["creator_code_invalid", 0], "3i something that could not be a code: not asked");
    }

    // 4 ── STRIPE ────────────────────────────────────────────────────────────────────────────────────────────────
    {
      const attributed = (o = {}) => makeDb({ answers: { creator_for_payer: true, creator_commission_record: { result: "recorded", commission_cents: 240 } }, rows: { subscriptions: [{ user_id: uid(1), provider_subscription_id: "sub_1", provider_customer_id: "cus_1" }], billing_events: [], profiles: [] }, ...o });
      let D = attributed();
      t.eq(await stripeEvent(D, "evt_1", "invoice.paid", invoice()), 200, "4a a paid invoice is handled when the program is on");
      t.eq(callsTo(D, "creator_commission_record")[0], { p_user: uid(1), p_provider: "stripe", p_payment_ref: "in_1", p_original_ref: null, p_payment_date: new Date((T - 60) * 1000).toISOString(), p_base_cents: 1199, p_gross_cents: 1356, p_currency: "CAD" },
        "4b the base is total_excluding_tax, the price before sales tax; the payment is the invoice, on the date it was paid");
      D = attributed();
      await stripeEvent(D, "evt_disc", "invoice.paid", invoice({ id: "in_disc", total_excluding_tax: 800, amount_paid: 904 }));
      t.eq(callsTo(D, "creator_commission_record")[0].p_base_cents, 800, "4c after any discount");
      D = attributed();
      await stripeEvent(D, "evt_ren", "invoice.paid", invoice({ id: "in_2", billing_reason: "subscription_cycle" }));
      await stripeEvent(D, "evt_ren2", "invoice.paid", invoice({ id: "in_3", billing_reason: "subscription_cycle" }));
      t.eq(callsTo(D, "creator_commission_record").map((a) => a.p_payment_ref), ["in_2", "in_3"], "4d each renewal counts for itself");
      D = attributed();
      await stripeEvent(D, "evt_basil", "invoice.paid", invoice({ id: "in_b", subscription: undefined, parent: { subscription_details: { subscription: "sub_1", metadata: {} } } }));
      t.eq(callsTo(D, "creator_commission_record")[0].p_user, uid(1), "4e the newer API's invoice shape finds the same account");
      D = attributed({ rows: { subscriptions: [], billing_events: [], profiles: [] } });
      await stripeEvent(D, "evt_meta", "invoice.paid", invoice({ id: "in_m", subscription: undefined, parent: { subscription_details: { subscription: "sub_9", metadata: { user_id: uid(7) } } } }));
      t.eq(callsTo(D, "creator_commission_record")[0].p_user, uid(7), "4f an invoice arriving before the subscription's row finds the account by the checkout's metadata");
      D = attributed();
      await stripeEvent(D, "evt_zero", "invoice.paid", invoice({ id: "in_z", amount_paid: 0 }));
      t.eq([callsTo(D, "creator_commission_record").length, D.db.alerts.length], [0, 0], "4g nothing paid: no commission, and nothing to tell anyone");
      D = attributed();
      await stripeEvent(D, "evt_nosub", "invoice.paid", invoice({ id: "in_n", subscription: undefined }));
      t.eq(callsTo(D, "creator_commission_record").length, 0, "4h not a subscription: not a payment of the program's");
      D = attributed();
      await stripeEvent(D, "evt_null", "invoice.paid", invoice({ id: "in_u", total_excluding_tax: null }));
      t.eq([callsTo(D, "creator_commission_record").length, D.db.alerts.map((a) => a.flag), /creator_amounts_unknown/.test(noteOn(D, "evt_null"))], [0, ["creator_amounts_unknown"], true], "4i a price before tax it can't read: no commission, a guess never, and a note for support");
      t.eq(callsTo(D, "creator_first_payment_seen")[0], { p_user: uid(1), p_when: new Date((T - 60) * 1000).toISOString() }, "4i2 …and the 12 months still start: next year's renewal can't be a fresh first payment");
      D = attributed({ answers: { creator_for_payer: false } });
      await stripeEvent(D, "evt_none", "invoice.paid", invoice({ id: "in_o", total_excluding_tax: null }));
      t.eq([callsTo(D, "creator_commission_record").length, D.db.alerts.length], [0, 0], "4j an account with no creator: nothing recorded, nothing to report");
      D = attributed({ answers: { creator_for_payer: true, creator_commission_record: { result: "not_cad" } } });
      await stripeEvent(D, "evt_usd", "invoice.paid", invoice({ id: "in_usd", currency: "usd" }));
      t.eq([callsTo(D, "creator_commission_record")[0].p_currency, D.db.alerts.map((a) => a.flag)], ["USD", ["creator_not_cad"]], "4k another currency: the database refuses it, and support hears");
      D = attributed({ answers: { creator_for_payer: true, creator_commission_record: { result: "own_code" } } });
      await stripeEvent(D, "evt_own", "invoice.paid", invoice({ id: "in_own" }));
      t.eq(D.db.alerts.map((a) => a.flag), ["creator_own_code"], "4l a household holding its own creator's code: support hears");
      D = attributed({ answers: { creator_for_payer: () => ({ data: null, error: { code: "XX000" } }) } });
      t.eq([await stripeEvent(D, "evt_fail", "invoice.paid", invoice({ id: "in_f" })), (D.db.rows.billing_events.find((e) => e.event_id === "evt_fail") || {}).status], [500, "failed"], "4m the database fails: 500, so Stripe tries again");
      D = attributed();
      await stripeEvent(D, "evt_rep", "invoice.paid", invoice({ id: "in_r" }));
      await stripeEvent(D, "evt_rep", "invoice.paid", invoice({ id: "in_r" }));
      t.eq(callsTo(D, "creator_commission_record").length, 1, "4n a replayed event is not looked at twice");
      t.eq(D.db.rows.subscriptions[0].status, undefined, "4o a paid invoice changes nothing about the household's plan");
    }

    // 5 ── STRIPE REFUNDS ────────────────────────────────────────────────────────────────────────────────────────
    {
      const charge = (o = {}) => ({ id: "ch_1", customer: "cus_1", refunded: true, amount: 1356, amount_refunded: 1356, invoice: "in_1", payment_intent: "pi_1", ...o });
      const base = (o = {}) => makeDb({ answers: { creator_commission_clawback: { result: "clawback", cents: 240 }, creator_for_payer: true }, rows: { subscriptions: [{ user_id: uid(1), provider_customer_id: "cus_1" }], billing_events: [], profiles: [] }, ...o });
      let D = base();
      await stripeEvent(D, "evt_r1", "charge.refunded", charge());
      t.eq(callsTo(D, "creator_commission_clawback")[0], { p_provider: "stripe", p_payment_ref: "in_1", p_original_ref: null, p_payment_date: null, p_refunded_cents: 1356 }, "5a a refund claws back the commission on the invoice it paid");
      t.eq(callsTo(D, "founding_seat_release").length, 1, "5b …and still gives a founding seat back, as it did");
      D = base();
      await stripeEvent(D, "evt_r2", "charge.refunded", charge({ refunded: false, amount_refunded: 500 }));
      t.eq(callsTo(D, "creator_commission_clawback")[0].p_refunded_cents, 500, "5c a partial refund passes what has been refunded so far");
      D = base({ stripeAnswer: { data: [{ invoice: "in_found" }] } });
      await stripeEvent(D, "evt_r3", "charge.refunded", charge({ invoice: undefined }));
      t.eq([callsTo(D, "creator_commission_clawback")[0].p_payment_ref, /invoice_payments\?.*payment_intent.*pi_1/.test(D.db.stripeGets[0] || "")], ["in_found", true], "5d a charge that no longer names its invoice (the newer API): found through its payment intent");
      D = base({ stripeAnswer: { data: [] } });
      await stripeEvent(D, "evt_r4", "charge.refunded", charge({ invoice: undefined }));
      t.eq([callsTo(D, "creator_commission_clawback").length, D.db.alerts.map((a) => a.flag)], [0, ["creator_refund_unmatched"]], "5e no invoice found, for an account with a creator: nothing clawed back, and support hears");
      D = base({ answers: { creator_commission_clawback: { result: "not_found" }, creator_for_payer: false } });
      await stripeEvent(D, "evt_r5", "charge.refunded", charge());
      t.eq(D.db.alerts.length, 0, "5f a refund for an account with no creator: nothing to report");
      D = base({ answers: { creator_commission_clawback: { result: "not_found" }, creator_for_payer: true } });
      await stripeEvent(D, "evt_r6", "charge.refunded", charge());
      t.eq(D.db.alerts.map((a) => a.flag), ["creator_refund_unmatched"], "5g a refund matching no commission, for an account with a creator: support hears");
    }

    // 5b ── STRIPE: A LOST CHARGEBACK, AND ONE THAT TURNS INTO A WIN ─────────────────────────────────────────────────
    {
      const CLOSED = "charge.dispute.closed", BACK = "charge.dispute.funds_reinstated";
      const dispute = (o = {}) => ({ id: "du_1", object: "dispute", charge: "ch_1", payment_intent: "pi_1", amount: 1356, currency: "cad", status: "lost", ...o });
      // Stripe's answers: the dispute as it is now, and its charge.
      const stripe = ({ now = {}, charge = {} } = {}) => (p) => (p.startsWith("/disputes/") ? dispute(now)
        : p.startsWith("/charges/") ? { id: "ch_1", customer: "cus_1", amount: 1356, amount_refunded: 0, invoice: "in_1", payment_intent: "pi_1", ...charge } : { data: [{ invoice: "in_found" }] });
      const base = (o = {}) => makeDb({ stripeAnswer: stripe(), answers: { creator_commission_clawback: { result: "clawback", cents: 240 }, creator_commission_give_back: { result: "nothing" }, creator_for_payer: true }, rows: { subscriptions: [{ user_id: uid(1), provider_customer_id: "cus_1" }], billing_events: [], profiles: [] }, ...o });
      const statusOf = (D, id) => (D.db.rows.billing_events.find((e) => e.event_id === id) || {}).status;
      const won = { now: { status: "won" } };
      let D = base();
      t.eq(await stripeEvent(D, "evt_d1", CLOSED, dispute()), 200, "5h a closed dispute is handled when the program is on");
      t.eq(callsTo(D, "creator_commission_clawback")[0], { p_provider: "stripe", p_payment_ref: "in_1", p_original_ref: null, p_payment_date: null, p_refunded_cents: 1356, p_dispute_ref: "du_1" }, "5i a lost chargeback claws back the commission on the invoice its charge paid, under the dispute's id");
      t.eq([D.db.stripeGets, statusOf(D, "evt_d1"), D.db.alerts.length], [["/disputes/du_1", "/charges/ch_1"], "processed", 0], "5j Stripe is asked how the dispute stands now, then for its charge, which names the invoice; the event is done");
      t.eq(callsTo(D, "founding_seat_release").length, 0, "5k …and a founding seat is left alone: this is about the creator's commission, nothing else");
      for (const status of ["warning_closed", "prevented", "needs_response"]) {
        D = base({ stripeAnswer: stripe({ now: { status } }) });
        t.eq([await stripeEvent(D, `evt_${status}`, CLOSED, dispute({ status })), creatorCalls(D).length, D.db.stripeGets.length, statusOf(D, `evt_${status}`)], [200, 0, 1, "processed"], `5l ${status}: changes nothing`);
      }
      D = base();
      await stripeEvent(D, "evt_d2", CLOSED, dispute());
      await stripeEvent(D, "evt_d2", CLOSED, dispute());
      t.eq(callsTo(D, "creator_commission_clawback").length, 1, "5m the same event again is not worked twice (the database also refuses the same dispute: tests/creators.sql.test.cjs)");
      D = base({ stripeAnswer: stripe({ now: { amount: 500 } }) });
      await stripeEvent(D, "evt_d3", CLOSED, dispute({ amount: 500 }));
      t.eq(callsTo(D, "creator_commission_clawback")[0].p_refunded_cents, 500, "5n a dispute of part of a payment passes its own amount");
      D = base({ stripeAnswer: stripe({ charge: { invoice: undefined } }) });
      await stripeEvent(D, "evt_d4", CLOSED, dispute());
      t.eq([callsTo(D, "creator_commission_clawback")[0].p_payment_ref, /invoice_payments\?.*payment_intent.*pi_1/.test(D.db.stripeGets[2] || "")], ["in_found", true], "5o a charge that no longer names its invoice (the newer API): found through its payment intent");
      D = base({ stripeAnswer: (p) => (p.startsWith("/disputes/") ? dispute() : p.startsWith("/charges/") ? { id: "ch_1", customer: "cus_1", payment_intent: "pi_1" } : { data: [] }) });
      await stripeEvent(D, "evt_d5", CLOSED, dispute());
      t.eq([callsTo(D, "creator_commission_clawback").length, D.db.alerts.map((a) => a.flag)], [0, ["creator_chargeback_unmatched"]], "5p no invoice found, for an account with a creator: nothing clawed back, and support hears");
      D = base({ answers: { creator_commission_clawback: { result: "not_found" }, creator_for_payer: true } });
      await stripeEvent(D, "evt_d6", CLOSED, dispute());
      t.eq([D.db.alerts.map((a) => a.flag), noteOn(D, "evt_d6")], [["creator_chargeback_unmatched"], "flag: creator_chargeback_unmatched"], "5q a chargeback matching no commission, for an account with a creator: support hears, and the event says so");
      D = base({ answers: { creator_commission_clawback: { result: "not_found" }, creator_for_payer: false } });
      await stripeEvent(D, "evt_d7", CLOSED, dispute());
      t.eq(D.db.alerts.length, 0, "5r for an account with no creator: nothing to report");
      D = base({ answers: { creator_commission_clawback: { result: "already" }, creator_for_payer: true } });
      await stripeEvent(D, "evt_d8", CLOSED, dispute());
      t.eq(D.db.alerts.length, 0, "5s already taken: nothing to report");
      D = base({ stripeAnswer: () => { throw new Error("stripe 500"); } });
      t.eq([await stripeEvent(D, "evt_d9", CLOSED, dispute()), statusOf(D, "evt_d9")], [500, "failed"], "5t Stripe can't be read: 500 and marked failed, so Stripe tries again");
      D = base({ answers: { creator_commission_clawback: () => ({ data: null, error: { code: "XX000" } }), creator_for_payer: true } });
      t.eq([await stripeEvent(D, "evt_d10", CLOSED, dispute()), statusOf(D, "evt_d10")], [500, "failed"], "5u the database fails: the same");
      const msg = (await import("node:module")).createRequire(__filename);
      delete require.cache[ALERT_PATH];
      const A = msg(ALERT_PATH).supportAlertMessage({ flag: "creator_chargeback_unmatched", userId: uid(1), provider: "stripe" });
      t.ok(!/\$|\d+\.\d\d|@/.test(A.text) && /lost chargeback/.test(A.text) && A.text.includes(uid(1)), "5v the note says what happened, with the account id, and no amount or address");
      const B = msg(ALERT_PATH).supportAlertMessage({ flag: "creator_chargeback_given_back", userId: uid(1), provider: "stripe" });
      t.ok(!/\$|\d+\.\d\d|@/.test(B.text) && /goes back on the next payout/.test(B.text) && B.text.includes(uid(1)), "5v2 so does the note for one given back");
      delete require.cache[ALERT_PATH];
      // The late win.
      const backNow = (o = {}) => ({ creator_commission_give_back: { result: "given_back", cents: 240, user_id: uid(1), ...o }, creator_commission_clawback: { result: "already" }, creator_for_payer: true });
      for (const [how, type] of [["the dispute closing as won", CLOSED], ["the funds coming back", BACK]]) {
        D = base({ stripeAnswer: stripe(won), answers: backNow() });
        t.eq(await stripeEvent(D, `evt_w_${type}`, type, dispute({ status: "won" })), 200, `5w ${how}: handled`);
        t.eq([callsTo(D, "creator_commission_give_back"), callsTo(D, "creator_commission_clawback").length, D.db.stripeGets], [[{ p_provider: "stripe", p_dispute_ref: "du_1" }], 0, ["/disputes/du_1"]], `5x ${how}: what the dispute took goes back, by its id`);
        t.eq([D.db.alerts, noteOn(D, `evt_w_${type}`)], [[{ flag: "creator_chargeback_given_back", userId: uid(1), provider: "stripe" }], "flag: creator_chargeback_given_back"], `5y ${how}: support hears, and the event says so`);
      }
      let firstAnswer = true;
      D = base({ stripeAnswer: stripe(won), answers: { creator_commission_give_back: () => { const a = firstAnswer ? { result: "given_back", cents: 240, user_id: uid(1) } : { result: "already" }; firstAnswer = false; return { data: a, error: null }; } } });
      await stripeEvent(D, "evt_w1", CLOSED, dispute({ status: "won" }));
      await stripeEvent(D, "evt_w2", BACK, dispute({ status: "won" }));
      t.eq([callsTo(D, "creator_commission_give_back").length, D.db.alerts.length], [2, 1], "5z both events for one late win: the database gives back once, and support hears once");
      D = base({ stripeAnswer: stripe(won) });
      await stripeEvent(D, "evt_w3", CLOSED, dispute({ status: "won" }));
      await stripeEvent(D, "evt_w4", BACK, dispute({ status: "won" }));
      t.eq([callsTo(D, "creator_commission_clawback").length, D.db.alerts.length], [0, 0], "5z2 an ordinary win took nothing: nothing to give back, and nothing to report");
      D = base({ stripeAnswer: stripe(won), answers: backNow() });
      await stripeEvent(D, "evt_w5", CLOSED, dispute({ status: "lost" }));
      t.eq([callsTo(D, "creator_commission_clawback").length, callsTo(D, "creator_commission_give_back").length], [0, 1], "5z3 a delivery still saying lost, on a dispute Stripe now says is won: no clawback, whatever order they arrive in");
      D = base();
      await stripeEvent(D, "evt_w6", BACK, dispute());
      t.eq([creatorCalls(D).length, D.db.alerts.length, statusOf(D, "evt_w6")], [0, 0, "processed"], "5z4 funds back on a dispute still lost (a partially refunded payment): the customer still won, so nothing moves");
      D = base({ stripeAnswer: stripe(won), answers: backNow({ user_id: null }) });
      await stripeEvent(D, "evt_w7", BACK, dispute({ status: "won" }));
      t.eq(D.db.alerts.map((a) => a.userId), ["deleted account"], "5z5 the account has since been deleted: support still hears");
      D = base({ stripeAnswer: stripe(won), answers: { creator_commission_give_back: () => ({ data: null, error: { code: "XX000" } }) } });
      t.eq([await stripeEvent(D, "evt_w8", BACK, dispute({ status: "won" })), statusOf(D, "evt_w8")], [500, "failed"], "5z6 the database fails: 500 and marked failed, so Stripe tries again");
    }

    // 6 ── THE STORES: PROCEEDS ──────────────────────────────────────────────────────────────────────────────────
    {
      const paid = (o) => makeDb({ answers: { creator_for_payer: true, creator_commission_record: { result: "recorded", commission_cents: 1 } }, ...o });
      const L = require(LIB_PATH);
      t.eq(L.storeProceedsCents({ price_in_purchased_currency: 11.99, tax_percentage: 0.1304, commission_percentage: 0.1304 }), 886, "6a proceeds: the price less the store's estimates of tax and its fee, in cents");
      t.eq(L.storeProceedsCents({ price_in_purchased_currency: 79.99, tax_percentage: 0.13, commission_percentage: 0.15 }), 5759, "6b the founding annual at a 15% fee");
      t.eq([L.storeProceedsCents({ price_in_purchased_currency: 79.99, tax_percentage: 0, commission_percentage: 0.15 }), L.storeProceedsCents({ price_in_purchased_currency: 79.99, tax_percentage: 0, commission_percentage: 0.3 })], [6799, 5599], "6b2 the fee is whatever the event says it is, with nothing of our own: the Small Business Program's 15%, or 30%");
      let D = paid();
      await rcEvent(D, storeEvt());
      t.eq(callsTo(D, "creator_commission_record")[0], { p_user: uid(1), p_provider: "app_store", p_payment_ref: "txn_1", p_original_ref: "orig_1", p_payment_date: new Date(NOW - 60000).toISOString(), p_base_cents: 886, p_gross_cents: 1199, p_currency: "CAD" },
        "6c App Store: the base is proceeds after the store's fee, not the price");
      D = paid();
      await rcEvent(D, storeEvt({ store: "PLAY_STORE", product_id: "flourish_plus:annual", type: "INITIAL_PURCHASE", transaction_id: "GPA.1", price_in_purchased_currency: 99.99, tax_percentage: 0.13, commission_percentage: 0.15 }));
      t.eq([callsTo(D, "creator_commission_record")[0].p_provider, callsTo(D, "creator_commission_record")[0].p_base_cents], ["play_store", 7199], "6d Google Play: the same");
      for (const [label, o] of [["no tax figure", { tax_percentage: null }], ["no store fee figure", { commission_percentage: null }], ["no price", { price_in_purchased_currency: null }], ["figures that make no sense", { tax_percentage: 0.6, commission_percentage: 0.5 }]]) {
        D = paid();
        await rcEvent(D, storeEvt(o));
        t.eq([callsTo(D, "creator_commission_record").length, D.db.alerts.map((a) => a.flag)], [0, ["creator_amounts_unknown"]], `6e ${label}: no commission, never a guess, and a note for support`);
      }
      D = paid();
      await rcEvent(D, storeEvt({ tax_percentage: null }));
      t.ok(/creator_amounts_unknown/.test(noteOn(D, "rc:rc-txn_1")), "6f …written on the event's own record too");
      t.eq(callsTo(D, "creator_first_payment_seen")[0], { p_user: uid(1), p_when: new Date(NOW - 60000).toISOString() }, "6f2 …and the 12 months still start");
      D = paid();
      await rcEvent(D, storeEvt({ environment: "SANDBOX" }));
      t.eq([callsTo(D, "creator_commission_record").length, D.db.alerts.length, creatorCalls(D).length], [0, 0, 0], "6g a sandbox purchase earns nothing, and nothing is even asked");
      process.env.IAP_ACCEPT_SANDBOX = "true";
      D = paid();
      await rcEvent(D, storeEvt({ environment: "SANDBOX" }));
      delete process.env.IAP_ACCEPT_SANDBOX;
      t.eq(creatorCalls(D).length, 0, "6h …even with IAP_ACCEPT_SANDBOX on, which is about access");
      D = paid();
      await rcEvent(D, storeEvt({ is_family_share: true }));
      t.eq(creatorCalls(D).length, 0, "6i a Family Sharing purchase earns nothing");
      D = paid();
      await rcEvent(D, storeEvt({ price_in_purchased_currency: 0, period_type: "TRIAL" }));
      t.eq([callsTo(D, "creator_commission_record").length, D.db.alerts.length], [0, 0], "6j a price of nothing is no payment");
      D = paid();
      await rcEvent(D, storeEvt({ store: "PROMOTIONAL" }));
      t.eq(creatorCalls(D).length, 0, "6k anything that is not a store purchase earns nothing");
      D = paid();
      await rcEvent(D, storeEvt({ type: "EXPIRATION" }));
      t.eq(creatorCalls(D).length, 0, "6l an event that is no payment and no refund: nothing");
      D = paid();
      await rcEvent(D, storeEvt({ product_id: "someone.elses.product" }));
      t.eq([callsTo(D, "creator_commission_record").length, D.db.alerts.map((a) => a.flag)], [0, ["creator_amounts_unknown"]], "6m a product that isn't ours: nothing recorded, support hears");
      D = makeDb({ answers: { creator_for_payer: false } });
      await rcEvent(D, storeEvt({ tax_percentage: null }));
      t.eq(D.db.alerts.length, 0, "6n an account with no creator: nothing to report, whatever the figures");
      D = paid({ answers: { creator_for_payer: () => ({ data: null, error: { code: "XX000" } }) } });
      t.eq(await rcEvent(D, storeEvt()), 500, "6o the database fails: 500, so RevenueCat tries again (the sync it repeats changes nothing)");
      const msg = (await import("node:module")).createRequire(__filename);
      delete require.cache[ALERT_PATH];
      const A = msg(ALERT_PATH).supportAlertMessage({ flag: "creator_amounts_unknown", userId: uid(1), provider: "app_store" });
      t.ok(!/\$|\d+\.\d\d|@/.test(A.text) && /no commission was recorded/.test(A.text) && A.text.includes(uid(1)), "6p the note says what happened, with the account id, and no amount or address");
      delete require.cache[ALERT_PATH];
    }

    // 7 ── STORE REFUNDS ─────────────────────────────────────────────────────────────────────────────────────────
    {
      const refunded = (o = {}) => storeEvt({ type: "CANCELLATION", cancel_reason: "CUSTOMER_SUPPORT", price_in_purchased_currency: -11.99, ...o });
      const base = (o = {}) => makeDb({ answers: { creator_for_payer: true, creator_commission_clawback: { result: "clawback", cents: 177 } }, ...o });
      let D = base();
      await rcEvent(D, refunded());
      t.eq(callsTo(D, "creator_commission_clawback")[0], { p_provider: "app_store", p_payment_ref: "txn_1", p_original_ref: "orig_1", p_payment_date: new Date(NOW - 60000).toISOString(), p_refunded_cents: 1199 }, "7a a store refund claws back the commission on that transaction, by its id, then its original and date");
      D = base();
      await rcEvent(D, storeEvt({ type: "CANCELLATION", cancel_reason: "UNSUBSCRIBE", price_in_purchased_currency: 0 }));
      t.eq(callsTo(D, "creator_commission_clawback").length, 0, "7b someone cancelling is no refund");
      D = base();
      await rcEvent(D, refunded({ environment: "SANDBOX" }));
      t.eq(creatorCalls(D).length, 0, "7c a sandbox refund: nothing");
      D = base({ answers: { creator_for_payer: true, creator_commission_clawback: { result: "not_found" } } });
      await rcEvent(D, refunded());
      t.eq(D.db.alerts.map((a) => a.flag), ["creator_refund_unmatched"], "7d a refund matching no commission, for an account with a creator: nothing guessed, and support hears");
      D = base({ answers: { creator_for_payer: false, creator_commission_clawback: { result: "clawback", cents: 1 } } });
      await rcEvent(D, refunded());
      t.eq(callsTo(D, "creator_commission_clawback").length, 1, "7e an account with no creator now can still have a commission from before: it is still clawed back");
      D = base({ answers: { creator_for_payer: false, creator_commission_clawback: { result: "not_found" } } });
      await rcEvent(D, refunded());
      t.eq(D.db.alerts.length, 0, "7f …and with none, there is nothing to report");
      D = base();
      await rcEvent(D, storeEvt({ type: "REFUND_REVERSED" }));
      t.eq([callsTo(D, "creator_commission_clawback").length, D.db.alerts.map((a) => a.flag)], [0, ["creator_refund_reversed"]], "7g a refund the store took back: a person looks, nothing moves on its own");
    }

    // 8 ── THE SWEEP ─────────────────────────────────────────────────────────────────────────────────────────────
    {
      const D = makeDb({ answers: { creator_commissions_mature: 3 } });
      const r = await withStubs(D, null, () => require(SWEEP_PATH).handler({}, {}, { admin: D.admin }));
      t.eq([JSON.parse(r.body).matured, callsTo(D, "creator_commissions_mature").length], [3, 1], "8a on: pending becomes payable, daily");
      const E = makeDb({ answers: { creator_commissions_mature: () => ({ data: null, error: { code: "XX000" } }) } });
      const f = await withStubs(E, null, () => require(SWEEP_PATH).handler({}, {}, { admin: E.admin }));
      t.eq(f.statusCode, 500, "8b a failure says so");
      t.ok(/\[functions\."creator-commissions-sweep"\]\s*\n\s*schedule = "@daily"/.test(read("netlify.toml")) && /from\s+= "\/api\/creator"/.test(read("netlify.toml")), "8c it is scheduled, and /api/creator is routed");
    }

    // 9 ── THE WORDS ─────────────────────────────────────────────────────────────────────────────────────────────
    {
      const W = await import("../src/lib/creatorWords.js");
      const PW = require("./_pendingWords.cjs");
      const doc = read("docs", "product", "CREATOR-PROGRAM-WORDS.md");
      const rows = [...doc.matchAll(/^\| `(creator-[a-z0-9-]+)` \| ([^|]+) \| ([^|]+) \| ([^|]+) \| (\d+) \|$/gm)];
      const { errors } = W.CREATOR_WORDS;
      const inCode = {
        "creator-signup-label": W.CREATOR_WORDS.signupLabel, "creator-signup-hint": W.CREATOR_WORDS.signupHint,
        "creator-settings-title": W.CREATOR_WORDS.settingsTitle, "creator-settings-body": W.CREATOR_WORDS.settingsBody,
        "creator-settings-button": W.CREATOR_WORDS.settingsButton, "creator-settings-added": W.CREATOR_WORDS.settingsAdded,
        "creator-code-invalid": errors.creator_code_invalid, "creator-code-closed": errors.creator_code_closed, "creator-code-unavailable": errors.creator_code_unavailable,
      };
      t.eq(rows.map((r) => r[1]).sort(), Object.keys(inCode).sort(), "9a the list and the code name the same ids, each once");
      t.eq(rows.length, 9, "9b nine lines");
      t.eq(rows.filter((r) => r[4].trim() !== inCode[r[1]]).map((r) => r[1]), [], "9c each line in the code is the doc's approved line, word for word");
      t.eq(rows.filter((r) => r[4].trim().length > Number(r[5])).map((r) => r[1]), [], "9d each line is within its limit");
      t.eq(rows.filter((r) => !(r[2].trim().length >= 10 && r[3].trim().length >= 10 && Number(r[5]) > 0)).map((r) => r[1]), [], "9e each row says where it shows, its facts and its limit");
      t.eq(Object.values(inCode).filter((w) => /[—$]|discount/i.test(w)), [], "9e2 the house rules: no em dash, no price, no \"discount\"");
      t.eq([PW.pendingCreatorWordIds(), PW.placeholders(`${read("src", "lib", "creatorWords.js")} ${doc}`)], [[], []], "9f no placeholder is left in the words file or the doc, so the exception covers nothing");
      t.eq([W.creatorErrorLine("creator_code_invalid"), W.creatorErrorLine("creator_code_closed"), W.creatorErrorLine("email_exists")], [errors.creator_code_invalid, errors.creator_code_closed, null], "9g a server's code finds its line; anything else is not this module's");
      t.eq([PW.strayPlaceholders("[WORDS: trial-link]", "src/lib/creatorWords.js"), PW.strayPlaceholders("[WORDS: creator-signup-label]", "src/App.jsx"), PW.strayPlaceholders("[WORDS: creator-signup-label]", "src/lib/creatorWords.js")],
        [["trial-link"], ["creator-signup-label"], ["creator-signup-label"]], "9h a placeholder now fails everywhere, this id in the words file too");
      let guard = 0;
      try { execFileSync(process.execPath, [path.join(REPO, "scripts", "check-pending-words.mjs"), path.join(REPO, "src", "lib", "creatorWords.js")], { stdio: "pipe" }); } catch (e) { guard = e.status; }
      t.eq(guard, 0, "9i the production build's guard passes the words file");
      const app = read("src", "App.jsx");
      t.eq([PW.placeholders(app), Object.values(inCode).filter((w) => app.includes(w))], [[], []], "9j none is written into App.jsx: the lines come from the words file");
    }

    // 10 ── THE CODE ON A COMPUTER ───────────────────────────────────────────────────────────────────────────────
    {
      const C = await import("../src/lib/creatorCode.js");
      const fakeWin = (href) => {
        const store = new Map(); let replaced = null;
        return { location: { href }, history: { state: null, replaceState: (_s, _t, u) => { replaced = u; } }, sessionStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) }, replaced: () => replaced };
      };
      t.eq([C.creatorCodeInput("ab-c 12"), C.creatorCodeInput("x".repeat(30)).length], ["ABC12", 20], "10a what is typed becomes capitals, letters and digits, at most 20");
      t.eq([C.creatorCodeFromSearch("?c=alice"), C.creatorCodeFromSearch("?c=a"), C.creatorCodeFromSearch("?c=<script>"), C.creatorCodeFromSearch("")], ["ALICE", null, null, null], "10b only something that could be a code is taken");
      let w = fakeWin("https://flourishmoney.app/?c=alice&src=x");
      t.eq([C.captureCreatorCode(w), w.replaced(), C.recallCreatorCode(w)], ["ALICE", "https://flourishmoney.app/?src=x", "ALICE"], "10c the form starts with it, it leaves the address, and everything else stays");
      w = fakeWin("https://flourishmoney.app/?checkout=founding&c=BEN");
      t.eq([C.captureCreatorCode(w), w.replaced()], ["BEN", "https://flourishmoney.app/?checkout=founding"], "10d the founding link keeps working beside it");
      w = fakeWin("https://flourishmoney.app/?c=%3Cscript%3E");
      t.eq([C.captureCreatorCode(w), w.replaced()], ["", "https://flourishmoney.app/"], "10e rubbish leaves the address too, and fills in nothing");
      w = fakeWin("https://flourishmoney.app/");
      w.sessionStorage.setItem("flourish_creator_code", "ALICE");
      t.eq(C.captureCreatorCode(w), "ALICE", "10f remembered for this tab while the person finds the form");
      C.forgetCreatorCode(w);
      t.eq(C.captureCreatorCode(w), "", "10g forgotten once the account is made");
    }
  } catch (e) {
    t.ok(false, "the suite ran to the end: " + String((e && e.stack) || e).split("\n").slice(0, 4).join(" | "));
  } finally {
    global.fetch = realFetch;
    console.error = quiet.e; console.log = quiet.l; console.warn = quiet.w;
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  }
  t.summary("creators.test");
})();
