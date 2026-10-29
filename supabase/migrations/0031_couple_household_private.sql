-- ============================================================================
-- Flourish Money - couple mode v1, part 2: invites, Plaid cursors, membership changes
-- ============================================================================
-- Run AFTER 0030. Server-only: no signed-in user reads or writes anything in this
-- file, and every function here may be called by the service role only
-- (netlify/functions/household.js and plaid.js, which check the caller first).
--
--   household_invites        one invite to one address: link token + 6-character
--                            code, both stored as SHA-256 hashes only; 7 days; once;
--                            it dies after 5 wrong tries (failed_attempts)
--   household_join_attempts  every failed join, for the limits: 10 an hour per account,
--                            10 an hour per invited address, 30 an hour per network
--   plaid_item_cursors       each member's own /transactions/sync cursor for a bank
--                            the other member linked (the linker keeps
--                            plaid_items.next_cursor, unchanged)
--   household_purchase_holds ONE purchase attempt holds the household (a Stripe checkout,
--                            or one tap in the store app); no other attempt, by either
--                            person on any platform, may start until it ends: 32 minutes
--                            from when it began, or 7 days for one the store calls pending;
--                            nothing ends it sooner (a paid purchase is answered by its paid row)
--   plaid_account_owners     who linked each bank account (kept by the server from Plaid's
--                            own answers), so cleanup never depends on a live Plaid row;
--                            a sign-in deleted directly takes its rows with it (a trigger
--                            on auth.users, after its banks have left the shared blob)
--
--   household_create_invite   the owner invites (makes the household on first use and
--                             copies the owner's user_data blob into household_data,
--                             their personal keys into their own private row)
--   household_accept_invite   the partner joins (expiry, single use, address, 2 adults,
--                             the attempt limits); their personal keys go to their own
--                             private row and their old user_data row is deleted
--   household_hold_purchase   a purchase attempt holds the household; household_hold_pending
--                             keeps it while the store waits (7 days at most); no function
--                             ends a hold early (audit round 4 a3)
--   household_disconnect_item a member disconnects a bank: what came from it leaves the
--                             shared blob, then its plaid_items row goes, in one transaction
--   household_leave           a member leaves: their banks and everything derived from
--                             them come out of the shared blob, and they start fresh
--                             (their user_data and private rows are deleted). The last
--                             one out gets the household's data back instead.
--   household_remove_partner  the owner removes the partner (as if the partner left)
--
-- ONE LOCK. Every function that changes who is in a household takes that household's
-- row lock (households ... for update) FIRST, then reads membership again under it, and
-- makes the whole change in the same transaction. 0030's delete trigger (an account
-- deleted, which promotes the partner) takes the same lock. So a remove, a leave and an
-- ownership change at the same moment run one after the other, each on what the other
-- left (audit B1).
--
-- ADDITIVE. No schema change to public.user_data or public.plaid_items. Rows: a member's
-- user_data row is deleted when they join or leave, and written back for the last one out.
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
  revoked_at         timestamptz,
  revoke_reason      text        check (revoke_reason in ('owner', 'replaced', 'too_many_tries')),
  failed_attempts    integer     not null default 0     -- wrong tries against it; at 5 it dies
);
-- One open invite per household, and no two open invites share a code.
create unique index if not exists household_invites_one_open
  on public.household_invites (household_id) where used_at is null and revoked_at is null;
create unique index if not exists household_invites_open_code
  on public.household_invites (code_hash) where used_at is null and revoked_at is null;

-- One row per FAILED try, recorded in the same transaction as the answer, under the locks below. Kept a day.
-- target_key: sha256 of the address the try was for; net_key: the server's keyed hash of the network (never an
-- IP address); invite_id: the invite it was tried against, when one was found.
create table if not exists public.household_join_attempts (
  user_id    uuid        not null references auth.users(id) on delete cascade,
  target_key text        not null,
  net_key    text,
  invite_id  uuid        references public.household_invites(id) on delete set null,
  result     text        not null,
  at         timestamptz not null default now()
);
create index if not exists household_join_attempts_user_at   on public.household_join_attempts (user_id, at);
create index if not exists household_join_attempts_target_at on public.household_join_attempts (target_key, at);
create index if not exists household_join_attempts_net_at    on public.household_join_attempts (net_key, at);
create index if not exists household_join_attempts_at        on public.household_join_attempts (at);

create table if not exists public.plaid_item_cursors (
  plaid_item_id uuid        not null references public.plaid_items(id) on delete cascade,
  user_id       uuid        not null references auth.users(id) on delete cascade,
  next_cursor   text,
  updated_at    timestamptz not null default now(),
  primary key (plaid_item_id, user_id)
);

