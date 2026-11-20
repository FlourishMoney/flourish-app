-- 0050_gift_codes.sql
-- -----------------------------------------------------------------------------
-- GIFTS (Christmas 2026). NOT APPLIED. Amanda runs it by hand in the Supabase SQL editor, staging first.
--
-- Someone buys "a year of flourish" or "a year of flourish with Plus" on flourishmoney.app/gift (Stripe Checkout,
-- payment mode: one charge, nothing renews). The paid checkout's webhook (netlify/functions/stripe-webhook.js, the gift
-- branch) makes ONE row here, with ONE single-use code, and emails the buyer the code and the printable card. If the
-- buyer chose "email it to them", netlify/functions/gift-send-sweep.js emails the recipient at 07:00 Eastern on the day
-- they chose. The recipient redeems the code on flourishmoney.app/gift/redeem (website only: Apple 3.1.1), signed in.
-- Rules: netlify/functions/_lib/gifts.js. Tests: tests/gifts.test.cjs, tests/gifts.sql.test.cjs.
--
--   code              12 characters with no look-alikes (no 0 O 1 I L), shown as XXXX-XXXX-XXXX. About 59 bits, made
--                     by the server from crypto.randomBytes. A bearer token for a year of flourish: only the server reads
--                     this table.
--   stripe_session_id UNIQUE: a repeated webhook finds the row its first delivery made, so there is never a second code.
--   starts_at/ends_at Set when the code is redeemed: the 12 months run from the LATEST of the moment it is redeemed,
--                     00:00 Eastern on the buyer's start day, the end of this account's paid period (passed in by the
--                     server), and the end of any other gift this account already holds.
--   status            unused | redeemed | void, worked out from the dates (never written).
--   voided_at         A refund of an UNUSED gift voids it. A redeemed gift is never voided by a refund; the server logs it.
--
-- Codes never expire: there is no expiry column (Ontario does not allow an expiry date on a gift card).
--
-- Kept only while needed HERE: the recipient's name and the buyer's message are cleared once the recipient's email is
-- sent (or, for a printed card, once the buyer's email is sent), and on a refund. The two addresses stay: the buyer's for
-- a refund or a "where is my code" question, the recipient's for the scheduled email. Stripe keeps its own copy of the
-- form in the checkout session's metadata, which is how it reaches the webhook (docs/product/KNOWN-DEFECTS.md 64).
--
-- Until this runs: the gift functions find no table and answer "not available"; nothing else changes. Gift SALES are
-- also behind GIFTS_ENABLED (exactly "true"); redeeming and the recipient's email are not, so codes never strand.
--
-- Safe to run twice.
-- grants: service_role only
-- -----------------------------------------------------------------------------

create table if not exists public.gift_codes (
  code                      text        primary key check (code ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{12}$'),
  plan                      text        not null check (plan in ('flourish', 'flourish_plus')),
  months                    integer     not null default 12 check (months = 12),
  stripe_session_id         text        not null unique,
  stripe_payment_intent     text        unique,
  livemode                  boolean     not null default false,
  buyer_email               text        not null check (length(buyer_email) between 3 and 254),
  delivery                  text        not null check (delivery in ('email', 'print')),
  recipient_name            text        check (recipient_name is null or length(recipient_name) <= 60),
  recipient_email           text        check (recipient_email is null or length(recipient_email) <= 254),
  gift_message              text        check (gift_message is null or length(gift_message) <= 200),
  send_on                   date,
  start_on                  date,
  amount_subtotal_cents     integer     check (amount_subtotal_cents is null or amount_subtotal_cents >= 0),
  amount_tax_cents          integer     check (amount_tax_cents is null or amount_tax_cents >= 0),
  amount_total_cents        integer     check (amount_total_cents is null or amount_total_cents >= 0),
  currency                  text,
  created_at                timestamptz not null default now(),
  buyer_emailed_at          timestamptz,
  recipient_sent_at         timestamptz,
  recipient_send_claimed_at timestamptz,
  recipient_send_attempts   integer     not null default 0,
  recipient_last_error      text,
  redeemed_by               uuid        references auth.users (id) on delete set null,
  redeemed_at               timestamptz,
  starts_at                 timestamptz,
  ends_at                   timestamptz,
  voided_at                 timestamptz,
  void_reason               text,
  status                    text generated always as (
                              case when voided_at is not null then 'void'
                                   when redeemed_at is not null then 'redeemed'
                                   else 'unused' end) stored,
  -- An emailed gift names who it goes to and when; a printed one needs neither.
  constraint gift_codes_email_delivery check (delivery <> 'email' or (recipient_email is not null and send_on is not null)),
  constraint gift_codes_redeemed_dates check ((redeemed_at is null) = (starts_at is null) and (starts_at is null) = (ends_at is null))
);

-- The entitlement read (every plan check for an account that holds no other plan) and the stacking rule.
create index if not exists gift_codes_redeemed_by_idx on public.gift_codes (redeemed_by, ends_at desc)
  where redeemed_by is not null and voided_at is null;
-- The recipient emails still waiting for their day.
create index if not exists gift_codes_send_due_idx on public.gift_codes (send_on)
  where delivery = 'email' and recipient_sent_at is null and voided_at is null;
-- "Where is my code?" from a buyer, by hand.
create index if not exists gift_codes_buyer_idx on public.gift_codes (lower(buyer_email), created_at desc);

alter table public.gift_codes enable row level security;
-- No policy, and nothing granted to the browser roles: no client may read or write a row.
revoke all on table public.gift_codes from anon, authenticated;
-- No DELETE, even for the server: a used code stays used, and a refunded one is voided, never removed. Anything a default
-- privilege granted is taken back first.
revoke all on table public.gift_codes from service_role;
grant select, insert, update on table public.gift_codes to service_role;

-- ── the paid checkout: one row per Stripe session ────────────────────────────────────────────────────
-- Answers { created, collision, code, plan, delivery, ... }. A session that already has a row answers that row with
-- created false (a repeated webhook). A code that is already taken answers collision true and the server tries a new one.
create or replace function public.gift_create(
  p_code text, p_plan text, p_session text, p_payment_intent text, p_livemode boolean,
  p_buyer_email text, p_delivery text, p_recipient_name text, p_recipient_email text, p_message text,
  p_send_on date, p_start_on date, p_subtotal integer, p_tax integer, p_total integer, p_currency text)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_rows integer := 0;
  v_inserted boolean := false;
  g public.gift_codes%rowtype;
begin
  -- Two deliveries of one event at once: the second waits here, then finds the first one's row.
  perform pg_advisory_xact_lock(hashtextextended('gift_create:' || p_session, 0));
  select * into g from public.gift_codes where stripe_session_id = p_session;
  if not found then
    insert into public.gift_codes (code, plan, stripe_session_id, stripe_payment_intent, livemode, buyer_email, delivery,
                                   recipient_name, recipient_email, gift_message, send_on, start_on,
                                   amount_subtotal_cents, amount_tax_cents, amount_total_cents, currency)
    values (p_code, p_plan, p_session, p_payment_intent, coalesce(p_livemode, false), p_buyer_email, p_delivery,
            p_recipient_name, p_recipient_email, p_message, p_send_on, p_start_on, p_subtotal, p_tax, p_total, p_currency)
    on conflict (code) do nothing;
    get diagnostics v_rows = row_count;
    v_inserted := v_rows > 0;
    if not v_inserted then
      return jsonb_build_object('created', false, 'collision', true);
    end if;
    select * into g from public.gift_codes where stripe_session_id = p_session;
  end if;
  return jsonb_build_object(
    'created', v_inserted, 'collision', false, 'code', g.code, 'plan', g.plan, 'delivery', g.delivery,
    'buyer_email', g.buyer_email, 'recipient_name', g.recipient_name, 'recipient_email', g.recipient_email,
    'gift_message', g.gift_message, 'send_on', g.send_on, 'start_on', g.start_on,
    'buyer_emailed_at', g.buyer_emailed_at, 'status', g.status);
end
$$;

-- The buyer's email went. A printed card's name and message are not needed any more (the card link carries them).
create or replace function public.gift_mark_buyer_emailed(p_code text, p_now timestamptz default now())
returns boolean
language sql
set search_path = public
as $$
  with u as (
    update public.gift_codes
       set buyer_emailed_at = coalesce(buyer_emailed_at, p_now),
           recipient_name   = case when delivery = 'print' then null else recipient_name end,
           gift_message     = case when delivery = 'print' then null else gift_message end
     where code = p_code
    returning 1)
  select exists (select 1 from u);
$$;

-- ── a refund ─────────────────────────────────────────────────────────────────────────────────────────
-- Only an UNUSED gift is voided, and only by a full refund. Answers { found, voided, already_void, redeemed, partial }.
create or replace function public.gift_refund(p_payment_intent text, p_full boolean, p_now timestamptz default now())
returns jsonb
language plpgsql
set search_path = public
as $$
declare g public.gift_codes%rowtype;
begin
  select * into g from public.gift_codes where stripe_payment_intent = p_payment_intent for update;
  if not found then return jsonb_build_object('found', false); end if;
  if g.voided_at is not null then return jsonb_build_object('found', true, 'already_void', true); end if;
  if g.redeemed_at is not null then return jsonb_build_object('found', true, 'redeemed', true); end if;
  if not coalesce(p_full, false) then return jsonb_build_object('found', true, 'partial', true); end if;
  update public.gift_codes
     set voided_at = p_now, void_reason = 'refunded', recipient_name = null, gift_message = null,
         recipient_send_claimed_at = null
   where code = g.code and voided_at is null and redeemed_at is null;
  return jsonb_build_object('found', true, 'voided', true);
end
$$;

-- ── redeeming ────────────────────────────────────────────────────────────────────────────────────────
-- p_not_before: the end of this account's paid period when it already pays (the server reads it), else null.
-- Answers { result: ok | invalid | used | mine | void, plan, starts_at, ends_at }.
--   used  another account redeemed it (never says which). mine  this account already did.
create or replace function public.gift_redeem(p_code text, p_user uuid, p_not_before timestamptz default null,
                                              p_now timestamptz default now())
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  g public.gift_codes%rowtype;
  v_after timestamptz;
  v_start timestamptz;
  v_end timestamptz;
begin
  if p_user is null or p_code is null or p_code !~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{12}$' then
    return jsonb_build_object('result', 'invalid');
  end if;
  -- One redemption at a time per account, so two codes redeemed at once still stack one after the other.
  perform pg_advisory_xact_lock(hashtextextended('gift_redeem:' || p_user::text, 0));
  select * into g from public.gift_codes where code = p_code for update;
  if not found then return jsonb_build_object('result', 'invalid'); end if;
  if g.voided_at is not null then return jsonb_build_object('result', 'void'); end if;
  if g.redeemed_at is not null then
    if g.redeemed_by = p_user then
      return jsonb_build_object('result', 'mine', 'plan', g.plan, 'starts_at', g.starts_at, 'ends_at', g.ends_at);
    end if;
    return jsonb_build_object('result', 'used');
  end if;
  select max(ends_at) into v_after from public.gift_codes
   where redeemed_by = p_user and voided_at is null and ends_at > p_now;
  v_start := greatest(
    p_now,
    coalesce(p_not_before, p_now),
    coalesce(g.start_on::timestamp at time zone 'America/Toronto', p_now),
    coalesce(v_after, p_now));
  v_end := v_start + make_interval(months => g.months);
  update public.gift_codes
     set redeemed_by = p_user, redeemed_at = p_now, starts_at = v_start, ends_at = v_end
   where code = p_code and redeemed_at is null and voided_at is null;
  return jsonb_build_object('result', 'ok', 'plan', g.plan, 'starts_at', v_start, 'ends_at', v_end);
end
$$;

-- ── the entitlement ──────────────────────────────────────────────────────────────────────────────────
-- Does a redeemed gift give this account flourish right now? { covered, plan, plus, ends_at, next_starts_at }.
-- ends_at is the end of the last gift this account holds (gifts follow one another), next_starts_at the start of a
-- gift still to come when none runs now.
create or replace function public.gift_cover(p_user uuid, p_now timestamptz default now())
returns jsonb
language sql
stable
set search_path = public
as $$
  with mine as (
    select plan, starts_at, ends_at from public.gift_codes
     where redeemed_by = p_user and voided_at is null and ends_at > p_now),
  cur as (select plan from mine where starts_at <= p_now order by ends_at desc limit 1)
  select jsonb_build_object(
    'covered', exists (select 1 from cur),
    'plan', (select plan from cur),
    'plus', coalesce((select plan = 'flourish_plus' from cur), false),
    'ends_at', (select max(ends_at) from mine),
    'next_starts_at', (select min(starts_at) from mine where starts_at > p_now));
$$;

-- ── the recipient's email, on its day (gift-send-sweep.js, every 5 minutes) ───────────────────────────
-- Claims the emails due (07:00 Eastern on send_on has passed), marking each claimed in the same statement, so two runs
-- at once never take the same row (FOR UPDATE SKIP LOCKED). A claim older than 30 minutes is a run that died: the row
-- may be claimed again (the send carries an idempotency key, so the email provider still sends it once). After 10
-- attempts a row is left for Amanda. A refunded gift is never claimed, and neither is one already redeemed.
create or replace function public.gift_claim_due_sends(p_now timestamptz default now(), p_limit integer default 5)
returns table (code text, plan text, recipient_email text, recipient_name text, gift_message text,
               send_on date, start_on date, recipient_send_attempts integer)
language sql
set search_path = public
as $$
  update public.gift_codes g
     set recipient_send_claimed_at = p_now,
         recipient_send_attempts   = g.recipient_send_attempts + 1
   where g.code in (
           select c.code from public.gift_codes c
            where c.delivery = 'email'
              and c.recipient_email is not null
              and c.send_on is not null
              and c.recipient_sent_at is null
              and c.voided_at is null
              and c.redeemed_at is null
              and c.recipient_send_attempts < 10
              and (c.recipient_send_claimed_at is null or c.recipient_send_claimed_at < p_now - interval '30 minutes')
              and ((c.send_on + time '07:00') at time zone 'America/Toronto') <= p_now
            order by c.send_on, c.created_at
            limit greatest(1, least(coalesce(p_limit, 5), 50))
            for update skip locked)
     and g.recipient_sent_at is null
     and g.voided_at is null
  returning g.code, g.plan, g.recipient_email, g.recipient_name, g.gift_message, g.send_on, g.start_on,
            g.recipient_send_attempts;
$$;

-- The one send, recorded; only a row not yet marked sent changes. The name and message go with it.
create or replace function public.gift_mark_sent(p_code text, p_now timestamptz default now())
returns boolean
language sql
set search_path = public
as $$
  with u as (
    update public.gift_codes
       set recipient_sent_at = p_now, recipient_send_claimed_at = null, recipient_last_error = null,
           recipient_name = null, gift_message = null
     where code = p_code and recipient_sent_at is null
    returning 1)
  select exists (select 1 from u);
$$;

-- A failed send keeps its claim, so the row waits 30 minutes before the next try.
create or replace function public.gift_mark_send_failed(p_code text, p_error text)
returns void
language sql
set search_path = public
as $$
  update public.gift_codes set recipient_last_error = left(coalesce(p_error, 'error'), 200)
   where code = p_code and recipient_sent_at is null;
$$;

-- Email is switched off: the claim and the attempt both go back, since nothing was tried.
create or replace function public.gift_release_send(p_code text, p_error text)
returns void
language sql
set search_path = public
as $$
  update public.gift_codes
     set recipient_send_claimed_at = null,
         recipient_send_attempts   = greatest(0, recipient_send_attempts - 1),
         recipient_last_error      = left(coalesce(p_error, 'email_off'), 200)
   where code = p_code and recipient_sent_at is null;
$$;

-- Only the server calls these (Netlify functions, with the secret key).
revoke all on function public.gift_create(text, text, text, text, boolean, text, text, text, text, text, date, date, integer, integer, integer, text) from public, anon, authenticated;
revoke all on function public.gift_mark_buyer_emailed(text, timestamptz) from public, anon, authenticated;
revoke all on function public.gift_refund(text, boolean, timestamptz) from public, anon, authenticated;
revoke all on function public.gift_redeem(text, uuid, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.gift_cover(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.gift_claim_due_sends(timestamptz, integer) from public, anon, authenticated;
revoke all on function public.gift_mark_sent(text, timestamptz) from public, anon, authenticated;
revoke all on function public.gift_mark_send_failed(text, text) from public, anon, authenticated;
revoke all on function public.gift_release_send(text, text) from public, anon, authenticated;
grant execute on function public.gift_create(text, text, text, text, boolean, text, text, text, text, text, date, date, integer, integer, integer, text) to service_role;
grant execute on function public.gift_mark_buyer_emailed(text, timestamptz) to service_role;
grant execute on function public.gift_refund(text, boolean, timestamptz) to service_role;
grant execute on function public.gift_redeem(text, uuid, timestamptz, timestamptz) to service_role;
grant execute on function public.gift_cover(uuid, timestamptz) to service_role;
grant execute on function public.gift_claim_due_sends(timestamptz, integer) to service_role;
grant execute on function public.gift_mark_sent(text, timestamptz) to service_role;
grant execute on function public.gift_mark_send_failed(text, text) to service_role;
grant execute on function public.gift_release_send(text, text) to service_role;

-- Check after applying (read-only):
--   select grantee, privilege_type from information_schema.role_table_grants
--    where table_schema = 'public' and table_name = 'gift_codes' order by 1, 2;   -- service_role SELECT, INSERT, UPDATE only
--   select relrowsecurity from pg_class where oid = 'public.gift_codes'::regclass;  -- t
--
-- Day to day (read-only), for Amanda:
--   select plan, status, count(*) from public.gift_codes where livemode group by 1, 2 order by 1, 2;
--   -- recipient emails waiting for their day, and any that are stuck:
--   select send_on, recipient_send_attempts, recipient_last_error from public.gift_codes
--    where delivery = 'email' and recipient_sent_at is null and voided_at is null order by 1;
--   -- a test, cleaned up afterwards (test-mode rows only):
--   --   update public.gift_codes set voided_at = now(), void_reason = 'test' where not livemode and voided_at is null;
