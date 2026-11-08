-- 0042_funnel_counters.sql
-- -----------------------------------------------------------------------------
-- THE FULL FUNNEL, COUNTED ON OUR OWN SERVER (2026-11-08). NOT APPLIED.
--
-- The approved plan (Nov 4, v4) needs, live by Nov 15 and with no analytics SDK: account, setup done, first valid
-- safe-to-spend result, first money check-in, a second check-in on a different day, trial, paid, cancelled and
-- refunded, cohorted by the day the account was created, with returns on day 1, 7, 14 and 28, every percentage shown
-- with its numerator and denominator, each household counted once. docs/ops/MEASUREMENT.md defines every measure
-- and says where it comes from.
--
-- WHY A ROW PER ACCOUNT. 0019 and 0028 keep only a day and a number, so a household on a phone and on the website is
-- counted twice and nobody can tell. To count a household once, the server has to remember that this account already
-- reached a milestone. So:
--   account_milestones   one row per account and milestone: WHEN it first happened, and on which channel. A second
--                        device, or a second delivery of the same webhook, finds the row there and adds nothing.
--   account_days         the Toronto days, in the account's first 60 days, on which it opened the app or held a
--                        money check-in. Day and kind only: nothing about what was on screen.
-- Neither holds an amount, a name, an address, an email, a device or free text. Both go with the account when it is
-- deleted (on delete cascade). This is the "usage patterns (screens viewed, features used)" the privacy policy
-- already lists under information collected automatically, linked to the account.
--
-- THE REPORTS give counts only. A household is everyone in public.household_members together (0030), or one account
-- on its own; it is counted on the day its first account was created, and a milestone counts on the first time any of
-- its people reached it. Flourish's own test addresses and the App Review and screenshot accounts are never counted
-- (the same rule as 0019).
--   select * from public.funnel_cohorts('2026-11-09', '2026-11-30');   one line per cohort day, channel and measure
--   select * from public.funnel_gates();                               the plan's activation and repeat-use gates
--
-- COUNTING STARTS WHEN THIS RUNS. Nothing before it is recorded here, so an earlier cohort's blanks are not zeros:
-- funnel_cohorts marks those lines before_counting_started, and funnel_gates only looks at households created after.
--
-- UNTIL THIS IS APPLIED: every write is refused and dropped (the server logs only "[funnel] not recorded"), and
-- everything a household sees works as before. Needs 0001 (profiles), 0030 (household_members), 0036
-- (account_attribution). Run in the Supabase SQL editor. Additive and safe to run twice.
-- -----------------------------------------------------------------------------

create table if not exists public.account_milestones (
  user_id   uuid        not null references auth.users(id) on delete cascade,
  milestone text        not null,
  channel   text        not null,
  first_at  timestamptz not null default now(),
  primary key (user_id, milestone, channel),
  constraint account_milestones_known check (
       (milestone = 'signed_up'   and channel in ('web', 'ios', 'android'))
    or (milestone = 'setup_done'  and channel in ('bank', 'manual'))
    or (milestone = 'first_safe'  and channel = 'app')
    or (milestone = 'store_trial' and channel in ('apple', 'google'))
    or (milestone in ('paid', 'cancelled', 'refunded') and channel in ('web', 'apple', 'google'))
  )
);
alter table public.account_milestones enable row level security;
-- grants: service_role only
revoke all on table public.account_milestones from anon, authenticated;
grant all privileges on table public.account_milestones to service_role;

create table if not exists public.account_days (
  user_id uuid not null references auth.users(id) on delete cascade,
  day     date not null,
  kind    text not null check (kind in ('open', 'checkin')),
  primary key (user_id, day, kind)
);
alter table public.account_days enable row level security;
-- grants: service_role only
revoke all on table public.account_days from anon, authenticated;
grant all privileges on table public.account_days to service_role;

-- When counting started: one row, written the first time this file runs and never moved.
create table if not exists public.funnel_start (
  one        boolean     primary key default true check (one),
  started_at timestamptz not null default now()
);
insert into public.funnel_start (one) values (true) on conflict (one) do nothing;
alter table public.funnel_start enable row level security;
-- grants: service_role only
revoke all on table public.funnel_start from anon, authenticated;
grant all privileges on table public.funnel_start to service_role;

-- "n of d (p%)": a percentage never appears without the two numbers it came from.
create or replace function public.funnel_shown(p_n integer, p_d integer)
returns text language sql immutable set search_path = public as $$
  select case
    when p_d is null then p_n::text
    when p_d = 0 then p_n || ' of 0 (no household has finished this window yet)'
    else p_n || ' of ' || p_d || ' (' || round(100.0 * p_n / p_d, 1) || '%)'
  end;
