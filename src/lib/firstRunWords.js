// src/lib/firstRunWords.js
// -----------------------------------------------------------------------------
// THE FIRST RUN'S NEW WORDS (1.1.7, 2026-11-11, from the first-run audit). Every new or changed line is here, in
// one place, so the review block for ChatGPT and Grok is this file and nothing else. APPROVED 2026-11-12 (ChatGPT 100,
// Grok 100), word for word. tests/firstRun.test.cjs holds the code to these words and the copy rules (lowercase
// flourish, no dash, no competitor, no money instruction, no "learns" or "remembers").
// -----------------------------------------------------------------------------

export const FIRST_RUN_WORDS = Object.freeze({
  // The store apps' first screen, before any account: the value, then the way in.
  valueHeadline: "See what's safe to spend before your next payday.",
  valueLead: "flourish takes the bills due before payday, your minimum debt payments, a spending buffer and your savings out of your balance, and shows what's left.",
  sampleTag: "Example, sample data",
  sampleLabel: "Safe to spend until next payday",
  getStarted: "Get started",
  haveAccount: "Already have an account?",
  logIn: "Log in",
  demo: "Try the demo, no account needed",

  // Sign-up and log-in: Apple and Google first, then the email form.
  continueApple: "Continue with Apple",
  continueGoogle: "Continue with Google",
  orEmail: "or use your email",
  socialFailed: "That sign-in didn't finish. Try again, or use your email.",

  // Onboarding: the number comes right after pay and the next payday.
  showNumber: "Show my starting number →",
  billsPending: "Your bills and debt payments aren't in this number yet. You'll add them in the next steps.",
  billsLead: "Add the bills due before payday so they're in your number.",
  notNow: "Not now",
  updateNumber: "Update my number →",
  statementTitle: "📄 Import a bank statement",
  statementSub: "A PDF or CSV from your bank's website. No bank sign-in needed.",
});

// NOT WRITTEN YET (2026-11-12): the consent step that opens onboarding for every new account. The old welcome's words
// (pre-1.1.7, never reviewed for the store apps) are gone; these placeholders stand in until the lines are written and
// approved. scripts/check-pending-words.mjs refuses a production or store build while either placeholder is left, so
// a deploy preview shows them and nothing else does. docs/product/FIRST-RUN-117-WORDS.md lists them for review.
// The button reuses the approved "Get started".
export const FIRST_RUN_PENDING = Object.freeze({
  consentTitle: "[WORDS: onboarding-consent-title]",
  consentLine: "[WORDS: onboarding-consent-line]",
});
