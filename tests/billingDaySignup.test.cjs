// tests/billingDaySignup.test.cjs
// -----------------------------------------------------------------------------
// OPENING SIGNUP ON BILLING DAY (OPEN_SIGNUP=true, docs/ops/BILLING-DAY-OCT-26.md section 5).
//
// A founding household needs an account to reach checkout, and with signup shut a full 30-seat beta cap
// refuses even a valid invite code. So Monday opens signup. This pins that opening it breaks nothing else:
//   1. invite codes: a valid code still signs up as "invited" and takes a seat while seats are left (and,
//      from round 3, confirms its address by link like everyone else); a wrong code is still refused; a full
//      cap no longer locks a code holder out;
//   2. the beta founder flag: no signup, open or coded, can set it; an existing founder keeps the founding
//      price and the founder plan, with the door open or shut;
//   3. the waitlist founding lookup: signing up touches no waitlist row and no founding number, and the
//      founding price follows the account's CONFIRMED email exactly as before.
// The real beta.js runs against a fake admin client (the openSignup.test.cjs pattern); no network.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");

const REPO = path.join(__dirname, "..");
const AUTH_PATH = require.resolve("../netlify/functions/_lib/auth.js");
const BETA_PATH = require.resolve("../netlify/functions/beta.js");
const BLOBS_PATH = require.resolve("@netlify/blobs");
const CODES = "FLOURISH2026,BETA100";
const OPEN = { OPEN_SIGNUP: "true", BETA_CODES: CODES, SUPABASE_ANON_KEY: "test-anon-not-real" };
const SHUT = { BETA_CODES: CODES };

function freshBlobs() {
  const d = new Map();
  return { getStore: () => ({ async get(k) { return d.has(k) ? d.get(k) : null; }, async setJSON(k, v) { d.set(k, v); } }) };
}
function fakeAdmin(state) {
  return {
    rpc: async (fn, args) => { state.rpc.push({ fn, args }); return { data: state.seat, error: null }; },
    from: (table) => { state.tables.push(table); return { delete: () => ({ eq: async () => ({ error: null }) }) }; },
    auth: { admin: { createUser: async (u) => { state.created.push(u); return { error: null }; } } },
  };
}
async function signup(env, body, over = {}) {
  const state = { rpc: [], tables: [], created: [], fetches: [], bodies: [], resends: [], seat: "ok", ...over };
  const savedEnv = { ...process.env }, savedFetch = global.fetch;
  for (const p of [AUTH_PATH, BETA_PATH, BLOBS_PATH]) delete require.cache[p];
  require.cache[BLOBS_PATH] = { id: BLOBS_PATH, filename: BLOBS_PATH, loaded: true, exports: freshBlobs() };
  require.cache[AUTH_PATH] = { id: AUTH_PATH, filename: AUTH_PATH, loaded: true, exports: {
    getAdminClient: () => fakeAdmin(state),
    getPublicClient: () => ({ auth: { resend: async (a) => { state.resends.push(a); return { error: null }; } } }),
  } };
  global.fetch = async (url, init) => { state.fetches.push(String(url)); state.bodies.push(init && init.body); throw new Error("network blocked in test"); };
  // beta.js logs each signup; kept out of the gate's output (tests/betaLogging.test.cjs owns those lines).
  const quiet = { log: console.log, error: console.error };
  console.log = () => {}; console.error = () => {};
  try {
    process.env.SUPABASE_URL = "https://supabase.test.invalid";
    process.env.SUPABASE_SECRET_KEY = "test-secret-not-real";
    for (const k of ["OPEN_SIGNUP", "BETA_CODES", "SUPABASE_ANON_KEY"]) delete process.env[k];
    Object.assign(process.env, env);
    const res = await require(BETA_PATH).handler({ httpMethod: "POST", headers: { origin: "https://flourishmoney.app" },
      body: JSON.stringify({ action: "signup", email: "household@example.test", password: "a-long-enough-password", ...body }) });
    return { state, data: JSON.parse(res.body) };
  } finally {
    for (const p of [AUTH_PATH, BETA_PATH, BLOBS_PATH]) delete require.cache[p];
    process.env = savedEnv; global.fetch = savedFetch;
    console.log = quiet.log; console.error = quiet.error;
  }
}

