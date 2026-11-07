// tests/complimentaryAccess.test.cjs
// -----------------------------------------------------------------------------
// COMPLIMENTARY ACCESS (Amanda's decision, 2026-11-05): an account given free access by hand has
// profiles.plan "plus" (each grant and its undo are recorded outside this public repo). It already has every feature, so:
//
//   1. The founding rule (_lib/foundingCohort.js mayBuyFoundingPrice) never offers it the founding price.
//      A beta founder keeps the founding price whatever its plan, and a profile that cannot be read
//      falls back to the seat rule, as before.
//   2. The store apps are told so (billing.js store_status): no founding offer, so the plans screen
//      never opens by itself for it.
//   3. The website is told so (billing.js status), and its checkout refuses the founding price.
//   4. Its access is full everywhere, from the profile alone: the server, the website and the store apps.
//      It is not a paid subscription: no subscriptions row, nothing to count as revenue or as a seat.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");

const REPO = path.join(__dirname, "..");
const AUTH_PATH = require.resolve("../netlify/functions/_lib/auth.js");
const API_PATH = require.resolve("../netlify/functions/_lib/stripeApi.js");
const BILLING_PATH = require.resolve("../netlify/functions/billing.js");
const cohort = require("../netlify/functions/_lib/foundingCohort.js");
const planRules = require("../netlify/functions/_lib/planRules.js");

const U1 = "11111111-1111-4111-8111-111111111111";
const CONFIRMED = { id: U1, email: "household@example.ca", email_confirmed_at: "2026-10-28T00:00:00Z", app_metadata: { email_confirmation: "link" } };

// A service-role client with one profiles row (or a failing read), no subscription, and `seats` founding seats held.
function fakeAdmin({ profile = null, profileError = false, seats = 0 } = {}) {
  const asked = [];
  const db = { profiles: profile ? [{ user_id: U1, ...profile }] : [], subscriptions: [] };
  const from = (name) => {
    const f = [];
    const rows = () => (db[name] || []).filter((r) => f.every(([c, v]) => r[c] === v));
    const q = { select() { return q; }, eq(c, v) { f.push([c, v]); return q; },
      async maybeSingle() {
        if (name === "profiles" && profileError) return { data: null, error: { message: "down" } };
        return { data: rows()[0] ? { ...rows()[0] } : null, error: null };
      },
      upsert() { return Promise.resolve({ error: null }); } };
    return q;
  };
  return {
    asked,
    from,
    rpc: async (fn) => { asked.push(fn); return fn === "founding_seats_taken" ? { data: seats, error: null } : { data: null, error: null }; },
    auth: { admin: { getUserById: async () => ({ data: { user: { ...CONFIRMED } }, error: null }) } },
  };
}
function loadBilling(admin) {
  delete require.cache[BILLING_PATH]; delete require.cache[AUTH_PATH]; delete require.cache[API_PATH];
  const real = require(AUTH_PATH);
  require.cache[AUTH_PATH].exports = { ...real, getUserFromRequest: async () => ({ user_id: U1, error: null }), getAdminClient: () => admin };
  require.cache[API_PATH] = { id: API_PATH, filename: API_PATH, loaded: true, exports: { stripeGet: async () => ({ data: [] }), stripePost: async () => ({ id: "cs", url: "https://stripe.test/x" }) } };
  const mod = require(BILLING_PATH); delete require.cache[BILLING_PATH]; return mod;
}
const post = (origin, body) => ({ httpMethod: "POST", headers: { origin, authorization: "Bearer x" }, body: JSON.stringify(body) });
const APP = "capacitor://localhost", WEB = "https://flourishmoney.app";

