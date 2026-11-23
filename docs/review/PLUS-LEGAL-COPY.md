# flourish Plus: Terms of Service and Privacy Policy additions (drafts, 2026-11-21)

For ChatGPT and Grok, then Amanda. **Nothing here is approved and nothing here is in the app.** These are first drafts of the lines the Terms and the Privacy Policy need before flourish Plus is sold. They are not wired in: when they are approved they go into the code word for word, and the "Last updated" dates change with them.

- Every line states only what the code does today on branch `plus-1.1.8`. The "facts" under each line say where that comes from.
- Rules used: lowercase flourish, plain words, no dashes, no advice, no price figure (the price is shown where it is charged), none of the words the app never uses (sets aside, holds back, learns, remembers, smarter, covered, covers, web app, never invents), and no sentence that starts with Save, Spend, Pay or Invest.
- Lines marked **website only** must not show in the iPhone or Android apps, which never name the website's payment.

## The block to paste

```
Review: additions to the Terms of Service and the Privacy Policy for flourish Plus, version 1.1.8. flourish is a Canadian budgeting app. The main paid plan is called "flourish". "flourish Plus" is an optional add-on to any plan: net worth, investment holdings, and more connected banks (2 per person on the main plan; up to 10 per household with Plus, a fair use limit). It is bought on the website through Stripe, or in the iPhone and Android apps through the App Store or Google Play. It is billed separately from the main plan. Rules: lowercase flourish, plain words, no dashes, no advice, nothing untrue, no price figure in these lines. Never use: sets aside, holds back, learns, remembers, smarter, covered, covers, web app, never invents. No sentence starts with Save, Spend, Pay or Invest. These are legal text, so say if anything is unclear, missing or promises more than it should. Reply AGREE, or give exact fixes by number, with a score out of 100.

Terms of Service, section 7 (Subscription and billing), a new paragraph for flourish Plus:
1. flourish Plus is an optional add-on to any flourish plan. It adds your net worth, your investment holdings, and more connected banks.
2. The price of flourish Plus is shown before you buy it: at checkout on the website, or in the app at the App Store's or Google Play's own price. On the website, sales tax is added at checkout.
3. flourish Plus is billed separately from your flourish subscription. It has its own renewal date, and it renews automatically each billing period until you cancel it. There is no free trial of flourish Plus.
4. Cancelling flourish Plus does not cancel your flourish subscription, and cancelling your flourish subscription does not cancel flourish Plus. Each is cancelled where it was bought.
5. To cancel flourish Plus on iPhone: Settings, your name, then Subscriptions, at least 24 hours before the period ends. On Android: Google Play, your profile, Payments & subscriptions, then Subscriptions. On the website: Settings, flourish Plus, then Manage subscription. Cancelling takes effect at the end of the period you have paid for.
6. One flourish Plus is enough for a household. If your partner has flourish Plus, it includes you, and we do not sell it to you a second time.
7. With flourish Plus, a household can connect up to 10 banks. This is a fair use limit. Without flourish Plus, each person can connect 2.
8. When flourish Plus ends, your net worth and investment holdings are no longer shown. Nothing you entered is deleted. Banks you connected stay connected and keep updating, and you can add another once you are under the limit for your plan. Your bank, card and loan balances stay where they are.
9. Apple or Google handle refunds for flourish Plus bought in the apps, under their own policies. On the website, partial periods are not refunded unless the law requires it.
10. flourish Plus needs version 1.1.8 or later of the iPhone or Android app. An older version is not sent net worth or investment holdings, to keep them private.

Privacy Policy, new entries:
11. (label) Investments (flourish Plus):
12. If your household has flourish Plus and you connect an investment account, Plaid Inc. retrieves your holdings in it on our behalf: the name and symbol of each holding, how much of it you hold, its price and value, its currency, and the kind of account it is in, such as an RRSP or a TFSA. We receive read-only access. We ask Plaid for holdings only for a household that has flourish Plus.
13. (label) Net worth (flourish Plus):
14. With flourish Plus you can add a home, a car or a pension to your net worth. We keep the name, the value and the currency you enter. Nothing is estimated for you.
15. (label) Who sees it in a household:
16. Your net worth entries and the investment accounts you connect are private to you until you choose to share them. You choose for each entry and each account, and you can change your mind at any time. Your partner sees only what you have shared. A household total is shown only when everything in it has been shared.
17. Some account types can reveal something about health or disability, such as an RDSP. They are not shared unless you turn sharing on for that account.
18. If you leave a household, your partner no longer sees what you shared, and your entries stay with your account.
19. (website only) If you buy flourish Plus on flourishmoney.app, Stripe processes the payment in the same way as for a flourish subscription, and keeps flourish Plus on a billing record of its own.
20. If you buy flourish Plus in the iPhone or Android app, Apple or Google processes the payment, and RevenueCat tells us the status of that subscription, in the same way as for a flourish subscription.

One line in the app:
21. (Where net worth would show, in an app too old to be sent it) Update flourish to see this.
```

