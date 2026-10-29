-- 0029_founding_seats.sql
-- -----------------------------------------------------------------------------
-- THE FOUNDING 50 ARE THE FIRST 50 HOUSEHOLDS WHO SUBSCRIBE (Amanda, 2026-10-29).
--
-- The founding price ($79.99 a year plus tax) goes to the first 50 households who subscribe to it, on the
-- website, the App Store or Google Play. A waitlist number no longer grants it. The rule:
--   • A SEAT IS TAKEN when a founding subscription's first payment succeeds: Stripe's checkout completing
--     (stripe-webhook.js), or the store purchase reaching the server from RevenueCat
--     (_lib/storeSubscriptions.js). One seat per account, taken once.
--   • A REFUND GIVES THE SEAT BACK (released_at, release_reason 'refund'). The row is kept.
--   • A founding subscriber keeps the price while subscribed. A subscription that ends without a refund keeps
--     its seat: that household did subscribe. (Its account is still offered the regular prices only:
--     subscriptions.founding_ended_at, unchanged.)
--   • At 50 seats held the founding offer is gone everywhere (_lib/foundingCohort.js asks
--     founding_seats_taken()). A store purchase that slips through the last seat at the same moment is
--     honoured: the seat is recorded with over_cap = true and logged, so a count past 50 is explained.
--   • Never a seat: an account at a test domain (waitlist_is_test_email, 0025) or a beta founder
--     (profiles.founder_flag), who keeps the founding price outside the 50.
--   • No foreign key to auth.users: deleting an account does not free its seat.
--
-- THE WAITLIST LEDGER IS KEPT AS IT IS. Nothing here reads, changes or deletes waitlist_founding_ledger or the
-- waitlist; it is no longer used to decide who may buy the founding price.
--
-- UNTIL THIS IS APPLIED: founding_seats_taken() does not exist, so the server cannot count seats and offers the
-- founding price to nobody but beta founders (fail closed), and /api/founding answers 503 (the landing shows no
-- number). Apply it before the code that reads it is deployed.
--
-- RUNS AFTER 0009, 0016, 0025 (waitlist_is_test_email). One transaction; safe to run twice.
-- RUN THE READ-ONLY DRY RUN AT THE END OF THIS FILE FIRST: it shows the seats the backfill would record.
-- -----------------------------------------------------------------------------

begin;

create table if not exists public.founding_seats (
  user_id        uuid        primary key,          -- no foreign key: a deleted account keeps its seat
  provider       text        not null check (provider in ('stripe', 'app_store', 'play_store')),
  provider_ref   text,                              -- the Stripe subscription id, or null for a store purchase
  taken_at       timestamptz not null default now(),
  over_cap       boolean     not null default false, -- taken when 50 were already held (a store race): honoured
  source         text        not null default 'payment' check (source in ('payment', 'backfill')),
  released_at    timestamptz,
  release_reason text,
  constraint founding_seats_release_check
    check ((released_at is null and release_reason is null) or (released_at is not null and release_reason in ('refund')))
);
alter table public.founding_seats enable row level security;
-- grants: service_role only
grant all privileges on table public.founding_seats to service_role;
revoke all on table public.founding_seats from anon, authenticated;

