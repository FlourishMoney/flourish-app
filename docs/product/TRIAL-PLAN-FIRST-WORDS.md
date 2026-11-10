# Trial plan first: the words (placeholders until both reviewers approve)

Amanda's decision (2026-11-10): the usual app-store trial, behind `TRIAL_PLAN_FIRST`. Every line below is a placeholder in the code (`src/lib/trialWords.js`, `netlify/functions/_lib/trialWords.js`). The production web build and every store build refuse to build while one is left (`scripts/check-pending-words.mjs`), and an email holding one is never sent.

Facts in braces are put in by the code. While a line is a placeholder, the facts follow it in brackets, so the screens can be checked with the real date and price.

Rules the lines are built to (cited in `docs/ops/TRIAL-PLAN-FIRST-CONSOLES.md`): Apple's auto-renewable subscriptions guidance ("In the purchase flow for a free trial, clearly indicate how long the free trial lasts and the price billed once the free trial is over"; the amount billed must be the most prominent pricing element), guideline 3.1.2(a) and (c), and Google Play's subscriptions policy ("let your users know how and when a free trial will convert to a paid subscription, how much the paid subscription will cost, and how a user can cancel").

| Id | Where | Facts it must carry | Line | Limit |
|---|---|---|---|---|
| `trialfirst-free-days` | Plans screen, each plan, above its button, only when the store (or Stripe) says the person is eligible | the trial is 14 days and free | [WORDS: trialfirst-free-days] | 30 |
| `trialfirst-then` | Same, next line | {price}: the full price after the trial and how often ("$11.99 a month", the store's own price on iPhone and Android), and that it renews automatically until cancelled | [WORDS: trialfirst-then] | 90 |
| `trialfirst-first-charge` | Same | {date}: the date of the first charge (on an iPhone the day before the trial ends: Apple may charge up to 24 hours early) | [WORDS: trialfirst-first-charge] | 60 |
| `trialfirst-cancel-before` | Same | {date}: "Cancel any time before {date} and you won't be charged"; {date} is the day before the trial ends, on every platform (always in time) | [WORDS: trialfirst-cancel-before] | 90 |
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
| `trialfirst-email-subject` | The reminder email (3 days before the first charge), subject | {date}: the first charge's date | [WORDS: trialfirst-email-subject] | 70 |
| `trialfirst-email-lead` | Same, first line | The 14-day free trial ends on {date} | [WORDS: trialfirst-email-lead] | 120 |
| `trialfirst-email-charge` | Same | {amount} and {date}: what is charged and when (the website: Stripe's own figure with tax; the stores: the plan's price, plus tax where the store adds it). Dates in Pacific time, the earliest in Canada; on an iPhone the day before the trial ends | [WORDS: trialfirst-email-charge] | 160 |
| `trialfirst-email-keep` | Same | Nothing to do to keep the plan | [WORDS: trialfirst-email-keep] | 100 |
| `trialfirst-email-cancel-ios` | Same, iPhone purchase | Exactly how to cancel: Settings > your name > Subscriptions > flourish, before {date} | [WORDS: trialfirst-email-cancel-ios] | 200 |
| `trialfirst-email-cancel-android` | Same, Google Play purchase | Exactly how to cancel: Google Play > Payments & subscriptions > Subscriptions > flourish, before {date} | [WORDS: trialfirst-email-cancel-android] | 200 |
| `trialfirst-email-cancel-web` | Same, website purchase | Exactly how to cancel: flourish on the website > Settings > Manage subscription, before {date} | [WORDS: trialfirst-email-cancel-web] | 200 |
| `trialfirst-email-why` | Same, last line above the footer | Why they got it (they started a free trial); one reminder per trial | [WORDS: trialfirst-email-why] | 140 |
| `trialfirst-email-unsubscribed` | The page the unsubscribe link opens | No more trial reminders; the subscription itself is unchanged | [WORDS: trialfirst-email-unsubscribed] | 120 |
| `trialfirst-email-link-bad` | The unsubscribe page, for a link that is wrong or altered | The link doesn't work; nothing changed | [WORDS: trialfirst-email-link-bad] | 80 |
| `trialfirst-email-unsub-failed` | The unsubscribe page, when it could not be saved | Nothing saved; try the link again | [WORDS: trialfirst-email-unsub-failed] | 80 |
