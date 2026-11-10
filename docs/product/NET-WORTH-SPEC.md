# Flourish Plus add-on and net worth: spec (2026-11-10)

Branch `net-worth-plus` from main 69480cd. **Nothing here is switched on, merged or submitted.** Everything runs behind `PLUS_ENABLED` (Netlify, unset), and migration `0044_plus_addon.sql` is written, not run. The words are placeholders (`docs/product/NET-WORTH-WORDS.md`) until both reviewers approve them, and the production web build and every store build refuse to build while one is left.

## Amanda's decisions (fixed; not changed here)
- Plus is an add-on on top of any plan: $4.99 a month or $49.99 a year, plus tax.
- The basic plan includes 2 bank logins per person, so a two-person household has 4.
- Plus is unlimited bank logins, with a fair-use limit of 10 per household, stated in the terms.
- The 50 founding households get no Plus discount, and keep $79.99 a year on the main plan.
- Nothing a household can use today moves behind Plus.

## Amanda's answers, 2026-11-10 (these replace the open questions below)
There are no paying households yet, so nothing is grandfathered.
1. **Names.** To households the main paid plan is "flourish" (monthly, annual, founding), and "flourish Plus" is only the add-on. Every product id and entitlement id stays; only display names change. Every place is listed in `docs/product/PLAN-NAMES.md`; the new words are placeholders until reviewed.
2. **Net worth and investments move behind Plus**: the net worth figure, Goals' Net Worth tab, Today's net worth card, Wrapped's net worth part and investment holdings. Every household still sees each bank, card and loan balance where it sees it now. Without Plus there is a plain locked state, never a blank or a broken screen. The screens that change are listed below.
3. **Plaid Investments: holdings only for Plus.** How Plaid bills is set out below, with the source.
4. **Bank limits apply to everyone, with no cutoff date.** Never disconnect a bank. A household already over the limit keeps what it has and can't add another.
5. **Partner privacy: private by default**, with "share with my partner" per item. An RDSP is never shared by default. The household total shows only when every part is shared and real. A leaver's entries go with them. This is written below as "Private by default", and the screen is built to it.

### The screens that change (behind PLUS_ENABLED; with it off, every one is exactly as today)
- **Today's net worth card.**
  - Without Plus: the locked state, with no figure and no line.
  - With Plus: this person's net worth, per currency, labelled household or "your own".
- **Today's small "Net worth" tile.** Without Plus: a short locked line. With Plus: the totals per currency, or "—" when there is no total.
- **Today's Investment Portfolio card.**
  - Without Plus: the locked state, shown when the household has an investment account.
  - With Plus: not shown. That card added holdings across currencies; the holdings are on the Net Worth tab instead, each in its own currency.
- **Goals' Net Worth tab.**
  - Without Plus: the locked state where the figure was. Every bank, card and loan row is still listed with its balance, and the possible-double-count prompt stays. Hidden: the total, "How we got this", the investment rows, and Invested and Total Gain.
  - With Plus: the Plus net worth screen (`src/NetWorthPlusScreen.jsx`).
- **Wrapped's net worth slide.** Without Plus: the locked state, and no "Invested" figure; the Health Score stays. With Plus: this person's totals.
- **Not changed, for Amanda to decide:**
  - The Health Score keeps its Investments line ("$X invested", from investment account balances).
  - What-If's investing scenarios read holdings, which are empty without Plus.
- **The demo** (sample data, no account) shows everything as today.

