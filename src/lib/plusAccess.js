// src/lib/plusAccess.js
// -----------------------------------------------------------------------------
// WHAT THE APP MAY SHOW FOR THE PLUS ADD-ON (2026-11-10), from the server's plus_status answer and nothing else.
// The app never decides Plus: no local flag, no cached purchase, no store receipt counts (netlify/functions/_lib/
// plusAddon.js decides, failing closed). And nothing here touches the main plan: src/lib/planFromProfile.js never
// imports this file, so whatever this answers, every feature the household has today stays.
//
//   no answer yet, 404 (PLUS_ENABLED off), or anything unexpected   nothing about Plus at all: no feature, no offer
//   503 status_unavailable          nothing about Plus, and one plain line (plus-status-unavailable), never a number
//   200 { enabled, plus: true }      the Plus features
//   200 { enabled, plus: false }     no Plus feature; the offer, unless the other member covers the household
// -----------------------------------------------------------------------------

export const PLUS_HIDDEN = Object.freeze({ show: false, plus: false, offer: false, notice: null });

export function plusView(res) {
  if (!res || typeof res !== "object") return PLUS_HIDDEN;
  if (res.status === 503) return Object.freeze({ show: false, plus: false, offer: false, notice: "plus-status-unavailable" });
  const b = res.body;
  if (res.status !== 200 || !b || b.enabled !== true || typeof b.plus !== "boolean") return PLUS_HIDDEN;
  if (b.plus === true) return Object.freeze({ show: true, plus: true, offer: false, notice: null });
  return Object.freeze({ show: true, plus: false, offer: !b.covered_by, notice: null });
}

/** A Plus feature (a screen, a card, a button into one) renders only on this. */
export const plusFeatureVisible = (view) => !!view && view.show === true && view.plus === true;
