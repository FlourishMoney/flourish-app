-- 0048_signup_hook.sql
-- -----------------------------------------------------------------------------
-- ONLY APPLE AND GOOGLE MAY CREATE AN ACCOUNT THROUGH SUPABASE AUTH ITSELF (1.1.7, 2026-11-12). NOT APPLIED.
--
-- Sign in with Apple and Google needs Supabase's "Allow new users to sign up" on: with it off, Supabase refuses to make
-- the account for a new Apple or Google user ("Signups not allowed for this instance"), in the website's redirect and in
-- the iPhone's own Apple sheet alike. But with it on, and "Confirm email" off as it is, anyone holding the app's public
-- key could also call Supabase's own email sign-up directly and get a working account, past our server's gate (the
-- rate limit, OPEN_SIGNUP, SIGNUP_INSTANT, the counts and the test-address rule in netlify/functions/beta.js).
--
-- This is Supabase's "Before User Created" hook: it runs before Supabase Auth creates a user from a sign-up, an OAuth
-- sign-in or an identity token, and refuses every one that is not Apple or Google. Our own server creates email accounts
-- with the admin API (auth.admin.createUser), which this hook never sees, so that path is unchanged.
--
-- IN THIS ORDER, IN THE SUPABASE DASHBOARD (docs/ops/SOCIAL-SIGNIN-SETUP.md, step G4):
--   1. run this file in the SQL editor;
--   2. Authentication > Auth Hooks > Before User Created > Postgres > public.flourish_before_user_created > Enable;
--   3. only then Authentication > Sign In / Providers > "Allow new users to sign up" on.
-- Turned on the other way round, the door stands open for the minutes in between.
--
-- Needs nothing else. Safe to run twice. Touches no table and no row.
-- grants: execute to supabase_auth_admin only
-- -----------------------------------------------------------------------------

create or replace function public.flourish_before_user_created(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  provider text := coalesce(event -> 'user' -> 'app_metadata' ->> 'provider', '');
  anonymous boolean := coalesce((event -> 'user' ->> 'is_anonymous')::boolean, false);
begin
  if provider in ('apple', 'google') and not anonymous then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object('error', jsonb_build_object(
    'http_code', 403,
    'message', 'Create your account in the flourish app or at flourishmoney.app.'));
end;
$$;

revoke execute on function public.flourish_before_user_created(jsonb) from public;
do $$ begin
  -- Supabase always has these roles; a bare Postgres (the test suites that apply every migration) may not.
  if exists (select 1 from pg_roles where rolname = 'anon') then revoke execute on function public.flourish_before_user_created(jsonb) from anon; end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then revoke execute on function public.flourish_before_user_created(jsonb) from authenticated; end if;
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then grant execute on function public.flourish_before_user_created(jsonb) to supabase_auth_admin; end if;
end $$;
