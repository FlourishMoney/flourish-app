// tests/planReadUnavailable.test.cjs
// -----------------------------------------------------------------------------
// A FAILED SUBSCRIPTION READ NEVER LOOKS UNPAID (code audit of e94b112, item 16).
//
// getUserPlan carried on with no subscription when the read errored, so a paying household was treated as free
// on a transient Supabase error, and the web billing status ignored its read error and answered "not paid". Now:
//   1  each read is retried; a blip that clears is the real answer
//   2  paid + a read that keeps failing: "status unavailable", never access that was not read; the one-bank cap
//      answers 503 (the app retries), not the paywall's 402; billing status answers 503, not "not paid"
//   3  unpaid + a read that keeps failing: the same 503, never the free limit on a guess; read fine, still 402
//   4  trial (or founder) + a failed subscription read: the profile verifies it, so access stands
//   5  the web app keeps the last definite paid answer until its period ends, so a read error never shows a payer
//      the paywall
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");

const REPO = path.join(__dirname, "..");
const SUPA_PATH = require.resolve("@supabase/supabase-js", { paths: [path.join(REPO, "netlify", "functions")] });
const AUTH_PATH = require.resolve("../netlify/functions/_lib/auth.js");
const PLAID_PATH = require.resolve("../netlify/functions/plaid.js");
const BILLING_PATH = require.resolve("../netlify/functions/billing.js");
const API_PATH = require.resolve("../netlify/functions/_lib/stripeApi.js");

const ENDED_TRIAL = { plan: "trial", trial_started_at: "2026-09-01T00:00:00Z", trial_ends_at: "2026-09-15T00:00:00Z", founder_flag: false };
const PAID = { status: "active", current_period_end: "2099-01-01T00:00:00Z", plan_key: "annual", provider: "stripe", provider_customer_id: "cus_1" };

// A fake Supabase whose reads of a table fail `fail[table]` times (Infinity: always), then answer from `db`.
function fakeSupabase(db, fail = {}) {
  const reads = [];
  const left = { ...fail };
  const client = {
    from(table) {
      reads.push(table);
      const q = {
        _f: [], _head: false,
        select(_c, opts) { if (opts && opts.head) q._head = true; return q; },
        eq(col, val) { q._f.push((r) => r[col] === val); return q; },
        _rows() { return (db[table] || []).filter((r) => q._f.every((f) => f(r))); },
        async maybeSingle() {
          if (left[table] > 0) { left[table]--; return { data: null, error: { message: "upstream connect error (test)" } }; }
          return { data: q._rows()[0] || null, error: null };
        },
        then(res, rej) { return Promise.resolve(q._head ? { count: q._rows().length, error: null } : { data: q._rows(), error: null }).then(res, rej); },
      };
      return q;
    },
    rpc: async () => ({ data: null, error: null }),
    auth: { admin: { getUserById: async () => ({ data: { user: { email: "a@b.c", email_confirmed_at: "2026-10-01T00:00:00Z" } } }) } },
  };
  return { client, reads };
}

function load(db, fail) {
  const fake = fakeSupabase(db, fail);
  process.env.SUPABASE_URL = "https://example.supabase.test";
  process.env.SUPABASE_SECRET_KEY = "test-service-role";
  process.env.ENFORCE_PLAN_LIMITS = "true";
  process.env.BILLING_ENABLED = "true";
  process.env.PLAID_CLIENT_ID = "test-client";
  process.env.PLAID_SECRET = "test-secret";
  require.cache[SUPA_PATH] = { id: SUPA_PATH, filename: SUPA_PATH, loaded: true, exports: { createClient: () => fake.client } };
  for (const p of [AUTH_PATH, PLAID_PATH, BILLING_PATH]) delete require.cache[p];
  const auth = require(AUTH_PATH);
  auth.getUserFromRequest = async () => ({ user_id: "u1", error: null });
  require.cache[API_PATH] = { id: API_PATH, filename: API_PATH, loaded: true, exports: { stripePost: async () => ({ id: "cs_1", url: "https://stripe.test/pay" }), stripeGet: async () => ({ data: [] }) } };
  const plaid = require(PLAID_PATH);
  const billing = require(BILLING_PATH);
  return { auth, plaid, billing, reads: fake.reads };
}

const exchange = (plaid) => plaid.handler({ httpMethod: "POST", headers: { origin: "https://flourishmoney.app", authorization: "Bearer x" },
  body: JSON.stringify({ action: "exchange_token", public_token: "public-sandbox-1" }) });
const status = (billing) => billing.handler({ httpMethod: "POST", headers: { origin: "https://flourishmoney.app", authorization: "Bearer x" }, body: JSON.stringify({ action: "status" }) });

