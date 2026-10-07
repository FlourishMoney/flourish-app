// tests/billingUpgradeScreen.test.cjs
// -----------------------------------------------------------------------------
// THE UPGRADE SCREEN: WHEN IT EXISTS AT ALL, AND WHAT IT IS ALLOWED TO SAY.
//
// Billing is off. It goes live on 2026-10-26 by setting BILLING_ENABLED in Netlify, and until
// then no household should see a price, a plan or a link to one — and the iOS and Android builds
// must never see one at all, because Apple and Google require their own purchase systems for
// digital subscriptions and shipping a web checkout is a rejected build.
//
// What this pins:
//   • every billing surface is hidden while the flag is off, and the status call 404s
//   • the founding offer is shown only to a waitlist founding household (1 to 50) — decided by the SERVER
//   • the success redirect never changes anybody's plan
//   • nothing billing-related renders in a native shell
//   • the free-limit prompt keeps its ordinary message when billing is off
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");

const APP = fs.readFileSync(path.join(__dirname, "..", "src", "App.jsx"), "utf8");
const AUTH_PATH = require.resolve("../netlify/functions/_lib/auth.js");
const API_PATH = require.resolve("../netlify/functions/_lib/stripeApi.js");
const BILLING_PATH = require.resolve("../netlify/functions/billing.js");

// A fake supabase-js surface. rpc() answers the 0016 founding lookup the way the SQL does: case and
// whitespace ignored, test rows skipped, positions 1 to 50 only.
function fakeAdmin(state) {
  const api = (table) => {
    const q = {
      _f: [],
      select() { return q; },
      eq(col, val) { q._f.push(r => r[col] === val); return q; },
      not(col, op, val) { q._f.push(r => (op === "is" && val === null ? r[col] != null : true)); return q; },
      _rows() { return (state.rows[table] || []).filter(r => q._f.every(fn => fn(r))); },
      async maybeSingle() { return { data: q._rows()[0] || null, error: null }; },
      then(res) { return Promise.resolve({ data: q._rows(), error: null }).then(res); },
    };
    return q;
  };
  const norm = (e) => String(e || "").replace(/\s+/g, "").toLowerCase();
  const rpc = async (name, args) => {
    if (name !== "waitlist_founding_position_for_email") return { data: null, error: { message: "no such function" } };
    const hits = (state.rows.waitlist || []).filter(r => norm(r.email) === norm(args.p_email) && norm(args.p_email)
      && !r.is_test && Number.isInteger(r.founding_position) && r.founding_position >= 1 && r.founding_position <= 50);
    return { data: hits.length ? Math.min(...hits.map(r => r.founding_position)) : null, error: null };
  };
  const user = state.user || { email: "a@b.c", email_confirmed_at: "2026-10-01T00:00:00Z" };
  return { from: api, rpc, auth: { admin: { getUserById: async () => ({ data: { user } }) } } };
}

function loadBilling({ user_id = "u1", state, stripePost }) {
  delete require.cache[BILLING_PATH];
  delete require.cache[AUTH_PATH];
  delete require.cache[API_PATH];
  const real = require("../netlify/functions/_lib/auth.js");
  require.cache[AUTH_PATH].exports = {
    ...real,
    getUserFromRequest: async () => ({ user_id, error: null }),
    getAdminClient: () => fakeAdmin(state),
  };
  require.cache[API_PATH] = { id: API_PATH, filename: API_PATH, loaded: true,
    exports: { stripePost: stripePost || (async () => ({ id: "cs_1", url: "https://stripe.test/pay" })) } };
  const mod = require(BILLING_PATH);
  delete require.cache[BILLING_PATH];
  return mod;
}
const post = (body) => ({ httpMethod: "POST", headers: {}, body: JSON.stringify(body) });
// A waitlist of n households holding positions 1..n (and none after 50, as the 0014 trigger does).
const waitlist = (n) => Array.from({ length: n }, (_, i) => ({
  email: `h${i + 1}@example.test`, is_test: false, founding_position: i < 50 ? i + 1 : null,
}));
const confirmed = (email) => ({ email, email_confirmed_at: "2026-10-01T00:00:00Z" });

