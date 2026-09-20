-- ============================================================================
-- Flourish Money - waitlist welcome email: welcomed_at
-- ============================================================================
-- Run in the Supabase SQL editor (Dashboard > SQL > New query > Run).
-- ADDITIVE ONLY. Idempotent, safe to re-run. No data is written or changed.
--
-- What it is for: netlify/functions/beta.js (action join_waitlist) sends one
-- confirmation email after a successful insert, then stamps welcomed_at on that
-- row. A NULL welcomed_at means no confirmation email was recorded for the row:
-- rows that predate this change, rows created while RESEND_API_KEY was unset,
-- and rows whose send failed. Nothing reads the column yet.
--
-- NOTE: public.waitlist itself was created directly in Supabase and has no
-- migration in this repo, so this file is the first one that touches it.
-- ============================================================================

alter table public.waitlist
  add column if not exists welcomed_at timestamptz;

-- ============================================================================
-- ROLLBACK (run only to undo the migration; drops the column and its values)
-- ============================================================================
-- alter table public.waitlist
--   drop column if exists welcomed_at;

-- ============================================================================
-- CHECK (counts only, no rows or addresses returned)
-- ============================================================================
-- Column present? Expect 1 after the migration, 0 before it.
-- select count(*) as welcomed_at_column_present
--   from information_schema.columns
--  where table_schema = 'public'
--    and table_name   = 'waitlist'
--    and column_name  = 'welcomed_at';
--
-- Row counts. Expect welcomed = 0 immediately after the migration.
-- select count(*)                        as rows_total,
--        count(welcomed_at)              as welcomed,
--        count(*) - count(welcomed_at)   as not_welcomed
--   from public.waitlist;
