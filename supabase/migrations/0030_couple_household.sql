-- ============================================================================
-- Flourish Money - couple mode v1, part 1: the household and what its members share
-- ============================================================================
-- Two adults, one household (docs/product/COUPLE-MODE-SPEC.md). Everyone who never
-- invites anyone stays exactly as today: one user_data row each, untouched here.
--
--   households         one row per household
--   household_members  who is in it: one owner, at most one partner, one household each
--   household_data     the shared app blob, read and written by members only
--   meeting_records    one more select policy: members read each other's records
--
-- Part 2 (0031) holds the invites, the per-member Plaid cursors and the functions
-- that change membership. Run 0030 first, then 0031.
--
-- WHO CAN DO WHAT
--   A signed-in member reads their own household, its members and its blob, and
--   updates the blob's data. Nothing else: no client inserts or deletes anywhere,
--   and a member cannot change who is in the household. Membership changes only
--   through 0031's functions, which only the service role (Netlify) may call.
--   anon has nothing on any of these tables.
--
-- RLS asks two helper functions, both about the CALLER only (auth.uid()), so a
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

alter table public.households        enable row level security;
alter table public.household_members enable row level security;
alter table public.household_data    enable row level security;

-- 2. Grants (docs/ops/SUPABASE-GRANTS.md) --------------------------------------
-- Revoked first: until 2026-10-30 Supabase gives a new public table ALL to anon and
-- authenticated, and this file may run before then.
revoke all on table public.households        from anon, authenticated;
revoke all on table public.household_members from anon, authenticated;
revoke all on table public.household_data    from anon, authenticated;
grant select on table public.households        to authenticated;
grant select on table public.household_members to authenticated;
grant select on table public.household_data    to authenticated;
grant update (data, schema_version) on table public.household_data to authenticated;
grant all privileges on table public.households        to service_role;
grant all privileges on table public.household_members to service_role;
grant all privileges on table public.household_data    to service_role;

-- 3. The two questions RLS asks, about the caller only ------------------------
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

revoke all on function public.is_household_member(uuid)   from public, anon;
revoke all on function public.shares_household_with(uuid) from public, anon;
grant execute on function public.is_household_member(uuid)   to authenticated, service_role;
grant execute on function public.shares_household_with(uuid) to authenticated, service_role;

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

-- The money meeting's records (0011) belong to the household: a member reads the other's too.
-- Writes stay with meeting.js (service role), as before.
drop policy if exists "meeting_records_select_household" on public.meeting_records;
create policy "meeting_records_select_household" on public.meeting_records
  for select to authenticated using (public.shares_household_with(user_id));

-- 5. Triggers ----------------------------------------------------------------
-- Every save moves the version on by one and stamps the time. The app cannot set either.
create or replace function public.household_data_touch()
returns trigger language plpgsql set search_path = public as $$
begin
  new.household_id := old.household_id;
  new.version      := old.version + 1;
  new.updated_at   := now();
  return new;
end; $$;
drop trigger if exists household_data_touch on public.household_data;
create trigger household_data_touch before update on public.household_data
  for each row execute function public.household_data_touch();

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
create or replace function public.household_members_after_delete()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.households where id = old.household_id) then return null; end if;
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
revoke all on function public.household_members_guard()         from public, anon, authenticated;
revoke all on function public.household_members_after_delete()  from public, anon, authenticated;

-- ============================================================================
-- READ-ONLY CHECK (after running): anon none, a signed-in user select-only on
-- the two membership tables and select + update(data) on the blob.
--   select has_table_privilege('anon', 'public.household_data', 'select'),
--          has_table_privilege('authenticated', 'public.household_data', 'select'),
--          has_column_privilege('authenticated', 'public.household_data', 'data', 'update'),
--          has_column_privilege('authenticated', 'public.household_data', 'version', 'update'),
--          has_table_privilege('authenticated', 'public.household_members', 'insert'),
--          has_table_privilege('authenticated', 'public.households', 'select');
-- Expected after: false, true, true, false, false, true.
-- ============================================================================
-- ROLLBACK (only before anyone has joined: it deletes every household and its data)
-- ============================================================================
-- drop policy if exists "meeting_records_select_household" on public.meeting_records;
-- drop table if exists public.household_data;
-- drop table if exists public.household_members;
-- drop table if exists public.households;
-- drop function if exists public.household_members_after_delete();
-- drop function if exists public.household_members_guard();
-- drop function if exists public.household_data_touch();
-- drop function if exists public.shares_household_with(uuid);
-- drop function if exists public.is_household_member(uuid);
