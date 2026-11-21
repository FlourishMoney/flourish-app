-- 0052_plus_purchase_attempts.sql
-- -----------------------------------------------------------------------------
-- ONE FLOURISH PLUS PURCHASE AT A TIME, PER PERSON AND PER HOUSEHOLD (2026-11-20). NOT APPLIED.
--
-- flourish Plus is bought once per household. The server refuses to sell it to a household that already has it
-- (billing.js plus_checkout, plus_store_hold), but two partners could each open a purchase at the same moment, each
-- seeing "no Plus yet", and the household would pay twice. The main plan closed the same gap in 0031 (purchase_attempts,
-- purchase_attempt_begin). This is the same design for the add-on, in a table of its own:
--
--   every Plus purchase is one ATTEMPT: a Stripe checkout the server is about to open, or one tap in a store app (a
--   random id the app makes). A person has at most one live attempt, and while one member of a household has one, the
--   other member's is refused. Its end is fixed from when it began: 32 minutes, or 7 days once the store calls the
--   purchase pending. Asking again for the same attempt never moves the end, and nothing ends one early. A purchase
--   that went through is a live row in plus_addon_subscriptions, which every check reads before it looks here.
--
-- A TABLE OF ITS OWN, NOT purchase_attempts: a household that has just bought the main plan is still held there for up
-- to 32 minutes, and must be able to add Plus straight away. A Plus attempt never holds up a main-plan purchase, and a
-- main-plan attempt never holds up Plus.
--
-- No amount, no price, no email, no name. Deleted with the account (on delete cascade).
--
-- UNTIL THIS IS APPLIED the server cannot record an attempt, so it sells no Plus at all (503, and the app says so
-- calmly): run it before PLUS_ENABLED goes on. Run in the Supabase SQL editor, after 0044. Additive, and safe to run
-- twice. It changes no existing table or function.
-- -----------------------------------------------------------------------------

create table if not exists public.plus_purchase_attempts (
  user_id      uuid        primary key references auth.users(id) on delete cascade,
  provider     text        not null check (provider in ('stripe', 'app_store', 'play_store')),
  attempt_id   text        not null,                 -- the server's id for a Stripe checkout, or the app's random id
  pending      boolean     not null default false,   -- the store said "pending": 7 days from created_at
  expires_at   timestamptz not null,                  -- fixed from created_at: 32 minutes, or 7 days once pending
  created_at   timestamptz not null default now()
);

alter table public.plus_purchase_attempts enable row level security;
-- No policy on purpose: a browser never reaches these rows.
-- grants: service_role only
revoke all on table public.plus_purchase_attempts from anon, authenticated;
grant all privileges on table public.plus_purchase_attempts to service_role;

-- THE ONE CALL BEFORE ANY PLUS PURCHASE. Answers jsonb:
--   { result: 'held', expires_at }                                   this attempt may go ahead
--   { result: 'held_elsewhere', mine, provider, pending }            another attempt is live: this person's own
--                                                                     (mine true) or the other member's (mine false)
-- ONE LOCK PER PERSON, then the household's row: two members asking at the same moment are answered one after the
-- other, and the second sees the first's attempt. The same order as purchase_attempt_begin (0031), with a lock name of
-- its own, so the two never wait on each other.
--   the same attempt again        'held', and its end stays where it was (a pending one is refused even to itself)
--   p_provider 'stripe' again     replaces this person's own earlier website checkout: billing.js has just expired
--                                 that checkout at Stripe, so it can no longer charge
create or replace function public.plus_purchase_attempt_begin(p_user uuid, p_provider text, p_attempt text,
                                                              p_ttl interval default interval '32 minutes')
