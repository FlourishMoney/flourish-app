-- ============================================================================
-- Flourish Money - the Creator Program (approved 2026-11-02, ChatGPT and Grok agreed)
-- ============================================================================
-- grants: service_role only
-- Run after 0030 and 0031 (households). Safe to run more than once. Nothing reads or writes these tables until
-- CREATORS_ENABLED is exactly "true" on the server.
--
-- A creator gets a code. A household that signs up with it and subscribes earns the creator 20% of its qualifying
-- payments for 12 months from its first payment. The code is tracking only: no discount, no reward to the person.
--
--   creators              code (unique, uppercase), name, payout email, status
--                           active           the code is accepted for new households
--                           ended            no new households; those already credited keep earning for the
--                                            rest of their 12 months (the approved terms)
--                           ended_for_cause  fraud, spam or a serious breach: no new households, nothing further earned
--   creator_attributions  one per account: the code it entered, when, and from where
--   creator_commissions   one per qualifying payment, and clawback rows against it
--
-- WHOSE CODE (Amanda, 2026-11-02). A households row exists only after an owner's first invite, so an attribution
-- belongs to the ACCOUNT that entered the code (user_id). Someone on their own uses their own. A member of a household
-- uses the household's: the one its payments have already been credited to (household_id, set by the first commission),
-- otherwise its owner's. A partner's own attribution does not apply while they are in a household, so a partner
-- joining never changes the household's code, and a partner cannot add one.
--
-- WHO SEES WHAT. Nothing here is readable by anyone signed in, or by anon. A creator is told counts and totals only
-- (creator_payout_report): never who the households are, and never an amount per household. A deleted account's rows
-- keep their money with the account id cleared (on delete set null), so payouts and clawbacks stay correct.

-- 1. Tables -----------------------------------------------------------------------------------------------------
create table if not exists public.creators (
  id           uuid        primary key default gen_random_uuid(),
  code         text        not null unique check (code ~ '^[A-Z0-9]{3,20}$'),
  name         text        not null check (length(trim(name)) > 0),
  payout_email text        not null check (position('@' in payout_email) > 1),
  status       text        not null default 'active' check (status in ('active', 'ended', 'ended_for_cause')),
  created_at   timestamptz not null default now()
);

create table if not exists public.creator_attributions (
  id               uuid        primary key default gen_random_uuid(),
  user_id          uuid        references auth.users(id) on delete set null,      -- the account that entered the code
  household_id     uuid        references public.households(id) on delete set null,   -- set by its first commission in a household
  creator_id       uuid        not null references public.creators(id) on delete restrict,
  code             text        not null,
  attributed_at    timestamptz not null default now(),
  source           text        not null check (source in ('web', 'ios', 'android')),
  first_payment_at timestamptz                                                     -- the household's first payment: the 12 months start here
);
create unique index if not exists creator_attributions_one_per_account on public.creator_attributions (user_id) where user_id is not null;
create unique index if not exists creator_attributions_one_per_household on public.creator_attributions (household_id) where household_id is not null;
create index if not exists creator_attributions_creator on public.creator_attributions (creator_id);

create table if not exists public.creator_commissions (
  id                 uuid        primary key default gen_random_uuid(),
  user_id            uuid        references auth.users(id) on delete set null,     -- who paid; never shown to a creator
  household_id       uuid        references public.households(id) on delete set null,
  creator_id         uuid        not null references public.creators(id) on delete restrict,
  attribution_id     uuid        not null references public.creator_attributions(id) on delete restrict,
  provider           text        not null check (provider in ('stripe', 'app_store', 'play_store')),
  payment_ref        text        not null,    -- Stripe's invoice id, or the store's transaction id
  original_ref       text,                    -- the store's original transaction id, for matching a refund
  payment_date       timestamptz not null,    -- a clawback keeps its payment's date, so the two mature together
  base_amount_cents  integer     not null check (base_amount_cents >= 0),   -- price before sales tax; a store's proceeds after its fee
  gross_amount_cents integer     check (gross_amount_cents >= 0),           -- what was charged: a partial refund's share of it
  commission_cents   integer     not null,
  currency           text        not null default 'CAD' check (currency = 'CAD'),   -- Canada only for now
  status             text        not null default 'pending' check (status in ('pending', 'payable', 'paid', 'clawback')),
  clawback_of        uuid        references public.creator_commissions(id) on delete restrict,
  payout_ref         text,                    -- the payout that settled this row
  paid_at            timestamptz,
  created_at         timestamptz not null default now(),
  constraint creator_commissions_clawback_shape check (
    (status = 'clawback' and clawback_of is not null and commission_cents < 0)
    or (status <> 'clawback' and clawback_of is null and commission_cents >= 0))
);
create unique index if not exists creator_commissions_one_per_payment on public.creator_commissions (provider, payment_ref) where clawback_of is null;
create index if not exists creator_commissions_creator on public.creator_commissions (creator_id, status);
create index if not exists creator_commissions_original_ref on public.creator_commissions (provider, original_ref) where original_ref is not null;
create index if not exists creator_commissions_clawback_of on public.creator_commissions (clawback_of) where clawback_of is not null;

