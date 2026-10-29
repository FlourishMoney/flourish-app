// netlify/functions/_lib/foundingLinkEmail.js
// -----------------------------------------------------------------------------
// THE FOUNDING LINK EMAIL (payments open 2026-10-26).
//
// The welcome email has told every founding household, since PR #53: "You're founding household #N of 50.
// We'll email your link to the founding price when payments open on October 26." This is that email. It
// is sent by netlify/functions/founding-link-sweep.js, once per waitlist row, and only while both
// BILLING_ENABLED and FOUNDING_LINK_EMAIL are exactly "true".
//
// THE LINKS carry nothing about the household: no address, no row id, no token (2026-10-27, Amanda: "People won't
// know how to download it"). The button opens https://flourishmoney.app/get?ref=founding (public/get/), which sends
// an iPhone or iPad to the App Store and an Android phone to Google Play, and shows anything else both badges and the
// website. Under the button, the stores' own badges link straight to each store. The website's checkout,
// https://flourishmoney.app/?checkout=founding (src/lib/foundingLink.js), stays as a small line for a computer.
// Wherever the household pays, whether the founding price is offered is the server's answer for the signed-in
// account's own confirmed email (_lib/foundingCohort.js), so a forwarded link gives nobody a price.
//
// THE STORE LINES. The lines that changed for the stores were approved word for word on 2026-10-27, and are listed
// with their facts and limits in docs/product/FOUNDING-STORE-EMAIL-WORDS.md (tests/foundingStoreLink.test.cjs holds
// the two together).
//
// PRICES. The only price this email states is its price line, approved 2026-10-27: the first sentence of the landing
// page's (src/lib/foundingOffer.js foundingOfferCopy().price). Its second sentence, "Paid on flourishmoney.app…", is
// not in the email, since the email leads to the stores first.
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
const { emailHtml } = require("./emailLayout");
const { pendingWords, holdsPendingWords } = require("./pendingWords");

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const RESEND_TIMEOUT_MS = 5000;
const FOUNDING_LINK_KIND = "founding_link";
const LAUNCH_KIND = "canada_launch";
const FOUNDING_LINK_URL = "https://flourishmoney.app/?checkout=founding";
// The device link (public/get/): the App Store on an iPhone or iPad, Google Play on Android, both otherwise.
const FOUNDING_GET_URL = "https://flourishmoney.app/get?ref=founding";
// The stores, the same listings as the website's badges (src/lib/storeLinks.js; tests/foundingStoreLink.test.cjs).
const APP_STORE_URL = "https://apps.apple.com/ca/app/flourish-money-handled/id6792967778";
const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.flourishmoney.app";
// The stores' own badges (public/email/, made from public/store-badges/), Apple's first, one of each. The alt text is
// the badge's own words.
const STORE_BADGES = Object.freeze([
  Object.freeze({ href: APP_STORE_URL, src: "https://flourishmoney.app/email/app-store-badge.png", alt: "Download on the App Store", width: 120, height: 40 }),
  Object.freeze({ href: PLAY_STORE_URL, src: "https://flourishmoney.app/email/google-play-badge.png", alt: "Get it on Google Play", width: 135, height: 40 }),
]);
const FROM = "Flourish <hello@flourishmoney.app>";
const REPLY_TO = "hello@flourishmoney.app";
// (2026-10-29: the first 50 who subscribe; the words that assumed a waitlist number are to come, _lib/pendingWords.js) The sweep is off.
const SUBJECT = pendingWords("founding-email-subject");
const LAUNCH_SUBJECT = "flourish has launched in Canada";

// The landing page's founding price sentence, word for word. The one price in this email.
const LANDING_PRICE_SENTENCE = "$79.99 a year plus tax, for as long as you stay subscribed. Paid on flourishmoney.app, and it works in the iPhone and Android apps too.";
// The landing page's Contact block (src/App.jsx, id="contact"), word for word, one line per paragraph.
const CONTACT_BLOCK = Object.freeze(["flourish is operated by GrowSmart Inc., PO Box 29, Foxboro ON K0K 2B0.", "hello@flourishmoney.app"]);
const WHY_LINE = "You're receiving this because you joined the waitlist at flourishmoney.app.";

