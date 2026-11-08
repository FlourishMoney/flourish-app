// tests/funnelCounters.test.cjs
// -----------------------------------------------------------------------------
// THE FULL FUNNEL, SERVER AND APP SIDE (migration 0042, docs/ops/MEASUREMENT.md).
//   1  RevenueCat: a store trial, a payment, a cancellation and a refund, per store; a sandbox purchase is none
//   2  Stripe: the website's payment, cancellation and refund; test mode and a failed payment are none
//   3  /api/activation: the milestones and days it writes, and only an account id, a name from a list and a time
//   4  a check-in: its kinds, its 503 when it can't be written, the 60-day window
//   5  the app: one check-in a kind a day on a device, never in the demo
//   6  the wiring: signup, both webhooks and the three places a check-in finishes call it
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const FN = require.resolve("../netlify/functions/activation.js");
const AUTH = require.resolve("../netlify/functions/_lib/auth.js");
const F = require("../netlify/functions/_lib/funnel.js");

const UID = "0b5c3f0e-1a2b-4c3d-8e9f-0a1b2c3d4e5f";
function fakeAdmin({ upsertError = null } = {}) {
  const writes = [];
  const admin = {
    auth: { admin: { getUserById: async () => ({ data: { user: admin._user }, error: null }) } },
    rpc: async () => ({ data: null, error: null }),
    from: (table) => ({
      upsert: async (row, opts) => { writes.push({ table, row, opts }); return { error: upsertError }; },
      update: () => ({ eq: () => ({ is: async () => ({ error: null }) }) }),
    }),
  };
  return { admin, writes };
}

async function call({ body, user, now, upsertError = null }) {
  const { admin, writes } = fakeAdmin({ upsertError });
  admin._user = user;
  const real = require(AUTH);
  require.cache[AUTH] = { id: AUTH, filename: AUTH, loaded: true, exports: { ...real,
    getUserFromRequest: async () => ({ user_id: user.id }), getAdminClient: () => admin } };
  delete require.cache[FN];
  const mod = require(FN);
  const realErr = console.error; const logged = []; console.error = (...a) => logged.push(a.join(" "));
  try {
    const res = await mod._test.handler({ httpMethod: "POST", headers: { origin: "https://flourishmoney.app" }, body: JSON.stringify(body) }, {}, new Date(now));
    return { res, writes, logged };
  } finally { console.error = realErr; delete require.cache[AUTH]; delete require.cache[FN]; }
}

