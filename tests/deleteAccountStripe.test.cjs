// tests/deleteAccountStripe.test.cjs
// -----------------------------------------------------------------------------
// KNOWN-DEFECTS 23: DELETING AN ACCOUNT CANCELS ITS STRIPE SUBSCRIPTION FIRST.
//
// Runs the real delete_account handler (netlify/functions/plaid.js) against a recording stand-in for the
// database, and a MOCKED Stripe and Plaid: every fetch goes to a stub, never to api.stripe.com. Pins:
//   1. a live subscription is cancelled at Stripe before anything is erased, then the account is deleted;
//   2. if the cancellation fails, or it cannot be known whether a charge is live, NOTHING is deleted and
//      the response stops at "billing_cancel"; the app tells the person to try again or email hello@;
//   3. a subscription that has already ended (in our row, or at Stripe), or that Stripe no longer has,
//      needs no cancelling, and no Stripe key is needed when there is nothing to cancel;
//   4. a founding subscription's number is stamped ended (idempotently, so a retry stamps again), and the
//      founding ledger is never deleted from: deleting an account never frees a number;
//   5. Stripe's later cancellation event for the deleted account is acknowledged, not retried for days.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");
const { signPayload } = require("../netlify/functions/_lib/stripeSignature.js");

const AUTH_PATH = require.resolve("../netlify/functions/_lib/auth.js");
const API_PATH = require.resolve("../netlify/functions/_lib/stripeApi.js");
const FN_PATH = require.resolve("../netlify/functions/plaid.js");
const HOOK_PATH = require.resolve("../netlify/functions/stripe-webhook.js");
const USER = "00000000-0000-4000-8000-000000000001";
// Production today (2026-10-07): no public.subscriptions table (0009/0010 not applied). PostgREST answers
// both the read and the delete with exactly this (checked against a local PostgREST v16.2, HTTP 404):
const PGRST205 = { code: "PGRST205", details: null, hint: null, message: "Could not find the table 'public.subscriptions' in the schema cache" };
const SUB = (over = {}) => ({ provider_subscription_id: "sub_live_1", status: "active", plan_key: "annual", ...over });

