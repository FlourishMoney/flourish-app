// netlify/functions/_lib/trialWords.js
// -----------------------------------------------------------------------------
// TRIAL_PLAN_FIRST'S EMAIL WORDS (2026-11-10): the reminder 3 days before the first charge, and the page its
// unsubscribe link opens, word for word as APPROVED 2026-11-10 (ChatGPT 100, Grok 100); docs/product/TRIAL-PLAN-FIRST-WORDS.md
// lists each id. A line changed later goes back to a placeholder until approved again: an email holding one is never
// sent (_lib/trialReminder.js), and the production build refuses to deploy while one is left. The app's: src/lib/trialWords.js.
// Facts go in as {name}; while a line is a placeholder they follow it in brackets.
// -----------------------------------------------------------------------------
"use strict";

const TRIAL_EMAIL_WORDS = Object.freeze({
  "trialfirst-email-subject": "Your flourish trial: first charge on {date}",
  "trialfirst-email-lead": "This is your reminder that your 14-day free trial of flourish is ending.",
  "trialfirst-email-charge": "On {date}, you'll be charged {amount}, plus any applicable tax, unless you cancel first.",
  "trialfirst-email-keep": "To keep your plan, you don't need to do anything.",
  "trialfirst-email-cancel-ios": "To avoid the first charge, cancel at least 24 hours before your trial ends. On your iPhone, open Settings, tap your name, then Subscriptions, then flourish, and tap Cancel Subscription.",
  "trialfirst-email-cancel-android": "To cancel, do it before {date}: open Google Play, tap your profile, then Payments & subscriptions, then Subscriptions, then flourish, and tap Cancel subscription.",
  "trialfirst-email-why": "You're getting this because you started a free trial. It's the only reminder we'll send for it.",
  "trialfirst-email-unsubscribed": "Done. You won't get trial reminders from us. Your subscription hasn't changed.",
  "trialfirst-email-link-bad": "This link doesn't work. Nothing has changed.",
  "trialfirst-email-unsub-failed": "We couldn't save that. Please try the link again.",
});

const isPlaceholder = (w) => /^\[WORDS: [a-z0-9-]+\]$/.test(w);

function trialEmailWords(id, facts = {}) {
  const w = TRIAL_EMAIL_WORDS[id];
  if (typeof w !== "string") throw new Error(`no such words: ${id}`);
  const keys = Object.keys(facts);
  if (isPlaceholder(w)) return [w, ...keys.map((k) => `[${k} ${facts[k]}]`)].join(" ");
  return keys.reduce((s, k) => s.split(`{${k}}`).join(String(facts[k])), w);
}

module.exports = { TRIAL_EMAIL_WORDS, trialEmailWords };
