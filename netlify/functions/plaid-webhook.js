/**
 * Flourish Money — Plaid Webhook Receiver (Phase D1-G)
 *
 * Verifies Plaid signature, updates plaid_items table by item_id.
 * Always returns 200 — even on signature failure (avoids amplifying attacks
 * via Plaid's retry policy). Failures are logged with a distinct prefix.
 */

"use strict";

const { verifyPlaidWebhook } = require("./_lib/webhook-verify");
const { getAdminClient } = require("./_lib/auth");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  // Verify webhook signature
  const verification = await verifyPlaidWebhook(event);
  if (!verification.verified) {
    console.warn(`[webhook] SIGNATURE FAILED — reason: ${verification.reason}`);
    return { statusCode: 200, body: JSON.stringify({ received: false }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    console.warn("[webhook] invalid JSON body");
    return { statusCode: 200, body: JSON.stringify({ received: false }) };
  }

  const { webhook_type, webhook_code, item_id, error } = body;
  console.log(`[webhook] verified ${webhook_type}:${webhook_code} item=${item_id}`);

  if (!item_id) {
    console.warn("[webhook] no item_id in body");
    return { statusCode: 200, body: JSON.stringify({ received: true }) };
  }

  const admin = getAdminClient();

  // Tier 3.17: replay dedupe. verification.jti is SHA-256 of the signed header, so an
  // exact replay of a valid webhook collides on the primary key. Fail OPEN on any
  // non-conflict error — a DB hiccup must not drop legitimate webhooks.
  if (verification.jti) {
    const { error: seenErr } = await admin
      .from("webhook_seen")
      .insert({ jti: verification.jti });
    if (seenErr) {
      if (seenErr.code === "23505") {
        console.warn(`[webhook] replay detected jti=${verification.jti.slice(0, 8)} — ack & skip`);
        return { statusCode: 200, body: JSON.stringify({ received: true, duplicate: true }) };
      }
      console.error("[webhook] dedupe insert failed (continuing):", seenErr.message);
    }
    // Opportunistic cleanup — keep the table bounded to ~the replay window (best-effort).
    admin.from("webhook_seen").delete()
      .lt("seen_at", new Date(Date.now() - 15 * 60 * 1000).toISOString())
      .then(() => {}, () => {});
  }

  // Tier 1.4: resolve the item owner BEFORE any mutation. Scoping every update by
  // user_id (plus the DB unique constraint on item_id) closes the cross-tenant
  // flag-flip exploit — a forged or sandbox-colliding item_id can't touch another
  // user's row.
  const { data: ownerRow, error: lookupErr } = await admin
    .from("plaid_items")
    .select("user_id")
    .eq("item_id", item_id)
    .maybeSingle();
  if (lookupErr) {
    console.error(`[webhook] owner lookup failed for ${item_id}:`, lookupErr.message);
    return { statusCode: 500, body: JSON.stringify({ received: false }) };
  }
  if (!ownerRow) {
    console.warn(`[webhook] unknown item_id ${String(item_id).slice(0, 8)} — ack & skip`);
    return { statusCode: 200, body: JSON.stringify({ received: true }) };
  }
  const ownerUserId = ownerRow.user_id;

  const eventKey = `${webhook_type}:${webhook_code}`;
  let updates = null;

  switch (eventKey) {
    case "TRANSACTIONS:SYNC_UPDATES_AVAILABLE":
    case "TRANSACTIONS:DEFAULT_UPDATE":
      updates = { transactions_pending: true };
      break;

    case "TRANSACTIONS:HISTORICAL_UPDATE":
    case "TRANSACTIONS:INITIAL_UPDATE":
      updates = { transactions_pending: true };
      break;

    case "TRANSACTIONS:RECURRING_TRANSACTIONS_UPDATE":
      updates = { transactions_pending: true };
      break;

    case "HOLDINGS:DEFAULT_UPDATE":
      updates = { holdings_pending: true };
      break;

    case "INVESTMENTS_TRANSACTIONS:DEFAULT_UPDATE":
    case "INVESTMENTS_TRANSACTIONS:HISTORICAL_UPDATE":
      updates = { holdings_pending: true };
      break;

    case "LIABILITIES:DEFAULT_UPDATE":
      updates = { liabilities_pending: true };
      break;

    case "ITEM:PENDING_EXPIRATION":
      updates = { status: "pending_expiration" };
      break;

    case "ITEM:ERROR":
      updates = { status: "error", last_error: error || null };
      break;

    case "ITEM:USER_PERMISSION_REVOKED":
    case "ITEM:USER_ACCOUNT_REVOKED":
      updates = { status: "revoked" };
      break;

    case "ITEM:LOGIN_REPAIRED":
      updates = { status: "active", last_error: null };
      break;

    case "ITEM:NEW_ACCOUNTS_AVAILABLE":
      updates = { new_accounts_available: true };
      break;

    case "ITEM:WEBHOOK_UPDATE_ACKNOWLEDGED":
      console.log(`[webhook] webhook URL change acknowledged for ${item_id}`);
      break;

    default:
      console.log(`[webhook] unhandled event ${eventKey}`);
      break;
  }

  if (updates) {
    const { error: updateErr } = await admin
      .from("plaid_items")
      .update(updates)
      .eq("item_id", item_id)
      .eq("user_id", ownerUserId);
    if (updateErr) {
      console.error(`[webhook] update failed for ${item_id}:`, updateErr.message);
      return { statusCode: 500, body: JSON.stringify({ received: false }) };
    }
  }

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ received: true }),
  };
};
