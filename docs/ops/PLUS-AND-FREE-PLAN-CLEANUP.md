# "Flourish Plus" and free-plan wording: what is left

Listed 2026-11-05, not changed. Amanda: "Don't touch the other 19 places yet."

**Already done:** the store plans screen (`PAYWALL_COPY` in `src/lib/storeOffer.js`) has the approved words:

- **Title:** "Subscribe to flourish"
- **Body:** "A subscription gives you every flourish feature, including Credit and the coach-run meeting, with no limits on the coach or What-If."

**Not words, and staying as they are:** the product IDs (`app.flourishmoney.plus.*`, `flourish_plus`), the RevenueCat entitlement `plus`, and the internal names.

**How this relates to PR #96:** many of these lines describe a free plan that still exists until PR #96 (drop the free plan) is merged. Lines 4–7 and 14–19 should change in the same release as #96, not before it. Lines 1–3 and 8–13 only rename Plus, so they can go first.

## Store listings

1. **Google Play listing,** the "FLOURISH PLUS" section: "Every new account has every feature for its first 14 days. After that, the free plan has usage limits. Flourish Plus, an optional auto-renewing subscription, lifts those limits and adds Credit and the coach-run money meeting. Prices are shown in the app."
2. **Google Play subscription name,** "Flourish Plus". Google shows it at checkout and under the buyer's subscriptions.
3. **App Store:** our records say the description has the same "FLOURISH PLUS" section, plus the subscription display names that Apple shows at checkout. These are not confirmed yet, because App Store Connect was signed out.

## In the iPhone and Android apps

4. **Terms of Service, section 7:** "…the free plan has usage limits… Flourish Plus lifts these limits." Builds before 1.1 use a version that also describes a free plan.
5. **Locked screens:** "This part isn't included in the free plan. On the free plan you keep safe to spend, your bills and paydays, and your weekly agenda."
6. **Adding a second bank:** "The free plan connects 1 bank. You can import a statement for another account."
7. **Sign-up heading:** "Create your free account". This appears on the website too.

## On the website

8. **Settings card:** the title "Flourish Plus", and "Flourish Plus adds Credit and the coach-run meeting, and lifts the free plan's limits on the coach and What-If."
9. **Paywall:** "Flourish Plus" and "What Plus adds".
10. **Upgrade screen:** "Flourish Plus" and "You're on Flourish Plus".
11. **Locked screens:** "Flourish Plus includes:" and the button "Get Flourish Plus →".
12. **Today card:** "Get Flourish Plus".
13. **Desktop sidebar:** "Upgrade to Flourish Plus →" and "✦ Flourish Plus".
14. **What-If limit:**
    - "You've used all 1 simulations for today. Upgrade to Flourish Plus for unlimited What-If scenarios, or come back tomorrow."
    - "Daily simulation limit reached on the free plan."
    - The button "Unlimited simulations with Plus →"
15. **Terms of Service:** "Free Tier: Core features are available at no charge with a 14-day trial of premium features."
16. **Demo:** "Create a free account to run this meeting on your own numbers." and "Create a free account to ask it about your own."

## Server messages shown on the website

17. **Coach limit:** "You've used your 2 free Coach messages this week. Upgrade to Plus for unlimited, or come back on Monday when this week's messages reset."
18. **Second bank:**
    - "Connecting more than one bank is a Plus feature…"
    - "Free plan supports one bank. Upgrade to Plus to add more."

## Shown on both

19. **Coach-run meeting, server message:** "The coach-run meeting isn't part of the free plan. Your agenda is unchanged."

## Before any of these change

- **New words:** each one needs approved wording first. Terms of Service changes (4 and 15) may also need a new "Last updated" date and a notice.
- **App lines** (4–7, and any line also shown in the apps) reach phones only with a new store build.
- **Server lines** (17–19) and website lines change with a web deploy.
- **Store listings** (1–3) are changed by hand in Play Console and App Store Connect.
- **Tests:** the copy tests (`iapApprovedCopy`, `calmCopy`, `renderedCopy`, `noPlanWords` on the #96 branch) pin several of these lines. Update them in the same change.
