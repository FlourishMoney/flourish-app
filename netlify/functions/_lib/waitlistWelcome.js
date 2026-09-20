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

// The approved copy, exactly as written. Do not add claims, launch dates or links.
// It is deliberately transactional: it confirms the person's own request and nothing else. The product
// description was removed on the owner's CASL decision (2026-09-19) so this is not a commercial
// electronic message. Promotional copy and the full CASL footer belong to the later launch email.
const WELCOME_PARAGRAPHS = [
  "Thanks for joining the Flourish waitlist.",
  "We'll email you when it's ready for you. No launch date yet, and we won't send anything else in the meantime.",
  "Questions or ideas? Just reply to this email.",
  "Amanda, founder of Flourish",
  "flourishmoney.app",
  "You're receiving this because you joined the waitlist at flourishmoney.app. If this wasn't you, reply and we'll remove you.",
];

// Both versions are built from the SAME array, so the plain-text and HTML copy can never drift apart.
const WELCOME_TEXT = WELCOME_PARAGRAPHS.join("\n\n");

// Cream background (#F4F1EB) and ink (#1A2035) are the app's own light-theme values. No images.
const _para = (text, extra) => `<p style="margin:0 0 16px;${extra || ""}">${text}</p>`;
const WELCOME_HTML = [
  '<!doctype html>',
  '<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>' + WELCOME_SUBJECT + '</title></head>',
  '<body style="margin:0;padding:0;background-color:#F4F1EB;">',
  '<div style="max-width:560px;margin:0 auto;padding:32px 24px;background-color:#F4F1EB;color:#1A2035;',
  'font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Helvetica,Arial,sans-serif;font-size:16px;line-height:1.6;">',
  WELCOME_PARAGRAPHS.slice(0, -1).map(t => _para(t)).join(""),
  _para(WELCOME_PARAGRAPHS[WELCOME_PARAGRAPHS.length - 1], "margin-top:24px;font-size:13px;color:rgba(26,32,53,0.66);"),
  '</div></body></html>',
].join("");

function welcomeEmailPayload(to) {
  return {
    from:     WELCOME_FROM,
    reply_to: WELCOME_REPLY_TO,
    to:       [to],
    subject:  WELCOME_SUBJECT,
    text:     WELCOME_TEXT,
    html:     WELCOME_HTML,
  };
}

// True only when Resend accepted the message. On failure it logs the words "welcome email failed"
// and the HTTP status, and nothing else: never the address, the key, the payload or the response body.
async function sendWelcomeEmail(to, rowId) {
  const key = (process.env.RESEND_API_KEY || "").trim();
  if (!key) return false; // no key configured: previews and local runs send nothing, silently
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
      body: JSON.stringify(welcomeEmailPayload(to)),
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
  WELCOME_TEXT,
  WELCOME_HTML,
  welcomeEmailPayload,
  sendWelcomeEmail,
  markWelcomed,
  hasResendKey,
};
