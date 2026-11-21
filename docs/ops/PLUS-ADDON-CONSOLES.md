# flourish Plus add-on: what to create in the four consoles (1.1.8)

Written 2026-11-20. **Set up by Amanda on 2026-11-21**, except the parts marked *still to do*. The steps are kept as the record of what was typed.

## Where it stands (2026-11-21)

| Console | Done | Ids | Still to do |
|---|---|---|---|
| App Store Connect | Group `Flourish Plus add-on`; monthly (CAD 4.99) and annual (CAD 49.99, 1 year, paid upfront); Canada only; both on level 1; names C1 to C5 | group `22601027`; `app.flourishmoney.plusaddon.monthly`; `app.flourishmoney.plusaddon.annual` | The review screenshot and review notes (steps 20, 21 and 34): they wait for the 1.1.8 TestFlight build. Then step 38. |
| Play Console | Subscription `flourish_plus_addon`; base plans `monthly` (CAD 4.99) and `annual` (CAD 49.99); Canada only; both Active; names C6 to C10 | `flourish_plus_addon:monthly`; `flourish_plus_addon:annual` | Nothing |
| RevenueCat | The 4 products; entitlement `plus_addon` with only those 4; offering `plus_addon` (`$rc_monthly`, `$rc_annual`), not Current | entitlement `entl260a511574` | Nothing |
| Stripe, TEST mode | Product `flourish Plus`; monthly and annual prices, tax exclusive | product `prod_VfNInBBZ798oe4`; monthly `price_1Ue2Y2AXAZzlop97hv6dtKgY`; annual `price_1Ue2YcAXAZzlop97WGae34gd` | Nothing |
| Stripe, LIVE mode | Nothing yet | none | All of section D again in live mode, then steps 23 and 24 for Production |
| Netlify | `STRIPE_PRICE_PLUS_MONTHLY_CAD` and `STRIPE_PRICE_PLUS_ANNUAL_CAD` set to the two TEST ids, for the **Deploy previews** context only (2026-11-21) | as above | Production: both unset, on purpose, until the live prices exist |

Read back on 2026-11-21: RevenueCat's entitlement `plus` has **6** products, and none is an add-on product (section C, step 8). `PLUS_ENABLED` is not set in any Netlify context, so no deploy offers Plus yet, previews included.

- The ids are the ones the code expects (`src/lib/plusBuy.js`, `netlify/functions/_lib/plusAddon.js`; `tests/plusBuy.test.cjs` holds the two together). **Type each id exactly. An id cannot be changed after it is created.**
- Prices: **CAD 4.99 a month, CAD 49.99 a year**, plus tax. No trial, no introductory price, no founding discount, no promotion code.
- Names a buyer sees are marked *approved 2026-11-20* (ChatGPT 100, Grok 100, Amanda). Type each exactly as written. They are listed as C1 to C12 in `docs/review/PLUS-BUY-COPY.md`.
- Keys and secrets never go into the repo or a chat. Nothing here needs a new secret: the price ids in section D are not secret.
- Do the sections in order. A, B and C can be done before the 1.1.8 build exists, except the two review screenshots.

## A. App Store Connect

Apps → Flourish: Money, Handled → Monetization → Subscriptions.

The group:

1. Subscription Groups → **+**
2. Reference Name: `Flourish Plus add-on`
3. Create
4. Group → App Store Localization → **+** → English (Canada)
5. Subscription Group Display Name: `flourish Plus` (*approved 2026-11-20*)
6. App Name Display Options: Use App Name
7. Save

Monthly (inside the `Flourish Plus add-on` group, **Create**):

