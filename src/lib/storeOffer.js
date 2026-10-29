// src/lib/storeOffer.js
// -----------------------------------------------------------------------------
// THE OFFER IN THE STORE APPS (version 1.1), EXACTLY AS DECIDED AND NO WIDER (founder's decisions, 2026-10-20).
//
// No store trial and no introductory offer on any product: a store subscription is charged when the household
// confirms it in the App Store or Google Play sheet. The only trial is the 14-day account trial (#84), the same on
// the web and in the apps, and after it the free plan, not a wall: the paywall opens only when the household asks
// (a locked screen's "See plans", Settings) and can always be closed.
//
// Prices are the store's own formatted strings (priceString), never a number of ours, so the screen shows what the
// store will charge. The website's prices and checkout are never mentioned, and nothing links out to pay. No saving
// is claimed between plans, nothing is called the best, and nothing tells the household what to do with its money.
//
// EVERY LINE HERE IS APPROVED WORD FOR WORD, 2026-10-20 (ChatGPT and Grok agreed): the disclosures, the three links
// and the founding line first, then the rest of the paywall, the outcomes and the Settings lines, with three changes
// (no "exactly"; "Try Restore purchases again shortly."; the website never named). tests/iapApprovedCopy.test.cjs
// pins each. Do not reword them here. FOUNDING_SWITCH_COPY below is still unwritten, and TRIAL_KEEP_COPY is to come.
// -----------------------------------------------------------------------------

import { pendingWords } from "./pendingWords.js";

const PERIOD = Object.freeze({ monthly: "a month", annual: "a year", founding_annual: "a year" });

// Apple's standard licence agreement for apps (EULA). On iOS the paywall's "Terms of Use" opens it (Guideline 3.1.2).
export const APPLE_EULA_URL = "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/";

// Approved 2026-10-20. Under the plans, once per paywall, for the platform the app runs on.
export const STORE_DISCLOSURE = Object.freeze({
  ios: "Payment is charged to your Apple Account when you confirm. Your subscription renews automatically unless you cancel at least 24 hours before the current period ends. You can manage or cancel it in your Apple Account settings.",
  android: "Payment is charged through Google Play when you confirm. Your subscription renews automatically unless you cancel before the renewal date. You can manage or cancel it in Google Play under Subscriptions.",
});

// Approved 2026-10-20. The founding plan's card.
// (2026-10-29: the first 50 who subscribe; the words that assumed a waitlist number are to come, lib/pendingWords.js)
export const FOUNDING_LINE = pendingWords("store-founding-line");

/** The words for one plan. plan: "monthly" | "annual" | "founding_annual". */
export function offerCopy({ plan, priceString, platform = "ios" }) {
  const per = PERIOD[plan];
  if (!per || typeof priceString !== "string" || !priceString.trim()) return null;
  const price = `${priceString.trim()} ${per}`;
  const name = plan === "founding_annual" ? "Founding annual" : plan === "annual" ? "Annual" : "Monthly";
  return {
    name,
    price,
    note: plan === "founding_annual" ? FOUNDING_LINE : null,
    button: `Subscribe for ${price}`,
  };
}

/** The approved disclosure under the plans, for this platform. */
export function storeDisclosure(platform) {
  return platform === "android" ? STORE_DISCLOSURE.android : STORE_DISCLOSURE.ios;
}

// THE FOUNDING SWITCH (2026-10-18): a household holding a founding position while a regular store subscription is
// live (storeBilling.js foundingSwitch). The founder writes these words; none is written here. Until they are,
// Settings shows no way in, and the paywall in this state shows only the store's own "Manage subscription" screen.
//   settingsLine, settingsButton  the Subscription card in Settings: that this household holds a founding position,
//                                 and the button that opens the paywall in this state
//   title, body                   the paywall: why the founding price is not offered on top of the regular plan,
//                                 and that cancelling it in the store's screen makes it available when it ends
//   bodyCancelled                 the same, once the regular plan will not renew (it is already cancelled)
export const FOUNDING_SWITCH_COPY = Object.freeze({ settingsLine: null, settingsButton: null, title: null, body: null, bodyCancelled: null });

// KEEP THE TRIAL (2026-10-29, Amanda). The founding plans screen (1.1.3) opens by itself for every account the server
// offers the founding price to. Under the plans, small print (link) lets a household in its 14-day trial say "not
// now": it opens a confirm (title, body) with two buttons, stay (back to the plans) and leave (close the plans and
// keep the trial). The body states the live founding spots left ({n}, store_status founding.spots_left), and the
// facts: the founding price is first come, first served among people who subscribe; it is not held for them; they
// can still choose it later if spots remain. The words are still to come (lib/pendingWords.js).
export const TRIAL_KEEP_COPY = Object.freeze({
  link: pendingWords("trial-link"),
  title: pendingWords("trial-confirm-title"),
  stay: pendingWords("trial-confirm-stay"),
  leave: pendingWords("trial-confirm-leave"),
});
/** The confirm's body with the live spots left, or null when there is no count to state (then no link shows). */
export function trialConfirmBody(spotsLeft) {
  return Number.isInteger(spotsLeft) && spotsLeft > 0 && spotsLeft <= 50 ? pendingWords("trial-confirm-body", spotsLeft) : null;
}
/**
 * Does the trial link show under the plans? Only on the founding plans screen (the server offers the founding price
 * and says how many spots are left), to a household in its trial (there is a trial to keep), when it can be closed.
 */
