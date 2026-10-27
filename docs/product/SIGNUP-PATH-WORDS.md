# Founding signup and upgrade path: approved words (audit H10 to H14)

Approved word for word on 2026-10-27 (ChatGPT and Grok agreed). The code carries each line exactly as below:
`src/lib/signupUi.js` `SIGNUP_COPY` (rows 1 to 4) and `src/lib/upgradeFlow.js` `UPGRADE_COPY`,
`upgradeTrialLine` and `reviewChargeLine` (rows 5 to 14). `tests/billingUpgradeScreen.test.cjs` (section 6)
fails if a line here and the code differ, or if either has one the other doesn't. Do not reword them in the
code; change them here and in the code together, after approval.

Prices are never typed into these lines: the plan card above each one shows the price from `src/lib/pricing.js`.

## The lines

| # | Id | Approved line | Where it shows |
|---|---|---|---|
| 1 | signup-status-unavailable | `We couldn't check sign-up just now. You can still create your account.` | Sign Up tab, above the email field, beside "Try again". Only after three tries (about 7 seconds) failed to check whether signup is open. |
| 2 | signup-email-error | `Enter a valid email address.` | Under the email field, once the person leaves it or taps Create Account / Log In, while the address is not a full email address. |
| 3 | signup-password-error | `Choose a password of at least 8 characters.` | Under the password field, Sign Up tab only, once the person leaves it or taps Create Account, while it is under 8 characters. |
| 4 | signup-mail-not-sent | `Your account was created, but the email didn't send. Tap "Resend confirmation email" below or email hello@flourishmoney.app.` | The "Check your email" screen after Create Account, only when the confirmation email did not go out (`beta.js` answered `sent: false`). |
| 5 | upgrade-headline | `All of flourish, in one subscription` | The upgrade screen's heading, under "Flourish Plus" and Close (website; also what PR #96's no-plan paywall opens with "See plans"). |
| 6 | upgrade-bullet-1 | `The coach, with no weekly limit` | First line under the headline. |
| 7 | upgrade-bullet-2 | `What-If as often as you like` | Second line. |
| 8 | upgrade-bullet-3 | `More than one bank, all in one place` | Third line. |
| 9 | upgrade-trial-ends | `Your trial ends on <date>.` | Under the headline, only on the trial. `<date>` is the server's trial end (`trial_ends_at`), as "November 9, 2026". |
| 10 | upgrade-continue | `Review my plan` | The button under the plan rows. It opens the review step, not Stripe. |
| 11 | review-heading | `Check your plan` | The review step's heading, above the chosen plan's card. |
| 12 | review-charge-monthly | `If you subscribe, you're charged today in CAD plus tax, then every month until you cancel. You can cancel in Settings → Manage subscription. Any trial ends when you subscribe.` | Under the plan card on the review step, for Monthly. |
| 13 | review-charge-yearly | `If you subscribe, you're charged today in CAD plus tax, then every year until you cancel. You can cancel in Settings → Manage subscription. Any trial ends when you subscribe.` | Same place, for Annual and Founding Annual. |
| 14 | review-confirm | `Go to secure checkout` | The review step's main button; it opens Stripe's checkout. While it waits it shows "Opening checkout…" (existing). |

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
  hello@flourishmoney.app.` Replaced by line 4, because that button is not on the check-email screen.
