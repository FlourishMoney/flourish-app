// tests/webPaidPlan.test.cjs
// -----------------------------------------------------------------------------
// A PAYING WEB HOUSEHOLD GETS WHAT IT PAID FOR (billing day, 2026-10-26).
//
// The Stripe webhook writes public.subscriptions; the app's plan used to come from the profiles row alone,
// so a household that paid after its trial ended stayed on the free tier on the web. Now the web app takes
// the server's own answer: the billing status call's `paid` (netlify/functions/billing.js), worked out from
// Stripe's status AND the paid period (planRules.isPaidSubscription), combined with the profile's plan by
// webPlan() (src/lib/planFromProfile.js). This pins, as Amanda asked:
//   1. the client's webPlan and the server's deriveEntitlement agree, for every profile, subscription and
//      platform: the two copies cannot drift;
//   2. paid after the trial ended = paid;
//   3. cancelled at period end = paid until the period ends, then free (even if the webhook is late);
//   4. a store app = unchanged (Apple 3.1.3(b)): a Stripe subscription unlocks nothing there;
//   5. billing off = today's behaviour exactly: the status call 404s and the plan is the profile's;
//   6. the webhook stores the paid period whichever Stripe API version the endpoint uses;
//   7. the App wiring.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");
const { signPayload } = require("../netlify/functions/_lib/stripeSignature.js");

const REPO = path.join(__dirname, "..");
const AUTH_PATH = require.resolve("../netlify/functions/_lib/auth.js");
const API_PATH = require.resolve("../netlify/functions/_lib/stripeApi.js");
const BILLING_PATH = require.resolve("../netlify/functions/billing.js");
const HOOK_PATH = require.resolve("../netlify/functions/stripe-webhook.js");
const APP = fs.readFileSync(path.join(REPO, "src", "App.jsx"), "utf8");

const DAY = 86400000;
const iso = (ms) => new Date(ms).toISOString();

// A fake supabase-js surface, recording every write (the billingFunctions.test pattern).
function fakeAdmin(state) {
  const api = (table) => {
    const q = {
      _filters: {},
      select() { return q; },
      eq(col, val) { q._filters[col] = val; return q; },
      async maybeSingle() {
        const hit = (state.rows[table] || []).find(r => Object.entries(q._filters).every(([k, v]) => r[k] === v));
        return { data: hit || null, error: null };
      },
      insert(row) {
        const rows = state.rows[table] = state.rows[table] || [];
        const dup = rows.some(r => r.event_id === row.event_id);
        if (!dup) rows.push({ ...row });
        return { select: async () => ({ data: dup ? [] : [{ ...row }], error: null }) };
      },
      async upsert(row) {
        const rows = state.rows[table] = state.rows[table] || [];
        state.writes.push({ table, op: "upsert", row });
        const i = rows.findIndex(r => r.user_id === row.user_id);
        if (i >= 0) rows[i] = { ...rows[i], ...row }; else rows.push({ ...row });
        return { error: null };
      },
      update(patch) {
        return { eq: async (col, val) => {
          const rows = state.rows[table] = state.rows[table] || [];
          state.writes.push({ table, op: "update", patch });
          rows.forEach(r => { if (r[col] === val) Object.assign(r, patch); });
          return { error: null };
        } };
      },
    };
    return q;
  };
  return { from: api, rpc: async () => ({ data: null, error: null }),
    auth: { admin: { getUserById: async () => ({ data: { user: { email: "a@example.test", email_confirmed_at: "2026-10-01T00:00:00Z" } } }) } } };
}

function loadWithStubs(modPath, { user_id = "u1", state }) {
  delete require.cache[modPath];
  delete require.cache[AUTH_PATH];
  delete require.cache[API_PATH];
  const real = require("../netlify/functions/_lib/auth.js");
  require.cache[AUTH_PATH].exports = { ...real, getUserFromRequest: async () => ({ user_id, error: null }), getAdminClient: () => fakeAdmin(state) };
  require.cache[API_PATH] = { id: API_PATH, filename: API_PATH, loaded: true, exports: { stripePost: async () => ({ id: "cs_1", url: "https://stripe.test/x" }) } };
  const mod = require(modPath);
  delete require.cache[modPath];
  return mod;
}
const post = (body, headers = {}) => ({ httpMethod: "POST", headers, body: typeof body === "string" ? body : JSON.stringify(body) });

