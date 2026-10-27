# Founding email to the app stores: words to write

The founding email now leads to the App Store and Google Play first (Amanda, 2026-10-27: "People won't know how to
download it"). Each line whose words changed is a `[WORDS: id]` placeholder in the code until its words are approved.
`tests/foundingStoreLink.test.cjs` holds this list and the code together: every id here is in the code exactly once,
and the code has no other placeholder. Replace every one before merging: the email must never go out with one.

Code: `netlify/functions/_lib/foundingLinkEmail.js` (the email) and `public/get/index.html` (the device link's page).

The email's order (phone and desktop, HTML part):

1. "Payments for flourish are open." (unchanged)
2. "You're founding household #N of 50, and your founding price is ready:" (unchanged)
3. **`founding-email-price`**
4. The button, **`founding-email-button`**, then "Your link: https://flourishmoney.app/get?ref=founding" as a text link
5. The App Store and Google Play badges (the stores' own artwork and words, not ours)
6. **`founding-email-store-steps`**
7. **`founding-email-computer`**, small, then https://flourishmoney.app/?checkout=founding as a text link
8. "Questions? Just reply to this email." and "Amanda, founder of flourish" (unchanged), then the CASL footer (unchanged)

The plain-text part has the same lines without the badges (the device link in line 4 does their job there).

## The placeholders

### `founding-email-button`
- **Where:** the email's one button, green, under the price line. It opens https://flourishmoney.app/get?ref=founding.
- **Facts it must state:** that it gets the flourish app (the founding price comes with the app). It must work for
  every reader, because the link picks the store itself: an iPhone or iPad goes to the App Store, an Android phone to
  Google Play, and a computer to a page with both badges and the website. So it names no single store, no price, and
  no device.
- **Limit:** 28 characters, so it stays on one line on a 320 px phone. The approved "Get my founding price" (21) was
  written for the website checkout. Reuse it only if it still fits a link that opens a store.

### `founding-email-store-steps`
- **Where:** the line under the two badges, body size (16 px), in the HTML and the plain-text part.
- **Facts it must state, in this order:**
  1. create the account with the same email address this message went to;
  2. tap the confirmation link we send to that address;
  3. then open **See plans** and choose **Founding annual**.
- **Facts it must keep true:**
  - "See plans" and "Founding annual" are written exactly as the apps show them. In the apps it is "Founding
    annual", with a lowercase "a". The website says "Founding Annual".
  - The store apps show Founding annual **in place of Annual**, not first: the cards are Monthly, then Founding annual.
    Don't say it is first, at the top, or already selected.
  - The founding price is matched to this address, and only after it is confirmed. Before the link is tapped,
    See plans shows the regular plans.
  - "See plans" is in Settings, under Subscription (the trial chip opens it too).
  - Paying is done in the App Store or Google Play sheet. There is no store trial, so the store charges when the
    household confirms there.
- **Limit:** 220 characters.

### `founding-email-computer`
- **Where:** a small grey line (13 px) under the steps. The website's founding checkout URL follows it as a text link,
  so the words end where the URL begins (for example with a colon).
- **Facts it must state:** that it is for someone on a computer, and that the founding price can be paid on the
  website instead. It must say to sign in or create the account there with the same email address. On the website the
  plan is called "Founding Annual".
- **Limit:** 70 characters, before the URL.

### `founding-email-price` (flagged: the approved sentence is no longer all true)
- **Where:** line 3, right after "your founding price is ready:".
- **Was:** the landing page's sentence, word for word: "$79.99 a year plus tax, for as long as you stay subscribed.
  Paid on flourishmoney.app, and it works in the iPhone and Android apps too."
- **Facts it must state:** the price, CAD 79.99 a year plus tax, and that it stays the same while the household
  stays subscribed. It must not say where to pay (the lines under it do).
- **What is still true:** the first sentence. Founding annual is CAD 79.99 a year in both stores (App Store
  `app.flourishmoney.founding.annual`, Google Play `flourish_plus:founding`, Canada only) and on the website. The price
  stays the same while the household stays subscribed (the apps' approved FOUNDING_LINE says the same). Apple and
  Google add sales tax in Canada at purchase. Confirm "plus tax" on each store's purchase sheet before approving.
- **What is no longer true for this email:** "Paid on flourishmoney.app". The email now leads to the stores first. A
  plan paid in a store or on the website works in the other places too (one account, shared entitlements:
  `netlify/functions/_lib/planRules.js`).
- **Limit:** 150 characters. The landing page keeps its own sentence unchanged (it is the website's).

### `get-heading`
- **Where:** the heading of https://flourishmoney.app/get on a computer (22 px, bold, centred above the two badges).
  Phones never see it: they go straight to their store.
- **Facts it must state:** that flourish is in the App Store and on Google Play, to get it on the phone. It works for
  someone who came from the founding email, and for anyone else.
- **Limit:** 48 characters (two lines at most on a narrow window).

### `get-website`
- **Where:** the small line under the badges on the same page (14 px). The whole line is the link: to the founding
  checkout (https://flourishmoney.app/?checkout=founding) from the founding link, and to the home page otherwise.
- **Facts it must state:** the website is the other way, on this computer. For the founding link, the founding price
  can be paid there.
- **Limit:** 60 characters.

## Not ours to word

- The badges and their alt text ("Download on the App Store", "Get it on Google Play") are Apple's and Google's,
  used as given (`src/lib/storeLinks.js`). There is one of each per layout (Apple allows one App Store badge per
  layout), and Apple's comes first.
