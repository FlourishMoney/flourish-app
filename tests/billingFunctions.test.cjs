// tests/billingFunctions.test.cjs
// -----------------------------------------------------------------------------
// THE TWO BILLING ENDPOINTS AND THE WEBHOOK, RUN FOR REAL.
//
// Both function modules are loaded with _lib/auth replaced in the require cache, so the
// REAL handlers run against a fake Supabase and a fake Stripe. No network, no keys.
//
// What this pins:
//   • an unauthenticated call to billing.js is 401 before anything else happens
//   • a webhook with a bad, missing or stale signature is 400 and the body is never parsed
//   • a REPLAYED event writes the subscription once
//   • a handler failure returns 5xx (so Stripe retries) and marks the event failed
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const path = require("path");
const { signPayload } = require("../netlify/functions/_lib/stripeSignature.js");

const AUTH_PATH = require.resolve("../netlify/functions/_lib/auth.js");
const API_PATH = require.resolve("../netlify/functions/_lib/stripeApi.js");
const BILLING_PATH = require.resolve("../netlify/functions/billing.js");
const HOOK_PATH = require.resolve("../netlify/functions/stripe-webhook.js");

// ── a fake supabase-js surface, recording every write ────────────────────────────────────────────
function fakeAdmin(state) {
  const api = (table) => {
    const q = {
      _table: table, _filters: {},
      select() { return q; },
      eq(col, val) { q._filters[col] = val; return q; },
      async maybeSingle() {
        const rows = state.rows[table] || [];
        const hit = rows.find(r => Object.entries(q._filters).every(([k, v]) => r[k] === v));
        return { data: hit || null, error: null };
      },
      insert(row, opts) {
        const rows = state.rows[table] = state.rows[table] || [];
        const pk = table === "billing_events" ? "event_id" : "user_id";
        const dup = rows.some(r => r[pk] === row[pk]);
        state.writes.push({ table, op: "insert", row, duplicate: dup });
        if (!dup) rows.push({ ...row });
        const returned = dup && opts?.ignoreDuplicates ? [] : (dup ? [] : [{ ...row }]);
        return { select: async () => ({ data: returned, error: null }) };
      },
      async upsert(row) {
        const rows = state.rows[table] = state.rows[table] || [];
        state.writes.push({ table, op: "upsert", row });
        const i = rows.findIndex(r => r.user_id === row.user_id);
        if (i >= 0) rows[i] = { ...rows[i], ...row }; else rows.push({ ...row });
        return { error: null };
      },
      update(patch) {
        return {
          eq: async (col, val) => {
            const rows = state.rows[table] = state.rows[table] || [];
            state.writes.push({ table, op: "update", patch, where: { [col]: val } });
            rows.forEach(r => { if (r[col] === val) Object.assign(r, patch); });
            return { error: null };
          },
        };
      },
    };
    return q;
  };
  return { from: api, auth: { admin: { getUserById: async () => ({ data: { user: { email: "a@b.c" } } }) } } };
}

function loadWithStubs(modPath, { user_id = null, authError = null, state, stripe = {} }) {
  delete require.cache[modPath];
  delete require.cache[AUTH_PATH];
  delete require.cache[API_PATH];
  const real = require("../netlify/functions/_lib/auth.js");
  require.cache[AUTH_PATH].exports = {
    ...real,
    getUserFromRequest: async () => ({ user_id, error: authError }),
    getAdminClient: () => fakeAdmin(state),
  };
  require.cache[API_PATH] = { id: API_PATH, filename: API_PATH, loaded: true,
    exports: { stripePost: stripe.stripePost || (async () => ({ id: "cs_1", url: "https://stripe.test/x" })),
               formEncode: real.formEncode } };
  const mod = require(modPath);
  delete require.cache[modPath];
  return mod;
}

const post = (body, headers = {}) => ({ httpMethod: "POST", headers, body: typeof body === "string" ? body : JSON.stringify(body) });

