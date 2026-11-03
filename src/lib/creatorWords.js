// src/lib/creatorWords.js
// -----------------------------------------------------------------------------
// THE CREATOR PROGRAM'S WORDS. Every line the app shows for the creator code (docs/product/CREATOR-PROGRAM-SPEC.md).
// docs/product/CREATOR-PROGRAM-WORDS.md lists each id: where it shows, the facts it must state, the approved line and its
// limit; tests/creators.test.cjs holds the two together.
//
// NOT WRITTEN YET. Each line is its own "[WORDS: …]" placeholder until it is approved, and nothing ships with one:
// scripts/check-pending-words.mjs refuses the production web build (netlify.toml) and every store build (npm run
// build:native). The app shows none of them while CREATORS_ENABLED is off.
// -----------------------------------------------------------------------------

export const CREATOR_WORDS = Object.freeze({
  signupLabel: "[WORDS: creator-signup-label]",
  signupHint: "[WORDS: creator-signup-hint]",
  settingsTitle: "[WORDS: creator-settings-title]",
  settingsBody: "[WORDS: creator-settings-body]",
  settingsButton: "[WORDS: creator-settings-button]",
  settingsAdded: "[WORDS: creator-settings-added]",
  errors: Object.freeze({
    creator_code_invalid: "[WORDS: creator-code-invalid]",
    creator_code_closed: "[WORDS: creator-code-closed]",
    creator_code_unavailable: "[WORDS: creator-code-unavailable]",
  }),
});

// The line for a server error code about a creator code, or null when it is about something else.
export function creatorErrorLine(code) {
  return CREATOR_WORDS.errors[code] || null;
}
