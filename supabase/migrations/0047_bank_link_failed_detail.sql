-- 0047_bank_link_failed_detail.sql
-- -----------------------------------------------------------------------------
-- A FAILED BANK LINK SAYS WHERE AND WHY (2026-11-11). NOT APPLIED.
--
-- public.onboarding_counts (0028) keeps bank_link_failed with an empty detail. From this migration a failed link
-- may also be counted as "<platform>:<code>": the platform (ios, android or web) and Plaid's error code (for
-- example INVALID_CREDENTIALS, ITEM_LOCKED, INSTITUTION_NOT_RESPONDING), or ours (EXCHANGE_FAILED, PLAN_LIMIT),
-- or OTHER. The codes come from a fixed list in netlify/functions/_lib/onboardingCounts.js (LINK_FAIL_CODES); the
-- check below accepts only that shape. Still no account id, no address, no IP, no Plaid message and no free text:
-- a row is a day, an event, a detail and a number.
--
-- UNTIL THIS IS APPLIED the database refuses that detail (23514) and activation.js counts the failure with an empty
-- detail, exactly as before. Rows already counted are not touched.
--
-- Read them (count-only):
--   select cohort_day, detail, count from public.onboarding_counts where event = 'bank_link_failed' order by 1, 2;
--
-- Needs 0028. Safe to run twice.
-- grants: unchanged (service_role only)
-- -----------------------------------------------------------------------------

alter table public.onboarding_counts drop constraint if exists onboarding_counts_known;
alter table public.onboarding_counts add constraint onboarding_counts_known check (
     (event = 'onboarding_step_completed' and detail in ('welcome', 'bank', 'balance', 'income', 'bills', 'debts'))
  or (event = 'first_number_shown' and detail ~ '^(manual|linked):(signup|signin):(under_60|60_120|120_180|over_180)$')
  or (event in ('bank_link_started', 'bank_link_completed', 'bank_link_failed', 'bank_link_cancelled') and detail = '')
  or (event = 'bank_link_failed' and detail ~ '^(ios|android|web):[A-Z_]{2,48}$')
);
