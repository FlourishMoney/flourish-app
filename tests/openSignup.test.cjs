// tests/openSignup.test.cjs
// -----------------------------------------------------------------------------
// THE OPEN DOOR, AND THE FLAG THAT KEEPS IT SHUT.
//
// Signup is invite-only: beta.js checks the typed code against BETA_CODES and fails closed when that
// variable is unset. The store launch needs a door a stranger can walk through, so the door is built
// and left shut behind OPEN_SIGNUP, a SERVER variable Amanda sets in Netlify when she is ready.
//
// The real beta.js handler runs here, with _lib/auth replaced in the require cache (the same trick
// billingFunctions.test.cjs uses), so there is no network, no Supabase and no key. Every assertion is
// about what the shipped function actually answers.
//
// What this pins:
//   • with OPEN_SIGNUP unset, every signup path answers byte for byte what today's build answers
//   • only the exact string "true" opens the door: not "1", not "yes", not "TRUE", not " true "
//   • the flag is read on the server and never reaches the client bundle
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");

const AUTH_PATH = require.resolve("../netlify/functions/_lib/auth.js");
const BETA_PATH = require.resolve("../netlify/functions/beta.js");

// ── a fake admin client: records every call, performs none ───────────────────────────────────────
function fakeAdmin(state) {
  return {
    rpc: async (fn, args) => {
      state.rpc.push({ fn, args });
      return { data: state.seat, error: null };
    },
    from: (table) => ({
      delete: () => ({
        eq: async (col, val) => { state.deletes.push({ table, col, val }); return { error: null }; },
      }),
    }),
    auth: {
      admin: {
        createUser: async (u) => { state.created.push(u); return state.createResult || { error: null }; },
      },
    },
  };
}

// Loads the REAL beta.js against that fake, with `env` applied for this call only.
function runBeta(state, env, body) {
  const savedEnv = { ...process.env };
  const savedFetch = global.fetch;
  delete require.cache[AUTH_PATH];
  delete require.cache[BETA_PATH];
  require.cache[AUTH_PATH] = {
    id: AUTH_PATH, filename: AUTH_PATH, loaded: true, exports: { getAdminClient: () => fakeAdmin(state) },
  };
  // Any network call at all is a failure of the test's premise, not a pass.
  global.fetch = async (url) => { state.fetches.push(String(url)); throw new Error("network blocked in test"); };
  try {
    process.env.SUPABASE_URL = "https://supabase.test.invalid";
    process.env.SUPABASE_SECRET_KEY = "test-secret-not-real";
    delete process.env.OPEN_SIGNUP;
    delete process.env.BETA_CODES;
    Object.assign(process.env, env);
    const beta = require(BETA_PATH);
    return beta.handler({
      httpMethod: "POST",
      headers: { origin: "https://flourishmoney.app" },
      body: JSON.stringify(body),
    });
  } finally {
    delete require.cache[AUTH_PATH];
    delete require.cache[BETA_PATH];
    process.env = savedEnv;
    global.fetch = savedFetch;
  }
}

const freshState = (over = {}) => ({ rpc: [], deletes: [], created: [], fetches: [], seat: "ok", createResult: null, ...over });

