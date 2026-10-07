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
export function foundingOfferCopy() {
  const p = getPricing("CA");
  return {
    heading: `Founding price for the first ${FOUNDING_HOUSEHOLDS} households`,
    price: `${formatPrice(p.foundingAnnual)} a year plus tax, for as long as you stay subscribed. Paid and used on flourishmoney.app. Not yet available in the iPhone and Android apps.`,
    regular: `Regular price: ${formatPrice(p.annual)} a year or ${formatPrice(p.monthly)} a month, plus tax.`,
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
// version). Four rows. The prices are read from pricing.js and the saving is worked out from the two annual
// prices, never typed here. No count read: no pill. 0 left: no card (the block below still says full).
const _wholeOrCents = (n) => (Number.isInteger(n) ? `$${n}` : formatPrice(n));
export function foundingCardParts(spotsLeft) {
  if (spotsLeft === 0) return null;
  const p = getPricing("CA");
  const n = Number.isInteger(spotsLeft) && spotsLeft > 0 && spotsLeft <= FOUNDING_HOUSEHOLDS ? spotsLeft : null;
  const saving = Math.round((p.annual - p.foundingAnnual) * 100) / 100;
  return {
    eyebrow: `FOUNDING PRICE · FIRST ${FOUNDING_HOUSEHOLDS} HOUSEHOLDS`,
    price: `${formatPrice(p.foundingAnnual)} a year`,
    regular: `${formatPrice(p.annual)} a year`,
    pill: n === null ? null : `${n} of ${FOUNDING_HOUSEHOLDS} left`,
    save: `${_wholeOrCents(saving)} a year less than the regular ${formatPrice(p.annual)}.`,
    small: "Plus tax, for as long as you stay subscribed. Paid and used on flourishmoney.app. Not yet in the iPhone and Android apps.",
  };
}

// One read of the endpoint: the number, or null on any failure. Never throws.
export async function fetchFoundingSpots(fetchImpl = (typeof fetch === "function" ? fetch : null)) {
  if (!fetchImpl) return null;
  try {
    const res = await fetchImpl(FOUNDING_ENDPOINT, { headers: { Accept: "application/json" } });
    if (!res || !res.ok) return null;
    return spotsLeftFrom(await res.json());
  } catch {
    return null;
  }
}

// The ONE read per page load. The founding block and the founding line both ask; the first ask
// starts the request and every later ask gets the same answer, so the page makes one /api/founding call.
let _shared = null;
export function sharedFoundingSpots() {
  if (!_shared) _shared = fetchFoundingSpots();
  return _shared;
}
// For tests: forget the shared answer.
export function _resetSharedFoundingSpots() { _shared = null; }
