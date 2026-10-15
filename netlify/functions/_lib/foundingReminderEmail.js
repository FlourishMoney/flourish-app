// netlify/functions/_lib/foundingReminderEmail.js
// -----------------------------------------------------------------------------
// THE FOUNDING REMINDERS (billing day, round 5; the approved 30-day plan): a reminder on October 29 and a
// last call on November 2, to founding households that got the founding link email and have not paid.
// Sent by netlify/functions/founding-reminder-sweep.js, behind FOUNDING_REMINDERS (default off).
//
// THE WORDS ARE A DRAFT for ChatGPT and Grok review (PR #73). Do not turn FOUNDING_REMINDERS on until they
// are approved. Rules they keep: no "regular price", no saving, no struck-through price; the one price is the
// landing page's founding card, word for word ("$79.99 a year" and "Plus tax, for as long as you stay
// subscribed. Paid and used on flourishmoney.app. Not yet in the iPhone and Android apps."); the same
// founding link and the same CASL footer as the founding link email; signed "Amanda, founder of flourish".
//
// WHO: worded consent only (2026-10-01, 2026-10-05, 2026-10-06), through the shared rule
// (mayEmailWaitlistRow): never a pre-2026-10-01 row, never an unsubscribed one. One email per row per
// reminder. Fails closed: anything not eligible gets a null payload.
// -----------------------------------------------------------------------------
"use strict";

const { mayEmailWaitlistRow, FOUNDING_LINK_CONSENT_VERSIONS } = require("./waitlistConsent");
const { unsubscribeUrl, listUnsubscribeHeaders } = require("./waitlistUnsubscribe");
const { FOUNDING_COHORT_LIMIT, isFoundingPosition } = require("./foundingCohort");
const { FOUNDING_LINK_URL, CONTACT_BLOCK, WHY_LINE, consentLine } = require("./foundingLinkEmail");

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const RESEND_TIMEOUT_MS = 5000;
const REMINDER_KINDS = Object.freeze(["founding_reminder", "founding_last_call"]);

// THE SCHEDULE (Toronto time). Each reminder sends from its start until the next one's start; the last call
// sends for one week. Daylight time ends on November 1, 2026, hence the offsets.
const SCHEDULE = Object.freeze({
  founding_reminder:  { from: Date.parse("2026-10-29T10:00:00-04:00"), until: Date.parse("2026-11-02T10:00:00-05:00") },
  founding_last_call: { from: Date.parse("2026-11-02T10:00:00-05:00"), until: Date.parse("2026-11-09T10:00:00-05:00") },
});
// The founding link email must be this old before a reminder (and the reminder this old before the last
// call), so nobody gets two emails about the same thing within two days.
const MIN_GAP_MS = 48 * 3600 * 1000;

// The reminder due now, or null.
function dueKind(nowMs = Date.now()) {
  for (const k of REMINDER_KINDS) {
    const w = SCHEDULE[k];
    if (nowMs >= w.from && nowMs < w.until) return k;
  }
  return null;
}

// The landing page's founding card, word for word (src/lib/foundingOffer.js foundingCardParts()).
const CARD_PRICE = "$79.99 a year";
const CARD_SMALL = "Plus tax, for as long as you stay subscribed. Paid and used on flourishmoney.app. Not yet in the iPhone and Android apps.";

const SUBJECTS = Object.freeze({
  founding_reminder: "Your founding price is still waiting",
  founding_last_call: "A last note about your founding price",
});

// The words (DRAFT, for review).
function reminderParagraphs(kind, position) {
  const opening = kind === "founding_last_call"
    ? "This is our last note about your founding price. After this, we won't send you more reminders about it."
    : "A few days ago we sent you your link to the founding price. It's still there for you.";
  const closing = kind === "founding_last_call"
    ? []
    : ["We'll send one last note on November 2, and then no more about this."];
  return [
    opening,
    `You're founding household #${position} of ${FOUNDING_COHORT_LIMIT}.`,
    CARD_PRICE,
    CARD_SMALL,
    `Your link: ${FOUNDING_LINK_URL}`,
    "Sign in or create your account with the email address this message was sent to, then choose Founding Annual.",
    ...closing,
    "Questions? Just reply to this email.",
    "Amanda, founder of flourish",
  ];
}

