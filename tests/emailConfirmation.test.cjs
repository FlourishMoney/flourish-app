// tests/emailConfirmation.test.cjs
// -----------------------------------------------------------------------------
// AN UNCONFIRMED ADDRESS IS NOT AN ACCOUNT.
//
// KNOWN-DEFECTS 32: open signup created a usable account from an address nobody had proved they own,
// because every signup was admin-created with email_confirm true. A self-serve signup is now created
// UNCONFIRMED and must open the email first.
//
// THE MECHANISM, AND WHY THIS ONE. Supabase's own "Confirm your signup" email, sent through the
// project's SMTP by auth.resend({ type: "signup" }) on the publishable key. That is the documented
// call for "this user exists and has not confirmed yet", it uses the template and the sender the
// project already has configured, and the same call serves the person who presses "Send it again".
// The alternative, admin.generateLink(), hands back a link for the application to email itself, which
// would mean owning a second template and a second sending path beside the one already set up.
//
// The real handlers run here with _lib/auth faked in the require cache: no network, no Supabase.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");

const AUTH_PATH = require.resolve("../netlify/functions/_lib/auth.js");
const BETA_PATH = require.resolve("../netlify/functions/beta.js");
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

function runBeta(state, env, body) {
  const savedEnv = { ...process.env };
  const savedFetch = global.fetch;
  delete require.cache[AUTH_PATH];
  delete require.cache[BETA_PATH];
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
    return require(BETA_PATH).handler({
      httpMethod: "POST", headers: { origin: "https://flourishmoney.app" }, body: JSON.stringify(body),
    });
  } finally {
    delete require.cache[AUTH_PATH]; delete require.cache[BETA_PATH];
    process.env = savedEnv; global.fetch = savedFetch;
  }
}
const freshState = (over = {}) => ({ rpc: [], created: [], resends: [], seat: "ok", createResult: null, resendResult: null, noAnonKey: false, ...over });

