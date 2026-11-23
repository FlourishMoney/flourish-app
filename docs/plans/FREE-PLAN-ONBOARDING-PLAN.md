# Free plan and value-first onboarding: plan

**Status:** research only. No app code, test, migration, setting or store record was changed.
**Written:** 2026-11-23, on branch `free-plan-onboarding`.
**Base:** main `f048f72` (PR #157 landed while this was being researched; every line number below is for that commit).
**Line numbers drift.** `src/App.jsx` moves with every change. Match by the quoted name or words, not the number alone.
**Not touched:** `plus-1.1.8` (PR #154), `fix-review-1122` (now merged as #157), `drop-free-plan` (PR #96). They were read through git only.

Contents:

1. [Short answers](#1-short-answers)
2. [Free plan](#2-free-plan)
3. [Onboarding](#3-onboarding)
4. [Sign in with Apple and Google](#4-sign-in-with-apple-and-google)
5. [Store review prompt](#5-store-review-prompt)
6. [Can the website be read without JavaScript](#6-can-the-website-be-read-without-javascript)
7. [Flinks next to Plaid](#7-flinks-next-to-plaid)
8. [Decisions needed before any code](#8-decisions-needed-before-any-code)
9. [Build order and rough hours](#9-build-order-and-rough-hours)
10. [NEEDS WORDING REVIEW](#10-needs-wording-review)

---

## 1. Short answers

| # | Question | Answer |
|---|---|---|
| 1 | Is there still a free plan in the code? | **Yes.** PR #96 (drop the free plan) was never merged. The limits are live: 2 coach messages a week, 1 What-If a day, 1 bank. But with the trial-first switch on, a new account is held at a plans screen it cannot close, so nobody new reaches Free. |
| 1 | What is furthest from the target? | (a) the plans wall, (b) the bank is free for 1 and is asked for before the plans, (c) nothing removes a bank when a plan ends, (d) bank history is not saved, so "history is kept" needs new code, (e) there is no way to type a single transaction, and statement import exists only inside onboarding. |
| 2 | Onboarding today | Sign up, AI notice, consent, **bank**, pay, first number, bills and debts, plans. No worry question, no "who it's for", no goals, no estimate. An estimate without a balance was removed on purpose in PR #94 and a test keeps it out. |
| 3 | Apple and Google sign-in | **In the code for all six** (Apple and Google on web, iOS, Android). The live store apps (1.1.6) do **not** have it; the 1.1.7 builds do. |
| 4 | Store review prompt | **Yes, already built** for iOS and Android, since 1.1.0. One trigger: after a money meeting is marked done. Errors silence it for 24 hours. |
| 5 | Website without JavaScript | **Yes for the home page** (2,801 characters of real text in the raw HTML) and /support and the guides. **No for /privacy and /terms** (0 characters), though both are in the sitemap. |
| 6 | Flinks | It can sit beside Plaid, but it is a different shape: no incremental sync, no pending flag, no liabilities detail, no investments, one instance per country, webhooks by request, and a contract with a monthly minimum. |

---

## 2. Free plan

### 2.1 Target (as given)

- **Free, no card:** manual transactions, PDF/CSV statement import, paydays and bills, Safe to Spend, bills/paydays calendar, What-If, coach limited to 2 messages a week.
- **Paid "flourish" (prices unchanged):** bank sync, unlimited coach, Credit, coach-run money meeting, automatic bill/payday detection.
- **Plus add-on:** unchanged.
- **Trial:** keep the 14-day store trial. No trial, or a cancel, lands on Free. Budget and history are kept. Bank connections are removed at the end of a paid period.

### 2.2 Where the code is today

**Plans**

- Stored: `profiles.plan` is one of `free`, `trial`, `plus`, `pro`, default `free` (`supabase/migrations/0001_profiles.sql:15`); `founder_flag` (`supabase/migrations/0001_profiles.sql:17`).
- A new account's row is `trial` with 14 days (`supabase/migrations/0007_trial_only_signups.sql:38-39`).
- Worked out, the same on the device and the server: `beta_founder`, `premium`, `trial` or `free` (`src/lib/planFromProfile.js:58-69`, `netlify/functions/_lib/planRules.js:71-82`). `tests/planParity.test.cjs` holds the two copies together.
- A paid subscription row (Stripe, App Store, Play) can only add access (`netlify/functions/_lib/planRules.js:175-184`, `src/lib/planFromProfile.js:95-110`).
- Server-only extras: a gift year (`netlify/functions/_lib/auth.js:194-201`) and a partner's cover (`netlify/functions/_lib/auth.js:202-207`, `netlify/functions/_lib/household.js:161-185`). A partner's trial does not cover.
- Inside the code "plus" means the **main** plan (`profiles.plan`, the `flourish_plus` products). The Plus add-on exists only on branch `plus-1.1.8`.
- New on main since #157: a failed renewal (`past_due`) keeps access while Stripe retries (`netlify/functions/_lib/planRules.js:99-154`).

**The free limits**

- Device: `FREE_TIER_LIMITS` is 2 coach messages a week and 1 What-If a day (`src/lib/usageLimits.js:36-39`); 14-day trial (`src/lib/usageLimits.js:42`).
- Bank: `FREE_BANKS = 1` (`src/lib/freePlan.js:24-26`).
- Server: every limit sits behind the `ENFORCE_PLAN_LIMITS` setting (`netlify/functions/_lib/auth.js:113-115`). A plan the server cannot read answers 503, never the free limit (`netlify/functions/_lib/auth.js:227-231`).

**What a new account meets today**

The trial-first switch (`TRIAL_PLAN_FIRST`, read at `netlify/functions/_lib/planRules.js:50-57`) decides.

- **Switch on** (the live home page shows the switch-on words from `src/lib/trialWords.js:35`, fetched 2026-11-23, so production is built with it on):
  1. The account has no account trial (`netlify/functions/_lib/planRules.js:62-68`). Its plan is `free` from the first minute (`netlify/functions/_lib/planRules.js:76`).
  2. Onboarding, the first number and the bills step run on the free plan (`src/App.jsx:19984`, `src/App.jsx:20005`, `src/App.jsx:20009`).
  3. Then `plansFirstStage` answers `"required"` (`src/lib/trialPlanFirst.js:49-58`). The website shows the plans with a close that does nothing (`src/App.jsx:20028-20029`); a store app shows its paywall (`src/App.jsx:20016-20027`). The only ways out are sign out, restore purchases and delete account. **There is no "not now".**
  4. Website: Stripe Checkout with a trial **and a card required** (`netlify/functions/billing.js:435-440`).
  5. Store apps: the store's own 2-week intro offer, when the store says the buyer is eligible (`src/lib/trialPlanFirst.js:140-154`).
- **Switch off:** every platform gets a 14-day account trial with no card, then Free.

**Who is on Free today:** accounts opened before the switch date, after their trial (they see the plans once and can close them, `src/App.jsx:19907-19913`); accounts where nothing can be sold (website with billing off, old store builds); someone holding a partner's invite (`src/lib/trialPlanFirst.js:52`).

**Trial end, cancel, lapse**

- Trial end fires no event; it is by date (`netlify/functions/_lib/planRules.js:76-81`). The device sets its cache to `free` (`src/lib/usageLimits.js:289-299`). `profiles.plan` stays `trial` in the database; nothing writes `free`.
- Stripe cancel: the webhook marks the row `canceled` (`netlify/functions/stripe-webhook.js:516-598`). Store cancel or refund: the same through RevenueCat (`netlify/functions/revenuecat-webhook.js:103-121`, `netlify/functions/_lib/storeSubscriptions.js:124-128`).
- The plan value is then `free`. **But with the switch on, a newer account that cancels or lapses gets `"required"` again** (`src/lib/trialPlanFirst.js:55`): the plans wall, not Free. This is the main gap against "a cancel lands on Free".

### 2.3 Every gate: today and target

| Feature | Device gate | Server check | Free today | Free target | Change |
|---|---|---|---|---|---|
| Coach chat | `src/lib/usageLimits.js:124-140`; coach screen `src/App.jsx:13432-13439`; counter `src/App.jsx:13766-13768` | `netlify/functions/coach.js:298-378`; `netlify/functions/_lib/coachLimits.js:77-100`; weekly counter `supabase/migrations/0008_coach_usage_weekly.sql:31` | 2 a week | 2 a week | Rule stays. Words only (`netlify/functions/_lib/coachLimits.js:33` says "Upgrade to Plus"). |
| What-If | `canRunSimulation()` blocks the whole What-If, the app's own figures included (`src/App.jsx:2307-2333`); `src/lib/usageLimits.js:150-166` | AI explanation 1 a day (`netlify/functions/coach.js:387-411`, `netlify/functions/_lib/coachLimits.js:147-155`); counter `supabase/migrations/0024_ai_usage_daily.sql:50` | 1 a day | Free | Device: lift the daily block. Server: allow free accounts. **Decision D4:** the figures cost nothing; only the AI explanation costs. Either unlimited, or a generous daily ceiling on the explanation only (the counter exists). |
| Weekly check-in (AI) | none (`src/App.jsx:3678`) | none (`netlify/functions/coach.js:413-420`) | open, not counted | not named | **Decision D5.** Suggest: free, with a daily ceiling. |
| PDF statement import (AI) | `src/App.jsx:3915-3967`; the only file picker is inside onboarding (`src/App.jsx:4719`) | no plan check, no count (`netlify/functions/coach.js:442-450`) | free, not counted | Free | Access stays. Add a ceiling (cost). **Add a way to import after onboarding** (none exists). |
| CSV statement import | `src/App.jsx:3836`, read on the device | none | free | Free | Same missing entry point. |
| Manual transactions | **No screen adds one transaction.** The only writers are the statement import (`src/App.jsx:4495-4515`) and the bank sync. Hand-typed balances exist (`src/lib/manualBalances.js:1`). | none | not there | Free | **New feature. Decision D6.** |
| Bills and paydays | `src/App.jsx:7676-7750` | none | free | Free | none |
| Safe to Spend | `src/App.jsx:20262` | none | free | Free | none |
| Calendar (the dated list on Watch) | `src/App.jsx:20264-20269` | none | free | Free | none. There is no calendar grid, only the dated list. |
| Credit | `src/lib/featureAccess.js:16-18`; `src/App.jsx:20279` | none (device screen) | locked | Paid | words only |
| Coach-run meeting | `src/lib/featureAccess.js:21-23`; `src/App.jsx:10627-10634` | 402 (`netlify/functions/coach.js:422-440`, `netlify/functions/_lib/coachLimits.js:157-160`) | locked; the agenda is free | Paid | words only |
| Connect a bank | none before Plaid opens (`src/App.jsx:4481`, `src/App.jsx:20106`) | link token: **no plan check** (`netlify/functions/plaid.js:110-169`); exchange: cap of 1 (`netlify/functions/plaid.js:180-191`); legacy import: cap of 1 (`netlify/functions/plaid.js:652-685`) | 1 bank | **0 banks** | Server: refuse the link token, the exchange and the legacy import without a paid plan. Device: check before opening Plaid, and offer the plans, a statement, or typing instead. |
| Bank reads and refresh | background refresh is not plan-gated (`src/App.jsx:5252-5260`); sync `src/App.jsx:19275-19479` | no plan check on accounts (`netlify/functions/plaid.js:262`), transactions (`netlify/functions/plaid.js:289`), investments (`netlify/functions/plaid.js:342`), liabilities (`netlify/functions/plaid.js:394`) or enrich (`netlify/functions/plaid.js:460`) | free | Paid | Gate the read actions. Listing, disconnecting and deleting stay open. Device: a refusal after a plan ends is "plan ended", not an error. |
| Automatic bill/payday detection | bank paths `src/App.jsx:4433-4436`, `src/App.jsx:19417-19461`; **also runs on imported statements:** the pay suggestion `src/App.jsx:19500-19516`, its banner `src/App.jsx:9447`, the meeting's bill questions `src/lib/meetSnapshot.js:187-201` | none | runs on any transactions | Paid | Bank paths become paid by themselves. **Decision D7:** does Free get suggestions from an imported statement? If not, those three places need a plan check. |
| Net worth / investments | not gated on main; holdings come only through the bank (`src/App.jsx:19392-19414`) | `netlify/functions/plaid.js:342` | free | Holdings follow the bank; net worth from typed balances stays | Leave to Plus 1.1.8 (`netWorthAccess.js` there). |
| Export | Settings export (`src/lib/dataExport.js:85`, `src/App.jsx:12830`) | none | free | Free | none. It now opens the share sheet in the store apps, which the #96 notes asked for. |
| Partner cover | `src/App.jsx:13104` | `netlify/functions/_lib/auth.js:202-207` | covered member is unlimited | covered means paid, banks included | **Decision D10:** when cover ends, whose banks go. |
| Founder, comp, gift, tester month | none | `netlify/functions/_lib/planRules.js:73-75`; `netlify/functions/_lib/auth.js:196-201`; `supabase/migrations/0039_tester_free_month.sql:18` | unlimited | same as paid | The bank-removal job must also see a gift, comp or tester month end. |

### 2.4 Bank connections removed at the end of a paid period

**Nothing does this today.** Every bank removal in `netlify/functions/plaid.js` is a person's own action or a clean-up (`netlify/functions/plaid.js:213`, `netlify/functions/plaid.js:245`, `netlify/functions/plaid.js:455`, `netlify/functions/plaid.js:581`, `netlify/functions/plaid.js:628`, `netlify/functions/plaid.js:856`). Neither billing webhook touches the bank rows.

What can be reused:

- The server's disconnect (`netlify/functions/plaid.js:563-594`, `netlify/functions/_lib/household.js:290-298`).
- The device's disconnect, which keeps the transactions and turns the accounts into one typed account (`src/App.jsx:20111-20141`).
- The hourly job pattern: `netlify/functions/trial-reminder-sweep.js:59`, `netlify.toml:49-50`, its once-only table (`supabase/migrations/0046_trial_plan_first.sql:69`), and the email path in `netlify/functions/_lib/trialReminder.js:1`.

What is missing:

1. **A scheduled job.** A trial end, a gift end, a cover end and the end of the billing retry fire no event, so the webhooks (`netlify/functions/stripe-webhook.js:549`, `netlify/functions/revenuecat-webhook.js:110`) are not enough. The job asks the server's plan rule for each account that has a bank. A plan it cannot read means skip, never remove.
2. **A marker,** so the job is safe to repeat and the notice goes once: a new migration (section 2.9).
3. **A notice email and in-app notice** (words needed).
4. **A retry when the bank's removal fails.** `plus-1.1.8` already has a "refused row" pattern for this.
5. **Keeping the history. This is real work, not a setting:**
   - Bank transactions are never saved on the server. The save drops any transaction that belongs to a bank account (`src/lib/persistence.js:58-67`, `src/lib/persistence.js:120-124`); they are fetched again from the bank each time.
   - In a household, the server disconnect strips that bank's accounts and data from the shared copy (`supabase/migrations/0031_couple_household_private.sql:540`, `supabase/migrations/0031_couple_household_private.sql:619`).
   - The device has no step that notices a bank removed on the server (`src/App.jsx:5265`, `src/App.jsx:19660-19673`).
   - So removal needs a device step that turns bank accounts into kept, typed accounts and saves their transactions **before** the bank goes, plus a household path that keeps instead of strips.
6. **Terms and Privacy lines** (section 2.6).
7. **Decisions D8, D9:** how much notice, and what happens to today's free accounts that hold 1 bank.

### 2.5 Screens and words that name the free plan, the trial, or what is paid

All of these change or need checking. The existing inventory is `docs/ops/PLUS-AND-FREE-PLAN-CLEANUP.md:14-51` (19 places).

**`src/lib/freePlan.js`** (each pinned word for word by tests)

- `src/lib/freePlan.js:32` trial ended heading
- `src/lib/freePlan.js:35` the locked-screen line (lists what Free keeps)
- `src/lib/freePlan.js:38-40` coach limit line
- `src/lib/freePlan.js:43` What-If daily limit line (goes away)
- `src/lib/freePlan.js:46-48` trial chip
- `src/lib/freePlan.js:52` "The free plan connects 1 bank…" (becomes 0)
- `src/lib/freePlan.js:55-60`, `src/lib/freePlan.js:65-76`, `src/lib/freePlan.js:84-107` the three store-app versions of Terms section 7

**Other word files**

- `src/lib/plusIncludes.js:11-17` the five "what paid adds" lines. Two are wrong under the target ("What-If as often as you like", "More than one connected bank").
- `src/lib/upgradeFlow.js:56-57` plans headline and bullets; `src/lib/upgradeFlow.js:63-64` and `src/lib/upgradeFlow.js:69-70` trial lines.
- `src/lib/storeOffer.js:123-125` store paywall title, lead and "your accounts… stay as they are"; `src/lib/storeOffer.js:29-32` disclosure; `src/lib/storeOffer.js:80-85` keep-my-trial.
- `src/lib/trialWords.js:27` "Pick a plan to keep using flourish…" (opposite of the target); `src/lib/trialWords.js:35` landing line; `src/lib/trialWords.js:58-61` "free account" sign-up lines.
- Server: `netlify/functions/_lib/coachLimits.js:33`, `netlify/functions/_lib/coachLimits.js:117-118`; `netlify/functions/plaid.js:189`, `netlify/functions/plaid.js:683`; reminder email `netlify/functions/_lib/trialWords.js:13-18`.

**`src/App.jsx`**

- What-If limit lines and button: `src/App.jsx:2316-2328`, `src/App.jsx:2638`
- Today upgrade card: `src/App.jsx:6962-6974`
- Meet locked lines: `src/App.jsx:10634`, `src/App.jsx:10737-10741`
- Settings plan card: `src/App.jsx:13100-13112`; store card `src/App.jsx:13115-13124`
- Coach daily ceiling line: `src/App.jsx:13684`
- Locked-screen gate: `src/App.jsx:14419-14462`
- Website plans screen: `src/App.jsx:14566-14585`
- Store paywall: `src/App.jsx:14793`
- Old paywall (shown only while billing is off): `src/App.jsx:14883-14906`. Its last line already describes a free tier with manual entry.
- Landing: `src/App.jsx:16029`, `src/App.jsx:16682`, `src/App.jsx:16773`; sign-up title `src/App.jsx:16829`
- Sidebar: `src/App.jsx:20422-20428`, `src/App.jsx:20441`
- Trial-ended banner: `src/App.jsx:20501-20509`
- Two lines that promise things that do not exist: "add one by hand" (`src/App.jsx:9130`, `src/App.jsx:9518`) and "upload a bank statement from the Transactions screen" (`src/App.jsx:5597`).

**Outside the app**

- Page description: `index.html:21-22`, switched at build time by `scripts/trial-first-meta.mjs:20-21`.
- /support questions: `src/App.jsx:7516-7526` (no plan or price question today).
- The AI-readable fact list: `scripts/build-seo.mjs:107-121` (no plan or price facts today).

### 2.6 Terms and Privacy

- **Terms section 7, website:** `src/App.jsx:14338-14339` ("Free Tier… 14-day trial of premium features. Flourish Plus…").
- **Terms section 7, store apps:** the three versions in `src/lib/freePlan.js` listed above. The switch-on version says a new account chooses a plan to keep using the app (`src/lib/freePlan.js:92`), which is the opposite of the target, and names the old limits (`src/lib/freePlan.js:101-104`).
- **Terms section 5, bank connections:** `src/App.jsx:14333`. Nothing about removal when a plan ends.
- **Privacy:** `src/App.jsx:14036` (what is collected), `src/App.jsx:14039` (bank data), `src/App.jsx:14069` (statement import: it says CSV text goes to the AI provider, but CSV is read on the device, `src/App.jsx:4524-4534`). No line covers a bank being removed at a plan's end or how long its data is kept after.
- Each Terms change may need a new "last updated" date and a notice. Store-app Terms reach phones only with a new store build.

### 2.7 Store text

- Review notes draft, business model paragraph: `docs/ops/LEGAL-PACKET.md:148` (also `docs/ops/LEGAL-PACKET.md:106-108`).
- Play subscription name: `docs/ops/IAP-1.1.md:178`; App Store display-name steps `docs/ops/IAP-1.1.md:74-115`.
- Play listing section quoted: `docs/ops/PLUS-AND-FREE-PLAN-CLEANUP.md:16-18`. The live listing text and the App Store description are **not** in the repo; they are changed by hand in the two consoles.
- `src/whatsNew.json:1-11` has no plan words.
- Stripe product name: `docs/ops/BILLING-SETUP.md:13`.

### 2.8 Tests that must change (all in the `test:math` gate)

Breaks under the target (must be moved to the new rule at the same strength, never weakened):

| Test | What it pins |
|---|---|
| `tests/nativeTrialLimits.test.cjs:154-160`, `tests/nativeTrialLimits.test.cjs:194-207` | What-If 200 then 429 for free; second bank 402 |
| `tests/usageLimits.test.cjs:43-46` | 1 What-If a day on the device |
| `tests/nativeFreePlanLine.test.cjs:55-60`, `tests/nativeFreePlanLine.test.cjs:84-88` | the free-plan lines word for word; the 1-bank cap on both write paths |
| `tests/iapApprovedCopy.test.cjs:32`, `tests/iapApprovedCopy.test.cjs:39`, `tests/iapApprovedCopy.test.cjs:83-89` | Terms section 7 words; bank refusal words |
| `tests/trialGoLiveWords.test.cjs:24-27` | switch-on Terms section 7 word for word |
| `tests/trialPlanFirst.test.cjs:149-152`, `tests/trialPlanFirst.test.cjs:246-253` | `"required"` and `"offer_once"` |
| `tests/trialPlanFirstJourney.test.cjs:64-78` | screen order and the wall after the first number |
| `tests/trialSwitchWords.test.cjs:33-34` | "free account" sign-up words |
| `tests/webPlusIncludes.test.cjs:23` | the five "what paid adds" lines |
| `tests/privacyAndWords.test.cjs:34`, `tests/prelaunchCopy.test.cjs:66-79`, `tests/sidebarDueSoonTier.test.cjs:98-111`, `tests/sourcedFigures.test.cjs:390-427`, `tests/upgradeEntryPoints.test.cjs:32-53`, `tests/storeOffer.test.cjs:42-46` | plan lines and upgrade entry points |
| `tests/coachLimits.test.cjs:28-43` | rule stays (2 a week); words change |
| `tests/onboardingFirstNumber.test.cjs:156` | the exact list of migration files; every new migration is added here |

Should not break: `tests/planParity.test.cjs:39-41`, `tests/planFromProfile.test.cjs:30-36`, `tests/billingEntitlement.test.cjs:1`, `tests/webPaidPlan.test.cjs:1`, `tests/planReadUnavailable.test.cjs:1`, `tests/nativeAccess.test.cjs:53-114` (Credit, meeting, coach), `tests/testerFreeMonth.test.cjs:1`, `tests/complimentaryAccess.test.cjs:1`.

New tests needed: bank refused on every write and read path without a plan; bank allowed inside a store trial; plan ended refusal is 402 and unread plan is 503; What-If open on Free; the removal job (skip on unread plan, once-only notice, retry, history kept) on real Postgres; the plans screen closes onto Free; placeholder words listed (`tests/_pendingWords.cjs:36-64` needs a new exception group while words are placeholders).

### 2.9 Migrations

- Counters that stay: weekly coach (`supabase/migrations/0008_coach_usage_weekly.sql:47`), daily AI (`supabase/migrations/0024_ai_usage_daily.sql:32`).
- The free rule itself needs **no** new column: free stays the worked-out default.
- **New, for bank removal:** a marker on the bank row or its own once-only table (due date, notice sent, reason), with grants in the same file.
- **Possibly new:** a "keep the history" version of the household disconnect.
- **New, for onboarding counts** (section 3.6).
- Numbers: main ends at 0056. `plus-1.1.8` uses 0044, 0045, 0051, 0052, 0055. **The next free number is 0057.**
- Nothing is run from here. Migrations go to staging first and are applied to production by hand.

### 2.10 PR #96 history: what to reuse

PR #96 (`drop-free-plan`, head `cfbf601`, open, on hold since 2026-11-05, based on the old main `a3f702b`): 6 commits, 33 files, +1,834/−222. It removed the free plan, so most of it is the opposite of this target. It should be **closed, not merged**, and three ideas taken from it:

- **Reuse:** its list of bank actions that need a plan, with listing, disconnecting and deleting left open (file `_lib/planGate.js` on that branch). That list is exactly "bank sync is paid".
- **Reuse:** the server telling the app plainly whether the household has a plan (`access` on the billing status, and file `paywallGate.js` on that branch), so the device follows the server instead of guessing.
- **Reuse:** the pattern of migration 0029 (a guarded date column plus a once-only go-live record) for the removal notice. It must be renumbered and rebuilt on today's guard function.
- **Already on main:** the "unread plan is 503, never a refusal" rule, and export through the share sheet.
- **Do not reuse:** refusing every coach type, the "no plan" state, the overlay that covers the app, and the tests `planRequired`, `noPlanPaywall`, `noPlanWords`.
- Its earlier decision said: email first, disconnect 30 days after the grace period, keep history, reconnect on subscribe. The new target says "at the end of a paid period". See decision D8.

### 2.11 Landing this with Plus 1.1.8 without conflicts

**State on 2026-11-23:** #157 is merged (main `f048f72`). PR #154 (`plus-1.1.8`, head `39a3bf7`) is open and GitHub reports it as conflicting with main; bringing main into it is that branch's own next step.

**Files both pieces of work must touch** (from `git diff --stat main...plus-1.1.8`: 96 files, +11,270):

- `src/App.jsx` (+352 there): What-If, onboarding's bank step, the Today upgrade card, Goals, the Settings plan card, Terms, the locked-screen gate, the plans screen, the paywall, add-a-bank.
- The word files `freePlan.js`, `storeOffer.js`, `upgradeFlow.js`, `pricing.js` in `src/lib/`.
- On the server: `coachLimits.js`, `plaid.js` (+418 there), `billing.js`, `stripe-webhook.js`, `revenuecat-webhook.js`, and `netlify.toml`.
- `package.json`: the `test:math` command is one long line that every branch edits.
- Twelve existing tests, including `coachLimits`, `iapApprovedCopy`, `nativeFreePlanLine`, `trialPlanFirst`, `webPlusIncludes`, `upgradeEntryPoints`.
- Not changed there: `usageLimits.js`, `featureAccess.js`, `planFromProfile.js`, and the server's `auth.js` and `planRules.js`.

**Rules on `plus-1.1.8` that contradict "bank sync is paid only"** (all in the files `bankLimits.js` and `plaid.js` on that branch):

- "The basic plan: 2 bank connections per person" and Plus at 10 per household. Under the target, "basic" has to mean the **paid** flourish plan, and Free is 0.
- "It never disconnects a bank, never stops one updating." The target removes banks at a plan's end.
- "Plus is an add-on on top of any plan." Free + Plus would then get up to 10 banks. See decision D11.
- The legacy-bank import never refuses a bank the person already had. See decision D9.

**Order that avoids conflicts:**

1. `plus-1.1.8` lands first, as already planned. It is far larger and has been through seven review rounds; redoing it on top of this work costs more than the other way round.
2. This work then branches from the main that contains Plus, with migrations from 0057.
3. Before that, only things Plus does not touch can be built safely: new pure files (the estimate, the goal dates, word modules), their unit tests, and the /privacy and /terms pre-render. Each still adds a name to the `test:math` line, a one-line conflict to resolve by hand.
4. Inside this work: server rules behind a new switch, then the device, then words and Terms in one web deploy plus one store build, then the removal job last, after notice has been given.
5. The Plus words approved on 2026-11-20 include "no limits on the coach or What-If". That line needs another look once What-If is free.

---

## 3. Onboarding

### 3.1 Today's flow

Order of screens in the app root (`src/App.jsx:19938-20032`): legal pages, sign-in, **AI notice** (`src/App.jsx:19977`), **onboarding "before"** (`src/App.jsx:19984`), **first number** (`src/App.jsx:20005`), **onboarding "after"** (`src/App.jsx:20009`), **plans** (`src/App.jsx:20016-20030`), then the app, the 5-step tour and the setup checklist. `tests/trialPlanFirstJourney.test.cjs:64-67` pins that order.

The onboarding component (`src/App.jsx:4298-5069`, about 770 lines) has five steps (`src/App.jsx:4629`):

| Step | What it asks | Where |
|---|---|---|
| 0 | Consent ("Before you start") | `src/App.jsx:4636-4646` |
| 1 | **Bank:** connect, or upload a PDF/CSV statement, or "Enter it myself" (a balance) | `src/App.jsx:4649-4778` |
| 2 | Pay: amount, how often, next payday | `src/App.jsx:4781-4972` |
| 3 | Bills (after the first number) | `src/App.jsx:4975` |
| 4 | Debts | `src/App.jsx:5015` |

- The step number is never saved (`src/App.jsx:4300`); a reload starts again at step 0.
- Website: landing, then a sign-up card with Apple, Google and email (`src/App.jsx:16819-16952`). Store apps open on a welcome screen with a labelled sample number (`src/App.jsx:16973-16979`).
- There is no "tips" screen. The nearest things are the tour (`src/lib/tour.js:25`) and one-line tips on two tabs (`src/App.jsx:7545-7563`).
- "Onboarded" is saved on the device and in the account's saved data (`src/lib/persistence.js:120-131`), or the household's (`src/lib/household.js:61`).

### 3.2 What is collected today, and what is not

- **Pay:** amount per pay, frequency, next payday or day of month (`src/App.jsx:4313`, `src/App.jsx:4616-4623`, `src/App.jsx:4917-4942`). This is already what target screen 2 needs.
- **Bills:** name, amount, day of month (`src/App.jsx:4314`, `src/App.jsx:4999-5002`).
- **Debts:** name, balance, rate, minimum (`src/App.jsx:4315`).
- **Not collected:** a worry, who it's for, goals. Household status is deliberately left unset in onboarding (`src/App.jsx:4308-4311`) and a test pins that unset stays possible. Status is only set in Settings (`src/App.jsx:12508-12510`).

### 3.3 The target flow, screen by screen

The five screens come after sign-up, the AI notice and the consent step (decision D12 covers the alternative of asking before sign-up).

| # | Screen | Saves | Reuse | New |
|---|---|---|---|---|
| 1 | Biggest money worry (one tap) | a new `profile.worry` id | chip pattern (`src/App.jsx:3448`, `src/App.jsx:4845-4857`) | the options; what each one changes later (goal suggestions, checklist order). The answer is shared with a partner and is in the export, so the Privacy list needs a look. |
| 2 | Take-home pay, how often, next payday | `incomes[0]` exactly as today | today's pay step; `src/lib/incomeSchedule.js:149`, `src/lib/incomeSchedule.js:193` | lay it out as taps where possible |
| 3 | Who it's for | `profile.status` only | the Settings options (`src/App.jsx:12508-12510`) | must allow "skip" (unset). Must **not** create a household (that stays in Settings) and must **not** touch kids data. A "family" choice is a decision (D13). |
| 4 | Main bills | `bills[]` as today | today's bills step (`src/App.jsx:4975-5002`) | a short list of common bills to tap, then amount and day. Pre-set names are new words. |
| 5 | First Safe to Spend **estimate** | nothing new saved | section 3.4 | new pure function, new screen, new label |
| 6 | Bank, statement, or keep typing | as today | `src/App.jsx:4389` (bank), `src/App.jsx:4517` (statement), `src/App.jsx:4267` (typed balance) | on Free the bank choice opens the plans and the store trial first (decision D3); typing leads to the balance question, which turns the estimate into the real number |

After screen 6: the real first number (when there is a balance), then the starter budget and goal cards, then the app with the checklist. The plans screen becomes an offer that can be closed onto Free.

A partner who arrives with an invite should skip screens 1 to 6: today they go through all of onboarding and then joining replaces everything they typed (`src/App.jsx:18807-18813`).

### 3.4 The estimate

**Today's engine cannot give one.** Safe to Spend starts from the balance of cash accounts (`src/lib/safeSpendEngine.js:68-69`); with no account the answer is always 0. The display layer refuses to show a figure without a cash account on purpose (`src/lib/safeToSpendView.js:31-52`, `src/lib/safeToSpendView.js:85-97`), and the first-number screen follows it (`src/App.jsx:15012-15014`, `src/App.jsx:15060-15069`).

**History:** an "Estimate" card that worked from 68% of income was removed in PR #94. `tests/onboardingFirstNumber.test.cjs:185` keeps that card out, and `tests/firstVisitSetup.test.cjs:2-20` pins "no figure without a cash account".

**Plan:**

- A new pure function, `onboardingEstimate.js` in `src/lib/`: one pay, minus the bills that fall before the next payday, minus the same 10% savings share the real engine uses (`src/lib/safeSpendEngine.js:132-134`), and a per-day pace. Every figure is computed in JavaScript (project rule 5).
- Built from helpers that already work without accounts: `src/lib/forecastEdits.js:535`, `src/lib/forecastEdits.js:553` (next payday), `src/lib/forecastEdits.js:449` (bills in a window), `src/lib/suggestedDaily.js:27` (daily pace).
- It has its **own** screen fields and label. It never uses the Safe to Spend headline, and it never sends the "first number shown" count, because two launch measures are defined by that count (`docs/ops/MEASUREMENT.md:42-43`).
- The existing test that keeps the old estimate card out stays as it is. The new estimate gets its own tests.
- This reverses a deliberate earlier choice, so it needs a clear yes (decision D14).

### 3.5 Starter budget, goal cards, checklist

**Starter budget** (exists, needs moving and a place in the flow)

- `generateBudgetSuggestions` (`src/App.jsx:8555-8673`) already makes typical starting points by household size, and switches to real spending after 30 days of transactions (`src/lib/budgetBasis.js:20-22`). The card that accepts them is at `src/App.jsx:8676`.
- Plan: move the function into `src/lib/` as a pure function, feed it the typed pay and bills, and show the card once after the estimate.

**Goal cards with a finish date and +/- buttons** (mostly new)

- A goal today is name, target, saved, monthly amount (`src/App.jsx:9697-9706`). **No finish date is stored**; the finish month is worked out inline (`src/App.jsx:9869-9877`). **No +/- control exists anywhere.**
- Plan: a pure `goalPlan.js` in `src/lib/` (finish date from target, saved and monthly amount; the step size for +/-; never below zero, which also closes known defect #46, `docs/product/KNOWN-DEFECTS.md:1048-1084`); a goal card with the finish date and two 44-point buttons; one or two suggested goals chosen by the worry answer.

**Welcome checklist with a progress ring** (exists as a list, needs reshaping)

- Today: 5 items and "N of M done" as text, no ring (`src/lib/setupChecklist.js:23-35`, `src/App.jsx:5821`, shown at `src/App.jsx:6515`).
- The only ring is the health-score ring (`src/App.jsx:3577-3606`); its drawing can be copied, the component cannot be reused as it is.
- Plan: 4 items (decision D15 picks which), a small ring component, the same dismiss rule. `tests/testerSuggestions.test.cjs:62-76` pins the 5 items and has to be rewritten on purpose.

### 3.6 Files to change

Existing:

| File | What | Size |
|---|---|---|
| `src/App.jsx` | onboarding component (`src/App.jsx:4298-5069`); the gates (`src/App.jsx:19984-20014`); first-number screen (`src/App.jsx:14987`); checklist card (`src/App.jsx:5821`); goals (`src/App.jsx:9682`); budget suggestions (`src/App.jsx:8555`); pull the statement import out of onboarding so it can be opened later (`src/App.jsx:4483-4593`) | L |
| `src/lib/setupChecklist.js` | 4 items | S |
| `src/lib/onboardingCounts.js`, `netlify/functions/_lib/onboardingCounts.js` | new step names on both sides (`src/lib/onboardingCounts.js:21-24`, `netlify/functions/_lib/onboardingCounts.js:19-21`) | S |
| `src/lib/persistence.js`, `src/lib/household.js` | only if a new device key must sync (`src/lib/persistence.js:32-50`, `src/lib/household.js:26-35`) | S |
| `src/lib/tour.js` | only if the tour changes | S |

New (names are proposals):

| File | What | Size |
|---|---|---|
| `onboardingEstimate.js` in `src/lib/` | the estimate | M |
| `onboardingWords.js` in `src/lib/`, and `ONBOARDING-WORDS.md` in `docs/product/` | every new word, as placeholders until approved | S |
| `goalPlan.js` in `src/lib/` | finish date and +/- rules | S |
| `starterBudget.js` in `src/lib/` | the moved budget suggestions | S-M |
| migration 0057 or the next free number | widens the allowed step names (`supabase/migrations/0028_onboarding_counts.sql:41-45`, pattern in `supabase/migrations/0047_bank_link_failed_detail.sql:22-27`); the old names must stay, because old store builds keep sending them | S |
| The new screens | inside `src/App.jsx` (the repo's convention: there are no other screen files). A separate file is possible but four copy and layout tests read only `src/App.jsx` (`tests/_copyStrings.cjs:94-95`, `tests/calmCopy.test.cjs:19`, `tests/renderedCopy.test.cjs:26`, `tests/spaceTokens.test.cjs:26-29`) and would have to be widened first. | M-L |

Tests to update: `tests/onboardingFirstNumber.test.cjs:173-195` (source pins), `tests/onboardingFirstNumber.browser.test.cjs:2-21`, `tests/firstRun.test.cjs:259-277`, `tests/trialPlanFirstJourney.test.cjs:64-67`, `tests/textOverlap.browser.test.cjs:72-73`, `tests/onboardingDuo.browser.test.cjs:1`, `tests/statusBar.browser.test.cjs:251-259`, `tests/testerSuggestions.test.cjs:62-76`, `tests/funnelCounters.test.cjs:1`, and the nightly walk `e2e/nightly/run.cjs:143-200`. The layout test covers only the demo today; the new screens should be added to it.

### 3.7 Risks

1. **Store apps carry their own screens.** The new flow reaches phones only with a new store build; older builds keep the old flow. A server switch (the pattern at `src/App.jsx:18096`) lets it be turned on per build.
2. **The time measure moves.** The goal is under 120 seconds from sign-up to the first number (`docs/ops/OPERATING-PLAN.md:80`). Five screens first will push it; the measure may need redefining around the estimate.
3. **People part-way through.** Households marked "bills pending" still land in today's "after" step (`src/App.jsx:20009`).
4. **AI notice.** PDF import uses AI, so the AI notice stays before the choice screen.
5. **Kids.** A "family" answer must not build Kids any further (project rule 6).

---

## 4. Sign in with Apple and Google

| | Website | iOS app | Android app |
|---|---|---|---|
| **Apple** | **Yes.** `src/lib/socialSignIn.js:87-90` | **Yes in code and in the 1.1.7 build. No in the live 1.1.6 app.** Apple's own sheet, `src/lib/socialSignIn.js:92-99` | **Yes in code and in 1.1.7. No in live 1.1.6.** Apple's web page in a browser tab, `src/lib/socialSignIn.js:101-118` |
| **Google** | **Yes.** `src/lib/socialSignIn.js:89` | **Yes in code and in 1.1.7. No in live 1.1.6.** In-app browser, `src/lib/socialSignIn.js:101-112` | **Yes in code and in 1.1.7. No in live 1.1.6.** Browser tab, `src/lib/socialSignIn.js:101-118` |

Proof:

- The buttons show on every platform with no switch (`src/App.jsx:16888`, `src/App.jsx:17015-17056`); both providers are a fixed list (`src/lib/socialSignIn.js:25`).
- iOS: the Sign in with Apple entitlement (`ios/App/App/App.entitlements:5-8`), the return address scheme (`ios/App/App/Info.plist:5-12`), the plug-ins (`ios/App/CapApp-SPM/Package.swift:15-17`).
- Android: the return address (`android/app/src/main/AndroidManifest.xml:26-32`), the modules (`android/capacitor.settings.gradle:5-12`).
- Packages: `package.json:20-23`. There is no native Google kit, by design (`docs/ops/SOCIAL-SIGNIN-SETUP.md:69`).
- Tests: `tests/firstRun.test.cjs:142` (order on all three), `tests/firstRun.test.cjs:212-217` (native settings), `tests/storeSignInDelete.browser.test.cjs:220-221` (the store build), `tests/privacy117.test.cjs:21-35` (Privacy Policy words).
- Which builds: the code arrived in PR #136 and #144. Branch `release-1.1.6` does not contain it. Branch `store-1.1.7-526915` (iOS 526915, Android 31) does.

Not provable from the repo:

- That 1.1.7 is live in either store. The repo does not record its review state; read it in App Store Connect and Play Console.
- That the Apple and Google providers are switched on in the auth service's dashboard. The setup record notes a sign-up check made on 2026-11-12 (`docs/ops/SOCIAL-SIGNIN-SETUP.md:102`), which is indirect evidence only. A click-through on the live website is the proof.

---

## 5. Store review prompt

**Yes, both stores, shipped since 1.1.0.** It is a small plug-in written in this project, not a package.

- iOS: StoreKit's review request (`ios/App/App/FlourishReviewPlugin.swift:28`); iOS 15 is never asked (`ios/App/App/FlourishReviewPlugin.swift:19-21`).
- Android: Play In-App Review (`android/app/src/main/java/com/flourishmoney/app/FlourishReviewPlugin.java:22-28`, `android/app/build.gradle:68-69`).
- Rules: at most 3 asks in 365 days, and 24 quiet hours after any trouble (`src/lib/reviewRules.js:30-32`). Never on the website, never in the demo (`src/lib/reviewRules.js:96-108`).
- **One trigger today:** after a money meeting is marked done and saved (`src/App.jsx:10806`, inside the handler at `src/App.jsx:10787`). `tests/reviewPrompt.test.cjs:127` pins "exactly one place".
- **Never after an error, already wired:** every reported error (`src/lib/errorReporting.js:147`), bank script or link failures (`src/App.jsx:1064`, `src/App.jsx:1102`, `src/App.jsx:4346`), meeting errors (`src/App.jsx:10552`), a coach limit or refusal (`src/App.jsx:13436`, `src/App.jsx:13675`), purchase problems (`src/App.jsx:14744-14745`), reconnect failures (`src/App.jsx:20079`, `src/App.jsx:20095`).
- **Never on first open:** true today, because a meeting cannot be finished on a first open.
- A manual "rate" row is in Settings for the store apps (`src/App.jsx:13139-13142`).

**Plan (small):**

1. Keep the meeting trigger. Add the same call to the second meeting path that misses it today (the household meeting's finish, `src/App.jsx:11352`).
2. Add good moments that Free households also reach, each through the same rule file so the limits still hold:
   - a goal reaches its target;
   - the welcome checklist is completed (never in the first session);
   - the first statement import succeeds;
   - the first real Safe to Spend number after a payday lands, from the second week on.
3. Add an explicit guard: no ask in the first session and none before day 3. Today's trigger makes this true by accident; new triggers need it written down and tested.
4. The "already asked" record is per phone and is not synced (`src/lib/reviewPrompt.js:20-23`; not in `src/lib/persistence.js:32-50`). Two phones in one household can each be asked. Fix: one synced "last asked" key.
5. The comment at `src/App.jsx:18225-18226` still describes the old rule and should be corrected with the change.

No new words: the stores draw the prompt themselves.

---

## 6. Can the website be read without JavaScript

Fetched raw on 2026-11-23, no JavaScript run, counting visible text outside scripts and styles:

| Address | Status | Real text in the HTML | Notes |
|---|---|---|---|
| `/` | 200 | **2,801 characters** | headline, how it works, prices, features, contact; structured data present |
| `/support` | 200 | **2,028** | questions and answers; structured data present |
| `/guides/` | 200 | 772 | |
| a guide article | 200 | 6,007 | |
| `/newsletter/` | 200 | 244 | |
| `/get/` | 200 | 97 | short on purpose, not indexed |
| `/llms.txt`, `/robots.txt`, `/sitemap.xml` | 200 | plain files | |
| **`/privacy`** | 200 | **0** | empty app shell |
| **`/terms`** | 200 | **0** | empty app shell |
| `/app`, `/plans`, `/pricing` | 200 | 0 | app shell; there is no plans page |

**So: yes, the home page can be read without JavaScript.** The gap is `/privacy` and `/terms`. Both are in the sitemap and linked from the AI-readable file (`scripts/build-seo.mjs:156-157`), but a reader without JavaScript gets nothing.

How the existing pre-render works: the build renders two pages from the app's own components (`scripts/prerender-entry.jsx:6-17`, `scripts/prerender-pages.mjs:61`) and writes them into the built site as the home page and the support page (`scripts/build-seo.mjs:176-178`). Every other address gets the empty shell (`netlify.toml:206-211`).

**Plan:**

1. Add two renders to the same entry: the Privacy Policy (`src/App.jsx:14002`) and the Terms (`src/App.jsx:14290`). Write a privacy page and a terms page into the built site the same way.
2. Both components take a date from the server (`launchDate`, `tpfSince`); the Terms text changes with the trial-first switch. The build must pass the same values the live page shows, as the home page already does.
3. Extend `tests/seoPages.test.cjs:1` and `tests/seoPrerender.browser.test.cjs:1`: the text is in the file, and a visitor with JavaScript sees exactly what they see now.
4. When the free plan returns, add plan and price facts to the fact list (`scripts/build-seo.mjs:107-121`), which the build checks word for word against the page. That needs approved words.
5. No word changes in steps 1 to 3. The store-app build is not affected (it runs none of this).

---

## 7. Flinks next to Plaid

From Flinks' public documentation only (docs.flinks.com and flinks.com). Nothing was signed up for, requested or submitted.

### 7.1 What changes the plan

1. **One instance per country.** An instance serves Canada or the US, not both. Each has its own address, keys and webhook address. (docs.flinks.com/guides/getting-started/instances)
2. **No incremental sync.** Each pull returns the whole window (90 or 365 days). There is no cursor and no list of removed transactions. (docs.flinks.com/api/connect/endpoints/account-linking/get-accounts-detail)
3. **Thinner data.** A transaction has an id, date, description, debit, credit and running balance. No pending flag, no merchant, no category unless the separate Enrich product is bought. Accounts have no interest rate, minimum payment or due date. (same page; docs.flinks.com/guides/connect/account-types)
4. **Investments were retired on 2026-04-30.** (docs.flinks.com/api/wealth/getting-started)
5. **Personal details are on by default.** Holder name, address, and full account and transit numbers come back unless the request turns them off. (get-accounts-detail)
6. **Webhooks are set up by Flinks on request,** one address per instance, and cannot be tested in the sandbox. Signing (a keyed hash of the body in a header) also has to be asked for. There is no webhook after a nightly refresh. (docs.flinks.com/api/connect/webhooks; docs.flinks.com/guides/webhooks/hmac-validation)
7. **Nightly refresh is partial.** Banks that ask for a code at each sign-in block it; the docs say to expect partial coverage. (docs.flinks.com/guides/connect/nightly-refresh)
8. **A contract.** The public price page lists a starter tier at $500 a month for 200 connections, a monthly minimum and a one-year term; the currency is not stated. (flinks.com/pricing)

### 7.2 Connect flow

- The server asks for a one-use token (`/GenerateAuthorizeToken`), then the app opens Flinks Connect in a frame: `https://{instance}-iframe.private.fin.ag/v2/?authorizeToken=…` plus options (language, consent, terms link, account picker, days of history, scheduled refresh). (docs.flinks.com/guides/connect/flinks-connect/widget)
- The result comes back as a browser message. The `REDIRECT` event carries a `loginId`, which is permanent until deleted. (docs.flinks.com/guides/connect/flinks-connect/use-event-listener; docs.flinks.com/guides/getting-started/key-concepts)
- There is no native kit: the guidance for phones is a web view, with examples for other frameworks but not for ours. One page allows a custom return address and another says only https is supported. (docs.flinks.com/guides/connect/mobile-integration; docs.flinks.com/guides/connect/oauth-integration)
- A public test bank and test sign-ins exist, with no contract. (docs.flinks.com/guides/connect/flinks-connect/test-users)

### 7.3 Server calls

1. `/Authorize` with the `loginId` gives a short-lived `RequestId` (or asks for a security answer).
2. `/GetAccountsDetail` with that id returns accounts and transactions. A slow bank answers "pending"; the server then polls `/GetAccountsDetailAsync` about every 10 seconds, for up to 30 minutes.
3. `/DeleteCard/{loginId}` removes the connection and its data.
4. `/SetScheduledRefresh` turns nightly refresh on or off.

(docs.flinks.com/guides/connect/standard-integration; docs.flinks.com/api/authorize/error-codes)

### 7.4 Plaid to Flinks, side by side

| Plaid | Flinks |
|---|---|
| Link token, then Link | authorize token, then the Connect frame |
| Public token exchange | none: the `loginId` arrives directly |
| Access token / item id | `loginId` (kept on the server only) plus which instance issued it |
| Transactions sync with a cursor | full pull each time; add or update by transaction id, and treat what is missing from the window as removed |
| Accounts and balances | in the same answer |
| Liabilities | account type and limit only |
| Investments | none |
| Recurring | a flag per transaction, only with Enrich |
| Signed webhooks | one address per instance; keyed hash on request; retried up to 10 times |
| Update mode | reopen Connect when the server answers a sign-in error |
| Item remove | `/DeleteCard` |

### 7.5 What our code would need

1. **A provider on each bank row** (`plaid` or `flinks`) and the instance, in a new migration. The server already keeps the bank's token on the server only; the `loginId` is stored the same way.
2. **A new server function for Flinks,** or a provider layer under `netlify/functions/plaid.js:1`: make the token, store the `loginId`, refresh, delete. A refresh can run far longer than a normal function call, so it needs a background function or the webhook.
3. **A normaliser** to the app's transaction shape, beside `src/lib/plaidNormalize.js:1`: debit and credit become one signed amount; pending is always false; the id gets a provider prefix, with a fallback match on account, date, amount and description because the docs do not promise stable ids.
4. **De-duplication without a cursor,** in the merge step.
5. **A host screen for the frame,** and `frame-src` for Flinks' addresses in the site's security header (`netlify.toml:69`). On phones: a web view test first, since our wrapper is not in their docs.
6. **A webhook receiver** like `netlify/functions/plaid-webhook.js:1`: check the keyed hash over the raw body, answer fast, and ignore repeats (there is no replay protection).
7. **Privacy by default:** send the two "no personal details" options on every call, and still drop account numbers, transit numbers and holder details before anything is stored or logged. Webhook bodies always include them.
8. **Deletion:** `/DeleteCard` on disconnect, on account deletion, and in the new end-of-plan removal job.
9. **Consent words** that name Flinks and say that for most Canadian banks the person's bank sign-in is given to and kept by Flinks. This is a different promise from today's.
10. **The paid gate** from section 2 applies to Flinks exactly as to Plaid.

### 7.6 Only Flinks can answer

- Are transaction ids stable across refreshes? Is there any date-range or changes-only pull?
- Does a reconnect keep the same `loginId`?
- Can one contract cover a Canadian and a US instance for a consumer app? What counts as a "connection", and in which currency is the price?
- Is categorisation included or a paid add-on?
- Can webhook bodies leave out personal details? Can staging and production have different addresses?
- Is our phone wrapper supported, and must the return address be https?
- What is kept after `/DeleteCard`, and how is stored sign-in data treated under Canadian and Quebec privacy law?

---

## 8. Decisions needed before any code

Each has a suggested answer. None is assumed.

| # | Decision | Why it is needed | Suggested |
|---|---|---|---|
| D1 | The plans screen for a new account becomes an offer that can be closed onto Free. | Today it cannot be closed (`src/lib/trialPlanFirst.js:55`). | Yes; show it once after the estimate and again from every locked feature. |
| D2 | Is there still a website trial with a card? | The target says "keep the 14-day store trial" and "Free, no card". The website trial takes a card today (`netlify/functions/billing.js:435-440`). | Keep both trials as they are; Free is the no-card path. |
| D3 | Choosing "connect a bank" on Free opens the plans and the trial first. | The bank step comes before the plans today, and bank sync becomes paid. | Yes. |
| D4 | What-If on Free: unlimited, or a daily ceiling on the AI explanation only? | The figures are free to compute; each explanation is an AI call. | Unlimited figures; a generous daily ceiling on explanations. |
| D5 | Weekly check-in and PDF import on Free: add ceilings? | Both are AI calls with no count today. | Free, each with a daily ceiling. |
| D6 | "Manual transactions": build a way to type one transaction? | None exists; two lines in the app already promise it. | Yes; Free is hard to use without it. |
| D7 | Does Free get bill and payday suggestions from an imported statement? | Detection also runs on statement data today. | No (paid), but keep the meeting's free agenda without the bill questions. |
| D8 | How much notice before a bank is removed? | The target says "at the end of a paid period"; the earlier decision on PR #96 said email first, then 30 days. | Notice at cancel and again 3 days before the paid date; remove on the paid date. A lapse with no cancel (failed renewal) gets the billing retry period first. |
| D9 | Free accounts that hold 1 bank today, and legacy banks. | They are allowed now; Plus 1.1.8 never refuses a bank a person already had. | Email, 30 days, then remove with history kept. |
| D10 | When a partner's cover ends, whose banks are removed? | Cover makes both members paid. | Both members' banks, with the same notice. |
| D11 | Can Plus be bought on Free? | On `plus-1.1.8` Plus sits on any plan and brings up to 10 banks. | Plus needs the paid flourish plan. |
| D12 | The five screens: after sign-up (planned) or before? | Before sign-up the answers live only on the device and carry over only if the account is made within 10 minutes (`src/lib/accountWipe.js:27-28`). | After sign-up. |
| D13 | "Who it's for": which choices, and is there a family choice? | Status drives couple tips; kids data must not grow. | Just me / me and a partner / skip. No family choice yet. |
| D14 | An estimate without a balance returns. | It was removed on purpose in PR #94. | Yes, under its own label and never called Safe to Spend until a balance is in. |
| D15 | Which 4 checklist steps? | There are 5 today. | Pay and bills (the five screens), a balance (bank, statement or typed), a first goal, a first money meeting. |
| D16 | Review prompt: add the four new moments in section 5? | Free households rarely finish a meeting in week one. | Yes, with the first-session and day-3 guard. |
| D17 | Flinks: start a conversation with their sales team? | Cost, a one-year term and thinner data. | Not before the free plan ships; decide with their answers to section 7.6. |

---

## 9. Build order and rough hours

Hours are rough working hours, including tests and one review round. They exclude waiting for approvals and store review.

| Order | Piece | Depends on | Hours |
|---|---|---|---|
| 0 | Decisions D1 to D17 and the wording review | the founder | none of ours |
| 1 | Pre-render `/privacy` and `/terms` | nothing; safe before Plus | 5-7 |
| 2 | Pure files: estimate, goal dates, starter budget move, word modules, unit tests | nothing; safe before Plus | 14-18 |
| — | **Plus 1.1.8 lands (its own work, not counted here)** | | |
| 3 | Server rules behind a switch: bank paid-only on every path, What-If free with a ceiling, ceilings on check-in and PDF import, plans screen answer becomes "offer" | Plus on main | 24-32 |
| 4 | Type one transaction; import a statement after onboarding | 3 | 16-22 |
| 5 | Device gates: check before the bank opens, plan-ended handling, detection gate, plans screen closes onto Free | 3 | 22-28 |
| 6 | New onboarding: five screens, estimate screen, choice screen, partner short path, counts migration | 2, 5 | 40-50 |
| 7 | Starter budget in the flow, goal cards with date and +/-, 4-step checklist with ring | 2, 6 | 20-26 |
| 8 | Words, Terms, Privacy, page description, fact list, pinned tests, in one web deploy | approved words | 10-14 |
| 9 | Review prompt: new moments, first-session guard, synced record | 7 | 4-6 |
| 10 | Bank removal: marker migration, hourly job, notices, history kept on device and in a household, retry | 3, 8, notice period | 30-40 |
| 11 | Store builds, gate, phone checks, store listing and review notes by hand | all | 8-10 |
| | **Total** | | **about 195-255** |
| later | Flinks beside Plaid (after a contract) | D17 | 60-80 |

---

## 10. NEEDS WORDING REVIEW

No final words are written anywhere in this plan. Every item below is a slot that needs approved words before it goes into code. Items marked (replaces) have a current line in sections 2.5 to 2.7.

**Free plan and plans**

1. The name shown for the free plan.
2. The line that says what Free includes (replaces `src/lib/freePlan.js:35`).
3. The list of what the paid plan adds (replaces `src/lib/plusIncludes.js:11-17`, `src/lib/upgradeFlow.js:56-57`, `src/lib/storeOffer.js:124`).
4. The plans screen: the control that continues on Free.
5. The plans screen heading for a new account (replaces `src/lib/trialWords.js:27`).
6. Bank is part of the paid plan: the line at "connect a bank" on Free, with the statement and typing choices (replaces `src/lib/freePlan.js:52`).
7. Server refusal: a bank connection needs the paid plan (replaces `netlify/functions/plaid.js:189`, `netlify/functions/plaid.js:683`).
8. Bank not updating because the plan ended (device line).
9. What-If: remove the daily-limit lines (`src/lib/freePlan.js:43`, `src/App.jsx:2316-2328`, `src/App.jsx:2638`); if a ceiling on explanations is chosen, its line.
10. Coach weekly limit, server message (replaces `netlify/functions/_lib/coachLimits.js:33`).
11. Check-in and PDF import ceilings, if chosen.
12. Automatic bill and payday suggestions are part of the paid plan (where the suggestions used to appear).
13. Trial ended or subscription ended: the line that says the household is now on Free (replaces `src/lib/freePlan.js:32`, `src/App.jsx:20501-20509`).
14. Settings plan card on Free and on paid (replaces `src/App.jsx:13100-13112`).
15. Sidebar and Today upgrade lines (replace `src/App.jsx:6962-6974`, `src/App.jsx:20422-20441`).
16. Locked-screen lines for Credit and the coach-run meeting (replace `src/App.jsx:14419-14462`, `netlify/functions/_lib/coachLimits.js:118`).
17. Store paywall lead, now that What-If is free (replaces `src/lib/storeOffer.js:124` and the Plus 1.1.8 line approved on 2026-11-20).
18. Sign-up and demo "free account" lines (check `src/lib/trialWords.js:58-61`).

**Bank removal**

19. Notice email: subject and body.
20. In-app notice before the date.
21. In-app line after removal: history kept, how to reconnect.
22. The note at cancel about what happens to connected banks.
23. The notice to today's free accounts that hold a bank.

**Legal and store**

24. Terms section 7, all four versions (`src/App.jsx:14338-14339`, `src/lib/freePlan.js:55-107`), with a new date.
25. Terms section 5: banks are removed when a paid period ends (`src/App.jsx:14333`).
26. Privacy: what happens to bank data at removal; the statement-import line corrected for CSV (`src/App.jsx:14069`); the worry answer and "who it's for" in the list of what is collected (`src/App.jsx:14036`).
27. Landing page plan lines and the page description (`src/App.jsx:16029`, `src/App.jsx:16682`, `index.html:21-22`).
28. Plan and price facts for the AI-readable file (`scripts/build-seo.mjs:107-121`) and any new /support question (`src/App.jsx:7516-7526`).
29. Store listings: the plan section on Play and the App Store, subscription display names, review notes business model (`docs/ops/LEGAL-PACKET.md:148`), What's New.

**Onboarding**

30. Worry screen: heading and each option.
31. Pay screen: heading, the three labels, any helper line.
32. "Who it's for" screen: heading, each option, skip.
33. Main bills screen: heading, the pre-set bill names, amount and day labels, skip.
34. Estimate screen: the label that marks it as an estimate, the line on what it is based on, the line on what makes it exact, the buttons.
35. Choice screen: heading and the three choices, with the note that the bank choice is part of the paid plan or trial.
36. Progress label for the five screens (also read by screen readers).
37. Short path for an invited partner.
38. Starter budget: card heading, intro, accept and adjust buttons.
39. Goal cards: suggested goal names, finish date label, the labels read aloud for the + and − buttons, the per-month line.
40. Welcome checklist: title, the 4 step labels, the ring's read-aloud label, the finished state, dismiss.
41. Type a transaction: button, field labels, saved confirmation.
42. Import a statement after onboarding: button and location; the two stale lines corrected (`src/App.jsx:5597`, `src/App.jsx:9518`).

**Later**

43. Flinks: consent words that name Flinks and the stored bank sign-in; the bank picker words.
