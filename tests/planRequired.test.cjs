// tests/planRequired.test.cjs
// -----------------------------------------------------------------------------
// NO FREE PLAN, ON THE SERVER (founder's decision, 2026-10-23: "Yes, drop the free plan. 14 days free, then Plus.").
//
// After the 14-day trial ends, or when a subscription lapses, a household has no plan, and every paid API answers
// "plan required" (402) before anything paid is asked: the coach (every type), What-If's explanation, and Plaid
// (linking and reading a bank). Store apps run the code bundled inside them, so this is what holds an installed
// 1.0 or 1.1 build to the rule whatever it shows. This runs the REAL coach.js, plaid.js and billing.js, from the
// iOS origin, the Android origin and the web, with every outside call stubbed:
//   1  the rule (_lib/planGate.js decidePlanAccess), and its words sell nothing
//   2  no plan (trial over, or a lapsed subscription): every coach type and every paid Plaid action refused,
//      nothing sent to Anthropic or Plaid
//   3  a plan (trial, founder, a paid profile, a paid subscription from Stripe, the App Store or Google Play):
//      every one of the same calls goes through
//   4  a plan the server could not read is a 503 ("try again"), never a 402 and never an open door; the 30 days
//      from go-live (migration 0029) count as a plan while they run, and their column missing is "no 30 days"
//   5  what stays open with no plan: consent changes, listing and disconnecting banks, deleting the account, and the
//      billing calls a household needs to subscribe
//   6  ENFORCE_PLAN_LIMITS off: nothing here applies
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const path = require("path");

const REPO = path.join(__dirname, "..");
const SUPA_PATH = require.resolve("@supabase/supabase-js", { paths: [path.join(REPO, "netlify", "functions")] });
const AUTH_PATH = require.resolve("../netlify/functions/_lib/auth.js");
const COACH_PATH = require.resolve("../netlify/functions/coach.js");
const PLAID_PATH = require.resolve("../netlify/functions/plaid.js");
const G = require("../netlify/functions/_lib/planGate.js");

const DAY = 86400000;
const iso = (ms) => new Date(ms).toISOString();
const IOS = "capacitor://localhost", ANDROID = "https://localhost", WEB = "https://flourishmoney.app";
const ORIGINS = [[IOS, "iOS"], [ANDROID, "Android"], [WEB, "web"]];
const CONSENT = { ai_third_party_consent_at: iso(Date.now() - 20 * DAY), ai_third_party_consent_revoked_at: null };
const ENDED = { plan: "trial", trial_started_at: iso(Date.now() - 40 * DAY), trial_ends_at: iso(Date.now() - 26 * DAY), founder_flag: false };
const live = (provider) => ({ provider, status: "active", current_period_end: iso(Date.now() + 30 * DAY), plan_key: "monthly" });

const NO_PLAN = {
  "trial over":           { profile: ENDED, sub: null },
  "never had a trial":    { profile: { plan: "free", trial_started_at: null, trial_ends_at: null, founder_flag: false }, sub: null },
  "lapsed (Stripe)":      { profile: ENDED, sub: { provider: "stripe", status: "canceled", current_period_end: iso(Date.now() - 2 * DAY) } },
  "lapsed (App Store)":   { profile: ENDED, sub: { provider: "app_store", status: "expired", current_period_end: iso(Date.now() - 2 * DAY) } },
  "period over, active":  { profile: ENDED, sub: { provider: "play_store", status: "active", current_period_end: iso(Date.now() - DAY) } },
  "past_due":             { profile: ENDED, sub: { provider: "stripe", status: "past_due", current_period_end: iso(Date.now() + 5 * DAY) } },
  "its 30 days over":     { profile: { ...ENDED, grace_ends_at: iso(Date.now() - DAY) }, sub: null },
};
const HAS_PLAN = {
  "in trial":             { profile: { plan: "trial", trial_started_at: iso(Date.now() - 3 * DAY), trial_ends_at: iso(Date.now() + 11 * DAY), founder_flag: false }, sub: null },
  "founder":              { profile: { plan: "free", trial_started_at: null, trial_ends_at: null, founder_flag: true }, sub: null },
  "paid profile (plus)":  { profile: { plan: "plus", trial_started_at: null, trial_ends_at: null, founder_flag: false }, sub: null },
  "Stripe":               { profile: ENDED, sub: live("stripe") },
  "App Store":            { profile: ENDED, sub: live("app_store") },
  "Google Play":          { profile: ENDED, sub: live("play_store") },
  "founding (Stripe)":    { profile: ENDED, sub: { ...live("stripe"), plan_key: "founding_annual" } },
  "in its 30 days":       { profile: { ...ENDED, grace_ends_at: iso(Date.now() + 20 * DAY) }, sub: null },
};

