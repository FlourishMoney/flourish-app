// tests/nativeTrialLimits.test.cjs
// -----------------------------------------------------------------------------
// THE STORE APPS FOLLOW THE WEB'S RULES, AND THE SERVER HOLDS EVERY APP TO THEM (founder, 2026-10-20).
//
// Until this date a store app opened Credit and the Meet facilitator to every user for good, and the server
// checked the plan for coach chat and bank linking only: the What-If explanation and the facilitator went to
// Anthropic for any signed-in account. Store apps run the JavaScript bundled inside them (capacitor.config.json
// has no server.url), so a deploy cannot change an installed app; only the server reaches it. This runs the
// five households the founder named through the REAL coach.js and plaid.js, from the iOS origin, the Android
// origin and the web, with every outside call stubbed:
//   trial         14 days not yet over          everything open, nothing counted
//   ended         trial over, no subscription  the free plan: 1 What-If explanation a day, no facilitator,
//                                               one bank (the coach's 2 a week is coachLimits.test's)
//   founder       founder_flag                 everything open, nothing counted
//   paid          trial over, paying on the web everything open, nothing counted
//   web           the same four, from the web  the same answers (section 5)
// The app's own rules for the same households, on each platform, are tests/nativeAccess.test.cjs.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const path = require("path");

const REPO = path.join(__dirname, "..");
const SUPA_PATH = require.resolve("@supabase/supabase-js", { paths: [path.join(REPO, "netlify", "functions")] });
const AUTH_PATH = require.resolve("../netlify/functions/_lib/auth.js");
const COACH_PATH = require.resolve("../netlify/functions/coach.js");
const PLAID_PATH = require.resolve("../netlify/functions/plaid.js");
const { FREE_SIMULATIONS_DAILY, FACILITATOR_FREE_MESSAGE } = require("../netlify/functions/_lib/coachLimits.js");

const DAY = 86400000;
const iso = (ms) => new Date(ms).toISOString();
const IOS = "capacitor://localhost", ANDROID = "https://localhost", WEB = "https://flourishmoney.app";
const ORIGINS = [[IOS, "iOS"], [ANDROID, "Android"], [WEB, "web"]];
const CONSENT = { ai_third_party_consent_at: iso(Date.now() - 20 * DAY), ai_third_party_consent_revoked_at: null };

const HOUSEHOLDS = {
  trial:   { profile: { plan: "trial", trial_started_at: iso(Date.now() - 3 * DAY), trial_ends_at: iso(Date.now() + 11 * DAY), founder_flag: false }, sub: null },
  ended:   { profile: { plan: "trial", trial_started_at: iso(Date.now() - 40 * DAY), trial_ends_at: iso(Date.now() - 26 * DAY), founder_flag: false }, sub: null },
  founder: { profile: { plan: "free", trial_started_at: null, trial_ends_at: null, founder_flag: true }, sub: null },
  paid:    { profile: { plan: "trial", trial_started_at: iso(Date.now() - 40 * DAY), trial_ends_at: iso(Date.now() - 26 * DAY), founder_flag: false },
             sub: { status: "active", current_period_end: iso(Date.now() + 300 * DAY), plan_key: "annual" } },
};

// A fake Supabase holding one household. rpc counts the What-If explanations per kind, or fails as asked.
function fakeSupabase(h, { counter = "works" } = {}) {
  const calls = { rpc: [], reads: [] };
  const used = {};
  const rows = {
    profiles: [{ user_id: "u1", ...h.profile, ...CONSENT }],
    subscriptions: h.sub ? [{ user_id: "u1", ...h.sub }] : [],
    plaid_items: [{ user_id: "u1", item_id: "it1", status: "active" }],
  };
  const client = {
    from(table) {
      calls.reads.push(table);
      const q = {
        _f: [], _head: false,
        select(_c, opts) { if (opts && opts.head) q._head = true; return q; },
        eq(col, val) { q._f.push(r => r[col] === val); return q; },
        _rows() { return (rows[table] || []).filter(r => q._f.every(f => f(r))); },
        async maybeSingle() { return { data: q._rows()[0] || null, error: null }; },
        then(res, rej) { return Promise.resolve(q._head ? { count: q._rows().length, error: null } : { data: q._rows(), error: null }).then(res, rej); },
      };
      return q;
    },
    async rpc(name, args) {
      calls.rpc.push({ name, args });
      if (name === "increment_coach_usage") return { data: 1, error: null };
      if (name === "increment_coach_usage_weekly") return { data: 1, error: null };
      if (name === "increment_ai_usage_daily") {
        if (counter === "missing") return { data: null, error: { code: "PGRST202", message: "Could not find the function public.increment_ai_usage_daily(p_kind, p_user) in the schema cache" } };
        if (counter === "errors") return { data: null, error: { message: "permission denied" } };
        used[args.p_kind] = (used[args.p_kind] || 0) + 1;
        return { data: used[args.p_kind], error: null };
      }
      return { data: null, error: { message: `unexpected rpc ${name}` } };
    },
    auth: { admin: {} },
  };
  return { client, calls };
}

