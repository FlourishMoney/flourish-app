// netlify/functions/_lib/giftWords.js
// -----------------------------------------------------------------------------
// THE GIFT WORDS, ON THE SERVER: both emails and the names Stripe shows at checkout. APPROVED 2026-11-20 (ChatGPT and
// Grok, round 2), word for word from docs/review/GIFT-COPY-APPROVED-2026-11-20.md. docs/review/GIFT-COPY.md lists each id
// with where it shows; tests/giftWords.test.cjs holds this file, the gift pages and both sheets together. Change a line
// and it goes back to Amanda for approval.
//
// The Plus gift's lines are NOT approved: the Plus gift is not sold until Plus is live, and its lines are not here.
// A template may carry {plan}, {date}, {email}, {name}, {from}, {start} or {end}, filled in by _lib/gifts.js.
// -----------------------------------------------------------------------------
"use strict";

const GIFT_WORDS = Object.freeze({
  // What Stripe Checkout shows for the gift (the line item), and under it.
  "gift-stripe-name-flourish": "A year of flourish (gift)",
  "gift-stripe-description": "One-time gift, nothing renews. 12 months, redeemed with a code.",
  // The plan's name inside a sentence ({plan}).
  "gift-plan-flourish": "a year of flourish",
  // Email 1, to the buyer, right away.
  "gift-email1-subject": "Your gift is ready",
  "gift-email1-intro": "Thank you. Your gift of {plan} is ready.",
  "gift-email1-delivery-email": "We'll email it to {name} at {email} on {date}, at 7 a.m. Eastern time.",
  "gift-email1-delivery-print": "Print the card below and give it to them, or pass the code on yourself.",
  "gift-email1-code-label": "Gift code:",
  "gift-email1-card-line": "Printable card:",
  "gift-email1-card-button": "Open the printable card",
  "gift-email1-how": "To redeem it, they go to flourishmoney.app/gift/redeem, sign in or create an account, and enter the code.",
  "gift-email1-start-now": "Their 12 months start on the day they redeem the code, or after any paid period they already have ends if that is later.",
  "gift-email1-start-on": "Their 12 months start on the latest of {date}, the day they redeem the code, or the end of any paid period they already have.",
  "gift-email1-onetime": "One-time gift, nothing renews. The code doesn't expire.",
  "gift-email1-refund": "If it hasn't been redeemed, you can ask for a refund within 30 days. Write to hello@flourishmoney.app. A refund cancels the code.",
  "gift-email1-receipt": "Stripe sends your receipt in a separate email.",
  // Email 2, to the recipient, at 7 a.m. Eastern on the day the buyer chose.
  "gift-email2-subject": "{from} has given you {plan}",
  "gift-email2-hello-name": "Hi {name},",
  "gift-email2-hello": "Hi,",
  "gift-email2-intro": "{from} has given you {plan} as a gift.",
  "gift-email2-message-label": "Their message:",
  "gift-email2-code-label": "Your gift code:",
  "gift-email2-how": "To redeem it, go to flourishmoney.app/gift/redeem, sign in or create an account, and enter the code once.",
  "gift-email2-button": "Redeem your gift",
  "gift-email2-start-now": "Your 12 months start on the day you redeem the code, or after any paid period you already have ends if that is later.",
  "gift-email2-start-on": "Your 12 months start on the latest of {date}, the day you redeem the code, or the end of any paid period you already have.",
  "gift-email2-apps": "Then get the flourish app and sign in with the same account:",
  "gift-email2-onetime": "One-time gift, nothing renews. You won't be asked for a card, and the code doesn't expire.",
  // Email 2's footer (three lines; " / " in the approved sheet marks the breaks). It names the buyer ({from}).
  "gift-email-footer": "This email was sent because {from} asked us to send you a flourish gift. / flourish is operated by GrowSmart Inc., PO Box 29, Foxboro ON K0K 2B0. Questions? hello@flourishmoney.app / Rather not get gift emails like this from us? Reply to this email and we'll stop sending them.",
  // Email 1's footer: the household invite's approved footer, unchanged (the approved sheet, note 2).
  "gift-email1-footer": "flourish is operated by GrowSmart Inc., PO Box 29, Foxboro ON K0K 2B0. Questions? hello@flourishmoney.app",
});
const IDS = Object.freeze(Object.keys(GIFT_WORDS));

/** The words for an id, with any {key} filled from vars. Throws on an unknown id. */
function giftWords(id, vars = {}, words = GIFT_WORDS) {
  const w = words[id];
  if (typeof w !== "string") throw new Error(`no such gift words: ${id}`);
  return w.replace(/\{([a-z]+)\}/g, (m, k) => (vars[k] == null ? m : String(vars[k])));
}

module.exports = { GIFT_WORD_IDS: IDS, GIFT_WORDS, giftWords };
