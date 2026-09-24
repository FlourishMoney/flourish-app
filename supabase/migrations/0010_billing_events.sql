-- 0010_billing_events.sql
-- =============================================================================
-- EVERY STRIPE EVENT WE HAVE SEEN, so a replay is processed once.
--
-- Stripe retries a webhook until it gets a 2xx, and it can deliver the same event more than once
-- even after a success. Without this table, a retried checkout.session.completed would re-run the
-- subscription write; with it, the INSERT is the lock: the first delivery inserts the row and does
-- the work, and every later delivery hits the primary key, inserts nothing, and is acknowledged
-- without doing anything again.
--
-- The claim is made BEFORE the work, not after, so two concurrent deliveries of the same event
-- cannot both pass the check. A delivery that then fails marks the row 'failed' and returns a 5xx
-- so Stripe retries it; a 'failed' row is allowed to be retried (see the webhook function).
--
-- SAFE TO RUN ANYWHERE. Guarded throughout; re-running is a no-op.
-- NOT APPLIED BY THE AUTHOR — no staging project yet. Apply order: 0009 then 0010.
-- =============================================================================

create table if not exists public.billing_events (
  event_id      text        primary key,          -- Stripe's evt_..., the idempotency key
  provider      text        not null default 'stripe' check (provider in ('stripe')),
  type          text        not null,             -- e.g. checkout.session.completed
  status        text        not null default 'received'
                            check (status in ('received', 'processed', 'failed', 'ignored')),

  -- Enough to trace a payment without copying the event payload. Deliberately NOT the whole
  -- event: those carry customer email and card metadata, and this table has a longer life than
  -- the reason we would have kept them.
  customer_id       text,
  subscription_id   text,
  user_id           uuid references auth.users(id) on delete set null,

  received_at   timestamptz not null default now(),
  processed_at  timestamptz,
  error         text,
  attempts      integer     not null default 1
);

create index if not exists billing_events_type_idx     on public.billing_events (type);
create index if not exists billing_events_received_idx on public.billing_events (received_at desc);

alter table public.billing_events enable row level security;

-- NO POLICIES, deliberately. This is a server-side ledger; no client role has any business
-- reading it, and RLS with no policy denies every non-service role by default.

-- Data API grants (docs/ops/SUPABASE-GRANTS.md, branch supabase-grants). Supabase stops
-- auto-granting on 2026-10-30.
--
-- SERVICE ROLE ONLY, AND NO authenticated GRANT. The standard block in that doc grants
-- authenticated as well; this table is the documented exception and the reason is worth keeping:
-- an event log of who paid what and when is not something a signed-in client should be able to
-- select, and "the grant is harmless because RLS has no policy" stops being true the day someone
-- adds a permissive policy. Least privilege wins over uniformity here.
--
-- NOTE FOR REVIEW: tests/supabaseGrants.test.cjs on branch supabase-grants requires BOTH
-- authenticated and service_role on every new public table, so it will fail on this file when the
-- two branches meet. The fix belongs in that test, not here: it should accept a table that opts
-- out explicitly, keyed on the marker below rather than on a filename.
-- grants: service_role only
grant all privileges on table public.billing_events to service_role;
