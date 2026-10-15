-- scripts/billing-day-proof/seed.sql
-- -----------------------------------------------------------------------------
-- PRODUCTION'S SHAPE ON 2026-10-14, rebuilt with made-up addresses (example.test and the test domain).
-- Run after 0014 and 0015, with 0009, 0010 and 0016 NOT applied, exactly as production is:
--   • 15 households were on the list when waitlist_founding_start() ran, and got 1 to 15;
--   • then 13 sign-ups through the live trigger: six of Amanda's tests (16 to 21), one real household
--     (22), six more tests (23 to 28);
--   • Amanda deleted her twelve test rows. Their numbers stay issued: the ledger never frees one.
-- Result: 16 rows holding 1 to 15 and 22, and 28 ledger numbers. The first five rows carry the legacy
-- consent version, as the earliest production rows do.
-- -----------------------------------------------------------------------------
insert into public.waitlist (email, country, created_at, consent_version)
select format('household%s@example.test', lpad(g::text, 2, '0')), 'CA', timestamptz '2026-09-01' + (g || ' hours')::interval,
       case when g <= 5 then 'pre-2026-10-01' else '2026-10-06' end
from generate_series(1, 15) g;

select public.waitlist_founding_start();

insert into public.waitlist (email, country, consent_version)
select format('tester%s@getgrowsmart.com', g), 'CA', '2026-10-06' from generate_series(1, 6) g;
insert into public.waitlist (email, country, consent_version) values ('household16@example.test', 'CA', '2026-10-06');
insert into public.waitlist (email, country, consent_version)
select format('tester%s@getgrowsmart.com', g), 'CA', '2026-10-06' from generate_series(7, 12) g;

delete from public.waitlist where email like 'tester%@getgrowsmart.com';

-- What the migrations must not change: every number, its address key and its issue time; every row's
-- number and test flag.
create table public._proof_ledger_before as select position, email_key, issued_at from public.waitlist_founding_ledger;
create table public._proof_rows_before as select id, founding_position, is_test from public.waitlist;

do $$
begin
  assert (select count(*) from public.waitlist) = 16, 'seed: 16 waitlist rows';
  assert (select array_agg(founding_position order by founding_position) from public.waitlist)
         = array[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,22], 'seed: rows hold 1 to 15 and 22';
  assert (select count(*) from public.waitlist_founding_ledger) = 28, 'seed: 28 ledger numbers';
end $$;
