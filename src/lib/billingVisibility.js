// src/lib/billingVisibility.js
// -----------------------------------------------------------------------------
// WHETHER TO SHOW ANYTHING ABOUT MONEY, AND WHAT.
//
// Three gates, and every one of them must say yes before a price appears on a screen:
//
//   1. THE SERVER. netlify/functions/billing.js answers 404 to everything while BILLING_ENABLED
//      is unset. The client asks once; a 404, a network failure, or any answer it does not
//      understand means billing is off. Turning the flag on is the only step needed to show the
//      screen — there is no second switch in here to remember.
//   2. THE PLATFORM. Apple and Google require their own purchase systems for digital
//      subscriptions. In the iOS and Android builds nothing billing-related renders at all: no
//      price, no link, no button. See docs/ops/BILLING-SETUP.md.
//   3. THE HOUSEHOLD. Somebody already paying is offered the portal, not the plans.
//
// Prices come from src/lib/pricing.js and nowhere else. The founding COHORT SIZE comes from the
// server, so the number in the label cannot drift from the number the server enforces.
//
// Pure: every input is passed in, so the gate can test a native shell and a 404 offline.
// -----------------------------------------------------------------------------

import { pendingWords } from "./pendingWords.js";
import { getPricing, formatPrice } from "./pricing.js";

// A Capacitor shell, by either signal. getPlatform() is the direct answer; the URL scheme is the
// one that is already true before the native bridge finishes loading, which is when a screen can
// first render. Either is enough — this must not miss.
export function isNativeApp(win = typeof window === "undefined" ? undefined : window) {
  try {
    if (!win) return false;
    const platform = win.Capacitor?.getPlatform?.();
    if (platform === "ios" || platform === "android") return true;
    const proto = win.location?.protocol;
    return !!proto && proto !== "http:" && proto !== "https:";
  } catch {
    return false;
  }
}

// What the server's status call told us. Anything unrecognised is "off".
export function billingIsOn(status) {
  return !!(status && status.enabled === true);
}

/**
 * The single answer every billing surface asks for.
 *   { show: false }                         — render nothing at all
 *   { show: true, mode: "plans" | "manage" }
 * `native` is passed in rather than read, so a test can be a native shell without being one.
 */
export function billingUiState({ status, native, paid } = {}) {
  if (native) return { show: false, reason: "native" };
  if (!billingIsOn(status)) return { show: false, reason: "off" };
  // H4 (audit 2026-10-26): a web renewal that failed (past_due, status.web_attention) is fixed in the billing
  // portal, not by buying again: checkout refuses it (409) and would charge twice once the card worked.
  return { show: true, mode: paid || status.web_attention === true ? "manage" : "plans", reason: "on" };
}

/**
 * The plans to offer, in display order. Monthly and annual always; the founding annual ONLY when
 * the server says there is room for it. The client never works that out for itself.
 * Every amount comes from pricing.js.
 */
export function offeredPlans({ status } = {}) {
  // CA, WHATEVER THE PROFILE SAYS. A screen may only show a price the server can actually take:
  // the only Stripe price ids that exist are STRIPE_PRICE_*_CAD (_lib/billingPlans.js), so a US
  // profile shown $7.99 would have been charged $11.99 CAD — a different number from the one it
  // agreed to. US amounts stay in pricing.js behind their pending review; when US price ids exist,
  // this reads the country again and billingPlans maps it.
  const country = "CA";
  const p = getPricing(country);
  // THE LANDING PAGE'S WORDS (billing day, 2026-10-26): "$11.99 a month", "$99.99 a year", "$79.99 a year",
  // as the landing page and its founding card say them, and no other figure (no monthly equivalent, no
  // percentage). tests/upgradeEntryPoints.test.cjs holds every price here to the landing page's copy.
  const plans = [
    {
      key: "monthly",
      label: "Monthly",
      price: `${formatPrice(p.monthly)} a month`,
      note: `${p.currency} plus tax`,
    },
    {
      key: "annual",
      label: "Annual",
      price: `${formatPrice(p.annual)} a year`,
      note: `${p.currency} plus tax`,
    },
  ];
  const founding = status?.founding;
  if (billingIsOn(status) && founding?.available === true && p.foundingAnnual != null) {
    plans.push({
      key: "founding_annual",
      label: "Founding Annual",
      price: `${formatPrice(p.foundingAnnual)} a year`,
      // The ONLY claim made about this offer. No feature promises live here.
      note: foundingLabel(founding.cohortLimit),
    });
  }
  return plans;
}

