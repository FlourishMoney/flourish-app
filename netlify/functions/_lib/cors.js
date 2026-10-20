// netlify/functions/_lib/cors.js
// -----------------------------------------------------------------------------
// ONE ALLOW-LIST FOR EVERY FUNCTION.
//
// Five functions each carried their own copy of the same Set and the same corsHeadersFor(). They
// drifted exactly as copies do: when the Android shell's origin was added to beta.js so open signup
// could work, coach, plaid, billing and meeting still refused it, which is KNOWN-DEFECTS 35. The list
// lives here now, so adding an origin is one edit in one place and cannot be half-applied.
//
// THE FIVE ORIGINS, AND WHY EACH IS ON THE LIST.
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

// THE STORE APPS, by the Origin their WebViews send: capacitor://localhost (iOS) and https://localhost
// (Android), as above. The plan does NOT depend on it: a store app gets the web's answer (_lib/planRules.js
// deriveEntitlement). It decides only what the server TELLS a store app, which sells nothing: billing.js
// answers a store app's status with `paid` alone, no prices, no founding offer and no portal. Safe in the
// only direction that matters: a caller that claims to be a store app is told less, never given more.
const NATIVE_ORIGINS = new Set(["capacitor://localhost", "https://localhost"]);

function isNativeRequest(event) {
  const origin = event?.headers?.origin || event?.headers?.Origin || "";
  return NATIVE_ORIGINS.has(origin);
}

// A STORE APP THAT SELLS (version 1.1, in-app purchase). A store build with in-app purchase switched on marks
// every request whose answer depends on the household's plan: "store_billing": true in the JSON body (the
// coach's chat and every Plaid call, src/lib/storeBilling.js storeBillingFields), or ?store_billing=1. Not a
// header, so the CORS allow-list above stays exactly as it is.
// It changes one thing: a subscription bought on the web counts in that build, because the same subscription
// can be bought there too (Apple 3.1.3(b), multiplatform). A 1.0.x store build never sends it and keeps the
// rule above. Only ever read together with isNativeRequest: a web page that sends it is still a web page, and
// a caller that fakes it gains nothing it has not paid for.
function isStoreBillingRequest(event) {
  if (!isNativeRequest(event)) return false;
  if (String(event?.queryStringParameters?.store_billing || "").trim() === "1") return true;
  const raw = typeof event?.body === "string" ? event.body : "";
  if (!raw) return false;
  try { return JSON.parse(raw).store_billing === true; } catch { return false; }
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

module.exports = { ALLOWED_ORIGINS, NATIVE_ORIGINS, PRODUCTION_ORIGIN, isAllowedOrigin, isNativeRequest, isStoreBillingRequest, corsHeadersFor };
