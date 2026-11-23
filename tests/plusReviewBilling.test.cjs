// tests/plusReviewBilling.test.cjs
// -----------------------------------------------------------------------------
// THE PLUS ADD-ON'S MONEY PATHS, AFTER THE THREE OUTSIDE REVIEWS OF cdb50f0 (2026-11-22). Each block is one finding:
// what the reviewer said could happen, run against the real handlers (stripe-webhook.js, billing.js, _lib/plusAddon.js)
// on a stand-in database that can interleave two writers.
//   1  H6        a payer in the store's billing grace period keeps Plus
//   2  H7        a slow store sync never writes "active" back over a newer refund
//   3  H4        Stripe events in the wrong order, in the same second, or two at once: the row ends up as Stripe has it
//   4  H5        an event for another subscription never takes a live row away
//   5  Grok M2   a second Plus is never silent: the extra website one is set to end, support is told once   (also B2)
//   6  B3        when one Plus ends, the other one the buyer pays for counts at once (both ways round)
//   7  Grok M1   a website checkout that is never opened gives its attempt back
//   8  Gemini M  a Plus payment refunded in full, or lost to a chargeback, ends Plus and the subscription
//   9  H9        each member buying Plus is told to support the moment the second one lands
//  10  not real  M6, L2, Grok LOW 2: shown from the code
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
  const stripe = { subs: [], charges: [], fail: {} }; const log = [];
  const get = async (p) => {
    log.push(`GET ${p}`);
    if (p.startsWith("/subscriptions?")) { const cus = decodeURIComponent((/customer=([^&]+)/.exec(p) || [])[1] || ""); return { data: stripe.subs.filter((s) => s.customer === cus) }; }
    if (p.startsWith("/checkout/sessions?")) return { data: [] };
    if (p.startsWith("/charges/")) return stripe.charges.find((c) => c.id === decodeURIComponent(p.split("/").pop())) || {};
    const s = stripe.subs.find((x) => x.id === decodeURIComponent(p.split("/").pop()));
    if (!s) { const e = new Error("no such subscription"); e.statusCode = 404; throw e; }
    return JSON.parse(JSON.stringify(s));
  };
  const post = async (p, body) => {
    log.push(`POST ${p}`);
    if (p === "/customers") return { id: "cus_P" };
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
    // ── 1. H6: the store's billing grace period ─────────────────────────────────────────────────────
    {
      const A = require(PLUS_PATH);
      const past = iso(now - DAY), grace = iso(now + 5 * DAY);
      const inGrace = A.plusFromSubscriber(rcSub({ expires_date: past, grace_period_expires_date: grace }, { expires_date: past, grace_period_expires_date: grace }), Date.now());
      t.eq([!!inGrace.row, inGrace.row && inGrace.row.status, inGrace.row && inGrace.row.current_period_end], [true, "active", grace],
        "1a H6 the entitlement's first date has passed but the store is still in its grace period: Plus stays, to the end of the grace period");
      const over = A.plusFromSubscriber(rcSub({ expires_date: past, grace_period_expires_date: past }, { expires_date: past, grace_period_expires_date: past }), Date.now());
      t.eq([over.row, over.reason], [null, "no_entitlement"], "1b …and once the grace period is over too, there is no Plus");
      t.eq(A.plusFromSubscriber({ entitlements: { plus_addon: { expires_date: future, product_identifier: "app.flourishmoney.plusaddon.monthly" } }, subscriptions: {} }, Date.now()).row, null,
        "1c a promotional grant (an entitlement with no store purchase) is still no Plus");
    }

    // ── 2. H7: a slow store sync and a refund ─────────────────────────────────────────────────────────
    {
      const db = makeDb(); const A = require(PLUS_PATH);
      db.state.rows[T].push(storeRow());
      let truth = rcSub(); let first = true;
      // Sync A asks RevenueCat and gets "active". Before it writes, the purchase is refunded and sync B (the refund's
      // webhook) runs from start to finish. Then A goes on.
      const slow = async () => {
        const snapshot = truth;
        if (first) { first = false; truth = rcSub({ refunded_at: iso(now) }); await A.syncPlusFromStore(db.admin, U, { fetchSubscriber: async () => truth }); }
        return snapshot;
      };
      const r = await A.syncPlusFromStore(db.admin, U, { fetchSubscriber: slow });
      t.eq([rowOf(db).status, r.plus, A.isLivePlusRow(rowOf(db))], ["canceled", false, false], "2a H7 a slow sync that read 'active' before a refund does not write it back over the refund");
      // The same race against a row that is not there yet: two first syncs at once write one row, the newer answer.
      const db2 = makeDb(); let truth2 = rcSub(); let first2 = true;
      const slow2 = async () => { const snap = truth2; if (first2) { first2 = false; truth2 = none; await A.syncPlusFromStore(db2.admin, U, { fetchSubscriber: async () => rcSub() }); truth2 = rcSub({ refunded_at: iso(now) }); await A.syncPlusFromStore(db2.admin, U, { fetchSubscriber: async () => truth2 }); } return snap; };
      await A.syncPlusFromStore(db2.admin, U, { fetchSubscriber: slow2 });
      t.eq([db2.state.rows[T].length, rowOf(db2).status], [1, "canceled"], "2b …nor when the row did not exist when it started");
      const src = fs.readFileSync(PLUS_PATH, "utf8");
      const sync = src.slice(src.indexOf("async function syncPlusFromStore"), src.indexOf("// ── ONE PLUS PURCHASE AT A TIME"));
      t.ok(sync.indexOf(".select(ROW_COLS)") > 0 && sync.indexOf(".select(ROW_COLS)") < sync.indexOf("deps.fetchSubscriber(userId)") && /writePlusRow\(admin, userId, existing, next\)/.test(sync) && !/\.upsert\(/.test(sync),
        "2c the row is read before RevenueCat is asked, and written only if it has not changed since");
    }

    // ── 3. H4: Stripe's events out of order, in the same second, and two at once ─────────────────────
    {
      const T0 = now - 600;
      // 3a the same second, wrong order: "updated" (active) is handled first, then "created" (incomplete) arrives.
      let db = makeDb(), sm = makeStripe(), alerts = []; let B = loadWith(db, sm, alerts);
      sm.stripe.subs.push(webSub("sub_1", "active"));
      await send(B.hook, "customer.subscription.updated", webSub("sub_1", "active"), T0);
      const late = await send(B.hook, "customer.subscription.created", webSub("sub_1", "incomplete"), T0);
      t.eq([late.status, rowOf(db).status, B.plus.isLivePlusRow(rowOf(db))], [200, "active", true],
        "3a H4 'created' arriving after 'updated' in the same second does not turn an active Plus back to incomplete: Stripe is asked what is true");
      // 3b the same second, the right order, is still right.
      db = makeDb(); sm = makeStripe(); B = loadWith(db, sm, alerts); sm.stripe.subs.push(webSub("sub_1", "active"));
      await send(B.hook, "customer.subscription.created", webSub("sub_1", "incomplete"), T0);
      await send(B.hook, "customer.subscription.updated", webSub("sub_1", "active"), T0);
      t.eq(rowOf(db).status, "active", "3b …and in the right order it is active too");
      // 3c two at once: "created" (older) has read the row and is about to write when "updated" (newer) is handled in full.
      db = makeDb(); sm = makeStripe(); B = loadWith(db, sm, alerts); sm.stripe.subs.push(webSub("sub_1", "active"));
      db.state.rows[T].push({ user_id: U, provider: "stripe", status: "incomplete", provider_customer_id: "cus_P", updated_at: iso(now - 9000) });
      let once = true;
      db.state.beforeWrite = async (table) => { if (table === T && once) { once = false; await send(B.hook, "customer.subscription.updated", webSub("sub_1", "active"), T0 + 1); } };
      const older = await send(B.hook, "customer.subscription.created", webSub("sub_1", "incomplete"), T0);
      t.eq([older.status, rowOf(db).status, rowOf(db).last_event_at], [200, "active", iso(T0 + 1)],
        "3c two handled at once: the older event's write does not land over the newer one's");
      // 3d the same, in the same second.
      db = makeDb(); sm = makeStripe(); B = loadWith(db, sm, alerts); sm.stripe.subs.push(webSub("sub_1", "active"));
      once = true;
      db.state.beforeWrite = async (table) => { if (table === T && once) { once = false; await send(B.hook, "customer.subscription.updated", webSub("sub_1", "active"), T0); } };
      await send(B.hook, "customer.subscription.created", webSub("sub_1", "incomplete"), T0);
      t.eq([db.state.rows[T].length, rowOf(db).status], [1, "active"], "3d …nor when both carry the same second and no row existed");
      // 3e a cancellation is still a cancellation, in the same second as the last update.
      db = makeDb(); sm = makeStripe(); B = loadWith(db, sm, alerts); sm.stripe.subs.push(webSub("sub_1", "canceled"));
      db.state.rows[T].push(webRow("sub_1", "active", { last_event_at: iso(T0) }));
      await send(B.hook, "customer.subscription.updated", webSub("sub_1", "active"), T0);
      t.eq(rowOf(db).status, "canceled", "3e an old 'active' in the same second as the last event is not written over a subscription Stripe has cancelled");
      // 3f an older event is still ignored, and a newer one still applies, with no call to Stripe.
      db = makeDb(); sm = makeStripe(); B = loadWith(db, sm, alerts);
      db.state.rows[T].push(webRow("sub_1", "active", { last_event_at: iso(T0) }));
      const stale = await send(B.hook, "customer.subscription.deleted", webSub("sub_1", "canceled"), T0 - 5);
      const fresh = await send(B.hook, "customer.subscription.updated", webSub("sub_1", "past_due"), T0 + 5);
      t.eq([stale.body.stale, rowOf(db).status, fresh.status, sm.log.filter((l) => l.startsWith("GET /subscriptions/")).length], [true, "past_due", 200, 0],
        "3f an older event changes nothing and a newer one applies, as before, without asking Stripe");
    }

    // ── 4. H5: an event for another subscription ────────────────────────────────────────────────────────
    {
      const db = makeDb(), sm = makeStripe(), alerts = []; const B = loadWith(db, sm, alerts);
      // The row is sub_2, live. sub_1 is an older subscription of the same buyer that Stripe ends later.
      db.state.rows[T].push(webRow("sub_2", "active"));
      sm.stripe.subs.push(webSub("sub_2", "active"), webSub("sub_1", "canceled"));
      const gone = await send(B.hook, "customer.subscription.deleted", webSub("sub_1", "canceled"), now - 60);
      t.eq([gone.status, rowOf(db).provider_subscription_id, rowOf(db).status, B.plus.isLivePlusRow(rowOf(db))], [200, "sub_2", "active", true],
        "4a H5 the end of an older subscription does not take away the newer subscription's live row");
      const pd = await send(B.hook, "customer.subscription.updated", webSub("sub_1", "past_due"), now - 50);
      t.eq([pd.body.ignored, rowOf(db).provider_subscription_id], [true, "sub_2"], "4b …nor does any other event for it while it is not live");
      // A new subscription after the old one ended becomes the row.
      const db2 = makeDb(), sm2 = makeStripe(); const B2 = loadWith(db2, sm2, alerts);
      db2.state.rows[T].push(webRow("sub_1", "canceled", { current_period_end: iso(now - DAY) }));
      sm2.stripe.subs.push(webSub("sub_2", "active"));
      await send(B2.hook, "customer.subscription.updated", webSub("sub_2", "active"), now - 40);
      t.eq([rowOf(db2).provider_subscription_id, rowOf(db2).status], ["sub_2", "active"], "4c a new subscription bought after the old one ended becomes the row");
    }

    // ── 5. Grok MEDIUM 2 (and B2): a second Plus is never silent ───────────────────────────────────────
    {
      const db = makeDb(), sm = makeStripe(), alerts = []; const B = loadWith(db, sm, alerts);
      // The buyer's Plus is live in the App Store. A website checkout for the same buyer completes anyway.
      db.state.rows[T].push(storeRow({ provider_customer_id: "cus_P" }));
      sm.stripe.subs.push(webSub("sub_w", "active"));
      const done = await send(B.hook, "checkout.session.completed", { id: "cs_1", customer: "cus_P", subscription: "sub_w", metadata: { user_id: U, plan_key: "plus_monthly", kind: "plus_addon" } }, now - 300);
      t.eq([done.status, done.body.conflict, rowOf(db).provider, B.plus.isLivePlusRow(rowOf(db))], [200, true, "app_store", true], "5a Grok M2 the store row is kept and the household keeps Plus");
      t.eq([sm.stripe.subs[0].cancel_at_period_end, sm.stripe.subs[0].metadata.flourish_plus_extra, sm.log.filter((l) => l === "POST /subscriptions/sub_w").length], [true, "1", 1],
        "5b the extra website subscription is set to end at its period end, so it is never charged again");
      t.eq(alerts.map((a) => [a.flag, a.userId, a.provider]), [["plus_second_purchase", U, "stripe"]], "5c support is told, with the account and where the extra one is");
      await send(B.hook, "customer.subscription.updated", webSub("sub_w", "active", { cancel_at_period_end: true }), now - 290);
      t.eq([alerts.length, sm.log.filter((l) => l === "POST /subscriptions/sub_w").length, rowOf(db).provider], [1, 1, "app_store"], "5d …once: the next event for it tells nobody again and asks Stripe nothing more");
      // B2: a website Plus in dunning (past_due) is written over by a store purchase; then the card works again.
      const db2 = makeDb(), sm2 = makeStripe(), alerts2 = []; const B2 = loadWith(db2, sm2, alerts2);
      db2.state.rows[T].push(webRow("sub_1", "past_due"));
      sm2.stripe.subs.push(webSub("sub_1", "past_due"));
      await B2.plus.syncPlusFromStore(db2.admin, U, { fetchSubscriber: async () => rcSub() });
      t.eq([rowOf(db2).provider, rowOf(db2).provider_customer_id, rowOf(db2).provider_subscription_id], ["app_store", "cus_P", null], "5e B2 a store purchase takes the row of a website Plus that is not live, and the Stripe customer is kept");
      sm2.stripe.subs[0].status = "active";
      const back = await send(B2.hook, "customer.subscription.updated", webSub("sub_1", "active"), now - 200);
      t.eq([back.body.conflict, rowOf(db2).provider, sm2.stripe.subs[0].cancel_at_period_end, alerts2.length], [true, "app_store", true, 1],
        "5f …and when the website one starts charging again it is set to end and support is told: two billers are never left running unseen");
      // A store purchase for a buyer whose Plus is live on the website: nothing to cancel from here, support is told once.
      const db3 = makeDb(), alerts3 = []; const B3 = loadWith(db3, makeStripe(), alerts3);
      db3.state.rows[T].push(webRow("sub_1", "active"));
      const c1 = await B3.plus.syncPlusFromStore(db3.admin, U, { fetchSubscriber: async () => rcSub() });
      await B3.plus.syncPlusFromStore(db3.admin, U, { fetchSubscriber: async () => rcSub() });
      t.eq([c1.conflict, rowOf(db3).provider, alerts3.map((a) => a.flag + ":" + a.provider)], [true, "stripe", ["plus_second_purchase:app_store"]], "5g a store Plus bought beside a live website one: the row is kept and support is told once, however often the app syncs");
    }

    // ── 6. B3: when one ends, the other counts at once ─────────────────────────────────────────────────
    {
      // (a) Website row live; a store Plus was also bought (the conflict above: not written). The website one ends.
      const db = makeDb(), sm = makeStripe(), alerts = []; const B = loadWith(db, sm, alerts);
      process.env.IAP_ENABLED = "true";
      global.fetch = async (url) => (/api\.revenuecat\.com/.test(String(url)) ? { ok: true, status: 200, json: async () => ({ subscriber: rcSub() }) } : { ok: true, status: 200, json: async () => ({}) });
      db.state.rows[T].push(webRow("sub_1", "active", { last_event_at: iso(now - 900) }));
      sm.stripe.subs.push(webSub("sub_1", "canceled"));
      const ended = await send(B.hook, "customer.subscription.deleted", webSub("sub_1", "canceled"), now - 100);
      t.eq([ended.status, rowOf(db).provider, rowOf(db).status, B.plus.isLivePlusRow(rowOf(db))], [200, "app_store", "active", true],
        "6a B3 the website Plus ends: the store Plus the same buyer pays for becomes the row at once, not at its next renewal");
      global.fetch = async () => ({ ok: false, status: 500, json: async () => ({}) });
      const db1 = makeDb(), sm1 = makeStripe(); const B1 = loadWith(db1, sm1, alerts);
      db1.state.rows[T].push(webRow("sub_1", "active", { last_event_at: iso(now - 900) })); sm1.stripe.subs.push(webSub("sub_1", "canceled"));
      const ended1 = await send(B1.hook, "customer.subscription.deleted", webSub("sub_1", "canceled"), now - 100);
      t.eq([ended1.status, rowOf(db1).status], [200, "canceled"], "6b …and if the stores cannot be asked, the cancellation still stands");
      delete process.env.IAP_ENABLED; global.fetch = realFetch;
      // (b) Store row live; the same buyer also pays for a website Plus (set to end as the extra). The store one ends.
      const db2 = makeDb(), sm2 = makeStripe(), alerts2 = []; const B2 = loadWith(db2, sm2, alerts2);
      db2.state.rows[T].push(storeRow({ provider_customer_id: "cus_P" }));
      sm2.stripe.subs.push(webSub("sub_w", "active", { cancel_at_period_end: true, metadata: { user_id: U, plan_key: "plus_monthly", kind: "plus_addon", flourish_plus_extra: "1" } }));
      const r = await B2.plus.syncPlusFromStore(db2.admin, U, { fetchSubscriber: async () => none, stripeGet: sm2.exports.stripeGet, stripePost: sm2.exports.stripePost });
      t.eq([r.plus, rowOf(db2).provider, rowOf(db2).provider_subscription_id, rowOf(db2).status], [true, "stripe", "sub_w", "active"],
        "6c B3 the store Plus ends: the live website Plus the buyer pays for becomes the row, and the household keeps Plus");
      // Changed 2026-11-22 (Amanda, after round 3): it is NOT un-cancelled; it runs to its paid date and ends.
      t.eq([sm2.stripe.subs[0].cancel_at_period_end, sm2.stripe.subs[0].metadata.flourish_plus_extra, rowOf(db2).cancel_at_period_end, sm2.log.filter((l) => /^POST \/subscriptions\/sub_w/.test(l)).length], [true, "1", true, 0],
        "6d …and it stays set to end at its paid date: nothing is posted to Stripe to make it renew");
      // No website Plus: the store row ends now, as before, and Stripe is not asked for a buyer with no Stripe customer.
      const db3 = makeDb(), sm3 = makeStripe(); const B3 = loadWith(db3, sm3, alerts2);
      db3.state.rows[T].push(storeRow());
      const r3 = await B3.plus.syncPlusFromStore(db3.admin, U, { fetchSubscriber: async () => none, stripeGet: sm3.exports.stripeGet, stripePost: sm3.exports.stripePost });
      t.eq([r3.plus, rowOf(db3).status, sm3.log.length], [false, "canceled", 0], "6e a store Plus that ends with no website Plus ends now, as before");
    }

    // ── 7. Grok MEDIUM 1: a checkout that is never opened ─────────────────────────────────────────────
    {
      const db = makeDb(), sm = makeStripe(), alerts = []; const B = loadWith(db, sm, alerts);
      db.state.rows.household_members.push({ user_id: U, household_id: "h1", role: "owner" }, { user_id: P, household_id: "h1", role: "partner" });
      sm.stripe.fail.checkout = true;
      const failed = await call(B.billing, { action: "plus_checkout", plan_key: "plus_monthly" });
      t.eq([failed.status, db.state.rows.plus_purchase_attempts.length], [502, 0], "7a Grok M1 Stripe could not open the checkout: the attempt is given back, so nobody is held for a purchase that does not exist");
      sm.stripe.fail.checkout = false;
      const opened = await call(B.billing, { action: "plus_checkout", plan_key: "plus_monthly" });
      t.eq([opened.status, db.state.rows.plus_purchase_attempts.map((r) => [r.user_id, r.provider])], [200, [[U, "stripe"]]], "7b a checkout that opened keeps its attempt (it can still charge)");
      // What the reviewer said about the buyer's OWN retry is not so: 0052 lets a website attempt replace their own earlier one.
      const sql = fs.readFileSync(path.join(REPO, "supabase", "migrations", "0052_plus_purchase_attempts.sql"), "utf8");
      t.ok(/elsif not \(a\.provider = 'stripe' and p_provider = 'stripe' and not a\.pending\) then\s+return jsonb_build_object\('result', 'held_elsewhere', 'mine', true/.test(sql),
        "7c (not real as stated) the buyer's own next website checkout was never refused: a website attempt replaces their own earlier website attempt (0052)");
      const again = await call(B.billing, { action: "plus_checkout", plan_key: "plus_monthly" });
      t.eq(again.status, 200, "7d …shown: a second checkout straight after the first is opened, not refused");
    }

    // ── 8. Gemini MEDIUM: a Plus payment taken back ──────────────────────────────────────────────────────
    {
      const setup = () => { const db = makeDb(), sm = makeStripe(), alerts = []; const B = loadWith(db, sm, alerts); db.state.rows[T].push(webRow("sub_1", "active")); sm.stripe.subs.push(webSub("sub_1", "active")); return { db, sm, B }; };
      let x = setup();
      const full = await send(x.B.hook, "charge.refunded", { id: "ch_1", object: "charge", customer: "cus_P", refunded: true, amount: 499, amount_refunded: 499, created: now - DAY }, now - 30);
      t.eq([full.status, rowOf(x.db).status, x.B.plus.isLivePlusRow(rowOf(x.db)), x.sm.log.filter((l) => l === "DELETE /subscriptions/sub_1").length], [200, "canceled", false, 1],
        "8a Gemini M this period's Plus payment refunded in full: Plus ends and the subscription is cancelled at Stripe, so it is not left live and charging");
      x = setup();
      await send(x.B.hook, "charge.refunded", { id: "ch_2", object: "charge", customer: "cus_P", refunded: false, amount: 499, amount_refunded: 100, created: now - DAY }, now - 30);
      t.eq([rowOf(x.db).status, x.sm.log.filter((l) => l.startsWith("DELETE")).length], ["active", 0], "8b a partial refund changes nothing");
      x = setup();
      await send(x.B.hook, "charge.refunded", { id: "ch_3", object: "charge", customer: "cus_P", refunded: true, amount: 499, amount_refunded: 499, created: now - 40 * DAY }, now - 30);
      t.eq([rowOf(x.db).status, x.sm.log.filter((l) => l.startsWith("DELETE")).length], ["active", 0], "8c a refund of an earlier period's payment changes nothing (support's call)");
      x = setup();
      await send(x.B.hook, "charge.refunded", { id: "ch_4", object: "charge", customer: "cus_MAIN", refunded: true, amount: 1199, amount_refunded: 1199, created: now - DAY }, now - 30);
      t.eq([rowOf(x.db).status, x.sm.log.filter((l) => l.startsWith("DELETE")).length], ["active", 0], "8d a refund for the main plan's customer never touches Plus");
      x = setup(); x.sm.stripe.charges.push({ id: "ch_5", customer: "cus_P", created: now - DAY });
      const lost = await send(x.B.hook, "charge.dispute.closed", { id: "dp_1", object: "dispute", charge: "ch_5", status: "lost" }, now - 30);
      t.eq([lost.status, rowOf(x.db).status, x.sm.log.filter((l) => l === "DELETE /subscriptions/sub_1").length], [200, "canceled", 1], "8e a chargeback that is lost ends Plus the same way");
      x = setup(); x.sm.stripe.charges.push({ id: "ch_6", customer: "cus_P", created: now - DAY });
      await send(x.B.hook, "charge.dispute.closed", { id: "dp_2", object: "dispute", charge: "ch_6", status: "won" }, now - 30);
      t.eq(rowOf(x.db).status, "active", "8f a chargeback that is won changes nothing");
      delete process.env.PLUS_ENABLED;
      x = setup();
      await send(x.B.hook, "charge.refunded", { id: "ch_7", object: "charge", customer: "cus_P", refunded: true, created: now - DAY }, now - 30);
      t.eq(x.sm.log.length, 0, "8g with Plus off for everyone a refund reads nothing of Plus's and asks Stripe nothing");
      process.env.PLUS_ENABLED = "true";
    }

    // ── 9. H9: each member bought Plus ─────────────────────────────────────────────────────────────────
    {
      const db = makeDb(), alerts = []; const B = loadWith(db, makeStripe(), alerts);
      db.state.rows.household_members.push({ user_id: U, household_id: "h1", role: "owner" }, { user_id: P, household_id: "h1", role: "partner" });
      db.state.rows[T].push({ ...storeRow(), user_id: P });
      const r = await B.plus.syncPlusFromStore(db.admin, U, { fetchSubscriber: async () => rcSub() });
      await B.plus.syncPlusFromStore(db.admin, U, { fetchSubscriber: async () => rcSub() });
      t.eq([r.plus, rowOf(db).status, alerts.map((a) => [a.flag, a.userId])], [true, "active", [["plus_second_purchase", U]]],
        "9a H9 the second member's Plus purchase lands (a sheet left open past the hold): it is written, and support is told once to refund one");
      const alone = makeDb(), alerts2 = []; const B2 = loadWith(alone, makeStripe(), alerts2);
      await B2.plus.syncPlusFromStore(alone.admin, U, { fetchSubscriber: async () => rcSub() });
      t.eq(alerts2.length, 0, "9b one Plus in a household tells nobody");
      const buy = fs.readFileSync(path.join(REPO, "src", "lib", "plusBuy.js"), "utf8");
      t.ok(/The app never ENDS a hold/.test(buy) && /HOLD_MINUTES/.test(fs.readFileSync(PLUS_PATH, "utf8")), "9c the hold itself is unchanged: 32 minutes, or 7 days once the store says pending, as the main plan's");
    }

    // ── 10. Not real, shown from the code ──────────────────────────────────────────────────────────────
    {
      const A = require(PLUS_PATH);
      // Grok LOW 2: only the purchase the entitlement names is ever read, whatever order RevenueCat lists them in.
      const two = (order) => { const subs = { "app.flourishmoney.plusaddon.monthly": { store: "app_store", expires_date: iso(now - DAY), is_sandbox: false }, "app.flourishmoney.plusaddon.annual": { store: "app_store", expires_date: future, is_sandbox: false } };
        return { entitlements: { plus_addon: { expires_date: future, product_identifier: "app.flourishmoney.plusaddon.annual" } }, subscriptions: Object.fromEntries(order.map((k) => [k, subs[k]])) }; };
      t.eq([two(["app.flourishmoney.plusaddon.monthly", "app.flourishmoney.plusaddon.annual"]), two(["app.flourishmoney.plusaddon.annual", "app.flourishmoney.plusaddon.monthly"])].map((s) => A.plusFromSubscriber(s, Date.now()).row.plan_key), ["plus_annual", "plus_annual"],
        "10a Grok LOW 2 (not real) with two store purchases listed, the one the entitlement names is the one read, in either order");
      // M6: complimentary Plus has no end date on purpose; it is taken away by the same hand that gave it.
      const sql = fs.readFileSync(path.join(REPO, "supabase", "migrations", "0051_complimentary_access.sql"), "utf8");
      t.ok(!/expires_at/.test(sql) && /complimentary_access_set/.test(sql), "10b M6 (not real) complimentary Plus has no end date by design: it is given and taken away by hand (complimentary_access_set)");
      // L2: one Stripe key per deployed function, and a remembered configuration that Stripe refuses is looked up again.
      const src = fs.readFileSync(PLUS_PATH, "utf8");
      t.ok(/const remembered = portalCache\.has\(modeOf\(env\)\);\s+try \{ return await open\(false\); \}\s+catch \(e\) \{ if \(!remembered\) throw e; return open\(true\); \}/.test(src),
        "10c L2 (not real) a remembered portal configuration that Stripe refuses is looked up afresh; a deploy has one Stripe key for its whole life");
    }
  } catch (e) {
    t.ok(false, "the run threw: " + (e && e.stack ? e.stack.split("\n").slice(0, 3).join(" | ") : e));
  } finally {
    console.error = quiet.e; console.warn = quiet.w; console.log = quiet.l; global.fetch = realFetch;
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  }
  t.summary("plusReviewBilling.test");
})();
