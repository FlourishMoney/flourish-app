# Billing day: Monday 2026-10-26

A checklist, not a build. Everything below already exists in `main` once this branch merges; Monday is
settings, three migrations, one smoke purchase and watching. **Amanda does every step.** Claude runs no
migration against production, changes no Netlify or Supabase setting, and never handles a key.

Each SQL block is for the Supabase SQL editor (production project). Paste one block, run it, read the
answer, then go to the next. The checks are read-only and return numbers and true/false only, never an
address. Line numbers in other docs are stale; this file names things by what they are.

Proof behind the order: `scripts/billing-day-proof/run.sh` (a throwaway local database seeded to
production's shape; never touches production), and `tests/billingDayMigrations.test.cjs` in the gate.

---

## 1. Before Monday (by Friday 2026-10-23)

1. **Stripe, live mode.** Follow `docs/ops/BILLING-SETUP.md` section 1 with **Test mode OFF**: product
   "Flourish Plus", three CAD prices (`monthly` 11.99, `annual` 99.99, `founding_annual` 79.99), each with
   tax behaviour "Exclusive"; the webhook endpoint
   `https://flourishmoney.app/.netlify/functions/stripe-webhook` with exactly
   `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`.
2. **Stripe customer portal, live mode.** Allow cancel and payment-method updates. **Do not let it switch
   to the founding price.** If plan switching is on and the founding price is listed, any subscriber can
   move themselves onto $79.99 in the portal; the founding rules are only enforced in our checkout.
3. **Netlify variables, Production context only** (Site configuration → Environment variables). Deploy
   previews and branch deploys keep the test values, so a preview can never charge a real card:
   `STRIPE_SECRET_KEY` (live), `STRIPE_WEBHOOK_SECRET` (the live endpoint's own `whsec_`),
   `STRIPE_PRICE_MONTHLY_CAD`, `STRIPE_PRICE_ANNUAL_CAD`, `STRIPE_PRICE_FOUNDING_ANNUAL_CAD` (live ids),
   `APP_ORIGIN` = `https://flourishmoney.app`. Leave `BILLING_ENABLED` and `FOUNDING_LINK_EMAIL` **unset**.
4. **A variable change needs a deploy.** Netlify gives a deployed function the variables that were set
   when it was deployed ("To apply updated environment variable values, create a new deploy", Netlify
   docs, Functions → Environment variables). Some code comments say flipping `BILLING_ENABLED` needs no
   deploy; that is wrong. After every change below: **Deploys → Trigger deploy → Deploy site**, and wait
   for "Published".
5. **Deploy D0.** After step 3, trigger one deploy with billing still off. Write down its deploy id.
   D0 is the instant way back (section 7): it has the live webhook secret and billing off.
6. **Decide how a founding household gets an account.** Signup is invite-only unless `OPEN_SIGNUP` is
   exactly `true`. A founding household with no account cannot reach checkout. An invite code alone may
   not be enough: with signup shut, a full 30-seat beta cap refuses even a valid code (section 10,
   item 1). In practice that means `OPEN_SIGNUP=true` and a deploy. The founding link email (section 5)
   tells them to sign in or create an account, so it waits for this.
7. **PR #69 (0017) stays held** unless Amanda decides otherwise. Section 9 says what that means Monday.
8. **No merges to `main` on Monday.** "Deploy site" builds the latest `main`; Monday's deploys should all
   be the same code.

---

## 2. Migrations, in this order

Production today: 0014 and 0015 applied, `waitlist_founding_start()` already run once (do **not** run it
again; a second call raises an error and changes nothing). `public.subscriptions` does not exist. 0017 is
not applied.

**The order is 0009, then 0010, then 0016.** 0016 adds a column to `public.subscriptions`, which 0009
creates: run 0016 first and it fails with "relation public.subscriptions does not exist". Postgres runs
a file sent as one query as one transaction, so that failure undoes the whole file and nothing is left
behind (proved locally, sending each file the way the editor sends a paste). Do not rely on it: run them
in order. 0010 does not depend on 0009. None of the three drops, deletes, truncates, renumbers,
frees or reassigns anything; each can be re-run safely.

### 2.1 Pre-check (read-only)

```sql
select to_regclass('public.subscriptions')  is null as no_subscriptions_yet,
       to_regclass('public.billing_events') is null as no_billing_events_yet,
       exists (select 1 from information_schema.columns
                where table_schema = 'public' and table_name = 'waitlist_founding_ledger'
                  and column_name = 'void_at') as has_0017,
       (select count(*) from public.waitlist_founding_ledger) as issued,
       (select count(*) from public.waitlist where founding_position is not null) as positioned,
       (select count(*) from public.waitlist
         where public.waitlist_email_key(email) = '492b64bcf0c6bfd2ca952ecbb02c25b9') as check_row,
       (select count(*) from public.waitlist
         where public.waitlist_email_key(email) = '492b64bcf0c6bfd2ca952ecbb02c25b9'
           and founding_position is not null) as check_row_numbered;
```

Expect `true`, `true`, `false`. `issued` was 28 and `positioned` 16 on 2026-10-14; both may be higher by
Monday. **Write both down.** `check_row` is 0 or 1. If `check_row_numbered` is 1, 0016 will mark that row
a test row and its number stays spent (not freed, not given to anyone). If either of the first two is
`false`, stop: someone has already applied 0009 or 0010.

### 2.2 Run `supabase/migrations/0009_billing_subscriptions.sql`

Paste the whole file, run it. Then:

```sql
select c.relrowsecurity as rls_on,
       (select count(*) from pg_policies
         where schemaname = 'public' and tablename = 'subscriptions') as policies,
       (select count(*) from public.subscriptions) as rows,
       has_table_privilege('service_role', 'public.subscriptions', 'INSERT') as server_can_write
from pg_class c where c.oid = 'public.subscriptions'::regclass;
```

Expect `true`, `1`, `0`, `true`.

### 2.3 Run `supabase/migrations/0010_billing_events.sql`

```sql
select c.relrowsecurity as rls_on,
       (select count(*) from pg_policies
         where schemaname = 'public' and tablename = 'billing_events') as policies,
       (select count(*) from public.billing_events) as rows,
       has_table_privilege('service_role', 'public.billing_events', 'INSERT') as server_can_write
from pg_class c where c.oid = 'public.billing_events'::regclass;
```

Expect `true`, `0`, `0`, `true`.

About grants on these two tables: until 2026-10-30 Supabase also gives `anon` and `authenticated` every
privilege on a new public table by default, and 0009 and 0010 grant without revoking. That is expected:
row level security is what keeps clients out (one read-own-row policy on `subscriptions`, none on
`billing_events`). The local proof checks that anon and a signed-in user can read no other household's
row and write nothing.

### 2.4 Run `supabase/migrations/0016_waitlist_founding_billing.sql`

```sql
select exists (select 1 from information_schema.columns where table_schema = 'public'
                 and table_name = 'subscriptions' and column_name = 'founding_ended_at') as subs_ended_col,
       exists (select 1 from information_schema.columns where table_schema = 'public'
                 and table_name = 'waitlist_founding_ledger' and column_name = 'ended_at') as ledger_ended_col,
       has_function_privilege('service_role', 'public.waitlist_founding_position_for_email(text)', 'EXECUTE') as server_can_look_up,
       has_function_privilege('anon', 'public.waitlist_founding_position_for_email(text)', 'EXECUTE') as anon_can_look_up,
       has_function_privilege('authenticated', 'public.waitlist_founding_position_for_email(text)', 'EXECUTE') as signed_in_can_look_up,
       (select count(*) from public.waitlist_founding_ledger) as issued,
       (select count(*) from public.waitlist_founding_ledger where ended_at is not null) as ended,
       (select count(*) from public.waitlist where founding_position is not null) as positioned,
       (select count(*) from public.waitlist where founding_position is not null
           and public.waitlist_founding_position_for_email(email) = founding_position) as honoured;
```

Expect `true`, `true`, `true`, `false`, `false`; `issued` and `positioned` exactly as written down in
2.1; `ended` 0; `honoured` = `positioned` less any test row holding a number.

**0016 must be in before billing goes on.** Without it the founding lookup errors, the code fails closed,
and founding households are offered only the regular prices: they could buy $99.99 annual instead of
$79.99.

Nothing else runs in the SQL editor on Monday. **Not** 0017, **not** `waitlist_founding_start()`.

---

## 3. Turn billing on

**Who:** Amanda, in Netlify. Nobody else holds the Netlify login.

1. Site configuration → Environment variables → add `BILLING_ENABLED`, value exactly `true` (not
   `TRUE`, not `1`), **Production** context only.
2. Deploys → Trigger deploy → Deploy site. Wait for "Published". This is deploy **D1**.
3. Check from a terminal (no login, no secret). 401 means on; 404 means still off:

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://flourishmoney.app/api/billing
```

4. On a computer, signed in at flourishmoney.app: Settings shows "Flourish Plus" with "See plans". On
   the iPhone or Android app nothing about paying appears anywhere (by design, Apple 3.1.3(b)).

What `BILLING_ENABLED` gates: only `netlify/functions/billing.js` (the status call, checkout and the
billing portal). Unset, every one answers 404 before reading anything. The Stripe webhook, account
deletion's Stripe cancel and `/api/founding` do not depend on it.

---

## 4. The first smoke purchase, and its refund

Amanda's own account, her own card, **the Monthly plan**. Never Founding Annual for a smoke test:
cancelling a founding subscription stamps `founding_ended_at` and the ledger's `ended_at`, and that
household's founding price never comes back (section 8).

1. Signed in on a computer: Settings → Flourish Plus → See plans → Monthly → pay in Stripe Checkout.
2. Back on flourishmoney.app with "Payment received…". Then, read-only:

```sql
select status, plan_key, provider_subscription_id is not null as has_subscription,
       founding_ended_at is null as not_ended
from public.subscriptions order by updated_at desc limit 1;

select type, status, attempts from public.billing_events order by received_at desc limit 5;
```

Expect `active`, `monthly`, `true`, `true`; the events `processed` (or `ignored` for types we do not
handle), none `failed`.

3. Refund it: Stripe (live) → Payments → the 11.99 payment → Refund → full amount.
4. Cancel it: Stripe → Customers → that customer → the subscription → Cancel → **immediately**.
5. Read again: the subscriptions row says `canceled`; the new events are `processed`.

A refund alone does not cancel; a cancel alone does not refund. Do both. If any expectation fails, go to
section 7.

---

## 5. The founding link email

The welcome email promised every founding household "your link to the founding price when payments open
on October 26". `netlify/functions/founding-link-sweep.js` sends it, once per household, every 15 minutes,
only while **both** `BILLING_ENABLED` and `FOUNDING_LINK_EMAIL` are exactly `true`.

**Only after section 4 passed and section 1 step 6 (how they get an account) is done:**

1. Add `FOUNDING_LINK_EMAIL` = `true`, Production only. Trigger deploy. This is **D2**.
2. Who gets it: founding number 1 to 50, not a test row, not unsubscribed, consent version 2026-10-01 or
   later, and billing's own lookup still honours the number. Rows with consent from before the consent
   line (`pre-2026-10-01`) do **not** get it: they agreed only to the launch-day email. Count them first:

```sql
select count(*) as founding_rows,
       count(*) filter (where is_test) as test_rows,
       count(*) filter (where unsubscribed_at is not null) as unsubscribed,
       count(*) filter (where consent_version is null or consent_version = 'pre-2026-10-01') as legacy_consent_no_email
from public.waitlist where founding_position between 1 and 50;
```

3. Progress, every 15 minutes (counts only):

```sql
select count(*) filter (where metadata ? 'founding_link') as link_sent,
       count(*) as founding_rows
from public.waitlist where founding_position between 1 and 50 and not is_test;
```

At most 10 a run and 40 a day. The Resend allowance is shared with the welcome emails and with GrowSmart.

To stop the emails only: remove `FOUNDING_LINK_EMAIL` and deploy, or publish D1 (section 7).

The link is `https://flourishmoney.app/?checkout=founding`. It carries nothing about the household. It
opens sign-in, then the checkout screen. Whether the founding price is offered is decided by the server
for the signed-in account's own confirmed email, so a forwarded link gives nobody the founding price.

---

## 6. The first hour

Every 15 minutes:

- **Stripe (live):** Developers → Webhooks → the endpoint: every delivery 2xx. Payments: succeeded
  versus failed. Radar reviews and disputes: none expected.
- **Netlify:** Logs → Functions → `stripe-webhook`: no `[stripe-webhook]` error lines. `billing`: no
  `price_not_configured`, `server_misconfigured` or `billing_provider_error`. `founding-link-sweep`: one
  counts line per run, `lookup_down` and `record_down` false.
- **Sentry (flourish, browser):** no new issue after D1. Sentry does not see the Netlify functions: the
  server side is in the Netlify logs only.
- **Supabase (read-only):**

```sql
select (select count(*) from public.billing_events where status = 'failed') as failed_events,
       (select count(*) from public.billing_events
         where status = 'received' and received_at < now() - interval '5 minutes') as stuck_events,
       (select count(*) from public.subscriptions where status in ('active', 'trialing')) as paying,
       (select count(*) from public.subscriptions
         where plan_key = 'founding_annual' and status in ('active', 'trialing')) as founding_paying;
```

`failed_events` and `stuck_events` stay 0.

---

## 7. The stop condition, and turning billing off

**Turn billing off at once if any one of these is true:**

1. `failed_events` or `stuck_events` is above 0 and a Stripe retry has not cleared it within 10 minutes.
2. A payment succeeded in Stripe and that household has no `active` subscriptions row 10 minutes later.
3. A charge is for any amount other than 11.99, 99.99 or 79.99 CAD, or a Founding Annual charge went to
   an account the founding price was not offered to.
4. Anything about paying (a price, a plan, a checkout) appears in the iPhone or Android app.
5. The `billing` or `stripe-webhook` log shows `server_misconfigured` or `price_not_configured`.

**Off, fastest:** Netlify → Deploys → D0 → **Publish deploy**. Instant, no build: D0 was deployed with
billing off. (Netlify may then stop auto-publishing; switch it back on once things are fixed.) Then remove
`BILLING_ENABLED` and `FOUNDING_LINK_EMAIL` from the variables, so the next deploy is off too.

**Check it is off:** the curl in section 3 answers 404.

What off does: new checkouts, the status call and the billing portal answer 404, and the checkout screen
disappears. What off does **not** do: it cancels nobody. Existing subscriptions keep renewing in Stripe,
and the webhook keeps recording them. A paying household cannot open the portal while billing is off;
cancel for them in Stripe if they ask (hello@flourishmoney.app).

---

## 8. What cannot be undone once a real charge clears

- **The money moved.** A refund is a second transaction, not an erasure. The household sees the charge
  and the refund on their statement, and the refund takes days to reach them.
- **Stripe's records stay.** In live mode the customer, payment, invoice and receipt cannot be deleted.
  Stripe does not return its processing fee on a refund.
- **A cancelled founding subscription ends that household's founding price for good.** The webhook
  stamps `subscriptions.founding_ended_at` and the ledger's `ended_at` once and never clears them. The
  number is never given to anyone else. This is the rule ("ended is final"). It applies to a test as much
  as to a real household.
- **No tax is added at checkout.** Stripe Tax is off (P16, `automatic_tax: false`), so the charge is the
  price itself. An invoice cannot be re-issued with tax afterwards.
- **Turning billing off does not unwind anything** (section 7).

---

## 9. Holding 0017 (PR #69): what it means on Monday

Proved on the local copy of production's shape (`scripts/billing-day-proof/run.sh --with-0017`).

**Without 0017 (Monday as planned):**
- The 16 real households holding 1 to 15 and 22 can buy the founding price. Nothing about that changes.
- The ledger still counts the 12 numbers Amanda's deleted test sign-ups took (16 to 21, 23 to 28). The
  landing page shows 22 spots left, not 34. Only 22 more households can get a number: at most **38**
  real founding households, not 50.
- One of those test addresses that joins again gets its old number back and is offered the founding
  price.
- A new sign-up from getgrowsmart.com or flourishmoney.app takes a real number. Do not test the waitlist
  form on Monday.

**With 0017 (later, after Amanda's dry run, then merging #69):** the 12 are voided, 34 spots, test
addresses never take a number, and the next real household gets #29. It runs after 0016 or before it
(both orders end the same, proved locally). Applied without merging #69, main's lookup still honours real
holders, but the landing page keeps saying 22 until #69 merges.

---

## 10. Reported, not fixed: what could stop a household paying, or getting what it paid for

Found while preparing this checklist (2026-10-14). None is fixed on this branch; each is Amanda's call.
Worst first.

1. **A founding household may not be able to create an account.** Checkout needs a signed-in account
   with a confirmed email. Signup is invite-only unless `OPEN_SIGNUP` is exactly `true`, and with the
   door shut a full 30-seat beta cap refuses even a valid invite code (`beta.js`, `cap_reached`;
   `beta_signups` was backfilled from every existing account). So unless `OPEN_SIGNUP=true` is set (and
   deployed) on Monday, most founding households cannot pay at all. Section 1 step 6.
2. **A paying household whose trial has ended still gets the free tier in the app.** The app takes its
   plan from the `profiles` row only (`refreshPlanFromProfile`); the Stripe webhook writes
   `subscriptions` only and never `profiles`. The server knows they paid (`getUserPlan`), but the app's
   own gates do not: Credit stays locked, the coach keeps its weekly free limit, and the Meet
   facilitator stays off. This hits beta testers whose 14-day trial has ended as soon as they pay, and
   every founding household created on Monday from about 2026-11-09, when their trial ends.
   `tests/nativeWebPurchase.test.cjs` 5b and 5d pin "the app's plan comes from the profiles row alone"
   on purpose, for the store apps (Apple 3.1.3(b)), so a fix must keep a store app free: for example,
   read the billing status's `paid` on the web only.
3. **Five screens still open the old paywall, which says paid plans are not open.** Today, Goals, the
   Credit gate, the coach's out-of-messages gate and What-If call `setShowPaywall(true)` directly (six
   call sites). That screen's button answers "Paid plans aren't open yet. Nothing has been charged…".
   Only Settings → Flourish Plus → See plans, and the coach composer's limit, go through `openUpgrade()`
   to the real checkout. A household can pay, but only from those two places.
4. **The earliest founding households will not get the founding link email.** Rows whose consent is
   from before the consent line (`pre-2026-10-01`) agreed only to the launch-day email
   (`mayEmailWaitlistRow`), so the sweep skips them. Numbering ran in join order, so they likely hold the
   lowest numbers, and their welcome email predates the founding line: nothing has told them they are
   founding. Section 5 step 2 counts them. Whether Monday's email counts as the launch-day email for them
   is a CASL decision.
5. **The Stripe customer portal could sell the founding price to anyone.** If plan switching is enabled
   and the founding price is listed, a subscriber can switch to $79.99 in the portal; our founding rules
   only run in our checkout. Section 1 step 2. The checkout screen's own "manage" text says "switch plan".
6. **Turning a flag on or off needs a deploy.** Netlify functions keep the variables of their deploy.
   Comments in `billing.js` and `_lib/signupGate.js`, and `docs/ops/WEEK-02-2026-09-21.md`, say otherwise.
   Followed as written, "set `BILLING_ENABLED`, no deploy" leaves billing off; worse, removing it to stop
   billing would leave billing on. Sections 3 and 7 use deploys.
7. **A refused founding checkout shows the wrong message.** The server answers 403
   `founding_price_not_available`; the checkout screen only recognises `founding_cohort_full`, so the
   household reads "Couldn't reach checkout. Try again in a moment." and retrying never helps.
8. **The webhook may store no period end.** Since Stripe API version 2025-03-31, `current_period_end`
   is on the subscription's items, not the subscription. A live endpoint on a current API version leaves
   `subscriptions.current_period_end` empty, and access then follows `status` alone: still correct, but
   without the "period ended and we missed the webhook" safety net.
9. **No tax is charged, while every page says "plus tax".** Stripe Tax is off (P16), so the household
   pays the bare price. Not a blocker for paying; a tax question (P8) for GrowSmart.
10. Smaller: the welcome email still says "when payments open on October 26" after that date; the
    Resend daily allowance is shared by the welcome sweep (50 a day), the founding sweep (40) and
    GrowSmart; after paying, the checkout screen can still show the plans until the page reloads,
    because the status is read once per sign-in; `beta.js` writes an address into its "ORPHAN SEAT" log
    lines (not billing).
