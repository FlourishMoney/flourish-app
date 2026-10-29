-- ============================================================================
-- Flourish Money - couple mode v1, part 1: the household and what its members share
-- ============================================================================
-- Two adults, one household (docs/product/COUPLE-MODE-SPEC.md). Everyone who never
-- invites anyone stays exactly as today: one user_data row each, untouched here.
--
--   households                one row per household
--   household_members         who is in it: one owner, at most one partner, one household each
--   household_data            the shared app blob, read and written by members only
--   household_member_private  each member's OWN keys (AI and Plaid consent, the plan cache): only that
--                             person reads or writes their row; never in the shared blob (audit H3, M6)
--   meeting_records           one more select policy: members read each other's records
--
-- Part 2 (0031) holds the invites, the per-member Plaid cursors and the functions
-- that change membership. Run 0030 first, then 0031.
--
-- WHO CAN DO WHAT
--   A signed-in member reads their own household, its members and its blob, and
--   updates the blob's data. A signed-in user reads, makes and updates their OWN
--   private row, and no one else's. Nothing else: no other client insert or delete,
--   and a member cannot change who is in the household. Membership changes only
--   through 0031's functions, which only the service role (Netlify) may call.
--   anon has nothing on any of these tables.
--
-- PERSONAL KEYS NEVER REACH THE SHARED BLOB. household_personal_keys() lists them
-- (the same list as src/lib/household.js PERSONAL_SIDE_KEYS; a test holds the two
-- together). A trigger takes them, and any `personal` section, out of every write to
-- household_data, whoever writes it; the server never reads consent from the blob.
--
-- RLS asks three helper functions, all about the CALLER only (auth.uid()), so a
-- signed-in user cannot ask about anyone else's household.
--
-- ADDITIVE. Creates new tables and functions and adds one policy to
-- meeting_records. Changes no existing row. Run in the Supabase SQL editor.
-- Idempotent, safe to re-run.
-- ============================================================================

-- 1. Tables ------------------------------------------------------------------
create table if not exists public.households (
  id                 uuid        primary key default gen_random_uuid(),
  created_by         uuid        references auth.users(id) on delete set null,
  owner_consented_at timestamptz not null,
  created_at         timestamptz not null default now()
);

create table if not exists public.household_members (
  household_id uuid        not null references public.households(id) on delete cascade,
  user_id      uuid        not null references auth.users(id) on delete cascade,
  role         text        not null check (role in ('owner', 'partner')),
  consented_at timestamptz not null,
  joined_at    timestamptz not null default now(),
  primary key (household_id, user_id),
  unique (user_id)                                   -- one household per person
);
create unique index if not exists household_members_one_owner
  on public.household_members (household_id) where role = 'owner';

create table if not exists public.household_data (
  household_id   uuid        primary key references public.households(id) on delete cascade,
  data           jsonb       not null default '{}'::jsonb,
  schema_version integer     not null default 1,
  version        bigint      not null default 1,     -- the app saves only over the version it read
  updated_at     timestamptz not null default now()
);

create table if not exists public.household_member_private (
  user_id    uuid        primary key references auth.users(id) on delete cascade,
  data       jsonb       not null default '{}'::jsonb,   -- only the personal keys (the trigger keeps nothing else)
  updated_at timestamptz not null default now()
);

alter table public.households               enable row level security;
alter table public.household_members        enable row level security;
alter table public.household_data           enable row level security;
alter table public.household_member_private enable row level security;

-- 2. Grants (docs/ops/SUPABASE-GRANTS.md) --------------------------------------
-- Revoked first: until 2026-10-30 Supabase gives a new public table ALL to anon and
-- authenticated, and this file may run before then.
revoke all on table public.households               from anon, authenticated;
revoke all on table public.household_members        from anon, authenticated;
revoke all on table public.household_data           from anon, authenticated;
revoke all on table public.household_member_private from anon, authenticated;
grant select on table public.households        to authenticated;
grant select on table public.household_members to authenticated;
grant select on table public.household_data    to authenticated;
grant update (data, schema_version) on table public.household_data to authenticated;
grant select, insert (user_id, data), update (data) on table public.household_member_private to authenticated;
grant all privileges on table public.households               to service_role;
grant all privileges on table public.household_members        to service_role;
grant all privileges on table public.household_data           to service_role;
grant all privileges on table public.household_member_private to service_role;

-- 3. The questions RLS asks, about the caller only ---------------------------
create or replace function public.is_household_member(p_household uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.household_members m
     where m.household_id = p_household and m.user_id = auth.uid()
  );
$$;

