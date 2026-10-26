// tests/stripeTaxCheck.test.cjs
// -----------------------------------------------------------------------------
// THE STRIPE TAX PRE-CHECK AND THE MONDAY STEPS FOR TAX (billing day, round 4).
//
// scripts/stripe-tax-check.cjs reads, in live mode, the Tax settings, the active tax registrations and the
// live CAD prices, and says OK only when Stripe Tax can charge GST/HST from the first sale on our prices.
// Pinned here, offline, with Stripe-shaped fixtures:
//   1. the verdict: complete settings + an active standard GST/HST registration + every plan's price
//      tax-exclusive = OK; anything missing, a test-mode key, a simplified-only registration, an
//      INCLUSIVE price (which Stripe will not change) or an unspecified price without an exclusive default =
//      NOT OK, each saying what to do;
//   2. it only reads, and never prints the key;
//   3. the runbook: the pre-check before D1, STRIPE_TAX_ENABLED set with BILLING_ENABLED in the one D1
//      deploy, the smoke purchase's receipt shows tax, and the rollback switch.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");

const REPO = path.join(__dirname, "..");
const SCRIPT = path.join(REPO, "scripts", "stripe-tax-check.cjs");
const T = require(SCRIPT);

const settings = (over = {}) => ({ object: "tax.settings", livemode: true, status: "active", defaults: { tax_behavior: "exclusive", tax_code: "txcd_10000000" }, ...over });
const reg = (type, extra = {}) => ({ object: "tax.registration", country: "CA", status: "active", country_options: { ca: { type, ...extra } } });
const price = (id, unit_amount, interval, tax_behavior = "exclusive") => ({ id, object: "price", active: true, currency: "cad", type: "recurring", unit_amount, recurring: { interval }, tax_behavior });
const PRICES = [price("price_m", 1199, "month"), price("price_a", 9999, "year"), price("price_f", 7999, "year")];
const list = (data) => ({ object: "list", data });

