# flourish gifts: every new line, for Amanda's review

Branch `gift-purchase`. **Nothing here is approved.** The code shows each line as a `[WORDS: id]` placeholder, so no
production build can ship until the words are approved (`scripts/check-pending-words.mjs`), and no gift email is sent
while it still holds one. When you approve a line, it goes into the code word for word and its status here becomes
`approved`. `tests/giftWords.test.cjs` keeps this file and the code in step.

Rules every draft follows: "one-time gift, nothing renews" on the page, both emails and the card; none of *sets aside,
holds back, learns, remembers, smarter, covered, covers, web app, never invents*; no sentence starts with save, spend, pay
or invest; flourish in lowercase; no em dashes; no line that sends people to use the website instead of the app.

`{plan}`, `{date}`, `{email}`, `{name}`, `{start}`, `{end}` are filled in by the code. `{plan}` is
`gift-plan-flourish` or `gift-plan-plus`. Dates read like "December 25, 2026".

## Decisions for you (the words depend on them)

1. **Prices.** $99.99 and $149.98 CAD plus tax, set in one place (`GIFT_PRICES` in `netlify/functions/_lib/gifts.js`). Confirm or give the real ones.
2. **Refund window.** The drafts say an unredeemed gift can be refunded within 30 days, by writing to hello@flourishmoney.app (GrowSmart's rule). The code itself voids an unused gift on any full Stripe refund, whenever it happens.
3. **Plus is not live yet.** The Plus add-on is PR #128 (not merged). Until it is, a "with Plus" gift turns on the flourish plan; the gift row records that it is a Plus gift, so the add-on can read it once #128 is in. The Plus detail line below describes #128's add-on; check it matches what ships.
4. **The recipient's email** is sent by flourish to someone who never signed up (the buyer gave the address). It carries no marketing and no unsubscribe, like the household invite. Confirm that suits CASL as a transactional message.
5. **Couple mode.** A redeemed gift counts for the other member of a household, the same as a paid plan does. Say if it should not.

## Gift page (flourishmoney.app/gift/)

| id | where | draft | status |
|---|---|---|---|
| `gift-page-title` | Browser tab title | Give a year of flourish | pending |
| `gift-page-description` | Search and link-preview description | Give someone a year of flourish. One-time gift, nothing renews. | pending |
| `gift-page-heading` | Page heading | Give a year of flourish | pending |
| `gift-page-intro` | Under the heading | A gift for someone who wants a clear, calm view of their money. They get 12 months of flourish, with nothing to cancel later. | pending |
| `gift-page-onetime` | Badge under the intro, above the button, and on the thank-you card | One-time gift, nothing renews. | pending |
| `gift-form-plan-legend` | Above the two gifts | Choose a gift | pending |
| `gift-plan-flourish-name` | First gift's name (also the card's heading) | A year of flourish | pending |
| `gift-plan-flourish-detail` | Under the first gift's price | 12 months of the flourish plan, with no limits on the coach or What-If. | pending |
| `gift-plan-plus-name` | Second gift's name (also the card's heading) | A year of flourish with Plus | pending |
| `gift-plan-plus-detail` | Under the second gift's price | 12 months of the flourish plan with the Plus add-on: net worth, investments and up to 10 bank connections for the household. | pending |
| `gift-price-plus-tax` | After each price ("$99.99 plus tax") | plus tax | pending |
| `gift-form-buyer-email` | Field label | Your email | pending |
| `gift-form-buyer-email-help` | Under it | We send the gift code and the printable card here. Stripe sends your receipt here too. | pending |
| `gift-form-delivery-legend` | Above the delivery choice | How should the gift arrive? | pending |
| `gift-form-delivery-email` | Choice 1 | Email it to them on a date I choose | pending |
| `gift-form-delivery-print` | Choice 2 | I'll print the card and give it myself | pending |
| `gift-form-recipient-name` | Field label | Their name | pending |
| `gift-form-optional-print` | Under the name, only when printing | Optional when you print the card. | pending |
| `gift-form-recipient-email` | Field label (email delivery only) | Their email | pending |
| `gift-form-recipient-email-help` | Under it | Used only to send this gift. | pending |
| `gift-form-send-on` | Field label (email delivery only) | Date to email it | pending |
| `gift-form-send-on-help` | Under it | It arrives at 7 a.m. Eastern time on that day. | pending |
| `gift-form-message` | Field label | A short message (optional) | pending |
| `gift-form-message-help` | Under it | Up to 200 characters. It appears on the card and in their email. | pending |
| `gift-form-start-on` | Field label | Start the year on a later date (optional) | pending |
| `gift-form-start-on-help` | Under it | Their 12 months start on this date, or on the day they redeem the code if that is later. | pending |
| `gift-form-submit` | The button | Continue to checkout | pending |
| `gift-form-sending` | The button while it opens checkout | Opening checkout… | pending |
| `gift-form-stripe-note` | Small print under the button | Checkout is run by Stripe. Tax is added there, based on your billing address. | pending |
| `gift-how-heading` | Second card's heading | How it works | pending |
| `gift-how-1` | Step 1 | You buy the gift. We email you the gift code and a printable card right away. | pending |
| `gift-how-2` | Step 2 | They go to flourishmoney.app/gift/redeem, sign in or create an account, and enter the code once. | pending |
| `gift-how-3` | Step 3 | Then they get the flourish app on the App Store or Google Play and sign in. Their 12 months start that day, or on the start date you chose. | pending |
| `gift-page-refund` | Small print, second card | Changed your mind? A gift that hasn't been redeemed can be refunded within 30 days of purchase. Write to hello@flourishmoney.app. | pending |
| `gift-thanks-heading` | After checkout, heading | Thank you. Your gift is ready. | pending |
| `gift-thanks-body` | After checkout | We've emailed you the gift code and a printable card. If it isn't in your inbox in a few minutes, check your spam folder or write to hello@flourishmoney.app. | pending |

