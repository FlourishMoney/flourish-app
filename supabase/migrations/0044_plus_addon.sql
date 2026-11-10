-- 0044_plus_addon.sql
-- -----------------------------------------------------------------------------
-- THE PLUS ADD-ON'S OWN SUBSCRIPTION ROW (2026-11-10). NOT APPLIED.
--
-- Plus is an add-on on top of any plan (Amanda's decision): a household keeps its monthly, annual or founding plan
-- and may add Plus beside it. So Plus can never live in public.subscriptions, which holds ONE subscription per
-- household (0009, 0020) and is what every plan check reads: a Plus purchase written there would replace the main
-- plan, and a main-plan event would cancel Plus. This table is Plus alone, one row per buyer:
--   provider               'stripe' (the website), 'app_store' or 'play_store' (through RevenueCat)
--   plan_key               'plus_monthly' | 'plus_annual'
--   status                 Stripe's status verbatim, or 'active' / 'canceled' from a store
--   product_id             the Stripe price id, or the store's product id: the server counts a row only while this is
--                          one of Plus's own (netlify/functions/_lib/plusAddon.js), so a main-plan price can never
--                          stand in for Plus
--   provider_subscription_id, provider_customer_id   Stripe's ids (null for a store purchase)
--   current_period_end, cancel_at_period_end, last_event_at
-- No amount, no card, no address, no email. Deleted with the account (on delete cascade); delete_account also
-- cancels a live Plus subscription at Stripe first (plaid.js).
--
-- WHO READS IT: only the server (service role), through _lib/plusAddon.js. The app is told plus true or false.
-- A household is covered while either member holds a live row.
--
-- UNTIL THIS IS APPLIED: nothing reads or writes it unless PLUS_ENABLED is "true" (Netlify), and with the flag on a
-- missing table is a failed read, so Plus is never granted. Run in the Supabase SQL editor. Additive and safe to run
-- twice.
-- -----------------------------------------------------------------------------

create table if not exists public.plus_addon_subscriptions (
  user_id                  uuid        primary key references auth.users(id) on delete cascade,
  provider                 text        not null check (provider in ('stripe', 'app_store', 'play_store')),
  plan_key                 text        check (plan_key in ('plus_monthly', 'plus_annual')),
  status                   text        not null,
  product_id               text,
  provider_subscription_id text        unique,
  provider_customer_id     text,
  current_period_end       timestamptz,
  cancel_at_period_end     boolean     not null default false,
  last_event_at            timestamptz,
  updated_at               timestamptz not null default now()
);

alter table public.plus_addon_subscriptions enable row level security;
-- No policy: the Data API roles can neither read nor write it. Only the service role.
revoke all on table public.plus_addon_subscriptions from anon, authenticated;
grant all privileges on table public.plus_addon_subscriptions to service_role;

-- ============================================================================
-- READ-ONLY CHECK (after running): RLS on, the Data API roles cannot read it, and it is empty.
--   select (select relrowsecurity from pg_class where oid = 'public.plus_addon_subscriptions'::regclass),
--          has_table_privilege('authenticated', 'public.plus_addon_subscriptions', 'select'),
--          has_table_privilege('anon', 'public.plus_addon_subscriptions', 'select'),
--          (select count(*) from public.plus_addon_subscriptions);
-- Expected: true, false, false, 0.
-- ============================================================================
-- ROLLBACK (only while PLUS_ENABLED is unset and the table is empty; nothing else depends on it):
-- drop table if exists public.plus_addon_subscriptions;
-- ============================================================================
