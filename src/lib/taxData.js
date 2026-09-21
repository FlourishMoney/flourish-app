// src/lib/taxData.js
// -----------------------------------------------------------------------------
// Flourish — versioned regulatory/tax constants (single source of truth).
//
// WHY THIS FILE EXISTS
//   Tax figures drift every year. Keeping them inline in App.jsx meant a 2025→2026
//   launch shipped stale numbers (RRSP, EITC). This file centralizes the values that
//   change, each tagged with where it came from and when it was last verified, so a
//   yearly review is a single-file diff.
//
//   When you bump a value: update `value` AND `lastVerified`, and confirm `source`.
//
// VERIFIED 2026-06-09 against: CRA (RRSP/TFSA/FHSA/CCB/GST-HST/CGEB), IRS Rev. Proc.
// 2025-32 (EITC), OBBBA (CTC, SALT cap).
//
// RE-VERIFIED 2026-06-16: the 7 Sprint-5 migrated values (US 401k deferral + 50+ catch-up, HSA
// self-only + family, 529 gift exclusion; CA CPP, OAS) confirmed against IRS Notice 25-67,
// IRS Rev. Proc. 2025-19, IRS Rev. Proc. 2025-32, and CRA. Six were stale and corrected; the
// 529 exclusion ($19,000) was already correct. No entries remain flaggedFor2026Verification.
// ⚠️ OAS_MAX_MONTHLY re-adjusts EVERY quarter (Jan/Apr/Jul/Oct) — re-verify quarterly; a +1.2%
// increase (~$751.97) is confirmed for 2026-07-29. See the inline note at OAS_MAX_MONTHLY.
//
// (Historical) `flaggedFor2026Verification: true` meant "lastVerified is the MIGRATION date, not
// a re-confirmation of the number." All such entries were re-verified and the flag removed
// 2026-06-16. Clean grep target (now empty): flaggedFor2026Verification
// -----------------------------------------------------------------------------

// The CRA publishes CCB as an annual maximum and a monthly figure. Deriving the monthly one keeps
// a single owner for the amount: ccbMonthly(8157) === 679.75 and ccbMonthly(6883) === 573.58, which
// are exactly the monthly figures printed on the CRA page above (pinned in tests/ccbFigures.test.cjs).
export function ccbMonthly(annual) {
  return Math.round((Number(annual) / 12) * 100) / 100;
}

// What a non-refundable credit is actually worth in federal tax: the credit amount times the lowest
// bracket rate. One owner for the rate, so 2026's drop from 14.5% to 14% moved every figure at once.
export function creditWorth(amount) {
  return Math.round(Number(amount) * TAX_DATA.CA.FEDERAL_LOWEST_RATE.value);
}