### Gift page: error messages

| id | where | draft | status |
|---|---|---|---|
| `gift-error-buyer-email` | Under "Your email" | Enter your email address. | pending |
| `gift-error-recipient-name` | Under "Their name" | Enter their name. | pending |
| `gift-error-recipient-email` | Under "Their email" | Enter their email address, or choose to print the card. | pending |
| `gift-error-send-on` | Under the send date | Choose a date from today to one year from today. | pending |
| `gift-error-start-on` | Under the start date | Choose a start date from today to one year from today, or leave it blank. | pending |
| `gift-error-message` | Under the message | Keep the message to 200 characters. | pending |
| `gift-error-limited` | Under the button (too many checkouts) | Too many tries from here. Wait an hour, then try again. | pending |
| `gift-error-unavailable` | Instead of the form, when gifts are off | Gifts aren't available right now. Please check back soon. | pending |
| `gift-error-generic` | Under the button | Something went wrong and nothing was charged. Please try again. | pending |

## Stripe Checkout (what Stripe shows the buyer)

| id | where | draft | status |
|---|---|---|---|
| `gift-stripe-name-flourish` | The line item | A year of flourish (gift) | pending |
| `gift-stripe-name-plus` | The line item | A year of flourish with Plus (gift) | pending |
| `gift-stripe-description` | Under the line item | One-time gift, nothing renews. 12 months, redeemed with a code. | pending |

## The plan inside a sentence (`{plan}`)

| id | where | draft | status |
|---|---|---|---|
| `gift-plan-flourish` | Both emails and the redeem page | a year of flourish | pending |
| `gift-plan-plus` | Both emails and the redeem page | a year of flourish with Plus | pending |

## Email 1: to the buyer, right after payment ("Your gift is ready")

Order in the email: intro, delivery line, code, card button and link, how, start, one-time, refund, receipt, footer.

| id | where | draft | status |
|---|---|---|---|
| `gift-email1-subject` | Subject | Your gift is ready | pending |
| `gift-email1-intro` | First line | Thank you. Your gift of {plan} is ready. | pending |
| `gift-email1-delivery-email` | When emailed on a date | We'll email it to {name} at {email} on {date}, at 7 a.m. Eastern time. | pending |
| `gift-email1-delivery-print` | When printed | Print the card below and give it to them, or pass the code on yourself. | pending |
| `gift-email1-code-label` | Before the code | Gift code: | pending |
| `gift-email1-card-line` | Before the card's link (under the button) | Printable card: | pending |
| `gift-email1-card-button` | The button | Open the printable card | pending |
| `gift-email1-how` | How it is redeemed | To redeem it, they go to flourishmoney.app/gift/redeem, sign in or create an account, and enter the code. | pending |
| `gift-email1-start-now` | No start date chosen | Their 12 months start on the day they redeem the code. | pending |
| `gift-email1-start-on` | A start date chosen | Their 12 months start on {date}, or on the day they redeem the code if that is later. | pending |
| `gift-email1-onetime` | Terms line | One-time gift, nothing renews. The code doesn't expire. | pending |
| `gift-email1-refund` | Refund line | If it hasn't been redeemed, you can ask for a refund within 30 days. Write to hello@flourishmoney.app. A refund cancels the code. | pending |
| `gift-email1-receipt` | Last line | Stripe sends your receipt in a separate email. | pending |

