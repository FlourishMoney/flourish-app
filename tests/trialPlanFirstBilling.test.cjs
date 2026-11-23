// tests/trialPlanFirstBilling.test.cjs
// -----------------------------------------------------------------------------
// TRIAL_PLAN_FIRST, ITEM 1: the plans come first and say, above each plan's button, what the 14 days are.
//   2a-2h  the website's checkout: 14 days free with a card required up front, only for an account that never had a
//          subscription, never on terms the screen did not show, and exactly as before with the switch off;
//   2i-2n  a founding trial cancelled before its first charge gives its seat back, on the website and in the stores,
//          and the founding price is not marked as ended for it; one that was paid is unchanged;
//   2o     a Stripe trial's start is heard (customer.subscription.created) only while the switch is on;
//   2p     0046.
// The real billing.js, stripe-webhook.js and storeSubscriptions.js run against a stand-in database, as in
// tests/foundingSeats.test.cjs. Synthetic data only.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");
const { signPayload } = require("../netlify/functions/_lib/stripeSignature.js");

const REPO = path.join(__dirname, "..");
const AUTH_PATH = require.resolve("../netlify/functions/_lib/auth.js");
const API_PATH = require.resolve("../netlify/functions/_lib/stripeApi.js");
const ALERT_PATH = require.resolve("../netlify/functions/_lib/supportAlert.js");
const BILLING_PATH = require.resolve("../netlify/functions/billing.js");
const HOOK_PATH = require.resolve("../netlify/functions/stripe-webhook.js");
const SINCE = "2026-11-13T15:00:00Z";
const NOW = Date.parse("2026-11-20T15:00:00Z");
const T = Math.floor(NOW / 1000);
const DAY = 86400;
const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function makeDb() {
  const db = { users: {}, rows: { subscriptions: [], billing_events: [], profiles: [] }, seats: [], rpcCalls: [], stripe: [] };
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
    if (name === "purchase_attempt_begin") return { data: { result: "held" }, error: null };
    db.rpcCalls.push([name, a]);
    if (name === "founding_seats_taken") return { data: heldNow(), error: null };
    if (name === "founding_seat_take") {
      if (db.seats.some((s) => s.user_id === a.p_user_id)) return { data: [{ taken: false, seats: heldNow(), over_cap: false }], error: null };
      db.seats.push({ user_id: a.p_user_id, provider: a.p_provider, released_at: null });
      return { data: [{ taken: true, seats: heldNow(), over_cap: false }], error: null };
    }
    if (name === "founding_seat_release") {
      if (db.refuseTrialReason && a.p_reason === "trial_ended_unpaid") return { data: null, error: { code: "23514", message: "check violation" } };
      const s = db.seats.find((x) => x.user_id === a.p_user_id && !x.released_at && (!a.p_provider || x.provider === a.p_provider));
      if (!s) return { data: false, error: null };
      s.released_at = new Date(NOW).toISOString(); s.release_reason = a.p_reason;
      return { data: true, error: null };
    }
    return { data: null, error: null };
  };
  const admin = { from, rpc, auth: { admin: { getUserById: async (id) => ({ data: { user: db.users[id] || null }, error: null }) } } };
  return { db, admin };
}
const addUser = (D, n, { started = Date.parse(SINCE) + DAY * 1000 } = {}) => {
  const id = uid(n);
  D.db.users[id] = { id, email: `household${n}@example.ca`, email_confirmed_at: "2026-11-01T00:00:00Z", app_metadata: { email_confirmation: "link" } };
  D.db.rows.profiles.push({ user_id: id, plan: "trial", founder_flag: false, trial_started_at: new Date(started).toISOString() });
  return id;
};

