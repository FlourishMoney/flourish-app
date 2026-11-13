# Trial-first go-live: the runbook

Written 2026-11-13 on main `bb10c3d`. Nothing in it has been done. It follows the code as it is; where an older doc says something else, this one says so in "Where the older docs differ" at the end.

**The switch (`TRIAL_PLAN_FIRST`) goes on last, and never before the store offers exist.**

## Where things stand (Amanda, 2026-11-13)
- 1.1.6 is live in both stores.
- Migration 0046 is applied in production and verified.
- The founding annual plan gets the same free 14 days as monthly and annual, on all three platforms.
- Play `flourish_plus` has base plans `monthly`, `annual` and `founding`, all active, Canada, with no offers.
- `TRIAL_PLAN_FIRST` is off.

## Why this order
1. **A store's 14 days are given by the store, not by our switch.** The moment an Apple introductory offer or a Play offer is active, the store applies it.
2. **The website does not need the stores.** Its 14 days are Stripe's, started by our own checkout the moment the switch is on.
3. **Android 1.1.6 buys what its screen showed.** With the switch off it buys the base plan by name, so it is charged when confirmed, as its screen says, even after the Play offer exists.
4. **An iPhone cannot decline Apple's offer.** From the minute Apple's offer starts until the switch is live, an iPhone plans screen still says "Payment is charged to your Apple Account when you confirm" while Apple gives 14 days free and says so on its own purchase sheet. That household is charged 14 days later than our screen said, never earlier. It still gets the reminder email 3 days before the trial ends.
5. **So the gap in point 4 cannot be removed with 1.1.6 in the store. It can only be kept to minutes:** steps 5 to 7 are done in one sitting, Play first, Apple second, the switch straight after.
6. **The switch has two parts.** `TRIAL_PLAN_FIRST` makes every plans screen follow the stores from the moment its deploy is published, which closes the gap in point 4. `TRIAL_PLAN_FIRST_SINCE` is the time from which a new account must choose a plan. Step 7 sets that time 30 minutes ahead, so the phones can be checked in step 8 before anyone is held at the plans.
7. **The other order is worse.** With the switch on and no store offer, every new household in the apps is held at "Choose your plan" with no free days: each plan says "charged today", and it is. The screen is true, but they pay on day one while the website gives 14 days free.

## The steps

### Before the day
1. **Merge and deploy this pull request.** Who: Amanda says go, CC merges.
   - What it changes: the "Free trial. First charge {date}" line now takes its date from where the trial was bought, not the device it is read on. Website at once; the store apps at their next build.
   - Check after: the production deploy id, and the gate green on main.
   - Undo: publish the previous deploy in Netlify.