// THE STORE LINES, approved word for word 2026-10-27 (ChatGPT and Grok agreed): docs/product/FOUNDING-STORE-EMAIL-WORDS.md.
const FOUNDING_EMAIL_PRICE_LINE = "$79.99 a year plus tax, for as long as you stay subscribed.";
const FOUNDING_BUTTON_LABEL = "Get the app";
const FOUNDING_STORE_STEPS_LINE = pendingWords("founding-email-store-steps");
const FOUNDING_COMPUTER_LINE = pendingWords("founding-email-computer");

function foundingLinkParagraphs(position) {
  return [
    "Payments for flourish are open.",
    // The household's founding number is no longer named (2026-10-29): the words are to come.
    pendingWords("founding-email-position"),
    FOUNDING_EMAIL_PRICE_LINE,
    `Your link: ${FOUNDING_GET_URL}`,
    { badges: STORE_BADGES },
    FOUNDING_STORE_STEPS_LINE,
    { small: FOUNDING_COMPUTER_LINE, url: FOUNDING_LINK_URL },
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
// The plain-text part of the body: the badges' row has no text (the device link above it does their job), and a small
// line is its words, then its url.
const textParagraphs = (paras) => paras.flatMap((t) => (typeof t === "string" ? [t] : t && typeof t.small === "string" ? [`${t.small} ${t.url}`] : []));
const subjectFor = (kind) => (kind === LAUNCH_KIND ? LAUNCH_SUBJECT : SUBJECT);

const consentLine = (version) => `Consent on record: version ${version}.`;
// Amanda, 2026-10-26: a row sent under a recorded personal relationship (metadata.consent_basis.type, written by the
// one-time SQL of 2026-10-25) says so, in these words exactly; every other row keeps the version line.
const PERSONAL_RELATIONSHIP_CONSENT_LINE = "Consent on record: personal relationship (joined the waitlist before Oct 1, 2026).";
function consentLineFor(row) {
  const m = row && row.metadata;
  const basis = m && typeof m === "object" && !Array.isArray(m) && m.consent_basis && typeof m.consent_basis === "object" ? m.consent_basis : null;
  return basis && basis.type === "personal_relationship" ? PERSONAL_RELATIONSHIP_CONSENT_LINE : consentLine(row && row.consent_version);
}
const footerLines = (url, line) => [WHY_LINE, line, ...CONTACT_BLOCK, `Unsubscribe with one click: ${url}`];

// THE HTML PART (2026-10-26): the shared flourish layout (_lib/emailLayout.js), carrying exactly the words of the
// plain-text part, in the same order: the body paragraphs, then the footer. What it adds on the founding link email:
// the button's label, and the stores' badges under it; the "Your link: …" line follows the button as a text link, so
// the link still works with buttons or images blocked. The launch email has no link, no button and no badges.
function foundingLinkHtml(position, url, line, kind = FOUNDING_LINK_KIND) {
  return emailHtml({
    title: subjectFor(kind),
    paragraphs: paragraphsFor(kind, position),
    link: kind === LAUNCH_KIND ? null : { line: `Your link: ${FOUNDING_GET_URL}`, url: FOUNDING_GET_URL, button: FOUNDING_BUTTON_LABEL },
    footer: footerLines(url, line),
    unsubscribeUrl: url,
  });
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
    text: [...textParagraphs(paragraphsFor(kind, row.founding_position)), ...footerLines(url, consentLineFor(row))].join("\n\n"),
    html: foundingLinkHtml(row.founding_position, url, consentLineFor(row), kind),
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
  if (holdsPendingWords(payload)) { console.error("[founding-link] email not sent", "words_to_come"); return { sent: false, reason: "words_to_come" }; }
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
  FROM, REPLY_TO, FOUNDING_LINK_KIND, LAUNCH_KIND, FOUNDING_LINK_URL, SUBJECT, LAUNCH_SUBJECT, LANDING_PRICE_SENTENCE, CONTACT_BLOCK, WHY_LINE,
  FOUNDING_BUTTON_LABEL, FOUNDING_GET_URL, APP_STORE_URL, PLAY_STORE_URL, STORE_BADGES, FOUNDING_EMAIL_PRICE_LINE, FOUNDING_STORE_STEPS_LINE,
  FOUNDING_COMPUTER_LINE, textParagraphs, foundingLinkHtml, footerLines, subjectFor, paragraphsFor, consentLine, consentLineFor, PERSONAL_RELATIONSHIP_CONSENT_LINE, foundingLinkParagraphs, launchParagraphs, foundingLinkEmailPayload, sendFoundingLinkEmail, RESEND_TIMEOUT_MS,
};
