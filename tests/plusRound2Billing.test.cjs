// tests/plusRound2Billing.test.cjs
// -----------------------------------------------------------------------------
// THE PLUS ADD-ON'S MONEY PATHS, ROUND 2 (2026-11-22: ChatGPT, Grok and Gemini on plus-1.1.8 at 05fb6a7).
// The stand-ins are those of tests/plusReviewBilling.test.cjs (a database that can interleave two writers, and Stripe
// as the handlers see it), with two additions: Stripe remembers what was posted and makes a NEW customer each time.
//   N1  two website Plus subscriptions: when the one on the row ends, the other one the buyer pays for becomes the row
//       (and a refund of the EXTRA one never ends the one that is left)
//   N2  the buyer's one Stripe customer is always reused, whatever provider the Plus row says now
//   H4/H5, B2/B3, H9, Grok's low: what was "partly", shown or fixed
// -----------------------------------------------------------------------------
"use strict";
const fs = require("fs");
const path = require("path");
const { create } = require("./_runner.cjs");
const { signPayload } = require("../netlify/functions/_lib/stripeSignature.js");

const AUTH_PATH = require.resolve("../netlify/functions/_lib/auth.js");
const API_PATH = require.resolve("../netlify/functions/_lib/stripeApi.js");
const ALERT_PATH = require.resolve("../netlify/functions/_lib/supportAlert.js");
const PLUS_PATH = require.resolve("../netlify/functions/_lib/plusAddon.js");
const STORE_PATH = require.resolve("../netlify/functions/_lib/storeSubscriptions.js");
const HOOK_PATH = require.resolve("../netlify/functions/stripe-webhook.js");
const BILLING_PATH = require.resolve("../netlify/functions/billing.js");
const REPO = path.join(__dirname, "..");
const U = "11111111-1111-4111-8111-111111111111";
const P = "22222222-2222-4222-8222-222222222222";
const DAY = 86400;
const T = "plus_addon_subscriptions";

// A stand-in for the service-role client: rows in memory, the filters the code uses (eq, is), writes applied when
// awaited, and one hook (state.beforeWrite) that runs just before a write lands, so a second writer can go first.
function makeDb() {
  const state = { rows: { [T]: [], billing_events: [], household_members: [], plus_purchase_attempts: [] }, beforeWrite: null, rpcs: [] };
  const keyOf = (table) => (table === "billing_events" ? "event_id" : "user_id");
  const from = (table) => {
    const rows = () => (state.rows[table] = state.rows[table] || []);
    const hook = async (op, payload) => { const h = state.beforeWrite; if (h) await h(table, op, payload); };
    const filtered = (f) => rows().filter((r) => f.every((x) => x(r)));
    const reader = (f = []) => {
      const q = {
        select() { return q; }, not() { return q; }, order() { return q; }, limit() { return q; },
        eq(c, v) { f.push((r) => r[c] === v); return q; },
        in(c, vs) { f.push((r) => vs.includes(r[c])); return q; },
        is(c, v) { f.push((r) => (r[c] === undefined ? null : r[c]) === v); return q; },
        async maybeSingle() { const h = filtered(f); return { data: h[0] ? { ...h[0] } : null, error: null }; },
        async single() { const h = filtered(f); return h[0] ? { data: { ...h[0] }, error: null } : { data: null, error: { message: "none" } }; },
        then(res, rej) { return Promise.resolve({ data: filtered(f).map((r) => ({ ...r })), error: null }).then(res, rej); },
      };
      return q;
    };
    const writer = (run) => {
      const f = []; let done = null;
      const go = () => (done = done || run(f));
      const w = {
        eq(c, v) { f.push((r) => r[c] === v); return w; },
        is(c, v) { f.push((r) => (r[c] === undefined ? null : r[c]) === v); return w; },
        in(c, vs) { f.push((r) => vs.includes(r[c])); return w; },
        select() { return go().then((data) => ({ data, error: null })); },
        then(res, rej) { return go().then((data) => ({ data, error: null })).then(res, rej); },
      };
      return w;
    };
    return {
      ...reader(),
      insert(row) {
        return writer(async () => { await hook("insert", row); const k = keyOf(table); if (rows().some((r) => r[k] === row[k])) return []; rows().push({ ...row }); return [{ ...row }]; });
      },
      upsert(row, opts = {}) {
        return writer(async () => {
          await hook("upsert", row);
          const k = (opts.onConflict || keyOf(table)).split(",")[0]; const i = rows().findIndex((r) => r[k] === row[k]);
          if (i >= 0) { if (opts.ignoreDuplicates) return []; rows()[i] = { ...rows()[i], ...row }; return [{ ...rows()[i] }]; }
          rows().push({ ...row }); return [{ ...row }];
        });
      },
      update(p) {
        return writer(async (f) => { await hook("update", p); const hit = rows().filter((r) => f.every((x) => x(r))); hit.forEach((r) => Object.assign(r, p)); return hit.map((r) => ({ ...r })); });
      },
      delete() {
        return writer(async (f) => { await hook("delete", null); const hit = rows().filter((r) => f.every((x) => x(r))); state.rows[table] = rows().filter((r) => !hit.includes(r)); return hit; });
      },
    };
  };
  const admin = {
    from,
    // plus_purchase_attempt_begin as migration 0052 answers it (the real one is held in tests/plusPurchaseHold.sql.test.cjs).
    rpc: async (fn, a = {}) => {
      state.rpcs.push([fn, a]);
      if (fn === "plus_purchase_attempt_begin") {
        const at = state.rows.plus_purchase_attempts;
        const hh = (u) => (state.rows.household_members.find((m) => m.user_id === u) || {}).household_id || null;
        const mine = at.find((r) => r.user_id === a.p_user);
        if (mine && !(mine.provider === "stripe" && a.p_provider === "stripe")) return { data: { result: "held_elsewhere", mine: true }, error: null };
        const other = at.find((r) => r.user_id !== a.p_user && hh(a.p_user) && hh(r.user_id) === hh(a.p_user));
        if (other) return { data: { result: "held_elsewhere", mine: false }, error: null };
        state.rows.plus_purchase_attempts = at.filter((r) => r.user_id !== a.p_user).concat({ user_id: a.p_user, provider: a.p_provider, attempt_id: a.p_attempt });
        return { data: { result: "held" }, error: null };
      }
      return { data: null, error: null };
    },
    auth: { admin: { getUserById: async () => ({ data: { user: { email: "x@example.invalid", email_confirmed_at: "2026-10-01T00:00:00Z" } } }) } },
  };
  return { state, admin };
}

