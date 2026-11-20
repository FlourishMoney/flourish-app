// tests/instantSignup.test.cjs
// -----------------------------------------------------------------------------
// INSTANT SIGNUP (Amanda, 2026-11-11, first-run audit), behind SIGNUP_INSTANT, off unless exactly "true".
//   1  off: signup is today's byte for byte (an open signup confirms its address by link).
//   2  on, with signup open: the account is confirmed on creation, marked "instant", no email is sent, and the answer
//      tells the app to sign straight in; the website does (App.jsx), a store build from before this shows Log In.
//   3  on, with signup shut: nothing changes (a coded signup is "auto", as before).
//   4  an instant account's token is accepted (_lib/auth.js), and it may buy the founding price (paying earns the seat);
//      an "auto" account still may not.
// The real handler runs with _lib/auth faked in the require cache (as tests/emailConfirmation.test.cjs does).
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");

const AUTH_PATH = require.resolve("../netlify/functions/_lib/auth.js");
const BETA_PATH = require.resolve("../netlify/functions/beta.js");
const BLOBS_PATH = require.resolve("@netlify/blobs");

// A fresh in-memory rate-limit store per call, so the signup limiter (tests/signupLimit.test.cjs owns
// it) never refuses an assertion here. Without this, getStore throws outside Netlify and the limiter
// correctly fails closed, which would make every case in this file a 429.
function freshBlobs() {
  const d = new Map();
  return { getStore: () => ({ async get(k) { return d.has(k) ? d.get(k) : null; }, async setJSON(k, v) { d.set(k, v); } }) };
}
const COACH_PATH = require.resolve("../netlify/functions/coach.js");

function fakeAdmin(state) {
  return {
    rpc: async (fn, args) => { state.rpc.push({ fn, args }); return { data: state.seat, error: null }; },
    from: () => ({ delete: () => ({ eq: async () => ({ error: null }) }) }),
    auth: { admin: { createUser: async (u) => { state.created.push(u); return state.createResult || { error: null }; } } },
  };
}
function fakePublic(state) {
  return { auth: { resend: async (args) => { state.resends.push(args); return state.resendResult || { error: null }; } } };
}

async function runBeta(state, env, body) {
  const savedEnv = { ...process.env };
  const savedFetch = global.fetch;
  delete require.cache[AUTH_PATH];
  delete require.cache[BETA_PATH];
  delete require.cache[BLOBS_PATH];
  require.cache[BLOBS_PATH] = { id: BLOBS_PATH, filename: BLOBS_PATH, loaded: true, exports: freshBlobs() };
  require.cache[AUTH_PATH] = {
    id: AUTH_PATH, filename: AUTH_PATH, loaded: true,
    exports: {
      getAdminClient: () => fakeAdmin(state),
      getPublicClient: () => { if (state.noAnonKey) throw new Error("SUPABASE_URL or SUPABASE_ANON_KEY env var is missing"); return fakePublic(state); },
    },
  };
  global.fetch = async () => { throw new Error("network blocked in test"); };
  try {
    process.env.SUPABASE_URL = "https://supabase.test.invalid";
    process.env.SUPABASE_SECRET_KEY = "test-secret-not-real";
    delete process.env.OPEN_SIGNUP;
    delete process.env.BETA_CODES;
    Object.assign(process.env, env);
    // Awaited inside the try: see the note in tests/signupLimit.test.cjs.
    return await require(BETA_PATH).handler({
      httpMethod: "POST", headers: { origin: "https://flourishmoney.app" }, body: JSON.stringify(body),
    });
  } finally {
    delete require.cache[AUTH_PATH]; delete require.cache[BETA_PATH]; delete require.cache[BLOBS_PATH];
    process.env = savedEnv; global.fetch = savedFetch;
  }
}
const freshState = (over = {}) => ({ rpc: [], created: [], resends: [], seat: "ok", createResult: null, resendResult: null, noAnonKey: false, ...over });