export function trialKeepShown({ status = null, inTrial = false, closable = false, foundingCard = false } = {}) {
  return !!(inTrial && closable && foundingCard && status && status.paid !== true && status.founding && status.founding.available === true
    && trialConfirmBody(status.founding.spots_left) !== null);
}

// APPROVED 2026-10-21 (ChatGPT and Grok agreed), word for word: Settings' Subscription card in a store app, for an
// account that holds a founding spot while it pays for a regular store plan (store_status founding.held_on_regular_plan,
// netlify/functions/billing.js: paid, monthly or annual, in the App Store or Google Play, and still offered the founding
// price). Which line follows the store the subscription is in, since that is where it is cancelled: B1 for the App
// Store, B2 for Google Play. Never on the website (Settings renders the card only in a selling store build), never
// without a founding spot, never once the household is on Founding annual. tests/privacyAndWords.test.cjs.
export const FOUNDING_SPOT_LINE = Object.freeze({
  // (2026-10-29: the first 50 who subscribe; the words that assumed a waitlist number are to come, lib/pendingWords.js)
  app_store: pendingWords("store-founding-spot-line-ios"),
  play_store: pendingWords("store-founding-spot-line-android"),
});

/** B1 or B2 for this store status, or null. */
export function foundingSpotLine(status) {
  if (!status || status.paid !== true) return null;
  if (status.provider !== "app_store" && status.provider !== "play_store") return null;
  if (status.plan_key !== "monthly" && status.plan_key !== "annual") return null;
  const held = status.founding && status.founding.held_on_regular_plan;
  if (!held || typeof held !== "object") return null;
  return FOUNDING_SPOT_LINE[status.provider];
}

export const PAYWALL_COPY = Object.freeze({
  title: "Flourish Plus",
  lead: "Flourish Plus adds Credit and the coach-run meeting, and lifts the free plan's limits on the coach and What-If.",
  dataSafe: "Your accounts, bills and history stay as they are.",
  terms: "Terms of Use",          // approved 2026-10-20 (on iOS it opens Apple's standard EULA)
  privacy: "Privacy Policy",      // approved 2026-10-20
  restore: "Restore purchases",   // approved 2026-10-20
  close: "Close",
  checking: "Confirming with the store…",
  checkAgain: "Check again",
  storeUnavailable: "The store couldn't be reached just now. Your data is safe. Restore purchases works once the store answers.",
  outcomes: Object.freeze({
    paid: null,
    already_paid: "This account already has a subscription, so nothing was bought here.",
    web_attention: "This account's subscription didn't renew: its last payment didn't go through. Nothing was bought here.",
    charged_twice: "This account already had a subscription, and the store took this purchase as well. Your access stays as it is. You can ask the store that charged you for a refund of this purchase: Apple at reportaproblem.apple.com, or Google Play from your order history. For help, email hello@flourishmoney.app.",
    cancelled: null,
    pending: "The store is still waiting on this purchase. Full access starts as soon as the store confirms it.",
    failed: "The store didn't complete the purchase. If you see a charge for it, tap Restore purchases.",
    unconfirmed: "The store took the purchase, and Flourish is still waiting to hear it from the store. Try Restore purchases again shortly.",
    nothing_to_restore: "No subscription was found for this store account.",
  }),
});

/** Settings' Subscription card: where this household's subscription is, in words. No price. A store app never
 *  names the website (2026-10-20): a household that paid there reads "This account has full access." */
export function subscriptionLine(status, { entitled = null } = {}) {
  if (status && status.paid) {
    if (status.provider === "app_store") return "Your subscription is through the App Store.";
    if (status.provider === "play_store") return "Your subscription is through Google Play.";
    return "This account has full access.";
  }
  if (entitled === true) return "This account has full access.";
  return "There's no subscription on this account yet.";
}

/** Deleting the account does not cancel a store subscription; the confirmation says where it is cancelled. */
export function storeCancelNote(provider) {
  if (provider === "app_store") return "The App Store subscription carries on until you cancel it in your Apple Account settings, under Subscriptions.";
  if (provider === "play_store") return "The Google Play subscription carries on until you cancel it in Google Play, under Payments and subscriptions.";
  return null;
}
