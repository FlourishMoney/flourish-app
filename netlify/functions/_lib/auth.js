// Shared auth helper for Netlify Functions.
// Verifies a Supabase JWT from the Authorization header and returns the user_id.
// Used by plaid.js and plaid-webhook.js to scope server-side operations to the
// authenticated user.

"use strict";

const { createClient } = require("@supabase/supabase-js");
const { deriveEntitlement } = require("./planRules");

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
//
// AN UNCONFIRMED ADDRESS IS NOT AN ACCOUNT. Open signup creates the user before anyone has proved
// they own the address (that is what the confirmation email is for), so until email_confirmed_at is
// set this returns no user and every function that calls this answers 401. Enforcing it here rather
// than in each function means coach, plaid, billing and meeting are all covered by one rule, and it
// holds whatever the project's "Confirm email" dashboard setting happens to say.
//
// Nobody who exists today is affected: every account so far was admin-created with email_confirm
// true, and coded signups still are, so they all carry a confirmation timestamp.
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
    if (!isEmailConfirmed(data.user)) {
      return { user_id: null, error: "email not confirmed" };
    }
    return { user_id: data.user.id, error: null };
  } catch (err) {
    console.error("[auth] getUser threw:", err.message);
    return { user_id: null, error: "authentication error" };
  }
}

// Has this address been proved? GoTrue sets email_confirmed_at, and older rows may carry
// confirmed_at instead, so both count. A user object without either is unconfirmed.
function isEmailConfirmed(user) {
  return !!(user && (user.email_confirmed_at || user.confirmed_at));
}

// The PUBLIC client, built with the publishable (anon) key rather than the secret one.
//
// It exists for exactly one job: asking Supabase to send its own "Confirm your signup" email through
// the project's SMTP. That is auth.resend({ type: "signup" }), a public endpoint, and it is the
// mechanism the platform documents for "this user exists but has not confirmed yet". The service key
// is not the right credential for it, and admin.generateLink() is the wrong tool — it hands back a
// link for an application to email itself, which would mean owning a second template and a second
// sending path when the project already has one configured.
//
// Throws when SUPABASE_ANON_KEY is unset, so a missing variable is loud at the call site and the
// signup that depends on it fails rather than silently creating an account no email can reach.
let _public = null;
function getPublicClient() {
  if (_public) return _public;
  const url = (process.env.SUPABASE_URL || "").trim();
  const key = (process.env.SUPABASE_ANON_KEY || "").trim();
  if (!url || !key) {
    throw new Error("SUPABASE_URL or SUPABASE_ANON_KEY env var is missing");
  }
  _public = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  return _public;
}

// Sprint Q (v1 policy): plan limits are CODE-READY but OFF for v1 (free, no IAP). Flip via the
// Netlify env var ENFORCE_PLAN_LIMITS=true when v1.1 IAP ships — no code deploy needed.
const ENFORCE_PLAN_LIMITS = process.env.ENFORCE_PLAN_LIMITS === "true";

// Sprint Q item 11: server-authoritative plan/entitlement from the profiles table (never trust a
// client-sent plan). Returns { plan, founder_flag, unlimited }. A trial counts as unlimited only
// until it ends: trial_ends_at when the row has one (migration 0007), otherwise trial_started_at
// + 14 days, so trials created before that migration do not move. The rule itself lives in
// _lib/planRules.js and is parity-tested against the client's copy. Defaults to free on any error —
// auth still gates access; worst case a paid user is briefly treated as free on a transient DB error.
async function getUserPlan(user_id) {
  try {
    const admin = getAdminClient();
    const { data, error } = await admin
      .from("profiles")
      .select("plan, trial_started_at, trial_ends_at, founder_flag")
      .eq("user_id", user_id)
      .maybeSingle();
    if (error || !data) return { plan: "free", founder_flag: false, unlimited: false, paid: false };
    const plan = data.plan || "free";
    const founder = !!data.founder_flag;

    // From 2026-10-26 the subscription row, not the profile, is what makes a household paid. Read
    // it second and separately: a missing or unreadable subscriptions table (it is applied after
    // this code ships) must leave the profile answer exactly as it was, never throw, and never
    // upgrade anyone. Same failure posture as the rest of this function — worst case a paying user
    // is briefly treated as free, never the reverse.
    let sub = null;
    try {
      const { data: subRow, error: subErr } = await admin
        .from("subscriptions")
        .select("status, current_period_end, plan_key, cancel_at_period_end")
        .eq("user_id", user_id)
        .maybeSingle();
      if (!subErr) sub = subRow || null;
    } catch (e) {
      console.error("[auth] subscription read failed (treating as unpaid):", e.message);
    }

    const ent = deriveEntitlement(data, sub);
    return {
      // `plan` stays the RAW profiles.plan value it has always been — plaid.js, coach.js and the
      // existing tests read this shape. The derived answer is added beside it, not in place of it.
      plan,
      entitlement: ent.plan,          // "beta_founder" | "premium" | "trial" | "free"
      founder_flag: founder,
      unlimited: ent.unlimited,
      paid: ent.paidSubscription,
      subscription_status: sub ? sub.status : null,
    };
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
  ENFORCE_PLAN_LIMITS,
  unauthorized,
  isEmailConfirmed,
  getPublicClient,
};
