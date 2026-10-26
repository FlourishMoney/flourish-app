// tests/storeReviewFixes.test.cjs
// -----------------------------------------------------------------------------
// VERSION 1.1, ITEM 9: THE ADVERSARIAL REVIEW OF THIS BRANCH, AND WHAT WAS FIXED.
//
// One check per finding, each driven against the real code:
//   H1 a web subscription Stripe is still collecting (past_due) is never sold a store purchase on top, and a Stripe
//      event can no longer write over a store row, however the row is found
//   H2 a purchase that conflicts after the store's sheet is said honestly: charged twice, how to get a refund
//   H3 one Android subscription for all three prices; two live store subscriptions are flagged; no buying while a
//      purchase is pending or unconfirmed
//   H4 a second household signing in on the same phone never buys under the first one's store account
//   M1 a founding purchase the server did not offer is flagged for support
//   M2 a store founding subscription that lapses is marked ended, and account deletion marks a store one too
//   M3 no answer from the server is never "not paid" at the moment of selling; a failed read is a 503
//   M4 an unpaid store record never writes over another provider's row (no false conflict, no broken ordering)
//   M5 the last definite answer stands in while there is none; the status is asked again (backoff, back online)
//   M6 the website's delete confirmation says where a store subscription is cancelled
//   M7 a failed purchase never claims nothing was charged
//   L1 a promotional grant never stands in for, or cancels, a real store purchase
//   L2 an event for a deleted account is recorded without the user_id foreign key
//   L3 checkout's "already subscribed" has its own words
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
const SIG_PATH = require.resolve("../netlify/functions/_lib/stripeSignature.js");
const S = require("../netlify/functions/_lib/storeSubscriptions.js");

const NOW = Date.parse("2026-11-15T12:00:00Z");
const LATER = "2026-12-15T12:00:00Z", EARLIER = "2026-11-01T12:00:00Z";
const U1 = "11111111-1111-4111-8111-111111111111";

const storeSub = (o = {}) => ({ subscriptions: { [o.key || "app.flourishmoney.plus.monthly"]: { store: o.store || "app_store", period_type: o.period || "normal", expires_date: o.expires || LATER,
  is_sandbox: false, ownership_type: "PURCHASED", refunded_at: null, unsubscribe_detected_at: null, product_plan_identifier: o.plan || null }, ...(o.more || {}) }, entitlements: o.ent || {} });

function fakeAdmin(db = {}, { readError = null } = {}) {
  const calls = { upserts: [], rpcs: [] };
  const table = (n) => (db[n] = db[n] || []);
  const from = (name) => {
    const f = [];
    const rows = () => table(name).filter((r) => f.every(([c, v]) => r[c] === v));
    const q = {
      select() { return q; }, eq(c, v) { f.push([c, v]); return q; },
      async maybeSingle() { if (readError && name === "subscriptions") return { data: null, error: { message: readError } }; return { data: rows()[0] ? { ...rows()[0] } : null, error: null }; },
      upsert(payload, opts) { calls.upserts.push({ ...payload }); const key = (opts && opts.onConflict) || "user_id"; const i = table(name).findIndex((r) => r[key] === payload[key]);
        if (i >= 0) table(name)[i] = { ...table(name)[i], ...payload }; else table(name).push({ ...payload }); return Promise.resolve({ error: null }); },
      insert(payload) { const dup = table(name).some((r) => r.event_id && r.event_id === payload.event_id); if (!dup) table(name).push({ ...payload, attempts: 1 });
        return { select: async () => ({ data: dup ? [] : [{ event_id: payload.event_id }], error: null }) }; },
      update(patch) { return { eq: async (c, v) => { table(name).filter((r) => r[c] === v).forEach((r) => Object.assign(r, patch)); return { error: null }; } }; },
    };
    return q;
  };
  return { from, rpc: async (fn, args) => { calls.rpcs.push({ fn, args }); return { data: null, error: null }; },
    auth: { admin: { getUserById: async () => ({ data: { user: { email: "someone@example.test" } }, error: null }) } }, calls, db };
}

