// netlify/functions/_lib/waitlistWelcome.js
// -----------------------------------------------------------------------------
// The waitlist confirmation email: ONE copy of the message, ONE send, ONE welcomed_at write.
//
// Two callers share this module, and they must send the identical message:
//   beta.js (action join_waitlist) sends it in the request, right after the row is inserted;
//   waitlist-sweep.js sends it later to any row that still has welcomed_at null.
// The template and the Idempotency-Key live here so the sweep cannot drift from the request path.
// A second copy of this copy would be a second answer to "what did we tell them".
// -----------------------------------------------------------------------------

"use strict";

// ─── Waitlist confirmation email (Resend REST API over fetch, no SDK) ────────────────────────────
// One short confirmation, sent ONLY after the waitlist row is inserted, and never on a duplicate.
// RESEND_API_KEY is read from process.env at call time. It lives only in the Netlify Production
// context: it is never bundled, never returned, and never logged. When it is missing (deploy
// previews, netlify dev, local runs) the send is skipped silently, so no preview emails a real person.
const RESEND_ENDPOINT   = "https://api.resend.com/emails";
// Netlify kills a synchronous function at 60 seconds (docs.netlify.com/build/functions/configuration,
// "Synchronous execution limit 60 seconds", not configurable). The limit is not the reason for this
// deadline: waiting is. The row is already inserted by this point, so a slow or hanging Resend call
// would leave the person watching a spinner and then seeing a failure for a signup that worked. 5s is
// far longer than a healthy send takes. A timeout is just another failed send: no welcomed_at, still
// joined:true.
const RESEND_TIMEOUT_MS = 5000;
// The welcomed_at write gets a shorter deadline than the send: it is bookkeeping against Supabase, in
// the same region, and by the time it runs the email has already gone out. Nobody should wait on it.
const PATCH_TIMEOUT_MS  = 3000;
const WELCOME_FROM     = "Flourish <hello@flourishmoney.app>";
const WELCOME_REPLY_TO = "hello@flourishmoney.app";
const WELCOME_SUBJECT  = "You're on the Flourish waitlist";

// The copy. Do not add claims, launch dates, prices, trials, plans or offers: the one promise is the
// launch-day email. THE ONE EXCEPTION is the founding line (Amanda's decision, 2026-10-06): a row the
// database gave a founding position (1 to 50, migration 0014) gets foundingWelcomeLine() as its second
// paragraph, and no other row gets any offer line. The words are in _lib/foundingWaitlist.js. The person consented (CASL, consent version in _lib/waitlistConsent.js) to that email
// "plus a few updates before then", so this message says so, carries the sender's identity and a working
// one-click unsubscribe link, and goes out with List-Unsubscribe headers. That replaces the 2026-09-19
// "transactional only, nothing else in the meantime" wording, which the new consent line contradicts.
const { IDENTITY_TEXT } = require("./waitlistConsent");
const { unsubscribeUrl, listUnsubscribeHeaders } = require("./waitlistUnsubscribe");
const { foundingWelcomeLine } = require("./foundingWaitlist");

const WELCOME_PARAGRAPHS = [
  "Thanks for joining the Flourish waitlist.",
  "We'll email you the day flourish launches in Canada. Before then you may get a few updates, and you can unsubscribe from any of them.",
  "Questions or ideas? Just reply to this email.",
  "Amanda, founder of Flourish",
];
const WHY_LINE = "You're receiving this because you joined the waitlist at flourishmoney.app.";
// The footer on every waitlist email: why they got it, who sent it (the CASL identity line, word for
// word as the form shows it), and how to stop.
const footerLines = (url) => [WHY_LINE, IDENTITY_TEXT, `Unsubscribe with one click: ${url}`];

// Cream background (#F4F1EB) and ink (#1A2035) are the app's own light-theme values. No images.
const _para = (text, extra) => `<p style="margin:0 0 16px;${extra || ""}">${text}</p>`;
const _small = "font-size:13px;color:rgba(26,32,53,0.66);";
// The paragraphs for one row: the four above, with the founding line second when the row has a position.
function welcomeParagraphs(foundingPosition) {
  const line = foundingWelcomeLine(foundingPosition);
  return line ? [WELCOME_PARAGRAPHS[0], line, ...WELCOME_PARAGRAPHS.slice(1)] : WELCOME_PARAGRAPHS.slice();
}
function welcomeHtml(url, paragraphs) {
  return [
    '<!doctype html>',
    '<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>' + WELCOME_SUBJECT + '</title></head>',
    '<body style="margin:0;padding:0;background-color:#F4F1EB;">',
    '<div style="max-width:560px;margin:0 auto;padding:32px 24px;background-color:#F4F1EB;color:#1A2035;',
    'font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Helvetica,Arial,sans-serif;font-size:16px;line-height:1.6;">',
    paragraphs.map(t => _para(t)).join(""),
    _para(WHY_LINE, "margin-top:24px;" + _small),
    _para(IDENTITY_TEXT, _small),
    _para(`<a href="${url}" style="color:#1A2035;">Unsubscribe with one click</a>`, _small),
    '</div></body></html>',
  ].join("");
}