8. Reference Name: `Plus add-on monthly`
9. Product ID: `app.flourishmoney.plusaddon.monthly`
10. Create
11. Subscription Duration: `1 Month`
12. Availability: Canada only (untick every other country)
13. Subscription Prices → **+** → Canada: `CAD 4.99`
14. App Store Localization → **+** → English (Canada)
15. Display Name: `flourish Plus monthly` (*approved 2026-11-20*, 30 characters at most)
16. Description: `Net worth, investments, more banks` (*approved 2026-11-20*, 45 characters at most)
17. Family Sharing: **off** (it can never be turned off once on)
18. Introductory Offers: **none**
19. Promotional Offers: **none**
20. Review Information → Screenshot: the flourish Plus screen from the 1.1.8 TestFlight build, with both prices showing
21. Review Information → Review Notes: where the screen is (Settings → flourish Plus), that it is an optional add-on to any plan, and the App Review account
22. Save

Annual (same group, **Create**):

23. Reference Name: `Plus add-on annual`
24. Product ID: `app.flourishmoney.plusaddon.annual`
25. Create
26. Subscription Duration: `1 Year`
27. Availability: Canada only
28. Subscription Prices → **+** → Canada: `CAD 49.99`
29. App Store Localization → English (Canada) → Display Name: `flourish Plus annual` (*approved 2026-11-20*)
30. Description: `Net worth, investments, more banks` (*approved 2026-11-20*)
31. Family Sharing: **off**
32. Introductory Offers: **none**
33. Promotional Offers: **none**
34. Review Information: the same screenshot and notes as steps 20 and 21
35. Save

Then:

36. `Flourish Plus add-on` group → Levels: put monthly and annual on the **same level**
37. Leave the `Flourish` and `Flourish Founding` groups exactly as they are
38. When 1.1.8 is submitted: version page → In-App Purchases and Subscriptions → **+** → tick both add-on subscriptions, so they are reviewed with the build

What to expect: both subscriptions read "Missing Metadata" until the screenshot is in, then "Ready to Submit". Apple reviews a group's first subscriptions together with an app version.

## B. Play Console

Flourish → Monetize with Play → Products → Subscriptions.

1. **Create subscription**
2. Product ID: `flourish_plus_addon`
3. Name: `flourish Plus` (*approved 2026-11-20*)
4. Create
5. Subscription details → Benefits → `Net worth by currency` (*approved 2026-11-20*)
6. Benefits → `Investment holdings` (*approved 2026-11-20*)
7. Benefits → `More connected banks` (*approved 2026-11-20*)
8. Description: `An optional add-on to any flourish plan.` (*approved 2026-11-20*)
9. Save
10. Base plans → **Add base plan**
11. Base plan ID: `monthly`
12. Type: `Auto-renewing`
13. Billing period: `1 month`
14. Grace period and account hold: leave Google's defaults
15. Resubscribe: leave on
16. Price → Set prices → untick every country but Canada → Canada: `CAD 4.99`
17. Save, then **Activate**
18. Base plans → **Add base plan**
19. Base plan ID: `annual`
20. Type: `Auto-renewing`
21. Billing period: `1 year`
22. Price → Canada only: `CAD 49.99`
23. Save, then **Activate**
24. Offers: **none** on either base plan. Do not add one.
25. Leave `flourish_plus` (the main plan) exactly as it is

Nothing else is needed in Play: the notifications topic and the licence testers are already set for the app.

## C. RevenueCat

Project Flourish. Do this after A and B, so the products can be imported.