(async () => {
  const t = create();
  const saved = { ...process.env };
  process.env.IAP_ENABLED = "true";
  process.env.BILLING_ENABLED = "true";
  const F = await import("../src/lib/foundingPlans.js");
  const P = await import("../src/lib/planFromProfile.js");
  const call = async (admin, origin, body) => {
    const r = await loadBilling(admin).handler(post(origin, body));
    return { statusCode: r.statusCode, body: JSON.parse(r.body) };
  };
  const ready = (st) => ({ storeBilling: true, userId: U1, askedFor: U1, status: st, planKnown: true, inApp: true, tourDone: true, shown: false });

  // ── 1. The founding rule ──────────────────────────────────────────────────────────────────────────
  {
    for (const plan of ["plus", "pro"]) {
      const admin = fakeAdmin({ profile: { plan, founder_flag: false } });
      t.eq([await cohort.mayBuyFoundingPrice(admin, U1, CONFIRMED), admin.asked], [false, []],
        `1a a complimentary "${plan}" profile, confirmed and with seats left, is never offered the founding price (the seats are not even counted)`);
    }
    for (const plan of ["trial", "free"]) {
      const admin = fakeAdmin({ profile: { plan, founder_flag: false } });
      t.eq(await cohort.mayBuyFoundingPrice(admin, U1, CONFIRMED), true, `1b a "${plan}" profile is offered it as before, while seats are left`);
    }
    t.eq(await cohort.mayBuyFoundingPrice(fakeAdmin({ profile: { plan: "plus", founder_flag: true } }), U1, CONFIRMED), true,
      "1c a beta founder keeps the founding price whatever its plan");
    t.eq(await cohort.mayBuyFoundingPrice(fakeAdmin({ profileError: true }), U1, CONFIRMED), true,
      "1d a profile that cannot be read is not complimentary: the seat rule decides, as before");
    t.eq(await cohort.mayBuyFoundingPrice(fakeAdmin({ profile: null }), U1, CONFIRMED), true, "1e no profile row: the seat rule decides");
    t.eq(await cohort.mayBuyFoundingPrice(fakeAdmin({ profile: { plan: "trial", founder_flag: false }, seats: 50 }), U1, CONFIRMED), false,
      "1f …and at 50 seats held, nobody, as before");
    t.eq([await cohort.hasComplimentaryPlan(fakeAdmin({ profile: { plan: "plus", founder_flag: false } }), U1),
          await cohort.hasComplimentaryPlan(fakeAdmin({ profile: { plan: "plus", founder_flag: true } }), U1),
          await cohort.hasComplimentaryPlan(fakeAdmin({ profile: { plan: "trial", founder_flag: false } }), U1),
          await cohort.hasComplimentaryPlan(fakeAdmin({ profileError: true }), U1)],
      [true, false, false, false], "1g complimentary means plus or pro with no founder flag, read successfully");
  }

  // ── 2. The store apps: no founding offer, so the plans never open by themselves ─────────────────────
  {
    const comp = (await call(fakeAdmin({ profile: { plan: "plus", founder_flag: false } }), APP, { action: "store_status" })).body;
    t.eq([comp.paid, comp.founding.available, comp.founding.spots_left], [false, false, null],
      "2a store_status for a complimentary account: not a paid subscription, and no founding offer");
    t.eq(F.foundingPlansAutoOpen(ready(comp)), false, "2b …so the plans screen never opens by itself for it");
    const trial = (await call(fakeAdmin({ profile: { plan: "trial", founder_flag: false } }), APP, { action: "store_status" })).body;
    t.eq([trial.paid, trial.founding.available, F.foundingPlansAutoOpen(ready(trial))], [false, true, true],
      "2c an ordinary account with seats left still gets the offer, and the plans open by themselves once");
  }

  // ── 3. The website: no founding offer, and the checkout refuses the founding price ──────────────────
  {
    const compAdmin = () => fakeAdmin({ profile: { plan: "plus", founder_flag: false } });
    const web = (await call(compAdmin(), WEB, { action: "status" })).body;
    t.eq([web.paid, web.founding.available], [false, false], "3a the website's status for a complimentary account: no founding offer");
    const trialWeb = (await call(fakeAdmin({ profile: { plan: "trial", founder_flag: false } }), WEB, { action: "status" })).body;
    t.eq(trialWeb.founding.available, true, "3b an ordinary account with seats left is still offered it on the website");
    const checkout = await call(compAdmin(), WEB, { action: "create_checkout_session", plan_key: "founding_annual" });
    t.eq([checkout.statusCode, checkout.body.error], [403, "founding_price_not_available"],
      "3c a founding checkout posted directly for a complimentary account is refused, whatever a screen showed");
  }

  // ── 4. Full access from the profile alone, and not a paid subscription ─────────────────────────────
  {
    const ent = planRules.deriveEntitlement({ plan: "plus", founder_flag: false, trial_started_at: "2026-06-01T12:00:00Z", trial_ends_at: null }, null, Date.now());
    t.eq([ent.plan, ent.unlimited, ent.paidSubscription], ["premium", true, false],
      "4a the server: a plus profile with an ended trial and no subscription is unlimited (coach, What-If, banks, the meeting), and not a paid subscription");
    const derived = P.derivePlan({ plan: "plus", founder_flag: false, trial_started_at: "2026-06-01T12:00:00Z", trial_ends_at: null });
    t.eq([derived, P.webPlan(derived, { paid: false }), P.storePlan(derived, { paid: false })], ["premium", "premium", "premium"],
      "4b the website and the store apps: premium from the profile, with no subscription behind it");
    const guard = fs.readFileSync(path.join(REPO, "supabase", "migrations", "0002_profiles_guard.sql"), "utf8");
    t.ok(/new\.plan\s+is distinct from old\.plan/.test(guard) && /'service_role'/.test(guard),
      "4c only the service role may change profiles.plan (0002's guard): nobody can give themselves this from the app");
  }

  process.env = saved;
  t.summary("complimentaryAccess.test");
  setImmediate(() => process.exit(process.exitCode || 0));
})();
