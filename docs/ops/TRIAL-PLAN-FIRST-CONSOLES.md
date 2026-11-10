# Trial plan first: what Amanda sets in the consoles (the 14-day free trial on every main-plan product)

Prices stay exactly as they are. Nothing here has been done; no console was opened. Do these **on the day the switch goes on, in the order below**. A store offer is live for every installed app the moment it starts (see "Why the order matters"). Menu names are as App Store Connect, Play Console, RevenueCat and Stripe show them; if a label has moved, the field and value are what matter.

## The rules the screens are built to
- **Apple, App Review Guideline 3.1.2(a):** "Auto-renewable subscription apps may offer a free trial period to customers by providing the relevant information set forth in App Store Connect." And: "Apps that attempt to scam users will be removed from the App Store. This includes apps that attempt to trick users into purchasing a subscription under false pretenses or engage in bait-and-switch and scam practices".
- **Apple 3.1.2(c):** "Before asking a customer to subscribe, you should clearly describe what the user will get for the price."
- **Apple's auto-renewable subscriptions page** (developer.apple.com/app-store/subscriptions): "In the purchase flow for a free trial, clearly indicate how long the free trial lasts and the price billed once the free trial is over." And: "the amount that will be billed must be the most prominent pricing element in the layout."
- **Google Play, Subscriptions policy** (support.google.com/googleplay/android-developer/answer/9900533): "let your users know how and when a free trial will convert to a paid subscription, how much the paid subscription will cost, and how a user can cancel if they do not want to convert to a paid subscription." Its example violations include offers that don't "clearly explain how long the free trial or introductory pricing will last" or "that the user will be automatically enrolled in a paid subscription at the end of the offer period."
- **Built to them:** above each plan's button (`src/lib/trialPlanFirst.js` trialDisclosure, placeholders in `docs/product/TRIAL-PLAN-FIRST-WORDS.md`):
  1. 14 days free;
  2. then the full price and how often;
  3. the date of the first charge;
  4. cancel before that date and you won't be charged;
  5. how to cancel on that platform.
  
  The trial is claimed only when the store (RevenueCat), or Stripe's history for the website, says the person is eligible. The approved store disclosure, Terms of Use, Privacy and Restore stay on the screen.
- **Prominence:** each plan card's own price ("$11.99 a month", 18 px, the heaviest weight on the card) stays the largest pricing element. The trial lines sit under it at 13–14 px. The reviewers should still check the approved lines and their emphasis together.

## Why the order matters
- **A store's free trial is applied by the store, not by our flag.** The moment an introductory offer (Apple) or a free-trial offer (Play) is active, Apple gives it to every eligible new subscriber. That includes subscribers in today's 1.1.x builds, whose plans screen says "Subscribe for $11.99 a month" and states no trial. Apple's own purchase sheet does show the trial.
- **1.1.6 on Android** buys the base plan by name whenever its card made no trial claim, so it never applies an offer it didn't show. Older Android builds buy the default option, which would be the trial.
- **So:**
  1. Create the store offers with a start date of the go-live day.
  2. Turn the switch on the same day.
  3. Do both only once 1.1.6 is the version in both stores.

