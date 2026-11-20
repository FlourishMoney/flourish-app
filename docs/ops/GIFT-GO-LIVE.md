# Gifts go-live: the checklist

Written 2026-11-20 on branch `gift-purchase`. Nothing in it has been done.

Gift sales stay off until step 5. Redeeming has no switch, but with no codes sold there is nothing to redeem.

## The steps

1. **Set the legal date to the deploy day.** Who: CC, in the deploy's pull request, on the day.
   - `src/lib/giftReturn.js`: `GIFT_LEGAL_DATE` is the day the deploy goes live (YYYY-MM-DD). It is a placeholder (2026-11-20) until then.
   - It dates the website's Terms (new Gifts section) and Privacy Policy (new Gifts entry), and the Before you start record keeps the same dates. The store apps' Terms and Privacy Policy have no gift words, so their dates do not move.
   - Check after: flourishmoney.app Terms and Privacy Policy both say "Last updated" with the deploy day.

2. **Run migration 0050 (gift codes).** Who: Amanda says go; CC runs it. Staging first, then production.
   - Check after: `public.gift_codes` exists; the gift functions answer for service_role only.

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
