-- ============================================================================
-- Flourish Money — profiles guard + server-side trial  (Quality Sprint item 11, review fix)
-- ============================================================================
-- WHY: 0001's owner-update RLS let the BROWSER write any column of its own row,
-- including `plan` / `founder_flag` / `trial_started_at` — which the server reads
-- as authoritative. A user could `update({plan:'pro'})` from devtools and self-grant
-- unlimited Coach + multi-bank. This migration locks those columns to the service
-- role and moves the 14-day trial grant to signup (server-side).
--
-- Run in the Supabase SQL editor. Idempotent / safe to re-run.
-- ============================================================================

-- 1. Guard: only the service role (Netlify functions via SUPABASE_SECRET_KEY) may
--    change the privileged columns. Browser clients (authenticated/anon) are blocked.
--    Runs as INVOKER (no security definer) so auth.jwt() reflects the CALLER's role.
create or replace function public.profiles_guard_privileged()
returns trigger language plpgsql as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role'
     and ( new.plan             is distinct from old.plan
        or new.founder_flag     is distinct from old.founder_flag
        or new.trial_started_at is distinct from old.trial_started_at ) then
    raise exception 'plan / founder_flag / trial_started_at are server-managed';
  end if;
  return new;
end; $$;

drop trigger if exists profiles_guard_privileged on public.profiles;
create trigger profiles_guard_privileged
  before update on public.profiles
  for each row execute function public.profiles_guard_privileged();

-- 2. Grant the 14-day trial at signup, server-side (replaces the old client-side grant,
--    which is no longer possible after step 1). Expiry is derived from trial_started_at
--    by the server (getUserPlan) — no further writes needed when it lapses.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (user_id, plan, trial_started_at)
  values (new.id, 'trial', now())
  on conflict (user_id) do nothing;
  return new;
end; $$;
-- (the on_auth_user_created trigger from 0001 already calls handle_new_user — no change needed)

-- ----------------------------------------------------------------------------
-- OPTIONAL (your call — NOT run automatically): give the existing backfilled
-- free testers a fresh 14-day trial too (new signups already get one via step 2):
--   update public.profiles set plan='trial', trial_started_at=now()
--   where plan='free' and trial_started_at is null;
-- ----------------------------------------------------------------------------
