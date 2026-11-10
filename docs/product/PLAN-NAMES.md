# Where a household sees "Flourish Plus" for the main plan (2026-11-10)

Amanda's decision: to households, the main paid plan is just **"flourish"** (monthly, annual, founding). **"flourish Plus"** is only the add-on. Display names change; **no product id or entitlement id changes**, because the stores never allow it:
- App Store: `app.flourishmoney.plus.monthly`, `app.flourishmoney.plus.annual`, `app.flourishmoney.founding.annual`.
- Play: `flourish_plus` with base plans `monthly`, `annual` and `founding`.
- RevenueCat entitlement `plus`, `profiles.plan = "plus"`.
- Stripe: the plan keys `monthly`, `annual`, `founding_annual`.

New wording is a placeholder until both reviewers approve it (`docs/product/NET-WORTH-WORDS.md`, ids `plan-*`). Lines are as of main 69480cd; search for the text, as line numbers move.

## In the repo, now placeholders on branch net-worth-plus

| Where | What a household saw | Id |
|---|---|---|
| Website, What-If (`src/App.jsx`, the free simulation limit) | "Upgrade to Flourish Plus for unlimited What-If scenarios, or come back tomorrow." | `plan-sim-limit` |
| Website, What-If button | "Unlimited simulations with Plus →" | `plan-sim-cta` |
| Website, Today's upgrade card | "Get Flourish Plus" | `plan-get-cta` |
| Website, Settings plan card | title "Flourish Plus" | `plan-name` |
| Website, Settings plan card | "Flourish Plus adds Credit and the coach-run meeting, and lifts the free plan's limits on the coach and What-If." | `plan-adds-lead` |
| Website, Terms of Service section 7 | label "Flourish Plus:" | `plan-terms-web-label` |
| Website, locked screens (PremiumGate) | "Flourish Plus includes:" | `plan-includes-title` |
| Website, locked screens button after a trial | "Get Flourish Plus →" | `plan-upgrade-cta` |
| Website, upgrade screen | title "Flourish Plus", and "You're on Flourish Plus" | `plan-name`, `plan-on` |
| Website, plans screen | title "Flourish Plus", heading "What Plus adds" | `plan-name`, `plan-adds-title` |
| Website, sidebar | "Upgrade to Flourish Plus →", badge "✦ Flourish Plus" | `plan-upgrade-cta`, `plan-name` |
| Store apps, paywall (`src/lib/storeOffer.js`) | title "Flourish Plus" and the same lead line | `plan-name`, `plan-adds-lead` |
| Store apps that sell, Terms section 7 (`src/lib/freePlan.js`) | "Flourish Plus lifts these limits." | `plan-terms-lifts-limits` |
| Couple mode, paying twice (`src/lib/householdWords.js`) | "…Settings > Flourish Plus > Manage subscription." | `plan-household-extra-stripe` |
| The coach's weekly free limit (server, `_lib/coachLimits.js`) | "…Upgrade to Plus for unlimited…" | `plan-server-coach-limit` |
| Connecting a second bank, free plan (server, `plaid.js`) | "Connecting more than one bank is a Plus feature…" and "…Upgrade to Plus to add more." | `plan-server-one-bank`, `plan-server-one-bank-migrate` |

## Outside the repo: Amanda changes these herself (display names only)
1. **App Store Connect:**
   - Subscription group `Flourish`: its display name (Group localization).
   - The display name and description of each of the 3 subscriptions (monthly, annual, founding annual).
   - The App Review notes and the app description, wherever they say "Plus" for the main plan. `docs/ops/LEGAL-PACKET.md` has "A 14-day trial of Plus" and "Flourish Plus by auto-renewable subscription".
2. **Play Console:** the subscription `flourish_plus`'s Name, today "Flourish Plus" (`docs/ops/IAP-1.1.md` C3). The id stays.
3. **Stripe:** the product's name, today "Flourish Plus". It shows on Checkout, receipts, invoices and the customer portal. The prices and their ids stay.
4. **Emails:** none of the repo's email templates names the main plan "Plus". Stripe's own receipt emails use the product name (item 3).
5. **The website's Terms copy in `docs/ops/LEGAL-PACKET.md`** (the reviewed text) carries the same "Flourish Plus:" label. Change it with the review.
