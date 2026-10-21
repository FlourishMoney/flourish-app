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
// consent_version, position, kind) by the sweep. Who may receive it: mayEmailFoundingLink
// (_lib/waitlistConsent.js), every consent version whose words asked for updates (2026-10-01, 2026-10-05,
// 2026-10-06). Never an unsubscribed row, and never a pre-2026-10-01 row.
//
// THE CANADA LAUNCH EMAIL (kind "canada_launch", round 5). The pre-2026-10-01 rows asked only for launch
// news. Amanda decided (2026-10-14) that October 26, with signup open, is that launch. Their consent was launch
// news only (CASL), so this email is launch news only: no price, no founding number, no checkout link. The
// words were approved by ChatGPT and Grok. Same CASL footer. It is the one email those rows ever get
// (mayEmailWaitlistRow), and the sweep passes `launched` only while OPEN_SIGNUP is on.
//
// FAILS CLOSED. No row id, no founding number (a whole number from 1 up, migration 0025), a test row, no consent that covers the kind, no
// signed unsubscribe link: no email (the payload is null).
// -----------------------------------------------------------------------------
"use strict";

const { mayEmailWaitlistRow, foundingEmailKindFor } = require("./waitlistConsent");
const { unsubscribeUrl, listUnsubscribeHeaders } = require("./waitlistUnsubscribe");
const { FOUNDING_COHORT_LIMIT, isFoundingPosition } = require("./foundingCohort");

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const RESEND_TIMEOUT_MS = 5000;
const FOUNDING_LINK_KIND = "founding_link";
const LAUNCH_KIND = "canada_launch";
const FOUNDING_LINK_URL = "https://flourishmoney.app/?checkout=founding";
const FROM = "Flourish <hello@flourishmoney.app>";
const REPLY_TO = "hello@flourishmoney.app";
const SUBJECT = "Your founding price is ready";
const LAUNCH_SUBJECT = "flourish has launched in Canada";

// The landing page's founding price sentence, word for word. The one price in this email.
const LANDING_PRICE_SENTENCE = "$79.99 a year plus tax, for as long as you stay subscribed. Paid on flourishmoney.app, and it works in the iPhone and Android apps too.";
// The landing page's Contact block (src/App.jsx, id="contact"), word for word, one line per paragraph.
const CONTACT_BLOCK = Object.freeze(["flourish is operated by GrowSmart Inc., PO Box 29, Foxboro ON K0K 2B0.", "hello@flourishmoney.app"]);
const WHY_LINE = "You're receiving this because you joined the waitlist at flourishmoney.app.";

function foundingLinkParagraphs(position) {
  return [
    "Payments for flourish are open.",
    // Never a number above 50 (Amanda, 2026-10-14, the welcome email's rule): a number past 50 was issued
    // after test numbers were voided (migration 0025) and is still one of the first 50 real households.
    position <= FOUNDING_COHORT_LIMIT
      ? `You're founding household #${position} of ${FOUNDING_COHORT_LIMIT}, and your founding price is ready:`
      : `You're one of the first ${FOUNDING_COHORT_LIMIT} founding households, and your founding price is ready:`,
    LANDING_PRICE_SENTENCE,
    `Your link: ${FOUNDING_LINK_URL}`,
    "Sign in or create your account with the email address this message was sent to, then choose Founding Annual. Your founding price is matched to this address.",
    "Questions? Just reply to this email.",
    "Amanda, founder of flourish",
  ];
}

// The Canada launch email's words, for the pre-2026-10-01 rows, exactly as approved (round 5). Launch news
// only: no price, no founding number, no checkout link.
function launchParagraphs() {
  return [
    "flourish has launched in Canada. When you joined the waitlist, you asked us to email you when it did, so here it is.",
    "flourish is now available in Canada at flourishmoney.app, on the App Store and on Google Play.",
    "This is the one email you asked for when you joined, so we won't send you anything else from the waitlist.",
    "Questions? Just reply to this email.",
    "Amanda, founder of flourish",
  ];
}
const paragraphsFor = (kind, position) => (kind === LAUNCH_KIND ? launchParagraphs() : foundingLinkParagraphs(position));
const subjectFor = (kind) => (kind === LAUNCH_KIND ? LAUNCH_SUBJECT : SUBJECT);

const consentLine = (version) => `Consent on record: version ${version}.`;
const footerLines = (url, version) => [WHY_LINE, consentLine(version), ...CONTACT_BLOCK, `Unsubscribe with one click: ${url}`];

const _esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const _para = (html, extra) => `<p style="margin:0 0 16px;${extra || ""}">${html}</p>`;
const _small = "font-size:13px;color:rgba(26,32,53,0.66);";
function foundingLinkHtml(position, url, version, kind = FOUNDING_LINK_KIND) {
  const body = paragraphsFor(kind, position).map(t => t.startsWith("Your link: ")
    ? _para(`<a href="${FOUNDING_LINK_URL}" style="color:#1A2035;font-weight:700;">Open your founding price link</a>`)
    : _para(_esc(t)));
  return [
    '<!doctype html>',
    `<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${subjectFor(kind)}</title></head>`,
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
// consent_version, metadata } exactly as the database returned them. opts.launched: signup is open (billing
// day), which is what lets a pre-2026-10-01 row have its Canada launch email; without it that row gets nothing.
// The founding link email needs a founding number (from 1 up; 0025 can issue numbers past 50 to real
// households); the launch email needs none (it names none).
function foundingLinkEmailPayload(to, row, opts = {}) {
  if (typeof to !== "string" || !to.trim()) return null;
  if (!row || row.id == null || String(row.id) === "") return null;
  if (row.is_test === true) return null;
  const kind = foundingEmailKindFor(row, { launched: opts.launched === true });
  if (!kind || !mayEmailWaitlistRow(row, kind)) return null;
  if (kind === FOUNDING_LINK_KIND && !isFoundingPosition(row.founding_position)) return null;
  const url = unsubscribeUrl(row.id);
  const headers = listUnsubscribeHeaders(row.id);
  if (!url || !headers) return null;
  const version = row.consent_version;
  return {
    from: FROM,
    reply_to: REPLY_TO,
    to: [to],
    subject: subjectFor(kind),
    text: [...paragraphsFor(kind, row.founding_position), ...footerLines(url, version)].join("\n\n"),
    html: foundingLinkHtml(row.founding_position, url, version, kind),
    headers,
    // Resend keeps these with the message: which email this was, and the consent it was sent under.
    tags: [{ name: "kind", value: kind }, { name: "consent_version", value: version }],
  };
}

// { sent: true } when Resend accepted it, else { sent: false, reason }. Logs a fixed message and a status
// word only: never the address, the key, the row id, the payload or the response body.
async function sendFoundingLinkEmail(to, row, opts = {}) {
  const key = (process.env.RESEND_API_KEY || "").trim();
  if (!key) return { sent: false, reason: "no_api_key" };
  const payload = foundingLinkEmailPayload(to, row, opts);
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
  FOUNDING_LINK_KIND, LAUNCH_KIND, FOUNDING_LINK_URL, SUBJECT, LAUNCH_SUBJECT, LANDING_PRICE_SENTENCE, CONTACT_BLOCK, WHY_LINE,
  consentLine, foundingLinkParagraphs, launchParagraphs, foundingLinkEmailPayload, sendFoundingLinkEmail, RESEND_TIMEOUT_MS,
};
