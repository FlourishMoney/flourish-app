/**
 * Flourish — founding spots left
 * netlify/functions/founding.js   (GET /api/founding)
 *
 * Answers {"spotsLeft": N, "openSignup": true|false}: 50 less the founding seats held, never below 0, and
 * whether signup is open (the same public answer as beta.js signup_status, from OPEN_SIGNUP). The landing reads
 * both from this one call (src/lib/signupUi.js). No address, no id, no row leaves through this function, and it
 * takes no input.
 *
 * THE FIRST 50 WHO SUBSCRIBE (Amanda, 2026-10-29). A seat is held by a household whose founding subscription's
 * first payment succeeded, on the website, the App Store or Google Play, and given back by a refund
 * (migration 0032, founding_seats_taken()). Waitlist numbers are not counted. At 50 the answer is 0, and the
 * founding price is offered nowhere (_lib/foundingCohort.js asks the same count).
 *
 * If the count cannot be read (no env, Supabase down or slow, 0032 not applied yet, a reply that is not a whole
 * number) it answers 503 {"error":"unavailable"} and the landing page shows no number. The answer still says
 * whether signup is open. It never answers with a remembered or default figure older than 60 s.
 *
 * Cache: 60 s. A good answer is kept in this instance's memory for 60 s and sent with max-age=60 for the
 * browser and Netlify's CDN. A failure is never cached.
 *
 * Env vars: SUPABASE_URL, SUPABASE_SECRET_KEY (service role, server only).
 */

"use strict";

const { corsHeadersFor } = require("./_lib/cors");
const { FOUNDING_SEAT_LIMIT } = require("./_lib/foundingSeats");
const { openSignupEnabled } = require("./_lib/signupGate");

const CACHE_MS = 60 * 1000;
const READ_TIMEOUT_MS = 4000;

let cached = null; // { at, spotsLeft }

function headersFor(event, ok) {
  return {
    ...corsHeadersFor(event),
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Vary": "Origin",
    ...(ok
      ? { "Cache-Control": "public, max-age=60", "Netlify-CDN-Cache-Control": "public, max-age=60", "Netlify-Vary": "header=Origin" }
      : { "Cache-Control": "no-store", "Netlify-CDN-Cache-Control": "no-store" }),
  };
}

// The founding seats held (0032), or null. One RPC call with the service role; the answer is a bare number.
async function readSeatsTaken(supabaseUrl, secretKey) {
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), READ_TIMEOUT_MS);
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/founding_seats_taken`, {
      method: "POST",
      headers: { "apikey": secretKey, "Authorization": `Bearer ${secretKey}`, "Content-Type": "application/json" },
      body: "{}",
      signal: controller.signal,
    });
    if (!res.ok) {
      console.error("[founding] count failed", res.status);
      return null;
    }
    const n = await res.json();
    if (!Number.isInteger(n) || n < 0) { console.error("[founding] count failed", "not_a_count"); return null; }
    return n;
  } catch (err) {
    const aborted = !!err && (err.name === "AbortError" || err.name === "TimeoutError");
    console.error("[founding] count failed", aborted ? "timeout" : "no_status");
    return null;
  } finally {
    clearTimeout(deadline);
  }
}

async function handler(event, _context, now = Date.now()) {
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: headersFor(event, false), body: "" };
  if (event.httpMethod !== "GET" && event.httpMethod !== "HEAD") {
    return { statusCode: 405, headers: headersFor(event, false), body: JSON.stringify({ error: "Method not allowed" }) };
  }
  const openSignup = openSignupEnabled();
  const unavailable = () => ({ statusCode: 503, headers: headersFor(event, false), body: JSON.stringify({ error: "unavailable", openSignup }) });

  if (cached && now - cached.at < CACHE_MS) {
    return { statusCode: 200, headers: headersFor(event, true), body: JSON.stringify({ spotsLeft: cached.spotsLeft, openSignup }) };
  }
  cached = null;

  const supabaseUrl = (process.env.SUPABASE_URL || "").trim();
  const secretKey   = (process.env.SUPABASE_SECRET_KEY || "").trim();
  if (!supabaseUrl || !secretKey) return unavailable();

  const seats = await readSeatsTaken(supabaseUrl, secretKey);
  if (seats === null) return unavailable();
  const spotsLeft = Math.max(0, FOUNDING_SEAT_LIMIT - seats);
  cached = { at: now, spotsLeft };
  return { statusCode: 200, headers: headersFor(event, true), body: JSON.stringify({ spotsLeft, openSignup }) };
}

exports.handler = (event, context) => handler(event, context);
// For tests: the handler with a chosen clock, and a way to start each case with no cached answer.
exports._test = { handler, resetCache: () => { cached = null; }, CACHE_MS };
