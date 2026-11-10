-- 0046_trial_plan_first.sql
-- -----------------------------------------------------------------------------
-- TRIAL PLAN FIRST (Amanda, 2026-11-10): the usual app-store trial, behind TRIAL_PLAN_FIRST. NOT APPLIED.
-- Amanda runs it, in the Supabase SQL editor, before the switch goes on. Additive, one transaction, safe to run twice.
--
-- 1. A FOUNDING TRIAL CANCELLED BEFORE ITS FIRST CHARGE GIVES ITS SEAT BACK. A founding subscription takes a seat when
--    it starts (0032), which with a 14-day free trial is the trial's first day. If it is cancelled inside the 14 days it
--    never paid: the seat is released with the reason 'trial_ended_unpaid' (0032 allowed only 'refund'), and, if that
--    account subscribes to the founding price again later, its seat is taken again (0032 took a seat once per
--    account, ever). A refund is unchanged.
--
-- UNTIL THIS IS APPLIED: a release for 'trial_ended_unpaid' is refused by 0032's check, and the server logs it and
-- carries on (_lib/foundingSeats.js releaseTrialSeat): the seat simply stays held, as it would today.
--
-- 2. ONE REMINDER PER TRIAL, 3 DAYS BEFORE ITS FIRST CHARGE (item 3, _lib/trialReminder.js).
--    trial_reminders         one row per trial: provider ('stripe', 'app_store', 'play_store') and subscription_ref (the
--                            Stripe subscription id; for a store, the account and plan), claimed before the send and
--                            stamped sent_at after it. The primary key is what makes it never more than one.
--    trial_reminder_optouts  accounts that used the email's one-click unsubscribe.
--    No email address, no amount. Service role only. Deleted with the account.
-- UNTIL THIS IS APPLIED: a reminder cannot be claimed, so none is sent (the claim is the lock, and it fails closed).
-- -----------------------------------------------------------------------------

begin;

alter table public.founding_seats drop constraint if exists founding_seats_release_check;
alter table public.founding_seats add constraint founding_seats_release_check
  check ((released_at is null and release_reason is null)
      or (released_at is not null and release_reason in ('refund', 'trial_ended_unpaid')));

-- As 0032's, with one change: an account whose seat went back because its founding TRIAL was cancelled unpaid takes
-- it again when it subscribes to the founding price again. Any other seat is still taken once.
create or replace function public.founding_seat_take(p_user_id uuid, p_provider text, p_ref text)
returns table (taken boolean, seats integer, over_cap boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  held integer;
begin
  perform pg_advisory_xact_lock(hashtext('founding_seats'));
  if p_user_id is null or public.founding_seat_excluded(p_user_id) then
    return query select false, public.founding_seats_taken(), false;
    return;
  end if;
  if exists (select 1 from public.founding_seats s where s.user_id = p_user_id and s.release_reason = 'trial_ended_unpaid') then
    held := public.founding_seats_taken();
    update public.founding_seats
       set provider = p_provider, provider_ref = p_ref, taken_at = now(), over_cap = held >= 50,
           source = 'payment', released_at = null, release_reason = null
     where user_id = p_user_id;
    return query select true, held + 1, held >= 50;
    return;
  end if;
  if exists (select 1 from public.founding_seats s where s.user_id = p_user_id) then
    return query select false, public.founding_seats_taken(), false;
    return;
  end if;
  held := public.founding_seats_taken();
  insert into public.founding_seats (user_id, provider, provider_ref, over_cap)
  values (p_user_id, p_provider, p_ref, held >= 50);
  return query select true, held + 1, held >= 50;
end; $$;

revoke all on function public.founding_seat_take(uuid, text, text) from public, anon, authenticated;
grant execute on function public.founding_seat_take(uuid, text, text) to service_role;

create table if not exists public.trial_reminders (
  provider          text        not null check (provider in ('stripe', 'app_store', 'play_store')),
  subscription_ref  text        not null check (char_length(subscription_ref) between 1 and 200),
  user_id           uuid        not null references auth.users(id) on delete cascade,
  trial_end         timestamptz not null,
  claimed_at        timestamptz not null default now(),
  sent_at           timestamptz,
  primary key (provider, subscription_ref)
);
create index if not exists trial_reminders_user on public.trial_reminders (user_id);
alter table public.trial_reminders enable row level security;
-- grants: service_role only
revoke all on table public.trial_reminders from anon, authenticated;
grant all privileges on table public.trial_reminders to service_role;

create table if not exists public.trial_reminder_optouts (
  user_id     uuid        primary key references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now()
);
alter table public.trial_reminder_optouts enable row level security;
-- grants: service_role only
revoke all on table public.trial_reminder_optouts from anon, authenticated;
grant all privileges on table public.trial_reminder_optouts to service_role;

commit;

-- ============================================================================
-- READ-ONLY CHECK (after running). Expected: true, 0, then true, true, false, false, 0.
--   select pg_get_constraintdef(c.oid) like '%trial_ended_unpaid%'
--     from pg_constraint c where c.conname = 'founding_seats_release_check';
--   select count(*) from public.founding_seats where release_reason = 'trial_ended_unpaid';
--   select (select relrowsecurity from pg_class where oid = 'public.trial_reminders'::regclass),
--          (select relrowsecurity from pg_class where oid = 'public.trial_reminder_optouts'::regclass),
--          has_table_privilege('authenticated', 'public.trial_reminders', 'select'),
--          has_table_privilege('anon', 'public.trial_reminder_optouts', 'select'),
--          (select count(*) from public.trial_reminders) + (select count(*) from public.trial_reminder_optouts);
-- ============================================================================
-- ROLLBACK (only while TRIAL_PLAN_FIRST is off and no seat carries 'trial_ended_unpaid'):
--   drop table if exists public.trial_reminder_optouts;
--   drop table if exists public.trial_reminders;
--   alter table public.founding_seats drop constraint founding_seats_release_check;
--   alter table public.founding_seats add constraint founding_seats_release_check
--     check ((released_at is null and release_reason is null) or (released_at is not null and release_reason in ('refund')));
--   then run 0032's founding_seat_take again.
-- ============================================================================
