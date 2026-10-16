// netlify/functions/_lib/plaidLink.js
// -----------------------------------------------------------------------------
// THE LINK TOKEN, AND HOW A STORE APP LEARNS WHAT HAPPENED IN PLAID HOSTED LINK.
//
// The website runs Plaid's web SDK in the page, as it always has. The store apps cannot: Plaid has
// deprecated the web SDK inside a WebView and recommends Hosted Link instead ("We recommend using a
// Hosted Link instead of trying to use the Plaid Web SDK in a webview", plaid.com/docs/link/hosted-link).
// So a link token minted for a store app (isNativeRequest) carries a `hosted_link` object, and Plaid
// returns a `hosted_link_url` the app opens in the system's in-app browser, outside its WebView.
//
//   completion_redirect_uri  where Plaid sends the browser when the session ends, success or not. A
//                            custom scheme the app registers (Info.plist, AndroidManifest.xml). Plaid
//                            says it "does not need to be registered with the Plaid Dashboard".
//   is_mobile_app            true: the URL is opened in an out-of-process browser on a phone.
//   redirect_uri             required when is_mobile_app is true. A universal link (iOS) / App Link
//                            (Android) on its own path, so a bank's app can hand the household back to
//                            Flourish. Plaid finishes the session itself; the app only ignores it.
//
// THE RESULT IS READ, NEVER TRUSTED FROM THE REDIRECT. Plaid calls the completion URI "whether the user
// successfully completed the session" or not, so the app asks the server (hosted_link_result), which
// asks Plaid (/link/token/get, results kept six hours) and returns success with the public_token, exited,
// error or pending. The public_token then goes through the existing exchange_token, unchanged.
//
// THE RESULT KEY. hosted_link_result hands back a public_token, so it answers only the account that
// minted the link token: create_link_token returns a result_key, an HMAC of the user id and the link
// token under a key derived from PLAID_SECRET (never PLAID_SECRET itself), and hosted_link_result
// refuses a key that does not match the caller. Nothing here logs a token, a key or a public_token.
// -----------------------------------------------------------------------------
"use strict";
const crypto = require("crypto");

const WEBHOOK_URL = "https://flourishmoney.app/.netlify/functions/plaid-webhook";
// The website's OAuth return (src/lib/plaidOAuthReturn.js): the page a bank sends the browser back to,
// where Link is re-opened with receivedRedirectUri. Must be in Plaid Dashboard → Developers → API →
// Allowed redirect URIs BEFORE this ships: Plaid refuses a link token whose redirect_uri is not listed.
const WEB_REDIRECT_URI = "https://flourishmoney.app/plaid/oauth";
// The store apps' universal link / App Link. Its own path, so the website's return is never captured by
// the app. Must be in Allowed redirect URIs too, and served by public/.well-known (AASA, assetlinks.json).
const APP_REDIRECT_URI = "https://flourishmoney.app/plaid/app";
// Where Hosted Link sends the in-app browser when the session ends. Registered by both store apps.
const HOSTED_LINK_COMPLETION_URI = "flourishmoney://plaid/complete";

const LINK_TOKEN_RX = /^link-[a-z]+-[0-9a-f-]{20,64}$/i;

/**
 * The /link/token/create body. Update mode (an access token) re-links an existing item; otherwise a new
 * item. A store app gets Hosted Link and the app's universal link; the website keeps the web SDK.
 */
