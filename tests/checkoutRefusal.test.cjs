// tests/checkoutRefusal.test.cjs
// -----------------------------------------------------------------------------
// A REFUSED FOUNDING CHECKOUT SAYS SO (billing day, 2026-10-26).
//
// billing.js answers 403 "founding_price_not_available" when an account may not have the founding price.
// The checkout screen only recognised "founding_cohort_full", which the server never sends, so the household
// read "Couldn't reach checkout. Try again in a moment." and retrying never helped. Pinned here:
//   1. the server's real refusal, end to end through billing.js, gets the founding message;
//   2. a network failure, a sign-out and any other error keep their existing words;
//   3. the screen uses that one function for every failure.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");

const REPO = path.join(__dirname, "..");
const AUTH_PATH = require.resolve("../netlify/functions/_lib/auth.js");
const API_PATH = require.resolve("../netlify/functions/_lib/stripeApi.js");
const BILLING_PATH = require.resolve("../netlify/functions/billing.js");
const APP = fs.readFileSync(path.join(REPO, "src", "App.jsx"), "utf8");

function loadBilling(state) {
  delete require.cache[BILLING_PATH]; delete require.cache[AUTH_PATH]; delete require.cache[API_PATH];
  const real = require("../netlify/functions/_lib/auth.js");
  const admin = {
    from: (table) => { const q = { _f: {}, select() { return q; }, eq(c, v) { q._f[c] = v; return q; },
      async maybeSingle() { return { data: (state[table] || []).find(r => Object.entries(q._f).every(([k, v]) => r[k] === v)) || null, error: null }; } }; return q; },
    rpc: async () => ({ data: null, error: null }),          // no founding spot for this address
    auth: { admin: { getUserById: async () => ({ data: { user: { email: "someone@example.test", email_confirmed_at: "2026-10-01T00:00:00Z" } } }) } },
  };
  require.cache[AUTH_PATH].exports = { ...real, getUserFromRequest: async () => ({ user_id: "u1", error: null }), getAdminClient: () => admin };
  require.cache[API_PATH] = { id: API_PATH, filename: API_PATH, loaded: true, exports: { stripeGet: async () => ({ data: [] }), stripePost: async () => ({ id: "cs", url: "https://stripe.test/x" }) } };
  const mod = require(BILLING_PATH); delete require.cache[BILLING_PATH]; return mod;
}

(async () => {
  const t = create();
  const saved = { ...process.env };
  const vis = await import("../src/lib/billingVisibility.js");

  // ── 1. the server's real refusal ─────────────────────────────────────────────────────────────────
  {
    process.env.BILLING_ENABLED = "true";
    process.env.STRIPE_PRICE_FOUNDING_ANNUAL_CAD = "price_founding_test";
    for (const [why, state] of [
      ["no founding spot on this email", { profiles: [{ user_id: "u1", founder_flag: false }], subscriptions: [] }],
      ["a founding subscription that ended", { profiles: [{ user_id: "u1", founder_flag: true }], subscriptions: [{ user_id: "u1", founding_ended_at: "2026-11-01T00:00:00Z" }] }],
    ]) {
      const res = await loadBilling(state).handler({ httpMethod: "POST", headers: {}, body: JSON.stringify({ action: "create_checkout_session", plan_key: "founding_annual" }) });
      const body = JSON.parse(res.body);
      t.eq([res.statusCode, body.error], [403, "founding_price_not_available"], `1a ${why}: the server refuses with 403 founding_price_not_available`);
      t.eq(vis.checkoutErrorText({ status: res.statusCode, error: body.error }), vis.FOUNDING_REFUSED_TEXT, `1b …and the screen says why, not "try again"`);
    }
    // 2026-10-29 (the first 50 who subscribe): the old words said the price goes to a waitlist address; the new ones are
    // to come (docs/product/FOUNDING-SEATS-WORDS.md row 18: spots full or the founding subscription ended; regular plans).
    t.eq(vis.FOUNDING_REFUSED_TEXT, "[WORDS: checkout-founding-refused]", "1c the words are to come");
    t.eq(vis.FOUNDING_REFUSED_TEXT.match(/\$\s?\d/g), null, "1d …with no price in them");
    t.eq(vis.checkoutErrorText({ status: 403, error: "founding_cohort_full" }), vis.FOUNDING_REFUSED_TEXT, "1e the older name gets the same words");
  }

  // ── 2. every other failure keeps its words ──────────────────────────────────────────────────────
  {
    t.eq(vis.checkoutErrorText({ error: "signed_out" }), "Sign in again to continue.", "2a signed out: as before");
    for (const e of [{ error: "billing_provider_error" }, { status: 500, error: "price_not_configured" }, { status: 403, error: "something_else" }, {}, undefined]) {
      t.eq(vis.checkoutErrorText(e), "Couldn't reach checkout. Try again in a moment.", `2b ${JSON.stringify(e)}: as before`);
    }
  }

  // ── 3. the screen ───────────────────────────────────────────────────────────────────────────────
  {
    const screen = APP.slice(APP.indexOf("function UpgradeScreen("), APP.indexOf("function Paywall("));
    t.ok(/if\(res\.status===403\)\{\s*setError\(checkoutErrorText\(\{ status: res\.status, error: body\.error \}\)\);/.test(screen), "3a a 403 is told with checkoutErrorText");
    t.ok(/setError\(checkoutErrorText\(\{ error: e\.message \}\)\);/.test(screen), "3b …and so is every other failure");
    t.ok(!/founding_cohort_full|has just been taken up/.test(screen), "3c the screen no longer waits for a code the server never sends");
  }

  process.env = saved;
  t.summary("checkoutRefusal.test");
})();