returns jsonb language plpgsql security definer set search_path = public as $$
declare a public.plus_purchase_attempts%rowtype; other public.plus_purchase_attempts%rowtype; hid uuid; exp timestamptz;
begin
  if p_user is null then raise exception 'user_required' using errcode = 'check_violation'; end if;
  if coalesce(p_attempt, '') = '' then raise exception 'attempt_required' using errcode = 'check_violation'; end if;
  if p_provider is null or p_provider not in ('stripe', 'app_store', 'play_store') then
    raise exception 'provider_required' using errcode = 'check_violation';
  end if;
  perform pg_advisory_xact_lock(hashtext('plus-purchase:' || p_user::text));
  select household_id into hid from public.household_members where user_id = p_user;
  if hid is not null then perform 1 from public.households where id = hid for update; end if;
  select * into a from public.plus_purchase_attempts where user_id = p_user for update;
  if a.user_id is not null and a.expires_at > now() then
    if a.attempt_id = p_attempt and a.provider = p_provider and not a.pending then
      return jsonb_build_object('result', 'held', 'expires_at', a.expires_at, 'again', true);
    elsif not (a.provider = 'stripe' and p_provider = 'stripe' and not a.pending) then
      return jsonb_build_object('result', 'held_elsewhere', 'mine', true, 'provider', a.provider, 'pending', a.pending);
    end if;
  end if;
  if hid is not null then
    select pa.* into other from public.plus_purchase_attempts pa join public.household_members m on m.user_id = pa.user_id
     where m.household_id = hid and pa.user_id <> p_user and pa.expires_at > now() limit 1;
    if other.user_id is not null then
      return jsonb_build_object('result', 'held_elsewhere', 'mine', false, 'provider', other.provider, 'pending', other.pending);
    end if;
  end if;
  exp := now() + p_ttl;
  insert into public.plus_purchase_attempts (user_id, provider, attempt_id, pending, expires_at, created_at)
  values (p_user, p_provider, p_attempt, false, exp, now())
  on conflict (user_id) do update set provider = excluded.provider, attempt_id = excluded.attempt_id, pending = false,
                                      expires_at = excluded.expires_at, created_at = excluded.created_at;
  return jsonb_build_object('result', 'held', 'expires_at', exp);
end; $$;

-- THE STORE SAID "PENDING" (Ask to Buy, a slow payment): this person's live store attempt keeps 7 days from when it
-- began, set once. { result: 'pending', expires_at } or { result: 'not_held' }. A website checkout is never pending.
create or replace function public.plus_purchase_attempt_pending(p_user uuid, p_attempt text, p_backstop interval default interval '7 days')
returns jsonb language plpgsql security definer set search_path = public as $$
declare a public.plus_purchase_attempts%rowtype;
begin
  perform pg_advisory_xact_lock(hashtext('plus-purchase:' || p_user::text));
  select * into a from public.plus_purchase_attempts
   where user_id = p_user and attempt_id = p_attempt and provider in ('app_store', 'play_store') and expires_at > now()
   for update;
  if a.user_id is null then return jsonb_build_object('result', 'not_held'); end if;
  if not a.pending then
    update public.plus_purchase_attempts set pending = true, expires_at = created_at + p_backstop
     where user_id = p_user
    returning expires_at into a.expires_at;
  end if;
  return jsonb_build_object('result', 'pending', 'expires_at', a.expires_at);
end; $$;

revoke all on function public.plus_purchase_attempt_begin(uuid, text, text, interval) from public, anon, authenticated;
revoke all on function public.plus_purchase_attempt_pending(uuid, text, interval)     from public, anon, authenticated;
grant execute on function public.plus_purchase_attempt_begin(uuid, text, text, interval) to service_role;
grant execute on function public.plus_purchase_attempt_pending(uuid, text, interval)     to service_role;

-- ============================================================================
-- READ-ONLY CHECK (after running): RLS on, the Data API roles can neither read it nor call the functions, and it is empty.
--   select (select relrowsecurity from pg_class where oid = 'public.plus_purchase_attempts'::regclass),
--          has_table_privilege('authenticated', 'public.plus_purchase_attempts', 'select'),
--          has_table_privilege('anon', 'public.plus_purchase_attempts', 'select'),
--          has_function_privilege('authenticated', 'public.plus_purchase_attempt_begin(uuid, text, text, interval)', 'execute'),
--          has_function_privilege('authenticated', 'public.plus_purchase_attempt_pending(uuid, text, interval)', 'execute'),
--          (select count(*) from public.plus_purchase_attempts);
-- Expected: true, false, false, false, false, 0.
-- ============================================================================
-- ROLLBACK (nothing else depends on it; with it gone the server sells no Plus):
-- drop function if exists public.plus_purchase_attempt_pending(uuid, text, interval);
-- drop function if exists public.plus_purchase_attempt_begin(uuid, text, text, interval);
-- drop table if exists public.plus_purchase_attempts;
-- ============================================================================