create or replace function public.shares_household_with(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from public.household_members a
      join public.household_members b on b.household_id = a.household_id
     where a.user_id = auth.uid() and b.user_id = p_user
  );
$$;

-- A record by p_user, dated p_met_on: does the caller share a household with them, and was it made since they joined?
create or replace function public.shares_household_record(p_user uuid, p_met_on date)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from public.household_members a
      join public.household_members b on b.household_id = a.household_id
     where a.user_id = auth.uid() and b.user_id = p_user and p_met_on >= b.joined_at::date
  );
$$;

revoke all on function public.is_household_member(uuid)               from public, anon;
revoke all on function public.shares_household_with(uuid)             from public, anon;
revoke all on function public.shares_household_record(uuid, date)    from public, anon;
grant execute on function public.is_household_member(uuid)            to authenticated, service_role;
grant execute on function public.shares_household_with(uuid)          to authenticated, service_role;
grant execute on function public.shares_household_record(uuid, date) to authenticated, service_role;

-- The personal keys, and a blob with them taken out / with only them kept. Pure.
create or replace function public.household_personal_keys()
returns text[] language sql immutable set search_path = public as $$
  select array['flourish_plan', 'flourish_trial_started_at', 'flourish_ai_disclosure_seen', 'flourish_ai_disclosed_at',
               'flourish_ai_coach_enabled', 'flourish_ai_third_party_consent', 'flourish_plaid_consented_at',
               'flourish_tips_dismissed']::text[];
$$;
create or replace function public.household_personal_of(p_keys jsonb)
returns jsonb language sql immutable set search_path = public as $$
  select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
    from jsonb_each(case when jsonb_typeof(p_keys) = 'object' then p_keys else '{}'::jsonb end) e
   where e.key = any(public.household_personal_keys());
$$;
create or replace function public.household_without_personal(p_blob jsonb)
returns jsonb language sql immutable set search_path = public as $$
  select case
    when jsonb_typeof(p_blob) <> 'object' then coalesce(p_blob, '{}'::jsonb)
    when jsonb_typeof(p_blob -> 'sideKeys') = 'object' then jsonb_set(p_blob - 'personal', '{sideKeys}', (p_blob -> 'sideKeys') - public.household_personal_keys())
    else p_blob - 'personal'
  end;
$$;
-- Called only by the triggers below (which run as their owner) and by 0031's functions.
revoke all on function public.household_personal_keys()           from public, anon, authenticated;
revoke all on function public.household_personal_of(jsonb)         from public, anon, authenticated;
revoke all on function public.household_without_personal(jsonb)    from public, anon, authenticated;
grant execute on function public.household_personal_keys()         to service_role;
grant execute on function public.household_personal_of(jsonb)      to service_role;
grant execute on function public.household_without_personal(jsonb) to service_role;

-- 4. Policies ----------------------------------------------------------------
drop policy if exists "households_select_member" on public.households;
create policy "households_select_member" on public.households
  for select to authenticated using (public.is_household_member(id));

drop policy if exists "household_members_select_member" on public.household_members;
create policy "household_members_select_member" on public.household_members
  for select to authenticated using (public.is_household_member(household_id));

drop policy if exists "household_data_select_member" on public.household_data;
create policy "household_data_select_member" on public.household_data
  for select to authenticated using (public.is_household_member(household_id));

drop policy if exists "household_data_update_member" on public.household_data;
create policy "household_data_update_member" on public.household_data
  for update to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));
-- No insert or delete policy: the row is made with the household (0031) and goes with it.

-- Each person's own private row: theirs alone, by auth.uid(), for reading, making and updating.
drop policy if exists "household_member_private_select_own" on public.household_member_private;
create policy "household_member_private_select_own" on public.household_member_private
  for select to authenticated using (user_id = auth.uid());
drop policy if exists "household_member_private_insert_own" on public.household_member_private;
create policy "household_member_private_insert_own" on public.household_member_private
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "household_member_private_update_own" on public.household_member_private;
create policy "household_member_private_update_own" on public.household_member_private
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- The money meeting's records (0011) belong to the household: a member reads the other's too, from the day
-- that person joined (never their records from before). Writes stay with meeting.js (service role), as before.
drop policy if exists "meeting_records_select_household" on public.meeting_records;
create policy "meeting_records_select_household" on public.meeting_records
  for select to authenticated using (public.shares_household_record(user_id, met_on));

-- 5. Triggers ----------------------------------------------------------------
-- Every save moves the version on by one and stamps the time. The app cannot set either. Every write, the
-- first included, loses any personal key and any `personal` section: the shared blob never carries consent.
create or replace function public.household_data_touch()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.data := public.household_without_personal(new.data);
  if tg_op = 'UPDATE' then
    new.household_id := old.household_id;
    new.version      := old.version + 1;
  end if;
  new.updated_at := now();
  return new;
