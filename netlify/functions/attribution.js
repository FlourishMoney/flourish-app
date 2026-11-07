/**
 * Flourish — the store handoff's counts
 * netlify/functions/attribution.js   (POST /api/attribution)
 *
 * {"event": "landing_visit" | "store_click" | "install", "src": "...", "cr": "..."}
 * /get sends the first two (public/get/get.js); the Android app sends install once, on first launch
 * (src/lib/attribution.js). Adds 1 to a daily count and keeps nothing else: no IP, no user agent, no account.
 * The answer is the same whether or not the count was taken.
 */
"use strict";
const { corsHeadersFor } = require("./_lib/cors");
const { PUBLIC_EVENTS, platformFromUserAgent, bumpAttributionCount } = require("./_lib/attribution");

exports.handler = async (event) => {
  const CORS = { ...corsHeadersFor(event), "Cache-Control": "no-store" };
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: CORS, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers: CORS, body: "" };
  let body = null;
  try { body = JSON.parse(event.body || "{}"); } catch { /* not JSON */ }
  if (!body || !PUBLIC_EVENTS.includes(body.event)) return { statusCode: 400, headers: CORS, body: "" };
  const h = event.headers || {};
  await bumpAttributionCount({
    supabaseUrl: (process.env.SUPABASE_URL || "").trim(),
    secretKey: (process.env.SUPABASE_SECRET_KEY || "").trim(),
    name: body.event,
    attribution: { src: body.src, cr: body.cr },
    platform: platformFromUserAgent(h["user-agent"] || h["User-Agent"]),
  });
  return { statusCode: 204, headers: CORS, body: "" };
};
