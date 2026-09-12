// src/lib/pricing.js — single source of truth for launch pricing (DECISIONS.md item 1, 2026-09-03).
//
// CA is the launch market: $11.99/month or $99.99/year. Founding members (the beta cohort and the
// first 100 paying) get a founding annual price of $79.99/year (vs the standard $99.99), locked
// while continuously subscribed. That FOUNDING ENTITLEMENT — the first-100 cohort and the price
// lock — is implemented
// with billing when Stripe is built; for now only the `foundingAnnual` PRICE CONSTANT exists and the
// existing beta_founder tier is preserved. US values stay behind the country flag ($7.99/$59.99)
// until reviewed. No other price should be hard-coded anywhere; every surface reads from here.

export const PRICING = {
  CA: { currency: "CAD", monthly: 11.99, annual: 99.99, foundingAnnual: 79.99 },
  US: { currency: "USD", monthly: 7.99,  annual: 59.99, foundingAnnual: null }, // US pricing review pending
};

export function getPricing(country) {
  return PRICING[country === "US" ? "US" : "CA"];
}

// Annual discount vs paying monthly for a year, as a whole percent — computed, never hard-coded.
export function annualSavingsPercent(country) {
  const p = getPricing(country);
  return Math.round((1 - p.annual / (p.monthly * 12)) * 100);
}

// The per-month equivalent of the annual plan (for the "$X/mo billed annually" line).
export function monthlyEquivalentOfAnnual(country) {
  return getPricing(country).annual / 12;
}

// Display helper. Both CAD and USD render with a bare "$"; the currency is disambiguated in copy.
export function formatPrice(amount) {
  return `$${Number(amount).toFixed(2)}`;
}
