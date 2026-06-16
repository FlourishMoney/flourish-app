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

const { getAdminClient } = require("./_lib/auth"); // Sprint Z3 #1: supabase-js admin client (service role) for the signup path

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
  let body = {};
  try {
    body = JSON.parse(event.body || "{}");
    action = body.action || "count";
  } catch {}

  // Sprint Z #5: beta/promo-code validation moved server-side — codes no longer ship in the client
  // bundle. Configurable via the BETA_CODES env var (comma-separated); falls back to the launch list.
  if (action === "validate") {
    const code = String(body.code || "").trim().toUpperCase();
    const codes = (process.env.BETA_CODES || "BETA100,FLOURISH2026,FOUNDER,APPLE_REVIEW_2026")
      .split(",").map(c => c.trim().toUpperCase()).filter(Boolean);
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: codes.includes(code) }) };
  }

  // Phase E1: waitlist email capture (replaces public signup CTAs).
  if (action === "join_waitlist") {
    const { email, country, source, metadata } = body;

    // Basic email validation
    if (!email || typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return {
        statusCode: 400, headers: CORS,
        body: JSON.stringify({ error: "Valid email required" }),
      };
    }

    // Use service role to insert (bypasses RLS)
    const insertRes = await fetch(`${supabaseUrl}/rest/v1/waitlist`, {
      method: "POST",
      headers: {
        "apikey": secretKey,
        "Authorization": `Bearer ${secretKey}`,
        "Content-Type": "application/json",
        "Prefer": "return=representation",
      },
      body: JSON.stringify({
        email: email.trim().toLowerCase(),
        country: country || null,
        source: source || null,
        metadata: metadata || {},
      }),
    });

    if (insertRes.status === 409) {
      // Unique violation — already on waitlist
      return {
        statusCode: 200, headers: CORS,
        body: JSON.stringify({ joined: true, alreadyJoined: true }),
      };
    }

    if (!insertRes.ok) {
      const errText = await insertRes.text();
      // Check for Postgres unique violation in error body
      if (errText.includes("duplicate key") || errText.includes("23505")) {
        return {
          statusCode: 200, headers: CORS,
          body: JSON.stringify({ joined: true, alreadyJoined: true }),
        };
      }
      console.error("[waitlist] insert failed:", errText);
      return {
        statusCode: 500, headers: CORS,
        body: JSON.stringify({ error: "Failed to join waitlist" }),
      };
    }

    return {
      statusCode: 200, headers: CORS,
      body: JSON.stringify({ joined: true, alreadyJoined: false }),
    };
  }

  // Sprint Z3 #1: server-side signup — the ONLY signup path once public sign-ups are disabled in
  // Supabase. Validates the beta code, ATOMICALLY reserves a seat (closes the count→insert TOCTOU via
  // reserve_beta_seat's advisory lock), then admin-creates the user. email_confirm:true (option b) —
  // beta accounts are admin-provisioned + confirmed; no transactional email provider needed (App Review note).
  if (action === "signup") {
    const email = String(body.email || "").trim().toLowerCase();
    const password = body.password;
    const code = String(body.code || "").trim().toUpperCase();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "invalid_email" }) };
    }
    if (!password || typeof password !== "string" || password.length < 8) {
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ error: "weak_password" }) };
    }
    const codes = (process.env.BETA_CODES || "BETA100,FLOURISH2026,FOUNDER,APPLE_REVIEW_2026")
      .split(",").map(c => c.trim().toUpperCase()).filter(Boolean);
    if (!codes.includes(code)) {
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ error: "invalid_code" }) };
    }

    let admin;
    try { admin = getAdminClient(); }
    catch (e) { console.error("[beta:signup] admin client unavailable:", e.message); return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: "server_misconfig" }) }; }

    // Atomic seat reservation (advisory-locked count+insert in Postgres).
    let seat;
    try {
      const { data, error } = await admin.rpc("reserve_beta_seat", { p_email: email, p_cap: BETA_CAP });
      if (error) throw error;
      seat = data; // 'ok' | 'cap_reached' | 'email_exists'
    } catch (e) {
      console.error("[beta:signup] reserve_beta_seat failed:", e.message);
      return { statusCode: 502, headers: CORS, body: JSON.stringify({ error: "reserve_failed", detail: (e.message || "").slice(0, 200) }) };
    }
    if (seat === "cap_reached")  return { statusCode: 200, headers: CORS, body: JSON.stringify({ error: "cap_reached" }) };
    if (seat === "email_exists") return { statusCode: 200, headers: CORS, body: JSON.stringify({ error: "email_exists" }) };

    // seat === 'ok' → seat reserved. Create the auth user; on ANY failure, RELEASE the seat so the cap
    // stays accurate (best-effort — if the release itself fails the seat orphans; log loudly for manual SQL).
    const releaseSeat = async (why) => {
      try {
        const { error: delErr } = await admin.from("beta_signups").delete().eq("email", email);
        if (delErr) console.error(`[beta:signup] ORPHAN SEAT (${why}) — seat-release FAILED for ${email}; manual cleanup: delete from public.beta_signups where email='${email}';`, delErr.message);
      } catch (de) {
        console.error(`[beta:signup] ORPHAN SEAT (${why}) — seat-release THREW for ${email}; manual cleanup: delete from public.beta_signups where email='${email}';`, de.message);
      }
    };

    try {
      const { error: createErr } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { beta: true, signed_up: new Date().toISOString() },
      });
      if (createErr) {
        await releaseSeat("createUser error");
        const m = (createErr.message || "").toLowerCase();
        if (createErr.code === "email_exists" || m.includes("already registered") || m.includes("already been registered")) {
          return { statusCode: 200, headers: CORS, body: JSON.stringify({ error: "email_exists" }) };
        }
        console.error("[beta:signup] createUser failed:", createErr.message);
        return { statusCode: 200, headers: CORS, body: JSON.stringify({ error: "create_failed", message: createErr.message }) };
      }
    } catch (e) {
      await releaseSeat("createUser threw");
      console.error("[beta:signup] createUser threw:", e.message);
      return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: "create_threw", detail: (e.message || "").slice(0, 200) }) };
    }

    return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true }) };
  }

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
