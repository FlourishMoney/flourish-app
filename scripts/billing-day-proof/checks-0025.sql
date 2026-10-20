-- scripts/billing-day-proof/checks-0025.sql
-- -----------------------------------------------------------------------------
-- ONLY with --with-0025: what 0025 (the founding ledger, which replaced 0017 and 0021) changes on
-- production's 2026-10-14 shape after Monday's three. Local only. The seed has no confirmed accounts, so
-- nothing is numbered for accounts here (tests/foundingLedger.sql.test.cjs covers that).
-- -----------------------------------------------------------------------------
\set ON_ERROR_STOP 1
set role service_role;
do $$
begin
  assert (select count(*) from public.waitlist_founding_ledger) = 28, '25a still 28 numbers issued: nothing is deleted';
  assert (select array_agg(position order by position) from public.waitlist_founding_ledger where void_at is not null and void_reason = 'test')
         = array[16,17,18,19,20,21,23,24,25,26,27,28], '25b the twelve deleted test numbers are voided, as tests';
  assert (select count(*) from public.waitlist_founding_ledger where void_at is null) = 16, '25c 16 real holders';
  assert not exists (select id, founding_position, is_test from public.waitlist except select * from public._proof_rows_before),
         '25d no real household''s number changed';
  -- /api/founding counts the real holders.
  assert 50 - (select count(*) from public.waitlist_founding_ledger where void_at is null) = 34, '25e the counter says 34 left';
  -- Billing's lookup, under both names, honours the real holders.
  assert public.waitlist_founding_number_for_email('household01@example.test') = 1, '25f the lookup honours #1';
  assert public.waitlist_founding_number_for_email('household16@example.test') = 22, '25g …and #22';
  assert public.waitlist_founding_position_for_email('household16@example.test') = 22, '25h 0016''s name gives the same answer';
  assert (select accounts_started_at is not null from public.founding_settings), '25i confirmed accounts take seats from now on';
end $$;
insert into public.waitlist (email, country, consent_version) values ('tester3@getgrowsmart.com', 'CA', '2026-10-06'), ('fresh@example.test', 'CA', '2026-10-06');
do $$
begin
  assert (select is_test and founding_position is null from public.waitlist where email = 'tester3@getgrowsmart.com'), '25j a test address that rejoins is a test row with no number';
  assert (select founding_position from public.waitlist where email = 'fresh@example.test') = 29, '25k the next real household gets #29';
end $$;
reset role;
\echo 'checks-0025.sql: every assertion passed'
