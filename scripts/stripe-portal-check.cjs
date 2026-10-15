#!/usr/bin/env node
// scripts/stripe-portal-check.cjs
// -----------------------------------------------------------------------------
// READ-ONLY: CAN A CUSTOMER SWITCH TO THE FOUNDING PRICE IN STRIPE'S CUSTOMER PORTAL?
//
// The founding price ($79.99 a year) is sold only through our own checkout, which checks who may have it
// (netlify/functions/_lib/foundingCohort.js). Stripe's portal knows nothing of that: if its "Switch plan"
// setting is on and lists the founding price, any subscriber can move onto it there. billing.js opens the
// portal with the DEFAULT configuration, so that is the one checked here, in LIVE mode.
//
// Run it the way docs/ops/BILLING-DAY-OCT-26.md shows (section 3, step 1): the key is typed hidden into
// STRIPE_READ_KEY for this one command. It only ever makes GET requests, sends the key only in the
// Authorization header, and never prints it.
//
// OK (exit 0) when Switch plan is off, when it cannot change the price, or when no price it offers is the
// founding price. Anything else, including a test-mode key or an answer it cannot read, is NOT OK (exit 1).
// -----------------------------------------------------------------------------
"use strict";

const API = "https://api.stripe.com/v1";
const FOUNDING = Object.freeze({ unit_amount: 7999, currency: "cad", interval: "year" });

const money = (p) => `${(p.unit_amount / 100).toFixed(2)} ${String(p.currency || "").toUpperCase()} a ${p.recurring && p.recurring.interval}`;
const isFounding = (p) => !!p && p.unit_amount === FOUNDING.unit_amount && String(p.currency).toLowerCase() === FOUNDING.currency
  && !!p.recurring && p.recurring.interval === FOUNDING.interval;

// The default configuration (or null), and every price id its Switch plan lists.
function defaultConfig(list) {
  const data = list && Array.isArray(list.data) ? list.data : [];
  return data.find(c => c && c.is_default === true) || null;
}
function listedPriceIds(config) {
  const products = config && config.features && config.features.subscription_update && config.features.subscription_update.products;
  if (!Array.isArray(products)) return null;
  return [...new Set(products.flatMap(p => (p && Array.isArray(p.prices) ? p.prices : [])))];
}

/**
 * The verdict, from what Stripe returned. Pure, so tests can feed it any answer.
 * @param {object|null} config  the default billing_portal.configuration, products expanded
 * @param {object} prices        price id -> price object, for every listed price
 * @returns {{ ok: boolean, lines: string[] }}
 */
function portalVerdict(config, prices = {}) {
  if (!config) return { ok: false, lines: ["NOT OK: no default customer portal configuration was found. Set the portal up in live mode first."] };
  if (config.livemode !== true) return { ok: false, lines: ["NOT OK: that is a TEST-mode key. Use a LIVE key: billing day uses the live portal."] };
  const su = config.features && config.features.subscription_update;
  if (!su || su.enabled !== true) return { ok: true, lines: ["OK: Switch plan is off. A customer cannot change price in the portal."] };
  if (!Array.isArray(su.default_allowed_updates) || !su.default_allowed_updates.includes("price")) {
    return { ok: true, lines: ["OK: Switch plan is on but cannot change the price (only quantity or promotion codes)."] };
  }
  const ids = listedPriceIds(config);
  if (ids === null) return { ok: false, lines: ["NOT OK: Switch plan is on, and the list of prices it offers could not be read."] };
  const unread = ids.filter(id => !prices[id]);
  if (unread.length) return { ok: false, lines: [`NOT OK: Switch plan is on, and ${unread.length} of the prices it offers could not be read.`] };
  const offered = ids.map(id => prices[id]);
  const founding = offered.filter(isFounding);
  const listing = offered.map(p => `  - ${money(p)}${isFounding(p) ? "   <- the founding price" : ""}`);
  if (founding.length) {
    return { ok: false, lines: ["NOT OK: Switch plan lets a customer move onto the founding price. Remove it from Switch plan, or turn Switch plan off.", ...listing] };
  }
  return { ok: true, lines: ["OK: Switch plan is on, and the founding price is not one of the prices it offers:", ...listing] };
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
  try {
    const list = await get("/billing_portal/configurations?is_default=true&expand[]=data.features.subscription_update.products", key);
    const config = defaultConfig(list);
    const prices = {};
    for (const id of listedPriceIds(config) || []) {
      try { prices[id] = await get(`/prices/${encodeURIComponent(id)}`, key); } catch { /* left unread: not OK */ }
    }
    const v = portalVerdict(config, prices);
    for (const l of v.lines) console.log(l);
    return v.ok ? 0 : 1;
  } catch (e) {
    console.log(`NOT OK: ${e.message}. Nothing was changed.`);
    return 1;
  }
}

if (require.main === module) main().then(code => process.exit(code));

module.exports = { portalVerdict, defaultConfig, listedPriceIds, isFounding, FOUNDING };
