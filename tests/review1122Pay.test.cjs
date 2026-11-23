// tests/review1122Pay.test.cjs
// -----------------------------------------------------------------------------
// THE FULL-APP REVIEW OF 2026-11-22: PAYMENTS AND ENTITLEMENTS (server).
//
// One section per finding, numbered with the reviewer's id. The real functions run against a stand-in
// database and a stand-in Stripe: no network, no keys, made-up accounts only.
//
//   P3-02  a webhook event recorded before its work finished is picked up again, not acknowledged as done
//   P3-04  a completed checkout grants access from what Stripe says was paid, and carries the paid period
//   P2-02  a paid row with no period end does not count as paid for ever, and is filled in from Stripe
//   P3-03  a customer's subscriptions are read to the last page, not the first 100
//   GROK   a founding store trial cancelled on day 13 gives its seat back (the reviewer's claim, disproved)
//   P2-05  a founding trial whose first charge never went through gives its seat back
//   P2-03  a policy notice that failed to send is kept, marked failed, and never sent twice (by design)
//   P2-06  two gifts redeemed at once follow one another (by the database's own locks)
//   P2-07  a gift refunded or redeemed between the claim and the send gets no email
//   P3-10  the trial reminder sweep reaches a reminder that is due behind many already sent
//   P2-01  instant signup is the owner's decision, and what it does not open
//   P1-06  the gift page's "bought" screen shows nothing that was not paid for
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");
const { signPayload } = require("../netlify/functions/_lib/stripeSignature.js");

const FN = path.join(__dirname, "..", "netlify", "functions");
const AUTH_PATH = require.resolve("../netlify/functions/_lib/auth.js");
const API_PATH = require.resolve("../netlify/functions/_lib/stripeApi.js");
const HOOK_PATH = require.resolve("../netlify/functions/stripe-webhook.js");
const RC_PATH = require.resolve("../netlify/functions/revenuecat-webhook.js");
const read = (rel) => fs.readFileSync(path.join(__dirname, "..", rel), "utf8");

const U1 = "11111111-1111-4111-8111-111111111111";
const U2 = "22222222-2222-4222-8222-222222222222";

// ── a stand-in for supabase-js: filters chain, and a write may ask for the rows it changed ─────────────
function fakeDb(rows = {}, opts = {}) {
  const db = rows;
  const calls = [];
  const pkOf = (table) => (table === "billing_events" ? "event_id" : "user_id");
  const from = (table) => {
    const list = () => (db[table] = db[table] || []);
    const filters = [];
    let op = "select", patch = null, wantRows = false;
    const match = (r) => filters.every((f) => f(r));
    const run = () => {
      if (opts.failUpdate && op === "update" && opts.failUpdate(table, patch)) return { data: null, error: { message: "write refused" } };
      if (op === "update") {
        const hit = list().filter(match);
        // A row another delivery changed between this one's read and its write (the compare-and-swap test).
        if (opts.raceLoses && opts.raceLoses(table, patch)) return { data: wantRows ? [] : null, error: null };
        hit.forEach((r) => Object.assign(r, patch));
        calls.push({ table, op, patch, n: hit.length });
        return { data: wantRows ? hit.map((r) => ({ ...r })) : null, error: null };
      }
      return { data: list().filter(match).map((r) => ({ ...r })), error: null };
    };
    const q = {
      select() { if (op !== "select") wantRows = true; return q; },
      eq(c, v) { filters.push((r) => r[c] === v); return q; },
      is(c, v) { filters.push((r) => (r[c] == null ? null : r[c]) === v); return q; },
      in(c, vs) { filters.push((r) => vs.includes(r[c])); return q; },
      not() { return q; },
      async maybeSingle() { const r = run(); return { data: (r.data && r.data[0]) || null, error: r.error }; },
      insert(row, o) {
        const pk = pkOf(table);
        const dup = list().some((r) => r[pk] === row[pk]);
        calls.push({ table, op: "insert", row, dup });
        if (!dup) list().push({ ...row });
        // opts.realInsert (2026-11-23): what supabase-js and Postgres really do. `insert` has no ignoreDuplicates option
        // (only `upsert` does), so a second insert of the same key is a unique violation, 23505, whatever was passed.
        if (opts.failInsert && opts.failInsert(table)) { const bad = { data: null, error: { code: "XX000", message: "the database is down" } }; return { select: async () => bad, then: (ok) => ok(bad) }; }
        const res = dup && (opts.realInsert || !(o && o.ignoreDuplicates)) ? { data: null, error: { code: "23505", message: 'duplicate key value violates unique constraint "billing_events_pkey"' } } : { data: dup ? [] : [{ ...row }], error: null };
        return { select: async () => res, then: (ok) => ok(res) };
      },
      async upsert(row) {
        const pk = pkOf(table);
        const i = list().findIndex((r) => r[pk] === row[pk]);
        calls.push({ table, op: "upsert", row });
        if (i >= 0) list()[i] = { ...list()[i], ...row }; else list().push({ ...row });
        return { error: null };
      },
      update(p) { op = "update"; patch = p; return q; },
      then(ok, bad) { try { return Promise.resolve(run()).then(ok, bad); } catch (e) { return Promise.reject(e).then(ok, bad); } },
    };
    return q;
  };
  const rpcCalls = [];
  return {
    db, calls, rpcCalls, from,
    rpc: async (fn, args) => {
      rpcCalls.push({ fn, args });
      if (opts.rpc && opts.rpc[fn]) return opts.rpc[fn](args);
      return { data: null, error: { code: "PGRST202", message: `no ${fn} in this stand-in` } };
    },
    auth: { admin: { getUserById: async (id) => ({ data: { user: (opts.users && opts.users[id]) || { id, email: "someone@example.test" } }, error: null }) } },
  };
}

function loadHook(admin, stripe = {}) {
  delete require.cache[HOOK_PATH];
  delete require.cache[AUTH_PATH];
  delete require.cache[API_PATH];
  const real = require("../netlify/functions/_lib/auth.js");
  require.cache[AUTH_PATH].exports = { ...real, getAdminClient: () => admin };
  require.cache[API_PATH] = { id: API_PATH, filename: API_PATH, loaded: true,
    exports: { stripeGet: stripe.stripeGet || (async () => { throw new Error("stripe down"); }), stripePost: stripe.stripePost || (async () => ({})),
               stripeDelete: async () => ({}), formEncode: () => "" } };
  // The libraries that hold their own copy of stripeApi are loaded again, so they see the stand-in.
  for (const k of Object.keys(require.cache)) if (k.startsWith(FN) && k !== AUTH_PATH && k !== API_PATH) delete require.cache[k];
  const mod = require(HOOK_PATH);
  return mod;
}
const SECRET = "whsec_review_1122";
const deliver = (hook, evt) => {
  const body = JSON.stringify(evt);
  return hook.handler({ httpMethod: "POST", headers: { "stripe-signature": signPayload(body, SECRET) }, body });
};
const NOW = Date.now();
const iso = (ms) => new Date(ms).toISOString();
const DAY = 86400000;

