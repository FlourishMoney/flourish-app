// tests/foundingVerifiedEmail.test.cjs
// -----------------------------------------------------------------------------
// THE FOUNDING PRICE NEEDS A CONFIRMED ADDRESS (billing day, round 3; the first 50 who subscribe, 2026-10-29).
//
// A signup with an invite code while signup was shut was confirmed the moment it was created. Now:
//   • beta.js marks every account it creates in app_metadata (server-only): "link" when the address must be
//     confirmed by clicking the link we email, "auto" when it was confirmed on creation;
//   • once OPEN_SIGNUP is on, nobody is confirmed on creation, coded or not;
//   • _lib/foundingCohort.js offers the founding price to an account whose address is confirmed, never to one
//     confirmed on creation ("auto"), while fewer than 50 founding seats are held (migration 0032). A waitlist
//     number no longer decides it.
// Pinned end to end from the real signup to the real billing status and checkout:
//   1. a coded signup gets no founding price until its address is verified, then gets it;
//   2. any verified household gets it while seats remain, and none does at 50;
//   3. an auto-confirmed account never gets it; one made before the marker existed, confirmed, does;
//   4. billing off = unchanged; existing beta founders keep what they have.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const path = require("path");

const AUTH_PATH = require.resolve("../netlify/functions/_lib/auth.js");
const API_PATH = require.resolve("../netlify/functions/_lib/stripeApi.js");
const BETA_PATH = require.resolve("../netlify/functions/beta.js");
const BILLING_PATH = require.resolve("../netlify/functions/billing.js");
const BLOBS_PATH = require.resolve("@netlify/blobs");
const HOLDER = "founding.household@example.test";        // holds waitlist number 7
const CODES = "FLOURISH2026";

// The real beta.js signup; returns what it asked Supabase to create.
async function signup(env, body) {
  const state = { created: [], resends: [], rpc: [] };
  const saved = { ...process.env }, savedFetch = global.fetch, quiet = { log: console.log, error: console.error };
  for (const p of [AUTH_PATH, BETA_PATH, BLOBS_PATH]) delete require.cache[p];
  const d = new Map();
  require.cache[BLOBS_PATH] = { id: BLOBS_PATH, filename: BLOBS_PATH, loaded: true,
    exports: { getStore: () => ({ async get(k) { return d.has(k) ? d.get(k) : null; }, async setJSON(k, v) { d.set(k, v); } }) } };
  require.cache[AUTH_PATH] = { id: AUTH_PATH, filename: AUTH_PATH, loaded: true, exports: {
    getAdminClient: () => ({ rpc: async (fn) => { state.rpc.push(fn); return { data: "ok", error: null }; },
      from: () => ({ delete: () => ({ eq: async () => ({ error: null }) }) }),
      auth: { admin: { createUser: async (u) => { state.created.push(u); return { error: null }; } } } }),
    getPublicClient: () => ({ auth: { resend: async (a) => { state.resends.push(a); return { error: null }; } } }),
  } };
  global.fetch = async () => { throw new Error("network blocked in test"); };
  console.log = () => {}; console.error = () => {};
  try {
    process.env.SUPABASE_URL = "https://supabase.test.invalid";
    process.env.SUPABASE_SECRET_KEY = "test-secret-not-real";
    for (const k of ["OPEN_SIGNUP", "BETA_CODES"]) delete process.env[k];
    Object.assign(process.env, env);
    const res = await require(BETA_PATH).handler({ httpMethod: "POST", headers: { origin: "https://flourishmoney.app" },
      body: JSON.stringify({ action: "signup", email: HOLDER, password: "a-long-enough-password", ...body }) });
    return { state, data: JSON.parse(res.body) };
  } finally {
    for (const p of [AUTH_PATH, BETA_PATH, BLOBS_PATH]) delete require.cache[p];
    process.env = saved; global.fetch = savedFetch; console.log = quiet.log; console.error = quiet.error;
  }
}

// The account Supabase Auth would hold after that createUser, and after the household clicks (or not).
const accountFrom = (created, { clicked = false } = {}) => ({
  email: created.email,
  email_confirmed_at: created.email_confirm || clicked ? "2026-10-26T15:00:00Z" : null,
  app_metadata: { provider: "email", providers: ["email"], ...(created.app_metadata || {}) },
});

