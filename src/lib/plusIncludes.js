// src/lib/plusIncludes.js
// -----------------------------------------------------------------------------
// WHAT FLOURISH PLUS ADDS, ON THE WEBSITE'S LOCKED SCREENS ("Flourish Plus includes:", PremiumGate).
//
// Approved word for word on 2026-10-20 (ChatGPT and Grok agreed). It replaces six lines that named features
// the free plan also has. Only what the free plan does not include, or limits, is listed. The website shows
// it; a store app never does (it has its own lines, lib/freePlan.js and lib/storeOffer.js).
// tests/webPlusIncludes.test.cjs pins each line exactly. Do not reword them here.
// -----------------------------------------------------------------------------

export const PLUS_INCLUDES = Object.freeze([
  "The coach with no weekly limit",
  "What-If as often as you like",
  "More than one connected bank",
  "Credit",
  "The coach-run money meeting",
]);