(async () => {
  const t = create();
  process.env.STRIPE_WEBHOOK_SECRET = SECRET;
  delete process.env.TRIAL_PLAN_FIRST; delete process.env.CREATORS_ENABLED;
  const quiet = console.error; const warn = console.warn;
  console.error = () => {}; console.warn = () => {};
  const { isPaidSubscription } = require("../netlify/functions/_lib/planRules.js");

  // ── P3-02  an event recorded before its work finished ───────────────────────────────────────────────
  {
    const checkout = (id) => ({ id, type: "checkout.session.completed", created: Math.floor(NOW / 1000),
      data: { object: { object: "checkout.session", mode: "subscription", customer: "cus_1", subscription: "sub_1", payment_status: "paid", metadata: { user_id: U1, plan_key: "annual" } } } });

    // The first delivery claimed the event and then died (the function was stopped, or the write that marks it failed
    // did not land). Its row is still "received". Stripe sends the event again.
    const a = fakeDb({ billing_events: [{ event_id: "evt_stuck", provider: "stripe", type: "checkout.session.completed", status: "received", attempts: 1, received_at: iso(NOW - 10 * 60000) }] });
    const r1 = await deliver(loadHook(a), checkout("evt_stuck"));
    t.eq([r1.statusCode, JSON.parse(r1.body).replay], [200, undefined], "P3-02a a delivery that died mid-work is done again when Stripe retries, not acknowledged as a replay");
    t.eq((a.db.subscriptions || []).map((s) => [s.user_id, s.status]), [[U1, "active"]], "P3-02b …so the person who paid has their plan");
    t.eq([a.db.billing_events[0].status, a.db.billing_events[0].attempts], ["processed", 2], "P3-02c …and the ledger row ends processed, on its second attempt");

    // The same event arriving again while the first delivery is still at work (seconds old) is not done twice, and is
    // not told "done" either: if the first one dies, Stripe must still be owed a retry.
    const b = fakeDb({ billing_events: [{ event_id: "evt_busy", provider: "stripe", type: "checkout.session.completed", status: "received", attempts: 1, received_at: iso(Date.now() - 2000) }] });
    const r2 = await deliver(loadHook(b), checkout("evt_busy"));
    t.ok(r2.statusCode >= 500, "P3-02d a second delivery while the first is still at work is not acknowledged (Stripe will send it again)");
    t.eq((b.db.subscriptions || []).length, 0, "P3-02e …and it wrote nothing itself");

    // Finished work is still acknowledged, once, as before.
    const c = fakeDb({ billing_events: [{ event_id: "evt_done", provider: "stripe", type: "checkout.session.completed", status: "processed", attempts: 1, received_at: iso(NOW - 10 * 60000) }] });
    const r3 = await deliver(loadHook(c), checkout("evt_done"));
    t.eq([r3.statusCode, JSON.parse(r3.body).replay, (c.db.subscriptions || []).length], [200, true, 0], "P3-02f an event already processed is acknowledged and not repeated");
    const c2 = fakeDb({ billing_events: [{ event_id: "evt_ign", provider: "stripe", type: "checkout.session.completed", status: "ignored", attempts: 1, received_at: iso(NOW - 10 * 60000) }] });
    const r3b = await deliver(loadHook(c2), checkout("evt_ign"));
    t.eq([r3b.statusCode, JSON.parse(r3b.body).replay], [200, true], "P3-02g …and so is one already set aside");

    // Two retries of the same stuck event at the same moment: only the one whose claim lands does the work.
    const d = fakeDb({ billing_events: [{ event_id: "evt_two", provider: "stripe", type: "checkout.session.completed", status: "received", attempts: 1, received_at: iso(NOW - 10 * 60000) }] },
      { raceLoses: (table, patch) => table === "billing_events" && patch.status === "received" });
    const r4 = await deliver(loadHook(d), checkout("evt_two"));
    t.ok(r4.statusCode >= 500 && (d.db.subscriptions || []).length === 0, "P3-02h of two retries at once, the one that loses the claim does nothing and is not acknowledged");

    // The work threw AND the write that marks the event failed did not land: the row stays "received".
    const e = fakeDb({}, { failUpdate: (table, patch) => table === "billing_events" && patch.status === "failed" });
    const bad = { id: "evt_lost", type: "checkout.session.completed", created: Math.floor(NOW / 1000), data: { object: { object: "checkout.session", mode: "subscription", customer: "cus_x" } } };
    const r5 = await deliver(loadHook(e), bad);
    t.eq([r5.statusCode, e.db.billing_events[0].status], [500, "received"], "P3-02i a failure whose 'failed' mark did not land leaves the row as received…");
    e.db.billing_events[0].received_at = iso(Date.now() - 10 * 60000);     // Stripe's retry, minutes later
    const good = checkout("evt_lost");
    const r6 = await deliver(loadHook(e), good);
    t.eq([r6.statusCode, (e.db.subscriptions || []).length, e.db.billing_events[0].status], [200, 1, "processed"], "P3-02j …and the retry does the work");

    // A row marked failed is retried, as before.
    const f = fakeDb({ billing_events: [{ event_id: "evt_failed", provider: "stripe", type: "checkout.session.completed", status: "failed", attempts: 1, received_at: iso(NOW - 5000), error: "x" }] });
    const r7 = await deliver(loadHook(f), checkout("evt_failed"));
    t.eq([r7.statusCode, (f.db.subscriptions || []).length, f.db.billing_events[0].attempts], [200, 1, 2], "P3-02k an event marked failed is done again on the retry, as before");

    // The store webhook has the same lock.
    process.env.IAP_ENABLED = "true"; process.env.REVENUECAT_WEBHOOK_AUTH = "Bearer review-1122";
    delete require.cache[RC_PATH];
    const wh = require(RC_PATH)._test;
    const rcEvent = (id) => ({ httpMethod: "POST", headers: { authorization: "Bearer review-1122" }, body: JSON.stringify({ event: { id, type: "RENEWAL", app_user_id: U1 } }) });
    const storeSub = { subscriptions: { "app.flourishmoney.plus.monthly": { store: "app_store", expires_date: iso(NOW + 20 * DAY), period_type: "normal", product_plan_identifier: null } } };
    let synced = 0;
    const depsFor = (admin) => ({ admin, now: NOW, fetchSubscriber: async () => { synced++; return storeSub; } });
    const g = fakeDb({ billing_events: [{ event_id: "rc:stuck", provider: "revenuecat", type: "RENEWAL", status: "received", attempts: 1, received_at: iso(NOW - 10 * 60000) }] });
    const r8 = await wh.handle(rcEvent("stuck"), depsFor(g));
    t.eq([r8.statusCode, JSON.parse(r8.body).replay, synced, g.db.billing_events[0].attempts], [200, undefined, 1, 2], "P3-02l a store event that died mid-work is done again on RevenueCat's retry");
    t.ok(["processed", "ignored"].includes(g.db.billing_events[0].status), "P3-02m …and its row is finished");
    synced = 0;
    const h = fakeDb({ billing_events: [{ event_id: "rc:busy", provider: "revenuecat", type: "RENEWAL", status: "received", attempts: 1, received_at: iso(Date.now() - 2000) }] });
    const r9 = await wh.handle(rcEvent("busy"), depsFor(h));
    t.ok(r9.statusCode >= 500 && synced === 0, "P3-02n a second store delivery while the first is at work is not acknowledged and does nothing");
    const i = fakeDb({ billing_events: [{ event_id: "rc:done", provider: "revenuecat", type: "RENEWAL", status: "processed", attempts: 1, received_at: iso(NOW - 10 * 60000) }] });
    const r10 = await wh.handle(rcEvent("done"), depsFor(i));
    t.eq([r10.statusCode, JSON.parse(r10.body).replay, synced], [200, true, 0], "P3-02o a store event already processed is acknowledged and not repeated");

    // ── P3-02 ON A REAL DATABASE (real-world proof, 2026-11-23, step 1A.8) ─────────────────────────────────────
    // Stripe test mode against real Postgres: an event whose work failed was sent again twice at the same moment,
    // then a third time. All three answered 500 "claim_failed" and the event was never applied. Both webhooks claimed
    // an event with insert(row, { ignoreDuplicates: true }), but supabase-js has that option on upsert only: on a real
    // database the second insert of an event is a unique violation (23505), which was read as "could not claim". So
    // since the first version (2026-09-23) every repeat delivery, of a finished event or an unfinished one, has
    // answered 500, and nothing above (P3-02a to o) was ever reached in production. The stand-in here honoured the
    // option, which is why no test saw it. `realInsert` makes it behave as the real client does.
    const R = { realInsert: true };
    const rd_done = fakeDb({ billing_events: [{ event_id: "evt_done_r", provider: "stripe", type: "checkout.session.completed", status: "processed", attempts: 1, received_at: iso(NOW - 10 * 60000) }] }, R);
    const rr1 = await deliver(loadHook(rd_done), checkout("evt_done_r"));
    t.eq([rr1.statusCode, JSON.parse(rr1.body).replay, (rd_done.db.subscriptions || []).length], [200, true, 0], "P3-02p real database: an event already processed, sent again, is acknowledged (it answered 500 claim_failed, so Stripe kept sending it)");
    const rd_failed = fakeDb({ billing_events: [{ event_id: "evt_failed_r", provider: "stripe", type: "checkout.session.completed", status: "failed", attempts: 1, error: "fetch failed", received_at: iso(NOW - 60000) }] }, R);
    const rr2 = await deliver(loadHook(rd_failed), checkout("evt_failed_r"));
    t.eq([rr2.statusCode, (rd_failed.db.subscriptions || []).map((x) => x.status), rd_failed.db.billing_events[0].status, rd_failed.db.billing_events[0].attempts], [200, ["active"], "processed", 2],
      "P3-02q real database: an event whose work failed is done on the retry (it answered 500 for ever: the payment was never applied)");
    const rd_stuck = fakeDb({ billing_events: [{ event_id: "evt_stuck_r", provider: "stripe", type: "checkout.session.completed", status: "received", attempts: 1, received_at: iso(NOW - 10 * 60000) }] }, R);
    const rr3 = await deliver(loadHook(rd_stuck), checkout("evt_stuck_r"));
    t.eq([rr3.statusCode, (rd_stuck.db.subscriptions || []).length, rd_stuck.db.billing_events[0].status], [200, 1, "processed"], "P3-02r real database: a delivery that died mid-work is done again on the retry");
    const rd_busy = fakeDb({ billing_events: [{ event_id: "evt_busy_r", provider: "stripe", type: "checkout.session.completed", status: "received", attempts: 1, received_at: iso(Date.now() - 2000) }] }, R);
    const rr4 = await deliver(loadHook(rd_busy), checkout("evt_busy_r"));
    t.eq([rr4.statusCode, JSON.parse(rr4.body).error, (rd_busy.db.subscriptions || []).length], [503, "in_progress", 0], "P3-02s real database: while the first delivery may still be at work the second answers 503 in_progress and writes nothing");
    const rd_two = fakeDb({ billing_events: [{ event_id: "evt_two_r", provider: "stripe", type: "checkout.session.completed", status: "failed", attempts: 1, received_at: iso(NOW - 60000) }] },
      { ...R, raceLoses: (table, patch) => table === "billing_events" && patch.status === "received" });
    const rr5 = await deliver(loadHook(rd_two), checkout("evt_two_r"));
    t.eq([rr5.statusCode, JSON.parse(rr5.body).error, (rd_two.db.subscriptions || []).length], [503, "in_progress", 0], "P3-02t real database: of two retries at the same moment, the one that loses the takeover answers 503 and writes nothing");
    const rd_down = fakeDb({}, { ...R, failInsert: (table) => table === "billing_events" });
    const rr6 = await deliver(loadHook(rd_down), checkout("evt_down_r"));
    t.eq([rr6.statusCode, JSON.parse(rr6.body).error, (rd_down.db.subscriptions || []).length], [500, "claim_failed", 0], "P3-02u any OTHER failure of the claim is still a 500 and nothing is done (only a unique violation means \"seen before\")");
    const rd_fresh = fakeDb({}, R);
    const rr7 = await deliver(loadHook(rd_fresh), checkout("evt_fresh_r"));
    t.eq([rr7.statusCode, (rd_fresh.db.subscriptions || []).length, rd_fresh.db.billing_events[0].status], [200, 1, "processed"], "P3-02v a first delivery is unchanged");
    // The store webhook, the same way.
    synced = 0;
    const rcDone = fakeDb({ billing_events: [{ event_id: "rc:done_r", provider: "revenuecat", type: "RENEWAL", status: "processed", attempts: 1, received_at: iso(NOW - 10 * 60000) }] }, R);
    const rr8 = await wh.handle(rcEvent("done_r"), depsFor(rcDone));
    t.eq([rr8.statusCode, JSON.parse(rr8.body).replay, synced], [200, true, 0], "P3-02w real database: a store event already processed, sent again, is acknowledged (it answered 500)");
    const rcFailed = fakeDb({ billing_events: [{ event_id: "rc:failed_r", provider: "revenuecat", type: "RENEWAL", status: "failed", attempts: 1, received_at: iso(NOW - 60000) }] }, R);
    const rr9 = await wh.handle(rcEvent("failed_r"), depsFor(rcFailed));
    t.eq([rr9.statusCode, synced, rcFailed.db.billing_events[0].attempts], [200, 1, 2], "P3-02x real database: a store event whose work failed is done on RevenueCat's retry");
    const rcDown = fakeDb({}, { ...R, failInsert: (table) => table === "billing_events" });
    const rr10 = await wh.handle(rcEvent("down_r"), depsFor(rcDown));
    t.eq([rr10.statusCode, JSON.parse(rr10.body).error], [500, "claim_failed"], "P3-02y …and any other failure of its claim is still a 500");
    const srcOf = (f) => fs.readFileSync(path.join(__dirname, "..", "netlify", "functions", f), "utf8").replace(/\/\/[^\n]*/g, "");
    t.ok(!/\.insert\([\s\S]{0,400}?ignoreDuplicates/.test(srcOf("stripe-webhook.js")) && !/\.insert\([\s\S]{0,400}?ignoreDuplicates/.test(srcOf("revenuecat-webhook.js")),
      "P3-02z neither webhook passes ignoreDuplicates to insert any more: the option does nothing there, and reading it as if it did was the defect");

    // ── N1 (round 2 review, 2026-11-22): TWO RETRIES OF THE SAME FAILED EVENT AT THE SAME MOMENT ──────────────
    // The takeover of a row marked failed was an unconditional update, so both retries did the work. It is now the
    // same compare-and-swap the stuck row has: the one whose write lands does the work, the other is not acknowledged.
    const { reclaimEvent } = require("../netlify/functions/_lib/eventClaim.js");
    const failedRow = (id, attempts = 1) => ({ billing_events: [{ event_id: id, provider: "stripe", type: "checkout.session.completed", status: "failed", attempts, received_at: iso(NOW - 5000), error: "x" }] });
    const two = fakeDb(failedRow("evt_n1"));
    const both = await Promise.all([reclaimEvent(two, "evt_n1"), reclaimEvent(two, "evt_n1")]);
    t.eq(both.slice().sort(), ["busy", "run"], "N1a two retries of one failed event at once: one takes it, the other is told it is busy (was: both ran it)");
    t.eq([two.db.billing_events[0].status, two.db.billing_events[0].attempts], ["received", 2], "N1b …and the row is taken once: attempts went from 1 to 2, not to 3");
    const three = fakeDb(failedRow("evt_n1c"));
    const all3 = await Promise.all([1, 2, 3].map(() => reclaimEvent(three, "evt_n1c")));
    t.eq([all3.filter((x) => x === "run").length, all3.filter((x) => x === "busy").length], [1, 2], "N1c three at once: still exactly one");
    const lone = fakeDb(failedRow("evt_n1d", 4));
    t.eq([await reclaimEvent(lone, "evt_n1d"), lone.db.billing_events[0].attempts], ["run", 5], "N1d a failed event retried on its own is done again, as before");
    const refused = fakeDb(failedRow("evt_n1e"), { failUpdate: (table) => table === "billing_events" });
    t.eq(await reclaimEvent(refused, "evt_n1e"), "busy", "N1e a takeover whose write was refused is not treated as taken (was: run)");
    const lost = fakeDb(failedRow("evt_n1f"), { raceLoses: (table, patch) => table === "billing_events" && patch.status === "received" });
    t.eq(await reclaimEvent(lost, "evt_n1f"), "busy", "N1f a row another delivery changed between the read and the write is not taken");
    const noCount = fakeDb({ billing_events: [{ event_id: "evt_n1g", provider: "stripe", type: "x", status: "failed", attempts: null, received_at: iso(NOW - 5000) }] });
    t.eq([await reclaimEvent(noCount, "evt_n1g"), noCount.db.billing_events[0].attempts], ["run", 2], "N1g a failed row with no attempt count is still taken (and by one delivery only)");
    // The whole webhook, twice at once: one payment is applied once, and Stripe is told to send the other again.
    const pair = fakeDb(failedRow("evt_n1h"));
    const [p1, p2] = await Promise.all([deliver(loadHook(pair), checkout("evt_n1h")), deliver(loadHook(pair), checkout("evt_n1h"))]);
    const writes = pair.calls.filter((c) => c.table === "subscriptions" && (c.op === "upsert" || c.op === "update" || c.op === "insert")).length;
    t.eq([p1.statusCode, p2.statusCode].sort(), [200, 503], "N1h the Stripe webhook, two retries of a failed event at once: one 200, one 503 (was: both 200)");
    t.eq([(pair.db.subscriptions || []).length, pair.db.billing_events[0].attempts, pair.db.billing_events[0].status], [1, 2, "processed"], "N1i …the plan is written by one of them and the event ends processed on its second attempt");
    t.ok(writes >= 1, "N1j (the plan really was written)");
    synced = 0;
    const rcPair = fakeDb({ billing_events: [{ event_id: "rc:n1", provider: "revenuecat", type: "RENEWAL", status: "failed", attempts: 1, received_at: iso(NOW - 5000) }] });
    const [q1, q2] = await Promise.all([wh.handle(rcEvent("n1"), depsFor(rcPair)), wh.handle(rcEvent("n1"), depsFor(rcPair))]);
    t.eq([[q1.statusCode, q2.statusCode].sort(), synced], [[200, 503], 1], "N1k the store webhook, the same: one sync, one 503 (was: two syncs)");
  }

  // ── P3-04  what a completed checkout grants ─────────────────────────────────────────────────────────
  {
    const sec = Math.floor(NOW / 1000);
    const session = (payment_status, extra = {}) => ({ object: "checkout.session", mode: "subscription", customer: "cus_2", subscription: "sub_2", payment_status,
      metadata: { user_id: U2, plan_key: "annual" }, ...extra });
    const evt = (id, payment_status, type = "checkout.session.completed", extra) => ({ id, type, created: sec, data: { object: session(payment_status, extra) } });
    const stripeSays = (sub) => ({ stripeGet: async (p) => { if (p.startsWith("/subscriptions/sub_2")) return sub; throw new Error("unexpected " + p); } });
    const periodEnd = sec + 365 * 86400;

    // Not paid yet (a bank debit still to clear), and Stripe says the subscription is not active.
    const a = fakeDb();
    await deliver(loadHook(a, stripeSays({ id: "sub_2", status: "incomplete", items: { data: [{ current_period_end: periodEnd }] } })), evt("evt_unpaid", "unpaid"));
    t.eq(isPaidSubscription((a.db.subscriptions || [])[0] || null), false, "P3-04a a checkout that completed with the payment still unpaid does not make the household paid");
    // …and when Stripe cannot be asked, nothing is assumed.
    const b = fakeDb();
    const rb = await deliver(loadHook(b), evt("evt_unpaid2", "unpaid"));
    t.eq([rb.statusCode, isPaidSubscription((b.db.subscriptions || [])[0] || null)], [200, false], "P3-04b …nor when Stripe cannot be asked about it");
    t.eq(b.rpcCalls.filter((c) => c.fn === "founding_seat_take").length, 0, "P3-04c …and an unpaid checkout takes no founding seat");

    // Paid: the row carries the period Stripe says was paid for, so it runs out even if a later event never arrives.
    const c = fakeDb();
    await deliver(loadHook(c, stripeSays({ id: "sub_2", status: "active", items: { data: [{ current_period_end: periodEnd }] } })), evt("evt_paid", "paid"));
    t.eq([c.db.subscriptions[0].status, c.db.subscriptions[0].current_period_end], ["active", iso(periodEnd * 1000)], "P3-04d a paid checkout's row carries the end of the period that was paid for");
    // Paid, and Stripe cannot be asked: the person who paid is never left without their plan.
    const d = fakeDb();
    await deliver(loadHook(d), evt("evt_paid2", "paid"));
    t.eq([d.db.subscriptions[0].status, isPaidSubscription(d.db.subscriptions[0])], ["active", true], "P3-04e a paid checkout still gives the plan when Stripe cannot be asked for the period");

    // Stripe's own word for a debit it is still collecting is "active": then the household has it, with its period.
    const e = fakeDb();
    await deliver(loadHook(e, stripeSays({ id: "sub_2", status: "active", current_period_end: periodEnd })), evt("evt_unpaid3", "unpaid"));
    t.eq([e.db.subscriptions[0].status, e.db.subscriptions[0].current_period_end], ["active", iso(periodEnd * 1000)], "P3-04f unpaid at checkout but active at Stripe: Stripe's own state is what the row says");

    // The payment clearing later is heard.
    const f = fakeDb({ subscriptions: [{ user_id: U2, provider: "stripe", provider_subscription_id: "sub_2", provider_customer_id: "cus_2", status: "incomplete", plan_key: "annual", last_event_at: iso((sec - 60) * 1000) }] });
    const rf = await deliver(loadHook(f, stripeSays({ id: "sub_2", status: "active", items: { data: [{ current_period_end: periodEnd }] } })), evt("evt_async", "paid", "checkout.session.async_payment_succeeded"));
    t.eq([rf.statusCode, f.db.subscriptions[0].status, f.db.subscriptions[0].current_period_end], [200, "active", iso(periodEnd * 1000)], "P3-04g when the payment clears later (async_payment_succeeded) the household is paid");

    // A different subscription's answer is never used.
    const g = fakeDb();
    await deliver(loadHook(g, { stripeGet: async () => ({ id: "sub_OTHER", status: "active", current_period_end: periodEnd }) }), evt("evt_unpaid4", "unpaid"));
    t.eq(isPaidSubscription((g.db.subscriptions || [])[0] || null), false, "P3-04h an answer about another subscription is not taken as this one's");
  }

  // ── P2-02  a paid row with no period end ────────────────────────────────────────────────────────────
  {
    const row = (o) => ({ provider: "stripe", status: "active", current_period_end: null, ...o });
    t.eq(isPaidSubscription(row({ plan_key: "monthly", last_event_at: iso(NOW - 20 * DAY) }), NOW), true, "P2-02a a monthly row with no period end counts inside the month it was paid for");
    t.eq(isPaidSubscription(row({ plan_key: "monthly", last_event_at: iso(NOW - 40 * DAY) }), NOW), false, "P2-02b …and stops counting once that month (and three days) is over with nothing heard since");
    t.eq(isPaidSubscription(row({ plan_key: "annual", last_event_at: iso(NOW - 300 * DAY) }), NOW), true, "P2-02c an annual row with no period end counts inside its year");
    t.eq(isPaidSubscription(row({ plan_key: "founding_annual", last_event_at: iso(NOW - 380 * DAY) }), NOW), false, "P2-02d …and stops a year (and three days) after the last word from Stripe");
    t.eq(isPaidSubscription(row({ plan_key: null, updated_at: iso(NOW - 200 * DAY) }), NOW), true, "P2-02e a row with no plan key is given the longer (annual) time");
    t.eq(isPaidSubscription(row({ plan_key: "monthly" }), NOW), true, "P2-02f a caller that did not read the dates gets the old answer (nobody loses access to a narrower read)");
    t.eq(isPaidSubscription({ provider: "app_store", status: "active", current_period_end: null, plan_key: "monthly", last_event_at: iso(NOW - 400 * DAY) }, NOW), true, "P2-02g a store row is not touched by this (the store always gives an end)");
    t.eq([isPaidSubscription(row({ current_period_end: iso(NOW + DAY), last_event_at: iso(NOW - 400 * DAY) }), NOW), isPaidSubscription(row({ current_period_end: iso(NOW - DAY), last_event_at: iso(NOW) }), NOW)], [true, false],
      "P2-02h a row WITH a period end is judged by that end alone, as before");
    t.eq(isPaidSubscription(row({ status: "past_due", plan_key: "monthly", last_event_at: iso(NOW) }), NOW), false, "P2-02i and status still comes first");

    // The row is filled in from Stripe the next time the household's status is read.
    const live = require("../netlify/functions/_lib/stripeLive.js");
    t.eq(typeof live.fillMissingPeriod, "function", "P2-02j there is a fill-in for a row with no period end");
    if (typeof live.fillMissingPeriod === "function") {
      const end = Math.floor(NOW / 1000) + 200 * 86400;
      const a = fakeDb({ subscriptions: [{ user_id: U1, provider: "stripe", provider_subscription_id: "sub_9", status: "active", current_period_end: null, plan_key: "annual" }] });
      const out = await live.fillMissingPeriod(a, U1, { ...a.db.subscriptions[0] }, { stripeGet: async () => ({ id: "sub_9", status: "active", items: { data: [{ current_period_end: end }] } }) });
      t.eq([a.db.subscriptions[0].current_period_end, out.current_period_end, out.status], [iso(end * 1000), iso(end * 1000), "active"], "P2-02k Stripe's period end is written onto the row and used at once");
      const b = fakeDb({ subscriptions: [{ user_id: U1, provider: "stripe", provider_subscription_id: "sub_9", status: "active", current_period_end: null, plan_key: "annual" }] });
      const ended = Math.floor(NOW / 1000) - 5 * 86400;
      const out2 = await live.fillMissingPeriod(b, U1, { ...b.db.subscriptions[0] }, { stripeGet: async () => ({ id: "sub_9", status: "canceled", ended_at: ended, current_period_end: ended }) });
      t.eq([b.db.subscriptions[0].status, isPaidSubscription(out2, NOW)], ["canceled", false], "P2-02l a subscription Stripe says is over stops counting (the cancellation we never heard)");
      const c = fakeDb({ subscriptions: [{ user_id: U1, provider: "stripe", provider_subscription_id: "sub_9", status: "active", current_period_end: null, plan_key: "annual" }] });
      const before = { ...c.db.subscriptions[0] };
      const out3 = await live.fillMissingPeriod(c, U1, before, { stripeGet: async () => { throw new Error("stripe down"); } });
      t.eq([out3, c.calls.length], [before, 0], "P2-02m when Stripe cannot be asked nothing changes and nothing is thrown");
      const out4 = await live.fillMissingPeriod(c, U1, before, { stripeGet: async () => ({ id: "sub_OTHER", status: "canceled" }) });
      t.eq([out4, c.calls.length], [before, 0], "P2-02n an answer about another subscription changes nothing");
      let asked = 0;
      const withEnd = { user_id: U1, provider: "stripe", provider_subscription_id: "sub_9", status: "active", current_period_end: iso(NOW + DAY) };
      await live.fillMissingPeriod(c, U1, withEnd, { stripeGet: async () => { asked++; return {}; } });
      await live.fillMissingPeriod(c, U1, { provider: "app_store", status: "active", current_period_end: null, provider_subscription_id: "x" }, { stripeGet: async () => { asked++; return {}; } });
      await live.fillMissingPeriod(c, U1, null, { stripeGet: async () => { asked++; return {}; } });
      t.eq(asked, 0, "P2-02o a row that has its end, a store row, and no row at all never ask Stripe anything");
    }
    // The reads that decide access carry the dates the rule needs.
    const AUTH = read("netlify/functions/_lib/auth.js"), BILLING = read("netlify/functions/billing.js"), HOUSE = read("netlify/functions/_lib/household.js");
    t.ok(/\.select\("provider, status, current_period_end, plan_key, cancel_at_period_end, last_event_at, updated_at"\)/.test(AUTH), "P2-02p the entitlement read (every function's plan check) reads the row's dates");
    t.ok(/fillMissingPeriod\(admin, user_id, /.test(BILLING), "P2-02q the status endpoint fills in a missing period end");
    t.ok(/\.select\("provider, status, current_period_end, plan_key, last_event_at, updated_at"\)\.eq\("user_id", peer\)/.test(HOUSE), "P2-02r the partner's-plan read carries the dates too");
  }

  // ── P3-03  every page of a customer's subscriptions ─────────────────────────────────────────────────
  {
    const live = require("../netlify/functions/_lib/stripeLive.js");
    const page1 = Array.from({ length: 100 }, (_, i) => ({ id: `sub_old_${i}`, status: "canceled" }));
    const asked = [];
    const get = async (p) => {
      asked.push(p);
      if (!/starting_after=/.test(p)) return { data: page1, has_more: true };
      if (/starting_after=sub_old_99/.test(p)) return { data: [{ id: "sub_live", status: "active" }], has_more: false };
      return { data: [], has_more: false };
    };
    const found = await live.liveSubscriptionsFor("cus_big", { stripeGet: get });
    t.eq(found.map((s) => s.id), ["sub_live"], "P3-03a a live subscription past the first 100 is found");
    t.eq([asked.length, /starting_after=sub_old_99/.test(asked[1] || "")], [2, true], "P3-03b …by asking for the next page after the last one read");
    let n = 0;
    const endless = async () => { n++; return { data: [{ id: `s${n}`, status: "canceled" }], has_more: true }; };
    await live.liveSubscriptionsFor("cus_loop", { stripeGet: endless });
    t.ok(n > 1 && n <= 50, "P3-03c a list that never ends is given up on, not followed for ever");
    const one = await live.liveSubscriptionsFor("cus_small", { stripeGet: async () => ({ data: [{ id: "a", status: "active" }, { id: "b", status: "incomplete" }], has_more: false }) });
    t.eq(one.map((s) => s.id), ["a"], "P3-03d one page still reads as before (an incomplete one is not counted at checkout)");
    const expired = [];
    const sessions = Array.from({ length: 100 }, (_, i) => ({ id: `cs_${i}`, mode: "subscription" }));
    const k = await live.expireOpenCheckouts("cus_big", {
      stripeGet: async (p) => (/starting_after=cs_99/.test(p) ? { data: [{ id: "cs_last", mode: "subscription" }], has_more: false } : { data: sessions, has_more: true }),
      stripePost: async (p) => { expired.push(p); return {}; } });
    t.eq([k, expired.some((p) => p.includes("cs_last"))], [101, true], "P3-03e open checkouts past the first 100 are expired too");
  }

  // ── GROK MEDIUM  a founding store trial cancelled on day 13 ────────────────────────────────────────
  // The reviewer read the comparison backwards: "the store's end is no later than the trial's end (give or take a
  // day)" is TRUE when the two are the same, so the seat does go back. Held here so it stays that way.
  {
    for (const k of Object.keys(require.cache)) if (k.startsWith(FN)) delete require.cache[k];
    const S = require("../netlify/functions/_lib/storeSubscriptions.js");
    const trialEnd = NOW + DAY;                                              // day 13 of 14
    const rpc = { founding_seat_take: async () => ({ data: [{ taken: true, seats: 1, over_cap: false }], error: null }),
      founding_seat_release: async () => ({ data: true, error: null }), waitlist_founding_mark_ended: async () => ({ data: null, error: null }) };
    const a = fakeDb({ subscriptions: [{ user_id: U1, provider: "app_store", status: "trialing", plan_key: "founding_annual", current_period_end: iso(trialEnd) }] }, { rpc });
    const product = (o) => ({ subscriptions: { "app.flourishmoney.founding.annual": { store: "app_store", period_type: "trial", expires_date: iso(trialEnd), ...o } } });
    const deps = (now, sub) => ({ fetchSubscriber: async () => sub, user: { email: "founder@example.test" }, now, env: {} });
    const r13 = await S.syncStoreSubscription(a, U1, deps(NOW, product({ unsubscribe_detected_at: iso(NOW) })));
    t.eq([r13.paid, a.db.subscriptions[0].status, a.rpcCalls.filter((c) => c.fn === "founding_seat_release").length], [true, "trialing", 0],
      "GROK-a cancelled on day 13: still in the trial until day 14, and the seat is still held");
    const r14 = await S.syncStoreSubscription(a, U1, deps(trialEnd + 3600000, product({ unsubscribe_detected_at: iso(NOW) })));
    const released = a.rpcCalls.filter((c) => c.fn === "founding_seat_release");
    t.eq([r14.paid, a.db.subscriptions[0].status, released.length, released[0] && released[0].args.p_reason], [false, "canceled", 1, "trial_ended_unpaid"],
      "GROK-b when the trial runs out on day 14 (same end date as before) the seat goes back");
    t.eq([a.db.subscriptions[0].founding_ended_at || null, a.rpcCalls.filter((c) => c.fn === "waitlist_founding_mark_ended").length], [null, 0],
      "GROK-c …and the founding price is not marked as ended for a household that never paid");
    // A trial that converted (a later end) and then ended is a paid founding subscription that ended: the seat stays.
    const b = fakeDb({ subscriptions: [{ user_id: U1, provider: "app_store", status: "trialing", plan_key: "founding_annual", current_period_end: iso(trialEnd) }] }, { rpc });
    const yearEnd = trialEnd + 365 * DAY;
    await S.syncStoreSubscription(b, U1, deps(yearEnd + 3600000, { subscriptions: { "app.flourishmoney.founding.annual": { store: "app_store", period_type: "normal", expires_date: iso(yearEnd) } } }));
    t.eq([b.rpcCalls.filter((c) => c.fn === "founding_seat_release").length, !!b.db.subscriptions[0].founding_ended_at], [0, true],
      "GROK-d a trial that became a paid year, then ended, keeps its seat and is marked ended (the rule as it was)");
  }

  // ── P2-05  a founding trial whose first charge never went through ──────────────────────────────────
  {
    const sec = Math.floor(NOW / 1000);
    const trialEnd = sec - 20 * 86400;
    const rpcFor = () => ({ founding_seat_release: async () => ({ data: true, error: null }), waitlist_founding_mark_ended: async () => ({ data: null, error: null }) });
    const rowFor = () => ({ subscriptions: [{ user_id: U1, provider: "stripe", provider_subscription_id: "sub_f", provider_customer_id: "cus_f", status: "past_due", plan_key: "founding_annual",
      founding_locked_at: iso(NOW - 34 * DAY), last_event_at: iso((sec - 86400) * 1000) }] });
    const ended = (o = {}) => ({ id: `evt_end_${Math.random().toString(36).slice(2)}`, type: "customer.subscription.deleted", created: sec,
      data: { object: { id: "sub_f", status: "canceled", customer: "cus_f", metadata: { user_id: U1, plan_key: "founding_annual" }, trial_end: trialEnd, ended_at: sec, canceled_at: sec,
        items: { data: [{ current_period_end: trialEnd + 365 * 86400 }] }, ...o } } });
    const invoices = (list, asked) => ({ stripeGet: async (p) => { if (p.startsWith("/invoices?subscription=sub_f")) { asked.n++; return { data: list, has_more: false }; } throw new Error("unexpected " + p); } });
    const release = (db) => db.rpcCalls.filter((c) => c.fn === "founding_seat_release").map((c) => c.args.p_reason);
    const markEnded = (db) => db.rpcCalls.filter((c) => c.fn === "waitlist_founding_mark_ended").length;

    const q1 = { n: 0 };
    const a = fakeDb(rowFor(), { rpc: rpcFor() });
    const r1 = await deliver(loadHook(a, invoices([{ amount_paid: 0 }], q1)), ended());
    t.eq([r1.statusCode, release(a), a.db.subscriptions[0].status], [200, ["trial_ended_unpaid"], "canceled"], "P2-05a the card never went through after the trial and Stripe ended it: the seat goes back");
    t.eq([a.db.subscriptions[0].founding_ended_at || null, markEnded(a), a.db.subscriptions[0].founding_locked_at], [null, 0, null], "P2-05b …and the founding price is not marked as ended for a household that never paid");

    const q2 = { n: 0 };
    const b = fakeDb(rowFor(), { rpc: rpcFor() });
    await deliver(loadHook(b, invoices([{ amount_paid: 0 }, { amount_paid: 7999 }], q2)), ended());
    t.eq([release(b), !!b.db.subscriptions[0].founding_ended_at, markEnded(b)], [[], true, 1], "P2-05c a founding subscription that WAS paid and then ended keeps its seat and is marked ended, as before");

    const c = fakeDb(rowFor(), { rpc: rpcFor() });
    await deliver(loadHook(c), ended());                                    // Stripe cannot be asked
    t.eq([release(c), !!c.db.subscriptions[0].founding_ended_at], [[], true], "P2-05d when Stripe cannot be asked, the rule is as it was (nothing is assumed unpaid)");

    const q4 = { n: 0 };
    const d = fakeDb(rowFor(), { rpc: rpcFor() });
    await deliver(loadHook(d, invoices([{ amount_paid: 0 }], q4)), ended({ discount: { id: "di_1" } }));
    t.eq([release(d), q4.n], [[], 0], "P2-05e a subscription with a discount on it (a code that covers the price) is left to the rule as it was");

    const q5 = { n: 0 };
    const e = fakeDb(rowFor(), { rpc: rpcFor() });
    await deliver(loadHook(e, invoices([], q5)), ended());
    t.eq(release(e), [], "P2-05f an empty list proves nothing, so nothing is released on it");

    const q6 = { n: 0 };
    const f = fakeDb(rowFor(), { rpc: rpcFor() });
    await deliver(loadHook(f, invoices([{ amount_paid: 0 }], q6)), ended({ ended_at: trialEnd - 3600, canceled_at: trialEnd - 3600 }));
    t.eq([release(f), q6.n], [["trial_ended_unpaid"], 0], "P2-05g cancelled inside the 14 days: released as before, without asking Stripe anything");

    const q7 = { n: 0 };
    const g = fakeDb(rowFor(), { rpc: rpcFor() });
    await deliver(loadHook(g, invoices([{ amount_paid: 0 }], q7)), ended({ trial_end: null, metadata: { user_id: U1, plan_key: "founding_annual" } }));
    t.eq([release(g), q7.n], [[], 0], "P2-05h a founding subscription that never had a trial is not asked about");
  }

  // ── P2-03  a policy notice that failed to send ──────────────────────────────────────────────────────
  // By design, written down in the migration: the notice goes at most once per account, and a failed send is kept
  // for a person to look at, never retried on its own. tests/policyNotice.test.cjs 4g and 4j run it.
  {
    const SQL = read("supabase/migrations/0040_policy_notice.sql"), SWEEP = read("netlify/functions/policy-notice-sweep.js");
    t.ok(/send that fails or is cut off keeps its row, so it is never sent again on its own: it stays visible for a person to decide/.test(SQL.replace(/\n-- /g, " ")), "P2-03a the migration states the rule: a failed send is kept, visible, and not sent again on its own");
    t.ok(/await finish\(admin, a\.user_id, ok \? "sent" : "failed", now\);\s+if \(!ok\) \{ failed \+= 1; break; \}/.test(SWEEP), "P2-03b the sweep records a failure as failed and stops, so somebody looks before more go");
    t.ok(/status in \('claimed','sent','failed','skipped_sample'\)/.test(SQL), "P2-03c 'failed' is its own recorded state, apart from 'claimed' and 'sent'");
  }

  // ── P2-06  two gifts redeemed at once ───────────────────────────────────────────────────────────────
  {
    const SQL = read("supabase/migrations/0050_gift_codes.sql");
    const body = SQL.slice(SQL.indexOf("create or replace function public.gift_redeem("), SQL.indexOf("create or replace function public.gift_cover("));
    const lock = body.indexOf("pg_advisory_xact_lock(hashtextextended('gift_redeem:' || p_user::text, 0))");
    const rowLock = body.indexOf("from public.gift_codes where code = p_code for update");
    const after = body.indexOf("select max(ends_at) into v_after");
    t.ok(lock > 0 && rowLock > lock && after > rowLock, "P2-06a one redemption at a time per account (a lock), then the code's row is locked, and only then is 'what this account already holds' read");
    t.ok(/coalesce\(v_after, p_now\)\)/.test(body) && /where code = p_code and redeemed_at is null and voided_at is null/.test(body), "P2-06b the second gift starts after the first one's end, and a code is only ever written while still unredeemed");
  }

  // ── P2-07  a gift refunded or redeemed between the claim and the send ───────────────────────────────
  {
    for (const k of Object.keys(require.cache)) if (k.startsWith(FN)) delete require.cache[k];
    const G = require("../netlify/functions/_lib/gifts.js");
    const claimRow = (code) => ({ code, plan: "flourish", recipient_email: `${code.toLowerCase()}@example.test`, recipient_name: "Pat", gift_message: null, send_on: "2026-12-25", start_on: null, recipient_send_attempts: 1, buyer_name: "Robin" });
    const run = async (giftRows, codes, o = {}) => {
      let claimed = false;
      const marks = [];
      const admin = fakeDb({ gift_codes: giftRows }, { rpc: {
        gift_claim_due_sends: async () => { if (claimed) return { data: [], error: null }; claimed = true; return { data: codes.map(claimRow), error: null }; },
        gift_mark_sent: async (a) => { marks.push(["sent", a.p_code]); return { data: true, error: null }; },
        gift_mark_send_failed: async (a) => { marks.push(["failed", a.p_code, a.p_error]); return { data: null, error: null }; } } });
      if (o.unreadable) admin.from = () => { throw new Error("read refused"); };
      const sends = [];
      const out = await G.runSendSweep({ admin, send: async (mail, key) => { sends.push(key); return { sent: true }; }, pauseMs: 0, log: { error() {} } });
      return { out, sends, marks };
    };
    const A = "AAAAAAAAAAAA", B = "BBBBBBBBBBBB", C = "CCCCCCCCCCCC";
    const r = await run([{ code: A, voided_at: iso(NOW), redeemed_at: null }, { code: B, voided_at: null, redeemed_at: null }, { code: C, voided_at: null, redeemed_at: iso(NOW) }], [A, B, C]);
    if (r.out.wordsPending) t.ok(false, "P2-07 the gift email's words are placeholders in this checkout, so the sweep cannot be run here");
    t.eq(r.sends, [`gift-recipient/${B}`], "P2-07a a gift refunded after its row was claimed gets no email, and neither does one redeemed meanwhile; the others go");
    t.eq([r.out.sent, r.out.withdrawn, r.out.failed], [1, 2, 0], "P2-07b …counted as withdrawn, not as failures");
    t.eq(r.marks.filter((m) => m[0] === "failed").map((m) => [m[1], m[2]]), [[A, "withdrawn_voided"], [C, "withdrawn_redeemed"]], "P2-07c …and each row says why, with its claim kept so no later run takes it");
    const r2 = await run([], [B], { unreadable: true });
    t.eq([r2.sends.length, r2.out.sent], [1, 1], "P2-07d when the row cannot be read again, the email goes as before (the check never blocks a gift)");
    const r3 = await run([{ code: B, voided_at: null, redeemed_at: null }], [B]);
    t.eq(Object.keys(r3.out).sort(), ["failed", "sent", "skipped", "unavailable", "wordsPending"], "P2-07e a run where nothing was withdrawn answers in the same shape as before");
  }

  // ── P3-10  the trial reminder sweep ─────────────────────────────────────────────────────────────────
  {
    process.env.WAITLIST_UNSUBSCRIBE_SECRET = "review-1122-unsubscribe";
    for (const k of Object.keys(require.cache)) if (k.startsWith(FN)) delete require.cache[k];
    const WORDS = require.resolve("../netlify/functions/_lib/trialWords.js");
    const realW = require(WORDS);
    const standIn = {}; for (const id of Object.keys(realW.TRIAL_EMAIL_WORDS)) standIn[id] = /^\[WORDS:/.test(realW.TRIAL_EMAIL_WORDS[id]) ? `stand-in ${id} {date} {amount}` : realW.TRIAL_EMAIL_WORDS[id];
    require.cache[WORDS].exports = { ...realW, TRIAL_EMAIL_WORDS: standIn, trialEmailWords: (id, f = {}) => Object.keys(f).reduce((x, k) => x.split(`{${k}}`).join(String(f[k])), standIn[id]) };
    const sweep = require("../netlify/functions/trial-reminder-sweep.js")._test.sweep;
    const uid = (i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
    const end = NOW + 2.5 * DAY;                                            // inside the reminder's window
    const subs = [], reminders = [];
    for (let i = 0; i < 300; i++) {
      subs.push({ user_id: uid(i), provider: "app_store", status: "trialing", plan_key: "monthly", current_period_end: iso(end), cancel_at_period_end: false });
      if (i < 299) reminders.push({ user_id: uid(i), provider: "app_store", subscription_ref: `${uid(i)}:monthly`, sent_at: iso(NOW - 3600000), claimed_at: iso(NOW - 3600000) });
    }
    const a = fakeDb({ subscriptions: subs, trial_reminders: reminders });
    let ticks = 0; const sent = [];
    const out = await sweep({ admin: a, now: NOW, clock: () => (ticks += 150), send: async (payload) => { sent.push(payload.to[0]); return true; } });
    t.eq([out.read, out.sent, sent.length], [true, 1, 1], "P3-10a the one reminder still owed is sent, though 299 already-sent trials come before it (each check costing run time)");
    t.eq(a.db.trial_reminders.filter((r) => r.user_id === uid(299) && r.sent_at).length, 1, "P3-10b …and it is recorded as sent");
    const again = await sweep({ admin: a, now: NOW, clock: () => (ticks += 150), send: async (payload) => { sent.push(payload.to[0]); return true; } });
    t.eq([again.sent, sent.length], [0, 1], "P3-10c the next run sends nothing more: never twice");

    // Two owed, time for one: the trial that ends sooner goes first, whatever order the database returned them in.
    const later = { user_id: uid(901), provider: "play_store", status: "trialing", plan_key: "annual", current_period_end: iso(NOW + 2.9 * DAY), cancel_at_period_end: false };
    const sooner = { user_id: uid(902), provider: "play_store", status: "trialing", plan_key: "annual", current_period_end: iso(NOW + 1.2 * DAY), cancel_at_period_end: false };
    const b = fakeDb({ subscriptions: [later, sooner] });
    let n = 0; const who = [];
    b.auth.admin.getUserById = async (id) => ({ data: { user: { id, email: `${id}@example.test` } }, error: null });
    await sweep({ admin: b, now: NOW, clock: () => (n++ < 2 ? 0 : 999999), send: async (payload) => { who.push(payload.to[0]); return true; } });
    t.eq(who, [`${uid(902)}@example.test`], "P3-10d with time for one reminder, the trial ending soonest gets it");

    // The read of what was already sent failing changes nothing but the cost: each trial is checked on its own.
    const c = fakeDb({ subscriptions: [sooner], trial_reminders: [{ user_id: uid(902), provider: "play_store", subscription_ref: `${uid(902)}:annual`, sent_at: iso(NOW), claimed_at: iso(NOW) }] });
    const realFrom = c.from;
    c.from = (table) => { const q = realFrom(table); if (table === "trial_reminders") q.in = () => { throw new Error("read refused"); }; return q; };
    const o3 = await sweep({ admin: c, now: NOW, send: async () => { throw new Error("must not send"); } });
    t.eq([o3.sent, o3.skipped], [0, 1], "P3-10e when the one read of sent reminders fails, an already-sent reminder is still never sent again");
  }

  // ── P2-01  instant signup ───────────────────────────────────────────────────────────────────────────
  // The owner's decision of 2026-11-11 (SIGNUP_INSTANT): a new account is signed straight in, its address not proved,
  // and recorded as such. What an unproved address must not open is held here.
  {
    const BETA = read("netlify/functions/beta.js"), HOUSE = read("netlify/functions/household.js"), APP = read("src/App.jsx");
    t.ok(/app_metadata: \{ email_confirmation: instant \? "instant" : confirmOnCreate \? "auto" : "link"/.test(BETA), "P2-01a an instant account is recorded as 'instant' where only the server can write it");
    t.ok(/\(meta\.email_confirmation === "instant" \|\| meta\.email_confirmation === "auto"\) && providers\.includes\("email"\)/.test(BETA) && /signOut\(jwt, "others"\)/.test(BETA),
      "P2-01b reached through Apple or Google, an unproved account loses its password and every other session");
    t.ok(/if \(!byToken && !H\.isCodeShaped\(body\.code\)\) return json\(400/.test(HOUSE), "P2-01c joining a household takes the invitation's own link or code, never the address alone");
    const reset = APP.slice(APP.indexOf("const { error } = await supabase.auth.updateUser({ password: pw });"), APP.indexOf("const { error } = await supabase.auth.updateUser({ password: pw });") + 700);
    t.ok(/supabase\.auth\.signOut\(\{ scope: "others" \}\)/.test(reset), "P2-01d setting a new password from the emailed link signs every other session out (whoever made the account first is out)");
  }

  // ── P1-06  the gift page's "bought" screen ─────────────────────────────────────────────────────────
  // True as written (typing ?bought=1 shows the thank-you), and it gives nothing away: no code, no request, no plan.
  {
    const JS = read("public/gift/gift.js"), HTML = read("public/gift/index.html");
    const thanks = HTML.slice(HTML.indexOf('id="thanks"'), HTML.indexOf("</section>", HTML.indexOf('id="thanks"')));
    t.ok(thanks.length > 0 && !/code|input|href=/i.test(thanks.replace(/gift code and a printable card/, "")), "P1-06a the thank-you block holds words only: no code, no field, no link");
    const branch = JS.slice(JS.indexOf('.get("bought") === "1"'), JS.indexOf("var today = torontoToday()"));
    t.ok(/return;/.test(branch) && !/fetch\(|XMLHttpRequest/.test(branch), "P1-06b the bought screen asks the server for nothing and shows nothing from it");
    t.ok(/payment_method_types: \["card"\]/.test(read("netlify/functions/_lib/gifts.js")), "P1-06c a gift is paid by card, at once: the code comes only from the paid webhook, by email");
  }

  console.error = quiet; console.warn = warn;
  process.exit(t.summary("review 2026-11-22: payments and entitlements") ? 1 : 0);
})().catch((e) => { console.log("  ✗ review1122Pay crashed:", e && e.stack); process.exit(1); });