function load(h, opts) {
  const fake = fakeSupabase(h, opts);
  Object.assign(process.env, {
    SUPABASE_URL: "https://example.supabase.test", SUPABASE_SECRET_KEY: "test-service-role", ENFORCE_PLAN_LIMITS: "true",
    ANTHROPIC_API_KEY: "test-anthropic", PLAID_CLIENT_ID: "test-client", PLAID_SECRET: "test-secret",
  });
  require.cache[SUPA_PATH] = { id: SUPA_PATH, filename: SUPA_PATH, loaded: true, exports: { createClient: () => fake.client } };
  for (const p of [AUTH_PATH, COACH_PATH, PLAID_PATH]) delete require.cache[p];
  const auth = require(AUTH_PATH);
  auth.getUserFromRequest = async () => ({ user_id: "u1", error: null });
  return { auth, coach: require(COACH_PATH), plaid: require(PLAID_PATH), calls: fake.calls };
}

// Every outside call is answered here: Anthropic with a plain sentence, Plaid with a refusal (the
// exchange is only asked whether it got that far). Nothing leaves the machine.
const outside = [];
const realFetch = global.fetch;
global.fetch = async (url) => {
  outside.push(String(url));
  if (/api\.anthropic\.com/.test(String(url))) {
    return { ok: true, status: 200, json: async () => ({ content: [{ type: "text", text: "Here is what this means for your week." }], stop_reason: "end_turn", usage: { output_tokens: 9 } }) };
  }
  throw new Error("network blocked in test");
};
const anthropicCalls = () => outside.filter(u => /api\.anthropic\.com/.test(u)).length;

const coachCall = (mod, origin, type) => mod.coach.handler({
  httpMethod: "POST", headers: { origin, authorization: "Bearer x" },
  body: JSON.stringify(type === "facilitator"
    ? { type, payload: { context: "Wins: none this week.", messages: [{ role: "user", content: "Start the money meeting." }] } }
    : { type, payload: { prompt: "Explain this scenario in words." } }),
});