## Every line: where it goes, and the facts behind it

| # | Where it would go | Draft | The facts it rests on |
|---|---|---|---|
| 1 | Terms, section 7, the opening of a new flourish Plus paragraph | flourish Plus is an optional add-on to any flourish plan. It adds your net worth, your investment holdings, and more connected banks. | Amanda, 2026-11-10: an add-on on any plan. Net worth and holdings sit behind Plus (`src/lib/netWorthAccess.js`); bank limits rise with it (`netlify/functions/_lib/bankLimits.js`). |
| 2 | Same paragraph | The price of flourish Plus is shown before you buy it: at checkout on the website, or in the app at the App Store's or Google Play's own price. On the website, sales tax is added at checkout. | The website shows our price and "CAD plus tax" and Stripe Tax adds tax at checkout; a store app shows the store's own price string (`src/lib/plusBuy.js`). |
| 3 | Same paragraph | flourish Plus is billed separately from your flourish subscription. It has its own renewal date, and it renews automatically each billing period until you cancel it. There is no free trial of flourish Plus. | Its own Stripe customer and subscription, its own App Store group and Play subscription (`_lib/plusAddon.js`). No trial or introductory offer on any Plus product (`docs/ops/PLUS-ADDON-CONSOLES.md`). |
| 4 | Same paragraph | Cancelling flourish Plus does not cancel your flourish subscription, and cancelling your flourish subscription does not cancel flourish Plus. Each is cancelled where it was bought. | Plus has its own row and never touches the main plan's (`tests/plusEntitlement.test.cjs` 5h: Plus ending leaves the monthly plan active). |
| 5 | Same paragraph | To cancel flourish Plus on iPhone: Settings, your name, then Subscriptions, at least 24 hours before the period ends. On Android: Google Play, your profile, Payments & subscriptions, then Subscriptions. On the website: Settings, flourish Plus, then Manage subscription. Cancelling takes effect at the end of the period you have paid for. | The same store paths the main plan's Terms give. On the website the Settings card "flourish Plus" opens the Plus screen, whose Manage subscription opens Stripe's portal; the Plus portal cancels at the end of the period (`_lib/plusAddon.js` `PLUS_PORTAL_FEATURES`). |
| 6 | Same paragraph | One flourish Plus is enough for a household. If your partner has flourish Plus, it includes you, and we do not sell it to you a second time. | Either member's live Plus gives the household Plus (`getPlusEntitlement`); a household that has it is refused a second purchase, and two partners cannot buy at the same moment (migration 0052). |
| 7 | Same paragraph | With flourish Plus, a household can connect up to 10 banks. This is a fair use limit. Without flourish Plus, each person can connect 2. | `_lib/bankLimits.js`: `PLUS_HOUSEHOLD_FAIR_USE` 10, `BASIC_PER_PERSON` 2. |
| 8 | Same paragraph | When flourish Plus ends, your net worth and investment holdings are no longer shown. Nothing you entered is deleted. Banks you connected stay connected and keep updating, and you can add another once you are under the limit for your plan. Your bank, card and loan balances stay where they are. | The locked state replaces net worth and holdings; `net_worth_entries` rows are not deleted when Plus ends; a limit only ever refuses a NEW bank (`src/lib/bankLimitView.js`); approved lines 4 and 9 of the 48 say the same. |
| 9 | Same paragraph | Apple or Google handle refunds for flourish Plus bought in the apps, under their own policies. On the website, partial periods are not refunded unless the law requires it. | The main plan's own refund sentence, applied to Plus. Amanda to confirm the website refund rule is the same for Plus. |
| 10 | Same paragraph, or section 2 (the service) | flourish Plus needs version 1.1.8 or later of the iPhone or Android app. An older version is not sent net worth or investment holdings, to keep them private. | `_lib/plusAddon.js` `PLUS_MIN_CLIENT` "1.1.8": the server sends Plus data only to a client that says it is 1.1.8 or newer. |
| 11 | Privacy Policy, "What we collect", a new label | Investments (flourish Plus): | A label, as "Bank connection data (Plaid):" is. |
| 12 | Under that label | If your household has flourish Plus and you connect an investment account, Plaid Inc. retrieves your holdings in it on our behalf: the name and symbol of each holding, how much of it you hold, its price and value, its currency, and the kind of account it is in, such as an RRSP or a TFSA. We receive read-only access. We ask Plaid for holdings only for a household that has flourish Plus. | `netlify/functions/plaid.js` `get_investments`: exactly those fields, and with Plus switched on Plaid's Investments is asked only for a household with Plus. Holdings are not written to our database; they are fetched from Plaid and kept on the device. |
| 13 | A new label | Net worth (flourish Plus): | A label. |
| 14 | Under that label | With flourish Plus you can add a home, a car or a pension to your net worth. We keep the name, the value and the currency you enter. Nothing is estimated for you. | `netlify/functions/networth.js` and migration 0045: kind, label, value, currency, and whether it is shared. Approved line 29: "Your own figure. Nothing is estimated." |
| 15 | A new label | Who sees it in a household: | A label. |
| 16 | Under that label | Your net worth entries and the investment accounts you connect are private to you until you choose to share them. You choose for each entry and each account, and you can change your mind at any time. Your partner sees only what you have shared. A household total is shown only when everything in it has been shared. | Private by default (Amanda, 2026-11-10): `net_worth_entries.shared` and `net_worth_shares`, off unless turned on; a partner's request returns only shared accounts' holdings; the household total needs every part shared (`src/lib/netWorthPlus.js`). |
| 17 | Same | Some account types can reveal something about health or disability, such as an RDSP. They are not shared unless you turn sharing on for that account. | Approved line 21 of the 48, and the same rule in the code. |
| 18 | Same | If you leave a household, your partner no longer sees what you shared, and your entries stay with your account. | `networth.js`: a partner is read each time, so after a leave the one who stays sees nothing of the leaver's, and the leaver keeps every entry. |
| 19 | Privacy Policy, "Payments", **website only** | If you buy flourish Plus on flourishmoney.app, Stripe processes the payment in the same way as for a flourish subscription, and keeps flourish Plus on a billing record of its own. | A separate Stripe customer per Plus buyer (`billing.js` `plus_checkout`). A store app never names the website, so this line is left out there, as the Stripe sentence is today. |
| 20 | Privacy Policy, "Payments" | If you buy flourish Plus in the iPhone or Android app, Apple or Google processes the payment, and RevenueCat tells us the status of that subscription, in the same way as for a flourish subscription. | `_lib/plusAddon.js` `plusFromSubscriber`: RevenueCat's record of the store purchase. |
| 21 | The app, where net worth would show, when the app is older than the server's minimum for Plus data | Update flourish to see this. | Not wired in. Today such an app shows the "couldn't check your plan" state, because no approved line says "update". No 1.1.8 app can be too old yet: the minimum is 1.1.8. Limit: 60 characters. |

## Questions for Amanda before these are final

1. **Line 9:** is the website refund rule for Plus the same as for the main plan (no refund of a partial period unless the law requires it)?
2. **Line 7:** should the Terms state the two numbers (10 and 2), or only that a fair use limit applies? Stating them means a later change needs a Terms change.
3. **Line 10 and line 21:** approving line 21 lets the app say "update" instead of "couldn't check your plan" when it is too old. Until then that case cannot happen in 1.1.8.
4. **The Plaid sentence that is live today** says Plaid retrieves "account balances and transaction history". Line 12 adds holdings for Plus households. Should the existing sentence also mention holdings, or is the new entry enough?
5. **"Last updated" dates** on both documents change when these go in, and the policy notice email may apply (`docs/ops` has the notice sweep).
