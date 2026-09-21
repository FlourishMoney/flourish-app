-- ============================================================================
-- Flourish Money - waitlist table
-- ============================================================================
-- THIS FILE IS A RECONSTRUCTION, not the original. public.waitlist was created
-- directly in the Supabase dashboard before this repo kept migrations, so there
-- was no file for it. Written 2026-09-21 so a LOCAL practice database can be
-- built from scratch with `supabase db reset`. It is numbered 0000 so it runs
-- before the rest; nothing else depends on it.
--
-- DO NOT RUN THIS AGAINST PRODUCTION. Production already has the table. Every
-- statement is guarded (if not exists), so it would be a no-op there, but the
-- table it describes was read from the column list the owner confirmed, not from
-- the live schema, so production remains the authority on anything that differs.
--
-- Columns, as confirmed by the owner on 2026-09-21:
--   id, email (unique), country, source, created_at, notified_at, metadata,
--   welcomed_at.
--
-- DEFAULTS ASSUMED (approved 2026-09-21, and the only part not read from
-- production):
--   id          default gen_random_uuid()   - a primary key has to come from
--                                             somewhere, and the app never sends one
--   created_at  not null default now()      - the sweep filters on it, so it must
--                                             always have a value
--   email       not null                    - the function rejects a blank address
--                                             before it ever inserts
--   metadata    default '{}'::jsonb         - the app always sends an object, and
--                                             an empty object reads better than null
--   country, source, notified_at, welcomed_at: nullable, no default. The app
--   writes country and source as null when it has none, and both timestamps are
--   null until something sets them.
--
-- RLS: enabled with NO policies, so only the service role reaches the table.
-- That is how the app uses it (netlify/functions/beta.js and waitlist-sweep.js
-- both use the secret key, which bypasses RLS) and it is the safer of the two
-- possible guesses: if production turns out to be more permissive, local is
-- merely stricter, and nothing the app does breaks.
--
-- SAFE TO RUN ANYWHERE. Every statement is guarded: create table if not exists,
-- create index if not exists, and enable row level security, which is a no-op
-- when RLS is already on. Against production this file changes nothing; the
-- table is already there, so the create is skipped whole, constraints and all.
-- ============================================================================

create table if not exists public.waitlist (
  id          uuid primary key default gen_random_uuid(),
  email       text not null unique,
  country     text,
  source      text,
  created_at  timestamptz not null default now(),
  notified_at timestamptz,
  metadata    jsonb default '{}'::jsonb,
  welcomed_at timestamptz
);

-- Migration 0006 adds welcomed_at with "add column if not exists". Because the
-- column is already in the create above, 0006 is a no-op locally; the end state
-- is the same either way.

alter table public.waitlist enable row level security;

-- The sweep's query is: welcomed_at is null and created_at < cutoff, oldest
-- first. Tiny table, so this is about matching the access pattern, not speed.
create index if not exists waitlist_pending_idx
  on public.waitlist (created_at)
  where welcomed_at is null;
