"use strict";

// jose v6+ is ESM-only; Netlify's Node CommonJS runtime requires dynamic import
let _josePromise = null;
function getJose() {
  if (!_josePromise) _josePromise = import("jose");
  return _josePromise;
}

const crypto = require("crypto");

const PLAID_BASE = {
  sandbox:    "https://sandbox.plaid.com",
  development:"https://development.plaid.com",
  production: "https://production.plaid.com",
};

// In-memory key cache (kid → JWK). Persists across warm Netlify invocations.
const keyCache = new Map();

async function fetchPlaidKey(kid) {
  const env = (process.env.PLAID_ENV || "sandbox").trim().toLowerCase();
  const base = PLAID_BASE[env] || PLAID_BASE.sandbox;
  const res = await fetch(`${base}/webhook_verification_key/get`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: (process.env.PLAID_CLIENT_ID || "").trim(),
      secret:    (process.env.PLAID_SECRET || "").trim(),
      key_id:    kid,
    }),
  });
  const data = await res.json();
  if (!res.ok || !data.key) {
    throw new Error(`fetchPlaidKey failed: ${data.error_message || res.status}`);
  }
  return data.key;
}

async function getKey(kid) {
  if (keyCache.has(kid)) return keyCache.get(kid);
  const { importJWK } = await getJose();
  const jwk = await fetchPlaidKey(kid);
  const key = await importJWK(jwk, "ES256");
  keyCache.set(kid, key);
  return key;
}

// Verifies a Plaid webhook. Returns { verified: bool, reason?: string }.
// Implementation follows Plaid's documented webhook verification flow:
// https://plaid.com/docs/api/webhooks/webhook-verification/
async function verifyPlaidWebhook(event) {
  try {
    const header = event.headers?.["plaid-verification"] || event.headers?.["Plaid-Verification"];
    if (!header) return { verified: false, reason: "missing Plaid-Verification header" };

    // Decode header without verifying to extract kid
    const [headerB64] = header.split(".");
    if (!headerB64) return { verified: false, reason: "malformed JWT" };
    const headerJson = JSON.parse(Buffer.from(headerB64, "base64url").toString("utf8"));
    const kid = headerJson.kid;
    if (!kid) return { verified: false, reason: "no kid in JWT header" };

    const key = await getKey(kid);

    // Verify signature
    const { jwtVerify } = await getJose();
    const { payload } = await jwtVerify(header, key, {
      algorithms: ["ES256"],
    });

    // Anti-replay: iat must be within 5 minutes
    const nowSec = Math.floor(Date.now() / 1000);
    if (!payload.iat || nowSec - payload.iat > 300) {
      return { verified: false, reason: "JWT too old (replay protection)" };
    }

    // Body integrity: request_body_sha256 must match SHA-256(rawBody)
    const rawBody = event.isBase64Encoded
      ? Buffer.from(event.body || "", "base64").toString("utf8")
      : (event.body || "");
    const bodyHash = crypto.createHash("sha256").update(rawBody).digest("hex");
    if (payload.request_body_sha256 !== bodyHash) {
      return { verified: false, reason: "body hash mismatch" };
    }

    return { verified: true };
  } catch (err) {
    return { verified: false, reason: err.message || "verification error" };
  }
}

module.exports = { verifyPlaidWebhook };
