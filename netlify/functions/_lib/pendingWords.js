// netlify/functions/_lib/pendingWords.js
// -----------------------------------------------------------------------------
// WORDS STILL TO COME, ON THE SERVER (the first 50 who subscribe, 2026-10-29): the emails' lines that assumed a
// waitlist number. The app's are in src/lib/pendingWords.js, which says how they are kept from shipping; the
// founding link email's sweep is off (FOUNDING_LINK_EMAIL unset), so none of these is sent. Each id is listed in
// docs/product/FOUNDING-SEATS-WORDS.md.
// -----------------------------------------------------------------------------
"use strict";

const PENDING_WORDS = Object.freeze({
  "welcome-founding-line": "[WORDS: welcome-founding-line]",
  "founding-email-subject": "[WORDS: founding-email-subject]",
  "founding-email-position": "[WORDS: founding-email-position]",
  "founding-email-store-steps": "[WORDS: founding-email-store-steps]",
  "founding-email-computer": "[WORDS: founding-email-computer]",
});

function pendingWords(id) {
  const w = PENDING_WORDS[id];
  if (typeof w !== "string") throw new Error(`no such words: ${id}`);
  return w;
}

// Does an email still hold a placeholder? A send refuses one (foundingLinkEmail.js, waitlistWelcome.js): words still
// to come never reach anyone's inbox, even if a sweep is switched on before they are written.
const holdsPendingWords = (payload) => /\[WORDS:/.test(JSON.stringify(payload || ""));

module.exports = { PENDING_WORDS, pendingWords, holdsPendingWords };