// A fake Supabase holding one household. `fail` makes one table's read fail, as a database blip would.
// `grace`: "missing" answers the grace_ends_at read as a database without migration 0029 does; "errors" as a blip.
function fakeSupabase(h, { fail = null, grace = null } = {}) {
  const calls = { reads: [], writes: [], rpc: [] };
  const rows = {
    profiles: [{ user_id: "u1", ...h.profile, ...CONSENT }],
    subscriptions: h.sub ? [{ user_id: "u1", ...h.sub }] : [],
    plaid_items: [{ user_id: "u1", item_id: "it1", access_token: "access-sandbox-1", status: "active", institution_name: "Test Bank" }],
  };
  const client = {
    from(table) {
      calls.reads.push(table);
      const q = {
        _f: [], _head: false,
        select(c, opts) { q._cols = c; if (opts && opts.head) q._head = true; return q; },
        eq(col, val) { q._f.push(r => r[col] === val); return q; },
        in() { return q; }, order() { return q; }, limit() { return q; }, neq() { return q; },
        update(patch) { calls.writes.push({ table, patch }); return q; },
        upsert(row) { calls.writes.push({ table, row }); return q; },
        delete() { calls.writes.push({ table, delete: true }); return q; },
        _rows() { return (rows[table] || []).filter(r => q._f.every(f => f(r))); },
        async maybeSingle() {
          if (table === "profiles" && q._cols === "grace_ends_at" && grace === "missing") return { data: null, error: { code: "42703", message: "column profiles.grace_ends_at does not exist" } };
          if (table === "profiles" && q._cols === "grace_ends_at" && grace === "errors") return { data: null, error: { code: "57014", message: "canceling statement due to statement timeout" } };
          return fail === table ? { data: null, error: { code: "57014", message: "canceling statement due to statement timeout" } } : { data: q._rows()[0] || null, error: null }; },
        async single() { return q.maybeSingle(); },
        then(res, rej) {
          const out = fail === table ? { data: null, error: { message: "timeout" } } : (q._head ? { count: q._rows().length, error: null } : { data: q._rows(), error: null });
          return Promise.resolve(out).then(res, rej);
        },
      };
      return q;
    },
    async rpc(name, args) { calls.rpc.push({ name, args }); return { data: 1, error: null }; },
    auth: { admin: { deleteUser: async () => ({ error: null }), getUserById: async () => ({ data: { user: null }, error: null }) } },
  };
  return { client, calls };
}

function load(h, { enforce = "true", fail = null, grace = null } = {}) {
  const fake = fakeSupabase(h, { fail, grace });
  Object.assign(process.env, {
    SUPABASE_URL: "https://example.supabase.test", SUPABASE_SECRET_KEY: "test-service-role", ENFORCE_PLAN_LIMITS: enforce,
    ANTHROPIC_API_KEY: "test-anthropic", PLAID_CLIENT_ID: "test-client", PLAID_SECRET: "test-secret",
  });
  require.cache[SUPA_PATH] = { id: SUPA_PATH, filename: SUPA_PATH, loaded: true, exports: { createClient: () => fake.client } };
  for (const p of [AUTH_PATH, COACH_PATH, PLAID_PATH]) delete require.cache[p];
  const auth = require(AUTH_PATH);
  auth.getUserFromRequest = async () => ({ user_id: "u1", error: null });
  return { auth, coach: require(COACH_PATH), plaid: require(PLAID_PATH), calls: fake.calls };
}

