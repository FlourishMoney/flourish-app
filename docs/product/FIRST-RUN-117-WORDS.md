# 1.1.7 first-run words (APPROVED 2026-11-12, ChatGPT 100, Grok 100)

Every line is in `src/lib/firstRunWords.js`; `tests/firstRun.test.cjs` holds the code to it. Approved with five changes from the draft (lines 1, 2, 10, 11, 12); the block below is the approved text.

```
Review: flourish 1.1.7 first-run words. flourish is a Canadian budgeting app that shows what's safe to spend until payday. Rules: lowercase flourish, plain words, no dashes, no advice or verdicts, nothing untrue. Reply AGREE, or give exact fixes, with a score out of 100.

App first screen (before any account):
1. Headline: "See what's safe to spend before your next payday."
2. Lead: "flourish takes the bills due before payday, your minimum debt payments, a spending buffer and your savings out of your balance, and shows what's left."
3. Sample card label: "Safe to spend until next payday", tag "Example, sample data" (the demo household's own number)
4. Main button: "Get started"
5. "Already have an account?" + link "Log in"
6. "Try the demo, no account needed"

Sign-up and log-in cards (website and apps):
7. "Continue with Apple" / "Continue with Google"
8. Divider: "or use your email"
9. Error: "That sign-in didn't finish. Try again, or use your email."

Onboarding (the number now comes before bills and debts):
10. Button after pay and next payday: "Show my starting number →"
11. Under the first number, when no bills yet: "Your bills and debt payments aren't in this number yet. You'll add them in the next steps."
12. Bills step lead (after the number): "Add the bills due before payday so they're in your number."
13. Bills step secondary button: "Not now"
14. Debts step final button: "Update my number →"
15. Bank step, beside "Connect My Bank Securely →": "📄 Import a bank statement" / "A PDF or CSV from your bank's website. No bank sign-in needed."
```

## Still to write (2026-11-12): the consent step

Every new account (email, Apple or Google) starts onboarding on a consent step. Before 1.1.7 it was an old welcome: the capital-F lockup, a tagline, "Get Started →", a demo button, a line claiming free, Canada and USA and no credit card, and a consent line naming PIPEDA and US privacy laws. None of that was reviewed for 1.1.7, and the value screen before sign-up now does the welcoming, so all of it is gone.

The step stays because of its consent. The sign-up card's line covers Terms and Privacy only, and an Apple or Google sign-up never sees that card.

| id | where | now |
| --- | --- | --- |
| `onboarding-consent-title` | the step's heading | placeholder |
| `onboarding-consent-line` | the consent sentence, above the Terms and Privacy Policy links | placeholder |
| (button) | the step's button | reuses the approved "Get started" |

Facts the line has to fit: it is the account's agreement to the Terms and Privacy Policy, and its consent to the processing those describe.

The placeholders live in `src/lib/firstRunWords.js` (`FIRST_RUN_PENDING`). `scripts/check-pending-words.mjs` refuses the production web build and every store build while either is left, so merging #136 before these are written makes the production deploy fail rather than ship them.
