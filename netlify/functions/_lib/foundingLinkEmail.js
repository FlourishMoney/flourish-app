// netlify/functions/_lib/foundingLinkEmail.js
// -----------------------------------------------------------------------------
// THE FOUNDING LINK EMAIL (payments open 2026-10-26).
//
// The welcome email has told every founding household, since PR #53: "You're founding household #N of 50.
// We'll email your link to the founding price when payments open on October 26." This is that email. It
// is sent by netlify/functions/founding-link-sweep.js, once per waitlist row, and only while both
// BILLING_ENABLED and FOUNDING_LINK_EMAIL are exactly "true".
//
// THE LINK carries nothing about the household: https://flourishmoney.app/?checkout=founding. No address,
// no row id, no token. It opens the checkout screen (src/lib/foundingLink.js); whether the founding price
// is offered there is the server's answer for the signed-in account's own confirmed email
// (_lib/foundingCohort.js), so a forwarded link gives nobody a price.
//
// PRICES. The only price this email states is the landing page's sentence, word for word
// (src/lib/foundingOffer.js foundingOfferCopy().price; tests/foundingLink.test.cjs holds the two together).
//
// CASL. The footer says why they got it and which consent version is on record for them, carries the
// landing page's Contact block word for word, and a signed one-click unsubscribe link; the message goes out
// with List-Unsubscribe headers. The send itself is recorded on the row (metadata.founding_link: sent_at,
// consent_version, position) by the sweep. Who may receive it is the shared rule, mayEmailWaitlistRow,
// asked for the kind "founding_link": an unsubscribed row never, and a row whose consent predates the
// consent line (pre-2026-10-01) never, because this is not the launch-day email those rows agreed to.
//
// FAILS CLOSED. No row id, no founding number from 1 to 50, a test row, no consent on record, no signed
// unsubscribe link: no email (the payload is null).
// -----------------------------------------------------------------------------
"use strict";

const { mayEmailWaitlistRow } = require("./waitlistConsent");
const { unsubscribeUrl, listUnsubscribeHeaders } = require("./waitlistUnsubscribe");
const { FOUNDING_COHORT_LIMIT, isFoundingPosition } = require("./foundingCohort");

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const RESEND_TIMEOUT_MS = 5000;
const FOUNDING_LINK_KIND = "founding_link";
const FOUNDING_LINK_URL = "https://flourishmoney.app/?checkout=founding";
const FROM = "Flourish <hello@flourishmoney.app>";
const REPLY_TO = "hello@flourishmoney.app";
const SUBJECT = "Your founding price is ready";

// The landing page's founding price sentence, word for word. The one price in this email.
const LANDING_PRICE_SENTENCE = "$79.99 a year plus tax, for as long as you stay subscribed. Paid and used on flourishmoney.app. Not yet available in the iPhone and Android apps.";
// The landing page's Contact block (src/App.jsx, id="contact"), word for word, one line per paragraph.
const CONTACT_BLOCK = Object.freeze(["flourish is operated by GrowSmart Inc., PO Box 29, Foxboro ON K0K 2B0.", "hello@flourishmoney.app"]);
const WHY_LINE = "You're receiving this because you joined the waitlist at flourishmoney.app.";

function foundingLinkParagraphs(position) {
  return [
    "Payments for flourish are open.",
    `You're founding household #${position} of ${FOUNDING_COHORT_LIMIT}, and your founding price is ready:`,
    LANDING_PRICE_SENTENCE,
    `Your link: ${FOUNDING_LINK_URL}`,
    "Sign in or create your account with the email address this message was sent to, then choose Founding Annual. Your founding price is matched to this address.",
    "Questions? Just reply to this email.",
    "Amanda, founder of Flourish",
  ];
}

const consentLine = (version) => `Consent on record: version ${version}.`;
const footerLines = (url, version) => [WHY_LINE, consentLine(version), ...CONTACT_BLOCK, `Unsubscribe with one click: ${url}`];

