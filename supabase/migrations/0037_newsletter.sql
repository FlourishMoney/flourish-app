-- 0037_newsletter.sql
-- -----------------------------------------------------------------------------
-- "CANADIAN MONEY DATES THIS WEEK": THE OPT-IN LIST (CASL, 2026-11-04). NOT APPLIED.
--
-- A list of its own. Nothing here reads or copies public.waitlist, and no existing row is added.
-- Each row keeps the proof of consent: the exact wording shown, its version, when, from which page or screen, and the
-- browser family (never an IP or a full user agent). Someone is on the list only when confirmed_at is set and
-- unsubscribed_at is empty. Forms stay hidden until this table exists (netlify/functions/newsletter.js).
--
-- Run in the Supabase SQL editor. Additive and safe to run twice.
-- -----------------------------------------------------------------------------

create table if not exists public.newsletter_subscribers (
  id              uuid        primary key default gen_random_uuid(),
  email           text        not null check (email = lower(email)),
  consent         boolean     not null check (consent = true),
  consent_version text        not null,
  consent_wording text        not null,
  consented_at    timestamptz not null default now(),
  source          text        not null check (source in ('site_newsletter','app_settings_ios','app_settings_android','app_settings_web')),
  ua_family       text        not null check (ua_family in ('safari','chrome','firefox','edge','samsung','flourish_app','other')),
  confirm_sent_at timestamptz,
  confirmed_at    timestamptz,
  unsubscribed_at timestamptz,
  created_at      timestamptz not null default now()
);
create unique index if not exists newsletter_subscribers_email_key on public.newsletter_subscribers (email);
alter table public.newsletter_subscribers enable row level security;
-- grants: service_role only
grant all privileges on table public.newsletter_subscribers to service_role;
revoke all on table public.newsletter_subscribers from anon, authenticated;

-- -----------------------------------------------------------------------------
-- ROLLBACK (this deletes the list and its proof of consent)
-- -----------------------------------------------------------------------------
-- drop table if exists public.newsletter_subscribers;
