// tests/nativeWebPurchase.test.cjs
// -----------------------------------------------------------------------------
// A WEB SUBSCRIPTION COUNTS IN A STORE APP, AND A STORE APP IS TOLD NOTHING ELSE (founder's decision,
// 2026-10-20; it replaced "a web subscription never unlocks a store app", Apple 3.1.3(b)).
//
// The store apps follow the web's rules: the 14-day trial, then the free plan, unless the household is a
// founder, a beta founder or pays on the web. Where that is enforced:
//   • the server's limits (the one-bank cap in plaid.js, the coach limits in coach.js) ask getUserPlan with
//     no platform at all, so a request from a store app reads the subscription exactly as the web's does
//     (_lib/planRules.js deriveEntitlement).
//   • a store app learns `paid` from /api/billing's status, which answers a store app with { enabled, paid }
//     and nothing else (tests/webPaidPlan.test.cjs section 4): no price, no founding offer, no portal.
//   • billing day (2026-10-26) adds the founding price and the founding link email; the founding link still
//     opens nothing in a store app (section 6), while a founding SUBSCRIPTION now counts there (6a).
// The five households the founder named (trial, trial ended, founder, paid on the web, the web) are run end
// to end in tests/nativeTrialLimits.test.cjs.
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

  // ── 1. the rule: one answer, whichever app asks ──────────────────────────────────────────────
  {
    t.eq(deriveEntitlement.length, 2, "1a deriveEntitlement takes a profile and a subscription (and a clock): no platform argument");
    const ended = deriveEntitlement(ENDED_TRIAL, ACTIVE, NOW);
    t.eq([ended.plan, ended.unlimited, ended.paidSubscription], ["premium", true, true],
      "1b an active Stripe subscription and no trial: full access, in a store app as on the web");
    t.eq(deriveEntitlement(ENDED_TRIAL, null, NOW).plan, "free", "1c the same household with no subscription: the free plan");
    t.eq(deriveEntitlement({ plan: "trial", trial_ends_at: FUTURE }, null, NOW).plan, "trial", "1d the 14-day trial");
    t.eq(deriveEntitlement({ plan: "trial", trial_ends_at: PAST }, null, NOW).plan, "free", "1e …and then the free plan");
    t.eq(deriveEntitlement({ plan: "free", founder_flag: true }, null, NOW).plan, "beta_founder", "1f a beta founder keeps full access");
    for (const status of ["active", "trialing"]) {
      t.eq(deriveEntitlement({ plan: "free" }, { ...ACTIVE, status }, NOW, { native: true }).unlimited, true,
        `1g a ${status} subscription gives full access, and a stray store-app flag from older code changes nothing`);
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

  // ── 3. getUserPlan reads the subscription for every request ──────────────────────────────────
  {
    const db = { profiles: [{ user_id: "u1", ...ENDED_TRIAL }], subscriptions: [{ user_id: "u1", ...ACTIVE, current_period_end: "2099-01-01T00:00:00Z" }] };
    const a = load(db);
    const nat = await a.auth.getUserPlan("u1", { native: true });
    t.eq([nat.entitlement, nat.unlimited, nat.paid], ["premium", true, true],
      "3a a household paying on the web gets full access from the server, even asked the old store-app way");
    t.ok(a.reads.includes("subscriptions"), "3b …read from its subscription");
    const b = load({ profiles: db.profiles, subscriptions: [] });
    const free = await b.auth.getUserPlan("u1");
    t.eq([free.entitlement, free.unlimited, free.paid], ["free", false, false], "3c with no subscription, the trial over: the free plan");
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
      for (const [origin, name] of [[IOS, "iOS"], [ANDROID, "Android"], [WEB, "the web"]]) {
        const before = plaidCalls.length;
        const res = await exchange(origin);
        t.ok(res.statusCode !== 402, `4a ${name}: a Stripe subscriber with one bank passes the one-bank cap`);
        t.ok(plaidCalls.slice(before).some(u => /\/item\/public_token\/exchange$/.test(u)), `4b ${name}: …and the exchange goes on to Plaid`);
      }
      db.subscriptions = [];
      for (const [origin, name] of [[IOS, "iOS"], [ANDROID, "Android"], [WEB, "the web"]]) {
        const before = plaidCalls.length;
        const res = await exchange(origin);
        t.eq([res.statusCode, JSON.parse(res.body).error], [402, "plan_limit"], `4c ${name}: with no subscription and the trial over, a second bank is refused`);
        t.eq(plaidCalls.length, before, `4d ${name}: …before Plaid is asked`);
      }
    } finally {
      global.fetch = realFetch;
    }
  }

  // ── 5. every server limit asks the same question; the app never reads a subscription row ──────
  {
    for (const f of ["coach.js", "plaid.js"]) {
      const src = fs.readFileSync(path.join(REPO, "netlify", "functions", f), "utf8");
      const calls = src.match(/getUserPlan\([^)]*\)/g) || [];
      t.ok(calls.length > 0 && calls.every(c => c === "getUserPlan(user_id)"),
        `5a ${f}: every getUserPlan call is getUserPlan(user_id), with no platform option (${calls.length})`);
      t.ok(!/isNativeRequest/.test(src), `5a2 ${f}: …and nothing in it asks whether the request is a store app`);
    }
    const app = fs.readFileSync(path.join(REPO, "src", "App.jsx"), "utf8");
    const refresh = app.slice(app.indexOf("const refreshPlanFromProfile"), app.indexOf("const refreshPlanFromProfile") + 900);
    t.ok(/\.from\("profiles"\)/.test(refresh) && !/subscriptions/.test(refresh), "5b the app reads its plan from the profiles row and never reads a subscription row itself");
    t.ok(/if\(!user\?\.id\)\{ setBillingStatus\(null\); return; \}/.test(app) && /setBillingStatus\(nativeApp \? \{ enabled: body\?\.enabled === true, paid: body\?\.paid === true \} : body\)/.test(app),
      "5c a store app asks /api/billing for its status and keeps only enabled and paid");
    const hook = fs.readFileSync(path.join(REPO, "netlify", "functions", "stripe-webhook.js"), "utf8");
    t.ok(!/from\("profiles"\)/.test(hook), "5d the Stripe webhook never writes the profiles row the app reads");
  }

  // ── 6. billing day (2026-10-26): the founding plan and the founding link, in a store app ─────────
  // Billing goes live on the web only, and a store app still sells nothing. What was bought on the web, the
  // founding price included, now gives full access in the iOS and Android apps; the founding link email
  // still opens nothing there.
  {
    const FOUNDING = { status: "active", current_period_end: "2027-10-26T00:00:00Z", plan_key: "founding_annual" };
    for (const status of ["active", "trialing"]) {
      const any = deriveEntitlement(ENDED_TRIAL, { ...FOUNDING, status }, NOW, { native: true });
      t.eq([any.plan, any.unlimited, any.paidSubscription], ["premium", true, true], `6a a ${status} Founding Annual subscription gives full access, in a store app too`);
    }
    t.eq(deriveEntitlement(ENDED_TRIAL, null, NOW).plan, "free", "6b (not vacuous: without it, the same household is on the free plan)");
    const db = { profiles: [{ user_id: "u1", ...ENDED_TRIAL }], subscriptions: [{ user_id: "u1", ...FOUNDING }] };
    const a = load(db);
    const nat = await a.auth.getUserPlan("u1");
    t.eq([nat.entitlement, nat.unlimited, nat.paid, a.reads.includes("subscriptions")], ["premium", true, true, true],
      "6c getUserPlan: a founding subscriber gets full access, read from the subscription");

    const L = await import("../src/lib/foundingLink.js");
    const ON = { enabled: true, paid: false, founding: { available: true, cohortLimit: 50 } };
    for (const signedIn of [true, false]) for (const asked of [true, false]) for (const status of [ON, { ...ON, paid: true }, null]) {
      t.eq(L.foundingLinkAction({ requested: true, native: true, signedIn, asked, status }), "forget",
        `6d the founding link opens nothing in a store app (signed ${signedIn ? "in" : "out"}, ${asked ? "asked" : "not asked"}, billing ${status ? "on" : "off"})`);
    }
    const app = fs.readFileSync(path.join(REPO, "src", "App.jsx"), "utf8");
    const init = app.slice(app.indexOf("const [foundingLink,setFoundingLink]=useState("), app.indexOf("const [foundingLink,setFoundingLink]=useState(") + 200);
    t.ok(/useState\(\(\)=>\{\s*if\(isNativeApp\(\)\) return false;/.test(init), "6e the App never even holds the founding link in a store app");
    t.ok(/\{foundingNote && !isNativeApp\(\) && /.test(app), "6f the sign-in card's founding line never renders in a store app");
    const { LANDING_PRICE_SENTENCE } = require("../netlify/functions/_lib/foundingLinkEmail.js");
    t.ok(/ Paid on flourishmoney\.app, and it works in the iPhone and Android apps too\.$/.test(LANDING_PRICE_SENTENCE) && !/Not yet/i.test(LANDING_PRICE_SENTENCE),
      "6g the founding link email says, in the landing page's words, that it is paid on the website and works in the iPhone and Android apps too (approved 2026-10-21)");
  }


  // ── 7. billing day: a payment counts the same in every app ────────────────────────────────────
  {
    const P = await import("../src/lib/planFromProfile.js");
    for (const plan of ["free", "trial", "beta_founder", "premium"]) for (const paid of [true, false]) {
      t.eq(P.webPlan(plan, { paid, native: true }), P.webPlan(plan, { paid }), `7a a stray store-app flag changes nothing (${plan}, paid ${paid})`);
    }
    t.eq(P.webPlan("free", { paid: true }), "premium", "7b a payment lifts the free plan to full access");
    const app = fs.readFileSync(path.join(REPO, "src", "App.jsx"), "utf8");
    t.ok(/webPaidRef\.current = !!user\?\.id && /.test(app) && /webPlan\(profilePlan, \{ paid: webPaidRef\.current \}\)/.test(app) && !/native: nativeApp \}\)/.test(app.slice(app.indexOf("webPaidRef.current ="), app.indexOf("webPaidRef.current =") + 400)),
      "7c the App counts a payment through webPlan with no store-app flag");
    t.eq((app.match(/=\s*webPlan\(/g) || []).length, 1, "7d …and that effect is the only call to webPlan: the only place a payment is counted");
  }

  process.env = saved;
  t.summary("nativeWebPurchase.test");
})();
