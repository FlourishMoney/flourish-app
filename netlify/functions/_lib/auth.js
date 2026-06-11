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
      if (error) console.error("[auth] getUser failed:", error.message);
      return { user_id: null, error: "invalid or expired token" };
    }
    return { user_id: data.user.id, error: null };
  } catch (err) {
    console.error("[auth] getUser threw:", err.message);
    return { user_id: null, error: "authentication error" };
  }
}

// Sprint Q item 11: server-authoritative plan/entitlement from the profiles table (never trust a
// client-sent plan). Returns { plan, founder_flag, unlimited }. A trial counts as unlimited only
// while unexpired (14 days from trial_started_at). Defaults to free on any error — auth still gates
// access; worst case a paid user is briefly treated as free on a transient DB error.
async function getUserPlan(user_id) {
  try {
    const admin = getAdminClient();
    const { data, error } = await admin
      .from("profiles")
      .select("plan, trial_started_at, founder_flag")
      .eq("user_id", user_id)
      .maybeSingle();
    if (error || !data) return { plan: "free", founder_flag: false, unlimited: false };
    const plan = data.plan || "free";
    const founder = !!data.founder_flag;
    let unlimited = founder || plan === "plus" || plan === "pro";
    if (!unlimited && plan === "trial" && data.trial_started_at) {
      unlimited = (Date.now() - new Date(data.trial_started_at).getTime()) < 14 * 86400000;
    }
    return { plan, founder_flag: founder, unlimited };
  } catch (e) {
    console.error("[auth] getUserPlan failed (defaulting to free):", e.message);
    return { plan: "free", founder_flag: false, unlimited: false };
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
  getUserPlan,
  unauthorized,
};
