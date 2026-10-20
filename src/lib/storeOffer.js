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
// EVERY LINE HERE NEEDS REVIEW (ChatGPT and Grok) before it ships.
// -----------------------------------------------------------------------------

const PERIOD = Object.freeze({ monthly: "a month", annual: "a year", founding_annual: "a year" });

// Apple's standard licence agreement for apps (EULA), linked from the iOS paywall (Guideline 3.1.2).
export const APPLE_EULA_URL = "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/";

/** The words for one plan. plan: "monthly" | "annual" | "founding_annual". */
export function offerCopy({ plan, priceString, platform = "ios" }) {
  const per = PERIOD[plan];
  if (!per || typeof priceString !== "string" || !priceString.trim()) return null;
  const price = `${priceString.trim()} ${per}`;
  const store = platform === "android" ? "Google Play account" : "Apple Account";
  const where = platform === "android" ? "in Google Play, under Payments and subscriptions" : "in your Apple Account settings, under Subscriptions";
  const name = plan === "founding_annual" ? "Founding annual" : plan === "annual" ? "Annual" : "Monthly";
  return {
    name,
    price,
    note: plan === "founding_annual" ? "Founding price for the first 50 households. Locked in while you stay subscribed." : null,
    button: `Subscribe for ${price}`,
    terms: [
      `${price} is charged to your ${store} when you confirm.`,
      `The subscription renews automatically at ${price} unless you cancel at least 24 hours before the end of the period. You can manage or cancel it ${where}.`,
    ],
  };
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

export const PAYWALL_COPY = Object.freeze({
  title: "Flourish Plus",
  lead: "Flourish Plus adds Credit and the coach-run meeting, and lifts the free plan's limits on the coach and What-If.",
  dataSafe: "Your accounts, bills and history stay exactly as they are.",
  restore: "Restore purchases",
  terms: "Terms of Use",
  privacy: "Privacy Policy",
  eula: "Apple's licence agreement (EULA)",
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
    unconfirmed: "The store took the purchase, and Flourish is still waiting to hear it from the store. Tap Restore purchases in a minute.",
    nothing_to_restore: "No subscription was found for this store account.",
  }),
});

/** Settings' Subscription card: where this household's subscription is, in words. No price. */
export function subscriptionLine(status, { entitled = null } = {}) {
  if (status && status.paid) {
    if (status.provider === "app_store") return "Your subscription is through the App Store.";
    if (status.provider === "play_store") return "Your subscription is through Google Play.";
    return "Your subscription is through the Flourish website.";
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
