// tests/nativeWebPurchase.test.cjs
// -----------------------------------------------------------------------------
// A WEB SUBSCRIPTION NEVER UNLOCKS A STORE APP (Apple 3.1.3(b); the Play build follows the same rule).
//
// Subscriptions are sold only on the web, through Stripe. Until in-app purchase exists, a household
// using the iOS or Android app gets the 14-day trial and then the free tier, whatever it bought on the
// web. Where that is enforced:
//   • the app itself never sees a subscription: its plan comes from the profiles row alone, which the
//     Stripe webhook never writes, and a store app does not even ask /api/billing for its status;
//   • the server's limits (the one-bank cap in plaid.js, the weekly coach limit in coach.js) ask
//     getUserPlan, which for a request from a store app (_lib/cors.js isNativeRequest) does not read the
//     subscription at all (_lib/planRules.js deriveEntitlement, native: true).
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");

const REPO = path.join(__dirname, "..");
const SUPA_PATH = require.resolve("@supabase/supabase-js", { paths: [path.join(REPO, "netlify", "functions")] });
const AUTH_PATH = require.resolve("../netlify/functions/_lib/auth.js");
const PLAID_PATH = require.resolve("../netlify/functions/plaid.js");
const { deriveEntitlement } = require("../netlify/functions/_lib/planRules.js");
const { isNativeRequest, NATIVE_ORIGINS } = require("../netlify/functions/_lib/cors.js");

const NOW = Date.parse("2026-11-15T12:00:00Z");
const PAST = "2026-10-01T00:00:00Z", FUTURE = "2026-11-20T00:00:00Z";
const ACTIVE = { status: "active", current_period_end: "2027-11-01T00:00:00Z", plan_key: "annual" };
const IOS = "capacitor://localhost", ANDROID = "https://localhost", WEB = "https://flourishmoney.app";
// A household whose trial ended long ago and who pays on the web.
const ENDED_TRIAL = { plan: "trial", trial_started_at: "2026-09-01T00:00:00Z", trial_ends_at: "2026-09-15T00:00:00Z", founder_flag: false };

// A fake Supabase, recording which tables were read.
function fakeSupabase(db) {
  const reads = [];
  const client = {
    from(table) {
      reads.push(table);
      const q = {
        _f: [], _head: false,
        select(_c, opts) { if (opts && opts.head) q._head = true; return q; },
        eq(col, val) { q._f.push(r => r[col] === val); return q; },
        _rows() { return (db[table] || []).filter(r => q._f.every(f => f(r))); },
        async maybeSingle() { return { data: q._rows()[0] || null, error: null }; },
        then(res, rej) { return Promise.resolve(q._head ? { count: q._rows().length, error: null } : { data: q._rows(), error: null }).then(res, rej); },
      };
      return q;
    },
    auth: { admin: {} },
  };
  return { client, reads };
}

// Load auth.js (and plaid.js) against the fake, with plan limits ON, as they will be once billing ships.
function load(db) {
  const fake = fakeSupabase(db);
  process.env.SUPABASE_URL = "https://example.supabase.test";
  process.env.SUPABASE_SECRET_KEY = "test-service-role";
  process.env.ENFORCE_PLAN_LIMITS = "true";
  process.env.PLAID_CLIENT_ID = "test-client";      // dummies: every network call is blocked below
  process.env.PLAID_SECRET = "test-secret";
  require.cache[SUPA_PATH] = { id: SUPA_PATH, filename: SUPA_PATH, loaded: true, exports: { createClient: () => fake.client } };
  delete require.cache[AUTH_PATH];
  delete require.cache[PLAID_PATH];
  const auth = require(AUTH_PATH);
  auth.getUserFromRequest = async () => ({ user_id: "u1", error: null });
  const plaid = require(PLAID_PATH);
  return { auth, plaid, reads: fake.reads };
}

