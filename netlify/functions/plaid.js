/**
 * Flourish Money — Plaid API Proxy
 * netlify/functions/plaid.js
 *
 * Actions: create_link_token | exchange_token | get_accounts | get_transactions | remove_item
 *
 * Env vars (Netlify → Site Settings → Environment Variables):
 *   PLAID_CLIENT_ID  = 69add556a35e23000d87be48
 *   PLAID_SECRET     = 11c0e1c30527d73b7e166c7476e32e
 *   PLAID_ENV        = sandbox   →  development  →  production
 */

"use strict";

const PLAID_BASE = {
  sandbox:     "https://sandbox.plaid.com",
  development: "https://development.plaid.com",
  production:  "https://production.plaid.com",
};

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type":                 "application/json",
};

// Plaid REST wrapper — 8s timeout so we never exceed Netlify's 10s limit
async function plaid(endpoint, body) {
  const env  = process.env.PLAID_ENV || "sandbox";
  const base = PLAID_BASE[env] || PLAID_BASE.sandbox;

  const controller = new AbortController();
  const timeout    = setTimeout(() => controller.abort(), 8000);

  let res;
  try {
    res = await fetch(`${base}${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type":    "application/json",
        "PLAID-CLIENT-ID": process.env.PLAID_CLIENT_ID,
        "PLAID-SECRET":    process.env.PLAID_SECRET,
        "Plaid-Version":   "2020-09-14",
      },
      body:   JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  const data = await res.json();
  if (!res.ok) {
    const err     = new Error(data.error_message || data.display_message || "Plaid API error");
    err.plaid     = data;
    err.errorCode = data.error_code;
    throw err;
  }
  return data;
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  let body;
  try { body = JSON.parse(event.body || "{}"); }
  catch { return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "Invalid JSON" }) }; }

  if (!process.env.PLAID_CLIENT_ID || !process.env.PLAID_SECRET) {
    return {
      statusCode: 500, headers: CORS,
      body: JSON.stringify({ error: "Plaid credentials not set. Add PLAID_CLIENT_ID + PLAID_SECRET in Netlify env vars." }),
    };
  }

  const { action } = body;

  try {
    // 1. create_link_token
    if (action === "create_link_token") {
      const country = body.country === "US" ? "US" : "CA";
      const data = await plaid("/link/token/create", {
        user:          { client_user_id: body.user_id || "flourish-user" },
        client_name:   "Flourish Money",
        products:      ["transactions", "auth"],
        country_codes: [country],
        language:      "en",
        transactions:  { days_requested: 90 },
      });
      return ok({ link_token: data.link_token });
    }

    // 2. exchange_token
    if (action === "exchange_token") {
      const { public_token, institution_name = "Your Bank" } = body;
      if (!public_token) return e400("public_token required");
      const data = await plaid("/item/public_token/exchange", { public_token });
      return ok({ access_token: data.access_token, item_id: data.item_id, institution_name });
    }

    // 3. get_accounts
    if (action === "get_accounts") {
      const { access_token } = body;
      if (!access_token) return e400("access_token required");
      const data = await plaid("/accounts/balance/get", { access_token });
      return ok({
        accounts: data.accounts.map(a => ({
          id:      a.account_id,
          name:    a.official_name || a.name,
          type:    a.type,
          subtype: a.subtype,
          mask:    a.mask,
          balance: {
            available: a.balances.available,
            current:   a.balances.current,
            limit:     a.balances.limit,
            currency:  a.balances.iso_currency_code || "CAD",
          },
        })),
      });
    }

    // 4. get_transactions
    if (action === "get_transactions") {
      const { access_token, days = 90 } = body;
      if (!access_token) return e400("access_token required");

      const cappedDays = Math.min(Math.max(1, days), 730);
      const endDate    = new Date().toISOString().split("T")[0];
      const startDate  = new Date(Date.now() - cappedDays * 86_400_000).toISOString().split("T")[0];

      // Try /transactions/sync first. Fresh sandbox items sometimes return 0 —
      // fall back to /transactions/get which is date-range based and more reliable.
      let transactions = await syncTransactions(access_token, startDate, endDate);
      if (transactions.length === 0) {
        transactions = await getTransactions(access_token, startDate, endDate);
      }

      return ok({ transactions, total: transactions.length });
    }

    // 5. remove_item
    if (action === "remove_item") {
      const { access_token } = body;
      if (!access_token) return e400("access_token required");
      await plaid("/item/remove", { access_token });
      return ok({ removed: true });
    }

    return e400(`Unknown action: ${action}`);

  } catch (err) {
    console.error("[Plaid]", err.errorCode || "", err.message);

    if (err.errorCode === "ITEM_LOGIN_REQUIRED") {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "Bank session expired — please reconnect.", needs_reconnect: true }) };
    }
    if (err.name === "AbortError") {
      return { statusCode: 504, headers: CORS, body: JSON.stringify({ error: "Plaid request timed out. Please try again." }) };
    }

    return {
      statusCode: 500, headers: CORS,
      body: JSON.stringify({
        error:      err.message || "Plaid error",
        error_code: err.plaid?.error_code || null,
        error_type: err.plaid?.error_type || null,
      }),
    };
  }
};

// helpers
function ok(data) { return { statusCode: 200, headers: CORS, body: JSON.stringify(data) }; }
function e400(msg) { return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: msg }) }; }

// /transactions/sync — cursor-based, handles updates/removes
async function syncTransactions(access_token, startDate, endDate) {
  let added   = [];
  let cursor  = null;   // null (not undefined) for first call — Plaid is strict
  let hasMore = true;
  let pages   = 0;

  while (hasMore && pages < 10) {
    const req = { access_token, options: { include_personal_finance_category: true } };
    if (cursor) req.cursor = cursor;

    const page = await plaid("/transactions/sync", req);
    added   = added.concat(page.added);
    cursor  = page.next_cursor;
    hasMore = page.has_more;
    pages++;
  }

  return normalizeTxns(added, startDate, endDate);
}

// /transactions/get — date-range based, more reliable on fresh sandbox items
async function getTransactions(access_token, startDate, endDate) {
  const data = await plaid("/transactions/get", {
    access_token,
    start_date: startDate,
    end_date:   endDate,
    options: {
      count: 500, offset: 0,
      include_personal_finance_category: true,
      include_original_description:      true,
    },
  });
  return normalizeTxns(data.transactions || [], startDate, endDate);
}

// Normalize raw Plaid transactions → Flourish shape
function normalizeTxns(txns, startDate, endDate) {
  return txns
    .filter(t => t.date >= startDate && t.date <= endDate)
    .map(t => ({
      id:         t.transaction_id,
      account_id: t.account_id,
      date:       t.date,
      name:       t.merchant_name || t.original_description || t.name,
      amount:     t.amount,      // positive = money out (Plaid convention, kept as-is)
      category:   t.personal_finance_category?.primary || t.category?.[0] || "OTHER",
      currency:   t.iso_currency_code || "CAD",
      pending:    t.pending,
      logo_url:   t.logo_url || null,
    }))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}
