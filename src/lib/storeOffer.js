// src/lib/storeOffer.js
// -----------------------------------------------------------------------------
// THE OFFER IN THE STORE APPS (version 1.1), EXACTLY AS DECIDED AND NO WIDER.
//
// One free month, as the store's own introductory offer, then the subscription; no free tier after it (a hard
// paywall). The free month starts when the household confirms the subscription in the App Store or Google Play
// sheet — never when the app is installed, never when it is updated — because it IS the store's introductory
// offer: the store starts it at that confirmation and reports it to the server as a 'trialing' row
// (netlify/functions/_lib/storeSubscriptions.js). Nothing in the app starts a trial in a store build that sells:
// the 14-day signup trial is not counted there (planRules.deriveEntitlement, planFromProfile.storePlan), and the
// boot-time trial start does not run (App.jsx).
//
// WHAT MAY BE CLAIMED. The free month is mentioned only when the store says this account can have it: on
// Google Play, a free phase on the offer Google returns (Google only returns offers the account is eligible for);
// on the App Store, an introductory offer on the product AND RevenueCat's eligibility answer "eligible". Unknown
// is not eligible: the screen never promises a free month the store may not give. Prices are the store's own
// formatted strings (priceString), never a number of ours, so the screen shows what the store will charge.
// No saving is claimed between plans, nothing is called the best, and nothing tells the household what to do
// with its money.
// -----------------------------------------------------------------------------

const PERIOD = Object.freeze({ monthly: "a month", annual: "a year", founding_annual: "a year" });
const ELIGIBLE = 2;          // RevenueCat INTRO_ELIGIBILITY_STATUS_ELIGIBLE

/** May this account have the store's free month on this package? */
export function introEligible(pkg, platform, iosEligibility = {}) {
  const product = pkg && pkg.product;
  if (!product) return false;
  if (platform === "android") {
    const free = product.defaultOption && product.defaultOption.freePhase;
    return !!free && /^P1M$/.test(String(free.billingPeriod && free.billingPeriod.iso8601 || free.billingPeriod || ""));
  }
  if (platform === "ios") {
    const e = iosEligibility[product.identifier];
    const intro = product.introPrice;
    return !!intro && intro.price === 0 && intro.periodUnit === "MONTH" && intro.periodNumberOfUnits === 1 && !!e && e.status === ELIGIBLE;
  }
  return false;
}

/** The words for one plan's offer. plan: "monthly" | "annual" | "founding_annual". */
export function offerCopy({ plan, priceString, eligible = false, platform = "ios" }) {
  const per = PERIOD[plan];
  if (!per || typeof priceString !== "string" || !priceString.trim()) return null;
  const price = `${priceString.trim()} ${per}`;
  const store = platform === "android" ? "Google Play account" : "Apple Account";
  const where = platform === "android" ? "in Google Play, under Payments and subscriptions" : "in your Apple Account settings, under Subscriptions";
  const name = plan === "founding_annual" ? "Founding annual" : plan === "annual" ? "Annual" : "Monthly";
  return {
    name,
    price,
    trialLine: eligible ? `The first month is free. Then ${price}.` : null,
    button: eligible ? "Try the first month free" : `Subscribe for ${price}`,
    terms: [
      eligible
        ? `Nothing is charged today. When the free month ends, ${price} is charged to your ${store}, unless you cancel at least 24 hours before it ends.`
        : `${price} is charged to your ${store} when you confirm.`,
      `The subscription renews at ${price} unless you cancel at least 24 hours before the end of the period. You can manage or cancel it ${where}.`,
    ],
  };
}

export const PAYWALL_COPY = Object.freeze({
  title: "Flourish, with everything in it",
  lead: "A subscription opens the whole app: Today, Watch, Meet, the coach and Credit.",
  dataSafe: "Your accounts, bills and history stay exactly as they are.",
  restore: "Restore purchases",
  terms: "Terms of Use",
  privacy: "Privacy Policy",
  signOut: "Sign out",
  deleteAccount: "Delete my account",
  checking: "Confirming with the store…",
  checkAgain: "Check again",
  storeUnavailable: "The store couldn't be reached just now. Your data is safe. Restore purchases works once the store answers.",
  outcomes: Object.freeze({
    paid: null,
    already_paid: "This account already has a subscription, so nothing was bought here.",
    web_attention: "This account's subscription on the Flourish website didn't renew: its last payment didn't go through. Nothing was bought here. Once the payment goes through on the website, this screen opens the app.",
    charged_twice: "This account already had a subscription, and the store took this purchase as well. Your access stays as it is. You can ask the store that charged you for a refund of this purchase: Apple at reportaproblem.apple.com, or Google Play from your order history. For help, email hello@flourishmoney.app.",
    cancelled: null,
    pending: "The store is still waiting on this purchase. It opens as soon as the store confirms it.",
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