function loadWith(modPath, D, as, { everSubs = [], listFails = false } = {}) {
  for (const p of [modPath, AUTH_PATH, API_PATH, ALERT_PATH]) delete require.cache[p];
  const real = require(AUTH_PATH);
  require.cache[AUTH_PATH].exports = { ...real, getUserFromRequest: async () => ({ user_id: as, error: null }), getAdminClient: () => D.admin };
  require.cache[API_PATH] = { id: API_PATH, filename: API_PATH, loaded: true, exports: {
    stripeGet: async (p) => {
      D.db.stripe.push(["GET", p]);
      if (/^\/subscriptions\/sub_/.test(p)) return D.db.subs && D.db.subs[p.split("/").pop()] ? D.db.subs[p.split("/").pop()] : { status: "active" };
      if (/^\/subscriptions\?customer=/.test(p) && /limit=1$/.test(p)) { if (listFails) { const e = new Error("down"); e.statusCode = 500; throw e; } return { data: everSubs }; }
      return { data: [] };
    },
    stripePost: async (p, body) => { D.db.stripe.push(["POST", p, body]); return p === "/customers" ? { id: `cus_${as.slice(-4)}` } : { id: "cs_1", url: "https://stripe.test/pay" }; } } };
  require.cache[ALERT_PATH] = { id: ALERT_PATH, filename: ALERT_PATH, loaded: true, exports: { alertSupport: async () => true } };
  const mod = require(modPath);
  for (const p of [modPath, AUTH_PATH, API_PATH, ALERT_PATH]) delete require.cache[p];
  return mod;
}
const checkout = async (D, as, plan_key, extra = {}, opts) => {
  const r = await loadWith(BILLING_PATH, D, as, opts).handler({ httpMethod: "POST", headers: { authorization: "Bearer x" }, body: JSON.stringify({ action: "create_checkout_session", plan_key, ...extra }) });
  return { code: r.statusCode, body: JSON.parse(r.body) };
};
const sessionOf = (D) => { const c = D.db.stripe.filter((x) => x[0] === "POST" && x[1] === "/checkout/sessions"); return c.length ? c[c.length - 1][2] : null; };
async function stripeEvent(D, id, type, object, created = T) {
  const hook = loadWith(HOOK_PATH, D, uid(0));
  const body = JSON.stringify({ id, created, type, data: { object } });
  return (await hook.handler({ httpMethod: "POST", headers: { "stripe-signature": signPayload(body, "whsec_trial_test") }, body })).statusCode;
}
const ON = { TRIAL_PLAN_FIRST: "true", TRIAL_PLAN_FIRST_SINCE: SINCE };