## Order on the day
1. **Supabase (Amanda):** run `supabase/migrations/0046_trial_plan_first.sql`, then its read-only check.
2. **Both stores:** 1.1.6 approved and released (Amanda's click).
3. **Words:** all 27 lines approved and in, PR merged, website deployed. The production build refuses while any placeholder is left.
4. **Stripe:** the steps below.
5. **App Store Connect and Play Console:** the offers below, each starting today.
6. **Netlify (Amanda), Production only:**
   - `TRIAL_PLAN_FIRST=true`
   - `TRIAL_PLAN_FIRST_SINCE` = the time it goes on, ISO 8601 (for example `2026-11-20T15:00:00Z`).
   
   Accounts whose own trial started before that time keep the no-card account trial to its end. Without a valid time, nothing changes. The store builds read the switch from the server: no upload.
7. **Website, social and store listings:** the list in `docs/product/TRIAL-PLAN-FIRST-NO-CARD.md`.

## App Store Connect
Apps > Flourish: Money, Handled > Monetization > Subscriptions.
- **Group "Flourish":**
  - `app.flourishmoney.plus.monthly`
  - `app.flourishmoney.plus.annual`
- **Group "Flourish Founding":**
  - `app.flourishmoney.founding.annual`

For each of the three subscriptions:
1. Open the subscription > Subscription Prices > the **+** beside it > **Create Introductory Offer**.
2. Countries or Regions: **Canada** only (the products are Canada only).
3. Start Date: **the go-live day**. End Date: **No End Date**.
4. Type: **Free**. Duration: **2 Weeks**.
5. Confirm and save. Nothing else changes: the price, Family Sharing (off) and the review screenshot stay as they are.

**Eligibility (Apple's, not ours):** one introductory offer per person per subscription group. Because founding is its own group, someone who used the trial in "Flourish" can get a second 14 days in "Flourish Founding". To stop that, give the founding annual no introductory offer. That breaks the brief's "founding keeps its own price with the same 14-day trial", so it's Amanda's call.

**Cannot be changed later:**
- An introductory offer's type, duration and countries can't be edited once saved. End it (set an end date) or delete it before it starts, then create a new one.
- The Product IDs and groups are already permanent.

**Already there:** no introductory offer or free trial exists on any of the three. They were removed 2026-10-20, per `docs/ops/IAP-1.1.md` lines 72–73 and 92, 104, 119. The Oct 15 plan was "Free, 1 Month"; this is "Free, 2 Weeks".

## Google Play Console
Monetize with Play > Products > Subscriptions > `flourish_plus` (base plans `monthly`, `annual`, `founding`).

For each base plan:
1. **Add offer** on that base plan.
2. Offer ID:
   - `free-14-monthly` / `free-14-annual` / `free-14-founding`.
   - **Permanent once created.**
3. Eligibility: **New customer acquisition**, then **Never had this subscription**.
4. Phases:
   - **Add phase > Free trial**, Duration **2 weeks**.
   - No other phase. The base plan's own price follows it.
5. Tags: none. Regions: **Canada** (the base plans' only region).
6. **Activate.**

**Cannot be changed later:** the offer ID. Once active, an offer's phases and eligibility can't be edited: deactivate it and create a new one.

**Already there:** no offer on any base plan, per `docs/ops/IAP-1.1.md` lines 181–182 and 205.

## RevenueCat
Project "Flourish".
- **Nothing to create.** The entitlement `plus`, the offerings `default` and `founding`, and the six products are unchanged.
- RevenueCat reads Apple's introductory offers and Play's offers from the stores.
- Check after the offers start:
  - Products > each Android product shows its `free-14-*` offer.
  - The app's plans screen, on a test device with a never-subscribed account, shows the trial lines.
- The webhook "Flourish server" already sends all events. Trials arrive as INITIAL_PURCHASE with period type TRIAL, and the server writes them as `trialing`.

## Stripe (live mode; the same in test mode for testing)
1. **Developers > Webhooks > the production endpoint.** Add two events:
   - `customer.subscription.created` (a trial's start and end date);
   - `customer.subscription.trial_will_end` (the reminder).
   
   Keep every event it has.
2. **Settings > Billing > Subscriptions and emails > Trial ending events:**
   - Leave it at **3 days before**, Stripe's default.
   - The reminder email follows it.
3. **Settings > Billing > Subscriptions and emails > Manage free trial messaging:**
   - Stripe can send its own reminder **7 days** before a trial ends.
   - If it's on, a website household gets two reminders, against "never more than one". Turn Stripe's off.
   - Stripe's page also says "You must comply with card network requirements when offering trials." Have whoever reviews the words confirm that one email 3 days before meets the card networks' rule for a 14-day trial. If a network requires 7 days, keep Stripe's and say so: the rule then needs changing.
4. **Settings > Billing > Customer portal:** cancelling must stay allowed (it is today). A trial cancelled in the portal is never charged.
5. **Products and prices: no change.**
   - Checkout sends `trial_period_days: 14` and `payment_method_collection: always` itself, only for an account that never had a subscription.
   - The prices, their amounts and their tax behaviour stay. Those already can't be changed: a new price would be needed.
6. **Already there:**
   - no trial anywhere: no `trial_period_days` in the code, and `docs/ops/BILLING-DAY-OCT-26.md` line 560 says checkout "starts no free trial".
   - Checkout allows promotion codes (`allow_promotion_codes: true`). Whether any coupon or code is live in the dashboard can't be told from the repo.

## What could not be seen from here
- The live state of App Store Connect, Play Console, RevenueCat and Stripe. These are the repo's records only, the last from 2026-10-20 ("DONE" by CL).
- Whether any App Store offer codes or Stripe coupons exist.
- The Oct 16 IAP setup sheet. It isn't on this Mac; its plan survives in the git history of `docs/ops/IAP-1.1.md` (ff8544a, 963adbe).
