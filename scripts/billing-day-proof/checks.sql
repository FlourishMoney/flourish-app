-- scripts/billing-day-proof/checks.sql
-- -----------------------------------------------------------------------------
-- What must be true after 0009, 0010 and 0016, on production's shape (seed.sql). Every check is an
-- ASSERT: the first one that fails stops the run with its message. Made-up addresses only.
-- -----------------------------------------------------------------------------
\set ON_ERROR_STOP 1

-- 1. Nothing renumbered, freed or reassigned.
do $$
begin
  assert (select count(*) from public.waitlist_founding_ledger) = 28, '1a the ledger still holds 28 numbers';
  assert not exists (select position, email_key, issued_at from public.waitlist_founding_ledger
                     except select * from public._proof_ledger_before)
     and not exists (select * from public._proof_ledger_before
                     except select position, email_key, issued_at from public.waitlist_founding_ledger),
         '1b every number, its address key and its issue time are unchanged';
  assert not exists (select id, founding_position, is_test from public.waitlist except select * from public._proof_rows_before)
     and not exists (select * from public._proof_rows_before except select id, founding_position, is_test from public.waitlist),
         '1c every row keeps its number and its test flag (0016 step 1 matches no row here: its md5 is of an address not in this seed)';
end $$;

-- 2. The new tables: RLS on, and the policies 0009 and 0010 describe.
do $$
begin
  assert (select relrowsecurity from pg_class where oid = 'public.subscriptions'::regclass), '2a subscriptions has RLS on';
  assert (select relrowsecurity from pg_class where oid = 'public.billing_events'::regclass), '2b billing_events has RLS on';
  assert (select count(*) from pg_policies where schemaname = 'public' and tablename = 'subscriptions') = 1, '2c subscriptions has one policy (select own)';
  assert (select count(*) from pg_policies where schemaname = 'public' and tablename = 'billing_events') = 0, '2d billing_events has no policy';
  assert has_table_privilege('service_role', 'public.subscriptions', 'SELECT,INSERT,UPDATE'), '2e the service role can write subscriptions';
  assert has_table_privilege('service_role', 'public.billing_events', 'SELECT,INSERT,UPDATE'), '2f the service role can write billing_events';
  -- Before 2026-10-30 Supabase's default privileges ALSO give anon and authenticated every privilege on a
  -- new public table (0009 and 0010 grant, they do not revoke). RLS is what keeps them out; section 3.
  assert has_table_privilege('authenticated', 'public.subscriptions', 'INSERT'), '2g (as documented) authenticated holds INSERT from Supabase defaults; RLS must refuse it';
end $$;

-- 3. RLS refuses every client write, and a client reads only its own subscription.
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.test');
insert into public.subscriptions (user_id, status, plan_key) values ('22222222-2222-2222-2222-222222222222', 'active', 'monthly');
insert into public.billing_events (event_id, type) values ('evt_proof_1', 'checkout.session.completed');

begin;
set local role anon;
do $$
begin
  assert (select count(*) from public.subscriptions) = 0, '3a anon reads no subscription';
  assert (select count(*) from public.billing_events) = 0, '3b anon reads no billing event';
  begin
    insert into public.subscriptions (user_id, status) values ('11111111-1111-1111-1111-111111111111', 'active');
    assert false, '3c anon could insert a subscription';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
do $$
declare n integer;
begin
  assert (select count(*) from public.subscriptions) = 0, '3d a signed-in user does not see another household''s subscription';
  assert (select count(*) from public.billing_events) = 0, '3e a signed-in user reads no billing event';
  begin
    insert into public.subscriptions (user_id, status, plan_key) values ('11111111-1111-1111-1111-111111111111', 'active', 'annual');
    assert false, '3f a signed-in user could grant itself a plan';
  exception when insufficient_privilege then null;
  end;
  with u as (update public.subscriptions set status = 'active' returning 1) select count(*) into n from u;
  assert n = 0, '3g a signed-in user updates no subscription';
  with d as (delete from public.billing_events returning 1) select count(*) into n from d;
  assert n = 0, '3h a signed-in user deletes no billing event';
end $$;
rollback;

-- 4. The two 0016 functions: only the service role may call them.
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    assert not has_function_privilege(r, 'public.waitlist_founding_position_for_email(text)', 'EXECUTE'), format('4a %s cannot ask whose address holds a number', r);
    assert not has_function_privilege(r, 'public.waitlist_founding_mark_ended(text)', 'EXECUTE'), format('4b %s cannot end a number', r);
  end loop;
  assert has_function_privilege('service_role', 'public.waitlist_founding_position_for_email(text)', 'EXECUTE'), '4c the service role can look a number up';
  assert has_function_privilege('service_role', 'public.waitlist_founding_mark_ended(text)', 'EXECUTE'), '4d the service role can end one';
