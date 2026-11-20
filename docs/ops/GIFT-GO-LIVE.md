# Gifts go-live: the checklist

Written 2026-11-20 on branch `gift-purchase`. **Done the same day: gifts went live on 2026-11-20. The record is below; the steps after it are the runbook as followed.**

Gift sales stay off until step 5. Redeeming has no switch, but with no codes sold there is nothing to redeem.

## Go-live record (2026-11-20)

| Step | What happened | Ids and checks |
|---|---|---|
| 1. Legal date | `GIFT_LEGAL_DATE` = 2026-11-20, the deploy day. | Live Terms and Privacy Policy: "Last updated November 20, 2026", with the Gifts section, the Gifts entry and the Resend gift sentence. |
| 2. Migration 0050, staging | No hosted staging project exists, so CC ran it on a fresh throwaway local Supabase: migrations 0001 to 0049 in order, then 0050 twice. | `docs/ops/gift-0050-check.sql` 21/21 true, plus 8 role probes. |
| 2. Migration 0050, production | Run once by the main Claude chat in the Supabase SQL editor, for Amanda. CC did not run it. | CC's read-only check with the public key: `permission denied` (42501) on `gift_codes` and on `gift_cover`, so both exist and are closed to clients. |
| 3. Live Stripe webhook | `flourish-production` listens to `charge.refunded` and `checkout.session.completed`. | Checked by the main Claude chat. |
| 4. Merge and deploy | PR #155 squash-merged as `dbc5109` at 21:53 UTC, after the local gate and CI math passed. | Deploy `6b00c14596b663ca427ee291` (sales off). The deploy before gifts: `6aff8e2fecc6d4fa33894167` (`780c36a`). |
| 5. Sales on | `GIFTS_ENABLED=true`, production context only, then a rebuild of main. | Deploy `6b00c1a945b70ebf4402a7bc`, live 21:55 UTC. `/api/gift` answers `{"enabled":true,"currency":"cad","prices":{"flourish":9999}}` and refuses the store apps (403). `/gift` shows "$99.99 plus tax" and "One-time gift, nothing renews." twice, and only one gift. |
| Live purchase | Amanda bought a real gift: CA$112.99 with HST. Email 1 and Email 2 both arrived, and the printable card opens. | |
| Live refund | The main Claude chat refunded it in full in Stripe. | The production row shows status `void`, void_reason `refunded`, so the refund reached the webhook and the code no longer works. |
| Live redeem | Skipped (Amanda's call). No test accounts were made on the live site. | Redeeming passed in Stripe test mode (`scripts/gift-e2e/run.mjs`, 25/25) and in the local E2E (27/27 with the approved words). |

Rollback: publish `6b00c14596b663ca427ee291` to stop sales and keep redeeming (same code, `GIFTS_ENABLED` not read), or `6aff8e2fecc6d4fa33894167` for the site before gifts.

## The steps

1. **Set the legal date to the deploy day.** Who: CC, in the deploy's pull request, on the day.
   - `src/lib/giftReturn.js`: `GIFT_LEGAL_DATE` is the day the deploy goes live (YYYY-MM-DD). It is a placeholder (2026-11-20) until then.
   - It dates the website's Terms (new Gifts section) and Privacy Policy (new Gifts entry), and the Before you start record keeps the same dates. The store apps' Terms and Privacy Policy have no gift words, so their dates do not move.
   - The same deploy carries the Privacy Policy's Resend gift sentence (approved 2026-11-20). It does not need a date of its own.
   - Check after: flourishmoney.app Terms and Privacy Policy both say "Last updated" with the deploy day.

2. **Run migration 0050 (gift codes).** Staging first, then production.
   - Staging: there is no hosted staging project, so CC runs it on a fresh throwaway local Supabase (every migration in order, then 0050 twice, then the check). Done 2026-11-20: all 21 checks true.
   - Production: the exact file `supabase/migrations/0050_gift_codes.sql` (sha256 `202bc34d...8ebe4`), pasted into the Supabase SQL editor and run once by the main Claude chat for Amanda. CC does not run it.
   - Check after: `docs/ops/gift-0050-check.sql` (read-only), one result, every row's `ok` true.

3. **Stripe, live mode: the production webhook.** Who: Amanda. CC does not change Stripe.
   - Developers > Webhooks > the production endpoint (`https://flourishmoney.app/.netlify/functions/stripe-webhook`).
   - It must listen to **`charge.refunded`** and **`checkout.session.completed`**. Keep every event it has; add either one only if it is missing.
   - `charge.refunded` cancels an unused gift code when the gift is refunded. Without it, a refunded code can still be redeemed.
   - `checkout.session.completed` creates the code and sends Email 1. Without it, a buyer pays and gets nothing.
   - `docs/ops/BILLING-SETUP.md` read both on the live endpoint on 2026-11-03. Check again on the day.
   - The test-mode endpoint is separate and has no `charge.refunded`. It does not affect live gifts.

4. **Merge and deploy.** Who: Amanda says "yes, deploy"; CC merges and deploys.
   - Check after: the production deploy id; the gate green on main; the store apps show no gift.
   - Undo: publish the previous deploy in Netlify. Migration 0050 can stay: nothing reads it once the code is gone.

5. **Turn on sales: `GIFTS_ENABLED=true`.** Who: Amanda, in Netlify's production environment variables. It is the only new variable.
   - Netlify functions read it at deploy time, so redeploy after setting it.
   - Check after: flourishmoney.app/gift shows "a year of flourish" at $99.99 CAD plus tax, and only that gift.