(async () => {
  const { openSignupEnabled, decideSignup } = require("../netlify/functions/_lib/signupGate.js");
  const t = create();

  const CODES = "FLOURISH2026,BETA100";
  const signup = async (env, body, over) => {
    const state = freshState(over);
    const res = await runBeta(state, env, { action: "signup", email: "new@example.invalid", password: "a-long-enough-password", ...body });
    return { state, status: res.statusCode, data: JSON.parse(res.body) };
  };

  // ── 1. Only the exact string "true" opens the door ────────────────────────────────────────────
  {
    t.eq(openSignupEnabled({}), false, "unset: the door is shut");
    for (const v of ["", "false", "0", "no", "1", "yes", "TRUE", "True", " true", "true ", "trueish"]) {
      t.eq(openSignupEnabled({ OPEN_SIGNUP: v }), false, `"${v}" does not open the door`);
    }
    t.eq(openSignupEnabled({ OPEN_SIGNUP: "true" }), true, '"true" opens it');
    t.eq(openSignupEnabled(), false, "with no argument it reads the process env, where it is unset in this run");
  }

  // ── 2. The decision itself ────────────────────────────────────────────────────────────────────
  {
    const valid = (c) => c === "FLOURISH2026";
    const d = (code, open) => decideSignup({ code, open, isValidCode: valid });
    t.eq(d("FLOURISH2026", false), { allow: true, source: "invited", usedCode: true }, "shut: a valid code is invited");
    t.eq(d("FLOURISH2026", true), { allow: true, source: "invited", usedCode: true }, "open: a valid code is STILL invited, not self-serve");
    t.eq(d("NOPE", false), { allow: false, error: "invalid_code", usedCode: true }, "shut: a wrong code is refused");
    t.eq(d("NOPE", true), { allow: false, error: "invalid_code", usedCode: true }, "open: a wrong code is still refused, never quietly downgraded to self-serve");
    t.eq(d("", false), { allow: false, error: "invalid_code", usedCode: false }, "shut: no code is refused");
    t.eq(d("", true), { allow: true, source: "self_serve", usedCode: false }, "open: no code is a self-serve signup");
    t.eq(d("   ", true), { allow: true, source: "self_serve", usedCode: false }, "open: a whitespace-only code counts as no code");
    t.eq(d("   ", false), { allow: false, error: "invalid_code", usedCode: false }, "shut: a whitespace-only code is refused, as today");
    t.eq(d(undefined, false), { allow: false, error: "invalid_code", usedCode: false }, "shut: an absent code is refused");
    t.eq(d(null, true), { allow: true, source: "self_serve", usedCode: false }, "open: an absent code is self-serve");
    // Fail closed on codes stays fail closed, door open or not: BETA_CODES unset means nothing validates.
    const none = () => false;
    t.eq(decideSignup({ code: "ANY", open: true, isValidCode: none }), { allow: false, error: "invalid_code", usedCode: true },
         "with BETA_CODES unset, a typed code is refused even when the door is open");
    t.eq(decideSignup({ code: "", open: true, isValidCode: none }), { allow: true, source: "self_serve", usedCode: false },
         "…but the open door does not depend on BETA_CODES at all");
  }

  // ── 3. With the flag unset, the handler answers exactly what it answers today ──────────────────
  {
    const noCode = await signup({ BETA_CODES: CODES }, { code: "" });
    t.eq([noCode.status, noCode.data], [200, { error: "invalid_code" }], "flag unset: a codeless signup is refused, exactly as today");
    t.eq([noCode.state.created.length, noCode.state.rpc.length], [0, 0], "…and no account is created and no seat is reserved");

    const missing = await signup({ BETA_CODES: CODES }, {});
    t.eq(missing.data, { error: "invalid_code" }, "flag unset: an absent code field is refused");

    const wrong = await signup({ BETA_CODES: CODES }, { code: "NOPE" });
    t.eq(wrong.data, { error: "invalid_code" }, "flag unset: a wrong code is refused");

    const good = await signup({ BETA_CODES: CODES }, { code: "flourish2026" });
    t.eq([good.status, good.data.ok], [200, true], "flag unset: a valid code still creates the account (lower case still matches)");
    t.eq(good.state.created.length, 1, "…one account");
    t.eq(good.state.rpc[0].fn, "reserve_beta_seat", "…and it still reserves a beta seat");
    t.eq(good.state.rpc[0].args.p_cap, 30, "…against the cap of 30");

    const unsetCodes = await signup({}, { code: "FLOURISH2026" });
    t.eq(unsetCodes.data, { error: "invalid_code" }, "flag unset and BETA_CODES unset: still fails closed");

    // Everything before the code check is untouched.
    const badEmail = await signup({ BETA_CODES: CODES }, { email: "nope", code: "FLOURISH2026" });
    t.eq([badEmail.status, badEmail.data], [400, { error: "invalid_email" }], "an invalid email is still a 400");
    const weak = await signup({ BETA_CODES: CODES }, { password: "short", code: "FLOURISH2026" });
    t.eq(weak.data, { error: "weak_password" }, "a short password is still weak_password");
  }

  // ── 4. A near-miss flag value leaves the door shut at the handler ──────────────────────────────
  {
    for (const v of ["1", "yes", "TRUE", "true "]) {
      const r = await signup({ OPEN_SIGNUP: v, BETA_CODES: CODES }, { code: "" });
      t.eq(r.data, { error: "invalid_code" }, `OPEN_SIGNUP="${v}" leaves the door shut`);
      t.eq(r.state.created.length, 0, `…and creates no account ("${v}")`);
    }
  }

  // ── 5. The flag is a server variable and never ships to the client ────────────────────────────
  {
    const REPO = path.join(__dirname, "..");
    const src = fs.readFileSync(path.join(REPO, "src", "App.jsx"), "utf8");
    t.ok(!/OPEN_SIGNUP/.test(src), "OPEN_SIGNUP is never read in src/App.jsx");
    const libs = fs.readdirSync(path.join(REPO, "src", "lib")).filter(f => /\.jsx?$/.test(f));
    const leaks = libs.filter(f => /OPEN_SIGNUP/.test(fs.readFileSync(path.join(REPO, "src", "lib", f), "utf8")));
    t.eq(leaks, [], "…nor in any src/lib module");
    t.ok(!/VITE_OPEN_SIGNUP/.test(fs.readFileSync(path.join(REPO, "vite.config.js"), "utf8")),
         "…and vite bakes no VITE_OPEN_SIGNUP into the bundle");
  }

  t.summary("openSignup.test");
})();