(async () => {
  const t = create();
  const saved = { ...process.env };
  const realError = console.error; const logs = []; console.error = (...a) => logs.push(a.join(" "));
  const base = { BILLING_ENABLED: "true", IAP_ENABLED: "true", STRIPE_WEBHOOK_SECRET: "whsec_trial_test",
    STRIPE_PRICE_MONTHLY_CAD: "price_monthly_1199", STRIPE_PRICE_ANNUAL_CAD: "price_annual_9999", STRIPE_PRICE_FOUNDING_ANNUAL_CAD: "price_founding_7999" };
  const env = (o = {}) => { for (const k of ["TRIAL_PLAN_FIRST", "TRIAL_PLAN_FIRST_SINCE"]) delete process.env[k]; Object.assign(process.env, base, o); };
  try {
    // ── 2a-2h the website's checkout ───────────────────────────────────────────────────────────────
    {
      env(ON);
      let D = makeDb(); let U = addUser(D, 1);
      let r = await checkout(D, U, "monthly", { trial: true });
      let s = sessionOf(D);
      t.eq(r.code, 200, "2a on: a new account that never subscribed gets a checkout");
      t.eq([s.subscription_data.trial_period_days, s.payment_method_collection, s.subscription_data.trial_settings], [14, "always", { end_behavior: { missing_payment_method: "cancel" } }],
        "2b …with 14 days free, a card required up front, and cancelled (never left unpaid) if the card is removed");
      t.eq([s.mode, s.line_items[0].price, s.subscription_data.metadata.plan_key], ["subscription", "price_monthly_1199", "monthly"], "2c …for the plan's own price: charged at day 14");

      D = makeDb(); U = addUser(D, 1);
      r = await checkout(D, U, "monthly", { trial: false });
      t.eq([r.code, r.body.error, r.body.trial, sessionOf(D)], [409, "trial_changed", true, null], "2d the screen showed no trial but one applies: nothing created, and the screen is told");
      D = makeDb(); U = addUser(D, 1);
      r = await checkout(D, U, "monthly", {});
      t.eq([r.code, sessionOf(D)], [409, null], "2e …and a request that says nothing about the trial is refused the same way");

      D = makeDb(); U = addUser(D, 1);
      r = await checkout(D, U, "annual", { trial: true }, { everSubs: [{ id: "sub_old", status: "canceled" }] });
      t.eq([r.code, r.body.error, r.body.trial, sessionOf(D)], [409, "trial_changed", false, null], "2f a customer Stripe says had a subscription before: no trial, and a screen that showed one is stopped");
      D = makeDb(); U = addUser(D, 1);
      r = await checkout(D, U, "annual", { trial: false }, { everSubs: [{ id: "sub_old", status: "canceled" }] });
      s = sessionOf(D);
      t.eq([r.code, s && s.subscription_data.trial_period_days, s && s.payment_method_collection], [200, undefined, undefined], "2g …and with the plain price shown, the checkout charges as before, no trial");

      // ── The real-world proof, 2026-11-23 (step 1A.2, Stripe test mode, a real database): the trial was LOST by
      // anyone who opened checkout once and came back. The first checkout makes the subscriptions row that holds the
      // Stripe customer (billing.js ensureCustomer), and the DATABASE gives that row its default status, "incomplete"
      // (migration 0009). The rule read "no status" as "never subscribed", so on the way back the screen said
      // "$11.99 a month, charged today" and a checkout that asked for the trial was refused. The stand-in database
      // here applies no column default, which is why no test saw it: this block puts the default on, as Postgres does.
      const m0009 = fs.readFileSync(path.join(REPO, "supabase", "migrations", "0009_billing_subscriptions.sql"), "utf8");
      const DEFAULT_STATUS = (m0009.match(/^\s*status\s+text\s+not null default '([a-z_]+)'/m) || [])[1];
      t.eq(DEFAULT_STATUS, "incomplete", "2h-a the database gives a new subscriptions row the status \"incomplete\" (migration 0009)");
      const { webTrialEligibleRow } = require("../netlify/functions/_lib/trialPlanFirst.js");
      const asStored = (row) => ({ status: DEFAULT_STATUS, cancel_at_period_end: false, currency: "CAD", ...row });
      t.eq(webTrialEligibleRow(asStored({ provider: "stripe", provider_customer_id: "cus_1", provider_subscription_id: null })), true,
        "2h-b a row that only holds the Stripe customer, as the database stores it, has never had a subscription: the 14 days still apply");
      t.eq([webTrialEligibleRow(null), webTrialEligibleRow({ provider: "stripe", provider_customer_id: "cus_1" })], [true, true], "2h-c no row, or a row with no status at all: eligible, as before");
      t.eq(["incomplete", "incomplete_expired", "trialing", "active", "past_due", "canceled", "unpaid"].map((status) => webTrialEligibleRow(asStored({ provider: "stripe", provider_subscription_id: "sub_1", status }))),
        [false, false, false, false, false, false, false], "2h-d any row that names a subscription has had one, whatever its status (a first payment that failed is \"incomplete\" WITH a subscription): no trial");
      t.eq(["trialing", "active", "past_due", "canceled", "unpaid", "incomplete_expired", "expired"].map((status) => webTrialEligibleRow(asStored({ provider: "stripe", provider_subscription_id: null, status }))),
        [false, false, false, false, false, false, false], "2h-e a status other than the default, even with no subscription named: not eligible (only the untouched default counts as \"never\")");
      t.eq([webTrialEligibleRow(asStored({ provider: "app_store", provider_subscription_id: null })), webTrialEligibleRow(asStored({ provider: "play_store", provider_subscription_id: null }))], [false, false],
        "2h-e2 only the row the website's own checkout makes (provider stripe) is read this way: a store's row is as before");
      // The whole walk: open checkout, leave, come back.
      D = makeDb(); U = addUser(D, 1);
      r = await checkout(D, U, "monthly", { trial: true });
      t.eq([r.code, D.db.rows.subscriptions.length, D.db.rows.subscriptions[0] && D.db.rows.subscriptions[0].provider_customer_id], [200, 1, `cus_${U.slice(-4)}`], "2h-f the first checkout leaves the row that holds the customer");
      D.db.rows.subscriptions[0] = asStored(D.db.rows.subscriptions[0]);             // what Postgres actually stored
      D.db.stripe.length = 0;
      r = await checkout(D, U, "monthly", { trial: true });
      s = sessionOf(D);
      t.eq([r.code, r.body.error || null, s && s.subscription_data.trial_period_days, s && s.payment_method_collection], [200, null, 14, "always"],
        "2h-g they left Stripe's page and came back: the SAME 14 days free, not \"charged today\" and not refused");
      r = await checkout(D, U, "monthly", { trial: false });
      t.eq([r.code, r.body.error, r.body.trial], [409, "trial_changed", true], "2h-h …and a screen that showed them no trial is told one applies (nobody is charged on day one by a stale screen)");
      D = makeDb(); U = addUser(D, 1);
      r = await checkout(D, U, "monthly", { trial: true });
      D.db.rows.subscriptions[0] = asStored(D.db.rows.subscriptions[0]);
      r = await checkout(D, U, "monthly", { trial: true }, { everSubs: [{ id: "sub_old", status: "canceled" }] });
      t.eq([r.code, r.body.error, r.body.trial], [409, "trial_changed", false], "2h-i Stripe is still asked: a customer who did have a subscription gets no second trial");
      t.ok(/if \(web\) out\.web_trial_eligible = webTrialEligibleRow\(row\);/.test(fs.readFileSync(path.join(REPO, "netlify", "functions", "_lib", "trialPlanFirst.js"), "utf8")), "2h-j the plans screen's answer (web_trial_eligible) is the same rule, so the screen and the checkout agree");

      // WORSE, found the same hour, and nothing to do with the trial switch: that same row was read as a LIVE
      // subscription ("incomplete" is in STRIPE_LIVE_UNPAID, for a first payment still pending). So after one
      // opened-and-left checkout the website answered 409 already_subscribed for ever ("This account already has a
      // subscription."), a store app was told not to sell to them, and a store purchase could not take the row.
      // On main since 2026-10-15 (94a754c).
      const rules = require("../netlify/functions/_lib/planRules.js");
      const store = require("../netlify/functions/_lib/storeSubscriptions.js");
      const customerOnly = asStored({ provider: "stripe", provider_customer_id: "cus_1", provider_subscription_id: null, plan_key: null, last_event_at: null, current_period_end: null });
      const firstPaymentPending = asStored({ provider: "stripe", provider_customer_id: "cus_1", provider_subscription_id: "sub_1", plan_key: "monthly", last_event_at: "2026-11-20T15:00:00Z", current_period_end: null });
      t.eq([typeof rules.isCustomerOnlyRow, rules.isCustomerOnlyRow && rules.isCustomerOnlyRow(customerOnly), rules.isCustomerOnlyRow && rules.isCustomerOnlyRow(firstPaymentPending)], ["function", true, false],
        "2h-k one rule says which row only holds the Stripe customer: no subscription named, no plan, no event ever written, and the database's default status");
      t.eq(rules.isCustomerOnlyRow && [null, undefined, {}, { status: "incomplete", provider: "app_store" }, { status: "incomplete", plan_key: "monthly" }, { status: "incomplete", last_event_at: "2026-11-20T15:00:00Z" }, { status: "past_due" }, { status: "active" }].map((r) => rules.isCustomerOnlyRow(r)),
        [false, false, false, false, false, false, false, false], "2h-l …and nothing else is: no row, a store's row, a row with a plan or an event on it, any other status");
      t.eq([store.isLiveRow(customerOnly), store.isLiveRow(firstPaymentPending), store.isLiveRow(asStored({ provider: "stripe", provider_subscription_id: "sub_1", status: "past_due" }))], [false, true, true],
        "2h-m the customer-only row is NOT a live subscription; a first payment still pending and a failed renewal still are");
      // The store's own answer reads fewer columns: with only those, the rule must still hold.
      const asStoreHoldReads = ({ provider, status, current_period_end, plan_key, last_event_at, updated_at }) => ({ provider, status, current_period_end, plan_key, last_event_at, updated_at });
      t.eq([store.isLiveRow(asStoreHoldReads(customerOnly)), store.isLiveRow(asStoreHoldReads(firstPaymentPending))], [false, true], "2h-n …also when only the columns the store app's calls read are there");
      t.eq([store.mayReplace(customerOnly, { provider: "app_store", status: "active" }), store.mayReplace(firstPaymentPending, { provider: "app_store", status: "active" })], [true, false],
        "2h-o a store purchase may take the place of the customer-only row (it could not), never of a web payment still pending");
      const billingSrc = fs.readFileSync(BILLING_PATH, "utf8");
      const reads = [...billingSrc.matchAll(/\.from\("subscriptions"\)\.select\("([^"]+)"\)/g)].map((m) => m[1]).filter((cols) => /\bstatus\b/.test(cols));
      t.ok(reads.length >= 4 && reads.every((cols) => /\bprovider_subscription_id\b/.test(cols) && /\bplan_key\b/.test(cols) && /\blast_event_at\b/.test(cols)),
        "2h-p every read of the row's status in billing.js also reads the three things that tell the customer-only row apart");
      // The walk, with the trial switch OFF (the rule from 2026-10-15 to 2026-11-18, and for anyone not offered a trial).
      env();
      D = makeDb(); U = addUser(D, 1);
      r = await checkout(D, U, "monthly");
      t.eq([r.code, D.db.rows.subscriptions.length], [200, 1], "2h-q switch off: the first checkout is made and leaves the customer's row");
      D.db.rows.subscriptions[0] = asStored(D.db.rows.subscriptions[0]);
      D.db.stripe.length = 0;
      r = await checkout(D, U, "monthly");
      t.eq([r.code, r.body.error || null, !!sessionOf(D)], [200, null, true], "2h-r they left and came back: a new checkout, not \"This account already has a subscription\"");
      D.db.rows.subscriptions[0] = { ...firstPaymentPending, user_id: U };
      D.db.stripe.length = 0;
      r = await checkout(D, U, "monthly");
      t.eq([r.code, r.body.error, sessionOf(D)], [409, "already_subscribed", null], "2h-s a first payment really pending is still refused a second checkout (no double charge), as before");
      env(ON);
      D = makeDb(); U = addUser(D, 1); D.db.rows.subscriptions.push({ user_id: U, provider: "app_store", status: "canceled", current_period_end: "2026-11-15T00:00:00Z" });
      r = await checkout(D, U, "monthly", { trial: true });
      t.eq([r.code, r.body.trial], [409, false], "2h an account that had a store subscription before gets no web trial");
      D = makeDb(); U = addUser(D, 1);
      r = await checkout(D, U, "monthly", { trial: true }, { listFails: true });
      t.eq([r.code, sessionOf(D)], [503, null], "2h2 Stripe cannot be asked: nothing created (503), never a guess");
      D = makeDb(); U = addUser(D, 1);
      r = await checkout(D, U, "founding_annual", { trial: true });
      s = sessionOf(D);
      t.eq([r.code, s.line_items[0].price, s.subscription_data.trial_period_days], [200, "price_founding_7999", 14], "2h3 founding keeps its own price with the same 14 days");

      env({});
      D = makeDb(); U = addUser(D, 1);
      r = await checkout(D, U, "monthly", {});
      s = sessionOf(D);
      t.eq([r.code, "trial_period_days" in s.subscription_data, "payment_method_collection" in s, "trial_settings" in s.subscription_data], [200, false, false, false], "2h4 off: the checkout is exactly as before, no trial");
      t.eq(Object.keys(s).sort(), ["allow_promotion_codes", "automatic_tax", "cancel_url", "client_reference_id", "customer", "expires_at", "line_items", "metadata", "mode", "subscription_data", "success_url"], "2h5 …with the same fields as before, and no others");
      D = makeDb(); U = addUser(D, 1);
      r = await checkout(D, U, "monthly", { trial: true });
      t.eq([r.code, r.body.trial, sessionOf(D)], [409, false, null], "2h6 off: a screen that claims a trial is stopped");
    }

    // ── 2i-2n a founding trial cancelled before its first charge ───────────────────────────────────
    {
      env(ON);
      const D = makeDb(); const U = addUser(D, 2);
      D.db.subs = { sub_f: { id: "sub_f", status: "trialing", trial_end: T + 14 * DAY } };
      const trialSub = (o = {}) => ({ id: "sub_f", customer: `cus_${U.slice(-4)}`, status: "trialing", metadata: { user_id: U, plan_key: "founding_annual", trial_plan_first: "1" },
        trial_start: T, trial_end: T + 14 * DAY, items: { data: [{ price: { id: "price_founding_7999" }, current_period_end: T + 14 * DAY }] }, ...o });
      t.eq(await stripeEvent(D, "evt_c1", "checkout.session.completed", { customer: `cus_${U.slice(-4)}`, subscription: "sub_f", mode: "subscription", payment_status: "no_payment_required",
        metadata: { user_id: U, plan_key: "founding_annual" } }), 200, "2i a founding trial's checkout is processed");
      t.eq(D.db.seats.map((s) => [s.user_id, !!s.released_at]), [[U, false]], "2j …and holds a seat from day one");
      // Review round (M3): the checkout itself asks Stripe for the subscription, so the row says trialing from the start.
      t.eq([D.db.rows.subscriptions.find((r) => r.user_id === U).status, D.db.rows.subscriptions.find((r) => r.user_id === U).current_period_end], ["trialing", new Date((T + 14 * DAY) * 1000).toISOString()],
        "2j2 the checkout's row says trialing, with the trial's end, from the start");
      // The real-world proof, 2026-11-23 (step 1A.2): what Stripe REALLY sends for a trial checkout. The event read
      // from Stripe test mode (API 2026-08-26.dahlia) says payment_status "paid" with amount_total 0 (the $0 first
      // invoice is paid), not "no_payment_required". The row was written "active" for the whole trial, so the site
      // never showed the first-charge date it promises once Stripe confirms. And the trial's start, heard just
      // before (customer.subscription.created, "trialing"), was written over by it.
      {
        const R = makeDb(); const V = addUser(R, 7);
        R.db.subs = { sub_real: { id: "sub_real", status: "trialing", trial_end: T + 14 * DAY, items: { data: [{ price: { id: "price_monthly_1199" }, current_period_end: T + 14 * DAY }] } } };
        const realTrialSub = { id: "sub_real", customer: `cus_${V.slice(-4)}`, status: "trialing", metadata: { user_id: V, plan_key: "monthly", trial_plan_first: "1" }, trial_start: T, trial_end: T + 14 * DAY,
          items: { data: [{ price: { id: "price_monthly_1199" }, current_period_end: T + 14 * DAY }] } };
        const rowOf = () => R.db.rows.subscriptions.find((r) => r.user_id === V) || {};
        t.eq(await stripeEvent(R, "evt_real1", "customer.subscription.created", realTrialSub, T), 200, "2j3 the order Stripe really used: the trial's start first");
        t.eq(rowOf().status, "trialing", "2j4 …trialing");
        t.eq(await stripeEvent(R, "evt_real2", "checkout.session.completed", { customer: `cus_${V.slice(-4)}`, subscription: "sub_real", mode: "subscription", status: "complete",
          payment_status: "paid", amount_total: 0, amount_subtotal: 0, metadata: { user_id: V, plan_key: "monthly" } }, T), 200, "2j5 …then the completed checkout, saying \"paid\" for nothing charged");
        t.eq([rowOf().status, rowOf().current_period_end], ["trialing", new Date((T + 14 * DAY) * 1000).toISOString()],
          "2j6 the row still says trialing, with the trial's end (it said \"active\": no first-charge date on the site)");
        // A checkout that really was paid stays "active", and a paid one whose subscription Stripe calls active is never called a trial.
        const P = makeDb(); const W = addUser(P, 8);
        P.db.subs = { sub_paid: { id: "sub_paid", status: "active", trial_end: null, items: { data: [{ price: { id: "price_monthly_1199" }, current_period_end: T + 30 * DAY }] } } };
        await stripeEvent(P, "evt_paid1", "checkout.session.completed", { customer: `cus_${W.slice(-4)}`, subscription: "sub_paid", mode: "subscription", status: "complete", payment_status: "paid", amount_total: 1199, metadata: { user_id: W, plan_key: "monthly" } }, T);
        t.eq((P.db.rows.subscriptions.find((r) => r.user_id === W) || {}).status, "active", "2j7 a checkout that was really charged is \"active\", as before");
        const U2 = makeDb(); const X = addUser(U2, 9);
        U2.db.subs = { sub_debit: { id: "sub_debit", status: "trialing", trial_end: T + 14 * DAY, items: { data: [{ price: { id: "price_monthly_1199" }, current_period_end: T + 14 * DAY }] } } };
        await stripeEvent(U2, "evt_unpaid1", "checkout.session.completed", { customer: `cus_${X.slice(-4)}`, subscription: "sub_debit", mode: "subscription", status: "complete", payment_status: "unpaid", metadata: { user_id: X, plan_key: "monthly" } }, T);
        t.eq((U2.db.rows.subscriptions.find((r) => r.user_id === X) || {}).status, "trialing", "2j8 an unpaid checkout keeps Stripe's own word for the subscription (P3-04, unchanged)");
      }
      t.eq(await stripeEvent(D, "evt_c2", "customer.subscription.created", trialSub(), T + 1), 200, "2k on: the trial's start is heard");
      t.eq(D.db.rows.subscriptions.find((r) => r.user_id === U).status, "trialing", "2l …and the row says trialing, with the trial's end");
      t.eq(await stripeEvent(D, "evt_c3", "customer.subscription.deleted", trialSub({ status: "canceled", canceled_at: T + 3 * DAY, ended_at: T + 3 * DAY }), T + 3 * DAY), 200, "2m cancelled on day 3");
      const row = D.db.rows.subscriptions.find((r) => r.user_id === U);
      t.eq([D.db.seats[0].release_reason, row.founding_ended_at || null], ["trial_ended_unpaid", null], "2n …the seat goes back, and the founding price is not marked as ended");

      // a founding subscription that was paid, then cancelled: as before (the seat stays, the price is ended).
      const P = makeDb(); const V = addUser(P, 3);
      await stripeEvent(P, "evt_p1", "checkout.session.completed", { customer: "cus_p", subscription: "sub_p", mode: "subscription", payment_status: "paid", metadata: { user_id: V, plan_key: "founding_annual" } });
      await stripeEvent(P, "evt_p2", "customer.subscription.deleted", { id: "sub_p", customer: "cus_p", status: "canceled", metadata: { user_id: V, plan_key: "founding_annual" },
        trial_end: null, canceled_at: T + 40 * DAY, ended_at: T + 40 * DAY, items: { data: [{ price: { id: "price_founding_7999" }, current_period_end: T + 365 * DAY }] } }, T + 40 * DAY);
      t.eq([P.db.seats[0].released_at, !!P.db.rows.subscriptions.find((r) => r.user_id === V).founding_ended_at], [null, true], "2n2 a paid founding subscription that ends: unchanged, its seat stays and the price is ended");
      // a trial that converted (charged on day 14), then cancelled later: also as before.
      const Q = makeDb(); const W = addUser(Q, 4);
      await stripeEvent(Q, "evt_q1", "checkout.session.completed", { customer: "cus_q", subscription: "sub_q", mode: "subscription", payment_status: "no_payment_required", metadata: { user_id: W, plan_key: "founding_annual" } });
      await stripeEvent(Q, "evt_q2", "customer.subscription.deleted", { id: "sub_q", customer: "cus_q", status: "canceled", metadata: { user_id: W, plan_key: "founding_annual" },
        trial_end: T + 14 * DAY, canceled_at: T + 60 * DAY, ended_at: T + 60 * DAY, items: { data: [{ price: { id: "price_founding_7999" }, current_period_end: T + 379 * DAY }] } }, T + 60 * DAY);
      t.eq([Q.db.seats[0].released_at, !!Q.db.rows.subscriptions.find((r) => r.user_id === W).founding_ended_at], [null, true], "2n3 a founding trial that was charged, then ended later: unchanged");
      // until 0046 runs, the release is refused by 0032's check: the webhook still answers 200 and the seat stays.
      const R = makeDb(); R.db.refuseTrialReason = true; const X = addUser(R, 5);
      await stripeEvent(R, "evt_r1", "checkout.session.completed", { customer: "cus_r", subscription: "sub_r", mode: "subscription", payment_status: "no_payment_required", metadata: { user_id: X, plan_key: "founding_annual" } });
      const code = await stripeEvent(R, "evt_r2", "customer.subscription.deleted", { id: "sub_r", customer: "cus_r", status: "canceled", metadata: { user_id: X, plan_key: "founding_annual" },
        trial_end: T + 14 * DAY, canceled_at: T + 2 * DAY, ended_at: T + 2 * DAY, items: { data: [{ price: { id: "price_founding_7999" }, current_period_end: T + 14 * DAY }] } }, T + 2 * DAY);
      t.eq([code, R.db.seats[0].released_at], [200, null], "2n4 before 0046: the release is refused, the webhook still finishes (no retry storm), the seat stays as today");
    }

    // ── 2n5-2n7 the stores: a founding trial that ended unpaid ─────────────────────────────────────
    {
      const S = require("../netlify/functions/_lib/storeSubscriptions.js");
      const D = makeDb(); const U = addUser(D, 6);
      const rec = (period_type, expires) => ({ entitlements: {}, subscriptions: { "app.flourishmoney.founding.annual": { store: "app_store", period_type, expires_date: expires, is_sandbox: false, ownership_type: "PURCHASED", refunded_at: null } } });
      await S.syncStoreSubscription(D.admin, U, { fetchSubscriber: async () => rec("trial", new Date(NOW + 14 * DAY * 1000).toISOString()), now: NOW, user: D.db.users[U] });
      t.eq([D.db.rows.subscriptions[0].status, D.db.seats.length], ["trialing", 1], "2n5 an App Store founding trial: trialing, and it holds a seat");
      await S.syncStoreSubscription(D.admin, U, { fetchSubscriber: async () => rec("trial", new Date(NOW + 2 * DAY * 1000).toISOString()), now: NOW + 3 * DAY * 1000, user: D.db.users[U] });
      t.eq([D.db.seats[0].release_reason, D.db.rows.subscriptions[0].founding_ended_at || null], ["trial_ended_unpaid", null], "2n6 …it ended inside the trial, unpaid: the seat goes back, the price is not ended");
      const E = makeDb(); const V = addUser(E, 7);
      await S.syncStoreSubscription(E.admin, V, { fetchSubscriber: async () => rec("normal", new Date(NOW + 300 * DAY * 1000).toISOString()), now: NOW, user: E.db.users[V] });
      await S.syncStoreSubscription(E.admin, V, { fetchSubscriber: async () => rec("normal", new Date(NOW + 1 * DAY * 1000).toISOString()), now: NOW + 2 * DAY * 1000, user: E.db.users[V] });
      t.eq([E.db.seats[0].released_at, !!E.db.rows.subscriptions[0].founding_ended_at], [null, true], "2n7 a paid store founding subscription that ends: unchanged");
      // Review round (L4): a trial that converted with no sync in between (the row still says trialing) is never taken for unpaid.
      const F2 = makeDb(); const X = addUser(F2, 9);
      await S.syncStoreSubscription(F2.admin, X, { fetchSubscriber: async () => rec("trial", new Date(NOW + 14 * DAY * 1000).toISOString()), now: NOW, user: F2.db.users[X] });
      await S.syncStoreSubscription(F2.admin, X, { fetchSubscriber: async () => rec("normal", new Date(NOW + 379 * DAY * 1000).toISOString()), now: NOW + 400 * DAY * 1000, user: F2.db.users[X] });
      t.eq(F2.db.seats[0].released_at, null, "2n8 a founding store trial that was charged (its end moved a year on), seen only after it ended: the seat stays");
    }

    // ── 2o the start of a Stripe trial is heard only while the switch is on ────────────────────────
    {
      env({});
      const D = makeDb(); const U = addUser(D, 8);
      await stripeEvent(D, "evt_o1", "customer.subscription.created", { id: "sub_o", customer: "cus_o", status: "trialing", metadata: { user_id: U, plan_key: "monthly" }, trial_end: T + 14 * DAY,
        items: { data: [{ price: { id: "price_monthly_1199" }, current_period_end: T + 14 * DAY }] } });
      t.eq(D.db.rows.subscriptions.length, 0, "2o off: customer.subscription.created is ignored, as before");
    }

    // ── 2p 0046 ────────────────────────────────────────────────────────────────────────────────────
    {
      const sql = fs.readFileSync(path.join(REPO, "supabase", "migrations", "0046_trial_plan_first.sql"), "utf8");
      t.ok(/release_reason in \('refund', 'trial_ended_unpaid'\)/.test(sql), "2p 0046 allows the trial reason, and refund as before");
      t.ok(/s\.release_reason = 'trial_ended_unpaid'\) then[\s\S]*released_at = null, release_reason = null/.test(sql), "2q …and takes again only a seat released for a cancelled trial");
      t.ok(/^begin;$/m.test(sql) && /^commit;$/m.test(sql) && /grant execute on function public\.founding_seat_take\(uuid, text, text\) to service_role;/.test(sql), "2r …in one transaction, for the service role only");
    }
  } finally {
    console.error = realError;
    process.env = saved;
  }
  t.summary("trialPlanFirstBilling.test");
})();
