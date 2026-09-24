// netlify/functions/_lib/stripeSignature.js
// -----------------------------------------------------------------------------
// IS THIS WEBHOOK REALLY FROM STRIPE?
//
// Hand-rolled rather than stripe.webhooks.constructEvent, for the same reason
// _lib/webhook-verify.js hand-rolls Plaid's: it keeps the check pure, so the gate can
// test a tampered body and an expired timestamp offline with no SDK and no key.
//
// Stripe signs `${timestamp}.${rawBody}` with HMAC-SHA256 and sends
//   Stripe-Signature: t=1699999999,v1=<hex>,v1=<hex>
// More than one v1 appears while an endpoint secret is being rotated; any match is valid.
//
// The raw body matters: verify BEFORE JSON.parse and never re-serialise, because
// re-serialising changes the bytes and every signature then fails.
// -----------------------------------------------------------------------------
"use strict";
const crypto = require("crypto");

const DEFAULT_TOLERANCE_SEC = 300;   // Stripe's own recommendation, replay-window bound

function parseHeader(header) {
  const out = { t: null, v1: [] };
  for (const part of String(header || "").split(",")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const k = part.slice(0, i).trim(), v = part.slice(i + 1).trim();
    if (k === "t") out.t = v;
    else if (k === "v1") out.v1.push(v);
  }
  return out;
}

function timingSafeEqualHex(a, b) {
  const ba = Buffer.from(String(a), "utf8"), bb = Buffer.from(String(b), "utf8");
  if (ba.length !== bb.length) return false;           // length alone is not a secret
  return crypto.timingSafeEqual(ba, bb);
}

// { ok: true } | { ok: false, reason }. Fails closed on every missing input.
function verifyStripeSignature(rawBody, sigHeader, secret, opts = {}) {
  const tolerance = Number.isFinite(opts.toleranceSec) ? opts.toleranceSec : DEFAULT_TOLERANCE_SEC;
  const nowSec = Math.floor((opts.now instanceof Date ? opts.now.getTime() : (opts.now ?? Date.now())) / 1000);

  if (typeof rawBody !== "string" || !rawBody) return { ok: false, reason: "missing_body" };
  if (!sigHeader)                              return { ok: false, reason: "missing_signature" };
  if (!secret)                                 return { ok: false, reason: "missing_secret" };

  const { t, v1 } = parseHeader(sigHeader);
  if (!t || !/^\d+$/.test(t)) return { ok: false, reason: "malformed_signature" };
  if (!v1.length)             return { ok: false, reason: "malformed_signature" };

  const age = nowSec - Number(t);
  if (Math.abs(age) > tolerance) return { ok: false, reason: "timestamp_outside_tolerance" };

  const expected = crypto.createHmac("sha256", secret).update(`${t}.${rawBody}`, "utf8").digest("hex");
  for (const candidate of v1) if (timingSafeEqualHex(expected, candidate)) return { ok: true };
  return { ok: false, reason: "signature_mismatch" };
}

// Test helper, also the shape Stripe sends. Exported so the gate can sign a body without a key.
function signPayload(rawBody, secret, timestampSec) {
  const t = String(timestampSec ?? Math.floor(Date.now() / 1000));
  const v1 = crypto.createHmac("sha256", secret).update(`${t}.${rawBody}`, "utf8").digest("hex");
  return `t=${t},v1=${v1}`;
}

module.exports = { verifyStripeSignature, signPayload, parseHeader, DEFAULT_TOLERANCE_SEC };