### Plaid Investments
- **What runs today.** Every sync asks for holdings on every bank, for every household. Link has asked for Investments as an optional product since Phase B3.
- **Billing.** Investments is a monthly subscription per Item. Plaid charges "even if no API calls are made for the Item" once Investments is on it, and "Once a subscription fee product has been added to an Item, it is not possible to end the subscription and leave the Item in place" (https://plaid.com/docs/account/billing/). Only `/item/remove` ends it (https://plaid.com/docs/api/items/). A product passed as `additional_consented_products` is not billed until its endpoint is first called (https://plaid.com/docs/link/initializing-products/).
- **So, behind PLUS_ENABLED:**
  - Link asks for Investments as an additional consented product, for everyone, so buying Plus later needs no new sign-in.
  - `get_investments` makes no Plaid call at all without Plus.
  - A bank linked from then on is not billed for Investments until a Plus household first asks.
  - A bank already linked with Investments on it stays billed until it is removed: stopping the calls does not change that.
- **The live items' products** could not be read from this Mac. `/item/get` needs the production Plaid keys, and there are none here.
  - Plaid's read-only connector reports totals only: 5 active Transactions items on 2026-10-31, and one Investments Holdings removal counted from 2026-11-06.
  - Amanda's own item was recorded as billed for Investments and Liabilities on 2026-11-06.

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
- **For everyone, with no cutoff date** (Amanda, 2026-11-10: no paying households yet, so nothing is grandfathered). A household already over the limit keeps every bank and can't add another until it is under; a reconnect is always allowed.
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

## Private by default between partners (Amanda, 2026-11-10)
The six cases found earlier now have these rules, and the Plus net worth screen is built to them:
1. holdings line by line;
2. what an account's type reveals;
3. a pension one partner enters;
4. free-text labels;
5. a leaver's entries;
6. one partner's own debts.

- **Each person's own.** Holdings, the accounts they linked, and their entries for a home, a car or a pension are visible only to them, unless they turn on "share with my partner" for that one item.
  - Every switch starts off. Nothing is shared as part of anything else.
  - An entry and its label are in the person's own row (`net_worth_entries`, migration 0045), never in the shared household blob.
  - The share choice for an account is in `net_worth_shares`.
- **An RDSP, an HSA,** or any account whose type could reveal a health or disability fact, is never shared by default. Its switch carries a warning, and the screen keeps marking it as sensitive once it is shared.
- **What a partner gets.** The server (`netlify/functions/networth.js`) gives a partner only:
  - the entries that were shared;
  - the ids of the accounts that were shared;
  - a yes or no to "is everything shared?". There is never a count, a label or a figure for what is private.
- **Holdings.** `get_investments` gives a partner's bank's holdings only for the accounts its owner shared. With Plus on, the app keeps holdings on the device and never writes them into the shared blob, and it clears any copy already there.
- **The total.**
  - A partner sees a household total only when the other person has shared everything and every part is real. Otherwise each sees only their own total.
  - What both already see as the household's is listed but not in "your own": debts typed in the app, and accounts no bank linked.
  - An account from a bank this device can't place is never shown, and no household total is shown while one is there.
- **Leaving.** Rows stay in their owner's name, and a partner's view is worked out from the current membership each time. When someone leaves, their entries and choices go with them, and the one who stays sees none of it. This matches 0041 for meetings; no SQL change to the leave is needed.
- **Choices made here.**
  - **The Net Worth tab with Plus.** In couple mode the partner's private accounts are not listed there, though their balances are still shown on every other screen, as couple mode always shows them. Rule 5 is about that screen, and it wins there.
  - **Older accounts.** One saved before banks were stamped on accounts (no `_item`) counts as the household's, as on every other screen.

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
1. Product: name "flourish Plus" (Amanda, 2026-11-10). Rename the main plan's product (today "Flourish Plus") to "flourish" first, so two products never share that name (`PLAN-NAMES.md`).
2. Price: recurring monthly, CAD, Tax behaviour **Exclusive**, amount ____.
3. Price: recurring yearly, CAD, Tax behaviour **Exclusive**, amount ____.
4. Cannot change later: a price's amount, currency and interval (create a new price instead), and tax behaviour once it is set.
5. Netlify, Amanda only:
   - `STRIPE_PRICE_PLUS_MONTHLY_CAD` and `STRIPE_PRICE_PLUS_ANNUAL_CAD`, then `PLUS_ENABLED=true`;
   - first run 0044.
   - The webhook endpoint needs no new event.

## Before PLUS_ENABLED goes on (Amanda)
1. Run 0044, then 0045. Each has a read-only check at its end.
2. Create the products (above), then set the Plus price variables.
3. **Every store app in use must be the build with this code (1.1.6 or later).** An older app doesn't know `plus_mode`. It would write a Plus member's own holdings into the shared household blob, where the partner can read them. The website updates when it deploys.
4. Approve the words. Until then the production and store builds refuse to build.
5. Give the Plus portal its own Stripe portal configuration, with plan switching off.

## The review round (2026-11-10)
**Fixed:**
- **HIGH: a reconnect was refused at the limit.** Plaid's update mode sends a reconnect back through `exchange_token`. The limit now applies only after the exchange, and only to an item that adds a bank: not this person's own, and not a bank they already hold. A refused new item is removed at Plaid.
- **The store's Plus row erased the Stripe customer.** That would have let a website Plus charge outlive account deletion. The customer is now kept, and `delete_account` cancels through any row's customer.
- **A main-plan subscription is never routed to Plus**, even when a Plus price is set to an old main price.
- **The model no longer drops an account type it doesn't know**, and a card in credit stays positive.
- **The demo's figures can no longer start a real household's line.** No snapshot is taken in demo, and leaving the demo clears the history.

**Left, and written down:**
- Give the Plus portal its own Stripe portal configuration, with plan switching off. Check the dashboard: today both portals use the default.
- Two exchanges at the same moment can both pass the count. The extra bank is kept, nothing breaks.
- Run 0044 before turning `PLUS_ENABLED` on. Otherwise every RevenueCat delivery fails (500) on the Plus sync.
- Today's card still totals only the household's own currency and still includes an unanswered pair. Both are unchanged from today.
- With `CREATORS_ENABLED` on, a Plus invoice would earn a creator commission (`_lib/creators.js` finds the payer by the invoice's metadata). That is Amanda's decision.

## Not built, on purpose (updated 2026-11-10)
- **The Plus purchase screens**, on the website and in the apps: the store products don't exist yet.
- **The Settings line for banks over the limit.** The server's numbers and the words exist; the screen doesn't.
- **The terms' fair-use sentence** (new wording).
- **Now built:** the Plus net worth screen (Goals' Net Worth tab with Plus), with its entry form for a home, a car or a pension.