(async () => {
  const t = create();
  const saved = { ...process.env };
  const quiet = console.log, quietErr = console.error;
  console.log = () => {};
  const errors = [];
  console.error = (...a) => errors.push(a.map(String).join(" "));

  // What each household got from each app, recorded below and compared in section 5.
  const outcomes = {};
  const note = (origin, who, what, v) => { ((outcomes[origin] = outcomes[origin] || {})[who] = outcomes[origin][who] || []).push(`${what}=${v}`); };

  try {
    // ── 1. the Meet facilitator: not on the free plan, for any app ────────────────────────────────
    for (const [origin, name] of ORIGINS) {
      for (const [who, h] of Object.entries(HOUSEHOLDS)) {
        const mod = load(h);
        const before = anthropicCalls();
        const res = await coachCall(mod, origin, "facilitator");
        note(origin, who, "facilitator", res.statusCode);
        if (who === "ended") {
          const body = JSON.parse(res.body);
          t.eq([res.statusCode, body.error, body.message], [402, "plan_limit", FACILITATOR_FREE_MESSAGE], `1a ${name}: trial over, not paying: the facilitator is refused`);
          t.eq(anthropicCalls(), before, `1b ${name}: …before Anthropic is asked`);
          t.ok(!/upgrade|plus|\$|price|flourishmoney\.app|subscribe/i.test(body.message), `1c ${name}: …in words that sell nothing`);
        } else {
          t.eq(res.statusCode, 200, `1d ${name}: ${who}: the facilitator answers`);
          t.eq(anthropicCalls(), before + 1, `1e ${name}: ${who}: …through one Anthropic call`);
        }
      }
    }

    // ── 2. What-If: 1 explanation a day on the free plan, for any app ─────────────────────────────
    for (const [origin, name] of ORIGINS) {
      const mod = load(HOUSEHOLDS.ended);
      const first = await coachCall(mod, origin, "simulator");
      t.eq(first.statusCode, 200, `2a ${name}: trial over: the first What-If explanation of the day is answered`);
      const before = anthropicCalls();
      const second = await coachCall(mod, origin, "simulator");
      t.eq([second.statusCode, JSON.parse(second.body).error], [429, "rate_limited"], `2b ${name}: …the second is refused (the free plan has ${FREE_SIMULATIONS_DAILY} a day)`);
      t.eq(anthropicCalls(), before, `2c ${name}: …before Anthropic is asked`);
      note(origin, "ended", "whatIf", `${first.statusCode},${second.statusCode}`);
      t.eq(mod.calls.rpc.filter(c => c.name === "increment_ai_usage_daily").map(c => c.args.p_kind).join(","), "simulator,simulator",
        `2d ${name}: …counted on the daily counter, kind simulator`);
      for (const who of ["trial", "founder", "paid"]) {
        const m = load(HOUSEHOLDS[who]);
        const codes = [];
        for (let i = 0; i < 3; i++) codes.push((await coachCall(m, origin, "simulator")).statusCode);
        note(origin, who, "whatIf", codes.join(","));
        t.eq(codes, [200, 200, 200], `2e ${name}: ${who}: What-If explanations are not limited`);
        t.eq(m.calls.rpc.filter(c => c.name === "increment_ai_usage_daily").length, 0, `2f ${name}: ${who}: …and never counted`);
      }
    }

    // ── 3. the counter down or not applied yet (0024): free accounts fail closed, nobody else is touched ──
    for (const counter of ["missing", "errors"]) {
      const mod = load(HOUSEHOLDS.ended, { counter });
      const before = anthropicCalls();
      const res = await coachCall(mod, IOS, "simulator");
      t.eq([res.statusCode, JSON.parse(res.body).error], [429, "rate_limited"], `3a counter ${counter}: a free account's What-If explanation is refused`);
      t.eq(anthropicCalls(), before, `3b counter ${counter}: …and costs nothing`);
      for (const who of ["trial", "founder", "paid"]) {
        t.eq((await coachCall(load(HOUSEHOLDS[who], { counter }), IOS, "simulator")).statusCode, 200, `3c counter ${counter}: ${who} is unaffected`);
      }
    }
    t.ok(errors.some(l => /daily simulator counter unavailable, free accounts fail closed/.test(l)), "3d …and the failure is logged where the rollout can be seen");

    // ── 4. the one-bank cap: the free plan connects one bank, for any app ─────────────────────────
    for (const [origin, name] of ORIGINS) {
      for (const [who, h] of Object.entries(HOUSEHOLDS)) {
        const mod = load(h);
        const before = outside.length;
        const res = await mod.plaid.handler({ httpMethod: "POST", headers: { origin, authorization: "Bearer x" },
          body: JSON.stringify({ action: "exchange_token", public_token: "public-sandbox-1" }) });
        const toPlaid = outside.slice(before).some(u => /\/item\/public_token\/exchange$/.test(u));
        note(origin, who, "secondBank", toPlaid ? "plaid" : res.statusCode);
        if (who === "ended") t.eq([res.statusCode, toPlaid], [402, false], `4a ${name}: trial over, not paying, one bank already: a second is refused before Plaid`);
        else t.eq([res.statusCode !== 402, toPlaid], [true, true], `4b ${name}: ${who}: a second bank goes on to Plaid`);
      }
    }

    // ── 5. the web gets exactly the store apps' answers ───────────────────────────────────────────
    for (const who of Object.keys(HOUSEHOLDS)) {
      const web = (outcomes[WEB][who] || []).join(" ");
      t.ok(web.split(" ").length === 3, `5a ${who}: three outcomes recorded on the web (${web})`);
      for (const [origin, name] of ORIGINS.slice(0, 2)) {
        t.eq((outcomes[origin][who] || []).join(" "), web, `5b ${who}: ${name} gets exactly the web's outcomes`);
      }
    }
    t.eq((outcomes[WEB].ended || []).join(" "), "facilitator=402 whatIf=200,429 secondBank=402",
      "5c (not vacuous: the free plan's outcomes on the web are the limits themselves)");
  } finally {
    console.log = quiet; console.error = quietErr;
    global.fetch = realFetch;
    process.env = saved;
  }

  t.summary("nativeTrialLimits.test");
  setImmediate(() => process.exit(process.exitCode || 0));
})();
