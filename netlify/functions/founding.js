/**
 * Flourish — founding spots left
 * netlify/functions/founding.js   (GET /api/founding)
 *
 * Answers {"spotsLeft": N}: 50 less the waitlist rows that are not test rows, never below 0. A count
 * and nothing else. No address, no id, no row leaves through this function, and it takes no input.
 *
 * If the count cannot be read (no env, Supabase down or slow, migration 0014 not applied yet, a reply
 * without a count) it answers 503 {"error":"unavailable"} and the landing page shows no number. It never
 * answers with a remembered or default figure older than 60 s.
 *
 * Cache: 60 s. A good answer is kept in this instance's memory for 60 s and sent with max-age=60 for the
 * browser and Netlify's CDN. A failure is never cached.
 *
 * Env vars: SUPABASE_URL, SUPABASE_SECRET_KEY (service role, server only).
 */

"use strict";

const { corsHeadersFor } = require("./_lib/cors");
const { spotsLeftFromCount, countFromContentRange } = require("./_lib/foundingWaitlist");

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

// The eligible-row count, or null. HEAD with count=exact: PostgREST sends the total in Content-Range and
// no body at all, so not even the one id the select names comes back.
async function readEligibleCount(supabaseUrl, secretKey) {
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), READ_TIMEOUT_MS);
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/waitlist?select=id&is_test=is.false`, {
      method: "HEAD",
      headers: { "apikey": secretKey, "Authorization": `Bearer ${secretKey}`, "Prefer": "count=exact" },
      signal: controller.signal,
    });
    if (!res.ok) {
      console.error("[founding] count failed", res.status);
      return null;
    }
    const n = countFromContentRange(res.headers && typeof res.headers.get === "function" ? res.headers.get("content-range") : null);
    if (n === null) console.error("[founding] count failed", "no_count_header");
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
  const unavailable = () => ({ statusCode: 503, headers: headersFor(event, false), body: JSON.stringify({ error: "unavailable" }) });

  if (cached && now - cached.at < CACHE_MS) {
    return { statusCode: 200, headers: headersFor(event, true), body: JSON.stringify({ spotsLeft: cached.spotsLeft }) };
  }
  cached = null;

  const supabaseUrl = (process.env.SUPABASE_URL || "").trim();
  const secretKey   = (process.env.SUPABASE_SECRET_KEY || "").trim();
  if (!supabaseUrl || !secretKey) return unavailable();

  const spotsLeft = spotsLeftFromCount(await readEligibleCount(supabaseUrl, secretKey));
  if (spotsLeft === null) return unavailable();
  cached = { at: now, spotsLeft };
  return { statusCode: 200, headers: headersFor(event, true), body: JSON.stringify({ spotsLeft }) };
}

exports.handler = (event, context) => handler(event, context);
// For tests: the handler with a chosen clock, and a way to start each case with no cached answer.
exports._test = { handler, resetCache: () => { cached = null; }, CACHE_MS };
