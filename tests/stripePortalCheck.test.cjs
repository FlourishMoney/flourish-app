// tests/stripePortalCheck.test.cjs
// -----------------------------------------------------------------------------
// THE STRIPE PORTAL PRE-CHECK (billing day, round 3; runbook section 3 step 1, before D1).
//
// Stripe's customer portal can let a subscriber switch price ("Switch plan"). If it lists the founding price,
// anyone can move onto $79.99 a year there, past the founding rules our checkout enforces.
// scripts/stripe-portal-check.cjs reads the live default portal configuration and says OK or NOT OK.
// Pinned here, offline, with Stripe's answers as fixtures:
//   1. the verdict: off = OK; on without price changes = OK; on with only regular prices = OK; the founding
//      price offered = NOT OK; unreadable, missing or test-mode = NOT OK (it fails closed);
//   2. the script only reads: GET requests only, the key only in the Authorization header, never printed;
//   3. it asks for the price list Stripe leaves out unless asked (expand), and the default configuration;
//   4. the runbook names the screen and the setting, and runs it before D1 with the key typed hidden.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");

const REPO = path.join(__dirname, "..");
const SCRIPT = path.join(REPO, "scripts", "stripe-portal-check.cjs");
const P = require(SCRIPT);

const price = (id, unit_amount, interval) => ({ id, object: "price", unit_amount, currency: "cad", recurring: { interval } });
const PRICES = { p_m: price("p_m", 1199, "month"), p_a: price("p_a", 9999, "year"), p_f: price("p_f", 7999, "year") };
const config = (su, over = {}) => ({ object: "billing_portal.configuration", is_default: true, livemode: true, features: { subscription_update: su }, ...over });

(async () => {
  const t = create();

  // ── 1. the verdict ──────────────────────────────────────────────────────────────────────────────
  {
    const v = (c, prices = PRICES) => P.portalVerdict(c, prices);
    t.eq(v(config({ enabled: false, default_allowed_updates: [] })).ok, true, "1a Switch plan off: OK");
    t.eq(v(config({ enabled: true, default_allowed_updates: ["quantity"], products: [{ product: "prod", prices: ["p_f"] }] })).ok, true,
      "1b Switch plan on but it cannot change the price: OK");
    const regular = v(config({ enabled: true, default_allowed_updates: ["price"], products: [{ product: "prod", prices: ["p_m", "p_a"] }] }));
    t.ok(regular.ok && regular.lines.some(l => l.includes("11.99 CAD a month")) && regular.lines.some(l => l.includes("99.99 CAD a year")),
      "1c on, offering only monthly and annual: OK, and it lists them");
    const bad = v(config({ enabled: true, default_allowed_updates: ["price"], products: [{ product: "prod", prices: ["p_m", "p_a", "p_f"] }] }));
    t.ok(!bad.ok && bad.lines[0].startsWith("NOT OK") && bad.lines.some(l => /79\.99 CAD a year\s+<- the founding price/.test(l)),
      "1d on, offering the founding price: NOT OK, and it points at it");
    t.eq(v(config({ enabled: true, default_allowed_updates: ["price"] })).ok, false, "1e on, but the price list was not returned: NOT OK (fails closed)");
    t.eq(v(config({ enabled: true, default_allowed_updates: ["price"], products: [{ product: "prod", prices: ["p_unknown"] }] })).ok, false,
      "1f on, with a price it could not read: NOT OK");
    t.eq(v(config({ enabled: false }, { livemode: false })).lines[0].includes("TEST-mode"), true, "1g a test-mode key: NOT OK, said plainly");
    t.eq(v(null).ok, false, "1h no default configuration: NOT OK");
    t.eq([P.isFounding(price("x", 7999, "month")), P.isFounding({ ...PRICES.p_f, currency: "usd" }), P.isFounding(PRICES.p_f)], [false, false, true],
      "1i the founding price is exactly 79.99 CAD a year");
    t.eq(P.defaultConfig({ data: [{ is_default: false, id: "a" }, { is_default: true, id: "b" }] }).id, "b", "1j the default configuration is the one checked");
  }

  // ── 2. it only reads, and never shows the key ──────────────────────────────────────────────────
  const src = fs.readFileSync(SCRIPT, "utf8");
  {
    t.ok(/method: "GET"/.test(src) && !/method: "(POST|DELETE|PUT|PATCH)"/.test(src) && !/stripePost|stripeDelete/.test(src), "2a GET requests only");
    t.ok(/Authorization: `Bearer \$\{key\}`/.test(src) && (src.match(/\$\{key\}/g) || []).length === 1, "2b the key appears only in the Authorization header");
    t.ok(!/console\.(log|error|warn)\([^)]*(\$\{key\}|[(,]\s*key\b)/.test(src) && !/console\.(log|error|warn)\([^)]*process\.env/.test(src),
      "2c it never prints the key (the variable, interpolated or passed, or the environment)");
    // Run for real with no key: it says what to do and exits 1 (it returns before any request is made).
    const { execFileSync } = require("child_process");
    let out = "", code = 0;
    try { out = execFileSync(process.execPath, [SCRIPT], { env: { PATH: process.env.PATH }, encoding: "utf8" }); }
    catch (e) { out = String(e.stdout || ""); code = e.status; }
    t.eq([code, out.startsWith("NOT OK: no key.")], [1, true], "2d with no key: NOT OK, exit 1");
    t.ok(src.indexOf('if (!key) {') < src.indexOf("await get("), "2e …and the key check comes before any request");
  }

  // ── 3. it asks for the right thing ─────────────────────────────────────────────────────────────
  t.ok(src.includes("/billing_portal/configurations?is_default=true&expand[]=data.features.subscription_update.products"),
    "3a the default configuration, with the price list Stripe returns only when asked (expand)");
  t.ok(src.includes("/prices/${encodeURIComponent(id)}"), "3b each listed price is read to see its amount");

  // ── 4. the runbook ──────────────────────────────────────────────────────────────────────────────
  {
    const doc = fs.readFileSync(path.join(REPO, "docs", "ops", "BILLING-DAY-OCT-26.md"), "utf8");
    const sec3 = doc.slice(doc.indexOf("## 3. Turn billing on"), doc.indexOf("## 4. The first smoke purchase"));
    t.ok(/\*\*Settings\*\* → \*\*Billing\*\* →\s+\*\*Customer portal\*\*/.test(sec3) && /dashboard\.stripe\.com\/settings\/billing\/portal/.test(sec3),
      "4a it names the screen: live mode, Settings, Billing, Customer portal");
    t.ok(/\*\*Switch plan\*\*/.test(sec3) && /Founding Annual/.test(sec3), "4b …and the setting: Switch plan, without the Founding Annual price");
    t.ok(/read -rs "STRIPE_READ_KEY\?/.test(sec3) && /unset STRIPE_READ_KEY/.test(sec3) && /node scripts\/stripe-portal-check\.cjs/.test(sec3),
      "4c the read-only check, with the key typed hidden and dropped after");
    t.ok(sec3.indexOf("stripe-portal-check") < sec3.indexOf("add `BILLING_ENABLED`"), "4d it comes before billing is switched on (D1)");
    t.ok(!/sk_live_[A-Za-z0-9]|rk_live_[A-Za-z0-9]/.test(doc), "4e no key in the runbook");
  }

  t.summary("stripePortalCheck.test");
})();
