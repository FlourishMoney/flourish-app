-- 0011_meeting_records.sql
-- =============================================================================
-- WHAT THE MONEY MEETING DECIDED. One row per meeting, per household.
--
-- The meeting was one way: an agenda went out, nothing came back, and the next meeting
-- opened exactly like the last one. This table is the memory that makes the loop close —
-- the next meeting reads it to open with what changed since the last one, and the reconcile
-- loop reads the signatures to stop asking questions the household already answered.
--
-- WHY 0011 AND NOT 0009: branch billing-stripe (PR #9, unmerged) adds 0009 and 0010. Taking
-- the next free number on main would collide on merge. If that branch is abandoned, this can
-- be renumbered before it is applied — not after.
--
-- NOT APPLIED BY THE AUTHOR. There is no staging Supabase project yet (P14), so this is
-- written and reviewed, not run.
--
-- SAFE TO RUN ANYWHERE: guarded throughout, re-running is a no-op.
-- =============================================================================

create table if not exists public.meeting_records (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users(id) on delete cascade,

  met_on      date        not null,

  -- The answers, as recorded by src/lib/meetingRecord.js recordableAnswer(): an array of
  -- { signature, domain, kind, answer, subject }, all strings. NO FIGURES, deliberately —
  -- every number belongs to an engine, and the next meeting reads it from the engine rather
  -- than from a row that a facilitator model had a hand in producing.
  answers     jsonb       not null default '[]'::jsonb,

  created_at  timestamptz not null default now()
);

-- One meeting per household per day: a second recording on the same date updates the first
-- rather than making the history ambiguous about what was decided.
create unique index if not exists meeting_records_user_day_idx on public.meeting_records (user_id, met_on);
create index if not exists meeting_records_recent_idx on public.meeting_records (user_id, met_on desc);

alter table public.meeting_records enable row level security;

-- The client READS ITS OWN meetings and nothing else. There is deliberately no insert, update
-- or delete policy: answers are written by the server (netlify/functions/meeting.js) after it
-- has verified the session, so a client cannot record a decision the meeting did not make.
do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'meeting_records' and policyname = 'meeting_records_select_own'
  ) then
    create policy "meeting_records_select_own" on public.meeting_records
      for select using (auth.uid() = user_id);
  end if;
end $$;

-- Data API grants. Supabase stops auto-granting on new public tables from 2026-10-30, so a
-- table created after that date is invisible to PostgREST without these lines.
-- See docs/ops/SUPABASE-GRANTS.md (branch supabase-grants, PR #8 — NOT on main yet).
-- authenticated gets SELECT only, matching the single policy above. anon gets nothing.
grant select         on table public.meeting_records to authenticated;
grant all privileges on table public.meeting_records to service_role;
