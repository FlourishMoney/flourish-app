-- docs/ops/gift-0050-check.sql
-- Read-only check after migration 0050_gift_codes.sql. One result: every row's "ok" must be true (21 rows).
-- Run it in the Supabase SQL editor (production) or with psql (the stand-in staging). It changes nothing.
select n, check_name, expected, actual, actual is not distinct from expected as ok from (
  select 1 as n, 'gift_codes table exists' as check_name, '1' as expected,
         (select count(*)::text from pg_class where oid = to_regclass('public.gift_codes')) as actual
  union all select 2, 'row level security on', 'true',
         (select relrowsecurity::text from pg_class where oid = to_regclass('public.gift_codes'))
  union all select 3, 'policies on gift_codes', '0',
         (select count(*)::text from pg_policies where schemaname = 'public' and tablename = 'gift_codes')
  union all select 4, 'rows (none sold yet)', '0',
         (case when to_regclass('public.gift_codes') is null then 'no table'
               else (xpath('/row/c/text()', query_to_xml('select count(*) as c from public.gift_codes', false, true, '')))[1]::text end)
  union all select 5, 'columns', '31',
         (select count(*)::text from information_schema.columns where table_schema = 'public' and table_name = 'gift_codes')
  union all select 6, 'status is a generated column', 'ALWAYS',
         (select is_generated from information_schema.columns where table_schema = 'public' and table_name = 'gift_codes' and column_name = 'status')
  union all select 7, 'redeemed_by references auth.users', '1',
         (select count(*)::text from pg_constraint where conrelid = to_regclass('public.gift_codes') and contype = 'f' and confrelid = 'auth.users'::regclass)
  union all select 8, 'indexes', '6',
         (select count(*)::text from pg_indexes where schemaname = 'public' and tablename = 'gift_codes')
  union all select 9, 'anon on the table', 'none',
         (select coalesce(nullif(concat_ws(',',
            case when has_table_privilege('anon', to_regclass('public.gift_codes'), 'select') then 'select' end,
            case when has_table_privilege('anon', to_regclass('public.gift_codes'), 'insert') then 'insert' end,
            case when has_table_privilege('anon', to_regclass('public.gift_codes'), 'update') then 'update' end,
            case when has_table_privilege('anon', to_regclass('public.gift_codes'), 'delete') then 'delete' end), ''), 'none'))
  union all select 10, 'authenticated on the table', 'none',
         (select coalesce(nullif(concat_ws(',',
            case when has_table_privilege('authenticated', to_regclass('public.gift_codes'), 'select') then 'select' end,
            case when has_table_privilege('authenticated', to_regclass('public.gift_codes'), 'insert') then 'insert' end,
            case when has_table_privilege('authenticated', to_regclass('public.gift_codes'), 'update') then 'update' end,
            case when has_table_privilege('authenticated', to_regclass('public.gift_codes'), 'delete') then 'delete' end), ''), 'none'))
  union all select 11, 'service_role on the table', 'select,insert,update',
         (select coalesce(nullif(concat_ws(',',
            case when has_table_privilege('service_role', to_regclass('public.gift_codes'), 'select') then 'select' end,
            case when has_table_privilege('service_role', to_regclass('public.gift_codes'), 'insert') then 'insert' end,
            case when has_table_privilege('service_role', to_regclass('public.gift_codes'), 'update') then 'update' end,
            case when has_table_privilege('service_role', to_regclass('public.gift_codes'), 'delete') then 'delete' end), ''), 'none'))
  union all select 12, 'gift functions', '9',
         (select count(*)::text from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname like 'gift\_%')
  union all select 13, 'gift functions anon can run', '0',
         (select count(*)::text from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname like 'gift\_%' and has_function_privilege('anon', p.oid, 'execute'))
  union all select 14, 'gift functions authenticated can run', '0',
         (select count(*)::text from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname like 'gift\_%' and has_function_privilege('authenticated', p.oid, 'execute'))
  union all select 15, 'gift functions service_role can run', '9',
         (select count(*)::text from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname like 'gift\_%' and has_function_privilege('service_role', p.oid, 'execute'))
  union all select 16, 'gift functions that are security definer', '0',
         (select count(*)::text from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname like 'gift\_%' and p.prosecdef)
  -- Fingerprints: they prove the pasted SQL made exactly what the file makes. The function one is taken from the file's
  -- own text, so it holds on any Postgres version. The other three come from how Postgres 17 prints definitions; if
  -- only those are false and row 21 is not 17, the server prints them differently: compare by eye, nothing is wrong.
  union all select 17, 'function bodies match the file (fingerprint)', '76fd5836f8655949f67625c33b1824ab',
         (select md5(string_agg(p.proname || ':' || p.prosrc, '|' order by p.proname)) from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname like 'gift\_%')
  union all select 18, 'constraints match the file (fingerprint)', 'd871c430c1cf90278d786fe855001f20',
         (select md5(string_agg(c.conname || ':' || pg_get_constraintdef(c.oid), '|' order by c.conname)) from pg_constraint c where c.conrelid = to_regclass('public.gift_codes'))
  union all select 19, 'indexes match the file (fingerprint)', '96b8e8c3e12fcc04f28b1f1d9f1411af',
         (select md5(string_agg(indexname || ':' || indexdef, '|' order by indexname)) from pg_indexes where schemaname = 'public' and tablename = 'gift_codes')
  union all select 20, 'columns match the file (fingerprint)', 'b77ff19a3afb0d3aa566e827c4fa9a33',
         (select md5(string_agg(column_name || ':' || data_type || ':' || is_nullable || ':' || coalesce(column_default, '') || ':' || coalesce(generation_expression, ''), '|' order by ordinal_position)) from information_schema.columns where table_schema = 'public' and table_name = 'gift_codes')
  union all select 21, 'Postgres major version (for rows 18-20)', '17',
         (select (current_setting('server_version_num')::int / 10000)::text)
) x order by n;
