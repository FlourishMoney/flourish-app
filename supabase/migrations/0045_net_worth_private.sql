-- 0045_net_worth_private.sql
-- -----------------------------------------------------------------------------
-- NET WORTH WITH PLUS: EACH PERSON'S OWN, PRIVATE BY DEFAULT (2026-11-10). NOT APPLIED.
--
-- Amanda's rule for the Plus net worth screen: each person's holdings, accounts and entries are visible only to them
-- unless they turn on "share with my partner" for that item. Nothing is shared by default, an RDSP (or anything else
-- that could reveal a health or disability fact) included. A partner sees a household total only when every part of
-- it is shared and real. When someone leaves the household, their entries go with them (as 0041 did for meetings).
--
-- So nothing here lives in the shared household blob, which both people read. Two tables, each row in the name of
-- the person it belongs to:
--   net_worth_entries   a home, a car or a pension the person entered: their own figure, its currency, whether they
--                       share it. kind, a short label, value in cents, CAD or USD.
--   net_worth_shares    the person's choice for one bank account they linked: shared with their partner or not.
--                       No row means not shared.
-- Only the server reads them (netlify/functions/networth.js, service role), and it gives a partner only what is
-- shared, and only while the two are in the same household (_lib/household.js peerIdsOf, read each time). So a leave
-- needs nothing here: the rows stay in the leaver's name and go with them, and the one who stays stops seeing them
-- the moment the membership ends. Deleting an account deletes its rows (on delete cascade).
--
-- UNTIL THIS IS APPLIED: the server answers 503 for net worth with Plus and grants nothing; nothing is read while
-- PLUS_ENABLED is unset. Needs 0030 and 0031. Run in the Supabase SQL editor. Additive and safe to run twice.
-- -----------------------------------------------------------------------------

create table if not exists public.net_worth_entries (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users(id) on delete cascade,
  kind        text        not null check (kind in ('home', 'car', 'pension')),
  label       text        not null default '' check (char_length(label) <= 60),
  value_cents bigint      not null check (value_cents >= 0),
  currency    text        not null check (currency in ('CAD', 'USD')),
  shared      boolean     not null default false,
  entered_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists net_worth_entries_user on public.net_worth_entries (user_id);
alter table public.net_worth_entries enable row level security;
-- grants: service_role only
revoke all on table public.net_worth_entries from anon, authenticated;
grant all privileges on table public.net_worth_entries to service_role;

create table if not exists public.net_worth_shares (
  user_id    uuid        not null references auth.users(id) on delete cascade,
  account_id text        not null check (char_length(account_id) between 1 and 200),
  shared     boolean     not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, account_id)
);
alter table public.net_worth_shares enable row level security;
-- grants: service_role only
revoke all on table public.net_worth_shares from anon, authenticated;
grant all privileges on table public.net_worth_shares to service_role;

-- ============================================================================
-- READ-ONLY CHECK (after running): both tables exist with RLS on, the Data API roles reach neither, both empty.
--   select (select relrowsecurity from pg_class where oid = 'public.net_worth_entries'::regclass),
--          (select relrowsecurity from pg_class where oid = 'public.net_worth_shares'::regclass),
--          has_table_privilege('authenticated', 'public.net_worth_entries', 'select'),
--          has_table_privilege('anon', 'public.net_worth_shares', 'select'),
--          (select count(*) from public.net_worth_entries) + (select count(*) from public.net_worth_shares);
-- Expected: true, true, false, false, 0.
-- ============================================================================
-- ROLLBACK (only while PLUS_ENABLED is unset; nothing else depends on them):
-- drop table if exists public.net_worth_shares;
-- drop table if exists public.net_worth_entries;
-- ============================================================================
