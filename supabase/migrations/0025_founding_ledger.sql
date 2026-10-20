-- 0025_founding_ledger.sql
-- -----------------------------------------------------------------------------
-- THE FOUNDING 50: ONE LEDGER, REAL HOUSEHOLDS ONLY, ANY PLATFORM (Amanda, 2026-10-20).
--
-- Replaces 0017 (PR #69, test sign-ups never hold a number) and 0021 (PR #83, confirmed accounts take
-- numbers too). Neither was ever applied; both files are gone and this one does what both did, with one
-- issuing rule instead of two that disagreed. The rule:
--   • Existing waitlist numbers keep their numbers. Nothing is renumbered, nothing is reissued.
--   • After them, numbers go to new households in the order they arrive: a join on the founding-spot form,
--     or an account whose address is confirmed by our link, on the website, the iPhone app or the Android
--     app. One number per household (the ledger is keyed by the md5 of the normalised address, 0014).
--   • Only REAL households hold a seat. A test row (is_test, or an address at getgrowsmart.com or
--     flourishmoney.app or a subdomain) never gets a number, and a number held by one is VOIDED: kept in the
--     ledger, never reissued, never counted. So numbers can run past 50, and exactly 50 real households can
--     hold one.
--   • Beta founders (profiles.founder_flag) are outside the 50. They keep the founding price through their
--     flag (_lib/foundingCohort.js), never take a number, and a number one already holds is voided.
-- Billing asks waitlist_founding_number_for_email(); 0016's waitlist_founding_position_for_email() is
-- replaced with the same answer, so every caller agrees.
--
-- RUNS AFTER 0009, 0010, 0014, 0015, 0016, 0023 and 0024. Needs 0014 and 0015; works whether or not 0016
-- ran (it adds 0016's ended_at column if missing). Safe to run twice: the second run changes nothing.
--
-- RUN THE READ-ONLY DRY RUN AT THE END OF THIS FILE FIRST, then the whole file in one go (it is one
-- transaction), then the check after it. The dry run's spots_left_after is what /api/founding reads after.
-- -----------------------------------------------------------------------------

begin;

-- 1. The ledger learns where a number came from, who it is recorded against, and "void".
alter table public.waitlist_founding_ledger add column if not exists ended_at timestamptz;   -- 0016's, if missing
alter table public.waitlist_founding_ledger add column if not exists void_at timestamptz;
alter table public.waitlist_founding_ledger add column if not exists void_reason text;
alter table public.waitlist_founding_ledger add column if not exists source text not null default 'waitlist';
alter table public.waitlist_founding_ledger add column if not exists user_id uuid;   -- no foreign key: a deleted account never frees a number
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'waitlist_founding_ledger_source_check') then
    alter table public.waitlist_founding_ledger add constraint waitlist_founding_ledger_source_check
      check (source in ('waitlist', 'account'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'waitlist_founding_ledger_void_check') then
    alter table public.waitlist_founding_ledger add constraint waitlist_founding_ledger_void_check
      check ((void_at is null and void_reason is null) or (void_at is not null and void_reason in ('test', 'beta_founder')));
  end if;
end $$;

-- 2. Numbers may run past 50: the cap is the count of real holders (founding_issue_for_key below).
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

-- 3. Waitlist positions this file clears (a test row's, a beta founder's), with what they were, so the
--    rollback can put each one back. Written only by this file's own data steps.
create table if not exists public.founding_0025_cleared (
  waitlist_id       uuid        primary key,
  founding_position integer     not null,
  reason            text        not null check (reason in ('test', 'beta_founder')),
  cleared_at        timestamptz not null default now()
);
alter table public.founding_0025_cleared enable row level security;
-- grants: service_role only
grant all privileges on table public.founding_0025_cleared to service_role;
revoke all on table public.founding_0025_cleared from anon, authenticated;

-- Whether confirmed accounts take seats yet: one row, set once by founding_accounts_start(). A flag rather
-- than ALTER TABLE ... DISABLE TRIGGER, because auth.users belongs to Supabase's auth admin, and only its
-- owner may alter it; creating a trigger on it is allowed (0001's handle_new_user does).
create table if not exists public.founding_settings (
  id                  boolean     primary key default true check (id),
  accounts_started_at timestamptz
);
alter table public.founding_settings enable row level security;
-- grants: service_role only
grant all privileges on table public.founding_settings to service_role;
revoke all on table public.founding_settings from anon, authenticated;
insert into public.founding_settings (id) values (true) on conflict (id) do nothing;

-- 4. Who is not a household. netlify/functions/_lib/foundingCohort.js holds the same two domains.
create or replace function public.waitlist_is_test_email(p_email text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select lower(regexp_replace(coalesce(p_email, ''), '\s+', '', 'g'))
         ~ '@([a-z0-9-]+\.)*(getgrowsmart\.com|flourishmoney\.app)$';
$$;

-- A beta founder's address: an account with founder_flag whose email has this key.
create or replace function public.founding_is_beta_founder_key(p_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from auth.users u join public.profiles p on p.user_id = u.id
                 where p.founder_flag and public.waitlist_email_key(u.email) = p_key);
$$;

-- 5. THE ISSUING RULE, in one place, for the waitlist and for accounts. The number this address holds, the
--    next one, or null: null for a beta founder, for an address whose number was voided (never reissued),
--    and once 50 real households hold a number. The next number follows the highest ever issued. Same
--    transaction-scoped advisory lock as 0014, so two arrivals can never take the same number.
create or replace function public.founding_issue_for_key(p_key text, p_source text, p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  prior integer;
  prior_void timestamptz;
  holders integer;
  next_position integer;
begin
  if p_key is null or p_source not in ('waitlist', 'account') then
    return null;
  end if;
  perform pg_advisory_xact_lock(hashtext('public.waitlist.founding_position'));
  if public.founding_is_beta_founder_key(p_key) then
    return null;
  end if;
  select l.position, l.void_at into prior, prior_void from public.waitlist_founding_ledger l where l.email_key = p_key;
  if prior is not null then
    if prior_void is not null then
      return null;
    end if;
    if p_user_id is not null then
      update public.waitlist_founding_ledger set user_id = p_user_id
       where position = prior and user_id is distinct from p_user_id;
    end if;
    return prior;
  end if;
  select count(*) into holders from public.waitlist_founding_ledger where void_at is null;
  if holders >= 50 then
    return null;
  end if;
  select coalesce(max(position), 0) + 1 into next_position from public.waitlist_founding_ledger;
  insert into public.waitlist_founding_ledger (position, email_key, source, user_id)
  values (next_position, p_key, p_source, p_user_id);
  return next_position;
end;
$$;

-- 6. A new waitlist row (0014's trigger, same name): a test address is a test row; a test row gets no
--    number; the same household under another spelling gets none; otherwise the issuing rule decides.
create or replace function public.waitlist_assign_founding_position()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  k text;
  n integer;
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
  if exists (select 1 from public.waitlist w where public.waitlist_email_key(w.email) = k) then
    return new;
  end if;
  n := public.founding_issue_for_key(k, 'waitlist', null);
  if n is not null and not exists (select 1 from public.waitlist w where w.founding_position = n) then
    new.founding_position := n;
  end if;
  return new;
end;
$$;

-- 7. A row marked is_test later: its number, and any number its address holds, is voided, and the row's
--    founding_position cleared. Final: setting is_test back to false does not bring it back.
create or replace function public.waitlist_void_founding_on_test()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_test and not old.is_test then
    perform pg_advisory_xact_lock(hashtext('public.waitlist.founding_position'));
    update public.waitlist_founding_ledger
       set void_at = now(), void_reason = 'test'
     where void_at is null
       and (position = old.founding_position or email_key = public.waitlist_email_key(new.email));
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

-- 8. An account whose address is confirmed by our link: its number, or null when it may not take one (no
--    address, a test address, an address on a test row, or a beta founder's account).
create or replace function public.founding_issue_for_account(p_user_id uuid, p_email text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  k text;
begin
  if p_user_id is null or coalesce(p_email, '') ~ '^\s*$' or public.waitlist_is_test_email(p_email) then
    return null;
  end if;
  if exists (select 1 from public.profiles p where p.user_id = p_user_id and p.founder_flag) then
    return null;
  end if;
  k := public.waitlist_email_key(p_email);
  if exists (select 1 from public.waitlist w where public.waitlist_email_key(w.email) = k and w.is_test) then
    return null;
  end if;
  return public.founding_issue_for_key(k, 'account', p_user_id);
end;
$$;

-- The moment an address is confirmed by link, in the same transaction. A failure here never stops anyone
-- confirming their address: it is caught, logged as a warning, and the confirmation goes ahead.
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
  if not exists (select 1 from public.founding_settings where accounts_started_at is not null) then
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

-- Created the first time only. It does nothing until founding_settings says accounts take seats (step 12).
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'founding_account_confirmed' and tgrelid = 'auth.users'::regclass) then
    create trigger founding_account_confirmed
      after insert or update of email_confirmed_at on auth.users
      for each row execute function public.founding_on_account_confirmed();
  end if;
end $$;

-- Numbers the accounts already confirmed by link, in confirmation order (then created_at, then id), after
-- every number already issued; then sets the flag, so from then on each confirmation takes its number as it
-- happens. RUNS ONCE: a second call raises and changes nothing.
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
  if exists (select 1 from public.founding_settings where accounts_started_at is not null) then
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
  update public.founding_settings set accounts_started_at = now() where id;
  return n;
end;
$$;

-- 9. THE LOOKUP billing asks (checkout, the founding link, the confirm flow): the number this address holds
--    as a real household, or null. Not void, not ended, not a test address, no test row for the address,
--    and held by the address's live waitlist row or recorded against an account. Any number from 1 up (the
--    issuing rule keeps the holders to 50). SECURITY INVOKER; only the service role may call it.
create or replace function public.waitlist_founding_number_for_email(p_email text)
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
    and not public.waitlist_is_test_email(p_email)
    and l.void_at is null
    and l.ended_at is null
    and l.position >= 1
    and not exists (select 1 from public.waitlist t
                    where public.waitlist_email_key(t.email) = l.email_key and t.is_test)
    and (exists (select 1 from public.waitlist w
                 where w.founding_position = l.position and public.waitlist_email_key(w.email) = l.email_key)
         or l.user_id is not null);
$$;

-- 0016's name, the same answer, so any caller still using it agrees.
create or replace function public.waitlist_founding_position_for_email(p_email text)
returns integer
language sql
stable
security invoker
set search_path = public
as $$
  select public.waitlist_founding_number_for_email(p_email);
$$;

-- 10. Grants. Functions are executable by PUBLIC by default; that default is revoked from each.
revoke all on function public.waitlist_is_test_email(text) from public, anon, authenticated;
grant execute on function public.waitlist_is_test_email(text) to service_role;
revoke all on function public.founding_is_beta_founder_key(text) from public, anon, authenticated;
revoke all on function public.founding_issue_for_key(text, text, uuid) from public, anon, authenticated;
revoke all on function public.waitlist_assign_founding_position() from public, anon, authenticated;
grant execute on function public.waitlist_assign_founding_position() to service_role;
revoke all on function public.waitlist_void_founding_on_test() from public, anon, authenticated;
grant execute on function public.waitlist_void_founding_on_test() to service_role;
revoke all on function public.founding_issue_for_account(uuid, text) from public, anon, authenticated;
grant execute on function public.founding_issue_for_account(uuid, text) to service_role;
revoke all on function public.founding_on_account_confirmed() from public, anon, authenticated;
revoke all on function public.founding_accounts_start() from public, anon, authenticated;
revoke all on function public.waitlist_founding_number_for_email(text) from public, anon, authenticated;
grant execute on function public.waitlist_founding_number_for_email(text) to service_role;
revoke all on function public.waitlist_founding_position_for_email(text) from public, anon, authenticated;
grant execute on function public.waitlist_founding_position_for_email(text) to service_role;

-- 11. THE DATA. Voids come first, so the seats they free are there for the accounts numbered in step 12.
-- 11a. Rows at a test domain become test rows; a test row that still holds a number is voided (the step 7
--      trigger voids the number and clears the row; its old position is kept for the rollback first).
insert into public.founding_0025_cleared (waitlist_id, founding_position, reason)
select w.id, w.founding_position, 'test' from public.waitlist w
 where w.founding_position is not null and (public.waitlist_is_test_email(w.email) or w.is_test)
on conflict (waitlist_id) do nothing;
update public.waitlist set is_test = true
 where public.waitlist_is_test_email(email) and not is_test;
update public.waitlist_founding_ledger l set void_at = now(), void_reason = 'test'
  from public.waitlist w
 where w.is_test and w.founding_position = l.position and l.void_at is null;
update public.waitlist set founding_position = null where is_test and founding_position is not null;

-- 11b. Amanda confirmed 2026-10-14: these twelve numbers went to her own test sign-ups (issued 2026-10-08
--      to 10-10), whose rows she deleted, so 11a cannot reach them. Voided by number, and only a number
--      issued before 2026-10-14 that no waitlist row holds, no household's row has the address of, and no
--      account is recorded against: a real household can never be voided by this list.
update public.waitlist_founding_ledger l set void_at = now(), void_reason = 'test'
 where l.position in (16, 17, 18, 19, 20, 21, 23, 24, 25, 26, 27, 28)
   and l.void_at is null
   and l.issued_at < timestamptz '2026-10-14 00:00:00+00'
   and l.user_id is null
   and not exists (select 1 from public.waitlist w where w.founding_position = l.position)
   and not exists (select 1 from public.waitlist w where not w.is_test and public.waitlist_email_key(w.email) = l.email_key);

-- 11c. Beta founders are outside the 50: a number a beta founder's address holds is voided, and the row
--      cleared (kept for the rollback). They keep the founding price through founder_flag.
insert into public.founding_0025_cleared (waitlist_id, founding_position, reason)
select w.id, w.founding_position, 'beta_founder' from public.waitlist w
 where w.founding_position is not null and public.founding_is_beta_founder_key(public.waitlist_email_key(w.email))
on conflict (waitlist_id) do nothing;
update public.waitlist_founding_ledger l set void_at = now(), void_reason = 'beta_founder'
 where l.void_at is null and public.founding_is_beta_founder_key(l.email_key);
update public.waitlist w set founding_position = null
 where w.founding_position is not null and public.founding_is_beta_founder_key(public.waitlist_email_key(w.email));

-- 12. Accounts already confirmed by link take their numbers, once (founding_accounts_start). A second run
--     of this file finds the flag set and skips this.
do $$
begin
  if not exists (select 1 from public.founding_settings where accounts_started_at is not null) then
    perform public.founding_accounts_start();
  end if;
end $$;

commit;

-- -----------------------------------------------------------------------------
-- READ-ONLY DRY RUN. Run BEFORE this file. It needs only 0014 (the ledger, waitlist_email_key), auth.users
-- and profiles. One row; numbers only, never an address. spots_left_after is what /api/founding will read.
--
--   with ledger as (
--     select position, email_key, issued_at from public.waitlist_founding_ledger
--   ),
--   testy as (
--     select w.founding_position as position from public.waitlist w
--     where w.founding_position is not null
--       and (w.is_test or lower(regexp_replace(w.email, '\s+', '', 'g')) ~ '@([a-z0-9-]+\.)*(getgrowsmart\.com|flourishmoney\.app)$')
--   ),
--   orphans as (
--     select l.position from ledger l
--     where l.position in (16, 17, 18, 19, 20, 21, 23, 24, 25, 26, 27, 28)
--       and l.issued_at < timestamptz '2026-10-14 00:00:00+00'
--       and not exists (select 1 from public.waitlist w where w.founding_position = l.position)
--       and not exists (select 1 from public.waitlist w where not w.is_test and public.waitlist_email_key(w.email) = l.email_key)
--   ),
--   founders as (
--     select l.position from ledger l
--     where exists (select 1 from auth.users u join public.profiles p on p.user_id = u.id
--                   where p.founder_flag and public.waitlist_email_key(u.email) = l.email_key)
--   ),
--   to_void as (select position from testy union select position from orphans union select position from founders),
--   holders as (select (select count(*) from ledger) - (select count(*) from to_void) as n),
--   accounts as (
--     select count(*) as n from auth.users u
--     where u.email_confirmed_at is not null
--       and coalesce(u.raw_app_meta_data->>'email_confirmation', '') = 'link'
--       and lower(regexp_replace(coalesce(u.email, ''), '\s+', '', 'g')) !~ '@([a-z0-9-]+\.)*(getgrowsmart\.com|flourishmoney\.app)$'
--       and not exists (select 1 from public.profiles p where p.user_id = u.id and p.founder_flag)
--       and not exists (select 1 from ledger l where l.email_key = public.waitlist_email_key(u.email))
--       and not exists (select 1 from public.waitlist w where w.is_test and public.waitlist_email_key(w.email) = public.waitlist_email_key(u.email))
--   )
--   select (select count(*) from ledger)                                         as issued_now,
--          greatest(0, 50 - (select count(*) from ledger))                       as spots_left_now,
--          (select array_agg(position order by position) from testy)             as void_test_rows,
--          (select array_agg(position order by position) from orphans)           as void_confirmed_orphans,
--          (select array_agg(position order by position) from founders)          as void_beta_founders,
--          (select count(*) from ledger where issued_at >= timestamptz '2026-10-14 00:00:00+00') as issued_since_oct_14,
--          (select n from holders)                                               as real_holders_after_voids,
--          (select n from accounts)                                              as accounts_to_number,
--          least((select n from accounts), greatest(0, 50 - (select n from holders))) as accounts_numbered,
--          greatest(0, 50 - (select n from holders) - least((select n from accounts), greatest(0, 50 - (select n from holders)))) as spots_left_after;
--
-- READ-ONLY CHECK AFTERWARDS. One row, numbers only; spots_left must equal the dry run's spots_left_after.
--
--   select count(*)                                                       as issued,
--          count(*) filter (where void_at is null)                        as real_holders,
--          greatest(0, 50 - count(*) filter (where void_at is null))      as spots_left,
--          count(*) filter (where void_reason = 'test')                   as void_test,
--          count(*) filter (where void_reason = 'beta_founder')           as void_beta_founders,
--          count(*) filter (where source = 'account')                     as from_accounts,
--          max(position) + 1                                              as next_number,
--          (select accounts_started_at is not null from public.founding_settings) as accounts_take_seats
--   from public.waitlist_founding_ledger;
--
-- A TEST ACCOUNT FOUND LATER (an address not at the two domains): void its number by number, once.
--   update public.waitlist_founding_ledger set void_at = now(), void_reason = 'test'
--    where position = <the number> and void_at is null;
-- -----------------------------------------------------------------------------
-- ROLLBACK (puts the database back as 0016 left it, except one inert trigger on auth.users). Run as one block. Numbers issued since stay in the
-- ledger and stay spent (a number is never freed); without this file's lookup an account-only number is
-- offered the standard prices. The 1 to 50 checks come back only if no number past 50 was ever issued.
--
--   begin;
--   -- The trigger on auth.users stays (dropping it needs the auth admin, who owns that table) and does nothing:
--   create or replace function public.founding_on_account_confirmed()
--   returns trigger language plpgsql security definer set search_path = public as $$
--   begin
--     return new;
--   end;
--   $$;
--   drop function if exists public.founding_accounts_start();
--   drop function if exists public.founding_issue_for_account(uuid, text);
--   drop trigger if exists waitlist_founding_void_on_test on public.waitlist;
--   drop function if exists public.waitlist_void_founding_on_test();
--   create or replace function public.waitlist_assign_founding_position()
--   returns trigger language plpgsql security definer set search_path = public as $$
--   declare
--     k text;
--     prior integer;
--     issued integer;
--   begin
--     new.founding_position := null;
--     if new.is_test then
--       return new;
--     end if;
--     perform pg_advisory_xact_lock(hashtext('public.waitlist.founding_position'));
--     new.created_at := clock_timestamp();
--     k := public.waitlist_email_key(new.email);
--     if exists (select 1 from public.waitlist w where public.waitlist_email_key(w.email) = k) then
--       return new;
--     end if;
--     select l.position into prior from public.waitlist_founding_ledger l where l.email_key = k;
--     if prior is not null then
--       if not exists (select 1 from public.waitlist w where w.founding_position = prior) then
--         new.founding_position := prior;
--       end if;
--       return new;
--     end if;
--     select count(*) into issued from public.waitlist_founding_ledger;
--     if issued >= 50 then
--       return new;
--     end if;
--     insert into public.waitlist_founding_ledger (position, email_key) values (issued + 1, k);
--     new.founding_position := issued + 1;
--     return new;
--   end;
--   $$;
--   drop function if exists public.founding_issue_for_key(text, text, uuid);
--   drop function if exists public.founding_is_beta_founder_key(text);
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
--   drop function if exists public.waitlist_founding_number_for_email(text);
--   drop function if exists public.waitlist_is_test_email(text);
--   update public.waitlist w set founding_position = c.founding_position
--     from public.founding_0025_cleared c
--    where c.waitlist_id = w.id and w.founding_position is null
--      and not exists (select 1 from public.waitlist o where o.founding_position = c.founding_position);
--   drop table public.founding_0025_cleared;
--   drop table public.founding_settings;
--   alter table public.waitlist_founding_ledger drop constraint if exists waitlist_founding_ledger_void_check;
--   alter table public.waitlist_founding_ledger drop constraint if exists waitlist_founding_ledger_source_check;
--   alter table public.waitlist_founding_ledger drop column if exists user_id;
--   alter table public.waitlist_founding_ledger drop column if exists source;
--   alter table public.waitlist_founding_ledger drop column if exists void_reason;
--   alter table public.waitlist_founding_ledger drop column if exists void_at;
--   do $rb$ begin
--     if (select coalesce(max(position), 0) from public.waitlist_founding_ledger) <= 50 then
--       alter table public.waitlist_founding_ledger drop constraint if exists waitlist_founding_ledger_position_positive;
--       alter table public.waitlist_founding_ledger add constraint waitlist_founding_ledger_position_check check (position between 1 and 50);
--       alter table public.waitlist drop constraint if exists waitlist_founding_position_range;
--       alter table public.waitlist add constraint waitlist_founding_position_range
--         check (founding_position is null or (founding_position between 1 and 50));
--     end if;
--   end $rb$;
--   commit;
-- -----------------------------------------------------------------------------
