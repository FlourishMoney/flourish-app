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

## Monday, in order

Before Monday: section 1 (including Stripe Tax: the GST/HST registration, settings, prices Exclusive), ending with deploy **D0** (live Stripe variables; billing, tax and signup off).

1. Pre-check, read-only (2.1).
2. Run 0009, then its read-only check (2.2).
3. Run 0010, then its read-only check (2.3).
4. Run 0016, then its read-only check (2.4).
5. Stripe pre-checks: `node scripts/stripe-portal-check.cjs` and `node scripts/stripe-tax-check.cjs` both say `OK` (section 3, step 1): the portal cannot sell the founding price, the GST/HST registration is active in Stripe Tax, and every price is tax-exclusive. Not OK: stop.
6. `BILLING_ENABLED=true` and `STRIPE_TAX_ENABLED=true`, both Production, one Trigger deploy (**D1**); the curl answers 401 (section 3).
7. Smoke purchase: Monthly on Amanda's own card; the receipt shows tax; the read-only checks, refund, cancel (section 4).
8. `OPEN_SIGNUP=true`, Production, Trigger deploy (**D2**); the curl answers `true`; after the first new accounts the marker check says `link` (section 5).
9. `FOUNDING_LINK_EMAIL=true`, Production, Trigger deploy (**D3**): the founding link emails, and the launch email for the `pre-2026-10-01` rows (section 6).
10. Watch the first hour (section 7). Stop if section 8 says so.

Not 0017. Not `waitlist_founding_start()`. No merges to `main` on Monday.


---

## 1. Before Monday (by Friday 2026-10-23)

1. **Stripe, live mode.** Follow `docs/ops/BILLING-SETUP.md` section 1 with **Test mode OFF**: product
   "Flourish Plus", three CAD prices (`monthly` 11.99, `annual` 99.99, `founding_annual` 79.99), each with
   tax behaviour "Exclusive"; the webhook endpoint
   `https://flourishmoney.app/.netlify/functions/stripe-webhook` with exactly
   `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`.
2. **Stripe customer portal, live mode.** Allow cancel and payment-method updates. **Do not let it switch
   to the founding price.** If plan switching is on and the founding price is listed, any subscriber can
   move themselves onto $79.99 in the portal; the founding rules are only enforced in our checkout. The
   exact screen, setting and a read-only check are section 3, step 1, which must pass before D1.
2b. **Stripe Tax, live mode** (tax is charged from the first sale). **Tax → Registrations → Add
   registration:** Canada, GST/HST, with GrowSmart's GST/HST number and its start date (a "standard"
   registration; a "simplified" one is for businesses outside Canada). **Settings → Tax:** the head office
   address, default tax behavior **Exclusive**, and the default product tax code. **Each of the three
   prices:** Tax behavior **Exclusive**. Stripe does not let a price's tax behavior change once it is
   inclusive or exclusive ("Once specified as either inclusive or exclusive, it cannot be changed", Prices
   API). So if a live price was made **Inclusive**, make a new price with Exclusive, put its id in its
   `STRIPE_PRICE_*_CAD` variable, and archive the old one, before D1. A price left unspecified can be set
   to Exclusive once, or follows the default. Section 3 step 1 checks all of it.
