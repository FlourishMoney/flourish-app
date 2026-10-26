// tests/stripeTax.test.cjs
// -----------------------------------------------------------------------------
// STRIPE TAX FROM THE FIRST SALE (billing day, round 4).
//
// Every price is quoted "plus tax" (P16), and tax is charged from October 26. billing.js asks Stripe Checkout
// to work it out (automatic tax), always collects the billing address (Canada's tax follows the province) and
// saves it to the customer, so renewals are taxed from it too. STRIPE_TAX_ENABLED is a rollback switch only:
//   1. on ("true"): automatic_tax on, billing_address_collection "required", customer_update[address] "auto",
//      for every plan, the founding price included;
//   2. off (unset, or anything but exactly "true"): automatic_tax false and nothing else, exactly as before;
//   3. read per request, like BILLING_ENABLED (a deploy still carries the value: docs/ops/BILLING-DAY-OCT-26.md);
//   4. the form Stripe receives.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");

const REPO = path.join(__dirname, "..");
const AUTH_PATH = require.resolve("../netlify/functions/_lib/auth.js");
const API_PATH = require.resolve("../netlify/functions/_lib/stripeApi.js");
const BILLING_PATH = require.resolve("../netlify/functions/billing.js");
const { formEncode } = require("../netlify/functions/_lib/stripeApi.js");

function load(sent) {
  for (const p of [BILLING_PATH, AUTH_PATH, API_PATH]) delete require.cache[p];
  const real = require("../netlify/functions/_lib/auth.js");
  const admin = {
    from: (table) => { const q = { select() { return q; }, eq() { return q; }, async upsert() { return { error: null }; },
      async maybeSingle() { return { data: table === "profiles" ? { founder_flag: true } : null, error: null }; } }; return q; },
    rpc: async () => ({ data: null, error: null }),
    auth: { admin: { getUserById: async () => ({ data: { user: { email: "household@example.test", email_confirmed_at: "2026-10-01T00:00:00Z", app_metadata: { email_confirmation: "link" } } } }) } },
  };
  require.cache[AUTH_PATH].exports = { ...real, getUserFromRequest: async () => ({ user_id: "u1", error: null }), getAdminClient: () => admin };
  require.cache[API_PATH] = { id: API_PATH, filename: API_PATH, loaded: true,
    exports: { stripeGet: async () => ({ data: [] }), stripePost: async (p, params) => { sent.push({ path: p, params }); return p === "/customers" ? { id: "cus_1" } : { id: "cs_1", url: "https://stripe.test/pay" }; } } };
  const mod = require(BILLING_PATH);
  for (const p of [BILLING_PATH, AUTH_PATH, API_PATH]) delete require.cache[p];
  return mod;
}
const checkout = async (plan_key, env) => {
  const saved = { ...process.env };
  Object.assign(process.env, { BILLING_ENABLED: "true", STRIPE_PRICE_MONTHLY_CAD: "price_m_test", STRIPE_PRICE_ANNUAL_CAD: "price_a_test", STRIPE_PRICE_FOUNDING_ANNUAL_CAD: "price_f_test" });
  for (const [k, v] of Object.entries(env)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  const sent = [];
  try {
    const res = await load(sent).handler({ httpMethod: "POST", headers: {}, body: JSON.stringify({ action: "create_checkout_session", plan_key }) });
    return { code: res.statusCode, session: (sent.find(s => s.path === "/checkout/sessions") || {}).params };
  } finally { process.env = saved; }
};

(async () => {
  const t = create();

  // ── 1. on ───────────────────────────────────────────────────────────────────────────────────────
  for (const plan of ["monthly", "annual", "founding_annual"]) {
    const { code, session } = await checkout(plan, { STRIPE_TAX_ENABLED: "true" });
    t.eq(code, 200, `1a ${plan}: checkout opens`);
    t.eq([session.automatic_tax, session.billing_address_collection, session.customer_update], [{ enabled: true }, "required", { address: "auto" }],
      `1b ${plan}: automatic tax on, the billing address always collected, and saved to the customer for renewals`);
    t.eq([session.mode, session.customer, session.line_items[0].quantity], ["subscription", "cus_1", 1], `1c ${plan}: still a subscription for this customer`);
  }

  // ── 2. off ──────────────────────────────────────────────────────────────────────────────────────
  for (const [why, v] of [["unset", undefined], ["\"TRUE\"", "TRUE"], ["\"1\"", "1"], ["\" true\"", " true"], ["\"false\"", "false"]]) {
    const { session } = await checkout("monthly", { STRIPE_TAX_ENABLED: v });
    t.eq([session.automatic_tax, "billing_address_collection" in session, "customer_update" in session], [{ enabled: false }, false, false],
      `2a STRIPE_TAX_ENABLED ${why}: automatic_tax false and nothing added, exactly as before`);
  }

  // ── 3. read per request ─────────────────────────────────────────────────────────────────────────
  {
    const saved = { ...process.env };
    Object.assign(process.env, { BILLING_ENABLED: "true", STRIPE_PRICE_MONTHLY_CAD: "price_m_test" });
    const sent = [];
    const billing = load(sent);
    const go = () => billing.handler({ httpMethod: "POST", headers: {}, body: JSON.stringify({ action: "create_checkout_session", plan_key: "monthly" }) });
    process.env.STRIPE_TAX_ENABLED = "true"; await go();
    delete process.env.STRIPE_TAX_ENABLED; await go();
    process.env = saved;
    const sessions = sent.filter(s => s.path === "/checkout/sessions").map(s => s.params.automatic_tax.enabled);
    t.eq(sessions, [true, false], "3a the same running function follows the variable on each request");
  }

  // ── 4. what Stripe receives ─────────────────────────────────────────────────────────────────────
  {
    const { session } = await checkout("monthly", { STRIPE_TAX_ENABLED: "true" });
    const form = decodeURIComponent(formEncode(session));
    for (const f of ["automatic_tax[enabled]=true", "billing_address_collection=required", "customer_update[address]=auto"]) {
      t.ok(form.split("&").includes(f), `4a the form sends ${f}`);
    }
    const src = fs.readFileSync(BILLING_PATH, "utf8");
    t.ok(/const taxEnabled = \(\) => process\.env\.STRIPE_TAX_ENABLED === "true";/.test(src) && /\.\.\.taxParams\(\),/.test(src) && !/automatic_tax: \{ enabled: false \},\s+\/\/ P16 —/.test(src),
      "4b one switch, read per request, and one place that sets the tax parameters");
  }

  t.summary("stripeTax.test");
})();