// db: { subs: [...rows] | "missing" | "error" }, stripe: { status, getStatus, getFails, cancelFails }, rpcFails
async function run({ subs = [], stripe = {}, rpcFails = false, key = true } = {}) {
  const log = { events: [], deletes: [], authDeleted: false, rpc: [], fetches: [] };
  const admin = {
    from: (table) => ({
      select: () => ({ eq: async () => {
        if (table === "subscriptions") {
          if (subs === "missing") return { data: null, error: { code: "42P01", message: 'relation "subscriptions" does not exist' } };
          if (subs === "prod") return { data: null, error: PGRST205 };
          if (subs === "error") return { data: null, error: { message: "connection reset" } };
          return { data: subs, error: null };
        }
        return { data: [{ item_id: "item-1", access_token: "access-sandbox-x" }], error: null };
      } }),
      delete: () => ({ eq: async () => {
        if (table === "subscriptions" && subs === "prod") { log.events.push("delete:subscriptions:missing"); return { error: PGRST205 }; }
        log.deletes.push(table); log.events.push(`delete:${table}`); return { error: null }; } }),
    }),
    rpc: async (name, args) => { log.rpc.push([name, args]); return rpcFails ? { data: null, error: { message: "rpc down" } } : { data: 1, error: null }; },
    auth: { admin: {
      getUserById: async () => ({ data: { user: { email: "someone@example.invalid" } } }),
      deleteUser: async () => { log.authDeleted = true; log.events.push("auth:delete"); return { error: null }; },
    } },
  };
  delete require.cache[FN_PATH]; delete require.cache[AUTH_PATH]; delete require.cache[API_PATH];
  const real = require("../netlify/functions/_lib/auth.js");
  require.cache[AUTH_PATH].exports = { ...real, getUserFromRequest: async () => ({ user_id: USER }), getAdminClient: () => admin };
  const env = { PLAID_CLIENT_ID: process.env.PLAID_CLIENT_ID, PLAID_SECRET: process.env.PLAID_SECRET, STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY };
  process.env.PLAID_CLIENT_ID = "test-client"; process.env.PLAID_SECRET = "test-secret";
  if (key) process.env.STRIPE_SECRET_KEY = "sk_test_mock_never_sent"; else delete process.env.STRIPE_SECRET_KEY;
  const realFetch = global.fetch;
  const reply = (status, body) => ({ ok: status < 300, status, json: async () => body });
  global.fetch = async (url, o = {}) => {
    url = String(url); const method = o.method || "GET";
    log.fetches.push(`${method} ${url}`);
    if (url.startsWith("https://api.stripe.com/")) {
      log.events.push(`stripe:${method}`);
      if (method === "GET") {
        if (stripe.getFails) return reply(stripe.getFails, { error: { message: "nope", code: stripe.getFails === 404 ? "resource_missing" : "api_error" } });
        return reply(200, { id: "sub_live_1", status: stripe.getStatus || "active" });
      }
      if (method === "DELETE") return stripe.cancelFails ? reply(500, { error: { message: "stripe down" } }) : reply(200, { id: "sub_live_1", status: "canceled" });
    }
    return reply(200, { removed: true });   // Plaid /item/remove
  };
  const { handler } = require(FN_PATH);
  delete require.cache[FN_PATH];
  const quiet = { e: console.error, w: console.warn }; console.error = () => {}; console.warn = () => {};
  try {
    const res = await handler({ httpMethod: "POST", headers: { origin: "https://flourishmoney.app" }, body: JSON.stringify({ action: "delete_account" }) });
    return { body: JSON.parse(res.body || "{}"), log };
  } finally {
    global.fetch = realFetch; console.error = quiet.e; console.warn = quiet.w;
    for (const [k, v] of Object.entries(env)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
}
const steps = (b) => (b.errors || []).map(e => e.step);
const stopped = (t, r, why) => {
  t.eq([r.body.deleted, steps(r.body)], [false, ["billing_cancel"]], `${why}: the deletion stops at billing_cancel`);
  t.eq([r.log.deletes, r.log.authDeleted], [[], false], `${why}: …and nothing is deleted, the sign-in stays`);
};

(async () => {
  const t = create();

  // ── 1. a live subscription is cancelled first ───────────────────────────────────────────────
  {
    const r = await run({ subs: [SUB()] });
    t.eq([r.body.deleted, r.log.authDeleted], [true, true], "1a the account is deleted");
    t.eq(r.log.fetches.filter(f => f.includes("stripe")), ["GET https://api.stripe.com/v1/subscriptions/sub_live_1", "DELETE https://api.stripe.com/v1/subscriptions/sub_live_1"],
      "1b the subscription is read, then cancelled at once (DELETE), at Stripe");
    const cancelAt = r.log.events.indexOf("stripe:DELETE"), firstDelete = r.log.events.findIndex(e => e.startsWith("delete:") || e === "auth:delete");
    t.ok(cancelAt >= 0 && cancelAt < firstDelete, "1c …before anything is erased");
    for (const status of ["trialing", "past_due", "unpaid", "incomplete", "paused"]) {
      const s = await run({ subs: [SUB({ status })], stripe: { getStatus: status } });
      t.ok(s.log.events.includes("stripe:DELETE") && s.body.deleted === true, `1d a ${status} subscription can still charge, so it is cancelled`);
    }
  }

  // ── 2. no cancellation, no deletion ─────────────────────────────────────────────────────────
  stopped(t, await run({ subs: [SUB()], stripe: { cancelFails: true } }), "2a Stripe fails to cancel");
  stopped(t, await run({ subs: [SUB()], stripe: { getFails: 500 } }), "2b Stripe cannot be read");
  stopped(t, await run({ subs: "error" }), "2c the subscriptions row cannot be read");
  stopped(t, await run({ subs: [SUB()], key: false }), "2d there is a live subscription and no Stripe key to cancel it");
  {
    const app = fs.readFileSync(path.join(__dirname, "..", "src", "App.jsx"), "utf8");
    const del = app.slice(app.indexOf("const deleteAllData = async"), app.indexOf("const signOut = async"));
    t.ok(/criticalErrors\.some\(e => e\.step === "billing_cancel"\)/.test(del)
      && del.includes("We couldn't cancel your subscription, so your account was not deleted and nothing was changed. Please try again, or email hello@flourishmoney.app."),
      "2e the app says so plainly: try again, or email hello@flourishmoney.app");
    const at = del.indexOf('e.step === "billing_cancel"'), signOutAt = del.indexOf("supabase.auth.signOut()");
    t.ok(at > 0 && at < signOutAt && /return; \/\/ FAIL CLOSED/.test(del.slice(at, signOutAt)), "2f …and keeps the person signed in, with their data");
  }

  // ── 3. nothing to cancel ────────────────────────────────────────────────────────────────────
  for (const [opts, why] of [
    [{ subs: [] }, "no subscription"], [{ subs: "missing" }, "no subscriptions table yet"],
    [{ subs: [SUB({ status: "canceled" })] }, "our row says it already ended"],
    [{ subs: [SUB({ status: "incomplete_expired" })] }, "a checkout that expired"],
    [{ subs: [{ provider_subscription_id: null, status: "active", plan_key: "annual" }] }, "a customer row with no subscription"],
  ]) {
    const r = await run({ ...opts, key: false });
    t.eq([r.body.deleted, r.log.fetches.filter(f => f.includes("stripe")).length], [true, 0], `3a ${why}: deleted, with no call to Stripe (and no key needed)`);
  }
  {
    const ended = await run({ subs: [SUB()], stripe: { getStatus: "canceled" } });
    t.eq([ended.body.deleted, ended.log.events.includes("stripe:DELETE")], [true, false], "3b Stripe already shows it ended: nothing to cancel, deleted");
    const gone = await run({ subs: [SUB()], stripe: { getFails: 404 } });
    t.eq([gone.body.deleted, gone.log.events.includes("stripe:DELETE")], [true, false], "3c Stripe has no such subscription: deleted");
  }

  // ── 4. founding: the number is stamped ended, never freed ───────────────────────────────────
  {
    const f = await run({ subs: [SUB({ plan_key: "founding_annual" })] });
    t.eq(f.log.rpc, [["waitlist_founding_mark_ended", { p_email: "someone@example.invalid" }]], "4a a founding subscription: its number is stamped ended");
    t.ok(f.log.events.indexOf("stripe:DELETE") < f.log.events.findIndex(e => e.startsWith("delete:")), "4b …after the cancellation, before anything is erased");
    stopped(t, await run({ subs: [SUB({ plan_key: "founding_annual" })], rpcFails: true }), "4c the stamp fails");
    const retry = await run({ subs: [SUB({ plan_key: "founding_annual" })], stripe: { getStatus: "canceled" } });
    t.eq([retry.log.rpc.length, retry.body.deleted], [1, true], "4d a retry after that (Stripe now shows it cancelled) stamps again, then deletes");
    const unpaid = await run({ subs: [SUB({ plan_key: "founding_annual", status: "incomplete" })], stripe: { getStatus: "incomplete" } });
    t.eq(unpaid.log.rpc, [], "4e a founding checkout that never completed was never a founding subscription: no stamp");
    t.ok([f, retry, unpaid].every(r => !r.log.deletes.some(x => /ledger/.test(x))), "4f the founding ledger is never deleted from");
    const src = fs.readFileSync(path.join(__dirname, "..", "netlify", "functions", "plaid.js"), "utf8").replace(/\/\/.*$/gm, "");
    t.ok(!/waitlist_founding_ledger/.test(src), "4g delete_account does not touch the ledger table at all");
  }

  // ── 5. Stripe's later cancellation event for the deleted account ────────────────────────────
  {
    const state = { rows: [], billing: [] };
    const admin = {
      from: (table) => {
        const q = { _f: {}, select() { return q; }, eq(c, v) { q._f[c] = v; return q; },
          async maybeSingle() { return { data: table === "billing_events" ? (state.billing.find(e => e.event_id === q._f.event_id) || null) : null, error: null }; },
          insert(row) { if (table === "billing_events") state.billing.push({ ...row }); return { select: async () => ({ data: [{ ...row }], error: null }) }; },
          async upsert(row) { state.rows.push(row); return { error: { message: "violates foreign key constraint subscriptions_user_id_fkey" } }; },
          update(patch) { return { eq: async (c, v) => { if (table === "billing_events") state.billing.filter(e => e[c] === v).forEach(e => Object.assign(e, patch)); else state.rows.push({ patch }); return { error: null }; } }; } };
        return q;
      },
      rpc: async () => ({ data: 0, error: null }),
      auth: { admin: { getUserById: async () => ({ data: { user: null }, error: { status: 404, message: "User not found" } }) } },
    };
    delete require.cache[HOOK_PATH]; delete require.cache[AUTH_PATH];
    const real = require("../netlify/functions/_lib/auth.js");
    require.cache[AUTH_PATH].exports = { ...real, getAdminClient: () => admin };
    const saved = process.env.STRIPE_WEBHOOK_SECRET; process.env.STRIPE_WEBHOOK_SECRET = "whsec_delete_test";
    const hook = require(HOOK_PATH);
    const body = JSON.stringify({ id: "evt_after_delete", created: Math.floor(Date.now() / 1000), type: "customer.subscription.deleted",
      data: { object: { id: "sub_live_1", customer: "cus_1", status: "canceled", metadata: { user_id: USER, plan_key: "founding_annual" }, items: { data: [] } } } });
    const quiet = console.error; console.error = () => {};
    let res; try { res = await hook.handler({ httpMethod: "POST", headers: { "stripe-signature": signPayload(body, "whsec_delete_test") }, body }); }
    finally { console.error = quiet; if (saved === undefined) delete process.env.STRIPE_WEBHOOK_SECRET; else process.env.STRIPE_WEBHOOK_SECRET = saved; delete require.cache[HOOK_PATH]; }
    t.eq([res.statusCode, JSON.parse(res.body).ignored], [200, true], "5a the cancellation event for a deleted account is acknowledged (200), not retried");
    t.eq([state.rows.length, state.billing[0] && state.billing[0].status], [0, "ignored"], "5b …nothing is written for the account that no longer exists, and the event is recorded as ignored");
  }

  // ── 6. production today: no subscriptions table, billing off ───────────────────────────────
  {
    const savedFlag = process.env.BILLING_ENABLED; delete process.env.BILLING_ENABLED;
    try {
      // 6a: a household with no Stripe customer and no subscriptions table deletes successfully.
      const r = await run({ subs: "prod", key: false });
      t.eq([r.body.deleted, steps(r.body), r.log.authDeleted], [true, [], true],
        "6a production today (no subscriptions table, billing off, no Stripe key): the account is deleted");
      t.ok(["meeting_records", "feedback", "plaid_items", "user_data", "coach_usage", "profiles"].every(x => r.log.deletes.includes(x))
        && r.log.events.includes("delete:subscriptions:missing"), "6a …everything else is erased, and the missing subscriptions table counts as nothing to delete");
      t.eq(r.log.fetches.filter(f => f.includes("stripe")), [], "6a …with no call to Stripe");

      // 6b: a missing table or a missing Stripe customer is "no live charge", not "can't tell".
      for (const [opts, why] of [
        [{ subs: "prod" }, "the table is missing (PGRST205, as production answers)"],
        [{ subs: "missing" }, "the table is missing (42P01, older PostgREST)"],
        [{ subs: [] }, "no Stripe customer: no row at all"],
        [{ subs: [{ provider_subscription_id: null, status: "incomplete", plan_key: null }] }, "a row with no Stripe subscription"],
        [{ subs: [SUB()], stripe: { getFails: 404 } }, "Stripe has no such subscription (404)"],
      ]) {
        const x = await run({ ...opts });
        t.eq([x.body.deleted, steps(x.body)], [true, []], `6b ${why}: no live charge, so the account is deleted`);
      }

      // 6c: only a real Stripe error, for an account that has a Stripe subscription, blocks deletion.
      for (const [stripe, why] of [[{ getFails: 500 }, "Stripe errors reading the subscription"], [{ getFails: 429 }, "Stripe rate-limits the read"],
        [{ cancelFails: true }, "Stripe errors cancelling it"]]) {
        stopped(t, await run({ subs: [SUB()], stripe }), `6c ${why}`);
      }
    } finally { if (savedFlag === undefined) delete process.env.BILLING_ENABLED; else process.env.BILLING_ENABLED = savedFlag; }
  }

  t.summary("deleteAccountStripe.test");
})();
