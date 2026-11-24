// src/lib/freeWords.js
// -----------------------------------------------------------------------------
// FREE V1 ON THE WEBSITE: THE WORD SLOTS (2026-11-23). The free plan is back on the website: no bank connection on
// Free, the plans screen closes onto Free, the coach stays at 2 messages a week. Every line the website shows about it
// is a slot here, and each slot is a placeholder (the words "[WORDS:", a space, then its id) until the founder's approved words are pasted in.
//
// NOTHING SHIPS WITH A PLACEHOLDER, TWICE OVER:
//   tests/freeV1Words.test.cjs FAILS while any slot here or in netlify/functions/_lib/freeWords.js is a placeholder,
//     so the gate (and the `math` check on the pull request) stays red until every word is in;
//   scripts/check-pending-words.mjs refuses the production web build and every store build while one is left.
// docs/product/FREE-V1-WORDS.md lists every slot: where it shows, what it must say, and its length limit.
//
// To drop the words in: replace each placeholder with its approved line, word for word, and the same line in
// docs/product/FREE-V1-WORDS.md. Nothing else changes.
// -----------------------------------------------------------------------------

export const FREE_WORDS = Object.freeze({
  // The website, a Free account at "Connect a bank" (onboarding's bank step, Settings, a reconnect with no bank):
  // the line, and the button with it that opens the plans.
  "free-bank-line": "Connecting a bank requires a flourish subscription. On the free plan, you can add your balances, bills and paydays by hand.",
  "free-bank-button": "See plans",
  // The website's plans screen: the bullet that replaces "More than one bank, all in one place".
  "free-plans-bullet-bank": "Read-only bank connections",
  // The website's locked screens (Credit, the coach-run meeting): the line in "what a subscription includes" that
  // replaces "More than one connected bank".
  "free-includes-bank": "Connected banks",
  // The website's plans screen: the button that closes it onto Free (today "Close").
  "free-plans-close": "Continue on the free plan",
  // The website's Settings, the plan card's line (today "Flourish Plus adds Credit and the coach-run meeting, and
  // lifts the free plan's limits on the coach and What-If.").
  "free-settings-plan-line": "A flourish subscription adds bank connections, Credit and the coach-run money meeting, and lifts the free plan's limits on the coach and What-If.",
  // The website's sign-up card heading (today "Create your account" while plans come first).
  "free-signup-title": "Create your account",
  // The website's landing: the line under "Get started", top and bottom (today "Choose a plan to get started. ...").
  "free-landing-line": "On the website, use the free plan or choose a flourish subscription to connect banks. Eligible new subscribers get 14 days free with payment details required, then the subscription renews at the listed price unless cancelled. flourish is also on iPhone and Android.",
  // The website's page description (search results and link previews): the sentence after "Know what's safe to
  // spend until payday. A Canadian money app where safe to spend is built around your paydays."
  "free-page-description": "Use the free plan on the website, or a flourish subscription to connect banks.",
  // Terms of Service section 7 on the website (plans first): the sentence that replaces "A new account chooses a
  // plan to keep using flourish.", the paragraph that says what the free plan is (replaces "An account opened
  // before {date} keeps its 14-day account trial ... then moves to the free plan: ..."), and what happens to a
  // connected bank when a plan or trial ends. {date} is filled in by the code, as today.
  "free-terms-7-new-account": "A new account can use the free plan or choose a paid plan.",
  "free-terms-7-free-plan": "The free plan includes 2 coach messages a week and 1 What-If a day. It does not include Credit or the coach-run money meeting. On the website, the free plan does not connect a bank. In the iPhone and Android apps, the free plan can connect 1 bank. An account already in the 14-day account trial on {date} keeps that trial to its end, then moves to the free plan.",
  "free-terms-7-bank-end": "If a paid plan ends, a bank you already connected stays connected. If we change that, we will email you at least 30 days before.",
});

// THE TERMS' NEW DATE. The website's Terms change with these words, so their "Last updated" date (and the date the
// consent step records, lib/legalConsent.js) moves to the day the words go live: "YYYY-MM-DD", set when the words are
// pasted in. null until then, and tests/freeV1Words.test.cjs fails while it is. The store apps' Terms do not move.
// Set to 2026-11-24 (Toronto), the go-live day (review round 1). If the website goes live on another day, change this
// line to that day (Toronto time) before the deploy: the Terms' date and section 7's {date} both follow it.
export const FREE_TERMS_DATE = "2026-11-24";

const PLACEHOLDER = /\[WORDS:\s*free-/;

/** The words for a slot; {date} becomes the date given, where the slot has one. */
export function freeWords(id, { date } = {}) {
  const w = FREE_WORDS[id];
  if (typeof w !== "string") throw new Error(`no such words: ${id}`);
  return date === undefined ? w : w.replace("{date}", String(date));
}

/** The slots still waiting for approved words. Empty once every one is in. */
export function pendingFreeSlots() {
  return Object.keys(FREE_WORDS).filter((id) => PLACEHOLDER.test(FREE_WORDS[id]));
}
