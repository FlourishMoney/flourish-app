-- ============================================================================
-- Flourish Money - couple mode v1, part 2: invites, Plaid cursors, membership changes
-- ============================================================================
-- Run AFTER 0030. Server-only: no signed-in user reads or writes anything in this
-- file, and every function here may be called by the service role only
-- (netlify/functions/household.js and plaid.js, which check the caller first).
--
--   household_invites        one invite to one address: link token + 6-character
--                            code, both stored as SHA-256 hashes only; 7 days; once
--   household_join_attempts  failed joins, for the limit of 10 an hour per account
--   plaid_item_cursors       each member's own /transactions/sync cursor for a bank
--                            the other member linked (the linker keeps
--                            plaid_items.next_cursor, unchanged)
--
--   household_create_invite   the owner invites (makes the household on first use and
--                             copies the owner's user_data blob into household_data)
--   household_accept_invite   the partner joins (expiry, single use, address, 2 adults)
--   household_leave           a member leaves: their banks come out of the shared blob,
--                             and they start fresh (their user_data row is deleted).
--                             The last one out gets the household's data back instead.
--   household_remove_partner  the owner removes the partner (as if the partner left)
--
-- ADDITIVE. Reads public.user_data and public.plaid_items (no change to either).
-- Idempotent, safe to re-run.
-- ============================================================================

-- grants: service_role only

-- 1. Tables ------------------------------------------------------------------
create table if not exists public.household_invites (
  id                 uuid        primary key default gen_random_uuid(),
  household_id       uuid        not null references public.households(id) on delete cascade,
  created_by         uuid        not null references auth.users(id) on delete cascade,
  email_key          text        not null,              -- lower(trim(address)): only that account may join
  token_hash         text        not null unique,       -- sha256 hex of the link's token
  code_hash          text        not null,              -- sha256 hex of the 6-character code
  owner_consented_at timestamptz not null,
  created_at         timestamptz not null default now(),
  expires_at         timestamptz not null,
  used_at            timestamptz,
  used_by            uuid        references auth.users(id) on delete set null,
  revoked_at         timestamptz
);
-- One open invite per household, and no two open invites share a code.
create unique index if not exists household_invites_one_open
  on public.household_invites (household_id) where used_at is null and revoked_at is null;
create unique index if not exists household_invites_open_code
  on public.household_invites (code_hash) where used_at is null and revoked_at is null;

create table if not exists public.household_join_attempts (
  user_id uuid        not null references auth.users(id) on delete cascade,
  at      timestamptz not null default now()
);
create index if not exists household_join_attempts_user_at on public.household_join_attempts (user_id, at);

create table if not exists public.plaid_item_cursors (
  plaid_item_id uuid        not null references public.plaid_items(id) on delete cascade,
  user_id       uuid        not null references auth.users(id) on delete cascade,
  next_cursor   text,
  updated_at    timestamptz not null default now(),
  primary key (plaid_item_id, user_id)
);

alter table public.household_invites       enable row level security;
alter table public.household_join_attempts enable row level security;
alter table public.plaid_item_cursors      enable row level security;
-- No policies on purpose: a browser never reaches these rows.
revoke all on table public.household_invites       from anon, authenticated;
revoke all on table public.household_join_attempts from anon, authenticated;
revoke all on table public.plaid_item_cursors      from anon, authenticated;
grant all privileges on table public.household_invites       to service_role;
grant all privileges on table public.household_join_attempts to service_role;
grant all privileges on table public.plaid_item_cursors      to service_role;

-- 2. The owner invites ---------------------------------------------------------
-- Makes the household the first time (owner, consent time, and the owner's own blob copied
-- in as the shared one), cancels any open invite, and records the new one. Answers jsonb:
--   { result: 'invited', household_id, invite_id, expires_at, created }   or
--   { result: 'not_owner' | 'household_full' | 'code_taken' }
create or replace function public.household_create_invite(p_owner uuid, p_email_key text, p_token_hash text, p_code_hash text,
                                                          p_ttl interval default interval '7 days')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  hid uuid; r text; n integer; inv uuid; exp timestamptz; made boolean := false;
begin
  perform pg_advisory_xact_lock(hashtext('household:' || p_owner::text));
  select household_id, role into hid, r from public.household_members where user_id = p_owner;
  if hid is not null and r <> 'owner' then return jsonb_build_object('result', 'not_owner'); end if;
  if hid is null then
    insert into public.households (created_by, owner_consented_at) values (p_owner, now()) returning id into hid;
    insert into public.household_members (household_id, user_id, role, consented_at) values (hid, p_owner, 'owner', now());
    insert into public.household_data (household_id, data, schema_version)
    select hid, coalesce(u.data, '{}'::jsonb), coalesce(u.schema_version, 1)
      from (select 1) one left join public.user_data u on u.user_id = p_owner;
    made := true;
  end if;
  perform 1 from public.households where id = hid for update;
  select count(*) into n from public.household_members where household_id = hid;
  if n >= 2 then return jsonb_build_object('result', 'household_full'); end if;
  update public.household_invites set revoked_at = now()
   where household_id = hid and used_at is null and revoked_at is null;
  if exists (select 1 from public.household_invites where code_hash = p_code_hash and used_at is null and revoked_at is null) then
    return jsonb_build_object('result', 'code_taken');            -- the function makes a new code and asks again
  end if;
  exp := now() + p_ttl;
  insert into public.household_invites (household_id, created_by, email_key, token_hash, code_hash, owner_consented_at, expires_at)
  values (hid, p_owner, p_email_key, p_token_hash, p_code_hash, now(), exp) returning id into inv;
  return jsonb_build_object('result', 'invited', 'household_id', hid, 'invite_id', inv, 'expires_at', exp, 'created', made);
end; $$;

-- The owner cancels the open invite.
create or replace function public.household_revoke_invite(p_owner uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare hid uuid; n integer;
begin
  select household_id into hid from public.household_members where user_id = p_owner and role = 'owner';
  if hid is null then return jsonb_build_object('result', 'not_owner'); end if;
  update public.household_invites set revoked_at = now()
   where household_id = hid and used_at is null and revoked_at is null;
  get diagnostics n = row_count;
  return jsonb_build_object('result', 'revoked', 'count', n);
end; $$;

-- 3. The partner joins -----------------------------------------------------------
-- By the link (p_token_hash) or by the code (p_code_hash, matched together with the address).
-- The invite row is locked, so the same invite cannot be used twice even at the same moment.
-- Answers jsonb { result, household_id }: 'joined', 'already_member', 'invalid', 'expired', 'used',
-- 'wrong_account', 'in_another_household', 'household_full', 'too_many_attempts'.
create or replace function public.household_accept_invite(p_user uuid, p_email_key text, p_token_hash text, p_code_hash text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  inv public.household_invites%rowtype; mine uuid; n integer;
begin
  if (select count(*) from public.household_join_attempts where user_id = p_user and at > now() - interval '1 hour') >= 10 then
    return jsonb_build_object('result', 'too_many_attempts');
  end if;
  if p_token_hash is not null then
    select * into inv from public.household_invites where token_hash = p_token_hash for update;
  elsif p_code_hash is not null then
    select * into inv from public.household_invites
     where code_hash = p_code_hash and email_key = p_email_key and used_at is null and revoked_at is null
     order by created_at desc limit 1 for update;
  end if;
  if inv.id is null or inv.revoked_at is not null then
    insert into public.household_join_attempts (user_id) values (p_user);
    return jsonb_build_object('result', 'invalid');
  end if;
  select household_id into mine from public.household_members where user_id = p_user;
  if mine = inv.household_id then return jsonb_build_object('result', 'already_member', 'household_id', mine); end if;
  if inv.used_at is not null then return jsonb_build_object('result', 'used'); end if;
  if inv.expires_at <= now() then return jsonb_build_object('result', 'expired'); end if;
  if inv.email_key <> p_email_key then
    insert into public.household_join_attempts (user_id) values (p_user);
    return jsonb_build_object('result', 'wrong_account');
  end if;
  if mine is not null then return jsonb_build_object('result', 'in_another_household'); end if;
  perform 1 from public.households where id = inv.household_id for update;
  select count(*) into n from public.household_members where household_id = inv.household_id;
  if n = 0 then return jsonb_build_object('result', 'invalid'); end if;
  if n >= 2 then return jsonb_build_object('result', 'household_full'); end if;
  insert into public.household_members (household_id, user_id, role, consented_at) values (inv.household_id, p_user, 'partner', now());
  update public.household_invites set used_at = now(), used_by = p_user where id = inv.id;
  return jsonb_build_object('result', 'joined', 'household_id', inv.household_id);
end; $$;

-- 4. Leaving ---------------------------------------------------------------------
-- The banks this person linked come out of the shared blob (accounts, their liabilities and any
-- transactions on them), so the other member keeps no copy of them. Their own bank links stay theirs.
create or replace function public.household_strip_member_banks(p_household uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare items text[]; gone text[];
begin
  select coalesce(array_agg(item_id), '{}') into items from public.plaid_items where user_id = p_user;
  if cardinality(items) = 0 then return; end if;
  select coalesce(array_agg(e->>'id'), '{}') into gone
    from public.household_data d, jsonb_array_elements(
      case when jsonb_typeof(d.data #> '{core,appData,accounts}') = 'array' then d.data #> '{core,appData,accounts}' else '[]'::jsonb end) e
   where d.household_id = p_household and e->>'_item' = any(items);
  update public.household_data d set data = jsonb_set(d.data, '{core,appData,accounts}', coalesce((
      select jsonb_agg(e) from jsonb_array_elements(d.data #> '{core,appData,accounts}') e where not coalesce(e->>'_item' = any(items), false)), '[]'::jsonb))
   where d.household_id = p_household and jsonb_typeof(d.data #> '{core,appData,accounts}') = 'array';
  if cardinality(gone) = 0 then return; end if;
  update public.household_data d set data = jsonb_set(d.data, '{core,appData,transactions}', coalesce((
      select jsonb_agg(t) from jsonb_array_elements(d.data #> '{core,appData,transactions}') t where not coalesce(t->>'account_id' = any(gone), false)), '[]'::jsonb))
   where d.household_id = p_household and jsonb_typeof(d.data #> '{core,appData,transactions}') = 'array';
  update public.household_data d set data = jsonb_set(d.data, '{core,appData,liabilities}', coalesce((
      select jsonb_agg(l) from jsonb_array_elements(d.data #> '{core,appData,liabilities}') l where not coalesce(l->>'account_id' = any(gone), false)), '[]'::jsonb))
   where d.household_id = p_household and jsonb_typeof(d.data #> '{core,appData,liabilities}') = 'array';
end; $$;

-- One person goes. Someone left behind: this person's banks come out of the blob, and their own
-- user_data row is deleted, so they start fresh. Nobody left behind (an owner whose invite was never
-- used): the household's data goes back to their user_data row and the household is removed.
-- Answers jsonb { result: 'left' | 'not_member', household_id, role, remaining }.
create or replace function public.household_leave(p_user uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare hid uuid; r text; others integer;
begin
  select household_id, role into hid, r from public.household_members where user_id = p_user;
  if hid is null then return jsonb_build_object('result', 'not_member'); end if;
  perform 1 from public.households where id = hid for update;
  select count(*) into others from public.household_members where household_id = hid and user_id <> p_user;
  if others > 0 then
    perform public.household_strip_member_banks(hid, p_user);
    delete from public.user_data where user_id = p_user;
  else
    insert into public.user_data (user_id, data, schema_version)
    select p_user, d.data, d.schema_version from public.household_data d where d.household_id = hid
    on conflict (user_id) do update set data = excluded.data, schema_version = excluded.schema_version;
  end if;
  delete from public.household_members where household_id = hid and user_id = p_user;   -- the trigger promotes or removes
  return jsonb_build_object('result', 'left', 'household_id', hid, 'role', r, 'remaining', others);
end; $$;

-- The owner removes the partner: exactly what happens when the partner leaves.
create or replace function public.household_remove_partner(p_owner uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare hid uuid; partner uuid;
begin
  select household_id into hid from public.household_members where user_id = p_owner and role = 'owner';
  if hid is null then return jsonb_build_object('result', 'not_owner'); end if;
  select user_id into partner from public.household_members where household_id = hid and role = 'partner';
  if partner is null then return jsonb_build_object('result', 'no_partner'); end if;
  return public.household_leave(partner) || jsonb_build_object('result', 'removed');
end; $$;

revoke all on function public.household_create_invite(uuid, text, text, text, interval) from public, anon, authenticated;
revoke all on function public.household_revoke_invite(uuid)                         from public, anon, authenticated;
revoke all on function public.household_accept_invite(uuid, text, text, text)       from public, anon, authenticated;
revoke all on function public.household_strip_member_banks(uuid, uuid)              from public, anon, authenticated;
revoke all on function public.household_leave(uuid)                                 from public, anon, authenticated;
revoke all on function public.household_remove_partner(uuid)                        from public, anon, authenticated;
grant execute on function public.household_create_invite(uuid, text, text, text, interval) to service_role;
grant execute on function public.household_revoke_invite(uuid)                         to service_role;
grant execute on function public.household_accept_invite(uuid, text, text, text)       to service_role;
grant execute on function public.household_leave(uuid)                                 to service_role;
grant execute on function public.household_remove_partner(uuid)                        to service_role;

-- ============================================================================
-- BEFORE RUNNING: user_data has no migration in this repo. These functions expect
-- production's shape (user_id primary key, data jsonb, schema_version integer):
--   select column_name, data_type from information_schema.columns
--    where table_schema = 'public' and table_name = 'user_data' order by ordinal_position;
-- READ-ONLY CHECK (after running): nobody signed in reaches the invites or calls a function.
--   select has_table_privilege('authenticated', 'public.household_invites', 'select'),
--          has_table_privilege('anon', 'public.plaid_item_cursors', 'select'),
--          has_function_privilege('authenticated', 'public.household_accept_invite(uuid, text, text, text)', 'execute'),
--          has_function_privilege('service_role', 'public.household_accept_invite(uuid, text, text, text)', 'execute');
-- Expected after: false, false, false, true.
-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- drop function if exists public.household_remove_partner(uuid);
-- drop function if exists public.household_leave(uuid);
-- drop function if exists public.household_strip_member_banks(uuid, uuid);
-- drop function if exists public.household_accept_invite(uuid, text, text, text);
-- drop function if exists public.household_revoke_invite(uuid);
-- drop function if exists public.household_create_invite(uuid, text, text, text, interval);
-- drop table if exists public.plaid_item_cursors;
-- drop table if exists public.household_join_attempts;
-- drop table if exists public.household_invites;
