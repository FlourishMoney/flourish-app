// src/lib/foundingPlans.js
// -----------------------------------------------------------------------------
// A FOUNDING HOUSEHOLD IS ASKED TO PAY STRAIGHT AWAY (version 1.1.3, Amanda, 2026-10-28).
//
// Until 1.1.3 the store paywall opened only when the household asked (a locked screen's See plans, Settings), so a
// founding member installed the app, signed up, landed in the 14-day account trial, and nothing asked them to pay.
// Now, in a store app that sells (lib/storeBilling.js storeBillingOn), the existing plans screen opens by itself
// ONCE PER ACCOUNT, as soon as the account is in the app, when the server's store_status says:
//   founding.available  the founding price is offered to this account: its address holds a founding number and was
//                       confirmed by our link (netlify/functions/_lib/foundingCohort.js mayBuyFoundingPrice, the
//                       rule checkout and the store sync use; netlify/functions/billing.js store_status), and
//   paid false          no paid plan is active, from any provider (the server then never offers founding anyway).
// Founding annual is the first plan on it. It can always be closed, and once it has opened by itself it never does
// again for that account: See plans opens it any time. Every other household sees exactly what it saw before.
//
// FLOURISH FIRST (Amanda, 2026-11-05, from the 1.1.5 phone test). A first open starts with Flourish, never with the plans:
// the screen waits until the account has finished onboarding AND was already in the app on an earlier visit to this phone
// (a cold start, or coming back to the app from the background). So the founding offer comes on the second visit at the
// earliest, never over onboarding, the first-number screen or the first look at Today.
//
// "Once" is kept on the phone, per account (no server write): a list of the account ids it has opened for, which
// signing out keeps (App.jsx signOut). Deleting the account clears it with everything else.
// -----------------------------------------------------------------------------

export const FOUNDING_PLANS_SHOWN_KEY = "flourish_founding_plans_shown";
// Per account on this phone: the visit on which it was first in the app. Kept through sign-out, like the key above.
export const FOUNDING_FIRST_VISIT_KEY = "flourish_founding_first_visit";

/**
 * Was this account already in the app on an earlier visit to this phone? The first call for an account records the
 * current visit and answers false; later calls answer true once the visit has changed. Storage unreadable: false, so
 * nothing opens by itself.
 */
export function seenOnEarlierVisit(storage, userId, visitId) {
  if (!storage || !userId || !visitId) return false;
  let map = {};
  try {
    const v = JSON.parse(storage.getItem(FOUNDING_FIRST_VISIT_KEY) || "{}");
    if (v && typeof v === "object" && !Array.isArray(v)) map = v;
  } catch { return false; }
  if (typeof map[userId] !== "string") {
    const ids = Object.keys(map).slice(-19);
    const next = {};
    for (const k of ids) next[k] = map[k];
    next[userId] = String(visitId);
    try { storage.setItem(FOUNDING_FIRST_VISIT_KEY, JSON.stringify(next)); } catch { /* storage full or blocked */ }
    return false;
  }
  return map[userId] !== String(visitId);
}

/** The account ids the founding plans screen has opened by itself for, on this phone. */
function shownIds(storage) {
  if (!storage) return [];
  try {
    const v = JSON.parse(storage.getItem(FOUNDING_PLANS_SHOWN_KEY) || "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch { return []; }
}

/** Has the founding plans screen already opened by itself for this account, on this phone? */
export function foundingPlansShown(storage, userId) {
  return !!userId && shownIds(storage).includes(userId);
}

/** Remember that it opened by itself for this account. Storage full or blocked: the caller's session memory holds. */
export function rememberFoundingPlansShown(storage, userId) {
  if (!storage || !userId) return;
  const ids = shownIds(storage);
  if (ids.includes(userId)) return;
  try { storage.setItem(FOUNDING_PLANS_SHOWN_KEY, JSON.stringify([...ids, userId].slice(-20))); } catch { /* storage full or blocked */ }
}

/**
 * Should the plans screen open by itself now? Only when every one of these holds:
 *   storeBilling   a store build that sells
 *   userId         signed in, and askedFor === userId: this account's own store_status answer is in
 *   status         that answer: founding.available true, paid false, no founding switch (held_on_regular_plan),
 *                  no web subscription the store must not sell on top of (web_attention)
 *   planKnown      the account's plan is known too (App's storeEntitledNow), so nothing closes it straight after
 *   inApp          the account is in the app: its data is loaded, Apple's AI disclosure has been answered, and onboarding
 *                  is finished
 *   earlierVisit   it was already in the app on an earlier visit to this phone (seenOnEarlierVisit): never the first open
 *   shown false    it has not opened by itself for this account before
 */
export function foundingPlansAutoOpen({ storeBilling = false, userId = null, askedFor = null, status = null, planKnown = false, inApp = false, earlierVisit = false, shown = false } = {}) {
  if (!storeBilling || !userId || askedFor !== userId || !status || typeof status !== "object") return false;
  if (!planKnown || !inApp || !earlierVisit || shown) return false;
  if (status.paid === true || status.web_attention === true) return false;
  const f = status.founding;
  if (!f || f.available !== true || f.held_on_regular_plan) return false;
  return true;
}

/** The plans on the paywall, in order: Founding annual first when it is offered, then Monthly and Annual as before. */
export function paywallPlanOrder(pkgs) {
  if (!pkgs) return [];
  return [["founding_annual", pkgs.founding], ["monthly", pkgs.monthly], ["annual", pkgs.annual]].filter(([, p]) => !!p);
}
