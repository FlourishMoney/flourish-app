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
-- And a row can only be written for a bank that is connected (the second trigger below): a save that arrives after
-- the disconnect is refused, so nothing is ever left behind.
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

-- A LIST IS KEPT ONLY FOR A BANK THAT IS CONNECTED, in the name of the person who linked it (round 3 of the review,
-- NEW-1). The server reads a bank and then keeps its list; if the person disconnects that bank in between, the
-- trigger above has already removed the list, and the late save would put it back for ever. So every insert, and
-- every change of whose or which bank's a row is, first finds the bank's own row and holds it against deletion (FOR
-- KEY SHARE) until this write is committed:
--   the bank is gone (or was never this person's)   the write is refused, with the foreign-key code (23503)
--   a disconnect is under way                        this write waits for it, then is refused
--   this write is under way                          a disconnect waits for it, then takes the list with the bank
-- Whichever gets there first, a bank never ends with a list and no connection. FOR KEY SHARE holds up a DELETE of
-- the bank's row only: the webhook's and the sync's ordinary updates of it are not held up.
-- (It is a trigger and not a foreign key because production's plaid_items was made in the dashboard: its unique key
-- on (user_id, item_id) is inferred, not observed (00001), and a foreign key would need it to be exactly that.)
create or replace function public.plus_holdings_need_item()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform 1 from public.plaid_items where user_id = new.user_id and item_id = new.item_id for key share;
  if not found then
    raise exception 'plus_holdings: the bank is not connected' using errcode = '23503';
  end if;
  return new;
end;
$$;
revoke all on function public.plus_holdings_need_item() from public, anon, authenticated;

drop trigger if exists plus_holdings_need_item on public.plus_holdings;
create trigger plus_holdings_need_item
  before insert or update of user_id, item_id on public.plus_holdings
  for each row execute function public.plus_holdings_need_item();

-- ============================================================================
-- READ-ONLY CHECK (after running): the table exists with RLS on, the Data API roles reach it in no way, the trigger
-- is there, and it is empty.
--   select (select relrowsecurity from pg_class where oid = 'public.plus_holdings'::regclass),
--          has_table_privilege('authenticated', 'public.plus_holdings', 'select'),
--          has_table_privilege('anon', 'public.plus_holdings', 'insert'),
--          (select count(*) from pg_trigger where tgname in ('plus_holdings_follow_item', 'plus_holdings_need_item') and not tgisinternal),
--          (select count(*) from public.plus_holdings);
-- Expected: true, false, false, 2, 0.
-- ============================================================================
-- ROLLBACK (only while PLUS_ENABLED is unset; nothing else depends on it):
-- drop trigger if exists plus_holdings_follow_item on public.plaid_items;
-- drop function if exists public.plus_holdings_follow_item();
-- drop table if exists public.plus_holdings;   -- its own trigger goes with it
-- drop function if exists public.plus_holdings_need_item();
-- ============================================================================
