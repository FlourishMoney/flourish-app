// tests/pricing.test.cjs — Step 3: pricing single source of truth (DECISIONS.md item 1).
"use strict";
const { create } = require("./_runner.cjs");
const t = create();

(async () => {
  const { PRICING, getPricing, annualSavingsPercent, monthlyEquivalentOfAnnual, formatPrice } =
    await import("../src/lib/pricing.js");

  // CA launch price
  t.eq(getPricing("CA").monthly, 11.99, "CA monthly is 11.99");
  t.eq(getPricing("CA").annual, 99.99, "CA annual is 99.99");
  t.eq(getPricing("CA").foundingAnnual, 79.99, "CA founding annual is 79.99 (constant only; entitlement pending billing)");
  t.eq(getPricing("CA").currency, "CAD", "CA currency");

  // US behind the flag, unchanged
  t.eq(getPricing("US").monthly, 7.99, "US monthly is 7.99");
  t.eq(getPricing("US").annual, 59.99, "US annual is 59.99");
  t.eq(getPricing("US").foundingAnnual, null, "US founding not set (review pending)");

  // default / unknown country → CA
  t.eq(getPricing(undefined).monthly, 11.99, "unknown country defaults to CA");

  // computed, not hard-coded
  t.eq(annualSavingsPercent("CA"), 31, "CA annual discount computes to 31%");
  t.eq(annualSavingsPercent("US"), 37, "US annual discount computes to 37%");
  t.approx(monthlyEquivalentOfAnnual("CA"), 8.3325, 0.0001, "CA annual ÷ 12");
  t.eq(formatPrice(99.99), "$99.99", "formatPrice");
  t.eq(formatPrice(8.3325), "$8.33", "formatPrice rounds to cents");

  t.summary("pricing");
})();