(async () => {
  const t = create();
  const vis = await import("../src/lib/billingVisibility.js");
  const cohort = require("../netlify/functions/_lib/foundingCohort.js");
  const savedFlag = process.env.BILLING_ENABLED;

  // ── 1. Hidden while the flag is off ──────────────────────────────────────────────────────────
  {
    delete process.env.BILLING_ENABLED;
    const state = { rows: { profiles: [{ user_id: "u1", founder_flag: true }] } };
    const billing = loadBilling({ state });
    const res = await billing.handler(post({ action: "status" }));
    t.eq(res.statusCode, 404, "1a the status call 404s while BILLING_ENABLED is off");
    t.eq(JSON.parse(res.body).enabled, undefined, "1b …and says nothing about billing existing");

    // Whatever the client does with a 404, the answer is the same: show nothing.
    for (const status of [null, undefined, {}, { error: "not_found" }, { enabled: false }, "404"]) {
      t.eq(vis.billingUiState({ status, native: false, paid: false }).show, false,
        `1c a status of ${JSON.stringify(status)} hides every billing surface`);
    }
    t.eq(vis.offeredPlans({ status: null }).every(p => p.key !== "founding_annual"), true,
      "1d …and the founding price is never offered without a server answer");

    process.env.BILLING_ENABLED = "true";
    const on = loadBilling({ state });
    const res2 = await on.handler(post({ action: "status" }));
    t.eq(res2.statusCode, 200, "1e turning the flag on is the ONLY step needed — the same call now answers");
    t.eq(JSON.parse(res2.body).enabled, true, "1f …with billing on");
    t.eq(vis.billingUiState({ status: JSON.parse(res2.body), native: false, paid: false }).show, true,
      "1g …and the screen becomes visible on that answer alone");
  }

  // ── 2. The founding offer belongs to waitlist positions 1 to 50 ─────────────────────────────
  {
    process.env.BILLING_ENABLED = "true";
    t.eq(cohort.FOUNDING_COHORT_LIMIT, 50, "2a the cohort is 50 households");
    t.eq(cohort.isFoundingPosition(1), true, "2b position 1 is a founding position");
    t.eq(cohort.isFoundingPosition(50), true, "2c …and so is 50");
    t.eq(cohort.isFoundingPosition(51), false, "2d …but 51 is not, and it does not reopen past the limit");
    t.eq(cohort.isFoundingPosition(null), false, "2e a position that could not be established is NOT a founding position");

    // Whatever the paid count is, only the waitlist position matters.
    const ask = async (email) => {
      const state = { rows: { waitlist: waitlist(60), subscriptions: [] }, user: confirmed(email) };
      const billing = loadBilling({ state });
      return JSON.parse((await billing.handler(post({ action: "status" }))).body);
    };
    const at50 = await ask("h50@example.test"), at51 = await ask("h51@example.test");
    t.eq(at50.founding.available, true, "2f waitlist household #50 is offered the founding price");
    t.eq(at51.founding.available, false, "2g #51 is not — the SERVER decides, from the waitlist, not the client");
    t.eq(at50.founding.cohortLimit, 50, "2h …and the limit travels with the answer, so the label cannot drift");

    t.ok(vis.offeredPlans({ status: at50 }).some(p => p.key === "founding_annual"),
      "2i the screen shows the founding plan to a founding household");
    t.ok(vis.offeredPlans({ status: at51 }).every(p => p.key !== "founding_annual"),
      "2j …and not to anyone else, who still sees the regular plans");
    t.eq(vis.offeredPlans({ status: at51 }).map(p => p.key).join(","), "monthly,annual", "2j2 …monthly and annual");
    t.eq(vis.offeredPlans({ status: at50 }).find(p => p.key === "founding_annual").note,
      "Founding price for the first 50 households. Locked in while you stay subscribed.",
      "2k the label is exactly the approved sentence, with the server's number in it");

    // And the rule is enforced where money changes hands, not only where the price is shown.
    let stripeCalls = 0;
    const state = { rows: { waitlist: waitlist(60) }, user: confirmed("h51@example.test") };
    const billing = loadBilling({ state, stripePost: async () => { stripeCalls++; return { url: "x" }; } });
    const res = await billing.handler(post({ action: "create_checkout_session", plan_key: "founding_annual" }));
    t.eq(res.statusCode, 403, "2l a client posting for the founding price without a founding position is refused");
    t.eq(stripeCalls, 0, "2m …before Stripe is asked for anything");
  }

  // ── 3. The redirect back from Stripe never sets a plan ───────────────────────────────────────
  {
    const success = vis.billingReturnNotice("?billing=success&session_id=cs_test_123");
    t.eq(success.kind, "success", "3a the success return is recognised");
    t.ok(/updates as soon as Stripe confirms/.test(success.text), "3b …and says the plan follows the confirmation");
    t.eq(Object.keys(success).sort().join(","), "kind,text",
      "3c the return carries a MESSAGE and nothing else — there is no plan in it to apply");
    t.eq(vis.billingReturnNotice("?billing=cancelled").kind, "cancelled", "3d a cancelled checkout is its own message");
    t.ok(/Nothing was charged/.test(vis.billingReturnNotice("?billing=cancelled").text), "3e …and says so plainly");
    for (const junk of ["", "?", "?billing=", "?billing=premium", "?foo=bar", null, undefined, "?billing=success&billing=evil"])
      if (junk !== "?billing=success&billing=evil")
        t.eq(vis.billingReturnNotice(junk)?.kind ?? null, junk === "?billing=cancelled" ? "cancelled" : null,
          `3f a redirect of ${JSON.stringify(junk)} grants nothing`);

    // The wiring, read from the source: the handler refreshes from the server and assigns no plan.
    const handler = APP.match(/billingReturnNotice\([\s\S]{0,1200}?\n\s{2}\},\s*\[[^\]]*\]\);/);
    t.ok(!!handler, "3g the return is handled in App.jsx");
    const body = handler ? handler[0] : "";
    t.ok(/refreshPlanFromProfile/.test(body), "3h …by re-reading the plan from the server");
    t.ok(!/setIsPremium|isPremium\s*:\s*true|plan\s*:\s*["'](premium|plus|pro)/.test(body),
      "3i …and never by setting a paid plan from the redirect itself");
  }

  // ── 4. Nothing billing-related in a native shell ─────────────────────────────────────────────
  {
    const on = { enabled: true, founding: { available: true, cohortLimit: 50 } };
    const shells = [
      ["iOS", { Capacitor: { getPlatform: () => "ios" }, location: { protocol: "capacitor:" } }],
      ["Android", { Capacitor: { getPlatform: () => "android" }, location: { protocol: "http:" } }],
      ["a shell whose bridge has not loaded", { location: { protocol: "capacitor:" } }],
      ["a file:// shell", { location: { protocol: "file:" } }],
    ];
    for (const [label, win] of shells) {
      t.eq(vis.isNativeApp(win), true, `4a ${label} is a native app`);
      t.eq(vis.billingUiState({ status: on, native: vis.isNativeApp(win), paid: false }).show, false,
        `4b …and shows no billing surface even with billing ON and a founding slot free`);
    }
    t.eq(vis.isNativeApp({ location: { protocol: "https:" } }), false, "4c the web app is not a native app");
    t.eq(vis.billingUiState({ status: on, native: false, paid: false }).mode, "plans", "4d …and does show the plans");
    t.eq(vis.billingUiState({ status: on, native: false, paid: true }).mode, "manage",
      "4e a paying household is offered the portal instead of the plans");

    // The screen itself is rendered behind the same gate in App.jsx.
    t.ok(/showUpgrade\s*&&\s*billingUi\.show/.test(APP) || /billingUi\.show\s*&&/.test(APP),
      "4f App.jsx renders the upgrade screen only when that gate says show");
  }

  // ── 5. The free-limit prompt is unchanged while billing is off ───────────────────────────────
  {
    const limits = await import("../src/lib/usageLimits.js");
    t.eq(limits.FREE_TIER_LIMITS.coachMessagesPerWeek, 2, "5a the free limit is still 2 coach messages a week");
    t.ok(/\{freeMsgsLeft\}\/\{FREE_LIMIT\}/.test(APP), "5b the prompt still shows how many are left of the limit");
    t.ok(/left this week/.test(APP), "5c …with its ordinary wording, which billing did not touch");
    t.ok(!/left this week[\s\S]{0,400}formatPrice|left this week[\s\S]{0,400}\$11\.99/.test(APP),
      "5d …and no price appears beside it");
    // No price is typed into App.jsx: every amount comes from src/lib/pricing.js.
    t.ok(!/\b(11\.99|99\.99|79\.99|7\.99|59\.99)\b/.test(APP),
      "5e no price is hard-coded in App.jsx — pricing.js is the only source");
  }

  // ── 6. Found reviewing this work: two ways a price still reached somewhere it must not ───────
  {
    // (a) Android. isCapacitorIOS() is iOS-only, so every surface gated on it — the feature
    // paywall with its price table, the dashboard's upgrade card — rendered in the ANDROID build.
    // Google requires its own billing for digital subscriptions just as Apple does.
    t.ok(/showPaywall\s*&&\s*!isNativeApp\(\)/.test(APP),
      "6a the feature paywall, which lists prices, is hidden in EVERY native shell, not just iOS");
    t.ok(/!data\.isPremium&&!isNativeApp\(\)&&onUpgrade/.test(APP),
      "6b …and so is the dashboard's upgrade card");
    t.ok(!/showPaywall\s*&&\s*!isCapacitorIOS\(\)/.test(APP),
      "6c no billing surface is gated on iOS alone any more");

    // (b) Currency. The only Stripe price ids that exist are CAD (STRIPE_PRICE_*_CAD), so a US
    // profile was shown $7.99/$59.99 and would have been charged $11.99 CAD. The screen may only
    // show a price the server can actually charge.
    const st = { enabled: true, founding: { available: true, cohortLimit: 50 } };
    const us = vis.offeredPlans({ status: st, country: "US" });
    const ca = vis.offeredPlans({ status: st, country: "CA" });
    t.eq(us.map(p => p.price).join(" "), ca.map(p => p.price).join(" "),
      "6d a US profile is shown the same prices as a CA one — the only prices that can be charged");
    t.ok(us.every(p => !/7\.99|59\.99/.test(p.price)), "6e …not the unreviewed US amounts");
    t.ok(ca.every(p => /CAD/.test(p.note) || p.key === "founding_annual" || /Save/.test(p.note)),
      "6f …and the currency is stated");
  }

  if (savedFlag === undefined) delete process.env.BILLING_ENABLED; else process.env.BILLING_ENABLED = savedFlag;
  t.summary("billingUpgradeScreen.test");
})();
