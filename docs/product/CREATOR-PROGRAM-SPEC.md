# Creator Program: spec (2026-11-02)

Approved terms: `~/Documents/Flourish/01 Marketing/Creator Program/CREATOR-PROGRAM-APPROVED-2026-11-02.md` (ChatGPT and Grok agreed).

Ships dark, behind `CREATORS_ENABLED` (exactly "true"). With it off: sign-up ignores a code, `/api/creator` answers 404, the app shows no field and no card, neither webhook looks at a payment for a creator, and the sweep reads nothing. The migration is written, **not run**.

## The rules
- **A code is tracking only.** No discount, no reward to the person.
- **Entering one.** Optional at sign-up on the web, iPhone and Android, checked on the server before the account exists. In Settings within 14 days of sign-up and before the first payment. On a computer, `flourishmoney.app/get?c=CODE` fills it in at web sign-up; a phone's store redirect is unchanged.
- **One per household; the first one entered counts.** An attribution belongs to the account that entered it (`user_id`), because a `households` row exists only after an owner's first invite.
  - On their own: their own code.
  - In a household: the household's code, which is the one its payments were first credited to (`household_id`), otherwise the owner's.
  - A partner joining never changes it. A partner's own code doesn't apply while they are together, and a partner can't add one. If they leave, their own applies again.
- **A creator can't use their own code.** Matched on email, however it is written (case, spaces, a +tag, Gmail's dots), and for anyone in the household. A creator's own code answers exactly as a wrong code does, so the screen never says whose address a code belongs to.
- **An ended creator.** `active`: takes new households. `ended`: no new households; those already credited keep earning for the rest of their 12 months. `ended_for_cause` (fraud, spam, a serious breach): no new households and nothing further earned.

## Commissions
- **What counts.** Every paid event: 20% of the price before sales tax. For the App Store and Google Play, the store's fee comes off first. Canadian dollars only.
- **Stripe.** `invoice.paid`, using `total_excluding_tax` (after discounts, before tax). The first payment and every renewal come this way. **Go-live step: add `invoice.paid` to the Stripe webhook endpoint (Amanda).** Until then only refunds reach this code.
- **The stores.** RevenueCat's event: `price_in_purchased_currency × (1 − tax_percentage − commission_percentage)`. The percentages are RevenueCat's estimates. If any figure is missing, there is no commission and support gets a note; nothing is guessed. Never a sandbox purchase (whatever `IAP_ACCEPT_SANDBOX` says about access) and never Family Sharing.
- **12 months from the household's first payment.** The earliest payment seen. A renewal on the anniversary is outside, and so is one a store dates up to two days early, because Apple charges within the 24 hours before a period ends.
- **Before the code.** If the household's first payment predates the code (the webhook can arrive after someone adds one), nothing is credited, then or later.
- **Pending, then payable.** A commission is pending until its payment is more than 30 days old. A daily sweep flips it; the report goes by the date either way.
- **A refund** claws back the commission on that one payment, in proportion to what was refunded. A clawback is its own row carrying its payment's date: against a payment under 30 days old the two cancel out; against one already paid it comes off later payouts until recovered.
  - A refund that matches no payment changes nothing and tells support.
  - A refund the store later takes back (`REFUND_REVERSED`) tells support; nothing moves on its own.
- **Chargebacks are not handled.** A Stripe dispute reaches no code here; it is corrected by hand.

## Who sees what
No table or function is reachable by anyone signed in, or by anon. A creator is told counts and totals only (`creator_payout_report`). A deleted account's rows keep their money with the account id cleared.

## Files
- **Migration:** `supabase/migrations/*_creator_program.sql`: `creators`, `creator_attributions`, `creator_commissions`, and the rules as functions.
- **Server:** `netlify/functions/_lib/creators.js`, `creator.js` (`/api/creator`), `creator-commissions-sweep.js`; hooks in `beta.js`, `stripe-webhook.js`, `revenuecat-webhook.js`; new flags in `_lib/supportAlert.js`.
- **App:** `src/lib/creatorWords.js` (the words, all placeholders), `src/lib/creatorCode.js`, the sign-up field and `CreatorCodeCard` in `App.jsx`, `public/get/get.js`.
- **Words:** `docs/product/CREATOR-PROGRAM-WORDS.md`. **Monthly routine:** `docs/ops/CREATOR-PAYOUTS.md`.
- **Tests:** `tests/creators.sql.test.cjs` (real Postgres), `tests/creators.test.cjs`, `tests/creators.browser.test.cjs`.

## Going live, in order
1. Get the words approved and swap them into `src/lib/creatorWords.js` and the words doc. The production deploy and store builds refuse placeholders, so **this PR can't deploy until then**.
2. Run the migration.
3. Check a real refund's `transaction_id` against its payment (see `docs/ops/CREATOR-PAYOUTS.md`).
4. Merge, and deploy. Add `invoice.paid` to the Stripe endpoint.
5. Set `CREATORS_ENABLED=true` in production and redeploy.
6. iPhone and Android show the field only from the next store build.
