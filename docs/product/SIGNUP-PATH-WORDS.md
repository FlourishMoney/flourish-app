# Founding signup and upgrade path: words needed (audit H10 to H14, 2026-10-26)

Branch `founding-signup-path`. No new user-facing words were written. Each new line is a [WORDS: …]
placeholder below, to be approved (ChatGPT and Grok) and swapped in before merge.
`tests/billingUpgradeScreen.test.cjs` (section 6) fails if a placeholder in the code is missing from this list,
or if this list names one the code no longer has. When the approved words are swapped in, the placeholder
leaves both.

Prices are never typed into these lines: the plan card right above each one shows the price from
`src/lib/pricing.js`, and the tests forbid hard-coded prices.

**PR #96 (no free plan):** its `tests/noPlanWords.test.cjs` scans the whole app for [WORDS: …] and expects
every placeholder to be in its own list. Swap these placeholders before #96 is rebased onto this branch, or
that test fails.

## Placeholders

The character limit counts spaces. It is what fits at 390 px (the phone width) in the space the line has.

| # | Placeholder, exactly as it ships | Where it shows | What it must say (the facts) | Limit |
|---|---|---|---|---|
| 1 | `[WORDS: signup-status-unavailable]` | Sign Up tab, above the email field, beside a "Try again" button. Only after three tries (about 7 seconds) failed to check whether signup is open. | flourish couldn't check sign-up just now, and the person can try again. It must not ask for an invite or beta code. Create Account still works (the server decides). | 80 |
| 2 | `[WORDS: signup-email-error]` | Under the email field, once the person leaves it, or taps Create Account / Log In, while the address is not a full email address (it needs something@something.something). | The address isn't complete or isn't valid; enter a full email address. Candidate already shipping: "Enter a valid email address." | 45 |
| 3 | `[WORDS: signup-password-error]` | Under the password field on the Sign Up tab only, once the person leaves it or taps Create Account, while the password is under 8 characters. | The password needs at least 8 characters. Candidate already shipping: "Choose a password of at least 8 characters." | 45 |
| 4 | `[WORDS: signup-mail-not-sent]` | The "Check your email" screen right after Create Account, only when the account was created but the confirmation email did not go out (`beta.js` answered `sent: false`). The "We sent a confirmation link…" line is hidden in this case. | The account was created, but the confirmation email didn't send. Tap "Resend confirmation email" (the button's exact label, right below) or email hello@flourishmoney.app. It replaces the old line, which pointed at a "Send it again" button that is not on this screen. | 140 |
| 5 | `[WORDS: upgrade-headline]` | The upgrade screen's heading, under "Flourish Plus" and Close (website only; also what PR #96's no-plan paywall opens with "See plans"). | What a subscription gives the household, in one line. No price, no "free". It must stay true after PR #96 (no free plan after the trial). | 50 |
| 6 | `[WORDS: upgrade-bullet-1]` | First of three lines under the headline. | One thing a subscription includes. Must be true both before and after PR #96. Today, Plus adds (approved list, `src/lib/plusIncludes.js`): the coach with no weekly limit, What-If as often as you like, more than one connected bank, Credit, the coach-run money meeting. After #96 every feature needs a plan once the trial ends. | 60 |
| 7 | `[WORDS: upgrade-bullet-2]` | Second line. | As 6, a different thing. | 60 |
| 8 | `[WORDS: upgrade-bullet-3]` | Third line. | As 6, a different thing. | 60 |
| 9 | `[WORDS: upgrade-trial-ends: <date>]` | Under the headline, only while the household is on the trial. `<date>` is the server's trial end (`trial_ends_at`), shown as "November 9, 2026". | The trial ends on `<date>`. Do not say what happens after it (that changes with PR #96). Must keep a slot for the date. | 60 with the date |
| 10 | `[WORDS: upgrade-continue]` | The button under the plan rows. One plan is always selected (the founding price when it is offered, otherwise Monthly). | Go on with the selected plan. It opens the review step, not Stripe. | 32 |
| 11 | `[WORDS: review-heading]` | The review step's heading, above the chosen plan's card (its name, price and note). | Check the plan before paying. | 30 |
| 12 | `[WORDS: review-charge-monthly]` | Under the plan card on the review step, for Monthly. | Stripe charges the price shown (CAD, plus tax) at checkout, today, then every month until cancelled. Cancel any time: Settings, Manage subscription (Stripe's billing portal). Subscribing during the trial starts the paid plan now: checkout has no trial period, so the trial's remaining days are not added on. No amounts. | 180 |
| 13 | `[WORDS: review-charge-yearly]` | Same place, for Annual and Founding Annual. | As 12, but every year. The founding price's own note ("Founding price … Locked in while you stay subscribed.") is already on the card above, so this line need not repeat it. | 180 |
| 14 | `[WORDS: review-confirm]` | The review step's main button. While it waits it shows "Opening checkout…" (existing). | Go to Stripe's secure checkout to pay. | 32 |

There are 14 placeholders. #9 carries the date (`upgradeTrialLine`); #12 and #13 are `reviewChargeLine` for
monthly and for the two annual plans.

## Reused, word for word (already shipping)

Labels:
- Sign-up card: "Log In", "Sign Up", "Create Account", "Check your email", "Resend confirmation email",
  "Resend in Ns", "Wrong email? Start over", "Back to log in", "Almost there", "Welcome back",
  "Create your free account", "Beta access code" (the field's placeholder, shown only when the server says
  signup is invite-only), "Forgot password?", "Email me a magic link", "← Back", and "Try again" (the bank
  link's retry label).
- Trial countdown: "N days left in your trial" (`trialChip`, the store apps' approved chip) and "Upgrade →".
- Upgrade screen: "Flourish Plus", "Close", the plan rows ("Monthly", "Annual", "Founding Annual", the prices,
  "CAD plus tax", the founding note), "Opening checkout…", "← Back", and the Stripe line under the plans.

Sentences:
- The check-email line "We sent a confirmation link to <address>. Click it to activate your account, then come
  back and log in."

## Gone

- "Have an invite code?" (the link). It is hidden while signup is open (H11). With signup shut, the code field
  shows, as before.
- The phone banner "Trial: N days left". The countdown now uses the approved trial chip's words.
- `Your account was created, but we couldn't send the confirmation email. Tap "Send it again" below, or contact
  hello@flourishmoney.app.` Replaced by #4, because that button is not on the check-email screen.