$$;

-- One line per counted household. Counts nothing on its own: the two reports below read it.
create or replace function public.funnel_households()
returns table (
  household text, cohort_day date, created_at timestamptz, channel text, accounts integer,
  setup_at timestamptz, first_safe_at timestamptz, trial_at timestamptz,
  store_trial_apple_at timestamptz, store_trial_google_at timestamptz,
  paid_web_at timestamptz, paid_apple_at timestamptz, paid_google_at timestamptz,
  cancelled_web_at timestamptz, cancelled_apple_at timestamptz, cancelled_google_at timestamptz,
  refunded_web_at timestamptz, refunded_apple_at timestamptz, refunded_google_at timestamptz,
  checkin_days date[], open_days date[]
)
language sql stable security definer set search_path = public as $$
  with counted as (
    select u.id as user_id, u.created_at, coalesce(hm.household_id::text, u.id::text) as household
    from auth.users u
    left join public.household_members hm on hm.user_id = u.id
    where lower(coalesce(u.email, '')) !~ '@([a-z0-9-]+\.)*(getgrowsmart\.com|flourishmoney\.app)$'
      and lower(trim(coalesce(u.email, ''))) <> 'snap@flourish.app'
      and encode(sha256(convert_to(lower(trim(coalesce(u.email, ''))), 'UTF8')), 'hex') <> 'af552e5b3f4529120915257ae8073ff990043c65e6163630d694fe2b6516dc7b'
  ),
  firsts as (
    select distinct on (c.household) c.household, c.user_id as first_user, c.created_at
    from counted c order by c.household, c.created_at, c.user_id
  ),
  sizes as (select c.household, count(*)::integer as n from counted c group by c.household),
  ms as (
    select c.household, m.milestone, m.channel, min(m.first_at) as at
    from counted c join public.account_milestones m on m.user_id = c.user_id
    group by c.household, m.milestone, m.channel
  ),
  dd as (
    select c.household, d.kind, array_agg(distinct d.day order by d.day) as ds
    from counted c join public.account_days d on d.user_id = c.user_id
    group by c.household, d.kind
  ),
  trials as (
    select c.household, min(p.trial_started_at) as at
    from counted c join public.profiles p on p.user_id = c.user_id
    where p.trial_started_at is not null
    group by c.household
  )
  select f.household,
         (f.created_at at time zone 'America/Toronto')::date,
         f.created_at,
         coalesce((select m.channel from public.account_milestones m where m.user_id = f.first_user and m.milestone = 'signed_up' order by m.first_at limit 1),
                  (select a.platform from public.account_attribution a where a.user_id = f.first_user),
                  'unknown'),
         s.n,
         (select min(ms.at) from ms where ms.household = f.household and ms.milestone = 'setup_done'),
         (select min(ms.at) from ms where ms.household = f.household and ms.milestone = 'first_safe'),
         t.at,
         (select ms.at from ms where ms.household = f.household and ms.milestone = 'store_trial' and ms.channel = 'apple'),
         (select ms.at from ms where ms.household = f.household and ms.milestone = 'store_trial' and ms.channel = 'google'),
         (select ms.at from ms where ms.household = f.household and ms.milestone = 'paid' and ms.channel = 'web'),
         (select ms.at from ms where ms.household = f.household and ms.milestone = 'paid' and ms.channel = 'apple'),
         (select ms.at from ms where ms.household = f.household and ms.milestone = 'paid' and ms.channel = 'google'),
         (select ms.at from ms where ms.household = f.household and ms.milestone = 'cancelled' and ms.channel = 'web'),
         (select ms.at from ms where ms.household = f.household and ms.milestone = 'cancelled' and ms.channel = 'apple'),
         (select ms.at from ms where ms.household = f.household and ms.milestone = 'cancelled' and ms.channel = 'google'),
         (select ms.at from ms where ms.household = f.household and ms.milestone = 'refunded' and ms.channel = 'web'),
         (select ms.at from ms where ms.household = f.household and ms.milestone = 'refunded' and ms.channel = 'apple'),
         (select ms.at from ms where ms.household = f.household and ms.milestone = 'refunded' and ms.channel = 'google'),
         (select dd.ds from dd where dd.household = f.household and dd.kind = 'checkin'),
         (select dd.ds from dd where dd.household = f.household and dd.kind = 'open')
  from firsts f
  join sizes s on s.household = f.household
  left join trials t on t.household = f.household;
$$;