// The real billing.js, for that account, against a waitlist where HOLDER holds number 7 and `seats` founding seats held.
async function billingFor(user, { founder = false, billing = true, seats = 0 } = {}) {
  const saved = { ...process.env };
  for (const p of [BILLING_PATH, AUTH_PATH, API_PATH]) delete require.cache[p];
  const real = require("../netlify/functions/_lib/auth.js");
  const admin = {
    from: (table) => { const q = { select() { return q; }, eq() { return q; }, async upsert() { return { error: null }; },
      async maybeSingle() { return { data: table === "profiles" ? { founder_flag: founder } : null, error: null }; } }; return q; },
    rpc: async (name, args) => ({ data: name === "waitlist_founding_number_for_email" && args.p_email === HOLDER ? 7 : name === "founding_seats_taken" ? seats : null, error: null }),
    auth: { admin: { getUserById: async () => ({ data: { user } }) } },
  };
  require.cache[AUTH_PATH].exports = { ...real, getUserFromRequest: async () => ({ user_id: "u1", error: null }), getAdminClient: () => admin };
  let checkout = 0;
  require.cache[API_PATH] = { id: API_PATH, filename: API_PATH, loaded: true, exports: { stripePost: async () => { checkout++; return { id: "x", url: "https://stripe.test/pay" }; },
    // Checkout asks Stripe for the customer's live subscriptions and open sessions first (B3, 2026-10-26): none here.
    stripeGet: async () => ({ data: [] }) } };
  try {
    if (billing) process.env.BILLING_ENABLED = "true"; else delete process.env.BILLING_ENABLED;
    process.env.STRIPE_PRICE_FOUNDING_ANNUAL_CAD = "price_founding_test";
    const b = require(BILLING_PATH);
    const post = (body) => b.handler({ httpMethod: "POST", headers: {}, body: JSON.stringify(body) });
    const status = await post({ action: "status" });
    const buy = await post({ action: "create_checkout_session", plan_key: "founding_annual" });
    return { statusCode: status.statusCode, founding: status.statusCode === 200 ? JSON.parse(status.body).founding.available : null,
      buyCode: buy.statusCode, stripeCalls: checkout };
  } finally {
    for (const p of [BILLING_PATH, AUTH_PATH, API_PATH]) delete require.cache[p];
    process.env = saved;
  }
}

