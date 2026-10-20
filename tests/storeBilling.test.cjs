// tests/storeBilling.test.cjs
// -----------------------------------------------------------------------------
// VERSION 1.1, ITEM 1: IN-APP PURCHASE THROUGH REVENUECAT, BEHIND A FLAG, WITH ONE PLACE THAT DECIDES.
//
// 1. Off by default: no build sells unless it is a store build with VITE_IAP_ENABLED "true"; the server's store
//    actions and webhook answer 404 unless IAP_ENABLED is "true"; nothing is added to any request otherwise.
// 2. The products: the app's table and the server's name the same identifiers and the same plans.
// 3. A RevenueCat subscriber record becomes the household's one subscription row, in the shape the app already
//    reads, and the things that must not count do not (sandbox, Family Sharing, a promotional grant).
// 4. ONE PAID STATE AT A TIME: mayReplace, the store sync, the RevenueCat webhook, Stripe checkout and the
//    Stripe webhook each refuse a second paid state; a household that pays in a store and one that paid on
//    the web each resolve to exactly one provider.
// 5. The server's plan answer: a store build that sells counts every provider; a 1.0.x store build counts
//    nothing (as before); the web counts a store purchase. The app's storePlan and the server agree.
// 6. The app's purchase flow (lib/storeBilling.js buy/restore), driven with fakes: nothing is sold to a
//    household that already pays, and access follows the server's yes, never the SDK's.
// 7. The wiring: RevenueCat loads only inside the store-billing effect; the plugin is registered in both
//    native projects.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");

const REPO = path.join(__dirname, "..");
const read = (...p) => fs.readFileSync(path.join(REPO, ...p), "utf8");
const AUTH_PATH = require.resolve("../netlify/functions/_lib/auth.js");
const API_PATH = require.resolve("../netlify/functions/_lib/stripeApi.js");
const BILLING_PATH = require.resolve("../netlify/functions/billing.js");
const STRIPE_WH_PATH = require.resolve("../netlify/functions/stripe-webhook.js");
const RC_WH_PATH = require.resolve("../netlify/functions/revenuecat-webhook.js");
const SIG_PATH = require.resolve("../netlify/functions/_lib/stripeSignature.js");
const S = require("../netlify/functions/_lib/storeSubscriptions.js");
const R = require("../netlify/functions/_lib/planRules.js");
const { isStoreBillingRequest } = require("../netlify/functions/_lib/cors.js");

const NOW = Date.parse("2026-11-15T12:00:00Z");
const LATER = "2026-12-15T12:00:00Z", EARLIER = "2026-11-01T12:00:00Z";
const U1 = "11111111-1111-4111-8111-111111111111", U2 = "22222222-2222-4222-8222-222222222222";

// A RevenueCat subscriber record with the "plus" entitlement, App Store monthly by default.
function subscriber(o = {}) {
  const product = o.product || "app.flourishmoney.plus.monthly";
  const key = o.subKey || product;
  return {
    entitlements: { plus: { product_identifier: product, expires_date: o.expires || LATER, grace_period_expires_date: o.grace || null, purchase_date: EARLIER } },
    subscriptions: { [key]: { store: o.store || "app_store", period_type: o.period || "normal", expires_date: o.expires || LATER, is_sandbox: !!o.sandbox,
      ownership_type: o.ownership || "PURCHASED", refunded_at: o.refunded || null, unsubscribe_detected_at: o.unsub || null, product_plan_identifier: o.plan || null,
      grace_period_expires_date: o.grace || null } },
  };
}

