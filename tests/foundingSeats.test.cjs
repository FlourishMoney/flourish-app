// tests/foundingSeats.test.cjs
// -----------------------------------------------------------------------------
// THE FIRST 50 HOUSEHOLDS WHO SUBSCRIBE (Amanda's decision, 2026-10-29; migration 0032, _lib/foundingSeats.js).
//
// The founding price goes to the first 50 households who subscribe to it, on the website, the App Store or Google
// Play. A waitlist number no longer grants it. The real billing.js, stripe-webhook.js and revenuecat-webhook.js run
// against a stand-in database whose seats behave as 0032's functions do (tests/foundingSeats.sql.test.cjs runs the
// SQL itself):
//   1  a seat per household whose founding subscription's first payment succeeded, from each of the three: a paid
//      Stripe checkout, an App Store purchase, a Google Play purchase; once each, however often the provider
//      retries; never an unpaid checkout, a regular plan, a sandbox purchase, or a test address;
//   2  a refund gives the seat back: a Stripe charge refunded in full (never a partial one, never a store seat),
//      a store purchase the store refunded;
//   3  the 50 cut-off: with a seat left it is offered, with the live count; at 50 it is gone from the store's plans
//      answer, the website's status and checkout (checked again as the checkout is created); a purchase at the same
//      moment as the last seat is honoured and logged; once full, everything else is as it was before;
//   4  a new account that was never on the waitlist is offered the founding price;
//   5  a test address never is, and never takes a seat.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const { signPayload } = require("../netlify/functions/_lib/stripeSignature.js");

const AUTH_PATH = require.resolve("../netlify/functions/_lib/auth.js");
const API_PATH = require.resolve("../netlify/functions/_lib/stripeApi.js");
const ALERT_PATH = require.resolve("../netlify/functions/_lib/supportAlert.js");
const BILLING_PATH = require.resolve("../netlify/functions/billing.js");
const HOOK_PATH = require.resolve("../netlify/functions/stripe-webhook.js");
const RC_PATH = require.resolve("../netlify/functions/revenuecat-webhook.js");

const NOW = Date.parse("2026-10-29T15:00:00Z");
const LATER = "2027-10-29T15:00:00Z";
const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const isTestDomain = (e) => /@([a-z0-9-]+\.)*(getgrowsmart\.com|flourishmoney\.app)$/.test(String(e || "").replace(/\s+/g, "").toLowerCase());

// The stand-in database. Seats as 0032: one per account, never for a test address, a beta founder or an account
// that does not exist; past 50 recorded with over_cap; a release by provider when one is named.
function makeDb() {
  const db = { users: {}, rows: { subscriptions: [], billing_events: [], profiles: [] }, seats: [], rpcCalls: [] };
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
    };
    return q;
  };
  const heldNow = () => db.seats.filter((s) => !s.released_at).length;
  const rpc = async (name, a = {}) => {
    db.rpcCalls.push(name);
    if (name === "founding_seats_taken") return { data: heldNow(), error: null };
    if (name === "founding_seat_take") {
      const u = db.users[a.p_user_id];
      const excluded = !u || isTestDomain(u.email) || db.rows.profiles.some((p) => p.user_id === a.p_user_id && p.founder_flag);
      if (excluded || db.seats.some((s) => s.user_id === a.p_user_id)) return { data: [{ taken: false, seats: heldNow(), over_cap: false }], error: null };
      const held = heldNow();
      db.seats.push({ user_id: a.p_user_id, provider: a.p_provider, ref: a.p_ref, over_cap: held >= 50, released_at: null });
      return { data: [{ taken: true, seats: held + 1, over_cap: held >= 50 }], error: null };
    }
    if (name === "founding_seat_release") {
      const s = db.seats.find((x) => x.user_id === a.p_user_id && !x.released_at && (!a.p_provider || x.provider === a.p_provider));
      if (!s) return { data: false, error: null };
      s.released_at = new Date(NOW).toISOString(); s.release_reason = a.p_reason;
      return { data: true, error: null };
    }
    if (name === "waitlist_founding_mark_ended") return { data: 0, error: null };
    return { data: null, error: null };   // the waitlist lookup and anything else: no answer
  };
  const admin = { from, rpc, auth: { admin: { getUserById: async (id) => ({ data: { user: db.users[id] || null }, error: null }) } } };
  return { db, admin };
}
const addUser = (D, n, email, { confirmed = true } = {}) => {
  const id = uid(n);
  D.db.users[id] = { id, email, email_confirmed_at: confirmed ? "2026-10-28T00:00:00Z" : null, app_metadata: { email_confirmation: "link" } };
  return id;
};
// `held` seats already taken by other households.
const prefill = (D, held) => { for (let i = 0; i < held; i++) D.db.seats.push({ user_id: `held-${i}`, provider: "stripe", over_cap: false, released_at: null }); };

