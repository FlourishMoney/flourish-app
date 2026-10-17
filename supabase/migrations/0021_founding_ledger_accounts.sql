-- 0021_founding_ledger_accounts.sql
-- -----------------------------------------------------------------------------
-- ONE LEDGER OF 50 FOUNDING POSITIONS FOR THE WEBSITE, THE IPHONE APP AND THE ANDROID APP
-- (founder's decision, 2026-10-17).
--
-- The rule. Existing waitlist positions keep their numbers. After them, positions go to new households in
-- the order they sign up, on any platform, until 50 are issued. One position per household. The founding
-- price is CAD 79.99 a year plus tax, locked while continuously subscribed.
--
-- Until now a position was issued only when a household joined the waitlist (0014). A household that
-- created an account (the same /api/beta signup on the website and in both apps) without joining never got
-- one. This adds the second way in, into the SAME ledger (public.waitlist_founding_ledger):
--   • WHEN: the moment the account's email address is confirmed by the link we send (auth.users
--     email_confirmed_at goes from null to a time, on an account whose app_metadata.email_confirmation is
--     "link"). That is the moment _lib/foundingCohort.js already requires before checkout offers the price,
--     and it means a signup nobody confirms, or a made-up address, never holds a position. An account
--     confirmed on creation ("auto", an invite code while signup was shut) never takes one, as before.
--   • ORDER: confirmation order, under the same transaction-scoped advisory lock as 0014's waitlist trigger,
--     so a confirmation and a waitlist join, or two confirmations, can never take the same number.
--   • ONE PER HOUSEHOLD: the ledger is keyed by the md5 of the normalised address (0014). An address that
--     already holds a number (it joined the waitlist first, or held one before its account was deleted)
--     keeps that number: the account is recorded against it (user_id) and nothing new is issued.
--   • NOT TESTS: an address on a waitlist row marked is_test, or on one of the founder's own domains
--     (founding_test_address below), never takes a position.
-- The waitlist keeps issuing exactly as before (0014's trigger is not changed): whichever comes first for an
-- address, the founding-spot form or a confirmed account, takes the next number.
--
-- THE ISSUING RULE FOR ACCOUNTS IS ONE FUNCTION, founding_issue_for_key(): the next number is the count of
-- the ledger plus one, none once 50 are issued, never reissued. It is the same rule as 0014's waitlist
-- trigger. PR #69's 0017 (not applied) changes that rule (numbers past 50, a cap of 50 real holders); if it
-- lands, this one function changes with it.
--
-- THE LOOKUP. waitlist_founding_position_for_email (0016) is replaced, same signature and grants, so every
-- caller (checkout, the founding link, the confirm flow) reads the same answer: an address's number counts
-- when it has not ended, is 1 to 50, is not a test address, and is either held by a live waitlist row (as
-- before) or recorded against an account (new). So a waitlist household that later signs up in an app keeps
-- its original number, even if its waitlist row was deleted with an earlier account.
--
-- THE COUNT. /api/founding and the waitlist form's "spots full" check count this ledger already; the
-- positions issued to accounts are rows in it, so the landing figure includes them with no change.
--
-- ADDITIVE. Two columns on the ledger (source, user_id), new functions, and a trigger on auth.users created
-- DISABLED. Nothing is dropped. The one replaced function is restored by the rollback below.
--
-- TO APPLY (Supabase SQL editor), production only on the founder's go, after a dry run on a copy:
--   1. Run this file. The trigger is created disabled: no account takes a number yet.
--   2. READ-ONLY CHECK of what step 3 would number (counts only):
--        select count(*) as accounts_to_number
--        from auth.users u
--        where u.email_confirmed_at is not null
--          and u.raw_app_meta_data->>'email_confirmation' = 'link'
--          and not public.founding_test_address(u.email)
--          and not exists (select 1 from public.waitlist_founding_ledger l
--                          where l.email_key = public.waitlist_email_key(u.email));
--   3. select public.founding_accounts_start();   -- ONCE. Numbers the accounts already confirmed by link,
--      in confirmation order, after every number already issued, then enables the trigger. A second call
--      raises an error and changes nothing.
--   READ-ONLY CHECK afterwards:
--      select source, count(*) from public.waitlist_founding_ledger group by source;
--
-- ROLLBACK (Supabase SQL editor). Numbers already issued to accounts stay in the ledger and stay spent (a
-- number is never freed); without this migration's lookup those households are offered the regular prices.
--   drop trigger if exists founding_account_confirmed on auth.users;
--   drop function if exists public.founding_on_account_confirmed();
--   drop function if exists public.founding_accounts_start();
--   drop function if exists public.founding_issue_for_account(uuid, text);
--   drop function if exists public.founding_issue_for_key(text, text, uuid);
--   -- 0016's lookup, exactly:
--   create or replace function public.waitlist_founding_position_for_email(p_email text)
--   returns integer language sql stable security invoker set search_path = public as $$
--     select min(l.position)
--     from public.waitlist_founding_ledger l
--     join public.waitlist w
--       on w.founding_position = l.position
--      and public.waitlist_email_key(w.email) = l.email_key
--     where l.email_key = public.waitlist_email_key(p_email)
--       and coalesce(p_email, '') !~ '^\s*$'
--       and l.ended_at is null
--       and not w.is_test
--       and l.position between 1 and 50;
--   $$;
--   drop function if exists public.founding_test_address(text);
--   alter table public.waitlist_founding_ledger drop constraint if exists waitlist_founding_ledger_source_check;
--   alter table public.waitlist_founding_ledger drop column if exists user_id;
--   alter table public.waitlist_founding_ledger drop column if exists source;
-- (tests/foundingLedger.sql.test.cjs runs this rollback and checks the database is as 0016 left it.)
-- -----------------------------------------------------------------------------
-- grants: service_role only

-- 1. Where a number came from, and the account recorded against it. No foreign key to auth.users: deleting
--    an account must never delete, free or renumber its position (0014's rule).
alter table public.waitlist_founding_ledger add column if not exists source text not null default 'waitlist';
alter table public.waitlist_founding_ledger add column if not exists user_id uuid;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'waitlist_founding_ledger_source_check') then
    alter table public.waitlist_founding_ledger add constraint waitlist_founding_ledger_source_check
      check (source in ('waitlist', 'account'));
  end if;
end $$;

-- 2. The founder's own test addresses never take a position: her domains, whatever the mailbox.
create or replace function public.founding_test_address(p_email text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select lower(regexp_replace(coalesce(p_email, ''), '\s+', '', 'g')) ~ '@(getgrowsmart\.com|flourishmoney\.app)$';
$$;

-- 3. THE ISSUING RULE FOR ACCOUNTS, in one place. The number this address holds, or the next one, or null
--    once 50 are issued. Takes the same advisory lock as 0014's waitlist trigger, so it waits for a waitlist
--    join (or another confirmation) to commit, and two can never share a number (the ledger's primary key
--    would refuse it anyway). An address already in the ledger keeps its number; the account is recorded.
create or replace function public.founding_issue_for_key(p_key text, p_source text, p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  prior integer;
  issued integer;
begin
  if p_key is null or p_source not in ('waitlist', 'account') then
    return null;
  end if;
  perform pg_advisory_xact_lock(hashtext('public.waitlist.founding_position'));
  select l.position into prior from public.waitlist_founding_ledger l where l.email_key = p_key;
  if prior is not null then
    if p_user_id is not null then
      update public.waitlist_founding_ledger set user_id = p_user_id
       where position = prior and user_id is distinct from p_user_id;
    end if;
    return prior;
  end if;
  select count(*) into issued from public.waitlist_founding_ledger;
  if issued >= 50 then
    return null;
  end if;
  insert into public.waitlist_founding_ledger (position, email_key, source, user_id)
  values (issued + 1, p_key, p_source, p_user_id);
  return issued + 1;
end;
$$;

-- 4. An account whose address is confirmed: its number, or null when it may not take one (no address, a test
--    address, or an address on a waitlist row marked is_test).
create or replace function public.founding_issue_for_account(p_user_id uuid, p_email text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  k text;
begin
  if p_user_id is null or coalesce(p_email, '') ~ '^\s*$' or public.founding_test_address(p_email) then
    return null;
  end if;
  k := public.waitlist_email_key(p_email);
  if exists (select 1 from public.waitlist w where public.waitlist_email_key(w.email) = k and w.is_test) then
    return null;
  end if;
  return public.founding_issue_for_key(k, 'account', p_user_id);
end;
$$;

-- 5. The trigger: an address confirmed by our link takes its number in the same transaction. A failure here
--    must never stop someone confirming their address, so it is caught, logged as a warning, and the
--    confirmation goes ahead without a number (the founder can issue it by hand with step 4's function).
create or replace function public.founding_on_account_confirmed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email_confirmed_at is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.email_confirmed_at is not null then
    return new;
  end if;
  if coalesce(new.raw_app_meta_data->>'email_confirmation', '') <> 'link' then
    return new;
  end if;
  begin
    perform public.founding_issue_for_account(new.id, new.email);
  exception when others then
    raise warning 'founding position not issued for a confirmed account: %', sqlerrm;
  end;
  return new;
end;
$$;

-- Created DISABLED, and only the first time, as 0014 does: enabled by founding_accounts_start().
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'founding_account_confirmed' and tgrelid = 'auth.users'::regclass) then
    create trigger founding_account_confirmed
      after insert or update of email_confirmed_at on auth.users
      for each row execute function public.founding_on_account_confirmed();
    alter table auth.users disable trigger founding_account_confirmed;
  end if;
end $$;

-- 6. Step 3: number the accounts already confirmed by link, in confirmation order (then created_at, then id),
--    after every number already issued; then switch the trigger on. RUNS ONCE.
create or replace function public.founding_accounts_start()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  u record;
  n integer := 0;
begin
  perform pg_advisory_xact_lock(hashtext('public.waitlist.founding_position'));
  if exists (select 1 from pg_trigger where tgname = 'founding_account_confirmed'
               and tgrelid = 'auth.users'::regclass and tgenabled <> 'D') then
    raise exception 'founding_accounts_start() has already run. Founding numbers are set once and never renumbered; nothing was changed.'
      using errcode = 'P0001';
  end if;
  for u in
    select id, email from auth.users
    where email_confirmed_at is not null
      and coalesce(raw_app_meta_data->>'email_confirmation', '') = 'link'
    order by email_confirmed_at, created_at, id
  loop
    if public.founding_issue_for_account(u.id, u.email) is not null then
      n := n + 1;
    end if;
  end loop;
  alter table auth.users enable trigger founding_account_confirmed;
  return n;
end;
$$;

-- 7. THE LOOKUP every caller uses (checkout, the founding link, the confirm flow), replaced in place: same
--    name, signature, SECURITY INVOKER and grants as 0016. An address's number counts when it has not
--    ended, is 1 to 50, is not a test address, and is held by a live waitlist row or recorded against an
--    account.
create or replace function public.waitlist_founding_position_for_email(p_email text)
returns integer
language sql
stable
security invoker
set search_path = public
as $$
  select min(l.position)
  from public.waitlist_founding_ledger l
  where l.email_key = public.waitlist_email_key(p_email)
    and coalesce(p_email, '') !~ '^\s*$'
    and l.ended_at is null
    and l.position between 1 and 50
    and not public.founding_test_address(p_email)
    and not exists (select 1 from public.waitlist t
                    where public.waitlist_email_key(t.email) = l.email_key and t.is_test)
    and (exists (select 1 from public.waitlist w
                 where w.founding_position = l.position and public.waitlist_email_key(w.email) = l.email_key)
         or l.user_id is not null);
$$;

-- grants: service_role only. Nothing here is callable from the browser (anon, authenticated).
revoke all on function public.founding_test_address(text) from public, anon, authenticated;
grant execute on function public.founding_test_address(text) to service_role;
revoke all on function public.founding_issue_for_key(text, text, uuid) from public, anon, authenticated;
revoke all on function public.founding_issue_for_account(uuid, text) from public, anon, authenticated;
grant execute on function public.founding_issue_for_account(uuid, text) to service_role;
revoke all on function public.founding_on_account_confirmed() from public, anon, authenticated;
revoke all on function public.founding_accounts_start() from public, anon, authenticated;
-- waitlist_founding_position_for_email keeps 0016's grants (create or replace does not change them):
-- service_role only.
