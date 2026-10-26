-- ============================================================================
-- Flourish Money - friends and family: the founding link email for the 11
-- pre-2026-10-01 founding holders
-- ============================================================================
-- Amanda, 2026-10-25: "It's okay to send those ones before Oct 1 the link. They
-- are my friends and family." CASL's personal and family relationship
-- exemption, as she stated it.
--
-- WHAT THIS DOES. Records that basis on each of those rows, in
-- metadata.consent_basis, which the founding link sweep reads
-- (netlify/functions/_lib/waitlistConsent.js foundingLinkByRelationship):
--   { "type": "personal_relationship", "stated_by": "Amanda Holt",
--     "stated_at": "2026-10-25", "note": "friends and family, per founder" }
-- Nothing else on the row changes: not consent_version, not consented_at, not
-- the founding number, not the rest of metadata (the basis is merged in).
--
-- WHICH ROWS, all of: a real row (is_test false); not unsubscribed; consent
-- version 'pre-2026-10-01'; a founding number; no basis recorded yet; no
-- billing-day email sent yet (metadata.founding_link empty). Expected: 11.
--
-- EXACTLY 11, OR NOTHING. If the count is not 11 (someone unsubscribed, a row
-- changed, it already ran), the whole file stops with an error and nothing is
-- written. Run the dry run and the ledger check below, and ask before changing
-- the 11.
--
-- ORDER: after the code that reads it is deployed, and before FOUNDING_LINK_EMAIL
-- is set to true. Run before the deploy, it changes nothing anyone sees. If the
-- email goes out before this runs, those 11 get the launch email instead, once,
-- and never their founding link email.
--
-- Run the whole file in one go, in the Supabase SQL editor. It is one transaction.
-- ============================================================================

begin;

do $$
declare
  n integer;
begin
  select count(*) into n
    from public.waitlist w
   where w.is_test = false
     and w.unsubscribed_at is null
     and w.consent_version = 'pre-2026-10-01'
     and w.founding_position is not null
     and not (coalesce(w.metadata, '{}'::jsonb) ? 'consent_basis')
     and not (coalesce(w.metadata, '{}'::jsonb) ? 'founding_link');
  if n <> 11 then
    raise exception 'friends and family: expected 11 rows, found %. Nothing was changed.', n;
  end if;

  update public.waitlist w
     set metadata = coalesce(w.metadata, '{}'::jsonb) || jsonb_build_object('consent_basis', jsonb_build_object(
           'type', 'personal_relationship', 'stated_by', 'Amanda Holt', 'stated_at', '2026-10-25',
           'note', 'friends and family, per founder'))
   where w.is_test = false
     and w.unsubscribed_at is null
     and w.consent_version = 'pre-2026-10-01'
     and w.founding_position is not null
     and not (coalesce(w.metadata, '{}'::jsonb) ? 'consent_basis')
     and not (coalesce(w.metadata, '{}'::jsonb) ? 'founding_link');
  get diagnostics n = row_count;
  if n <> 11 then
    raise exception 'friends and family: wrote % rows, not 11. Nothing was changed.', n;
  end if;
  raise notice 'friends and family: basis recorded on % rows', n;
end $$;

commit;

-- ============================================================================
-- DRY RUN (run first; changes nothing; the count only, no email, no id):
-- ============================================================================
--   select count(*) as friends_and_family
--     from public.waitlist w
--    where w.is_test = false and w.unsubscribed_at is null
--      and w.consent_version = 'pre-2026-10-01' and w.founding_position is not null
--      and not (coalesce(w.metadata, '{}'::jsonb) ? 'consent_basis')
--      and not (coalesce(w.metadata, '{}'::jsonb) ? 'founding_link');
-- Expected: 11.

-- ============================================================================
-- LEDGER CHECK (read-only, with the dry run; the count only): how many of the
-- rows in scope billing itself still honours (the same lookup the sweep and the
-- checkout use, migration 0025). The sweep sends a founding link email only to
-- those; a row in scope that is not honoured gets no email at all.
-- ============================================================================
--   select count(*) filter (where public.waitlist_founding_number_for_email(w.email) = w.founding_position) as honoured_by_billing
--     from public.waitlist w
--    where w.is_test = false and w.unsubscribed_at is null
--      and w.consent_version = 'pre-2026-10-01' and w.founding_position is not null
--      and not (coalesce(w.metadata, '{}'::jsonb) ? 'consent_basis')
--      and not (coalesce(w.metadata, '{}'::jsonb) ? 'founding_link');
-- Expected: 11, the same as the dry run. Fewer: stop and ask.

-- ============================================================================
-- CHECK AFTERWARDS (read-only; counts only):
-- ============================================================================
--   select count(*) filter (where metadata->'consent_basis'->>'type' = 'personal_relationship') || '|' ||
--          count(*) filter (where metadata->'consent_basis'->>'type' = 'personal_relationship'
--                           and (consent_version <> 'pre-2026-10-01' or founding_position is null or is_test or unsubscribed_at is not null))
--     from public.waitlist;
-- Expected: 11|0 (11 rows carry the basis, and none outside the scope).

-- ============================================================================
-- ROLLBACK (only before the email goes out; a row already sent keeps its record):
-- ============================================================================
--   update public.waitlist set metadata = metadata - 'consent_basis'
--    where metadata->'consent_basis'->>'type' = 'personal_relationship'
--      and not (metadata ? 'founding_link');
