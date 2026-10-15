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