2. **Confirm the store builds.** Who: Amanda. Change nothing.
   - Play Console > Production: the live release is **28 (1.1.6)**, not 27. Build 27 does not have the Terms section 7 change (#133).
   - App Store Connect: the live build is **526912**, not 526911, for the same reason.
   - If either store shows the older build: stop here and tell CC. That app's Terms would keep the old section 7 after the switch.
3. **Merge the words pull request.** Who: Amanda pastes the approved words for its eight placeholders (`docs/product/TRIAL-PLAN-FIRST-WORDS.md`, "Words still to come"), then says go; CC merges.
   - It makes eight lines follow the switch, and makes the `index.html` descriptions follow it at build time: "Every feature free for 14 days." becomes "Eligible new subscribers get 14 days free, then the plan renews at the listed price unless cancelled." in the deploy that turns the switch on.
   - It cannot go out before the words are in: the production build refuses a placeholder.
   - Check after: the production deploy id; the page source still ends "Every feature free for 14 days." twice (the switch is off).
4. **Stripe, live mode.** Who: Amanda. Can be done days ahead: it does nothing while the switch is off.
   - Developers > Webhooks > the production endpoint > add one event: `customer.subscription.created`. Keep every event it has.
   - Settings > Billing > Subscriptions and emails > Manage free trial messaging: Stripe's trial reminder stays **on**.
   - Settings > Billing > Customer portal: cancelling stays allowed.
   - Check after: the endpoint's event list shows `customer.subscription.created`.
   - Undo: remove the event.

### On the day, in one sitting
5. **Play Console: three offers.** Who: Amanda. The exact fields are in "The store offers" below.
   - Check after: each offer says Active. RevenueCat reads the offers from Play; if its Products page lists each `free-14-*` offer, good. The real proof is step 8.
   - **Cannot be undone:** an offer ID is permanent and cannot be reused. An active offer's phases and eligibility cannot be edited: deactivate it and create a new one under a new ID.
   - In effect at once: nothing changes for Android 1.1.6 (point 3). An Android 1.1.5 or older app starts giving the 14 days while its screen says nothing about them.
6. **App Store Connect: three introductory offers.** Who: Amanda. The exact fields are in "The store offers" below.
   - Check after: each of the three subscriptions shows the offer, Free, 2 Weeks, Canada, starting today, no end date.
   - **Cannot be undone:** an introductory offer cannot be edited once saved. It can only be ended (set an end date) or deleted and created again.
   - In effect at once: every eligible iPhone buyer gets the 14 days. The gap in "Why this order", point 4, is open from now until step 7 is published.
7. **Netlify: the switch.** Who: Amanda. Production only.
   - `TRIAL_PLAN_FIRST` = `true`
   - `TRIAL_PLAN_FIRST_SINCE` = **30 minutes ahead** of the clock as you type it, as a full time with its zone, for example `2026-11-20T15:30:00Z`. A date alone, or a time with no zone, leaves the switch off. Never a time already past: an account opened between that time and the deploy was told it had 14 days free with no card, and would be held at the plans instead.
   - Then **Deploys > Trigger deploy > Deploy site**, and wait for "Published". A setting does nothing until a deploy.
   - Check after (CC, read only): `https://flourishmoney.app/api/trial-plan-first` answers 200 with `"on": true` and the time. Before the deploy it answers 404.
   - From "Published": the website's words change, the website gives Stripe's 14 days, and every plans screen follows its store. From the time you set: a new account must choose a plan.
   - Undo: "Switching it off again" below. **Cannot be undone:** an account opened after that time has no account trial, and a store trial once started cannot be taken back.
8. **Check what people see, before the time set in step 7 arrives.** Who: CC reads the website; Amanda checks one iPhone and one Android phone on 1.1.6. Each needs a store account that has never subscribed and a flourish account with no plan, opening the plans from Settings. She does not need to finish a purchase.
   - Website, signed out: the main button says "Get started", with "Choose a plan to get started. Eligible new subscribers get 14 days free, then the plan renews at the listed price unless cancelled. Also on iPhone and Android." under it.
   - Terms: "7. Plans and billing", and "Last updated" is the day of the switch.
   - Each phone's plans screen: each plan says "14 days free", "First charge: {date}" and "Cancel before {date} to avoid the first charge.", and the button says "Start free trial". The store's own sheet shows 2 weeks free.
   - If a phone's plans say "charged today" instead: that store is not giving its offer to that account yet. Nobody is mis-told in that state, but a new household would pay on day one. **Before the time arrives,** set `TRIAL_PLAN_FIRST_SINCE` an hour later and Trigger deploy again, then sort out step 5 or 6. Moving the time later is safe while it is still ahead.
   - After the time: a new test account meets "Choose your plan" after its first number, and the only ways out are a plan, "Restore purchases" (apps) and "Sign out".
   - A page that was already open before the switch keeps its old words until it is reloaded.
9. **Check the page's descriptions.** Who: CC, read only. Nothing to merge: step 7's deploy built them.
   - Check after: the source of `https://flourishmoney.app/` carries "Eligible new subscribers get 14 days free, then the plan renews at the listed price unless cancelled." twice, and "Every feature free for 14 days." not at all.
   - If it still shows the old sentence: the two variables are not visible to builds. In Netlify, set each variable's scope to include Builds, then Trigger deploy again.
10. **The places that still say "no card" or the old trial.** Who: Amanda. The list is in "Every place that names the trial or a card" below.

### After
11. **Watch the first trials.** Who: CC reads; Amanda sees Stripe and RevenueCat.
    - Day 0: a website trial shows as "Trialing" in Stripe; a store trial shows as a trial in RevenueCat.
    - Day 7: Stripe sends its own reminder for a website trial.
    - Day 11: our reminder email goes to an Apple or Google trial (3 days before the trial ends).
    - Day 13 to 14: the first charges. Apple may charge up to 24 hours before the trial ends.

## The store offers
No offer ID and no tag is read by the code. The code reads only the product IDs and base plan IDs below, whether a product carries a free offer of exactly 2 weeks, and the store's own answer on who is eligible. No offer needs the `rc-ignore-offer` tag, and none should have it: RevenueCat would then leave that offer out of what the app shows and buys.

### App Store Connect
Apps > Flourish: Money, Handled > Monetization > Subscriptions. The same five values on each of the three subscriptions:
- `app.flourishmoney.plus.monthly` (group "Flourish")
- `app.flourishmoney.plus.annual` (group "Flourish")
- `app.flourishmoney.founding.annual` (group "Flourish Founding")

For each: Subscription Prices > **+** > Create Introductory Offer.
1. Countries or Regions: `Canada`
2. Start Date: today
3. End Date: `No End Date`
4. Type: `Free`
5. Duration: `2 Weeks`

Apple gives one introductory offer per person per subscription group. Founding is a group of its own, so one person can have 14 days in "Flourish" and, later, 14 more in "Flourish Founding".

### Google Play Console
Monetize with Play > Products > Subscriptions > `flourish_plus`. One offer on each base plan:

| Base plan | Offer ID |
|---|---|
| `monthly` | `free-14-monthly` |
| `annual` | `free-14-annual` |
| `founding` | `free-14-founding` |

For each: Add offer on that base plan.
1. Offer ID: from the table
2. Eligibility: `New customer acquisition`
3. Under it: `Never had this subscription`
4. Phase: `Free trial`
5. Phase duration: `2 weeks`
6. Other phases: none
7. Tags: none
8. Countries or regions: `Canada`
9. Then: Activate

All three are base plans of the one subscription, so Google gives a person the 14 days once across all three.

### RevenueCat
Nothing to create. After step 5, Products shows each Android product's `free-14-*` offer.

## What each household sees
The words are the app's own, as it shows them. "Store card" is one plan on the iPhone or Android plans screen.

### The switch off (today)
| Household | Website | iPhone and Android (1.1.6) |
|---|---|---|
| Brand new | Landing: "Try flourish free for 14 days", "Every feature free for 14 days. Also on iPhone and Android." Then the account trial, no card. | First screen: "Free to start · Canada & USA · No credit card". Then the account trial: "14 days left in your trial". |
| Inside its 14 days | "{n} days left in your trial". Plans only when asked: "Your trial ends on {date}.", and at review "If you subscribe, you're charged today in CAD plus tax, then every month until you cancel. You can cancel in Settings → Manage subscription. Any trial ends when you subscribe." | "{n} days left in your trial". Plans only when asked: "Subscribe to flourish", each card "Subscribe for $11.99 a month", then "Payment is charged to your Apple Account when you confirm. …" (Android: "Payment is charged through Google Play when you confirm. …"). |
| Trial ended | "Your free trial has ended", then the free plan's limits. Plans as above, without the trial line. | "Your free trial has ended", then the free plan's limits. Plans as above. |
| Offered the founding price | "Founding Annual $79.99 a year", "Founding price for the first 50 households who subscribe. Locked in while you stay subscribed." | "Founding annual", "For the first 50 households who subscribe. Stays the same while you stay subscribed.", and in its trial "Not now, keep my 14-day trial". |
| Bought through a store | Full access. Nothing to buy. | Settings: "Your subscription is through the App Store." or "Your subscription is through Google Play." |

### The switch on
| Household | Website | iPhone and Android (1.1.6) |
|---|---|---|
| Brand new (opened after the switch's time) | Landing: "Get started", "Choose a plan to get started. Eligible new subscribers get 14 days free, then the plan renews at the listed price unless cancelled. Also on iPhone and Android." After the first number: "Choose your plan", "Pick a plan to keep using flourish. If you qualify for 14 days free, you'll be charged automatically on the first-charge date shown unless you cancel." Each plan: "14 days free", "Then $11.99 a month, renewing until you cancel.", "First charge: {date}", "Cancel before {date} to avoid the first charge.", "To cancel: in flourish, go to Settings, then Manage subscription." Buttons: "Review my plan", then "Start free trial" (Stripe's checkout takes the card). Only way out: "Sign out". | First screen: "Made for Canadian households". After the first number the same "Choose your plan" screen. Each store card has the same four lines, then "To cancel: open Settings, tap your name, then Subscriptions." (Android: "To cancel: open Google Play, tap your profile, then Payments & subscriptions, then Subscriptions.") Button: "Start free trial". Ways out: "Restore purchases", "Sign out". On an iPhone the first-charge date is a day earlier than on Android. |
| The same, when the store or Stripe says not eligible | Each plan: "$11.99 a month, charged today. Renews until you cancel." Buttons: "Review my plan", then "Go to secure checkout". | Each card: "$11.99 a month, charged today. Renews until you cancel." Button: "Subscribe for $11.99 a month". |
| Inside its 14 days (opened before the switch's time) | Unchanged: "{n} days left in your trial". Plans only when asked; they now carry the 14-days lines, counted from the day it subscribes. | The same. |
| Trial ended (opened before) | The new plans screen opens once and can be closed. Otherwise unchanged: "Your free trial has ended" and the free plan. | The same. |
| Offered the founding price | The founding plan comes first, with its own line and the same 14-days lines: "Then $79.99 a year, renewing until you cancel." | The same on the "Founding annual" card. |
| Bought through a store, or pays on the website | Nothing changes. During a store or Stripe trial: "Free trial. First charge {date}". | The same. |

## What can go wrong, and what happens
Each has tests in `tests/trialGoLiveFailures.test.cjs`.
1. **The switch is on and a store's offer does not exist.** No plan claims a trial. Each says "{price}, charged today. Renews until you cancel." and the store charges today. Nobody is mis-told. A new household must pay on day one or sign out.
2. **A store's offer exists and the switch is off.** Android 1.1.6 buys the base plan: charged when confirmed, as its screen says. An iPhone gets Apple's 14 days while our screen says "Payment is charged to your Apple Account when you confirm": charged 14 days later than our screen said. Apple's sheet states the trial, and our reminder email still goes 3 days before the trial ends.
3. **A status read fails as the trial ends.** The server answers "try again" (503), never "not paid". The app keeps the household's last "paid" answer until the trial's own end; after that, with no answer, it does not put up the plans that cannot be closed and sells nothing. Until a read works the household has the free plan's limits. The app asks again after 5, 20 and 60 seconds and when the network returns.
4. **A trial starts on the website, then a store app is opened.** The app is told the household already has its plan and sells nothing. The other way round, the website gives no second 14 days. The "Free trial. First charge {date}" line is right on the website once this pull request is deployed. **The 1.1.6 apps keep the old rule until their next build:** an iPhone shows a website trial's charge a day early (harmless), and an Android phone shows an iPhone trial's charge on the trial's end, a day after Apple may charge. That last one needs one account on both an iPhone and an Android phone.

**The worst of the four for a household is the first.** It is the only one where a household pays money it would not otherwise have paid: day one, no free days, while the website is giving 14. That is why the switch goes on last.

## Apps older than 1.1.6
There is no minimum-version gate, so some people will still be on them.
- They know nothing of the switch, and never show the "Free trial. First charge {date}" line. Their plans screen never states the 14 days, before or after it: it says the payment is charged when confirmed, and the store gives the 14 days anyway (Apple always; Google because an older Android app buys the default option).
- A new account in one of them is held to the free plan's limits by the server, while the app still shows the old trial chip.
- Nothing in this runbook changes that. It is why the switch waits until 1.1.6 has been the store version for a few days.

## Switching it off again
1. Netlify: delete `TRIAL_PLAN_FIRST`, then Trigger deploy. New accounts get the no-card account trial again.
2. Straight after: end the store offers. App Store Connect: set each introductory offer's end date to today. Play Console: deactivate each `free-14-*` offer.
3. Between 1 and 2 the gap in "Why this order", point 4, is open again on iPhone. Keep it to minutes.
4. What keeps going: trials already running are charged on their day 14 as agreed, and their reminders are still sent.
5. Step 1's deploy also puts the `index.html` descriptions back. Check the page source.

## Every place that names the trial or a card
Searched 2026-11-13: `src/`, `index.html`, `public/`, `content/`, `netlify/functions` (every email), `ios/`, `android/`, `docs/`, and `~/Documents/Flourish` (store copy, reels, captions). Line numbers are main's on that day. Nothing here was changed.

### A. "No card"
| Where | What it says | On the day |
|---|---|---|
| The 1.1.6 store apps, first screen (not on main since #136) | "Free to start · Canada & USA · No credit card" | Follows the switch: "Made for Canadian households" |
| Reel paycheque, end card and captions (`~/Documents/Flourish/01 Marketing/Reel paycheque (2026-11-08)/REEL-PAYCHEQUE-APPROVED-2026-11-08.md` lines 11, 20, 30, 39, 42) | "No card needed to start. Then a paid plan." | Built, not posted. Untrue once the switch is on: do not post as it is. The words are also inside the end-card image and the video files |
| `src/App.jsx:16659`, the sign-up card | "Create your free account" | Amanda's call: the account is free to make, but a new one must then choose a plan |
| `src/App.jsx:10669` and `13678`, the demo | "Create a free account to run this meeting on your own numbers." / "Create a free account to ask it about your own." | The same call |
| The website, the app's other screens, every email, `public/`, `content/` | no "no card" wording found | nothing to do |

### B. The 14-day trial, by name
| Where | What it says | On the day |
|---|---|---|
| `index.html:21` and `:22` (meta description, og:description) | "… Every feature free for 14 days." | Follows the switch at build time; checked in runbook step 9 |
| `src/App.jsx:15869`, landing button, top and bottom | "Try flourish free for 14 days" | Follows the switch: "Get started" |
| `src/App.jsx:16513`, landing | "Every feature free for 14 days. Also on iPhone and Android." | Follows the switch: `trialfirst-landing` |
| `src/App.jsx:14206`, Terms section 7, website | "Core features are available at no charge with a 14-day trial of premium features." | Follows the switch |
| `src/lib/freePlan.js:66`, Terms section 7, a store app that sells | "A new account has every feature for its first 14 days, at no charge." | Follows the switch (builds 526912 and 28 only) |
| `src/lib/freePlan.js:56`, Terms section 7, a store app that sells nothing | "There is nothing to buy in the iOS and Android apps. A new account has every feature for its first 14 days." | Stays: only 1.0.x apps |
| `src/lib/freePlan.js:47`, the chip (apps) and countdown (website) | "{n} days left in your trial" | Stays: true for an account opened before the switch |
| `src/lib/freePlan.js:32` and `src/App.jsx:20238` | "Your free trial has ended" | Stays: shown only to an account that had the account trial |
| `src/App.jsx:20159`, website sidebar | "Trial ended 🔒", "Trial ends today ⚠️", "{n} days left" | Stays, the same accounts |
| `src/lib/upgradeFlow.js:64`, website plans | "Your trial ends on {date}." | Stays, the same accounts |
| `src/lib/pendingWords.js:18`, `:19`, `:22`, store founding plans | "Not now, keep my 14-day trial", "Keep your trial for now?", "Keep my trial" | Stays: shown only inside the account trial |
| `src/App.jsx:10673`, the meeting, website | "Start your trial to run the meeting with your coach." | Check: a new account has no trial to start |
| `src/App.jsx:14313` and `:14317`, PremiumGate | "Start 14 days free →", "14 days free. Cancel any time." | Only while billing is off: not seen in production |
| `src/App.jsx:6910`, Home | "Try Free →" | Only while billing is off: not seen in production |
| `src/lib/creatorWords.js:15`, Settings (creator program) | "… add their code within 14 days of sign-up, before your first payment. …" | A different 14 days. Only while the creator program is on |
| `src/lib/trialWords.js:16` to `:35`, the plans screens, chip and landing | "14 days free", "Start free trial", "Free trial. First charge {date}", "Pick a plan to keep using flourish. If you qualify for 14 days free, …", "Choose a plan to get started. Eligible new subscribers get 14 days free, …" | The switch's own words: shown only while it is on |
| `src/lib/freePlan.js:94` to `:101`, Terms section 7 while on | "Eligible new subscribers get 14 days free. Apple, Google or Stripe decides who is eligible, and the website needs a card to start." … "An account opened before {date} keeps its 14-day account trial to its end, …" | The switch's own words |
| `netlify/functions/_lib/trialWords.js:12` to `:19`, the reminder email and its unsubscribe page | "Your flourish trial: first charge on {date}", "This is your reminder that your 14-day free trial of flourish is ending.", "You're getting this because you started a free trial. …" | Sent only for an Apple or Google trial |
| Reel paycheque (the same file, lines 19, 20, 30, 38, 42) | "Try flourish free for 14 days" (spoken, end card, Instagram, Facebook and TikTok captions) | With section A: not as it is |
| 1.1.7 App Review notes, draft (`~/Documents/Flourish/fable-2026-11-13/store-pack-1.1.7/app-review-notes.md:38`) | "There is no free trial or introductory offer on the subscriptions. Every new account has every feature for its first 14 days, …" | Untrue once the offers exist: rewrite before 1.1.7 is submitted |
| Store screenshots, 1.1.1 set (`~/Documents/Flourish/03 App Store screenshots/1.1.1 (Oct 2026)/raw*/text.json`) | "14 days left in your trial" on the captured screens | Check the live screenshots in both stores |

### C. A card, or when the charge is made
| Where | What it says | On the day |
|---|---|---|
| `src/lib/storeOffer.js:29`, under the iPhone plans | "Payment is charged to your Apple Account when you confirm. Your subscription renews automatically unless you cancel at least 24 hours before the current period ends. …" | **Stays on the screen with the switch on, under a plan that says "14 days free" and "First charge: {date}".** Two statements on one screen: for the words pass |
| `src/lib/storeOffer.js:30`, under the Android plans | "Payment is charged through Google Play when you confirm. …" | The same |
| `src/lib/freePlan.js:71`, Terms section 7, a store app that sells | "Payment is charged to your Apple or Google account when you confirm." | Follows the switch |
| `src/App.jsx:14206`, Terms section 7, website | "Subscription fees are billed in advance on a monthly or annual basis." | Follows the switch |
| `src/lib/upgradeFlow.js:69` and `:70`, website review step | "If you subscribe, you're charged today in CAD plus tax, then every month until you cancel. … Any trial ends when you subscribe." | Follows the switch: the trial lines take its place |
| `src/lib/trialWords.js:17` to `:23`, `:30` | "Then {price}, renewing until you cancel.", "First charge: {date}", "Cancel before {date} to avoid the first charge.", "{price}, charged today. Renews until you cancel.", "Nothing was charged. The plans now show what applies to you, so please choose again." | The switch's own words |
| `src/lib/freePlan.js:96` and `:100` | "Unless you cancel before the first charge, you will be charged automatically. Apple may charge up to 24 hours before the trial ends." "Cancel before the first charge and you pay nothing; …" | The switch's own words |
| `netlify/functions/_lib/trialWords.js:14` to `:17` | "On {date}, you'll be charged {amount}, plus any applicable tax, unless you cancel first.", "To keep your plan, you don't need to do anything.", "To avoid the first charge, cancel at least 24 hours before your trial ends. …" | The reminder email |
| `src/App.jsx:13002` and `:14446`, website | "Change your card or cancel." / "Change your card or cancel in Stripe's billing portal." | Stays: true |
| `src/App.jsx:14522`, website plans | "Payment is handled by Stripe. Your plan changes once Stripe confirms the payment." | Stays: during a trial the plan also changes with no payment taken |
| `src/lib/billingVisibility.js:127`, back from Stripe | "Payment received. Your plan will update when Stripe confirms it, usually within a few seconds." | **Shown after a trial checkout too, when no payment was received.** For the words pass |
| `src/lib/billingVisibility.js:129` | "Checkout cancelled. Nothing was charged." | Stays: true |
| `src/App.jsx:13919`, Privacy Policy, website | "If you subscribe on flourishmoney.app, Stripe processes your payment. Stripe collects your card details and billing address to charge you and to calculate sales tax." | Stays: true |
| `src/lib/pendingWords.js:25` and `:26`, Settings | "… To avoid being charged during a plan change, cancel your current plan in your Apple Account settings first. …" | Stays |
| `src/lib/storeOffer.js:129` and `:132`, after a store purchase | "… the store took this purchase as well. … You can ask the store that charged you for a refund of this purchase …" / "The store didn't complete the purchase. If you see a charge for it, tap Restore purchases." | Stays |
| `src/App.jsx:14726`, the old paywall | "Billed yearly" | Only while billing is off |

### D. The store listings
- No listing text is in the repo. `~/Documents/Flourish` holds a launch kit whose promotional text has no trial or card words.
- The live description, promotional text and What's New in App Store Connect and Play Console cannot be read from here. Amanda reads them on the day.
- `src/whatsNew.json` (1.1.6) and the 1.1.7 What's New draft have no trial or card words.

## Where the older docs differ
- `docs/ops/TRIAL-PLAN-FIRST-CONSOLES.md` and a comment in `netlify/functions/_lib/planRules.js` say the switch is "an environment change, not a deploy". It needs a deploy: `docs/ops/BILLING-DAY-OCT-26.md` section 4 has Netlify's own words.
- `netlify.toml` says the reminder sweep "does nothing unless TRIAL_PLAN_FIRST is on". It runs with the switch on or off, on purpose, so a store trial started in the gap still gets its reminder.
- `docs/product/TRIAL-PLAN-FIRST-NO-CARD.md` and `docs/product/TRIAL-PLAN-FIRST-WORDS.md` list the first onboarding line "Free to start · Canada & USA · No credit card", switched to "Made for Canadian households". That line is no longer on main: #136 (the 1.1.7 first run) removed it. It is still in the 1.1.6 store apps, where it follows the switch.
- `docs/ops/TRIAL-PLAN-FIRST-CONSOLES.md` puts the migration and the store release first. Both are done.
- `docs/ops/TRIAL-PLAN-FIRST-CONSOLES.md` sets `TRIAL_PLAN_FIRST_SINCE` to "the moment you switch it on". By the time the deploy is published that moment is past, and an account opened in between loses the trial it was just told it had. This runbook sets it 30 minutes ahead (step 7).
- The same doc puts the Stripe event before the store offers, as this runbook does. The event does nothing while the switch is off, and doing it ahead keeps the sitting short.
