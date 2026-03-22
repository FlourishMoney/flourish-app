const { PlaidApi, Configuration, PlaidEnvironments } = require("plaid");

const config = new Configuration({
  basePath: PlaidEnvironments[process.env.PLAID_ENV || "production"],
  baseOptions: {
    headers: {
      "PLAID-CLIENT-ID": process.env.PLAID_CLIENT_ID,
      "PLAID-SECRET": process.env.PLAID_SECRET,
    },
  },
});

const plaidClient = new PlaidApi(config);

exports.handler = async (event) => {
  // Only accept POST
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: "Invalid JSON" };
  }

  const { webhook_type, webhook_code, item_id, error } = body;

  console.log(`[Plaid Webhook] ${webhook_type}:${webhook_code} — item_id: ${item_id}`);

  // ── Handle webhook types ────────────────────────────────────────────────────

  switch (`${webhook_type}:${webhook_code}`) {

    // Bank connection is about to expire — user needs to re-authenticate
    case "ITEM:PENDING_EXPIRATION": {
      console.log(`[Webhook] Item ${item_id} pending expiration — user re-auth needed`);
      // Future: look up user by item_id in Supabase and send push/email notification
      // For now: logged, frontend polls on load and shows reconnect banner
      break;
    }

    // Bank connection has errored — could be wrong password, MFA, revoked access
    case "ITEM:ERROR": {
      const errorCode = error?.error_code;
      console.log(`[Webhook] Item ${item_id} error: ${errorCode}`);
      // ITEM_LOGIN_REQUIRED = user needs to re-authenticate via Plaid Link
      // Future: flag item in Supabase so reconnect banner shows immediately on next app open
      break;
    }

    // New transactions available to fetch
    case "TRANSACTIONS:SYNC_UPDATES_AVAILABLE": {
      console.log(`[Webhook] New transactions available for item ${item_id}`);
      // Future: trigger background transaction sync and update Supabase cache
      // For now: app fetches fresh on load anyway
      break;
    }

    // Historical transactions finished backfilling
    case "TRANSACTIONS:HISTORICAL_UPDATE": {
      console.log(`[Webhook] Historical backfill complete for item ${item_id}`);
      break;
    }

    // Initial transaction pull done
    case "TRANSACTIONS:INITIAL_UPDATE": {
      console.log(`[Webhook] Initial transactions ready for item ${item_id}`);
      break;
    }

    // User removed access via their bank's portal
    case "ITEM:USER_PERMISSION_REVOKED": {
      console.log(`[Webhook] User revoked access for item ${item_id}`);
      // Future: remove item from Supabase, show "reconnect" state in app
      break;
    }

    default: {
      console.log(`[Webhook] Unhandled event: ${webhook_type}:${webhook_code}`);
    }
  }

  // Always return 200 — Plaid will retry if it doesn't get 200
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ received: true }),
  };
};
