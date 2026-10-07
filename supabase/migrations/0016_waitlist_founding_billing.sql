-- 0016_waitlist_founding_billing.sql
-- -----------------------------------------------------------------------------
-- BILLING HONOURS THE WAITLIST FOUNDING NUMBERS (Amanda's decision, 2026-10-06; rules of 2026-10-07).
--
-- A checkout gets the founding price when (netlify/functions/_lib/foundingCohort.js):
--   • the account has never had a founding subscription that ended (subscriptions.founding_ended_at), and
--   • the account is a beta tester flagged as a founder (profiles.founder_flag), outside the 50, or
--   • the account's confirmed email holds waitlist number 1 to 50, on a row that is not a test row, and
--     that number's founding subscription has never ended (waitlist_founding_ledger.ended_at).
-- When a founding subscription ends, the stripe webhook stamps both markers. The founding price never
-- comes back for that household, and its number is never given to anyone else.
--
-- Needs 0014 and 0015. ADDITIVE AND IDEMPOTENT.
--
-- TO APPLY (Supabase SQL editor), as part of 0014's steps, in this order:
--   1. 0014_waitlist_founding.sql   2. 0015_waitlist_founding_grants.sql   3. THIS FILE
--   4. Mark any other test row by id (0014, step 3).   5. select public.waitlist_founding_start(); ONCE.
--   Run this file BEFORE step 5, so the check row below is never numbered.
-- -----------------------------------------------------------------------------

-- 1. The live waitlist check of 2026-10-06 added one real row. It is a test row and never takes a spot.
--    Matched by the md5 of its normalised address, so no address is written in this repository.
update public.waitlist
   set is_test = true
 where public.waitlist_email_key(email) = '492b64bcf0c6bfd2ca952ecbb02c25b9'
   and is_test is distinct from true;

-- 2. Where a founding subscription's end is remembered. Stamped once by the webhook, never cleared.
--    On the account (any founding buyer, the beta testers included) and on the waitlist number (which
--    outlives the account: deleting an account deletes its waitlist row, not its ledger entry).
alter table public.subscriptions add column if not exists founding_ended_at timestamptz;
alter table public.waitlist_founding_ledger add column if not exists ended_at timestamptz;

-- 3. The founding number for an email, or null. Case and whitespace are ignored. Null for a test row, a
--    number whose founding subscription has ended, a blank address, or anything outside 1..50.
--    SECURITY INVOKER: it reads as the caller, and only the service role may call it (below).
create or replace function public.waitlist_founding_position_for_email(p_email text)
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
    and l.ended_at is null
    and not w.is_test
    and l.position between 1 and 50;
$$;

-- 4. A founding subscription ended: stamp the number this email holds. Returns how many numbers were
--    stamped (0 or 1). The number stays issued; nobody else is ever given it.
create or replace function public.waitlist_founding_mark_ended(p_email text)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  stamped integer;
begin
  if coalesce(p_email, '') ~ '^\s*$' then
    return 0;
  end if;
  update public.waitlist_founding_ledger
     set ended_at = now()
   where email_key = public.waitlist_email_key(p_email)
     and ended_at is null;
  get diagnostics stamped = row_count;
  return stamped;
end;
$$;

-- grants: service_role only. Functions are executable by PUBLIC by default; that is revoked, so the
-- browser (anon, authenticated) can never ask whose address holds a number, or end one.
revoke all on function public.waitlist_founding_position_for_email(text) from public, anon, authenticated;
grant execute on function public.waitlist_founding_position_for_email(text) to service_role;
revoke all on function public.waitlist_founding_mark_ended(text) from public, anon, authenticated;
grant execute on function public.waitlist_founding_mark_ended(text) to service_role;

-- READ-ONLY CHECK afterwards (counts only, no addresses):
--   select count(*) filter (where is_test) as test_rows,
--          count(founding_position) as positioned
--   from public.waitlist;
