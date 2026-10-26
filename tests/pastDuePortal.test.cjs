// tests/pastDuePortal.test.cjs
// -----------------------------------------------------------------------------
// A WEB RENEWAL THAT FAILED GETS THE BILLING PORTAL, AND CHECKOUT SAYS WHY IT REFUSES (audit 2026-10-26, H4).
//
// A web payer whose renewal failed (Stripe past_due) was shown the plans; checkout then answered 409 (it would
// charge twice once the card worked), and the screen said "Couldn't reach checkout. Try again." Now:
//   1  the web billing status says web_attention for a live, unpaid Stripe subscription (past_due, unpaid…)
//   2  that household gets manage mode: the billing portal, never the plans; it is not called "on Flourish Plus"
//   3  checkout's refusals keep their reason: 409 already_subscribed reads "This account already has a subscription."
// -----------------------------------------------------------------------------
"use strict";
require("./_blobsStub.cjs").install();
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");
const { loadApp, textOf, describe, REPO } = require("./_renderApp.cjs");

const AUTH_PATH = require.resolve("../netlify/functions/_lib/auth.js");
const BILLING_PATH = require.resolve("../netlify/functions/billing.js");
const API_PATH = require.resolve("../netlify/functions/_lib/stripeApi.js");

function statusFor(row) {
  for (const p of [AUTH_PATH, BILLING_PATH, API_PATH]) delete require.cache[p];
  const real = require(AUTH_PATH);
  const admin = {
    from: () => { const q = { select() { return q; }, eq() { return q; }, not() { return q; }, async maybeSingle() { return { data: row, error: null }; }, then(r) { return Promise.resolve({ data: row ? [row] : [], error: null }).then(r); } }; return q; },
    rpc: async () => ({ data: null, error: null }),
    auth: { admin: { getUserById: async () => ({ data: { user: { email: "a@b.invalid", email_confirmed_at: "2026-10-01T00:00:00Z" } } }) } },
  };
  require.cache[AUTH_PATH].exports = { ...real, getUserFromRequest: async () => ({ user_id: "u1", error: null }), getAdminClient: () => admin };
  require.cache[API_PATH] = { id: API_PATH, filename: API_PATH, loaded: true, exports: { stripeGet: async () => ({ data: [] }), stripePost: async () => ({ id: "x", url: "https://stripe.test/x" }) } };
  const mod = require(BILLING_PATH);
  return mod.handler({ httpMethod: "POST", headers: { origin: "https://flourishmoney.app" }, body: JSON.stringify({ action: "status" }) })
    .then((r) => JSON.parse(r.body));
}

(async () => {
  const t = create();
  const saved = { ...process.env };
  process.env.BILLING_ENABLED = "true";
  const quiet = console.error; console.error = () => {};
  const LATER = "2099-01-01T00:00:00Z", EARLIER = "2020-01-01T00:00:00Z";
  const V = await import("../src/lib/billingVisibility.js");
  try {
    // ── 1. The status ─────────────────────────────────────────────────────────────────────────────
    const pastDue = await statusFor({ provider: "stripe", status: "past_due", provider_customer_id: "cus_1", current_period_end: EARLIER });
    t.eq([pastDue.paid, pastDue.web_attention, pastDue.manageable], [false, true, true], "1a past_due: not paid, web_attention, and a portal to go to");
    const active = await statusFor({ provider: "stripe", status: "active", provider_customer_id: "cus_1", current_period_end: LATER });
    t.eq([active.paid, active.web_attention], [true, false], "1b paid: no attention needed");
    const incomplete = await statusFor({ provider: "stripe", status: "incomplete", provider_customer_id: "cus_1", current_period_end: null });
    t.eq([incomplete.paid, incomplete.web_attention], [false, false], "1b2 a first payment that never went through (incomplete): not the portal");
    const ended = await statusFor({ provider: "stripe", status: "canceled", provider_customer_id: "cus_1", current_period_end: EARLIER });
    t.eq([ended.paid, ended.web_attention], [false, false], "1c ended: the plans again (it can subscribe anew)");
    const none = await statusFor(null);
    t.eq([none.paid, none.web_attention], [false, false], "1d no subscription: the plans");

    // ── 2. The screen ─────────────────────────────────────────────────────────────────────────────
    t.eq(V.billingUiState({ status: pastDue, native: false, paid: false }).mode, "manage", "2a past_due: manage mode (the billing portal), not the plans");
    t.eq([V.billingUiState({ status: ended, native: false, paid: false }).mode, V.billingUiState({ status: active, native: false, paid: true }).mode], ["plans", "manage"], "2b ended: plans; paid: manage, as before");
    let A = {};
    try { A = loadApp(["UpgradeScreen"]); } catch (e) { t.ok(false, `App.jsx bundles: ${describe(e)}`); }
    if (A.UpgradeScreen) {
      const screen = (status) => textOf(A.render(A.h(A.UpgradeScreen, { status, mode: V.billingUiState({ status, native: false, paid: status.paid }).mode, onClose: () => {} })));
      const pd = screen(pastDue), paid = screen(active);
      t.ok(/Change your card or cancel in Stripe's billing portal\./.test(pd) && /Manage subscription/.test(pd) && !/\$\d/.test(pd), "2c past_due: the portal line and button, and no price");
      t.ok(!/You're on Flourish Plus/.test(pd) && /You're on Flourish Plus/.test(paid), "2d …and it is not told it is on Flourish Plus (a paying household still is)");
    }

    // ── 3. Checkout's refusal keeps its reason ────────────────────────────────────────────────────
    t.eq(V.checkoutErrorText({ status: 409, error: "already_subscribed" }), "This account already has a subscription.", "3a 409 already_subscribed has its own words");
    const app = fs.readFileSync(path.join(REPO, "src", "App.jsx"), "utf8");
    const go = app.slice(app.indexOf("const go = async (planKey) => {"), app.indexOf("const go = async (planKey) => {") + 1600);
    t.ok(/if\(!res\.ok \|\| !body\.url\)\{ setError\(checkoutErrorText\(\{ status: res\.status, error: body\.error\|\|"unavailable" \}\)\); setBusy\(null\); return; \}/.test(go),
      "3b the checkout screen passes the status and the server's reason, so a 409 is not \"Couldn't reach checkout\"");
  } finally {
    console.error = quiet;
    for (const p of [AUTH_PATH, BILLING_PATH, API_PATH]) delete require.cache[p];
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  }
  t.summary("pastDuePortal");
})();
