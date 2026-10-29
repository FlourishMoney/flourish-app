# Founding seats: the words (approved)

**The rule (Amanda, 2026-10-29).** The founding price, CA$79.99 a year plus tax, goes to the **first 50 households who subscribe to it**: on the website, the App Store or Google Play. A waitlist number no longer grants it. A seat is taken when a founding subscription's first payment succeeds, and a refund gives it back. A founding subscriber keeps the price while subscribed. At 50, the founding offer is gone everywhere.

**Approved 2026-10-29, word for word** (ChatGPT and Grok agreed). The source is `~/Documents/Flourish/couple-mode/FOUNDING-SEATS-WORDS-APPROVED.md`. `tests/foundingSeatsWords.test.cjs` checks two things:
- every line below is in the code exactly as written;
- each line is within its limit.

In a line, `{n}` stands for the live number of founding spots left.

**No placeholder is left.** If a line ever has to be rewritten, it shows as `[WORDS: id]` until its words are approved. `scripts/check-pending-words.mjs` refuses the production web deploy and every store build while any placeholder is left.

## The lines

| # | id | where it shows | approved line | limit | in the code |
|---|---|---|---|---|---|
| 1 | trial-link | Store apps. Small print under the plans on the founding plans screen (the one that opens by itself), only for a household in its 14-day trial. Tapping it opens the confirm (2 to 5). | Not now, keep my 14-day trial | 45 characters | `src/lib/pendingWords.js` |
| 2 | trial-confirm-title | Store apps. The confirm's title. | Keep your trial for now? | 40 characters | `src/lib/pendingWords.js` |
| 3 | trial-confirm-body | Store apps. The confirm's text, under the title. | There are {n} founding spots left. They go to the first households who subscribe, and we can't hold one for you. You can still choose Founding annual later if spots remain. | 280 characters | `src/lib/pendingWords.js` |
| 4 | trial-confirm-stay | Store apps. The confirm's first button (it has the focus). It goes back to the plans. | Back to the plans | 30 characters | `src/lib/pendingWords.js` |
| 5 | trial-confirm-leave | Store apps. The confirm's second button. It closes the plans, and the 14-day trial goes on. | Keep my trial | 30 characters | `src/lib/pendingWords.js` |
| 6 | store-founding-line | Store apps. The Founding annual card's note, on the plans screen. | For the first 50 households who subscribe. Stays the same while you stay subscribed. | 90 characters | `src/lib/pendingWords.js` |
| 7 | store-founding-spot-line-ios | iPhone app, Settings, Subscription card. For a household paying a regular App Store plan while the founding price is offered to it (seats left). | Founding annual is open while spots last, and spots aren't held. To avoid being charged during a plan change, cancel your current plan in your Apple Account settings first. You keep access until it ends, then choose Founding annual in See plans. | 260 characters | `src/lib/pendingWords.js` |
| 8 | store-founding-spot-line-android | Android app, the same card, Google Play. | Founding annual is open while spots last, and spots aren't held. To avoid being charged during a plan change, cancel your current plan in Google Play under Subscriptions first. You keep access until it ends, then choose Founding annual in See plans. | 260 characters | `src/lib/pendingWords.js` |
| 9 | terms-7-founding | Terms of Service section 7, in a store build that sells: its last sentence. | The founding price is for the first 50 households who subscribe to Founding annual. It is not reserved for anyone, it stays the same while that subscription stays active, and it does not come back once that subscription ends. | 400 characters | `src/lib/pendingWords.js` |
| 10 | founding-list-line | Website landing, the hero, under the store badges, while signup is open and spots are left. | Founding price: $79.99 a year plus tax for the first 50 households who subscribe. {n} spots left, first come, first served. | 150 characters | `src/lib/pendingWords.js` |
| 17 | founding-full-account-line | Website landing, the hero, once 0 founding spots are left (under "Create your account"). | All 50 founding spots are taken. You can still subscribe on the website or in the iPhone and Android apps. | 130 characters | `src/lib/pendingWords.js` |
| 18 | checkout-founding-refused | Website, the upgrade screen, after a founding checkout is refused. | The founding price isn't available for this account. Either all 50 spots are taken or your founding subscription has ended. Monthly and annual plans are still available. | 200 characters | `src/lib/pendingWords.js` |
| 19 | founding-signin-note | Website sign-in card, when opened from the founding link (`?checkout=founding`). | Sign in or create an account with any email address, then subscribe while founding spots last. | 140 characters | `src/lib/pendingWords.js` |
| 20 | founding-not-matched-note | Website upgrade screen, when the founding link opens checkout but the founding price is not offered. | The founding price isn't available here. All spots may be taken, your founding subscription may have ended, or you already subscribe. | 140 characters | `src/lib/pendingWords.js` |
| 21 | welcome-founding-line | Email: the waitlist welcome, 2nd paragraph, for a row that held a founding number. | The founding price goes to the first 50 households who subscribe, so joining the list doesn't hold a spot. You can subscribe now on the website or in the iPhone and Android apps. | 200 characters | `netlify/functions/_lib/pendingWords.js` |
| 22 | founding-email-subject | Email: the founding link email's subject. On hold, not sent. | Founding price: first 50 households to subscribe | 60 characters | `netlify/functions/_lib/pendingWords.js` |
| 23 | founding-email-position | Email: the founding link email, 2nd paragraph (was "You're founding household #N of 50, and your founding price is ready:"). It leads into the price line and the link. | The founding price goes to the first 50 households who subscribe. Spots aren't held, so it's first come, first served: | 120 characters | `netlify/functions/_lib/pendingWords.js` |
| 24 | founding-email-store-steps | Email: the founding link email, under the store badges. | Create your account in the app with any email address and tap the confirmation link we send you. Then open See plans and choose Founding annual while spots last. | 220 characters | `netlify/functions/_lib/pendingWords.js` |
| 25 | founding-email-computer | Email: the founding link email, the small line before the website link. | On a computer? You can subscribe on our website: | 70 characters | `netlify/functions/_lib/pendingWords.js` |
| 26 | get-website | `flourishmoney.app/get?ref=founding` on a computer (the founding email's link). | Prefer the website? The founding price is there too. | 60 characters | `public/get/index.html` |
| A | landing-founding-heading | Website landing, the price box heading. Was "Founding price for the first 50 households". | Founding price for the first 50 households who subscribe | 70 characters | `src/lib/foundingOffer.js` foundingOfferCopy().heading |
| C | web-founding-row-label | Website plans, the Founding Annual row and review card. Was "Founding price for the first {n} households. Locked in while you stay subscribed." | Founding price for the first 50 households who subscribe. Locked in while you stay subscribed. | 110 characters | `src/lib/billingVisibility.js` foundingLabel (the server's cohort size, 50) |
| D | landing-where-line | Website landing: the price line's second sentence and the founding card's small print. Was "Paid on flourishmoney.app, and it works in the iPhone and Android apps too." | Available on the website and in the iPhone and Android apps. | 90 characters | `src/lib/foundingOffer.js` price and small; the email's LANDING_PRICE_SENTENCE |

Rows 11 to 16 (the founding list form) are gone with the form. Amanda decided on 2026-10-29: joining a list holds nothing, so the landing's founding list form is removed. Its consent version is unchanged, and no new version is added.

**Unchanged by decision:**
- the founding card's eyebrow, "FOUNDING PRICE · FIRST 50 HOUSEHOLDS";
- the email's price line, "$79.99 a year plus tax, for as long as you stay subscribed.";
- the email's why-line, "You're receiving this because you joined the waitlist at flourishmoney.app.".

The Privacy Policy has no founding lines.

## Not shown any more

- **The confirmation-link card, its email and its pages (round 4).** The card is "Your founding spot" and "Send me a confirmation link". A confirmed address is now enough, so the server never offers the card. A link already sent still works.
- **The landing's pre-launch lines.** These show only before launch, and signup is open:
  - "Join the waitlist. The first 50 households on the waitlist get the founding price…";
  - "{n} of 50 founding spots left";
  - "Founding spots are full…";
  - the card's "{n} of 50 left" pill.
