-- 0055_plus_holdings_private.sql
-- -----------------------------------------------------------------------------
-- PLUS: EACH PERSON'S INVESTMENT HOLDINGS, KEPT PRIVATELY ON THE SERVER (2026-11-22). NOT APPLIED.
--
-- Round 2 of the Plus review (Gemini G-N1 with ChatGPT B1) asks for two things at once:
--   - private holdings must never be in the household's shared data, which both partners (and older apps) read;
--   - a person must never lose their holdings.
-- With Plus, holdings are private by default between partners (0045), so 1.1.8 keeps them out of the shared blob. Until
-- now their only lasting home was the person's own device, and the OLD shared copy from before Plus could be cleared
-- only once that device copy was saved. A device that can save nothing (storage blocked) therefore never cleared the
-- old shared copy, and a person whose bank could not be read on a new device had nothing to show.
--
-- This is the lasting private home: one row per bank, in the name of the person who linked it, holding that bank's
-- holdings as they last came from the bank. Only the server reads or writes it (netlify/functions/plaid.js
-- get_investments, service role):
--   - after a bank's holdings come, they are saved here, and the answer says stored: true. The app clears the old
--     shared copy of that bank's holdings on that word (or on its own device copy), never on a hope;
--   - when the bank cannot be read, the last saved list is answered instead (marked stale), to the same people and
--     through the same filter as a live answer: its owner sees all of it, a partner only the accounts shared with
--     them (0045 net_worth_shares, read each time), and nobody without Plus sees any of it.
-- A row goes when its bank is disconnected (the trigger below, whatever removes the plaid_items row) and when the
-- account is deleted (on delete cascade). Plus ending deletes nothing: the row is simply not read.
--
-- UNTIL THIS IS APPLIED: the server answers stored: false and never a stale list; everything else is as before, and
-- the device copy alone decides when the old shared copy is cleared. RUN THIS BEFORE PLUS IS SWITCHED ON.
-- Needs 00001 (plaid_items). Run in the Supabase SQL editor. Additive and safe to run twice.
-- -----------------------------------------------------------------------------

create table if not exists public.plus_holdings (
  user_id    uuid        not null references auth.users(id) on delete cascade,
  item_id    text        not null check (char_length(item_id) between 1 and 200),
  holdings   jsonb       not null check (jsonb_typeof(holdings) = 'array'),
  fetched_at timestamptz not null default now(),
  primary key (user_id, item_id)
);
alter table public.plus_holdings enable row level security;
-- No policy: the Data API roles reach nothing, as 0044, 0045 and 0052.
-- grants: service_role only
revoke all on table public.plus_holdings from anon, authenticated;
grant all privileges on table public.plus_holdings to service_role;

-- A bank that is disconnected takes its saved holdings with it, whichever path removes its row (the app's
-- disconnect, the household's, a duplicate being collapsed, a refused new bank, the account being deleted).
create or replace function public.plus_holdings_follow_item()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.plus_holdings where user_id = old.user_id and item_id = old.item_id;
  return old;
end;
$$;
revoke all on function public.plus_holdings_follow_item() from public, anon, authenticated;

drop trigger if exists plus_holdings_follow_item on public.plaid_items;
create trigger plus_holdings_follow_item
  after delete on public.plaid_items
  for each row execute function public.plus_holdings_follow_item();

-- ============================================================================
-- READ-ONLY CHECK (after running): the table exists with RLS on, the Data API roles reach it in no way, the trigger
-- is there, and it is empty.
--   select (select relrowsecurity from pg_class where oid = 'public.plus_holdings'::regclass),
--          has_table_privilege('authenticated', 'public.plus_holdings', 'select'),
--          has_table_privilege('anon', 'public.plus_holdings', 'insert'),
--          (select count(*) from pg_trigger where tgname = 'plus_holdings_follow_item' and not tgisinternal),
--          (select count(*) from public.plus_holdings);
-- Expected: true, false, false, 1, 0.
-- ============================================================================
-- ROLLBACK (only while PLUS_ENABLED is unset; nothing else depends on it):
-- drop trigger if exists plus_holdings_follow_item on public.plaid_items;
-- drop function if exists public.plus_holdings_follow_item();
-- drop table if exists public.plus_holdings;
-- ============================================================================
