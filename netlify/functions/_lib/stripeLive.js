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
// EVERY PAGE (review of 2026-11-22, P3-03). Stripe lists 100 at a time, newest first; a customer with more than 100
// subscriptions on record (ended ones included) had its older ones never looked at, so a live one among them could be
// missed by checkout's guard and left charging by account deletion. The list is followed with starting_after until
// Stripe says there is no more. MAX_PAGES (2,000 rows) only stops a list that never ends.
const MAX_PAGES = 20;
async function listAll(get, path) {
  const out = [];
  let after = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await get(`${path}&limit=100${after ? `&starting_after=${encodeURIComponent(after)}` : ""}`);
    const rows = Array.isArray(res && res.data) ? res.data : [];
    out.push(...rows);
    const last = rows.length ? rows[rows.length - 1] : null;
    if (!res || res.has_more !== true || !last || !last.id) return out;
    after = last.id;
  }
  console.error("[stripe] list: more than", MAX_PAGES, "pages; the rest was not read");
  return out;
}

async function liveSubscriptionsFor(customerId, deps = {}, { includeIncomplete = false } = {}) {
  if (!customerId) return [];
  const get = deps.stripeGet || stripeGet;
  const all = await listAll(get, `/subscriptions?customer=${encodeURIComponent(customerId)}&status=all`);
  return all.filter((s) => s && isLiveStripeStatus(s.status) && (includeIncomplete || s.status !== "incomplete"));
}

// Returns how many were expired. A session that cannot be expired is logged (status only) and skipped: the
// webhook's guard still stands behind it.
async function expireOpenCheckouts(customerId, deps = {}) {
  if (!customerId) return 0;
  const get = deps.stripeGet || stripeGet;
  const post = deps.stripePost || stripePost;
  const open = await listAll(get, `/checkout/sessions?customer=${encodeURIComponent(customerId)}&status=open`);
  let n = 0;
  for (const s of open) {
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

// A STRIPE ROW WITH NO PERIOD END (review of 2026-11-22, P2-02 and P3-04). A checkout writes the row before Stripe could
// be asked for the period when Stripe was unreachable at that moment, and the subscription event that would have set
// it can arrive first and be set aside as older. Such a row is "active" (or "incomplete", for a checkout whose payment
// had not cleared) with no end. When the household's status is next read, Stripe is asked about that one subscription
// and its own status and period end are written onto the row: a cancellation we never heard stops counting, and a
// payment that has since cleared starts to. Only this subscription's answer is used, only a row still without its end
// is written (so an event that landed meanwhile is not written over), and nothing here ever throws: when Stripe
// cannot be asked the row is returned as it was.
const FILL_STATUSES = Object.freeze(["active", "trialing", "incomplete"]);
async function fillMissingPeriod(admin, userId, row, deps = {}) {
  try {
    if (!row || !userId || (row.provider || "stripe") !== "stripe" || !row.provider_subscription_id) return row;
    if (row.current_period_end || !FILL_STATUSES.includes(row.status)) return row;
    const get = deps.stripeGet || stripeGet;
    const id = row.provider_subscription_id;
    // Four seconds at most: a status read must not hang on Stripe.
    let timer;
    const live = await Promise.race([
      get(`/subscriptions/${encodeURIComponent(id)}`),
      new Promise((_, no) => { timer = setTimeout(() => no(new Error("timeout")), deps.timeoutMs || 4000); if (timer.unref) timer.unref(); }),
    ]).finally(() => clearTimeout(timer));
    if (!live || live.id !== id || typeof live.status !== "string") return row;
    const item = (live.items && live.items.data && live.items.data[0]) || {};
    const over = ENDED_STATUSES.includes(live.status);
    const endSec = over && Number.isFinite(live.ended_at) ? live.ended_at
      : (Number.isFinite(live.current_period_end) ? live.current_period_end : item.current_period_end);
    const end = Number.isFinite(endSec) ? new Date(endSec * 1000).toISOString() : null;
    if (live.status === row.status && !end) return row;                 // nothing new to say
    const patch = { status: live.status, updated_at: new Date().toISOString(), ...(end ? { current_period_end: end } : {}) };
    const { data, error } = await admin.from("subscriptions").update(patch)
      .eq("user_id", userId).eq("provider_subscription_id", id).is("current_period_end", null).select("user_id");
    if (error || !Array.isArray(data) || data.length === 0) return row;
    return { ...row, ...patch };
  } catch (e) {
    console.error("[stripe] fill missing period:", e && e.statusCode ? e.statusCode : "no_status");
    return row;
  }
}

module.exports = { ENDED_STATUSES, HOLDING_UNPAID, isLiveStripeStatus, liveSubscriptionsFor, expireOpenCheckouts, holdsHousehold, fillMissingPeriod };
