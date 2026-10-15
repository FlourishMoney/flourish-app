// netlify/functions/_lib/foundingConfirm.js
// -----------------------------------------------------------------------------
// "SEND ME A CONFIRMATION LINK" FOR AN OLDER ACCOUNT THAT HOLDS A FOUNDING ADDRESS (billing day, round 4).
//
// The founding price needs an address the household confirmed by clicking our link
// (app_metadata.email_confirmation = "link", _lib/foundingCohort.js). Accounts made before that marker
// existed (invited, confirmed on creation) have none, so one holding a founding address was offered only the
// regular prices. From the checkout screen it can now ask for a link:
//   1. billing.js action "send_founding_confirmation" (signed in, billing on): only when this account needs it
//      (foundingCohort.foundingConfirmNeeded), at most SEND_LIMIT times in 24 hours, emails a signed link to
//      the account's own address;
//   2. netlify/functions/founding-confirm.js: GET shows one button and changes nothing (mail scanners open
//      every link); POST checks the signature, the expiry and that the account's address is still the one
//      the link was sent to, then sets app_metadata.email_confirmation to "link".
//
// THE LINK carries the account id, an expiry and a signature: never the address. The signature covers the
// md5 of the normalised address, so a link stops working if the address changes. Signed with
// FOUNDING_CONFIRM_SECRET, or a key derived from SUPABASE_SECRET_KEY (never the Supabase key itself).
// No address, account id or key is ever logged.
// -----------------------------------------------------------------------------
"use strict";
const crypto = require("crypto");

const CONFIRM_BASE = "https://flourishmoney.app/api/founding-confirm";
const CONFIRM_TTL_SEC = 24 * 3600;
const SEND_LIMIT = 3;                      // links per account per rolling 24 hours
const SEND_WINDOW_MS = 24 * 3600 * 1000;
const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RESEND_ENDPOINT = "https://api.resend.com/emails";
const RESEND_TIMEOUT_MS = 5000;

const EMAIL_SUBJECT = "Confirm your email address for your founding price";
const CONTACT_BLOCK = Object.freeze(["flourish is operated by GrowSmart Inc., PO Box 29, Foxboro ON K0K 2B0.", "hello@flourishmoney.app"]);

function confirmSecret() {
  const own = (process.env.FOUNDING_CONFIRM_SECRET || "").trim();
  if (own) return own;
  const sb = (process.env.SUPABASE_SECRET_KEY || "").trim();
  if (!sb) return "";
  return crypto.createHmac("sha256", sb).update("flourish/founding-confirm/key/v1").digest("hex");
}

// The same key the database uses for an address (0014's waitlist_email_key): md5 of the address with case
// and whitespace dropped.
function emailKey(email) {
  const norm = typeof email === "string" ? email.replace(/\s+/g, "").toLowerCase() : "";
  return norm ? crypto.createHash("md5").update(norm).digest("hex") : "";
}

function confirmToken(userId, email, expiresAt, secret = confirmSecret()) {
  const k = emailKey(email);
  if (!secret || !UUID_RX.test(String(userId || "")) || !k || !Number.isInteger(expiresAt)) return null;
  return crypto.createHmac("sha256", secret).update(`founding-confirm/v1/${String(userId).toLowerCase()}/${k}/${expiresAt}`).digest("base64url");
}

// The link for this account, valid for 24 hours from `nowMs`, or null when none can be made.
function confirmUrl(userId, email, nowMs = Date.now(), secret = confirmSecret()) {
  const x = Math.floor(nowMs / 1000) + CONFIRM_TTL_SEC;
  const t = confirmToken(userId, email, x, secret);
  return t ? `${CONFIRM_BASE}?u=${encodeURIComponent(String(userId).toLowerCase())}&x=${x}&t=${t}` : null;
}

// "ok" | "expired" | "invalid": the link's parts, checked against the account's CURRENT address.
function checkConfirm({ u, x, t } = {}, currentEmail, nowMs = Date.now(), secret = confirmSecret()) {
  const exp = Number(x);
  if (!UUID_RX.test(String(u || "")) || !Number.isInteger(exp) || typeof t !== "string" || !t) return "invalid";
  const expected = confirmToken(u, currentEmail, exp, secret);
  if (!expected) return "invalid";
  const a = Buffer.from(expected), b = Buffer.from(t);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return "invalid";
  return Math.floor(nowMs / 1000) < exp ? "ok" : "expired";
}

