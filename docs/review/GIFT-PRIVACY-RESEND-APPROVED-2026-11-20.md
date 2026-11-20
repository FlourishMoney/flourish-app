# Privacy Policy, Resend line: the gift sentence (APPROVED 2026-11-20)

Amanda approved Option A on 2026-11-20, with one change. In the code word for word, after the Resend line, on the website's
policy only (`GIFT_RESEND_LINE` in `src/lib/giftReturn.js`; tests/giftWords.test.cjs holds it to this file).

Approved sentence:

- `gift-privacy-resend`: It also sends gift emails: the gift code and printable card to the buyer and, if the buyer chose email delivery, the gift to the person receiving it.

How it reads on the website:
- Before the newsletter launch: **Resend:** sends account and waitlist emails. It also sends gift emails: the gift code and printable card to the buyer and, if the buyer chose email delivery, the gift to the person receiving it.
- From the launch: **Resend:** sends account emails, waitlist emails, and the weekly newsletter, including its confirmation and unsubscribe links. It also sends gift emails: the gift code and printable card to the buyer and, if the buyer chose email delivery, the gift to the person receiving it.

The draft as it was reviewed follows.

## Why

Section 6 ("Data Sharing") lists each service provider. The Resend line says what Resend sends. Gift emails also go through Resend: Email 1 to the buyer (the code and the printable card), and Email 2 to the person receiving the gift (on the chosen date, if the buyer chose email delivery). The line does not say so today.

The new Gifts entry in section 1 (approved 2026-11-20) already says what is kept and that the recipient's email is used only to send the gift. Stripe's line in section 6 ("payments on flourishmoney.app and sales tax calculation") already includes gift payments, so it stays as it is.

## Where it shows

The website's Privacy Policy, section 6, the Resend line. Website only: the iPhone and Android apps' policy keeps today's line, with no gift words (Apple 3.1.1).

The line has two versions today, and both are approved:
- Before the newsletter launches: **Resend:** sends account and waitlist emails
- From the newsletter launch (approved 2026-11-05): **Resend:** sends account emails, waitlist emails, and the weekly newsletter, including its confirmation and unsubscribe links

## Option A (recommended): one new sentence after the line

The same sentence is added after either version. The approved words stay as they are, with only a full stop added before the new sentence.

New sentence:

> It also sends gift emails: the code to the buyer and, if the buyer chose email delivery, the gift to the person receiving it.

How it reads:
- Before the launch: **Resend:** sends account and waitlist emails. It also sends gift emails: the code to the buyer and, if the buyer chose email delivery, the gift to the person receiving it.
- From the launch: **Resend:** sends account emails, waitlist emails, and the weekly newsletter, including its confirmation and unsubscribe links. It also sends gift emails: the code to the buyer and, if the buyer chose email delivery, the gift to the person receiving it.

## Option B: gift emails inside the list

Shorter, but it changes the newsletter line approved on 2026-11-05, so that line needs approving again.

- Before the launch: **Resend:** sends account, waitlist and gift emails
- From the launch: **Resend:** sends account emails, waitlist emails, gift emails, and the weekly newsletter, including its confirmation and unsubscribe links

## Checked against the rules

- None of: sets aside, holds back, learns, remembers, smarter, covered, covers, web app, never invents.
- No sentence starts with save, spend, pay or invest.
- No em dash. The word flourish is not used.
- Nothing sends anyone to the website instead of the app, and the store apps do not show it.

## Once approved (done 2026-11-20)

CC puts the chosen option in word for word, on the website's policy only (like `GIFT_PRIVACY` in `src/lib/giftReturn.js`), with a test that holds it to the approved file. It goes out in the gift deploy if it is approved before then (`docs/ops/GIFT-GO-LIVE.md`, step 1). It does not change the policy's date beyond the gift date.
