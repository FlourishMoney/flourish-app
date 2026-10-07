// netlify/functions/_lib/foundingCohort.js
// -----------------------------------------------------------------------------
// WHO MAY BUY THE FOUNDING PRICE (Amanda's decision, 2026-10-06; rules of 2026-10-07).
//
// The founding price is $79.99 a year plus tax, "for as long as you stay subscribed". In order:
//   1. ENDED IS FINAL. An account that has had a founding subscription that ended
//      (subscriptions.founding_ended_at, stamped by the webhook) is offered the regular prices only.
//   2. BETA FOUNDERS. A beta tester flagged as a founder (profiles.founder_flag) keeps the founding price
//      they were promised. They are outside the 50: this never reads or touches the waitlist.
//   3. THE FIRST 50 ON THE WAITLIST. Otherwise the account's confirmed email must hold waitlist number
//      1 to 50, on a row that is not a test row, whose founding subscription has never ended.
// Everyone else is offered the regular prices.
//
// The numbers are the database's (migration 0014): issued once, in created_at order, recorded in a
// ledger and never reissued. Nothing here assigns, frees or counts them, so:
//   • a household that joins and never pays keeps its number, and the 51st joiner never gets it;
//   • a household whose founding subscription ends keeps its number too: nobody else is given it;
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

// Has this account had a founding subscription that ended? true, false, or null when it cannot be read
// (the column is not applied yet, or the read failed), which the caller treats as "yes": fail closed.
async function foundingEndedForAccount(admin, user_id) {
  try {
    const { data, error } = await admin
      .from("subscriptions").select("founding_ended_at").eq("user_id", user_id).maybeSingle();
    if (error) return null;
    return !!(data && data.founding_ended_at);
  } catch {
    return null;
  }
}

// A beta tester flagged as a founder. A failed read is "not flagged": they still get the waitlist check.
async function isBetaFounder(admin, user_id) {
  try {
    const { data, error } = await admin
      .from("profiles").select("founder_flag").eq("user_id", user_id).maybeSingle();
    return !error && !!(data && data.founder_flag === true);
  } catch {
    return false;
  }
}

// The account (its id, and the user as Supabase Auth holds it) -> may it buy the founding price?
async function mayBuyFoundingPrice(admin, user_id, user) {
  if (!user_id) return false;
  if ((await foundingEndedForAccount(admin, user_id)) !== false) return false;
  if (await isBetaFounder(admin, user_id)) return true;
  if (!user || !user.email || !user.email_confirmed_at) return false;
  return (await foundingPositionForEmail(admin, user.email)) !== null;
}

module.exports = {
  FOUNDING_COHORT_LIMIT, normalizeEmail, isFoundingPosition, foundingPositionForEmail,
  foundingEndedForAccount, isBetaFounder, mayBuyFoundingPrice,
};
