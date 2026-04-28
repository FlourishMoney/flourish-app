// Shared auth helper for Netlify Functions.
// Verifies a Supabase JWT from the Authorization header and returns the user_id.
// Used by plaid.js and plaid-webhook.js to scope server-side operations to the
// authenticated user.

"use strict";

const { createClient } = require("@supabase/supabase-js");

let _admin = null;
function getAdminClient() {
  if (_admin) return _admin;
  const url = (process.env.SUPABASE_URL || "").trim();
  const key = (process.env.SUPABASE_SECRET_KEY || "").trim();
  if (!url || !key) {
    throw new Error("SUPABASE_URL or SUPABASE_SECRET_KEY env var is missing");
  }
  _admin = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  return _admin;
}

// Extracts the Bearer token from the Authorization header
function extractToken(event) {
  const auth = event.headers?.authorization || event.headers?.Authorization;
  if (!auth) return null;
  const match = /^Bearer\s+(.+)$/i.exec(auth);
  return match ? match[1] : null;
}

// Verifies the JWT and returns { user_id, error }
// On success: { user_id: "uuid-string", error: null }
// On failure: { user_id: null, error: "reason" }
async function getUserFromRequest(event) {
  const token = extractToken(event);
  if (!token) return { user_id: null, error: "missing Authorization header" };

  try {
    const admin = getAdminClient();
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data?.user) {
      return { user_id: null, error: error?.message || "invalid token" };
    }
    return { user_id: data.user.id, error: null };
  } catch (err) {
    return { user_id: null, error: err.message };
  }
}

// Returns a Netlify Functions-style 401 response
function unauthorized(corsHeaders, reason = "unauthorized") {
  return {
    statusCode: 401,
    headers: corsHeaders,
    body: JSON.stringify({ error: reason }),
  };
}

module.exports = {
  getAdminClient,
  getUserFromRequest,
  unauthorized,
};
