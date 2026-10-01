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
      yearLabel:       "2026 to 2027",       // for display: the July-to-June benefit year, in words (no dash)
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

    // ── The Canada Groceries and Essentials Benefit, paid since July 2026. ─────────────────────
    // The CRA's page for the benefit it replaced now reads "No longer available - Replaced by the
    // CGEB". The app names only the CGEB, and never the retired benefit (tests/caFigures.test.cjs).
    // https://www.canada.ca/en/revenue-agency/services/child-family-benefits/canada-groceries-essentials-benefit/how-much.html
    CGEB: {
      name: "Canada Groceries and Essentials Benefit",
      benefitYear: "2026-07/2027-06",
      basedOnTaxYear: 2025,
      replacedOn: "2026-07",
      // The CRA builds the payment from these parts, which is why a single figure cannot be shown
      // as "the" amount: a single parent with one child gets the adult amount PLUS the first-child
      // amount PLUS the single supplement ($445 + $445 + $234 = $1,124), not $679 + $234.
      // https://www.canada.ca/en/revenue-agency/services/child-family-benefits/canada-groceries-essentials-benefit/how-much/payment-amounts.html
      eligibleIndividual:     445,
      eligibleSpouse:         445,
      perChildUnder19:        234,
      firstChildSingleParent: 445,   // replaces the per-child amount for a single parent's first child
      additionalSingle:       234,
      phaseInThresholdSingle: 11564, // the single supplement phases in above this income
      phaseOutThreshold:      46432,
      // The two situations the CRA states outright as "you could get up to".
      maxSingleNoChildren: 679,      // 445 + 234
      maxCoupleNoChildren: 890,      // 445 + 445
      // Most people never apply; new residents may have to in their first year.
      applyNote: "new residents of Canada may need to apply for their first year",
      calculator: "https://www.canada.ca/en/revenue-agency/services/child-family-benefits/child-family-benefits-calculator.html",
      source: "CRA https://www.canada.ca/en/revenue-agency/services/child-family-benefits/canada-groceries-essentials-benefit/how-much/payment-amounts.html",
      lastVerified: "2026-09-22",
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
      // "The maximum basic CWB amount will vary for residents of Quebec, Nunavut and Alberta", and
      // the cut-offs differ too (family with children: $49,393 here, $41,048.90 QC, $67,365 NU,
      // $50,232 AB). The figures above are the Canada-excluding-those-three ones, so the UI must
      // say who they apply to. Eligibility also needs WORKING income, not just low income.
      variesIn: ["AB", "QC", "NU"],
      source: "CRA https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/about-your-tax-return/tax-return/completing-a-tax-return/deductions-credits-expenses/line-45300-canada-workers-benefit-cwb/how-much-you-can-get.html",
      lastVerified: "2026-09-22",
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
      // There is no single "maximum": a senior gets the higher OEPTC, a family claims the OSTC for
      // each person, and Northern residents add the NOEC on top. The UI shows the parts with who
      // each applies to and links the calculator rather than inventing a total.
      calculator: "https://www.canada.ca/en/revenue-agency/services/child-family-benefits/child-family-benefits-calculator.html",
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
    // Room accrues only if you qualify that year (26 to 65 at year end, resident all year, working
    // income and net income within the CRA's limits). A CLAIM is the lesser of your accumulated
    // room and 50% of eligible fees — so it can exceed one year's $250.
    CANADA_TRAINING_CREDIT: { annualAccrual: 250, lifetimeMax: 5000, minAge: 26, maxAge: 65, claimSharePct: 50, source: "CRA https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/about-your-tax-return/tax-return/completing-a-tax-return/deductions-credits-expenses/line-45350-canada-training-credit.html", lastVerified: "2026-09-21" },
    // https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/when-register-charge.html
    GSTHST_SMALL_SUPPLIER: { value: 30000, source: "CRA https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/when-register-charge.html", lastVerified: "2026-09-21" },

    // First-home figures. The coach's system prompt stated these from memory, including a Home
    // Buyers' Tax Credit of $1,500 — that was 15% of the $10,000 amount. The rate is 14% for 2026,
    // so the credit is $1,400. Derive it, never type it.
    // https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/about-your-tax-return/tax-return/completing-a-tax-return/deductions-credits-expenses/line-31270-home-buyers-amount.html
    HOME_BUYERS_AMOUNT: { value: 10000, source: "CRA https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/about-your-tax-return/tax-return/completing-a-tax-return/deductions-credits-expenses/line-31270-home-buyers-amount.html", lastVerified: "2026-09-22" },
    // https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/rrsps-related-plans/what-home-buyers-plan.html
    HBP_WITHDRAWAL_LIMIT: { value: 60000, source: "CRA https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/rrsps-related-plans/what-home-buyers-plan.html", lastVerified: "2026-09-22" },

    // ── Added 2026-10-01 (prelaunch-copy, prompt 3b): figures the tax tips showed with no source ──
    // CPP contribution rates, 2026. https://www.canada.ca/en/services/benefits/publicpensions/cpp/contributions.html
    // "The contribution rate on these pensionable earnings is 11.9% (9.9% for the base ... and 2% for the CPP enhancement"
    CPP_RATES: { employeePct: 5.95, employerPct: 5.95, selfEmployedPct: 11.9, cpp2EmployeePct: 4, cpp2SelfEmployedPct: 8, year: 2026,
      source: "CRA https://www.canada.ca/en/services/benefits/publicpensions/cpp/contributions.html", lastVerified: "2026-10-01" },
    // Alberta, 2026: the lowest and highest brackets and the basic personal amount.
    // https://www.alberta.ca/personal-income-tax ("For 2026, the Alberta non-refundable basic personal tax credit is $22,769.")
    AB_TAX: { lowRatePct: 8, lowBracketTop: 61200, topRatePct: 15, topBracketOver: 370220, basicPersonalAmount: 22769, year: 2026,
      source: "alberta.ca https://www.alberta.ca/personal-income-tax", lastVerified: "2026-10-01" },
    // Alberta Child and Family Benefit, July 2026 to June 2027, one child.
    // https://www.alberta.ca/alberta-child-and-family-benefit ("reduced once family net income exceeds $28,116 or $47,115")
    AB_ACFB: { benefitYear: "2026-07/2027-06", yearLabel: "2026 to 2027", baseOneChild: 1529, workingOneChild: 782, baseReducesOver: 28116, workingReducesOver: 47115,
      source: "alberta.ca https://www.alberta.ca/alberta-child-and-family-benefit", lastVerified: "2026-10-01" },
    // Statutory shares the tips state, each read on canada.ca 2026-10-01.
    // "You can allocate up to 50% of your eligible pension income to your spouse or common-law partner."
    PENSION_SPLIT_MAX: { pct: 50, year: 2026, source: "CRA https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/pension-income-splitting.html", lastVerified: "2026-10-01" },
    // T4002 chapter 3: the 50% limitation on food, beverages and entertainment.
    MEALS_DEDUCTIBLE: { pct: 50, year: 2026, source: "CRA https://www.canada.ca/en/revenue-agency/services/forms-publications/publications/t4002/t4002-5.html", lastVerified: "2026-10-01" },
    // "Your new home must be at least 40 kilometres closer (by the shortest public route) to your new school."
    STUDENT_MOVE_KM: { value: 40, year: 2026, source: "CRA https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/about-your-tax-return/tax-return/completing-a-tax-return/deductions-credits-expenses/line-21900-moving-expenses.html", lastVerified: "2026-10-01" },
    // The medical expense floor: "the lesser of ... 3% of your net income ... or" the indexed ceiling (INDEXED_2026).
    MEDICAL_NET_INCOME_PCT: { pct: 3, year: 2026, source: "CRA https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/about-your-tax-return/tax-return/completing-a-tax-return/deductions-credits-expenses/lines-33099-33199-eligible-medical-expenses-you-claim-on-your-tax-return.html", lastVerified: "2026-10-01" },
    // REMOVED, program ended (checked 2026-10-01):
    //   • Manitoba Tuition Fee Income Tax Rebate: "fully eliminated for the 2018 tax year"
    //     (https://www.gov.mb.ca/finance/taxation/pubs/bulletins/2017budget.pdf)
    //   • BC Climate Action Tax Credit: "The B.C. climate action tax credit program has ended. ... April 2025
    //     was the final payment." (https://www2.gov.bc.ca/gov/content/taxes/income-taxes/personal/credits/climate-action)

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
    // Re-sourced 2026-10-01 to the IRS page (Rev. Proc. 2025-32 §3.03, §4.05): "For taxable years beginning in
    // 2026, the maximum amount of the credit allowed under § 24(a) is $2,200." Refundable part $1,700.
    CHILD_TAX_CREDIT:  { value: 2200, refundable: 1700, year: 2026, source: "IRS https://www.irs.gov/irb/2025-45_IRB", lastVerified: "2026-10-01" },
    SALT_CAP:          { value: 40400, year: 2026, source: "OBBBA (indexed; reverts $10k in 2030)", lastVerified: "2026-06-09" },

    // Sprint 5: migrated from inline App.jsx (still 2025 values — flagged for a 2026 IRS sweep).
    K401_DEFERRAL:       { value: 24500, label: "401(k) employee deferral (2026)", source: "IRS Notice 25-67", lastVerified: "2026-06-16" },
    K401_CATCHUP_50PLUS: { value: 32500, label: "401(k) deferral + catch-up, age 50+ (2026)", source: "IRS Notice 25-67", lastVerified: "2026-06-16" },
    HSA_SELF_ONLY:       { value: 4400,  label: "HSA self-only contribution limit (2026)", source: "IRS Rev. Proc. 2025-19", lastVerified: "2026-06-16" },
    HSA_FAMILY:          { value: 8750,  label: "HSA family contribution limit (2026)", source: "IRS Rev. Proc. 2025-19", lastVerified: "2026-06-16" },
    GIFT_EXCLUSION_529:  { value: 19000, label: "Annual gift-tax exclusion / 529 (2026)", source: "IRS Rev. Proc. 2025-32", lastVerified: "2026-06-16" },

    // ── Added 2026-10-01 (prelaunch-copy, prompt 3b) ───────────────────────────────────────────
    // Every figure below was read on the irs.gov (or usda.gov) page named on it. Amounts set in law
    // and not indexed (AOTC, LLC, the 7.5% medical floor, the home office rate, the 85%, SE tax, QBI,
    // RMD age and excise, the IRA first-home limit) carry the tax year the page applies to.
    // Rev. Proc. 2025-32 §4.06: "Completed Phaseout Amount ... $70,244 ... (All other filing statuses) ... $62,974"
    EITC_PHASEOUT_3PLUS: { single: 62974, joint: 70244, year: 2026, source: "IRS https://www.irs.gov/irb/2025-45_IRB", lastVerified: "2026-10-01" },
    // "The limit on annual contributions to an IRA is increased to $7,500 from $7,000." Roth phase-outs, 2026.
    ROTH_IRA: { limit: 7500, catchUp50: 1100, phaseStartSingle: 153000, phaseEndSingle: 168000, phaseStartJoint: 242000, phaseEndJoint: 252000, year: 2026,
      source: "IRS https://www.irs.gov/newsroom/401k-limit-increases-to-24500-for-2026-ira-limit-increases-to-7500", lastVerified: "2026-10-01" },
    // Rev. Proc. 2025-32 §4.29: "the $2,500 maximum deduction ... begins to phase out ... in excess of $85,000 ($175,000 for joint returns)"
    STUDENT_LOAN_INTEREST: { max: 2500, phaseStartSingle: 85000, phaseStartJoint: 175000, year: 2026, source: "IRS https://www.irs.gov/irb/2025-45_IRB", lastVerified: "2026-10-01" },
    // Pub 505 (2026): "The credit amount remains $3,000 ($6,000 for two or more qualifying children) but the maximum
    // credit rate has increased from 35% to 50%". The lowest rate and its income bands are not yet published for 2026.
    CHILD_CARE_CREDIT: { expensesOne: 3000, expensesTwoPlus: 6000, maxRatePct: 50, year: 2026, source: "IRS https://www.irs.gov/publications/p505", lastVerified: "2026-10-01" },
    // Saver's Credit 2026 AGI limits; the maximum credit is $1,000 ($2,000 joint).
    SAVERS_CREDIT: { maxCredit: 1000, maxCreditJoint: 2000, agiSingle: 40250, agiHoH: 60375, agiJoint: 80500, year: 2026,
      source: "IRS https://www.irs.gov/newsroom/401k-limit-increases-to-24500-for-2026-ira-limit-increases-to-7500", lastVerified: "2026-10-01" },
    // "It's a tax credit of up to $2,500 ... 40 percent ... (up to $1,000) can be refunded"; 4 years per student.
    AOTC: { max: 2500, refundablePct: 40, refundableMax: 1000, years: 4, year: 2026, source: "IRS https://www.irs.gov/credits-deductions/individuals/education-credits-questions-and-answers", lastVerified: "2026-10-01" },
    // "LLC is 20% of the first $10,000 of qualified expenses"; up to $2,000 per return.
    LLC: { ratePct: 20, expensesMax: 10000, max: 2000, year: 2026, source: "IRS https://www.irs.gov/credits-deductions/individuals/education-credits-aotc-and-llc", lastVerified: "2026-10-01" },
    MEDICAL_AGI_FLOOR: { pct: 7.5, year: 2026, source: "IRS https://www.irs.gov/taxtopics/tc502", lastVerified: "2026-10-01" },
    HOME_OFFICE_SIMPLIFIED: { perSqFt: 5, maxSqFt: 300, max: 1500, year: 2026, source: "IRS https://www.irs.gov/businesses/small-businesses-self-employed/simplified-option-for-home-office-deduction", lastVerified: "2026-10-01" },
    SS_TAXABLE_MAX: { pct: 85, year: 2025, source: "IRS https://www.irs.gov/publications/p915", lastVerified: "2026-10-01" },
    // The "Working Families Tax Cuts" page (formerly the OBBBA deductions page), 2025 through 2028.
    TIPS_DEDUCTION: { max: 25000, phaseStartSingle: 150000, phaseStartJoint: 300000, firstYear: 2025, lastYear: 2028, year: 2026,
      source: "IRS https://www.irs.gov/newsroom/working-families-tax-cuts-tax-deductions-for-working-americans-and-seniors", lastVerified: "2026-10-01" },
    OVERTIME_DEDUCTION: { max: 12500, maxJoint: 25000, phaseStartSingle: 150000, phaseStartJoint: 300000, firstYear: 2025, lastYear: 2028, year: 2026,
      source: "IRS https://www.irs.gov/newsroom/working-families-tax-cuts-tax-deductions-for-working-americans-and-seniors", lastVerified: "2026-10-01" },
    SENIOR_DEDUCTION: { perPerson: 6000, phaseStartSingle: 75000, phaseStartJoint: 150000, firstYear: 2025, lastYear: 2028, year: 2026,
      source: "IRS https://www.irs.gov/newsroom/working-families-tax-cuts-tax-deductions-for-working-americans-and-seniors", lastVerified: "2026-10-01" },
    // Rev. Proc. 2025-32 §3.14(3): "$1,650 ... $2,050 if the individual is also unmarried". (2024 was $1,950 / $1,550.)
    ADDITIONAL_STD_65: { unmarried: 2050, married: 1650, year: 2026, source: "IRS https://www.irs.gov/pub/irs-drop/rp-25-32.pdf", lastVerified: "2026-10-01" },
    // Schedule R: only the 2025 instructions are published. Initial amounts and the single-filer AGI limit.
    SCHEDULE_R: { initialSingle: 5000, initialJointBoth: 7500, initialMFS: 3750, agiLimitSingle: 17500, year: 2025, source: "IRS https://www.irs.gov/pub/irs-pdf/i1040sr.pdf", lastVerified: "2026-10-01" },
    // "...when you reach age 73." / "excise tax of 25%, 10% if the RMD is timely corrected within two years."
    RMD: { startAge: 73, exciseTaxPct: 25, correctedPct: 10, year: 2026, source: "IRS https://www.irs.gov/retirement-plans/retirement-plan-and-ira-required-minimum-distributions-faqs", lastVerified: "2026-10-01" },
    // Notice 2025-67: "increased from $108,000 to $111,000". The tips said $105,000 (2024), the coach $108,000 (2025).
    QCD_LIMIT: { value: 111000, minAge: "70½", year: 2026, source: "IRS https://www.irs.gov/pub/irs-drop/n-25-67.pdf", lastVerified: "2026-10-01" },
    SE_TAX: { ratePct: 15.3, year: 2026, source: "IRS https://www.irs.gov/businesses/small-businesses-self-employed/self-employment-tax-social-security-and-medicare-taxes", lastVerified: "2026-10-01" },
    QBI: { pct: 20, year: 2026, source: "IRS https://www.irs.gov/newsroom/qualified-business-income-deduction", lastVerified: "2026-10-01" },
    // "...the lesser of: 25% of the employee's compensation, or $72,000 for 2026". (The tip said $69,000, 2024.)
    SEP_LIMIT: { value: 72000, pctOfComp: 25, year: 2026, source: "IRS https://www.irs.gov/retirement-plans/plan-participant-employee/sep-contribution-limits-including-grandfathered-sarseps", lastVerified: "2026-10-01" },
    // Pub 15-B (2026): "the annual dependent care FSA limit was raised from $5,000 to $7,500".
    DEPENDENT_CARE_FSA: { value: 7500, year: 2026, source: "IRS https://www.irs.gov/publications/p15b", lastVerified: "2026-10-01" },
    IRA_FIRST_HOME: { value: 10000, year: 2025, source: "IRS https://www.irs.gov/publications/p590b", lastVerified: "2026-10-01" },
    // SNAP maximum allotment, household of 1, 48 states and DC, FY2027 (from October 1, 2026).
    SNAP_MAX_1: { value: 306, year: "FY2027", source: "USDA https://www.fns.usda.gov/snap/allotment/cola", lastVerified: "2026-10-01" },
    // States. NY: "limited to $400 per eligible student"; the deduction "is $10,000 for each eligible student";
    // "either the credit or the deduction, but not both." IL: 25% "after the first $250", "may not exceed $750".
    NY_TUITION: { creditMax: 400, deductionMax: 10000, year: 2025, source: "tax.ny.gov https://www.tax.ny.gov/pit/credits/college_tuition_credit.htm", lastVerified: "2026-10-01" },
    IL_EDUCATION: { ratePct: 25, afterFirst: 250, max: 750, year: 2026, source: "tax.illinois.gov https://tax.illinois.gov/research/publications/pubs/education-expense-credit-general-rules.html", lastVerified: "2026-10-01" },
  },
};