alter table public.creators             enable row level security;
alter table public.creator_attributions enable row level security;
alter table public.creator_commissions  enable row level security;

-- Supabase's old default grants gave a new public table everything for anon and authenticated: taken away, explicitly.
revoke all on table public.creators             from public, anon, authenticated;
revoke all on table public.creator_attributions from public, anon, authenticated;
revoke all on table public.creator_commissions  from public, anon, authenticated;
grant all privileges on table public.creators             to service_role;
grant all privileges on table public.creator_attributions to service_role;
grant all privileges on table public.creator_commissions  to service_role;

-- 2. Whose code ---------------------------------------------------------------------------------------------------
-- The same person, however they wrote their address: case, spaces and a +tag never matter, nor Gmail's dots.
create or replace function public.creator_email_key(p_email text)
returns text language plpgsql immutable set search_path = public as $$
declare e text; loc text; dom text;
begin
  e := lower(regexp_replace(coalesce(p_email, ''), '\s+', '', 'g'));
  if position('@' in e) < 2 then return e; end if;
  loc := split_part(split_part(e, '@', 1), '+', 1);
  dom := split_part(e, '@', 2);
  if dom in ('gmail.com', 'googlemail.com') then
    loc := replace(loc, '.', '');
    dom := 'gmail.com';
  end if;
  return loc || '@' || dom;
end; $$;

-- Is this creator the account itself, or anyone in its household? A creator cannot earn on their own code.
create or replace function public.creator_is_own(p_user uuid, p_creator uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.creators c, auth.users u
     where c.id = p_creator
       and public.creator_email_key(u.email) = public.creator_email_key(c.payout_email)
       and (u.id = p_user or u.id in (
             select m.user_id from public.household_members m
              where m.household_id = (select household_id from public.household_members where user_id = p_user))));
$$;

-- The attribution a payment by this account counts towards, or null.
create or replace function public.creator_attribution_for(p_user uuid)
returns uuid language plpgsql stable security definer set search_path = public as $$
declare hid uuid; aid uuid;
begin
  select household_id into hid from public.household_members where user_id = p_user;
  if hid is null then
    select id into aid from public.creator_attributions where user_id = p_user;
    return aid;
  end if;
  select id into aid from public.creator_attributions where household_id = hid;
  if aid is not null then return aid; end if;
  select ca.id into aid from public.creator_attributions ca
    join public.household_members m on m.user_id = ca.user_id
   where m.household_id = hid and m.role = 'owner';
  return aid;
end; $$;

-- Why this account may not add a code now, or null when it may.
--   already    the account, or its household, has one (the first code entered is the one that counts)
--   not_owner  a partner: joining never changes the household's code, and neither does adding one afterwards
--   too_late   more than 14 days since sign-up
--   paid       the account or its household has made a payment
create or replace function public.creator_add_refused(p_user uuid)
returns text language plpgsql stable security definer set search_path = public as $$
declare signed_up timestamptz; hid uuid; r text;
begin
  select created_at into signed_up from auth.users where id = p_user;
  if signed_up is null then return 'no_account'; end if;
  if exists (select 1 from public.creator_attributions where user_id = p_user) then return 'already'; end if;
  select household_id, role into hid, r from public.household_members where user_id = p_user;
  if r = 'partner' then return 'not_owner'; end if;
  if hid is not null and exists (select 1 from public.creator_attributions where household_id = hid) then return 'already'; end if;
  if signed_up < now() - interval '14 days' then return 'too_late'; end if;
  if exists (select 1 from public.subscriptions s
              where s.status not in ('incomplete', 'incomplete_expired')
                and (s.user_id = p_user
                     or s.user_id in (select m.user_id from public.household_members m where m.household_id = hid))) then
    return 'paid';
  end if;
  return null;
