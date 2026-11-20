# flourish gifts: every line, APPROVED 2026-11-20

Branch `gift-purchase`. **Approved 2026-11-20** (ChatGPT 100/100 and Grok 100, round 2):
`docs/review/GIFT-COPY-APPROVED-2026-11-20.md`. Every approved line is in the code word for word, and
`tests/giftWords.test.cjs` fails if any line here, in the approved sheet or in the code stops matching. Change a line and it
goes back for approval.

**Hidden, not approved:** the four Plus gift lines (`gift-plan-plus-name`, `gift-plan-plus-detail`, `gift-stripe-name-plus`,
`gift-plan-plus`). The Plus gift is not sold until Plus is live (`PLUS_GIFT_ON_SALE` in `netlify/functions/_lib/gifts.js`),
and none of its lines is in the code.

`{plan}`, `{date}`, `{email}`, `{name}`, `{from}` (the buyer's name), `{start}`, `{end}` are filled in by the code. Dates
read like "December 25, 2026".

## Settled with the approval

1. **Prices.** $99.99 CAD plus tax for a year of flourish (`GIFT_PRICES`, one value). The Plus price stays in that value, unsold.
2. **Refund window.** An unredeemed gift can be refunded within 30 days, by writing to hello@flourishmoney.app. A full Stripe refund voids an unused code whenever it happens.
3. **Plus.** Hidden until Plus is live (PR #128).
4. **Email 2** names the buyer ({from}) and carries its own footer, with a way to ask us to stop gift emails (by reply).
5. **Start rule.** The 12 months start on the LATEST of the day the code is redeemed, the buyer's start date, or the end of a paid period already on the account (migration 0050 `gift_redeem`; tests/gifts.sql.test.cjs 3d to 3f3).
6. **Still to do before launch:** the Privacy Policy update for gift data (approved sheet, note 6).

## Gift page (flourishmoney.app/gift/)

| id | where | draft | status |
|---|---|---|---|
| `gift-page-title` | Browser tab title | Give a year of flourish | approved |
| `gift-page-description` | Search and link-preview description | Give someone a year of flourish. One-time gift, nothing renews. | approved |
| `gift-page-heading` | Page heading | Give a year of flourish | approved |
| `gift-page-intro` | Under the heading | A gift for someone who wants to see their money more clearly. They get 12 months of flourish from a one-time gift that doesn't renew. | approved |
| `gift-page-onetime` | Badge under the intro, above the button, and on the thank-you card | One-time gift, nothing renews. | approved |
| `gift-form-plan-legend` | Above the two gifts | Choose a gift | approved |
| `gift-plan-flourish-name` | First gift's name (also the card's heading) | A year of flourish | approved |
| `gift-plan-flourish-detail` | Under the first gift's price | 12 months of the flourish plan, with no limits on the coach or What-If. | approved |
| `gift-plan-plus-name` | Second gift's name (also the card's heading) | A year of flourish with Plus | hidden |
| `gift-plan-plus-detail` | Under the second gift's price | 12 months of the flourish plan with the Plus add-on: net worth, investments and up to 10 bank connections for the household. | hidden |
| `gift-price-plus-tax` | After each price ("$99.99 plus tax") | plus tax | approved |
| `gift-form-buyer-email` | Field label | Your email | approved |
| `gift-form-buyer-email-help` | Under it | We send the gift code and the printable card here. Stripe sends your receipt here too. | approved |
| `gift-form-buyer-name` | Field label (required) | Your name | approved |
| `gift-form-buyer-name-help` | Under it | Shown to them in the email and on the card, so they know who it is from. | approved |
| `gift-form-delivery-legend` | Above the delivery choice | How should the gift arrive? | approved |
| `gift-form-delivery-email` | Choice 1 | Email it to them on a date I choose | approved |
| `gift-form-delivery-print` | Choice 2 | I'll print the card and give it myself | approved |
| `gift-form-recipient-name` | Field label | Their name | approved |
| `gift-form-optional-print` | Under the name, only when printing | Optional when you print the card. | approved |
| `gift-form-recipient-email` | Field label (email delivery only) | Their email | approved |
| `gift-form-recipient-email-help` | Under it | Used only to send this gift. | approved |
| `gift-form-send-on` | Field label (email delivery only) | Date to email it | approved |
| `gift-form-send-on-help` | Under it | It arrives at 7 a.m. Eastern time on that day. | approved |
| `gift-form-message` | Field label | A short message (optional) | approved |
| `gift-form-message-help` | Under it | Up to 200 characters. It appears on the card and in their email. | approved |
| `gift-form-start-on` | Field label | Start the 12 months on a later date (optional) | approved |
| `gift-form-start-on-help` | Under it | Their 12 months start on the latest of this date, the day they redeem the code, or the end of any paid period they already have. | approved |
| `gift-form-submit` | The button | Continue to checkout | approved |
| `gift-form-sending` | The button while it opens checkout | Opening checkout… | approved |
| `gift-form-stripe-note` | Small print under the button | Checkout is run by Stripe. Sales tax is added there. | approved |
| `gift-how-heading` | Second card's heading | How it works | approved |
| `gift-how-1` | Step 1 | You buy the gift. We email you the gift code and a printable card right away. | approved |
| `gift-how-2` | Step 2 | They go to flourishmoney.app/gift/redeem, sign in or create an account, and enter the code once. | approved |
| `gift-how-3` | Step 3 | Then they get the flourish app on the App Store or Google Play and sign in. Their 12 months start on the latest of the day they redeem the code, the start date you chose, or the end of any paid period they already have. | approved |
| `gift-page-refund` | Small print, second card | Changed your mind? A gift that hasn't been redeemed can be refunded within 30 days of purchase. Write to hello@flourishmoney.app. | approved |
| `gift-thanks-heading` | After checkout, heading | Thank you. Your gift is ready. | approved |
| `gift-thanks-body` | After checkout | We've emailed you the gift code and a printable card. If you don't see it, check your spam folder or write to hello@flourishmoney.app. | approved |