(async () => {
  const t = create();
  const C = await import("../src/lib/storeBilling.js");
  const O = await import("../src/lib/storeOffer.js");
  const V = await import("../src/lib/billingVisibility.js");
  const APP = read("src", "App.jsx");
  const saved = { ...process.env };
  const restoreEnv = () => { for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k]; Object.assign(process.env, saved); };
  const sync = (admin, sub, extra = {}) => S.syncStoreSubscription(admin, U1, { fetchSubscriber: async () => sub, user: { email: "someone@example.test" }, now: NOW, env: {}, ...extra });

  // ── H1 ──────────────────────────────────────────────────────────────────────────────────────
  {
    const pastDue = { user_id: U1, provider: "stripe", status: "past_due", current_period_end: EARLIER, provider_subscription_id: "sub_123", provider_customer_id: "cus_1" };
    t.eq([S.isLiveRow(pastDue, NOW), S.mayReplace(pastDue, { provider: "app_store", status: "active", current_period_end: LATER }, NOW)], [true, false],
      "H1a a past_due web subscription is live: a store purchase may not replace it");
    const a = fakeAdmin({ subscriptions: [{ ...pastDue }] });
    const r = await sync(a, storeSub());
    t.eq([r.conflict, r.conflictKind, a.calls.upserts.length, a.db.subscriptions[0].provider], [true, "web_needs_attention", 0, "stripe"], "H1b …the store sync refuses it and keeps the web row");
    process.env.IAP_ENABLED = "true";
    const st = JSON.parse((await loadBilling({ subscriptions: [{ ...pastDue }] }).handler(post({ action: "store_status" }))).body);
    t.eq([st.paid, st.web_attention, st.founding.available], [false, true, false], "H1c store_status: not paid (no access), but web_attention, so the app sells nothing");
    let bought = 0;
    const out = await C.buy({ serverStatus: async () => st, purchasePackage: async () => { bought++; }, serverSync: async () => ({ paid: true }) }, { product: { identifier: "x" } });
    t.eq([out.outcome, bought], ["web_attention", 0], "H1d …and buy() never opens the store's sheet");
    process.env.BILLING_ENABLED = "true"; process.env.STRIPE_PRICE_MONTHLY_CAD = "price_m";
    const co = await loadBilling({ subscriptions: [{ ...pastDue }], profiles: [{ user_id: U1 }] }).handler(post({ action: "create_checkout_session", plan_key: "monthly" }));
    t.eq([co.statusCode, JSON.parse(co.body).error], [409, "already_subscribed"], "H1e web checkout refuses a second subscription while the first is past_due");
    // A store row that replaced a dead web row drops the Stripe subscription id, and the webhook refuses a store row however it finds it.
    const dead = fakeAdmin({ subscriptions: [{ ...pastDue, status: "canceled" }] });
    await sync(dead, storeSub());
    t.eq([dead.db.subscriptions[0].provider, dead.db.subscriptions[0].provider_subscription_id, dead.db.subscriptions[0].provider_customer_id], ["app_store", null, "cus_1"],
      "H1f a store purchase after the web one ended: the Stripe subscription id is cleared (the customer id kept)");
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
    const w = fakeAdmin({ subscriptions: [{ user_id: U1, provider: "app_store", status: "active", current_period_end: LATER, provider_subscription_id: "sub_123" }] });
    const evt = { id: "evt_h1", type: "customer.subscription.updated", created: Math.floor(NOW / 1000), data: { object: { id: "sub_123", status: "active", metadata: { user_id: U1, plan_key: "monthly" }, customer: "cus_1", items: { data: [] } } } };
    const wr = await loadStripeWebhook(w).handler({ httpMethod: "POST", headers: { "stripe-signature": "ok" }, body: JSON.stringify(evt) });
    t.eq([JSON.parse(wr.body).conflict, w.db.subscriptions[0].provider], [true, "app_store"], "H1g a Stripe event that finds a paid store row by its old subscription id is refused");
    restoreEnv();
  }

  // ── H2, M7 ──────────────────────────────────────────────────────────────────────────────────
  {
    const r = await C.confirmWithServer({ serverSync: async () => ({ paid: true, provider: "stripe", conflict: true }), sleep: async () => {} });
    t.eq(r.outcome, "charged_twice", "H2a a conflict after the store's sheet is 'charged twice', not 'already paid'");
    t.ok(/the store took this purchase as well/.test(O.PAYWALL_COPY.outcomes.charged_twice) && /reportaproblem\.apple\.com/.test(O.PAYWALL_COPY.outcomes.charged_twice) && !/nothing was charged/i.test(O.PAYWALL_COPY.outcomes.charged_twice),
      "H2b …said honestly, with how to ask for a refund, and never 'nothing was charged'");
    t.ok(!/nothing was charged/i.test(O.PAYWALL_COPY.outcomes.failed) && /If you see a charge for it, tap Restore purchases\./.test(O.PAYWALL_COPY.outcomes.failed), "M7 a failed purchase never claims nothing was charged");
    t.ok(/nothing was bought here/.test(O.PAYWALL_COPY.outcomes.already_paid), "M7b 'nothing was bought' only where the sheet never opened");
  }

  // ── H3 ──────────────────────────────────────────────────────────────────────────────────────
  {
    t.eq(Object.values(C.PRODUCT_IDS.android).map((id) => id.split(":")[0]), ["flourish_plus", "flourish_plus", "flourish_plus"], "H3a Android: all three prices are base plans of one subscription, so Google never holds two");
    t.eq(S.planKeyFor("flourish_plus", "founding"), "founding_annual", "H3b …the founding price is the 'founding' base plan");
    const two = storeSub({ more: { "app.flourishmoney.plus.annual": { store: "app_store", period_type: "normal", expires_date: LATER, ownership_type: "PURCHASED" } } });
    const a = fakeAdmin({ subscriptions: [] });
    const r = await sync(a, two);
    t.eq([S.storeRowFromSubscriber(two, NOW).activeCount, r.flag, r.paid], [2, "two_store_subscriptions", true], "H3c two live store subscriptions: still paid, flagged for support");
    const sp = APP.slice(APP.indexOf("function StorePaywall("), APP.indexOf("function Paywall("));
    t.ok(/const waiting = outcome==="pending" \|\| outcome==="unconfirmed";/.test(sp) && /disabled=\{!!busy \|\| waiting\}/.test(sp) && /\{waiting&&<button onClick=\{doCheck\}/.test(sp),
      "H3d while a purchase is pending or unconfirmed, nothing more can be bought; 'Check again' asks the server");
  }

  // ── H4 ──────────────────────────────────────────────────────────────────────────────────────
  {
    const fx = APP.slice(APP.indexOf("// A new account, or none: nothing can be bought until RevenueCat is this account."), APP.indexOf("RevenueCat unavailable:"));
    const order = ["purchasesRef.current = null; setStorePurchases(null);", "if(!storeBilling || !user?.id) return;", "await Purchases.logIn({ appUserID:user.id });",
      "const { appUserID } = await Purchases.getAppUserID();", "if(appUserID !== user.id) throw new Error(", "purchasesRef.current = Purchases; setStorePurchases(()=>Purchases);"].map((s) => fx.indexOf(s));
    t.ok(order.every((i, k) => i >= 0 && (k === 0 || i > order[k - 1])),
      "H4 on every change of account the store handle is dropped first, and set again only once RevenueCat says it is this account (a failed logIn sells nothing)");
    t.ok(/if\(!purchases\) throw new Error\("store_unavailable"\);/.test(APP), "H4b …and with no handle the paywall cannot open the store's sheet");
  }

  // ── M1, M2 ──────────────────────────────────────────────────────────────────────────────────
  {
    const a = fakeAdmin({ subscriptions: [] });
    const r = await sync(a, storeSub({ key: "app.flourishmoney.founding.annual" }), { mayBuyFounding: async () => false });
    t.eq([r.paid, r.plan_key, r.flag], [true, "founding_annual", "founding_not_eligible"], "M1 a founding purchase the server never offered: it counts (paid), and support is told");
    const ok = await sync(fakeAdmin({ subscriptions: [] }), storeSub({ key: "app.flourishmoney.founding.annual" }), { mayBuyFounding: async () => true });
    t.eq(ok.flag, null, "M1b …an eligible household is not flagged");
    const lapsed = fakeAdmin({ subscriptions: [{ user_id: U1, provider: "app_store", status: "active", plan_key: "founding_annual", current_period_end: EARLIER }] });
    await sync(lapsed, storeSub({ key: "app.flourishmoney.founding.annual", expires: EARLIER }));
    t.ok(!!lapsed.db.subscriptions[0].founding_ended_at && lapsed.calls.rpcs.some((c) => c.fn === "waitlist_founding_mark_ended"),
      "M2 a store founding subscription whose period ended before the sync is still marked ended, on the account and the waitlist number");
    const plaid = read("netlify", "functions", "plaid.js");
    t.ok(/\.select\("provider, provider_subscription_id, (provider_customer_id, )?status, plan_key"\)/.test(plaid) && /if \(allSubs\.some\(r => r && r\.plan_key === "founding_annual"/.test(plaid),
      "M2b account deletion marks a store founding subscription ended too (only Stripe ones are cancelled there)");
  }

  // ── M3, M4 ──────────────────────────────────────────────────────────────────────────────────
  {
    let bought = 0;
    const r = await C.buy({ serverStatus: async () => null, purchasePackage: async () => { bought++; }, serverSync: async () => ({ paid: true }) }, { product: { identifier: "x" } });
    t.eq([r.outcome, r.reason, bought], ["failed", "status_unavailable", 0], "M3a no answer from the server: nothing is sold");
    process.env.IAP_ENABLED = "true";
    const res = await loadBilling({ subscriptions: [] }, { readError: "connection reset" }).handler(post({ action: "store_status" }));
    t.eq(res.statusCode, 503, "M3b a failed read is a 503, never 'not paid'");
    restoreEnv();
    const web = fakeAdmin({ subscriptions: [{ user_id: U1, provider: "stripe", status: "active", current_period_end: LATER, last_event_at: "2026-11-10T00:00:00Z" }] });
    const r2 = await sync(web, storeSub({ expires: EARLIER }));
    t.eq([r2.conflict, web.calls.upserts.length, web.db.subscriptions[0].last_event_at], [false, 0, "2026-11-10T00:00:00Z"], "M4 an old, unpaid store record for a web subscriber: nothing written, no false conflict, the web row's ordering untouched");
  }

  // ── M5 ──────────────────────────────────────────────────────────────────────────────────────
  {
    const m = new Map();
    const st = { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
    C.rememberGate(st, U1, false, null, NOW);
    t.eq([C.recalledGate(st, U1, NOW + 9e9), C.recalledGate(st, "someone-else", NOW)], [false, null], "M5a a known 'not entitled' stands in offline (for this account only)");
    C.rememberGate(st, U1, true, LATER, NOW);
    t.eq([C.recalledGate(st, U1, NOW), C.recalledGate(st, U1, Date.parse(LATER) + 1)], [true, null], "M5b a known 'entitled' stands in only until its paid period ends");
    C.rememberGate(st, U1, true, null, NOW);
    t.eq([C.recalledGate(st, U1, NOW + 2 * 86400000), C.recalledGate(st, U1, NOW + 4 * 86400000)], [true, null], "M5c …or three days when the period is not known");
    t.ok(C.STORE_GATE_KEY.startsWith("flourish_"), "M5d the record is under the flourish_ prefix, so signing out removes it");
    t.ok(/const wait = \[5000, 20000, 60000\]\[attempt\];/.test(APP) && /window\.addEventListener\("online", onOnline\);/.test(APP), "M5e the status is asked again after 5, 20 and 60 seconds, and when the network comes back");
  }

  // ── M6, L1, L2, L3 ──────────────────────────────────────────────────────────────────────────
  {
    t.ok(/provider: row \? row\.provider \|\| "stripe" : null,/.test(read("netlify", "functions", "billing.js")), "M6 the website's status says where the subscription is, so its delete confirmation can name the store");
    const promo = { subscriptions: { "app.flourishmoney.plus.monthly": { store: "app_store", period_type: "normal", expires_date: LATER, ownership_type: "PURCHASED" }, promo_plus: { store: "promotional", expires_date: "2027-12-01T00:00:00Z" } },
      entitlements: { plus: { product_identifier: "promo_plus", expires_date: "2027-12-01T00:00:00Z" } } };
    const a = fakeAdmin({ subscriptions: [{ user_id: U1, provider: "app_store", status: "active", plan_key: "monthly", current_period_end: LATER }] });
    const r = await sync(a, promo);
    t.eq([r.paid, a.db.subscriptions[0].status, a.db.subscriptions[0].plan_key], [true, "active", "monthly"], "L1 a promotional grant never stands in for, or cancels, the real store purchase");
    const wh = read("netlify", "functions", "revenuecat-webhook.js");
    t.ok(/customer_id: isUuid\(evt\.app_user_id\) \? evt\.app_user_id : null,/.test(wh) && !/user_id: isUuid\(evt\.app_user_id\)/.test(wh), "L2 an event's account is recorded as text, so a deleted account never fails the insert");
    t.eq(V.checkoutErrorText({ status: 409, error: "already_subscribed" }), "This account already has a subscription.", "L3 checkout's 'already subscribed' has its own words");
  }

  t.summary("storeReviewFixes.test");

  function post(body) { return { httpMethod: "POST", headers: { origin: "capacitor://localhost", authorization: "Bearer x" }, body: JSON.stringify(body) }; }
  function loadBilling(db, opts = {}) {
    delete require.cache[BILLING_PATH]; delete require.cache[AUTH_PATH]; delete require.cache[API_PATH];
    const real = require(AUTH_PATH);
    const admin = fakeAdmin(db, opts);
    require.cache[AUTH_PATH].exports = { ...real, getUserFromRequest: async () => ({ user_id: U1, error: null }), getAdminClient: () => admin };
    require.cache[API_PATH] = { id: API_PATH, filename: API_PATH, loaded: true, exports: { stripeGet: async () => ({ data: [] }), stripePost: async () => ({ id: "cs", url: "https://stripe.test/x" }) } };
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
