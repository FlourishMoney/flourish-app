// netlify/functions/_lib/limiterKeys.js
// -----------------------------------------------------------------------------
// WHAT THE RATE LIMITERS KEEP (2026-10-21: no IP address or email address is kept).
//
// The signup limiter (_lib/signupLimit.js) and the coach's per-IP backstop (coach.js) count requests in
// Netlify Blobs. Their keys used to carry the raw IP address or email address, and nothing ever deleted
// them. Now:
//   - A KEYED HASH, never the value. Each subject is HMAC-SHA256(secret, "limiter/<kind>/<value>"), so the
//     store holds no IP or address, and a hash cannot be reversed or matched without the secret.
//   - ONE ENTRY PER SUBJECT, HOLDING ONLY ITS CURRENT WINDOW: { w: "<window>", n }. The first write after the
//     window has passed replaces the old count, and limiter-cleanup.js deletes, every day, any entry whose
//     window has passed (and every key in the old raw format).
//
// THE SECRET. LIMITER_HASH_SECRET when it is set. Until it is, one is derived from SUPABASE_SECRET_KEY: an
// HMAC of a fixed label, so the Supabase key itself is never the hashing key (the same rule as
// _lib/waitlistUnsubscribe.js and _lib/foundingConfirm.js). With neither there is no secret, nothing is
// written, and the signup limiter refuses (it fails closed) while the coach's backstop is skipped.
// Setting or rotating the secret only resets the counts.
// -----------------------------------------------------------------------------
"use strict";
const crypto = require("crypto");

const KEY_VERSION = "v2";

function limiterSecret(env = process.env) {
  const own = String(env.LIMITER_HASH_SECRET || "").trim();
  if (own) return own;
  const sb = String(env.SUPABASE_SECRET_KEY || "").trim();
  if (!sb) return "";
  return crypto.createHmac("sha256", sb).update("flourish/limiter-key/v1").digest("hex");
}

/** The store key for one subject ("ip", "email", "coach-ip"), or null with no value or no secret. */
function subjectKey(kind, value, secret = limiterSecret()) {
  const v = String(value == null ? "" : value).trim().toLowerCase();
  if (!secret || !v || !/^[a-z-]+$/.test(kind)) return null;
  return `${KEY_VERSION}/${kind}/${crypto.createHmac("sha256", secret).update(`limiter/${kind}/${v}`).digest("base64url")}`;
}

const hourWindow = (now) => now.toISOString().slice(0, 13);   // YYYY-MM-DDTHH
const dayWindow = (now) => now.toISOString().slice(0, 10);    // YYYY-MM-DD

/** The count already in this window (0 once the window has passed). */
function countIn(record, window) {
  return record && record.w === window && Number.isFinite(record.n) ? record.n : 0;
}

const isCurrentFormat = (key) => typeof key === "string" && key.startsWith(`${KEY_VERSION}/`);

module.exports = { KEY_VERSION, limiterSecret, subjectKey, hourWindow, dayWindow, countIn, isCurrentFormat };
