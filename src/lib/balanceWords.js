// src/lib/balanceWords.js
// -----------------------------------------------------------------------------
// THE WORDS FOR HONEST BANK BALANCES (balance-truth, 2026-11-06). Every line the app shows about how fresh a bank
// balance is, a bank that needs a fresh sign-in, a bank window that closed without linking, history still on its way,
// and card balances from the bank. docs/product/BALANCE-TRUTH-WORDS.md lists each id: where it shows, the facts, the
// limit and the line.
//
// Approved word for word on 2026-11-06 (ChatGPT and Grok agreed; Amanda). tests/balanceTruth.test.cjs section 7 pins
// each line to the approved text. A line still to come would be a "[WORDS: …]" placeholder, here and nowhere else
// (tests/_pendingWords.cjs), and scripts/check-pending-words.mjs would refuse every production and store build.
//
// A line may carry {bank} (the bank's name, as Plaid gives it) and {when} (lib/balanceTruth.js whenText: the time
// today, else the date). While a line is still a placeholder, the values follow it in brackets, so a screen and a
// test can still see which bank and which time it is about.
// -----------------------------------------------------------------------------

export const BALANCE_WORDS = Object.freeze({
  // How fresh: the Today chip, the line under the safe-to-spend figure, and the Debts header.
  "balance-last-updated": "Last updated {when}",
  "balance-last-updated-unknown": "Last update time not available",
  // A bank whose sign-in has run out: the Today card and its button.
  "balance-signin-title": "{bank} needs you to sign in again",
  "balance-signin-partner": "{bank} needs your partner to sign in again",
  "balance-signin-body": "Until then, its balances may be out of date and new transactions can't come in.",
  "balance-signin-button": "Sign in to {bank}",
  // The bank window closed without linking (Settings: connect another bank, reconnect). A reason, then an outcome.
  "balance-link-closed": "You closed the bank window before it finished.",
  "balance-link-bank-down": "{bank} didn't respond.",
  "balance-link-code-wrong": "The security code didn't match.",
  "balance-link-login-wrong": "Your bank didn't accept that sign-in.",
  "balance-link-other": "The connection didn't finish.",
  "balance-link-nothing-added": "Nothing was added.",
  "balance-link-still-needed": "{bank} still needs you to sign in again.",
  // A new bank's 90 days still on the way: the Today card, onboarding, and How we got this.
  "balance-history-loading": "Loading your history from {bank}…",
  "balance-history-loading-body": "Your balances are in. Up to 90 days of transactions can take a few minutes to arrive.",
  "balance-history-slow": "{bank} is still sending your history. flourish checks again each time you open it.",
  // Debts in Settings: the header over card balances from the bank, when they are not live.
  "balance-debts-from-bank": "Balances from your bank",
  // {bank} when Plaid did not say which bank (a window closed before one was chosen).
  "balance-bank-unnamed": "Your bank",
});

const PLACEHOLDER = /^\[WORDS: [a-z0-9-]+\]$/;

/** The line for an id, with {bank} and {when} filled in. A placeholder keeps the values beside it. */
export function balanceWords(id, vars = {}) {
  const line = BALANCE_WORDS[id];
  if (typeof line !== "string") throw new Error(`no such words: ${id}`);
  if (PLACEHOLDER.test(line)) {
    const shown = ["bank", "when"].filter((k) => vars[k] != null && vars[k] !== "").map((k) => String(vars[k]));
    return shown.length ? `${line} (${shown.join(", ")})` : line;
  }
  // A bank Plaid didn't name reads as balance-bank-unnamed, taken as it is (it holds no {bank} of its own).
  const filled = { ...vars, bank: vars.bank ? vars.bank : BALANCE_WORDS["balance-bank-unnamed"] };
  return line.replace(/\{(bank|when)\}/g, (_, k) => (filled[k] == null ? "" : String(filled[k])));
}