### Gift page: error messages

| id | where | draft | status |
|---|---|---|---|
| `gift-error-buyer-email` | Under "Your email" | Enter your email address. | approved |
| `gift-error-buyer-name` | Under "Your name" | Enter your name. | approved |
| `gift-error-recipient-name` | Under "Their name" | Enter their name. | approved |
| `gift-error-recipient-email` | Under "Their email" | Enter their email address, or choose to print the card. | approved |
| `gift-error-send-on` | Under the send date | Choose a date from today to one year from today. | approved |
| `gift-error-start-on` | Under the start date | Choose a start date from today to one year from today, or leave it blank. | approved |
| `gift-error-message` | Under the message | Keep the message to 200 characters. | approved |
| `gift-error-limited` | Under the button (too many checkouts) | Too many tries from here. Wait an hour, then try again. | approved |
| `gift-error-unavailable` | Instead of the form, when gifts are off | Gifts aren't available right now. Please check back soon. | approved |
| `gift-error-generic` | Under the button | Something went wrong and nothing was charged. Please try again. | approved |

## Stripe Checkout (what Stripe shows the buyer)

| id | where | draft | status |
|---|---|---|---|
| `gift-stripe-name-flourish` | The line item | A year of flourish (gift) | approved |
| `gift-stripe-name-plus` | The line item | A year of flourish with Plus (gift) | hidden |
| `gift-stripe-description` | Under the line item | One-time gift, nothing renews. 12 months, redeemed with a code. | approved |

## The plan inside a sentence (`{plan}`)

| id | where | draft | status |
|---|---|---|---|
| `gift-plan-flourish` | Both emails and the redeem page | a year of flourish | approved |
| `gift-plan-plus` | Both emails and the redeem page | a year of flourish with Plus | hidden |

## Email 1: to the buyer, right after payment ("Your gift is ready")

Order in the email: intro, delivery line, code, card button and link, how, start, one-time, refund, receipt, footer.

| id | where | draft | status |
|---|---|---|---|
| `gift-email1-subject` | Subject | Your gift is ready | approved |
| `gift-email1-intro` | First line | Thank you. Your gift of {plan} is ready. | approved |
| `gift-email1-delivery-email` | When emailed on a date | We'll email it to {name} at {email} on {date}, at 7 a.m. Eastern time. | approved |
| `gift-email1-delivery-print` | When printed | Print the card below and give it to them, or pass the code on yourself. | approved |
| `gift-email1-code-label` | Before the code | Gift code: | approved |
| `gift-email1-card-line` | Before the card's link (under the button) | Printable card: | approved |
| `gift-email1-card-button` | The button | Open the printable card | approved |
| `gift-email1-how` | How it is redeemed | To redeem it, they go to flourishmoney.app/gift/redeem, sign in or create an account, and enter the code. | approved |
| `gift-email1-start-now` | No start date chosen | Their 12 months start on the day they redeem the code, or after any paid period they already have ends if that is later. | approved |
| `gift-email1-start-on` | A start date chosen | Their 12 months start on the latest of {date}, the day they redeem the code, or the end of any paid period they already have. | approved |
| `gift-email1-onetime` | Terms line | One-time gift, nothing renews. The code doesn't expire. | approved |
| `gift-email1-refund` | Refund line | If it hasn't been redeemed, you can ask for a refund within 30 days. Write to hello@flourishmoney.app. A refund cancels the code. | approved |
| `gift-email1-receipt` | Last line | Stripe sends your receipt in a separate email. | approved |