function loadWith(modPath, D, as) {
  for (const p of [modPath, AUTH_PATH, API_PATH, ALERT_PATH]) delete require.cache[p];
  const real = require(AUTH_PATH);
  require.cache[AUTH_PATH].exports = { ...real, getUserFromRequest: async () => ({ user_id: as, error: null }), getAdminClient: () => D.admin };
  require.cache[API_PATH] = { id: API_PATH, filename: API_PATH, loaded: true, exports: {
    stripeGet: async () => ({ data: [] }),
    stripePost: async (p) => (p === "/customers" ? { id: `cus_${as.slice(-4)}` } : { id: "cs_1", url: "https://stripe.test/pay" }) } };
  require.cache[ALERT_PATH] = { id: ALERT_PATH, filename: ALERT_PATH, loaded: true, exports: { alertSupport: async () => true } };
  const mod = require(modPath);
  for (const p of [modPath, AUTH_PATH, API_PATH, ALERT_PATH]) delete require.cache[p];
  return mod;
}
const call = async (D, as, body, { native = false } = {}) => {
  const b = loadWith(BILLING_PATH, D, as);
  const r = await b.handler({ httpMethod: "POST", headers: native ? { origin: "capacitor://localhost", authorization: "Bearer x" } : { authorization: "Bearer x" }, body: JSON.stringify(body) });
  return { code: r.statusCode, body: JSON.parse(r.body) };
};
const storeStatus = async (D, as) => (await call(D, as, { action: "store_status" }, { native: true })).body;
const webStatus = async (D, as) => (await call(D, as, { action: "status" })).body;
const checkout = async (D, as, plan_key) => (await call(D, as, { action: "create_checkout_session", plan_key })).code;

const T = Math.floor(NOW / 1000);
async function stripeEvent(D, id, type, object, created = T) {
  const hook = loadWith(HOOK_PATH, D, uid(0));
  const body = JSON.stringify({ id, created, type, data: { object } });
  return (await hook.handler({ httpMethod: "POST", headers: { "stripe-signature": signPayload(body, "whsec_seats_test") }, body })).statusCode;
}
const paidCheckout = (user, sub, o = {}) => ({ customer: `cus_${user.slice(-4)}`, subscription: sub, mode: "subscription", payment_status: "paid",
  metadata: { user_id: user, plan_key: "founding_annual" }, ...o });

// RevenueCat's subscriber record for a founding store purchase.
const storeSub = (store, o = {}) => ({ entitlements: {}, subscriptions: { [store === "app_store" ? "app.flourishmoney.founding.annual" : "flourish_plus:founding"]:
  { store, period_type: "normal", expires_date: LATER, is_sandbox: !!o.sandbox, ownership_type: "PURCHASED", refunded_at: o.refunded || null } } });
async function rcEvent(D, id, type, user, subscriber) {
  const wh = loadWith(RC_PATH, D, user)._test;
  const r = await wh.handle({ httpMethod: "POST", headers: { authorization: "Bearer rc-seats-test" }, body: JSON.stringify({ event: { id, type, app_user_id: user } }) },
    { admin: D.admin, fetchSubscriber: async () => subscriber, now: NOW });
  return r.statusCode;
}