// A fake Supabase admin client over in-memory tables.
function fakeAdmin(db = {}, users = {}) {
  const calls = { upserts: [], updates: [], rpcs: [] };
  const table = (n) => (db[n] = db[n] || []);
  const from = (name) => {
    const f = [];
    const rows = () => table(name).filter((r) => f.every(([c, v]) => r[c] === v));
    const q = {
      select() { return q; },
      eq(c, v) { f.push([c, v]); return q; },
      async maybeSingle() { return { data: rows()[0] ? { ...rows()[0] } : null, error: null }; },
      upsert(payload, opts) {
        calls.upserts.push({ table: name, payload: { ...payload } });
        const key = (opts && opts.onConflict) || "user_id";
        const i = table(name).findIndex((r) => r[key] === payload[key]);
        if (i >= 0) table(name)[i] = { ...table(name)[i], ...payload }; else table(name).push({ ...payload });
        return Promise.resolve({ error: null });
      },
      insert(payload) {
        const dup = table(name).some((r) => r.event_id && r.event_id === payload.event_id);
        if (!dup) table(name).push({ ...payload, attempts: 1 });
        return { select: async () => ({ data: dup ? [] : [{ event_id: payload.event_id }], error: null }) };
      },
      update(patch) {
        return { eq: async (c, v) => { table(name).filter((r) => r[c] === v).forEach((r) => Object.assign(r, patch)); calls.updates.push({ table: name, patch }); return { error: null }; } };
      },
    };
    return q;
  };
  return { from, rpc: async (fn, args) => { calls.rpcs.push({ fn, args }); return { data: null, error: null }; },
    auth: { admin: { getUserById: async (id) => ({ data: { user: users[id] || null }, error: null }) } }, calls, db };
}

