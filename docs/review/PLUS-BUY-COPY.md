# flourish Plus purchase screens: the new lines (2026-11-20)

For ChatGPT and Grok. **20 new lines**, all placeholders on branch `plus-1.1.8`.

- **Nothing here is approved, and none of it is in the code.** The code holds `[WORDS: id]` for each (`src/lib/netWorthWords.js`, ids `plus-buy-*`). The "Draft line" column is a first draft to review.
- The production website build and every store build refuse to build while one placeholder is left (`scripts/check-pending-words.mjs`).
- Where each shows, the facts it must say and its limit are the same as in `docs/product/NET-WORTH-WORDS.md` ("Buying flourish Plus"). When a line is approved it replaces the placeholder there and in the code, word for word.
- A store app never names the website, Stripe or the other store, and shows no price of ours: the price there is the store's own.

## The block to paste

```
Review: the words on the flourish Plus purchase screens, version 1.1.8. flourish is a Canadian budgeting app that shows what's safe to spend until payday. The main paid plan is called "flourish". "flourish Plus" is an optional add-on to any plan: net worth and investments, and more connected banks (2 per person on the main plan; up to 10 per household with Plus, a fair use limit). On the website it is bought with Stripe for $4.99 CAD a month or $49.99 CAD a year, plus tax. In the iPhone and Android apps it is bought through the App Store or Google Play at the store's own price, and those apps never name the website. Rules: lowercase flourish, plain words, no dashes, no advice or verdicts, nothing untrue, no price in these lines (the price is shown beside them). Never use: sets aside, holds back, learns, remembers, smarter, covered, covers, web app, never invents. No sentence starts with Save, Spend, Pay or Invest. {limit} is a whole number the app fills in (10). Reply AGREE, or give exact fixes by number, with a score out of 100.

1. The button on the locked net worth card (Today, Goals) and on the Settings card, for a household without flourish Plus (limit 30 characters): "See flourish Plus"
2. The flourish Plus screen's heading, and the Settings card's title (limit 30 characters): "flourish Plus"
3. Under the heading; also the Settings card's line for a household without flourish Plus (limit 120 characters): "An optional add-on to any flourish plan: net worth, investments and more connected banks."
4. The flourish Plus screen, what it includes, first line (limit 70 characters): "Your net worth, by currency, private until you share it"
5. The same list, second line (limit 70 characters): "Your investment holdings, from your linked accounts"
6. The same list, third line (limit 80 characters): "Up to {limit} connected banks for your household (fair use limit)"
7. The flourish Plus screen, under the list (limit 140 characters): "flourish Plus is billed on its own, apart from your flourish subscription. Cancelling one doesn't cancel the other."
8. Website only, under the two plans (limit 140 characters): "Payment is handled by Stripe. flourish Plus starts once Stripe confirms the payment, and renews until you cancel."
9. Website and store apps, when the store or Stripe has no flourish Plus product to sell yet (product not found) (limit 100 characters): "flourish Plus isn't available to buy here yet. Nothing was charged."
10. Website and store apps, when the server says the household already has flourish Plus (limit 100 characters): "Your household already has flourish Plus, so nothing was bought."
11. Store apps, when the store is still waiting on the purchase (Ask to Buy, a slow payment) (limit 120 characters): "The store is still waiting on this purchase. flourish Plus starts as soon as the store confirms it."
12. Website, when checkout or the billing portal could not be opened (limit 90 characters): "That didn't open. Nothing was charged. Please try again."
13. Website, back from Stripe after paying, until the server has confirmed (limit 100 characters): "Thanks. flourish Plus will show here once Stripe confirms the payment."
14. Website, back from Stripe after closing checkout without paying (limit 80 characters): "Checkout was closed. Nothing was charged."
15. Store apps, when the store took a flourish Plus purchase although this person's Plus was already live (limit 260 characters): "You already had flourish Plus, and the store took this purchase as well. flourish Plus stays on. You can ask the store that charged you for a refund of this purchase: Apple at reportaproblem.apple.com, or Google Play from your order history."
16. The flourish Plus screen and the Settings card, for a household with flourish Plus of its own (limit 60 characters): "Your household has flourish Plus."
17. The same places, when it is the partner's flourish Plus (limit 80 characters): "Your partner's flourish Plus includes you."
18. The website, for a household whose flourish Plus was bought in the App Store (limit 120 characters): "To change or cancel flourish Plus, open Settings on your iPhone, tap your name, then Subscriptions."
19. The website, for a household whose flourish Plus was bought in Google Play (limit 120 characters): "To change or cancel flourish Plus, open Google Play, tap your profile, then Payments & subscriptions."
20. Store apps, for a household whose flourish Plus was bought somewhere this phone cannot open: the website, or the other store (a store app never names the website or another store) (limit 90 characters): "flourish Plus on this account is managed where it was bought."
```

## Every line: where it shows, what it must say, the draft and its limit