1. Product catalog → Products → **+ New** → App Store app → import `app.flourishmoney.plusaddon.monthly`
2. Import `app.flourishmoney.plusaddon.annual`
3. Products → **+ New** → Play Store app → import `flourish_plus_addon:monthly`
4. Import `flourish_plus_addon:annual`
5. Entitlements → **+ New** → Identifier: `plus_addon`
6. Description: `flourish Plus add-on`
7. Entitlement `plus_addon` → Attach → all four add-on products, and nothing else
8. Check entitlement `plus`: it still has its six products, and **none** of the four add-on products. **Checked 2026-11-21: 6, not 8.** They are `app.flourishmoney.plus.monthly`, `app.flourishmoney.plus.annual`, `app.flourishmoney.founding.annual` (Flourish iOS) and `flourish_plus:monthly`, `flourish_plus:annual`, `flourish_plus:founding` (Flourish Android). The Products page lists 10 in all (these 6 and the 4 add-on products), each with exactly 1 entitlement, so no product sits on both. No page showed a count of 8.
9. Offerings → **+ New** → Identifier: `plus_addon`
10. Description: `flourish Plus add-on`
11. Do **not** make it Current (`default` stays Current)
12. `plus_addon` → Packages → **+ New** → Identifier: `Monthly` (`$rc_monthly`)
13. Attach → App Store: `app.flourishmoney.plusaddon.monthly`
14. Attach → Play Store: `flourish_plus_addon:monthly`
15. `plus_addon` → Packages → **+ New** → Identifier: `Annual` (`$rc_annual`)
16. Attach → App Store: `app.flourishmoney.plusaddon.annual`
17. Attach → Play Store: `flourish_plus_addon:annual`
18. Save

Nothing else changes: the webhook, the API keys and the transfer behaviour stay as they are. The app reads the offering named `plus_addon` and nothing else for Plus, so a product left out of it is simply not offered.

## D. Stripe

Do it in **test mode** first, try it on a deploy preview, then repeat every step in **live mode**. The two modes have different price ids.

