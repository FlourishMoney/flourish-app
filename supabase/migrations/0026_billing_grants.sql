-- 0026_billing_grants.sql
-- -----------------------------------------------------------------------------
-- THE BILLING TABLES' GRANTS, AS 0009 AND 0010 MEANT THEM (Amanda, 2026-10-20).
--
-- 0009 (public.subscriptions) and 0010 (public.billing_events) ran in production on 2026-10-20. Until
-- 2026-10-30 Supabase also gives every new public table its default grant, ALL privileges to anon and
-- authenticated, and the read-only check after 0009 and 0010 showed it: anon could SELECT subscriptions,
-- and authenticated could SELECT billing_events. RLS blocked every row (subscriptions has one policy,
-- select-own for authenticated; billing_events has none), but a grant should not depend on that. This file
-- leaves exactly what the two files say:
--   public.subscriptions   authenticated SELECT (its select-own policy, how a household could read its
--                          own row); nothing else for authenticated, nothing at all for anon
--   public.billing_events  nothing for anon or authenticated (service role only, as 0010 says)
-- The service role keeps ALL on both (0009, 0010): Netlify functions read and write them with it.
--
-- Needs 0009 and 0010. One transaction; safe to run twice. Run the READ-ONLY CHECK below before (it shows
-- what is granted now) and after (every column as its expected value).
-- -----------------------------------------------------------------------------

begin;

revoke all on table public.subscriptions from anon;
revoke insert, update, delete, truncate, references, trigger on table public.subscriptions from authenticated;
grant select on table public.subscriptions to authenticated;

revoke all on table public.billing_events from anon, authenticated;

commit;

-- -----------------------------------------------------------------------------
-- READ-ONLY CHECK (before and after). One row, true or false only. A list of privileges is true when ANY is held.
--
--   select has_table_privilege('anon', 'public.subscriptions', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER') as anon_on_subscriptions,
--          has_table_privilege('authenticated', 'public.subscriptions', 'SELECT')                                              as signed_in_reads_subscriptions,
--          has_table_privilege('authenticated', 'public.subscriptions', 'INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER') as signed_in_writes_subscriptions,
--          has_table_privilege('anon', 'public.billing_events', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER') as anon_on_billing_events,
--          has_table_privilege('authenticated', 'public.billing_events', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER') as signed_in_on_billing_events,
--          has_table_privilege('service_role', 'public.subscriptions', 'SELECT') and has_table_privilege('service_role', 'public.subscriptions', 'INSERT')
--            and has_table_privilege('service_role', 'public.subscriptions', 'UPDATE') and has_table_privilege('service_role', 'public.billing_events', 'SELECT')
--            and has_table_privilege('service_role', 'public.billing_events', 'INSERT')                                        as server_reads_and_writes_both;
--
--   Expected after: false, true, false, false, false, true.
--
-- ROLLBACK (puts back what Supabase's default grant had given; not recommended):
--   grant all on table public.subscriptions to anon, authenticated;
--   grant all on table public.billing_events to anon, authenticated;
-- -----------------------------------------------------------------------------
