// src/lib/budgetSpend.js
// -----------------------------------------------------------------------------
// THIS MONTH'S SPENDING BY CATEGORY: the one definition every budget surface reads.
//
// Goals → Budget, Do → Budget, the Activity plan card and Today's over-budget nudge each built their
// own tally, and they disagreed (KNOWN-DEFECTS #53). Goals → Budget counted every charge; the other
// two dropped any charge whose name held a card-payment keyword, and that list includes a bare
// "autopay". So a $30 "Spotify Autopay" charge made Subscriptions $10 over its $20 budget on one
// screen and left it $20 under on the other.
//
// The rule, once:
//   - a charge (money out) dated this calendar month, in the household's local time;
//   - in its effective category (the caller passes categoryOf, which applies their corrections);
//   - not a Transfer, Income or Fees category;
//   - not a credit card payment (isCardPaymentCharge): everything the app-wide isCCPayment
//     recognises, except a bare "autopay". "Autopay" is a card payment only together with a card
//     word or a card issuer ("CAPITAL ONE AUTOPAY PYMT", "CHASE CREDIT CRD AUTOPAY", "Citi
//     Autopay"). On its own it is how many subscriptions and utilities are paid; it is spending.
//
// The Activity breakdown uses isCardPaymentCharge too, so its category cards and its Budget Plan card
// agree.
// -----------------------------------------------------------------------------

import { NON_SPEND_CATS, isCCPayment } from "./financialCalculations.js";

const CARD_WORDS = /\b(?:credit card|credit crd|crd|card|visa|mastercard|master card|amex|american express)\b/;
const CARD_ISSUERS = /\b(?:capital one|chase|citi|citibank|citicards|discover|barclaycard|barclays|synchrony|wells fargo|bank of america|us bank|mbna|td|rbc|bmo|cibc|scotia|scotiabank|tangerine|pc financial|desjardins|canadian tire|triangle)\b/;

export function isCardPaymentCharge(txn, debts = []) {
  const name = String((txn && txn.name) || "").toLowerCase();
  if (!name) return false;
  // What isCCPayment recognises, with the bare word "autopay" taken out of the name first.
  if (isCCPayment({ ...txn, name: name.replace(/autopay/g, " ") }, debts)) return true;
  return name.includes("autopay") && (CARD_WORDS.test(name) || CARD_ISSUERS.test(name));
}

// { [category]: dollars } for the calendar month containing `now`.
export function monthSpendByCategory(transactions, { now = new Date(), categoryOf = (t) => t.cat, debts = [] } = {}) {
  const out = {};
  for (const t of transactions || []) {
    if (!t || !(t.amount > 0)) continue;
    let d;
    try { d = new Date(t.date + "T12:00:00"); } catch { continue; }
    if (isNaN(d) || d.getMonth() !== now.getMonth() || d.getFullYear() !== now.getFullYear()) continue;
    const cat = categoryOf(t);
    if (NON_SPEND_CATS.has(cat) || isCardPaymentCharge(t, debts)) continue;
    out[cat] = (out[cat] || 0) + t.amount;
  }
  return out;
}
