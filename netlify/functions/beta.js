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
 *   BETA_CODES           — REQUIRED. Comma-separated list of valid beta/access codes. If unset, the
 *                          function fails CLOSED (every code is rejected). There is deliberately no
 *                          hardcoded fallback — a missing config must never mean "accept known codes".
 */

"use strict";

const { getAdminClient } = require("./_lib/auth"); // Sprint Z3 #1: supabase-js admin client (service role) for the signup path

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

// ─── Waitlist confirmation email (Resend REST API over fetch, no SDK) ────────────────────────────
// One short confirmation, sent ONLY after the waitlist row is inserted, and never on a duplicate.
// RESEND_API_KEY is read from process.env at call time. It lives only in the Netlify Production
// context: it is never bundled, never returned, and never logged. When it is missing (deploy
// previews, netlify dev, local runs) the send is skipped silently, so no preview emails a real person.
const RESEND_ENDPOINT   = "https://api.resend.com/emails";
// A Netlify function is killed at 10s. Without a deadline of our own, a slow or hanging Resend call
// would take the whole request with it: the row is already inserted, but the person waits and then
// sees a failure for a signup that actually worked. 5s leaves room for the insert before it and the
// response after it. A timeout is just another failed send: no welcomed_at, still joined:true.
const RESEND_TIMEOUT_MS = 5000;
const WELCOME_FROM     = "Flourish <hello@flourishmoney.app>";
const WELCOME_REPLY_TO = "hello@flourishmoney.app";
const WELCOME_SUBJECT  = "You're on the Flourish waitlist";

// The approved copy, exactly as written. Do not add claims, launch dates or links.
// It is deliberately transactional: it confirms the person's own request and nothing else. The product
// description was removed on the owner's CASL decision (2026-09-19) so this is not a commercial
// electronic message. Promotional copy and the full CASL footer belong to the later launch email.
const WELCOME_PARAGRAPHS = [
  "Thanks for joining the Flourish waitlist.",
  "We'll email you when it's ready for you. No launch date yet, and we won't send anything else in the meantime.",
  "Questions or ideas? Just reply to this email.",
  "Amanda, founder of Flourish",
  "flourishmoney.app",
  "You're receiving this because you joined the waitlist at flourishmoney.app. If this wasn't you, reply and we'll remove you.",
];

// Both versions are built from the SAME array, so the plain-text and HTML copy can never drift apart.
const WELCOME_TEXT = WELCOME_PARAGRAPHS.join("\n\n");

// Cream background (#F4F1EB) and ink (#1A2035) are the app's own light-theme values. No images.
const _para = (text, extra) => `<p style="margin:0 0 16px;${extra || ""}">${text}</p>`;
const WELCOME_HTML = [
  '<!doctype html>',
  '<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>' + WELCOME_SUBJECT + '</title></head>',
  '<body style="margin:0;padding:0;background-color:#F4F1EB;">',
  '<div style="max-width:560px;margin:0 auto;padding:32px 24px;background-color:#F4F1EB;color:#1A2035;',
  'font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Helvetica,Arial,sans-serif;font-size:16px;line-height:1.6;">',
  WELCOME_PARAGRAPHS.slice(0, -1).map(t => _para(t)).join(""),
  _para(WELCOME_PARAGRAPHS[WELCOME_PARAGRAPHS.length - 1], "margin-top:24px;font-size:13px;color:rgba(26,32,53,0.66);"),
  '</div></body></html>',
].join("");

function welcomeEmailPayload(to) {
  return {
    from:     WELCOME_FROM,
    reply_to: WELCOME_REPLY_TO,
    to:       [to],
    subject:  WELCOME_SUBJECT,
    text:     WELCOME_TEXT,
    html:     WELCOME_HTML,
  };
}

// True only when Resend accepted the message. On failure it logs the words "welcome email failed"
// and the HTTP status, and nothing else: never the address, the key, the payload or the response body.
async function sendWelcomeEmail(to) {
  const key = (process.env.RESEND_API_KEY || "").trim();
  if (!key) return false; // no key configured: previews and local runs send nothing, silently
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), RESEND_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(welcomeEmailPayload(to)),
      signal: controller.signal,
    });
  } catch (err) {
    // "timeout" when our own deadline fired, "no_status" for any other network failure. The error
    // itself is never logged: it can carry the request URL and headers.
    const aborted = !!err && (err.name === "AbortError" || err.name === "TimeoutError");
    console.error("[waitlist] welcome email failed", aborted ? "timeout" : "no_status");
    return false;
  } finally {
    clearTimeout(deadline);
  }
  if (!res.ok) {
    console.error("[waitlist] welcome email failed", res.status);
    return false;
  }
  return true;
}

// Stamps welcomed_at on the row that was just inserted (migration 0006). Best effort: a failure here
// never changes what the signup is told. Uses the id the insert returned; falls back to the email
// filter only when the insert response carried no id.
async function markWelcomed(supabaseUrl, secretKey, row, email) {
  const filter = row && row.id != null
    ? `id=eq.${encodeURIComponent(row.id)}`
    : `email=eq.${encodeURIComponent(email)}`;
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/waitlist?${filter}`, {
      method: "PATCH",
      headers: {
        "apikey": secretKey,
        "Authorization": `Bearer ${secretKey}`,
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
      },
      body: JSON.stringify({ welcomed_at: new Date().toISOString() }),
    });
    if (!res.ok) console.error("[waitlist] welcomed_at update failed", res.status);
  } catch {
    console.error("[waitlist] welcomed_at update failed", "no_status");
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
    const insertRes = await fetch(`${supabaseUrl}/rest/v1/waitlist`, {
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

    if (await sendWelcomeEmail(emailAddr)) {
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
    if (!validateBetaCode(code)) {
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
