-- ============================================================================
-- Flourish Money - no free plan: 30 days for accounts already past their trial
-- ============================================================================
-- Founder's decision, 2026-10-23: "Yes, drop the free plan. 14 days free, then
-- Plus." From the deploy that ships it, an account whose trial has ended, or
-- whose subscription has lapsed, has no plan and the paid features stop
-- (netlify/functions/_lib/planGate.js). Accounts ALREADY past their trial on
-- the free plan when it goes live get every feature for 30 days from go-live
-- first, then the paywall.
--
-- WHAT THIS DOES
--   1. profiles.grace_ends_at (nullable): the end of that account's 30 days.
--      The server reads it (_lib/planRules.js: unexpired, it counts as a plan);
--      so does the app, for the small notice during the 30 days.
--   2. The profile guard learns the new column, so a signed-in browser cannot
--      give itself more days. Only the service role writes it.
--   3. Go-live is recorded once, in public.no_free_plan_go_live, the first time
--      this file runs. Every account that was past its trial AT THAT MOMENT, with
--      no paid plan, gets grace_ends_at = go-live + 30 days.
--
-- WHO GETS THE 30 DAYS, all of: founder_flag false; plan 'free' or 'trial'
-- (never plus or pro); a trial that had ended at go-live (trial_ends_at, or
-- trial_started_at + 14 days, at or before go-live, or no trial dates at all);
-- no paid subscription at go-live (active or trialing, period not over), from
-- any provider. An account whose subscription lapsed before go-live is in; one
-- still in its trial at go-live is not (its trial ends into the paywall, the
-- new rule for every new account).
--
-- RUN IT AT GO-LIVE, in the same window as the deploy that removes the free
-- plan. Go-live is the moment this file first runs, not the deploy, so:
--   run N days early, and those accounts' 30 days are N days shorter in use;
--   a trial that ends between this run and the deploy gets no 30 days;
--   run late, and accounts past their trial are refused until it runs.
-- Run before the deploy, it changes nothing anyone sees (the code that reads
-- the column is not live yet).
--
-- SAFE TO RE-RUN. Go-live is the time recorded on the first run, so a second
-- run gives nobody new days and moves no end date: an account whose trial
-- ends after go-live never qualifies. Only a row whose grace_ends_at is still
-- empty is written.
--
-- THE PROFILE GUARD (0002, 0005, 0007) lets only the service role change the
-- privileged columns, and the SQL editor is not the service role. As in 0023,
-- one setting local to this transaction makes it so. Run the whole file in one
-- go; it is a single transaction.
--
-- RUN THE DRY RUN AT THE BOTTOM FIRST. It changes nothing and gives the count.
-- ============================================================================

begin;

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
-- 30 days must be 30 x 24 hours, whatever zone the session is in.
set local timezone = 'UTC';

-- 1. The column ----------------------------------------------------------------
alter table public.profiles
  add column if not exists grace_ends_at timestamptz;

-- 2. The guard -----------------------------------------------------------------
-- This is 0007's function with one line added (grace_ends_at), so re-running 0007
-- afterwards would silently drop that line. If that ever happens, re-run this file.
create or replace function public.profiles_guard_privileged()
returns trigger language plpgsql as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role'
     and ( new.plan                              is distinct from old.plan
        or new.founder_flag                      is distinct from old.founder_flag
        or new.trial_started_at                  is distinct from old.trial_started_at
        or new.trial_ends_at                     is distinct from old.trial_ends_at
        or new.grace_ends_at                     is distinct from old.grace_ends_at
        or new.ai_third_party_consent_at         is distinct from old.ai_third_party_consent_at
        or new.ai_third_party_consent_revoked_at is distinct from old.ai_third_party_consent_revoked_at ) then
    raise exception 'plan / founder_flag / trial dates / grace / ai consent are server-managed';
  end if;
  return new;
end; $$;

-- 3. Go-live, recorded once ------------------------------------------------------
create table if not exists public.no_free_plan_go_live (
  id         boolean     primary key default true check (id),
  go_live_at timestamptz not null default now()
);
-- Service role only.
alter table public.no_free_plan_go_live enable row level security;
-- grants: service_role only
grant all privileges on table public.no_free_plan_go_live to service_role;
revoke all on table public.no_free_plan_go_live from anon, authenticated;
insert into public.no_free_plan_go_live (id) values (true) on conflict (id) do nothing;

-- 4. The 30 days -----------------------------------------------------------------
do $$
declare
  has_subs boolean := to_regclass('public.subscriptions') is not null;
  live timestamptz := (select go_live_at from public.no_free_plan_go_live);
  n integer;
begin
  execute format($q$
    update public.profiles p
       set grace_ends_at = $1 + interval '30 days'
     where p.grace_ends_at is null
       and p.founder_flag = false
       and p.plan in ('free', 'trial')
       and (p.plan = 'free'
            or coalesce(p.trial_ends_at, p.trial_started_at + interval '14 days') is null
            or coalesce(p.trial_ends_at, p.trial_started_at + interval '14 days') <= $1)
       %s
  $q$,
    case when has_subs then
      $s$and not exists (select 1 from public.subscriptions s where s.user_id = p.user_id
                          and s.status in ('active', 'trialing')
                          and (s.current_period_end is null or s.current_period_end > $1))$s$
    else '' end)
  using live;
  get diagnostics n = row_count;
  raise notice 'no free plan: % accounts get 30 days, to % (subscriptions read: %)', n, live + interval '30 days', has_subs;
end $$;

commit;

-- ============================================================================
-- DRY RUN (run first, before the first run; changes nothing; one count, no
-- user_id, no email. It counts as of now(), so after the first run it is not
-- the migration's own count: that is the notice the first run raised.)
-- ============================================================================
-- select count(*) as get_30_days
--   from public.profiles p
--  where p.founder_flag = false and p.plan in ('free', 'trial')
--    and (p.plan = 'free'
--         or coalesce(p.trial_ends_at, p.trial_started_at + interval '14 days') is null
--         or coalesce(p.trial_ends_at, p.trial_started_at + interval '14 days') <= now())
--    and not exists (select 1 from public.subscriptions s where s.user_id = p.user_id
--                     and s.status in ('active', 'trialing')
--                     and (s.current_period_end is null or s.current_period_end > now()));

-- ============================================================================
-- CHECK AFTERWARDS (read-only; counts only):
-- ============================================================================
--   select count(*) filter (where grace_ends_at is not null) || '|' ||
--          count(*) filter (where grace_ends_at is not null and (founder_flag or plan in ('plus', 'pro')))
--     from public.profiles;
-- Expected: the dry run's count, then 0 (no founder or paid profile has an end date).

-- ============================================================================
-- ROLLBACK (empties every end date, then drops the go-live record; the guard
-- keeps its extra line, which is harmless while the column is empty):
-- ============================================================================
--   begin;
--   select set_config('request.jwt.claims', '{"role":"service_role"}', true);
--   update public.profiles set grace_ends_at = null where grace_ends_at is not null;
--   drop table public.no_free_plan_go_live;
--   commit;
-- Dropping the column is not part of the rollback: the server and the app read
-- an empty column, or a missing one, as "no 30 days".
