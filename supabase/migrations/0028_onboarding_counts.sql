-- 0028_onboarding_counts.sql
-- -----------------------------------------------------------------------------
-- ONBOARDING COUNTS, AGGREGATE ONLY (2026-10-23, the first number). NOT APPLIED.
--
-- Per signup day ("cohort day", Toronto time), how many accounts:
--   onboarding_step_completed  left each onboarding step forward (detail: welcome, bank, balance, income,
--                              bills, debts);
--   first_number_shown         saw their first Safe to spend number, by mode (manual, or linked: a bank linked)
--                              and how long it took, in buckets (under_60, 60_120, 120_180, over_180 seconds),
--                              measured two ways: from signup (the account's created_at, read by the server) and
--                              from the first sign-in on that device (detail "<mode>:signup:<bucket>" and
--                              "<mode>:signin:<bucket>");
--   bank_link_started / bank_link_completed / bank_link_failed / bank_link_cancelled   every bank link attempt
--                              during onboarding (detail empty).
--
-- NO ACCOUNT ID IS STORED. public.onboarding_counts holds a day, an event and a detail from the fixed lists
-- below, and a count: no account id, no address, no IP, no amount and no free text. The server
-- (netlify/functions/activation.js with _lib/onboardingCounts.js) checks the signed-in account, works out the
-- cohort day and the rows, adds 1 to each, and keeps nothing else. Flourish's own test addresses and the App
-- Review and screenshot accounts are never counted. The app sends the steps and the first number once per
-- account per device, so a household on two devices can be counted twice.
--
-- UNTIL THIS IS APPLIED, nothing is counted: onboarding_bump does not exist, the function answers 503 and the
-- app carries on exactly as before.
--
-- No third-party analytics. Read the counts in the Supabase SQL editor (count-only lines, zeros left out):
--   select * from public.onboarding_counts_report('2026-10-23', '2026-11-30');
-- With 0019's activation_counts (accounts created per cohort day) beside it, "finished onboarding" is
-- first_number_shown's signup rows over accounts created.
--
-- Needs nothing earlier than 0001. Safe to run twice.
-- grants: service_role only
-- -----------------------------------------------------------------------------

create table if not exists public.onboarding_counts (
  cohort_day date    not null,
  event      text    not null,
  detail     text    not null default '',
  count      integer not null default 0 check (count >= 0),
  primary key (cohort_day, event, detail),
  constraint onboarding_counts_known check (
       (event = 'onboarding_step_completed' and detail in ('welcome', 'bank', 'balance', 'income', 'bills', 'debts'))
    or (event = 'first_number_shown' and detail ~ '^(manual|linked):(signup|signin):(under_60|60_120|120_180|over_180)$')
    or (event in ('bank_link_started', 'bank_link_completed', 'bank_link_failed', 'bank_link_cancelled') and detail = '')
  )
);
alter table public.onboarding_counts enable row level security;
revoke all on table public.onboarding_counts from anon, authenticated;
grant all privileges on table public.onboarding_counts to service_role;

-- Add 1 to one counter. The only way a count changes.
create or replace function public.onboarding_bump(p_cohort_day date, p_event text, p_detail text)
returns void
language sql
security invoker
set search_path = public
as $$
  insert into public.onboarding_counts (cohort_day, event, detail, count) values (p_cohort_day, p_event, coalesce(p_detail, ''), 1)
  on conflict (cohort_day, event, detail) do update set count = public.onboarding_counts.count + 1;
$$;

-- The report: one count-only line per cohort day, event and detail in the range.
create or replace function public.onboarding_counts_report(p_from date, p_to date)
returns table (cohort_day date, event text, detail text, count integer)
language sql
stable
security invoker
set search_path = public
as $$
  select c.cohort_day, c.event, c.detail, c.count
  from public.onboarding_counts c
  where c.cohort_day between p_from and p_to
  order by c.cohort_day,
    array_position(array['onboarding_step_completed', 'bank_link_started', 'bank_link_completed', 'bank_link_failed',
                         'bank_link_cancelled', 'first_number_shown'], c.event),
    c.detail;
$$;

-- Grants: the Data API roles may not touch the table or call either function; the service role (the
-- Netlify function) may add to a counter and read the report.
revoke all on function public.onboarding_bump(date, text, text) from public, anon, authenticated;
grant execute on function public.onboarding_bump(date, text, text) to service_role;
revoke all on function public.onboarding_counts_report(date, date) from public, anon, authenticated;
grant execute on function public.onboarding_counts_report(date, date) to service_role;

-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- Dropping these stops the counting; nothing else depends on them.
--
-- drop function if exists public.onboarding_counts_report(date, date);
-- drop function if exists public.onboarding_bump(date, text, text);
-- drop table if exists public.onboarding_counts;
