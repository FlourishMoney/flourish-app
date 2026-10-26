// netlify/functions/_lib/stripeLive.js
// -----------------------------------------------------------------------------
// WHAT STRIPE ITSELF SAYS IS LIVE FOR A CUSTOMER (audit 2026-10-26, B3).
//
// The household's one subscriptions row is not enough: two tabs, or two checkouts a minute apart, could both
// complete, and the second wrote over the first, so both charged and cancelling one locked the payer out. So:
//   liveSubscriptionsFor   every subscription Stripe lists for the customer that can still charge
//   expireOpenCheckouts    expire the customer's other open checkout sessions before a new one is made, so an
//                          older tab cannot complete a second subscription
// Same key handling as stripeApi.js; the key never reaches a log line.
// -----------------------------------------------------------------------------
"use strict";

const { stripeGet, stripePost } = require("./stripeApi");

// A subscription that has ended can never charge again; every other status can (or may once a card works).
const ENDED_STATUSES = Object.freeze(["canceled", "incomplete_expired"]);
const isLiveStripeStatus = (status) => !!status && !ENDED_STATUSES.includes(status);

// includeIncomplete: an "incomplete" subscription (a first payment still to be confirmed, which Stripe expires after
// about a day) can still charge, so deleting an account cancels it; checkout does not count it, or a household
// whose first card failed could not try again for a day.
async function liveSubscriptionsFor(customerId, deps = {}, { includeIncomplete = false } = {}) {
  if (!customerId) return [];
  const get = deps.stripeGet || stripeGet;
  const res = await get(`/subscriptions?customer=${encodeURIComponent(customerId)}&status=all&limit=100`);
  return (Array.isArray(res && res.data) ? res.data : [])
    .filter((s) => s && isLiveStripeStatus(s.status) && (includeIncomplete || s.status !== "incomplete"));
}

// Returns how many were expired. A session that cannot be expired is logged (status only) and skipped: the
// webhook's guard still stands behind it.
async function expireOpenCheckouts(customerId, deps = {}) {
  if (!customerId) return 0;
  const get = deps.stripeGet || stripeGet;
  const post = deps.stripePost || stripePost;
  const res = await get(`/checkout/sessions?customer=${encodeURIComponent(customerId)}&status=open&limit=100`);
  let n = 0;
  for (const s of (Array.isArray(res && res.data) ? res.data : [])) {
    if (!s || !s.id || s.mode !== "subscription") continue;
    try { await post(`/checkout/sessions/${encodeURIComponent(s.id)}/expire`, {}); n++; }
    catch (e) { console.error("[stripe] expire open checkout:", e && e.statusCode ? e.statusCode : "no_status"); }
  }
  return n;
}

// THE ROW'S OWN SUBSCRIPTION, still holding the household (review of 2026-10-26): paid, or Stripe still collecting
// a renewal (past_due, unpaid, paused). Not "incomplete": a first payment that never went through holds no one, and
// the household's paid retry (which checkout allows) must be written, not flagged as a second subscription.
const HOLDING_UNPAID = Object.freeze(["past_due", "unpaid", "paused"]);
function holdsHousehold(row, isPaid) {
  if (!row) return false;
  if (isPaid(row)) return true;
  return (row.provider || "stripe") === "stripe" && HOLDING_UNPAID.includes(row.status);
}

module.exports = { ENDED_STATUSES, HOLDING_UNPAID, isLiveStripeStatus, liveSubscriptionsFor, expireOpenCheckouts, holdsHousehold };
