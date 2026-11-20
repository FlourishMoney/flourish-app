# flourish Plus add-on: what to create in the four consoles (1.1.8)

Written 2026-11-20. **Nothing below exists yet** (all four consoles were read that day: no add-on group, subscription, entitlement, offering or price). Until it does, the Plus screen says "not available yet" and sells nothing.

- The ids are the ones the code expects (`src/lib/plusBuy.js`, `netlify/functions/_lib/plusAddon.js`; `tests/plusBuy.test.cjs` holds the two together). **Type each id exactly. An id cannot be changed after it is created.**
- Prices: **CAD 4.99 a month, CAD 49.99 a year**, plus tax. No trial, no introductory price, no founding discount, no promotion code.
- Names a buyer sees are marked *draft*. They are listed for review in `docs/review/PLUS-BUY-COPY.md` and are not approved.
- Keys and secrets never go into the repo or a chat. Nothing here needs a new secret: the price ids in section D are not secret.
- Do the sections in order. A, B and C can be done before the 1.1.8 build exists, except the two review screenshots.

## A. App Store Connect

Apps → Flourish: Money, Handled → Monetization → Subscriptions.

The group:

1. Subscription Groups → **+**
2. Reference Name: `Flourish Plus add-on`
3. Create
4. Group → App Store Localization → **+** → English (Canada)
5. Subscription Group Display Name: `flourish Plus` (*draft*)
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
15. Display Name: `flourish Plus monthly` (*draft*, 30 characters at most)
16. Description: `Net worth, investments, more banks` (*draft*, 45 characters at most)
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
29. App Store Localization → English (Canada) → Display Name: `flourish Plus annual` (*draft*)
30. Description: `Net worth, investments, more banks` (*draft*)
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
3. Name: `flourish Plus` (*draft*)
4. Create
5. Subscription details → Benefits → `Net worth by currency` (*draft*)
6. Benefits → `Investment holdings` (*draft*)
7. Benefits → `More connected banks` (*draft*)
8. Description: `An optional add-on to any flourish plan.` (*draft*)
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
8. Check entitlement `plus`: it still has its six products, and **none** of the four add-on products
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
2. Name: `flourish Plus` (*draft*; it shows on Checkout, receipts and the portal)
3. Description: `An optional add-on to any flourish plan: net worth, investments and more connected banks.` (*draft*)
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
21. Settings → Billing → Customer portal → "Customers can switch plans": check that it is **off**, or that its product list has no main-plan price. A Plus buyer has a Stripe customer of their own, and must not be able to switch Plus into the main plan there.
22. Customer portal → Cancel subscriptions and Update payment methods: on (they already are for the main plan)

Then in Netlify (Site configuration → Environment variables). These two are ids, not secrets:

23. Add `STRIPE_PRICE_PLUS_MONTHLY_CAD` = the monthly price id. Test id for Deploy previews, live id for Production.
24. Add `STRIPE_PRICE_PLUS_ANNUAL_CAD` = the annual price id. Same split.

Nothing else changes in Stripe: the webhook endpoint and its events already carry Plus (`checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`), no promotion code applies to Plus, and Stripe Tax adds tax at checkout as it does for the main plan.

Until steps 23 and 24 are done the website's button answers "not available yet". A Plus price id that is also a main-plan price id is refused by the server: no Plus is ever read from it.

## E. Switching it on (not now, and only on Amanda's word)

Listed so nothing is forgotten. None of this is done by creating the products.

1. Supabase SQL editor: run `0044`, then `0045`, then `0051`, then `0052`, each with its own check. Without `0052` the server sells no Plus at all: it holds a household to one Plus purchase at a time, and will not sell without that hold.
2. Every store app in use is the 1.1.8 build (older builds write holdings where a partner can read them)
3. The 20 purchase lines are approved and in the code (done 2026-11-20)
4. Netlify → `PLUS_ENABLED` = `true` on Production, then a deploy
5. One real purchase in each store and one on the website, each refunded afterwards
