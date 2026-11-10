// netlify/functions/_lib/funnel.js
// -----------------------------------------------------------------------------
// THE FULL FUNNEL, ONE ROW PER ACCOUNT AND MILESTONE (2026-11-08, migration 0042, docs/ops/MEASUREMENT.md).
//
// What is written, and nothing else: an account id, a milestone name and a channel from the fixed lists below, and
// a time; or an account id, a Toronto day and a kind ("open" or "checkin"). No amount, no name, no address, no
// device, no IP, no free text. The first write wins: a second device, or a webhook delivered twice, adds nothing,
// which is how a household is counted once.
//
// Every write is best effort and never throws: a milestone that cannot be written is logged as "[funnel] not
// recorded <name>" (no id, no value) and nothing a household sees changes. Until 0042 runs, every write is refused.
// -----------------------------------------------------------------------------
"use strict";

const MILESTONES = Object.freeze({
  signed_up: ["web", "ios", "android"],
  setup_done: ["bank", "manual"],
  first_safe: ["app"],
  store_trial: ["apple", "google"],
  paid: ["web", "apple", "google"],
  cancelled: ["web", "apple", "google"],
  refunded: ["web", "apple", "google"],
});
const DAY_KINDS = Object.freeze(["open", "checkin"]);
const CHECKIN_KINDS = Object.freeze(["meeting", "weekly"]);
const DAY_WINDOW = 60;                      // an account's first 60 days: returns to day 28, and repeat use to day 60 (0042)
const DAY_MS = 24 * 60 * 60 * 1000;
const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function torontoDay(date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}
function daysBetween(fromDay, toDay) {
  return Math.round((Date.parse(`${toDay}T12:00:00Z`) - Date.parse(`${fromDay}T12:00:00Z`)) / DAY_MS);
}

function isMilestone(milestone, channel) {
  return Object.prototype.hasOwnProperty.call(MILESTONES, milestone) && MILESTONES[milestone].includes(channel);
}

/** First time only. Resolves true when the row is there now (written, or already there), false when it could not be. */
async function recordMilestone(admin, userId, milestone, channel, at = new Date()) {
  if (!admin || !UUID_RX.test(String(userId || "")) || !isMilestone(milestone, channel)) return false;
  const when = at instanceof Date && Number.isFinite(at.getTime()) ? at : new Date();
  try {
    const { error } = await admin.from("account_milestones").upsert(
      { user_id: userId, milestone, channel, first_at: when.toISOString() },
      { onConflict: "user_id,milestone,channel", ignoreDuplicates: true },
    );
    if (error) { console.error("[funnel] not recorded", milestone); return false; }
    return true;
  } catch {
    console.error("[funnel] not recorded", milestone);
    return false;
  }
}

/**
 * The day an account opened the app or held a money check-in, in its first 60 days. Resolves true when the day is
 * recorded (or already was), "outside" when the day is outside the window (nothing to record), false on a failure.
 */
async function recordDay(admin, userId, kind, createdAt, now = new Date()) {
  if (!admin || !UUID_RX.test(String(userId || "")) || !DAY_KINDS.includes(kind)) return false;
  const created = new Date(createdAt);
  if (!Number.isFinite(created.getTime())) return false;
  const day = torontoDay(now);
  const age = daysBetween(torontoDay(created), day);
  if (age < 0 || age > DAY_WINDOW) return "outside";
  try {
    const { error } = await admin.from("account_days").upsert(
      { user_id: userId, day, kind },
      { onConflict: "user_id,day,kind", ignoreDuplicates: true },
    );
    if (error) { console.error("[funnel] not recorded", kind); return false; }
    return true;
  } catch {
    console.error("[funnel] not recorded", kind);
    return false;
  }
}

// THE STORES, through RevenueCat (docs: webhooks, event types and fields). Apple and Google are kept apart: their
// cancellations and refunds are not the same act (MEASUREMENT.md).
const RC_STORES = Object.freeze({ APP_STORE: "apple", MAC_APP_STORE: "apple", PLAY_STORE: "google" });
const RC_CHARGES = Object.freeze(["INITIAL_PURCHASE", "RENEWAL", "NON_RENEWING_PURCHASE"]);

/** { milestone, channel, at } for a RevenueCat delivery, or null when it marks none. A sandbox purchase is never one. */
function revenueCatMilestone(evt) {
  if (!evt || typeof evt !== "object") return null;
  if (String(evt.environment || "").toUpperCase() !== "PRODUCTION") return null;
  const channel = RC_STORES[String(evt.store || "").toUpperCase()];
  if (!channel) return null;
  const ms = Number(evt.event_timestamp_ms);
  const at = Number.isFinite(ms) && ms > 0 ? new Date(ms) : new Date();
  const type = String(evt.type || "").toUpperCase();
  const period = String(evt.period_type || "").toUpperCase();
  if (RC_CHARGES.includes(type)) {
    if (period === "TRIAL") return type === "INITIAL_PURCHASE" ? { milestone: "store_trial", channel, at } : null;
    if (period === "PROMOTIONAL") return null;                 // granted, not bought
    return { milestone: "paid", channel, at };
  }
  if (type === "CANCELLATION") {
    const reason = String(evt.cancel_reason || "").toUpperCase();
    if (reason === "CUSTOMER_SUPPORT" || Number(evt.price) < 0) return { milestone: "refunded", channel, at };
    if (reason === "UNSUBSCRIBE") return { milestone: "cancelled", channel, at };
    return null;                                               // a billing error, a price increase refused, us
  }
  return null;
}

/** { milestone, at } for a Stripe delivery (the website), or null. A test-mode event is never one. */
function stripeMilestone(evt) {
  if (!evt || typeof evt !== "object" || evt.livemode !== true) return null;
  const o = (evt.data && evt.data.object) || {};
  const at = Number.isFinite(evt.created) ? new Date(evt.created * 1000) : new Date();
  if (evt.type === "checkout.session.completed") return o.payment_status === "paid" ? { milestone: "paid", at } : null;
  if (evt.type === "customer.subscription.updated") {
    return o.cancel_at_period_end === true || (Number.isFinite(o.cancel_at) && o.cancel_at > 0) ? { milestone: "cancelled", at } : null;
  }
  if (evt.type === "customer.subscription.deleted") {
    const reason = o.cancellation_details && o.cancellation_details.reason;
    return reason === "payment_failed" || reason === "payment_disputed" ? null : { milestone: "cancelled", at };
  }
  if (evt.type === "charge.refunded") return Number(o.amount_refunded) > 0 ? { milestone: "refunded", at } : null;
  return null;
}

module.exports = {
  MILESTONES, DAY_KINDS, CHECKIN_KINDS, DAY_WINDOW, isMilestone, torontoDay, daysBetween,
  recordMilestone, recordDay, revenueCatMilestone, stripeMilestone,
};
