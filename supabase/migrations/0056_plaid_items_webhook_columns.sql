-- ============================================================================
-- 0056: plaid_items, the columns the bank webhook and the bank sync write
-- ============================================================================
-- NOT RUN BY THE CHANGE THAT ADDED IT. Amanda runs migrations, in the Supabase SQL editor, staging first.
--
-- WHY. public.plaid_items was made by hand in the dashboard; supabase/migrations/00001_plaid_items.sql is a guess at
-- it, read off the app's own queries, and says so. Two columns the server has used for months were added to
-- production by hand and are made by no file here: transactions_pending (the "new transactions are waiting" flag,
-- plaid-webhook.js and plaid.js) and holdings_pending (plaid-webhook.js). So a database built from this repo, the
-- nightly test's among them, lacked both, and the webhook answered 500 there for every holdings update.
--
-- A read-only look at production on 2026-11-23 listed these columns:
--   id, user_id, item_id, access_token, institution_id, institution_name, cursor, status, created_at, updated_at,
--   transactions_pending, holdings_pending
-- That list does not show three columns the server also writes: next_cursor (the sync cursor, migration 0004),
-- last_error (the webhook, when a bank's sign-in runs out or is repaired) and new_accounts_available (the webhook).
-- If they really are missing there, those writes fail today. Whether or not they are, this file makes every column
-- the webhook and the sync write exist, and changes nothing where one is already there.
--
-- liabilities_pending is NOT added: production never had it, nothing reads it, and the webhook no longer writes it.
--
-- SAFE TO RUN ANYWHERE, AND TO RUN AGAIN. Every line is "add column if not exists": a column that is already there is
-- left exactly as it is, its type and its values included. Nothing is dropped, renamed, updated or deleted. The new
-- columns are either nullable or have a constant default, so no row is rewritten.
-- ============================================================================

alter table public.plaid_items
  add column if not exists transactions_pending   boolean not null default false,
  add column if not exists holdings_pending       boolean not null default false,
  add column if not exists new_accounts_available boolean not null default false,
  add column if not exists last_error             text,
  add column if not exists next_cursor            text;

-- The service role reads and writes this table (RLS on, no policies: docs/ops/SUPABASE-GRANTS.md). A column added
-- to a table carries the table's own grants, so there is nothing to grant here.

-- ── CHECK (read-only; run before AND after, and keep both answers) ─────────────────────────────────────────────
-- Before: shows exactly which of the five production lacks. After: all five are there.
--
-- select c.column_name, c.data_type, c.is_nullable, c.column_default
--   from information_schema.columns c
--  where c.table_schema = 'public' and c.table_name = 'plaid_items'
--  order by c.ordinal_position;