// The cohort size is the server's number, rendered into the sentence rather than typed beside it.
export function foundingLabel(cohortLimit) {
  const n = Number.isFinite(cohortLimit) ? cohortLimit : null;
  return n === null
    ? "Founding price. Locked in while you stay subscribed."
    : `Founding price for the first ${n} households. Locked in while you stay subscribed.`;
}

/**
 * What to say when Stripe sends the browser back. A MESSAGE ONLY.
 *
 * There is deliberately no plan in this return value. A success redirect means the card was
 * accepted, not that the subscription exists: Stripe's own guidance is that the session can
 * complete before the subscription is created, and the redirect is a URL the user can type. The
 * plan changes when the webhook writes it and the profile is read back — never here.
 */
export function billingReturnNotice(search) {
  const value = (() => {
    try {
      const q = String(search || "");
      return new URLSearchParams(q.startsWith("?") ? q.slice(1) : q).get("billing");
    } catch { return null; }
  })();
  if (value === "success") return {
    kind: "success",
    text: "Payment received. Your plan will update when Stripe confirms it, usually within a few seconds.",
  };
  if (value === "cancelled") return { kind: "cancelled", text: "Checkout cancelled. Nothing was charged." };
  if (value === "portal_return") return { kind: "portal", text: "Back from Stripe's billing portal." };
  return null;
}

// WHAT THE CHECKOUT SCREEN SAYS WHEN STARTING A CHECKOUT FAILS. billing.js answers 403
// "founding_price_not_available" when this account may not have the founding price (no founding spot on
// its email, or a founding subscription that has ended); retrying never changes that, so it gets its own
// words. "founding_cohort_full" is an older name for the same refusal. Anything else is worth a retry.
// (2026-10-29: the first 50 who subscribe; the words that assumed a waitlist number are to come, lib/pendingWords.js)
export const FOUNDING_REFUSED_TEXT = pendingWords("checkout-founding-refused");
export function checkoutErrorText({ status, error } = {}) {
  if (status === 403 && (error === "founding_price_not_available" || error === "founding_cohort_full")) return FOUNDING_REFUSED_TEXT;
  if (error === "signed_out") return "Sign in again to continue.";
  // Version 1.1: checkout refuses a household that already pays, on the web or in a store app (billing.js).
  if (status === 409 && error === "already_subscribed") return "This account already has a subscription.";
  return "Couldn't reach checkout. Try again in a moment.";
}

// AN OLDER ACCOUNT HOLDING A FOUNDING ADDRESS (round 4). The status says founding.confirmEmail when this
// account's address holds a founding spot but was never confirmed from our link. The checkout screen then
// offers one tap to email a confirmation link (billing.js "send_founding_confirmation"). The words, exactly:
export const FOUNDING_CONFIRM_COPY = Object.freeze({
  title: "Your founding spot",
  body: "This account's email address holds a founding spot on the waitlist. To get the founding price, confirm the address from a link we email to it.",
  button: "Send me a confirmation link",
  sending: "Sending…",
  sent: "Sent. The link is in your inbox and works for 24 hours. After you confirm, come back to this screen.",
  limited: "A link was sent recently. Check your inbox, or ask again tomorrow.",
  failed: "Couldn't send the link. Try again in a moment.",
});
export function foundingConfirmOffered(status) {
  return billingIsOn(status) && status.paid !== true && !!status.founding
    && status.founding.confirmEmail === true && status.founding.available !== true;
}
// What the screen says after the tap, from the HTTP status: "sent" | "limited" | "failed".
export function foundingConfirmResult(httpStatus) {
  return httpStatus === 200 ? "sent" : httpStatus === 429 ? "limited" : "failed";
}

// The query keys this feature owns, so the caller can strip them from the URL afterwards.
export const BILLING_RETURN_PARAMS = Object.freeze(["billing", "session_id"]);