end $$;

-- 5. The founding rules, as billing asks them (the service role).
set role service_role;
do $$
begin
  assert public.waitlist_founding_position_for_email('household01@example.test') = 1, '5a holder #1 is honoured';
  assert public.waitlist_founding_position_for_email('  HouseHold01@Example.TEST ') = 1, '5b case and spaces do not matter';
  assert public.waitlist_founding_position_for_email('household16@example.test') = 22, '5c the real household at #22 is honoured';
  assert public.waitlist_founding_position_for_email('tester3@getgrowsmart.com') is null, '5d a deleted row''s address is not honoured (no row holds #18)';
  assert public.waitlist_founding_position_for_email('') is null, '5e a blank address gets nothing';
  assert public.waitlist_founding_position_for_email(null) is null, '5f no address gets nothing';
  assert public.waitlist_founding_position_for_email('nobody@example.test') is null, '5g an address not on the list gets nothing';
end $$;

-- A test row keeps its number (spent) but is never honoured.
update public.waitlist set is_test = true where email = 'household02@example.test';
do $$
begin
  assert (select founding_position from public.waitlist where email = 'household02@example.test') = 2, '5h a row marked test keeps its number';
  assert public.waitlist_founding_position_for_email('household02@example.test') is null, '5i …and is never honoured';
end $$;
update public.waitlist set is_test = false where email = 'household02@example.test';

-- Deleted then rejoined: its own number back. Without 0017 this includes Amanda's test address.
delete from public.waitlist where email = 'household05@example.test';
insert into public.waitlist (email, country, consent_version) values ('household05@example.test', 'CA', '2026-10-06');
insert into public.waitlist (email, country, consent_version) values ('tester3@getgrowsmart.com', 'CA', '2026-10-06');
do $$
begin
  assert (select founding_position from public.waitlist where email = 'household05@example.test') = 5, '5j a household that rejoins gets its own number back';
  assert (select founding_position from public.waitlist where email = 'tester3@getgrowsmart.com') = 18, '5k WITHOUT 0017 a test address that rejoins reclaims its old number (#18)';
  assert public.waitlist_founding_position_for_email('tester3@getgrowsmart.com') = 18, '5l …and is honoured for the founding price';
  assert (select count(*) from public.waitlist_founding_ledger) = 28, '5m rejoining issues no new number';
end $$;
delete from public.waitlist where email = 'tester3@getgrowsmart.com';

-- Ended is final: stamped once, the number is kept, and never honoured again, even after delete + rejoin.
do $$
begin
  assert public.waitlist_founding_mark_ended('household03@example.test') = 1, '5n ending stamps the number once';
  assert public.waitlist_founding_mark_ended('household03@example.test') = 0, '5o …and only once';
  assert public.waitlist_founding_mark_ended('') = 0, '5p a blank address ends nothing';
end $$;
delete from public.waitlist where email = 'household03@example.test';
insert into public.waitlist (email, country, consent_version) values ('household03@example.test', 'CA', '2026-10-06');
do $$
begin
  assert (select founding_position from public.waitlist where email = 'household03@example.test') = 3, '5q an ended household that rejoins keeps its number (nobody else gets it)';
  assert public.waitlist_founding_position_for_email('household03@example.test') is null, '5r …but the founding price never comes back';
end $$;

-- The cap without 0017: 22 numbers left, then nobody. 16 + 22 = 38 real households at most.
insert into public.waitlist (email, country, consent_version)
select format('new%s@example.test', lpad(g::text, 2, '0')), 'CA', '2026-10-06' from generate_series(1, 23) g;
do $$
begin
  assert (select count(*) from public.waitlist where email like 'new%' and founding_position is not null) = 22, '5s 22 more households get a number';
  assert (select founding_position from public.waitlist where email = 'new23@example.test') is null, '5t the 23rd does not';
  assert (select count(*) from public.waitlist_founding_ledger) = 50, '5u the ledger stops at 50';
  assert (select count(*) from public.waitlist where founding_position is not null and (email like 'household%' or email like 'new%')) = 38,
         '5v WITHOUT 0017 at most 38 real households hold a founding number';
end $$;
reset role;

\echo 'checks.sql: every assertion passed'