-- Who never takes a seat: a test address, a beta founder, or an account that no longer exists.
create or replace function public.founding_seat_excluded(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (select 1 from auth.users u where u.id = p_user_id)
      or exists (select 1 from auth.users u where u.id = p_user_id and public.waitlist_is_test_email(u.email))
      or exists (select 1 from public.profiles p where p.user_id = p_user_id and p.founder_flag);
$$;

-- How many seats are held now: taken and not given back by a refund.
create or replace function public.founding_seats_taken()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer from public.founding_seats where released_at is null;
$$;

-- A founding subscription's first payment succeeded: take this account's seat. Never refuses a payment that
-- happened: past 50 the seat is recorded with over_cap. The same transaction-scoped advisory lock for every
-- caller, so two payments at the same moment are counted one after the other.
--   taken     true when this call recorded the seat; false when the account already had one or is excluded
--   seats     seats held after this call
--   over_cap  this call's seat was taken when 50 were already held
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
  if p_user_id is null or public.founding_seat_excluded(p_user_id)
     or exists (select 1 from public.founding_seats s where s.user_id = p_user_id) then
    return query select false, public.founding_seats_taken(), false;
    return;
  end if;
  held := public.founding_seats_taken();
  insert into public.founding_seats (user_id, provider, provider_ref, over_cap)
  values (p_user_id, p_provider, p_ref, held >= 50);
  return query select true, held + 1, held >= 50;
end; $$;

-- A refund: this account's seat goes back. Returns true when a held seat was released. p_provider, when given,
-- releases only a seat taken through that provider (a Stripe refund never frees a store purchase's seat).
create or replace function public.founding_seat_release(p_user_id uuid, p_reason text, p_provider text default null)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  perform pg_advisory_xact_lock(hashtext('founding_seats'));
  update public.founding_seats set released_at = now(), release_reason = p_reason
   where user_id = p_user_id and released_at is null and (p_provider is null or provider = p_provider);
  get diagnostics n = row_count;
  return n > 0;
end; $$;

revoke all on function public.founding_seat_excluded(uuid) from public, anon, authenticated;
revoke all on function public.founding_seats_taken() from public, anon, authenticated;
revoke all on function public.founding_seat_take(uuid, text, text) from public, anon, authenticated;
revoke all on function public.founding_seat_release(uuid, text, text) from public, anon, authenticated;
grant execute on function public.founding_seat_excluded(uuid) to service_role;
grant execute on function public.founding_seats_taken() to service_role;
grant execute on function public.founding_seat_take(uuid, text, text) to service_role;
grant execute on function public.founding_seat_release(uuid, text, text) to service_role;

-- THE BACKFILL: every household that has already paid for the founding price holds a seat, in the order it
-- subscribed. A founding row that is live now, or that was once live (founding_locked_at, stamped at Stripe
-- checkout; founding_ended_at, stamped when it ended). A refund before this file cannot be told apart from a
-- cancellation here, so an ended one is counted; release it by hand if support knows it was refunded:
--   select public.founding_seat_release('<user id>', 'refund');
insert into public.founding_seats (user_id, provider, provider_ref, taken_at, over_cap, source)
select s.user_id, coalesce(s.provider, 'stripe'),
       case when coalesce(s.provider, 'stripe') = 'stripe' then s.provider_subscription_id end,
       coalesce(s.founding_locked_at, s.updated_at, now()),
       false, 'backfill'
  from public.subscriptions s
 where s.plan_key = 'founding_annual'
   and (s.status in ('active', 'trialing') or s.founding_locked_at is not null or s.founding_ended_at is not null)
   and not public.founding_seat_excluded(s.user_id)
on conflict (user_id) do nothing;

commit;

-- -----------------------------------------------------------------------------
-- READ-ONLY DRY RUN (run first; it changes nothing). The seats the backfill would record, and the count.
-- -----------------------------------------------------------------------------
-- select s.user_id, coalesce(s.provider, 'stripe') as provider, s.status, s.founding_locked_at, s.founding_ended_at
--   from public.subscriptions s
--   left join auth.users u on u.id = s.user_id
--   left join public.profiles p on p.user_id = s.user_id
--  where s.plan_key = 'founding_annual'
--    and (s.status in ('active', 'trialing') or s.founding_locked_at is not null or s.founding_ended_at is not null)
--    and u.id is not null and not public.waitlist_is_test_email(u.email) and not coalesce(p.founder_flag, false)
--  order by coalesce(s.founding_locked_at, s.updated_at);
--
-- CHECK AFTER:
-- select public.founding_seats_taken() as seats_held, 50 - public.founding_seats_taken() as spots_left;
--
-- -----------------------------------------------------------------------------
-- Rolling back: nothing else in the database depends on these. The code then offers the founding price to beta
-- founders only, and /api/founding answers 503, until this file is applied again.
-- ROLLBACK
-- drop function if exists public.founding_seat_release(uuid, text, text);
-- drop function if exists public.founding_seat_take(uuid, text, text);
-- drop function if exists public.founding_seats_taken();
-- drop function if exists public.founding_seat_excluded(uuid);
-- drop table if exists public.founding_seats;
-- -----------------------------------------------------------------------------