// Every outside call is answered here and counted: Anthropic with a sentence, Plaid with an empty success.
const outside = [];
global.fetch = async (url) => {
  const u = String(url);
  outside.push(u);
  if (/api\.anthropic\.com/.test(u)) return { ok: true, status: 200, json: async () => ({ content: [{ type: "text", text: "Here is what this means for your week." }], stop_reason: "end_turn", usage: { output_tokens: 9 } }) };
  if (/plaid\.com/.test(u)) return { ok: true, status: 200, json: async () => ({ link_token: "link-sandbox-1", accounts: [], transactions: [], added: [], modified: [], removed: [], has_more: false, next_cursor: "c1", item: { item_id: "it1" } }) };
  throw new Error("network blocked in test");
};
const anthropic = () => outside.filter(u => /api\.anthropic\.com/.test(u)).length;
const plaidApi = () => outside.filter(u => /plaid\.com/.test(u)).length;

const COACH_TYPES = ["chat", "simulator", "checkin", "facilitator", "document"];
const coachBody = (type) => type === "chat" ? { type, payload: { messages: [{ role: "user", content: "What does my week look like?" }], context: "Balance: $100." } }
  : type === "facilitator" ? { type, payload: { context: "Wins: none this week.", messages: [{ role: "user", content: "Start the money meeting." }] } }
  : { type, payload: { prompt: "Explain this in words." } };
const coachCall = (mod, origin, body) => mod.coach.handler({ httpMethod: "POST", headers: { origin, authorization: "Bearer x" }, body: JSON.stringify(body) });
const PLAID_BODIES = {
  create_link_token: {}, exchange_token: { public_token: "public-sandbox-1" }, migrate_items: { tokens: [{ token: "access-sandbox-2" }] },
  get_accounts: { item_id: "it1" }, get_transactions: { item_id: "it1" }, get_investments: { item_id: "it1" }, get_liabilities: { item_id: "it1" },
  enrich_transactions: { item_id: "it1", transactions: [] },
};
const plaidCall = (mod, origin, action, extra = {}) => mod.plaid.handler({ httpMethod: "POST", headers: { origin, authorization: "Bearer x" }, body: JSON.stringify({ action, ...extra }) });

