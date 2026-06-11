-- ============================================================================
-- Flourish Money — profiles / plan table   (Quality Sprint item 11)
-- ============================================================================
-- Run this in the Supabase SQL editor (Dashboard → SQL → New query → Run).
-- Safe to re-run: every statement is idempotent (IF NOT EXISTS / DROP+CREATE /
-- ON CONFLICT DO NOTHING).
--
-- After it succeeds, confirm the table exists (Dashboard → Table editor →
-- "profiles") and tell Claude — then the client + server read-wiring proceeds.
-- ============================================================================

-- 1. Table -------------------------------------------------------------------
create table if not exists public.profiles (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  plan             text not null default 'free' check (plan in ('free','trial','plus','pro')),
  trial_started_at timestamptz,
  founder_flag     boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- 2. Row Level Security — owner-scoped ---------------------------------------
-- The service role (used by Netlify functions coach.js / plaid.js) BYPASSES RLS,
-- so server-side plan checks work; browser clients see only their own row.
alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = user_id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = user_id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- No DELETE policy on purpose: rows vanish via ON DELETE CASCADE when the
-- auth user is deleted (the delete_account flow already removes the auth user).

-- 3. Keep updated_at fresh ---------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- 4. Auto-create a profile row for every new signup -------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 5. Backfill existing users (current beta testers) -------------------------
-- Everyone gets a default row (plan='free', founder_flag=false).
insert into public.profiles (user_id)
select id from auth.users
on conflict (user_id) do nothing;

-- ----------------------------------------------------------------------------
-- OPTIONAL (your call — NOT run automatically):
--   • Grandfather pre-paywall testers as founders. Replace the date with your
--     paywall launch date:
--       update public.profiles p set founder_flag = true
--       from auth.users u
--       where p.user_id = u.id and u.created_at < '2026-06-01';
--   • Promote yourself / specific testers to a paid tier for testing:
--       update public.profiles set plan='pro', founder_flag=true
--       where user_id = '<your-auth-user-uuid>';
-- ----------------------------------------------------------------------------
