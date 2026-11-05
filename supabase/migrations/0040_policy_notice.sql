-- 0040_policy_notice.sql
-- -----------------------------------------------------------------------------
-- THE PRIVACY POLICY NOTICE: ONE EMAIL PER ACCOUNT, EVER (2026-11-05). NOT APPLIED.
--
-- Section 9 of the policy promises notice of a material change. On launch day netlify/functions/policy-notice-sweep.js emails
-- every account that existed when the newsletter_launch row (0037) was added.
--
-- THE GUARD. An account is claimed here BEFORE its email is sent, and the primary key allows one claim per notice per account. A
-- send that fails or is cut off keeps its row, so it is never sent again on its own: it stays visible for a person to decide.
-- Sends nothing by itself, and nothing runs until POLICY_NOTICE_SEND is set.
--
-- THE OPT-OUT LIST. The notice says "Reply to this email to stop getting privacy-policy notices by email." Replies reach
-- hello@flourishmoney.app. Add whoever asks, by hand, in the SQL editor (it adds nothing if the address has no account, and is safe
-- to run twice):
--   insert into public.policy_notice_opt_outs (user_id)
--   select id from auth.users where lower(email) = lower('person@example.ca')
--   on conflict do nothing;
-- The send skips an account on the list, for this notice and any later one. The row goes when the account does.
--
-- Needs 0037. Run in the Supabase SQL editor. Additive and safe to run twice.
-- -----------------------------------------------------------------------------

create table if not exists public.policy_notice_sends (
  notice      text        not null,
  user_id     uuid        not null references auth.users(id) on delete cascade,
  status      text        not null default 'claimed' check (status in ('claimed','sent','failed','skipped_sample')),
  claimed_at  timestamptz not null default now(),
  finished_at timestamptz,
  primary key (notice, user_id)
);
alter table public.policy_notice_sends enable row level security;
-- grants: service_role only
grant all privileges on table public.policy_notice_sends to service_role;
revoke all on table public.policy_notice_sends from anon, authenticated;

create table if not exists public.policy_notice_opt_outs (
  user_id    uuid        primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.policy_notice_opt_outs enable row level security;
-- grants: service_role only
grant all privileges on table public.policy_notice_opt_outs to service_role;
revoke all on table public.policy_notice_opt_outs from anon, authenticated;

-- The accounts still owed this notice: created before the launch row, with an address, and never claimed. opted_out says who is on
-- the list above: the send leaves them out, and the dry run counts them.
create or replace function public.policy_notice_pending(p_notice text, p_before timestamptz, p_limit integer)
returns table (user_id uuid, email text, confirmed boolean, opted_out boolean)
language sql
stable
security definer
set search_path = public
as $$
  select u.id, u.email::text, u.email_confirmed_at is not null,
         exists (select 1 from public.policy_notice_opt_outs o where o.user_id = u.id)
  from auth.users u
  where u.email is not null and u.created_at < p_before
    and not exists (select 1 from public.policy_notice_sends s where s.notice = p_notice and s.user_id = u.id)
  order by u.created_at, u.id
  limit p_limit;
$$;

-- True only for the one call that takes this account for this notice.
create or replace function public.policy_notice_claim(p_notice text, p_user_id uuid, p_status text default 'claimed')
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.policy_notice_sends (notice, user_id, status) values (p_notice, p_user_id, p_status)
  on conflict (notice, user_id) do nothing;
  return found;
end; $$;

revoke all on function public.policy_notice_pending(text, timestamptz, integer) from public, anon, authenticated;
grant execute on function public.policy_notice_pending(text, timestamptz, integer) to service_role;
revoke all on function public.policy_notice_claim(text, uuid, text) from public, anon, authenticated;
grant execute on function public.policy_notice_claim(text, uuid, text) to service_role;

-- -----------------------------------------------------------------------------
-- READ-ONLY CHECK, after the send: one line per status.
--   select status, count(*) from public.policy_notice_sends where notice = 'privacy-newsletter-launch' group by status;
--
-- ROLLBACK (this also forgets who was emailed, so never after a send has started)
-- -----------------------------------------------------------------------------
-- drop function if exists public.policy_notice_claim(text, uuid, text);
-- drop function if exists public.policy_notice_pending(text, timestamptz, integer);
-- drop table if exists public.policy_notice_sends;
-- drop table if exists public.policy_notice_opt_outs;
