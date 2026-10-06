-- 0015_waitlist_founding_grants.sql
-- -----------------------------------------------------------------------------
-- Explicit grants for 0014_waitlist_founding.sql's two columns and two functions. Run after 0014.
--
-- public.waitlist is read and written only by our Netlify functions with the service role (RLS on, no
-- policy). The new columns keep that: the service role reads both (the spots-left count, the welcome
-- email's position line) and may mark a test row. founding_position is written only by the trigger and
-- by waitlist_founding_start().
--
-- anon and authenticated: REVOKED on the whole table. Supabase's default grants give both every
-- privilege on a public table, and a column-level revoke does nothing while a table-level grant stands
-- (checked against the Supabase Postgres 17.6.1.167 image: after a column revoke, anon still had SELECT
-- on founding_position). RLS with no policy already returns them no rows, and nothing in src/ reads
-- this table, so this removes access they never used.
-- docs/ops/SUPABASE-GRANTS.md.
-- grants: service_role only
-- -----------------------------------------------------------------------------

alter table public.waitlist enable row level security;
revoke all on table public.waitlist from anon, authenticated;
grant all privileges on table public.waitlist to service_role;
grant select (is_test, founding_position) on table public.waitlist to service_role;
grant update (is_test) on table public.waitlist to service_role;

-- Functions are executable by PUBLIC by default; that default is revoked from both. The trigger function
-- runs as the trigger on the service role's insert, so the service role keeps execute on it (a function
-- returning trigger cannot be called through the Data API). waitlist_founding_start() is run once by the
-- owner in the SQL editor (step 4 of 0014), so no Data API role may execute it.
revoke all on function public.waitlist_assign_founding_position() from public, anon, authenticated;
grant execute on function public.waitlist_assign_founding_position() to service_role;
revoke all on function public.waitlist_founding_start() from public, anon, authenticated, service_role;
