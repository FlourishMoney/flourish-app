/**
 * Flourish Money — Plaid API Proxy
 * netlify/functions/plaid.js
 *
 * Actions: create_link_token | exchange_token | get_accounts | get_transactions
 *          get_investments | get_liabilities | remove_item
 *
 * Env vars (Netlify → Site Settings → Environment Variables):
 *   PLAID_CLIENT_ID  — your Plaid client ID
 *   PLAID_SECRET     — your Plaid secret
 *   PLAID_ENV        — sandbox | development | production
 */

"use strict";

const { getUserFromRequest, getAdminClient } = require("./_lib/auth");

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
  const env  = (process.env.PLAID_ENV || "sandbox").trim().toLowerCase();
  const base = PLAID_BASE[env] || PLAID_BASE.sandbox;

  const controller = new AbortController();
  const timeout    = setTimeout(() => controller.abort(), 9500);

  let res;
  try {
    res = await fetch(`${base}${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type":    "application/json",
        "PLAID-CLIENT-ID": (process.env.PLAID_CLIENT_ID || "").trim(),
        "PLAID-SECRET":    (process.env.PLAID_SECRET || "").trim(),
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

// Map Plaid account subtypes to display labels
function accountSubtype(subtype) {
  const map = {
    rrsp:  "RRSP",
    tfsa:  "TFSA",
    fhsa:  "FHSA",
    resp:  "RESP",
    rrif:  "RRIF",
    lira:  "LIRA",
    "401k": "401(k)",
    roth:  "Roth IRA",
    hsa:   "HSA",
    "529": "529 Plan",
  };
  return map[subtype?.toLowerCase()] || subtype || "Investment";
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
  console.log("[Plaid debug] ENV:", process.env.PLAID_ENV, "| ACTION:", action, "| CLIENT_ID length:", (process.env.PLAID_CLIENT_ID||"").length, "| SECRET length:", (process.env.PLAID_SECRET||"").length);

  try {
    // 1. create_link_token
    if (action === "create_link_token") {
      const country = body.country === "US" ? "US" : "CA";
      const isUpdate = !!body.access_token;
      const WEBHOOK_URL = "https://flourishmoney.app/.netlify/functions/plaid-webhook";
      const linkBody = isUpdate
        ? {
            user:         { client_user_id: body.user_id || "flourish-user" },
            client_name:  "Flourish Money",
            access_token: body.access_token,
            webhook:      WEBHOOK_URL,
            language:     "en",
          }
        : {
            user:          { client_user_id: body.user_id || "flourish-user" },
            client_name:   "Flourish Money",
            products:      ["transactions", "investments", "liabilities"],
            country_codes: [country],
            language:      "en",
            transactions:  { days_requested: 90 },
            redirect_uri:  "https://flourishmoney.app",
            webhook:       WEBHOOK_URL,
          };
      const data = await plaid("/link/token/create", linkBody);
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
      const data = await plaid("/accounts/get", { access_token });
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

      let transactions = await syncTransactions(access_token, startDate, endDate);
      if (transactions.length === 0) {
        transactions = await getTransactions(access_token, startDate, endDate);
      }

      return ok({ transactions, total: transactions.length });
    }

    // 5. get_investments
    if (action === "get_investments") {
      const { access_token } = body;
      if (!access_token) return e400("access_token required");
      try {
        const data = await plaid("/investments/holdings/get", { access_token });
        const securities = data.securities || [];
        const secMap = {};
        securities.forEach(s => { secMap[s.security_id] = s; });
        // Phase B3: build account map so each holding can carry its underlying
        // account's subtype (RRSP, TFSA, 401k, etc.) — this is what the user
        // actually cares about, not the security's type.
        const acctMap = {};
        (data.accounts || []).forEach(a => { acctMap[a.account_id] = a; });

        const holdings = (data.holdings || []).map(h => {
          const s = secMap[h.security_id] || {};
          return {
            account_id:      h.account_id,
            account_subtype: acctMap[h.account_id]?.subtype || null,
            id:       h.account_id + "_" + h.security_id,
            name:     s.name || "Unknown",
            ticker:   s.ticker_symbol || null,
            type:     s.type || "other",
            quantity: h.quantity,
            price:    s.close_price || 0,
            value:    h.institution_value || 0,
            currency: s.iso_currency_code || "CAD",
            gain:     null,
            gainPct:  null,
          };
        });

        return ok({ holdings });
      } catch {
        return ok({ holdings: [] });
      }
    }

    // 6. get_liabilities
    if (action === "get_liabilities") {
      const { access_token } = body;
      if (!access_token) return e400("access_token required");
      try {
        const data = await plaid("/liabilities/get", { access_token });
        const l = data.liabilities || {};
        return ok({
          credit: (l.credit || []).map(c => ({
            account_id: c.account_id,
            name:       c.name,
            balance:    c.last_statement_balance || 0,
            limit:      c.credit_limit || null,
            apr:        c.aprs?.[0]?.apr_percentage || null,
            minPayment: c.minimum_payment_amount || 0,
          })),
          mortgage: (l.mortgage || []).map(m => ({
            account_id:     m.account_id,
            name:           m.name,
            balance:        m.outstanding_principal_balance || 0,
            interestRate:   m.interest_rate?.percentage || null,
            monthlyPayment: m.next_monthly_payment || 0,
          })),
          student: (l.student || []).map(s => ({
            account_id:   s.account_id,
            name:         s.name,
            balance:      (s.outstanding_interest_amount || 0) + (s.outstanding_principal_balance || 0),
            interestRate: s.interest_rate_percentage || null,
          })),
        });
      } catch {
        return ok({ credit: [], mortgage: [], student: [] });
      }
    }

    // 7. remove_item
    if (action === "remove_item") {
      const { access_token } = body;
      if (!access_token) return e400("access_token required");
      await plaid("/item/remove", { access_token });
      return ok({ removed: true });
    }

    // 8. enrich_transactions
    if (action === "enrich_transactions") {
      // Phase C1: Plaid Enrich. Cleans transaction names, returns merchant logos
      // and refined categories. Billed per transaction (~$0.002 each).
      //
      // Input shape: { transactions: [{id, name, amount, currency, account_id, ...}, ...] }
      // Plaid endpoint accepts max 100 txns per request — we chunk internally.
      // Returns: { enriched: [{id, name, logo, mcc, category, ...}, ...] } — a flat array
      //          where each entry is keyed by `id` so the frontend can merge by id.
      const { transactions } = body;
      if (!Array.isArray(transactions) || transactions.length === 0) {
        return ok({ enriched: [] });
      }

      // Chunk into max-100 batches
      const chunks = [];
      for (let i = 0; i < transactions.length; i += 100) {
        chunks.push(transactions.slice(i, i + 100));
      }

      const enrichedAll = [];
      for (const chunk of chunks) {
        // Build Enrich's required input shape per txn
        const enrichInput = chunk.map(t => ({
          id: String(t.id),
          description: String(t.name || ""),
          amount: Math.abs(Number(t.amount) || 0),
          direction: (Number(t.amount) || 0) > 0 ? "OUTFLOW" : "INFLOW",
          iso_currency_code: t.currency || "CAD",
        }));

        try {
          const resp = await plaid("/transactions/enrich", {
            account_type: "depository", // Plaid wants this hint; safe default for personal-finance use
            transactions: enrichInput,
          });
          const enrichedChunk = (resp.enriched_transactions || []).map(et => ({
            id: et.id,
            name: et.enrichments?.merchant_name || et.description || null,
            logo: et.enrichments?.logo_url || null,
            website: et.enrichments?.website || null,
            category_primary: et.enrichments?.personal_finance_category?.primary || null,
            category_detailed: et.enrichments?.personal_finance_category?.detailed || null,
            category_icon: et.enrichments?.personal_finance_category_icon_url || null,
            payment_channel: et.enrichments?.payment_channel || null,
            location_city: et.enrichments?.location?.city || null,
            location_region: et.enrichments?.location?.region || null,
          }));
          enrichedAll.push(...enrichedChunk);
        } catch (err) {
          // Per-chunk failure — log and continue. Don't fail the whole request.
          console.warn("Enrich chunk failed:", err?.message || err);
        }
      }

      return ok({ enriched: enrichedAll });
    }

    // 9. store_item — auth-required: persist a Plaid Item for the authenticated user
    // Body: { access_token, item_id, institution_id?, institution_name? }
    if (action === "store_item") {
      const { user_id, error: authError } = await getUserFromRequest(event);
      if (!user_id) return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: authError || "unauthorized" }) };
      const { access_token, item_id, institution_id, institution_name } = body;
      if (!access_token || !item_id) return e400("access_token and item_id required");
      const admin = getAdminClient();
      const { data, error } = await admin
        .from("plaid_items")
        .upsert({
          user_id,
          item_id,
          access_token,
          institution_id: institution_id || null,
          institution_name: institution_name || null,
          status: "active",
        }, { onConflict: "user_id,item_id" })
        .select("id, item_id, institution_name, status, created_at")
        .single();
      if (error) {
        console.error("[plaid_items upsert]", error.message);
        return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: error.message }) };
      }
      return ok({ item: data });
    }

    // 10. list_items — auth-required: return all items for the authenticated user
    // (does NOT return access_token to client — only metadata)
    if (action === "list_items") {
      const { user_id, error: authError } = await getUserFromRequest(event);
      if (!user_id) return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: authError || "unauthorized" }) };
      const admin = getAdminClient();
      const { data, error } = await admin
        .from("plaid_items")
        .select("id, item_id, institution_id, institution_name, status, created_at, updated_at")
        .eq("user_id", user_id)
        .order("created_at", { ascending: true });
      if (error) {
        console.error("[plaid_items list]", error.message);
        return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: error.message }) };
      }
      return ok({ items: data || [] });
    }

    // 11. delete_item — auth-required: revoke an item from Plaid + delete row
    // Body: { item_id }
    if (action === "delete_item") {
      const { user_id, error: authError } = await getUserFromRequest(event);
      if (!user_id) return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: authError || "unauthorized" }) };
      const { item_id } = body;
      if (!item_id) return e400("item_id required");
      const admin = getAdminClient();
      // Look up the access_token first so we can revoke from Plaid
      const { data: row, error: fetchErr } = await admin
        .from("plaid_items")
        .select("access_token")
        .eq("user_id", user_id)
        .eq("item_id", item_id)
        .single();
      if (fetchErr || !row) {
        return e400("item not found for this user");
      }
      // Revoke from Plaid (best-effort — proceed with row delete even if this fails)
      try {
        await plaid("/item/remove", { access_token: row.access_token });
      } catch (revErr) {
        console.warn("[item/remove failed]", revErr.message);
      }
      // Delete row
      const { error: delErr } = await admin
        .from("plaid_items")
        .delete()
        .eq("user_id", user_id)
        .eq("item_id", item_id);
      if (delErr) {
        return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: delErr.message }) };
      }
      return ok({ removed: true });
    }

    // 12. migrate_items — auth-required: bulk-migrate localStorage tokens to Supabase
    // Body: { tokens: [{token, institution_name}, ...] }
    // For each token: call /item/get to derive item_id, upsert plaid_items row.
    // Returns: { successes: [{token, item_id}], failures: [{token, error}] }
    if (action === "migrate_items") {
      const { user_id, error: authError } = await getUserFromRequest(event);
      if (!user_id) return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: authError || "unauthorized" }) };
      const { tokens } = body;
      if (!Array.isArray(tokens) || tokens.length === 0) {
        return ok({ successes: [], failures: [] });
      }
      const admin = getAdminClient();
      const successes = [];
      const failures = [];
      for (const t of tokens) {
        if (!t?.token) {
          failures.push({ token: null, error: "missing token" });
          continue;
        }
        try {
          // Derive item_id + institution_id from Plaid
          const itemResp = await plaid("/item/get", { access_token: t.token });
          const item_id = itemResp.item?.item_id;
          const institution_id = itemResp.item?.institution_id || null;
          if (!item_id) {
            failures.push({ token: t.token, error: "no item_id returned" });
            continue;
          }
          // Upsert (idempotent — re-running migration is safe)
          const { error: upsertErr } = await admin
            .from("plaid_items")
            .upsert({
              user_id,
              item_id,
              access_token: t.token,
              institution_id,
              institution_name: t.institution_name || "Your Bank",
              status: "active",
            }, { onConflict: "user_id,item_id" });
          if (upsertErr) {
            failures.push({ token: t.token, error: upsertErr.message });
            continue;
          }
          successes.push({ token: t.token, item_id });
        } catch (err) {
          // Plaid /item/get failed (revoked token, login required, network, etc.)
          failures.push({ token: t.token, error: err.message || "plaid error", error_code: err.errorCode || null });
        }
      }
      return ok({ successes, failures });
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
  let cursor  = null;
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
      amount:     t.amount,
      category:   t.personal_finance_category?.primary || t.category?.[0] || "OTHER",
      currency:   t.iso_currency_code || "CAD",
      pending:    t.pending,
      logo_url:   t.logo_url || null,
    }))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}