(() => {
  const t = create();
  const v = (a) => T.taxVerdict({ settings: settings(), registrations: list([reg("standard")]), prices: list(PRICES), ...a });

  // ── 1. the verdict ──────────────────────────────────────────────────────────────────────────────
  {
    const good = v({});
    t.ok(good.ok && good.lines.every(l => l.startsWith("OK") || l.startsWith("  ")), "1a complete settings, a standard GST/HST registration, every price exclusive: OK");
    t.eq(good.lines.filter(l => /tax-exclusive/.test(l)).length, 3, "1b …and it names each of the three prices");
    const withQst = v({ registrations: list([reg("standard"), reg("province_standard", { province_standard: { province: "QC" } })]) });
    t.ok(withQst.ok && withQst.lines.some(l => /provincial registration, QC/.test(l)), "1c a provincial registration is listed for information");
    for (const [why, a, rx] of [
      ["a test-mode key", { settings: settings({ livemode: false }) }, /TEST-mode/],
      ["incomplete Tax settings", { settings: settings({ status: "pending" }) }, /Tax settings are not complete/],
      ["no GST/HST registration", { registrations: list([]) }, /no active GST\/HST registration for Canada/],
      ["only a simplified registration", { registrations: list([reg("simplified")]) }, /only a SIMPLIFIED GST\/HST registration/],
      ["an expired registration", { registrations: list([{ ...reg("standard"), status: "expired" }]) }, /no active GST\/HST registration/],
      ["no founding price", { prices: list(PRICES.slice(0, 2)) }, /no active live CAD price for Founding Annual/],
      ["an inclusive price", { prices: list([PRICES[0], price("price_a_incl", 9999, "year", "inclusive"), PRICES[2]]) }, /tax-INCLUSIVE, and Stripe does not let that change.*STRIPE_PRICE_ANNUAL_CAD/],
      ["an unspecified price with no exclusive default", { settings: settings({ defaults: { tax_behavior: "inclusive" } }), prices: list([price("price_m", 1199, "month", "unspecified"), PRICES[1], PRICES[2]]) }, /has no tax behavior.*Stripe allows that once/],
      ["unreadable answers", { settings: null }, /could not be read/],
    ]) {
      const r = v(a);
      t.ok(!r.ok && r.lines.some(l => rx.test(l)), `1d ${why}: NOT OK, and it says what to do`);
    }
    const viaDefault = v({ prices: list([price("price_m", 1199, "month", "unspecified"), PRICES[1], PRICES[2]]) });
    t.ok(viaDefault.ok && viaDefault.lines.some(l => /through the Tax settings default/.test(l)), "1e an unspecified price with an exclusive default: OK, and it says why");
    t.eq(T.PLANS.map(p => [p.amount, p.interval, p.env]), [[1199, "month", "STRIPE_PRICE_MONTHLY_CAD"], [9999, "year", "STRIPE_PRICE_ANNUAL_CAD"], [7999, "year", "STRIPE_PRICE_FOUNDING_ANNUAL_CAD"]],
      "1f the three prices it checks, and the variable each one belongs in");
  }

  // ── 2. it only reads ────────────────────────────────────────────────────────────────────────────
  const src = fs.readFileSync(SCRIPT, "utf8");
  {
    t.ok(/method: "GET"/.test(src) && !/method: "(POST|DELETE|PUT|PATCH)"/.test(src), "2a GET requests only");
    t.ok(/Authorization: `Bearer \$\{key\}`/.test(src) && (src.match(/\$\{key\}/g) || []).length === 1, "2b the key appears only in the Authorization header");
    t.ok(!/console\.(log|error|warn)\([^)]*(\$\{key\}|[(,]\s*key\b)/.test(src) && !/console\.(log|error|warn)\([^)]*process\.env/.test(src), "2c it never prints the key");
    for (const p of ["/tax/settings", "/tax/registrations?status=active&limit=100", "/prices?active=true&currency=cad&type=recurring&limit=100"]) {
      t.ok(src.includes(`"${p}"`), `2d it reads ${p}`);
    }
    const { execFileSync } = require("child_process");
    let out = "", code = 0;
    try { out = execFileSync(process.execPath, [SCRIPT], { env: { PATH: process.env.PATH }, encoding: "utf8" }); }
    catch (e) { out = String(e.stdout || ""); code = e.status; }
    t.eq([code, out.startsWith("NOT OK: no key.")], [1, true], "2e with no key: NOT OK, exit 1, before any request");
  }

  // ── 3. the runbook ──────────────────────────────────────────────────────────────────────────────
  {
    const doc = fs.readFileSync(path.join(REPO, "docs", "ops", "BILLING-DAY-OCT-26.md"), "utf8");
    const glance = (doc.match(/## Monday, in order\n([\s\S]*?)\n---/) || ["", ""])[1];
    t.ok(/`node scripts\/stripe-tax-check\.cjs`/.test(glance) && glance.indexOf("stripe-tax-check") < glance.indexOf("`BILLING_ENABLED=true`"), "3a Monday: the tax check comes before D1");
    t.ok(/`BILLING_ENABLED=true` and `STRIPE_TAX_ENABLED=true`, both Production, one Trigger deploy \(\*\*D1\*\*\)/.test(glance), "3b …and STRIPE_TAX_ENABLED goes on with BILLING_ENABLED, in the one D1 deploy");
    const sec3 = doc.slice(doc.indexOf("## 3. Turn billing on"), doc.indexOf("## 4. The first smoke purchase"));
    t.ok(/STRIPE_READ_KEY="\$STRIPE_READ_KEY" node scripts\/stripe-tax-check\.cjs/.test(sec3) && sec3.indexOf("stripe-tax-check") < sec3.indexOf("add `BILLING_ENABLED` **and** `STRIPE_TAX_ENABLED`"),
      "3c section 3: the read-only tax check, then both variables");
    const sec1 = doc.slice(doc.indexOf("## 1. Before Monday"), doc.indexOf("## 2. Migrations"));
    t.ok(/\*\*Tax → Registrations → Add\s+registration:\*\* Canada, GST\/HST/.test(sec1) && /Once specified as either inclusive or exclusive, it cannot be changed/.test(sec1),
      "3d section 1: where the GST/HST registration goes, and Stripe's rule on a price's tax behavior");
    const sec4 = doc.slice(doc.indexOf("## 4. The first smoke purchase"), doc.indexOf("## 5. Open signup"));
    t.ok(/\*\*The receipt must show tax\.\*\*/.test(sec4) && /\$11\.99 \+ \$1\.56 =\s+\$13\.55/.test(sec4), "3e the smoke purchase's receipt must show tax (Ontario: $11.99 + $1.56 = $13.55)");
    t.ok(/6\. A charge has no tax line while `STRIPE_TAX_ENABLED` is on\./.test(doc) && /\*\*Tax only: the rollback switch\.\*\*/.test(doc), "3f a charge without tax is a stop condition, and the switch is a rollback");
    t.eq(Math.round(1199 * 0.13), 156, "3g (the worked figure: 13% of $11.99 is $1.56)");
  }

  // ── 4. H6 (audit 2026-10-26): each STRIPE_PRICE_*_CAD variable's own price ─────────────────────
  {
    const { envPriceVerdict } = require(SCRIPT);
    const settings = { livemode: true, status: "active", defaults: { tax_behavior: "exclusive" } };
    const price = (id, amount, interval, over = {}) => ({ id, livemode: true, active: true, currency: "cad", type: "recurring", recurring: { interval, interval_count: 1 }, unit_amount: amount, tax_behavior: "exclusive", ...over });
    const ids = { STRIPE_PRICE_MONTHLY_CAD: "price_m", STRIPE_PRICE_ANNUAL_CAD: "price_a", STRIPE_PRICE_FOUNDING_ANNUAL_CAD: "price_f" };
    const good = { price_m: price("price_m", 1199, "month"), price_a: price("price_a", 9999, "year"), price_f: price("price_f", 7999, "year") };
    const v = envPriceVerdict({ settings, ids, byId: good });
    t.eq([v.ok, v.lines.length, v.lines.every((l) => l.startsWith("OK:"))], [true, 3, true], "4a the right price behind each variable: OK, three lines");
    const swapped = envPriceVerdict({ settings, ids: { ...ids, STRIPE_PRICE_ANNUAL_CAD: "price_f", STRIPE_PRICE_FOUNDING_ANNUAL_CAD: "price_a" }, byId: good });
    t.ok(!swapped.ok && swapped.lines.some((l) => /STRIPE_PRICE_ANNUAL_CAD.*\$79\.99, not \$99\.99/.test(l)) && swapped.lines.some((l) => /FOUNDING.*\$99\.99, not \$79\.99/.test(l)), "4b swapped annual and founding ids: NOT OK, and it says which amounts");
    const cases = [
      ["4c a missing variable", { ids: { ...ids, STRIPE_PRICE_MONTHLY_CAD: "" } }, /STRIPE_PRICE_MONTHLY_CAD is not set/],
      ["4d an id Stripe cannot find (a test-mode id)", { byId: { ...good, price_m: null } }, /no readable price price_m/],
      ["4e USD", { byId: { ...good, price_m: price("price_m", 1199, "month", { currency: "usd" }) } }, /currency USD, not CAD/],
      ["4f yearly where monthly is meant", { byId: { ...good, price_m: price("price_m", 1199, "year") } }, /every year, not every month/],
      ["4g every 3 months", { byId: { ...good, price_m: price("price_m", 1199, "month", { recurring: { interval: "month", interval_count: 3 } }) } }, /every 3 months, not every 1/],
      ["4h tax-inclusive", { byId: { ...good, price_a: price("price_a", 9999, "year", { tax_behavior: "inclusive" }) } }, /tax behavior inclusive, not exclusive/],
      ["4i archived", { byId: { ...good, price_f: price("price_f", 7999, "year", { active: false }) } }, /archived/],
      ["4j a test-mode price", { byId: { ...good, price_f: price("price_f", 7999, "year", { livemode: false }) } }, /not live mode/],
      ["4k two variables, one price", { ids: { ...ids, STRIPE_PRICE_ANNUAL_CAD: "price_m" } }, /names the same price as STRIPE_PRICE_MONTHLY_CAD/],
    ];
    for (const [name, o, rx] of cases) {
      const r = envPriceVerdict({ settings, ids: o.ids || ids, byId: o.byId || good });
      t.ok(!r.ok && r.lines.some((l) => rx.test(l)), `${name}: NOT OK (${r.lines.find((l) => rx.test(l)) || r.lines.join(" | ")})`);
    }
    const unspecified = envPriceVerdict({ settings, ids, byId: { ...good, price_m: price("price_m", 1199, "month", { tax_behavior: "unspecified" }) } });
    t.ok(unspecified.ok, "4l unspecified on the price with an exclusive default in Tax settings: OK, as section 1 rules");
    const src = fs.readFileSync(SCRIPT, "utf8");
    t.ok(/await read\(`\/prices\/\$\{encodeURIComponent\(id\)\}`\)/.test(src) && /process\.env\[p\.env\]/.test(src), "4m the script reads each variable's price by id, with the same GET-only reader");
  }

  t.summary("stripeTaxCheck.test");
})();
