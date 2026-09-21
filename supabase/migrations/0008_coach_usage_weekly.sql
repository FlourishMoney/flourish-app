-- ============================================================================
-- Flourish Money - the free coach limit is 2 a week, so it needs a weekly counter
-- ============================================================================
-- Decision 2 (DECISIONS.md): free coaching after the trial is 2 messages per
-- week, resetting weekly. src/lib/usageLimits.js has always said that; the
-- server enforced 1 a DAY (FREE_CHAT_DAILY) behind ENFORCE_PLAN_LIMITS. The
-- server is the authority, so the server has to be able to count a week.
--
-- NUMBERED 0008, NOT 0007. The Wednesday prompt calls this one 0007; that
-- number went to 0007_trial_only_signups.sql, because the prompt's 0006 was
-- already taken by the waitlist migration that is live in production.
--
-- ADDITIVE, AND IT TOUCHES NOTHING THAT EXISTS. The day-keyed coach_usage table
-- and its increment_coach_usage function are NOT altered, NOT dropped, and not
-- read by anything here. They keep serving CHAT_DAILY_CEILING, the abuse
-- ceiling, exactly as before. This file adds a second, weekly counter beside
-- them. That is deliberate: coach_usage was created in the dashboard and has no
-- migration in this repo, so its exact shape cannot be read from source, and
-- rewriting a function whose body I cannot see is how a working limiter breaks.
--
-- THE WEEK BOUNDARY. date_trunc('week', ...) in Postgres is the ISO week, which
-- starts Monday, and the timestamp is taken in UTC. That is the same boundary
-- usageLimits._weekKey() uses on the client (most recent Monday 00:00 UTC), so
-- the counter the server enforces and the count the client shows roll over at
-- the same moment. Verified against the client helper on the local database
-- across a year of dates.
--
-- Run in the Supabase SQL editor. Idempotent, safe to re-run.
-- ============================================================================

create table if not exists public.coach_usage_weekly (
  user_id    uuid        not null references auth.users(id) on delete cascade,
  week_start date        not null,
  used       integer     not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, week_start)
);

-- Service role only. Every caller is a Netlify function using the secret key,
-- which bypasses RLS; a browser must never be able to read or, worse, write its
-- own usage count. No policies on purpose.
alter table public.coach_usage_weekly enable row level security;

-- Counts one message and returns the new total for this user's current week.
-- security definer so the service role's call runs with the owner's rights, and
-- search_path is pinned, matching the other functions in this schema.
create or replace function public.increment_coach_usage_weekly(p_user uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare
  wk date    := date_trunc('week', (now() at time zone 'utc'))::date;
  n  integer;
begin
  insert into public.coach_usage_weekly (user_id, week_start, used, updated_at)
  values (p_user, wk, 1, now())
  on conflict (user_id, week_start)
  do update set used = public.coach_usage_weekly.used + 1, updated_at = now()
  returning used into n;
  return n;
end; $$;

-- Nobody but the server calls this. Revoking from anon/authenticated means a
-- browser holding a user JWT cannot run up its own counter, or read it.
revoke all on function public.increment_coach_usage_weekly(uuid) from public;
revoke all on function public.increment_coach_usage_weekly(uuid) from anon;
revoke all on function public.increment_coach_usage_weekly(uuid) from authenticated;
grant execute on function public.increment_coach_usage_weekly(uuid) to service_role;

-- Account deletion: rows go with the user through the cascade above, so
-- delete_account in netlify/functions/plaid.js needs no change. It still deletes
-- coach_usage rows explicitly, which is also fine.

-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- Safe to run: the day-keyed counter is untouched, so dropping these returns
-- enforcement to whatever the code asks of increment_coach_usage.
--
-- drop function if exists public.increment_coach_usage_weekly(uuid);
-- drop table if exists public.coach_usage_weekly;

-- ============================================================================
-- VERIFICATION (counts only; no user_id, no email, no row listed)
-- ============================================================================
-- select count(*)                                   as rows_this_week,
--        count(*) filter (where used > 2)           as over_the_free_limit,
--        max(used)                                  as highest_count,
--        min(week_start)                            as earliest_week
--   from public.coach_usage_weekly
--  where week_start = date_trunc('week', (now() at time zone 'utc'))::date;
--
-- And that the week boundary is the Monday you expect:
-- select date_trunc('week', (now() at time zone 'utc'))::date as week_start_utc;
-- ============================================================================
