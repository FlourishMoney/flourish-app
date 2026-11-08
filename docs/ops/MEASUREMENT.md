# Measurement: what each funnel number means and where it comes from

Written 2026-11-08 for the approved plan (Nov 4, v4), which needs the full funnel counted on our own server, with no analytics SDK, by Nov 15. Every number below is a **count**. A percentage is printed only as `n of d (p%)`, never alone. Day boundaries are Toronto time.

**What counts as a household.** A household is everyone in one `household_members` household (couple mode, 0030), or one account on its own. It is counted once, on the day its first account was created. A milestone counts the first time any of its people reached it, on any device. Accounts at Flourish's own test domains (getgrowsmart.com, flourishmoney.app), the screenshot account and the App Review account are never counted (the same rule as 0019).

**What a channel is.** It is where the household's first account was made: `web`, `ios` or `android`. It comes from the Origin the store apps' WebViews send (`_lib/attribution.js accountPlatform`). An account made before 0036 has no record and reads `unknown`. Web and store sign-ups are always separate lines. **Apple and Google figures are never added together:** a payment, cancellation or refund is reported as `_web`, `_apple` or `_google`, because the stores define them differently (see each one below).

**Counting starts when 0042 runs.** Nothing before that is in the new tables. `funnel_cohorts` marks earlier cohorts `before_counting_started = true`, so their blanks are not zeros. `funnel_gates` looks only at households created after it. For earlier days, use 0019's `activation_counts` and 0028's `onboarding_counts_report`. Both are device-based estimates that can count a household twice.

## The reports (Supabase SQL editor, service role only)

| Report | What it gives |
|---|---|
| `select * from public.funnel_cohorts('2026-11-09', '2026-11-30');` | one line per cohort day, channel and measure: `count`, `out_of`, `shown`, `pct`, `before_counting_started` |
| `select * from public.funnel_gates();` (or `funnel_gates('2026-12-01')`) | the plan's activation and repeat-use gates, for all households, then each channel |
| `select * from public.landing_source_counts(from, to);` (0027) | the home page's visits and main-button taps by src and device |
| `select * from public.funnel_by_source('2026-11-03', '2026-11-09');` (0043) | **the Tuesday review**: home visit, /get visit, store click, install, then households, setup done, first safe-to-spend, first check-in, trial and paid (web, Apple, Google apart), by src and cr; `cr = '(all)'` is the src's total |
| `select * from public.source_funnel(from, to);` (0036) | the older five-column version of the above (activation there = first number within 24 hours) |

`funnel_gates(as_of)` reads today's data even when you pass a past day. Use it for today's gate, not to rebuild an old one.

## The measures

### Before an account (aggregate, no account behind them)

| Measure | Definition | Source |
|---|---|---|
| landing page visit (home) | `landing_view` / `home_visit`: the home page at flourishmoney.app was shown, once per browser session | the page sends it (`src/lib/landingCounts.js`); `public.landing_counts` (0027) by the waitlist src list and device, and the same visit as `home_visit` in `attribution_counts` (0043) by the link's own src and cr |
| landing page visit (/get) | `landing_visit`: a visit to the store handoff page /get | `public/get/get.js` by sendBeacon; `public.attribution_counts` (0036), by src, cr and platform |
| store click | `store_click`: /get sent a phone to its store, or a visitor tapped a store badge on /get or on the home page | /get as above; the home page's badges by sendBeacon (`src/lib/attribution.js countStoreClick`). The home page's badges now carry src and cr to the store the way /get does: Apple's campaign link with `ct` = `src_cr` cut to 30 characters, and a Play referrer `utm_source=src&utm_campaign=cr` |
| install | `install`: the Android app's first launch, read once from Google Play's Install Referrer, within 14 days of the install | the Android app (`src/lib/attribution.js`); `attribution_counts`. **iPhone: none.** Apple tells the app nothing, so App Store downloads come from App Store Connect only |

None of these stores an IP, a cookie, a user agent or an account. The user agent is read for the platform or device kind and thrown away.

### Per household (0042: `account_milestones`, `account_days`)

