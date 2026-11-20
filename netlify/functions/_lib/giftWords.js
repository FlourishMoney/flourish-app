// netlify/functions/_lib/giftWords.js
// -----------------------------------------------------------------------------
// THE GIFT WORDS, ON THE SERVER: both emails and the names Stripe shows at checkout. NOT APPROVED YET.
//
// Every line is a WORDS placeholder ("[WORDS: " then its id, then "]") until Amanda approves the drafts in docs/review/GIFT-COPY.md, where
// each id is listed with where it shows and its draft. Nothing ships with one: the production build refuses it
// (scripts/check-pending-words.mjs, netlify.toml), and sendGiftEmail (_lib/gifts.js) refuses to send an email that
// still holds one. tests/giftWords.test.cjs holds this file, the gift pages and GIFT-COPY.md together.
//
// A template may carry {plan}, {date}, {email}, {name}, {start} or {end}, filled in by _lib/gifts.js.
// When the words are approved, each placeholder here becomes the approved line, word for word.
// -----------------------------------------------------------------------------
"use strict";

// Written out in full, so scripts/check-pending-words.mjs sees every placeholder in this file.
const GIFT_WORDS = Object.freeze({
  // What Stripe Checkout shows for each gift (the line item), and under it.
  "gift-stripe-name-flourish": "[WORDS: gift-stripe-name-flourish]",
  "gift-stripe-name-plus": "[WORDS: gift-stripe-name-plus]",
  "gift-stripe-description": "[WORDS: gift-stripe-description]",
  // The plan's name inside a sentence ({plan}).
  "gift-plan-flourish": "[WORDS: gift-plan-flourish]",
  "gift-plan-plus": "[WORDS: gift-plan-plus]",
  // Email 1, to the buyer, right away.
  "gift-email1-subject": "[WORDS: gift-email1-subject]",
  "gift-email1-intro": "[WORDS: gift-email1-intro]",
  "gift-email1-delivery-email": "[WORDS: gift-email1-delivery-email]",
  "gift-email1-delivery-print": "[WORDS: gift-email1-delivery-print]",
  "gift-email1-code-label": "[WORDS: gift-email1-code-label]",
  "gift-email1-card-line": "[WORDS: gift-email1-card-line]",
  "gift-email1-card-button": "[WORDS: gift-email1-card-button]",
  "gift-email1-how": "[WORDS: gift-email1-how]",
  "gift-email1-start-now": "[WORDS: gift-email1-start-now]",
  "gift-email1-start-on": "[WORDS: gift-email1-start-on]",
  "gift-email1-onetime": "[WORDS: gift-email1-onetime]",
  "gift-email1-refund": "[WORDS: gift-email1-refund]",
  "gift-email1-receipt": "[WORDS: gift-email1-receipt]",
  // Email 2, to the recipient, at 7 a.m. Eastern on the day the buyer chose.
  "gift-email2-subject": "[WORDS: gift-email2-subject]",
  "gift-email2-hello-name": "[WORDS: gift-email2-hello-name]",
  "gift-email2-hello": "[WORDS: gift-email2-hello]",
  "gift-email2-intro": "[WORDS: gift-email2-intro]",
  "gift-email2-message-label": "[WORDS: gift-email2-message-label]",
  "gift-email2-code-label": "[WORDS: gift-email2-code-label]",
  "gift-email2-how": "[WORDS: gift-email2-how]",
  "gift-email2-button": "[WORDS: gift-email2-button]",
  "gift-email2-start-now": "[WORDS: gift-email2-start-now]",
  "gift-email2-start-on": "[WORDS: gift-email2-start-on]",
  "gift-email2-apps": "[WORDS: gift-email2-apps]",
  "gift-email2-onetime": "[WORDS: gift-email2-onetime]",
  // Both emails, at the bottom.
  "gift-email-footer": "[WORDS: gift-email-footer]",
});
const IDS = Object.freeze(Object.keys(GIFT_WORDS));

/** The words for an id, with any {key} filled from vars. Throws on an unknown id. */
function giftWords(id, vars = {}, words = GIFT_WORDS) {
  const w = words[id];
  if (typeof w !== "string") throw new Error(`no such gift words: ${id}`);
  return w.replace(/\{([a-z]+)\}/g, (m, k) => (vars[k] == null ? m : String(vars[k])));
}

module.exports = { GIFT_WORD_IDS: IDS, GIFT_WORDS, giftWords };