// Stripe as the handlers see it: the subscriptions it holds now (the truth), and every call made.
function makeStripe() {
  const stripe = { subs: [], charges: [], invoices: [], fail: {}, posts: [], made: 0 }; const log = [];
  const get = async (p) => {
    log.push(`GET ${p}`);
    if (stripe.fail.list && p.startsWith("/subscriptions?")) { const e = new Error("stripe is down"); e.statusCode = 503; throw e; }
    if (p.startsWith("/billing_portal/configurations")) return { data: [] };
    if (p.startsWith("/invoices/")) return stripe.invoices.find((i) => i.id === decodeURIComponent(p.split("/").pop())) || {};
    if (p.startsWith("/subscriptions?")) { const cus = decodeURIComponent((/customer=([^&]+)/.exec(p) || [])[1] || ""); return { data: stripe.subs.filter((s) => s.customer === cus) }; }
    if (p.startsWith("/checkout/sessions?")) return { data: [] };
    if (p.startsWith("/charges/")) return stripe.charges.find((c) => c.id === decodeURIComponent(p.split("/").pop())) || {};
    const s = stripe.subs.find((x) => x.id === decodeURIComponent(p.split("/").pop()));
    if (!s) { const e = new Error("no such subscription"); e.statusCode = 404; throw e; }
    return JSON.parse(JSON.stringify(s));
  };
  const post = async (p, body) => {
    log.push(`POST ${p}`); stripe.posts.push({ p, body });
    if (p === "/customers") return { id: `cus_NEW${++stripe.made}` };
    if (p === "/billing_portal/configurations") return { id: "bpc_plus", active: true, is_default: false, metadata: body.metadata, features: body.features };
    if (p === "/billing_portal/sessions") return { id: "bps_1", url: "https://stripe.test/portal", customer: body.customer };
    if (p === "/checkout/sessions") { if (stripe.fail.checkout) { const e = new Error("stripe said no"); e.statusCode = 500; throw e; } return { id: "cs_plus", url: "https://stripe.test/pay" }; }
    const m = /^\/subscriptions\/([^/]+)$/.exec(p);
    if (m) { const s = stripe.subs.find((x) => x.id === decodeURIComponent(m[1])); if (s) { if ("cancel_at_period_end" in body) s.cancel_at_period_end = body.cancel_at_period_end; s.metadata = { ...s.metadata, ...(body.metadata || {}) }; } return s || {}; }
    return {};
  };
  const del = async (p) => { log.push(`DELETE ${p}`); const s = stripe.subs.find((x) => x.id === decodeURIComponent(p.split("/").pop())); if (s) s.status = "canceled"; return { id: s && s.id, status: "canceled" }; };
  return { stripe, log, exports: { stripeGet: get, stripePost: post, stripeDelete: del, formEncode: () => "", STRIPE_BASE: "https://stripe.test" } };
}

