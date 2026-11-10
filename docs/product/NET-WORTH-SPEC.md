# Flourish Plus add-on and net worth: spec (2026-11-10)

Branch `net-worth-plus` from main 69480cd. **Nothing here is switched on, merged or submitted.** Everything runs behind `PLUS_ENABLED` (Netlify, unset), and migration `0044_plus_addon.sql` is written, not run. The words are placeholders (`docs/product/NET-WORTH-WORDS.md`) until both reviewers approve them, and the production web build and every store build refuse to build while one is left.

## Amanda's decisions (fixed; not changed here)
- Plus is an add-on on top of any plan: $4.99 a month or $49.99 a year, plus tax.
- The basic plan includes 2 bank logins per person, so a two-person household has 4.
- Plus is unlimited bank logins, with a fair-use limit of 10 per household, stated in the terms.
- The 50 founding households get no Plus discount, and keep $79.99 a year on the main plan.
- Nothing a household can use today moves behind Plus.

## What the repo held before this branch (and where it disagrees with the brief)
1. **"Plus" is already the main plan.** On the website the paid plan is called "Flourish Plus" ("You're on Flourish Plus", Terms section 7, the upgrade screen). In the code it is `profiles.plan = "plus"`, RevenueCat's entitlement `plus`, the App Store products `app.flourishmoney.plus.monthly` and `.annual`, the Play subscription `flourish_plus`, and the Stripe product "Flourish Plus". The add-on therefore has ids of its own everywhere (`plus_addon`, below). **Amanda decides the names households see**; the add-on and the main plan cannot both be called "Flourish Plus".
2. **Net worth is free today and used.** Today's net worth card, the Goals > Net Worth tab with its breakdown, the Investment Portfolio card and Money Wrapped all show net worth or investments to every household. Under "nothing moves behind Plus" they stay free and unchanged. What Plus adds is below.
3. **The app already makes a Plaid Investments call.** Every sync calls `get_investments` (`/investments/holdings/get`) for every connected bank, and Link asks for `investments` as an optional product (`netlify/functions/plaid.js`). The record of 2026-11-06 shows a household's item billed for Investments. So "no Plaid Investments call until Amanda switches it on" is not the state today. This branch adds no Investments call and does not remove the existing one (removing it would take the Investment Portfolio card away). Whether to keep that call is Amanda's decision.
4. **The day-one figure.** Today's net worth card drew a fixed line through five made-up points (-4,200, -3,800, -3,100, -2,600, -1,900) ending at the household's figure. Every household saw its net worth "rising", one with nothing entered included (audit 2026-10-26, H8). The +$2,500 in the audit was that test household's one entered balance; the trend was the invented part. **Removed in this branch** (below).
5. **The bank limit takes something away.** Today a household on any paid plan, a trial or a founding plan can connect unlimited banks. The decided 2 per person, once `PLUS_ENABLED` is on, stops a third new bank for such a person. That is something they can do today; it conflicts with "nothing moves behind Plus" and with "a founding household keeps every feature it has today". Nothing already connected is ever removed (below). **Amanda decides before the flag goes on** whether households from before that day keep unlimited new banks.

## The entitlement (item 1)
- **Its own row.** `public.plus_addon_subscriptions` (0044), one per buyer, never `public.subscriptions`. That table is one plan per household and is what every plan check reads: Plus written there would replace the main plan.
- **Server-checked, failing closed** (`netlify/functions/_lib/plusAddon.js`). Plus is granted only from a row read successfully that is live (active or trialing, with a period end in the future) and whose product is one of the add-on's own:
  - **Website:** a Stripe price configured as a Plus price (`STRIPE_PRICE_PLUS_MONTHLY_CAD`, `STRIPE_PRICE_PLUS_ANNUAL_CAD`). If a Plus price equals a main-plan price, no Plus price counts.
  - **Stores:** RevenueCat's `plus_addon` entitlement is active AND names the store purchase, and that purchase is live, not refunded, not sandbox (except the App Review account), and not Family Sharing. A promotional grant is not Plus.
  - Any read that fails, a missing table, or an unknown price means no Plus. The answer is "unavailable" (503), never "you don't have Plus".
