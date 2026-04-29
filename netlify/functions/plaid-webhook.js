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
      .eq("item_id", item_id);
    if (updateErr) {
      console.error(`[webhook] update failed for ${item_id}:`, updateErr.message);
    }
  }

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ received: true }),
  };
};