1. Product catalog → **+ Add product**
2. Name: `flourish Plus` (*approved 2026-11-20*; it shows on Checkout, receipts and the portal)
3. Description: `An optional add-on to any flourish plan: net worth, investments and more connected banks.` (*approved 2026-11-20*)
4. Tax code: the same one the product `Flourish Plus` uses
5. Pricing model: Flat rate
6. Price: `4.99`
7. Currency: `CAD`
8. Recurring
9. Billing period: Monthly
10. Include tax in price: **No** (tax exclusive)
11. Add product
12. Open the new product → **+ Add another price**
13. Price: `49.99`
14. Currency: `CAD`
15. Recurring
16. Billing period: Yearly
17. Include tax in price: **No**
18. Add price
19. Copy the monthly price's id (`price_…`)
20. Copy the annual price's id (`price_…`)
21. Settings → Billing → Customer portal: **leave it exactly as it is.** "Let customers switch plans" is ON there, with the main plan's prices ($11.99 a month, $99.99 a year), and main-plan customers use it. It is the account's shared default configuration. **Plus does not use it** (fixed in code, 2026-11-21): every Plus portal session names a portal configuration of its own, with switching plans off, cancelling on and updating the card on. The server makes that configuration through Stripe's API the first time a Plus buyer taps Manage subscription, and finds it again afterwards by its mark (`metadata.kind = plus_addon_portal`). That Dashboard page edits the shared default only, so there is nothing to click for Plus's. If it can be neither found nor made, no portal opens at all: a Plus buyer is never sent to the shared one.
22. Nothing to set for step 21. One thing to check, once, in each mode: Settings → Billing → Customer portal → "Customer portal link" (Stripe's own no-code sign-in page). If it is switched on, anyone who pays can sign in there with their email, and the link on that page belongs to the shared default configuration, so a Plus buyer could reach plan switching that way. Keep it **off**. (Read it in the Dashboard; the code cannot see or change it.)

Then in Netlify (Site configuration → Environment variables). These two are ids, not secrets:

23. Add `STRIPE_PRICE_PLUS_MONTHLY_CAD` = the monthly price id. Test id for Deploy previews, live id for Production. **Deploy previews: done 2026-11-21** (`price_1Ue2Y2AXAZzlop97hv6dtKgY`). Production: not set.
24. Add `STRIPE_PRICE_PLUS_ANNUAL_CAD` = the annual price id. Same split. **Deploy previews: done 2026-11-21** (`price_1Ue2YcAXAZzlop97WGae34gd`). Production: not set.

Nothing else changes in Stripe: the webhook endpoint and its events already carry Plus (`checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`), no promotion code applies to Plus, and Stripe Tax adds tax at checkout as it does for the main plan.

Until steps 23 and 24 are done for a context, the website's button there answers "not available yet". A deploy preview also needs `PLUS_ENABLED` = `true` for the Deploy previews context before it shows Plus at all, and the database it talks to needs migrations 0044, 0045 and 0052: neither is done. A Plus price id that is also a main-plan price id is refused by the server: no Plus is ever read from it.

In live mode, the first Plus buyer to tap Manage subscription makes the live Plus portal configuration (step 21). Nothing needs doing beforehand.

## E. Switching it on (not now, and only on Amanda's word)

Listed so nothing is forgotten. None of this is done by creating the products.

1. Migrations: **all four are applied in production** (`0044` and `0045` earlier; `0051` and `0052` on 2026-11-21, each with its own check returning the expected values). Nothing left to run.
2. The store apps: 1.1.8 is the first that shows Plus. An older app is no longer a risk to privacy: the server sends net worth entries and holdings only to an app that says it is 1.1.8 or newer (2026-11-21, `PLUS_MIN_CLIENT`), so an older app shows none. Holdings an older app saved in a household's shared data before Plus stay there until a 1.1.8 app syncs and clears them
3. The 20 purchase lines are approved and in the code (done 2026-11-20)
4. Netlify → `PLUS_ENABLED` = `true` on Production, then a deploy
5. One real purchase in each store and one on the website, each refunded afterwards

## F. Seeing Plus before it is on for everyone: the tester switch (built 2026-11-21, not set)

`PLUS_TESTER_USER_IDS` is a server setting in Netlify: a comma-separated list of account ids. While `PLUS_ENABLED` is off, Plus shows and works for those accounts only, on the iPhone app, the Android app and the website. Everyone else, a tester's own partner included, sees nothing new. The ids live in Netlify only: **never put an account id in this repo.**

What it takes for Amanda to see Plus on her phone, in order. Each step needs her go; none is done.

1. **Merge PR #154 into `main`.** Production's server has no Plus code until then.
2. **Let Netlify deploy `main` to production** (it builds from GitHub on the merge). After this, nobody sees Plus yet: `PLUS_ENABLED` is unset and no tester is named.
3. **Netlify, one setting:** Site configuration → Environment variables → Add a variable → Key `PLUS_TESTER_USER_IDS` → Value: Amanda's account id (Supabase → Authentication → Users → her row → User UID) → Scope: Functions → Context: Production → Save.
4. **Deploy production once more** (Deploys → Trigger deploy → Deploy site). Netlify functions keep the settings of the deploy they were built in, so the setting does nothing until this deploy.
5. **Open flourish on the phone** with TestFlight build 1.1.8 (526916), or the Android internal testing build (32), signed in to that account. The net worth card shows the locked state with "See flourish Plus", and Settings has a flourish Plus card.

What she will find, so nothing surprises her:

- **Buying on the iPhone (TestFlight) is a sandbox purchase: no money is charged.** A tester's sandbox purchase is accepted for the tester's account only. The App Store products must be past "Missing Metadata" first, which needs the review screenshot on each (section A, steps 20 and 34); until then the screen says Plus is not available to buy yet.
- **Buying on Android (internal testing)** is a test purchase, with no money charged, only when her Google account is listed as a licence tester (Play Console → Settings → License testing). Check that before buying.
- **Buying on the website** says "not available yet", because Production has no Plus price ids (section D, steps 23 and 24, wait for the live Stripe product). A real purchase there would be a real charge.
- **To see net worth with Plus without buying anything:** give her account complimentary Plus (`0051`; the steps are in `~/Documents/Flourish/COMPLIMENTARY-ACCESS.md`, not in this repo).
- **Bank limits apply to her account** as they will for everyone: 2 banks per person without Plus, 10 per household with it. Banks already connected stay connected.
- **Her partner's account sees nothing new**, and is sent only the holdings she chooses to share.

To switch the tester view off again: delete `PLUS_TESTER_USER_IDS` in Netlify and deploy. To switch Plus on for everyone: section E.
