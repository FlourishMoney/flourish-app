# Trial plan first: the words (placeholders until both reviewers approve)

Amanda's decision (2026-11-10): the usual app-store trial, behind `TRIAL_PLAN_FIRST`. Every line below is a placeholder in the code (`src/lib/trialWords.js`, `netlify/functions/_lib/trialWords.js`). The production web build and every store build refuse to build while one is left (`scripts/check-pending-words.mjs`), and an email holding one is never sent.

Facts in braces are put in by the code. While a line is a placeholder, the facts follow it in brackets, so the screens can be checked with the real date and price.

Rules the lines are built to (cited in `docs/ops/TRIAL-PLAN-FIRST-CONSOLES.md`): Apple's auto-renewable subscriptions guidance ("In the purchase flow for a free trial, clearly indicate how long the free trial lasts and the price billed once the free trial is over"; the amount billed must be the most prominent pricing element), guideline 3.1.2(a) and (c), and Google Play's subscriptions policy ("let your users know how and when a free trial will convert to a paid subscription, how much the paid subscription will cost, and how a user can cancel").

| Id | Where | Facts it must carry | Line | Limit |
|---|---|---|---|---|
| `trialfirst-free-days` | Plans screen, each plan, above its button, only when the store (or Stripe) says the person is eligible | the trial is 14 days and free | [WORDS: trialfirst-free-days] | 30 |
| `trialfirst-then` | Same, next line | {price}: the full price after the trial and how often ("$11.99 a month", the store's own price on iPhone and Android), and that it renews automatically until cancelled | [WORDS: trialfirst-then] | 90 |
| `trialfirst-first-charge` | Same | {date}: the date of the first charge | [WORDS: trialfirst-first-charge] | 60 |
| `trialfirst-cancel-before` | Same | {date}: "Cancel any time before {date} and you won't be charged" | [WORDS: trialfirst-cancel-before] | 90 |
| `trialfirst-cancel-ios` | Same, iPhone | How to cancel: Settings > your name > Subscriptions | [WORDS: trialfirst-cancel-ios] | 110 |
| `trialfirst-cancel-android` | Same, Android | How to cancel: Google Play > Payments & subscriptions > Subscriptions | [WORDS: trialfirst-cancel-android] | 110 |
| `trialfirst-cancel-web` | Same, website | How to cancel: Settings > Manage subscription (Stripe's billing portal) | [WORDS: trialfirst-cancel-web] | 110 |
| `trialfirst-no-trial` | Plans screen, a person who is not eligible: instead of the trial lines | {price}: the full price and how often, charged today, renews until cancelled; no trial claim | [WORDS: trialfirst-no-trial] | 90 |
| `trialfirst-button` | The plan's button when the trial applies | Starts the 14 days (the store or Stripe asks to confirm) | [WORDS: trialfirst-button] | 24 |
| `trialfirst-plans-title` | The plans screen that comes first for a new account, after the first safe-to-spend number | Heading | [WORDS: trialfirst-plans-title] | 40 |
| `trialfirst-plans-lead` | Same, under the heading | Pick a plan to keep using flourish; 14 days free where offered | [WORDS: trialfirst-plans-lead] | 140 |
| `trialfirst-sign-out` | Same, the way out (it cannot be closed) | Sign out | [WORDS: trialfirst-sign-out] | 20 |
| `trialfirst-changed` | Website, the server found the trial changed as the button was pressed | Nothing was charged; the plans now show what applies | [WORDS: trialfirst-changed] | 120 |
| `trialfirst-chip` | During the store or Stripe trial: the chip (apps) and banner (website) | {date}: the date of the first charge | [WORDS: trialfirst-chip] | 50 |
| `trialfirst-welcome` | App, first onboarding screen, instead of "Free to start · Canada & USA · No credit card" | No "no card" claim | [WORDS: trialfirst-welcome] | 60 |
| `trialfirst-landing` | Website landing, instead of "Every feature free for 14 days. Also on iPhone and Android." | 14 days free with a plan; no "no card" claim | [WORDS: trialfirst-landing] | 90 |