(async () => {
  const t = create();
  const saved = { ...process.env };

  // ── 1. the rule ──────────────────────────────────────────────────────────────────────────────
  {
    const native = deriveEntitlement(ENDED_TRIAL, ACTIVE, NOW, { native: true });
    t.eq([native.plan, native.unlimited, native.paidSubscription], ["free", false, false],
      "1a a store app, an active Stripe subscription and no trial: the free tier");
    const web = deriveEntitlement(ENDED_TRIAL, ACTIVE, NOW);
    t.eq([web.plan, web.unlimited], ["premium", true], "1b the same household on the web: the subscription counts there");
    t.eq(deriveEntitlement({ plan: "trial", trial_ends_at: FUTURE }, ACTIVE, NOW, { native: true }).plan, "trial",
      "1c a store app still gets the 14-day trial");
    t.eq(deriveEntitlement({ plan: "trial", trial_ends_at: PAST }, null, NOW, { native: true }).plan, "free", "1d …and then the free tier");
    t.eq(deriveEntitlement({ plan: "free", founder_flag: true }, ACTIVE, NOW, { native: true }).plan, "beta_founder",
      "1e the beta founder flag is not a purchase, and still applies in a store app");
    for (const status of ["active", "trialing"]) {
      t.eq(deriveEntitlement({ plan: "free" }, { ...ACTIVE, status }, NOW, { native: true }).unlimited, false,
        `1f a ${status} subscription unlocks nothing in a store app`);
    }
  }

  // ── 2. which requests are a store app ────────────────────────────────────────────────────────
  {
    const ev = (origin, key = "origin") => ({ headers: origin === undefined ? {} : { [key]: origin } });
    t.eq([isNativeRequest(ev(IOS)), isNativeRequest(ev(ANDROID)), isNativeRequest(ev(IOS, "Origin"))], [true, true, true],
      "2a the iOS and Android shells' origins are store-app requests");
    t.eq([WEB, "http://localhost:5173", "http://localhost:8888", "https://evil.example", "", undefined].map(o => isNativeRequest(ev(o))),
      [false, false, false, false, false, false], "2b the site, the dev servers, anything else and no Origin are not");
    t.eq([...NATIVE_ORIGINS].sort().join(","), "capacitor://localhost,https://localhost", "2c exactly the two shells");
  }

  // ── 3. getUserPlan: a store app's request never reads the subscription ───────────────────────
  {
    const db = { profiles: [{ user_id: "u1", ...ENDED_TRIAL }], subscriptions: [{ user_id: "u1", ...ACTIVE, current_period_end: "2099-01-01T00:00:00Z" }] };
    const a = load(db);
    const nat = await a.auth.getUserPlan("u1", { native: true });
    t.eq([nat.entitlement, nat.unlimited, nat.paid], ["free", false, false],
      "3a a store app with an active Stripe entitlement and no trial gets the free tier from the server");
    t.ok(!a.reads.includes("subscriptions"), "3b …and the subscription was not even read");
    const b = load(db);
    const web = await b.auth.getUserPlan("u1");
    t.eq([web.entitlement, web.unlimited, web.paid], ["premium", true, true], "3c the web is unchanged: the same household is premium there");
    t.ok(b.reads.includes("subscriptions"), "3d …read from its subscription");
  }

  // ── 4. the server's limits, end to end: the one-bank cap ─────────────────────────────────────
  {
    const db = {
      profiles: [{ user_id: "u1", ...ENDED_TRIAL }],
      subscriptions: [{ user_id: "u1", ...ACTIVE, current_period_end: "2099-01-01T00:00:00Z" }],
      plaid_items: [{ user_id: "u1", item_id: "it1", status: "active" }],
    };
    const realFetch = global.fetch;
    const plaidCalls = [];
    global.fetch = async (url) => { plaidCalls.push(String(url)); throw new Error("network blocked in test"); };
    const exchange = async (origin) => {
      const { plaid } = load(db);
      return plaid.handler({ httpMethod: "POST", headers: { origin, authorization: "Bearer x" },
        body: JSON.stringify({ action: "exchange_token", public_token: "public-sandbox-1" }) });
    };
    try {
      for (const [origin, name] of [[IOS, "iOS"], [ANDROID, "Android"]]) {
        const before = plaidCalls.length;
        const res = await exchange(origin);
        t.eq([res.statusCode, JSON.parse(res.body).error], [402, "plan_limit"],
          `4a ${name}: a Stripe subscriber with one bank cannot link a second (a Plus feature) in the store app`);
        t.eq(plaidCalls.length, before, `4b ${name}: …refused before Plaid is asked`);
      }
      const before = plaidCalls.length;
      const web = await exchange(WEB);
      t.ok(web.statusCode !== 402, "4c on the web the same subscriber passes the cap");
      t.ok(plaidCalls.slice(before).some(u => /\/item\/public_token\/exchange$/.test(u)), "4d …and the exchange goes on to Plaid");
    } finally {
      global.fetch = realFetch;
    }
  }

  // ── 5. every server limit passes the store-app flag; the app never sees a subscription ───────
  {
    for (const f of ["coach.js", "plaid.js"]) {
      const src = fs.readFileSync(path.join(REPO, "netlify", "functions", f), "utf8");
      const calls = src.match(/getUserPlan\([^)]*\)/g) || [];
      t.ok(calls.length > 0 && calls.every(c => /native: isNativeRequest\(event\)/.test(c)),
        `5a ${f}: every getUserPlan call says whether the request is a store app (${calls.length})`);
    }
    const app = fs.readFileSync(path.join(REPO, "src", "App.jsx"), "utf8");
    const refresh = app.slice(app.indexOf("const refreshPlanFromProfile"), app.indexOf("const refreshPlanFromProfile") + 900);
    t.ok(/\.from\("profiles"\)/.test(refresh) && !/subscriptions/.test(refresh), "5b the app's plan comes from the profiles row alone");
    t.ok(/if\(nativeApp \|\| !user\?\.id\)\{ setBillingStatus\(null\); return; \}/.test(app), "5c a store app never asks /api/billing for its status");
    const hook = fs.readFileSync(path.join(REPO, "netlify", "functions", "stripe-webhook.js"), "utf8");
    t.ok(!/from\("profiles"\)/.test(hook), "5d the Stripe webhook never writes the profiles row the app reads");
  }

  process.env = saved;
  t.summary("nativeWebPurchase.test");
})();
