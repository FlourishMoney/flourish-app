-- 0019_activation_counts.sql
-- -----------------------------------------------------------------------------
-- ACTIVATION COUNTS, AGGREGATE ONLY (2026-10-15). NOT APPLIED.
--
-- Per signup day ("cohort day", Toronto time): confirmed accounts created, and of them how many added a
-- data source (a bank, an imported statement or a balance they entered), viewed safe to spend within 7
-- days, opened the money meeting for the first time, and came back on day 1 and on day 7 of their own
-- signup.
--
-- NO ACCOUNT ID IS STORED. public.activation_daily holds a day, a metric name from a fixed list and a
-- count: no account id, no address, no amount and no free text. The server
-- (netlify/functions/activation.js) checks the signed-in account, works out the cohort day and the
-- metric, adds 1 to that day's counter, and keeps nothing else. Small cohorts can still be matched to the
-- few accounts created that day, so this report is for Flourish only, never published.
-- Accounts created comes from Supabase Auth's own created_at, confirmed accounts only. Accounts at the
-- test domains (getgrowsmart.com, flourishmoney.app) and the App Review and screenshot accounts are never
-- counted. The other counters are close estimates: the app sends each signal once per device, so a
-- household on two devices can be counted twice and a counter can exceed accounts created.
--
-- No third-party analytics. Read the counts in the Supabase SQL editor:
--   select * from public.activation_counts('2026-10-01', '2026-10-31');
--
-- Needs nothing earlier than 0001. Safe to run twice.
-- grants: service_role only
-- -----------------------------------------------------------------------------

create table if not exists public.activation_daily (
  cohort_day date    not null,
  metric     text    not null check (metric in ('data_source', 'safe_view_7d', 'first_meeting', 'returned_d1', 'returned_d7')),
  count      integer not null default 0 check (count >= 0),
  primary key (cohort_day, metric)
);
alter table public.activation_daily enable row level security;
revoke all on table public.activation_daily from anon, authenticated;
grant all privileges on table public.activation_daily to service_role;

-- Add 1 to one counter. The only way a count changes.
create or replace function public.activation_bump(p_cohort_day date, p_metric text)
returns void
language sql
security invoker
set search_path = public
as $$
  insert into public.activation_daily (cohort_day, metric, count) values (p_cohort_day, p_metric, 1)
  on conflict (cohort_day, metric) do update set count = public.activation_daily.count + 1;
$$;

-- The report: one row per cohort day in the range. Accounts created is read from auth.users (Toronto
-- day, test domains left out); the rest from activation_daily. Counts only.
create or replace function public.activation_counts(p_from date, p_to date)
returns table (cohort_day date, accounts_created integer, data_source integer, safe_view_7d integer,
               first_meeting integer, returned_d1 integer, returned_d7 integer)
language sql
stable
security definer
set search_path = public
as $$
  with days(cohort_day) as (
    select generate_series(p_from, p_to, interval '1 day')::date
  ),
  created as (
    select (u.created_at at time zone 'America/Toronto')::date as cohort_day, count(*)::integer as n
    from auth.users u
    where u.email_confirmed_at is not null
      and lower(coalesce(u.email, '')) !~ '@([a-z0-9-]+\.)*(getgrowsmart\.com|flourishmoney\.app)$'
      and lower(trim(coalesce(u.email, ''))) <> 'snap@flourish.app'
      and encode(extensions.digest(lower(trim(coalesce(u.email, ''))), 'sha256'), 'hex') <> 'af552e5b3f4529120915257ae8073ff990043c65e6163630d694fe2b6516dc7b'
    group by 1
  )
  select d.cohort_day,
         coalesce(c.n, 0),
         coalesce(max(a.count) filter (where a.metric = 'data_source'), 0)::integer,
         coalesce(max(a.count) filter (where a.metric = 'safe_view_7d'), 0)::integer,
         coalesce(max(a.count) filter (where a.metric = 'first_meeting'), 0)::integer,
         coalesce(max(a.count) filter (where a.metric = 'returned_d1'), 0)::integer,
         coalesce(max(a.count) filter (where a.metric = 'returned_d7'), 0)::integer
  from days d
  left join created c on c.cohort_day = d.cohort_day
  left join public.activation_daily a on a.cohort_day = d.cohort_day
  group by d.cohort_day, c.n
  order by d.cohort_day;
$$;

-- Grants: the Data API roles may not touch the table or call either function; the service role (the
-- Netlify function) may add to a counter and read the report.
revoke all on function public.activation_bump(date, text) from public, anon, authenticated;
grant execute on function public.activation_bump(date, text) to service_role;
revoke all on function public.activation_counts(date, date) from public, anon, authenticated;
grant execute on function public.activation_counts(date, date) to service_role;
