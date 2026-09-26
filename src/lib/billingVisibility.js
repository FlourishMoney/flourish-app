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

import { getPricing, formatPrice, monthlyEquivalentOfAnnual, annualSavingsPercent } from "./pricing.js";

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
  return { show: true, mode: paid ? "manage" : "plans", reason: "on" };
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
  const plans = [
    {
      key: "monthly",
      label: "Monthly",
      price: `${formatPrice(p.monthly)}/mo`,
      note: `${p.currency} plus tax`,
    },
    {
      key: "annual",
      label: "Annual",
      price: `${formatPrice(p.annual)}/yr`,
      sub: `${formatPrice(monthlyEquivalentOfAnnual(country))}/mo, billed annually`,
      note: `${p.currency} plus tax · save ${annualSavingsPercent(country)}% versus monthly`,
    },
  ];
  const founding = status?.founding;
  if (billingIsOn(status) && founding?.available === true && p.foundingAnnual != null) {
    plans.push({
      key: "founding_annual",
      label: "Founding Annual",
      price: `${formatPrice(p.foundingAnnual)}/yr`,
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
    text: "Payment received. Your plan updates as soon as Stripe confirms it, usually a few seconds.",
  };
  if (value === "cancelled") return { kind: "cancelled", text: "Checkout cancelled. Nothing was charged." };
  if (value === "portal_return") return { kind: "portal", text: "Subscription settings saved." };
  return null;
}

// The query keys this feature owns, so the caller can strip them from the URL afterwards.
export const BILLING_RETURN_PARAMS = Object.freeze(["billing", "session_id"]);
