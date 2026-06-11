-- ============================================================================
-- Flourish Money — v1 founder grandfathering  (Quality Sprint item 11, v1 policy)
-- ============================================================================
-- v1 ships FREE with no IAP; paid tiers arrive in v1.1. Every v1 signup should be
-- grandfathered as a founder (permanently unlimited, even after v1.1 flips
-- ENFORCE_PLAN_LIMITS=true). handle_new_user now grants the 14-day trial AND sets
-- founder_flag=true for signups before FOUNDER_CUTOFF (default far-future, so ALL
-- v1 signups qualify). Tighten the cutoff date as v1.1 approaches.
--
-- Run in the Supabase SQL editor. Idempotent / safe to re-run. (The on_auth_user_created
-- trigger from 0001 already calls handle_new_user — only the function body changes.)
-- ============================================================================

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  founder_cutoff timestamptz := '2027-01-01T00:00:00Z'::timestamptz;  -- v1 grandfather window; tighten as v1.1 nears
begin
  insert into public.profiles (user_id, plan, trial_started_at, founder_flag)
  values (new.id, 'trial', now(), now() < founder_cutoff)
  on conflict (user_id) do nothing;
  return new;
end; $$;

-- ----------------------------------------------------------------------------
-- OPTIONAL (your call — NOT run automatically): grandfather the EXISTING backfilled
-- testers too (their rows predate this trigger, so founder_flag is still false):
--   update public.profiles set founder_flag = true where founder_flag = false;
-- ----------------------------------------------------------------------------
