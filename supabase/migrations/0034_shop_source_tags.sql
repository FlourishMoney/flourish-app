-- 0034_shop_source_tags.sql
-- -----------------------------------------------------------------------------
-- THE THREE SHOP QR CODES (2026-11-02). NOT APPLIED.
--
-- WAITLIST_SRCS (_lib/waitlistConsent.js) gains shop-trenton, shop-napanee and shop-belleville. Two things in the
-- database hold their own copy of that list, and this brings both up to date:
--   waitlist_signup_counts   (0018) would count the shops' signups as "direct"
--   landing_counts           (0027) would refuse the shops' counts, so they would be lost
--
-- UNTIL THIS IS APPLIED: signups from the QR codes are stored with the shop's tag and work as normal. Only the two
-- reports miss them. A row stored meanwhile is reported correctly once this has run; a lost landing count stays lost.
--
-- Run it in the Supabase SQL editor. Additive and safe to run twice: no row is changed. If 0027 has not been run
-- yet, the landing_counts step is skipped, so run this again after it. tests/signupCounts.test.cjs and
-- tests/landingCounts.test.cjs check both lists match WAITLIST_SRCS.
-- -----------------------------------------------------------------------------

create or replace function public.waitlist_signup_counts(p_from date, p_to date)
returns table (day date, source text, signups integer)
language sql
stable
security invoker
set search_path = public
as $$
  with sources(source) as (
    values ('direct'), ('ig'), ('fb'), ('tt'), ('calendar'), ('clawback'), ('email'), ('press'), ('meta_a'), ('meta_b'), ('shop-trenton'), ('shop-napanee'), ('shop-belleville')
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

revoke all on function public.waitlist_signup_counts(date, date) from public, anon, authenticated;
grant execute on function public.waitlist_signup_counts(date, date) to service_role;

do $$
begin
  if to_regclass('public.landing_counts') is not null then
    alter table public.landing_counts drop constraint if exists landing_counts_src_check;
    alter table public.landing_counts add constraint landing_counts_src_check
      check (src in ('direct','ig','fb','tt','calendar','clawback','email','press','meta_a','meta_b','shop-trenton','shop-napanee','shop-belleville'));
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- ROLLBACK
-- -----------------------------------------------------------------------------
-- Re-run 0018's waitlist_signup_counts. Putting 0027's check back fails once a shop's count exists: delete those
-- count rows first.
