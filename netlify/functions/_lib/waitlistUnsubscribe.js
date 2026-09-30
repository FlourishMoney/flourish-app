// netlify/functions/_lib/waitlistUnsubscribe.js
// -----------------------------------------------------------------------------
// ONE-CLICK UNSUBSCRIBE LINKS FOR WAITLIST EMAIL (CASL): signed, per row, no login.
//
// A link is https://flourishmoney.app/api/unsubscribe?id=<waitlist row id>&t=<signature>. The signature
// is an HMAC-SHA256 of the row id under a server-only secret, so a link works for exactly one row and
// cannot be made for another row without the secret. It carries the row id, never the address: a URL
// ends up in logs and link scanners, and the address has no business there.
//
// THE SECRET. WAITLIST_UNSUBSCRIBE_SECRET when it is set. Until it is, one is derived from
// SUPABASE_SECRET_KEY (an HMAC of a fixed label, so the Supabase key itself is never the signing key and
// never leaves this function). Setting the dedicated secret later, or rotating the Supabase key, changes
// the signature: links already sent then fail, and the page they land on says to email
// hello@flourishmoney.app, which also unsubscribes.
// With neither available there is no secret, no link can be made, and no waitlist email is sent.
// -----------------------------------------------------------------------------
"use strict";
const crypto = require("crypto");

const UNSUBSCRIBE_BASE = "https://flourishmoney.app/api/unsubscribe";
const UNSUBSCRIBE_MAILTO = "mailto:hello@flourishmoney.app?subject=unsubscribe";
const ROW_ID_RX = /^[A-Za-z0-9-]{1,64}$/;

function unsubscribeSecret() {
  const own = (process.env.WAITLIST_UNSUBSCRIBE_SECRET || "").trim();
  if (own) return own;
  const sb = (process.env.SUPABASE_SECRET_KEY || "").trim();
  if (!sb) return "";
  return crypto.createHmac("sha256", sb).update("flourish/waitlist-unsubscribe/key/v1").digest("hex");
}

function unsubscribeToken(rowId, secret = unsubscribeSecret()) {
  const id = rowId == null ? "" : String(rowId);
  if (!secret || !ROW_ID_RX.test(id)) return null;
  return crypto.createHmac("sha256", secret).update(`waitlist-unsubscribe/v1/${id}`).digest("base64url");
}

// Constant-time comparison, and false for anything malformed rather than a throw.
function verifyUnsubscribeToken(rowId, token, secret = unsubscribeSecret()) {
  const expected = unsubscribeToken(rowId, secret);
  if (!expected || typeof token !== "string" || !token) return false;
  const a = Buffer.from(expected), b = Buffer.from(token);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function unsubscribeUrl(rowId, secret = unsubscribeSecret()) {
  const t = unsubscribeToken(rowId, secret);
  return t ? `${UNSUBSCRIBE_BASE}?id=${encodeURIComponent(String(rowId))}&t=${t}` : null;
}

// RFC 2369 / RFC 8058 headers for a waitlist email to this row: the signed link (which accepts the
// mailbox's one-click POST) and a mailto fallback. null when no link can be made.
function listUnsubscribeHeaders(rowId, secret = unsubscribeSecret()) {
  const url = unsubscribeUrl(rowId, secret);
  if (!url) return null;
  return {
    "List-Unsubscribe": `<${url}>, <${UNSUBSCRIBE_MAILTO}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

module.exports = { UNSUBSCRIBE_BASE, ROW_ID_RX, unsubscribeSecret, unsubscribeToken, verifyUnsubscribeToken, unsubscribeUrl, listUnsubscribeHeaders };
