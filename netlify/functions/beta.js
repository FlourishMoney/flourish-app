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
 *   RESEND_API_KEY       — OPTIONAL (Production only). Sends the waitlist confirmation email. When it
 *                          is unset, the signup still succeeds and no email is sent (previews, local).
 *   BETA_CODES           — REQUIRED while signup is invite-only. Comma-separated list of valid
 *                          beta/access codes. If unset, the function fails CLOSED (every code is
 *                          rejected). There is deliberately no hardcoded fallback — a missing config
 *                          must never mean "accept known codes".
 *   OPEN_SIGNUP          — OPTIONAL. "true" opens signup to anyone, with no code. Anything else,
 *                          including unset, keeps signup invite-only exactly as it is today. Read
 *                          server-side only; its value never reaches the client bundle. See
 *                          _lib/signupGate.js.
 */

"use strict";

const { getAdminClient } = require("./_lib/auth"); // Sprint Z3 #1: supabase-js admin client (service role) for the signup path
const { openSignupEnabled, decideSignup } = require("./_lib/signupGate");

const BETA_CAP = 30;

// Valid access codes come ONLY from process.env.BETA_CODES (comma-separated, trimmed, upper-cased).
// Returns [] when the env var is missing or empty, which makes validateBetaCode reject everything —
// FAIL CLOSED. Previously this fell back to a hardcoded launch list, so an unset env var silently
// accepted those specific codes; that list also then lived in source. Both are gone.
function loadBetaCodes() {
  const raw = process.env.BETA_CODES;
  if (!raw || !raw.trim()) return [];
  return raw.split(",").map(c => c.trim().toUpperCase()).filter(Boolean);
}

// True only if `code` matches a configured code. Logs (once per call) when no codes are configured so
// a misconfiguration is loud in the function logs rather than a silent lock-out with no explanation.
function validateBetaCode(code) {
  const codes = loadBetaCodes();
  if (codes.length === 0) {
    console.error("[beta] BETA_CODES env var is unset or empty — rejecting all access codes (fail closed). Set BETA_CODES in the Netlify environment.");
    return false;
  }
  return codes.includes(String(code || "").trim().toUpperCase());
}

