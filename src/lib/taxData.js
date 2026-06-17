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

export const TAX_DATA = {
  CA: {
    RRSP_LIMIT:        { value: 33810, year: 2026, source: "CRA",            lastVerified: "2026-06-09" },
    TFSA_LIMIT:        { value: 7000,  year: 2026, source: "CRA",            lastVerified: "2026-06-09" },
    FHSA_ANNUAL:       { value: 8000,             source: "CRA",            lastVerified: "2026-06-09" },
    FHSA_LIFETIME:     { value: 40000,            source: "CRA",            lastVerified: "2026-06-09" },
    CCB_MAX_UNDER_6:   { value: 7997,  period: "2025-07/2026-06", source: "CRA", lastVerified: "2026-06-09" },
    CCB_MAX_6_TO_17:   { value: 6748,  period: "2025-07/2026-06", source: "CRA", lastVerified: "2026-06-09" },

    // CPP/OAS monthly maxima — re-verified against CRA 2026-06-16 (both were stale: CPP held the
    // 2024 figure, 2 years behind; OAS held the Jan-Mar 2026 quarter).
    CPP_MAX_MONTHLY:   { value: 1507.65, label: "CPP max retirement pension, monthly at 65 (2026)", source: "CRA https://www.canada.ca/en/services/benefits/publicpensions/cpp/cpp-benefit/amount.html", lastVerified: "2026-06-16" },
    // ⚠️ OAS re-adjusts EVERY quarter (Jan/Apr/Jul/Oct) and WILL be stale within ~3 months — re-verify
    // quarterly. A confirmed +1.2% increase (~$751.97) lands 2026-07-29. Wherever this is shown to a
    // user, label it "approximate, as of <date>" (it's a moving quarterly figure, not a fixed annual one).
    OAS_MAX_MONTHLY:   { value: 743.05,  label: "OAS max monthly at 65-74 (Apr-Jun 2026)", source: "CRA https://www.canada.ca/en/services/benefits/publicpensions/old-age-security/benefit-amount.html", lastVerified: "2026-06-16" },

    // GST/HST credit maxima — CONFIRMED correct in-app (external audits' $520/$589 were wrong).
    GSTHST_MAX_SINGLE: { value: 533,   period: "2025-26", source: "CRA", lastVerified: "2026-06-09" },
    GSTHST_MAX_COUPLE: { value: 698,   period: "2025-26", source: "CRA", lastVerified: "2026-06-09" },
    GSTHST_PER_CHILD:  { value: 184,   period: "2025-26", source: "CRA", lastVerified: "2026-06-09" },

    // The GST/HST credit becomes the Canada Groceries & Essentials Benefit in July 2026.
    CGEB: {
      effective: "2026-07",
      increasePct: 25,
      through: 2031,
      oneTimeTopUp: "2026-06-05", // 50% of the 2025-26 GST/HST credit
      note: "the Canada Groceries & Essentials Benefit (same eligibility, ~25% higher payments)",
      source: "CRA / PM announcement 2026-01",
      lastVerified: "2026-06-09",
    },
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
