# Version 1.1: in-app purchase in the store apps

Branch `iap-1-1`. Code is behind two flags, both off: `VITE_IAP_ENABLED` (a store build) and `IAP_ENABLED`
(Netlify). With both off nothing changes for anyone. Names, not line numbers: line numbers in docs go stale.

---

## Item 5. Quantity purchases and Family Sharing (reported, not changed)

These are Amanda's decisions at the moment the products are created. Nothing in the code depends on them
being on; the code assumes both are off.

**Quantity (more than one of a subscription in one purchase): off on every product shape we would create.**

- **App Store, auto-renewable subscriptions:** a subscription is bought one at a time. StoreKit's quantity
  option is for consumables (and non-renewing subscriptions), and there is no quantity setting on an
  auto-renewable subscription in App Store Connect. Nothing to turn off.
- **Google Play, one-time products:** Play Console has a per-product "multi-quantity" option. We create no
  one-time products, so it never applies.
- **Google Play, subscriptions:** Google announced "Multi-Quantity Subscription Purchase" (seats in one
  transaction) on 2026-09-29, through its Early Access Program; no Play Console setting for it is documented
  yet. If one appears on `flourish_plus` or `flourish_founding`, leave it off. Our app always buys one, the
  server grants one household per purchase, so a household that bought several would pay for seats it cannot
  use.
- **Stripe Checkout (the website):** `billing.js` sends `quantity: 1` and no `adjustable_quantity`, so
  checkout cannot sell more than one.
- **Stripe Customer Portal (the website):** the portal's "Customers can update quantity" option is NOT
  checked by `scripts/stripe-portal-check.cjs` (it reports quantity changes as fine). If it is on, a web
  subscriber could raise their own quantity and be charged for seats with nothing behind them. Amanda: Stripe
  Dashboard → Settings → Billing → Customer portal → Subscriptions → "Customers can switch plans" → leave
  "Update quantity" off. (Reported only, as briefed; not changed here.)
- **RevenueCat:** no quantity concept for subscriptions.

**Family Sharing: off, and turning it on cannot be undone.**

- **App Store:** each subscription has a Family Sharing toggle (Monetization → Subscriptions → the
  subscription → Family Sharing). **Once turned on for a subscription it can never be turned off** (Apple's
  App Store Connect Help). With it on, up to five other members of the buyer's Apple family group would get
  the subscription through the buyer's purchase.
- **What our server would do if it were turned on:** RevenueCat reports a family member's access as ownership
  `FAMILY_SHARED`, and `netlify/functions/_lib/storeSubscriptions.js` refuses to count it, so a family
  member would still meet the paywall in Flourish while Apple tells them they have the subscription. Before
  anyone turns it on, the server rule would have to change, and one payment would then unlock up to six
  households, each with its own account and data. Recommendation: leave it off on all three products.
- **Google Play:** in-app purchases and subscriptions cannot be shared through Google Play Family Library
  (Google Play Help: "You can't share in-app purchases … with your family members"). Nothing to set.

---

## Item 6. The products to create (Amanda), field by field

The identifiers below are the ones the code expects (`src/lib/storeBilling.js` PRODUCT_IDS and
`netlify/functions/_lib/storeSubscriptions.js` PRODUCT_PLANS, held together by tests/storeBilling.test.cjs).
Spell them exactly. Keys and secrets go straight into the dashboards named, never into the repo or a chat.

### A. Before anything else

1. App Store Connect → Business → Agreements → Paid Apps → status must read **Active**.
2. App Store Connect → Business → Paid Apps → Bank account → the GrowSmart Inc. CAD account.
3. App Store Connect → Business → Paid Apps → Tax forms → W-8BEN-E (Canadian corporation) and the Canadian tax information.
4. Play Console → Settings → Developer account → Payments profile → a merchant payments profile linked to this developer account.
5. Play Console needs a build of the app that contains Google Play Billing before it lets you create a subscription: a 1.1 build from this branch (RevenueCat brings Billing and the BILLING permission), uploaded to the Internal testing track. That build is Amanda's upload, later; nothing here uploads it.

### B. App Store Connect (one subscription group, three subscriptions)

1. App Store Connect → Apps → Flourish: Money, Handled → Monetization → Subscriptions → Subscription Groups → **+**
2. Reference Name: `Flourish`
3. Group localization → English (Canada) → Subscription Group Display Name: `Flourish`
4. Group localization → English (U.S.) → Subscription Group Display Name: `Flourish`

Monthly (in the group, **Create**):

5. Reference Name: `Flourish monthly`
6. Product ID: `app.flourishmoney.plus.monthly`
7. Subscription Duration: `1 Month`
8. Subscription Prices → **+** → Country or Region: `Canada` → Price: `CAD 11.99` (let Apple fill the other storefronts, then check the US price it chose)
9. Localization → English (Canada) → Display Name: `Flourish monthly`
10. Localization → English (Canada) → Description: `The whole app, renewed every month.`
11. Review Information → Screenshot: the paywall from a 1.1 TestFlight build
12. Review Information → Review Notes: `Sign in with the review account in App Review Information; the paywall opens after sign-in. Sandbox purchases are accepted for that account.`
13. Family Sharing: **leave off** (item 5: it can never be turned off)
14. Subscription Prices → Introductory Offers → **+** → Countries or Regions: all → Start Date: today → End Date: none → Type: `Free` → Duration: `1 Month`

