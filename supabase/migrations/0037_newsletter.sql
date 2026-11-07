-- 0037_newsletter.sql
-- -----------------------------------------------------------------------------
-- "CANADIAN MONEY DATES THIS WEEK": THE OPT-IN LIST (CASL, 2026-11-04). NOT APPLIED.
--
-- A list of its own. Nothing here reads or copies public.waitlist, and no existing row is added.
-- Each row keeps the proof of consent: the exact wording shown, its version, when, from which page or screen, and the
-- browser family (never an IP or a full user agent). Someone is on the list only when confirmed_at is set and
-- unsubscribed_at is empty.
--
-- WHAT THE APPROVED PRIVACY WORDS PROMISE (2026-11-05). The address is kept until the person unsubscribes: then it is cleared,
-- and only email_key (a keyed hash) stays with the consent record, so a later question can still be answered. The record goes
-- three years after the unsubscribe (netlify/functions/newsletter-retention.js).
--
-- GOING LIVE IS ONE MORE STEP. Running this file opens nothing. The forms, and the privacy policy's newsletter words with their
-- new "Last updated" date, all turn on when this one row is added, on the day (the date is what the policy shows):
--   insert into public.newsletter_launch (live_on) values ('2026-11-12');
--
-- Run in the Supabase SQL editor. Additive and safe to run twice.
-- -----------------------------------------------------------------------------

create table if not exists public.newsletter_subscribers (
  id              uuid        primary key default gen_random_uuid(),
  email           text        check (email = lower(email)),
  email_key       text        not null,
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
create unique index if not exists newsletter_subscribers_email_key on public.newsletter_subscribers (email_key);
alter table public.newsletter_subscribers enable row level security;
-- grants: service_role only
grant all privileges on table public.newsletter_subscribers to service_role;
revoke all on table public.newsletter_subscribers from anon, authenticated;

create table if not exists public.newsletter_launch (
  only_row   boolean     primary key default true check (only_row),
  live_on    date        not null,
  created_at timestamptz not null default now()
);
alter table public.newsletter_launch enable row level security;
-- grants: service_role only
grant all privileges on table public.newsletter_launch to service_role;
revoke all on table public.newsletter_launch from anon, authenticated;

-- -----------------------------------------------------------------------------
-- ROLLBACK (this deletes the list and its proof of consent)
-- -----------------------------------------------------------------------------
-- drop table if exists public.newsletter_launch;
-- drop table if exists public.newsletter_subscribers;