(async () => {
  const t = create();
  const C = await import("../src/lib/storeBilling.js");
  const P = await import("../src/lib/planFromProfile.js");
  const saved = { ...process.env };
  const restoreEnv = () => { for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k]; Object.assign(process.env, saved); };

  // ── 1. Off by default ─────────────────────────────────────────────────────────────────────────
  {
    t.eq([C.storeBillingOn({ native: true, env: {} }), C.storeBillingOn({ native: true, env: { VITE_IAP_ENABLED: "1" } }), C.storeBillingOn({ native: false, env: { VITE_IAP_ENABLED: "true" } }), C.storeBillingOn({ native: true, env: { VITE_IAP_ENABLED: "true" } })],
      [false, false, false, true], "1a only a store build with VITE_IAP_ENABLED exactly \"true\" sells; the web never does");
    t.eq([C.storeBillingFields(false), C.storeBillingFields(true)], [{}, { store_billing: true }], "1b with it off, nothing is added to any request");
    const ev = (origin, extra = {}) => ({ headers: { origin }, ...extra });
    t.eq([isStoreBillingRequest(ev("capacitor://localhost", { body: JSON.stringify({ action: "x", store_billing: true }) })), isStoreBillingRequest(ev("https://localhost", { queryStringParameters: { store_billing: "1" } })),
      isStoreBillingRequest(ev("https://flourishmoney.app", { body: JSON.stringify({ store_billing: true }) })), isStoreBillingRequest(ev("capacitor://localhost", { body: JSON.stringify({ store_billing: "true" }) })), isStoreBillingRequest(ev("capacitor://localhost"))],
      [true, true, false, false, false], "1c the server hears \"this store build sells\" only from a store app, and only as true or 1");
    t.eq([C.revenueCatKey("ios", { VITE_REVENUECAT_IOS_KEY: "appl_test" }), C.revenueCatKey("ios", { VITE_REVENUECAT_IOS_KEY: "sk_secret" }), C.revenueCatKey("android", { VITE_REVENUECAT_ANDROID_KEY: "goog_test" }), C.revenueCatKey("web", { VITE_REVENUECAT_IOS_KEY: "appl_x" })],
      ["appl_test", "", "goog_test", ""], "1d only RevenueCat's PUBLIC app keys are ever used in the app; a secret key is refused");

    // The server: store actions and the webhook are absent unless IAP_ENABLED is "true", whatever BILLING_ENABLED says.
    for (const k of ["IAP_ENABLED", "BILLING_ENABLED"]) delete process.env[k];
    process.env.BILLING_ENABLED = "true";
    const billing = loadBilling({ subscriptions: [] }, {});
    for (const action of ["store_status", "store_sync"]) {
      const res = await billing.handler(post({ action }));
      t.eq(res.statusCode, 404, `1e ${action} answers 404 while IAP_ENABLED is off, even with web billing on`);
    }
    process.env.IAP_ENABLED = "true"; delete process.env.BILLING_ENABLED;
    const res = await loadBilling({ subscriptions: [] }, {}).handler(post({ action: "create_checkout_session", plan_key: "monthly" }));
    t.eq(res.statusCode, 404, "1f …and IAP_ENABLED never opens the web's checkout");
    delete process.env.IAP_ENABLED;
    const wh = require(RC_WH_PATH);
    t.eq((await wh.handler({ httpMethod: "POST", headers: {}, body: "{}" })).statusCode, 404, "1g the RevenueCat webhook is absent while IAP_ENABLED is off");
    restoreEnv();
  }

  // ── 2. The products ──────────────────────────────────────────────────────────────────────────
  {
    const appIds = Object.values(C.PRODUCT_IDS).flatMap((m) => Object.entries(m).map(([plan, id]) => [id, plan]));
    t.eq(appIds.map(([id, plan]) => S.PRODUCT_PLANS[id] === plan), appIds.map(() => true), "2a every product the app sells is the same plan on the server");
    t.eq(Object.keys(S.PRODUCT_PLANS).sort(), appIds.map(([id]) => id).sort(), "2b …and the server knows no product the app does not sell");
    t.eq([...new Set(Object.values(S.PRODUCT_PLANS))].sort(), ["annual", "founding_annual", "monthly"], "2c three plans, the same three keys the web's subscriptions use (migration 0009)");
    t.eq([S.planKeyFor("flourish_plus", "annual"), S.planKeyFor("flourish_plus:annual"), S.planKeyFor("flourish_plus", "weekly"), S.planKeyFor("com.other.app", null)], ["annual", "annual", null, null],
      "2d a Google product is read either way RevenueCat names it; anything else is unknown");
  }

  // ── 3. A subscriber record becomes the one row ───────────────────────────────────────────────
  {
    const row = (o, opts) => S.storeRowFromSubscriber(subscriber(o), NOW, opts);
    t.eq(row({}).row, { provider: "app_store", status: "active", plan_key: "monthly", current_period_end: LATER.replace("Z", ".000Z"), cancel_at_period_end: false, updated_at: new Date(NOW).toISOString() },
      "3a an App Store monthly: provider, status, plan, the paid period and renewal, the shape stripe-webhook.js writes");
    t.eq(row({ period: "trial" }).row.status, "trialing", "3b the store's free month is 'trialing', as Stripe's trial is");
    t.eq([row({ expires: EARLIER }).row.status, R.isPaidSubscription(row({ expires: EARLIER }).row, NOW)], ["canceled", false], "3c an expired subscription is over");
    t.eq([row({ refunded: "2026-11-10T00:00:00Z" }).row.status, row({ refunded: "2026-11-10T00:00:00Z" }).row.current_period_end], ["canceled", "2026-11-10T00:00:00.000Z"], "3d a refund ends access at the refund");
    t.eq(row({ unsub: EARLIER }).row.cancel_at_period_end, true, "3e renewal turned off in the store: paid until the period ends, then over");
    t.eq(row({ expires: EARLIER, grace: LATER }).row.status, "active", "3f a billing retry inside the store's grace period keeps access, as the store does");
    t.eq(row({ product: "flourish_plus:annual", subKey: "flourish_plus", store: "play_store", plan: "annual" }).row && row({ product: "flourish_plus:annual", subKey: "flourish_plus", store: "play_store", plan: "annual" }).row.plan_key,
      "annual", "3g a Google Play annual");
    t.eq([row({ sandbox: true }).reason, row({ sandbox: true }, { acceptSandbox: true }).row.status], ["sandbox", "active"], "3h a sandbox purchase does not count unless sandbox is accepted for this account");
    t.eq([S.acceptSandboxFor({ email: "someone@example.test" }, {}), S.acceptSandboxFor({ email: "x" }, { IAP_ACCEPT_SANDBOX: "true" })], [false, true], "3i sandbox: off, unless IAP_ACCEPT_SANDBOX is exactly \"true\" (or it is the App Review account, by the hash of its address)");
    t.ok(S.REVIEW_ACCOUNT_SHA256 === "af552e5b3f4529120915257ae8073ff990043c65e6163630d694fe2b6516dc7b" && !/@/.test(read("netlify", "functions", "_lib", "storeSubscriptions.js").replace(/\/\/[^\n]*/g, "")),
      "3j …the review account is matched by its hash, and no address is written in the code");
    t.eq(row({ ownership: "FAMILY_SHARED" }).reason, "family_shared", "3k a Family Sharing purchase does not count (Family Sharing is off; item 5)");
    t.eq([row({ store: "promotional" }).reason, row({ store: "stripe" }).reason, row({ product: "app.flourishmoney.plus.weekly" }).reason, S.storeRowFromSubscriber({ entitlements: {} }, NOW).reason],
      ["not_a_store_purchase", "not_a_store_purchase", "unknown_product", "no_store_purchase"], "3l a promotional grant, RevenueCat's own Stripe, an unknown product and no store purchase at all: nothing");
    t.ok(!("provider_customer_id" in row({}).row) && !("provider_subscription_id" in row({}).row), "3m a store row never touches the Stripe customer or subscription ids");
  }

  // ── 4. One paid state at a time ──────────────────────────────────────────────────────────────
  {
    const paidStripe = { provider: "stripe", status: "active", current_period_end: LATER };
    const paidStore = { provider: "app_store", status: "active", current_period_end: LATER };
    const storePatch = { provider: "play_store", status: "active", current_period_end: LATER };
    t.eq([S.mayReplace(null, storePatch, NOW), S.mayReplace(paidStripe, storePatch, NOW), S.mayReplace({ ...paidStripe, current_period_end: EARLIER }, storePatch, NOW),
      S.mayReplace(paidStore, storePatch, NOW), S.mayReplace(paidStore, { provider: "stripe", status: "active" }, NOW), S.mayReplace(paidStripe, { provider: "stripe", status: "canceled" }, NOW)],
      [true, false, true, true, false, true], "4a a paid row from another provider is never replaced; an unpaid one, or the same provider's, may be");

    // The store sync, a household that already pays on the web: the row keeps the web subscription.
    const admin = fakeAdmin({ subscriptions: [{ user_id: U1, ...paidStripe, provider_customer_id: "cus_1", plan_key: "annual" }] });
    const r = await S.syncStoreSubscription(admin, U1, { fetchSubscriber: async () => subscriber({}), user: { email: "a@example.test" }, now: NOW, env: {} });
    t.eq([r.paid, r.provider, r.conflict, admin.calls.upserts.length, admin.db.subscriptions[0].provider], [true, "stripe", true, 0, "stripe"],
      "4b a store purchase for a household that pays on the web: refused, the row keeps the web subscription, the conflict is reported");
    // A household that pays in the store, then its subscription lapses, then it buys on the web: one row, Stripe.
    const a2 = fakeAdmin({ subscriptions: [{ user_id: U1, ...paidStore, plan_key: "monthly", provider_customer_id: "cus_old" }] });
    const r2 = await S.syncStoreSubscription(a2, U1, { fetchSubscriber: async () => subscriber({}), user: { email: "a@example.test" }, now: NOW, env: {} });
    t.eq([r2.paid, r2.provider, a2.db.subscriptions.length, a2.db.subscriptions[0].provider_customer_id], [true, "app_store", 1, "cus_old"], "4c a store purchase renewing: one row, and the old Stripe customer id is kept for the web's history");
    const a3 = fakeAdmin({ subscriptions: [{ user_id: U1, ...paidStore, plan_key: "monthly" }] });
    const r3 = await S.syncStoreSubscription(a3, U1, { fetchSubscriber: async () => ({ entitlements: {}, subscriptions: {} }), user: { email: "a@example.test" }, now: NOW, env: {} });
    t.eq([r3.paid, a3.db.subscriptions[0].status, a3.db.subscriptions[0].current_period_end], [false, "canceled", new Date(NOW).toISOString()], "4d the store no longer reports it (refunded, or moved to another account): it ends now");

    // The RevenueCat webhook, for a household that pays on the web: acknowledged, recorded, not written.
    process.env.IAP_ENABLED = "true"; process.env.REVENUECAT_WEBHOOK_AUTH = "Bearer test-webhook-auth";
    const wh = require(RC_WH_PATH)._test;
    const a4 = fakeAdmin({ subscriptions: [{ user_id: U1, ...paidStripe }] }, { [U1]: { email: "a@example.test" } });
    const res4 = await wh.handle({ httpMethod: "POST", headers: { authorization: "Bearer test-webhook-auth" }, body: JSON.stringify({ event: { id: "evt1", type: "INITIAL_PURCHASE", app_user_id: U1 } }) },
      { admin: a4, fetchSubscriber: async () => subscriber({}), now: NOW });
    const ev4 = a4.db.billing_events.find((e) => e.event_id === "rc:evt1");
    t.eq([res4.statusCode, JSON.parse(res4.body).conflict, a4.db.subscriptions[0].provider, ev4.status, /refund/.test(ev4.error)], [200, true, "stripe", "ignored", true],
      "4e the webhook for a household that pays on the web: 200, nothing written, recorded as a conflict for support to refund");

    // Stripe checkout, for a household that pays in a store (and one that pays on the web): refused before anything is created.
    process.env.BILLING_ENABLED = "true";
    for (const [who, sub] of [["in the App Store", paidStore], ["on the web already", paidStripe]]) {
      let created = 0;
      const b = loadBilling({ subscriptions: [{ user_id: U1, ...sub }], profiles: [{ user_id: U1 }] }, { onStripe: () => { created++; } });
      const res = await b.handler(post({ action: "create_checkout_session", plan_key: "monthly" }));
      t.eq([res.statusCode, JSON.parse(res.body).error, created], [409, "already_subscribed", 0], `4f a household that pays ${who}: checkout refused, nothing created at Stripe`);
    }

    // The Stripe webhook, for a household that pays in a store: acknowledged as a conflict, the store row kept.
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
    const a5 = fakeAdmin({ subscriptions: [{ user_id: U1, ...paidStore, plan_key: "annual" }] });
    const sw = loadStripeWebhook(a5);
    const evt = { id: "evt_s1", type: "checkout.session.completed", created: Math.floor(NOW / 1000), data: { object: { client_reference_id: U1, metadata: { user_id: U1, plan_key: "monthly" }, customer: "cus_2", subscription: "sub_2" } } };
    const res5 = await sw.handler({ httpMethod: "POST", headers: { "stripe-signature": "ok" }, body: JSON.stringify(evt) });
    t.eq([res5.statusCode, JSON.parse(res5.body).conflict, a5.db.subscriptions[0].provider, a5.db.subscriptions[0].plan_key, a5.db.billing_events[0].status], [200, true, "app_store", "annual", "ignored"],
      "4g a Stripe checkout for a household that pays in a store: the store row is kept, the conflict recorded");
    const a6 = fakeAdmin({ subscriptions: [{ user_id: U1, provider: "app_store", status: "canceled", current_period_end: EARLIER }] });
    const res6 = await loadStripeWebhook(a6).handler({ httpMethod: "POST", headers: { "stripe-signature": "ok" }, body: JSON.stringify({ ...evt, id: "evt_s2" }) });
    t.eq([res6.statusCode, a6.db.subscriptions[0].provider, a6.db.subscriptions[0].status], [200, "stripe", "active"], "4h …once the store subscription is over, the web purchase takes the row");
    t.ok(/user_id\s+uuid primary key references auth\.users/.test(read("supabase", "migrations", "0009_billing_subscriptions.sql")), "4i one row per household is the table's own primary key, so two rows cannot exist");
    restoreEnv();
  }

  // ── 5. The plan answer ───────────────────────────────────────────────────────────────────────
  {
    const free = { plan: "free" };
    const web = { provider: "stripe", status: "active", current_period_end: LATER };
    const store = { provider: "play_store", status: "trialing", current_period_end: LATER };
    const E = (sub, o) => R.deriveEntitlement(free, sub, NOW, o).plan;
    t.eq([E(web, {}), E(store, {})], ["premium", "premium"], "5a the web counts a web purchase and a store purchase alike");
    t.eq([E(web, { native: true }), E(store, { native: true })], ["premium", "premium"], "5b a 1.0.x store build counts both too: one rule for every app since 2026-10-20 (#84)");
    t.eq([E(web, { native: true, storeBilling: true }), E(store, { native: true, storeBilling: true })], ["premium", "premium"], "5c a 1.1 store build that sells counts both: a web subscriber is not asked to pay again");
    t.eq(E({ ...web, current_period_end: EARLIER }, { native: true, storeBilling: true }), "free", "5d period-aware everywhere: a subscription whose period is over counts nowhere");
    // The account trial counts in a selling build too (2026-10-20): it is the only trial, and no store product has one.
    for (const profile of ["free", "premium", "beta_founder", "trial"]) for (const paid of [false, true]) {
      const row = profile === "trial" ? { plan: "trial", trial_ends_at: LATER } : { plan: profile === "premium" ? "plus" : profile, founder_flag: profile === "beta_founder" };
      const server = R.deriveEntitlement(row, paid ? web : null, NOW, { native: true, storeBilling: true }).plan;
      const client = P.storePlan(P.derivePlan(row, NOW), { paid });
      t.eq(client, server, `5e the app's storePlan and the server agree (${profile}, ${paid ? "paid" : "not paid"})`);
    }
    // getUserPlan reads the row for a store build that sells, and only then.
    const reads = [];
    const admin = { from: (tbl) => { reads.push(tbl); const q = { select() { return q; }, eq() { return q; }, maybeSingle: async () => ({ data: tbl === "profiles" ? { plan: "free" } : web, error: null }) }; return q; } };
    const real = require(AUTH_PATH);
    const authMod = { ...real };
    delete require.cache[AUTH_PATH];
    process.env.SUPABASE_URL = "https://example.supabase.test"; process.env.SUPABASE_SECRET_KEY = "test-service-role";
    const A = require(AUTH_PATH);
    const supa = require.resolve("@supabase/supabase-js", { paths: [path.join(REPO, "netlify", "functions")] });
    require.cache[supa] = { id: supa, filename: supa, loaded: true, exports: { createClient: () => admin } };
    delete require.cache[AUTH_PATH];
    const A2 = require(AUTH_PATH);
    const g1 = await A2.getUserPlan("u1", { native: true });
    const r1 = reads.splice(0);
    const g2 = await A2.getUserPlan("u1", { native: true, storeBilling: true });
    const r2 = reads.splice(0);
    t.eq([g1.unlimited, r1, g2.unlimited, r2], [true, ["profiles", "subscriptions"], true, ["profiles", "subscriptions"]], "5f getUserPlan reads and counts the subscription for every request, whatever app asks (2026-10-20)");
    delete require.cache[supa]; delete require.cache[AUTH_PATH]; void A; void authMod;
    restoreEnv();
  }

  // ── 6. The app's purchase flow ───────────────────────────────────────────────────────────────
  {
    const pkg = { product: { identifier: "app.flourishmoney.plus.monthly" } };
    const mk = (o = {}) => { const d = { bought: 0, syncs: 0, slept: 0 };
      d.deps = { serverStatus: async () => o.status || { paid: false }, purchasePackage: async () => { d.bought++; if (o.throws) throw o.throws; },
        serverSync: async () => { d.syncs++; const v = (o.syncs || [{ paid: true, provider: "app_store" }])[Math.min(d.syncs - 1, (o.syncs || [1]).length - 1)]; if (v instanceof Error) throw v; return v; },
        restorePurchases: async () => { if (o.restoreThrows) throw new Error("x"); }, sleep: async () => { d.slept++; } }; return d; };
    let d = mk({ status: { paid: true, provider: "stripe" } });
    t.eq([await C.buy(d.deps, pkg), d.bought], [{ outcome: "already_paid", provider: "stripe" }, 0], "6a a household that already pays on the web is sold nothing: the store sheet never opens");
    d = mk();
    t.eq([(await C.buy(d.deps, pkg)).outcome, d.bought, d.syncs], ["paid", 1, 1], "6b a purchase, then the server's yes");
    d = mk({ syncs: [{ paid: false }, { paid: false }, { paid: true, provider: "app_store" }] });
    t.eq([(await C.buy(d.deps, pkg)).outcome, d.syncs], ["paid", 3], "6c the server's yes can lag the store's sheet: it is waited for");
    d = mk({ syncs: [{ paid: false }] });
    t.eq((await C.buy(d.deps, pkg)).outcome, "unconfirmed", "6d no yes from the server: not treated as paid (\"Check again\" / Restore), whatever the SDK says");
    t.eq([(await C.buy(mk({ throws: { code: "1" } }).deps, pkg)).outcome, (await C.buy(mk({ throws: { userCancelled: true } }).deps, pkg)).outcome, (await C.buy(mk({ throws: { code: "20" } }).deps, pkg)).outcome, (await C.buy(mk({ throws: { code: "2" } }).deps, pkg)).outcome],
      ["cancelled", "cancelled", "pending", "failed"], "6e cancelled, pending (Ask to Buy) and a declined payment are each told apart");
    t.eq((await C.buy(mk({ syncs: [{ paid: true, provider: "stripe", conflict: true }] }).deps, pkg)).outcome, "charged_twice", "6f a second payment that got through anyway: said honestly (charged twice), never shown as a second plan");
    t.eq([(await C.restore(mk().deps)).outcome, (await C.restore(mk({ syncs: [{ paid: false }] }).deps)).outcome, (await C.restore(mk({ restoreThrows: true }).deps)).outcome], ["paid", "nothing_to_restore", "failed"], "6g restore");
    const offerings = { all: { default: { availablePackages: [{ product: { identifier: "app.flourishmoney.plus.monthly" } }, { product: { identifier: "app.flourishmoney.plus.annual" } }] },
      founding: { availablePackages: [{ product: { identifier: "app.flourishmoney.founding.annual" } }] } } };
    const pick = (fa) => Object.fromEntries(Object.entries(C.choosePackages(offerings, { foundingAvailable: fa })).map(([k, v]) => [k, v ? v.product.identifier : null]));
    t.eq([pick(false), pick(true)], [{ monthly: "app.flourishmoney.plus.monthly", annual: "app.flourishmoney.plus.annual", founding: null }, { monthly: "app.flourishmoney.plus.monthly", annual: null, founding: "app.flourishmoney.founding.annual" }],
      "6h the founding annual is offered only when the server says this household may have it, in place of the standard annual");
  }

  // ── 7. The wiring ────────────────────────────────────────────────────────────────────────────
  {
    const APP = read("src", "App.jsx");
    t.ok(!/import\s*\{[^}]*\}\s*from\s*["']@revenuecat\/purchases-capacitor["']/.test(APP), "7a RevenueCat is never a static import, so no other build loads it");
    const fx = APP.slice(APP.indexOf("if(!storeBilling || !user?.id) return;"), APP.indexOf("if(!storeBilling || !user?.id) return;") + 900);
    t.ok(/await import\("@revenuecat\/purchases-capacitor"\)/.test(fx) && /appUserID:user\.id/.test(fx), "7b it loads only inside the store-billing effect, configured with the account's own id");
    t.ok(/const body = JSON\.stringify\(\{ action, \.\.\.params, \.\.\.storeBillingFields\(storeBillingBuild\(\)\) \}\);/.test(APP) && /\.\.\.storeBillingFields\(storeBillingBuild\(\)\),/.test(APP),
      "7c Plaid calls and the coach's chat carry the store-billing mark, and only a selling build adds it");
    t.ok(/if\(!storeBilling \|\| profilePlan===null\) return;\s*const sp = storePlan\(profilePlan, \{ paid: !!user\?\.id && storeAskedFor===user\.id && storeStatus\?\.paid === true \}\);/.test(APP),
      "7d the plan in a selling build is the server's answer for this account only");
    const pkg = JSON.parse(read("package.json"));
    t.ok(/^\^13\./.test(pkg.dependencies["@revenuecat/purchases-capacitor"] || "") && /RevenuecatPurchasesCapacitor"/.test(read("ios", "App", "CapApp-SPM", "Package.swift")) && /:revenuecat-purchases-capacitor'/.test(read("android", "capacitor.settings.gradle") + read("android", "app", "capacitor.build.gradle")),
      "7e @revenuecat/purchases-capacitor 13 is a dependency and registered in both native projects");
    t.ok(/check \(provider in \('stripe', 'app_store', 'play_store'\)\)/.test(read("supabase", "migrations", "0020_store_subscriptions.sql")) && /check \(provider in \('stripe', 'revenuecat'\)\)/.test(read("supabase", "migrations", "0020_store_subscriptions.sql")),
      "7f migration 0020 lets the one row say which store it came from (written, not applied)");
  }

  t.summary("storeBilling.test");

  // ── helpers ──
  function post(body) { return { httpMethod: "POST", headers: { origin: "capacitor://localhost", authorization: "Bearer x" }, body: JSON.stringify(body) }; }
  function loadBilling(db, { onStripe } = {}) {
    delete require.cache[BILLING_PATH]; delete require.cache[AUTH_PATH]; delete require.cache[API_PATH];
    const real = require(AUTH_PATH);
    const admin = fakeAdmin(db, { u1: { email: "someone@example.test" }, [U1]: { email: "someone@example.test" } });
    require.cache[AUTH_PATH].exports = { ...real, getUserFromRequest: async () => ({ user_id: U1, error: null }), getAdminClient: () => admin };
    require.cache[API_PATH] = { id: API_PATH, filename: API_PATH, loaded: true, exports: { stripePost: async () => { if (onStripe) onStripe(); return { id: "cs", url: "https://stripe.test/x" }; } } };
    process.env.STRIPE_PRICE_MONTHLY_CAD = process.env.STRIPE_PRICE_MONTHLY_CAD || "price_monthly_test";
    const mod = require(BILLING_PATH); delete require.cache[BILLING_PATH]; return mod;
  }
  function loadStripeWebhook(admin) {
    delete require.cache[STRIPE_WH_PATH]; delete require.cache[AUTH_PATH]; delete require.cache[SIG_PATH];
    const real = require(AUTH_PATH);
    require.cache[AUTH_PATH].exports = { ...real, getAdminClient: () => admin };
    require.cache[SIG_PATH] = { id: SIG_PATH, filename: SIG_PATH, loaded: true, exports: { verifyStripeSignature: () => ({ ok: true }) } };
    const mod = require(STRIPE_WH_PATH); delete require.cache[STRIPE_WH_PATH]; delete require.cache[SIG_PATH]; return mod;
  }
})();