Lengths are counted with {limit} filled in as 10.

| # | Id | Where it shows | The facts it must say | Draft line | Length / limit |
|---|---|---|---|---|---|
| 1 | `plus-buy-open` | The button on the locked net worth card (Today, Goals) and on the Settings card, for a household without flourish Plus | Opens the flourish Plus screen. No price, no claim | See flourish Plus | 17 / 30 |
| 2 | `plus-buy-title` | The flourish Plus screen's heading, and the Settings card's title | The add-on's name | flourish Plus | 13 / 30 |
| 3 | `plus-buy-lead` | Under the heading; also the Settings card's line for a household without flourish Plus | Plus is an optional add-on to any flourish plan; it adds net worth, investments and more connected banks. No price | An optional add-on to any flourish plan: net worth, investments and more connected banks. | 89 / 120 |
| 4 | `plus-buy-includes-networth` | The flourish Plus screen, what it includes, first line | Net worth, shown per currency and never added across currencies; private between partners until shared | Your net worth, by currency, private until you share it | 55 / 70 |
| 5 | `plus-buy-includes-investments` | The same list, second line | Investment holdings from linked accounts. No advice, no return claimed | Your investment holdings, from your linked accounts | 51 / 70 |
| 6 | `plus-buy-includes-banks` | The same list, third line | Up to {limit} connected banks for the household with Plus (10), a fair use limit; the main plan includes 2 per person | Up to {limit} connected banks for your household (fair use limit) | 60 / 80 |
| 7 | `plus-buy-separate` | The flourish Plus screen, under the list | Plus is billed by itself, apart from the flourish subscription; cancelling one does not cancel the other | flourish Plus is billed on its own, apart from your flourish subscription. Cancelling one doesn't cancel the other. | 115 / 140 |
| 8 | `plus-buy-web-note` | Website only, under the two plans | Stripe handles the payment; Plus starts once Stripe confirms the payment; it renews automatically until cancelled | Payment is handled by Stripe. flourish Plus starts once Stripe confirms the payment, and renews until you cancel. | 113 / 140 |
| 9 | `plus-buy-not-available` | Website and store apps, when the store or Stripe has no flourish Plus product to sell yet (product not found) | Plus cannot be bought here yet; nothing was charged; no date promised | flourish Plus isn't available to buy here yet. Nothing was charged. | 67 / 100 |
| 10 | `plus-buy-already` | Website and store apps, when the server says the household already has flourish Plus | The household already has Plus; nothing was bought | Your household already has flourish Plus, so nothing was bought. | 64 / 100 |
| 11 | `plus-buy-pending` | Store apps, when the store is still waiting on the purchase (Ask to Buy, a slow payment) | The store is still waiting; Plus starts when the store confirms | The store is still waiting on this purchase. flourish Plus starts as soon as the store confirms it. | 99 / 120 |
| 12 | `plus-buy-web-failed` | Website, when checkout or the billing portal could not be opened | It did not open; nothing was charged; try again | That didn't open. Nothing was charged. Please try again. | 56 / 90 |
| 13 | `plus-buy-started` | Website, back from Stripe after paying, until the server has confirmed | Plus shows here once Stripe confirms the payment; nothing more to do | Thanks. flourish Plus will show here once Stripe confirms the payment. | 70 / 100 |
| 14 | `plus-buy-web-cancelled` | Website, back from Stripe after closing checkout without paying | Checkout was closed; nothing was charged | Checkout was closed. Nothing was charged. | 41 / 80 |
| 15 | `plus-buy-charged-twice` | Store apps, when the store took a flourish Plus purchase although this person's Plus was already live | Plus was already on; the store took this purchase as well; Plus stays on; a refund of this purchase is asked of the store that charged (Apple at reportaproblem.apple.com, Google Play from the order history) | You already had flourish Plus, and the store took this purchase as well. flourish Plus stays on. You can ask the store that charged you for a refund of this purchase: Apple at reportaproblem.apple.com, or Google Play from your order history. | 241 / 260 |
| 16 | `plus-buy-have` | The flourish Plus screen and the Settings card, for a household with flourish Plus of its own | The household has flourish Plus. No price, no date | Your household has flourish Plus. | 33 / 60 |
| 17 | `plus-buy-have-partner` | The same places, when it is the partner's flourish Plus | The partner's Plus includes this person; nothing to buy or manage here | Your partner's flourish Plus includes you. | 42 / 80 |
| 18 | `plus-buy-manage-app-store` | The website, for a household whose flourish Plus was bought in the App Store | Where it is changed or cancelled: on the iPhone, Settings, your name, Subscriptions | To change or cancel flourish Plus, open Settings on your iPhone, tap your name, then Subscriptions. | 99 / 120 |
| 19 | `plus-buy-manage-play` | The website, for a household whose flourish Plus was bought in Google Play | Where it is changed or cancelled: Google Play, your profile, Payments and subscriptions, Subscriptions | To change or cancel flourish Plus, open Google Play, tap your profile, then Payments & subscriptions. | 101 / 120 |
| 20 | `plus-buy-manage-elsewhere` | Store apps, for a household whose flourish Plus was bought somewhere this phone cannot open: the website, or the other store (a store app never names the website or another store) | It is managed where it was bought. No website named, no link | flourish Plus on this account is managed where it was bought. | 61 / 90 |

