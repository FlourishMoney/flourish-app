// netlify/functions/gift.js
// -----------------------------------------------------------------------------
// THE GIFT PAGES' ONE ENDPOINT: /api/gift (netlify.toml). Website only. Every rule is in _lib/gifts.js.
//
//   GET                  the price of each gift on sale, from the one config value (GIFT_PRICES), for the gift page
//   POST checkout        the buyer's form -> a Stripe Checkout Session (payment mode, Stripe Tax, no promotion codes)
//                        -> { url }. No sign-in: anyone may buy a gift. 20 an hour per IP address.
//   POST redeem          { code }, signed in (Bearer) -> the gift turns on for that account. 20 tries an hour per IP
//                        address and 8 per account, counted before the code is looked at, so guessing is slow.
//
// SALES ARE OFF UNTIL GIFTS_ENABLED IS EXACTLY "true": the prices and the checkout answer 404. Redeeming does not depend
// on it, so a code bought before sales were switched off still works (codes never expire).
//
// NEVER FROM A STORE APP. The iPhone and Android apps have no gift screen (Apple 3.1.1: no unlocking with codes inside
// the app), and a request from their origins (capacitor://localhost, https://localhost) is refused here too, so a code
// can only ever be redeemed on the website. Only the website's own origin (and local dev) is answered.
//
// What the client may send: the form's fields and a code. Never a price, an amount, a plan id from Stripe or a user id.
// -----------------------------------------------------------------------------
"use strict";

const { getUserFromRequest, getAdminClient, unauthorized } = require("./_lib/auth");
const { isNativeRequest, PRODUCTION_ORIGIN } = require("./_lib/cors");
const { stripePost } = require("./_lib/stripeApi");
const { getStore } = require("@netlify/blobs");
const { connectBlobs } = require("./_lib/blobsContext");
const { subjectKey, hourWindow, countIn, limiterSecret } = require("./_lib/limiterKeys");
const gifts = require("./_lib/gifts");

const WEB_ORIGINS = new Set([PRODUCTION_ORIGIN, "http://localhost:5173", "http://localhost:8888"]);
const MAX_BODY = 8000;
const LIMITS = Object.freeze({ checkoutIp: 20, redeemIp: 20, redeemUser: 8 });
const STORE = "gift_attempts";

function headersFor(event) {
  const origin = event?.headers?.origin || event?.headers?.Origin || "";
  return {
    "Access-Control-Allow-Origin": WEB_ORIGINS.has(origin) ? origin : PRODUCTION_ORIGIN,
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "Vary": "Origin",
  };
}
const json = (statusCode, headers, body, extra = {}) => ({ statusCode, headers: { ...headers, ...extra }, body: JSON.stringify(body) });

function clientIp(event) {
  const h = event?.headers || {};
  return String(h["x-nf-client-connection-ip"] || h["x-forwarded-for"] || "").split(",")[0].trim();
}

function attemptsStore() {
  try { return getStore(STORE); } catch { return null; }
}

/**
 * Count one attempt in this hour for a subject; true when it is over the limit. The subject is kept only as a keyed
 * hash (_lib/limiterKeys.js), with this hour's count and nothing else; limiter-cleanup.js clears past hours.
 * failClosed: with no store or no secret, a redeem is refused (a guesser must never get unlimited tries); a checkout
 * goes on (Stripe checkout itself is not a way in).
 */
async function overLimit(store, kind, value, max, { failClosed, now = new Date(), secret = limiterSecret() } = {}) {
  const key = subjectKey(kind, value, secret);
  if (!store || !key) return failClosed;
  try {
    const w = hourWindow(now);
    const n = countIn(await store.get(key, { type: "json" }), w) + 1;
    await store.setJSON(key, { w, n });
    return n > max;
  } catch (e) {
    console.error("[gift] attempts store:", e && e.message ? "unavailable" : "error");
    return failClosed;
  }
}

exports.handler = async (event) => {
  connectBlobs(event);   // before any getStore: Lambda-style functions get their Blobs context on the event
  return run(event);
};

// The handler's work, with its parts injectable for tests/gifts.test.cjs (store, stripePost, getUser, admin).
async function run(event, deps = {}) {
  const H = headersFor(event);
  if (isNativeRequest(event)) return json(403, H, { error: "web_only" });
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: H, body: "" };

  if (event.httpMethod === "GET") {
    if (!gifts.giftsEnabled()) return json(404, H, { error: "not_found" });
    // Only what is sold (the Plus gift waits for Plus).
    return json(200, H, { enabled: true, currency: gifts.GIFT_PRICES.currency,
      prices: Object.fromEntries(gifts.SOLD_PLANS.map((p) => [p, gifts.GIFT_PRICES[p]])) });
  }
  if (event.httpMethod !== "POST") return json(405, H, { error: "method_not_allowed" });
  if ((event.body || "").length > MAX_BODY) return json(413, H, { error: "too_large" });

  let body;
  try { body = JSON.parse(event.body || "{}"); } catch { return json(400, H, { error: "invalid_json" }); }
  const store = deps.store !== undefined ? deps.store : attemptsStore();
  const ip = clientIp(event);

  if (body.action === "checkout") {
    if (!gifts.giftsEnabled()) return json(404, H, { error: "not_found" });
    if (await overLimit(store, "gift-checkout-ip", ip, LIMITS.checkoutIp, { failClosed: false })) {
      return json(429, H, { error: "limited" }, { "Retry-After": "3600" });
    }
    const checked = gifts.checkGiftForm(body);
    if (!checked.ok) return json(400, H, { error: "invalid", fields: checked.errors });
    try {
      const post = deps.stripePost || stripePost;
      const session = await post("/checkout/sessions", gifts.checkoutParams(checked.form));
      return json(200, H, { url: session.url });
    } catch (e) {
      // Stripe's message can name the account; it does not go to the client.
      console.error("[gift] checkout:", e && e.statusCode ? e.statusCode : "no_status");
      return json(502, H, { error: "unavailable" });
    }
  }

  if (body.action === "redeem") {
    // Counted before anything else, signed in or not, so a stream of guesses is slow from its first try. Netlify always
    // gives the client's address; without one this count is skipped (and logged), and the per-account limit below,
    // which needs no address, still holds every try.
    if (!ip) console.error("[gift] redeem: no client address; only the per-account limit applies");
    else if (await overLimit(store, "gift-redeem-ip", ip, LIMITS.redeemIp, { failClosed: true })) {
      return json(429, H, { ok: false, result: "limited" }, { "Retry-After": "3600" });
    }
    const who = deps.getUser ? await deps.getUser(event) : await getUserFromRequest(event);
    if (!who || !who.user_id) return unauthorized(H, (who && who.error) || "unauthorized");
    if (await overLimit(store, "gift-redeem-user", who.user_id, LIMITS.redeemUser, { failClosed: true })) {
      return json(429, H, { ok: false, result: "limited" }, { "Retry-After": "3600" });
    }
    let admin;
    try { admin = deps.admin || getAdminClient(); }
    catch { return json(500, H, { ok: false, result: "unavailable" }); }
    const r = await gifts.redeemGift({ admin, userId: who.user_id, rawCode: body.code });
    return json(r.result === "unavailable" ? 503 : 200, H, r);
  }

  return json(400, H, { error: "unknown_action" });
}

exports.run = run;
exports.overLimit = overLimit;
exports.LIMITS = LIMITS;
exports.STORE = STORE;
