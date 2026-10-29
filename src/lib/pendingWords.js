// src/lib/pendingWords.js
// -----------------------------------------------------------------------------
// WORDS STILL TO COME (the first 50 who subscribe, 2026-10-29). Every place in the app whose words assumed a waitlist
// number, and the new trial link on the founding plans screen, shows a placeholder from here until Amanda writes
// the words. No other file in src/ holds a "[WORDS:" placeholder. docs/product/FOUNDING-SEATS-WORDS.md lists each id:
// where it shows, the facts the words must state, and the limit. The server's own (the emails) are in
// netlify/functions/_lib/pendingWords.js.
//
// NOTHING SHIPS WITH ONE. scripts/check-pending-words.mjs refuses the production web build (netlify.toml) and every
// store build (npm run build:native) while any placeholder is left. A deploy preview still builds, so the screens
// can be looked at.
//
// A template carries {n}: the live founding spots left, put in by the caller.
// -----------------------------------------------------------------------------

export const PENDING_WORDS = Object.freeze({
  // The founding plans screen in the store apps (1.1.3): the small print under the plans, and its confirm.
  "trial-link": "[WORDS: trial-link]",
  "trial-confirm-title": "[WORDS: trial-confirm-title]",
  "trial-confirm-body": "[WORDS: trial-confirm-body | spots left: {n}]",
  "trial-confirm-stay": "[WORDS: trial-confirm-stay]",
  "trial-confirm-leave": "[WORDS: trial-confirm-leave]",
});

/** The words for an id; a template's {n} becomes the number given. */
export function pendingWords(id, n) {
  const w = PENDING_WORDS[id];
  if (typeof w !== "string") throw new Error(`no such words: ${id}`);
  return n === undefined ? w : w.replace("{n}", String(n));
}
