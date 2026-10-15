-- scripts/billing-day-proof/checks-0017.sql
-- -----------------------------------------------------------------------------
-- ONLY with --with-0017: what applying the HELD migration 0017 (PR #69, read from origin/founding-test-rows
-- with git show, never checked out) would change on production's shape after Monday's three. Local only.
-- -----------------------------------------------------------------------------
\set ON_ERROR_STOP 1
set role service_role;
do $$
begin
  assert (select count(*) from public.waitlist_founding_ledger) = 28, '17a still 28 numbers issued: nothing is deleted';
  assert (select array_agg(position order by position) from public.waitlist_founding_ledger where void_at is not null)
         = array[16,17,18,19,20,21,23,24,25,26,27,28], '17b the twelve deleted test numbers are voided';
  assert (select count(*) from public.waitlist_founding_ledger where void_at is null) = 16, '17c 16 real holders';
  assert not exists (select id, founding_position, is_test from public.waitlist except select * from public._proof_rows_before),
         '17d no real household''s number changed';
  -- main's /api/founding counts every ledger row; PR #69's counts real holders.
  assert 50 - (select count(*) from public.waitlist_founding_ledger) = 22, '17e main''s counter would still say 22 left';
  assert 50 - (select count(*) from public.waitlist_founding_ledger where void_at is null) = 34, '17f PR #69''s counter says 34 left';
  -- main's billing lookup (0016) still answers for real holders after 0017.
  assert public.waitlist_founding_position_for_email('household01@example.test') = 1, '17g main''s lookup still honours #1';
  assert public.waitlist_founding_position_for_email('household16@example.test') = 22, '17h …and #22';
  assert public.waitlist_founding_number_for_email('household16@example.test') = 22, '17i PR #69''s lookup agrees';
end $$;
insert into public.waitlist (email, country, consent_version) values ('tester3@getgrowsmart.com', 'CA', '2026-10-06'), ('fresh@example.test', 'CA', '2026-10-06');
do $$
begin
  assert (select is_test and founding_position is null from public.waitlist where email = 'tester3@getgrowsmart.com'), '17j WITH 0017 a test address that rejoins is a test row with no number';
  assert (select founding_position from public.waitlist where email = 'fresh@example.test') = 29, '17k the next real household gets #29';
end $$;
reset role;
\echo 'checks-0017.sql: every assertion passed'