end; $$;

-- 3. Entering a code ----------------------------------------------------------------------------------------------
-- Before an account exists (sign-up): could this code take a new household? A code that does not exist and one no longer
-- active answer 'invalid'. It takes no address on purpose: if a creator's own address answered differently here, anyone
-- could test a guessed address against a public code. A creator signing up with their own code gets an account and no
-- attribution (creator_attribute refuses it, by then for an address they have shown they hold).
create or replace function public.creator_code_check(p_code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare c public.creators%rowtype;
begin
  select * into c from public.creators where code = upper(trim(coalesce(p_code, '')));
  if c.id is null or c.status <> 'active' then return jsonb_build_object('result', 'invalid'); end if;
  return jsonb_build_object('result', 'ok');
end; $$;

-- Entering a code, at sign-up (a new account passes every rule) or later in Settings. One lock per person, so two tries
-- at the same moment are one after the other, and the first code wins.
-- Answers jsonb { result }: 'attributed', 'invalid', 'already', 'not_owner', 'too_late', 'paid', 'no_account'.
create or replace function public.creator_attribute(p_user uuid, p_code text, p_source text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c public.creators%rowtype; why text;
begin
  perform pg_advisory_xact_lock(hashtext('creator:' || p_user::text));
  why := public.creator_add_refused(p_user);
  if why is not null then return jsonb_build_object('result', why); end if;
  select * into c from public.creators where code = upper(trim(coalesce(p_code, '')));
  if c.id is null or c.status <> 'active' or public.creator_is_own(p_user, c.id) then
    return jsonb_build_object('result', 'invalid');
  end if;
  insert into public.creator_attributions (user_id, creator_id, code, source)
  values (p_user, c.id, c.code, case when p_source in ('web', 'ios', 'android') then p_source else 'web' end);
  return jsonb_build_object('result', 'attributed');
end; $$;

-- What Settings needs: may this account add a code now?
create or replace function public.creator_status(p_user uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare why text;
begin
  why := public.creator_add_refused(p_user);
  return jsonb_build_object('may_add', why is null, 'why', why);
end; $$;

-- 4. Commissions --------------------------------------------------------------------------------------------------
-- Does a payment by this account count towards a creator at all? (Whether to raise a support note about one that
-- cannot be worked out: an account with no creator has nothing to report.)
create or replace function public.creator_for_payer(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.creator_attribution_for(p_user) is not null;
$$;

-- A partner's own plan from before they joined is not this household's subscribing: someone who has paid for years does
-- not earn a creator a fresh 12 months by joining a household that holds a code. (A subscriptions row keeps its first
-- created_at, so a partner who cancelled, joined and bought again is also left out: the cautious way round.)
create or replace function public.creator_partner_plan_before_join(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.household_members m join public.subscriptions s on s.user_id = m.user_id
     where m.user_id = p_user and m.role = 'partner' and s.created_at < m.joined_at);
$$;

-- The 12 months start at the household's first payment, whether or not that payment earned anything: one that couldn't be
-- worked out, or wasn't in dollars, is still the first. Otherwise a renewal a year later would count as the first. Called
-- under the attribution's lock (creator_commission_record), or alone when a payment's amounts can't be read
-- (creator_first_payment_seen). Answers the household's first payment.
create or replace function public.creator_anchor_first_payment(p_attribution uuid, p_when timestamptz)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare was timestamptz; first_at timestamptz;
begin
  select first_payment_at into was from public.creator_attributions where id = p_attribution for update;
  first_at := least(coalesce(was, p_when), p_when);
  if was is distinct from first_at then
    update public.creator_attributions set first_payment_at = first_at where id = p_attribution;
  end if;
  return first_at;
end; $$;

-- A payment whose amounts can't be read: no commission, but the 12 months still start.
create or replace function public.creator_first_payment_seen(p_user uuid, p_when timestamptz)
returns jsonb language plpgsql security definer set search_path = public as $$
declare aid uuid;
begin
  if p_when is null then return jsonb_build_object('result', 'no_date'); end if;
  aid := public.creator_attribution_for(p_user);
  if aid is null then return jsonb_build_object('result', 'no_creator'); end if;
  if public.creator_partner_plan_before_join(p_user) then return jsonb_build_object('result', 'partner_plan_before_join'); end if;
  perform public.creator_anchor_first_payment(aid, p_when);
  return jsonb_build_object('result', 'anchored');
end; $$;

-- One qualifying payment. 20% of p_base_cents, which the caller has already worked out: the price before sales tax,
-- and for a store, its proceeds after the store's fee. Pending until the payment is more than 30 days old.
-- THE 12 MONTHS run from the household's first payment (first_payment_at, the earliest payment seen). A renewal on the
-- anniversary is outside them, and so is one a store dates up to two days early: Apple charges a renewal within the 24
-- hours before the period ends, and a second annual payment must not count as the first year's.
-- Answers jsonb { result }: 'recorded' (with commission_cents), 'no_creator', 'partner_plan_before_join', 'not_cad',
-- 'creator_ended', 'own_code', 'before_code' (the household had paid before the code was entered), 'outside_window',
-- 'duplicate'.
create or replace function public.creator_commission_record(
  p_user uuid, p_provider text, p_payment_ref text, p_original_ref text, p_payment_date timestamptz,
  p_base_cents integer, p_gross_cents integer, p_currency text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a public.creator_attributions%rowtype; c public.creators%rowtype; hid uuid; aid uuid; first_at timestamptz; cents integer; n integer;
begin
  if coalesce(p_payment_ref, '') = '' or p_payment_date is null or p_base_cents is null or p_base_cents < 0 then
    raise exception 'creator_commission_bad_payment' using errcode = 'check_violation';
  end if;
  aid := public.creator_attribution_for(p_user);
  if aid is null then return jsonb_build_object('result', 'no_creator'); end if;
  if public.creator_partner_plan_before_join(p_user) then return jsonb_build_object('result', 'partner_plan_before_join'); end if;
  first_at := public.creator_anchor_first_payment(aid, p_payment_date);   -- takes the attribution's lock, and is first on purpose
  select * into a from public.creator_attributions where id = aid;
  if upper(coalesce(p_currency, '')) <> 'CAD' then return jsonb_build_object('result', 'not_cad'); end if;
  select * into c from public.creators where id = a.creator_id;
  if c.status = 'ended_for_cause' then return jsonb_build_object('result', 'creator_ended'); end if;
  if public.creator_is_own(p_user, c.id) then return jsonb_build_object('result', 'own_code'); end if;
  select household_id into hid from public.household_members where user_id = p_user;

  if first_at < a.attributed_at then return jsonb_build_object('result', 'before_code'); end if;
  if p_payment_date >= first_at + interval '12 months' - interval '2 days' then
    return jsonb_build_object('result', 'outside_window');
  end if;

  cents := round(p_base_cents * 0.20);
  insert into public.creator_commissions
    (user_id, household_id, creator_id, attribution_id, provider, payment_ref, original_ref, payment_date,
     base_amount_cents, gross_amount_cents, commission_cents, currency, status)
  values (p_user, hid, c.id, a.id, p_provider, p_payment_ref, p_original_ref, p_payment_date,
          p_base_cents, p_gross_cents, cents, 'CAD', 'pending')
  on conflict (provider, payment_ref) where clawback_of is null do nothing;
  get diagnostics n = row_count;
  if n = 0 then return jsonb_build_object('result', 'duplicate'); end if;
  if hid is not null and a.household_id is null then
    update public.creator_attributions set household_id = hid where id = a.id;
  end if;
  return jsonb_build_object('result', 'recorded', 'commission_cents', cents);
end; $$;

-- A refund: a clawback of the commission on that one payment, and only that one. The payment is found by its own
-- reference; for a store, failing that, by its original transaction and its exact date. Nothing is guessed: no match
-- answers 'not_found'. p_refunded_cents is how much of the payment has been refunded so far (null, or nothing known of
-- what was charged: all of it). Worked out against what has been clawed back so far, so a replay, or a second partial
-- refund, adds only what is new. A clawback keeps its payment's date, so one against a
-- payment still under 30 days matures with it and they cancel out; one against a payment already paid comes off the
-- next payouts until it is recovered (creator_payout_report).
-- Answers jsonb { result }: 'clawback' (with cents), 'already', 'not_found'.
create or replace function public.creator_commission_clawback(
  p_provider text, p_payment_ref text, p_original_ref text, p_payment_date timestamptz, p_refunded_cents integer default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o public.creator_commissions%rowtype; share numeric := 1; target integer; done integer;
begin
  select * into o from public.creator_commissions
   where provider = p_provider and payment_ref = p_payment_ref and clawback_of is null for update;
  if o.id is null and p_original_ref is not null and p_payment_date is not null then
    select * into o from public.creator_commissions
     where provider = p_provider and original_ref = p_original_ref and payment_date = p_payment_date and clawback_of is null for update;
  end if;
  if o.id is null then return jsonb_build_object('result', 'not_found'); end if;
  if p_refunded_cents is not null and coalesce(o.gross_amount_cents, 0) > 0 then
    share := least(greatest(p_refunded_cents::numeric / o.gross_amount_cents, 0), 1);
  end if;
  target := round(o.commission_cents * share);
  select coalesce(-sum(commission_cents), 0) into done from public.creator_commissions where clawback_of = o.id;
  if target <= done then return jsonb_build_object('result', 'already'); end if;
  insert into public.creator_commissions
    (user_id, household_id, creator_id, attribution_id, provider, payment_ref, original_ref, payment_date,
     base_amount_cents, gross_amount_cents, commission_cents, currency, status, clawback_of)
  values (o.user_id, o.household_id, o.creator_id, o.attribution_id, o.provider, o.payment_ref, o.original_ref, o.payment_date,
          o.base_amount_cents, o.gross_amount_cents, -(target - done), o.currency, 'clawback', o.id);
  return jsonb_build_object('result', 'clawback', 'cents', target - done);
end; $$;

-- Pending becomes payable once the payment is more than 30 days old. Run daily (creator-commissions-sweep). Answers how
-- many changed.
create or replace function public.creator_commissions_mature(p_as_of timestamptz default now())
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  update public.creator_commissions set status = 'payable'
   where status = 'pending' and payment_date < p_as_of - interval '30 days';
  get diagnostics n = row_count;
  return n;
end; $$;

-- 5. The monthly payout ---------------------------------------------------------------------------------------------
-- p_as_of IS THE SNAPSHOT. The report and the payout it leads to look at the same rows: those already recorded at that
-- moment, on payments more than 30 days old at it. A payment that matures, or a refund that lands, after the report waits
-- for next month's, whenever the payout is recorded.
--
-- Read only. One line per creator. Everything is a total: no household, no customer, no amount per household. A row is
-- ready once its payment is more than 30 days old, whether or not the daily sweep has flipped it yet.
--   households_credited       how many households joined with this code: a count, never who. An account counts once its
--                             email is confirmed; a partner's own code doesn't count while they are in a household; an
--                             account since deleted counts if it ever paid.
--   payable_this_month_cents  what is earned less what is to be taken back, when that reaches $25; otherwise 0
--   carry_over_cents          the same figure when it is under $25: it rolls to next month. Below zero, it is still owed
--                             back, and comes off later payouts (the approved terms)
--   clawbacks_cents           the refunds included in those figures (zero or negative)
--   not_yet_30_days_cents     earned on payments under 30 days old, less any refunds of them: not payable yet
create or replace function public.creator_payout_report(p_as_of timestamptz default now())
returns table (code text, name text, payout_email text, status text, households_credited bigint, payable_this_month_cents bigint,
               carry_over_cents bigint, clawbacks_cents bigint, not_yet_30_days_cents bigint)
language sql stable security definer set search_path = public as $$
  with ready as (
    select cc.creator_id,
           coalesce(sum(cc.commission_cents) filter (where cc.clawback_of is null), 0) as earned,
           coalesce(sum(cc.commission_cents) filter (where cc.clawback_of is not null), 0) as clawed
      from public.creator_commissions cc
     where cc.payout_ref is null and cc.status <> 'paid' and cc.created_at <= p_as_of
       and cc.payment_date < p_as_of - interval '30 days'
     group by cc.creator_id),
  young as (
    select cc.creator_id, coalesce(sum(cc.commission_cents), 0) as cents
      from public.creator_commissions cc
     where cc.payout_ref is null and cc.status <> 'paid' and cc.created_at <= p_as_of
       and cc.payment_date >= p_as_of - interval '30 days'
     group by cc.creator_id),
  joined as (
    select ca.creator_id, count(*) as households
      from public.creator_attributions ca
      left join auth.users u on u.id = ca.user_id
     where ca.attributed_at <= p_as_of
       and (case when ca.user_id is null then ca.first_payment_at is not null else u.email_confirmed_at is not null end)
       and not exists (select 1 from public.household_members m where m.user_id = ca.user_id and m.role = 'partner')
     group by ca.creator_id)
  select c.code, c.name, c.payout_email, c.status, coalesce(j.households, 0),
         case when coalesce(r.earned, 0) + coalesce(r.clawed, 0) >= 2500 then coalesce(r.earned, 0) + coalesce(r.clawed, 0) else 0 end,
         case when coalesce(r.earned, 0) + coalesce(r.clawed, 0) >= 2500 then 0 else coalesce(r.earned, 0) + coalesce(r.clawed, 0) end,
         coalesce(r.clawed, 0), coalesce(y.cents, 0)
    from public.creators c
    left join ready r on r.creator_id = c.id
    left join young y on y.creator_id = c.id
    left join joined j on j.creator_id = c.id
   order by c.code;
$$;

-- After the e-Transfer has gone: exactly what the report at p_as_of covered is settled, under one reference. p_expected_cents
-- is the amount that report said and that was sent: any other figure refuses, and nothing is settled. Under $25 refuses too,
-- so a carry-over can't be settled by mistake, and a second run finds nothing left.
-- Answers jsonb { result }: 'paid' (with cents, rows), 'amount_changed' (with cents), 'below_minimum' (with cents),
-- 'no_such_creator'.
create or replace function public.creator_payout_record(p_code text, p_payout_ref text, p_expected_cents bigint, p_as_of timestamptz)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c public.creators%rowtype; net bigint; n integer;
begin
  if coalesce(trim(p_payout_ref), '') = '' or p_expected_cents is null or p_as_of is null then
    raise exception 'creator_payout_needs_ref_amount_and_date' using errcode = 'check_violation';
  end if;
  select * into c from public.creators where code = upper(trim(coalesce(p_code, ''))) for update;
  if c.id is null then return jsonb_build_object('result', 'no_such_creator'); end if;
  select coalesce(sum(commission_cents), 0) into net from public.creator_commissions
   where creator_id = c.id and payout_ref is null and status <> 'paid' and created_at <= p_as_of
     and payment_date < p_as_of - interval '30 days';
  if net < 2500 then return jsonb_build_object('result', 'below_minimum', 'cents', net); end if;
  if net <> p_expected_cents then return jsonb_build_object('result', 'amount_changed', 'cents', net); end if;
  update public.creator_commissions
     set payout_ref = p_payout_ref, paid_at = now(), status = case when status = 'clawback' then 'clawback' else 'paid' end
   where creator_id = c.id and payout_ref is null and status <> 'paid' and created_at <= p_as_of
     and payment_date < p_as_of - interval '30 days';
  get diagnostics n = row_count;
  return jsonb_build_object('result', 'paid', 'cents', net, 'rows', n);
end; $$;

-- Server-only: nobody signed in, and nobody anonymous, calls any of these.
revoke all on function public.creator_email_key(text) from public, anon, authenticated;
revoke all on function public.creator_is_own(uuid, uuid) from public, anon, authenticated;
revoke all on function public.creator_attribution_for(uuid) from public, anon, authenticated;
revoke all on function public.creator_add_refused(uuid) from public, anon, authenticated;
revoke all on function public.creator_code_check(text) from public, anon, authenticated;
revoke all on function public.creator_attribute(uuid, text, text) from public, anon, authenticated;
revoke all on function public.creator_status(uuid) from public, anon, authenticated;
revoke all on function public.creator_for_payer(uuid) from public, anon, authenticated;
revoke all on function public.creator_partner_plan_before_join(uuid) from public, anon, authenticated;
revoke all on function public.creator_anchor_first_payment(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.creator_first_payment_seen(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.creator_commission_record(uuid, text, text, text, timestamptz, integer, integer, text) from public, anon, authenticated;
revoke all on function public.creator_commission_clawback(text, text, text, timestamptz, integer) from public, anon, authenticated;
revoke all on function public.creator_commissions_mature(timestamptz) from public, anon, authenticated;
revoke all on function public.creator_payout_report(timestamptz) from public, anon, authenticated;
revoke all on function public.creator_payout_record(text, text, bigint, timestamptz) from public, anon, authenticated;
grant execute on function public.creator_email_key(text) to service_role;
grant execute on function public.creator_is_own(uuid, uuid) to service_role;
grant execute on function public.creator_attribution_for(uuid) to service_role;
grant execute on function public.creator_add_refused(uuid) to service_role;
grant execute on function public.creator_code_check(text) to service_role;
grant execute on function public.creator_attribute(uuid, text, text) to service_role;
grant execute on function public.creator_status(uuid) to service_role;
grant execute on function public.creator_for_payer(uuid) to service_role;
grant execute on function public.creator_partner_plan_before_join(uuid) to service_role;
grant execute on function public.creator_anchor_first_payment(uuid, timestamptz) to service_role;
grant execute on function public.creator_first_payment_seen(uuid, timestamptz) to service_role;
grant execute on function public.creator_commission_record(uuid, text, text, text, timestamptz, integer, integer, text) to service_role;
grant execute on function public.creator_commission_clawback(text, text, text, timestamptz, integer) to service_role;
grant execute on function public.creator_commissions_mature(timestamptz) to service_role;
grant execute on function public.creator_payout_report(timestamptz) to service_role;
grant execute on function public.creator_payout_record(text, text, bigint, timestamptz) to service_role;

-- READ-ONLY CHECK (after running): RLS on all three; anon and a signed-in user reach no table and no function; the
-- server does.
--   select (select bool_and(relrowsecurity) from pg_class where oid in ('public.creators'::regclass, 'public.creator_attributions'::regclass, 'public.creator_commissions'::regclass)),
--          has_table_privilege('anon', 'public.creator_attributions', 'select, insert, update, delete'),
--          has_table_privilege('authenticated', 'public.creators', 'select, insert, update, delete'),
--          has_table_privilege('authenticated', 'public.creator_attributions', 'select, insert, update, delete'),
--          has_table_privilege('authenticated', 'public.creator_commissions', 'select, insert, update, delete'),
--          has_function_privilege('authenticated', 'public.creator_attribute(uuid, text, text)', 'execute'),
--          has_function_privilege('anon', 'public.creator_payout_report(timestamptz)', 'execute'),
--          has_table_privilege('service_role', 'public.creator_commissions', 'insert');
-- Expected after: true, false, false, false, false, false, false, true.

-- ROLLBACK (only before any creator has a row that matters):
-- drop function if exists public.creator_payout_record(text, text, bigint, timestamptz);
-- drop function if exists public.creator_payout_report(timestamptz);
-- drop function if exists public.creator_commissions_mature(timestamptz);
-- drop function if exists public.creator_commission_clawback(text, text, text, timestamptz, integer);
-- drop function if exists public.creator_commission_record(uuid, text, text, text, timestamptz, integer, integer, text);
-- drop function if exists public.creator_first_payment_seen(uuid, timestamptz);
-- drop function if exists public.creator_anchor_first_payment(uuid, timestamptz);
-- drop function if exists public.creator_partner_plan_before_join(uuid);
-- drop function if exists public.creator_for_payer(uuid);
-- drop function if exists public.creator_status(uuid);
-- drop function if exists public.creator_attribute(uuid, text, text);
-- drop function if exists public.creator_code_check(text);
-- drop function if exists public.creator_add_refused(uuid);
-- drop function if exists public.creator_attribution_for(uuid);
-- drop function if exists public.creator_is_own(uuid, uuid);
-- drop function if exists public.creator_email_key(text);
-- drop table if exists public.creator_commissions;
-- drop table if exists public.creator_attributions;
-- drop table if exists public.creators;