| Measure (`funnel_cohorts`) | Definition | Source |
|---|---|---|
| `households_created` | households whose first account was created that day | `auth.users.created_at` |
| `accounts_created` | accounts created into those households, counting a partner's account in the household's cohort day | `auth.users` |
| `setup_done` | **bank connected or manual setup finished**: the first time onboarding showed the first number (`setup_done manual` or `bank`, from its mode), or a bank link completed | app signals `first_number_shown` and `bank_link_completed` to `/api/activation`; installed store apps already send both |
| `first_safe_to_spend` | **first valid safe-to-spend result**: the first time Today showed the safe-to-spend figure with a cash account and an income (`showsSafeFigure`), or onboarding showed the first number | `safe_view` and `first_number_shown`; at any age, not only in the first 7 days |
| `first_checkin` | **first money check-in**: a money meeting marked done (Meet's "Mark this meeting done", or the meeting flow's Complete/Finish) or the weekly check-in's Done | the new `checkin` signal (kind `meeting` or `weekly`); one day per account in `account_days` |
| `second_checkin_other_day` | a money check-in on at least two different days | `account_days` |
| `trial_started` | the account's 14-day trial started. It is the only trial: the store products have none, and the trial starts at sign-up on every channel | `profiles.trial_started_at` |
| `store_trial_started_apple`, `store_trial_started_google` | a store-run free trial (RevenueCat `INITIAL_PURCHASE` with `period_type` TRIAL). Expected 0: no product has one | RevenueCat webhook |
| `paid_web` | Stripe `checkout.session.completed` with `payment_status` paid | Stripe webhook |
| `paid_apple`, `paid_google` | RevenueCat `INITIAL_PURCHASE`, `RENEWAL` or `NON_RENEWING_PURCHASE` in PRODUCTION, not a trial or promotional period, from `APP_STORE` or `PLAY_STORE` | RevenueCat webhook |
| `cancelled_web` | renewal turned off (`cancel_at_period_end` or `cancel_at` set), or the subscription ended for any reason other than a failed or disputed payment | Stripe webhook |
| `cancelled_apple` | RevenueCat `CANCELLATION` with `cancel_reason` UNSUBSCRIBE: the household turned off auto-renew in Apple's settings. Access lasts to the period's end | RevenueCat webhook |
| `cancelled_google` | the same event from Google Play: the household cancelled in Play. Google may also cancel after its own retries, which arrive as BILLING_ERROR and are **not** counted | RevenueCat webhook |
| `refunded_web` | any Stripe refund on the household's charge, in full or in part (`amount_refunded` > 0) | Stripe webhook |
| `refunded_apple` | Apple refunded the household after the household asked Apple (RevenueCat `CANCELLATION`, `cancel_reason` CUSTOMER_SUPPORT, or a negative price). We cannot refund on Apple ourselves | RevenueCat webhook |
| `refunded_google` | a Google Play refund, which we can give from Play Console (the same RevenueCat fields) | RevenueCat webhook |
| `returned_day_1`, `returned_day_7`, `returned_day_14`, `returned_day_28` | anyone in the household opened the app on exactly that day after the household's cohort day. `out_of` counts only households whose day is over; `0 of 0` means no household's window is over yet | the `app_open` signal (once a Toronto day per device, already sent by installed apps); `account_days`, first 60 days only |

Every measure from `setup_done` on is `count` of `out_of` households in the same cohort day and channel.

### The plan's gates (`funnel_gates`)

| Measure | Definition |
|---|---|
| `activation_within_7_days` | households that reached `first_safe_to_spend` within 7 days of their first account, out of every household whose 7 days are over. Households that abandoned onboarding are in the denominator. This is v4's early-stop measure: below 25% once 20 are eligible means pause new outreach |
| `activated_households` | households that reached it at all. The scaling gate needs 30 |
| `returned_days_6_to_8` | anyone opened the app on day 6, 7 or 8 after activation. Day 0 is the Toronto day of the first safe-to-spend result |
| `second_checkin_days_6_to_14` | a money check-in on day 6 to 14 after activation, on a different day from the household's first check-in |
| `either_repeat_use` | either of the two, each household once. The scaling gate passes at 15% with at least 30 eligible. v4's repeat-use check is below 10% |

The three repeat-use measures share one denominator: activated households whose 14 full days since activation are over.

### Which counts carry src and cr

Everything before an account carries the link's `src` and `cr`. On an account, **only an Android one does**: Google Play passes the code to the app on first launch (Install Referrer). A website or iPhone account reads `direct`/`none`. That is what the privacy words approved on 2026-11-05 say, and what was decided ("Website and iPhone stay direct"). So the household lines of `funnel_by_source` can split Android households by creative. For the website and iPhone, compare the visits and store clicks by creative with App Store Connect's downloads by campaign.

## What Apple will hide (read a blank as unknown, never as zero)

From Apple's own pages, read 2026-11-08 ([campaign links](https://developer.apple.com/help/app-store-connect-analytics/acquisition/campaign-links/), [Analytics Reports API](https://developer.apple.com/help/app-store-connect-analytics/overview/analytics-reports-api/)):

- **A campaign metric shows only once it reaches 5 in the date range you pick.** A creative that brought 1 to 4 first-time downloads that week shows nothing for downloads. At our volume most single creatives will be blank most weeks. Widen the date range, or read the src total (a shorter `ct`), before deciding anything.
- **Usage data (sessions, active devices, retention) comes only from people who opted in** to share analytics with developers. It is a fraction of real users, so iPhone retention by campaign is a sample at best. Our own `returned_day_*` counts every household.
- **The downloadable reports drop rows with fewer than five users or five devices.**
- **A new campaign appears only 24 hours after launch.** Apple's days are UTC; ours are Toronto days.
- **ct is 30 characters.** /get and the home page cut `src_cr` at 30, so two long creatives that share their first 30 characters are one campaign to Apple.

Google Play says it "will not display data that falls under certain minimum thresholds", and may group it into "Other" ([Play Console help](https://support.google.com/googleplay/android-developer/answer/6263332?hl=en)). It publishes no number. Our own `install` count, from the Install Referrer, has no threshold.

## Where the counting is weaker, plainly

- **iPhone installs and iPhone campaign codes are not ours to count.** App Store Connect has them by campaign token.
- **Check-ins from the store apps start at 1.1.6.** The `checkin` signal is new code. The website sends it from the next deploy; the iPhone and Android apps send it from 1.1.6. Until then a store household's check-ins read as none. Everything else above comes from signals that the installed 1.1.4 and 1.1.5 apps already send, or from the server's own webhooks.
- **A device that is offline keeps nothing.** A signal that fails is sent again later (`/api/activation` answers 503 only for a check-in, the one signal nothing else keeps). The others are best effort.
- **Small numbers can point to a person.** A cohort day with one household describes that household. These reports are for Flourish only and are never published.

## Privacy

`account_milestones` holds an account id, a milestone and a channel from fixed lists, and a time. `account_days` holds an account id, a day and `open` or `checkin`. Neither holds an amount, a name, an address, a device, an IP or free text, and both are deleted with the account. This is the "usage patterns (screens viewed, features used)" that the privacy policy's section 1 already lists, linked to the account. The App Privacy and Data safety answers must say so (Product Interaction, linked, Analytics).
