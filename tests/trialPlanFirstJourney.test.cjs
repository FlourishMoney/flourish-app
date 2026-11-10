// tests/trialPlanFirstJourney.test.cjs
// -----------------------------------------------------------------------------
// TRIAL_PLAN_FIRST, ITEM 6: A NEW ACCOUNT, END TO END, ON THE WEBSITE: activation, then the plans, then the trial.
// The real billing.js and stripe-webhook.js, against a stand-in database and a stand-in Stripe; the app's own decisions
// from src/lib/trialPlanFirst.js; the order of the app's screens from src/App.jsx.
//   J1-J9   the switch on: the first number shows (activation), then the plans come first and cannot be closed; the plan
//           says 14 days free with its date; the checkout carries the trial with a card required; Stripe's trial starts;
//           the app opens, with the first charge's date on the chip
//   J10-J15 the switch off: the same account and the same calls are exactly today's (no key, no trial, nothing forced)
// Synthetic data only.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");
const { fakeAdmin } = require("./_trialFakes.cjs");
const { signPayload } = require("../netlify/functions/_lib/stripeSignature.js");

const REPO = path.join(__dirname, "..");
const APP = fs.readFileSync(path.join(REPO, "src", "App.jsx"), "utf8");
const AUTH = require.resolve("../netlify/functions/_lib/auth.js");
const API = require.resolve("../netlify/functions/_lib/stripeApi.js");
const ALERT = require.resolve("../netlify/functions/_lib/supportAlert.js");
const BILLING = require.resolve("../netlify/functions/billing.js");
const HOOK = require.resolve("../netlify/functions/stripe-webhook.js");
const SINCE = "2026-11-13T15:00:00Z";
const NOW = Date.parse("2026-11-14T16:00:00Z");
const U = "00000000-0000-4000-8000-000000000021";

function load(modPath, admin, stripeCalls) {
  for (const k of Object.keys(require.cache)) if (k.includes("/netlify/functions/")) delete require.cache[k];
  const real = require(AUTH);
  require.cache[AUTH].exports = { ...real, getUserFromRequest: async () => ({ user_id: U, error: null }), getAdminClient: () => admin };
  require.cache[API] = { id: API, filename: API, loaded: true, exports: {
    stripeGet: async (p) => { stripeCalls.push(["GET", p]); return { data: [] }; },
    stripePost: async (p, b) => { stripeCalls.push(["POST", p, b]); return p === "/customers" ? { id: "cus_j" } : { id: "cs_j", url: "https://checkout.stripe.test/j" }; } } };
  require.cache[ALERT] = { id: ALERT, filename: ALERT, loaded: true, exports: { alertSupport: async () => true } };
  return require(modPath);
}
const call = async (admin, stripeCalls, body) => {
  const r = await load(BILLING, admin, stripeCalls).handler({ httpMethod: "POST", headers: { origin: "https://flourishmoney.app" }, body: JSON.stringify(body) });
  return { code: r.statusCode, body: JSON.parse(r.body) };
};
const hook = async (admin, id, type, object, created) => {
  const body = JSON.stringify({ id, created, type, data: { object } });
  return (await load(HOOK, admin, []).handler({ httpMethod: "POST", headers: { "stripe-signature": signPayload(body, "whsec_journey") }, body })).statusCode;
};
// Couple mode's purchase attempt (0031) is granted to a buyer with none live, as the real database does.
const rpc = (name) => ({ data: name === "purchase_attempt_begin" ? { result: "held" } : null, error: null });
const newAccount = () => ({ __users: { [U]: { email: "new.household@example.ca", email_confirmed_at: "2026-11-14T15:00:00Z", app_metadata: { email_confirmation: "link" } } },
  profiles: [{ user_id: U, plan: "trial", founder_flag: false, trial_started_at: "2026-11-14T15:00:00Z", trial_ends_at: "2026-11-28T15:00:00Z" }],
  subscriptions: [], billing_events: [], trial_reminders: [], trial_reminder_optouts: [] });