(async () => {
  const t = create();
  const saved = { ...process.env };
  const realFetch = global.fetch;
  const plaidCalls = [];
  global.fetch = async (url) => { plaidCalls.push(String(url)); throw new Error("network blocked in test"); };
  const bank = [{ user_id: "u1", item_id: "it1", status: "active" }];
  const paidDb = () => ({ profiles: [{ user_id: "u1", ...ENDED_TRIAL }], subscriptions: [{ user_id: "u1", ...PAID }], plaid_items: bank });
  const freeDb = () => ({ profiles: [{ user_id: "u1", ...ENDED_TRIAL }], subscriptions: [], plaid_items: bank });
  try {
    // ── 1. A blip that clears ─────────────────────────────────────────────────────────────────────
    {
      const a = load(paidDb(), { subscriptions: 1 });
      const p = await a.auth.getUserPlan("u1");
      t.eq([p.paid, p.unlimited, p.status_unavailable, a.reads.filter((r) => r === "subscriptions").length], [true, true, false, 2], "1a paid, one failed read: retried, and the household is paid");
      const b = load(paidDb(), { subscriptions: 2 });
      const r = await status(b.billing);
      t.eq([r.statusCode, JSON.parse(r.body).paid], [200, true], "1b billing status after two failed reads: retried, paid");
    }

    // ── 2. Paid, and the read keeps failing ───────────────────────────────────────────────────────
    {
      const a = load(paidDb(), { subscriptions: Infinity });
      const p = await a.auth.getUserPlan("u1");
      t.eq([p.status_unavailable, p.unlimited, p.paid], [true, false, false], "2a paid + read error: status unavailable, and no access granted that was not read");
      const before = plaidCalls.length;
      const res = await exchange(load(paidDb(), { subscriptions: Infinity }).plaid);
      t.eq([res.statusCode, JSON.parse(res.body).error], [503, "status_unavailable"], "2b the one-bank cap answers 503 status_unavailable, not the paywall's 402 plan_limit");
      t.eq(plaidCalls.length, before, "2c …and nothing is exchanged on an unread plan");
      const s = await status(load(paidDb(), { subscriptions: Infinity }).billing);
      t.eq([s.statusCode, JSON.parse(s.body).error, JSON.parse(s.body).paid], [503, "status_unavailable", undefined], "2d billing status answers 503, never \"not paid\"");
      const pr = await load(paidDb(), { profiles: Infinity }).auth.getUserPlan("u1");
      t.eq([pr.status_unavailable, pr.unlimited], [true, false], "2e a profile read that keeps failing: status unavailable too (was \"free\")");
    }

    // ── 3. Unpaid, and the read keeps failing ─────────────────────────────────────────────────────
    {
      const p = await load(freeDb(), { subscriptions: Infinity }).auth.getUserPlan("u1");
      t.eq([p.status_unavailable, p.unlimited, p.paid], [true, false, false], "3a unpaid + read error: status unavailable, no access");
      const res = await exchange(load(freeDb(), { subscriptions: Infinity }).plaid);
      t.eq(res.statusCode, 503, "3b the cap answers 503 (the app retries), not the free limit on a guess");
      const ok = await exchange(load(freeDb()).plaid);
      t.eq([ok.statusCode, JSON.parse(ok.body).error], [402, "plan_limit"], "3c read fine and unpaid: a second bank is still refused (402)");
    }

    // ── 4. Trial and founder ──────────────────────────────────────────────────────────────────────
    {
      const trialDb = { profiles: [{ user_id: "u1", plan: "trial", trial_ends_at: "2099-01-01T00:00:00Z" }], subscriptions: [], plaid_items: bank };
      const p = await load(trialDb, { subscriptions: Infinity }).auth.getUserPlan("u1");
      t.eq([p.entitlement, p.unlimited, p.status_unavailable, p.paid], ["trial", true, false, false], "4a trial + subscription read error: the profile verifies the trial, so access stands");
      const before = plaidCalls.length;
      const res = await exchange(load(trialDb, { subscriptions: Infinity }).plaid);
      t.ok(res.statusCode !== 402 && res.statusCode !== 503 && plaidCalls.length > before, "4b …and a trial household's second bank goes on to Plaid");
      const f = await load({ profiles: [{ user_id: "u1", plan: "free", founder_flag: true }], subscriptions: [] }, { subscriptions: Infinity }).auth.getUserPlan("u1");
      t.eq([f.entitlement, f.unlimited], ["beta_founder", true], "4c a founder: the same");
      const ended = await load(freeDb(), { subscriptions: Infinity }).auth.getUserPlan("u1");
      t.eq([ended.unlimited, ended.status_unavailable], [false, true], "4d a trial that has ended does not count: status unavailable");
    }
  } finally {
    global.fetch = realFetch;
    delete require.cache[SUPA_PATH]; delete require.cache[API_PATH];
    for (const p of [AUTH_PATH, PLAID_PATH, BILLING_PATH]) delete require.cache[p];
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  }

  // ── 5. The web app keeps the last definite answer ───────────────────────────────────────────────
  {
    const SB = await import("../src/lib/storeBilling.js");
    const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), _m: m }; };
    const st = mem();
    const now = Date.parse("2026-10-26T12:00:00Z");
    SB.rememberGate(st, "u1", true, "2026-11-20T00:00:00Z", now, SB.WEB_PAID_KEY);
    t.eq([SB.recalledGate(st, "u1", now, SB.WEB_PAID_KEY), SB.recalledGate(st, "u1", Date.parse("2026-11-21T00:00:00Z"), SB.WEB_PAID_KEY), SB.recalledGate(st, "u2", now, SB.WEB_PAID_KEY)],
      [true, null, null], "5a a web payer's answer stands until its paid period ends, for that account only");
    t.ok(!st._m.has(SB.STORE_GATE_KEY), "5b kept apart from the store apps' answer");
    const app = fs.readFileSync(path.join(REPO, "src", "App.jsx"), "utf8");
    t.ok(/rememberGate\(deviceStorage\(\), user\.id, body\?\.paid === true, body\?\.period_end \|\| null, Date\.now\(\), WEB_PAID_KEY\)/.test(app)
      && /recalledGate\(deviceStorage\(\), user\.id, Date\.now\(\), WEB_PAID_KEY\) === true/.test(app), "5c App: the status answer is remembered, and with no answer the remembered one decides paid");
    const billingSrc = fs.readFileSync(BILLING_PATH, "utf8");
    t.ok(/period_end: isPaidSubscription\(row\)/.test(billingSrc), "5d billing status says when the paid period ends");
  }

  t.summary("planReadUnavailable");
})();