-- THE COHORT REPORT. One line per cohort day (Toronto), channel the household signed up on (web, ios, android, or
-- unknown for an account made before 0036) and measure. count is households unless the measure says accounts;
-- out_of is the households it is a share of (null for a plain count, 0 while the window is not over).
create or replace function public.funnel_cohorts(p_from date, p_to date)
returns table (cohort_day date, channel text, measure text, count integer, out_of integer, shown text, pct numeric, before_counting_started boolean)
language sql stable security invoker set search_path = public as $$
  with today as (select (now() at time zone 'America/Toronto')::date as d),
  started as (select (s.started_at at time zone 'America/Toronto')::date as d from public.funnel_start s),
  g as (
    select h.cohort_day, h.channel,
           count(*)::integer as hh,
           sum(h.accounts)::integer as acc,
           count(h.setup_at)::integer as setup,
           count(h.first_safe_at)::integer as safe,
           count(*) filter (where cardinality(h.checkin_days) >= 1)::integer as ci1,
           count(*) filter (where cardinality(h.checkin_days) >= 2)::integer as ci2,
           count(h.trial_at)::integer as trial,
           count(h.store_trial_apple_at)::integer as st_apple, count(h.store_trial_google_at)::integer as st_google,
           count(h.paid_web_at)::integer as paid_web, count(h.paid_apple_at)::integer as paid_apple, count(h.paid_google_at)::integer as paid_google,
           count(h.cancelled_web_at)::integer as can_web, count(h.cancelled_apple_at)::integer as can_apple, count(h.cancelled_google_at)::integer as can_google,
           count(h.refunded_web_at)::integer as ref_web, count(h.refunded_apple_at)::integer as ref_apple, count(h.refunded_google_at)::integer as ref_google,
           count(*) filter (where h.open_days @> array[h.cohort_day + 1])::integer as r1,
           count(*) filter (where h.open_days @> array[h.cohort_day + 7])::integer as r7,
           count(*) filter (where h.open_days @> array[h.cohort_day + 14])::integer as r14,
           count(*) filter (where h.open_days @> array[h.cohort_day + 28])::integer as r28,
           count(*) filter (where h.cohort_day + 1 < (select d from today))::integer as e1,
           count(*) filter (where h.cohort_day + 7 < (select d from today))::integer as e7,
           count(*) filter (where h.cohort_day + 14 < (select d from today))::integer as e14,
           count(*) filter (where h.cohort_day + 28 < (select d from today))::integer as e28
    from public.funnel_households() h
    where h.cohort_day between p_from and p_to
    group by h.cohort_day, h.channel
  )
  select g.cohort_day, g.channel, m.measure, m.n, m.d, public.funnel_shown(m.n, m.d),
         case when m.d > 0 then round(100.0 * m.n / m.d, 1) end,
         g.cohort_day < (select d from started)
  from g
  cross join lateral (values
    (1,  'households_created',               g.hh,        null::integer),
    (2,  'accounts_created',                 g.acc,       null::integer),
    (3,  'setup_done',                       g.setup,     g.hh),
    (4,  'first_safe_to_spend',              g.safe,      g.hh),
    (5,  'first_checkin',                    g.ci1,       g.hh),
    (6,  'second_checkin_other_day',         g.ci2,       g.hh),
    (7,  'trial_started',                    g.trial,     g.hh),
    (8,  'store_trial_started_apple',        g.st_apple,  g.hh),
    (9,  'store_trial_started_google',       g.st_google, g.hh),
    (10, 'paid_web',                         g.paid_web,  g.hh),
    (11, 'paid_apple',                       g.paid_apple, g.hh),
    (12, 'paid_google',                      g.paid_google, g.hh),
    (13, 'cancelled_web',                    g.can_web,   g.hh),
    (14, 'cancelled_apple',                  g.can_apple, g.hh),
    (15, 'cancelled_google',                 g.can_google, g.hh),
    (16, 'refunded_web',                     g.ref_web,   g.hh),
    (17, 'refunded_apple',                   g.ref_apple, g.hh),
    (18, 'refunded_google',                  g.ref_google, g.hh),
    (19, 'returned_day_1',                   g.r1,        g.e1),
    (20, 'returned_day_7',                   g.r7,        g.e7),
    (21, 'returned_day_14',                  g.r14,       g.e14),
    (22, 'returned_day_28',                  g.r28,       g.e28)
  ) as m(ord, measure, n, d)
  order by g.cohort_day, g.channel, m.ord;
$$;

