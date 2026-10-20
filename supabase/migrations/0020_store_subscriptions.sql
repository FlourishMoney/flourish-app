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
-- dropped, and every existing row already satisfies the wider check. Whatever name production gave the
-- provider check (0009 and 0010 declared it inline), every check on the provider column is replaced, so the
-- old 'stripe'-only check cannot survive under another name. One transaction.
--
-- TO APPLY (Supabase SQL editor), before IAP_ENABLED is set in Netlify. Until then nothing writes a store row.
-- Order: any time after 0009 and 0010; 0025 and 0026 are already live and are not touched. 0022 next.
-- -----------------------------------------------------------------------------

begin;

do $$
declare c record;
begin
  for c in
    select con.conrelid::regclass as tbl, con.conname
    from pg_constraint con
    join pg_attribute att on att.attrelid = con.conrelid and att.attnum = any (con.conkey)
    where con.contype = 'c'
      and con.conrelid in ('public.subscriptions'::regclass, 'public.billing_events'::regclass)
      and att.attname = 'provider'
  loop
    execute format('alter table %s drop constraint %I', c.tbl, c.conname);
  end loop;
end $$;

alter table public.subscriptions
  add constraint subscriptions_provider_check check (provider in ('stripe', 'app_store', 'play_store'));

alter table public.billing_events
  add constraint billing_events_provider_check check (provider in ('stripe', 'revenuecat'));

commit;

-- -----------------------------------------------------------------------------
-- CHECK AFTERWARDS (read-only):
--   select con.conrelid::regclass as tbl, pg_get_constraintdef(con.oid) as def
--   from pg_constraint con join pg_attribute att on att.attrelid = con.conrelid and att.attnum = any (con.conkey)
--   where con.contype = 'c' and att.attname = 'provider'
--     and con.conrelid in ('public.subscriptions'::regclass, 'public.billing_events'::regclass)
--   order by con.conrelid::regclass::text;
-- Expected: exactly two rows.
--   billing_events | CHECK ((provider = ANY (ARRAY['stripe'::text, 'revenuecat'::text])))
--   subscriptions  | CHECK ((provider = ANY (ARRAY['stripe'::text, 'app_store'::text, 'play_store'::text])))
--
-- ROLLBACK (only while no store row or RevenueCat event exists; it fails, changing nothing, if one does):
--   begin;
--   alter table public.subscriptions drop constraint if exists subscriptions_provider_check;
--   alter table public.subscriptions add constraint subscriptions_provider_check check (provider in ('stripe'));
--   alter table public.billing_events drop constraint if exists billing_events_provider_check;
--   alter table public.billing_events add constraint billing_events_provider_check check (provider in ('stripe'));
--   commit;
-- -----------------------------------------------------------------------------
