// src/lib/firstRunWords.js
// -----------------------------------------------------------------------------
// THE FIRST RUN'S NEW WORDS (1.1.7, 2026-11-11, from the first-run audit). Every new or changed line is here, in
// one place, so the review block for ChatGPT and Grok is this file and nothing else. NOT YET APPROVED: the 1.1.7 PR is
// not merged until they are. tests/firstRun.test.cjs holds the code to these words and the copy rules (lowercase
// flourish, no dash, no competitor, no money instruction, no "learns" or "remembers").
// -----------------------------------------------------------------------------

export const FIRST_RUN_WORDS = Object.freeze({
  // The store apps' first screen, before any account: the value, then the way in.
  valueHeadline: "Know what's safe to spend until payday.",
  valueLead: "flourish takes the bills due before payday, your minimum debt payments, a buffer and your savings out of your balance, and shows what's left.",
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
  showNumber: "Show me my number →",
  billsPending: "Your bills aren't in this number yet. You'll add them next.",
  billsLead: "Add the bills due before payday so your number is exact.",
  notNow: "Not now",
  updateNumber: "Update my number →",
  statementTitle: "📄 Import a bank statement",
  statementSub: "A PDF or CSV from your bank's website. No bank sign-in needed.",
});
