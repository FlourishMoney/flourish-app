-- ============================================================================
-- Flourish Money - a daily count of What-If explanations, so the server can
-- hold the free plan to 1 a day
-- ============================================================================
-- Founder's decision, 2026-10-20: the store apps follow the web's rules (a
-- 14-day trial, then the free plan's limits), and the server enforces them on
-- every call that costs money, so that store installs from before that date are
-- held to them whatever their own code says.
--
-- The What-If explanation (coach.js type "simulator") had no server count at
-- all. The free plan includes 1 a day (src/lib/usageLimits.js
-- FREE_TIER_LIMITS.simulationsPerDay), so the server needs a day counter.
-- coach.js asks it only for accounts the free limit applies to (no trial, no
-- paid plan, no founder flag), and only while ENFORCE_PLAN_LIMITS is on.
--
-- UNTIL THIS IS APPLIED, free accounts fail closed: coach.js cannot count, so
-- it refuses a free account's What-If explanation, and the app shows the
-- What-If figures with its own explanation instead of the coach's (that is
-- what it does for any error from that call). Trials, paid plans and founders
-- are never counted, so they are unaffected either way.
--
-- THE DAY BOUNDARY is 00:00 UTC, the same one usageLimits._todayStr() uses, so
-- the count the server enforces and the count the app shows roll over together.
--
-- ADDITIVE. It touches no existing table or function. `kind` lets another
-- daily count share the table later without a second migration; today the
-- only kind is 'simulator'.
--
-- Run in the Supabase SQL editor. Idempotent, safe to re-run.
-- ============================================================================

create table if not exists public.ai_usage_daily (
  user_id    uuid        not null references auth.users(id) on delete cascade,
  day        date        not null,
  kind       text        not null check (kind in ('simulator')),
  used       integer     not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, day, kind)
);

-- Service role only, as for coach_usage_weekly (0008): a browser must never
-- read or write its own count. No policies on purpose, and no grant to anon
-- or authenticated (docs/ops/SUPABASE-GRANTS.md).
alter table public.ai_usage_daily enable row level security;
-- grants: service_role only
grant all privileges on table public.ai_usage_daily to service_role;
revoke all on table public.ai_usage_daily from anon, authenticated;

-- Counts one call and returns the new total for this user, kind and UTC day.
create or replace function public.increment_ai_usage_daily(p_user uuid, p_kind text)
returns integer language plpgsql security definer set search_path = public as $$
declare
  d date    := (now() at time zone 'utc')::date;
  n integer;
begin
  insert into public.ai_usage_daily (user_id, day, kind, used, updated_at)
  values (p_user, d, p_kind, 1, now())
  on conflict (user_id, day, kind)
  do update set used = public.ai_usage_daily.used + 1, updated_at = now()
  returning used into n;
  return n;
end; $$;

revoke all on function public.increment_ai_usage_daily(uuid, text) from public;
revoke all on function public.increment_ai_usage_daily(uuid, text) from anon;
revoke all on function public.increment_ai_usage_daily(uuid, text) from authenticated;
grant execute on function public.increment_ai_usage_daily(uuid, text) to service_role;

-- Account deletion: rows go with the user through the cascade above.

-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- Dropping these puts free accounts back where they were before this file ran:
-- coach.js cannot count, so their What-If explanation is refused (fail closed).
-- To stop counting altogether, revert the coach.js change as well.
--
-- drop function if exists public.increment_ai_usage_daily(uuid, text);
-- drop table if exists public.ai_usage_daily;

-- ============================================================================
-- VERIFICATION (counts only; no user_id, no email, no row listed)
-- ============================================================================
-- select to_regclass('public.ai_usage_daily') is not null                     as table_exists,
--        to_regprocedure('public.increment_ai_usage_daily(uuid,text)') is not null as function_exists,
--        has_function_privilege('authenticated', 'public.increment_ai_usage_daily(uuid,text)', 'execute')
--                                                                             as browser_can_call;  -- expect: true, true, false
--
-- select kind, count(*) as rows_today, count(*) filter (where used > 1) as asked_more_than_once, max(used) as highest
--   from public.ai_usage_daily
--  where day = (now() at time zone 'utc')::date
--  group by kind;   -- a refused call is counted too, so used > 1 means asked again, not served again
