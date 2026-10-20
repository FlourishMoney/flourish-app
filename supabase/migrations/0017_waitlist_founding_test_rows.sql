-- 0017_waitlist_founding_test_rows.sql
-- -----------------------------------------------------------------------------
-- TEST SIGN-UPS NEVER HOLD A FOUNDING NUMBER (Amanda, 2026-10-14).
--
-- Since numbering started on 2026-10-07, Amanda's own test sign-ups took founding numbers. They are not
-- households. The promise is "the first 50 households on the waitlist", so 50 real households must still
-- get the founding price. In production (read-only check, 2026-10-14) the ledger had issued 28 numbers;
-- 16 waitlist rows hold 1 to 15 and 22, and the other 12 (16 to 21, 23 to 28) were Amanda's test
-- sign-ups, whose rows she has already deleted. Step 9 voids those 12 by number.
--
-- THE DESIGN: COUNT REAL HOLDERS, NOT THE HIGHEST NUMBER.
--   • A test row's number is VOIDED in the ledger (void_at). A void number is never reissued (the
--     ledger's primary key keeps it) and never counts as a household.
--   • Real holders = ledger numbers that are not void. Ended numbers still count: ended is final, and
--     the number is never given to anyone else. A deleted row's number still counts, as before.
--   • A new real household gets the next number after the highest ever issued, while fewer than 50 real
--     holders exist. So numbers can run past 50 (50 + the voided ones); exactly 50 households hold one.
--   • No real household's number changes. Nothing is renumbered, nothing is reissued.
--
-- WHAT IS A TEST ROW: is_test = true, or an address at getgrowsmart.com or flourishmoney.app (or one of
-- their subdomains). From now on the database itself enforces that:
--   • a join from those domains is stored with is_test = true and gets no number (insert trigger);
--   • setting is_test = true on a row that holds a number voids that number and clears the row's
--     founding_position (update trigger), so marking a test row later never costs a household its spot.
--
-- BILLING: waitlist_founding_number_for_email() (below) replaces 0016's lookup for the checkout. It
-- honours real holders only: not void, not ended, not a test row, not a test-domain address. 0016's
-- function is left as it is (it is not applied in production yet, and when it is, nothing calls it).
--
-- Needs 0014 and 0015. Does NOT need 0016. ADDITIVE: no row is deleted, no ledger row is removed.
-- Safe to run twice.
--
-- RUN ONLY AFTER AMANDA SAYS GO. Run the read-only dry run at the end of this file first.
-- -----------------------------------------------------------------------------

-- 1. The ledger learns "void". ended_at is 0016's column; added here too (identically) so this file does
--    not depend on 0016 having been applied.
alter table public.waitlist_founding_ledger add column if not exists void_at timestamptz;
alter table public.waitlist_founding_ledger add column if not exists ended_at timestamptz;

-- 2. Numbers may run past 50. The cap is now the count of real holders (the triggers below).
do $$
declare
  c record;
begin
  for c in
    select conname from pg_constraint
     where conrelid = 'public.waitlist_founding_ledger'::regclass and contype = 'c'
       and pg_get_constraintdef(oid) ~ '50'
  loop
    execute format('alter table public.waitlist_founding_ledger drop constraint %I', c.conname);
  end loop;
  if not exists (select 1 from pg_constraint where conname = 'waitlist_founding_ledger_position_positive') then
    alter table public.waitlist_founding_ledger add constraint waitlist_founding_ledger_position_positive check (position >= 1);
  end if;
  if exists (select 1 from pg_constraint where conname = 'waitlist_founding_position_range'
               and pg_get_constraintdef(oid) ~ '50') then
    alter table public.waitlist drop constraint waitlist_founding_position_range;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'waitlist_founding_position_range') then
    alter table public.waitlist add constraint waitlist_founding_position_range
      check (founding_position is null or founding_position >= 1);
  end if;
end $$;

