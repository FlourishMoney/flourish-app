// netlify/functions/_lib/eventClaim.js
// -----------------------------------------------------------------------------
// A WEBHOOK EVENT THAT WAS SEEN BEFORE (stripe-webhook.js, revenuecat-webhook.js; review of 2026-11-22, P3-02).
//
// Each delivery first inserts its row into billing_events as "received": that insert is the lock. When the insert finds
// the row already there, this says what the earlier delivery came to:
//   "done"  it finished (processed or ignored): acknowledge, repeat nothing
//   "run"   it never finished, and this delivery has taken it over: do the work
//   "busy"  it may still be at work, or the row could not be read: do nothing and answer 5xx, so the provider sends the
//           event again later (a 200 here would be the last anyone heard of it)
//
// "Never finished" is a row marked failed (the work threw), or a row still "received" long after any function could be
// running: the function was stopped mid-work, or the write that marks it failed did not land. Before this, such a row
// was acknowledged as a replay on every retry and the payment it described was never applied.
//
// received_at is the time of the latest delivery that took the row (it is set again on every takeover), so "long
// after" is measured from the attempt that may still be running. Every takeover, of a failed row or a stuck one, is a
// compare-and-swap on the status and attempts that were read: of two retries at the same moment, one does the work
// (round 2 review, N1: the failed row's takeover used to be an unconditional update, so both did).
// -----------------------------------------------------------------------------
"use strict";

// Netlify stops a function at 10 seconds (26 at most); a row still "received" a minute later belongs to nobody.
const STUCK_MS = 60000;

async function reclaimEvent(admin, eventId, { now = Date.now() } = {}) {
  const { data: prior, error } = await admin.from("billing_events").select("status, attempts, received_at").eq("event_id", eventId).maybeSingle();
  if (error) return "busy";
  if (!prior) return "done";
  const next = { status: "received", attempts: (prior.attempts || 1) + 1, error: null, received_at: new Date(now).toISOString() };
  // The takeover, for a failed row and a stuck one alike: only over the very row that was read (its status and its
  // attempts), and only if exactly one row was changed. Anything else (another delivery got there first, the write
  // was refused) is "busy": this delivery does no work and the provider is asked to send the event again.
  const take = async (status) => {
    let q = admin.from("billing_events").update(next).eq("event_id", eventId).eq("status", status);
    q = prior.attempts == null ? q.is("attempts", null) : q.eq("attempts", prior.attempts);
    const { data: took, error: takeErr } = await q.select("event_id");
    return !takeErr && Array.isArray(took) && took.length === 1 ? "run" : "busy";
  };
  if (prior.status === "failed") return take("failed");
  if (prior.status !== "received") return "done";
  const at = Date.parse(prior.received_at || "");
  if (!Number.isFinite(at) || now - at < STUCK_MS) return "busy";
  return take("received");
}

/**
 * THE CLAIM: this delivery's row for the event. Returns { seen: false } when the row is new (this delivery has the
 * event), { seen: true } when it was already there (ask reclaimEvent what the earlier delivery came to), or
 * { error } when the row could not be written for any other reason (answer 5xx: the provider sends it again).
 *
 * Real-world proof, 2026-11-23 (Stripe test mode, real Postgres). Both webhooks used to call
 * insert(row, { ignoreDuplicates: true }) and read "no row came back" as "seen before". supabase-js has that option on
 * upsert only: on insert it is ignored, so a real database answers the second insert of an event with a unique
 * violation (23505). That was read as "could not claim" and answered 500, on every repeat delivery since the first
 * version: an event already processed was never acknowledged, and one whose work had failed was never done again.
 * The stand-in databases in the tests honoured the option. A unique violation is the "seen before" answer; a client
 * that returns no row instead (as those stand-ins do) means the same.
 */
async function claimEvent(admin, row) {
  const { data, error } = await admin.from("billing_events").insert(row).select("event_id");
  if (error) return error.code === "23505" ? { seen: true } : { error };
  return { seen: !data || data.length === 0 };
}

module.exports = { STUCK_MS, reclaimEvent, claimEvent };
