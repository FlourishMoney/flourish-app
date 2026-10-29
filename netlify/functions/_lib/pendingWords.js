// netlify/functions/_lib/pendingWords.js
// -----------------------------------------------------------------------------
// THE FOUNDING WORDS, ON THE SERVER (the first 50 who subscribe; approved 2026-10-29, ChatGPT and Grok agreed): the
// emails' lines that assumed a waitlist number, word for word. The app's are in src/lib/pendingWords.js. Each id is
// listed in docs/product/FOUNDING-SEATS-WORDS.md. A line not yet written would show as "[WORDS: …]", and a send
// refuses an email holding one (holdsPendingWords). The founding link email's sweep is off (FOUNDING_LINK_EMAIL unset).
// -----------------------------------------------------------------------------
"use strict";

const PENDING_WORDS = Object.freeze({
  "welcome-founding-line": "The founding price goes to the first 50 households who subscribe, so joining the list doesn't hold a spot. You can subscribe now on the website or in the iPhone and Android apps.",
  "founding-email-subject": "Founding price: first 50 households to subscribe",
  "founding-email-position": "The founding price goes to the first 50 households who subscribe. Spots aren't held, so it's first come, first served:",
  "founding-email-store-steps": "Create your account in the app with any email address and tap the confirmation link we send you. Then open See plans and choose Founding annual while spots last.",
  "founding-email-computer": "On a computer? You can subscribe on our website:",
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
