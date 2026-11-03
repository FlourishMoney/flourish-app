// src/lib/creatorWords.js
// -----------------------------------------------------------------------------
// THE CREATOR PROGRAM'S WORDS. Every line the app shows for the creator code (docs/product/CREATOR-PROGRAM-SPEC.md).
// docs/product/CREATOR-PROGRAM-WORDS.md lists each id: where it shows, the facts it must state, the approved line and its
// limit; tests/creators.test.cjs holds the two together.
//
// APPROVED 2026-11-03, copied exactly. Change a line only with a new approval. The app shows none of them while
// CREATORS_ENABLED is off.
// -----------------------------------------------------------------------------

export const CREATOR_WORDS = Object.freeze({
  signupLabel: "Creator code (optional)",
  signupHint: "Tells us which creator sent you. It doesn't change what you pay.",
  settingsTitle: "Creator code",
  settingsBody: "If a creator sent you, add their code within 14 days of sign-up, before your first payment. One code per household. Price stays the same.",
  settingsButton: "Add code",
  settingsAdded: "Creator code added. Thanks for telling us who sent you.",
  errors: Object.freeze({
    creator_code_invalid: "That code doesn't work. Check it, or leave it blank. Nothing changed.",
    creator_code_closed: "A creator code can't be added to this household now.",
    creator_code_unavailable: "We couldn't check that code just now. Nothing changed. Try again, or leave it blank.",
  }),
});

// The line for a server error code about a creator code, or null when it is about something else.
export function creatorErrorLine(code) {
  return CREATOR_WORDS.errors[code] || null;
}