(async () => {
  const t = create();
  const quiet = console.log;
  console.log = () => {};
  const errs = [];
  console.error = (...a) => errs.push(a.map(String).join(" "));

  try {
    // ── 1. The rule ──────────────────────────────────────────────────────────────────────────────
    t.eq([G.decidePlanAccess({ enforce: true, plan: { known: true, unlimited: false } }).status, G.decidePlanAccess({ enforce: true, plan: { known: true, unlimited: false } }).error], [402, "plan_required"], "1a no plan: 402 plan_required");
    t.eq(G.decidePlanAccess({ enforce: true, plan: { known: true, unlimited: true } }).allowed, true, "1b a plan: allowed");
    t.eq([G.decidePlanAccess({ enforce: true, plan: { known: false, unlimited: false } }).status, G.decidePlanAccess({ enforce: true, plan: null }).status], [503, 503], "1c a plan we could not read: 503, never 402");
    t.eq(G.decidePlanAccess({ enforce: true, plan: { known: false, unlimited: false } }).allowed, false, "1d …and never an open door");
    t.eq(G.decidePlanAccess({ enforce: false, plan: { known: true, unlimited: false } }).allowed, true, "1e ENFORCE_PLAN_LIMITS off: allowed");
    for (const m of [G.PLAN_REQUIRED_MESSAGE, G.PLAN_UNKNOWN_MESSAGE]) {
      t.ok(!/\$|price|flourishmoney\.app|https?:|upgrade|subscribe|buy|free plan/i.test(m), `1f a refusal's words name no price, website, way to pay or free plan: ${m}`);
    }
    t.eq([...G.PLAID_PLAN_ACTIONS].sort(), ["create_link_token", "enrich_transactions", "exchange_token", "get_accounts", "get_investments", "get_liabilities", "get_transactions", "migrate_items"], "1g the Plaid actions that need a plan, exactly");

    // ── 2. No plan: every paid call refused before anything paid is asked ──────────────────────────
    for (const [origin, name] of ORIGINS) {
      for (const [who, h] of Object.entries(NO_PLAN)) {
        for (const type of COACH_TYPES) {
          const mod = load(h);
          const before = anthropic();
          const res = await coachCall(mod, origin, coachBody(type));
          const body = JSON.parse(res.body);
          t.eq([res.statusCode, body.error], [402, "plan_required"], `2a ${name}, ${who}: coach ${type} refused, plan required`);
          t.eq(anthropic(), before, `2b ${name}, ${who}: coach ${type} …before Anthropic is asked`);
          t.eq(mod.calls.rpc.length, 0, `2c ${name}, ${who}: coach ${type} …and nothing is counted`);
        }
        for (const [action, extra] of Object.entries(PLAID_BODIES)) {
          const mod = load(h);
          const before = plaidApi();
          const res = await plaidCall(mod, origin, action, extra);
          t.eq([res.statusCode, JSON.parse(res.body).error], [402, "plan_required"], `2d ${name}, ${who}: Plaid ${action} refused, plan required`);
          t.eq(plaidApi(), before, `2e ${name}, ${who}: Plaid ${action} …before Plaid is asked`);
          t.eq(mod.calls.writes.length, 0, `2f ${name}, ${who}: Plaid ${action} …and nothing is written`);
        }
      }
    }

    // ── 3. A plan: the same calls go through ────────────────────────────────────────────────────────
    for (const [origin, name] of ORIGINS) {
      for (const [who, h] of Object.entries(HAS_PLAN)) {
        for (const type of COACH_TYPES) {
          const mod = load(h);
          const before = anthropic();
          const res = await coachCall(mod, origin, coachBody(type));
          t.eq(res.statusCode, 200, `3a ${name}, ${who}: coach ${type} answered`);
          t.ok(anthropic() > before, `3b ${name}, ${who}: coach ${type} …by Anthropic`);
        }
        for (const [action, extra] of Object.entries(PLAID_BODIES)) {
          const mod = load(h);
          const res = await plaidCall(mod, origin, action, extra);
          t.ok(!/plan_required|plan_unavailable/.test(res.body), `3c ${name}, ${who}: Plaid ${action} is not refused for the plan`);
        }
      }
    }

    // ── 4. A plan we could not read ─────────────────────────────────────────────────────────────────
    for (const h of [HAS_PLAN["Stripe"], NO_PLAN["trial over"]]) {
      const mod = load(h, { fail: "profiles" });
      const before = anthropic();
      const res = await coachCall(mod, WEB, coachBody("chat"));
      t.eq([res.statusCode, JSON.parse(res.body).error], [503, "plan_unavailable"], "4a the profile unreadable: 503, never 402");
      t.eq(anthropic(), before, "4b …and Anthropic is not asked");
    }
    {
      const mod = load(HAS_PLAN["App Store"], { fail: "subscriptions" });
      const res = await plaidCall(mod, IOS, "get_accounts", { item_id: "it1" });
      t.eq([res.statusCode, JSON.parse(res.body).error], [503, "plan_unavailable"], "4c a paying household whose subscription cannot be read is told to try again, not to subscribe");
      const founder = load(HAS_PLAN["founder"], { fail: "subscriptions" });
      t.eq((await coachCall(founder, WEB, coachBody("chat"))).statusCode, 200, "4d a founder needs no subscription read at all");
    }

    // ── 4b. The 30 days' column: missing (before 0029) is a known "no 30 days"; a failed read is not an answer ──
    {
      const missing = load(NO_PLAN["trial over"], { grace: "missing" });
      t.eq(JSON.parse((await coachCall(missing, WEB, coachBody("chat"))).body).error, "plan_required", "4e before 0029 (no column): no 30 days, so no plan, plan required");
      const paidMissing = load(HAS_PLAN["Stripe"], { grace: "missing" });
      t.eq((await coachCall(paidMissing, WEB, coachBody("chat"))).statusCode, 200, "4f …and a paying household is untouched by the missing column");
      const blip = load(NO_PLAN["trial over"], { grace: "errors" });
      t.eq(JSON.parse((await coachCall(blip, WEB, coachBody("chat"))).body).error, "plan_unavailable", "4g the column unreadable for a household that might be in its 30 days: try again, never plan required");
      const paidBlip = load(HAS_PLAN["App Store"], { grace: "errors" });
      t.eq((await coachCall(paidBlip, IOS, coachBody("chat"))).statusCode, 200, "4h …while a paying household needs no 30 days and goes through");
      const R = require("../netlify/functions/_lib/planRules.js");
      const auth = load(HAS_PLAN["in its 30 days"]).auth;
      const answer = await auth.getUserPlan("u1");
      t.eq([answer.entitlement, answer.unlimited, answer.known, answer.grace_ends_at], ["grace", true, true, HAS_PLAN["in its 30 days"].profile.grace_ends_at], "4i getUserPlan: in its 30 days, every feature, with the end date");
      t.eq(R.accessAnswer(answer), { entitled: true, basis: "grace", grace_ends_at: HAS_PLAN["in its 30 days"].profile.grace_ends_at }, "4j …and that is what the app is told");
    }

    // ── 5. What stays open with no plan ─────────────────────────────────────────────────────────────
    {
      const h = NO_PLAN["trial over"];
      for (const action of ["accept_consent", "revoke_consent"]) {
        const mod = load(h);
        t.eq((await coachCall(mod, WEB, { action })).statusCode, 200, `5a ${action} still works with no plan`);
      }
      for (const action of ["list_items", "delete_item"]) {
        const mod = load(h);
        const res = await plaidCall(mod, WEB, action, { item_id: "it1" });
        t.ok(!/plan_required|plan_unavailable/.test(res.body), `5b Plaid ${action} still works with no plan (a household can see and disconnect its banks)`);
      }
      const mod = load(h);
      const res = await plaidCall(mod, WEB, "delete_account");
      t.ok(!/plan_required|plan_unavailable/.test(res.body), "5c deleting the account still works with no plan");
      const billing = require("fs").readFileSync(path.join(REPO, "netlify", "functions", "billing.js"), "utf8");
      t.ok(!/planGate|decidePlanAccess|plan_required/.test(billing), "5d billing.js (status, checkout, the portal, the store sync) asks for no plan: a household can always subscribe");
      const meeting = require("fs").readFileSync(path.join(REPO, "netlify", "functions", "meeting.js"), "utf8");
      t.ok(!/planGate|decidePlanAccess/.test(meeting), "5e recording a meeting's answers (the household's own data) asks for no plan, so nothing an older build sends is lost");
    }

    // ── 6. The flag off ─────────────────────────────────────────────────────────────────────────────
    for (const type of COACH_TYPES) {
      const mod = load(NO_PLAN["trial over"], { enforce: "false" });
      t.eq((await coachCall(mod, WEB, coachBody(type))).statusCode, 200, `6a ENFORCE_PLAN_LIMITS off: coach ${type} is not refused for the plan`);
    }
    {
      const mod = load(NO_PLAN["trial over"], { enforce: "false" });
      t.ok(!/plan_required/.test((await plaidCall(mod, WEB, "get_accounts", { item_id: "it1" })).body), "6b ENFORCE_PLAN_LIMITS off: Plaid is not refused for the plan");
    }
  } catch (e) {
    t.ok(false, "the suite ran to the end: " + (e && e.stack || e));
  } finally {
    console.log = quiet;
  }
  t.summary("planRequired");
})();
