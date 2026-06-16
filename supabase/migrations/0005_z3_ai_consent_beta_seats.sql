-- ============================================================================
-- Flourish Money — Sprint Z3 Phase A: server-enforced AI consent + atomic beta seats
-- ============================================================================
-- Run in the Supabase SQL editor (Dashboard → SQL → New query → Run).
-- Idempotent / safe to re-run.  Applied 2026-06-11 (Amanda confirmed).
-- ============================================================================

-- ─── #2  SERVER-ENFORCED AI CONSENT ─────────────────────────────────────────
-- Two timestamps on profiles: when third-party (Anthropic) AI consent was accepted,
-- and when it was revoked. coach.js (service role) blocks all AI calls when
-- ai_third_party_consent_revoked_at IS NOT NULL.
alter table public.profiles
  add column if not exists ai_third_party_consent_at         timestamptz,
  add column if not exists ai_third_party_consent_revoked_at timestamptz;

-- Lock the consent columns to the service role (the browser must go through /api/coach,
-- which writes via the service-role key), mirroring the plan/founder/trial lockdown from 0002.
create or replace function public.profiles_guard_privileged()
returns trigger language plpgsql as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role'
     and ( new.plan                              is distinct from old.plan
        or new.founder_flag                      is distinct from old.founder_flag
        or new.trial_started_at                  is distinct from old.trial_started_at
        or new.ai_third_party_consent_at         is distinct from old.ai_third_party_consent_at
        or new.ai_third_party_consent_revoked_at is distinct from old.ai_third_party_consent_revoked_at ) then
    raise exception 'plan / founder_flag / trial_started_at / ai consent are server-managed';
  end if;
  return new;
end; $$;
-- (the profiles_guard_privileged trigger from 0002 already calls this fn — no trigger change needed)

-- ─── #1  ATOMIC BETA SEATS ──────────────────────────────────────────────────
create table if not exists public.beta_signups (
  email      text primary key,                 -- PK closes the duplicate-email race
  created_at timestamptz not null default now()
);
alter table public.beta_signups enable row level security;   -- RLS on + no policy = browser denied; only the service role touches it

-- Backfill from existing auth users so the 30-seat cap counts CURRENT testers
-- (without this, the new path would allow 30 MORE on top of everyone already signed up).
insert into public.beta_signups (email, created_at)
select lower(email), created_at from auth.users
where email is not null
on conflict (email) do nothing;

-- Atomic reserve: a txn-scoped advisory lock serializes count→insert so two concurrent
-- signups can't both pass the cap check (closes the TOCTOU). Returns 'ok'|'cap_reached'|'email_exists'.
create or replace function public.reserve_beta_seat(p_email text, p_cap int)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(trim(p_email));
  v_count int;
begin
  perform pg_advisory_xact_lock(hashtext('flourish_beta_seat'));
  if exists (select 1 from public.beta_signups where email = v_email) then
    return 'email_exists';
  end if;
  select count(*) into v_count from public.beta_signups;
  if v_count >= p_cap then
    return 'cap_reached';
  end if;
  insert into public.beta_signups (email) values (v_email);
  return 'ok';
end; $$;

revoke all on function public.reserve_beta_seat(text, int) from public, anon, authenticated;
grant execute on function public.reserve_beta_seat(text, int) to service_role;