## Email 2: to the recipient, 7 a.m. Eastern on the chosen date

Order: hello, intro, message (if any), code, how, button, start, apps and both store badges, one-time, footer.

| id | where | draft | status |
|---|---|---|---|
| `gift-email2-subject` | Subject | {from} has given you {plan} | approved |
| `gift-email2-hello-name` | Greeting | Hi {name}, | approved |
| `gift-email2-hello` | Greeting with no name | Hi, | approved |
| `gift-email2-intro` | First line | {from} has given you {plan} as a gift. | approved |
| `gift-email2-message-label` | Before the buyer's message (in quotes) | Their message: | approved |
| `gift-email2-code-label` | Before the code | Your gift code: | approved |
| `gift-email2-how` | How to redeem | To redeem it, go to flourishmoney.app/gift/redeem, sign in or create an account, and enter the code once. | approved |
| `gift-email2-button` | The button (to the redeem page) | Redeem your gift | approved |
| `gift-email2-start-now` | No start date chosen | Your 12 months start on the day you redeem the code, or after any paid period you already have ends if that is later. | approved |
| `gift-email2-start-on` | A start date chosen | Your 12 months start on the latest of {date}, the day you redeem the code, or the end of any paid period you already have. | approved |
| `gift-email2-apps` | Above the App Store and Google Play badges | Then get the flourish app and sign in with the same account: | approved |
| `gift-email2-onetime` | Terms line | One-time gift, nothing renews. You won't be asked for a card, and the code doesn't expire. | approved |

## Both emails

| id | where | draft | status |
|---|---|---|---|
| `gift-email-footer` | Email 2's footer, three lines (" / " marks each break) | This email was sent because {from} asked us to send you a flourish gift. / flourish is operated by GrowSmart Inc., PO Box 29, Foxboro ON K0K 2B0. Questions? hello@flourishmoney.app / Rather not get gift emails like this from us? Reply to this email and we'll stop sending them. | approved |
| `gift-email1-footer` | Email 1's footer (unchanged: the household invite's approved footer; approved sheet, note 2) | flourish is operated by GrowSmart Inc., PO Box 29, Foxboro ON K0K 2B0. Questions? hello@flourishmoney.app | approved |

## The printable card (flourishmoney.app/gift/card, from Email 1)

The heading is the gift's name (`gift-plan-flourish-name` or `gift-plan-plus-name`). The QR code opens
flourishmoney.app/gift/redeem; the code is printed beside it, never inside it.

