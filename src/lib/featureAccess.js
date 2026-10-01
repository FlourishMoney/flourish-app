// src/lib/featureAccess.js
// -----------------------------------------------------------------------------
// WHICH FEATURES A HOUSEHOLD CAN OPEN, in one place the screens and the tests share.
//
// Store apps (iOS, Android) have nothing to buy in 1.0.0, so on a store build no feature closes when a
// trial ends: Credit and the Meet facilitator are open to every native user with no end date, until
// in-app purchase ships in 1.1. The coach keeps its weekly message limit and What-If its daily limit
// there, as usage limits that apply to every native user from the first day (usageLimits.coachIsUnlimited,
// usageLimits.simulationsAreUnlimited). The web is unchanged: a trial, a paid
// plan or a founder flag opens these features, and the free plan does not.
// -----------------------------------------------------------------------------
import { isUnlimited, coachIsUnlimited } from "./usageLimits.js";

// Do → Credit. isPremium is the App's plan state (trial, paid or founder).
export function creditAvailable({ native = false, isPremium = false } = {}) {
  return !!native || !!isPremium;
}

// Meet: the coach-run meeting (the agenda itself is always shown).
export function facilitatorAvailable({ native = false } = {}) {
  return !!native || isUnlimited();
}

// Coach: whether the weekly message limit is lifted for this household.
export function coachUnlimited({ native = false, isPremium = false } = {}) {
  return native ? coachIsUnlimited({ native: true }) : !!isPremium;
}
