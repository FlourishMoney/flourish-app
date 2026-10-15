// src/lib/foundingLink.js
// -----------------------------------------------------------------------------
// THE FOUNDING LINK (payments open 2026-10-26).
//
// The founding link email (netlify/functions/_lib/foundingLinkEmail.js) sends each founding household to
//   https://flourishmoney.app/?checkout=founding
// The link carries no address, no id and no token. It only asks the app to open the checkout screen.
// Whether that screen offers the founding price is the server's answer (billing.js status, from
// _lib/foundingCohort.js) for the signed-in account's own confirmed email, so a forwarded link gives
// nobody a price.
//
// What the app does with it, decided here so a test can ask without a browser:
//   a store app (iOS, Android)  nothing, ever: no way to pay inside a store app (Apple 3.1.3(b)). Forgotten.
//   signed out                  the sign-in card opens, with one line about which address to use.
//   signed in, status not back  wait.
//   billing off                 nothing: no screen and no price (the status call 404s, fails, or says
//                               something unrecognised). Forgotten.
//   billing on                  the checkout screen. If the founding price is not available to this
//                               account, one line says it is matched to the waitlist address.
// A link opened while signed out is remembered on this device for 7 days, so confirming a new account's
// email (which lands on /confirmed) and then signing in still ends at checkout.
// -----------------------------------------------------------------------------
import { billingIsOn } from "./billingVisibility.js";

export const FOUNDING_LINK_PARAM = "checkout";
export const FOUNDING_LINK_VALUE = "founding";
export const FOUNDING_LINK_URL = "https://flourishmoney.app/?checkout=founding";
export const FOUNDING_LINK_PENDING_KEY = "flourish_founding_link_at";
export const FOUNDING_LINK_TTL_MS = 7 * 86400000;

// Shown on the sign-in card when the link brought them there.
export const FOUNDING_SIGN_IN_NOTE = "Your founding price is matched to the email address you joined the waitlist with. Sign in, or create your account, with that address.";
// Shown on the checkout screen when the link brought them there and this account has no founding price.
export const FOUNDING_NOT_MATCHED_NOTE = "The founding price is matched to the email address that joined the waitlist. If you joined with a different address, sign in with that one.";

// Does this query string carry the founding link?
export function foundingLinkInUrl(search) {
  try {
    const q = String(search || "");
    return new URLSearchParams(q.startsWith("?") ? q.slice(1) : q).get(FOUNDING_LINK_PARAM) === FOUNDING_LINK_VALUE;
  } catch {
    return false;
  }
}

// The same query string without the founding link's parameter ("" when nothing is left).
export function withoutFoundingLink(search) {
  try {
    const q = String(search || "");
    const p = new URLSearchParams(q.startsWith("?") ? q.slice(1) : q);
    if (p.get(FOUNDING_LINK_PARAM) === FOUNDING_LINK_VALUE) p.delete(FOUNDING_LINK_PARAM);
    const s = p.toString();
    return s ? `?${s}` : "";
  } catch {
    return String(search || "");
  }
}

/**
 * What to do now.
 *   "none"     the link was not followed
 *   "forget"   drop it: a store app, or billing is off
 *   "sign_in"  show the sign-in card (with FOUNDING_SIGN_IN_NOTE)
 *   "wait"     signed in; the billing status has not come back yet
 *   "open"     open the checkout screen
 * `asked` is true once the status call for this account has finished, whatever it answered.
 */
export function foundingLinkAction({ requested, native, signedIn, asked, status } = {}) {
  if (!requested) return "none";
  if (native) return "forget";
  if (!signedIn) return "sign_in";
  if (!asked) return "wait";
  return billingIsOn(status) ? "open" : "forget";
}

// The line for the checkout screen, or null when the founding price is offered to this account.
export function foundingLinkNotice(status) {
  if (!billingIsOn(status)) return null;
  if (status.paid === true) return null;
  if (status.founding && status.founding.available === true) return null;
  // An older account holding a founding address: the screen's own card says what to do (round 4).
  if (status.founding && status.founding.confirmEmail === true) return null;
  return { kind: "founding", text: FOUNDING_NOT_MATCHED_NOTE };
}

// Remembering a link opened while signed out. Storage is passed in; every failure is "not remembered".
export function rememberFoundingLink(storage, now = Date.now()) {
  try { storage.setItem(FOUNDING_LINK_PENDING_KEY, String(now)); return true; } catch { return false; }
}
export function forgetFoundingLink(storage) {
  try { storage.removeItem(FOUNDING_LINK_PENDING_KEY); } catch { /* nothing to forget */ }
}
export function foundingLinkPending(storage, now = Date.now()) {
  try {
    const at = Number(storage.getItem(FOUNDING_LINK_PENDING_KEY));
    if (Number.isFinite(at) && at > 0 && now - at >= 0 && now - at < FOUNDING_LINK_TTL_MS) return true;
    storage.removeItem(FOUNDING_LINK_PENDING_KEY);
    return false;
  } catch {
    return false;
  }
}
