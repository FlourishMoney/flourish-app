/**
 * Flourish Money — Plaid Webhook Receiver
 * netlify/functions/plaid-webhook.js
 *
 * Receives push events from Plaid and logs them.
 * No Plaid SDK required — this function only receives, never initiates.
 *
 * Register this URL in your Plaid dashboard:
 *   https://flourishmoney.app/.netlify/functions/plaid-webhook
 */

"use strict";

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, body: "Invalid JSON" };
  }

  const { webhook_type, webhook_code, item_id, error } = body;

  console.log(`[Plaid Webhook] ${webhook_type}:${webhook_code} — item_id: ${item_id}`);

  switch (`${webhook_type}:${webhook_code}`) {

    // Bank connection is about to expire — user needs to re-authenticate
    case "ITEM:PENDING_EXPIRATION":
      console.log(`[Webhook] Item ${item_id} pending expiration — user re-auth needed`);
      // Future: look up user by item_id in Supabase and trigger notification
      break;

    // Bank connection has errored (wrong password, MFA, revoked access)
    case "ITEM:ERROR":
      console.log(`[Webhook] Item ${item_id} error: ${error?.error_code}`);
      // Future: flag item in Supabase so reconnect banner shows on next app open
      break;

    // New transactions available to fetch
    case "TRANSACTIONS:SYNC_UPDATES_AVAILABLE":
      console.log(`[Webhook] New transactions available for item ${item_id}`);
      // Future: trigger background sync and update Supabase cache
      break;

    case "TRANSACTIONS:HISTORICAL_UPDATE":
      console.log(`[Webhook] Historical backfill complete for item ${item_id}`);
      break;

    case "TRANSACTIONS:INITIAL_UPDATE":
      console.log(`[Webhook] Initial transactions ready for item ${item_id}`);
      break;

    // User removed access via their bank's portal
    case "ITEM:USER_PERMISSION_REVOKED":
      console.log(`[Webhook] User revoked access for item ${item_id}`);
      // Future: remove item from Supabase, show reconnect state in app
      break;

    default:
      console.log(`[Webhook] Unhandled event: ${webhook_type}:${webhook_code}`);
  }

  // Always return 200 — Plaid retries if it doesn't receive 200
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ received: true }),
  };
};