export const TAX_DATA = {
  CA: {
    // ── AUDITED 2026-09-21 against the official pages named on each entry. ─────────────────────
    // Every Canadian government figure the app shows lives in this object. Nothing else may hold
    // one: tests/caFigures.test.cjs fails the gate on a copy anywhere in src/ or netlify/.
    // Each entry carries the period it applies to, the page it came from, and the date it was read.

    // Registered accounts — CRA limits table (2026 row).
    // https://www.canada.ca/en/revenue-agency/services/tax/registered-plans-administrators/pspa/mp-rrsp-dpsp-tfsa-limits-ympe.html
    RRSP_LIMIT:        { value: 33810, year: 2026, source: "CRA https://www.canada.ca/en/revenue-agency/services/tax/registered-plans-administrators/pspa/mp-rrsp-dpsp-tfsa-limits-ympe.html", lastVerified: "2026-09-21" },
    TFSA_LIMIT:        { value: 7000,  year: 2026, source: "CRA https://www.canada.ca/en/revenue-agency/services/tax/registered-plans-administrators/pspa/mp-rrsp-dpsp-tfsa-limits-ympe.html", lastVerified: "2026-09-21" },
    // FHSA participation room in the year you open your first FHSA, and the lifetime limit.
    // https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/first-home-savings-account/contributing-your-fhsa.html
    FHSA_ANNUAL:       { value: 8000,  source: "CRA https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/first-home-savings-account/contributing-your-fhsa.html", lastVerified: "2026-09-21" },
    FHSA_LIFETIME:     { value: 40000, source: "CRA https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/first-home-savings-account/contributing-your-fhsa.html", lastVerified: "2026-09-21" },

    // The lowest federal bracket rate. Every "what this credit is worth in tax" figure below is
    // this rate times a credit amount, so it has ONE owner. 15% -> 14.5% (2025) -> 14% (2026).
    // https://www.canada.ca/en/revenue-agency/services/tax/individuals/tax-rates-brackets/current-year.html
    FEDERAL_LOWEST_RATE: { value: 0.14, year: 2026, source: "CRA https://www.canada.ca/en/revenue-agency/services/tax/individuals/tax-rates-brackets/current-year.html", lastVerified: "2026-09-21" },

    // ── CANADA CHILD BENEFIT — the ONE table. Benefit year July 2026 to June 2027. ──────────────
    // Every CCB figure the app shows anywhere reads THIS. Nothing else may hold a CCB dollar
    // amount; tests/ccbFigures.test.cjs fails the gate if one appears outside this object.
    //
    // All four move together every July (the amounts are indexed to inflation and the phase-out
    // thresholds re-set at the same time), so never bump one without the others.
    //
    // SOURCE, all four verified 2026-09-21 on the CRA page below, which states for the July 2026
    // to June 2027 period, based on 2025 adjusted family net income (AFNI):
    //     "under 6 years of age: $8,157 per year ($679.75 per month)"
    //     "6 to 17 years of age: $6,883 per year ($573.58 per month)"
    //     the full amount is paid through an AFNI of $38,237 and starts to reduce only once AFNI is OVER it
    //     over $82,847 the CRA applies a fixed reduction plus a LOWER marginal rate than the first phase
    //     (the benefit still falls, just more slowly per extra dollar of income)
    // https://www.canada.ca/en/revenue-agency/services/child-family-benefits/canada-child-benefit/how-much.html
    //
    // The previous entries (CCB_MAX_UNDER_6 $7,997 / CCB_MAX_6_TO_17 $6,748, benefit year
    // 2025-07/2026-06) are replaced by this object. They had no readers: every surface printed its
    // own copy of the numbers, which is how they went a benefit year stale.
    CCB: {
      benefitYear:     "2026-07/2027-06",
      yearLabel:       "2026\u201327",        // for display: "2026–27"
      basedOnTaxYear:  2025,                 // AFNI year the CRA uses for this benefit year
      maxUnder6:       8157,                 // $/year, per child under 6
      max6to17:        6883,                 // $/year, per child aged 6 to 17
      phaseOutStart:   38237,                // $ AFNI: at or under this, the maximum is paid in full
      phaseOutSecond:  82847,                // $ AFNI: above this, the reduction continues at a lower rate
      source: "CRA https://www.canada.ca/en/revenue-agency/services/child-family-benefits/canada-child-benefit/how-much.html",
      lastVerified: "2026-09-21",
    },

    // CPP/OAS monthly maxima — re-verified against CRA 2026-06-16 (both were stale: CPP held the
    // 2024 figure, 2 years behind; OAS held the Jan-Mar 2026 quarter).
    // ── Public pensions ────────────────────────────────────────────────────────────────────────
    // https://www.canada.ca/en/services/benefits/publicpensions/cpp/cpp-benefit/amount.html
    CPP_MAX_MONTHLY:   { value: 1507.65, label: "CPP maximum retirement pension at 65 (January 2026)", source: "CRA https://www.canada.ca/en/services/benefits/publicpensions/cpp/cpp-benefit/amount.html", lastVerified: "2026-09-21" },
    // ⚠️ OAS re-adjusts EVERY quarter (Jan/Apr/Jul/Oct). Re-verify quarterly and keep the wording
    // "approximate, as of <date>" wherever it is shown. The previous $743.05 (Apr-Jun 2026) was one
    // quarter stale by the time this audit ran.
    // https://www.canada.ca/en/services/benefits/publicpensions/old-age-security/benefit-amount.html
    OAS: {
      maxMonthly65to74: 751.97,
      maxMonthly75plus: 827.17,
      incomeCeiling65to74: 152062,      // 2025 net world income must be under this
      incomeCeiling75plus: 157923,
      source: "Service Canada https://www.canada.ca/en/services/benefits/publicpensions/old-age-security/benefit-amount.html",
      lastVerified: "2026-09-21",
    },
    // https://www.canada.ca/en/services/benefits/publicpensions/old-age-security/guaranteed-income-supplement/benefit-amount.html
    GIS: {
      maxMonthlySingle: 1123.17,
      incomeUnderSingle: 22800,         // annual income must be less than this
      source: "Service Canada https://www.canada.ca/en/services/benefits/publicpensions/old-age-security/guaranteed-income-supplement/benefit-amount.html",
      lastVerified: "2026-09-21",
    },

    // ── The GST/HST credit became the Canada Groceries and Essentials Benefit in July 2026. ────
    // The CRA's GST/HST credit page now reads "No longer available - Replaced by the CGEB", so the
    // app must not describe this as something that is still going to happen.
    // https://www.canada.ca/en/revenue-agency/services/child-family-benefits/canada-groceries-essentials-benefit/how-much.html
    CGEB: {
      name: "Canada Groceries and Essentials Benefit",
      benefitYear: "2026-07/2027-06",
      basedOnTaxYear: 2025,
      maxSingle: 679,
      maxCouple: 890,
      perChildUnder19: 234,
      replacedOn: "2026-07",
      replaced: "the GST/HST credit",
      source: "CRA https://www.canada.ca/en/revenue-agency/services/child-family-benefits/canada-groceries-essentials-benefit/how-much.html",
      lastVerified: "2026-09-21",
    },

    // ── Canada workers benefit (basic amount, 2025 tax year — the year the CRA currently shows) ─
    // https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/about-your-tax-return/tax-return/completing-a-tax-return/deductions-credits-expenses/line-45300-canada-workers-benefit-cwb/how-much-you-can-get.html
    CWB: {
      taxYear: 2025,
      maxSingle: 1633,
      maxFamily: 2813,
      reduceOverSingle: 26855,
      nilOverSingle: 37742,
      reduceOverFamily: 30639,
      nilOverFamily: 49393,
      source: "CRA https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/about-your-tax-return/tax-return/completing-a-tax-return/deductions-credits-expenses/line-45300-canada-workers-benefit-cwb/how-much-you-can-get.html",
      lastVerified: "2026-09-21",
    },

    // ── Ontario Trillium Benefit, 2026 benefit year (July 2026 to June 2027) ───────────────────
    // Three credits paid as one: OEPTC + OSTC + NOEC. https://www.ontario.ca/page/ontario-trillium-benefit
    OTB: {
      benefitYear: "2026-07/2027-06",
      oeptc18to64: 1307,
      oeptc65plus: 1488,
      ostcPerPerson: 378,               // plus the same again for a partner and each child under 19
      noecSingle: 189,
      noecFamily: 290,
      source: "Ontario https://www.ontario.ca/page/ontario-trillium-benefit",
      lastVerified: "2026-09-21",
    },

    // ── Canada Disability Benefit, July 2026 to June 2027 ─────────────────────────────────────
    // The page states the MONTHLY maximum for this period. Its worked examples still use the
    // 2025-26 annual figure ($2,400), so no annual maximum is published for 2026-27 and the app
    // shows the monthly figure only.
    // https://www.canada.ca/en/services/benefits/disability/canada-disability-benefit/amount.html
    CDB: {
      benefitYear: "2026-07/2027-06",
      maxMonthly: 204.20,
      basedOnTaxYear: 2025,
      source: "Service Canada https://www.canada.ca/en/services/benefits/disability/canada-disability-benefit/amount.html",
      lastVerified: "2026-09-21",
    },

    // ── Indexed personal amounts, 2026 column ─────────────────────────────────────────────────
    // https://www.canada.ca/en/revenue-agency/services/tax/individuals/frequently-asked-questions-individuals/adjustment-personal-income-tax-benefit-amounts.html
    INDEXED_2026: {
      taxYear: 2026,
      disabilityAmount: 10341,          // the DTC base amount
      disabilityChildSupplement: 6032,
      ageAmount: 9208,
      ageAmountThreshold: 46432,
      medicalExpenseCeiling: 2890,      // the 3%-of-net-income ceiling
      source: "CRA https://www.canada.ca/en/revenue-agency/services/tax/individuals/frequently-asked-questions-individuals/adjustment-personal-income-tax-benefit-amounts.html",
      lastVerified: "2026-09-21",
    },

    // https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/about-your-tax-return/tax-return/completing-a-tax-return/deductions-credits-expenses/line-31285-home-accessibility-expenses.html
    HOME_ACCESSIBILITY_MAX: { value: 20000, source: "CRA https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/about-your-tax-return/tax-return/completing-a-tax-return/deductions-credits-expenses/line-31285-home-accessibility-expenses.html", lastVerified: "2026-09-21" },
    // https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/about-your-tax-return/tax-return/completing-a-tax-return/deductions-credits-expenses/line-45350-canada-training-credit.html
    CANADA_TRAINING_CREDIT: { annualAccrual: 250, lifetimeMax: 5000, source: "CRA https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/about-your-tax-return/tax-return/completing-a-tax-return/deductions-credits-expenses/line-45350-canada-training-credit.html", lastVerified: "2026-09-21" },
    // https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/when-register-charge.html
    GSTHST_SMALL_SUPPLIER: { value: 30000, source: "CRA https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/when-register-charge.html", lastVerified: "2026-09-21" },

    // ── NOT HELD HERE, ON PURPOSE ─────────────────────────────────────────────────────────────
    // These figures were in the UI before this audit and could not be confirmed on an official
    // page during it, so the dollar amounts were REMOVED from the UI rather than carried forward
    // or guessed. Add them back only with a source URL and a verification date:
    //   • Child care expense deduction limits (was "$8,000/child under 7, $5,000 aged 7-16")
    //   • RESP / CESG grant amounts (was "20% on the first $2,500 = $500", CLB "$500")
    //   • Pension income amount (was "the first $2,000 of eligible pension income")
    //   • Quebec solidarity tax credit range (was "$300 to $2,000")
    //   • Saskatchewan Graduate Retention Program (was "up to $20,000")
  },
  US: {
    EITC_MAX_3PLUS:    { value: 8231,  year: 2026, source: "IRS Rev. Proc. 2025-32", lastVerified: "2026-06-09" },
    CHILD_TAX_CREDIT:  { value: 2200,             source: "OBBBA",                  lastVerified: "2026-06-09" },
    SALT_CAP:          { value: 40400, year: 2026, source: "OBBBA (indexed; reverts $10k in 2030)", lastVerified: "2026-06-09" },

    // Sprint 5: migrated from inline App.jsx (still 2025 values — flagged for a 2026 IRS sweep).
    K401_DEFERRAL:       { value: 24500, label: "401(k) employee deferral (2026)", source: "IRS Notice 25-67", lastVerified: "2026-06-16" },
    K401_CATCHUP_50PLUS: { value: 32500, label: "401(k) deferral + catch-up, age 50+ (2026)", source: "IRS Notice 25-67", lastVerified: "2026-06-16" },
    HSA_SELF_ONLY:       { value: 4400,  label: "HSA self-only contribution limit (2026)", source: "IRS Rev. Proc. 2025-19", lastVerified: "2026-06-16" },
    HSA_FAMILY:          { value: 8750,  label: "HSA family contribution limit (2026)", source: "IRS Rev. Proc. 2025-19", lastVerified: "2026-06-16" },
    GIFT_EXCLUSION_529:  { value: 19000, label: "Annual gift-tax exclusion / 529 (2026)", source: "IRS Rev. Proc. 2025-32", lastVerified: "2026-06-16" },
  },
};