| id | where | draft | status |
|---|---|---|---|
| `gift-card-title` | Browser tab title | Your flourish gift card | approved |
| `gift-card-print-button` | Button above the card (not printed) | Print this card | approved |
| `gift-card-missing` | When the link has no code | This card link is incomplete. Open the link from your gift email again, or write to hello@flourishmoney.app. | approved |
| `gift-card-for` | Under the heading | For {name} | approved |
| `gift-card-from` | Under "For ..." ({from} is the buyer's name) | From {from} | approved |
| `gift-card-code-label` | Above the code | Gift code | approved |
| `gift-card-redeem-at` | Under the code | Redeem at flourishmoney.app/gift/redeem | approved |
| `gift-card-scan` | Under that, small | Or scan the code to open the page. | approved |
| `gift-card-start-now` | No start date | 12 months, starting on the day the code is redeemed, or after any paid period the recipient already has ends if that is later. | approved |
| `gift-card-start-on` | A start date | 12 months, starting on the latest of {date}, the day the code is redeemed, or the end of any paid period the recipient already has. | approved |
| `gift-card-onetime` | Badge at the bottom | One-time gift, nothing renews. | approved |

## Redeem page (flourishmoney.app/gift/redeem)

| id | where | draft | status |
|---|---|---|---|
| `gift-redeem-title` | Browser tab title | Redeem a flourish gift | approved |
| `gift-redeem-heading` | Heading | Redeem your gift | approved |
| `gift-redeem-intro` | Under the heading | Enter the code from your card or email. You only need to do this once. | approved |
| `gift-redeem-onetime` | Badge | One-time gift, nothing renews. No card needed. | approved |
| `gift-redeem-signin-body` | Signed out | Sign in or create an account first, so the gift goes to the right account. | approved |
| `gift-redeem-signin-button` | Signed out, the button | Sign in or create an account | approved |
| `gift-redeem-signed-in` | Signed in, above the field | Signed in as {email}. | approved |
| `gift-redeem-switch` | Link beside it | Use a different account | approved |
| `gift-redeem-code-label` | Field label | Gift code | approved |
| `gift-redeem-code-help` | Under it | 12 letters and numbers, like ABCD-EFGH-JKMN. Dashes and spaces are fine. | approved |
| `gift-redeem-submit` | The button | Redeem | approved |
| `gift-redeem-working` | The button while it checks | Checking… | approved |
| `gift-redeem-ok` | Redeemed, starting now | Your gift is redeemed: {plan}, from {start} to {end}. | approved |
| `gift-redeem-ok-later` | Redeemed, starting later | Your gift is redeemed. Your 12 months start on {start} and run to {end}. | approved |
| `gift-redeem-paid-note` | Already paying | You already have a paid plan that runs to {date}. Your gift starts after that paid period ends, or on the gift's chosen start date if that is later. | approved |
| `gift-redeem-renew-app-store` | Already paying, App Store, renewal on | To avoid being charged again, turn off auto-renew in your Apple Account settings, under Subscriptions. | approved |
| `gift-redeem-renew-play-store` | Already paying, Google Play, renewal on | To avoid being charged again, turn off auto-renew in Google Play, under Payments and subscriptions. | approved |
| `gift-redeem-renew-stripe` | Already paying, Stripe, renewal on | To avoid being charged again, turn off auto-renew on our website: open Settings, choose Manage subscription, and cancel. You keep your plan until its paid period ends. | approved |
| `gift-redeem-next` | Above the App Store and Google Play badges | Now get the flourish app and sign in with this account: | approved |

### Redeem page: messages

| id | where | draft | status |
|---|---|---|---|
| `gift-redeem-empty` | Nothing typed | Enter the code from your card or email. | approved |
| `gift-redeem-used` | Redeemed on another account | This code has already been redeemed on a flourish account. If that was you, sign in to that account to use your gift. | approved |
| `gift-redeem-mine` | Redeemed on this account | You've already redeemed this code on this account. Your gift runs to {end}. | approved |
| `gift-redeem-invalid` | No such code | That code doesn't match a gift. Check it and try again. | approved |
| `gift-redeem-void` | Refunded | This gift was refunded, so its code can't be redeemed. Questions? Write to hello@flourishmoney.app. | approved |
| `gift-redeem-limited` | Too many tries | Too many tries. Wait an hour, then try again. | approved |
| `gift-redeem-signin-again` | Sign-in ran out | Please sign in again, then enter your code. | approved |
| `gift-redeem-error` | Anything else | Something went wrong and your code wasn't used. Please try again. | approved |

## Inside the website (not the store apps)

| id | where | draft | status |
|---|---|---|---|
| `gift-signin-note` | The website's sign-in card, when it came from the redeem page | Sign in or create an account to redeem your gift. You'll come back to the code page after. | approved |
| `gift-settings-line` | Website Settings, the plan card, for an account on a gift | Your plan is a gift and runs to {date}. Nothing renews. | approved |

## Terms of Service: a new "Gifts" section (matches the page)

On the website's Terms only, after section 7 (`GIFT_TERMS` in `src/lib/giftReturn.js`; a store build compiles it away).

| id | where | draft | status |
|---|---|---|---|
| `gift-terms-heading` | Section heading | Gifts | approved |
| `gift-terms-1` | Paragraph 1 | You can buy a year of flourish as a gift at flourishmoney.app/gift. A gift is a one-time purchase: nothing renews, and redeeming it does not require payment details. | approved |
| `gift-terms-2` | Paragraph 2 | The price is shown on the gift page in Canadian dollars. Sales tax is added at checkout. Stripe processes the payment. | approved |
| `gift-terms-3` | Paragraph 3 | Each gift has one code. A code can be redeemed once, on one flourish account, on our website; it can't be redeemed in the iPhone or Android app. The code doesn't expire. | approved |
| `gift-terms-4` | Paragraph 4 | The 12 months start on the latest of the day the code is redeemed, any start date the buyer chose, or the end of any paid period already on the account. To avoid being charged again, turn off auto-renew where that paid plan was bought: the App Store, Google Play, or Stripe through our website. | approved |
| `gift-terms-5` | Paragraph 5 | If the buyer chose email delivery, we email the gift to the address they gave at 7 a.m. Eastern time on the date they chose. We use that address only to send the gift. | approved |
| `gift-terms-6` | Paragraph 6 | A gift that hasn't been redeemed can be refunded within 30 days of purchase. Write to hello@flourishmoney.app. A refund cancels the code. Once a code is redeemed, the gift can't be refunded or moved to another account. | approved |
| `gift-terms-7` | Paragraph 7 | A gift has no cash value and can't be exchanged for money or credit. Keep the code private until you give it: anyone who has the code can redeem it. | approved |
