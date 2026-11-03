# Creator Program: the monthly payout

Run these in the Supabase SQL editor. Amounts are in cents, Canadian dollars. Terms: `~/Documents/Flourish/01 Marketing/Creator Program/CREATOR-PROGRAM-APPROVED-2026-11-02.md`.

## Adding a creator
```sql
insert into public.creators (code, name, payout_email) values ('ALICE', 'Alice Example', 'alice@example.com');
```
The code is 3 to 20 capitals and digits. Their link is `https://flourishmoney.app/get?c=ALICE`.

To end a partnership, set `status`: `'ended'` (they keep earning on households already credited) or `'ended_for_cause'` (fraud, spam or a serious breach: nothing further).

## Each month
**1. Check both stores' refund reports first.** Do this before the report: RevenueCat doesn't tell us about every store refund (see below), and a clawback recorded after the report waits for next month. Go through App Store Connect's sales and financial reports, and Play Console's order management and financial reports, for refunds since the last payout. For each refund of a payment that earned a commission, find its row and claw it back. A second run on the same payment adds nothing, so a refund the code already caught is safe.
```sql
select payment_ref, original_ref, payment_date, commission_cents, gross_amount_cents from public.creator_commissions
 where provider = 'app_store' and clawback_of is null and payment_date::date = '2026-11-01';   -- or 'play_store'

select public.creator_commission_clawback('app_store', 'THE_PAYMENT_REF', null, null, null);
```
Google's order numbers (`GPA.…`) are the `payment_ref`. If a report doesn't name the transaction, match on the date and the amount. If more than one payment fits, don't guess: nothing should be taken from the wrong payment.

Then pick one moment for the rest of the run, and use it in both the report and the record. A payment that matures, or a refund or lost chargeback that lands, after it waits for next month.

**2. The report (read only).**
```sql
select * from public.creator_payout_report('2026-12-01 09:00:00-05');
```
| Column | What it is |
|---|---|
| `households_credited` | How many households joined with this code. A count, never who. An account counts once its email is confirmed. A partner's own code doesn't count while they are in a household. |
| `payable_this_month_cents` | Earned on payments more than 30 days old, less clawbacks, once that reaches $25. Otherwise 0. |
| `carry_over_cents` | The same figure when it is under $25: it rolls to next month. **Below zero** it is still owed back, and comes off later payouts. |
| `clawbacks_cents` | The refunds and lost chargebacks already counted in those two figures (zero or negative). |
| `given_back_cents` | Lost chargebacks that turned into wins, with the money back: what they took, already counted in those two figures (zero or positive). |
| `not_yet_30_days_cents` | Earned on payments under 30 days old. Not payable yet. |

Check `status` before paying an `ended_for_cause` creator: the terms stop further earning, but what was earned before is a decision for you.

**3. Pay** each creator with `payable_this_month_cents` above 0, by Interac e-Transfer.

**4. Record each payout**, with your own reference, the amount you sent in cents, and the same moment. It settles exactly what that report covered. It answers `amount_changed` and settles nothing if the amount doesn't match, and `below_minimum` under $25. A second run finds nothing left.
```sql
select public.creator_payout_record('ALICE', 'etransfer-2026-12', 4000, '2026-12-01 09:00:00-05');
```

## What a creator is told
Only their own line, and only these: households credited, what they earned, carry-over, clawbacks, anything given back. Never another creator's line (the report also lists names and payout emails). The report holds nothing about any household or customer, by design: keep it that way when you write to them.

## Support notes
The server emails the support inbox, and writes on the event's `billing_events` row, when:
| Flag | Means | What to do |
|---|---|---|
| `creator_amounts_unknown` | A payment whose amounts couldn't be read (RevenueCat gave no tax or fee figure, or Stripe no price before tax). No commission was recorded. | Check the payment. Record it by hand if it should count. |
| `creator_refund_unmatched` | A refund matching no commission. Nothing was clawed back. | Find the payment and record the clawback by hand if there was one. |
| `creator_chargeback_unmatched` | A lost Stripe chargeback matching no commission. Nothing was clawed back. | Find the payment and record the clawback by hand if there was one. |
| `creator_chargeback_given_back` | A lost chargeback turned into a win and Stripe returned the money. What it took goes back on the next payout, by itself. | Nothing to do. It shows as `given_back_cents`. |
| `creator_refund_reversed` | A store took a refund back. Any clawback stands. | Decide by hand. |
| `creator_own_code` | A household holding its own creator's code. No commission was recorded. | Terms: "no using your own code". |
| `creator_not_cad` | A payment not in Canadian dollars. No commission was recorded. | Terms: Canada only for now. |

## What real RevenueCat deliveries look like (checked 2026-11-03)
Read from delivered webhook bodies in RevenueCat's dashboard, sandbox events on our own project.

**Every field the code reads is there.** `tax_percentage`, `commission_percentage`, `price_in_purchased_currency`, `currency`, `transaction_id`, `original_transaction_id`, `purchased_at_ms`, `environment`, `is_family_share`, `store`, `product_id`. RevenueCat's "Event Data" panel leaves some of them out; the panel is not the delivery.

**A refund matches its payment on Google Play: proven.** A sandbox refund of CAD 11.99 from the dashboard delivered `CANCELLATION` with `cancel_reason: CUSTOMER_SUPPORT` and `price_in_purchased_currency: -11.99`. Its `transaction_id` and `purchased_at_ms` were identical to the `RENEWAL` it refunded, so it matches exactly.

**On the App Store: not proven.** RevenueCat can't refund an Apple purchase, and the app has no refund request. The code matches on `transaction_id`, then on the original transaction and the exact purchase date, and otherwise raises `creator_refund_unmatched` rather than guess. Check the first real App Store refund against its payment.

**The store fee RevenueCat reports.** The base uses each event's own `commission_percentage` and nothing else. Google Play came through at `0.15`, the App Store at `0.3` when this was first checked. The Small Business Program is now set in RevenueCat for Flourish iOS (start 2026-09-23), so new iOS events should show `0.15`: on $79.99, a base of $67.99 rather than $55.99. Check the first one. `tax_percentage` came through as `0` in Canada on both stores.

**Chargebacks on the stores (RevenueCat's docs, read 2026-11-03).** Its webhook and refund pages don't mention chargebacks, and no field tells one from a refund. One that reaches RevenueCat as a refund arrives as `CANCELLATION`, `cancel_reason: CUSTOMER_SUPPORT`, with a negative price, and the refund code already claws it back. None has been seen yet.

**What never arrives can't be clawed back.** RevenueCat says a subscription's `CANCELLATION` isn't sent for refunds of earlier periods, and a Google refund has to be refunded and revoked for it to be seen. That is why step 1 comes first each month.
