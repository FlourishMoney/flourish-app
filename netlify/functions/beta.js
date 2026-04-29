/**
 * Flourish Money — Beta Cap Function
 * netlify/functions/beta.js
 *
 * Actions:
 *   count  — returns current beta signup count + cap + spots remaining
 *   check  — returns {allowed: bool} — whether signup is still open
 *
 * Env vars needed:
 *   SUPABASE_URL         — your Supabase project URL
 *   SUPABASE_SECRET_KEY  — your Supabase service_role secret key (NOT the anon key)
 */

"use strict";

const BETA_CAP = 30;

// Phase D2: origin-aware CORS — locks to known origins, falls back to production.
const ALLOWED_ORIGINS = new Set([
  "https://flourishmoney.app",
  "http://localhost:5173",
  "http://localhost:8888",
]);

function corsHeadersFor(event) {
  const origin = event.headers?.origin || event.headers?.Origin || "";
  const allowed = ALLOWED_ORIGINS.has(origin) ? origin : "https://flourishmoney.app";
  return {
    "Access-Control-Allow-Origin":  allowed,
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type":                 "application/json",
  };
}

async function getUserCount(supabaseUrl, secretKey) {
  const res = await fetch(`${supabaseUrl}/auth/v1/admin/users?page=1&per_page=1`, {
    headers: {
      "apikey": secretKey,
      "Authorization": `Bearer ${secretKey}`,
    },
  });
  if (!res.ok) throw new Error("Failed to fetch user count");
  const data = await res.json();
  // Supabase returns total in the response
  return data.total || (data.users?.length ? data.users.length : 0);
}

exports.handler = async (event) => {
  // Phase D2: per-request CORS (origin-aware). Inner references can keep using CORS.
  const CORS = corsHeadersFor(event);

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const supabaseUrl = (process.env.SUPABASE_URL || "").trim();
  const secretKey   = (process.env.SUPABASE_SECRET_KEY || "").trim();

  if (!supabaseUrl || !secretKey) {
    return {
      statusCode: 500, headers: CORS,
      body: JSON.stringify({ error: "Missing SUPABASE_URL or SUPABASE_SECRET_KEY env vars" }),
    };
  }

  let action = "count";
  try {
    const body = JSON.parse(event.body || "{}");
    action = body.action || "count";
  } catch {}

  try {
    const count = await getUserCount(supabaseUrl, secretKey);
    const spotsLeft = Math.max(0, BETA_CAP - count);
    const allowed = count < BETA_CAP;

    if (action === "check") {
      return {
        statusCode: 200, headers: CORS,
        body: JSON.stringify({ allowed, count, cap: BETA_CAP, spotsLeft }),
      };
    }

    // Default: count
    return {
      statusCode: 200, headers: CORS,
      body: JSON.stringify({ count, cap: BETA_CAP, spotsLeft, allowed }),
    };

  } catch (err) {
    console.error("[beta]", err.message);
    return {
      statusCode: 502, headers: CORS,
      body: JSON.stringify({ error: err.message, allowed: true }), // fail open so signups aren't blocked by an error
    };
  }
};
