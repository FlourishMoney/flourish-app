-- ============================================================================
-- Flourish Money - the landing's own counts, by day, src and device (counts only)
-- ============================================================================
-- The trial-first landing (approved Oct 22). Four counts, by src and device:
--   landing_view     the landing was shown (once per browser session)
--   main_tap         "Try flourish free for 14 days" was tapped
--   account_created  a website signup created its account
--   founding_join    a founding list signup was stored
-- Our own code only (netlify/functions/_lib/landingCounts.js): no third-party
-- tracker. A row holds a day, a src from the fixed list, a device kind and a
-- number. No email, no IP, no user agent, no account id, no free text.
--
-- THE SOURCES are _lib/waitlistConsent.js WAITLIST_SRCS plus "direct", as in
-- 0018. THE DAY is Toronto time, as in 0018's report.
--
-- UNTIL THIS IS APPLIED, nothing is counted: bump_landing_count does not
-- exist, the function's call fails and is dropped, and every page, signup and
-- founding list join works exactly as before.
--
-- ADDITIVE. It touches no existing table or function. Run in the Supabase SQL
-- editor. Idempotent, safe to re-run.
-- ============================================================================

create table if not exists public.landing_counts (
  day        date        not null,
  src        text        not null check (src in ('direct','ig','fb','tt','calendar','clawback','email','press','meta_a','meta_b')),
  device     text        not null check (device in ('phone','tablet','desktop')),
  event      text        not null check (event in ('landing_view','main_tap','account_created','founding_join')),
  n          integer     not null default 0,
  updated_at timestamptz not null default now(),
  primary key (day, src, device, event)
);

-- Service role only: a browser never reads or writes a count. No policies on
-- purpose, and no grant to anon or authenticated (docs/ops/SUPABASE-GRANTS.md).
alter table public.landing_counts enable row level security;
-- grants: service_role only
grant all privileges on table public.landing_counts to service_role;
revoke all on table public.landing_counts from anon, authenticated;

-- Adds one to today's (Toronto) count for this event, src and device.
create or replace function public.bump_landing_count(p_event text, p_src text, p_device text)
returns integer language plpgsql security definer set search_path = public as $$
declare
  d date := (now() at time zone 'America/Toronto')::date;
  c integer;
begin
  insert into public.landing_counts (day, src, device, event, n, updated_at)
  values (d, p_src, p_device, p_event, 1, now())
  on conflict (day, src, device, event)
  do update set n = public.landing_counts.n + 1, updated_at = now()
  returning n into c;
  return c;
end; $$;

revoke all on function public.bump_landing_count(text, text, text) from public;
revoke all on function public.bump_landing_count(text, text, text) from anon;
revoke all on function public.bump_landing_count(text, text, text) from authenticated;
grant execute on function public.bump_landing_count(text, text, text) to service_role;

-- THE SOURCE REPORT'S NEW LINES (beside 0018's waitlist_signup_counts): one
-- count-only line per day, source, device and event, zeros left out.
--   select * from public.landing_source_counts('2026-10-22', '2026-10-31');
create or replace function public.landing_source_counts(p_from date, p_to date)
returns table (day date, source text, device text, event text, count integer)
language sql
stable
security invoker
set search_path = public
as $$
  select c.day, c.src, c.device, c.event, c.n
  from public.landing_counts c
  where c.day between p_from and p_to
  order by c.day, c.src, c.device,
    array_position(array['landing_view','main_tap','account_created','founding_join'], c.event);
$$;

revoke all on function public.landing_source_counts(date, date) from public, anon, authenticated;
grant execute on function public.landing_source_counts(date, date) to service_role;

-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- Dropping these stops the counting; nothing else depends on them.
--
-- drop function if exists public.landing_source_counts(date, date);
-- drop function if exists public.bump_landing_count(text, text, text);
-- drop table if exists public.landing_counts;
