-- 0049_legal_consent_apple_tokens.sql
-- -----------------------------------------------------------------------------
-- TWO RECORDS KEPT AGAINST AN ACCOUNT (1.1.7, 2026-11-12). NOT APPLIED.
--
-- legal_consents  The consent step at the start of onboarding ("Before you start"): which words were shown, the date of
--                 the Terms and of the Privacy Policy the person could open from that step, when they tapped Get started
--                 and when the server wrote it down. One row per account per consent; a retried send changes nothing.
--                 Written by netlify/functions/beta.js record_consent.
--
-- apple_tokens    Sign in with Apple's refresh token, so that deleting the account can revoke it at Apple (App Store
--                 guideline 5.1.1(v)). Stored ENCRYPTED (AES-256-GCM, key APPLE_TOKEN_ENC_KEY, held only in Netlify);
--                 the database never sees the token itself. One row per account per Apple client ("ios" is the iPhone
--                 app, client app.flourishmoney; "web" is the website and the Android app, client app.flourishmoney.web).
--                 Written by beta.js apple_grant, read and revoked by plaid.js delete_account.
--
-- Both go with the account (on delete cascade). Only our server reads or writes them: row level security on, no policy,
-- nothing granted to anon or authenticated.
--
-- Until this runs: Get started still works (the app keeps the consent and sends it again later), sign-in is unchanged,
-- and an account deletion still deletes (the revoke is skipped and logged as no_token).
--
-- Safe to run twice.
-- grants: service_role only
-- -----------------------------------------------------------------------------

create table if not exists public.legal_consents (
  user_id         uuid        not null references auth.users (id) on delete cascade,
  consent_id      text        not null check (consent_id ~ '^[a-z0-9-]{1,80}$'),
  words           jsonb       not null,
  terms_version   date        not null,
  privacy_version date        not null,
  shown_at        timestamptz not null,
  recorded_at     timestamptz not null default now(),
  platform        text        not null check (platform in ('web', 'ios', 'android')),
  primary key (user_id, consent_id)
);

alter table public.legal_consents enable row level security;
revoke all on table public.legal_consents from anon, authenticated;
grant select, insert, update, delete on table public.legal_consents to service_role;

create table if not exists public.apple_tokens (
  user_id    uuid        not null references auth.users (id) on delete cascade,
  client     text        not null check (client in ('ios', 'web')),
  sealed     text        not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, client)
);

alter table public.apple_tokens enable row level security;
revoke all on table public.apple_tokens from anon, authenticated;
grant select, insert, update, delete on table public.apple_tokens to service_role;
