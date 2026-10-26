#!/usr/bin/env node
// scripts/stripe-tax-check.cjs
// -----------------------------------------------------------------------------
// READ-ONLY: IS STRIPE TAX READY TO CHARGE GST/HST FROM THE FIRST SALE?
//
// Billing day charges tax from the first sale (STRIPE_TAX_ENABLED, set with BILLING_ENABLED before D1). This
// checks, in LIVE mode, the three things Stripe Tax needs and our prices assume:
//   1. Tax settings are complete (status "active": head office address and defaults in place);
//   2. an active GST/HST registration for Canada (country CA, type "standard"); provincial registrations
//      (QST, PST, RST) are listed for information;
//   3. every live CAD price for $11.99 a month, $99.99 a year and $79.99 a year is tax-EXCLUSIVE ("plus
//      tax"): set on the price, or, for a price left "unspecified", through the default in Tax settings.
// Stripe does not let a price's tax behavior change once it is inclusive or exclusive (Prices API: "Once
// specified as either inclusive or exclusive, it cannot be changed"). So a tax-INCLUSIVE price needs a new,
// exclusive price, and that price's id in its STRIPE_PRICE_*_CAD variable, before D1.
//
//   4. (H6, audit 2026-10-26) the price EACH STRIPE_PRICE_*_CAD variable names is the one it should be: active,
//      live, CAD, recurring every 1 month or 1 year, the right amount, and tax-exclusive. Swapped or stale ids
//      would charge the wrong amount, and 3 only proves such prices exist somewhere. The ids are passed in the
//      environment (they are not secrets); a variable that is missing is NOT OK.
//
// Run it the way docs/ops/BILLING-DAY-OCT-26.md shows (section 3, step 1): the key is typed hidden into
// STRIPE_READ_KEY for one command. GET requests only; the key goes only in the Authorization header and is
// never printed. OK (exit 0) or NOT OK (exit 1); a test-mode key or an unreadable answer is NOT OK.
// -----------------------------------------------------------------------------
"use strict";

const API = "https://api.stripe.com/v1";
const PLANS = Object.freeze([
  { name: "Monthly ($11.99 a month)", amount: 1199, interval: "month", env: "STRIPE_PRICE_MONTHLY_CAD" },
  { name: "Annual ($99.99 a year)", amount: 9999, interval: "year", env: "STRIPE_PRICE_ANNUAL_CAD" },
  { name: "Founding Annual ($79.99 a year)", amount: 7999, interval: "year", env: "STRIPE_PRICE_FOUNDING_ANNUAL_CAD" },
]);

const listOf = (x) => (x && Array.isArray(x.data) ? x.data : []);

/**
 * The verdict, from what Stripe returned. Pure, so tests can feed it any answer.
 * @param {{settings: object|null, registrations: object|null, prices: object|null}} answers
 * @returns {{ ok: boolean, lines: string[] }}
 */
function taxVerdict({ settings, registrations, prices } = {}) {
  const lines = [];
  let ok = true;
  const bad = (l) => { ok = false; lines.push(`NOT OK: ${l}`); };

  if (!settings) return { ok: false, lines: ["NOT OK: the Tax settings could not be read."] };
  if (settings.livemode !== true) return { ok: false, lines: ["NOT OK: that is a TEST-mode key. Use a LIVE key: tax on billing day is live."] };
  if (settings.status !== "active") bad(`Tax settings are not complete (status "${settings.status}"). Stripe, live mode > Settings > Tax: head office address and defaults.`);
  else lines.push("OK: Tax settings are complete.");

  const regs = listOf(registrations).filter(r => r && r.country === "CA" && r.status === "active");
  const gst = regs.filter(r => r.country_options && r.country_options.ca && r.country_options.ca.type === "standard");
  const simplified = regs.filter(r => r.country_options && r.country_options.ca && r.country_options.ca.type === "simplified");
  const provincial = regs.filter(r => r.country_options && r.country_options.ca && r.country_options.ca.type === "province_standard");
  if (!registrations) bad("the tax registrations could not be read.");
  else if (gst.length) lines.push("OK: a GST/HST registration for Canada is active (standard).");
  else if (simplified.length) bad("only a SIMPLIFIED GST/HST registration is active; that kind is for businesses outside Canada. GrowSmart's own GST/HST registration is a standard one. Check with your accountant before going on.");
  else bad("no active GST/HST registration for Canada. Stripe, live mode > Tax > Registrations > Add registration: Canada, GST/HST.");
  for (const r of provincial) lines.push(`  also active: provincial registration, ${r.country_options.ca.province_standard && r.country_options.ca.province_standard.province}`);

  if (!prices) {
    bad("the prices could not be read.");
  } else {
    const fallback = settings.defaults && settings.defaults.tax_behavior;
    for (const plan of PLANS) {
      const found = listOf(prices).filter(p => p && p.active === true && String(p.currency).toLowerCase() === "cad" && p.type === "recurring"
        && p.recurring && p.recurring.interval === plan.interval && p.unit_amount === plan.amount);
      if (!found.length) { bad(`no active live CAD price for ${plan.name}.`); continue; }
      for (const p of found) {
        const effective = p.tax_behavior === "unspecified" || !p.tax_behavior ? fallback : p.tax_behavior;
        if (effective === "exclusive") {
          lines.push(`OK: ${plan.name}, ${p.id}: tax-exclusive${p.tax_behavior === "exclusive" ? "" : " (through the Tax settings default)"}.`);
        } else if (p.tax_behavior === "inclusive") {
          bad(`${plan.name}, ${p.id}, is tax-INCLUSIVE, and Stripe does not let that change. Create a new price for it with Tax behavior "Exclusive", put the new id in ${plan.env} (Production), and archive this one, before D1.`);
        } else {
          bad(`${plan.name}, ${p.id}, has no tax behavior and the Tax settings default is "${fallback || "not set"}". Set this price's Tax behavior to "Exclusive" (Stripe allows that once), or set the default in Tax settings to exclusive.`);
        }
      }
    }
  }
  return { ok, lines };
}

