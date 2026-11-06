-- 0039_tester_free_month.sql
-- -----------------------------------------------------------------------------
-- A FREE MONTH OF FLOURISH PLUS FOR THE FIRST 10 TESTERS (Amanda, 2026-11-05). NOT APPLIED.
--
-- It uses the entitlement the app and server already read: profiles.trial_ends_at. Signing up with a live tester code moves
-- that date to 30 days after signup. No store purchase, no card, no charge: on day 30 the account is on the free plan and sees
-- the normal plans screen. RevenueCat promotional grants are not used, because this app deliberately ignores them
-- (_lib/storeSubscriptions.js). Nothing here is tied to a rating or a review.
--
-- THE CAP. At most 10 rows, ever. The 11th code use is still marked a tester (0038) and gets the ordinary 14 days. A deleted
-- account keeps its row with the id gone, so its place is not given to someone else.
--
-- UNTIL THIS IS APPLIED: a code sign-up is marked a tester and gets the ordinary 14 days.
--
-- Needs 0038. Run in the Supabase SQL editor. Additive and safe to run twice.
-- -----------------------------------------------------------------------------

create table if not exists public.tester_free_months (
  id         bigint      generated always as identity primary key,
  user_id    uuid        unique references auth.users(id) on delete set null,
  granted_at timestamptz not null default now(),
  ends_at    timestamptz not null
);
alter table public.tester_free_months enable row level security;
-- grants: service_role only
grant all privileges on table public.tester_free_months to service_role;
revoke all on table public.tester_free_months from anon, authenticated;

-- One lock for every caller, so two sign-ups at the same moment cannot both take the 10th place. Called with the service role
-- key, which is what profiles_guard_privileged requires for a trial date to change.
create or replace function public.tester_free_month_grant(p_user_id uuid)
returns table (granted boolean, plus_until timestamptz, places_taken integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  taken   integer;
  created timestamptz;
  until_  timestamptz;
begin
  perform pg_advisory_xact_lock(hashtext('tester_free_months'));
  select count(*)::integer into taken from public.tester_free_months;
  if p_user_id is null or taken >= 10
     or exists (select 1 from public.tester_free_months t where t.user_id = p_user_id) then
    return query select false, null::timestamptz, taken;
    return;
  end if;
  select u.created_at into created from auth.users u where u.id = p_user_id;
  if created is null then
    return query select false, null::timestamptz, taken;
    return;
  end if;
  until_ := created + interval '30 days';
  -- Only a new account still on its trial. A founder or a paid plan has nothing to gain, and takes no place.
  update public.profiles p set trial_ends_at = until_
   where p.user_id = p_user_id and p.plan = 'trial' and p.founder_flag = false;
  if not found then
    return query select false, null::timestamptz, taken;
    return;
  end if;
  insert into public.tester_free_months (user_id, ends_at) values (p_user_id, until_);
  return query select true, until_, taken + 1;
end; $$;

revoke all on function public.tester_free_month_grant(uuid) from public, anon, authenticated;
grant execute on function public.tester_free_month_grant(uuid) to service_role;

-- -----------------------------------------------------------------------------
-- ROLLBACK (months already given keep their end date; those accounts simply run to it)
-- -----------------------------------------------------------------------------
-- drop function if exists public.tester_free_month_grant(uuid);
-- drop table if exists public.tester_free_months;
