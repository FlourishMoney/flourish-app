// netlify/functions/_lib/policyNotice.js
// -----------------------------------------------------------------------------
// THE PRIVACY POLICY NOTICE: the email and its send (section 9 of the policy, words approved by ChatGPT and Grok 2026-11-05, used
// exactly). [launch date] becomes the date in the newsletter_launch row.
//
// A service notice about an account, sent once, to accounts rather than to a mailing list: nothing here reads the waitlist or the
// newsletter list. Replies come to hello@flourishmoney.app (From and Reply-To both), and whoever asks to stop is added by hand to
// policy_notice_opt_outs (migration 0040), which the send respects.
// -----------------------------------------------------------------------------
"use strict";
const crypto = require("crypto");
const { emailHtml } = require("./emailLayout");

const NOTICE_ID = "privacy-newsletter-launch";
const FROM = "flourish <hello@flourishmoney.app>";
const REPLY_TO = "hello@flourishmoney.app";
const SUBJECT = "We've updated the flourish privacy policy";
const RESEND_ENDPOINT = "https://api.resend.com/emails";
const NO_DATE = "[launch date]";

const FOOTER = "GrowSmart Inc. (flourish), PO Box 29, Foxboro ON K0K 2B0";
const BODY = (date) => [
  "Hi,",
  `We've updated the flourish privacy policy. The new version is dated ${date} and you can read it at flourishmoney.app/privacy.`,
  "What changed:",
  "• We added Canadian money dates this week, an optional weekly email for people aged 18 and over. You only get it if you sign up and confirm from the email we send you. Having a flourish account doesn't sign you up, and the waitlist wasn't added to it.",
  "• Our own links can carry a short code naming the post they came from. On our web pages we count visits and taps through to the App Store or Google Play with that code, and we store no IP address, cookie or other identifier with those counts.",
  // Microsoft Clarity on the website's public pages, approved 2026-11-06 (claude/CLARITY-WORDS-APPROVED-2026-11-06.md), word for word.
  "• On our public website pages we now use Microsoft Clarity heatmaps and session recordings to understand taps, scrolling and other page interactions. Page content is masked, Clarity cookies are off, and Clarity doesn't load for visitors in Quebec, the European Economic Area, the United Kingdom or Switzerland. It isn't used in the flourish app, on sign-in or sign-up pages, at checkout, or on any signed-in page.",
  "• If you install the Android app from one of our links, Google Play can pass that code to the app the first time you open it. We keep it with your account and delete it when your account is deleted.",
  "• We now also use your IP address briefly to limit repeated newsletter sign-ups, as we already do for account sign-ups and coach requests. We don't store it with your newsletter sign-up.",
  "• If you enter a tester code when you sign up, we store the code and the date. Answers you give to the tester questions in the app are saved to your account.",
  "• We added our mailing address to the policy.",
  "Nothing about your bank connections or your financial information changed.",
  "Questions? Email privacy@flourishmoney.app.",
  "Reply to this email to stop getting privacy-policy notices by email.",
];

// "2026-11-12" to "November 12, 2026", or null. The same reading as the policy's own date (src/lib/privacyLaunchWords.js).
function dateLabel(iso) {
  if (typeof iso !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return null;
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  if (!Number.isFinite(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }).format(d);
}

function noticeText(date) { return [...BODY(date), FOOTER].join("\n\n"); }

function noticePayload(to, date) {
  return {
    from: FROM,
    reply_to: REPLY_TO,
    to: [to],
    subject: SUBJECT,
    text: noticeText(date),
    html: emailHtml({ title: SUBJECT, paragraphs: BODY(date), footer: [FOOTER] }),
  };
}

// Accounts that are not a person's inbox: the screenshot account, and the App Review account by the SHA-256 of its address only.
// The same two as netlify/functions/activation.js.
const SCREENSHOT_EMAIL = "snap@flourish.app";
const REVIEW_ACCOUNT_SHA256 = "af552e5b3f4529120915257ae8073ff990043c65e6163630d694fe2b6516dc7b";
function isSampleAccount(email) {
  const e = String(email || "").trim().toLowerCase();
  if (!e) return false;
  return e === SCREENSHOT_EMAIL || crypto.createHash("sha256").update(e).digest("hex") === REVIEW_ACCOUNT_SHA256;
}

/** True only when Resend took it. Never throws. Idempotency-Key: one more guard against a repeat. */
async function sendNotice(payload, userId, fetchImpl = fetch) {
  const key = (process.env.RESEND_API_KEY || "").trim();
  if (!key) return false;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 5000);
  try {
    const res = await fetchImpl(RESEND_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "Idempotency-Key": `${NOTICE_ID}/${userId}` },
      body: JSON.stringify(payload),
      signal: ctl.signal,
    });
    if (!res.ok) console.error("[policy-notice] email failed", res.status);
    return res.ok;
  } catch {
    console.error("[policy-notice] email failed", "no_status");
    return false;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { NOTICE_ID, FROM, SUBJECT, NO_DATE, dateLabel, noticeText, noticePayload, isSampleAccount, sendNotice };