create table if not exists public.household_purchase_holds (
  household_id uuid        primary key references public.households(id) on delete cascade,
  user_id      uuid        not null references auth.users(id) on delete cascade,
  provider     text        not null check (provider in ('stripe', 'app_store', 'play_store')),
  attempt_id   text        not null,                 -- the one attempt holding it: a Stripe checkout id, or the app's random id
  pending      boolean     not null default false,   -- the store said "pending": held to its 7 days (expires_at)
  expires_at   timestamptz not null,                  -- fixed from created_at: 32 minutes, or 7 days once pending; never moved later
  created_at   timestamptz not null default now()
);

-- Who linked each bank account, from Plaid's own answers (plaid.js records it whenever Plaid lists an item's
-- accounts). No foreign key on purpose: the record outlives the plaid_items row, so a bank disconnected some
-- other way, or a sign-in deleted, still tells leave's cleanup which accounts were whose. Deleted with the
-- account (delete_account).
create table if not exists public.plaid_account_owners (
  user_id    uuid        not null,
  item_id    text        not null,
  account_id text        not null,
  seen_at    timestamptz not null default now(),
  primary key (user_id, account_id)
);
create index if not exists plaid_account_owners_item on public.plaid_account_owners (user_id, item_id);

alter table public.household_invites        enable row level security;
alter table public.household_join_attempts  enable row level security;
alter table public.plaid_item_cursors       enable row level security;
alter table public.household_purchase_holds enable row level security;
alter table public.plaid_account_owners     enable row level security;
-- No policies on purpose: a browser never reaches these rows.
revoke all on table public.household_invites        from anon, authenticated;
revoke all on table public.household_join_attempts  from anon, authenticated;
revoke all on table public.plaid_item_cursors       from anon, authenticated;
revoke all on table public.household_purchase_holds from anon, authenticated;
revoke all on table public.plaid_account_owners     from anon, authenticated;
grant all privileges on table public.household_invites        to service_role;
grant all privileges on table public.household_join_attempts  to service_role;
grant all privileges on table public.plaid_item_cursors       to service_role;
grant all privileges on table public.household_purchase_holds to service_role;
grant all privileges on table public.plaid_account_owners     to service_role;

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
    -- The owner's blob becomes the shared one (0030's trigger takes the personal keys out of it); their
    -- personal keys go to their own private row.
    insert into public.household_data (household_id, data, schema_version)
    select hid, coalesce(u.data, '{}'::jsonb), coalesce(u.schema_version, 1)
      from (select 1) one left join public.user_data u on u.user_id = p_owner;
    insert into public.household_member_private (user_id, data)
    select p_owner, public.household_personal_of(u.data -> 'sideKeys')
      from (select 1) one left join public.user_data u on u.user_id = p_owner
    on conflict (user_id) do update set data = excluded.data;
    made := true;
  end if;
  perform 1 from public.households where id = hid for update;
  if not exists (select 1 from public.household_members where household_id = hid and user_id = p_owner and role = 'owner') then
    return jsonb_build_object('result', 'not_owner');               -- left, or stopped being the owner, meanwhile
  end if;
  select count(*) into n from public.household_members where household_id = hid;
  if n >= 2 then return jsonb_build_object('result', 'household_full'); end if;
  update public.household_invites set revoked_at = now(), revoke_reason = 'replaced'
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
  perform 1 from public.households where id = hid for update;
  if not exists (select 1 from public.household_members where household_id = hid and user_id = p_owner and role = 'owner') then
    return jsonb_build_object('result', 'not_owner');
  end if;
  update public.household_invites set revoked_at = now(), revoke_reason = 'owner'
   where household_id = hid and used_at is null and revoked_at is null;
  get diagnostics n = row_count;
  return jsonb_build_object('result', 'revoked', 'count', n);
end; $$;

