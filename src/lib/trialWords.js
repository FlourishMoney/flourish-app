// src/lib/trialWords.js
// -----------------------------------------------------------------------------
// TRIAL_PLAN_FIRST'S WORDS (2026-11-10): every line a person sees about the 14-day store and Stripe trial. ALL ARE
// PLACEHOLDERS until both reviewers approve them (Amanda's rule). docs/product/TRIAL-PLAN-FIRST-WORDS.md lists each
// id: where it shows, the facts it must carry, the placeholder and its length limit. The emails' are in
// netlify/functions/_lib/trialWords.js.
//
// Nothing ships with a placeholder: scripts/check-pending-words.mjs refuses the production web build (netlify.toml)
// and every store build (npm run build:native) while one is left.
//
// A line carries facts (a date, a price) as {name}. While it is a placeholder the facts follow it in brackets, so the
// screen can be checked with the real date and price before the words exist: "[WORDS: …] [date November 24, 2026]".
// -----------------------------------------------------------------------------

export const TRIAL_WORDS = Object.freeze({
  // The plans screen with the switch on, above each plan's button (Apple 3.1.2, Google Play's subscription rules).
  "trialfirst-free-days": "[WORDS: trialfirst-free-days]",
  "trialfirst-then": "[WORDS: trialfirst-then]",
  "trialfirst-first-charge": "[WORDS: trialfirst-first-charge]",
  "trialfirst-cancel-before": "[WORDS: trialfirst-cancel-before]",
  "trialfirst-cancel-ios": "[WORDS: trialfirst-cancel-ios]",
  "trialfirst-cancel-android": "[WORDS: trialfirst-cancel-android]",
  "trialfirst-cancel-web": "[WORDS: trialfirst-cancel-web]",
  "trialfirst-no-trial": "[WORDS: trialfirst-no-trial]",
  "trialfirst-button": "[WORDS: trialfirst-button]",
  // The plans screen that comes first for a new account (it cannot be closed), and its way out.
  "trialfirst-plans-title": "[WORDS: trialfirst-plans-title]",
  "trialfirst-plans-lead": "[WORDS: trialfirst-plans-lead]",
  "trialfirst-sign-out": "[WORDS: trialfirst-sign-out]",
  // The website: the server found the trial no longer applies (or now does) as the person pressed the button.
  "trialfirst-changed": "[WORDS: trialfirst-changed]",
  // The trial chip (the store apps) and banner (the website) during the 14 days.
  "trialfirst-chip": "[WORDS: trialfirst-chip]",
  // What replaces "No credit card" and "Every feature free for 14 days" before sign-in, while the switch is on.
  "trialfirst-welcome": "[WORDS: trialfirst-welcome]",
  "trialfirst-landing": "[WORDS: trialfirst-landing]",
});

const isPlaceholder = (w) => /^\[WORDS: [a-z0-9-]+\]$/.test(w);

/** A line, with its facts. A placeholder keeps the facts after it in brackets; a real line has them put in. */
export function trialWords(id, facts = {}) {
  const w = TRIAL_WORDS[id];
  if (typeof w !== "string") throw new Error(`no such words: ${id}`);
  const keys = Object.keys(facts);
  if (isPlaceholder(w)) return [w, ...keys.map((k) => `[${k} ${facts[k]}]`)].join(" ");
  return keys.reduce((s, k) => s.split(`{${k}}`).join(String(facts[k])), w);
}
