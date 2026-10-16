// netlify/functions/_lib/foundingWaitlist.js
// -----------------------------------------------------------------------------
// THE FOUNDING OFFER ON THE WAITLIST (Amanda's decision, 2026-10-06).
//
// The first 50 households on the waitlist, in created_at order, get the founding price. Test rows
// (is_test, or an address at getgrowsmart.com or flourishmoney.app) never count. Each new row's number
// is set by the database at insert time and recorded in a ledger that is never freed (0014); a test
// row's number is voided there and never reissued, and the database stops issuing numbers once 50 REAL
// households hold one (0017). So numbers can run past 50. This module never assigns one: it only reads.
//
//   spotsLeftFromCount(n)    50 less the real holders (numbers issued and not void), never below 0.
//   welcomePositionFor(row)  the number a welcome email may name for this row: null for a test row.
//   foundingWelcomeLine(p)   the welcome email's one offer line for number p, or null.
//
// Billing honours these positions: _lib/foundingCohort.js sells the founding price only to a confirmed
// account whose email matches a non-test row holding a number that is not void (migration 0017's lookup).
// -----------------------------------------------------------------------------

"use strict";

const { FOUNDING_COHORT_LIMIT, TEST_EMAIL_DOMAINS, isTestEmail, isFoundingPosition } = require("./foundingCohort");

// The same 50 as billing, from one place.
const FOUNDING_WAITLIST_LIMIT = FOUNDING_COHORT_LIMIT;

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

// A test row (is_test, or a test address) never has a founding number named in its email, whatever
// the row says: the database clears it, and this is the second guard.
function welcomePositionFor(row) {
  if (!row || row.is_test === true || isTestEmail(row.email)) return null;
  return isFoundingPosition(row.founding_position) ? row.founding_position : null;
}

// The welcome email never shows a founding number above 50 (Amanda, 2026-10-14). Within 50: "#n of 50",
// the approved line. Past 50 (a number issued after test numbers were voided, 0017): the household is
// still one of the first 50 real ones, so it is told that, with no number.
function foundingWelcomeLine(position) {
  if (!isFoundingPosition(position)) return null;
  const first = position <= FOUNDING_WAITLIST_LIMIT
    ? `You're founding household #${position} of ${FOUNDING_WAITLIST_LIMIT}.`
    : `You're one of the first ${FOUNDING_WAITLIST_LIMIT} founding households.`;
  return `${first} We'll email your link to the founding price when payments open on October 26.`;
}

module.exports = { FOUNDING_WAITLIST_LIMIT, TEST_EMAIL_DOMAINS, spotsLeftFromCount, countFromContentRange, isFoundingPosition, isTestEmail, welcomePositionFor, foundingWelcomeLine };
