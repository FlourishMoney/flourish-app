// netlify/functions/_lib/foundingSeats.js
// -----------------------------------------------------------------------------
// THE FOUNDING SEATS (Amanda, 2026-10-29): the founding price goes to the first 50 households who subscribe to
// it, on the website, the App Store or Google Play. Migration 0029 holds the seats and the rules; this file is
// how the functions ask it.
//   seatsTaken     how many seats are held now, or null when it cannot be read (the caller fails closed)
//   takeSeat       a founding subscription's first payment succeeded (stripe-webhook.js, the store sync)
//   releaseSeat    a refund gave it back
// A seat is never refused for a payment that happened: past 50 (a store purchase at the same moment as the
// last seat) it is recorded with over_cap and logged here, and the household keeps what it paid for.
// Nothing here logs an email address or an account id.
// -----------------------------------------------------------------------------
"use strict";

const FOUNDING_SEAT_LIMIT = 50;   // the same 50 as _lib/foundingCohort.js FOUNDING_COHORT_LIMIT and 0029

// PostgREST's answers for "that function does not exist": 0029 not applied yet.
function functionMissing(error) {
  const code = error && error.code;
  return code === "PGRST202" || code === "42883";
}

/** Seats held now (taken, not refunded): a whole number from 0 up, or null. Never throws. */
async function seatsTaken(admin) {
  try {
    const { data, error } = await admin.rpc("founding_seats_taken");
    if (error) { console.error("[founding-seat] count:", functionMissing(error) ? "not_applied" : "read_failed"); return null; }
    const n = typeof data === "string" && /^\d+$/.test(data) ? Number(data) : data;
    return Number.isInteger(n) && n >= 0 ? n : null;
  } catch {
    console.error("[founding-seat] count:", "no_status");
    return null;
  }
}

/** Founding spots left (never below 0), or null when the count cannot be read. */
async function spotsLeft(admin) {
  const n = await seatsTaken(admin);
  return n === null ? null : Math.max(0, FOUNDING_SEAT_LIMIT - n);
}

/**
 * The first payment of this account's founding subscription succeeded: take its seat (once; 0029 ignores a
 * second call, a test address and a beta founder). Returns { taken, seats, overCap } or { skipped: true } when
 * 0029 is not applied yet (its backfill records the seat when it runs). Any other failure throws, so the
 * webhook answers 5xx and the provider retries.
 */
async function takeSeat(admin, userId, provider, ref = null) {
  const { data, error } = await admin.rpc("founding_seat_take", { p_user_id: userId, p_provider: provider, p_ref: ref });
  if (error) {
    if (functionMissing(error)) { console.error("[founding-seat] take:", "not_applied"); return { skipped: true }; }
    throw new Error(`founding seat: ${error.message}`);
  }
  const r = Array.isArray(data) ? data[0] : data;
  const out = { taken: !!(r && r.taken), seats: r && Number.isInteger(r.seats) ? r.seats : null, overCap: !!(r && r.over_cap) };
  if (out.taken && out.overCap) {
    console.error("[founding-seat] over the cap: a founding purchase past seat 50 was honoured", provider, out.seats);
  }
  return out;
}

/**
 * A refund: this account's seat goes back. true when a held seat was released. provider, when given, releases
 * only a seat taken through it. Throws like takeSeat.
 */
async function releaseSeat(admin, userId, { reason = "refund", provider = null } = {}) {
  const { data, error } = await admin.rpc("founding_seat_release", { p_user_id: userId, p_reason: reason, p_provider: provider });
  if (error) {
    if (functionMissing(error)) { console.error("[founding-seat] release:", "not_applied"); return false; }
    throw new Error(`founding seat release: ${error.message}`);
  }
  if (data === true) console.error("[founding-seat] released:", reason);
  return data === true;
}

module.exports = { FOUNDING_SEAT_LIMIT, functionMissing, seatsTaken, spotsLeft, takeSeat, releaseSeat };
