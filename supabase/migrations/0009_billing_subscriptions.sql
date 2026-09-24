-- 0009_billing_subscriptions.sql
-- =============================================================================
-- WHAT A HOUSEHOLD IS PAYING FOR. The server's only source of truth for "paid".
--
-- Before this, nothing in the app could answer "has this person paid?": plan lived in
-- profiles.plan, and only a human ever set it to 'plus'. This table is what Stripe writes
-- through the webhook, and what netlify/functions/_lib/auth.js reads to decide entitlement.
-- The client never writes it — see the grants and the policies at the bottom.
--
-- SAFE TO RUN ANYWHERE. Every statement is guarded (create ... if not exists, create policy
-- guarded by a catalogue check), so re-running it is a no-op.
--
-- NOT APPLIED BY THE AUTHOR. There is no staging Supabase project yet (P14 is still pending),
-- so this file is written and reviewed, not run. Apply order: 0009 then 0010.
-- =============================================================================

create table if not exists public.subscriptions (
  user_id                  uuid primary key references auth.users(id) on delete cascade,

  provider                 text        not null default 'stripe' check (provider in ('stripe')),
  provider_customer_id     text,
  provider_subscription_id text unique,

  -- Which price they are on. plan_key is ours and stable; price_id is Stripe's and changes
  -- between test and live mode, so nothing may key behaviour off price_id.
  plan_key                 text        check (plan_key in ('monthly', 'annual', 'founding_annual')),
  price_id                 text,
  currency                 text        not null default 'CAD',

  -- Stripe's own lifecycle values, stored verbatim. The decision about WHICH of these count as
  -- paid lives in one place in code (_lib/planRules.js SUBSCRIPTION_PAID_STATUSES), not here,
  -- so it can be changed without a migration.
  status                   text        not null default 'incomplete'
                                       check (status in ('incomplete', 'incomplete_expired', 'trialing',
                                                         'active', 'past_due', 'canceled', 'unpaid', 'paused')),
  current_period_end       timestamptz,
  cancel_at_period_end     boolean     not null default false,

  -- DECISIONS.md item 1: the founding annual price is locked WHILE CONTINUOUSLY SUBSCRIBED.
  -- Recording when the lock started makes "continuously" checkable later; cancelling clears it.
  founding_locked_at       timestamptz,

  -- STRIPE TAX IS OFF TODAY (P16: prices are quoted plus tax, collected outside Stripe Tax).
  -- These columns exist so switching it on is a config change in the Stripe dashboard plus a
  -- webhook writing three more fields — NOT a migration. They stay null while tax is off.
  automatic_tax            boolean     not null default false,
  amount_subtotal_cents    integer,
  amount_tax_cents         integer,
  amount_total_cents       integer,

  -- The `created` time of the Stripe EVENT this row was last written from — not the time we
  -- processed it. Stripe does not guarantee delivery order and retries for days, so the webhook
  -- compares against this and ignores an event older than the one already applied. Null on a row
  -- written before any event (the customer stub created at checkout).
  last_event_at            timestamptz,

  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index if not exists subscriptions_customer_idx     on public.subscriptions (provider_customer_id);
create index if not exists subscriptions_subscription_idx on public.subscriptions (provider_subscription_id);

alter table public.subscriptions enable row level security;

-- The client may READ ITS OWN ROW and nothing else. There is deliberately no insert, update or
-- delete policy: a client that could write this table could grant itself a plan.
do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'subscriptions' and policyname = 'subscriptions_select_own'
  ) then
    create policy "subscriptions_select_own" on public.subscriptions
      for select using (auth.uid() = user_id);
  end if;
end $$;

-- Data API grants. Supabase stops auto-granting on new public tables from 2026-10-30, so a table
-- created after that date is invisible to PostgREST without these lines.
-- See docs/ops/SUPABASE-GRANTS.md (branch supabase-grants).
-- authenticated gets SELECT only, matching the single policy above. anon gets nothing: this is
-- not readable without a session.
grant select          on table public.subscriptions to authenticated;
grant all privileges  on table public.subscriptions to service_role;