// At most SEND_LIMIT links per account per rolling 24 hours, counted in Netlify Blobs by account id.
// { allowed: true } or { allowed: false, reason }. FAILS CLOSED: no store, or a store that errors, refuses.
async function checkSendLimit(store, userId, nowMs = Date.now()) {
  if (!store) return { allowed: false, reason: "store_unavailable" };
  try {
    const key = `founding-confirm/${String(userId).toLowerCase()}`;
    const prior = await store.get(key, { type: "json" });
    const recent = (Array.isArray(prior) ? prior : []).filter(ts => Number.isFinite(ts) && nowMs - ts < SEND_WINDOW_MS);
    if (recent.length >= SEND_LIMIT) return { allowed: false, reason: "rate_limited" };
    await store.setJSON(key, [...recent, nowMs]);
    return { allowed: true };
  } catch {
    return { allowed: false, reason: "store_unavailable" };
  }
}

// The email: a confirmation the account holder asked for, not marketing. Its words, exactly.
function confirmEmailParagraphs(url) {
  return [
    "You asked to confirm this email address for your flourish account, so the founding price can be matched to it.",
    `Confirm it here: ${url}`,
    "The link works for 24 hours. If you didn't ask for it, ignore this email and nothing changes.",
    "Amanda, founder of Flourish",
  ];
}
const _esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function foundingConfirmEmailPayload(to, url) {
  if (typeof to !== "string" || !to.trim() || !url) return null;
  const paras = confirmEmailParagraphs(url);
  const p = (h, extra) => `<p style="margin:0 0 16px;${extra || ""}">${h}</p>`;
  const small = "font-size:13px;color:rgba(26,32,53,0.66);";
  return {
    from: "Flourish <hello@flourishmoney.app>",
    reply_to: "hello@flourishmoney.app",
    to: [to],
    subject: EMAIL_SUBJECT,
    text: [...paras, ...CONTACT_BLOCK].join("\n\n"),
    html: [
      '<!doctype html>',
      `<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${EMAIL_SUBJECT}</title></head>`,
      '<body style="margin:0;padding:0;background-color:#F4F1EB;">',
      '<div style="max-width:560px;margin:0 auto;padding:32px 24px;background-color:#F4F1EB;color:#1A2035;',
      'font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Helvetica,Arial,sans-serif;font-size:16px;line-height:1.6;">',
      paras.map(x => x.startsWith("Confirm it here: ")
        ? p(`<a href="${url}" style="color:#1A2035;font-weight:700;">Confirm my email address</a>`)
        : p(_esc(x))).join(""),
      ...CONTACT_BLOCK.map((l, i) => p(_esc(l), (i === 0 ? "margin-top:24px;" : "") + small)),
      '</div></body></html>',
    ].join(""),
    tags: [{ name: "kind", value: "founding_confirm" }],
  };
}

// true when Resend accepted it. Logs a fixed message and a status word only.
async function sendFoundingConfirmEmail(to, url, idempotencyKey) {
  const key = (process.env.RESEND_API_KEY || "").trim();
  const payload = foundingConfirmEmailPayload(to, url);
  if (!key || !payload) return false;
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), RESEND_TIMEOUT_MS);
  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!res.ok) { console.error("[founding-confirm] email failed", res.status); return false; }
    return true;
  } catch (err) {
    const aborted = !!err && (err.name === "AbortError" || err.name === "TimeoutError");
    console.error("[founding-confirm] email failed", aborted ? "timeout" : "no_status");
    return false;
  } finally {
    clearTimeout(deadline);
  }
}

module.exports = {
  CONFIRM_BASE, CONFIRM_TTL_SEC, SEND_LIMIT, SEND_WINDOW_MS, EMAIL_SUBJECT, CONTACT_BLOCK,
  confirmSecret, emailKey, confirmToken, confirmUrl, checkConfirm, checkSendLimit,
  confirmEmailParagraphs, foundingConfirmEmailPayload, sendFoundingConfirmEmail,
};