function loadWith(db, sm, alerts, user = U) {
  for (const p of [AUTH_PATH, API_PATH, ALERT_PATH, PLUS_PATH, STORE_PATH, HOOK_PATH, BILLING_PATH]) delete require.cache[p];
  for (const k of Object.keys(require.cache)) if (/netlify\/functions\/(_lib\/)?(household|gifts|creators|funnel|foundingSeats|stripeLive|bankLimits)\.js$/.test(k)) delete require.cache[k];
  const real = require(AUTH_PATH);
  require.cache[AUTH_PATH].exports = { ...real, getAdminClient: () => db.admin, getUserFromRequest: async () => ({ user_id: user, error: null }) };
  require.cache[API_PATH] = { id: API_PATH, filename: API_PATH, loaded: true, exports: sm.exports };
  require.cache[ALERT_PATH] = { id: ALERT_PATH, filename: ALERT_PATH, loaded: true, exports: { alertSupport: async (a) => { alerts.push(a); return true; }, supportAlertMessage: () => ({}), DEFAULT_TO: "x" } };
  return { hook: require(HOOK_PATH), billing: require(BILLING_PATH), plus: require(PLUS_PATH) };
}

(async () => {
  const t = create();
  const saved = { ...process.env };
  const quiet = { e: console.error, w: console.warn, l: console.log }; console.error = () => {}; console.warn = () => {}; console.log = () => {};
  const realFetch = global.fetch;
  for (const k of Object.keys(process.env)) if (/^STRIPE_PRICE_|^PLUS_ENABLED$|^PLUS_TESTER_USER_IDS$|^IAP_ENABLED$|^HOUSEHOLD_ENABLED$|^CREATORS_ENABLED$|^GIFTS_ENABLED$/.test(k)) delete process.env[k];
  Object.assign(process.env, {
    STRIPE_WEBHOOK_SECRET: "whsec_test", BILLING_ENABLED: "true", STRIPE_SECRET_KEY: "sk_test_mock_never_sent", PLUS_ENABLED: "true",
    STRIPE_PRICE_MONTHLY_CAD: "price_m", STRIPE_PRICE_ANNUAL_CAD: "price_a", STRIPE_PRICE_FOUNDING_ANNUAL_CAD: "price_f",
    STRIPE_PRICE_PLUS_MONTHLY_CAD: "price_pm", STRIPE_PRICE_PLUS_ANNUAL_CAD: "price_pa", REVENUECAT_SECRET_KEY: "rc_test_never_sent",
  });
  const now = Math.floor(Date.now() / 1000);
  const iso = (s) => new Date(s * 1000).toISOString();
  const future = iso(now + 20 * DAY);
  let n = 0;
  const send = async (hook, type, object, created) => {
    const evt = { id: `evt_${++n}`, type, created, data: { object } }; const raw = JSON.stringify(evt);
    const r = await hook.handler({ httpMethod: "POST", body: raw, headers: { "stripe-signature": signPayload(raw, "whsec_test", now) } });
    return { status: r.statusCode, body: JSON.parse(r.body) };
  };
  const call = async (billing, body) => {
    const r = await billing.handler({ httpMethod: "POST", headers: { origin: "https://flourishmoney.app", authorization: "Bearer x" }, body: JSON.stringify(body) });
    let b = null; try { b = JSON.parse(r.body); } catch { b = null; }
    return { status: r.statusCode, body: b };
  };
  const webSub = (id, status = "active", o = {}) => ({ id, object: "subscription", customer: "cus_P", status, cancel_at_period_end: false, metadata: { user_id: U, plan_key: "plus_monthly", kind: "plus_addon" },
    items: { data: [{ price: { id: "price_pm" }, current_period_end: now + 30 * DAY, current_period_start: now - 2 * DAY }] }, current_period_end: now + 30 * DAY, current_period_start: now - 2 * DAY, ...o });
  const webRow = (id, status = "active", o = {}) => ({ user_id: U, provider: "stripe", plan_key: "plus_monthly", status, product_id: "price_pm", provider_subscription_id: id, provider_customer_id: "cus_P",
    current_period_end: future, cancel_at_period_end: false, last_event_at: iso(now - 9000), updated_at: iso(now - 9000), ...o });
  const storeRow = (o = {}) => ({ user_id: U, provider: "app_store", plan_key: "plus_monthly", status: "active", product_id: "app.flourishmoney.plusaddon.monthly", provider_subscription_id: null,
    current_period_end: future, cancel_at_period_end: false, last_event_at: iso(now - 9000), updated_at: iso(now - 9000), ...o });
  const rcSub = (o = {}, ent = {}) => ({
    entitlements: { plus_addon: { expires_date: future, product_identifier: "app.flourishmoney.plusaddon.monthly", ...ent } },
    subscriptions: { "app.flourishmoney.plusaddon.monthly": { store: "app_store", expires_date: future, is_sandbox: false, ...o } },
  });
  const none = { entitlements: {}, subscriptions: {} };
  const rowOf = (db, user = U) => db.state.rows[T].find((r) => r.user_id === user) || null;

  try {

    const extraMeta = { user_id: U, plan_key: "plus_monthly", kind: "plus_addon", flourish_plus_extra: "1" };
    const posted = (sm, path) => sm.stripe.posts.filter((x) => x.p === path);

    // ── N1. A recorded; B bought and set to end as the extra; A ends early while B is paid ─────────────────
    {
      const db = makeDb(), sm = makeStripe(), alerts = []; const B = loadWith(db, sm, alerts);
      // Step 1: A is the row.
      db.state.rows[T].push(webRow("sub_A", "active", { last_event_at: iso(now - 9000) }));
      sm.stripe.subs.push(webSub("sub_A", "active"), webSub("sub_B", "active", { current_period_start: now - 3600, items: { data: [{ price: { id: "price_pm" }, current_period_end: now + 30 * DAY, current_period_start: now - 3600 }] } }));
      // Step 2: B is bought. It is the extra one: set to end at its period end, support told, the row stays A's.
      const second = await send(B.hook, "customer.subscription.created", sm.stripe.subs[1], now - 3000);
      t.eq([second.body.conflict, rowOf(db).provider_subscription_id, sm.stripe.subs[1].cancel_at_period_end, sm.stripe.subs[1].metadata.flourish_plus_extra, alerts.length],
        [true, "sub_A", true, "1", 1], "N1a (as before) a second website Plus: the row stays the first one's, the second is set to end at its period end, support is told");
      // Step 3: A is cancelled early (the portal's "cancel now", or support). B is still paid for.
      sm.stripe.subs[0].status = "canceled";
      const ended = await send(B.hook, "customer.subscription.deleted", webSub("sub_A", "canceled"), now - 2000);
      const row = rowOf(db);
      t.eq([ended.status, row.provider, row.provider_subscription_id, row.status, B.plus.isLivePlusRow(row)], [200, "stripe", "sub_B", "active", true],
        "N1b the first one ends while the second is paid: the second becomes the row at once, and the payer keeps Plus (was: the row said canceled, and nothing ever promoted B)");
      const ent = await B.plus.getPlusEntitlement(db.admin, U);
      t.eq([ent.plus, ent.provider], [true, "stripe"], "N1c …the household's Plus answer is yes");
      t.eq([sm.stripe.subs[1].cancel_at_period_end, sm.stripe.subs[1].metadata.flourish_plus_extra, row.cancel_at_period_end], [false, "", false],
        "N1d …and it is no longer set to end: it is the buyer's only Plus now (the same as when a store Plus ends beside a website one)");
      t.eq(row.provider_customer_id, "cus_P", "N1e the Stripe customer is kept");
      // Step 4: B's own later events are now events for the row's subscription.
      // (Stripe dates an event to the second; these come after the promotion, so they are dated after it.)
      const after = () => Math.floor(Date.now() / 1000) + 5;
      sm.stripe.subs[1].cancel_at_period_end = true;                                  // the buyer sets it to end, in the portal
      const later = await send(B.hook, "customer.subscription.updated", sm.stripe.subs[1], after());
      t.eq([later.status, later.body.ignored, later.body.conflict, later.body.stale, rowOf(db).provider_subscription_id, rowOf(db).cancel_at_period_end, B.plus.isLivePlusRow(rowOf(db))],
        [200, undefined, undefined, undefined, "sub_B", true, true],
        "N1f B's next event is applied to the row, not set aside as another subscription's");
      // An event for B made BEFORE the promotion, arriving late, changes nothing (the row was read from Stripe after it).
      const old = await send(B.hook, "customer.subscription.updated", webSub("sub_B", "past_due"), now - 2500);
      t.eq([old.body.stale, rowOf(db).status], [true, "active"], "N1g a late event for B from before it became the row is older than the row and changes nothing");
      // A's own old event ("active", from before it was cancelled) arrives late, now that the row is B's.
      const postsBefore = sm.stripe.posts.length, alertsBefore = alerts.length;
      const lateA = await send(B.hook, "customer.subscription.updated", webSub("sub_A", "active"), now - 2600);
      t.eq([lateA.status, lateA.body.ignored, rowOf(db).provider_subscription_id, sm.stripe.posts.length - postsBefore, alerts.length - alertsBefore], [200, true, "sub_B", 0, 0],
        "N1g2 an old \"active\" event for the ended subscription arriving late is no second purchase: Stripe is asked what it is now, nothing is posted, nobody is told, the row stays");
      // Step 5: B ends too. Nothing live is left: Plus ends. Nobody keeps Plus that no subscription pays for.
      sm.stripe.subs[1].status = "canceled";
      const gone = await send(B.hook, "customer.subscription.deleted", webSub("sub_B", "canceled"), after() + 5);
      t.eq([gone.status, rowOf(db).status, B.plus.isLivePlusRow(rowOf(db)), (await B.plus.getPlusEntitlement(db.admin, U)).plus], [200, "canceled", false, false],
        "N1h when the last one ends too, Plus ends");
    }
    {
      // Nothing else is live: the cancellation stands exactly as before.
      const db = makeDb(), sm = makeStripe(), alerts = []; const B = loadWith(db, sm, alerts);
      db.state.rows[T].push(webRow("sub_A", "active", { last_event_at: iso(now - 9000) }));
      sm.stripe.subs.push(webSub("sub_A", "canceled"), webSub("sub_old", "canceled"), { ...webSub("sub_other", "active"), items: { data: [{ price: { id: "price_m" }, current_period_end: now + 30 * DAY }] } });
      const ended = await send(B.hook, "customer.subscription.deleted", webSub("sub_A", "canceled"), now - 2000);
      t.eq([ended.status, rowOf(db).provider_subscription_id, rowOf(db).status, B.plus.isLivePlusRow(rowOf(db))], [200, "sub_A", "canceled", false],
        "N1i the only Plus ends, and the customer's other subscriptions are an ended Plus and one that is not a Plus price: nothing is promoted, Plus ends");
      t.eq(posted(sm, "/subscriptions/sub_other").length + posted(sm, "/subscriptions/sub_old").length, 0, "N1j …and no other subscription is touched");
      // Stripe cannot be asked what else the buyer pays for: the event is not acknowledged, so Stripe sends it again.
      const db2 = makeDb(), sm2 = makeStripe(); const B2 = loadWith(db2, sm2, alerts);
      db2.state.rows[T].push(webRow("sub_A", "active", { last_event_at: iso(now - 9000) }));
      sm2.stripe.subs.push(webSub("sub_A", "canceled"), webSub("sub_B", "active", { cancel_at_period_end: true, metadata: extraMeta }));
      sm2.stripe.fail.list = true;
      const down = await send(B2.hook, "customer.subscription.deleted", webSub("sub_A", "canceled"), now - 2000);
      t.ok(down.status >= 500, "N1k Stripe cannot say what else the buyer pays for: the event fails and is sent again (never \"Plus ended\" on a guess)");
      sm2.stripe.fail.list = false;
      const retry = await send(B2.hook, "customer.subscription.deleted", webSub("sub_A", "canceled"), now - 2000);
      t.eq([retry.status, rowOf(db2).provider_subscription_id, B2.plus.isLivePlusRow(rowOf(db2))], [200, "sub_B", true], "N1l …and the retry promotes B");
    }
    {
      // An event for B dated the SAME second as the promotion cannot be ordered against it: Stripe is asked what is true.
      const db = makeDb(), sm = makeStripe(), alerts = []; const B = loadWith(db, sm, alerts);
      db.state.rows[T].push(webRow("sub_A", "active", { last_event_at: iso(now - 9000) }));
      sm.stripe.subs.push(webSub("sub_A", "canceled"), webSub("sub_B", "active", { cancel_at_period_end: true, metadata: extraMeta }));
      await send(B.hook, "customer.subscription.deleted", webSub("sub_A", "canceled"), now - 2000);
      const at = Math.floor(Date.parse(rowOf(db).last_event_at) / 1000);
      t.eq(Date.parse(rowOf(db).last_event_at) % 1000, 0, "N1s the promoted row is dated to the whole second, as Stripe dates its events");
      sm.stripe.subs[1].status = "canceled";                                           // B is cancelled within that same second
      const same = await send(B.hook, "customer.subscription.updated", webSub("sub_B", "active"), at);   // …and an older snapshot of it arrives, dated that second
      t.eq([same.status, same.body.stale, rowOf(db).status, B.plus.isLivePlusRow(rowOf(db))], [200, undefined, "canceled", false],
        "N1t an event for B from the very second it became the row is not thrown away as older: Stripe is asked, and what Stripe says now is written");
    }
    {
      // The same when the row's subscription stops being live without being deleted (unpaid).
      const db = makeDb(), sm = makeStripe(), alerts = []; const B = loadWith(db, sm, alerts);
      db.state.rows[T].push(webRow("sub_A", "active", { last_event_at: iso(now - 9000) }));
      sm.stripe.subs.push(webSub("sub_A", "unpaid"), webSub("sub_B", "active", { cancel_at_period_end: true, metadata: extraMeta }));
      const r = await send(B.hook, "customer.subscription.updated", webSub("sub_A", "unpaid"), now - 2000);
      t.eq([r.status, rowOf(db).provider_subscription_id, B.plus.isLivePlusRow(rowOf(db))], [200, "sub_B", true], "N1m the row's subscription goes unpaid while the other is paid: the paid one becomes the row");
      // …and a subscription that is still live is never replaced by another (the conflict path is unchanged).
      const db2 = makeDb(), sm2 = makeStripe(); const B2 = loadWith(db2, sm2, alerts);
      db2.state.rows[T].push(webRow("sub_A", "active", { last_event_at: iso(now - 9000) }));
      sm2.stripe.subs.push(webSub("sub_A", "active"), webSub("sub_B", "active", { cancel_at_period_end: true, metadata: extraMeta }));
      const live = await send(B2.hook, "customer.subscription.updated", webSub("sub_A", "active"), now - 2000);
      t.eq([live.status, rowOf(db2).provider_subscription_id, sm2.log.filter((l) => l.startsWith("GET /subscriptions?")).length], [200, "sub_A", 0], "N1n a row that stays live is left alone, and Stripe is not asked for the customer's list");
    }

    // ── N1 through a refund. Support is told to refund the second purchase: that must end the SECOND one only ──
    {
      const db = makeDb(), sm = makeStripe(), alerts = []; const B = loadWith(db, sm, alerts);
      const subB = () => webSub("sub_B", "active", { cancel_at_period_end: true, metadata: extraMeta, current_period_start: now - 3600, items: { data: [{ price: { id: "price_pm" }, current_period_end: now + 30 * DAY, current_period_start: now - 3600 }] } });
      db.state.rows[T].push(webRow("sub_A", "active"));
      sm.stripe.subs.push(webSub("sub_A", "active"), subB());                       // A's period began 2 days ago, B's an hour ago
      const refundB = await send(B.hook, "charge.refunded", { id: "ch_B", object: "charge", customer: "cus_P", refunded: true, amount: 499, amount_refunded: 499, created: now - 3600 }, now - 30);
      t.eq([refundB.status, sm.log.filter((l) => l.startsWith("DELETE")), rowOf(db).provider_subscription_id, rowOf(db).status, B.plus.isLivePlusRow(rowOf(db))],
        [200, ["DELETE /subscriptions/sub_B"], "sub_A", "active", true],
        "N1o the EXTRA subscription's payment is refunded in full (what support is told to do): the extra one is cancelled, and the one the buyer keeps is NOT (was: the kept one was cancelled at Stripe and Plus ended)");
      // The row's own payment refunded while the other is paid: the row's subscription ends, the paid one becomes the row.
      const db2 = makeDb(), sm2 = makeStripe(); const B2 = loadWith(db2, sm2, alerts);
      db2.state.rows[T].push(webRow("sub_A", "active"));
      sm2.stripe.subs.push(webSub("sub_A", "active"), subB());
      const refundA = await send(B2.hook, "charge.refunded", { id: "ch_A", object: "charge", customer: "cus_P", refunded: true, amount: 499, amount_refunded: 499, created: now - 2 * DAY }, now - 30);
      t.eq([refundA.status, sm2.log.filter((l) => l.startsWith("DELETE")), rowOf(db2).provider_subscription_id, B2.plus.isLivePlusRow(rowOf(db2)), sm2.stripe.subs[1].cancel_at_period_end],
        [200, ["DELETE /subscriptions/sub_A"], "sub_B", true, false],
        "N1p the row's own payment is refunded while the other is paid: that subscription ends, and the paid one becomes the row");
      // When the charge says which invoice it paid, that decides, whatever the dates look like.
      const db3 = makeDb(), sm3 = makeStripe(); const B3 = loadWith(db3, sm3, alerts);
      db3.state.rows[T].push(webRow("sub_A", "active"));
      sm3.stripe.subs.push(webSub("sub_A", "active"), webSub("sub_B", "active", { cancel_at_period_end: true, metadata: extraMeta }));     // both periods began at the same moment
      sm3.stripe.invoices.push({ id: "in_B", subscription: "sub_B" });
      const byInvoice = await send(B3.hook, "charge.refunded", { id: "ch_B2", object: "charge", customer: "cus_P", invoice: "in_B", refunded: true, amount: 499, amount_refunded: 499, created: now - 2 * DAY }, now - 30);
      t.eq([byInvoice.status, sm3.log.filter((l) => l.startsWith("DELETE")), rowOf(db3).provider_subscription_id, rowOf(db3).status], [200, ["DELETE /subscriptions/sub_B"], "sub_A", "active"],
        "N1q the charge names its invoice: the invoice's subscription is the one that ends");
      // Two live subscriptions whose periods began together, and nothing says which the charge paid: nothing is ended.
      const db4 = makeDb(), sm4 = makeStripe(); const B4 = loadWith(db4, sm4, alerts);
      db4.state.rows[T].push(webRow("sub_A", "active"));
      sm4.stripe.subs.push(webSub("sub_A", "active"), webSub("sub_B", "active", { cancel_at_period_end: true, metadata: extraMeta }));
      const unsure = await send(B4.hook, "charge.refunded", { id: "ch_?", object: "charge", customer: "cus_P", refunded: true, amount: 499, amount_refunded: 499, created: now - 2 * DAY }, now - 30);
      t.eq([unsure.status, sm4.log.filter((l) => l.startsWith("DELETE")).length, rowOf(db4).status], [200, 0, "active"],
        "N1r it cannot be told which of two subscriptions the refunded charge paid: neither is cancelled and Plus stays (support's call), rather than ending the wrong one");
    }

    // ── N2. One Stripe customer per buyer, whatever the row's provider says ──────────────────────────────
    {
      // The buyer once paid on the website (customer cus_OLD), then in a store; the store Plus has ended.
      const ended = () => storeRow({ status: "canceled", current_period_end: iso(now - DAY), provider_customer_id: "cus_OLD" });
      const db = makeDb(), sm = makeStripe(), alerts = []; const B = loadWith(db, sm, alerts);
      db.state.rows[T].push(ended());
      const opened = await call(B.billing, { action: "plus_checkout", plan_key: "plus_monthly" });
      t.eq([opened.status, posted(sm, "/customers").length], [200, 0], "N2a a new website checkout for a buyer whose row is a store's: no second Stripe customer is made (was: one was)");
      t.eq(posted(sm, "/checkout/sessions").map((x) => x.body.customer), ["cus_OLD"], "N2b …the checkout is for the customer the buyer already has");
      t.eq(rowOf(db).provider_customer_id, "cus_OLD", "N2c …and the row still names it");
      t.ok(sm.log.includes("GET /subscriptions?customer=cus_OLD&status=all&limit=100") || sm.log.some((l) => l.startsWith("GET /subscriptions?customer=cus_OLD")), "N2d …and it is THAT customer Stripe is asked about before anything is sold");
      // A live website Plus on that customer the row does not show: nothing is sold, and the row takes it.
      const db2 = makeDb(), sm2 = makeStripe(); const B2 = loadWith(db2, sm2, alerts);
      db2.state.rows[T].push(ended());
      sm2.stripe.subs.push({ ...webSub("sub_W", "active"), customer: "cus_OLD" });
      const refused = await call(B2.billing, { action: "plus_checkout", plan_key: "plus_monthly" });
      t.eq([refused.status, refused.body && refused.body.error, posted(sm2, "/checkout/sessions").length, posted(sm2, "/customers").length], [409, "already_plus", 0, 0],
        "N2e that customer already has a live website Plus the row does not show: nothing is sold (was: a new customer was made, Stripe showed nothing on it, and a second Plus was sold)");
      t.eq([rowOf(db2).provider, rowOf(db2).provider_subscription_id, B2.plus.isLivePlusRow(rowOf(db2)), (await B2.plus.getPlusEntitlement(db2.admin, U)).plus], ["stripe", "sub_W", true, true],
        "N2f …and \"already has Plus\" is made true: the live subscription becomes the row, so the buyer is not left paying with no Plus and no way to buy");
      // The portal reaches the same customer.
      const db3 = makeDb(), sm3 = makeStripe(); const B3 = loadWith(db3, sm3, alerts);
      db3.state.rows[T].push(storeRow({ provider_customer_id: "cus_OLD" }));
      const portal = await call(B3.billing, { action: "plus_portal" });
      t.eq([portal.status, posted(sm3, "/billing_portal/sessions").map((x) => x.body.customer)], [200, ["cus_OLD"]], "N2g the portal opens for the buyer's Stripe customer even while the row is a store's (a website subscription left there can be reached)");
      // No customer at all: one is made, once, as before; and none for a buyer with no row.
      const db4 = makeDb(), sm4 = makeStripe(); const B4 = loadWith(db4, sm4, alerts);
      const first = await call(B4.billing, { action: "plus_checkout", plan_key: "plus_monthly" });
      t.eq([first.status, posted(sm4, "/customers").length, rowOf(db4).provider_customer_id, posted(sm4, "/checkout/sessions")[0].body.customer], [200, 1, "cus_NEW1", "cus_NEW1"], "N2h a buyer with no Stripe customer gets one, as before");
      const again = await call(B4.billing, { action: "plus_checkout", plan_key: "plus_monthly" });
      t.eq([again.status, posted(sm4, "/customers").length, posted(sm4, "/checkout/sessions")[1].body.customer], [200, 1, "cus_NEW1"], "N2i …and the next checkout reuses it");
      const db5 = makeDb(), sm5 = makeStripe(); const B5 = loadWith(db5, sm5, alerts);
      const none5 = await call(B5.billing, { action: "plus_portal" });
      t.eq(none5.status, 404, "N2j no customer: no portal, as before");
      // The store sync never loses the customer (what N2 depends on).
      const db6 = makeDb(), sm6 = makeStripe(); const B6 = loadWith(db6, sm6, alerts);
      db6.state.rows[T].push(webRow("sub_1", "canceled", { current_period_end: iso(now - DAY), provider_customer_id: "cus_OLD" }));
      await B6.plus.syncPlusFromStore(db6.admin, U, { fetchSubscriber: async () => rcSub() });
      t.eq([rowOf(db6).provider, rowOf(db6).provider_customer_id], ["app_store", "cus_OLD"], "N2k a store purchase that takes the row keeps the Stripe customer on it");
    }

    // ── What was "partly" ─────────────────────────────────────────────────────────────────────────────
    {
      const hook = fs.readFileSync(HOOK_PATH, "utf8"), addon = fs.readFileSync(PLUS_PATH, "utf8"), billing = fs.readFileSync(BILLING_PATH, "utf8");
      // H4/H5: an event for another subscription never takes a LIVE row away; after N1 a row that is NOT live is
      // replaced by any live Plus the buyer pays for, from Stripe's own list.
      t.ok(/otherLiveStripePlus\(/.test(hook) && /async function otherLiveStripePlus\(/.test(addon), "H4/H5a when the recorded subscription ends, the buyer's other live website Plus is looked for at Stripe itself");
      t.ok(/if \(otherWebSub && !liveNew\) \{/.test(hook), "H4/H5b an event for another subscription that is not live still changes nothing");
      // Grok's low: a hold that cannot be given back lapses on its timer (0052), and says so in the log.
      t.ok(/async function releasePlusPurchase\(/.test(addon) && /console\.error\("\[plus\] hold not given back:/.test(addon), "GL-a a hold that could not be given back is logged; it lapses by itself after 32 minutes (0052)");
      {
        const db = makeDb(), sm = makeStripe(), alerts = []; const B = loadWith(db, sm, alerts);
        sm.stripe.fail.checkout = true;
        let blink = true;
        db.state.beforeWrite = async (table, op) => { if (table === "plus_purchase_attempts" && op === "delete" && blink) { blink = false; throw new Error("database blinked"); } };
        const failed = await call(B.billing, { action: "plus_checkout", plan_key: "plus_monthly" });
        db.state.beforeWrite = null;
        t.eq([failed.status, blink, db.state.rows.plus_purchase_attempts.length], [502, false, 0], "GL-b Grok's low: the first try at giving the hold back fails, the second gives it back (was: left for 32 minutes)");
      }
      // B2/B3 and H9 are designs kept on purpose: one row per buyer, and a hold that ends on a timer.
      const sql = fs.readFileSync(path.join(REPO, "supabase", "migrations", "0044_plus_addon.sql"), "utf8");
      t.ok(/user_id\s+uuid\s+primary key/i.test(sql), "B2/B3a (kept on purpose) one Plus row per buyer: a second purchase is never a second grant");
      t.ok(/plus-extra:\$\{sub\.id\}/.test(addon) && /flagSecondPlus\(admin, userId, "stripe", deps\)/.test(hook), "B2/B3b …a second purchase is set to end, told to support once, and after N1 becomes the row when the first ends");
      t.ok(!/plus_checkout[\s\S]{0,4000}provider === "stripe" \? plusRow\.provider_customer_id/.test(billing), "N2l the customer is no longer read only from a row that says stripe");
    }
  } catch (e) {
    t.ok(false, "the run threw: " + (e && e.stack ? e.stack.split("\n").slice(0, 3).join(" | ") : e));
  } finally {
    console.error = quiet.e; console.warn = quiet.w; console.log = quiet.l; global.fetch = realFetch;
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  }
  t.summary("plusRound2Billing.test");
})();
