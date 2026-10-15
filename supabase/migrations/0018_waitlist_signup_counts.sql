-- 0018_waitlist_signup_counts.sql
-- -----------------------------------------------------------------------------
-- WAITLIST SIGNUPS BY SOURCE AND BY DAY, COUNTS ONLY (2026-10-15). NOT APPLIED.
--
-- Two read-only functions for the Supabase SQL editor. Neither returns an address, a name, metadata or
-- any free text: only a day, a source from a fixed list, and a count.
--
--   select * from public.waitlist_signup_counts('2026-10-01', '2026-10-31');
--     one row for every day in the range and every source (zeros included), Toronto time.
--   select * from public.waitlist_test_row_count();
--     how many rows are marked is_test. They are left out of every figure above.
--
-- THE SOURCES are netlify/functions/_lib/waitlistConsent.js WAITLIST_SRCS plus "direct", the value a
-- signup with no known src is stored as. A null, blank or unrecognised source is counted as "direct"
-- rather than dropped. tests/signupCounts.test.cjs checks the two lists stay the same.
--
-- Needs 0014 (is_test). Read-only: no table is created or changed. Safe to run twice.
-- -----------------------------------------------------------------------------

create or replace function public.waitlist_signup_counts(p_from date, p_to date)
returns table (day date, source text, signups integer)
language sql
stable
security invoker
set search_path = public
as $$
  with sources(source) as (
    values ('direct'), ('ig'), ('fb'), ('tt'), ('calendar'), ('clawback'), ('email'), ('press'), ('meta_a'), ('meta_b')
  ),
  days(day) as (
    select generate_series(p_from, p_to, interval '1 day')::date
  ),
  rows_ as (
    select (w.created_at at time zone 'America/Toronto')::date as day,
           case when lower(trim(coalesce(w.source, ''))) in (select source from sources)
                then lower(trim(w.source)) else 'direct' end as source
    from public.waitlist w
    where not w.is_test
      and (w.created_at at time zone 'America/Toronto')::date between p_from and p_to
  )
  select d.day, s.source, count(r.day)::integer as signups
  from days d
  cross join sources s
  left join rows_ r on r.day = d.day and r.source = s.source
  group by d.day, s.source
  order by d.day, s.source;
$$;

create or replace function public.waitlist_test_row_count()
returns integer
language sql
stable
security invoker
set search_path = public
as $$
  select count(*)::integer from public.waitlist where is_test;
$$;

-- Grants: neither function is for the Data API. PUBLIC's default execute is revoked; only the service
-- role (and the owner, in the SQL editor) may run them.
revoke all on function public.waitlist_signup_counts(date, date) from public, anon, authenticated;
grant execute on function public.waitlist_signup_counts(date, date) to service_role;
revoke all on function public.waitlist_test_row_count() from public, anon, authenticated;
grant execute on function public.waitlist_test_row_count() to service_role;
