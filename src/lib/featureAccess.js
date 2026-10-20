// src/lib/featureAccess.js
// -----------------------------------------------------------------------------
// WHICH FEATURES A HOUSEHOLD CAN OPEN, in one place the screens and the tests share.
//
// ONE RULE FOR EVERY APP (founder's decision, 2026-10-20). The iOS and Android apps follow the web: a
// trial, a paid plan (bought on the web) or a founder flag opens Credit, the Meet facilitator and the
// coach without its weekly limit, and the free plan does not. Until that date a store app opened all
// three to every user for good; nothing here takes a platform any more, so no caller can bring that back.
// The server holds every app to the same plan (netlify/functions/_lib/planRules.js deriveEntitlement,
// coach.js, plaid.js), including store installs whose bundled code still says otherwise.
// What a store app SAYS when one of these is closed is in src/lib/freePlan.js: no price, no upgrade.
// -----------------------------------------------------------------------------
import { isUnlimited } from "./usageLimits.js";

// Do → Credit. isPremium is the App's plan state (trial, paid or founder).
export function creditAvailable({ isPremium = false } = {}) {
  return !!isPremium;
}

// Meet: the coach-run meeting (the agenda itself is always shown).
export function facilitatorAvailable() {
  return isUnlimited();
}

// Coach: whether the weekly message limit is lifted for this household.
export function coachUnlimited({ isPremium = false } = {}) {
  return !!isPremium;
}