const _esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const _para = (html, extra) => `<p style="margin:0 0 16px;${extra || ""}">${html}</p>`;
const _small = "font-size:13px;color:rgba(26,32,53,0.66);";
function foundingLinkHtml(position, url, version) {
  const body = foundingLinkParagraphs(position).map(t => t.startsWith("Your link: ")
    ? _para(`<a href="${FOUNDING_LINK_URL}" style="color:#1A2035;font-weight:700;">Open your founding price link</a>`)
    : _para(_esc(t)));
  return [
    '<!doctype html>',
    `<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${SUBJECT}</title></head>`,
    '<body style="margin:0;padding:0;background-color:#F4F1EB;">',
    '<div style="max-width:560px;margin:0 auto;padding:32px 24px;background-color:#F4F1EB;color:#1A2035;',
    'font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Helvetica,Arial,sans-serif;font-size:16px;line-height:1.6;">',
    body.join(""),
    _para(_esc(WHY_LINE), "margin-top:24px;" + _small),
    _para(_esc(consentLine(version)), _small),
    ...CONTACT_BLOCK.map(l => _para(_esc(l), _small)),
    _para(`<a href="${url}" style="color:#1A2035;">Unsubscribe with one click</a>`, _small),
    '</div></body></html>',
  ].join("");
}

// The whole message for one waitlist row, or null. row: { id, founding_position, is_test, unsubscribed_at,
// consent_version } exactly as the database returned them.
function foundingLinkEmailPayload(to, row) {
  if (typeof to !== "string" || !to.trim()) return null;
  if (!row || row.id == null || String(row.id) === "") return null;
  if (row.is_test === true) return null;
  if (!isFoundingPosition(row.founding_position)) return null;
  if (!mayEmailWaitlistRow(row, FOUNDING_LINK_KIND)) return null;
  const url = unsubscribeUrl(row.id);
  const headers = listUnsubscribeHeaders(row.id);
  if (!url || !headers) return null;
  const version = row.consent_version;
  return {
    from: FROM,
    reply_to: REPLY_TO,
    to: [to],
    subject: SUBJECT,
    text: [...foundingLinkParagraphs(row.founding_position), ...footerLines(url, version)].join("\n\n"),
    html: foundingLinkHtml(row.founding_position, url, version),
    headers,
    // Resend keeps these with the message: which email this was, and the consent it was sent under.
    tags: [{ name: "kind", value: FOUNDING_LINK_KIND }, { name: "consent_version", value: version }],
  };
}

// { sent: true } when Resend accepted it, else { sent: false, reason }. Logs a fixed message and a status
// word only: never the address, the key, the row id, the payload or the response body.
async function sendFoundingLinkEmail(to, row) {
  const key = (process.env.RESEND_API_KEY || "").trim();
  if (!key) return { sent: false, reason: "no_api_key" };
  const payload = foundingLinkEmailPayload(to, row);
  if (!payload) return { sent: false, reason: "not_eligible" };
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), RESEND_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      // Keyed on the row id alone: a retry within Resend's window cannot send a second copy.
      headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json", "Idempotency-Key": `founding-link/${row.id}` },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (err) {
    const aborted = !!err && (err.name === "AbortError" || err.name === "TimeoutError");
    console.error("[founding-link] email failed", aborted ? "timeout" : "no_status");
    return { sent: false, reason: aborted ? "timeout" : "no_status" };
  } finally {
    clearTimeout(deadline);
  }
  if (!res.ok) {
    console.error("[founding-link] email failed", res.status);
    return { sent: false, reason: `status_${res.status}` };
  }
  return { sent: true };
}

module.exports = {
  FOUNDING_LINK_KIND, FOUNDING_LINK_URL, SUBJECT, LANDING_PRICE_SENTENCE, CONTACT_BLOCK, WHY_LINE,
  consentLine, foundingLinkParagraphs, foundingLinkEmailPayload, sendFoundingLinkEmail, RESEND_TIMEOUT_MS,
};
