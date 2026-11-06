-- 0036_source_funnel.sql
-- -----------------------------------------------------------------------------
-- THE FUNNEL BY SOURCE AND CREATIVE (2026-11-04). NOT APPLIED.
--
-- For the Tuesday review: landing visit, store click, install, account created, activated household, by src and cr.
--   attribution_counts    a day, a src, a cr, a platform, an event and a number: landing_visit and store_click from
--                         /get, install from the Android app's first launch. No IP, no user agent, no account id.
--   account_attribution   one row per new account: its src, cr, platform, and when it activated (the metric dictionary's
--                         activation: the first number within 24 hours of signup). Goes with the account when it is deleted.
--
-- UNTIL THIS IS APPLIED: /get still sends everyone to the right store and signups work as normal. Only these counts are lost.
-- App Store installs are not here: Apple reports them by campaign token in App Store Connect, and tells the app nothing.
--
-- Run in the Supabase SQL editor. Additive and safe to run twice.
-- -----------------------------------------------------------------------------

create table if not exists public.attribution_counts (
  day        date        not null,
  src        text        not null check (src ~ '^[a-z0-9_-]{1,40}$'),
  cr         text        not null check (cr ~ '^[a-z0-9_-]{1,40}$'),
  platform   text        not null check (platform in ('ios','android','other')),
  event      text        not null check (event in ('landing_visit','store_click','install')),
  n          integer     not null default 0,
  updated_at timestamptz not null default now(),
  primary key (day, src, cr, platform, event)
);
alter table public.attribution_counts enable row level security;
-- grants: service_role only
grant all privileges on table public.attribution_counts to service_role;
revoke all on table public.attribution_counts from anon, authenticated;

create table if not exists public.account_attribution (
  user_id      uuid        primary key references auth.users(id) on delete cascade,
  src          text        not null check (src ~ '^[a-z0-9_-]{1,40}$'),
  cr           text        not null check (cr ~ '^[a-z0-9_-]{1,40}$'),
  platform     text        not null check (platform in ('ios','android','web')),
  created_at   timestamptz not null default now(),
  activated_at timestamptz
);
create index if not exists account_attribution_created_at_idx on public.account_attribution (created_at);
alter table public.account_attribution enable row level security;
-- grants: service_role only
grant all privileges on table public.account_attribution to service_role;
revoke all on table public.account_attribution from anon, authenticated;

-- Adds one to today's (Toronto) count. The address is public and anyone can type a src into it, so one day holds at
-- most 2,000 rows: past that, a pair not already counted goes under other/other instead of adding rows.
create or replace function public.bump_attribution_count(p_event text, p_src text, p_cr text, p_platform text)
returns integer language plpgsql security definer set search_path = public as $$
declare
  d date := (now() at time zone 'America/Toronto')::date;
  s text := p_src;
  c text := p_cr;
  result integer;
begin
  if not exists (select 1 from public.attribution_counts x
                 where x.day = d and x.src = s and x.cr = c and x.platform = p_platform and x.event = p_event)
     and (select count(*) from public.attribution_counts x where x.day = d) >= 2000 then
    s := 'other'; c := 'other';
  end if;
  insert into public.attribution_counts (day, src, cr, platform, event, n, updated_at)
  values (d, s, c, p_platform, p_event, 1, now())
  on conflict (day, src, cr, platform, event)
  do update set n = public.attribution_counts.n + 1, updated_at = now()
  returning n into result;
  return result;
end; $$;

revoke all on function public.bump_attribution_count(text, text, text, text) from public, anon, authenticated;
grant execute on function public.bump_attribution_count(text, text, text, text) to service_role;

-- THE TUESDAY REPORT. One line per src and cr, Toronto days. Accounts and activations count by signup day.
--   select * from public.source_funnel('2026-11-03', '2026-11-09');
create or replace function public.source_funnel(p_from date, p_to date)
returns table (src text, cr text, landing_visit integer, store_click integer, install integer, account_created integer, activated_household integer)
language sql
stable
security invoker
set search_path = public
as $$
  with counts as (
    select c.src, c.cr,
           coalesce(sum(c.n) filter (where c.event = 'landing_visit'), 0)::integer as landing_visit,
           coalesce(sum(c.n) filter (where c.event = 'store_click'), 0)::integer as store_click,
           coalesce(sum(c.n) filter (where c.event = 'install'), 0)::integer as install
    from public.attribution_counts c
    where c.day between p_from and p_to
    group by c.src, c.cr
  ), accounts as (
    select a.src, a.cr, count(*)::integer as account_created, count(a.activated_at)::integer as activated_household
    from public.account_attribution a
    where (a.created_at at time zone 'America/Toronto')::date between p_from and p_to
    group by a.src, a.cr
  )
  select coalesce(c.src, a.src), coalesce(c.cr, a.cr),
         coalesce(c.landing_visit, 0), coalesce(c.store_click, 0), coalesce(c.install, 0),
         coalesce(a.account_created, 0), coalesce(a.activated_household, 0)
  from counts c
  full join accounts a on a.src = c.src and a.cr = c.cr
  order by 1, 2;
$$;

revoke all on function public.source_funnel(date, date) from public, anon, authenticated;
grant execute on function public.source_funnel(date, date) to service_role;

-- -----------------------------------------------------------------------------
-- ROLLBACK (stops the counting; nothing else depends on these)
-- -----------------------------------------------------------------------------
-- drop function if exists public.source_funnel(date, date);
-- drop function if exists public.bump_attribution_count(text, text, text, text);
-- drop table if exists public.account_attribution;
-- drop table if exists public.attribution_counts;