- **Nothing the main plan gives can be taken away.** `getUserPlan` (the main plan's answer) never reads Plus, and the Plus code never writes the main plan's row.
- **One household.** Either member's live Plus covers both, as the fair-use limit is per household.
- **Website:** `plus_checkout` is a Stripe Checkout on a Stripe customer of its own, with no promotion codes, so there is no founding discount. Refunds, the portal and the main plan's "already subscribed" check never see it. `plus_portal` manages it. Deleting the account cancels it at Stripe first.
- **Webhooks:** a Plus checkout or subscription event never reaches the main plan's handling. A Plus-tagged event on a price that is not a Plus price is acknowledged and grants nothing. The RevenueCat webhook writes the store's Plus row from the same subscriber record.
- **The app** shows Plus only on the server's `plus: true` (`src/lib/plusAccess.js`). No answer, a 404 (flag off) or anything odd means nothing about Plus. A 503 shows one plain line, never a number.
- **Website and iPhone.** Both read the same row.
  - **Bought on the website:** the iPhone app has Plus, offers none, and is never handed a website checkout. It is managed and cancelled on the website (`plus_portal`).
  - **Bought on the iPhone:** the website reads the store's row, has Plus, and sells none (409). It is cancelled in the Apple account.
  - **Bought in both:** the first row is kept, the second is logged as a conflict for support to refund, and the household keeps Plus.
- **Not built:** the Plus purchase screens on the website and in the apps. The store products don't exist yet, and item 4 stops the screens.

## Bank logins (item 2)
`netlify/functions/_lib/bankLimits.js`. A bank login is one Plaid item: one sign-in at one bank. Every item counts except one the bank revoked; one that needs a fresh sign-in is still held.
- **Basic:** 2 per person, counted per person, never pooled. **Plus:** 10 for the household, whoever holds them.
- **A limit only stops a NEW bank.** It is asked before Plaid opens (`create_link_token` without an item) and again at `exchange_token` and `migrate_items`.
  - A reconnect is never limited.
  - Sync, accounts, transactions, investments and liabilities never read the limit, and nothing is disconnected or stops updating.
  - A household over its plan keeps every bank.
- **A read that fails** refuses the new bank with 503 and a plain line, never a guessed count.
- **Plus also lifts the free plan's one-bank cap.**
- `bank_limit_status` gives Settings the numbers (404 while off).

## Net worth with Plus (item 3)
`src/lib/netWorthPlus.js`, pure. It reads what the app already holds and makes no call of any kind.
- **What it shows.**
  - Each linked cash, investment, card and loan account, at the bank's balance as it is (an overdrawn account is negative, not $0).
  - Investment accounts grouped as registered (RRSP, TFSA, FHSA, RESP, RRIF, LIRA, LRSP, LIF, LRIF, RLIF, PRIF, RDSP, by Plaid's own subtype) or non-registered (brokerage). Anything else is "not stated", never guessed.
  - Holdings as detail under their account, each in its own currency, and never added on top of the account's balance.
  - Debts the household entered, unless one is the linked card itself.
  - Entries for a **home, a car or a pension** only: the household's own figure, its currency (CAD or USD) and the date entered.
- **The rules.**
  - Every part keeps the currency it arrived in. Totals are per currency and are never added together or converted.
  - No figure is estimated: no projection, no growth, no gain, no advice.
  - A total, for any currency, only when every part is real. Any one of these means no total at all, and the parts are listed with what is missing:
    - a value missing;
    - a currency not stated;
    - a card that may be counted twice until the household answers;
    - a kind other than home, car or pension.
- **Known gaps before a screen can use it.**
  - `plaid.js` stamps `"CAD"` on an account or holding Plaid sent without a currency, and `0` on a holding with no value. That is an invented currency and an invented zero. The model cannot tell them apart from real ones, so they must come through as "not stated" first.
  - A typed debt has no currency of its own; the model takes the profile's stated country only.
- **Day one, removed** (`src/App.jsx`, Today's net worth card).
  - Nothing entered or linked: a factual empty state (`networth-empty-title`, `networth-empty-body`), and no figure.
  - Otherwise: the household's own figure. A line is drawn only once there are two months of its own snapshots (the existing `NetWorthSparkline`); before that, one line says so (`networth-trend-not-yet`).
- **Plaid Investments while it is "off".** This branch makes no new call. What runs today keeps running (item 3 of the section above).

## Partner visibility (item 4): STOPPED before the screen
In couple mode both people read and write one shared blob, and "both see every account" (COUPLE-MODE-SPEC). Net worth with Plus would put these in front of the other partner. A household might not expect them, and in each case one partner could reasonably want them private:
1. **Holdings line by line** of an account only one partner linked (an RRSP from before they met, a stock plan): every holding, ticker, quantity and value. Today the blob already carries them and the Investment Portfolio card shows their total to both; the screen would list them.
2. **What a registered account's type reveals.** An RDSP is only open to a person eligible for the disability tax credit, so its name discloses a health fact. An RESP names a beneficiary plan.
3. **A pension one partner enters**: its value, which is often individual (a workplace pension, one from a past marriage).
4. **Free-text labels** on an entry ("Mum's share of the house").
5. **After a partner leaves.** The leave cleanup removes the leaver's bank accounts, holdings and bank-made debts, but nothing records who typed an entry. A leaver's home, car or pension figures would stay with the other person.
6. **Debts on one partner's own card or loan.** These are already shared today; the screen would put them beside the household total.

So the Plus net worth screen is not built. What would let it be built is Amanda's decision:
- whose entries and accounts each partner sees;
- an `enteredBy` on every entry, removed when that person leaves;
- whether account types are named.

## Products to create (item 5)
Prices are left blank for Amanda to type. Nothing for the add-on exists yet: the repo and the docs name no add-on product, no RevenueCat `plus_addon` entitlement and no Stripe Plus price. The consoles were not opened.

**App Store Connect** (Apps > Flourish: Money, Handled > Monetization > Subscriptions):
1. Subscription Groups > + > Reference Name `Flourish Plus add-on` (a group of its own: Apple lets a person hold one subscription per group, and Plus must sit beside the main plan's group `Flourish` and the founding group `Flourish Founding`, which stays as it is). Availability: Canada only.
2. In it, Create: Reference Name `Plus add-on monthly`, Product ID `app.flourishmoney.plusaddon.monthly`, Duration `1 Month`, Price (Canada): ____.
3. Create: Reference Name `Plus add-on annual`, Product ID `app.flourishmoney.plusaddon.annual`, Duration `1 Year`, Price (Canada): ____.
4. Levels: both on the **same level** (one service at two durations; Apple: equal content, different durations, can share a level).
5. Each: display name and description: placeholders until approved. Family Sharing **off**. Introductory offers **none**. Review screenshot and notes: when the screen exists.
6. Cannot change later: the Product ID (the help pages read don't say it can be changed; treat as permanent), the duration once submitted for review, Family Sharing once on.

**Play Console** (Monetize with Play > Products > Subscriptions):
1. Create subscription: Product ID `flourish_plus_addon`, Name: placeholder.
2. Base plan ID `monthly`, Auto-renewing, `1 month`, Price (Canada): ____. Activate.
3. Base plan ID `annual`, Auto-renewing, `1 year`, Price (Canada): ____. Activate.
4. Offers: **none** on either (no trial, no founding discount).
5. Cannot change later: the Product ID once created, a base plan ID once activated.

**RevenueCat:**
1. Entitlement `plus_addon`, attached to the four add-on products only. Never attach them to `plus`.
2. Products `app.flourishmoney.plusaddon.monthly`, `.annual` and `flourish_plus_addon:monthly`, `:annual`.

**Stripe** (live mode, then the same in test mode):
1. Product: name is a placeholder; not "Flourish Plus", which is the main plan's.
2. Price: recurring monthly, CAD, Tax behaviour **Exclusive**, amount ____.
3. Price: recurring yearly, CAD, Tax behaviour **Exclusive**, amount ____.
4. Cannot change later: a price's amount, currency and interval (create a new price instead), and tax behaviour once it is set.
5. Netlify, Amanda only:
   - `STRIPE_PRICE_PLUS_MONTHLY_CAD` and `STRIPE_PRICE_PLUS_ANNUAL_CAD`, then `PLUS_ENABLED=true`;
   - first run 0044.
   - The webhook endpoint needs no new event.

## Not built, on purpose
- The Plus purchase screens and the Plus net worth screen (item 4).
- The entry form for a home, a car or a pension.
- The Settings line for banks over the limit: the line and the server's numbers exist, but the screen doesn't.
- The terms' fair-use sentence (new wording).
