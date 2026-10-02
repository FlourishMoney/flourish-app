-- 0013_feedback.sql
-- =============================================================================
-- FEEDBACK FROM INSIDE THE APP (tester suggestions, item 6). One row per message.
--
-- "Send feedback" in Settings → Help & Support writes an idea, a problem or praise, and the
-- one-question check-in on day 7 writes its answer. Our own table: no third-party form service.
--
-- The client INSERTS ITS OWN rows and nothing else. There is deliberately no select, update or
-- delete policy: a message, once sent, is read by us (service role), not by the app, so a stolen
-- session cannot page through what someone wrote. Rows go with the account: on delete cascade from
-- auth.users, and netlify/functions/plaid.js delete_account deletes them explicitly as well.
--
-- No figures and no financial data: kind, the message the person typed, and the app version and
-- platform it came from, so a "problem" can be matched to a build.
--
-- NOT APPLIED BY THE AUTHOR. Apply before the branch that reads it is merged.
-- SAFE TO RUN ANYWHERE: guarded throughout, re-running is a no-op.
--
-- AN OLDER public.feedback (prompt 4b item 5). The first run in production stopped with
-- "ERROR 42703: column created_at does not exist" and changed nothing: production already had a
-- public.feedback from the March 2026 Settings card (user_id text not null, email text not null,
-- message text, app_version text; 0 rows), so "create table if not exists" skipped and the index on
-- created_at failed. That card was removed in July (22784b9) and nothing in the app writes to it.
-- Step 0 below moves it aside before anything else runs:
--   * public.feedback with no created_at and NO rows: renamed to public.feedback_legacy_unused, with
--     its constraints and indexes renamed to match so their names cannot collide with the new
--     table's, and the Data API roles' access to it revoked. It is never dropped.
--   * public.feedback with no created_at and ANY rows: the migration stops with an error and
--     changes nothing, so no one's words are moved or lost by a script.
--   * public.feedback with created_at but not this table's shape (no kind column): stops the same
--     way, rather than putting this table's policy and grants on a table it does not describe.
-- The new table stores no email address: who sent a message is user_id, and only that.
-- =============================================================================

-- ── 0. An older public.feedback ──────────────────────────────────────────────────────────────
do $$
declare
  rows_in_old bigint;
  r record;
begin
  if to_regclass('public.feedback') is null then
    return;                                                     -- nothing there: step 1 creates it
  end if;

  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'feedback' and column_name = 'created_at') then
    if not exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = 'feedback' and column_name = 'kind') then
      raise exception 'public.feedback has created_at but not the shape this migration creates (no kind column). Stopping; nothing was changed.';
    end if;
    return;                                                     -- already this table: re-run is a no-op
  end if;

  execute 'select count(*) from public.feedback' into rows_in_old;
  if rows_in_old > 0 then
    raise exception 'public.feedback is an older table (no created_at) holding % row(s). Stopping; nothing was renamed or changed. Move or export those rows first.', rows_in_old;
  end if;
  if to_regclass('public.feedback_legacy_unused') is not null then
    raise exception 'public.feedback_legacy_unused already exists, so the older public.feedback cannot be moved aside. Stopping; nothing was changed.';
  end if;

  alter table public.feedback rename to feedback_legacy_unused;
  -- A table rename keeps its constraint and index names (feedback_pkey and the like), which would
  -- collide with the new table's. Rename them after the table they now belong to.
  for r in select conname from pg_constraint
            where conrelid = 'public.feedback_legacy_unused'::regclass and conname like 'feedback%' loop
    execute format('alter table public.feedback_legacy_unused rename constraint %I to %I',
                   r.conname, 'feedback_legacy_unused' || substr(r.conname, length('feedback') + 1));
  end loop;
  for r in select indexname from pg_indexes
            where schemaname = 'public' and tablename = 'feedback_legacy_unused' and indexname like 'feedback%'
              and indexname not like 'feedback_legacy_unused%' loop
    execute format('alter index public.%I rename to %I',
                   r.indexname, 'feedback_legacy_unused' || substr(r.indexname, length('feedback') + 1));
  end loop;
  revoke all on table public.feedback_legacy_unused from anon, authenticated;
end $$;

-- ── 1. The table ──────────────────────────────────────────────────────────────────────────────
create table if not exists public.feedback (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references auth.users(id) on delete cascade,
  kind         text        not null check (kind in ('idea', 'problem', 'praise', 'week_one')),
  message      text        not null check (char_length(message) between 1 and 2000),
  app_version  text        check (app_version is null or char_length(app_version) <= 40),
  platform     text        check (platform is null or platform in ('ios', 'android', 'web')),
  created_at   timestamptz not null default now()
);

-- ── 2. Indexes, RLS, the one policy, grants ─────────────────────────────────────────────────────
create index if not exists feedback_recent_idx on public.feedback (created_at desc);
create index if not exists feedback_user_idx on public.feedback (user_id);

alter table public.feedback enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'feedback' and policyname = 'feedback_insert_own'
  ) then
    create policy "feedback_insert_own" on public.feedback
      for insert to authenticated with check (auth.uid() = user_id);
  end if;
end $$;

-- Data API grants (docs/ops/SUPABASE-GRANTS.md): authenticated may INSERT only, matching the one
-- policy above. anon gets nothing, so a signed-out request writes nothing. Until 2026-10-30 Supabase
-- still grants every Data API role everything on a new public table by default (checked against
-- the Supabase Postgres 17.6 image), so those defaults are revoked first; RLS would refuse the rows
-- anyway, and this makes the grants say the same thing.
revoke all           on table public.feedback from anon, authenticated;
grant insert         on table public.feedback to authenticated;
grant all privileges on table public.feedback to service_role;
