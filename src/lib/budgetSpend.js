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
//   - not a credit card payment. A card payment is recognised by more than a fragment of its name:
//     a card-payment phrase ("visa payment", "credit card payment", ...), or "autopay" TOGETHER with
//     a card word. A bare "autopay" is how many subscriptions and utilities are paid; it is spending.
// -----------------------------------------------------------------------------

import { CC_PAYMENT_KEYWORDS, NON_SPEND_CATS } from "./financialCalculations.js";

const CARD_WORDS = /\b(?:credit card|card|visa|mastercard|master card|amex|american express)\b/;

export function isCardPaymentCharge(txn) {
  const name = String((txn && txn.name) || "").toLowerCase();
  if (!name) return false;
  if (CC_PAYMENT_KEYWORDS.some(kw => kw !== "autopay" && name.includes(kw))) return true;
  return name.includes("autopay") && CARD_WORDS.test(name);
}

// { [category]: dollars } for the calendar month containing `now`.
export function monthSpendByCategory(transactions, { now = new Date(), categoryOf = (t) => t.cat } = {}) {
  const out = {};
  for (const t of transactions || []) {
    if (!t || !(t.amount > 0)) continue;
    let d;
    try { d = new Date(t.date + "T12:00:00"); } catch { continue; }
    if (isNaN(d) || d.getMonth() !== now.getMonth() || d.getFullYear() !== now.getFullYear()) continue;
    const cat = categoryOf(t);
    if (NON_SPEND_CATS.has(cat) || isCardPaymentCharge(t)) continue;
    out[cat] = (out[cat] || 0) + t.amount;
  }
  return out;
}
