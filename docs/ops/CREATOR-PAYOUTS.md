# Creator Program: the monthly payout

Run these in the Supabase SQL editor. Amounts are in cents, Canadian dollars. Terms: `~/Documents/Flourish/01 Marketing/Creator Program/CREATOR-PROGRAM-APPROVED-2026-11-02.md`.

## Adding a creator
```sql
insert into public.creators (code, name, payout_email) values ('ALICE', 'Alice Example', 'alice@example.com');
```
The code is 3 to 20 capitals and digits. Their link is `https://flourishmoney.app/get?c=ALICE`.

To end a partnership, set `status`: `'ended'` (they keep earning on households already credited) or `'ended_for_cause'` (fraud, spam or a serious breach: nothing further).

## Each month
**1. The report (read only).**
```sql
select * from public.creator_payout_report();
```
| Column | What it is |
|---|---|
| `households_credited` | How many households joined with this code. A count, never who. |
| `payable_this_month_cents` | Earned on payments more than 30 days old, less clawbacks, once that reaches $25. Otherwise 0. |
| `carry_over_cents` | The same figure when it is under $25: it rolls to next month. **Below zero** it is still owed back, and comes off later payouts. |
| `clawbacks_cents` | The refunds already counted in those two figures (zero or negative). |
| `not_yet_30_days_cents` | Earned on payments under 30 days old. Not payable yet. |

Check `status` before paying an `ended_for_cause` creator: the terms stop further earning, but what was earned before is a decision for you.

**2. Pay** each creator with `payable_this_month_cents` above 0, by Interac e-Transfer.

**3. Record each payout**, with your own reference. It settles what that payout covered, refuses under $25, and a second run finds nothing left.
```sql
select public.creator_payout_record('ALICE', 'etransfer-2026-12');
```

## What a creator is told
Only their own line, and only these: households credited, what they earned, carry-over, clawbacks. Never another creator's line (the report also lists names and payout emails). The report holds nothing about any household or customer, by design: keep it that way when you write to them.

## Support notes
The server emails the support inbox, and writes on the event's `billing_events` row, when:
| Flag | Means | What to do |
|---|---|---|
| `creator_amounts_unknown` | A payment whose amounts couldn't be read (RevenueCat gave no tax or fee figure, or Stripe no price before tax). No commission was recorded. | Check the payment. Record it by hand if it should count. |
| `creator_refund_unmatched` | A refund matching no commission. Nothing was clawed back. | Find the payment and record the clawback by hand if there was one. |
| `creator_refund_reversed` | A store took a refund back. Any clawback stands. | Decide by hand. |
| `creator_own_code` | A household holding its own creator's code. No commission was recorded. | Terms: "no using your own code". |
| `creator_not_cad` | A payment not in Canadian dollars. No commission was recorded. | Terms: Canada only for now. |

## What real RevenueCat deliveries look like (checked 2026-11-03)
Read from delivered webhook bodies in RevenueCat's dashboard, sandbox events on our own project.

**Every field the code reads is there.** `tax_percentage`, `commission_percentage`, `price_in_purchased_currency`, `currency`, `transaction_id`, `original_transaction_id`, `purchased_at_ms`, `environment`, `is_family_share`, `store`, `product_id`. RevenueCat's "Event Data" panel leaves some of them out; the panel is not the delivery.

**A refund matches its payment on Google Play: proven.** A sandbox refund of CAD 11.99 from the dashboard delivered `CANCELLATION` with `cancel_reason: CUSTOMER_SUPPORT` and `price_in_purchased_currency: -11.99`. Its `transaction_id` and `purchased_at_ms` were identical to the `RENEWAL` it refunded, so it matches exactly.

**On the App Store: not proven.** RevenueCat can't refund an Apple purchase, and the app has no refund request. The code matches on `transaction_id`, then on the original transaction and the exact purchase date, and otherwise raises `creator_refund_unmatched` rather than guess. Check the first real App Store refund against its payment.

**The store fee RevenueCat reports.** Google Play came through at `commission_percentage: 0.15`, the App Store at `0.3`. If the company is in Apple's Small Business Program (15%), set that in RevenueCat's App Store configuration before going live, or App Store commissions are worked out on too small a base: on $79.99, $55.99 rather than $67.99. `tax_percentage` came through as `0` in Canada on both stores.
