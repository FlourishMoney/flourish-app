// netlify/functions/_lib/foundingCohort.js
// -----------------------------------------------------------------------------
// WHO MAY BUY THE FOUNDING PRICE (Amanda's decision, 2026-10-29: the first 50 households who subscribe).
//
// The founding price is $79.99 a year plus tax, "for as long as you stay subscribed". It goes to the first 50
// households who subscribe to it, on the website, the App Store or Google Play (_lib/foundingSeats.js,
// migration 0032). A waitlist number no longer grants it, and no one's is held. In order:
//   1. ENDED IS FINAL. An account that has had a founding subscription that ended
//      (subscriptions.founding_ended_at, stamped by the webhook) is offered the regular prices only.
//   2. BETA FOUNDERS. A beta tester flagged as a founder (profiles.founder_flag) keeps the founding price
//      they were promised. They are outside the 50 and never take a seat.
//   3. ANY OTHER HOUSEHOLD, while fewer than 50 seats are held: a signed-in account whose email address is
//      confirmed, and not at a test domain. Whether it already pays is the caller's question (billing.js
//      offers nothing to a household that pays, and checkout refuses a second subscription).
// Everyone else, and everyone once 50 seats are held, is offered the regular prices.
//
// A SEAT is taken when a founding subscription's first payment succeeds, and given back by a refund (0032). The
// offer counts seats, never waitlist numbers: the waitlist ledger (0014, 0025) is kept as it is and not read here.
//
// THE SERVER DECIDES. The client sends a plan key and nothing else; it is told whether the founding price is
// available to this account, and how many founding spots are left (the same public figure the landing shows).
//
// CONFIRMED. Supabase Auth's email_confirmed_at, from the server's own record, never the client's word. An
// address confirmed on creation (app_metadata.email_confirmation "auto": an invite code while signup was shut)
// was never proved by its owner and is not offered the founding price.
//
// FAILS CLOSED. If the seats cannot be counted (0032 not applied, the read failed) or the address is a test
// address, the answer is "no": the regular prices are still offered. Offering a price we then cannot honour is
// worse than not offering it.
// -----------------------------------------------------------------------------
"use strict";

const { FOUNDING_SEAT_LIMIT, seatsTaken } = require("./foundingSeats");

// The size of the founding cohort: how many households may hold a founding seat. One place
// (_lib/foundingSeats.js, migration 0032 carry the same 50). See docs/ops/BILLING-SETUP.md.
const FOUNDING_COHORT_LIMIT = FOUNDING_SEAT_LIMIT;

// Sign-ups from these domains are Flourish's own tests, never households (Amanda, 2026-10-14). A
// subdomain counts too. Migration 0025's waitlist_is_test_email() holds the same two.
const TEST_EMAIL_DOMAINS = ["getgrowsmart.com", "flourishmoney.app"];

// Case and whitespace never matter. An email address cannot contain whitespace, so all of it goes.
function normalizeEmail(email) {
  return typeof email === "string" ? email.replace(/\s+/g, "").toLowerCase() : "";
}

function isTestEmail(email) {
  const addr = normalizeEmail(email);
  const at = addr.lastIndexOf("@");
  if (at < 1) return false;
  const domain = addr.slice(at + 1);
  return TEST_EMAIL_DOMAINS.some(d => domain === d || domain.endsWith("." + d));
}

// A founding number as the database issues it: a whole number from 1 up. Numbers past 50 exist once a
// test row's number has been voided (0025); the database, not this check, keeps the holders to 50.
function isFoundingPosition(p) {
  return Number.isInteger(p) && p >= 1;
}

// The waitlist founding position for this address, or null. Never throws. The ledger is kept, and the founding
// email still names it; it no longer decides who may buy the founding price.
async function foundingPositionForEmail(admin, email) {
  const addr = normalizeEmail(email);
  if (!addr || isTestEmail(addr)) return null;
  try {
    const { data, error } = await admin.rpc("waitlist_founding_number_for_email", { p_email: addr });
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

// A beta tester flagged as a founder. A failed read is "not flagged": they still get the seat rule.
async function isBetaFounder(admin, user_id) {
  try {
    const { data, error } = await admin
      .from("profiles").select("founder_flag").eq("user_id", user_id).maybeSingle();
    return !error && !!(data && data.founder_flag === true);
  } catch {
    return false;
  }
}

// Did the household confirm this account's address by clicking our link? Never true for an address that
// was confirmed on creation, and never true without the marker.
function emailVerifiedByLink(user) {
  return !!(user && user.email_confirmed_at && user.app_metadata && user.app_metadata.email_confirmation === "link");
}

// A confirmed address its owner proved: Supabase Auth says it is confirmed, and it was not confirmed on creation.
function emailConfirmed(user) {
  return !!(user && user.email && user.email_confirmed_at && !(user.app_metadata && user.app_metadata.email_confirmation === "auto"));
}

// THE CONFIRMATION LINK FOR OLDER ACCOUNTS (round 4) is no longer needed: a confirmed address is enough
// (rule 3 above), however it was confirmed. Always "no", so billing.js never offers or sends one.
async function foundingConfirmNeeded() {
  return false;
}

// The account (its id, and the user as Supabase Auth holds it) -> may it buy the founding price?
async function mayBuyFoundingPrice(admin, user_id, user) {
  if (!user_id) return false;
  if ((await foundingEndedForAccount(admin, user_id)) !== false) return false;
  if (await isBetaFounder(admin, user_id)) return true;
  if (!emailConfirmed(user) || isTestEmail(user.email)) return false;
  const held = await seatsTaken(admin);
  return held !== null && held < FOUNDING_COHORT_LIMIT;
}

module.exports = {
  FOUNDING_COHORT_LIMIT, TEST_EMAIL_DOMAINS, normalizeEmail, isTestEmail, isFoundingPosition, foundingPositionForEmail,
  foundingEndedForAccount, isBetaFounder, emailVerifiedByLink, emailConfirmed, foundingConfirmNeeded, mayBuyFoundingPrice,
};
