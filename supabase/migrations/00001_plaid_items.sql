-- ============================================================================
-- Flourish Money - plaid_items table
-- ============================================================================
-- THIS FILE IS A RECONSTRUCTION, and a weaker one than 00000_waitlist.sql.
-- public.plaid_items was created directly in the Supabase dashboard, like the
-- waitlist table, so no migration describes it. Without it, migration 0004
-- (which does "alter table public.plaid_items add column next_cursor") cannot
-- run, so a local database cannot be built from this repo at all.
--
-- DO NOT RUN THIS AGAINST PRODUCTION. Production already has the table, and
-- PRODUCTION IS THE AUTHORITY on anything here that differs.
--
-- WHERE EACH COLUMN COMES FROM. Unlike the waitlist table, nobody confirmed
-- this shape: every column below is read off the app's own queries.
--   user_id, item_id, access_token, institution_id, institution_name, status
--                       netlify/functions/plaid.js:199-208, the exchange_token
--                       upsert, with onConflict "user_id,item_id"
--   id, created_at, updated_at
--                       plaid.js:481, the list_items select
--   next_cursor         plaid.js:844 and migration 0004 (NOT created here, so
--                       0004 still does its job)
--   last_error, new_accounts_available
--                       netlify/functions/plaid-webhook.js:120-145, the webhook
--                       status updates
--   status values       "active", "pending_expiration", "error", "revoked",
--                       from that same webhook switch and plaid.js:188
--
-- INFERRED, NOT OBSERVED, and the parts most likely to be wrong:
--   - types: every text column is typed text, because the code never reveals a
--     length or a check constraint;
--   - user_id references auth.users(id) on delete cascade, mirroring
--     public.profiles in 0001;
--   - unique (user_id, item_id), which the upsert's onConflict requires;
--   - defaults on id, created_at, updated_at, status and
--     new_accounts_available;
--   - RLS enabled with no policies: every access in the code goes through the
--     service role, which bypasses RLS.
--   - there is no updated_at trigger here. If production has one, a local row's
--     updated_at will not move on its own.
--
-- SAFE TO RUN ANYWHERE. Every statement is guarded: create table if not exists,
-- create index if not exists, and enable row level security, which is a no-op
-- when RLS is already on. Against production this file changes nothing; the
-- table is already there, so the create is skipped whole, constraints and all.
--
-- TO CONFIRM THIS RECONSTRUCTION, run this in the production SQL editor. It is
-- read-only, returns no row data, and names no user:
--
-- select c.column_name,
--        c.data_type,
--        c.is_nullable,
--        c.column_default
--   from information_schema.columns c
--  where c.table_schema = 'public'
--    and c.table_name   = 'plaid_items'
--  order by c.ordinal_position;
--
-- and, for the constraints and indexes this file also guesses at:
--
-- select con.conname as name, pg_get_constraintdef(con.oid) as definition
--   from pg_constraint con
--  where con.conrelid = 'public.plaid_items'::regclass
--  union all
-- select cls.relname, pg_get_indexdef(idx.indexrelid)
--   from pg_index idx
--   join pg_class cls on cls.oid = idx.indexrelid
--  where idx.indrelid = 'public.plaid_items'::regclass;
--
-- Anything those two queries show that differs from below is production being
-- right and this file being wrong.
-- ============================================================================

create table if not exists public.plaid_items (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references auth.users(id) on delete cascade,
  item_id                text not null,
  access_token           text not null,
  institution_id         text,
  institution_name       text,
  status                 text not null default 'active',
  last_error             text,
  new_accounts_available boolean not null default false,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (user_id, item_id)
);

alter table public.plaid_items enable row level security;

-- The list_items query is: rows for one user, oldest first.
create index if not exists plaid_items_user_created_idx
  on public.plaid_items (user_id, created_at);