3. **Netlify variables, Production context only** (Site configuration → Environment variables). Deploy
   previews and branch deploys keep the test values, so a preview can never charge a real card:
   `STRIPE_SECRET_KEY` (live), `STRIPE_WEBHOOK_SECRET` (the live endpoint's own `whsec_`),
   `STRIPE_PRICE_MONTHLY_CAD`, `STRIPE_PRICE_ANNUAL_CAD`, `STRIPE_PRICE_FOUNDING_ANNUAL_CAD` (live ids),
   `APP_ORIGIN` = `https://flourishmoney.app`. Leave `BILLING_ENABLED`, `STRIPE_TAX_ENABLED` and
   `FOUNDING_LINK_EMAIL` **unset**.
4. **A variable change needs a deploy.** Netlify gives a deployed function the variables that were set
   when it was deployed ("To apply updated environment variable values, create a new deploy", Netlify
   docs, Functions → Environment variables). Some code comments say flipping `BILLING_ENABLED` needs no
   deploy; that is wrong. After every change below: **Deploys → Trigger deploy → Deploy site**, and wait
   for "Published".
5. **Deploy D0.** After step 3, trigger one deploy with billing still off. Write down its deploy id.
   D0 is the instant way back (section 8): it has the live webhook secret, billing off and signup shut.
6. **Signup opens on Monday (section 5).** A founding household with no account cannot reach checkout,
   and with signup shut a full 30-seat beta cap refuses even a valid invite code (section 11, item 1).
   So `OPEN_SIGNUP=true` goes in on Monday, after the smoke purchase and before the founding link email
   (section 6), which tells them to sign in or create an account.
7. **PR #69 (0017) stays held** unless Amanda decides otherwise. Section 10 says what that means Monday.
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

**Who:** Amanda, in Stripe and then Netlify. Nobody else holds either login.

1. **Pre-checks, before D1.** (a) **The customer portal cannot switch anyone to the founding price.** Our
   checkout decides who may have $79.99 a year; Stripe's portal does not, and billing.js opens the
   portal with its **default** configuration.
   - **The screen:** Stripe Dashboard in **live mode** (Test mode off) → **Settings** → **Billing** →
     **Customer portal** (dashboard.stripe.com/settings/billing/portal).
   - **The setting:** under subscriptions, **Switch plan**. Leave it **off**, or, if it is on, make sure
     the **Founding Annual** price ($79.99 a year) is not one of the prices it lists. Save.
   (b) **Stripe Tax is ready** (section 1 step 2b): Tax settings complete, an active GST/HST registration
   for Canada, and each of the three live prices tax-exclusive.
   - **Confirm both, read-only,** from the main checkout once this branch is merged. The key is typed
     hidden, used for these two commands, and never printed or stored. A live restricted key with read
     access to the customer portal, prices and Tax is enough; the live secret key also works. The scripts
     only make GET requests and change nothing:

```zsh
cd ~/Projects/flourish-app
read -rs "STRIPE_READ_KEY?Stripe live key, read-only (hidden): "; echo
STRIPE_READ_KEY="$STRIPE_READ_KEY" node scripts/stripe-portal-check.cjs
STRIPE_READ_KEY="$STRIPE_READ_KEY" node scripts/stripe-tax-check.cjs
unset STRIPE_READ_KEY
```

   Expect every line to start `OK:` (the portal: Switch plan off, or on without the founding price; tax:
   settings complete, the GST/HST registration active, each price exclusive). Any `NOT OK:` (including a
   test-mode key) means stop: fix it in Stripe and run them again.
2. Site configuration → Environment variables → add `BILLING_ENABLED` **and** `STRIPE_TAX_ENABLED`, each
   value exactly `true` (not `TRUE`, not `1`), **Production** context only. Both go in this one deploy: tax
   is charged from the first sale. `STRIPE_TAX_ENABLED` is a rollback switch only (section 8).
3. Deploys → Trigger deploy → Deploy site. Wait for "Published". This is deploy **D1**.
4. Check from a terminal (no login, no secret). 401 means on; 404 means still off:

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://flourishmoney.app/api/billing
```

5. On a computer, signed in at flourishmoney.app: Settings shows "Flourish Plus" with "See plans". On
   the iPhone or Android app nothing about paying appears anywhere (by design, Apple 3.1.3(b)).

What `BILLING_ENABLED` gates: only `netlify/functions/billing.js` (the status call, checkout and the
billing portal). Unset, every one answers 404 before reading anything. The Stripe webhook, account
deletion's Stripe cancel and `/api/founding` do not depend on it.

---

## 4. The first smoke purchase, and its refund

Amanda's own account, her own card, **the Monthly plan**. Never Founding Annual for a smoke test:
cancelling a founding subscription stamps `founding_ended_at` and the ledger's `ended_at`, and that
household's founding price never comes back (section 9).

1. Signed in on a computer: Settings → Flourish Plus → See plans → Monthly → pay in Stripe Checkout.
   Checkout asks for your billing address and shows tax on top of $11.99 before you pay.
2. Back on flourishmoney.app with "Payment received…". Then, read-only:

```sql
select status, plan_key, provider_subscription_id is not null as has_subscription,
       founding_ended_at is null as not_ended
from public.subscriptions order by updated_at desc limit 1;

select type, status, attempts from public.billing_events order by received_at desc limit 5;
```

Expect `active`, `monthly`, `true`, `true`; the events `processed` (or `ignored` for types we do not
handle), none `failed`.

3. **The receipt must show tax.** Stripe's emailed receipt, and Stripe (live) → Payments → the payment,
   show a GST/HST line for the province of the billing address (Ontario, HST 13%: $11.99 + $1.56 =
   $13.55). No tax line means stop (section 8).
4. Refund it: Stripe (live) → Payments → the payment ($11.99 plus tax) → Refund → full amount; the tax is
   refunded with it.
5. Cancel it: Stripe → Customers → that customer → the subscription → Cancel → **immediately**.
6. Read again: the subscriptions row says `canceled`; the new events are `processed`.

A refund alone does not cancel; a cancel alone does not refund. Do both. If any expectation fails, go to
section 8.

---

## 5. Open signup

Monday's second switch, after the smoke purchase passed (section 4) and before the founding link email
(section 6). **Who:** Amanda, in Netlify.

1. Site configuration → Environment variables → add `OPEN_SIGNUP`, value exactly `true` (not `TRUE`, not
   `1`), **Production** context only.
2. Deploys → Trigger deploy → Deploy site. Wait for "Published". This is deploy **D2**.
3. Check from a terminal (no login, no secret). `true` means open; `false` means the deploy has not picked
   it up:

```bash
curl -s -X POST https://flourishmoney.app/api/beta -H 'Content-Type: application/json' -d '{"action":"signup_status"}'
```

4. In a private window on flourishmoney.app: Log in → Sign Up no longer asks for a code.
5. After the first few new accounts (read-only, counts only): every account made since D2 must say
   `link`. Anything else means the marker is not being kept, and no new account will be offered the
   founding price (it fails closed): stop the founding emails (section 8) and look before going on.

```sql
select coalesce(raw_app_meta_data->>'email_confirmation', '(none)') as how_confirmed,
       count(*) as accounts,
       count(*) filter (where confirmed_at is not null) as confirmed
from auth.users
where created_at >= timestamptz '2026-10-26 00:00 America/Toronto'
group by 1 order by 1;
```

What opening signup changes, and what it does not (`tests/billingDaySignup.test.cjs`):
- Anyone can create an account without a code. It gets the 14-day trial (0007) and must confirm its
  email before it can sign in.
- **Every new account confirms its email from our link, code or not** (round 3). A code shows you handed
  it out, not that the person owns the address they typed, and the founding price follows the address.
- **Invite codes still work.** A valid code is still an invited signup and takes one of the 30 seats
  while any are left; it now confirms its email like everyone else. A wrong code is still refused. A full
  cap no longer locks a code holder out.
- **The beta founder flag.** No signup can set it (0007 gives every new account `founder_flag` false, and
  0002 lets only the service role change it). Existing founders keep the founder plan and the founding
  price.
- **The founding price** still follows the account's confirmed email to its waitlist spot. Signing up
  takes no founding number and touches no waitlist row.

---

## 6. The founding link email

The welcome email promised every founding household "your link to the founding price when payments open
on October 26". `netlify/functions/founding-link-sweep.js` sends it, once per household, every 15 minutes,
only while **both** `BILLING_ENABLED` and `FOUNDING_LINK_EMAIL` are exactly `true`.

**Only after section 4 passed and signup is open (section 5):**

1. Add `FOUNDING_LINK_EMAIL` = `true`, Production only. Trigger deploy. This is **D3**.
2. Who gets it: founding number 1 to 50, not a test row, not unsubscribed, billing's own lookup still
   honours the number, and a consent version whose words asked for updates. Every consent version ever
   recorded, and what its words said:

   | consent_version | the words the person saw | founding link email |
   |---|---|---|
   | `pre-2026-10-01` | none recorded (no consent line yet). The form said "Join the waitlist and we'll email you the moment flourish launches" and, once joined, "We'll email you the moment flourish launches. No spam, just the launch news." | **Yes, as the launch email**, once signup is open (Amanda's decision below): launch news only, and the one email they ever get |
   | `2026-10-01` | "Email me when flourish launches in Canada, plus a few updates before then. Unsubscribe any time." (with the identity line) | Yes |
   | `2026-10-05` | "We'll email you when flourish launches in Canada, plus a few updates before then. From GrowSmart Inc. (flourish), PO Box 29, Foxboro ON K0K 2B0, hello@flourishmoney.app. Unsubscribe any time." | Yes |
   | `2026-10-06` | "We'll email you when flourish launches in Canada, plus a few updates before then. Unsubscribe any time. Who we are: see Contact below." | Yes |
   | anything else | not a version the site ever showed | No |

   **Amanda's decision (2026-10-14): the `pre-2026-10-01` rows get the launch email.** They asked to
   hear when flourish launches, and October 26 with signup open is that launch. Their consent was launch
   news only (CASL), so the email is launch news only (round 5, approved wording): no price, no founding
   number, no checkout link. Subject "flourish has launched in Canada"; it ends "This is the one email you
   asked for when you joined, so we won't send you anything else from the waitlist." It goes to every such
   row, founding number or not. It is sent by the same sweep, behind the same `FOUNDING_LINK_EMAIL` switch,
   and only while `OPEN_SIGNUP` is also on. **It is the one email those rows ever get:** the shared rule
   (`mayEmailWaitlistRow`) refuses them every other kind of email, now and later, a store release-day email
   included (`tests/launchEmail.test.cjs`). Counts per version, read-only, no addresses:

```sql
select coalesce(consent_version, '(none)') as consent_version,
       count(*) as all_rows,
       count(*) filter (where founding_position between 1 and 50 and not is_test) as founding_rows,
       count(*) filter (where founding_position between 1 and 50 and not is_test and unsubscribed_at is null) as founding_subscribed,
       count(*) filter (where unsubscribed_at is not null) as unsubscribed
from public.waitlist
group by 1 order by 1;
```

3. Progress, every 15 minutes (counts only):

```sql
select count(*) filter (where metadata ? 'founding_link') as link_sent,
       count(*) as founding_rows
from public.waitlist where founding_position between 1 and 50 and not is_test;
```

At most 10 a run and 40 a day. The Resend allowance is shared with the welcome emails and with GrowSmart.

To stop the emails only: remove `FOUNDING_LINK_EMAIL` and deploy, or publish D2 (section 8).

**This is the only founding email any waitlist row gets. No reminders follow it.** The waitlist consent
("when flourish launches in Canada, plus a few updates before then") ends at the October 26 launch, so
emails on October 29 or November 2 would be outside it (ChatGPT and Grok, 2026-10-15). After a row's
founding link or launch email, the shared rule (`mayEmailWaitlistRow`) refuses it every other email; and
from D2 (signup open) it refuses every waitlist email but those two, so a new waitlist signup is still
stored but gets no welcome email (`tests/launchEmail.test.cjs` section 6).

The link is `https://flourishmoney.app/?checkout=founding`. It carries nothing about the household. It
opens sign-in, then the checkout screen. Whether the founding price is offered is decided by the server
for the signed-in account's own confirmed email, so a forwarded link gives nobody the founding price.

---

## 7. The first hour

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

## 8. The stop condition, and turning billing off

**Turn billing off at once if any one of these is true:**

1. `failed_events` or `stuck_events` is above 0 and a Stripe retry has not cleared it within 10 minutes.
2. A payment succeeded in Stripe and that household has no `active` subscriptions row 10 minutes later.
3. A charge's price before tax is any amount other than 11.99, 99.99 or 79.99 CAD, or a Founding Annual
   charge went to an account the founding price was not offered to.
4. Anything about paying (a price, a plan, a checkout) appears in the iPhone or Android app.
5. The `billing` or `stripe-webhook` log shows `server_misconfigured` or `price_not_configured`.
6. A charge has no tax line while `STRIPE_TAX_ENABLED` is on.

**Tax only: the rollback switch.** If Stripe Tax itself fails at checkout (the `billing` log shows
`billing_provider_error` and Stripe's dashboard logs name tax or the address), remove `STRIPE_TAX_ENABLED`
and deploy. New checkouts then go through without tax; subscriptions already made keep theirs. Sales made
in that window carry no tax: decide with your accountant how to handle them, then turn it back on.

**Off, fastest:** Netlify → Deploys → D0 → **Publish deploy**. Instant, no build: D0 was deployed with
billing off. It also shuts signup again and stops the founding emails, because D0 predates both. To stop
billing but keep signup open, remove `BILLING_ENABLED` and `FOUNDING_LINK_EMAIL` and deploy instead (a few
minutes, not instant). (Netlify may then stop auto-publishing; switch it back on once things are fixed.) Then remove
`BILLING_ENABLED` and `FOUNDING_LINK_EMAIL` from the variables, so the next deploy is off too.

**Check it is off:** the curl in section 3 answers 404.

What off does: new checkouts, the status call and the billing portal answer 404, and the checkout screen
disappears. Because the web app learns "paid" from that status call, **paying households see the free
tier in the app while billing is off** (their subscriptions are untouched, and the paid tier returns the
moment billing is back on). What off does **not** do: it cancels nobody. Existing subscriptions keep renewing in Stripe,
and the webhook keeps recording them. A paying household cannot open the portal while billing is off;
cancel for them in Stripe if they ask (hello@flourishmoney.app).

---

## 9. What cannot be undone once a real charge clears

- **The money moved.** A refund is a second transaction, not an erasure. The household sees the charge
  and the refund on their statement, and the refund takes days to reach them.
- **Stripe's records stay.** In live mode the customer, payment, invoice and receipt cannot be deleted.
  Stripe does not return its processing fee on a refund.
- **A cancelled founding subscription ends that household's founding price for good.** The webhook
  stamps `subscriptions.founding_ended_at` and the ledger's `ended_at` once and never clears them. The
  number is never given to anyone else. This is the rule ("ended is final"). It applies to a test as much
  as to a real household.
- **Tax collected is GrowSmart's to remit.** From the first sale, each charge includes GST/HST worked out
  by Stripe Tax and recorded in Stripe's tax reports. A refund reverses it there, but filing and remitting
  stay GrowSmart's. An invoice already issued cannot be re-issued with different tax.
- **Accounts made while signup is open stay.** Shutting signup again, or publishing D0, stops new ones; it
  removes none.
- **Turning billing off does not unwind anything** (section 8).

---

## 10. Holding 0017 (PR #69): what it means on Monday

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

## 11. Reported, not fixed: what could stop a household paying, or getting what it paid for

Found while preparing this checklist (2026-10-14). None is fixed on this branch; each is Amanda's call.
Worst first.

1. **Addressed (round 2): signup opens on Monday** (section 5), after the smoke purchase and before the
   founding link email. With signup shut, a full 30-seat beta cap refused even a valid invite code.
   `tests/billingDaySignup.test.cjs` shows that opening it keeps invite codes working, leaves the beta
   founder flag out of every signup's reach, and leaves the founding lookup on the confirmed email.
   **Fixed (round 3): the founding price needs an address the household verified.** It is offered only to
   an account whose address was confirmed by clicking our link (`app_metadata.email_confirmation` =
   `link`, which only the server can write), never to one confirmed on creation; and with signup open,
   no account is confirmed on creation, code or not. `tests/foundingVerifiedEmail.test.cjs`.
   **Needs a human decision:** accounts made before this marker existed (invited, confirmed on creation)
   count as not verified, so one that holds a founding address is offered only the regular prices. Beta
   founders are unaffected. How many there are, read-only:

```sql
select count(*) as founding_addresses_held_by_older_accounts
from auth.users u
join public.waitlist w on public.waitlist_email_key(w.email) = public.waitlist_email_key(u.email)
where w.founding_position between 1 and 50 and not w.is_test
  and coalesce(u.raw_app_meta_data->>'email_confirmation', '') <> 'link'
  and not exists (select 1 from public.profiles p where p.user_id = u.id and p.founder_flag);
```

   **Addressed (round 4): such an account can confirm itself.** Its checkout screen shows "Your founding
   spot" with one button, "Send me a confirmation link" (at most 3 in 24 hours). The emailed link opens a
   page with one button ("Confirm my email address"); pressing it sets the "link" marker, and the founding
   price is then offered. Opening the link alone changes nothing, because mail scanners open links. The link
   lasts 24 hours and stops working if the account's address changes. Signed with
   `FOUNDING_CONFIRM_SECRET`, or a key derived from the Supabase secret key when that is unset.
2. **Fixed (round 2): a paying web household gets the paid tier.** The web app now combines the
   profile's plan with the billing status's `paid`, which the server works out from Stripe's status and
   the paid period (`webPlan`, `planRules.isPaidSubscription`). A subscription cancelled at period end
   counts until that period ends. A store app is unchanged. While billing is off, the app is exactly as
   before (section 8). `tests/webPaidPlan.test.cjs`.
3. **Fixed (round 2): every upgrade button reaches the real checkout.** Today, Goals, the Credit gate,
   the coach's out-of-messages gate and What-If (six call sites) now go through `openUpgrade()`: with
   billing on, the checkout screen; with it off, the old paywall and its words, unchanged. With billing on
   the buttons say "See plans", not "Try Free" or "Start 14 days free" (checkout starts no free trial),
   and the checkout's prices are the landing page's words: "$11.99 a month", "$99.99 a year", "$79.99 a
   year", plus tax, with no monthly equivalent or percentage. `tests/upgradeEntryPoints.test.cjs`.
4. **Decided (rounds 4-5): the `pre-2026-10-01` rows get one launch email, launch news only, and nothing else ever** (section 6 step 2). Before that decision: Rows whose consent is
   from before the consent line (`pre-2026-10-01`) agreed only to the launch-day email
   (`mayEmailWaitlistRow`), so the sweep skips them. Numbering ran in join order, so they likely hold the
   lowest numbers, and their welcome email predates the founding line: nothing has told them they are
   founding. Section 6 step 2 counts them. Whether Monday's email counts as the launch-day email for them
   is a CASL decision.
5. **Addressed (round 3): section 3 step 1 checks it before D1. The Stripe customer portal could sell the founding price to anyone.** If plan switching is enabled
   and the founding price is listed, a subscriber can switch to $79.99 in the portal; our founding rules
   only run in our checkout. Section 1 step 2. The checkout screen's own "manage" text says "switch plan".
6. **Turning a flag on or off needs a deploy.** Netlify functions keep the variables of their deploy.
   Comments in `billing.js` and `_lib/signupGate.js`, and `docs/ops/WEEK-02-2026-09-21.md`, say otherwise.
   Followed as written, "set `BILLING_ENABLED`, no deploy" leaves billing off; worse, removing it to stop
   billing would leave billing on. Sections 3 and 7 use deploys.
7. **Fixed (round 2): a refused founding checkout says why.** The checkout screen now reads the server's
   real 403 `founding_price_not_available` and says the founding price isn't available to this account
   (it goes to the address holding a founding spot, and not after a founding subscription has ended), and
   that monthly and annual still are. `tests/checkoutRefusal.test.cjs`.
8. **Fixed (round 2): the webhook stores the paid period on either Stripe API version** (on the
   subscription before 2025-03-31, on its item after), so "paid until the period ends" holds.
9. **Fixed (round 4): tax is charged from the first sale.** Checkout uses Stripe Tax
   (`STRIPE_TAX_ENABLED`, set with `BILLING_ENABLED` in D1): automatic tax, the billing address always
   collected and saved to the customer, prices tax-exclusive. **The Terms (round 5):** they now say prices
   are in Canadian dollars and do not include sales tax, which is calculated from the billing address and
   added at checkout (wording approved by ChatGPT and Grok; Last updated October 14, 2026).
   `docs/ops/LEGAL-PACKET.md` is the snapshot sent to counsel and still quotes the old sentence.
10. Smaller: the welcome email stops at D2 (no waitlist email after the launch), and the landing page's
    waitlist form still takes signups after it, promising a launch email they will not get; the
    Resend daily allowance is shared by the welcome sweep (50 a day), the founding sweep (40) and
    GrowSmart; after paying, the checkout screen can still show the plans until the page reloads,
    because the status is read once per sign-in; `beta.js` writes an address into its "ORPHAN SEAT" log
    lines (not billing).
