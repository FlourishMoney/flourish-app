# Version 1.1: in-app purchase in the store apps

Branch `iap-1-1`. Code is behind two flags, both off: `VITE_IAP_ENABLED` (a store build) and `IAP_ENABLED`
(Netlify). With both off nothing changes for anyone. Names, not line numbers: line numbers in docs go stale.

---

## Item 5. Quantity purchases and Family Sharing (reported, not changed)

These are Amanda's decisions at the moment the products are created. Nothing in the code depends on them
being on; the code assumes both are off.

**Quantity (more than one of a subscription in one purchase): off on every product shape we would create.**

- **App Store, auto-renewable subscriptions:** a subscription is bought one at a time, and multiseat is off on all three (CL, 2026-10-20). StoreKit's quantity
  option is for consumables (and non-renewing subscriptions), and there is no quantity setting on an
  auto-renewable subscription in App Store Connect. Nothing to turn off.
- **Google Play, one-time products:** Play Console has a per-product "multi-quantity" option. We create no
  one-time products, so it never applies.
- **Google Play, subscriptions:** Google announced "Multi-Quantity Subscription Purchase" (seats in one
  transaction) on 2026-09-29, through its Early Access Program; no Play Console setting for it is documented
  yet. If one appears on `flourish_plus`, leave it off. Our app always buys one, the
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
5. Play Console needs a build of the app that contains Google Play Billing before it lets you create a subscription: version code 17 (2026-10-20, from this branch, in-app purchase off; RevenueCat brings Billing and the BILLING permission), uploaded to the Internal testing track by Amanda.

### B. App Store Connect (two subscription groups, three subscriptions): DONE by Claude (CL), 2026-10-20

**Where it stands (CL, 2026-10-20):**
- 1.0.0 is approved and live (Ready for Distribution).
- Version **1.1.0** exists: Prepare for Submission, manual release.
- All three subscriptions exist and are priced. They are Canada only, with no offers, Family Sharing off and multiseat off.
- **Streamlined Purchasing is still on.** Apple only lets it be turned off once a StoreKit build has been approved, so CL turns it off after 1.1 is approved and before release.