// Phase D2: origin-aware CORS — locks to known origins, falls back to production.
const ALLOWED_ORIGINS = new Set([
  "https://flourishmoney.app",
  "capacitor://localhost", // iOS app WKWebView origin — see coach.js for why. Without it, beta-code signup fails on device.
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

// ─── Waitlist confirmation email ─────────────────────────────────────────────────────────────────
// The template, the send and the welcomed_at write live in _lib/waitlistWelcome.js, because the
// scheduled sweep (waitlist-sweep.js) sends the SAME message to rows this path could not reach.
const { sendWelcomeEmail, markWelcomed } = require("./_lib/waitlistWelcome");

// The insert is the one call the signup genuinely depends on, so it gets the same 5s as the send. With
// all three deadlines the worst case for join_waitlist is 5 + 5 + 3 = 13s, well inside Netlify's 60s
// synchronous limit, and in the normal case the whole thing is under a second.
const INSERT_TIMEOUT_MS = 5000;
// After a timed-out insert, one short read decides whether the row landed anyway. It runs only on that
// path, so its deadline is small: worst case for that path is 5s + 2s.
const CONFIRM_TIMEOUT_MS = 2000;

// Does a row for this address exist? Used ONLY to interpret a timed-out insert. PostgREST not
// answering does not mean Postgres did not commit, and telling someone their signup failed when the
// row is there is the worse error: they try again, hit the unique constraint, and are told they are
// already on a list they were just told they were not on.
async function waitlistRowExists(supabaseUrl, secretKey, email) {
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), CONFIRM_TIMEOUT_MS);
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/waitlist?email=eq.${encodeURIComponent(email)}&select=id&limit=1`, {
      headers: {
        "apikey": secretKey,
        "Authorization": `Bearer ${secretKey}`,
        "Accept": "application/json",
      },
      signal: controller.signal,
    });
    if (!res.ok) {
      console.error("[waitlist] insert confirm failed", res.status);
      return false;
    }
    const rows = await res.json();
    return Array.isArray(rows) && rows.length > 0;
  } catch (err) {
    // Same logging rule as everywhere else here: a fixed message and a status word, never the address
    // (which is in the URL of this very request) and never the error.
    const aborted = !!err && (err.name === "AbortError" || err.name === "TimeoutError");
    console.error("[waitlist] insert confirm failed", aborted ? "timeout" : "no_status");
    return false;
  } finally {
    clearTimeout(deadline);
  }
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

  // Sprint Z #5: beta/promo-code validation lives server-side — codes never ship in the client bundle.
  // Valid codes come ONLY from BETA_CODES; unset env var → validateBetaCode returns false (fail closed).
  if (action === "validate") {
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: validateBetaCode(body.code) }) };
  }

  // Is the door open? The ONE thing the client is told about OPEN_SIGNUP, and the only reason this
  // action exists: the store apps bundle the web code at build time, so the sign-up screen inside a
  // shipped binary cannot know what Amanda set in Netlify afterwards. It must ask.
  //
  // Read-only, no Supabase call, no secret, and it answers exactly one boolean. Nothing else about the
  // configuration leaves the server, and a client that never calls it behaves as it does today.
  if (action === "signup_status") {
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ openSignup: openSignupEnabled() }) };
  }

  // Phase E1: waitlist email capture (replaces public signup CTAs).
  if (action === "join_waitlist") {
    const { email, country, source, metadata } = body;

    // Normalize BEFORE validating. The regex rejects any whitespace, so a trailing or leading space,
    // which is a typo and not a different address, used to fail the check outright ("you@example.com "
    // was a 400 while "you@example.com" was fine). Normalizing first also means the value that is
    // validated is exactly the value that is stored and emailed: one address, decided in one place.
    const emailAddr = typeof email === "string" ? email.trim().toLowerCase() : "";

    // Basic email validation
    if (!emailAddr || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailAddr)) {
      return {
        statusCode: 400, headers: CORS,
        body: JSON.stringify({ error: "Valid email required" }),
      };
    }

    // Use service role to insert (bypasses RLS)
    const insertController = new AbortController();
    const insertDeadline = setTimeout(() => insertController.abort(), INSERT_TIMEOUT_MS);
    let insertRes;
    try {
      insertRes = await fetch(`${supabaseUrl}/rest/v1/waitlist`, {
        method: "POST",
        headers: {
          "apikey": secretKey,
          "Authorization": `Bearer ${secretKey}`,
          "Content-Type": "application/json",
          "Prefer": "return=representation",
        },
        body: JSON.stringify({
          email: emailAddr,
          country: country || null,
          source: source || null,
          metadata: metadata || {},
        }),
        signal: insertController.signal,
      });
    } catch (err) {
      // Previously this threw out of the handler, so a hanging Supabase held the request until the
      // platform killed it. Now it ends at the deadline and answers with the same shape the other
      // insert failures use. No row, so no email. The error itself is never logged.
      const aborted = !!err && (err.name === "AbortError" || err.name === "TimeoutError");
      console.error("[waitlist] insert failed", aborted ? "timeout" : "no_status");
      // The insert may have committed even though the call did not answer. One read settles it. If the
      // row is there the signup DID succeed, so say so with the response the client already handles.
      // No email is sent here: this path cannot know whether one went out, and the scheduled sweep
      // sends to any row whose welcomed_at is still null. If the read cannot confirm a row, the 500
      // stands, because claiming success for a signup that may not exist is the worse mistake.
      if (await waitlistRowExists(supabaseUrl, secretKey, emailAddr)) {
        console.error("[waitlist] insert did not answer but the row exists: reporting success, sweep will send");
        return {
          statusCode: 200, headers: CORS,
          body: JSON.stringify({ joined: true, alreadyJoined: false }),
        };
      }
      return {
        statusCode: 500, headers: CORS,
        body: JSON.stringify({ error: "Failed to join waitlist" }),
      };
    } finally {
      clearTimeout(insertDeadline);
    }

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
      // errText is the raw PostgREST body. It can quote the offending row, including the address, so
      // it is never logged. The status plus the Postgres SQLSTATE (23505, 23502, 42501 and so on) is
      // enough to tell a permissions problem from a constraint problem in the function logs.
      const pgCode = (/"code"\s*:\s*"([A-Za-z0-9]{1,10})"/.exec(errText) || [])[1] || "no_code";
      console.error("[waitlist] insert failed", insertRes.status, pgCode);
      return {
        statusCode: 500, headers: CORS,
        body: JSON.stringify({ error: "Failed to join waitlist" }),
      };
    }

    // The row is saved. Only now: send the confirmation, and record it if Resend accepted it. Both
    // steps are best effort. The signup has already succeeded, so neither failure changes this response.
    let insertedRow = null;
    try {
      const rows = await insertRes.json();
      insertedRow = Array.isArray(rows) ? rows[0] : rows;
    } catch { /* no or unparseable representation: markWelcomed falls back to the email filter */ }

    if (await sendWelcomeEmail(emailAddr, insertedRow && insertedRow.id)) {
      await markWelcomed(supabaseUrl, secretKey, insertedRow, emailAddr);
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
    // Invite-only unless OPEN_SIGNUP is exactly "true". With the flag unset this is byte for byte
    // today's answer: no code, or a code that is not configured, is invalid_code.
    const gate = decideSignup({ code, open: openSignupEnabled(), isValidCode: validateBetaCode });
    if (!gate.allow) {
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ error: gate.error }) };
    }

    let admin;
    try { admin = getAdminClient(); }
    catch (e) { console.error("[beta:signup] admin client unavailable:", e.message); return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: "server_misconfig" }) }; }

    // THE CAP IS THE INVITED COHORT'S CAP, so only a coded signup reserves a seat against it.
    //
    // beta_signups is what BETA_CAP counts. If a self-serve signup took a seat, the first 30 strangers
    // would fill the beta and lock out the people actually holding codes — and then, once full, every
    // open signup would answer cap_reached, which is exactly the shut door this work removes. So an
    // open signup skips the reservation entirely: it is never refused for a full cap, and it never
    // consumes one. A duplicate email is still caught, one step later and just as atomically, by
    // Supabase's own unique constraint in createUser (the email_exists branch below).
    let seat = null;
    if (gate.usedCode) {
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
    }

    // A coded signup now holds a seat. Create the auth user; on ANY failure, RELEASE it so the cap
    // stays accurate (best-effort — if the release itself fails the seat orphans; log loudly for manual
    // SQL). A self-serve signup reserved nothing, so there is nothing to release.
    const releaseSeat = async (why) => {
      if (seat !== "ok") return;
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
        // `beta` says whether a code was used, so it stops being true of everyone the day the door
        // opens; `signup_source` is the same word the response and the log carry. Neither grants
        // anything: handle_new_user (migration 0007) gives every new account the 14-day trial and
        // founder_flag false, and nothing anywhere reads these fields.
        user_metadata: { beta: gate.usedCode, signup_source: gate.source, signed_up: new Date().toISOString() },
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

    // signup_completed. There is no analytics pipeline yet (no events table, no Plausible, no GA), so
    // the funnel's record of this is the function log plus the `source` the client is handed back.
    // The cohort is the whole point of the field: `invited` is someone who was given a code,
    // `self_serve` is a stranger who found the app. No email and no identifier is logged.
    console.log(`[beta:signup] signup_completed source=${gate.source}`);

    return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true, source: gate.source }) };
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