## Email 2: to the recipient, 7 a.m. Eastern on the chosen date

Order: hello, intro, message (if any), code, how, button, start, apps and both store badges, one-time, footer.

| id | where | draft | status |
|---|---|---|---|
| `gift-email2-subject` | Subject | You've been given {plan} | pending |
| `gift-email2-hello-name` | Greeting | Hi {name}, | pending |
| `gift-email2-hello` | Greeting with no name | Hi, | pending |
| `gift-email2-intro` | First line | Someone has given you {plan} as a gift. | pending |
| `gift-email2-message-label` | Before the buyer's message (in quotes) | Their message: | pending |
| `gift-email2-code-label` | Before the code | Your gift code: | pending |
| `gift-email2-how` | How to redeem | To redeem it, go to flourishmoney.app/gift/redeem, sign in or create an account, and enter the code once. | pending |
| `gift-email2-button` | The button (to the redeem page) | Redeem your gift | pending |
| `gift-email2-start-now` | No start date chosen | Your 12 months start on the day you redeem it. | pending |
| `gift-email2-start-on` | A start date chosen | Your 12 months start on {date}, or on the day you redeem it if that is later. | pending |
| `gift-email2-apps` | Above the App Store and Google Play badges | Then get the flourish app and sign in with the same account: | pending |
| `gift-email2-onetime` | Terms line | One-time gift, nothing renews. You won't be asked for a card, and the code doesn't expire. | pending |

## Both emails

