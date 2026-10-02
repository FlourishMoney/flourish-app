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
-- =============================================================================

create table if not exists public.feedback (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references auth.users(id) on delete cascade,
  kind         text        not null check (kind in ('idea', 'problem', 'praise', 'week_one')),
  message      text        not null check (char_length(message) between 1 and 2000),
  app_version  text        check (app_version is null or char_length(app_version) <= 40),
  platform     text        check (platform is null or platform in ('ios', 'android', 'web')),
  created_at   timestamptz not null default now()
);

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
-- policy above. anon gets nothing, so a signed-out request writes nothing.
grant insert         on table public.feedback to authenticated;
grant all privileges on table public.feedback to service_role;
