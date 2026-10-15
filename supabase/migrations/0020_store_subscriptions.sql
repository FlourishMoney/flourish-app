-- 0020_store_subscriptions.sql
-- -----------------------------------------------------------------------------
-- A STORE PURCHASE IS THE SAME ROW A WEB PURCHASE IS (version 1.1, in-app purchase).
--
-- public.subscriptions has one row per household (user_id is the primary key) and the server's plan answer
-- (netlify/functions/_lib/planRules.js) reads that one row. From 1.1 the row can come from three places:
--   provider 'stripe'      the website, written by netlify/functions/stripe-webhook.js (as before)
--   provider 'app_store'   the iOS app, written from RevenueCat by netlify/functions/revenuecat-webhook.js
--   provider 'play_store'  the Android app, likewise
-- Because there is one row, a household holds one paid state at a time. Neither writer replaces a row the
-- other one has PAID for (_lib/storeSubscriptions.js mayReplace); the conflict is recorded for support.
--
-- billing_events records RevenueCat's deliveries as provider 'revenuecat', with the same idempotency lock.
--
-- ADDITIVE AND IDEMPOTENT. It only widens two check constraints; no row changes, no column is added or
-- dropped, and every existing row already satisfies the wider check.
--
-- TO APPLY (Supabase SQL editor), before IAP_ENABLED is set in Netlify. Until then nothing writes a store row.
-- -----------------------------------------------------------------------------

alter table public.subscriptions drop constraint if exists subscriptions_provider_check;
alter table public.subscriptions
  add constraint subscriptions_provider_check check (provider in ('stripe', 'app_store', 'play_store'));

alter table public.billing_events drop constraint if exists billing_events_provider_check;
alter table public.billing_events
  add constraint billing_events_provider_check check (provider in ('stripe', 'revenuecat'));
