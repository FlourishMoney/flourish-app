-- 0038_testers.sql
-- -----------------------------------------------------------------------------
-- TESTER CODES AND THE DAY 30 QUESTIONS (2026-11-04). NOT APPLIED.
--
--   tester_codes     the codes that work. EMPTY after this runs: the sign-up field stays hidden until a code is added.
--   tester_accounts  which account used which code and when, and when its answers came in.
--   tester_answers   one row per question: the wording it was shown and the answer. Goes with the account.
-- A tester code grants nothing: no plan, no discount, no reward, nothing tied to a store rating.
--
-- Add a code, when one is chosen:
--   insert into public.tester_codes (code) values ('YOUR-CODE');
-- Codes are uppercase letters, numbers and hyphens, 3 to 30 characters. Stop one with: update ... set active = false.
--
-- Run in the Supabase SQL editor. Additive and safe to run twice.
-- -----------------------------------------------------------------------------

create table if not exists public.tester_codes (
  code       text        primary key check (code ~ '^[A-Z0-9-]{3,30}$'),
  active     boolean     not null default true,
  created_at timestamptz not null default now()
);
alter table public.tester_codes enable row level security;
-- grants: service_role only
grant all privileges on table public.tester_codes to service_role;
revoke all on table public.tester_codes from anon, authenticated;

create table if not exists public.tester_accounts (
  user_id     uuid        primary key references auth.users(id) on delete cascade,
  code        text        not null,
  marked_at   timestamptz not null default now(),
  answered_at timestamptz
);
alter table public.tester_accounts enable row level security;
-- grants: service_role only
grant all privileges on table public.tester_accounts to service_role;
revoke all on table public.tester_accounts from anon, authenticated;

create table if not exists public.tester_answers (
  user_id          uuid        not null references auth.users(id) on delete cascade,
  question_id      text        not null,
  question_wording text        not null,
  answer           text        not null check (char_length(answer) between 1 and 1000),
  answered_at      timestamptz not null default now(),
  primary key (user_id, question_id)
);
alter table public.tester_answers enable row level security;
-- grants: service_role only
grant all privileges on table public.tester_answers to service_role;
revoke all on table public.tester_answers from anon, authenticated;

-- -----------------------------------------------------------------------------
-- ROLLBACK (this deletes the answers)
-- -----------------------------------------------------------------------------
-- drop table if exists public.tester_answers;
-- drop table if exists public.tester_accounts;
-- drop table if exists public.tester_codes;