-- 3. Is this a test address? getgrowsmart.com or flourishmoney.app, or a subdomain of either. Case and
--    whitespace are ignored. netlify/functions/_lib/foundingWaitlist.js holds the same two domains.
create or replace function public.waitlist_is_test_email(p_email text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select lower(regexp_replace(coalesce(p_email, ''), '\s+', '', 'g'))
         ~ '@([a-z0-9-]+\.)*(getgrowsmart\.com|flourishmoney\.app)$';
$$;

-- 4. A new row: test addresses are test rows; a test row gets no number; a real household gets the next
--    number while fewer than 50 real holders exist. Same lock as 0014, inside the insert's transaction.
create or replace function public.waitlist_assign_founding_position()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  k text;
  prior_position integer;
  prior_void timestamptz;
  holders integer;
  next_position integer;
begin
  new.founding_position := null;
  if public.waitlist_is_test_email(new.email) then
    new.is_test := true;
  end if;
  if new.is_test then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtext('public.waitlist.founding_position'));
  new.created_at := clock_timestamp();
  k := public.waitlist_email_key(new.email);
  -- The same household already on the list under another spelling of its address: no new number.
  if exists (select 1 from public.waitlist w where public.waitlist_email_key(w.email) = k) then
    return new;
  end if;
  -- A household numbered before (its row was deleted) gets that number back, unless it was voided.
  select l.position, l.void_at into prior_position, prior_void
    from public.waitlist_founding_ledger l where l.email_key = k;
  if prior_position is not null then
    if prior_void is null and not exists (select 1 from public.waitlist w where w.founding_position = prior_position) then
      new.founding_position := prior_position;
    end if;
    return new;
  end if;
  select count(*) into holders from public.waitlist_founding_ledger where void_at is null;
  if holders >= 50 then
    return new;
  end if;
  select coalesce(max(position), 0) + 1 into next_position from public.waitlist_founding_ledger;
  insert into public.waitlist_founding_ledger (position, email_key) values (next_position, k);
  new.founding_position := next_position;
  return new;
end;
$$;

-- 5. A row becomes a test row while it holds a number: void the number, clear the row. Final: setting
--    is_test back to false does not bring the number back, and the number is never issued again.
create or replace function public.waitlist_void_founding_on_test()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_test and old.founding_position is not null then
    perform pg_advisory_xact_lock(hashtext('public.waitlist.founding_position'));
    update public.waitlist_founding_ledger
       set void_at = now()
     where position = old.founding_position and void_at is null;
    new.founding_position := null;
  end if;
  return new;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'waitlist_founding_void_on_test' and tgrelid = 'public.waitlist'::regclass) then
    create trigger waitlist_founding_void_on_test
      before update of is_test on public.waitlist
      for each row execute function public.waitlist_void_founding_on_test();
  end if;
end $$;

-- 6. Billing's question: the founding number this email holds, or null. Real holders only: the number is
--    not void, its founding subscription never ended, it is still held by that address's row, and that
--    row is not a test row or a test address. Any number from 1 up (numbers run past 50 after voids; the
--    insert trigger keeps the holders to 50). SECURITY INVOKER; only the service role may call it.
create or replace function public.waitlist_founding_number_for_email(p_email text)
returns integer
language sql
stable
security invoker
set search_path = public
as $$
  select min(l.position)
  from public.waitlist_founding_ledger l
  join public.waitlist w
    on w.founding_position = l.position
   and public.waitlist_email_key(w.email) = l.email_key
  where l.email_key = public.waitlist_email_key(p_email)
    and coalesce(p_email, '') !~ '^\s*$'
    and not public.waitlist_is_test_email(p_email)
    and l.void_at is null
    and l.ended_at is null
    and not w.is_test
    and l.position >= 1;
$$;

-- 7. Grants. Functions are executable by PUBLIC by default; that default is revoked from each. The
--    triggers run on the service role's inserts and updates; billing calls the lookup as the service role.
revoke all on function public.waitlist_is_test_email(text) from public, anon, authenticated;
grant execute on function public.waitlist_is_test_email(text) to service_role;
revoke all on function public.waitlist_assign_founding_position() from public, anon, authenticated;
grant execute on function public.waitlist_assign_founding_position() to service_role;
revoke all on function public.waitlist_void_founding_on_test() from public, anon, authenticated;
grant execute on function public.waitlist_void_founding_on_test() to service_role;
revoke all on function public.waitlist_founding_number_for_email(text) from public, anon, authenticated;
grant execute on function public.waitlist_founding_number_for_email(text) to service_role;
-- The ledger keeps 0014's grants (service role only, RLS on); void_at needs no grant of its own.

