# Founding seats: words to come

**The rule (Amanda, 2026-10-29).** The founding price, CA$79.99 a year plus tax, goes to the **first 50 households who subscribe to it**, on the website, the App Store or Google Play. A waitlist number no longer grants it. A seat is taken when a founding subscription's first payment succeeds, and a refund gives it back. A founding subscriber keeps the price while subscribed. At 50 the founding offer is gone everywhere. The founding send stays on hold.

Every place whose words assumed a waitlist number now shows a placeholder, `[WORDS: id]`, until the words are written. So does the new trial link on the founding plans screen. The placeholders live only in `src/lib/pendingWords.js` (the app and site), `netlify/functions/_lib/pendingWords.js` (the emails) and `public/get/index.html` (one line).

**Nothing ships with a placeholder.** `scripts/check-pending-words.mjs` refuses:
- the production web deploy (`netlify.toml`, `[context.production]`);
- every store build (`npm run build:native`).

Deploy previews and the test gate still build.

**How to fill one in.** Put the words in place of the placeholder in the file named below. Then run `node tests/foundingSeatsWords.test.cjs`.

**Counts.** Where the words carry a count, write `{n}`. The live number of founding spots left goes there.

## The words to write

| # | id | where it shows | the facts it must state | limit |
|---|---|---|---|---|
| 1 | trial-link | Store apps. Small print under the plans on the founding plans screen (the one that opens by itself), only for a household in its 14-day trial. Tapping it opens the confirm (2 to 5). | That the household can carry on with its free trial instead of subscribing now. | 45 characters (one line of 13px small print, 390px wide) |
| 2 | trial-confirm-title | Store apps. The confirm's title. | A short question or heading: keep the trial for now? | 40 characters |
| 3 | trial-confirm-body | Store apps. The confirm's text, under the title. | The live count: `{n}` founding spots left. The founding price is first come, first served among people who subscribe. It is not held for them. They can still choose it later if spots remain. | 280 characters, with `{n}` |
| 4 | trial-confirm-stay | Store apps. The confirm's first button (it has the focus). It goes back to the plans. | Go back to the plans. | 30 characters (one line of a full-width button) |
| 5 | trial-confirm-leave | Store apps. The confirm's second button. It closes the plans, and the 14-day trial goes on. | Close the plans and keep the 14-day trial. | 30 characters |
| 6 | store-founding-line | Store apps. The Founding annual card's note, on the plans screen. | The founding price is for the first 50 households who subscribe (website, App Store or Google Play), and it stays the same while the subscription stays active. Approved word for word before (Apple review), so it needs approval again. | 90 characters (two lines in the card, 13px) |
| 7 | store-founding-spot-line-ios | iPhone app, Settings, Subscription card. For a household paying a regular App Store plan while the founding price is offered to it (seats left). | Nobody "holds" a spot now: Founding annual is open while spots remain, and it is not held. It is a separate App Store plan, so they cancel the current plan in Apple Account settings first, keep access until it ends, then choose Founding annual in See plans. | 260 characters (card text, 13px) |
| 8 | store-founding-spot-line-android | Android app, the same card, Google Play. | The same facts as row 7. Cancel in Google Play under Subscriptions first. | 260 characters |
| 9 | terms-7-founding | Terms of Service section 7, in a store build that sells: its last sentence. | The founding price is for the first 50 households who subscribe to it, on any platform. It is not reserved. It stays the same while that subscription stays active. Once it ends, it does not come back. | One sentence. No limit found |
| 10 | founding-list-line | Website landing, the hero, under the store badges, while signup is open and spots are left. | The founding price ($79.99 a year plus tax) for the first 50 households who subscribe, on any platform. `{n}` left (live). Not held for anyone. | 2 lines at 440px, about 150 characters, with `{n}` |
| 11 | founding-join-note | Website landing, the founding list form, one line above the email box. | Joining the list no longer gets the founding price. Say what joining is for now, or remove the form (see the decision below). | One line at 14px, about 45 characters |
| 12 | founding-join-button | The founding list form's button. | The same as row 11. | 22 characters (one line, no wrap at 15px) |
| 13 | founding-join-success-title | The founding list form, after a join. | Nothing is saved or held for them. | 30 characters (21px serif) |
| 14 | founding-join-success-body | The founding list form, after a join. | What happens next. The price goes to the first 50 who subscribe. | 340px wide, about 90 characters |
| 15 | founding-join-full-title | The founding list form, when the server says the spots filled up. (It still counts waitlist numbers: decision below.) | Full means 50 households have subscribed. | 34 characters |
| 16 | founding-join-full-body | The founding list form, under row 15, above "Create your account". | The regular prices still apply, and they can create an account. | About 90 characters |
| 17 | founding-full-account-line | Website landing, the hero, once 0 founding spots are left (under "Create your account"). | 50 households have the founding price. Subscriptions can be bought on the website and in the iPhone and Android apps (the old line said "not yet in the apps"). | 2 lines at 440px, 13px |
| 18 | checkout-founding-refused | Website, the upgrade screen, after a founding checkout is refused. | Not available because all 50 founding spots are taken, or because this account's founding subscription has ended. Monthly and annual are still available. No waitlist. | About 200 characters |
| 19 | founding-signin-note | Website sign-in card, when opened from the founding link (`?checkout=founding`). | The founding price is not tied to an email address. Sign in, or create an account, then subscribe while spots last. | About 140 characters (13px boxed note) |
| 20 | founding-not-matched-note | Website upgrade screen, when the founding link opens checkout but the founding price is not offered. | Why not: the spots are full, this account's founding subscription ended, or it already pays. No "different address". | About 140 characters |
| 21 | welcome-founding-line | Email: the waitlist welcome, 2nd paragraph, for a row that held a founding number. | No number. Joining does not grant the price; the first 50 who subscribe get it. (No date: payments are open.) | Email body; about 200 characters |
| 22 | founding-email-subject | Email: the founding link email's subject. On hold, not sent. | Nothing is reserved. The founding price is open to the first 50 households who subscribe. | 60 characters (email subject) |
| 23 | founding-email-position | Email: the founding link email, 2nd paragraph (was "You're founding household #N of 50, and your founding price is ready:"). It leads into the price line and the link. | No number and no reserved spot. First come, first served among households who subscribe. A count, if given, is only true as of sending. | About 120 characters, ending in a colon (it leads into the price) |
| 24 | founding-email-store-steps | Email: the founding link email, under the store badges. | Create an account in the app (any email address), confirm it, then See plans, Founding annual. It is first come, first served, and not held. | 220 characters |
| 25 | founding-email-computer | Email: the founding link email, the small line before the website link. | On a computer they can subscribe on the website. No "with this same email". | 70 characters |
| 26 | get-website | `flourishmoney.app/get?ref=founding` on a computer (the founding email's link). | The founding price can be bought on the website while spots last. Not "your" price. | 60 characters |

## Unchanged, but check

These do not name a waitlist number, so they keep their words:
- **"Founding price for the first 50 households"**: the landing price box heading, `foundingOffer.js`.
- **"FOUNDING PRICE · FIRST 50 HOUSEHOLDS"**: the founding card's eyebrow, `foundingOffer.js`.
- **"Founding price for the first {n} households. Locked in while you stay subscribed."**: the website's Founding Annual row, `billingVisibility.js` (`foundingLabel`).
- **"$79.99 a year plus tax, for as long as you stay subscribed."**: the email's price line.
- **"You're receiving this because you joined the waitlist at flourishmoney.app."**: the email footer's why-line.

For each, check whether "first 50 households" should say "who subscribe".

The landing's price line and card small print say "Paid on flourishmoney.app, and it works in the iPhone and Android apps too." They are not about the waitlist. They have also been out of date since the apps started selling.

The Privacy Policy has no founding lines. Nothing changes there.

## Not shown any more (retire, or keep as they are)

- **The confirmation-link card and its email and pages.** These are the round 4 card ("Your founding spot", "Send me a confirmation link"), its email ("Confirm your email address for your founding price") and the `/api/founding-confirm` pages. A confirmed address is now enough, so the server never offers the card. A link already sent still works.
- **The landing's pre-launch lines.** These are "Join the waitlist. The first 50 households on the waitlist get the founding price…", "{n} of 50 founding spots left", "Founding spots are full…" and the card's "{n} of 50 left" pill. They show only before launch, and signup is open.

## Decisions for Amanda

- **The founding list form on the landing (rows 11 to 16).** Joining it no longer gets the founding price. It still issues waitlist numbers, and its "spots filled up" check still counts them, not seats. The choices: remove the form, or keep it as a news list. Its consent line, "We'll email you your founding price link…", is a CASL consent version. New words there need a new consent version, and they are not a placeholder here.
- **The founding link email (rows 21 to 25).** It is written for waitlist numbers. The send is on hold, and nothing here sends it.
