-- 0014_waitlist_founding.sql
-- -----------------------------------------------------------------------------
-- THE FOUNDING OFFER ON THE WAITLIST (Amanda's decision, 2026-10-06).
--
-- The first 50 households on the waitlist, in the order they joined (created_at), get the founding
-- price. Test rows never count: is_test marks them (Amanda's own test signup from 2026-09-29 is one).
-- Existing rows count, in created_at order.
--
-- ADDITIVE AND IDEMPOTENT. Nothing is dropped or rewritten except founding_position, which only the
-- trigger and waitlist_founding_start() write. Grants are in 0015_waitlist_founding_grants.sql.
--
-- The spots-left figure on the landing page is netlify/functions/founding.js: 50 less a count of the
-- rows where is_test is false, never below 0. Until this migration is applied that count cannot be
-- read (no is_test column), the endpoint fails, and the page shows no number.
--
-- TO APPLY, in this order (Supabase SQL editor):
--   1. Run this file. It adds the columns and functions, and the trigger, created DISABLED, so no
--      signup gets a position before the existing rows have theirs.
--   2. Run 0015_waitlist_founding_grants.sql.
--   3. Mark the test rows. Find each one in the Table editor and set is_test = true (or, in the SQL
--      editor, update public.waitlist set is_test = true where id = '<that row id>';). Never put an
--      address in a committed file.
--   4. select public.waitlist_founding_start();
--      This numbers every eligible row 1 to 50 in created_at order, then enables the trigger. From
--      then on each new signup gets the lowest free position inside the insert's own transaction,
--      under an advisory lock, so two signups can never get the same one.
--   If a row is marked as a test row AFTER step 4, run step 4 again: it frees that row's position and
--   gives the first 50 eligible rows, in created_at order, positions 1 to 50 again.
--   READ-ONLY CHECK afterwards (counts only):
--      select count(*) filter (where not is_test) as eligible,
--             count(founding_position) as positioned,
--             count(*) filter (where is_test) as test_rows
--      from public.waitlist;
-- -----------------------------------------------------------------------------

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

-- The lowest free position for a new eligible row, or null when all 50 are taken. Runs BEFORE INSERT,
-- inside the insert's own transaction, under a transaction-scoped advisory lock: a second signup waits
-- for the first to commit, then sees its position as taken.
-- created_at is set to the moment the row takes the lock. Its default, now(), is when the transaction
-- STARTED, so two signups racing could otherwise be numbered in one order and timestamped in the other;
-- with this, position order and created_at order are the same order. beta.js never sends created_at.
create or replace function public.waitlist_assign_founding_position()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_test then
    new.founding_position := null;
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtext('public.waitlist.founding_position'));
  new.created_at := clock_timestamp();
  if (select count(*) from public.waitlist where not is_test) >= 50 then
    new.founding_position := null;
  else
    new.founding_position := (
      select min(g) from generate_series(1, 50) as g
      where not exists (select 1 from public.waitlist w where w.founding_position = g)
    );
  end if;
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

-- Step 4: number the existing eligible rows 1..50 in created_at order (ties by id), then switch the
-- trigger on. Safe to run again: it renumbers from the same order and leaves test rows null.
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
  update public.waitlist set founding_position = null where founding_position is not null;
  with ordered as (
    select id, row_number() over (order by created_at, id) as n
    from public.waitlist
    where not is_test
  )
  update public.waitlist w set founding_position = o.n
  from ordered o
  where w.id = o.id and o.n <= 50;
  get diagnostics numbered = row_count;
  alter table public.waitlist enable trigger waitlist_founding_position;
  return numbered;
end;
$$;