Annual (in the same group, **Create**):

15. Reference Name: `Flourish annual`
16. Product ID: `app.flourishmoney.plus.annual`
17. Subscription Duration: `1 Year`
18. Subscription Prices → Canada → `CAD 99.99`
19. Localization → English (Canada) → Display Name: `Flourish annual`
20. Localization → English (Canada) → Description: `The whole app, renewed every year.`
21. Review Information → the same screenshot and notes as steps 11 and 12
22. Family Sharing: **leave off**
23. Introductory Offers → **+** → all countries → today → no end → `Free` → `1 Month`

Founding annual (in the same group, **Create**):

24. Reference Name: `Flourish founding annual`
25. Product ID: `app.flourishmoney.founding.annual`
26. Subscription Duration: `1 Year`
27. Subscription Prices → Canada → `CAD 79.99`
28. Localization → English (Canada) → Display Name: `Flourish founding annual`
29. Localization → English (Canada) → Description: `The founding price, renewed every year while you stay subscribed.`
30. Review Information → the same screenshot and notes
31. Family Sharing: **leave off**
32. Introductory Offers → **+** → all countries → today → no end → `Free` → `1 Month`
33. Subscription group → Levels: put all three on the **same level** (they are one service at three prices; one at a time)

Connecting Apple to RevenueCat:

34. App Store Connect → Users and Access → Integrations → In-App Purchase → **Generate In-App Purchase Key** → download the .p8 → upload it in RevenueCat (step D4), nowhere else.
35. App Store Connect → Apps → Flourish → App Information → App Store Server Notifications → Production Server URL: the URL RevenueCat shows (step D4)
36. Same place → Sandbox Server URL: the same RevenueCat URL

**What Apple will not do until 1.1 is approved:** the first subscriptions must be submitted with an app
version. On the 1.1 version page → In-App Purchases and Subscriptions → add all three, and submit them with
the build. Until then they stay "Ready to Submit" and cannot be bought in the live app (sandbox and TestFlight
work once the Paid Apps agreement is active).

### C. Play Console (two subscriptions with base plans)

1. Play Console → Flourish → Monetize with Play → Products → Subscriptions → **Create subscription**
2. Product ID: `flourish_plus`
3. Name: `Flourish`
4. Base plans → **Add base plan** → Base plan ID: `monthly`
5. Type: `Auto-renewing`
6. Billing period: `1 month`
7. Price → Set prices → Canada: `CAD 11.99` (then review the other countries Google converts)
8. Grace period and account hold: leave Google's defaults
9. **Activate** the base plan
10. Base plans → **Add base plan** → Base plan ID: `annual`
11. Type: `Auto-renewing`
12. Billing period: `1 year`
13. Price → Canada: `CAD 99.99`
14. **Activate**
15. `monthly` → Offers → **Add offer** → Offer ID: `free-month`
16. Eligibility: `New customer acquisition` → `Never had any subscription in this app`
17. Phases → **Add phase** → `Free trial` → Duration: `1 month`
18. **Activate** the offer
19. `annual` → Offers → **Add offer** → `free-month` → the same eligibility and phase as steps 16 and 17 → **Activate**
20. Subscriptions → **Create subscription** → Product ID: `flourish_founding`
21. Name: `Flourish founding`
22. Base plans → **Add base plan** → Base plan ID: `annual`
23. Type: `Auto-renewing` → Billing period: `1 year` → Canada: `CAD 79.99`
24. **Activate**
25. `annual` → Offers → **Add offer** → `free-month` → `Never had any subscription in this app` → `Free trial`, `1 month` → **Activate**
26. Play Console → Monetize with Play → Monetization setup → Real-time developer notifications → Topic name: the topic RevenueCat shows (step D5)

**What Google will not do until a build is in:** create any subscription before a build with Billing is
uploaded (step A5). Subscriptions can be created and tested on the Internal testing track before 1.1 is
approved; they are purchasable in production once the 1.1 build is live there.

### D. RevenueCat (where both stores meet)

