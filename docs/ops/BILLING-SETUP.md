# Billing setup — what only the founder can do

The code on branch `billing-stripe` is complete and tested, and it cannot run until the
things below exist. All of it is **Stripe test mode**; the live-mode column is what
changes on 2026-10-26. Nothing here was done for you: it all needs the Stripe or Netlify
login.

## 1. Stripe dashboard, test mode

**Toggle "Test mode" on before any of this.** Test and live are separate worlds: separate
products, separate prices, separate webhook endpoints, separate keys.

1. **Product.** One product, "Flourish Plus". Three recurring prices on it, all **CAD**:

   | plan key (what the client sends) | price | interval |
   |---|---|---|
   | `monthly` | 11.99 | monthly |
   | `annual` | 99.99 | yearly |
   | `founding_annual` | 79.99 | yearly |

   On each price set **Tax behaviour = "Exclusive"**. Prices are quoted plus tax (P16), and
   this is the setting that matters later: if a price is created as "Inclusive", switching
   Stripe Tax on reinterprets 11.99 as tax-included and every invoice is wrong. Exclusive
   now means Stripe Tax can be switched on with no price changes and no migration — the
   columns in `0009` are already there for the amounts.

2. **Copy the three price ids** (`price_...`). They go in the Netlify variables below.
   They are different in live mode, which is why nothing in the code keys off them.

3. **Webhook endpoint.** Add one pointing at:

   ```
   https://flourishmoney.app/.netlify/functions/stripe-webhook
   ```

   Subscribe to exactly these three events:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`

   Copy the **signing secret** (`whsec_...`). Anything else Stripe sends is recorded as
   `ignored` and changes nothing, so extra events are harmless but pointless.

4. **Customer portal.** Settings → Billing → Customer portal → activate it in test mode,
   and allow cancel and payment-method updates. `create_portal_session` returns a Stripe
   error until this is switched on, and the error is the same shape as a missing key,
   which is a confusing hour if you do not know.

5. Optional but worth it before the cohort: statement descriptor, business name, and the
   test-mode branding on Checkout.

**No Stripe Tax registration is needed** while it stays off. That is a separate track from
P8 (whether GrowSmart Inc. holds an RT account).

## 2. Netlify environment variables

Set these in **Site configuration → Environment variables**. Mark every one **"Contains
secret values"** except `APP_ORIGIN`.

| variable | value | which contexts |
|---|---|---|
| `STRIPE_SECRET_KEY` | `sk_test_...` | All contexts, for now. On 2026-10-26 set the **live** key on **Production only** and leave the test key on Deploy previews and Branch deploys, so a preview can never charge a real card. |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` from step 3 | Same split. The live endpoint has a **different** signing secret; it is not the same string. |
| `STRIPE_PRICE_MONTHLY_CAD` | `price_...` (11.99) | All contexts now; live ids on Production at go-live |
| `STRIPE_PRICE_ANNUAL_CAD` | `price_...` (99.99) | as above |
| `STRIPE_PRICE_FOUNDING_ANNUAL_CAD` | `price_...` (79.99) | as above |
| `APP_ORIGIN` | `https://flourishmoney.app` | Production. Optional elsewhere — it is only the return URL after checkout, and it defaults to production if unset. Set it per-context if you want a deploy preview to return to itself. |

Already set and reused, not new: `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `ENFORCE_PLAN_LIMITS`.

**Nothing here is a `VITE_` variable, deliberately.** Vite inlines only `VITE_`-prefixed
names, so a Stripe key cannot reach a bundle by accident — and `tests/billingSecurity.test.cjs`
fails if anyone creates a `VITE_STRIPE_*` name, or puts a key or a price id in `src/`.

## 3. One redirect, not added here

The client will call `/api/billing`, and `netlify.toml` maps each function explicitly. This
branch does **not** edit that file, because the brief said to make no Netlify changes. Add
this when the UI lands:

```toml
# Redirect: app calls /api/billing → Netlify function
[[redirects]]
  from   = "/api/billing"
  to     = "/.netlify/functions/billing"
  status = 200
