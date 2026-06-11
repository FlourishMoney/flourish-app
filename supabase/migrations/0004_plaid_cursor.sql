-- ============================================================================
-- Flourish Money — Plaid /transactions/sync cursor persistence  (Sprint Z, #1 + #3)
-- ============================================================================
-- /transactions/sync is cursor-based and incremental: each call returns only the
-- changes (added / modified / removed) since the last cursor. Today the server
-- re-pulls from a null cursor every time and stops at a 10-page cap — which both
-- wastes calls and SILENTLY DROPS transactions for any item with >10 pages of
-- history. Persisting the per-item cursor lets each sync resume from where the
-- last one left off (incremental), and lets a truncated sync continue next time.
--
--   next_cursor = cursor returned by the LAST sync page committed for this item.
--     NULL  → never synced → the server does a full sync from the beginning.
--     set   → the next sync resumes incrementally from this point. On truncation
--             (page cap hit with more pages remaining) we persist the partial
--             cursor so the following sync continues exactly where it stopped.
--
-- Run in the Supabase SQL editor. Idempotent / safe to re-run.
-- ============================================================================

alter table public.plaid_items
  add column if not exists next_cursor text;