(async () => {
  const t = create();
  const saved = { ...process.env };
  Object.assign(process.env, { BILLING_ENABLED: "true", IAP_ENABLED: "true", STRIPE_WEBHOOK_SECRET: "whsec_seats_test", REVENUECAT_WEBHOOK_AUTH: "Bearer rc-seats-test",
    STRIPE_PRICE_MONTHLY_CAD: "price_monthly_1199", STRIPE_PRICE_ANNUAL_CAD: "price_annual_9999", STRIPE_PRICE_FOUNDING_ANNUAL_CAD: "price_founding_7999" });
  delete process.env.IAP_ACCEPT_SANDBOX;
  const logs = [];
  const realError = console.error;
  console.error = (...a) => logs.push(a.join(" "));
  const F = await import("../src/lib/foundingPlans.js");

  try {
    // ── 1. a seat per household that paid, from each of the three ──────────────────────────────────
    {
      const D = makeDb();
      const W = addUser(D, 1, "web.household@example.ca"), I = addUser(D, 2, "iphone.household@example.ca"), A = addUser(D, 3, "android.household@example.ca");
      t.eq(await stripeEvent(D, "evt_w1", "checkout.session.completed", paidCheckout(W, "sub_w")), 200, "1a a paid founding checkout on the website is processed");
      t.eq(D.db.seats.map((s) => [s.user_id, s.provider, s.ref]), [[W, "stripe", "sub_w"]], "1b …and takes a seat, against the account and its Stripe subscription");
      await stripeEvent(D, "evt_w1", "checkout.session.completed", paidCheckout(W, "sub_w"));
      await stripeEvent(D, "evt_w1b", "checkout.session.completed", paidCheckout(W, "sub_w"), T + 5);
      t.eq(D.db.seats.length, 1, "1c a replay, or a second delivery of the same checkout, takes no second seat");

      t.eq(await rcEvent(D, "rc_i1", "INITIAL_PURCHASE", I, storeSub("app_store")), 200, "1d an App Store founding purchase reaches the server from RevenueCat");
      t.eq(await rcEvent(D, "rc_a1", "INITIAL_PURCHASE", A, storeSub("play_store")), 200, "1e …and a Google Play one");
      t.eq(D.db.seats.slice(1).map((s) => [s.user_id, s.provider]), [[I, "app_store"], [A, "play_store"]], "1f each takes a seat on its own store");
      await rcEvent(D, "rc_i2", "RENEWAL", I, storeSub("app_store"));
      await call(D, A, { action: "store_sync" }, { native: true }).catch(() => null);
      t.eq(D.db.seats.length, 3, "1g a renewal, or the app's own check after buying, takes no second seat");

      const L = addUser(D, 4, "late.stripe@example.ca");
      D.db.rows.subscriptions.push({ user_id: L, provider: "stripe", status: "active", plan_key: "founding_annual", provider_subscription_id: "sub_l", last_event_at: new Date(NOW + 60000).toISOString() });
      await stripeEvent(D, "evt_l", "checkout.session.completed", paidCheckout(L, "sub_l"));
      t.eq(D.db.seats.filter((s) => s.user_id === L).length, 1, "1h a checkout that arrives after its subscription's own event (stale for the row) still takes its seat");

      const U = addUser(D, 5, "unpaid@example.ca"), R = addUser(D, 6, "regular@example.ca");
      await stripeEvent(D, "evt_u", "checkout.session.completed", paidCheckout(U, "sub_u", { payment_status: "unpaid" }));
      await stripeEvent(D, "evt_r", "checkout.session.completed", paidCheckout(R, "sub_r", { metadata: { user_id: R, plan_key: "annual" } }));
      const S = addUser(D, 7, "sandbox@example.ca");
      process.env.IAP_ACCEPT_SANDBOX = "true";
      await rcEvent(D, "rc_s", "INITIAL_PURCHASE", S, storeSub("app_store", { sandbox: true }));
      delete process.env.IAP_ACCEPT_SANDBOX;
      t.eq(D.db.seats.filter((s) => [U, R, S].includes(s.user_id)).length, 0, "1i never an unpaid checkout, a regular plan, or a sandbox purchase (the App Review account's)");
      t.eq((await storeStatus(D, addUser(D, 8, "next@example.ca"))).founding.spots_left, 46, "1j four seats held: the next household is told 46 founding spots are left");
    }

    // ── 2. a refund gives the seat back ───────────────────────────────────────────────────────────
    {
      const D = makeDb();
      const W = addUser(D, 1, "web.refund@example.ca"), I = addUser(D, 2, "store.refund@example.ca");
      await stripeEvent(D, "evt_w", "checkout.session.completed", paidCheckout(W, "sub_w"));
      await rcEvent(D, "rc_i", "INITIAL_PURCHASE", I, storeSub("app_store"));
      D.db.rows.subscriptions.find((r) => r.user_id === I).provider_customer_id = "cus_old_web";   // once a web customer
      t.eq(D.db.seats.filter((s) => !s.released_at).length, 2, "(setup) two seats held");
      await stripeEvent(D, "evt_part", "charge.refunded", { id: "ch_1", customer: `cus_${W.slice(-4)}`, amount: 7999, amount_refunded: 2000, refunded: false });
      t.eq(D.db.seats.filter((s) => !s.released_at).length, 2, "2a a partial refund changes nothing");
      await stripeEvent(D, "evt_other", "charge.refunded", { id: "ch_2", customer: "cus_old_web", amount: 1199, amount_refunded: 1199, refunded: true });
      t.eq(D.db.seats.find((s) => s.user_id === I).released_at, null, "2b a Stripe refund never frees a store purchase's seat");
      t.eq(await stripeEvent(D, "evt_full", "charge.refunded", { id: "ch_3", customer: `cus_${W.slice(-4)}`, amount: 7999, amount_refunded: 7999, refunded: true }), 200, "2c a Stripe charge refunded in full is processed");
      t.eq([D.db.seats.find((s) => s.user_id === W).release_reason, D.db.seats.filter((s) => !s.released_at).length], ["refund", 1], "2d …and the website household's seat goes back");
      await rcEvent(D, "rc_ref", "CANCELLATION", I, storeSub("app_store", { refunded: "2026-10-29T16:00:00Z" }));
      t.eq([D.db.seats.find((s) => s.user_id === I).release_reason, D.db.seats.filter((s) => !s.released_at).length], ["refund", 0], "2e a store refund gives the store household's seat back");
      t.eq(D.db.rows.subscriptions.find((r) => r.user_id === I).status, "canceled", "2f …and its subscription is over, as before");
      await rcEvent(D, "rc_ref2", "CANCELLATION", I, storeSub("app_store", { refunded: "2026-10-29T16:00:00Z" }));
      t.eq(D.db.seats.length, 2, "2g a repeat of the refund changes nothing, and no seat is taken again");
    }

    // ── 3. the 50 cut-off ─────────────────────────────────────────────────────────────────────────
    {
      const D = makeDb();
      prefill(D, 49);
      const N = addUser(D, 1, "household.fifty@example.ca"), M = addUser(D, 2, "household.fiftyone@example.ca"), X = addUser(D, 3, "same.moment@example.ca");
      const s49 = await storeStatus(D, N);
      t.eq([s49.founding.available, s49.founding.spots_left], [true, 1], "3a 49 seats held: offered in the app, with 1 spot left");
      t.eq([(await webStatus(D, M)).founding.available, await checkout(D, M, "founding_annual")], [true, 200], "3b …and on the website, whose founding checkout opens");
      await rcEvent(D, "rc_50", "INITIAL_PURCHASE", N, storeSub("play_store"));
      t.eq(D.db.seats.filter((s) => !s.released_at).length, 50, "3c the 50th seat is taken (Google Play)");

      const full = await storeStatus(D, M);
      t.eq([full.founding.available, full.founding.spots_left, full.founding.held_on_regular_plan], [false, null, null], "3d at 50 the app's plans answer offers it to nobody");
      t.eq(F.foundingPlansAutoOpen({ storeBilling: true, userId: M, askedFor: M, status: full, planKnown: true, inApp: true, shown: false }), false, "3e …so the plans screen does not open by itself");
      t.eq(F.paywallPlanOrder({ monthly: { id: "m" }, annual: { id: "a" }, founding: null }).map(([p]) => p), ["monthly", "annual"], "3f …and the plans are Monthly and Annual, in their old order");
      t.eq((await webStatus(D, M)).founding.available, false, "3g the website's status offers it to nobody");
      t.eq(await checkout(D, M, "founding_annual"), 403, "3h a founding checkout is refused, checked again as it is created (the screen opened while a seat was left)");
      t.eq([await checkout(D, M, "annual"), await checkout(D, M, "monthly")], [200, 200], "3i the regular annual and monthly checkouts open as before");
      t.eq(Object.keys(full).sort().join(","), "conflict,conflict_kind,enabled,founding,paid,period_end,plan_key,provider,web_attention", "3j the store's answer has the shape it had before");

      logs.length = 0;
      await rcEvent(D, "rc_x", "INITIAL_PURCHASE", X, storeSub("app_store"));
      const sx = D.db.seats.find((s) => s.user_id === X);
      t.ok(!!sx && sx.over_cap === true, "3k a store purchase at the same moment as the last seat is honoured: its seat is recorded, over the cap");
      t.eq([D.db.rows.subscriptions.find((r) => r.user_id === X).plan_key, D.db.rows.subscriptions.find((r) => r.user_id === X).status], ["founding_annual", "active"], "3l …the household has what it paid for");
      t.eq(D.db.rows.subscriptions.find((r) => r.user_id === X).support_flag, "founding_not_eligible", "3m …and support is told (founding_not_eligible)");
      t.ok(logs.some((l) => /\[founding-seat\] over the cap/.test(l)), "3n …and it is logged");
      t.ok(!logs.some((l) => l.includes("same.moment@") || l.includes(X)), "3o (no log line holds the address or the account id)");

      logs.length = 0;
      await stripeEvent(D, "evt_m", "checkout.session.completed", paidCheckout(M, "sub_m"));
      t.ok(D.db.seats.find((s) => s.user_id === M)?.over_cap === true && logs.some((l) => /over the cap/.test(l)), "3p a web checkout opened at seat 49 that completes after seat 50 is honoured and logged the same way");
      t.eq(D.db.seats.filter((s) => !s.released_at).length, 52, "3q the count says 52: two past the cap, each explained");
    }

    // ── 4. a new account never on the waitlist ────────────────────────────────────────────────────
    {
      const D = makeDb();
      const NEW = addUser(D, 1, "brand.new@example.ca");
      const s = await storeStatus(D, NEW);
      t.eq([s.founding.available, s.founding.spots_left], [true, 50], "4a a new account, never on the waitlist, confirmed: offered the founding price, 50 spots left");
      t.eq(F.foundingPlansAutoOpen({ storeBilling: true, userId: NEW, askedFor: NEW, status: s, planKnown: true, inApp: true, shown: false }), true, "4b …so the plans screen opens by itself for it (1.1.3)");
      t.eq(D.db.rpcCalls.filter((n) => /waitlist/.test(n)).length, 0, "4c no waitlist lookup is made to decide it");
      const unconfirmed = addUser(D, 2, "not.yet@example.ca", { confirmed: false });
      t.eq((await storeStatus(D, unconfirmed)).founding.available, false, "4d an account whose address is not confirmed yet is not");
    }

    // ── 5. test addresses ─────────────────────────────────────────────────────────────────────────
    {
      const D = makeDb();
      for (const [n, e] of [[1, "qa@getgrowsmart.com"], [2, "staff@mail.flourishmoney.app"], [3, " QA@GetGrowSmart.com "]]) {
        const id = addUser(D, n, e);
        const s = await storeStatus(D, id);
        t.eq([s.founding.available, await checkout(D, id, "founding_annual")], [false, 403], `5a a test address (${e.trim()}) is never offered the founding price`);
        await rcEvent(D, `rc_t${n}`, "INITIAL_PURCHASE", id, storeSub("app_store"));
      }
      t.eq(D.db.seats.length, 0, "5b …and a founding purchase by one takes no seat");
    }
  } finally {
    console.error = realError;
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  }
  t.summary("foundingSeats.test");
})();