-- THE PLAN'S GATES (v4). Only households created after counting started. p_as_of is a Toronto day, today if null.
--   activation          households that reached a first valid safe-to-spend result within 7 days of their first
--                       account, out of every household whose 7 days are over (abandoned onboarding included)
--   activated           households that reached it at all (the scaling gate needs 30)
--   returned_days_6_to_8, second_checkin_days_6_to_14, either_repeat_use
--                       out of activated households whose 14 full days since activation are over; day 0 is the
--                       Toronto day of the first safe-to-spend result. Each household once.
-- channel 'all' is every household; the other lines split it by the channel the household signed up on.
create or replace function public.funnel_gates(p_as_of date default null)
returns table (channel text, measure text, numerator integer, denominator integer, shown text, pct numeric)
language sql stable security invoker set search_path = public as $$
  with asof as (select coalesce(p_as_of, (now() at time zone 'America/Toronto')::date) as d),
  started as (select s.started_at from public.funnel_start s),
  h as (
    select h.*, (h.first_safe_at at time zone 'America/Toronto')::date as a
    from public.funnel_households() h
    where h.created_at >= (select started_at from started)
  ),
  f as (
    select h.channel,
           h.cohort_day + 7 <= (select d from asof) as act_eligible,
           h.first_safe_at is not null and h.first_safe_at < h.created_at + interval '7 days'
             and (h.first_safe_at at time zone 'America/Toronto')::date < (select d from asof) as activated_7d,
           h.first_safe_at is not null and h.a < (select d from asof) as activated,
           h.a is not null and h.a + 14 < (select d from asof) as rep_eligible,
           coalesce(exists (select 1 from unnest(h.open_days) o where o between h.a + 6 and h.a + 8), false) as ret_6_8,
           coalesce(exists (select 1 from unnest(h.checkin_days) c where c between h.a + 6 and h.a + 14 and c <> h.checkin_days[1]), false) as ci_6_14
    from h
  ),
  g as (
    select coalesce(f.channel, 'all') as channel,
           count(*) filter (where f.act_eligible and f.activated_7d)::integer as act_n,
           count(*) filter (where f.act_eligible)::integer as act_d,
           count(*) filter (where f.activated)::integer as activated,
           count(*) filter (where f.rep_eligible and f.ret_6_8)::integer as ret_n,
           count(*) filter (where f.rep_eligible and f.ci_6_14)::integer as ci_n,
           count(*) filter (where f.rep_eligible and (f.ret_6_8 or f.ci_6_14))::integer as either_n,
           count(*) filter (where f.rep_eligible)::integer as rep_d
    from f
    group by grouping sets ((f.channel), ())
  )
  select g.channel, m.measure, m.n, m.d, public.funnel_shown(m.n, m.d), case when m.d > 0 then round(100.0 * m.n / m.d, 1) end
  from g
  cross join lateral (values
    (1, 'activation_within_7_days',      g.act_n,     g.act_d),
    (2, 'activated_households',          g.activated, null::integer),
    (3, 'returned_days_6_to_8',          g.ret_n,     g.rep_d),
    (4, 'second_checkin_days_6_to_14',   g.ci_n,      g.rep_d),
    (5, 'either_repeat_use',             g.either_n,  g.rep_d)
  ) as m(ord, measure, n, d)
  order by (g.channel <> 'all'), g.channel, m.ord;
$$;

-- Grants: none of these is for the Data API. Only the service role (and the owner, in the SQL editor) may run them.
revoke all on function public.funnel_shown(integer, integer) from public, anon, authenticated;
grant execute on function public.funnel_shown(integer, integer) to service_role;
revoke all on function public.funnel_households() from public, anon, authenticated;
grant execute on function public.funnel_households() to service_role;
revoke all on function public.funnel_cohorts(date, date) from public, anon, authenticated;
grant execute on function public.funnel_cohorts(date, date) to service_role;
revoke all on function public.funnel_gates(date) from public, anon, authenticated;
grant execute on function public.funnel_gates(date) to service_role;

-- ============================================================================
-- READ-ONLY CHECK (after running): both tables exist with RLS on, the Data API roles can reach neither, and the
-- start marker is set.
--   select (select relrowsecurity from pg_class where oid = 'public.account_milestones'::regclass),
--          (select relrowsecurity from pg_class where oid = 'public.account_days'::regclass),
--          has_table_privilege('authenticated', 'public.account_milestones', 'select'),
--          has_function_privilege('anon', 'public.funnel_gates(date)', 'execute'),
--          (select count(*) from public.funnel_start);
-- Expected: true, true, false, false, 1.
-- ============================================================================
-- ROLLBACK (stops the counting; nothing else depends on these):
-- drop function if exists public.funnel_gates(date);
-- drop function if exists public.funnel_cohorts(date, date);
-- drop function if exists public.funnel_households();
-- drop function if exists public.funnel_shown(integer, integer);
-- drop table if exists public.funnel_start;
-- drop table if exists public.account_days;
-- drop table if exists public.account_milestones;
-- ============================================================================
