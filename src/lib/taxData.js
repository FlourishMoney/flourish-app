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
// -----------------------------------------------------------------------------

export const TAX_DATA = {
  CA: {
    RRSP_LIMIT:        { value: 33810, year: 2026, source: "CRA",            lastVerified: "2026-06-09" },
    TFSA_LIMIT:        { value: 7000,  year: 2026, source: "CRA",            lastVerified: "2026-06-09" },
    FHSA_ANNUAL:       { value: 8000,             source: "CRA",            lastVerified: "2026-06-09" },
    FHSA_LIFETIME:     { value: 40000,            source: "CRA",            lastVerified: "2026-06-09" },
    CCB_MAX_UNDER_6:   { value: 7997,  period: "2025-07/2026-06", source: "CRA", lastVerified: "2026-06-09" },
    CCB_MAX_6_TO_17:   { value: 6748,  period: "2025-07/2026-06", source: "CRA", lastVerified: "2026-06-09" },

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
  },
};
