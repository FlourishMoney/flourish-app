// src/lib/trialWords.js
// -----------------------------------------------------------------------------
// TRIAL_PLAN_FIRST'S WORDS (2026-11-10): every line a person sees about the 14-day store and Stripe trial, word for word
// as APPROVED 2026-11-10 (ChatGPT 100, Grok 100). docs/product/TRIAL-PLAN-FIRST-WORDS.md lists each id: where it shows,
// the facts it carries and its length limit. The emails' are in netlify/functions/_lib/trialWords.js.
//
// A line changed later goes back to a "[WORDS: …]" placeholder until it is approved again, and nothing ships with one:
// scripts/check-pending-words.mjs refuses the production web build (netlify.toml) and every store build.
//
// A line carries facts (a date, a price) as {name}. While it is a placeholder the facts follow it in brackets, so the
// screen can be checked with the real date and price before the words exist: "[WORDS: …] [date November 24, 2026]".
// -----------------------------------------------------------------------------

export const TRIAL_WORDS = Object.freeze({
  // The plans screen with the switch on, above each plan's button (Apple 3.1.2, Google Play's subscription rules).
  "trialfirst-free-days": "14 days free",
  "trialfirst-then": "Then {price}, renewing until you cancel.",
  "trialfirst-first-charge": "First charge: {date}",
  "trialfirst-cancel-before": "Cancel before {date} to avoid the first charge.",
  "trialfirst-cancel-ios": "To cancel: open Settings, tap your name, then Subscriptions.",
  "trialfirst-cancel-android": "To cancel: open Google Play, tap your profile, then Payments & subscriptions, then Subscriptions.",
  "trialfirst-cancel-web": "To cancel: in flourish, go to Settings, then Manage subscription.",
  "trialfirst-no-trial": "{price}, charged today. Renews until you cancel.",
  "trialfirst-button": "Start free trial",
  // The plans screen that comes first for a new account (it cannot be closed), and its way out.
  "trialfirst-plans-title": "Choose your plan",
  "trialfirst-plans-lead": "Pick a plan to keep using flourish. If you qualify for 14 days free, you'll be charged automatically on the first-charge date shown unless you cancel.",
  "trialfirst-sign-out": "Sign out",
  // The website: the server found the trial no longer applies (or now does) as the person pressed the button.
  "trialfirst-changed": "Nothing was charged. The plans now show what applies to you, so please choose again.",
  // The trial chip (the store apps) and banner (the website) during the 14 days.
  "trialfirst-chip": "Free trial. First charge {date}",
  // What replaces "No credit card" and "Every feature free for 14 days" before sign-in, while the switch is on.
  "trialfirst-welcome": "Made for Canadian households",
  "trialfirst-landing": "Choose a plan to get started. Eligible new subscribers get 14 days free, then the plan renews at the listed price unless cancelled. Also on iPhone and Android.",
  // The website landing's main button, top and bottom, instead of "Try flourish free for 14 days" (approved 2026-11-11,
  // ChatGPT 100, Grok 100): trialfirst-landing sits under it.
  "trialfirst-get-started": "Get started",
  // ── WORDS STILL TO COME (2026-11-13): lines that were true only while the switch is off. Each shows only while it
  // is on; off, today's line shows, word for word (SWITCH_OFF_WORDS below, lib/storeOffer.js STORE_DISCLOSURE).
  // The website, back from a Stripe checkout that started the 14 days (no payment was taken).
  "trialfirst-checkout-done": "[WORDS: trialfirst-checkout-done]",
  // Under the store plans, when a plan on the screen claims the 14 days (in place of "Payment is charged … when you confirm").
  "trialfirst-disclosure-ios": "[WORDS: trialfirst-disclosure-ios]",
  "trialfirst-disclosure-android": "[WORDS: trialfirst-disclosure-android]",
  // The sign-up card's heading, the demo's two lines and its button, and the website's meeting line for an account with no plan.
  "trialfirst-signup-title": "[WORDS: trialfirst-signup-title]",
  "trialfirst-demo-meeting": "[WORDS: trialfirst-demo-meeting]",
  "trialfirst-demo-coach": "[WORDS: trialfirst-demo-coach]",
  "trialfirst-demo-coach-button": "[WORDS: trialfirst-demo-coach-button]",
  "trialfirst-meeting-locked": "[WORDS: trialfirst-meeting-locked]",
});

// TODAY'S LINES, WORD FOR WORD, for the places that follow the switch: shown while it is off (and while there is no
// answer about it). tests/trialSwitchWords.test.cjs pins each.
export const SWITCH_OFF_WORDS = Object.freeze({
  "trialfirst-checkout-done": "Payment received. Your plan will update when Stripe confirms it, usually within a few seconds.",
  "trialfirst-signup-title": "Create your free account",
  "trialfirst-demo-meeting": "A scripted preview. Create a free account to run this meeting on your own numbers.",
  "trialfirst-demo-coach": "That's the coach working on sample data. Create a free account to ask it about your own.",
  "trialfirst-demo-coach-button": "Create free account →",
  "trialfirst-meeting-locked": "Start your trial to run the meeting with your coach.",
});

const isPlaceholder = (w) => /^\[WORDS: [a-z0-9-]+\]$/.test(w);

/** A line that follows the switch: today's words unless the switch is known to be on (only `true` counts). */
export function switchWords(id, on) {
  const off = SWITCH_OFF_WORDS[id];
  if (typeof off !== "string") throw new Error(`no such switch words: ${id}`);
  return on === true ? trialWords(id) : off;
}

/** A line, with its facts. A placeholder keeps the facts after it in brackets; a real line has them put in. */
export function trialWords(id, facts = {}) {
  const w = TRIAL_WORDS[id];
  if (typeof w !== "string") throw new Error(`no such words: ${id}`);
  const keys = Object.keys(facts);
  if (isPlaceholder(w)) return [w, ...keys.map((k) => `[${k} ${facts[k]}]`)].join(" ");
  return keys.reduce((s, k) => s.split(`{${k}}`).join(String(facts[k])), w);
}