## Approved lines used again on these screens, exactly as they are (nothing to review unless you want them changed)

| Where | The line | Where it is used today |
|---|---|---|
| Both plans' names | Monthly, Annual | the plans screens (`src/lib/storeOffer.js`, approved 2026-10-20) |
| Website, each plan's price | $4.99 a month, $49.99 a year, each with "CAD plus tax" under it | the website's plans (`src/lib/billingVisibility.js`) |
| Website, each plan's button | Go to secure checkout | the website's plan review step (`src/lib/upgradeFlow.js`, approved 2026-10-27) |
| Website, the button while Stripe opens | Opening checkout… | the website's plan review step |
| Store apps, each plan's price | the store's own price, then "a month" or "a year" | the store plans screen (approved 2026-10-20) |
| Store apps, each plan's button | Subscribe for {the store's price} a month (or a year) | the store plans screen (approved 2026-10-20) |
| iPhone, under the plans | Payment is charged to your Apple Account when you confirm. Your subscription renews automatically unless you cancel at least 24 hours before the current period ends. You can manage or cancel it in your Apple Account settings. | the store plans screen (approved 2026-10-20) |
| Android, under the plans | Payment is charged through Google Play when you confirm. Your subscription renews automatically unless you cancel before the renewal date. You can manage or cancel it in Google Play under Subscriptions. | the store plans screen (approved 2026-10-20) |
| Store apps, the three links | Restore purchases, Terms of Use, Privacy Policy | the store plans screen (approved 2026-10-20) |
| Store apps, while the store is asked | Confirming with the store… | the store plans screen (approved 2026-10-20) |
| Store apps, the store could not be reached | The store couldn't be reached just now. Your data is safe. Restore purchases works once the store answers. | the store plans screen (approved 2026-10-20) |
| Store apps, the store did not complete the purchase | The store didn't complete the purchase. If you see a charge for it, tap Restore purchases. | the store plans screen (approved 2026-10-20) |
| Store apps, the store took it and the server has not heard yet | The store took the purchase, and Flourish is still waiting to hear it from the store. Try Restore purchases again shortly. | the store plans screen (approved 2026-10-20) |
| Store apps, Restore found nothing | No subscription was found for this store account. | the store plans screen (approved 2026-10-20) |
| Everywhere, the plan could not be read | We couldn't check your plan just now. Nothing has changed. Please try again. | line 1 of the 48 (approved 2026-11-20) |
| Everywhere, the button once bought | Manage subscription | Settings and the plans screens |
| Everywhere | Close, Check again | the store plans screen (approved 2026-10-20) |

Two notes on the reused lines:
- "The store took the purchase, and Flourish is still waiting…" has a capital F. It is the approved line of 2026-10-20 and is also on the main plans screen; say if both should change.
- The store disclosure says "Your subscription". On this screen that subscription is flourish Plus.

## Names typed into the consoles (drafts, not in the code)

These are what a buyer sees in the store's own sheet, on a receipt, and under their subscriptions. `docs/ops/PLUS-ADDON-CONSOLES.md` says where each is typed. Review them with the 20 lines.

| Where | Draft | Limit |
|---|---|---|
| App Store: the subscription group's display name | flourish Plus | the form shows it |
| App Store: monthly, display name | flourish Plus monthly | 30 |
| App Store: annual, display name | flourish Plus annual | 30 |
| App Store: both, description | Net worth, investments, more banks | 45 |
| Google Play: the subscription's name | flourish Plus | the form shows it |
| Google Play: benefit 1 | Net worth by currency | the form shows it |
| Google Play: benefit 2 | Investment holdings | the form shows it |
| Google Play: benefit 3 | More connected banks | the form shows it |
| Google Play: description | An optional add-on to any flourish plan. | the form shows it |
| Stripe: the product's name (Checkout, receipts, the portal) | flourish Plus | none |
| Stripe: the product's description | An optional add-on to any flourish plan: net worth, investments and more connected banks. | none |

## Words these screens still do not have

1. **The Settings line for a household over its bank limit** (approved line 4 of the 48). The screen that shows it is not built.
2. **Terms of Service:** flourish Plus in section 7 (price, renewal, cancelling, refunds) and the fair use sentence for 10 banks.
3. **Privacy Policy:** whether net worth entries and the sharing choice need a sentence.
4. **The store listings and review notes** for the new subscriptions (`docs/ops/PLUS-ADDON-CONSOLES.md` lists each field).
