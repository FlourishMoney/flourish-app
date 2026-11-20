// netlify/functions/gift-send-sweep.js
// -----------------------------------------------------------------------------
// SCHEDULED, every 15 minutes (netlify.toml): the recipient's gift email (Email 2) at 07:00 Eastern on the day the buyer
// chose. A run sends every email whose moment has passed and is not yet sent, so the 07:00 emails go on the 07:00 run,
// and one bought for "today" after 7 a.m. goes on the next run.
//
// Never twice: each row is claimed in one atomic statement (migration 0050 gift_claim_due_sends, FOR UPDATE SKIP LOCKED),
// sent with the idempotency key gift-recipient/<code> (Resend sends a repeated key once), then marked sent. A run that dies
// between the send and the mark leaves the claim, which a run 30 minutes later may take again: the key keeps it to one
// email. A refunded or already-redeemed gift is never claimed. Safe to run again at any moment, by hand too.
//
// Reads and sends NOTHING unless GIFTS_ENABLED is exactly "true". Netlify stops a scheduled function at 30 seconds;
// this stops claiming at 18. Answers counts only: never a code, an address or a name.
// -----------------------------------------------------------------------------
"use strict";

const { getAdminClient } = require("./_lib/auth");
const gifts = require("./_lib/gifts");

exports.handler = async (_event, _ctx, deps = {}) => {
  if (!gifts.giftsEnabled()) return { statusCode: 200, body: JSON.stringify({ ok: true, off: true }) };
  let admin;
  try { admin = deps.admin || getAdminClient(); }
  catch (e) { console.error("[gift-send-sweep] admin client:", e.message); return { statusCode: 500, body: JSON.stringify({ ok: false }) }; }
  try {
    const r = await gifts.runSendSweep({ admin, ...(deps.send ? { send: deps.send } : {}), ...(deps.now ? { now: deps.now } : {}),
      ...(deps.words ? { words: deps.words } : {}), ...(deps.pauseMs != null ? { pauseMs: deps.pauseMs } : {}) });
    if (r.unavailable) console.error("[gift-send-sweep] migration 0050 is not applied: nothing to send");
    if (r.sent || r.failed || r.skipped) console.log(`[gift-send-sweep] sent ${r.sent}, failed ${r.failed}, waiting on email ${r.skipped}`);
    return { statusCode: 200, body: JSON.stringify({ ok: true, ...r }) };
  } catch (e) {
    console.error("[gift-send-sweep] GIFT_SWEEP_FAILED:", e.message);
    return { statusCode: 500, body: JSON.stringify({ ok: false }) };
  }
};