(async () => {
  const t = create();
  const savedEnv = { ...process.env };
  const client = await import("../src/lib/planFromProfile.js");
  const server = require("../netlify/functions/_lib/planRules.js");
  const vis = await import("../src/lib/billingVisibility.js");

  // ── 1. the two copies agree ─────────────────────────────────────────────────────────────────────
  {
    const NOW = Date.parse("2026-11-15T12:00:00Z");
    const at = (d) => iso(NOW + d * DAY);
    const profiles = [];
    for (const plan of [null, "free", "trial", "plus", "pro"])
      for (const founder_flag of [true, false])
        for (const trial_started_at of [null, at(-30), at(-5)])
          for (const trial_ends_at of [null, at(-1), at(30)])
            profiles.push({ plan, founder_flag, trial_started_at, trial_ends_at });
    const subs = [null,
      { status: "active", current_period_end: at(300) }, { status: "trialing", current_period_end: at(10) },
      { status: "active", current_period_end: at(-1) }, { status: "active", current_period_end: null },
      { status: "active", cancel_at_period_end: true, current_period_end: at(5) },
      { status: "active", cancel_at_period_end: true, current_period_end: at(-1) },
      { status: "canceled", current_period_end: at(30) }, { status: "past_due", current_period_end: at(30) },
      { status: "unpaid", current_period_end: at(30) }, { status: "incomplete", current_period_end: null }];
    const disagree = [];
    // One answer for every app (2026-10-20): a stray store-app flag from older code must change nothing on
    // either side, so it is passed to both and the two must still agree with the flag-free answer.
    for (const p of profiles) for (const s of subs) for (const native of [false, true]) {
      const c = client.webPlan(client.derivePlan(p, NOW), { paid: server.isPaidSubscription(s, NOW), native });
      const v = server.deriveEntitlement(p, s, NOW, { native }).plan;
      const plain = server.deriveEntitlement(p, s, NOW).plan;
      if (c !== v || v !== plain) disagree.push(`${JSON.stringify(p)} ${JSON.stringify(s)} native=${native}: client=${c} server=${v} plain=${plain}`);
    }
    t.eq(disagree.slice(0, 2).join(" | ") || "(none)", "(none)",
      `1a webPlan and deriveEntitlement answer alike for ${profiles.length} profiles x ${subs.length} subscriptions, and a store-app flag changes neither`);
    t.eq([client.webPlan(undefined), client.webPlan("nonsense", { paid: true, native: true }), client.webPlan("beta_founder", { paid: false })],
      ["free", "premium", "beta_founder"], "1b an unknown plan is free (paid: premium, store app or not); a founder stays a founder");
  }

  // The server's status answer for one subscriptions row, through the real billing.js.
  const statusFor = async (row, headers = {}) => {
    process.env.BILLING_ENABLED = "true";
    const state = { rows: { subscriptions: row ? [{ user_id: "u1", provider_customer_id: "cus_1", ...row }] : [], profiles: [{ user_id: "u1", founder_flag: false }] }, writes: [] };
    const res = await loadWithStubs(BILLING_PATH, { state }).handler(post({ action: "status" }, headers));
    return { code: res.statusCode, body: JSON.parse(res.body) };
  };
  // What the web app does with it: the App's effect, as a function (section 7 pins the App to it).
  const webPaid = (status) => vis.billingIsOn(status) && status.paid === true;
  const ENDED_TRIAL = { plan: "trial", trial_started_at: iso(Date.now() - 40 * DAY), trial_ends_at: iso(Date.now() - 26 * DAY), founder_flag: false };
  const profilePlan = client.derivePlan(ENDED_TRIAL);
  t.eq(profilePlan, "free", "(the household's trial ended: its profile alone says free)");

  // ── 2. paid after the trial ended = paid ─────────────────────────────────────────────────────────
  {
    const s = await statusFor({ status: "active", current_period_end: iso(Date.now() + 30 * DAY) });
    t.eq([s.code, s.body.paid], [200, true], "2a the server says paid: active, inside its paid period");
    t.eq(client.webPlan(profilePlan, { paid: webPaid(s.body), native: false }), "premium", "2b the web app gives that household the paid tier");
    const tr = await statusFor({ status: "trialing", current_period_end: iso(Date.now() + 5 * DAY) });
    t.eq(client.webPlan(profilePlan, { paid: webPaid(tr.body) }), "premium", "2c …and for Stripe's own trialing status");
    t.eq(vis.billingUiState({ status: s.body, native: false, paid: s.body.paid }).mode, "manage", "2d the checkout screen offers the portal, not the plans");
  }

  // ── 3. cancelled at period end = paid until the period ends, then free ──────────────────────────
  {
    const before = await statusFor({ status: "active", cancel_at_period_end: true, current_period_end: iso(Date.now() + 3 * DAY) });
    t.eq(client.webPlan(profilePlan, { paid: webPaid(before.body) }), "premium", "3a cancelled at period end: still paid until the period ends");
    const after = await statusFor({ status: "active", cancel_at_period_end: true, current_period_end: iso(Date.now() - 60000) });
    t.eq([after.body.paid, client.webPlan(profilePlan, { paid: webPaid(after.body) })], [false, "free"],
      "3b the period is over: free, even if Stripe's 'deleted' event has not reached us yet");
    const deleted = await statusFor({ status: "canceled", current_period_end: iso(Date.now() + 3 * DAY) });
    t.eq([deleted.body.paid, client.webPlan(profilePlan, { paid: webPaid(deleted.body) })], [false, "free"], "3c Stripe says canceled: free");
    for (const status of ["past_due", "unpaid", "incomplete", "incomplete_expired", "paused"]) {
      const r = await statusFor({ status, current_period_end: iso(Date.now() + 3 * DAY) });
      t.eq(r.body.paid, false, `3d ${status} is not paid (planRules.SUBSCRIPTION_PAID_STATUSES)`);
    }
    t.eq((await statusFor(null)).body.paid, false, "3e no subscription row: not paid");
  }

  // ── 4. a store app = the web's answer (2026-10-20) ───────────────────────────────────────────────
  {
    for (const [p, want] of [["free", "premium"], ["trial", "trial"], ["beta_founder", "beta_founder"], ["premium", "premium"]]) {
      t.eq(client.webPlan(p, { paid: true, native: true }), want, `4a a store app with a paid web subscription gets the web's plan (${p} -> ${want})`);
    }
    t.eq(client.webPlan("free", { paid: false, native: true }), "free", "4a2 …and a store app with no payment stays on the free plan");
    // What a store app is TOLD: whether the household pays, and nothing a store app could sell with.
    for (const origin of ["capacitor://localhost", "https://localhost"]) {
      for (const [row, paid] of [[{ status: "active", current_period_end: iso(Date.now() + 30 * DAY) }, true], [null, false], [{ status: "canceled", current_period_end: iso(Date.now() - DAY) }, false]]) {
        const r = await statusFor(row, { origin });
        t.eq([r.code, Object.keys(r.body).sort().join(","), r.body.paid], [200, "enabled,paid", paid],
          `4a3 ${origin}: the status answer is enabled and paid (${paid}) only: no founding offer, no portal, no confirmation link`);
      }
    }
    const webStatus = await statusFor({ status: "active", current_period_end: iso(Date.now() + 30 * DAY) }, { origin: "https://flourishmoney.app" });
    t.ok("founding" in webStatus.body && "manageable" in webStatus.body, "4a4 (not vacuous: the web's answer still carries the founding offer and the portal)");
    t.ok(/webPaidRef\.current = !nativeApp && /.test(APP), "4b the App never counts a payment in a store app");
    t.ok(/if\(nativeApp \|\| !user\?\.id\)\{ setBillingStatus\(null\); return; \}/.test(APP), "4c …and a store app never even asks for the billing status");
  }

  // ── 5. billing off = today's behaviour exactly ───────────────────────────────────────────────────
  {
    delete process.env.BILLING_ENABLED;
    const state = { rows: { subscriptions: [{ user_id: "u1", status: "active", current_period_end: iso(Date.now() + 30 * DAY) }] }, writes: [] };
    const res = await loadWithStubs(BILLING_PATH, { state }).handler(post({ action: "status" }));
    t.eq(res.statusCode, 404, "5a billing off: the status call is a 404, as today");
    const status = null;            // what the App keeps on a 404 (it never sets billingStatus)
    const same = ["free", "trial", "beta_founder", "premium"].every(p => client.webPlan(p, { paid: webPaid(status), native: false }) === p);
    t.ok(same, "5b …so every plan is exactly the profile's: free stays free, and nothing is lifted");
    for (const odd of [{ enabled: false, paid: true }, { paid: true }, { enabled: "true", paid: true }, { enabled: true, paid: "true" }]) {
      t.eq(client.webPlan("free", { paid: webPaid(odd) }), "free", `5c a status that is not a clear 'billing on, paid' lifts nothing (${JSON.stringify(odd)})`);
    }
    t.ok(/const webPaidRef = useRef\(false\);/.test(APP), "5d before any answer the App assumes not paid");
    t.ok(/billingIsOn\(billingStatus\) && billingStatus\.paid === true/.test(APP), "5e the App counts `paid` only with billing on");
  }

  // ── 6. the webhook stores the paid period on either API version ──────────────────────────────────
  {
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_gate_test";
    const end = Math.floor(Date.parse("2027-10-27T10:00:00Z") / 1000);
    const run = async (sub) => {
      const state = { rows: {}, writes: [] };
      const body = JSON.stringify({ id: `evt_${Math.random()}`, created: Math.floor(Date.now() / 1000), type: "customer.subscription.updated",
        data: { object: { id: "sub_1", customer: "cus_1", status: "active", metadata: { user_id: "u1", plan_key: "annual" }, ...sub } } });
      await loadWithStubs(HOOK_PATH, { state }).handler(post(body, { "stripe-signature": signPayload(body, "whsec_gate_test") }));
      return (state.rows.subscriptions || [])[0] || {};
    };
    t.eq((await run({ current_period_end: end, items: { data: [{ price: { id: "p" } }] } })).current_period_end, "2027-10-27T10:00:00.000Z",
      "6a an older API version (period on the subscription): stored");
    t.eq((await run({ items: { data: [{ price: { id: "p" }, current_period_end: end }] } })).current_period_end, "2027-10-27T10:00:00.000Z",
      "6b API 2025-03-31 and later (period on the item): stored too");
    t.eq((await run({ items: { data: [{ price: { id: "p" } }] } })).current_period_end, null, "6c neither: null, and access follows the status alone, as before");
  }

  // ── 7. the App wiring ────────────────────────────────────────────────────────────────────────────
  {
    t.ok(/import \{ derivePlan, webPlan \} from "\.\/lib\/planFromProfile\.js";/.test(APP), "7a the App uses the one shared rule");
    const refresh = APP.slice(APP.indexOf("const refreshPlanFromProfile"), APP.indexOf("const refreshPlanFromProfile") + 1500);
    t.ok(/\.from\("profiles"\)/.test(refresh) && !/from\("subscriptions"\)/.test(refresh), "7b the profile is still read from profiles; the app never reads a subscription row");
    t.ok(/setIsPremium\(cp === "premium" \|\| cp === "beta_founder" \|\| cp === "trial"\);\s*\n(\s*\/\/[^\n]*\n)*\s*setProfilePlan\(cp\);/.test(refresh),
      "7c a profile refresh sets the profile's plan exactly as before, then records it for the effect");
    t.ok(/\},\[billingStatus, billingAskedFor, user\?\.id, profilePlan, nativeApp\]\);/.test(APP),
      "7c2 the effect re-runs on a new profile plan and on a new status, so a refresh never leaves a paid household on free");
    t.ok(/billingAskedFor===user\.id && billingIsOn\(billingStatus\)/.test(APP), "7d only this account's own status counts (not a previous account's)");
    t.ok(/const plan = webPlan\(profilePlan, \{ paid: webPaidRef\.current, native: nativeApp \}\);\s*setPlan\(plan\);\s*setIsPremium\(plan === "premium" \|\| plan === "beta_founder" \|\| plan === "trial"\);/.test(APP),
      "7e when the status arrives, the plan and the paid features follow it");
    t.ok(/setIsPremium\(false\); setProfilePlan\(null\);/.test(APP), "7f signing out forgets the profile's plan");
    const hook = fs.readFileSync(HOOK_PATH, "utf8");
    t.ok(!/from\("profiles"\)/.test(hook), "7g the webhook still never writes the profiles row");
  }

  process.env = savedEnv;
  t.summary("webPaidPlan.test");
})();
