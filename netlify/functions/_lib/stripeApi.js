// netlify/functions/_lib/stripeApi.js
// -----------------------------------------------------------------------------
// The two Stripe calls this app makes, over fetch. No SDK, for the same reason the rest
// of this tree hand-rolls its providers: one less dependency in the function bundle, and
// the request shape stays visible.
//
// Stripe's API is form-encoded, and nests with brackets: line_items[0][price]=price_123.
// -----------------------------------------------------------------------------
"use strict";

const STRIPE_BASE = "https://api.stripe.com/v1";

function formEncode(obj, prefix = "", out = []) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === "object" && !Array.isArray(v)) formEncode(v, key, out);
    else if (Array.isArray(v)) v.forEach((item, i) => {
      if (typeof item === "object") formEncode(item, `${key}[${i}]`, out);
      else out.push(`${encodeURIComponent(`${key}[${i}]`)}=${encodeURIComponent(item)}`);
    });
    else out.push(`${encodeURIComponent(key)}=${encodeURIComponent(v)}`);
  }
  return out.join("&");
}

function secretKey(env = process.env) {
  const key = (env.STRIPE_SECRET_KEY || "").trim();
  if (!key) throw new Error("STRIPE_SECRET_KEY is missing");
  return key;
}

// The key never appears in a log line, an error message or a response body — only in this header.
async function stripePost(path, params, opts = {}) {
  const env = opts.env || process.env;
  const headers = {
    "Authorization": `Bearer ${secretKey(env)}`,
    "Content-Type": "application/x-www-form-urlencoded",
  };
  if (opts.idempotencyKey) headers["Idempotency-Key"] = opts.idempotencyKey;

  const res = await fetch(`${STRIPE_BASE}${path}`, { method: "POST", headers, body: formEncode(params) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message || `stripe ${res.status}`;
    const err = new Error(msg);
    err.statusCode = res.status;
    err.stripeCode = data?.error?.code || null;
    throw err;
  }
  return data;
}

module.exports = { stripePost, formEncode, STRIPE_BASE };
