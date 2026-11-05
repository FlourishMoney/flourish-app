// netlify/functions/_lib/newsletter.js
// -----------------------------------------------------------------------------
// "CANADIAN MONEY DATES THIS WEEK" (CASL, 2026-11-04, migration 0037): the words, the signed links, the email frame.
//
// CONSENT. A stored version always resolves to the exact wording that person saw, so changing a word means a NEW
// version here, never an edit. The forms ask the server for the wording, so there is no second copy to drift.
// EVERY EMAIL goes through newsletterEmail(): it refuses to build a message without a working unsubscribe, and always adds
// the sender's identity and the one-click headers. A one-click unsubscribe takes effect at once.
// LINKS carry the row id, never the address. Each is an HMAC under the same secret as the waitlist's links, with its own label.
// -----------------------------------------------------------------------------
"use strict";
const crypto = require("crypto");
const { unsubscribeSecret, ROW_ID_RX } = require("./waitlistUnsubscribe");
const { emailHtml } = require("./emailLayout");

const NEWSLETTER_NAME = "Canadian money dates this week";
const SENDER_LINE = "Sent by GrowSmart Inc. (flourish), PO Box 29, Foxboro ON K0K 2B0, hello@flourishmoney.app.";
const CONSENT_VERSION = "2026-11-05";
const CONSENT_VERSIONS = Object.freeze({
  "2026-11-05": `Yes, send me ${NEWSLETTER_NAME}, a weekly email from flourish. I can unsubscribe at any time. ${SENDER_LINE}`,
});
const SOURCES = Object.freeze(["site_newsletter", "app_settings_ios", "app_settings_android", "app_settings_web"]);
const BASE = "https://flourishmoney.app/api/newsletter";
const CONFIRM_DAYS = 7;
const RESEND_AGAIN_MS = 10 * 60 * 1000;

const FROM = "flourish <hello@flourishmoney.app>";
const REPLY_TO = "hello@flourishmoney.app";
const RESEND_ENDPOINT = "https://api.resend.com/emails";

function sign(purpose, id, secret) {
  return crypto.createHmac("sha256", secret).update(`newsletter/${purpose}/v1/${id}`).digest("base64url");
}
function same(a, b) {
  const x = Buffer.from(String(a || "")), y = Buffer.from(String(b || ""));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function unsubscribeLink(id, secret = unsubscribeSecret()) {
  if (!secret || !ROW_ID_RX.test(String(id))) return null;
  return `${BASE}?do=unsubscribe&id=${encodeURIComponent(id)}&t=${sign("unsubscribe", id, secret)}`;
}
function checkUnsubscribe(id, token, secret = unsubscribeSecret()) {
  return !!secret && ROW_ID_RX.test(String(id)) && same(sign("unsubscribe", id, secret), token);
}
function confirmLink(id, now = new Date(), secret = unsubscribeSecret()) {
  if (!secret || !ROW_ID_RX.test(String(id))) return null;
  const x = Math.floor(now.getTime() / 1000) + CONFIRM_DAYS * 86400;
  return `${BASE}?do=confirm&id=${encodeURIComponent(id)}&x=${x}&t=${sign(`confirm/${x}`, id, secret)}`;
}
// "ok", "expired" or "invalid".
function checkConfirm(id, x, token, now = new Date(), secret = unsubscribeSecret()) {
  if (!secret || !ROW_ID_RX.test(String(id)) || !/^\d{1,12}$/.test(String(x))) return "invalid";
  if (!same(sign(`confirm/${x}`, id, secret), token)) return "invalid";
  return Number(x) * 1000 < now.getTime() ? "expired" : "ok";
}

// The address as a keyed hash, which is all that stays on a record after an unsubscribe. Null with no secret.
function emailKeyOf(email, secret = unsubscribeSecret()) {
  return secret ? crypto.createHmac("sha256", secret).update(`newsletter/email/v1/${String(email).trim().toLowerCase()}`).digest("hex") : null;
}

// The browser family only. The user agent itself is read here and never kept.
function uaFamily(userAgent, native = false) {
  if (native) return "flourish_app";
  const ua = String(userAgent || "");
  if (/SamsungBrowser/.test(ua)) return "samsung";
  if (/Edg(e|A|iOS)?\//.test(ua)) return "edge";
  if (/Firefox|FxiOS/.test(ua)) return "firefox";
  if (/Chrome|CriOS/.test(ua)) return "chrome";
  if (/Safari/.test(ua)) return "safari";
  return "other";
}

// Every email to this list. null when no unsubscribe link can be made: such a message is never sent.
function newsletterEmail({ to, rowId, subject, paragraphs, link = null }) {
  const unsub = unsubscribeLink(rowId);
  if (!unsub) return null;
  const footer = [SENDER_LINE, `Unsubscribe in one click: ${unsub}`];
  return {
    from: FROM,
    reply_to: REPLY_TO,
    to: [to],
    subject,
    text: [...paragraphs, ...footer].join("\n\n"),
    html: emailHtml({ title: subject, paragraphs, link, footer, unsubscribeUrl: unsub }),
    headers: { "List-Unsubscribe": `<${unsub}>, <mailto:hello@flourishmoney.app?subject=unsubscribe>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
  };
}

function confirmationEmail({ to, rowId, now = new Date() }) {
  const url = confirmLink(rowId, now);
  if (!url) return null;
  const line = `Confirm your sign-up: ${url}`;
  return newsletterEmail({
    to, rowId,
    subject: `Confirm your sign-up for ${NEWSLETTER_NAME}`,
    paragraphs: [
      `You asked for ${NEWSLETTER_NAME} from flourish. You won't receive the weekly email until you confirm.`,
      line,
      "If this wasn't you, ignore this email and you won't hear from us again. The link works for 7 days.",
    ],
    link: { line, url, button: "Confirm my sign-up" },
  });
}

/** True only when Resend took it. With no RESEND_API_KEY (previews, local) nothing is sent. */
async function sendEmail(payload, idempotencyKey, fetchImpl = fetch) {
  const key = (process.env.RESEND_API_KEY || "").trim();
  if (!key || !payload) return false;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 5000);
  try {
    const res = await fetchImpl(RESEND_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
      body: JSON.stringify(payload),
      signal: ctl.signal,
    });
    if (!res.ok) console.error("[newsletter] email failed", res.status);
    return res.ok;
  } catch {
    console.error("[newsletter] email failed", "no_status");
    return false;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { emailKeyOf, NEWSLETTER_NAME, SENDER_LINE, CONSENT_VERSION, CONSENT_VERSIONS, SOURCES, CONFIRM_DAYS, RESEND_AGAIN_MS, unsubscribeLink, checkUnsubscribe, confirmLink, checkConfirm, uaFamily, newsletterEmail, confirmationEmail, sendEmail };