(async () => {
  const t = create();
  const saved = { ...process.env };
  const realError = console.error; console.error = () => {};
  const lib = await import(path.join(REPO, "src", "lib", "trialPlanFirst.js"));
  const W = await import(path.join(REPO, "src", "lib", "trialWords.js"));
  const vis = await import(path.join(REPO, "src", "lib", "billingVisibility.js"));
  const client = await import(path.join(REPO, "src", "lib", "planFromProfile.js"));
  const base = { BILLING_ENABLED: "true", STRIPE_WEBHOOK_SECRET: "whsec_journey", STRIPE_PRICE_MONTHLY_CAD: "price_monthly_1199", STRIPE_PRICE_ANNUAL_CAD: "price_annual_9999", STRIPE_PRICE_FOUNDING_ANNUAL_CAD: "price_founding_7999" };
  try {
    // ── the order of the screens in the app ─────────────────────────────────────────────────────────
    const at = (s) => APP.indexOf(s);
    const order = [at("if(!onboarded)return <><Onboarding"), at("if(!firstVisitDone&&appData&&!appData.demo)return <><FirstVisitScreen"), at("if(plansRequired && firstVisitDone){"), at("if(showUpgrade && billingUi.show)return <UpgradeScreen")];
    t.ok(order.every((x) => x > 0) && order.every((x, i) => i === 0 || x > order[i - 1]), "J1 the app's order: onboarding, then the first number (activation), then the plans, then everything else");
    t.ok(/onNumberShown=\{\(\)=>\{ signalActivation\("safe_view", false, user\?\.id\);/.test(APP), "J2 …and the first number is still the activation moment (safe_view)");

    // ── the switch on ───────────────────────────────────────────────────────────────────────────────
    Object.assign(process.env, base, { TRIAL_PLAN_FIRST: "true", TRIAL_PLAN_FIRST_SINCE: SINCE });
    const S = newAccount(); const admin = fakeAdmin(S, { rpc }); const stripe = [];
    let st = await call(admin, stripe, { action: "status" });
    const tpf = lib.trialPlanFirstOf(st.body);
    const profilePlan = client.derivePlan(S.profiles[0], NOW, { accountTrial: lib.accountTrialFrom(st.body) });
    t.eq([st.code, tpf && tpf.account_trial, tpf && tpf.web_trial_eligible, profilePlan], [200, false, true, "free"], "J3 a new account: no account trial; eligible for Stripe's 14 days");
    const ui = vis.billingUiState({ status: st.body, native: false, paid: st.body.paid === true });
    t.eq(lib.plansFirstStage({ tpf, paid: st.body.paid === true, profilePlan, canSell: ui.show }), "required", "J4 after the first number: the plans come first, and cannot be closed");
    const plan = vis.offeredPlans({ status: st.body }).find((p) => p.key === "monthly");
    const d = lib.trialDisclosure({ platform: "web", eligible: tpf.web_trial_eligible === true, price: plan.price, planKey: "monthly", now: NOW, words: W.trialWords });
    t.eq(d.lines.slice(0, 3), ["[WORDS: trialfirst-free-days]", "[WORDS: trialfirst-then] [price $11.99 a month]", "[WORDS: trialfirst-first-charge] [date November 28, 2026]"], "J5 Monthly says, above its button: 14 days free, then $11.99 a month, first charge November 28, 2026");
    const co = await call(admin, stripe, { action: "create_checkout_session", plan_key: "monthly", trial: d.claim });
    const session = stripe.filter((c) => c[1] === "/checkout/sessions").pop()[2];
    t.eq([co.code, session.subscription_data.trial_period_days, session.payment_method_collection], [200, 14, "always"], "J6 the checkout: 14 days free, card required up front");
    const T = Math.floor(NOW / 1000);
    await hook(admin, "evt_j1", "checkout.session.completed", { customer: "cus_j", subscription: "sub_j", mode: "subscription", payment_status: "no_payment_required", metadata: { user_id: U, plan_key: "monthly" } }, T + 60);
    await hook(admin, "evt_j2", "customer.subscription.created", { id: "sub_j", customer: "cus_j", status: "trialing", metadata: { user_id: U, plan_key: "monthly" }, trial_end: T + 14 * 86400,
      items: { data: [{ price: { id: "price_monthly_1199" }, current_period_end: T + 14 * 86400 }] } }, T + 61);
    st = await call(admin, stripe, { action: "status" });
    const after = lib.trialPlanFirstOf(st.body);
    t.eq([st.body.paid, after.trialing, after.trial_ends], [true, true, new Date((T + 14 * 86400) * 1000).toISOString()], "J7 Stripe's trial has started: the household has full access, trialing, with the trial's end");
    t.eq(lib.plansFirstStage({ tpf: after, paid: st.body.paid === true, profilePlan, canSell: true }), null, "J8 …and the app opens");
    t.eq(W.trialWords("trialfirst-chip", { date: lib.chargeDateLabel(new Date(after.trial_ends)) }), "[WORDS: trialfirst-chip] [date November 28, 2026]", "J9 …with the first charge's date on the chip");

    // ── the switch off: the same account, the same calls ────────────────────────────────────────────
    for (const k of ["TRIAL_PLAN_FIRST", "TRIAL_PLAN_FIRST_SINCE"]) delete process.env[k];
    const S2 = newAccount(); const admin2 = fakeAdmin(S2, { rpc }); const stripe2 = [];
    st = await call(admin2, stripe2, { action: "status" });
    t.eq(["trial_plan_first" in st.body, lib.trialPlanFirstOf(st.body)], [false, null], "J10 off: the status has no trial key");
    const offPlan = client.derivePlan(S2.profiles[0], NOW, { accountTrial: lib.accountTrialFrom(st.body) });
    t.eq(offPlan, "trial", "J11 …the account trial is today's: 14 days, no card");
    t.eq(lib.plansFirstStage({ tpf: null, paid: false, profilePlan: offPlan, canSell: true }), null, "J12 …nothing comes first");
    const co2 = await call(admin2, stripe2, { action: "create_checkout_session", plan_key: "monthly" });
    const s2 = stripe2.filter((c) => c[1] === "/checkout/sessions").pop()[2];
    t.eq([co2.code, "trial_period_days" in s2.subscription_data, "payment_method_collection" in s2], [200, false, false], "J13 …the checkout charges as today, no Stripe trial");
    const before = S2.subscriptions.length;
    await hook(admin2, "evt_j3", "customer.subscription.created", { id: "sub_k", customer: "cus_j", status: "trialing", metadata: { user_id: U, plan_key: "monthly" }, trial_end: T + 14 * 86400,
      items: { data: [{ price: { id: "price_monthly_1199" }, current_period_end: T + 14 * 86400 }] } }, T + 61);
    t.eq(S2.subscriptions.length, before, "J14 …customer.subscription.created is ignored, as today");
    await hook(admin2, "evt_j4", "customer.subscription.trial_will_end", { id: "sub_k", customer: "cus_j", status: "trialing", metadata: { user_id: U, plan_key: "monthly" }, trial_end: T + 14 * 86400 }, T + 11 * 86400);
    t.eq(S2.trial_reminders.length, 0, "J15 …and trial_will_end sends nothing");
  } finally {
    console.error = realError;
    process.env = saved;
  }
  t.summary("trialPlanFirstJourney.test");
})();
