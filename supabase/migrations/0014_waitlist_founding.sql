-- 0014_waitlist_founding.sql
-- -----------------------------------------------------------------------------
-- THE FOUNDING OFFER ON THE WAITLIST (Amanda's decision, 2026-10-06).
--
-- The first 50 households on the waitlist, in the order they joined (created_at), get the founding
-- price. Test rows never count: is_test marks them. Existing rows count, in created_at order.
--
-- A NUMBER IS ISSUED ONCE AND NEVER CHANGES. public.waitlist_founding_ledger records every number
-- issued, 1 to 50, against the md5 of the household's normalised address. Nothing deletes from it:
--   • a household that never pays keeps its number;
--   • a household whose waitlist row is deleted (account deletion erases it) does not free its number
--     for anyone else, and gets the SAME number back if it joins again;
--   • a founding subscription that ends is recorded here (ended_at, migration 0016), so the founding
--     price does not come back even if the account and the waitlist row are deleted and re-created.
-- waitlist_founding_start() numbers the existing rows ONCE. A second run raises an error and changes
-- nothing, so nobody's number ever shifts.
--
-- ADDITIVE. Nothing is dropped or rewritten except founding_position, which only the trigger and
-- waitlist_founding_start() write. Grants for the columns and functions are in 0015.
--
-- The spots-left figure on the landing page is netlify/functions/founding.js: 50 less the numbers
-- issued (a count of the ledger), never below 0. Until start() has run the ledger is empty, the
-- endpoint answers "unavailable", and the page shows no number.
--
-- TO APPLY, in this order (Supabase SQL editor):
--   1. Run this file. It adds the columns, the ledger and the functions, and the trigger, created
--      DISABLED, so no signup gets a number before the existing rows have theirs.
--   2. Run 0015_waitlist_founding_grants.sql, then 0016_waitlist_founding_billing.sql.
--   3. Mark every other test row. Find each one in the Table editor and set is_test = true (or, in the
--      SQL editor, update public.waitlist set is_test = true where id = '<that row id>';). Never put an
--      address in a committed file. THIS MUST BE DONE BEFORE STEP 4: after it, a test row keeps the
--      number it was given (the lookup ignores it, but the number is spent).
--   4. select public.waitlist_founding_start();   -- ONCE. A second call raises an error.
--      This numbers every eligible row 1 to 50 in created_at order, then enables the trigger. From then
--      on each new signup gets the next number inside the insert's own transaction, under an advisory
--      lock, so two signups can never get the same one.
--   READ-ONLY CHECK afterwards (counts only):
--      select count(*) filter (where not is_test) as eligible,
--             count(founding_position) as positioned,
--             count(*) filter (where is_test) as test_rows,
--             (select count(*) from public.waitlist_founding_ledger) as issued
--      from public.waitlist;
-- -----------------------------------------------------------------------------
-- grants: service_role only

alter table public.waitlist add column if not exists is_test boolean not null default false;
alter table public.waitlist add column if not exists founding_position integer;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'waitlist_founding_position_range') then
    alter table public.waitlist add constraint waitlist_founding_position_range
      check (founding_position is null or (founding_position between 1 and 50));
  end if;
end $$;

-- One household per position.
create unique index if not exists waitlist_founding_position_key
  on public.waitlist (founding_position) where founding_position is not null;

-- The key an address is known by in the ledger: the md5 of the address with case and whitespace
-- dropped (an email address cannot contain whitespace). So the ledger holds no address.
create or replace function public.waitlist_email_key(p_email text)
returns text
language sql
immutable
set search_path = public
as $$
  select md5(lower(regexp_replace(coalesce(p_email, ''), '\s+', '', 'g')));
$$;

-- Every founding number ever issued. Rows are only ever inserted (by the trigger and start()) and,
-- in 0016, stamped with ended_at. Never deleted, never renumbered.
create table if not exists public.waitlist_founding_ledger (
  position   integer     primary key check (position between 1 and 50),
  email_key  text        not null unique,
  issued_at  timestamptz not null default now()
);
alter table public.waitlist_founding_ledger enable row level security;
revoke all on table public.waitlist_founding_ledger from anon, authenticated;
grant select, insert, update on table public.waitlist_founding_ledger to service_role;

-- The number for a new eligible row, or null. Runs BEFORE INSERT, inside the insert's own transaction,
-- under a transaction-scoped advisory lock: a second signup waits for the first to commit. If the
-- insert then fails (a repeat address is a unique violation), the ledger row goes with it.
-- created_at is set to the moment the row takes the lock. Its default, now(), is when the transaction
-- STARTED, so two signups racing could otherwise be numbered in one order and timestamped in the other;
-- with this, position order and created_at order are the same order. beta.js never sends created_at.
create or replace function public.waitlist_assign_founding_position()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  k text;
  prior integer;
  issued integer;
begin
  new.founding_position := null;
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
  -- A household that was numbered before (its row was deleted) gets that number back, never a new one.
  select l.position into prior from public.waitlist_founding_ledger l where l.email_key = k;
  if prior is not null then
    if not exists (select 1 from public.waitlist w where w.founding_position = prior) then
      new.founding_position := prior;
    end if;
    return new;
  end if;
  select count(*) into issued from public.waitlist_founding_ledger;
  if issued >= 50 then
    return new;
  end if;
  insert into public.waitlist_founding_ledger (position, email_key) values (issued + 1, k);
  new.founding_position := issued + 1;
  return new;
end;
$$;

-- Created DISABLED, and only the first time: running this file again after step 4 must not switch an
-- enabled trigger back off. It is enabled by waitlist_founding_start(), after the existing rows are numbered.
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'waitlist_founding_position' and tgrelid = 'public.waitlist'::regclass) then
    create trigger waitlist_founding_position
      before insert on public.waitlist
      for each row execute function public.waitlist_assign_founding_position();
    alter table public.waitlist disable trigger waitlist_founding_position;
  end if;
end $$;

-- Step 4: number the existing eligible rows 1..50 in created_at order (ties by id), record each number
-- in the ledger, then switch the trigger on. RUNS ONCE: if the trigger is already on, or any number has
-- been issued, it raises an error before changing anything.
create or replace function public.waitlist_founding_start()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  numbered integer;
begin
  perform pg_advisory_xact_lock(hashtext('public.waitlist.founding_position'));
  if exists (select 1 from pg_trigger where tgname = 'waitlist_founding_position'
               and tgrelid = 'public.waitlist'::regclass and tgenabled <> 'D')
     or exists (select 1 from public.waitlist_founding_ledger)
     or exists (select 1 from public.waitlist where founding_position is not null) then
    raise exception 'waitlist_founding_start() has already run. Founding numbers are set once and never renumbered; nothing was changed.'
      using errcode = 'P0001';
  end if;
  with ordered as (
    select w.id, public.waitlist_email_key(w.email) as k,
           row_number() over (order by w.created_at, w.id) as n
    from public.waitlist w
    where not w.is_test
  ),
  firsts as (
    -- One number per household: a second spelling of an address already numbered gets none.
    select id, k, row_number() over (order by n) as n
    from (select distinct on (k) id, k, n from ordered order by k, n) d
  ),
  issued as (
    insert into public.waitlist_founding_ledger (position, email_key)
    select n, k from firsts where n <= 50
    returning position, email_key
  )
  update public.waitlist w set founding_position = i.position
  from issued i join firsts f on f.k = i.email_key
  where w.id = f.id;
  get diagnostics numbered = row_count;
  alter table public.waitlist enable trigger waitlist_founding_position;
  return numbered;
end;
$$;
