-- 0043_funnel_by_source.sql
-- -----------------------------------------------------------------------------
-- THE FUNNEL BY SOURCE AND CREATIVE, FOR THE TUESDAY REVIEW (2026-11-08). NOT APPLIED.
--
-- One report, src and cr from end to end:
--   before an account (attribution_counts, 0036; a day and a number, nothing about the visitor)
--     home_visit    the home page was shown (new here: beta.js counts it with the landing's own count)
--     get_visit     a visit to /get, the store handoff (0036's landing_visit)
--     store_click   a tap through to the App Store or Google Play, from /get or from the home page's badges
--     install       the Android app's first launch, from Google Play's Install Referrer
--   per household (0042's funnel_households): households created, setup done, first valid safe-to-spend result,
--     first money check-in, trial started, paid on the web, on Apple and on Google (never added together).
--
-- WHAT CARRIES A CODE. Before an account, every count carries the link's src and cr. On an account, only an Android one
-- does (Google Play passes it; the approved privacy words, 2026-11-05). A website or iPhone household reads direct/none.
-- App Store downloads by campaign come from App Store Connect, never from here (docs/ops/MEASUREMENT.md, "What Apple
-- will hide").
--   select * from public.funnel_by_source('2026-11-03', '2026-11-09');
-- One line per src, cr, split and measure; cr '(all)' is the src's total. split is the visitor's platform (ios, android,
-- other) before an account, and the channel the household signed up on after.
--
-- Needs 0036 and 0042. Run in the Supabase SQL editor. Additive and safe to run twice. Until it runs, the home page's
-- src-and-cr count is refused and dropped; its 0027 count, and everything a visitor sees, are unchanged.
-- -----------------------------------------------------------------------------

-- attribution_counts takes one more event. Whatever name production gave 0036's inline check, every check on the
-- event column is replaced, so the old list cannot survive under another name.
do $$
declare c record;
begin
  for c in
    select con.conname from pg_constraint con
    where con.conrelid = 'public.attribution_counts'::regclass and con.contype = 'c'
      and pg_get_constraintdef(con.oid) like '%event%'
  loop
    execute format('alter table public.attribution_counts drop constraint %I', c.conname);
  end loop;
  alter table public.attribution_counts add constraint attribution_counts_event_check
    check (event in ('landing_visit', 'store_click', 'install', 'home_visit'));
end $$;

create or replace function public.funnel_by_source(p_from date, p_to date)
returns table (src text, cr text, split text, measure text, count integer, out_of integer, shown text)
language sql stable security invoker set search_path = public as $$
  with visits as (
    select c.src, c.cr, c.platform as split,
           case c.event when 'landing_visit' then 'get_visit' else c.event end as measure,
           sum(c.n)::integer as n
    from public.attribution_counts c
    where c.day between p_from and p_to
    group by c.src, c.cr, c.platform, c.event
  ),
  hh as (
    select h.src, h.cr, h.channel as split,
           count(*)::integer as households,
           count(h.setup_at)::integer as setup,
           count(h.first_safe_at)::integer as safe,
           count(*) filter (where cardinality(h.checkin_days) >= 1)::integer as ci1,
           count(h.trial_at)::integer as trial,
           count(h.paid_web_at)::integer as paid_web,
           count(h.paid_apple_at)::integer as paid_apple,
           count(h.paid_google_at)::integer as paid_google
    from public.funnel_households() h
    where h.cohort_day between p_from and p_to
    group by h.src, h.cr, h.channel
  ),
  hh_lines as (
    select hh.src, hh.cr, hh.split, m.ord, m.measure, m.n, m.d
    from hh
    cross join lateral (values
      (11, 'households_created',  hh.households, null::integer),
      (12, 'setup_done',          hh.setup,      hh.households),
      (13, 'first_safe_to_spend', hh.safe,       hh.households),
      (14, 'first_checkin',       hh.ci1,        hh.households),
      (15, 'trial_started',       hh.trial,      hh.households),
      (16, 'paid_web',            hh.paid_web,   hh.households),
      (17, 'paid_apple',          hh.paid_apple, hh.households),
      (18, 'paid_google',         hh.paid_google, hh.households)
    ) as m(ord, measure, n, d)
  ),
  lines as (
    select v.src, v.cr, v.split, array_position(array['home_visit', 'get_visit', 'store_click', 'install'], v.measure) as ord,
           v.measure, v.n, null::integer as d
    from visits v
    union all
    select * from hh_lines
  ),
  rolled as (
    select l.src, coalesce(l.cr, '(all)') as cr, l.split, l.ord, l.measure, sum(l.n)::integer as n,
           case when bool_and(l.d is null) then null else sum(l.d)::integer end as d
    from lines l
    group by grouping sets ((l.src, l.cr, l.split, l.ord, l.measure), (l.src, l.split, l.ord, l.measure))
  )
  select r.src, r.cr, r.split, r.measure, r.n, r.d, public.funnel_shown(r.n, r.d)
  from rolled r
  order by r.src, (r.cr = '(all)') desc, r.cr, r.ord, r.split;
$$;

revoke all on function public.funnel_by_source(date, date) from public, anon, authenticated;
grant execute on function public.funnel_by_source(date, date) to service_role;

-- ============================================================================
-- READ-ONLY CHECK (after running):
--   select pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.attribution_counts'::regclass and contype = 'c' and conname = 'attribution_counts_event_check';
--   select has_function_privilege('anon', 'public.funnel_by_source(date, date)', 'execute');
-- Expected: the check lists home_visit; false.
-- ROLLBACK: drop function if exists public.funnel_by_source(date, date); then, once no home_visit row exists,
--   alter table public.attribution_counts drop constraint attribution_counts_event_check;
--   alter table public.attribution_counts add constraint attribution_counts_event_check check (event in ('landing_visit','store_click','install'));
-- ============================================================================
