// src/lib/pendingWords.js
// -----------------------------------------------------------------------------
// THE FOUNDING WORDS (the first 50 who subscribe; approved 2026-10-29, ChatGPT and Grok agreed). The lines that
// assumed a waitlist number, and the trial link on the founding plans screen, word for word as approved.
// docs/product/FOUNDING-SEATS-WORDS.md lists each id: where it shows, the facts, the limit and the approved line;
// tests/foundingSeatsWords.test.cjs holds the two together. The server's own (the emails) are in
// netlify/functions/_lib/pendingWords.js.
//
// A line not yet written shows as a "[WORDS: …]" placeholder here and nowhere else, and nothing ships with one:
// scripts/check-pending-words.mjs refuses the production web build (netlify.toml) and every store build
// (npm run build:native) while one is left.
//
// A template carries {n}: the live founding spots left, put in by the caller.
// -----------------------------------------------------------------------------

export const PENDING_WORDS = Object.freeze({
  // The founding plans screen in the store apps (1.1.3): the small print under the plans, and its confirm.
  "trial-link": "Not now, keep my 14-day trial",
  "trial-confirm-title": "Keep your trial for now?",
  "trial-confirm-body": "There are {n} founding spots left. They go to the first households who subscribe, and we can't hold one for you. You can still choose Founding annual later if spots remain.",
  "trial-confirm-stay": "Back to the plans",
  "trial-confirm-leave": "Keep my trial",
  // The store apps: the founding plan's line, and the founding switch line in Settings (Apple and Google).
  "store-founding-line": "For the first 50 households who subscribe. Stays the same while you stay subscribed.",
  "store-founding-spot-line-ios": "Founding annual is open while spots last, and spots aren't held. To avoid being charged during a plan change, cancel your current plan in your Apple Account settings first. You keep access until it ends, then choose Founding annual in See plans.",
  "store-founding-spot-line-android": "Founding annual is open while spots last, and spots aren't held. To avoid being charged during a plan change, cancel your current plan in Google Play under Subscriptions first. You keep access until it ends, then choose Founding annual in See plans.",
  // Terms of Service section 7 in a store build that sells: its founding sentence.
  "terms-7-founding": "The founding price is for the first 50 households who subscribe to Founding annual. It is not reserved for anyone, it stays the same while that subscription stays active, and it does not come back once that subscription ends.",
  // The website's landing: the founding line in the hero (with the live count), and the 0-left line.
  "founding-list-line": "Founding price: $79.99 a year plus tax for the first 50 households who subscribe. {n} spots left, first come, first served.",
  "founding-full-account-line": "All 50 founding spots are taken. You can still subscribe on the website or in the iPhone and Android apps.",
  // The website, signed in: the founding checkout refused, and the founding link's two notes.
  "checkout-founding-refused": "The founding price isn't available for this account. Either all 50 spots are taken or your founding subscription has ended. Monthly and annual plans are still available.",
  "founding-signin-note": "Sign in or create an account with any email address, then subscribe while founding spots last.",
  "founding-not-matched-note": "The founding price isn't available here. All spots may be taken, your founding subscription may have ended, or you already subscribe.",
});

/** The words for an id; a template's {n} becomes the number given. */
export function pendingWords(id, n) {
  const w = PENDING_WORDS[id];
  if (typeof w !== "string") throw new Error(`no such words: ${id}`);
  return n === undefined ? w : w.replace("{n}", String(n));
}
