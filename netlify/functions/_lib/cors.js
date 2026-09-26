// netlify/functions/_lib/cors.js
// -----------------------------------------------------------------------------
// ONE ALLOW-LIST FOR EVERY FUNCTION.
//
// Five functions each carried their own copy of the same Set and the same corsHeadersFor(). They
// drifted exactly as copies do: when the Android shell's origin was added to beta.js so open signup
// could work, coach, plaid, billing and meeting still refused it, which is KNOWN-DEFECTS 35. The list
// lives here now, so adding an origin is one edit in one place and cannot be half-applied.
//
// THE FOUR ORIGINS, AND WHY EACH IS ON THE LIST.
//   https://flourishmoney.app  the site.
//   capacitor://localhost      the iOS shell. capacitor.config.json sets neither iosScheme nor
//                              hostname, so Capacitor's defaults apply.
//   https://localhost          the ANDROID shell. Capacitor 8 defaults androidScheme to "https" and
//                              the config does not override it, so the Android WebView serves from
//                              https://localhost and its fetches carry that Origin. It is a loopback
//                              address: nothing on the public internet can hold it, and a page served
//                              from a real site can never present it.
//   http://localhost:5173      vite dev.
//   http://localhost:8888      netlify dev.
//
// STILL STRICT. Exact string matching against a fixed Set, no wildcard, no pattern, no reflection of
// an arbitrary Origin, and the fallback for anything unknown is the production origin — which does
// not match the caller, so the browser blocks the response. That is the behaviour every function had
// before, unchanged; the Android shell is the only origin that was not already allowed somewhere.
// -----------------------------------------------------------------------------

"use strict";

const PRODUCTION_ORIGIN = "https://flourishmoney.app";

const ALLOWED_ORIGINS = new Set([
  PRODUCTION_ORIGIN,
  "capacitor://localhost",
  "https://localhost",
  "http://localhost:5173",
  "http://localhost:8888",
]);

function isAllowedOrigin(origin) {
  return ALLOWED_ORIGINS.has(origin);
}

/**
 * The CORS headers for this request. An allowed Origin is echoed back; anything else gets the
 * production origin, which will not match the caller, so the browser refuses the response.
 * @param {{headers?: object}} event Netlify's event
 */
function corsHeadersFor(event) {
  const origin = event?.headers?.origin || event?.headers?.Origin || "";
  const allowed = isAllowedOrigin(origin) ? origin : PRODUCTION_ORIGIN;
  return {
    "Access-Control-Allow-Origin":  allowed,
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type":                 "application/json",
  };
}

module.exports = { ALLOWED_ORIGINS, PRODUCTION_ORIGIN, isAllowedOrigin, corsHeadersFor };