(async () => {
  const { isEmailConfirmed } = require("../netlify/functions/_lib/auth.js");
  const FC = require("../netlify/functions/_lib/foundingCohort.js");
  const G = require("../netlify/functions/_lib/signupGate.js");
  const t = create();
  const REPO = path.join(__dirname, "..");
  const CODES = "FLOURISH2026,BETA100";
  const OPEN = { OPEN_SIGNUP: "true", BETA_CODES: CODES };
  const signup = async (env, body, over) => {
    const state = freshState(over);
    const res = await runBeta(state, env, { action: "signup", email: "new@example.invalid", password: "a-long-enough-password", ...body });
    return { state, status: res.statusCode, data: JSON.parse(res.body) };
  };

  // 1. off
  {
    const r = await signup(OPEN, { code: "" });
    t.eq([r.state.created[0].email_confirm, r.state.created[0].app_metadata, r.data, r.state.resends.length],
      [false, { email_confirmation: "link" }, { ok: true, source: "self_serve", needsConfirmation: true, sent: true }, 1], "1a off: an open signup confirms by link, as today");
    t.eq(["TRUE", "1", "yes", " true", ""].map((v) => G.signupInstantEnabled({ SIGNUP_INSTANT: v })), [false, false, false, false, false], "1b only exactly \"true\" turns it on");
  }
  // 2. on, signup open
  {
    const r = await signup({ ...OPEN, SIGNUP_INSTANT: "true" }, { code: "" });
    t.eq(r.state.created[0].email_confirm, true, "2a on: the account is confirmed on creation");
    t.eq(r.state.created[0].app_metadata, { email_confirmation: "instant" }, "2b …marked instant, where only the server can write it");
    t.eq(r.data, { ok: true, source: "self_serve", instant: true }, "2c …and the answer tells the app to sign straight in");
    t.eq(r.state.resends.length, 0, "2d …no confirmation email is sent");
    const coded = await signup({ ...OPEN, SIGNUP_INSTANT: "true" }, { code: "FLOURISH2026" });
    t.eq([coded.state.created[0].email_confirm, coded.state.created[0].app_metadata.email_confirmation, coded.data.instant, coded.data.source], [true, "instant", true, "invited"],
      "2e a coded signup while the door is open is instant too");
  }
  // 3. on, signup shut
  {
    const shut = await signup({ BETA_CODES: CODES, SIGNUP_INSTANT: "true" }, { code: "FLOURISH2026" });
    t.eq([shut.state.created[0].email_confirm, shut.state.created[0].app_metadata, shut.data], [true, { email_confirmation: "auto" }, { ok: true, source: "invited" }],
      "3a signup shut: a coded signup is \"auto\", exactly as before");
    const none = await signup({ BETA_CODES: CODES, SIGNUP_INSTANT: "true" }, { code: "" });
    t.eq([none.data.error, none.state.created.length], ["invalid_code", 0], "3b …and no code is still refused");
  }
  // 4. the account works, and founding
  {
    const instant = { email: "new@example.invalid", email_confirmed_at: "2026-11-11T15:00:00Z", app_metadata: { email_confirmation: "instant" } };
    const auto = { ...instant, app_metadata: { email_confirmation: "auto" } };
    t.ok(isEmailConfirmed(instant), "4a an instant account's token is accepted");
    t.eq([FC.emailConfirmed(instant), FC.emailConfirmed(auto)], [true, false], "4b an instant account may buy the founding price; an auto one still may not");
    const APP = fs.readFileSync(path.join(REPO, "src", "App.jsx"), "utf8");
    t.ok(APP.includes("if (out.instant) { setLoading(false); await handleLogin(); return; }"), "4c the website signs in with the address and password just typed");
    t.ok(/setSuccess\("Account created\. You can log in now\."\);\s*setMode\("login"\);/.test(APP), "4d …and anything else keeps today's Log In step");
  }

  t.summary("instantSignup.test");
  setImmediate(() => process.exit(process.exitCode || 0));
})();