| id | where | draft | status |
|---|---|---|---|
| `gift-email-footer` | Footer (the household invite's approved footer, word for word) | flourish is operated by GrowSmart Inc., PO Box 29, Foxboro ON K0K 2B0. Questions? hello@flourishmoney.app | pending |

## The printable card (flourishmoney.app/gift/card, from Email 1)

The heading is the gift's name (`gift-plan-flourish-name` or `gift-plan-plus-name`). The QR code opens
flourishmoney.app/gift/redeem; the code is printed beside it, never inside it.

| id | where | draft | status |
|---|---|---|---|
| `gift-card-title` | Browser tab title | Your flourish gift card | pending |
| `gift-card-print-button` | Button above the card (not printed) | Print this card | pending |
| `gift-card-missing` | When the link has no code | This card link is incomplete. Open the link from your gift email again, or write to hello@flourishmoney.app. | pending |
| `gift-card-for` | Under the heading | For {name} | pending |
| `gift-card-code-label` | Above the code | Gift code | pending |
| `gift-card-redeem-at` | Under the code | Redeem at flourishmoney.app/gift/redeem | pending |
| `gift-card-scan` | Under that, small | Or scan the code to open the page. | pending |
| `gift-card-start-now` | No start date | 12 months, starting the day the code is redeemed. | pending |
| `gift-card-start-on` | A start date | 12 months, starting {date} or the day the code is redeemed, whichever is later. | pending |
| `gift-card-onetime` | Badge at the bottom | One-time gift, nothing renews. | pending |

## Redeem page (flourishmoney.app/gift/redeem)

| id | where | draft | status |
|---|---|---|---|
| `gift-redeem-title` | Browser tab title | Redeem a flourish gift | pending |
| `gift-redeem-heading` | Heading | Redeem your gift | pending |
| `gift-redeem-intro` | Under the heading | Enter the code from your card or email. You only need to do this once. | pending |
| `gift-redeem-onetime` | Badge | One-time gift, nothing renews. No card needed. | pending |
| `gift-redeem-signin-body` | Signed out | Sign in or create an account first, so the gift goes to the right account. | pending |
| `gift-redeem-signin-button` | Signed out, the button | Sign in or create an account | pending |
| `gift-redeem-signed-in` | Signed in, above the field | Signed in as {email}. | pending |
| `gift-redeem-switch` | Link beside it | Use a different account | pending |
| `gift-redeem-code-label` | Field label | Gift code | pending |
| `gift-redeem-code-help` | Under it | 12 letters and numbers, like ABCD-EFGH-JKMN. Dashes and spaces are fine. | pending |
| `gift-redeem-submit` | The button | Redeem | pending |
| `gift-redeem-working` | The button while it checks | Checking… | pending |
| `gift-redeem-ok` | Redeemed, starting now | Your gift is redeemed: {plan}, from {start} to {end}. | pending |
| `gift-redeem-ok-later` | Redeemed, starting later | Your gift is redeemed. Your 12 months start on {start} and run to {end}. | pending |
| `gift-redeem-paid-note` | Already paying | You already have a paid plan that runs to {date}, so your gift's 12 months start when it ends. | pending |
| `gift-redeem-renew-app-store` | Already paying, App Store, renewal on | To avoid being charged again, turn off auto-renew in your Apple Account settings, under Subscriptions. | pending |
| `gift-redeem-renew-play-store` | Already paying, Google Play, renewal on | To avoid being charged again, turn off auto-renew in Google Play, under Payments and subscriptions. | pending |
| `gift-redeem-renew-stripe` | Already paying, Stripe, renewal on | To avoid being charged again, turn off auto-renew on our website: open Settings, choose Manage subscription, and cancel. You keep your plan until its paid period ends. | pending |
| `gift-redeem-next` | Above the App Store and Google Play badges | Now get the flourish app and sign in with this account: | pending |

### Redeem page: messages

| id | where | draft | status |
|---|---|---|---|
| `gift-redeem-empty` | Nothing typed | Enter the code from your card or email. | pending |
| `gift-redeem-used` | Redeemed on another account | This code has already been redeemed on a flourish account. If that was you, sign in to that account to use your gift. | pending |
| `gift-redeem-mine` | Redeemed on this account | You've already redeemed this code on this account. Your gift runs to {end}. | pending |
| `gift-redeem-invalid` | No such code | That code doesn't match a gift. Check it and try again. | pending |
| `gift-redeem-void` | Refunded | This gift was refunded, so its code can't be redeemed. Questions? Write to hello@flourishmoney.app. | pending |
| `gift-redeem-limited` | Too many tries | Too many tries. Wait an hour, then try again. | pending |
| `gift-redeem-signin-again` | Sign-in ran out | Please sign in again, then enter your code. | pending |
| `gift-redeem-error` | Anything else | Something went wrong and your code wasn't used. Please try again. | pending |

## Inside the website (not the store apps)

| id | where | draft | status |
|---|---|---|---|
| `gift-signin-note` | The website's sign-in card, when it came from the redeem page | Sign in or create an account to redeem your gift. You'll come back to the code page after. | pending |
| `gift-settings-line` | Website Settings, the plan card, for an account on a gift | Your plan is a gift and runs to {date}. Nothing renews. | pending |

## Terms of Service: a new "Gifts" section (matches the page)

Not in the code yet: it goes into the Terms on the website once approved, after section 7.

| id | where | draft | status |
|---|---|---|---|
| `gift-terms-heading` | Section heading | Gifts | pending |
| `gift-terms-1` | Paragraph 1 | You can buy a year of flourish, or a year of flourish with Plus, as a gift at flourishmoney.app/gift. A gift is a one-time purchase: nothing renews, and the person who receives it is never asked for a card. | pending |
| `gift-terms-2` | Paragraph 2 | The price is shown on the gift page in Canadian dollars. Sales tax is added at checkout based on your billing address. Stripe processes the payment. | pending |
| `gift-terms-3` | Paragraph 3 | Each gift has one code. A code can be redeemed once, on one flourish account, on our website; it can't be redeemed in the iPhone or Android app. The code doesn't expire. | pending |
| `gift-terms-4` | Paragraph 4 | The 12 months start on the day the code is redeemed, or on the start date the buyer chose, whichever is later. If the account already has a paid plan, the gift's 12 months start when that paid period ends. To avoid being charged again, turn off auto-renew where that plan was bought: the App Store, Google Play, or Stripe through our website. | pending |
| `gift-terms-5` | Paragraph 5 | If the buyer chose email delivery, we email the gift to the address they gave at 7 a.m. Eastern time on the date they chose. We use that address only to send the gift. | pending |
| `gift-terms-6` | Paragraph 6 | A gift that hasn't been redeemed can be refunded within 30 days of purchase. Write to hello@flourishmoney.app. A refund cancels the code. Once a code is redeemed, the gift can't be refunded or moved to another account. | pending |
| `gift-terms-7` | Paragraph 7 | A gift has no cash value and can't be exchanged for money or credit. Keep the code private until you give it: anyone who has the code can redeem it. | pending |