```

Stripe itself needs no redirect: it posts straight to `/.netlify/functions/stripe-webhook`.

## 4. Migrations to apply, in order

Neither has been applied anywhere — there is no staging project yet (P14).

1. `supabase/migrations/0009_billing_subscriptions.sql`
2. `supabase/migrations/0010_billing_events.sql`

Apply them **before** setting the webhook secret live, or the first event will fail, be
recorded as `failed`, and be retried by Stripe until the tables exist. That retry is the
system working, but it is noisy.

Until they are applied, `getUserPlan` reads a table that does not exist, catches the error
and treats the household as unpaid. Sign-in, trials and the free coach limit are unaffected.

## 5. End-to-end test once the above exists

1. `stripe listen --forward-to localhost:8888/.netlify/functions/stripe-webhook` (or use the
   dashboard endpoint against a branch deploy).
2. Sign in as a test account, call `create_checkout_session` with `plan_key: "monthly"`.
3. Pay with `4242 4242 4242 4242`, any future expiry, any CVC.
4. Check `public.subscriptions` has the row with `status = 'active'`, and
   `public.billing_events` has one row for the event marked `processed`.
5. Send the same event again from the dashboard ("Resend"). It must return 200 with
   `replay: true` and write nothing further — `billing_events` still has one row.
6. Cancel in the portal, confirm `cancel_at_period_end` then `canceled` arrive.

## 6. Decisions still open, flagged rather than assumed

### STORE IN-APP PURCHASE — open, and it blocks nothing until the store submissions

**Decide before submitting to either store.** Apple (App Store Review Guideline 3.1.1) and Google
(Play Payments policy) both require their own purchase systems for digital subscriptions consumed
inside the app. A build that shows a price, a plan, a purchase button or a link out to a web
checkout is a rejected build — and on Apple the rule covers "buttons, external links, or other
calls to action" pointing at another way to pay, not only the purchase itself.

**What the app does today.** Nothing billing-related renders in a native shell. `isNativeApp()`
in `src/lib/billingVisibility.js` is true for the iOS build, the Android build and any non-http(s)
shell, and it gates the upgrade screen, the feature paywall (which lists prices) and the
dashboard's upgrade card. The web app is unaffected. Confirmed by
`tests/billingUpgradeScreen.test.cjs` section 4 and 6.

**So the native apps ship with no way to subscribe at all.** That is deliberate and it is the safe
state, but it is not a plan. The options, none of them chosen:

1. **StoreKit 2 / Play Billing.** Apple and Google take 15–30%. Two more purchase paths to
   reconcile against `public.subscriptions`, each with its own receipt validation and its own
   server-to-server notifications, and a household that pays through Apple must be recognised as
   the same household that may have paid through Stripe on the web.
2. **Reader-style / external purchase entitlements.** Narrow, region-specific, and needs Apple's
   approval. Probably not available to a finance app.
3. **Keep the native apps free and sell only on the web.** What ships today. Allowed, as long as
   the app does not point at the web checkout — which is exactly what the gate enforces. The cost
   is that a native user has no route to Plus.

**Whoever decides it also decides how the two sources of truth reconcile.** `planRules.js` reads
one `subscriptions` row per household; a StoreKit subscription is not a Stripe subscription and
does not arrive by webhook.



- **`past_due` is not treated as paid.** A failed renewal removes access at once. Whether
  there should be a grace period is a product decision nobody has made; when it is made it
  is one entry in `SUBSCRIPTION_PAID_STATUSES` in `_lib/planRules.js`, with no migration.
- **Founding eligibility is `profiles.founder_flag` only.** P4 caps the cohort at 100, and
  nothing counts that cap yet — the flag is the gate. A non-founder asking for the founding
  price gets a 403.
- **Quebec (P17)** is not enforced in the billing path. Signup-time exclusion is where that
  belongs, and it does not exist yet.