const _esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function reminderHtml(kind, position, url, version) {
  const p = (h, extra) => `<p style="margin:0 0 16px;${extra || ""}">${h}</p>`;
  const small = "font-size:13px;color:rgba(26,32,53,0.66);";
  return [
    '<!doctype html>',
    `<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${SUBJECTS[kind]}</title></head>`,
    '<body style="margin:0;padding:0;background-color:#F4F1EB;">',
    '<div style="max-width:560px;margin:0 auto;padding:32px 24px;background-color:#F4F1EB;color:#1A2035;',
    'font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Helvetica,Arial,sans-serif;font-size:16px;line-height:1.6;">',
    reminderParagraphs(kind, position).map(x => x.startsWith("Your link: ")
      ? p(`<a href="${FOUNDING_LINK_URL}" style="color:#1A2035;font-weight:700;">Open your founding price link</a>`)
      : p(_esc(x))).join(""),
    p(_esc(WHY_LINE), "margin-top:24px;" + small),
    p(_esc(consentLine(version)), small),
    ...CONTACT_BLOCK.map(l => p(_esc(l), small)),
    p(`<a href="${url}" style="color:#1A2035;">Unsubscribe with one click</a>`, small),
    '</div></body></html>',
  ].join("");
}

// The whole message, or null. Worded consent only, a founding number 1 to 50, not a test row.
function foundingReminderPayload(to, row, kind) {
  if (!REMINDER_KINDS.includes(kind)) return null;
  if (typeof to !== "string" || !to.trim()) return null;
  if (!row || row.id == null || String(row.id) === "" || row.is_test === true) return null;
  if (!isFoundingPosition(row.founding_position)) return null;
  if (!FOUNDING_LINK_CONSENT_VERSIONS.includes(row.consent_version) || !mayEmailWaitlistRow(row, kind)) return null;
  const url = unsubscribeUrl(row.id);
  const headers = listUnsubscribeHeaders(row.id);
  if (!url || !headers) return null;
  const version = row.consent_version;
  return {
    from: "Flourish <hello@flourishmoney.app>",
    reply_to: "hello@flourishmoney.app",
    to: [to],
    subject: SUBJECTS[kind],
    text: [...reminderParagraphs(kind, row.founding_position), WHY_LINE, consentLine(version), ...CONTACT_BLOCK, `Unsubscribe with one click: ${url}`].join("\n\n"),
    html: reminderHtml(kind, row.founding_position, url, version),
    headers,
    tags: [{ name: "kind", value: kind }, { name: "consent_version", value: version }],
  };
}

// { sent } as the founding link email does. Logs a fixed message and a status word only.
async function sendFoundingReminder(to, row, kind) {
  const key = (process.env.RESEND_API_KEY || "").trim();
  if (!key) return { sent: false, reason: "no_api_key" };
  const payload = foundingReminderPayload(to, row, kind);
  if (!payload) return { sent: false, reason: "not_eligible" };
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), RESEND_TIMEOUT_MS);
  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json", "Idempotency-Key": `founding-reminder/${kind}/${row.id}` },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!res.ok) { console.error("[founding-reminder] email failed", res.status); return { sent: false, reason: `status_${res.status}` }; }
    return { sent: true };
  } catch (err) {
    const aborted = !!err && (err.name === "AbortError" || err.name === "TimeoutError");
    console.error("[founding-reminder] email failed", aborted ? "timeout" : "no_status");
    return { sent: false, reason: aborted ? "timeout" : "no_status" };
  } finally {
    clearTimeout(deadline);
  }
}

module.exports = { REMINDER_KINDS, SCHEDULE, MIN_GAP_MS, SUBJECTS, CARD_PRICE, CARD_SMALL, dueKind, reminderParagraphs, foundingReminderPayload, sendFoundingReminder };