(async () => {
  const t = create();

  // ── 1. invite codes ─────────────────────────────────────────────────────────────────────────────
  {
    const coded = await signup(OPEN, { code: "FLOURISH2026" });
    t.eq([coded.data.ok, coded.data.source], [true, "invited"], "1a door open, a valid code: still an invited signup");
    // Round 3: with signup open, a coded signup confirms its address by link (tests/foundingVerifiedEmail.test.cjs).
    t.eq([coded.state.created[0].email_confirm, coded.data.needsConfirmation], [false, true], "1b …and, signup being open, it confirms its address by link");
    t.eq(coded.state.rpc.map(r => r.fn), ["reserve_beta_seat"], "1c …and it takes one of the 30 seats");
    t.eq((await signup(OPEN, { code: " beta100 " })).data.source, "invited", "1d case and spaces in a code still do not matter");
    const wrong = await signup(OPEN, { code: "NOT-A-CODE" });
    t.eq([wrong.data.error, wrong.state.created.length, wrong.state.rpc.length], ["invalid_code", 0, 0], "1e a wrong code is still refused, door open or not");
    const full = await signup(OPEN, { code: "FLOURISH2026" }, { seat: "cap_reached" });
    t.eq([full.data.ok, full.data.source, full.state.created[0].email_confirm], [true, "self_serve", false],
      "1f a full cap no longer locks a code holder out: admitted as self-serve, and confirms the address like anyone else");
    const fullShut = await signup(SHUT, { code: "FLOURISH2026" }, { seat: "cap_reached" });
    t.eq([fullShut.data.error, fullShut.state.created.length], ["cap_reached", 0], "1g (why Monday opens it) door shut, a full cap refuses even a valid code");
    const none = await signup(OPEN, {});
    t.eq([none.data.ok, none.data.source, none.data.needsConfirmation, none.state.created[0].email_confirm, none.state.rpc.length],
      [true, "self_serve", true, false, 0], "1h no code, door open: a self-serve account, unconfirmed until the email is opened, no seat taken");
    t.eq(none.state.resends.length, 1, "1i …and the confirmation email is sent");
  }

  // ── 2. the beta founder flag ────────────────────────────────────────────────────────────────────
  {
    const all = [await signup(OPEN, {}), await signup(OPEN, { code: "FLOURISH2026" }), await signup(OPEN, { code: "FLOURISH2026" }, { seat: "cap_reached" })];
    const payloads = all.map(r => JSON.stringify(r.state.created[0] || {}));
    t.ok(payloads.every(p => !/founder|"plan"|trial/i.test(p)), "2a no signup, open or coded, sends a founder flag, a plan or a trial");
    t.ok(all.every(r => r.state.tables.every(tb => tb === "beta_signups")), "2b …and no signup writes the profiles row");
    const mig = fs.readFileSync(path.join(REPO, "supabase", "migrations", "0007_trial_only_signups.sql"), "utf8");
    const fn = mig.slice(mig.indexOf("create or replace function public.handle_new_user"), mig.indexOf("-- 3."));
    t.ok(/values \(new\.id, 'trial', now\(\), now\(\) \+ interval '14 days', false\)/.test(fn) && !/raw_user_meta|user_metadata/i.test(fn),
      "2c every new account, however it signed up, gets the 14-day trial and founder_flag false (0007), whatever its metadata says");
    const guard = fs.readFileSync(path.join(REPO, "supabase", "migrations", "0002_profiles_guard.sql"), "utf8");
    t.ok(/new\.founder_flag\s+is distinct from old\.founder_flag/.test(guard) && /'service_role'/.test(guard),
      "2d only the service role may change founder_flag (0002's guard), so an open signup cannot make itself a founder");

    const planRules = require("../netlify/functions/_lib/planRules.js");
    const cohort = require("../netlify/functions/_lib/foundingCohort.js");
    const P = await import("../src/lib/planFromProfile.js");
    const answers = async () => {
      const lookups = [];
      const admin = {
        from: (table) => { const q = { select() { return q; }, eq() { return q; },
          async maybeSingle() { return { data: table === "profiles" ? { founder_flag: true } : null, error: null }; } }; return q; },
        rpc: async (name) => { lookups.push(name); return { data: null, error: null }; },
      };
      return {
        plan: planRules.deriveEntitlement({ plan: "free", founder_flag: true }, null, Date.now()).plan,
        web: P.webPlan(P.derivePlan({ plan: "free", founder_flag: true }), { paid: true }),
        founding: await cohort.mayBuyFoundingPrice(admin, "founder-1", { email: "founder@example.test", email_confirmed_at: null }),
        lookups,
      };
    };
    process.env.OPEN_SIGNUP = "true";
    const opened = await answers();
    delete process.env.OPEN_SIGNUP;
    const shut = await answers();
    t.eq([opened.plan, opened.web, opened.founding, opened.lookups], ["beta_founder", "beta_founder", true, []],
      "2e an existing beta founder keeps the founder plan and the founding price, without the waitlist being read");
    t.eq(JSON.stringify(opened), JSON.stringify(shut), "2f …identically with signup open or shut");
  }

  // ── 3. the waitlist founding lookup ─────────────────────────────────────────────────────────────
  {
    const runs = [await signup(OPEN, {}), await signup(OPEN, { code: "FLOURISH2026" })];
    // The one request a signup makes (2026-10-22, _lib/landingCounts.js): the account_created count, which holds an
    // event, a src and a device and nothing else. No waitlist row, no founding number, no founding function.
    const onlyCount = (url, body) => /\/rest\/v1\/rpc\/bump_landing_count$/.test(url) && (() => { try { const b = JSON.parse(body); return b.p_event === "account_created" && Object.keys(b).sort().join() === "p_device,p_event,p_src"; } catch { return false; } })();
    t.ok(runs.every(r => r.state.fetches.length === 1 && r.state.fetches.every((u, i) => onlyCount(u, r.state.bodies[i])) && !r.state.fetches.some(u => /waitlist|founding/.test(u)) && r.state.rpc.every(c => c.fn === "reserve_beta_seat")),
      "3a signing up reads and writes no waitlist row and no founding number (its one request is the account_created count; no founding function)");
    const cohort = require("../netlify/functions/_lib/foundingCohort.js");
    const HOLDER = "Founder.Household@Example.test";
    const ask = async (user) => {
      const asked = [];
      const admin = {
        from: () => { const q = { select() { return q; }, eq() { return q; }, async maybeSingle() { return { data: null, error: null }; } }; return q; },
        rpc: async (name, args) => { asked.push(args.p_email); return { data: args.p_email === "founder.household@example.test" ? 7 : null, error: null }; },
      };
      return { may: await cohort.mayBuyFoundingPrice(admin, "new-1", user), asked };
    };
    for (const open of [true, false]) {
      if (open) process.env.OPEN_SIGNUP = "true"; else delete process.env.OPEN_SIGNUP;
      const unconfirmed = await ask({ email: HOLDER, email_confirmed_at: null });
      t.eq([unconfirmed.may, unconfirmed.asked], [false, []], `3b signup ${open ? "open" : "shut"}: a new account with a founding address is not offered the price before the address is confirmed`);
      const confirmed = await ask({ email: HOLDER, email_confirmed_at: "2026-10-26T15:00:00Z", app_metadata: { email_confirmation: "link" } });
      t.eq([confirmed.may, confirmed.asked], [true, ["founder.household@example.test"]], `3c …once confirmed from our link it is, matched on the normalised address`);
      const auto = await ask({ email: HOLDER, email_confirmed_at: "2026-10-26T15:00:00Z", app_metadata: { email_confirmation: "auto" } });
      t.eq([auto.may, auto.asked], [false, []], `3c2 …but never when the address was confirmed on creation`);
      t.eq((await ask({ email: "someone.else@example.test", email_confirmed_at: "2026-10-26T15:00:00Z", app_metadata: { email_confirmation: "link" } })).may, false, "3d …and another address is not");
    }
    delete process.env.OPEN_SIGNUP;
  }

  t.summary("billingDaySignup.test");
})();
