# Trial plan first: the words (approved 2026-11-10, ChatGPT 100 and Grok 100)

Amanda's decision (2026-11-10): the usual app-store trial, behind `TRIAL_PLAN_FIRST`. Every line below is in the code word for word (`src/lib/trialWords.js`, `netlify/functions/_lib/trialWords.js`). A line changed later goes back to a `[WORDS: id]` placeholder until approved again: the production web build and every store build refuse to build while one is left (`scripts/check-pending-words.mjs`), and an email holding one is never sent.

Facts in braces are put in by the code.

Rules the lines are built to (cited in `docs/ops/TRIAL-PLAN-FIRST-CONSOLES.md`): Apple's auto-renewable subscriptions guidance ("In the purchase flow for a free trial, clearly indicate how long the free trial lasts and the price billed once the free trial is over"; the amount billed must be the most prominent pricing element), guideline 3.1.2(a) and (c), and Google Play's subscriptions policy ("let your users know how and when a free trial will convert to a paid subscription, how much the paid subscription will cost, and how a user can cancel").

| Id | Where | Facts it carries | Approved line | Limit |
|---|---|---|---|---|
| `trialfirst-free-days` | Plans screen, each plan, above its button, only when the store (or Stripe) says the person is eligible | the trial is 14 days and free | 14 days free | 30 |
| `trialfirst-then` | Same, next line | {price}: the full price after the trial and how often ("$11.99 a month", the store's own price on iPhone and Android), and that it renews automatically until cancelled | Then {price}, renewing until you cancel. | 90 |
| `trialfirst-first-charge` | Same | {date}: the date of the first charge (on an iPhone the day before the trial ends: Apple may charge up to 24 hours early) | First charge: {date} | 60 |
| `trialfirst-cancel-before` | Same | {date}: "Cancel any time before {date} and you won't be charged"; {date} is the day before the trial ends, on every platform (always in time) | Cancel before {date} to avoid the first charge. | 90 |
| `trialfirst-cancel-ios` | Same, iPhone | How to cancel: Settings > your name > Subscriptions | To cancel: open Settings, tap your name, then Subscriptions. | 110 |
| `trialfirst-cancel-android` | Same, Android | How to cancel: Google Play > Payments & subscriptions > Subscriptions | To cancel: open Google Play, tap your profile, then Payments & subscriptions, then Subscriptions. | 110 |
| `trialfirst-cancel-web` | Same, website | How to cancel: Settings > Manage subscription (Stripe's billing portal) | To cancel: in flourish, go to Settings, then Manage subscription. | 110 |
| `trialfirst-no-trial` | Plans screen, a person who is not eligible: instead of the trial lines | {price}: the full price and how often, charged today, renews until cancelled; no trial claim | {price}, charged today. Renews until you cancel. | 90 |
| `trialfirst-button` | The plan's button when the trial applies | Starts the 14 days (the store or Stripe asks to confirm) | Start free trial | 24 |
| `trialfirst-plans-title` | The plans screen that comes first for a new account, after the first safe-to-spend number | Heading | Choose your plan | 40 |
| `trialfirst-plans-lead` | Same, under the heading | Pick a plan to keep using flourish; 14 days free where offered | Pick a plan to keep using flourish. If you qualify for 14 days free, you'll be charged automatically on the first-charge date shown unless you cancel. | 150 |
| `trialfirst-sign-out` | Same, the way out (it cannot be closed) | Sign out | Sign out | 20 |
| `trialfirst-changed` | Website, the server found the trial changed as the button was pressed | Nothing was charged; the plans now show what applies | Nothing was charged. The plans now show what applies to you, so please choose again. | 120 |
| `trialfirst-chip` | During the store or Stripe trial: the chip (apps) and banner (website) | {date}: the date of the first charge | Free trial. First charge {date} | 50 |
| `trialfirst-welcome` | App, first onboarding screen, instead of "Free to start · Canada & USA · No credit card" | No "no card" claim | Made for Canadian households | 60 |
| `trialfirst-landing` | Website landing, instead of "Every feature free for 14 days. Also on iPhone and Android." | 14 days free with a plan; no "no card" claim | Choose a plan to get started. Eligible new subscribers get 14 days free, then the plan renews at the listed price unless cancelled. Also on iPhone and Android. | 159 |
| `trialfirst-get-started` | Website landing, the main button (top and bottom), instead of "Try flourish free for 14 days"; trialfirst-landing sits under it (approved 2026-11-11) | No trial claim before eligibility is known | Get started | 24 |
| `trialfirst-email-subject` | The reminder email (3 days before the first charge, Apple and Google trials only; a website trial gets Stripe's own reminder), subject | {date}: the first charge's date | Your flourish trial: first charge on {date} | 70 |
| `trialfirst-email-lead` | Same, first line | The 14-day free trial ends on {date} | This is your reminder that your 14-day free trial of flourish is ending. | 120 |
| `trialfirst-email-charge` | Same | {amount} and {date}: what is charged and when (the plan's price, plus tax where the store adds it). Dates in Pacific time, the earliest in Canada; on an iPhone the day before the trial ends | On {date}, you'll be charged {amount}, plus any applicable tax, unless you cancel first. | 160 |
| `trialfirst-email-keep` | Same | Nothing to do to keep the plan | To keep your plan, you don't need to do anything. | 100 |
| `trialfirst-email-cancel-ios` | Same, iPhone purchase | Exactly how to cancel: Settings > your name > Subscriptions > flourish, before {date} | To avoid the first charge, cancel at least 24 hours before your trial ends. On your iPhone, open Settings, tap your name, then Subscriptions, then flourish, and tap Cancel Subscription. | 200 |
| `trialfirst-email-cancel-android` | Same, Google Play purchase | Exactly how to cancel: Google Play > Payments & subscriptions > Subscriptions > flourish, before {date} | To cancel, do it before {date}: open Google Play, tap your profile, then Payments & subscriptions, then Subscriptions, then flourish, and tap Cancel subscription. | 200 |
| `trialfirst-email-why` | Same, last line above the footer | Why they got it (they started a free trial); one reminder per trial | You're getting this because you started a free trial. It's the only reminder we'll send for it. | 140 |
| `trialfirst-email-unsubscribed` | The page the unsubscribe link opens | No more trial reminders; the subscription itself is unchanged | Done. You won't get trial reminders from us. Your subscription hasn't changed. | 120 |
| `trialfirst-email-link-bad` | The unsubscribe page, for a link that is wrong or altered | The link doesn't work; nothing changed | This link doesn't work. Nothing has changed. | 80 |
| `trialfirst-email-unsub-failed` | The unsubscribe page, when it could not be saved | Nothing saved; try the link again | We couldn't save that. Please try the link again. | 80 |

## Words still to come (2026-11-13)

Eight lines that are true only while the switch is off. Each follows the switch: today's line while it is off, word for word (`src/lib/trialWords.js` SWITCH_OFF_WORDS, `src/lib/storeOffer.js` STORE_DISCLOSURE), and the line below while it is on. Until Amanda's approved words are pasted in they are placeholders, and the production web build and every store build refuse to build.

| Id | Where | Facts it carries | Approved line | Limit |
|---|---|---|---|---|
| `trialfirst-checkout-done` | Website, the notice on coming back from a Stripe checkout that started the 14 days, instead of "Payment received. Your plan will update when Stripe confirms it, usually within a few seconds." | No payment was taken today; the 14 days free have started; the first charge comes on the first-charge date unless cancelled before it (no date in this line: the app shows it once Stripe confirms); the plan updates when Stripe confirms, usually within seconds | [WORDS: trialfirst-checkout-done] | 170 |
| `trialfirst-disclosure-ios` | iPhone plans screen, under the plans, only when a plan on the screen says "14 days free", instead of "Payment is charged to your Apple Account when you confirm. …" | With 14 days free nothing is charged at confirmation; the first charge goes to the Apple Account on the first-charge date shown, and Apple may take it up to 24 hours before the trial ends; a plan without the 14 days is charged at confirmation; it renews automatically unless cancelled at least 24 hours before the trial or period ends; managed or cancelled in Apple Account settings | [WORDS: trialfirst-disclosure-ios] | 300 |
| `trialfirst-disclosure-android` | Android plans screen, the same place, instead of "Payment is charged through Google Play when you confirm. …" | With 14 days free nothing is charged at confirmation; the first charge goes through Google Play on the first-charge date shown; a plan without the 14 days is charged at confirmation; it renews automatically unless cancelled before the first charge or the renewal date; managed or cancelled in Google Play under Subscriptions | [WORDS: trialfirst-disclosure-android] | 300 |
| `trialfirst-signup-title` | The sign-up card's heading, website and apps, instead of "Create your free account" | This creates an account; no "free" (a new account must then choose a plan) | [WORDS: trialfirst-signup-title] | 40 |
| `trialfirst-demo-meeting` | The demo, under the scripted meeting line, instead of "A scripted preview. Create a free account to run this meeting on your own numbers." | It is a scripted preview on sample data; an account runs the meeting on the person's own numbers; no "free" | [WORDS: trialfirst-demo-meeting] | 110 |
| `trialfirst-demo-coach` | The demo coach, its last line, instead of "That's the coach working on sample data. Create a free account to ask it about your own." | The coach was working on sample data; an account lets the person ask about their own; no "free" | [WORDS: trialfirst-demo-coach] | 110 |
| `trialfirst-demo-coach-button` | The demo coach, the button under that line, instead of "Create free account →" | Creates an account; no "free" | [WORDS: trialfirst-demo-coach-button] | 30 |
| `trialfirst-meeting-locked` | Website, the meeting screen for a signed-in account with no plan, instead of "Start your trial to run the meeting with your coach." | Running the meeting with the coach needs a plan; no trial to "start" is promised (the 14 days apply only if the plans screen says so) | [WORDS: trialfirst-meeting-locked] | 100 |

Not changed, on purpose:
- The website's review line ("If you subscribe, you're charged today in CAD plus tax, … Any trial ends when you subscribe.") never shows while the switch is on: the approved trial lines take its place (`trialfirst-free-days` to `trialfirst-cancel-web`, or `trialfirst-no-trial`).
- The reminder email's lines are the switch's own approved words and go only to an Apple or Google trial. Nothing in them depends on the switch.
