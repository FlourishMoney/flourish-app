// netlify/functions/_lib/trialWords.js
// -----------------------------------------------------------------------------
// TRIAL_PLAN_FIRST'S EMAIL WORDS (2026-11-10): the reminder 3 days before the first charge, and the page its
// unsubscribe link opens. ALL ARE PLACEHOLDERS until both reviewers approve them; docs/product/TRIAL-PLAN-FIRST-WORDS.md
// lists each id. An email holding a placeholder is never sent (_lib/trialReminder.js), and the production build refuses
// to deploy while one is left (scripts/check-pending-words.mjs over netlify/functions). The app's are src/lib/trialWords.js.
// Facts go in as {name}; while a line is a placeholder they follow it in brackets.
// -----------------------------------------------------------------------------
"use strict";

const TRIAL_EMAIL_WORDS = Object.freeze({
  "trialfirst-email-subject": "[WORDS: trialfirst-email-subject]",
  "trialfirst-email-lead": "[WORDS: trialfirst-email-lead]",
  "trialfirst-email-charge": "[WORDS: trialfirst-email-charge]",
  "trialfirst-email-keep": "[WORDS: trialfirst-email-keep]",
  "trialfirst-email-cancel-ios": "[WORDS: trialfirst-email-cancel-ios]",
  "trialfirst-email-cancel-android": "[WORDS: trialfirst-email-cancel-android]",
  "trialfirst-email-why": "[WORDS: trialfirst-email-why]",
  "trialfirst-email-unsubscribed": "[WORDS: trialfirst-email-unsubscribed]",
  "trialfirst-email-link-bad": "[WORDS: trialfirst-email-link-bad]",
  "trialfirst-email-unsub-failed": "[WORDS: trialfirst-email-unsub-failed]",
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