1. RevenueCat → **Create project** → Name: `Flourish`
2. Apps → **+** → App Store → Bundle ID: `app.flourishmoney`
3. Apps → **+** → Play Store → Package name: `com.flourishmoney.app`
4. App Store app → In-App Purchase Key: upload the .p8 from B34 (and paste RevenueCat's notification URL into B35 and B36)
5. Play Store app → Service credentials: a Google Cloud service account JSON with Play Console access (Users and permissions → invite the service account → View financial data, Manage orders and subscriptions); copy RevenueCat's Pub/Sub topic into C26
6. Entitlements → **+** → Identifier: `plus`
7. Products → import `app.flourishmoney.plus.monthly`, `app.flourishmoney.plus.annual`, `app.flourishmoney.founding.annual`
8. Products → import `flourish_plus:monthly`, `flourish_plus:annual`, `flourish_founding:annual`
9. Entitlement `plus` → attach all six products
10. Offerings → **+** → Identifier: `default` → make it Current
11. `default` → Packages → `Monthly` → App Store: `app.flourishmoney.plus.monthly` → Play Store: `flourish_plus:monthly`
12. `default` → Packages → `Annual` → App Store: `app.flourishmoney.plus.annual` → Play Store: `flourish_plus:annual`
13. Offerings → **+** → Identifier: `founding` (not Current; the server decides who sees it)
14. `founding` → Packages → `Annual` → App Store: `app.flourishmoney.founding.annual` → Play Store: `flourish_founding:annual`
15. Project settings → Transfer behaviour: `Transfer to new App User ID` (the default; a purchase follows the Flourish account that restores it)
16. Integrations → Webhooks → **+** → URL: `https://flourishmoney.app/.netlify/functions/revenuecat-webhook`
17. Same webhook → Authorization header value: a long random value made with a one-shot Terminal script (never typed into chat); the same exact value goes into Netlify as `REVENUECAT_WEBHOOK_AUTH`
18. API keys → copy the App Store public key (`appl_…`) for the iOS 1.1 build environment as `VITE_REVENUECAT_IOS_KEY`
19. API keys → copy the Play Store public key (`goog_…`) for the Android 1.1 build environment as `VITE_REVENUECAT_ANDROID_KEY`
20. API keys → a secret API key (`sk_…`, v1) → Netlify as `REVENUECAT_SECRET_KEY` (server only, never in a build)

### E. Switching it on (only when everything above is done)

1. Supabase SQL editor → run `supabase/migrations/0020_store_subscriptions.sql`
2. Netlify → Site configuration → Environment variables → `REVENUECAT_SECRET_KEY`, `REVENUECAT_WEBHOOK_AUTH` (Production)
3. Netlify → `IAP_ENABLED` = `true` (Production), then trigger a deploy
4. The 1.1 store builds: `VITE_IAP_ENABLED=true`, `VITE_REVENUECAT_IOS_KEY` / `VITE_REVENUECAT_ANDROID_KEY` in the build shell
5. For TestFlight and internal testing only: Netlify `IAP_ACCEPT_SANDBOX` = `true` while testers buy with sandbox accounts; remove it before release (the App Review account is accepted without it)
6. Before 1.1 ships: replace the Terms of Service sentence "The iOS and Android apps are free, and there is nothing to buy in them" (section 7; legal review). It is unchanged on this branch.

---

## Item 8. Android, from the vc14 Play Console review

**(a) Edge to edge on Android 15 and later.** No deprecated status or navigation bar call or attribute exists
in the shell we own or in any plugin's source. The calls Play reported live in AndroidX library code that
nothing calls (core-splashscreen `SplashScreen$Impl31`, androidx.activity `EdgeToEdgeApi23/26/29`,
androidx.core `WindowCompat` `setDecorFitsSystemWindows`); R8 (b) removes them from the release build (checked:
none left). The window behind the transparent bars is the app's own background, light and dark, and on Android
the status bar's icons follow the app's theme. Insets reach the page (viewport-fit=cover, Capacitor SystemBars)
and `src/lib/safeArea.js` pads with them. **Emulator screenshots were not taken**: the disk had 11 to 12 GB
free, and the brief allows the emulator only at 15 GB or more.

**(b) R8.** Release builds now run R8 (code and resource shrinking, `proguard-android-optimize.txt`, the app's
`proguard-rules.pro`). Measured on this branch, 2026-10-15: the release bundle went from 7,568,172 bytes to
5,524,130 (2,044,042 smaller, 27 percent). For reference, vc14 (no RevenueCat) was 4,748,338. The mapping file
is `android/app/build/outputs/mapping/release/mapping.txt` (31.6 MB) and is inside the bundle
(`BUNDLE-METADATA/com.android.tools.build.obfuscation/proguard.map`), so Play Console reads it on upload.
Checked in the minified bytecode: every plugin class kept by name (Share, Local Notifications, RevenueCat's
PurchasesPlugin, FlourishReview, Capacitor's own), their JavaScript-facing methods kept (`purchasePackage`,
`restorePurchases`, `getOfferings`, `requestReview`, `share`, `schedule`), and the WebView bridge's
`@JavascriptInterface` methods kept. **Not run on a device**: the first R8 build must be opened on a phone or
the emulator (and in Play's pre-launch report) before it is uploaded.

**(c) Android's back key.** It used to leave the app from Settings (Capacitor's default with no back handler).
Now (`src/lib/backButton.js`, `@capacitor/app`): an open dialog or registered sheet closes first; then the app
goes back one screen at a time (the paywall's Terms or Privacy page, the bank consent sheet, Settings, the
notifications, What-If, the money summary, the check-in, the upgrade screen, a full page, any tab) down to Today;
on Today with nothing open, or on the store paywall (which back never dismisses), the app goes to the background
with its state. Not tried on a device (no emulator, item 8a).