(async () => {
  const t = create();

  // ── 1. RevenueCat ─────────────────────────────────────────────────────────────────────────────────────────
  const rc = (o) => F.revenueCatMilestone({ environment: "PRODUCTION", store: "APP_STORE", event_timestamp_ms: 1762600000000, ...o });
  const pick = (m) => m && [m.milestone, m.channel];
  t.eq(pick(rc({ type: "INITIAL_PURCHASE", period_type: "NORMAL" })), ["paid", "apple"], "1a a first purchase on the App Store is paid, apple");
  t.eq(pick(rc({ type: "RENEWAL", period_type: "NORMAL", store: "PLAY_STORE" })), ["paid", "google"], "1b a renewal on Play is paid, google");
  t.eq(pick(rc({ type: "NON_RENEWING_PURCHASE", period_type: "NORMAL" })), ["paid", "apple"], "1c a one-off purchase is paid");
  t.eq(pick(rc({ type: "INITIAL_PURCHASE", period_type: "TRIAL" })), ["store_trial", "apple"], "1d a store free trial is a store trial, not paid");
  t.eq(rc({ type: "RENEWAL", period_type: "TRIAL" }), null, "1e …and only its start counts");
  t.eq(rc({ type: "INITIAL_PURCHASE", period_type: "PROMOTIONAL" }), null, "1f a granted promotional period is not paid");
  t.eq(pick(rc({ type: "CANCELLATION", cancel_reason: "UNSUBSCRIBE" })), ["cancelled", "apple"], "1g renewal turned off is cancelled");
  t.eq(pick(rc({ type: "CANCELLATION", cancel_reason: "CUSTOMER_SUPPORT", store: "PLAY_STORE" })), ["refunded", "google"], "1h a refund is refunded, google");
  t.eq(pick(rc({ type: "CANCELLATION", cancel_reason: "UNKNOWN", price: -9.99 })), ["refunded", "apple"], "1i a negative price is a refund too");
  t.eq(rc({ type: "CANCELLATION", cancel_reason: "BILLING_ERROR" }), null, "1j a card that failed is not the household cancelling");
  t.eq(rc({ type: "INITIAL_PURCHASE", period_type: "NORMAL", environment: "SANDBOX" }), null, "1k a sandbox purchase is never counted");
  t.eq(rc({ type: "INITIAL_PURCHASE", period_type: "NORMAL", store: "STRIPE" }), null, "1l nothing outside the two stores");
  t.eq(rc({ type: "EXPIRATION" }), null, "1m an expiry marks nothing");
  t.eq(rc({ type: "INITIAL_PURCHASE", period_type: "NORMAL" }).at.toISOString(), new Date(1762600000000).toISOString(), "1n the time is the store's event time");

  // ── 2. Stripe ────────────────────────────────────────────────────────────────────────────────────────────
  const st = (type, object, extra = {}) => F.stripeMilestone({ livemode: true, created: 1762600000, type, data: { object }, ...extra });
  t.eq(st("checkout.session.completed", { payment_status: "paid" }).milestone, "paid", "2a a paid checkout is paid");
  t.eq(st("checkout.session.completed", { payment_status: "unpaid" }), null, "2b an unpaid one is not");
  t.eq(st("customer.subscription.updated", { cancel_at_period_end: true }).milestone, "cancelled", "2c renewal turned off is cancelled");
  t.eq(st("customer.subscription.updated", { cancel_at_period_end: false, status: "active" }), null, "2d any other update is nothing");
  t.eq(st("customer.subscription.deleted", { cancellation_details: { reason: "cancellation_requested" } }).milestone, "cancelled", "2e ended on request is cancelled");
  t.eq(st("customer.subscription.deleted", { cancellation_details: { reason: "payment_failed" } }), null, "2f ended because the card failed is not");
  t.eq(st("charge.refunded", { amount_refunded: 999 }).milestone, "refunded", "2g a refund, in full or in part, is refunded");
  t.eq(st("checkout.session.completed", { payment_status: "paid" }, { livemode: false }), null, "2h a test-mode event is never counted");

  // ── 3. /api/activation ───────────────────────────────────────────────────────────────────────────────────
  const user = { id: UID, email: "alex@example.ca", created_at: "2026-11-09T17:00:00Z" };
  const at = (n) => new Date(Date.parse(user.created_at) + n * 86400000).toISOString();
  const names = (w) => w.map((x) => x.table === "account_milestones" ? `${x.row.milestone}:${x.row.channel}` : `${x.row.kind}:${x.row.day}`);
  let r = await call({ body: { metric: "safe_view" }, user, now: at(20) });
  t.eq([r.res.statusCode, names(r.writes)], [204, ["first_safe:app"]], "3a a valid safe-to-spend view marks first_safe, at any age (not only in 7 days)");
  r = await call({ body: { metric: "first_number_shown", mode: "manual", seconds: 90 }, user, now: at(0) });
  t.eq(names(r.writes), ["first_safe:app", "setup_done:manual"], "3b the first number after manual setup: first_safe and setup_done manual");
  r = await call({ body: { metric: "first_number_shown", mode: "linked", seconds: 90 }, user, now: at(0) });
  t.eq(names(r.writes), ["first_safe:app", "setup_done:bank"], "3c …after a bank link: setup_done bank");
  r = await call({ body: { metric: "bank_link_completed" }, user, now: at(0) });
  t.eq(names(r.writes), ["setup_done:bank"], "3d a bank link completed is setup done");
  r = await call({ body: { metric: "app_open" }, user, now: at(7) });
  t.eq(names(r.writes), ["open:2026-11-16"], "3e an app open keeps the Toronto day");
  t.ok(r.writes.every((w) => w.opts && w.opts.ignoreDuplicates === true), "3f every write is first-time only: a second device adds nothing");
  r = await call({ body: { metric: "app_open", amount: 1944.22, note: "rent", email: "alex@example.ca" }, user, now: at(1) });
  t.eq(r.writes.map((w) => Object.keys(w.row).sort().join(",")), ["day,kind,user_id"], "3g a day row holds the account, the day and the kind, nothing else");
  t.ok(!/1944|rent|alex/.test(JSON.stringify(r.writes)), "3h none of the request's other values reach the database");
  r = await call({ body: { metric: "safe_view" }, user: { ...user, email: "qa@flourishmoney.app" }, now: at(1) });
  t.eq(r.writes.length, 0, "3i Flourish's own address writes nothing");
  r = await call({ body: { metric: "safe_view" }, user, now: at(1), upsertError: { message: "relation does not exist" } });
  t.eq(r.res.statusCode, 204, "3j a milestone that can't be written (0042 not run) changes no answer");
  t.ok(r.logged.some((l) => l === "[funnel] not recorded first_safe") && !r.logged.some((l) => l.includes(UID)), "3k …and the log says which milestone, never whose");

  // ── 4. a check-in ────────────────────────────────────────────────────────────────────────────────────────
  r = await call({ body: { metric: "checkin", kind: "meeting" }, user, now: at(9) });
  t.eq([r.res.statusCode, names(r.writes)], [204, ["checkin:2026-11-18"]], "4a a meeting marked done keeps the day");
  r = await call({ body: { metric: "checkin", kind: "weekly" }, user, now: at(9) });
  t.eq(names(r.writes), ["checkin:2026-11-18"], "4b so does the weekly check-in: one kind of day, whichever it was");
  r = await call({ body: { metric: "checkin", kind: "coach" }, user, now: at(9) });
  t.eq([r.res.statusCode, r.writes.length], [400, 0], "4c a kind outside the list is refused");
  r = await call({ body: { metric: "checkin" }, user, now: at(9) });
  t.eq(r.res.statusCode, 400, "4d …and so is no kind");
  r = await call({ body: { metric: "checkin", kind: "meeting" }, user, now: at(9), upsertError: { message: "down" } });
  t.eq(r.res.statusCode, 503, "4e a check-in that can't be written answers 503, so the device does not mark it sent");
  r = await call({ body: { metric: "checkin", kind: "meeting" }, user, now: at(61) });
  t.eq([r.res.statusCode, r.writes.length], [204, 0], "4f past the first 60 days nothing is kept, and that is not an error");
  t.eq(await F.recordDay(fakeAdmin().admin, UID, "open", user.created_at, new Date(at(60))), true, "4g day 60 is still inside");

  // ── 5. the app ──────────────────────────────────────────────────────────────────────────────────────────
  const A = await import(path.join(ROOT, "src/lib/activation.js"));
  const mem = () => { const m = new Map(); return { getItem: (k) => m.get(k) || null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) }; };
  const sent = [];
  const fetchImpl = async (url, init) => { sent.push(JSON.parse(init.body)); return { status: 204, ok: true }; };
  const getSession = async () => ({ userId: UID, jwt: "j" });
  const storage = mem();
  const today = new Date("2026-11-18T15:00:00Z");
  A._resetActivationInflight();
  t.eq(await A.sendActivationOnce("checkin", { kind: "meeting", getSession, storage, fetchImpl, today }), true, "5a a check-in is sent");
  t.eq(await A.sendActivationOnce("checkin", { kind: "meeting", getSession, storage, fetchImpl, today }), false, "5b …once a kind a day on this device");
  t.eq(await A.sendActivationOnce("checkin", { kind: "weekly", getSession, storage, fetchImpl, today }), true, "5c the other kind is its own");
  t.eq(await A.sendActivationOnce("checkin", { kind: "meeting", getSession, storage, fetchImpl, today: new Date("2026-11-25T15:00:00Z") }), true, "5d the next week is a new day");
  t.eq(sent, [{ metric: "checkin", kind: "meeting" }, { metric: "checkin", kind: "weekly" }, { metric: "checkin", kind: "meeting" }], "5e the request carries the metric and the kind, nothing else");
  t.eq(await A.sendActivationOnce("checkin", { kind: "meeting", demo: true, getSession, storage: mem(), fetchImpl, today }), false, "5f never in the demo");
  t.eq(await A.sendActivationOnce("checkin", { kind: "chat", getSession, storage: mem(), fetchImpl, today }), false, "5g never a kind outside the list");
  t.eq(await A.sendActivationOnce("app_open", { getSession, storage: mem(), fetchImpl, today }), true, "5h the other metrics are unchanged");
  t.eq(sent[sent.length - 1], { metric: "app_open" }, "5i …and still send only their name");

  // ── 6. the wiring ───────────────────────────────────────────────────────────────────────────────────────
  const beta = read("netlify/functions/beta.js");
  t.ok(/recordMilestone\(admin, newAccountId, "signed_up", platform\)/.test(beta), "6a signup records the channel the account was made on");
  t.ok(beta.indexOf('"signed_up"') > beta.indexOf("if (newAccountId && !isTestEmail(email))") && beta.indexOf('"signed_up"') < beta.indexOf("if (newAccountId && testerCode)"),
    "6b …inside the test-address check, beside the account's attribution");
  const rcw = read("netlify/functions/revenuecat-webhook.js");
  t.ok(/revenueCatMilestone\(evt\)/.test(rcw) && rcw.indexOf("revenueCatMilestone(evt)") > rcw.indexOf("billing_events\").insert") && rcw.indexOf("revenueCatMilestone(evt)") < rcw.indexOf("syncStoreSubscription(admin"),
    "6c RevenueCat: after the event is claimed, before the sync");
  const sw = read("netlify/functions/stripe-webhook.js");
  t.ok(/stripeMilestone\(evt\)/.test(sw) && sw.indexOf("stripeMilestone(evt)") > sw.indexOf(".from(\"billing_events\").insert(claim") && sw.indexOf("stripeMilestone(evt)") < sw.indexOf("if (evt.type === \"checkout.session.completed\") {"),
    "6d Stripe: after the event is claimed, before the handling whose early answers would skip it");
  t.ok(/recordMilestone\(admin, accountId, milestone\.milestone, "web", milestone\.at\)/.test(sw), "6e …always on the web channel");
  const app = read("src/App.jsx");
  t.eq((app.match(/signalCheckIn\("meeting"/g) || []).length, 2, "6f both places a meeting is marked done send a check-in");
  t.eq((app.match(/signalCheckIn\("weekly"/g) || []).length, 1, "6g so does the weekly check-in's Done");
  t.ok(/lastMeetingAt: new Date\(\)\.toISOString\(\) \} \} \}\)\);\n\s+signalCheckIn\("meeting", data\.demo\);/.test(app), "6h …right after the meeting is recorded as held");
  const pkg = read("package.json");
  t.ok(pkg.includes("node tests/funnelCounters.test.cjs") && pkg.includes("node tests/funnelCounters.sql.test.cjs"), "6i both funnel suites are in test:math");
  const doc = read("docs/ops/MEASUREMENT.md");
  for (const m of ["households_created", "accounts_created", "setup_done", "first_safe_to_spend", "first_checkin", "second_checkin_other_day", "trial_started",
    "paid_web", "paid_apple", "paid_google", "cancelled_web", "cancelled_apple", "cancelled_google", "refunded_web", "refunded_apple", "refunded_google",
    "returned_day_1", "returned_day_7", "returned_day_14", "returned_day_28", "activation_within_7_days", "either_repeat_use"]) {
    t.ok(doc.includes("`" + m + "`"), `6j MEASUREMENT.md defines ${m}`);
  }

  t.summary("FUNNEL COUNTERS");
})();
