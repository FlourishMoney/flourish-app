-- ============================================================================
-- Flourish Money - waitlist consent record and unsubscribe (CASL)
-- ============================================================================
-- Run in the Supabase SQL editor (Dashboard > SQL > New query > Run).
-- ADDITIVE. Idempotent, safe to run twice: every column is "add column if not
-- exists", the backfill only touches rows whose consent_version is still null,
-- and the grant and row level security statements are no-ops when already true.
--
-- APPLY THIS BEFORE THE CODE THAT USES IT IS DEPLOYED. join_waitlist writes
-- consent_version and consented_at on every signup, and the sweep filters on
-- unsubscribed_at; without these columns PostgREST refuses both.
--
--   consent_version  the version of the consent wording the form showed at
--                    signup (netlify/functions/_lib/waitlistConsent.js). Rows
--                    from before the consent line existed get 'pre-2026-10-01'.
--   consented_at     when that consent was given (server time at signup).
--                    Null for the pre-2026-10-01 rows: there is no consent event
--                    to date, so none is invented.
--   unsubscribed_at  set once by the signed one-click unsubscribe link
--                    (netlify/functions/unsubscribe.js). A row with this set is
--                    never emailed again.
-- ============================================================================

alter table public.waitlist
  add column if not exists consent_version text,
  add column if not exists consented_at    timestamptz,
  add column if not exists unsubscribed_at timestamptz;

-- Rows that joined before the consent line existed. Only nulls are touched, so
-- a second run, or a run after new signups, changes nothing that is already set.
update public.waitlist
   set consent_version = 'pre-2026-10-01'
 where consent_version is null;

-- The sweep reads rows still to be welcomed; unsubscribed rows are excluded.
create index if not exists waitlist_pending_subscribed_idx
  on public.waitlist (created_at)
  where welcomed_at is null and unsubscribed_at is null;

-- Grants. public.waitlist is read and written only by server functions using the
-- service role (beta.js, waitlist-sweep.js, unsubscribe.js). Nobody signed in or
-- anonymous has any business with it: RLS stays on with no policies, and
-- nothing is granted to anon or authenticated. docs/ops/SUPABASE-GRANTS.md.
-- grants: service_role only
alter table public.waitlist enable row level security;
grant all privileges on table public.waitlist to service_role;

-- ============================================================================
-- CHECK (counts only, no rows or addresses returned)
-- ============================================================================
-- select count(*)                                              as rows_total,
--        count(*) filter (where consent_version = 'pre-2026-10-01') as legacy_rows,
--        count(*) filter (where consent_version is null)         as missing_version,
--        count(unsubscribed_at)                                   as unsubscribed
--   from public.waitlist;
-- WANT: missing_version = 0.

-- ============================================================================
-- ROLLBACK (only to undo; drops the columns and their values, including the
-- consent record, so export it first if any row has consented_at set)
-- ============================================================================
-- drop index if exists public.waitlist_pending_subscribed_idx;
-- alter table public.waitlist
--   drop column if exists unsubscribed_at,
--   drop column if exists consented_at,
--   drop column if exists consent_version;
