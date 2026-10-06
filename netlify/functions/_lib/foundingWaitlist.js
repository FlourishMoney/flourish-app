// netlify/functions/_lib/foundingWaitlist.js
// -----------------------------------------------------------------------------
// THE FOUNDING OFFER ON THE WAITLIST (Amanda's decision, 2026-10-06).
//
// The first 50 households on the waitlist, in created_at order, get the founding price. Test rows
// (is_test, migration 0014) never count. Each new row's position, 1 to 50 or null after 50, is set by
// the database at insert time (the 0014 trigger), so this module never assigns one: it only reads.
//
//   spotsLeftFromCount(n)  50 less the eligible rows, never below 0; null for anything not a count.
//   foundingWelcomeLine(p) the welcome email's one offer line for position p, or null.
//
// NOTE: this is the WAITLIST position. The billing cohort in _lib/foundingCohort.js (the first 50
// founding_annual subscriptions) is a separate rule and is not changed here.
// -----------------------------------------------------------------------------

"use strict";

const FOUNDING_WAITLIST_LIMIT = 50;

// A count PostgREST really returned, or null. Never a guess, never a default.
function spotsLeftFromCount(count) {
  if (!Number.isInteger(count) || count < 0) return null;
  return Math.max(0, FOUNDING_WAITLIST_LIMIT - count);
}

// The total from a PostgREST Content-Range header ("0-0/37" or "*/37"), or null.
function countFromContentRange(range) {
  const m = typeof range === "string" && /\/(\d+)\s*$/.exec(range);
  return m ? Number(m[1]) : null;
}

function isFoundingPosition(p) {
  return Number.isInteger(p) && p >= 1 && p <= FOUNDING_WAITLIST_LIMIT;
}

function foundingWelcomeLine(position) {
  if (!isFoundingPosition(position)) return null;
  return `You're founding household #${position} of ${FOUNDING_WAITLIST_LIMIT}. We'll email your link to the founding price when payments open on October 26.`;
}

module.exports = { FOUNDING_WAITLIST_LIMIT, spotsLeftFromCount, countFromContentRange, isFoundingPosition, foundingWelcomeLine };
