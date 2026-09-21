-- ============================================================================
-- Flourish Money - new signups get the trial only, and trials get an end date
-- ============================================================================
-- Decision P13 (2026-09-14): from September 16, a new account gets the 14-day
-- trial and nothing else. The permanent founder grant stops for new signups.
-- The server profile is the authority on plan.
-- Decision P18: no founding trial ends before billing has taken one real
-- payment plus 48 hours, so trial_ends_at is set at signup and extended by one
-- tested UPDATE (below) if billing is late.
--
-- NUMBERED 0007, NOT 0006. The Wednesday prompt says 0006; that number was
-- taken by 0006_waitlist_welcomed_at.sql, which is already applied in
-- production. Same for the prompt's "migration 0007" in its item 4, which is
-- 0008_coach_usage_weekly.sql here.
--
-- WHAT CHANGES: the handle_new_user trigger function, and one added column.
-- WHAT DOES NOT: every existing row. No UPDATE runs here. Anyone who already
-- has founder_flag = true keeps it, and keeps it through the rollback too.
--
-- Run in the Supabase SQL editor. Idempotent, safe to re-run.
-- ============================================================================

-- 1. trial_ends_at -----------------------------------------------------------
-- Nullable on purpose. Existing rows keep NULL, and both readers fall back to
-- trial_started_at + 14 days when it is NULL, so nothing about an existing
-- trial moves. Only rows created from now on carry an explicit end.
alter table public.profiles
  add column if not exists trial_ends_at timestamptz;

-- 2. handle_new_user ---------------------------------------------------------
-- Was (0003): plan 'trial', trial_started_at now(), founder_flag = now() <
-- 2027-01-01, i.e. true for every signup. Now: the trial, an explicit end, and
-- founder_flag false. The founder cutoff is gone rather than moved, because a
-- date that grants a permanent entitlement by default is the thing being fixed.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (user_id, plan, trial_started_at, trial_ends_at, founder_flag)
  values (new.id, 'trial', now(), now() + interval '14 days', false)
  on conflict (user_id) do nothing;
  return new;
end; $$;

-- 3. Guard trial_ends_at -----------------------------------------------------
-- WITHOUT THIS, THE NEW COLUMN IS A BYPASS. profiles_update_own (0001) lets a
-- signed-in browser update its OWN row, and profiles_guard_privileged (0002,
-- extended in 0005) only blocks plan, founder_flag, trial_started_at and the two
-- AI-consent columns. trial_ends_at now decides whether a trial is unlimited, so
-- a user could set it to 2030 from devtools and never lose the trial. It joins
-- the guarded list; the service role (Netlify functions) still writes it freely.
--
-- This is 0005's function with one line added, so re-running 0005 afterwards
-- would silently drop the new line. If that ever happens, re-run this file.
create or replace function public.profiles_guard_privileged()
returns trigger language plpgsql as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role'
     and ( new.plan                              is distinct from old.plan
        or new.founder_flag                      is distinct from old.founder_flag
        or new.trial_started_at                  is distinct from old.trial_started_at
        or new.trial_ends_at                     is distinct from old.trial_ends_at
        or new.ai_third_party_consent_at         is distinct from old.ai_third_party_consent_at
        or new.ai_third_party_consent_revoked_at is distinct from old.ai_third_party_consent_revoked_at ) then
    raise exception 'plan / founder_flag / trial dates / ai consent are server-managed';
  end if;
  return new;
end; $$;

-- ============================================================================
-- EXTENDING THE COHORT'S TRIALS (decision P18)
-- ============================================================================
-- If billing is late, extend every unexpired trial by one statement. It touches
-- only rows that are still on trial, never a founder, a paid plan or an already
-- expired trial. Tested on the local practice database with three rows: the one
-- unexpired trial moved 14 days (2026-10-05 to 2026-10-19); the expired trial
-- and the founder were untouched.
--
-- The set_config line is REQUIRED: the SQL editor is not the service role, and
-- the guard above rejects a trial_ends_at write without it. Run the whole block
-- below in one go, begin through commit.
--
-- begin;
-- select set_config('request.jwt.claims', '{"role":"service_role"}', true);
-- update public.profiles
--    set trial_ends_at = coalesce(trial_ends_at, trial_started_at + interval '14 days')
--                        + interval '14 days'
--  where plan = 'trial'
--    and founder_flag = false
--    and coalesce(trial_ends_at, trial_started_at + interval '14 days') > now();
-- commit;
--
-- Change both '14 days' to the extension you want. Run the counts query below
-- before and after; the plan/founder counts must be identical, since this moves
-- a date and nothing else.
-- ============================================================================

-- ============================================================================
-- ROLLBACK (restores 0003's founder-granting function; the column stays)
-- ============================================================================
-- Dropping trial_ends_at is NOT part of the rollback: readers treat NULL as
-- "fall back to trial_started_at + 14 days", so leaving the column costs
-- nothing, while dropping it would throw away any extension already granted.
--
-- create or replace function public.handle_new_user()
-- returns trigger language plpgsql security definer set search_path = public as $$
-- declare
--   founder_cutoff timestamptz := '2027-01-01T00:00:00Z'::timestamptz;
-- begin
--   insert into public.profiles (user_id, plan, trial_started_at, founder_flag)
--   values (new.id, 'trial', now(), now() < founder_cutoff)
--   on conflict (user_id) do nothing;
--   return new;
-- end; $$;
--
-- If the column really must go as well:
-- alter table public.profiles drop column if exists trial_ends_at;
-- ============================================================================

-- ============================================================================
-- VERIFICATION (counts only; no user_id, no email, no row listed)
-- ============================================================================
-- Run before and after. Every existing row must keep its plan and its
-- founder_flag: the only difference after this migration is that rows created
-- LATER arrive as trial / founder_flag false with a trial_ends_at.
--
-- select plan,
--        founder_flag,
--        count(*)                                          as profiles,
--        count(trial_ends_at)                              as with_trial_ends_at,
--        count(*) filter (where trial_started_at is null)  as no_trial_start
--   from public.profiles
--  group by plan, founder_flag
--  order by plan, founder_flag;
--
-- And to confirm the trigger function itself now grants no founder:
--
-- select pg_get_functiondef('public.handle_new_user()'::regprocedure) like '%founder_flag%'
--          as mentions_founder_flag,
--        pg_get_functiondef('public.handle_new_user()'::regprocedure) like '%2027-01-01%'
--          as still_has_cutoff;   -- expect: true, false
-- ============================================================================