/**
 * H6: the price each STRIPE_PRICE_*_CAD variable names. Pure.
 * @param {{settings: object|null, ids: Object<string,string>, byId: Object<string,object|null>}} a
 *   ids: the variable's value for each plan env name; byId: Stripe's answer for each id (null: unreadable)
 */
function envPriceVerdict({ settings, ids = {}, byId = {} } = {}) {
  const lines = [];
  let ok = true;
  const bad = (l) => { ok = false; lines.push(`NOT OK: ${l}`); };
  const fallback = settings && settings.defaults && settings.defaults.tax_behavior;
  const seen = new Map();
  for (const plan of PLANS) {
    const id = String(ids[plan.env] || "").trim();
    if (!id) { bad(`${plan.env} is not set (Production).`); continue; }
    if (seen.has(id)) bad(`${plan.env} names the same price as ${seen.get(id)}.`);
    seen.set(id, plan.env);
    const p = byId[id];
    if (!p) { bad(`${plan.env}: Stripe has no readable price ${id} (a test-mode id, or a typo).`); continue; }
    const problems = [];
    if (p.livemode !== true) problems.push("not live mode");
    if (p.active !== true) problems.push("archived");
    if (String(p.currency).toLowerCase() !== "cad") problems.push(`currency ${String(p.currency).toUpperCase()}, not CAD`);
    if (p.type !== "recurring" || !p.recurring) problems.push("not a recurring price");
    else {
      if (p.recurring.interval !== plan.interval) problems.push(`every ${p.recurring.interval}, not every ${plan.interval}`);
      if ((p.recurring.interval_count || 1) !== 1) problems.push(`every ${p.recurring.interval_count} ${p.recurring.interval}s, not every 1`);
    }
    if (p.unit_amount !== plan.amount) problems.push(`$${((p.unit_amount || 0) / 100).toFixed(2)}, not $${(plan.amount / 100).toFixed(2)}`);
    const effective = p.tax_behavior === "unspecified" || !p.tax_behavior ? fallback : p.tax_behavior;
    if (effective !== "exclusive") problems.push(`tax behavior ${p.tax_behavior || "unspecified"}${effective && effective !== p.tax_behavior ? ` (default ${effective})` : ""}, not exclusive`);
    if (problems.length) bad(`${plan.env} (${plan.name}), ${id}: ${problems.join("; ")}.`);
    else lines.push(`OK: ${plan.env} is ${plan.name}, live, CAD, tax-exclusive (${id}).`);
  }
  return { ok, lines };
}

async function get(path, key) {
  const res = await fetch(`${API}${path}`, { method: "GET", headers: { Authorization: `Bearer ${key}` } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Stripe answered ${res.status}${body && body.error && body.error.type ? ` (${body.error.type})` : ""}`);
  return body;
}

async function main() {
  const key = (process.env.STRIPE_READ_KEY || "").trim();
  if (!key) {
    console.log("NOT OK: no key. Run it as docs/ops/BILLING-DAY-OCT-26.md section 3 step 1 shows (the key is typed hidden).");
    return 1;
  }
  const read = async (path) => { try { return await get(path, key); } catch { return null; } };
  const answers = {
    settings: await read("/tax/settings"),
    registrations: await read("/tax/registrations?status=active&limit=100"),
    prices: await read("/prices?active=true&currency=cad&type=recurring&limit=100"),
  };
  const v = taxVerdict(answers);
  for (const l of v.lines) console.log(l);
  // H6: each variable's own price, fetched by id.
  const ids = Object.fromEntries(PLANS.map((p) => [p.env, (process.env[p.env] || "").trim()]));
  const byId = {};
  for (const id of new Set(Object.values(ids).filter(Boolean))) byId[id] = /^price_[A-Za-z0-9]+$/.test(id) ? await read(`/prices/${encodeURIComponent(id)}`) : null;
  const e = envPriceVerdict({ settings: answers.settings, ids, byId });
  for (const l of e.lines) console.log(l);
  return v.ok && e.ok ? 0 : 1;
}

if (require.main === module) main().then(code => process.exit(code));

module.exports = { taxVerdict, envPriceVerdict, PLANS };
