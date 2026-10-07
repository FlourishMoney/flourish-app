-- 0016_waitlist_founding_billing.sql
-- -----------------------------------------------------------------------------
-- BILLING HONOURS THE WAITLIST FOUNDING POSITIONS (Amanda's decision, 2026-10-06).
--
-- A checkout gets the founding price only when the buyer's confirmed account email matches a waitlist
-- row that is not a test row and holds founding_position 1 to 50 (netlify/functions/_lib/foundingCohort.js).
-- This file adds the one lookup that question needs, and marks the known check row as a test row.
--
-- Needs 0014 (is_test, founding_position) and 0015. ADDITIVE AND IDEMPOTENT.
--
-- TO APPLY (Supabase SQL editor), as part of 0014's steps, in this order:
--   1. 0014_waitlist_founding.sql   2. 0015_waitlist_founding_grants.sql   3. THIS FILE
--   4. Mark any other test row by id (0014, step 3).   5. select public.waitlist_founding_start();
--   Run this file BEFORE step 5, so the check row below is never numbered. If it is run after, that row
--   loses its position here; run step 5 again to number the first 50 eligible rows 1 to 50 again.
-- -----------------------------------------------------------------------------

-- 1. The live waitlist check of 2026-10-06 added one real row. It is a test row and never takes a spot.
--    Matched by the md5 of its normalised address, so no address is written in this repository.
update public.waitlist
   set is_test = true, founding_position = null
 where md5(lower(regexp_replace(email, '\s+', '', 'g'))) = '492b64bcf0c6bfd2ca952ecbb02c25b9'
   and (is_test is distinct from true or founding_position is not null);

-- 2. The founding position for an email, or null. Case and whitespace are ignored on both sides (an
--    email address cannot contain whitespace). Test rows and anything outside 1..50 return null.
--    SECURITY INVOKER: it reads as the caller, and only the service role may call it (below).
create or replace function public.waitlist_founding_position_for_email(p_email text)
returns integer
language sql
stable
security invoker
set search_path = public
as $$
  select min(w.founding_position)
  from public.waitlist w
  where lower(regexp_replace(w.email, '\s+', '', 'g')) = lower(regexp_replace(coalesce(p_email, ''), '\s+', '', 'g'))
    and coalesce(p_email, '') !~ '^\s*$'
    and not w.is_test
    and w.founding_position between 1 and 50;
$$;

-- grants: service_role only. Functions are executable by PUBLIC by default; that is revoked, so the
-- browser (anon, authenticated) can never ask whose address holds a position.
revoke all on function public.waitlist_founding_position_for_email(text) from public, anon, authenticated;
grant execute on function public.waitlist_founding_position_for_email(text) to service_role;

-- READ-ONLY CHECK afterwards (counts only, no addresses):
--   select count(*) filter (where is_test) as test_rows,
--          count(founding_position) as positioned
--   from public.waitlist;
