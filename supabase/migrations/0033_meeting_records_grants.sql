-- ============================================================================
-- Flourish Money - meeting_records: only the Data API grants it should have
-- ============================================================================
-- Run after 0011 (the table) and 0030 (its household select policy). Safe to run more than once.
--
-- Supabase's old default grants gave every new public table full privileges for anon and
-- authenticated, so meeting_records carries anon SELECT and authenticated INSERT, UPDATE and
-- DELETE on top of the grants 0011 made. RLS blocks every one of them today: the table has select
-- policies only (0011: a person's own records; 0030: a household member's), and the server
-- (netlify/functions/meeting.js and plaid.js, as the service role) is its only writer. They are
-- taken away anyway, the same way 0030 handles its own tables: everything revoked from anon and
-- authenticated, then authenticated given SELECT back (what the policies allow) and the service role
-- all. No data, policy or RLS setting changes.

revoke all on table public.meeting_records from anon, authenticated;
grant select on table public.meeting_records to authenticated;
grant all privileges on table public.meeting_records to service_role;

-- READ-ONLY CHECK (after running): anon nothing at all; a signed-in user select only, on no column
-- anything more; the server reads and writes; RLS still on.
--   select has_table_privilege('anon', 'public.meeting_records', 'select, insert, update, delete, truncate, references, trigger'),
--          has_any_column_privilege('anon', 'public.meeting_records', 'select, insert, update, references'),
--          has_table_privilege('authenticated', 'public.meeting_records', 'select'),
--          has_table_privilege('authenticated', 'public.meeting_records', 'insert, update, delete, truncate, references, trigger'),
--          has_any_column_privilege('authenticated', 'public.meeting_records', 'insert, update, references'),
--          has_table_privilege('service_role', 'public.meeting_records', 'select') and has_table_privilege('service_role', 'public.meeting_records', 'insert')
--            and has_table_privilege('service_role', 'public.meeting_records', 'update') and has_table_privilege('service_role', 'public.meeting_records', 'delete'),
--          (select relrowsecurity from pg_class where oid = 'public.meeting_records'::regclass);
-- Expected after: false, false, true, false, false, true, true.

-- ROLLBACK (puts back what 0011 granted; the old default grants are not restored):
-- grant select on table public.meeting_records to authenticated;
-- grant all privileges on table public.meeting_records to service_role;