**No product has a free trial or an introductory offer (Amanda, 2026-10-20).** In-app purchases start paying
right away. The 14-day account trial (#84) is the only trial, the same on the web and in the apps. The steps
below record what was set; display names and descriptions are CL's, entered from the approved copy.

1. App Store Connect → Apps → Flourish: Money, Handled → Monetization → Subscriptions → Subscription Groups → **+**
2. Reference Name: `Flourish`
3. Group localization: the display name as CL set it
4. Availability: Canada only

Monthly (in the `Flourish` group, **Create**):

5. Reference Name: as CL set it
6. Product ID: `app.flourishmoney.plus.monthly`
7. Subscription Duration: `1 Month`
8. Subscription Prices → Canada: `CAD 11.99`
9. Localization: display name as CL set it
10. Localization: description as CL set it
11. Review Information → Screenshot: the paywall from the 1.1 TestFlight build, with its prices loaded
12. Review Information → Review Notes: CL enters the 1.1 App Review notes (the draft is in the 1.1 report, not here)
13. Family Sharing: **off** (item 5: it can never be turned off once on)
14. Introductory Offers: **none**. Do not add one.

Annual (in the same group, **Create**):

15. Reference Name: as CL set it
16. Product ID: `app.flourishmoney.plus.annual`
17. Subscription Duration: `1 Year` (paid upfront)
18. Subscription Prices → Canada → `CAD 99.99`
19. Localization: display name as CL set it
20. Localization: description as CL set it
21. Review Information → the same screenshot and notes as steps 11 and 12
22. Family Sharing: **off**
23. Introductory Offers: **none**.

Founding annual, in a SUBSCRIPTION GROUP OF ITS OWN (founder's rule, 2026-10-17, confirmed 2026-10-20: one
ledger of 50 shared with the website (0025), the price locked while continuously subscribed; why this setup, below):

24. Subscriptions → Subscription Groups → **+** → Reference Name: `Flourish Founding`
25. Group localization: the display name as CL set it
26. In the `Flourish Founding` group, **Create** → Reference Name: as CL set it
27. Product ID: `app.flourishmoney.founding.annual`
28. Subscription Duration: `1 Year`
29. Subscription Prices → Canada → `CAD 79.99`
30. Localization: display name as CL set it
31. Localization: description as CL set it
32. Review Information → the same screenshot and notes as steps 11 and 12
33. Family Sharing: **off**
34. Introductory Offers: **none**. Do not add one (why, below).
35. In the `Flourish` group (steps 1 to 23): Levels → put monthly and annual on the **same level** (one service at two prices; one at a time)
36. NEVER use **Remove from Sale** on the founding annual, not even once all 50 founding seats are held.
37. When the 50th founding seat is held (50 households have paid for founding, migration 0029; the landing page shows 0 left): the founding annual →
    Subscription Prices → change the price in every country or region to the regular annual price (Canada:
    `CAD 99.99`) → when asked, choose to **keep existing subscribers at their current price**. Founding households
    then renew at CAD 79.99 for as long as they stay subscribed; nobody new can buy it at that price.

**Why a group of its own, never removed from sale, and not a Promotional Offer** (Apple's pages, read 2026-10-17):
- In one group, Apple lists every subscription to its members as a plan to switch to ("People can manage their
  subscriptions in their account settings on the App Store, where they see all renewal options and subscription
  groups, and can choose to upgrade, crossgrade, or downgrade": [Auto-renewable Subscriptions](https://developer.apple.com/app-store/subscriptions/)),
  so a regular subscriber could pick the founding annual without holding a position. In a group of its own it is
  never offered as a switch to anyone who has not bought it; the app presents it only when the server says this
  household holds a position, and the server still flags any founding purchase it did not offer
  (`founding_not_eligible`).
- Removing a subscription from sale is how Apple stops "additional sign-ups and renewals"
  ([Set availability for an auto-renewable subscription](https://developer.apple.com/help/app-store-connect/manage-subscriptions/set-availability-for-an-auto-renewable-subscription/)):
  it would end every founding household's subscription, so it is never used here.
- Raising the price while keeping the current price for existing subscribers is Apple's own way to lock a price:
  "You can keep an unlimited number of active subscribers at their existing price while increasing the price for
  new subscribers" ([Auto-renewable Subscriptions](https://developer.apple.com/app-store/subscriptions/)).
- A server-signed Promotional Offer on the annual cannot keep the price: Apple offers them "for existing and
  previously subscribed customers" ([Set up promotional offers](https://developer.apple.com/help/app-store-connect/manage-subscriptions/set-up-promotional-offers-for-auto-renewable-subscriptions/)),
  so a new founding household is not eligible, and an offer on a 1-year subscription runs at most one year
  ([pricing and availability reference](https://developer.apple.com/help/app-store-connect/reference/pricing-and-availability/in-app-purchase-and-subscriptions-pricing-and-availability)),
  after which the standard price applies.
- Costs of a second group, known and accepted: Apple bills each group separately, so a household could hold both a
  regular and a founding subscription. The app never sells that: a founding holder whose regular store
  subscription is live is shown the store's own screen to cancel it, and offered the founding price once it has
  ended (StorePaywall's founding switch). If both are ever live, the household keeps its access, the row is
  flagged (`support_flag` `two_store_subscriptions`, migration 0022) and the support inbox is emailed the same
  moment (`_lib/supportAlert.js`).
- NO INTRODUCTORY OFFER ANYWHERE (2026-10-20; the founding annual had none since 2026-10-18). Apple: "Customers can
  redeem one introductory offer per subscription group", and "existing subscribers may be able to redeem more than
  one offer if the offers are in different subscription groups" ([Auto-renewable Subscriptions](https://developer.apple.com/app-store/subscriptions/)),
  so with two groups a free month would have been claimable twice. Nothing in Apple's rules requires an
  introductory offer, and the account trial is the trial: every product is charged when the household confirms it
  (the paywall's copy says so, lib/storeOffer.js).
- A founding household that lets its subscription lapse can see the founding annual again in its own Apple
  subscription settings. Until step 37 it could buy it back at CAD 79.99; the server records the founding price
  as ended (`founding_ended_at`, final) and flags that purchase for support. After step 37 it costs the regular price.

Connecting Apple to RevenueCat:

38. App Store Connect → Users and Access → Integrations → In-App Purchase → **Generate In-App Purchase Key** → download the .p8 → upload it in RevenueCat (step D4), nowhere else.
39. App Store Connect → Apps → Flourish → App Information → App Store Server Notifications → Production Server URL: the URL RevenueCat shows (step D4)
40. Same place → Sandbox Server URL: the same RevenueCat URL
41. App Store Connect → Users and Access → Sandbox → Test Accounts → **+**: one sandbox Apple Account per tester (an address that is not anyone's real Apple Account). On the iPhone: Settings → App Store → Sandbox Account → sign in with it
42. Apple's EULA (Guideline 3.1.2: a subscription app's metadata must link its Terms of Use and Privacy Policy): App Information → License Agreement: leave Apple's standard licence agreement. On the 1.1 version page → Description: end it with the two links, `Terms of Use: https://www.apple.com/legal/internet-services/itunes/dev/stdeula/` and the Privacy Policy URL already in App Information (*needs review* if the description's wording changes). In the app, the paywall's "Terms of Use" opens Apple's standard EULA on iOS (`src/lib/storeOffer.js` APPLE_EULA_URL), beside "Privacy Policy" and "Restore purchases".

**What Apple will not do until 1.1 is approved:** the first subscriptions must be submitted with an app
version. On the 1.1.0 version page (it exists) → Build: 526903 once it has processed → In-App Purchases and
Subscriptions → add all three (both groups) → submit them with the build. Until then they stay "Ready to Submit"
and cannot be bought in the live app (sandbox and TestFlight work once the Paid Apps agreement is active). After
approval, before the manual release: CL turns Streamlined Purchasing off.

### C. Play Console (one subscription, three base plans)

**DONE 2026-10-20 (CL):** `flourish_plus` ("Flourish Plus"), base plans `monthly` (CAD 11.99), `annual` (CAD 99.99)
and `founding` (CAD 79.99, Resubscribe off), all Canada only and Active, after version code 17 went to internal testing.

One subscription, so Google never lets a household hold two at once (the review of this branch, H3). No offers
on any base plan: no free trial, no introductory price (2026-10-20). Names marked *needs review* are approved by
ChatGPT and Grok before they ship.

1. Play Console → Flourish → Monetize with Play → Products → Subscriptions → **Create subscription**
2. Product ID: `flourish_plus`
3. Name: `Flourish Plus` (*needs review*)
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
15. `flourish_plus` → Base plans → **Add base plan** → Base plan ID: `founding`
16. Type: `Auto-renewing`
17. Billing period: `1 year`
18. Price → Canada: `CAD 79.99`
19. `founding` → base plan settings → **Resubscribe**: off (so a founding household that lets its subscription lapse cannot buy the founding price back from the Play Store; the price is locked only while continuously subscribed)
20. **Activate**
21. `monthly`, `annual`, `founding`: **no offer** on any of them. Do not add one.
22. When the 50th founding seat is held (50 households have paid for founding, migration 0029; the landing page shows 0 left): `founding` → **Deactivate**. Founding households keep renewing; nobody new can buy it.
23. Play Console → Monetize with Play → Monetization setup → Real-time developer notifications → Topic name: the topic RevenueCat shows (step D5)
24. Play Console → Settings → License testing → add each tester's Google account → License response: `RESPOND_NORMALLY` (their purchases are test purchases, never charged)

**Why the founding base plan is deactivated, not deleted, and why Resubscribe is off** (Google's pages, read
2026-10-17): deactivating a base plan "does not affect existing subscriptions, and auto-renewals continue until they
are cancelled" ([Create and manage subscriptions](https://support.google.com/googleplay/android-developer/answer/140504?hl=en));
switching to another base plan of the same subscription is something the app offers ("you can allow users to switch
tiers by purchasing a different subscription's base plan or offer": [About subscriptions](https://developer.android.com/google/play/billing/subscriptions)),
and this app offers the founding base plan only to a household the server says holds a position; but with
Resubscribe on, "users can repurchase an expired auto-renewing subscription in the Play Store" (the same Play Console
page), which would bring the founding price back after a lapse.

**Why no offer on any base plan** (2026-10-20): the account trial is the only trial, and the App Store can have no
introductory offer either (section B), so the three prices are the same offer in both stores: charged when the
household confirms.

**What Google will not do until a build is in:** create any subscription before a build with Billing is
uploaded (step A5; version code 17, built 2026-10-20 for exactly this, in-app purchase switched off, never to be
promoted to Production). Subscriptions can be created and tested on the Internal testing track before 1.1 is
approved; they are purchasable in production once the 1.1 build is live there.

### D. RevenueCat (where both stores meet)

**DONE 2026-10-20:** project "Flourish"; entitlement `plus` with all six products; offering `default` (Current) and
`founding`, each with its iOS and Play products; App Store Server Notifications point at RevenueCat. The public SDK
keys are in the 1.1 builds; the secret key and webhook value are not set in Netlify yet (E3).

1. RevenueCat → **Create project** → Name: `Flourish`
2. Apps → **+** → App Store → Bundle ID: `app.flourishmoney`
3. Apps → **+** → Play Store → Package name: `com.flourishmoney.app`
4. App Store app → In-App Purchase Key: upload the .p8 from B38 (and paste RevenueCat's notification URL into B39 and B40)
5. Play Store app → Service credentials: a Google Cloud service account JSON with Play Console access (Users and permissions → invite the service account → View financial data, Manage orders and subscriptions); copy RevenueCat's Pub/Sub topic into C23
6. Entitlements → **+** → Identifier: `plus`
7. Products → import `app.flourishmoney.plus.monthly`, `app.flourishmoney.plus.annual`, `app.flourishmoney.founding.annual`
8. Products → import `flourish_plus:monthly`, `flourish_plus:annual`, `flourish_plus:founding`
9. Entitlement `plus` → attach all six products
10. Offerings → **+** → Identifier: `default` → make it Current
11. `default` → Packages → `Monthly` → App Store: `app.flourishmoney.plus.monthly` → Play Store: `flourish_plus:monthly`
12. `default` → Packages → `Annual` → App Store: `app.flourishmoney.plus.annual` → Play Store: `flourish_plus:annual`
13. Offerings → **+** → Identifier: `founding` (not Current; the server decides who sees it)
14. `founding` → Packages → `Annual` → App Store: `app.flourishmoney.founding.annual` → Play Store: `flourish_plus:founding`
15. Project settings → Transfer behaviour: `Transfer to new App User ID` (the default; a purchase follows the Flourish account that restores it)
16. Integrations → Webhooks → **+** → URL: `https://flourishmoney.app/.netlify/functions/revenuecat-webhook`
17. Same webhook → Authorization header value: a long random value made with a one-shot Terminal script (never typed into chat); the same exact value goes into Netlify as `REVENUECAT_WEBHOOK_AUTH`
18. API keys → copy the App Store public key (`appl_…`) for the iOS 1.1 build environment as `VITE_REVENUECAT_IOS_KEY`
19. API keys → copy the Play Store public key (`goog_…`) for the Android 1.1 build environment as `VITE_REVENUECAT_ANDROID_KEY`
20. API keys → a secret API key (`sk_…`, v1) → Netlify as `REVENUECAT_SECRET_KEY` (server only, never in a build)

### E. Switching it on (only when everything above is done)

1. Supabase SQL editor (Claude): run `supabase/migrations/0020_store_subscriptions.sql`, then its CHECK AFTERWARDS (exactly two rows, as written in its footer)
2. Supabase SQL editor (Claude): run `supabase/migrations/0022_store_support_flags.sql`, then its CHECK AFTERWARDS (two nullable columns)
3. Netlify → `REVENUECAT_SECRET_KEY` and `REVENUECAT_WEBHOOK_AUTH` (Production, secret), each with a one-shot hidden-prompt Terminal command; never typed into chat
4. Netlify → `IAP_ENABLED` = `true` (Production), then trigger a deploy (functions keep the variables of the deploy they were built in)
5. For TestFlight and internal testing only: Netlify `IAP_ACCEPT_SANDBOX` = `true` while testers buy with sandbox or license-tester accounts, then a deploy; remove it and deploy again before release (the App Review account is accepted without it)
6. The 1.1 store builds: `VITE_IAP_ENABLED=true`, `VITE_REVENUECAT_IOS_KEY` / `VITE_REVENUECAT_ANDROID_KEY` in the build shell
7. Terms of Service section 7: a selling build shows `STORE_TERMS_SECTION_7_IAP` (`src/lib/freePlan.js`, approved 2026-10-20) instead of the 1.0 line "There is nothing to buy in the iOS and Android apps"; 1.0.x builds and the website keep theirs. Its "Last updated" date is still October 14, 2026 (Amanda's call whether 1.1 changes it).
8. Real money only at the very end: one real purchase per store, then refund it (Apple: reportaproblem.apple.com; Google: Play Console → Order management → Refund)

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
notifications, What-If, the money summary, the check-in, the upgrade screen, the store paywall (2026-10-20: the
household opened it, so back closes it), a full page, any tab) down to Today; on Today with nothing open, the app
goes to the background with its state. Not tried on a device (no emulator, item 8a).