// The whole message for one waitlist row, or null when no signed unsubscribe link can be made for it
// (no row id, or no signing secret). A waitlist email without a working unsubscribe is never sent.
// foundingPosition is the row's founding_position exactly as the database returned it; anything but a
// whole number from 1 to 50 means no offer line.
function welcomeEmailPayload(to, rowId, foundingPosition) {
  const url = unsubscribeUrl(rowId);
  const headers = listUnsubscribeHeaders(rowId);
  if (!url || !headers) return null;
  const paragraphs = welcomeParagraphs(foundingPosition);
  return {
    from:     WELCOME_FROM,
    reply_to: WELCOME_REPLY_TO,
    to:       [to],
    subject:  WELCOME_SUBJECT,
    text:     [...paragraphs, ...footerLines(url)].join("\n\n"),
    html:     welcomeHtml(url, paragraphs),
    headers,
  };
}

// True only when Resend accepted the message. On failure it logs the words "welcome email failed"
// and the HTTP status, and nothing else: never the address, the key, the payload or the response body.
async function sendWelcomeEmail(to, rowId, foundingPosition) {
  const key = (process.env.RESEND_API_KEY || "").trim();
  if (!key) return false; // no key configured: previews and local runs send nothing, silently
  // No row id or no signing secret means no unsubscribe link, and no waitlist email goes out without
  // one. welcomed_at stays null, so the sweep sends it once the row (and its id) can be read.
  const payload = welcomeEmailPayload(to, rowId, foundingPosition);
  if (!payload) {
    console.error("[waitlist] welcome email skipped", "no_unsubscribe_link");
    return false;
  }
  // Resend de-duplicates on Idempotency-Key, so a replayed request (a retried POST from the client, a
  // function retry) cannot produce a second email for the same waitlist row. Keyed on the row id and
  // nothing else: it must be stable for that row, and it must never carry the address. When the insert
  // returned no id there is nothing stable to key on, so the header is omitted rather than invented.
  const headers = { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" };
  if (rowId != null && String(rowId) !== "") headers["Idempotency-Key"] = `waitlist-welcome/${rowId}`;

  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), RESEND_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (err) {
    // "timeout" when our own deadline fired, "no_status" for any other network failure. The error
    // itself is never logged: it can carry the request URL and headers.
    const aborted = !!err && (err.name === "AbortError" || err.name === "TimeoutError");
    console.error("[waitlist] welcome email failed", aborted ? "timeout" : "no_status");
    return false;
  } finally {
    clearTimeout(deadline);
  }
  if (!res.ok) {
    console.error("[waitlist] welcome email failed", res.status);
    return false;
  }
  return true;
}

// Stamps welcomed_at on the row that was just inserted (migration 0006). Best effort: a failure here
// never changes what the signup is told. Uses the id the insert returned; falls back to the email
// filter only when the insert response carried no id.
async function markWelcomed(supabaseUrl, secretKey, row, email) {
  const filter = row && row.id != null
    ? `id=eq.${encodeURIComponent(row.id)}`
    : `email=eq.${encodeURIComponent(email)}`;
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), PATCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/waitlist?${filter}`, {
      method: "PATCH",
      headers: {
        "apikey": secretKey,
        "Authorization": `Bearer ${secretKey}`,
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
      },
      body: JSON.stringify({ welcomed_at: new Date().toISOString() }),
      signal: controller.signal,
    });
    if (!res.ok) console.error("[waitlist] welcomed_at update failed", res.status);
  } catch (err) {
    // Same rule as the send: "timeout" for our own deadline, "no_status" otherwise, and never the
    // error itself, which carries the request URL (and with it the row filter).
    const aborted = !!err && (err.name === "AbortError" || err.name === "TimeoutError");
    console.error("[waitlist] welcomed_at update failed", aborted ? "timeout" : "no_status");
  } finally {
    clearTimeout(deadline);
  }
}

// Whether a send is possible at all. Both callers check this before doing any work: no key means no
// email, silently, which is how deploy previews and local runs never touch a real person.
function hasResendKey() {
  return !!(process.env.RESEND_API_KEY || "").trim();
}

module.exports = {
  RESEND_TIMEOUT_MS,
  PATCH_TIMEOUT_MS,
  WELCOME_SUBJECT,
  WELCOME_PARAGRAPHS,
  WHY_LINE,
  welcomeParagraphs,
  welcomeEmailPayload,
  sendWelcomeEmail,
  markWelcomed,
  hasResendKey,
};