(async () => {
  const { isEmailConfirmed } = require("../netlify/functions/_lib/auth.js");
  const t = create();
  const REPO = path.join(__dirname, "..");
  const CODES = "FLOURISH2026,BETA100";
  const OPEN = { OPEN_SIGNUP: "true", BETA_CODES: CODES };
  const signup = async (env, body, over) => {
    const state = freshState(over);
    const res = await runBeta(state, env, { action: "signup", email: "new@example.invalid", password: "a-long-enough-password", ...body });
    return { state, status: res.statusCode, data: JSON.parse(res.body) };
  };

  // ── 1. A self-serve account is created unconfirmed, and the email goes out ─────────────────────
  {
    const r = await signup(OPEN, { code: "" });
    t.eq(r.state.created.length, 1, "the account is created");
    t.eq(r.state.created[0].email_confirm, false, "…UNCONFIRMED: nobody has proved they own the address yet");
    t.eq(r.data, { ok: true, source: "self_serve", needsConfirmation: true, sent: true }, "…and the answer says the address must be confirmed");
    t.eq(r.state.resends.length, 1, "…one confirmation email is asked for");
    t.eq(r.state.resends[0].type, "signup", "…Supabase's own \"Confirm your signup\" email");
    t.eq(r.state.resends[0].email, "new@example.invalid", "…to the address that signed up");
    t.eq(r.state.resends[0].options.emailRedirectTo, "https://flourishmoney.app/confirmed", "…landing on the site's confirmed page");
  }

  // ── 2. A coded signup is unchanged: confirmed on creation, no email ────────────────────────────
  {
    const r = await signup(OPEN, { code: "BETA100" });
    t.eq(r.state.created[0].email_confirm, true, "a coded signup is still confirmed on creation");
    t.eq(r.data, { ok: true, source: "invited" }, "…and its answer is unchanged: no confirmation step");
    t.eq(r.state.resends.length, 0, "…no email is sent");
    const shut = await signup({ BETA_CODES: CODES }, { code: "FLOURISH2026" });
    t.eq([shut.state.created[0].email_confirm, shut.data], [true, { ok: true, source: "invited" }], "…and with the door shut it is identical");
    t.eq(shut.state.resends.length, 0, "…still no email");
  }

  // ── 3. The email failing does not lose the account ────────────────────────────────────────────
  {
    const refused = await signup(OPEN, { code: "" }, { resendResult: { error: { message: "smtp down" } } });
    t.eq(refused.data, { ok: true, source: "self_serve", needsConfirmation: true, sent: false },
         "Supabase refusing the email still reports the account and says it was not sent, so the screen can offer Resend");
    t.eq(refused.state.created.length, 1, "…the account exists either way");
    const noKey = await signup(OPEN, { code: "" }, { noAnonKey: true });
    t.eq(noKey.data.sent, false, "a missing SUPABASE_ANON_KEY is survivable and visible, not a 500");
    t.eq(noKey.data.needsConfirmation, true, "…and the address still has to be confirmed");
  }

  // ── 4. Resend: allowed, and it tells a stranger nothing ───────────────────────────────────────
  {
    const state = freshState();
    const res = await runBeta(state, OPEN, { action: "resend_confirmation", email: "Someone@Example.Invalid" });
    t.eq([res.statusCode, JSON.parse(res.body)], [200, { ok: true }], "a resend is accepted");
    t.eq(state.resends[0].email, "someone@example.invalid", "…for the normalised address");
    t.eq(state.resends[0].type, "signup", "…as the signup confirmation");

    // The same answer whatever the address turns out to be: no account oracle.
    const unknown = freshState({ resendResult: { error: { message: "User not found" } } });
    const r2 = await runBeta(unknown, OPEN, { action: "resend_confirmation", email: "nobody@example.invalid" });
    t.eq([r2.statusCode, JSON.parse(r2.body)], [200, { ok: true }], "an address with no account gets the identical answer");
    const bad = await runBeta(freshState(), OPEN, { action: "resend_confirmation", email: "not-an-email" });
    t.eq([bad.statusCode, JSON.parse(bad.body)], [400, { error: "invalid_email" }], "…but a malformed address is still rejected");
  }

  // ── 5. An unconfirmed account cannot use the app ──────────────────────────────────────────────
  {
    t.eq(isEmailConfirmed({ email_confirmed_at: "2026-09-26T00:00:00Z" }), true, "a confirmed user is confirmed");
    t.eq(isEmailConfirmed({ confirmed_at: "2026-09-26T00:00:00Z" }), true, "…including older rows that carry confirmed_at");
    for (const u of [{}, { email_confirmed_at: null }, { email_confirmed_at: "" }, null, undefined]) {
      t.eq(isEmailConfirmed(u), false, `${JSON.stringify(u)} is not confirmed`);
    }

    // The real coach handler, with an auth layer that reports an unconfirmed user.
    const savedEnv = { ...process.env };
    const savedFetch = global.fetch;
    const anthropic = [];
    global.fetch = async (url) => { anthropic.push(String(url)); throw new Error("network blocked in test"); };
    process.env.SUPABASE_URL = "https://supabase.test.invalid";
    process.env.SUPABASE_SECRET_KEY = "test-secret-not-real";
    process.env.ANTHROPIC_API_KEY = "test-key-not-real";
    try {
      for (const [label, authExports, expected] of [
        ["an unconfirmed account", { getUserFromRequest: async () => ({ user_id: null, error: "email not confirmed" }) }, "email not confirmed"],
        ["a confirmed account", { getUserFromRequest: async () => ({ user_id: "u1", error: null }) }, null],
      ]) {
        delete require.cache[AUTH_PATH]; delete require.cache[COACH_PATH];
        require.cache[AUTH_PATH] = {
          id: AUTH_PATH, filename: AUTH_PATH, loaded: true,
          exports: { getAdminClient: () => ({}), getUserPlan: async () => ({ plan: "trial", unlimited: true }), ENFORCE_PLAN_LIMITS: false, unauthorized: () => ({}), ...authExports },
        };
        const coach = require(COACH_PATH);
        const res = await coach.handler({
          httpMethod: "POST", headers: { origin: "https://flourishmoney.app", authorization: "Bearer a-real-looking-token" },
          body: JSON.stringify({ message: "what can I spend?", capability: "text" }),
        });
        if (expected) {
          t.eq(res.statusCode, 401, `${label}: /api/coach answers 401`);
          t.eq(JSON.parse(res.body).error, expected, `${label}: …and says why`);
        } else {
          t.ok(res.statusCode !== 401, `${label}: is NOT refused by the confirmation gate (got ${res.statusCode})`);
        }
        delete require.cache[AUTH_PATH]; delete require.cache[COACH_PATH];
      }
      t.eq(anthropic.filter(u => u.includes("api.anthropic.com")).length, 0, "no unconfirmed request reaches Anthropic");
    } finally {
      global.fetch = savedFetch; process.env = savedEnv;
    }

    // The gate is in the shared auth helper, so plaid, billing and meeting get it too.
    const auth = fs.readFileSync(path.join(REPO, "netlify", "functions", "_lib", "auth.js"), "utf8");
    t.ok(/if \(!isEmailConfirmed\(data\.user\)\) \{\s*\n\s*return \{ user_id: null, error: "email not confirmed" \};/.test(auth),
         "getUserFromRequest refuses an unconfirmed user, so every function that calls it does");
  }

  // ── 6. The screen and the landing page ────────────────────────────────────────────────────────
  {
    const app = fs.readFileSync(path.join(REPO, "src", "App.jsx"), "utf8");
    t.ok(/setSuccess\("Check your email to confirm your address\."\)/.test(app), "the sign-up screen says \"Check your email to confirm your address.\"");
    t.ok(/if \(out\.needsConfirmation\) \{/.test(app), "…only when the server says the address needs confirming");
    t.ok(/action: "resend_confirmation"/.test(app), "…and it can ask for the email again");
    t.ok(/resendConfirmCooldown > 0 \? `Send again in \$\{resendConfirmCooldown\}s`/.test(app), "…behind a 60 second cooldown");
    t.ok(/setResendConfirmCooldown\(60\)/.test(app), "…set before the request, so a failure cannot be retried instantly");

    t.ok(/if \(path === "\/confirmed"\) return "confirmed";/.test(app), "/confirmed is a route");
    t.ok(/if\(screen==="confirmed"\)return <ConfirmedPage\/>;/.test(app), "…rendering the page");
    const page = app.slice(app.indexOf("function ConfirmedPage()"), app.indexOf("function DeleteAccount("));
    t.ok(/You're confirmed\./.test(page) && /Open Flourish and sign in\./.test(page), "…which reads \"You're confirmed. Open Flourish and sign in.\"");
    t.ok(!/useState|useEffect|fetch\(|supabase/.test(page), "…and it is a plain page: no state, no request, nothing to fail for a store user");
  }

  t.summary("emailConfirmation.test");
})();