end; $$;
drop trigger if exists household_data_touch on public.household_data;
create trigger household_data_touch before insert or update on public.household_data
  for each row execute function public.household_data_touch();

-- A private row keeps only the personal keys, and stays with its own person.
create or replace function public.household_member_private_touch()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.data := public.household_personal_of(new.data);
  if tg_op = 'UPDATE' then new.user_id := old.user_id; end if;
  new.updated_at := now();
  return new;
end; $$;
drop trigger if exists household_member_private_touch on public.household_member_private;
create trigger household_member_private_touch before insert or update on public.household_member_private
  for each row execute function public.household_member_private_touch();

-- At most two adults and exactly one owner. 0031's functions check first; this is the backstop,
-- and it locks the household row so two joins at once cannot both pass.
create or replace function public.household_members_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  perform 1 from public.households where id = new.household_id for update;
  select count(*) into n from public.household_members where household_id = new.household_id;
  if n >= 2 then raise exception 'household_full' using errcode = 'check_violation'; end if;
  if n = 0 and new.role <> 'owner' then raise exception 'household_needs_owner' using errcode = 'check_violation'; end if;
  if n > 0 and new.role = 'owner' then raise exception 'household_has_owner' using errcode = 'check_violation'; end if;
  return new;
end; $$;
drop trigger if exists household_members_guard on public.household_members;
create trigger household_members_guard before insert on public.household_members
  for each row execute function public.household_members_guard();

-- When a member goes (leaves, is removed, or deletes their account, which cascades here):
-- the one left becomes the owner; when nobody is left, the household and its data go.
-- It takes the household's lock first, as every membership change does (0031), so an
-- account deleted while the owner removes the partner, or the partner leaves, waits for
-- the other to finish instead of promoting someone who is being removed (audit B1).
create or replace function public.household_members_after_delete()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform 1 from public.households where id = old.household_id for update;
  if not found then return null; end if;
  if not exists (select 1 from public.household_members where household_id = old.household_id) then
    delete from public.households where id = old.household_id;
  elsif old.role = 'owner' then
    update public.household_members set role = 'owner' where household_id = old.household_id;
  end if;
  return null;
end; $$;
drop trigger if exists household_members_after_delete on public.household_members;
create trigger household_members_after_delete after delete on public.household_members
  for each row execute function public.household_members_after_delete();

revoke all on function public.household_data_touch()            from public, anon, authenticated;
revoke all on function public.household_member_private_touch()  from public, anon, authenticated;
revoke all on function public.household_members_guard()         from public, anon, authenticated;
revoke all on function public.household_members_after_delete()  from public, anon, authenticated;

-- ============================================================================
-- READ-ONLY CHECK (after running): anon none, a signed-in user select-only on
-- the two membership tables, select + update(data) on the blob, and their own
-- private row (whose owner column cannot be changed).
--   select has_table_privilege('anon', 'public.household_data', 'select'),
--          has_table_privilege('authenticated', 'public.household_data', 'select'),
--          has_column_privilege('authenticated', 'public.household_data', 'data', 'update'),
--          has_column_privilege('authenticated', 'public.household_data', 'version', 'update'),
--          has_table_privilege('authenticated', 'public.household_members', 'insert'),
--          has_table_privilege('authenticated', 'public.households', 'select'),
--          has_table_privilege('anon', 'public.household_member_private', 'select'),
--          has_column_privilege('authenticated', 'public.household_member_private', 'user_id', 'update');
-- Expected after: false, true, true, false, false, true, false, false.
-- ============================================================================
-- ROLLBACK (only before anyone has joined: it deletes every household and its data)
-- ============================================================================
-- drop policy if exists "meeting_records_select_household" on public.meeting_records;
-- drop table if exists public.household_member_private;
-- drop table if exists public.household_data;
-- drop table if exists public.household_members;
-- drop table if exists public.households;
-- drop function if exists public.household_members_after_delete();
-- drop function if exists public.household_members_guard();
-- drop function if exists public.household_member_private_touch();
-- drop function if exists public.household_data_touch();
-- drop function if exists public.household_without_personal(jsonb);
-- drop function if exists public.household_personal_of(jsonb);
-- drop function if exists public.household_personal_keys();
-- drop function if exists public.shares_household_record(uuid, date);
-- drop function if exists public.shares_household_with(uuid);
-- drop function if exists public.is_household_member(uuid);