(async () => {
  const t = create();
  const OPEN = { OPEN_SIGNUP: "true", BETA_CODES: CODES, SUPABASE_ANON_KEY: "test-anon-not-real" };
  const SHUT = { BETA_CODES: CODES };

  // ── 1. a coded signup: no founding price until its address is verified ─────────────────────────
  {
    const coded = await signup(OPEN, { code: "FLOURISH2026" });
    const made = coded.state.created[0];
    t.eq([coded.data.source, made.email_confirm, made.app_metadata], ["invited", false, { email_confirmation: "link" }],
      "1a signup open, with a code: invited, but created unconfirmed and marked to confirm by link");
    t.eq(coded.state.resends.length, 1, "1b …and the confirmation email goes to the address it typed");
    const before = await billingFor(accountFrom(made));
    t.eq([before.founding, before.buyCode, before.stripeCalls], [false, 403, 0], "1c before the household clicks: no founding price, and a founding checkout is refused");
    const after = await billingFor(accountFrom(made, { clicked: true }));
    t.eq([after.founding, after.buyCode, after.stripeCalls], [true, 200, 2], "1d after the household clicks our link: the founding price is offered and checkout opens (customer, then session)");
  }

  // ── 2. any verified household gets it while seats remain ───────────────────────────────────────
  {
    const selfServe = await signup(OPEN, {});
    const made = selfServe.state.created[0];
    t.eq([selfServe.data.source, made.email_confirm, made.app_metadata], ["self_serve", false, { email_confirmation: "link" }], "2a a self-serve signup: unconfirmed, marked to confirm by link");
    const r = await billingFor(accountFrom(made, { clicked: true }));
    t.eq([r.founding, r.buyCode], [true, 200], "2b verified: the household holding a waitlist number gets the founding price");
    const other = await billingFor({ ...accountFrom(made, { clicked: true }), email: "someone.else@example.test" });
    t.eq([other.founding, other.buyCode], [true, 200], "2c a verified address with no waitlist number gets it too");
    const full = await billingFor(accountFrom(made, { clicked: true }), { seats: 50 });
    t.eq([full.founding, full.buyCode, full.stripeCalls], [false, 403, 0], "2d (control) at 50 seats held nobody does, waitlist number or not");
  }

  // ── 3. an auto-confirmed account never gets it ──────────────────────────────────────────────────
  {
    const shutCoded = await signup(SHUT, { code: "FLOURISH2026" });
    const made = shutCoded.state.created[0];
    t.eq([made.email_confirm, made.app_metadata], [true, { email_confirmation: "auto" }], "3a signup shut, with a code: confirmed on creation, as before, and marked so");
    const auto = await billingFor(accountFrom(made));
    t.eq([auto.founding, auto.buyCode, auto.stripeCalls], [false, 403, 0], "3b an auto-confirmed account holding a founding address never gets the founding price");
    const legacy = await billingFor({ email: HOLDER, email_confirmed_at: "2026-09-20T00:00:00Z", app_metadata: { provider: "email", providers: ["email"] } });
    t.eq([legacy.founding, legacy.buyCode], [true, 200], "3c an account made before the marker existed, its address confirmed, gets it");
    for (const [why, am] of [["a forged user_metadata", { provider: "email" }], ["a marker spelt otherwise", { email_confirmation: "LINK" }], ["no app_metadata at all", undefined]]) {
      const u = { email: HOLDER, email_confirmed_at: "2026-10-26T15:00:00Z", app_metadata: am, user_metadata: { email_confirmation: "auto" } };
      t.eq((await billingFor(u)).founding, true, `3d ${why}: confirmed, and only app_metadata "auto" says confirmed on creation`);
    }
    t.eq((await billingFor({ email: HOLDER, email_confirmed_at: null, app_metadata: { email_confirmation: "link" } })).founding, false, "3d2 never confirmed: no founding price");
    const cohort = require("../netlify/functions/_lib/foundingCohort.js");
    t.eq([cohort.emailVerifiedByLink({ email_confirmed_at: "x", app_metadata: { email_confirmation: "link" } }),
      cohort.emailVerifiedByLink({ email_confirmed_at: null, app_metadata: { email_confirmation: "link" } }),
      cohort.emailVerifiedByLink(null)], [true, false, false], "3e verified by link means both: our link marker, and a confirmed address");
    t.eq([cohort.emailConfirmed({ email: "a@b.c", email_confirmed_at: "x", app_metadata: { email_confirmation: "link" } }),
      cohort.emailConfirmed({ email: "a@b.c", email_confirmed_at: "x", app_metadata: {} }),
      cohort.emailConfirmed({ email: "a@b.c", email_confirmed_at: "x", app_metadata: { email_confirmation: "auto" } }),
      cohort.emailConfirmed({ email: "a@b.c", email_confirmed_at: null }), cohort.emailConfirmed(null)], [true, true, false, false, false],
      "3f confirmed for the founding price: Supabase Auth says so, and it was not confirmed on creation");
  }

  // ── 4. billing off = unchanged; beta founders keep what they have ──────────────────────────────
  {
    const off = await billingFor(accountFrom((await signup(OPEN, {})).state.created[0], { clicked: true }), { billing: false });
    t.eq([off.statusCode, off.buyCode, off.stripeCalls], [404, 404, 0], "4a billing off: status and checkout are 404s, exactly as before, whatever the account");
    const founderAuto = await billingFor({ email: "beta.tester@example.test", email_confirmed_at: "2026-09-01T00:00:00Z", app_metadata: { email_confirmation: "auto" } }, { founder: true });
    t.eq([founderAuto.founding, founderAuto.buyCode], [true, 200], "4b an existing beta founder keeps the founding price, auto-confirmed or not");
    const founderLegacy = await billingFor({ email: "beta.tester@example.test", email_confirmed_at: "2026-06-12T00:00:00Z", app_metadata: {} }, { founder: true });
    t.eq(founderLegacy.founding, true, "4c …including one made before the marker existed");
  }

  t.summary("foundingVerifiedEmail.test");
})();