-- 8. The data. Every row at the two test domains becomes a test row; a row already marked test that still
--    holds a number is voided too. The update trigger (5) voids each number and clears the row.
update public.waitlist
   set is_test = true
 where (public.waitlist_is_test_email(email) and not is_test)
    or (is_test and founding_position is not null);

-- 9. Amanda confirmed 2026-10-14: test sign-ups, rows deleted by her. These twelve numbers were issued to
--    her own test sign-ups (in bursts on 2026-10-08 9:58 pm, 10-09 8:32 am and 10-10 12:52 am ET) and their
--    rows are gone, so step 8 cannot reach them. Each is voided by its number, and only where no waitlist
--    row holds that number and no household's row has that number's address: a real household can never
--    be voided by this list. Voided numbers are never issued again. Running it twice changes nothing.
update public.waitlist_founding_ledger l
   set void_at = now()
 where l.position in (16, 17, 18, 19, 20, 21, 23, 24, 25, 26, 27, 28)
   and l.void_at is null
   and not exists (select 1 from public.waitlist w where w.founding_position = l.position)
   and not exists (select 1 from public.waitlist w where not w.is_test and public.waitlist_email_key(w.email) = l.email_key);

-- -----------------------------------------------------------------------------
-- READ-ONLY DRY RUN. Run BEFORE this file (it needs nothing this file creates: 0014's ledger and
-- waitlist_email_key only). One row. Numbers and dates only, never an address.
--
--   with ledger as (
--     select position, email_key, issued_at from public.waitlist_founding_ledger
--   ),
--   marked as (  -- step 8: rows at a test domain, or test rows, that still hold a number
--     select w.founding_position as position
--     from public.waitlist w
--     where w.founding_position is not null
--       and (lower(regexp_replace(w.email, '\s+', '', 'g')) ~ '@([a-z0-9-]+\.)*(getgrowsmart\.com|flourishmoney\.app)$'
--            or w.is_test)
--   ),
--   listed as (  -- step 9: the twelve Amanda confirmed, where no waitlist row holds the number
--     select l.position
--     from ledger l
--     where l.position in (16, 17, 18, 19, 20, 21, 23, 24, 25, 26, 27, 28)
--       and not exists (select 1 from public.waitlist w where w.founding_position = l.position)
--       and not exists (select 1 from public.waitlist w where not w.is_test and public.waitlist_email_key(w.email) = l.email_key)
--   ),
--   to_void as (select position from marked union select position from listed)
--   select (select array_agg(v.position order by v.position) from to_void v) as positions_to_void,
--          (select array_agg(to_char(l.issued_at at time zone 'America/New_York', 'YYYY-MM-DD HH24:MI') order by l.position)
--             from ledger l join to_void v using (position)) as issued_at_et,
--          (select count(*) from ledger) as issued_now,
--          (select count(*) from ledger) - (select count(*) from to_void) as real_holders_after,
--          greatest(0, 50 - ((select count(*) from ledger) - (select count(*) from to_void))) as spots_left_after;
--
--   Expected in production (2026-10-14): positions_to_void {16,17,18,19,20,21,23,24,25,26,27,28},
--   their twelve issue times, issued_now 28, real_holders_after 16, spots_left_after 34.
--
-- READ-ONLY CHECK AFTERWARDS. One row, numbers only:
--   select array_agg(position order by position) filter (where void_at is not null) as voided_positions,
--          count(*) as issued_now,
--          count(*) filter (where void_at is null) as real_holders_after,
--          greatest(0, 50 - count(*) filter (where void_at is null)) as spots_left_after,
--          max(position) + 1 as next_number
--   from public.waitlist_founding_ledger;
--
--   Expected: voided_positions {16,17,18,19,20,21,23,24,25,26,27,28}, issued_now 28,
--   real_holders_after 16, spots_left_after 34, next_number 29.
-- -----------------------------------------------------------------------------
