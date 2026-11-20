-- 0051_complimentary_access.sql
-- -----------------------------------------------------------------------------
-- COMPLIMENTARY ACCESS, SET ON THE SERVER (2026-11-20). NOT APPLIED.
--
-- One row for an account that has been given access free, by hand: the main plan, the Plus add-on, or both. Nothing
-- in the app or on the website can write it; only the service role can, through the one function below. Who an
-- account belongs to, why it was given, and the steps to give or remove it are recorded OUTSIDE this public repo:
-- this file, and the code that reads the table, hold no name, no email address and no account id.
--
--   main_plan    the main plan, free. It is given the way a complimentary plan already is: profiles.plan = 'plus'
--                (every plan check, server and app, already reads that; _lib/foundingCohort.js already treats such a
--                profile as complimentary). prior_plan remembers what the profile said before, so removing it puts
--                the profile back.
--   plus_addon   the Plus add-on, free. Read by netlify/functions/_lib/plusAddon.js (getPlusEntitlement), beside the
--                paid rows of 0044. It is not a subscription: no price, no store, no Stripe customer, no renewal, and
--                it is never counted as revenue, as a subscriber or toward a creator's commission.
--
-- No amount, no card, no email, no name, no note. Deleted with the account (on delete cascade).
--
-- UNTIL THIS IS APPLIED: the server treats a missing table as "nobody has complimentary Plus" and goes on. And
-- complimentary Plus, like paid Plus, shows nothing while PLUS_ENABLED is unset. Run in the Supabase SQL editor.
-- Additive and safe to run twice. It gives nobody anything by itself: the table starts empty.
-- -----------------------------------------------------------------------------

create table if not exists public.complimentary_access (
  user_id     uuid        primary key references auth.users(id) on delete cascade,
  main_plan   boolean     not null default false,
  plus_addon  boolean     not null default false,
  prior_plan  text,
  granted_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint complimentary_access_gives_something check (main_plan or plus_addon)
);

alter table public.complimentary_access enable row level security;
-- No policy: the Data API roles can neither read nor write it. Only the service role.
-- grants: service_role only
revoke all on table public.complimentary_access from anon, authenticated;
grant all privileges on table public.complimentary_access to service_role;

-- THE ONE WAY IN. Sets both answers for one account, in one transaction, and returns what is now true.
--   p_main_plan true    the profile becomes 'plus' (unless it is already 'plus' or 'pro'), and what it said before is
--                       remembered once.
--   p_main_plan false   a profile this function moved to 'plus' goes back to what it said before. A profile that was
--                       already 'plus' or 'pro' before the first call is never changed.
--   p_plus_addon        complimentary Plus on or off.
--   both false          the row is removed.
-- The caller must be the service role: profiles_guard_privileged (0002, 0007) refuses a change of plan from anyone
-- else, and then nothing here is written at all. An account with no profile gets nothing (account_found false).
create or replace function public.complimentary_access_set(p_user_id uuid, p_main_plan boolean, p_plus_addon boolean)
returns table (account_found boolean, main_plan boolean, plus_addon boolean, profile_plan text)
language plpgsql
security definer
set search_path = public
as $$
declare
  cur_plan  text;
  had_main  boolean;
  prior     text;
begin
  if p_user_id is null or p_main_plan is null or p_plus_addon is null then
    return query select false, false, false, null::text;
    return;
  end if;
  select p.plan into cur_plan from public.profiles p where p.user_id = p_user_id for update;
  if not found then
    return query select false, false, false, null::text;
    return;
  end if;
  select c.main_plan, c.prior_plan into had_main, prior
    from public.complimentary_access c where c.user_id = p_user_id for update;
  had_main := coalesce(had_main, false);

  if p_main_plan then
    if cur_plan not in ('plus', 'pro') then
      prior := coalesce(prior, cur_plan);
      update public.profiles p set plan = 'plus' where p.user_id = p_user_id;
      cur_plan := 'plus';
    end if;
  else
    if had_main and prior is not null and cur_plan = 'plus' then
      update public.profiles p set plan = prior where p.user_id = p_user_id;
      cur_plan := prior;
    end if;
    prior := null;
  end if;

  if not p_main_plan and not p_plus_addon then
    delete from public.complimentary_access c where c.user_id = p_user_id;
  else
    insert into public.complimentary_access as c (user_id, main_plan, plus_addon, prior_plan)
    values (p_user_id, p_main_plan, p_plus_addon, prior)
    on conflict (user_id) do update
      set main_plan = excluded.main_plan, plus_addon = excluded.plus_addon, prior_plan = excluded.prior_plan, updated_at = now();
  end if;
  return query select true, p_main_plan, p_plus_addon, cur_plan;
end; $$;

revoke all on function public.complimentary_access_set(uuid, boolean, boolean) from public, anon, authenticated;
grant execute on function public.complimentary_access_set(uuid, boolean, boolean) to service_role;

-- ============================================================================
-- READ-ONLY CHECK (after running): RLS on, the Data API roles cannot read it, and it is empty.
--   select (select relrowsecurity from pg_class where oid = 'public.complimentary_access'::regclass),
--          has_table_privilege('authenticated', 'public.complimentary_access', 'select'),
--          has_table_privilege('anon', 'public.complimentary_access', 'select'),
--          has_function_privilege('authenticated', 'public.complimentary_access_set(uuid, boolean, boolean)', 'execute'),
--          (select count(*) from public.complimentary_access);
-- Expected: true, false, false, false, 0.
-- ============================================================================
-- ROLLBACK (only while the table is empty; a profile already moved to 'plus' stays 'plus' until put back by hand):
-- drop function if exists public.complimentary_access_set(uuid, boolean, boolean);
-- drop table if exists public.complimentary_access;
-- ============================================================================