function linkTokenBody({ userId, country, accessToken = null, native = false }) {
  const body = accessToken
    ? {
        user:         { client_user_id: userId },
        client_name:  "Flourish Money",
        access_token: accessToken,
        webhook:      WEBHOOK_URL,
        language:     "en",
        redirect_uri: WEB_REDIRECT_URI,   // Plaid: specify it in update mode too, for an OAuth bank
      }
    : {
        user:              { client_user_id: userId },
        client_name:       "Flourish Money",
        // Only `transactions` is REQUIRED — every depository (chequing/savings) account
        // supports it, so deposit-only users (e.g. Scotiabank with no cards/investments) can
        // link. `investments` and `liabilities` are OPTIONAL: Plaid still shows the institution
        // and lets the user link, extracting+billing those products only when the chosen
        // account type supports them. Listing them under required `products` made Plaid reject
        // any user whose accounts didn't support EVERY product ("Connectivity not supported").
        products:          ["transactions"],
        optional_products: ["investments", "liabilities"],
        country_codes:     [country === "US" ? "US" : "CA"],
        language:          "en",
        transactions:      { days_requested: 90 },
        redirect_uri:      WEB_REDIRECT_URI,
        webhook:           WEBHOOK_URL,
      };
  if (native) {
    body.redirect_uri = APP_REDIRECT_URI;   // required with is_mobile_app, update mode included
    body.hosted_link = { completion_redirect_uri: HOSTED_LINK_COMPLETION_URI, is_mobile_app: true };
  }
  return body;
}

function resultSecret(plaidSecret = process.env.PLAID_SECRET) {
  const s = String(plaidSecret || "").trim();
  if (!s) return "";
  return crypto.createHmac("sha256", s).update("flourish/plaid-hosted-link/key/v1").digest("hex");
}

function resultKey(userId, linkToken, secret = resultSecret()) {
  if (!secret || !userId || !linkToken) return "";
  return crypto.createHmac("sha256", secret).update(`hosted-link-result/v1/${userId}/${linkToken}`).digest("base64url");
}

function resultKeyMatches(userId, linkToken, key, secret = resultSecret()) {
  const want = resultKey(userId, linkToken, secret);
  if (!want || typeof key !== "string" || !key) return false;
  const a = Buffer.from(want), b = Buffer.from(key);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * What a Hosted Link session came to, from a /link/token/get response.
 *   success  an item was added: { public_token, institution_name, institution_id }
 *   error    the session ended on a Link error (an EXIT or ERROR event with an error_code)
 *   exited   the session ended without an item (the household left Link)
 *   pending  no finished session yet (the result can lag the redirect by a moment)
 * The newest session wins. `results.item_add_results` is Plaid's recommended field; `on_success` is the
 * older one and is read only when `results` is absent.
 */
function readHostedLinkResult(data) {
  const sessions = Array.isArray(data?.link_sessions) ? data.link_sessions.slice() : [];
  const at = (s) => Date.parse(s?.finished_at || s?.started_at || "") || 0;
  sessions.sort((a, b) => at(b) - at(a));
  for (const s of sessions) {
    const added = Array.isArray(s?.results?.item_add_results) ? s.results.item_add_results : [];
    const item = added.find((r) => r && typeof r.public_token === "string" && r.public_token);
    const legacy = !s?.results && s?.on_success && typeof s.on_success.public_token === "string" && s.on_success.public_token ? s.on_success : null;
    if (item || legacy) {
      const inst = (item ? item.institution : legacy.metadata?.institution) || {};
      return {
        status: "success",
        public_token: item ? item.public_token : legacy.public_token,
        institution_name: typeof inst.name === "string" && inst.name.trim() ? inst.name.trim() : null,
        institution_id: typeof inst.institution_id === "string" && inst.institution_id ? inst.institution_id : null,
      };
    }
  }
  const finished = sessions.find((s) => s && s.finished_at);
  if (!finished) return { status: "pending" };
  const events = Array.isArray(finished.events) ? finished.events : [];
  const failed = events.some((e) => (e?.event_name === "EXIT" || e?.event_name === "ERROR") && e?.event_metadata?.error_code);
  return { status: failed ? "error" : "exited" };
}

module.exports = {
  WEBHOOK_URL,
  WEB_REDIRECT_URI,
  APP_REDIRECT_URI,
  HOSTED_LINK_COMPLETION_URI,
  LINK_TOKEN_RX,
  linkTokenBody,
  resultSecret,
  resultKey,
  resultKeyMatches,
  readHostedLinkResult,
};
