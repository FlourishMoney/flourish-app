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
// Entries tagged `flaggedFor2026Verification: true` hold pre-2026 values migrated verbatim
// from App.jsx (Sprint 5: 401k/HSA/529/CPP/OAS). Their `lastVerified` marks the MIGRATION
// date, not a re-confirmation of the number — verify against CRA/IRS before the 2026 launch.
// Clean grep target:  flaggedFor2026Verification
// -----------------------------------------------------------------------------

export const TAX_DATA = {
  CA: {
    RRSP_LIMIT:        { value: 33810, year: 2026, source: "CRA",            lastVerified: "2026-06-09" },
    TFSA_LIMIT:        { value: 7000,  year: 2026, source: "CRA",            lastVerified: "2026-06-09" },
    FHSA_ANNUAL:       { value: 8000,             source: "CRA",            lastVerified: "2026-06-09" },
    FHSA_LIFETIME:     { value: 40000,            source: "CRA",            lastVerified: "2026-06-09" },
    CCB_MAX_UNDER_6:   { value: 7997,  period: "2025-07/2026-06", source: "CRA", lastVerified: "2026-06-09" },
    CCB_MAX_6_TO_17:   { value: 6748,  period: "2025-07/2026-06", source: "CRA", lastVerified: "2026-06-09" },

    // Sprint 5: migrated from inline App.jsx. CPP/OAS monthly maxima — the in-app values predate
    // 2026 and were kept as-is per migration scope; flagged for a 2026 CRA sweep.
    CPP_MAX_MONTHLY:   { value: 1364.60, label: "CPP max retirement pension, monthly at 65 (2025)", source: "CRA https://www.canada.ca/en/services/benefits/publicpensions/cpp/cpp-benefit/amount.html", lastVerified: "2026-06-09", flaggedFor2026Verification: true },
    OAS_MAX_MONTHLY:   { value: 727.67,  label: "OAS max monthly at 65 (2025)", source: "CRA https://www.canada.ca/en/services/benefits/publicpensions/old-age-security/benefit-amount.html", lastVerified: "2026-06-09", flaggedFor2026Verification: true },

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
    K401_DEFERRAL:       { value: 23500, label: "401(k) employee deferral (2025)", source: "IRS https://www.irs.gov/newsroom/401k-limit-increases-to-23500-for-2025-ira-limit-remains-7000", lastVerified: "2026-06-09", flaggedFor2026Verification: true },
    K401_CATCHUP_50PLUS: { value: 31000, label: "401(k) deferral + catch-up, age 50+ (2025)", source: "IRS https://www.irs.gov/newsroom/401k-limit-increases-to-23500-for-2025-ira-limit-remains-7000", lastVerified: "2026-06-09", flaggedFor2026Verification: true },
    HSA_SELF_ONLY:       { value: 4300,  label: "HSA self-only contribution limit (2025)", source: "IRS Rev. Proc. 2024-25 https://www.irs.gov/pub/irs-drop/rp-24-25.pdf", lastVerified: "2026-06-09", flaggedFor2026Verification: true },
    HSA_FAMILY:          { value: 8550,  label: "HSA family contribution limit (2025)", source: "IRS Rev. Proc. 2024-25 https://www.irs.gov/pub/irs-drop/rp-24-25.pdf", lastVerified: "2026-06-09", flaggedFor2026Verification: true },
    GIFT_EXCLUSION_529:  { value: 19000, label: "Annual gift-tax exclusion / 529 (2025)", source: "IRS https://www.irs.gov/newsroom/irs-releases-tax-inflation-adjustments-for-tax-year-2025", lastVerified: "2026-06-09", flaggedFor2026Verification: true },
  },
};
