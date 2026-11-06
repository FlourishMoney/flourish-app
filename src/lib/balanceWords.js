// src/lib/balanceWords.js
// -----------------------------------------------------------------------------
// THE WORDS FOR HONEST BANK BALANCES (balance-truth, 2026-11-06). Every line the app shows about how fresh a bank
// balance is, a bank that needs a fresh sign-in, a bank window that closed without linking, history still on its way,
// and card balances from the bank. docs/product/BALANCE-TRUTH-WORDS.md lists each id: where it shows, the facts, the
// limit and the line.
//
// A line not yet approved is a "[WORDS: …]" placeholder, here and nowhere else (tests/_pendingWords.cjs allows
// balance- ids in this file only, while the doc still lists them as placeholders). Nothing ships with one:
// scripts/check-pending-words.mjs refuses the production web build and every store build while one is left.
//
// A line may carry {bank} (the bank's name, as Plaid gives it) and {when} (lib/balanceTruth.js whenText: the time
// today, else the date). While a line is still a placeholder, the values follow it in brackets, so a screen and a
// test can still see which bank and which time it is about.
// -----------------------------------------------------------------------------

export const BALANCE_WORDS = Object.freeze({
  // How fresh: the Today chip, the line under the safe-to-spend figure, and the Debts header.
  "balance-last-updated": "[WORDS: balance-last-updated]",
  "balance-last-updated-unknown": "[WORDS: balance-last-updated-unknown]",
  // A bank whose sign-in has run out: the Today card and its button.
  "balance-signin-title": "[WORDS: balance-signin-title]",
  "balance-signin-body": "[WORDS: balance-signin-body]",
  "balance-signin-button": "[WORDS: balance-signin-button]",
  // The bank window closed without linking (Settings: connect another bank, reconnect). A reason, then an outcome.
  "balance-link-closed": "[WORDS: balance-link-closed]",
  "balance-link-bank-down": "[WORDS: balance-link-bank-down]",
  "balance-link-code-wrong": "[WORDS: balance-link-code-wrong]",
  "balance-link-login-wrong": "[WORDS: balance-link-login-wrong]",
  "balance-link-other": "[WORDS: balance-link-other]",
  "balance-link-nothing-added": "[WORDS: balance-link-nothing-added]",
  "balance-link-still-needed": "[WORDS: balance-link-still-needed]",
  // A new bank's 90 days still on the way: the Today card, onboarding, and How we got this.
  "balance-history-loading": "[WORDS: balance-history-loading]",
  "balance-history-loading-body": "[WORDS: balance-history-loading-body]",
  "balance-history-slow": "[WORDS: balance-history-slow]",
  // Debts in Settings: the header over card balances from the bank, when they are not live.
  "balance-debts-from-bank": "[WORDS: balance-debts-from-bank]",
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
  return line.replace(/\{(bank|when)\}/g, (_, k) => (vars[k] == null ? "" : String(vars[k])));
}
