// src/lib/foundingOffer.js
// -----------------------------------------------------------------------------
// THE FOUNDING OFFER BLOCK ON THE LANDING PAGE (Amanda's decision, 2026-10-06).
//
// The first 50 households on the waitlist get the founding price. The block sits directly under the
// hero's waitlist form, on the web landing page only (the store apps never show the landing page, and
// the block also renders nothing natively).
//
// THE LIVE LINE SHOWS ONLY A NUMBER IT READ. /api/founding answers {"spotsLeft": N}. Anything else (a
// failed request, a non-200, a body that is not a whole number from 0 to 50, a string "12") gives null,
// and null hides the line. There is no default, no estimate, no last-known figure.
// -----------------------------------------------------------------------------
import { getPricing, formatPrice } from "./pricing.js";

export const FOUNDING_HOUSEHOLDS = 50;
export const FOUNDING_ENDPOINT = "/api/founding";

// The words, exactly as approved (2026-10-07 review). The prices are read from pricing.js, never typed here.
// After the launch (signup open, `launched`), the two bits that went stale come out (Amanda, 2026-10-15):
// "Join the waitlist." (the button now says "Get my founding spot") and "Payments open October 26."
// Nothing is added.
const LAUNCHED_JOIN = `The first ${FOUNDING_HOUSEHOLDS} households on the waitlist get the founding price. Joining is free.`;
export function foundingOfferCopy({ launched = false } = {}) {
  const p = getPricing("CA");
  if (launched === true) return { ...foundingOfferCopy(), join: LAUNCHED_JOIN, phoneJoin: LAUNCHED_JOIN };
  return {
    heading: `Founding price for the first ${FOUNDING_HOUSEHOLDS} households`,
    price: `${formatPrice(p.foundingAnnual)} a year plus tax, for as long as you stay subscribed. Paid and used on flourishmoney.app. Not yet available in the iPhone and Android apps.`,
    regular: `Standard price for everyone else: ${formatPrice(p.annual)} a year or ${formatPrice(p.monthly)} a month, plus tax.`,
    join: `Join the waitlist. The first ${FOUNDING_HOUSEHOLDS} households on the waitlist get the founding price. Payments open October 26. Joining is free.`,
    // Under 960px the founding card at the top already shows the price and the count, so the block
    // says how the spots work instead (2026-10-07): this heading, phoneJoin, then the regular price.
    phoneHeading: "How founding spots work",
    phoneJoin: `The first ${FOUNDING_HOUSEHOLDS} households on the waitlist get the founding price. Payments open October 26. Joining is free.`,
  };
}

// The spots-left number from the endpoint's body, or null.
export function spotsLeftFrom(body) {
  const n = body && typeof body === "object" ? body.spotsLeft : undefined;
  return Number.isInteger(n) && n >= 0 && n <= FOUNDING_HOUSEHOLDS ? n : null;
}

// The live line for a number that was read, or null (no line).
export function foundingLiveLine(spotsLeft) {
  if (!Number.isInteger(spotsLeft) || spotsLeft < 0 || spotsLeft > FOUNDING_HOUSEHOLDS) return null;
  if (spotsLeft === 0) return "Founding spots are full. Join the waitlist for launch news.";
  return `${spotsLeft} of ${FOUNDING_HOUSEHOLDS} founding spots left`;
}

// THE FOUNDING CARD above the hero's email field, on phones and tablets (2026-10-07; replaces the one-line
// version). Four rows. The prices are read from pricing.js, never typed here. No count read: no pill. 0 left:
// no card (the block below still says full). 2026-10-14: no struck-through price beside the founding one,
// and no saving claim; the price everyone else pays is stated plainly instead.
export function foundingCardParts(spotsLeft) {
  if (spotsLeft === 0) return null;
  const p = getPricing("CA");
  const n = Number.isInteger(spotsLeft) && spotsLeft > 0 && spotsLeft <= FOUNDING_HOUSEHOLDS ? spotsLeft : null;
  return {
    eyebrow: `FOUNDING PRICE · FIRST ${FOUNDING_HOUSEHOLDS} HOUSEHOLDS`,
    price: `${formatPrice(p.foundingAnnual)} a year`,
    pill: n === null ? null : `${n} of ${FOUNDING_HOUSEHOLDS} left`,
    // In this order on the card (2026-10-15): the founding price, its terms, then what everyone else pays.
    small: "Plus tax, for as long as you stay subscribed. Paid and used on flourishmoney.app. Not yet in the iPhone and Android apps.",
    save: `Everyone else: ${formatPrice(p.annual)} a year, plus tax.`,
  };
}

// Whether signup is open, from the same answer (billing day, 2026-10-15): true, false, or null when the
// answer said nothing about it. Only a real boolean counts.
export function openSignupFrom(body) {
  const v = body && typeof body === "object" ? body.openSignup : undefined;
  return v === true ? true : v === false ? false : null;
}

// One read of the endpoint: { spotsLeft, openSignup }. The count only from a 200; whether signup is open from
// any answer that says (a 503 still does). Anything unreadable is null. Never throws.
export async function fetchFoundingAnswer(fetchImpl = (typeof fetch === "function" ? fetch : null)) {
  if (!fetchImpl) return { spotsLeft: null, openSignup: null };
  try {
    const res = await fetchImpl(FOUNDING_ENDPOINT, { headers: { Accept: "application/json" } });
    if (!res) return { spotsLeft: null, openSignup: null };
    let body = null;
    try { body = await res.json(); } catch { body = null; }
    return { spotsLeft: res.ok ? spotsLeftFrom(body) : null, openSignup: openSignupFrom(body) };
  } catch {
    return { spotsLeft: null, openSignup: null };
  }
}

// The number alone, or null on any failure. Never throws.
export async function fetchFoundingSpots(fetchImpl = (typeof fetch === "function" ? fetch : null)) {
  return (await fetchFoundingAnswer(fetchImpl)).spotsLeft;
}

// The ONE read per page load. The founding block, the founding line and the landing's waitlist area all ask;
// the first ask starts the request and every later ask gets the same answer, so the page makes one
// /api/founding call.
let _shared = null;
export function sharedFoundingAnswer() {
  if (!_shared) _shared = fetchFoundingAnswer();
  return _shared;
}
export function sharedFoundingSpots() {
  return sharedFoundingAnswer().then(a => a.spotsLeft);
}
// For tests: forget the shared answer.
export function _resetSharedFoundingSpots() { _shared = null; }
