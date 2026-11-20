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

  // The consent step that opens onboarding for every new account (email, Apple or Google), APPROVED 2026-11-12 (ChatGPT
  // 100, Grok 100), word for word. Its button is getStarted above; the Terms and the Privacy Policy are tappable on the
  // step, before it. Tapping Get started is recorded against the account (netlify/functions/_lib/legalConsent.js keeps
  // the server's copy of these two lines; tests/legalConsent.test.cjs holds the two equal).
  consentTitle: "Before you start",
  consentLine: "By tapping Get started, you agree to the Terms and the Privacy Policy, including how flourish collects and uses your information.",
});
