// netlify/functions/_lib/billingPlans.js
// -----------------------------------------------------------------------------
// WHICH PRICE A PLAN KEY MEANS — and the reason price ids never reach the client.
//
// A Stripe price id (price_...) is different in test mode and live mode, and it changes
// whenever a price is re-created. If the client sent one, a browser could ask to be
// charged for any price in the account, and the October test-mode ids would be baked
// into the App Store build. So the client sends a PLAN KEY — "monthly", "annual",
// "founding_annual" — and this module turns it into a price id from the environment.
//
// Pure and env-injectable, so the whole mapping is testable without Stripe.
// -----------------------------------------------------------------------------
"use strict";

// DECISIONS.md item 1: $11.99/month, $99.99/year, founding $79.99/year, all CAD plus tax (P16).
const PLAN_KEYS = Object.freeze(["monthly", "annual", "founding_annual"]);

const PRICE_ENV = Object.freeze({
  monthly:         "STRIPE_PRICE_MONTHLY_CAD",
  annual:          "STRIPE_PRICE_ANNUAL_CAD",
  founding_annual: "STRIPE_PRICE_FOUNDING_ANNUAL_CAD",
});

function isValidPlanKey(planKey) {
  return typeof planKey === "string" && PLAN_KEYS.includes(planKey);
}

// { priceId } or { error }. Never throws, never guesses a price.
function priceIdFor(planKey, env = process.env) {
  if (!isValidPlanKey(planKey)) return { error: "unknown_plan" };
  const name = PRICE_ENV[planKey];
  const value = (env[name] || "").trim();
  if (!value) return { error: "price_not_configured" };
  return { priceId: value };
}

// WHO MAY BUY founding_annual is not decided here: _lib/foundingCohort.js matches the buyer's
// confirmed email to a waitlist founding position, 1 to 50 (Amanda's decision, 2026-10-06). A client
// asking for founding_annual without one is refused rather than quietly sold the standard price,
// because silently charging someone $99.99 when they clicked $79.99 is worse than an error.

module.exports = { PLAN_KEYS, PRICE_ENV, isValidPlanKey, priceIdFor };