-- 3. The partner joins -----------------------------------------------------------
-- By the link (p_token_hash) or by the code (p_code_hash, matched together with the address: a code only
-- ever finds an invite sent to the signed-in account's own address). p_net_key is the server's keyed hash
-- of the network the request came from (never the address itself).
--
-- BRUTE FORCE (audit H2). Before anything is looked up, the three counts of FAILED tries in the last hour:
-- 10 per account, 10 per invited address (whatever account tries it), 30 per network. Each count is taken
-- under its own advisory lock (always in that order), so tries at the same moment are counted one after the
-- other and none slips past the limit. Every failed try is recorded in the same transaction as its answer,
-- an unknown code or link included. A wrong code also counts against every open invite to that address, and
-- an invite dies after 5 wrong tries (revoke_reason 'too_many_tries'): the owner sends a new one. A valid LINK
-- opened by an account with another address is counted against that account and its network only, never against
-- the invite or its address (audit round 2, d): someone holding a leaked link cannot cancel it, or lock out the
-- person it was sent to. The 6-character code is the guessable secret, so only code guesses strike an invite.
-- The invite row is locked, so the same invite cannot be used twice even at the same moment.
-- Answers jsonb { result, household_id }: 'joined', 'already_member', 'invalid', 'expired', 'used',
-- 'wrong_account', 'in_another_household', 'household_full', 'too_many_attempts'.
create or replace function public.household_accept_invite(p_user uuid, p_email_key text, p_token_hash text, p_code_hash text,
                                                          p_net_key text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  inv public.household_invites%rowtype; mine uuid; n integer; target text; outcome text;
  user_limit constant integer := 10; target_limit constant integer := 10; net_limit constant integer := 30;
  invite_tries constant integer := 5;
begin
  target := encode(sha256(convert_to(coalesce(p_email_key, ''), 'UTF8')), 'hex');
  perform pg_advisory_xact_lock(hashtext('household_join:user:' || p_user::text));
  perform pg_advisory_xact_lock(hashtext('household_join:target:' || target));
  if p_net_key is not null then perform pg_advisory_xact_lock(hashtext('household_join:net:' || p_net_key)); end if;
  delete from public.household_join_attempts where at < now() - interval '1 day';
  if (select count(*) from public.household_join_attempts where user_id = p_user and at > now() - interval '1 hour') >= user_limit
     or (select count(*) from public.household_join_attempts where target_key = target and at > now() - interval '1 hour') >= target_limit
     or (p_net_key is not null and (select count(*) from public.household_join_attempts where net_key = p_net_key and at > now() - interval '1 hour') >= net_limit) then
    return jsonb_build_object('result', 'too_many_attempts');
  end if;

  if p_token_hash is not null then
    select * into inv from public.household_invites where token_hash = p_token_hash for update;
  elsif p_code_hash is not null then
    select * into inv from public.household_invites
     where code_hash = p_code_hash and email_key = p_email_key and used_at is null and revoked_at is null
     order by created_at desc limit 1 for update;
  end if;

  select household_id into mine from public.household_members where user_id = p_user;
  if inv.id is not null and mine = inv.household_id then return jsonb_build_object('result', 'already_member', 'household_id', mine); end if;
  outcome := case
    when inv.id is null or inv.revoked_at is not null then 'invalid'
    when inv.used_at is not null then 'used'
    when inv.expires_at <= now() then 'expired'
    when inv.email_key <> p_email_key then 'wrong_account'
    else null end;
  if outcome is not null then
    insert into public.household_join_attempts (user_id, target_key, net_key, invite_id, result)
    values (p_user, target, p_net_key, inv.id, outcome);
    if outcome = 'invalid' and p_code_hash is not null and p_token_hash is null then
      update public.household_invites
         set failed_attempts = failed_attempts + 1,
             revoked_at = case when failed_attempts + 1 >= invite_tries then now() else revoked_at end,
             revoke_reason = case when failed_attempts + 1 >= invite_tries then 'too_many_tries' else revoke_reason end
       where email_key = p_email_key and used_at is null and revoked_at is null and expires_at > now();
    end if;
    return jsonb_build_object('result', outcome);
  end if;

  if mine is not null then return jsonb_build_object('result', 'in_another_household'); end if;
  perform 1 from public.households where id = inv.household_id for update;
  select count(*) into n from public.household_members where household_id = inv.household_id;
  if n = 0 then return jsonb_build_object('result', 'invalid'); end if;
  if n >= 2 then return jsonb_build_object('result', 'household_full'); end if;
  insert into public.household_members (household_id, user_id, role, consented_at) values (inv.household_id, p_user, 'partner', now());
  update public.household_invites set used_at = now(), used_by = p_user where id = inv.id;
  -- The partner's own keys (their AI and Plaid consent) go to their own private row. Their old user_data row is
  -- deleted: what was on it is replaced by the household's, as their consent screen says, and it would never be
  -- read again (a member's app reads only the household's row; leaving starts them fresh).
  insert into public.household_member_private (user_id, data)
  select p_user, public.household_personal_of(u.data -> 'sideKeys')
    from (select 1) one left join public.user_data u on u.user_id = p_user
  on conflict (user_id) do update set data = excluded.data;
  delete from public.user_data where user_id = p_user;
  return jsonb_build_object('result', 'joined', 'household_id', inv.household_id);
end; $$;

-- 3b. One purchase at a time ------------------------------------------------------
-- ONE PURCHASE ATTEMPT holds the household (audit H5, round 2 a). An attempt is a Stripe checkout (its session
-- id) or one tap on a plan in the store app (a random id the app makes). While an attempt holds it, any OTHER
-- attempt is refused, whoever makes it and on whatever platform: the same person cannot start a Stripe checkout
-- and then a store purchase, or buy in the iOS and the Android app, any more than the two people can.
-- EVERY HOLD HAS A FIXED END (audit round 3 a), counted from when the attempt began (created_at): 32 minutes,
-- or 7 days once the store calls it pending. Nothing moves it later: asking again for the same attempt answers
-- with the end it already has, and "pending" sets the 7 days once. So no one can keep a household held by asking.
--   household_hold_purchase   take the hold, or answer for the same attempt (its end unchanged). p_replaces: a
--                             Stripe checkout of the same person that the server has just seen expire at Stripe
--                             (it can never complete), which a new checkout of theirs may replace. Nothing else
--                             is replaced. A pending attempt is refused even to itself: the store is still on it.
--   household_hold_pending    the store said the purchase is pending (Ask to Buy, a slow payment): a STORE hold
--                             lasts p_backstop from when it began
-- NOTHING ENDS A HOLD EARLY (audit round 4 a3). No report says which attempt it is about (RevenueCat carries no
-- attempt id, and the server's own sync has only its own clock), so an early release could end an unrelated,
-- newer hold. Every hold ends at its fixed time. A purchase that went through needs no release: every check
-- (billing.js) reads the paid row, and the other member's cover, before it looks at a hold. The app never ends
-- a hold either: a sheet it says was cancelled or failed lapses on its own (billing.js store_hold).
-- Answers jsonb: { result: 'held' | 'held_elsewhere' | 'no_household', ... }.
create or replace function public.household_hold_purchase(p_user uuid, p_provider text, p_attempt text,
                                                          p_ttl interval default interval '32 minutes', p_replaces text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare hid uuid; h public.household_purchase_holds%rowtype; exp timestamptz;
begin
  if coalesce(p_attempt, '') = '' then raise exception 'attempt_required' using errcode = 'check_violation'; end if;
  select household_id into hid from public.household_members where user_id = p_user;
  if hid is null then return jsonb_build_object('result', 'no_household'); end if;
  perform 1 from public.households where id = hid for update;
  if not exists (select 1 from public.household_members where household_id = hid and user_id = p_user) then
    return jsonb_build_object('result', 'no_household');
  end if;
  select * into h from public.household_purchase_holds where household_id = hid;
  exp := now() + p_ttl;
  if h.household_id is not null and h.expires_at > now() then
    if h.attempt_id = p_attempt and h.user_id = p_user and h.provider = p_provider and not h.pending then
      return jsonb_build_object('result', 'held', 'expires_at', h.expires_at, 'again', true);   -- its end stays where it was
    end if;
    if not (p_replaces is not null and h.attempt_id = p_replaces and h.user_id = p_user
            and h.provider = 'stripe' and p_provider = 'stripe' and not h.pending) then
      return jsonb_build_object('result', 'held_elsewhere', 'mine', h.user_id = p_user, 'provider', h.provider,
                                'attempt_id', case when h.user_id = p_user then h.attempt_id end, 'pending', h.pending);
    end if;
  end if;
  insert into public.household_purchase_holds (household_id, user_id, provider, attempt_id, pending, expires_at, created_at)
  values (hid, p_user, p_provider, p_attempt, false, exp, now())
  on conflict (household_id) do update set user_id = excluded.user_id, provider = excluded.provider, attempt_id = excluded.attempt_id,
                                           pending = false, expires_at = excluded.expires_at, created_at = excluded.created_at;
  return jsonb_build_object('result', 'held', 'expires_at', exp);
end; $$;

-- Pending: a store attempt only (a web checkout is never "pending" on the app's word), set once, its end then
-- p_backstop from when the attempt began. Asking again changes nothing.
create or replace function public.household_hold_pending(p_user uuid, p_attempt text, p_backstop interval default interval '7 days')
returns jsonb language plpgsql security definer set search_path = public as $$
declare h public.household_purchase_holds%rowtype;
begin
  select * into h from public.household_purchase_holds
   where user_id = p_user and attempt_id = p_attempt and provider in ('app_store', 'play_store') and expires_at > now()
   for update;
  if h.household_id is null then return jsonb_build_object('result', 'not_held'); end if;
  if not h.pending then
    update public.household_purchase_holds set pending = true, expires_at = created_at + p_backstop
     where household_id = h.household_id
    returning expires_at into h.expires_at;
  end if;
  return jsonb_build_object('result', 'pending', 'expires_at', h.expires_at);
end; $$;

-- 4. Leaving ---------------------------------------------------------------------
-- What a departing member's banks leave behind comes out of the shared blob with them (audit M7), so the
-- other member keeps no copy of it. Their bank links themselves stay theirs (plaid_items is untouched).
-- Their accounts: stamped with one of their Plaid items (_item), or, for an older account saved before it was
-- stamped, at a bank (institution) that only they linked. From those accounts, every one of:
--   accounts                         the accounts themselves
--   transactions                     on them (the blob holds manual ones only; the bank's are never stored)
--   liabilities                      Plaid's card, mortgage and student-loan details (an object of lists, or a list)
--   investments                      holdings in them
--   debts                            the debts made from them (account_id), and the "same as this account"
--                                    link on any other debt (sameAsAccountId)
--   debtLinkDismissed                "these are different" answers naming one of them or one of those debts
--   bills[].debtId                   a bill's link to one of those debts
--   incomeSuggestion                 the cached pay suggestion (worked out again from what remains)
--   bankConnected                    worked out again from what remains
-- Not here, because nothing in them names an account: bills and incomes (the household's plan, which either
-- member edits), goals, budgets, category rules by merchant. Category corrections and deposit answers keyed by a
-- bank transaction's id cannot be matched here (the bank's transactions are never stored): the other member's
-- app takes out the ones for transactions it holds (src/lib/household.js stripAccounts / localAfterRemoval).
create or replace function public.household_drop_by(p_list jsonb, p_field text, p_ids text[])
returns jsonb language sql immutable set search_path = public as $$
  select case when jsonb_typeof(p_list) <> 'array' then p_list
    else coalesce((select jsonb_agg(e) from jsonb_array_elements(p_list) e
                    where not (jsonb_typeof(e) = 'object' and coalesce(e ->> p_field, '') = any(p_ids))), '[]'::jsonb) end;
$$;

-- The accounts p_gone, and everything made from them, out of the household's blob (locked). The ids need not
-- still be in the blob's accounts: a transaction or debt left behind on an account already removed goes too.
create or replace function public.household_strip_accounts(p_household uuid, p_gone text[])
returns void language plpgsql security definer set search_path = public as $$
declare
  d jsonb; ad jsonb; gone text[] := coalesce(p_gone, '{}'); debt_keys text[];
  local_kinds constant text[] := array['', 'manual', 'statement'];
begin
  if cardinality(gone) = 0 then return; end if;
  select data into d from public.household_data where household_id = p_household for update;
  ad := d #> '{core,appData}';
  if d is null or jsonb_typeof(ad) is distinct from 'object' then return; end if;
  select coalesce(array_agg(coalesce(nullif(e ->> 'id', ''), e ->> 'account_id')), '{}') into debt_keys
    from jsonb_array_elements(case when jsonb_typeof(ad -> 'debts') = 'array' then ad -> 'debts' else '[]'::jsonb end) e
   where jsonb_typeof(e) = 'object' and coalesce(e ->> 'account_id', '') = any(gone);

  if ad ? 'accounts'     then ad := jsonb_set(ad, '{accounts}',     public.household_drop_by(ad -> 'accounts', 'id', gone)); end if;
  if ad ? 'transactions' then ad := jsonb_set(ad, '{transactions}', public.household_drop_by(ad -> 'transactions', 'account_id', gone)); end if;
  if ad ? 'investments'  then ad := jsonb_set(ad, '{investments}',  public.household_drop_by(ad -> 'investments', 'account_id', gone)); end if;
  if jsonb_typeof(ad -> 'liabilities') = 'array' then
    ad := jsonb_set(ad, '{liabilities}', public.household_drop_by(ad -> 'liabilities', 'account_id', gone));
  elsif jsonb_typeof(ad -> 'liabilities') = 'object' then
    ad := jsonb_set(ad, '{liabilities}', coalesce((select jsonb_object_agg(k, public.household_drop_by(v, 'account_id', gone))
                                                    from jsonb_each(ad -> 'liabilities') l(k, v)), '{}'::jsonb));
  end if;
  if jsonb_typeof(ad -> 'debts') = 'array' then
    ad := jsonb_set(ad, '{debts}', coalesce((select jsonb_agg(case when jsonb_typeof(e) = 'object' and coalesce(e ->> 'sameAsAccountId', '') = any(gone)
                                                                    then e - 'sameAsAccountId' else e end)
                                               from jsonb_array_elements(public.household_drop_by(ad -> 'debts', 'account_id', gone)) e), '[]'::jsonb));
  end if;
  if jsonb_typeof(ad -> 'debtLinkDismissed') = 'array' then
    ad := jsonb_set(ad, '{debtLinkDismissed}', coalesce((select jsonb_agg(e) from jsonb_array_elements(ad -> 'debtLinkDismissed') e
      where not (jsonb_typeof(e) = 'string' and (split_part(e #>> '{}', '|', 2) = any(gone) or split_part(e #>> '{}', '|', 1) = any(debt_keys)))), '[]'::jsonb));
  end if;
  if jsonb_typeof(ad -> 'bills') = 'array' then
    ad := jsonb_set(ad, '{bills}', coalesce((select jsonb_agg(case when jsonb_typeof(e) = 'object' and coalesce(e ->> 'debtId', '') = any(debt_keys || gone)
                                                                    then e - 'debtId' else e end)
                                               from jsonb_array_elements(ad -> 'bills') e), '[]'::jsonb));
  end if;
  ad := ad - 'incomeSuggestion';
  if ad ? 'bankConnected' then
    ad := jsonb_set(ad, '{bankConnected}', to_jsonb(exists (
      select 1 from jsonb_array_elements(case when jsonb_typeof(ad -> 'accounts') = 'array' then ad -> 'accounts' else '[]'::jsonb end) e
       where jsonb_typeof(e) = 'object' and (coalesce(e ->> '_item', '') <> '' or not lower(coalesce(e ->> 'institution', '')) = any(local_kinds)))));
  end if;
  update public.household_data set data = jsonb_set(d, '{core,appData}', ad) where household_id = p_household;
end; $$;

-- A departing member's accounts: every account the server saw them link (plaid_account_owners: it outlives
-- the Plaid row, so a bank they disconnected another way still counts), every blob account stamped with one
-- of their live items, and an older unstamped account at a bank only they linked. Then the strip above.
create or replace function public.household_strip_member_banks(p_household uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  ad jsonb; items text[]; mine_inst text[]; other_inst text[]; gone text[];
  local_kinds constant text[] := array['', 'manual', 'statement'];
begin
  select d.data #> '{core,appData}' into ad from public.household_data d where d.household_id = p_household;
  select coalesce(array_agg(item_id), '{}'), coalesce(array_agg(distinct lower(institution_name)) filter (where institution_name is not null), '{}')
    into items, mine_inst from public.plaid_items where user_id = p_user;
  select coalesce(array_agg(distinct lower(pi.institution_name)) filter (where pi.institution_name is not null), '{}') into other_inst
    from public.plaid_items pi join public.household_members m on m.user_id = pi.user_id
   where m.household_id = p_household and m.user_id <> p_user;
  select coalesce(array_agg(distinct x), '{}') into gone from (
    select o.account_id as x from public.plaid_account_owners o where o.user_id = p_user
    union
    select e ->> 'id'
      from jsonb_array_elements(case when jsonb_typeof(ad -> 'accounts') = 'array' then ad -> 'accounts' else '[]'::jsonb end) e
     where jsonb_typeof(e) = 'object' and coalesce(e ->> 'id', '') <> '' and (
           coalesce(e ->> '_item', '') = any(items)
        or (coalesce(e ->> '_item', '') = '' and not lower(coalesce(e ->> 'institution', '')) = any(local_kinds)
            and lower(e ->> 'institution') = any(mine_inst) and not lower(e ->> 'institution') = any(other_inst)))
  ) ids;
  perform public.household_strip_accounts(p_household, gone);
end; $$;

-- A member disconnects one of THEIR banks (plaid.js delete_item, and the duplicate clean-ups), audit round 2 c:
-- under the household's lock, everything that came from it leaves the shared blob (its accounts by the
-- ownership record and by their stamp, and all made from them), THEN its plaid_items row is deleted, in one
-- transaction, so there is never a moment when the row is gone and the data is not. The ownership record is
-- kept. Someone in no household: the row is deleted, as before. Answers { result: 'removed' | 'not_found' }.
create or replace function public.household_disconnect_item(p_user uuid, p_item text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare hid uuid; ad jsonb; gone text[]; n integer;
begin
  -- Only one's own bank: no row of theirs for this item, nothing is touched.
  if not exists (select 1 from public.plaid_items where user_id = p_user and item_id = p_item) then
    return jsonb_build_object('result', 'not_found', 'accounts', 0);
  end if;
  select household_id into hid from public.household_members where user_id = p_user;
  if hid is not null then
    perform 1 from public.households where id = hid for update;
    select d.data #> '{core,appData}' into ad from public.household_data d where d.household_id = hid;
    select coalesce(array_agg(distinct x), '{}') into gone from (
      select o.account_id as x from public.plaid_account_owners o where o.user_id = p_user and o.item_id = p_item
      union
      select e ->> 'id'
        from jsonb_array_elements(case when jsonb_typeof(ad -> 'accounts') = 'array' then ad -> 'accounts' else '[]'::jsonb end) e
       where jsonb_typeof(e) = 'object' and coalesce(e ->> 'id', '') <> '' and e ->> '_item' = p_item
    ) ids;
    perform public.household_strip_accounts(hid, gone);
  end if;
  delete from public.plaid_items where user_id = p_user and item_id = p_item;
  get diagnostics n = row_count;
  return jsonb_build_object('result', case when n > 0 then 'removed' else 'not_found' end, 'accounts', coalesce(cardinality(gone), 0));
end; $$;

-- One person goes, with the household's lock already held (only the two functions below call this).
-- Someone left behind: this person's banks and what was made from them come out of the blob, and their own
-- user_data and private rows are deleted, so they start fresh. Nobody left behind (an owner whose invite was
-- never used, or the last one out): the household's data, with their own keys, goes back to their user_data
-- row and the household is removed.
create or replace function public.household_leave_locked(p_household uuid, p_user uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare their_role text; others integer;
begin
  select role into their_role from public.household_members where household_id = p_household and user_id = p_user;
  select count(*) into others from public.household_members where household_id = p_household and user_id <> p_user;
  if others > 0 then
    perform public.household_strip_member_banks(p_household, p_user);
    delete from public.user_data where user_id = p_user;
    -- The money meeting's records since they joined are the household's: the one who stays keeps them (where
    -- they have none of their own for that day). The rest of the leaver's go: they start fresh.
    update public.meeting_records mr set user_id = o.user_id
      from public.household_members o, public.household_members me
     where o.household_id = p_household and o.user_id <> p_user
       and me.household_id = p_household and me.user_id = p_user
       and mr.user_id = p_user and mr.met_on >= me.joined_at::date
       and not exists (select 1 from public.meeting_records x where x.user_id = o.user_id and x.met_on = mr.met_on);
    delete from public.meeting_records where user_id = p_user;
  else
    insert into public.user_data (user_id, data, schema_version)
    select p_user,
           case when jsonb_typeof(d.data) = 'object'
                then jsonb_set(d.data, '{sideKeys}', coalesce(case when jsonb_typeof(d.data -> 'sideKeys') = 'object' then d.data -> 'sideKeys' end, '{}'::jsonb)
                                                     || coalesce((select p.data from public.household_member_private p where p.user_id = p_user), '{}'::jsonb))
                else d.data end,
           d.schema_version
      from public.household_data d where d.household_id = p_household
    on conflict (user_id) do update set data = excluded.data, schema_version = excluded.schema_version;
  end if;
  delete from public.household_member_private where user_id = p_user;
  delete from public.household_purchase_holds where household_id = p_household and user_id = p_user;
  delete from public.household_members where household_id = p_household and user_id = p_user;   -- the trigger promotes or removes
  return jsonb_build_object('result', 'left', 'household_id', p_household, 'role', their_role, 'remaining', others);
end; $$;

-- Answers jsonb { result: 'left' | 'not_member', household_id, role, remaining }.
create or replace function public.household_leave(p_user uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare hid uuid;
begin
  select household_id into hid from public.household_members where user_id = p_user;
  if hid is null then return jsonb_build_object('result', 'not_member'); end if;
  perform 1 from public.households where id = hid for update;
  -- Under the lock, again: removed by the owner, or the household gone, since the read above.
  if not exists (select 1 from public.household_members where household_id = hid and user_id = p_user) then
    return jsonb_build_object('result', 'not_member');
  end if;
  return public.household_leave_locked(hid, p_user);
end; $$;

-- The owner removes the partner: exactly what happens when the partner leaves. The household's lock is taken
-- BEFORE anything is decided (audit B1): then, under it, the caller must still be the owner (not left, not
-- deleted, not demoted) and the partner is whoever is the partner now, and the removal happens in this same
-- transaction. A leave or an ownership change at the same moment waits, or has already happened and is seen.
create or replace function public.household_remove_partner(p_owner uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare hid uuid; partner uuid;
begin
  select household_id into hid from public.household_members where user_id = p_owner;
  if hid is null then return jsonb_build_object('result', 'not_owner'); end if;
  perform 1 from public.households where id = hid for update;
  if not exists (select 1 from public.household_members where household_id = hid and user_id = p_owner and role = 'owner') then
    return jsonb_build_object('result', 'not_owner');
  end if;
  select user_id into partner from public.household_members where household_id = hid and role = 'partner';
  if partner is null then return jsonb_build_object('result', 'no_partner'); end if;
  return public.household_leave_locked(hid, partner) || jsonb_build_object('result', 'removed', 'partner', partner);
end; $$;

-- A SIGN-IN DELETED DIRECTLY (the Supabase dashboard, or auth's own API), audit round 3: BEFORE its row goes, and
-- with it (by cascade) its membership and its Plaid rows, the member's banks leave the shared blob while every
-- record of them is still there. THEN this person's record of who linked what is deleted: it has no foreign key
-- (it must outlive a Plaid row), so nothing else would. In no household, only the record goes. It takes the
-- household's lock first, as every membership change does. plaid.js delete_account deletes the record itself too.
create or replace function public.household_on_user_deleting()
returns trigger language plpgsql security definer set search_path = public as $$
declare hid uuid;
begin
  select household_id into hid from public.household_members where user_id = old.id;
  if hid is not null then
    perform 1 from public.households where id = hid for update;
    if exists (select 1 from public.household_members where household_id = hid and user_id = old.id)
       and exists (select 1 from public.household_members where household_id = hid and user_id <> old.id) then
      perform public.household_strip_member_banks(hid, old.id);
    end if;
  end if;
  delete from public.plaid_account_owners where user_id = old.id;
  return old;
end; $$;
-- Created the first time only, as 0025's trigger on auth.users is.
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'household_user_deleting' and tgrelid = 'auth.users'::regclass) then
    create trigger household_user_deleting before delete on auth.users
      for each row execute function public.household_on_user_deleting();
  end if;
end $$;

revoke all on function public.household_create_invite(uuid, text, text, text, interval) from public, anon, authenticated;
revoke all on function public.household_revoke_invite(uuid)                         from public, anon, authenticated;
revoke all on function public.household_accept_invite(uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.household_hold_purchase(uuid, text, text, interval, text) from public, anon, authenticated;
revoke all on function public.household_hold_pending(uuid, text, interval)          from public, anon, authenticated;
revoke all on function public.household_disconnect_item(uuid, text)                from public, anon, authenticated;
revoke all on function public.household_strip_accounts(uuid, text[])               from public, anon, authenticated;
revoke all on function public.household_strip_member_banks(uuid, uuid)              from public, anon, authenticated;
revoke all on function public.household_drop_by(jsonb, text, text[])                from public, anon, authenticated;
revoke all on function public.household_leave_locked(uuid, uuid)                    from public, anon, authenticated, service_role;
revoke all on function public.household_leave(uuid)                                 from public, anon, authenticated;
revoke all on function public.household_remove_partner(uuid)                        from public, anon, authenticated;
revoke all on function public.household_on_user_deleting()                          from public, anon, authenticated, service_role;
grant execute on function public.household_create_invite(uuid, text, text, text, interval) to service_role;
grant execute on function public.household_revoke_invite(uuid)                         to service_role;
grant execute on function public.household_accept_invite(uuid, text, text, text, text) to service_role;
grant execute on function public.household_hold_purchase(uuid, text, text, interval, text) to service_role;
grant execute on function public.household_hold_pending(uuid, text, interval)          to service_role;
grant execute on function public.household_disconnect_item(uuid, text)                to service_role;
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
--          has_function_privilege('authenticated', 'public.household_accept_invite(uuid, text, text, text, text)', 'execute'),
--          has_function_privilege('service_role', 'public.household_accept_invite(uuid, text, text, text, text)', 'execute'),
--          has_table_privilege('authenticated', 'public.household_purchase_holds', 'select'),
--          has_function_privilege('service_role', 'public.household_leave_locked(uuid, uuid)', 'execute');
-- Expected after: false, false, false, true, false, false.
-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- The trigger on auth.users stays (dropping it needs the auth admin, who owns that table, as 0025 notes) and
-- does nothing:
--   create or replace function public.household_on_user_deleting()
--   returns trigger language plpgsql security definer set search_path = public as $$ begin return old; end; $$;
-- drop function if exists public.household_remove_partner(uuid);
-- drop function if exists public.household_leave(uuid);
-- drop function if exists public.household_leave_locked(uuid, uuid);
-- drop function if exists public.household_strip_member_banks(uuid, uuid);
-- drop function if exists public.household_drop_by(jsonb, text, text[]);
-- drop function if exists public.household_disconnect_item(uuid, text);
-- drop function if exists public.household_strip_accounts(uuid, text[]);
-- drop function if exists public.household_hold_pending(uuid, text, interval);
-- drop function if exists public.household_hold_purchase(uuid, text, text, interval, text);
-- drop function if exists public.household_accept_invite(uuid, text, text, text, text);
-- drop function if exists public.household_revoke_invite(uuid);
-- drop function if exists public.household_create_invite(uuid, text, text, text, interval);
-- drop table if exists public.plaid_account_owners;
-- drop table if exists public.household_purchase_holds;
-- drop table if exists public.plaid_item_cursors;
-- drop table if exists public.household_join_attempts;
-- drop table if exists public.household_invites;
