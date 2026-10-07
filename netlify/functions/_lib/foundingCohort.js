// netlify/functions/_lib/foundingCohort.js
// -----------------------------------------------------------------------------
// WHO MAY BUY THE FOUNDING PRICE (Amanda's decision, 2026-10-06).
//
// The founding price ($79.99 a year plus tax, locked in while subscribed) belongs to the first 50
// households on the WAITLIST, not to the first 50 checkouts. A checkout gets it only when the buyer's
// account email matches a waitlist row that holds a founding position from 1 to 50 and is not a test
// row. Everyone else is offered the regular prices.
//
// The positions are the database's (migration 0014): set once, at insert or by
// waitlist_founding_start(), in created_at order, unique, 1 to 50 or null. Nothing here assigns,
// frees or counts them, so:
//   • a household that joins and never pays keeps its position, and the 51st joiner never gets it;
//   • paying, or not paying, moves nobody up or down.
//
// THE SERVER DECIDES. The client sends a plan key and nothing else; it is told whether the founding
// price is available to this account, never a position or a count.
//
// The match runs in Postgres (waitlist_founding_position_for_email, migration 0016), which ignores
// case and whitespace on both sides and skips test rows. The address is normalised here as well, so
// the question asked is the same either way.
//
// The email is the account's own, from Supabase Auth, and only once it is CONFIRMED: an address
// nobody has proved they own cannot claim someone else's place.
//
// FAILS CLOSED. If the lookup errors, the function is not applied yet, or the answer is not a position
// from 1 to 50, the answer is "no": the regular prices are still offered. Offering a price we then
// cannot honour is worse than not offering it.
// -----------------------------------------------------------------------------
"use strict";

// The size of the founding cohort. One place. See docs/ops/BILLING-SETUP.md. The SQL check in 0014
// and the lookup in 0016 carry the same 50.
const FOUNDING_COHORT_LIMIT = 50;

// Case and whitespace never matter. An email address cannot contain whitespace, so all of it goes.
function normalizeEmail(email) {
  return typeof email === "string" ? email.replace(/\s+/g, "").toLowerCase() : "";
}

function isFoundingPosition(p) {
  return Number.isInteger(p) && p >= 1 && p <= FOUNDING_COHORT_LIMIT;
}

// The waitlist founding position for this address, or null. Never throws.
async function foundingPositionForEmail(admin, email) {
  const addr = normalizeEmail(email);
  if (!addr) return null;
  try {
    const { data, error } = await admin.rpc("waitlist_founding_position_for_email", { p_email: addr });
    if (error) return null;
    const n = typeof data === "string" && /^\d+$/.test(data) ? Number(data) : data;
    return isFoundingPosition(n) ? n : null;
  } catch {
    return null;
  }
}

// The account as Supabase Auth holds it -> may it buy the founding price?
async function mayBuyFoundingPrice(admin, user) {
  if (!user || !user.email || !user.email_confirmed_at) return false;
  return (await foundingPositionForEmail(admin, user.email)) !== null;
}

module.exports = { FOUNDING_COHORT_LIMIT, normalizeEmail, isFoundingPosition, foundingPositionForEmail, mayBuyFoundingPrice };