(async () => {
  const t = create();
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_gate_test";
  process.env.STRIPE_PRICE_MONTHLY_CAD = "price_monthly_test";
  // Billing is off by default (section 10 proves that). The checkout sections below are about what
  // the endpoint DOES once it is on, so they switch it on explicitly rather than relying on a default.
  process.env.BILLING_ENABLED = "true";

  // ── 1. billing.js refuses an unauthenticated caller ──────────────────────────────────────────
  {
    const state = { rows: {}, writes: [] };
    const billing = loadWithStubs(BILLING_PATH, { user_id: null, authError: "missing Authorization header", state });
    for (const action of ["create_checkout_session", "create_portal_session"]) {
      const res = await billing.handler(post({ action, plan_key: "monthly" }));
      t.eq(res.statusCode, 401, `1 ${action} without a session is 401`);
    }
    t.eq(state.writes.length, 0, "1c …and nothing was written or asked of Stripe first");
  }

  // ── 2. checkout: the client's plan key becomes a server-held price id ────────────────────────
  {
    const state = { rows: { profiles: [{ user_id: "u1", founder_flag: false }] }, writes: [] };
    let sent = null;
    const billing = loadWithStubs(BILLING_PATH, {
      user_id: "u1", state,
      stripe: { stripePost: async (p, params) => { sent = { p, params }; return { id: "cs_1", url: "https://stripe.test/pay" }; } },
    });
    const res = await billing.handler(post({ action: "create_checkout_session", plan_key: "monthly" }));
    t.eq(res.statusCode, 200, "2a a signed-in user gets a checkout session");
    t.eq(JSON.parse(res.body).url, "https://stripe.test/pay", "2b …and the URL comes back");
    t.eq(sent.params.line_items[0].price, "price_monthly_test", "2c the price id came from the environment, not the request");
    t.eq(sent.params.metadata.user_id, "u1", "2d the session carries user_id for the webhook");
    t.eq(sent.params.subscription_data.metadata.user_id, "u1", "2e …and so does the subscription, which never sees the session");
    t.eq(sent.params.automatic_tax.enabled, false, "2f Stripe Tax is explicitly off (P16)");
  }

  // ── 3. a price the caller is not entitled to ─────────────────────────────────────────────────
  {
    const state = { rows: { profiles: [{ user_id: "u2", founder_flag: false }] }, writes: [] };
    const billing = loadWithStubs(BILLING_PATH, { user_id: "u2", state });
    const res = await billing.handler(post({ action: "create_checkout_session", plan_key: "founding_annual" }));
    t.eq(res.statusCode, 403, "3a a non-founder asking for the founding price is refused");
    const bad = await billing.handler(post({ action: "create_checkout_session", plan_key: "price_123" }));
    t.eq(bad.statusCode, 400, "3b …and a raw price id is not a plan key");
  }

  // ── 4. the webhook fails closed on the signature ─────────────────────────────────────────────
  {
    const state = { rows: {}, writes: [] };
    const hook = loadWithStubs(HOOK_PATH, { state });
    const body = JSON.stringify({ id: "evt_sig", type: "checkout.session.completed", data: { object: {} } });
    const cases = [
      ["no signature header", {}],
      ["wrong secret", { "stripe-signature": signPayload(body, "whsec_wrong") }],
      ["tampered body", { "stripe-signature": signPayload(body + " ", "whsec_gate_test") }],
      ["stale timestamp", { "stripe-signature": signPayload(body, "whsec_gate_test", Math.floor(Date.now() / 1000) - 3600) }],
    ];
    for (const [label, headers] of cases) {
      const res = await hook.handler(post(body, headers));
      t.eq(res.statusCode, 400, `4 ${label} is rejected`);
    }
    t.eq(state.writes.length, 0, "4e …and no event was claimed or written for any of them");
  }

  // ── 5. a REPLAYED event is processed once ────────────────────────────────────────────────────
  {
    const state = { rows: {}, writes: [] };
    const hook = loadWithStubs(HOOK_PATH, { state });
    const body = JSON.stringify({
      id: "evt_replay_1", type: "checkout.session.completed",
      data: { object: { customer: "cus_1", subscription: "sub_1", metadata: { user_id: "u9", plan_key: "annual" } } },
    });
    const headers = { "stripe-signature": signPayload(body, "whsec_gate_test") };

    const first = await hook.handler(post(body, headers));
    t.eq(first.statusCode, 200, "5a the first delivery is accepted");
    t.eq(JSON.parse(first.body).replay, undefined, "5b …and is not a replay");

    const second = await hook.handler(post(body, headers));
    t.eq(second.statusCode, 200, "5c the replay is acknowledged (a 5xx would make Stripe retry forever)");
    t.eq(JSON.parse(second.body).replay, true, "5d …and says so");

    const subUpserts = state.writes.filter(w => w.table === "subscriptions" && w.op === "upsert");
    t.eq(subUpserts.length, 1, "5e the subscription was written exactly once across both deliveries");
    t.eq(state.rows.subscriptions[0].status, "active", "5f …and the household is active");
    t.eq(state.rows.subscriptions[0].user_id, "u9", "5g …on the right account");
    t.eq(state.rows.billing_events.filter(e => e.event_id === "evt_replay_1").length, 1, "5h one ledger row, not two");
    t.eq(state.rows.billing_events[0].status, "processed", "5i …marked processed");
  }

  // ── 6. an event we do not handle is recorded and ignored ─────────────────────────────────────
  {
    const state = { rows: {}, writes: [] };
    const hook = loadWithStubs(HOOK_PATH, { state });
    const body = JSON.stringify({ id: "evt_other", type: "invoice.paid", data: { object: {} } });
    const res = await hook.handler(post(body, { "stripe-signature": signPayload(body, "whsec_gate_test") }));
    t.eq(res.statusCode, 200, "6a an unhandled type is acknowledged");
    t.eq(state.rows.billing_events[0].status, "ignored", "6b …and recorded as ignored, not silently dropped");
    t.eq((state.rows.subscriptions || []).length, 0, "6c …with no subscription written");
  }

  // ── 7. a failure returns 5xx and marks the event failed ──────────────────────────────────────
  {
    const state = { rows: {}, writes: [] };
    const hook = loadWithStubs(HOOK_PATH, { state });
    // A completed checkout with no user_id anywhere: cannot be mapped to an account.
    const body = JSON.stringify({ id: "evt_bad", type: "checkout.session.completed", data: { object: { customer: "cus_x" } } });
    const res = await hook.handler(post(body, { "stripe-signature": signPayload(body, "whsec_gate_test") }));
    t.eq(res.statusCode, 500, "7a an event that cannot be applied returns 5xx so Stripe retries");
    t.eq(state.rows.billing_events[0].status, "failed", "7b …and the ledger row says failed");
    t.ok(!!state.rows.billing_events[0].error, "7c …with the reason kept for support");
  }

  // ── 8. no secret configured means nothing is processed ───────────────────────────────────────
  {
    const saved = process.env.STRIPE_WEBHOOK_SECRET;
    delete process.env.STRIPE_WEBHOOK_SECRET;
    const state = { rows: {}, writes: [] };
    const hook = loadWithStubs(HOOK_PATH, { state });
    const body = JSON.stringify({ id: "evt_nosecret", type: "checkout.session.completed", data: { object: {} } });
    const res = await hook.handler(post(body, { "stripe-signature": "t=1,v1=x" }));
    t.eq(res.statusCode, 500, "8a a missing webhook secret is a 500, not an open door");
    t.eq(state.writes.length, 0, "8b …and nothing was read or written");
    process.env.STRIPE_WEBHOOK_SECRET = saved;
  }

  // ── 9. OUT-OF-ORDER EVENTS (13-review HIGH 1) ────────────────────────────────────────────────
  // Stripe does not guarantee delivery order and retries for days. Two orderings matter, and both
  // are a wrong entitlement, not a cosmetic one.
  {
    const sign = (b) => ({ "stripe-signature": signPayload(b, "whsec_gate_test") });
    const T = Math.floor(Date.parse("2026-10-27T10:00:00Z") / 1000);
    const subObj = (status, created_extra = {}) => ({
      id: "sub_ord", customer: "cus_ord", status,
      metadata: { user_id: "u_ord", plan_key: "annual" },
      current_period_end: Math.floor(Date.parse("2027-10-27T10:00:00Z") / 1000),
      items: { data: [{ price: { id: "price_annual_test" } }] },
      ...created_extra,
    });

    // (a) cancel, then a STALE 'active' update generated before it.
    {
      const state = { rows: {}, writes: [] };
      const hook = loadWithStubs(HOOK_PATH, { state });
      const del = JSON.stringify({ id: "evt_del", created: T + 60, type: "customer.subscription.deleted",
                                   data: { object: subObj("canceled") } });
      await hook.handler(post(del, sign(del)));
      t.eq(state.rows.subscriptions[0].status, "canceled", "9a the cancellation is applied");

      const stale = JSON.stringify({ id: "evt_stale_active", created: T, type: "customer.subscription.updated",
                                     data: { object: subObj("active") } });
      const res = await hook.handler(post(stale, sign(stale)));
      t.eq(res.statusCode, 200, "9b a stale update is acknowledged, not retried forever");
      t.eq(state.rows.subscriptions[0].status, "canceled",
        "9c …and does NOT revive the cancelled subscription — an out-of-order event cannot grant a paid plan");
      t.eq(state.rows.billing_events.find(e => e.event_id === "evt_stale_active").status, "ignored",
        "9d …it is recorded as ignored, so the ledger shows why nothing changed");
    }

    // (b) the reverse: a renewal applied, then a STALE cancellation lands after it.
    {
      const state = { rows: {}, writes: [] };
      const hook = loadWithStubs(HOOK_PATH, { state });
      const live = JSON.stringify({ id: "evt_live", created: T + 60, type: "customer.subscription.updated",
                                    data: { object: subObj("active") } });
      await hook.handler(post(live, sign(live)));
      t.eq(state.rows.subscriptions[0].status, "active", "9e the renewal is applied");

      const staleDel = JSON.stringify({ id: "evt_stale_del", created: T, type: "customer.subscription.deleted",
                                        data: { object: subObj("canceled") } });
      await hook.handler(post(staleDel, sign(staleDel)));
      t.eq(state.rows.subscriptions[0].status, "active",
        "9f …and a stale cancellation does NOT take away access somebody paid for");
    }

    // (c) in-order events still apply — the guard must not freeze the row.
    {
      const state = { rows: {}, writes: [] };
      const hook = loadWithStubs(HOOK_PATH, { state });
      const first = JSON.stringify({ id: "evt_o1", created: T, type: "customer.subscription.updated",
                                     data: { object: subObj("active") } });
      await hook.handler(post(first, sign(first)));
      const later = JSON.stringify({ id: "evt_o2", created: T + 60, type: "customer.subscription.deleted",
                                     data: { object: subObj("canceled") } });
      await hook.handler(post(later, sign(later)));
      t.eq(state.rows.subscriptions[0].status, "canceled", "9g a LATER event still applies normally");
      t.eq(state.rows.subscriptions[0].founding_locked_at ?? null, null, "9h …and the founding lock is cleared on cancellation");
    }

    // (d) an event with no timestamp is applied rather than dropped — fail open on ordering only,
    //     never on authenticity.
    {
      const state = { rows: {}, writes: [] };
      const hook = loadWithStubs(HOOK_PATH, { state });
      // A stamped event first, so the row HAS a last_event_at to be compared against — otherwise
      // the comparison never runs and this proves nothing.
      const stamped = JSON.stringify({ id: "evt_stamped", created: T, type: "customer.subscription.deleted",
                                       data: { object: subObj("canceled") } });
      await hook.handler(post(stamped, sign(stamped)));
      t.ok(!!state.rows.subscriptions[0].last_event_at, "9i the row carries the event time it was written from");

      const noTs = JSON.stringify({ id: "evt_nots", type: "customer.subscription.updated",
                                    data: { object: subObj("active") } });
      const res = await hook.handler(post(noTs, sign(noTs)));
      t.eq(res.statusCode, 200, "9j an event carrying no created timestamp is still processed");
      t.eq(state.rows.subscriptions[0].status, "active",
        "9k …and applied — ordering fails OPEN, because the signature already proved the event is real");
    }
  }

  // ── 10. BILLING IS OFF UNTIL IT IS SWITCHED ON (13-review HIGH 2) ─────────────────────────────
  // Nothing in src/ calls these endpoints, but merging deploys them, and any signed-in beta user
  // can POST to a Netlify function directly. Billing goes live 2026-10-26; until BILLING_ENABLED
  // is set, the endpoint must behave as though it does not exist.
  {
    const saved = process.env.BILLING_ENABLED;
    delete process.env.BILLING_ENABLED;
    const state = { rows: { profiles: [{ user_id: "u_flag", founder_flag: true }] }, writes: [] };
    let stripeCalls = 0;
    const billing = loadWithStubs(BILLING_PATH, {
      user_id: "u_flag", state,
      stripe: { stripePost: async () => { stripeCalls++; return { id: "cs_x", url: "https://stripe.test/pay" }; } },
    });
    for (const action of ["create_checkout_session", "create_portal_session"]) {
      const res = await billing.handler(post({ action, plan_key: "monthly" }));
      t.eq(res.statusCode, 404, `10 ${action} is not reachable while billing is off`);
      t.eq(JSON.parse(res.body).url, undefined, `10 ${action} returns no checkout URL`);
    }
    t.eq(stripeCalls, 0, "10c no Stripe session was created for a beta user while billing is off");
    t.eq(state.writes.length, 0, "10d …and nothing was written");

    process.env.BILLING_ENABLED = "true";
    const on = loadWithStubs(BILLING_PATH, {
      user_id: "u_flag", state: { rows: { profiles: [{ user_id: "u_flag", founder_flag: true }] }, writes: [] },
      stripe: { stripePost: async () => ({ id: "cs_y", url: "https://stripe.test/pay" }) },
    });
    const res = await on.handler(post({ action: "create_checkout_session", plan_key: "monthly" }));
    t.eq(res.statusCode, 200, "10e …and the same call works once it is switched on, so the flag is the only thing off");
    if (saved === undefined) delete process.env.BILLING_ENABLED; else process.env.BILLING_ENABLED = saved;
  }

  t.summary("billingFunctions.test");
})();
