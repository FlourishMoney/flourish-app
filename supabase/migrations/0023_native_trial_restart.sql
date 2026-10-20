-- ============================================================================
-- Flourish Money - existing store app accounts start a 14-day trial today
-- ============================================================================
-- Founder's decision, 2026-10-20: the iOS and Android apps follow the web's
-- rules (the 14-day trial, then the free plan's limits). Until then a store
-- app opened every feature to every user for good, so an account whose trial
-- ended long ago still had Credit and the coach-run meeting in the app. So
-- that nobody loses those without notice, every existing store app account
-- with no paid plan starts a fresh 14-day trial from the moment this runs.
--
-- WHICH ACCOUNTS ARE "STORE APP ACCOUNTS". Nothing in the schema records where
-- an account signs in, so this reads the two traces the apps leave:
--   1. auth.sessions.user_agent: Supabase records the browser string of every
--      sign-in. The apps sign in from their own web view, whose string is
--      distinctive: Android's carries "; wv)", and iOS's (WKWebView) carries
--      AppleWebKit with no "Safari/" (Safari, Chrome and Firefox on iPhone all
--      say "Safari/"). capacitor.config.json sets no custom user agent.
--   2. public.feedback.platform 'ios' or 'android' (0013), if that table exists.
-- What this can miss: someone who used an app and then signed out of it (the
-- session row goes on sign out) and never left feedback from it.
-- What it can over-include, harmlessly: someone who signed in on the web from
-- an iPhone home screen icon or another app's built-in browser, which also
-- carry no "Safari/". They get the same fresh 14 days.
--
-- WHO CHANGES, all of: an app trace above; founder_flag false; plan 'free' or
-- 'trial' (never plus or pro); no paid subscription (active or trialing, period
-- not over), if public.subscriptions exists; a trial that ends within the next
-- 14 days or has ended; created before 2026-10-19 (newer accounts already have
-- a full trial of their own). The change: plan 'trial', trial_started_at now(),
-- trial_ends_at now() + 14 days. Nothing else on the row moves.
--
-- SAFE TO RE-RUN. Every changed row is first copied, with its old values, into
-- public.native_trial_restart_2026_10, and a row already there is never changed
-- again, so a second run changes nothing. The copy is also the rollback below.
--
-- THE PROFILE GUARD (0002, 0005, 0007) lets only the service role change plan
-- or the trial dates, and the SQL editor is not the service role. As in 0007's
-- extension block, one setting local to this transaction makes it so. Run the
-- whole file in one go; it is a single transaction.
--
-- RUN THE DRY RUN AT THE BOTTOM FIRST. It changes nothing and gives the counts.
-- ============================================================================

begin;

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
-- 14 days must be 14 x 24 hours, the server's own rule (_lib/planRules.js TRIAL_MS). Supabase runs in
-- UTC, where it is; pinned here so a session in a zone that changes its clocks (Nov 1) cannot add an hour.
set local timezone = 'UTC';

create table if not exists public.native_trial_restart_2026_10 (
  user_id              uuid        primary key references auth.users(id) on delete cascade,
  old_plan             text        not null,
  old_trial_started_at timestamptz,
  old_trial_ends_at    timestamptz,
  evidence             text        not null check (evidence in ('app_session', 'app_feedback')),
  restarted_at         timestamptz not null default now()
);
-- Service role only: it lists accounts, and nobody signed in should read it.
alter table public.native_trial_restart_2026_10 enable row level security;
-- grants: service_role only
grant all privileges on table public.native_trial_restart_2026_10 to service_role;
revoke all on table public.native_trial_restart_2026_10 from anon, authenticated;

do $$
declare
  has_feedback boolean := to_regclass('public.feedback') is not null
    and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'feedback' and column_name = 'platform');
  has_subs boolean := to_regclass('public.subscriptions') is not null;
  n integer;
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'auth' and table_name = 'sessions' and column_name = 'user_agent') then
    raise exception 'auth.sessions.user_agent does not exist, so store app accounts cannot be found. Nothing was changed.';
  end if;

  execute format($q$
    with app_accounts as (
      select s.user_id, 'app_session'::text as evidence
        from auth.sessions s
       where s.user_agent like '%%; wv)%%'
          or (s.user_agent like '%%AppleWebKit%%' and s.user_agent not like '%%Safari/%%'
              and (s.user_agent like '%%iPhone%%' or s.user_agent like '%%iPad%%' or s.user_agent like '%%Macintosh%%'))
      %s
    ),
    eligible as (
      select distinct on (p.user_id) p.user_id, p.plan, p.trial_started_at, p.trial_ends_at, a.evidence
        from public.profiles p
        join app_accounts a on a.user_id = p.user_id
        join auth.users u on u.id = p.user_id
       where p.founder_flag = false
         and p.plan in ('free', 'trial')
         and u.created_at < timestamptz '2026-10-19 00:00:00+00'
         and coalesce(p.trial_ends_at, p.trial_started_at + interval '14 days', '-infinity'::timestamptz) < now() + interval '14 days'
         and not exists (select 1 from public.native_trial_restart_2026_10 r where r.user_id = p.user_id)
         %s
       order by p.user_id, a.evidence desc
    ),
    saved as (
      insert into public.native_trial_restart_2026_10 (user_id, old_plan, old_trial_started_at, old_trial_ends_at, evidence)
      select user_id, plan, trial_started_at, trial_ends_at, evidence from eligible
      returning user_id
    )
    update public.profiles p
       set plan = 'trial', trial_started_at = now(), trial_ends_at = now() + interval '14 days'
      from saved
     where saved.user_id = p.user_id
  $q$,
    case when has_feedback then
      $f$union select f.user_id, 'app_feedback' from public.feedback f where f.platform in ('ios', 'android')$f$
    else '' end,
    case when has_subs then
      $s$and not exists (select 1 from public.subscriptions s where s.user_id = p.user_id
                          and s.status in ('active', 'trialing')
                          and (s.current_period_end is null or s.current_period_end > now()))$s$
    else '' end);
  get diagnostics n = row_count;
  raise notice 'native trial restart: % accounts start 14 days from now (feedback read: %, subscriptions read: %)', n, has_feedback, has_subs;
end $$;

commit;

-- ============================================================================
-- DRY RUN (run first; changes nothing; counts only, no user_id, no email)
-- ============================================================================
-- with app as (
--   select distinct user_id from auth.sessions
--    where user_agent like '%; wv)%'
--       or (user_agent like '%AppleWebKit%' and user_agent not like '%Safari/%'
--           and (user_agent like '%iPhone%' or user_agent like '%iPad%' or user_agent like '%Macintosh%'))
-- ), unpaid as (
--   select p.* from public.profiles p join auth.users u on u.id = p.user_id
--    where p.founder_flag = false and p.plan in ('free', 'trial') and u.created_at < timestamptz '2026-10-19 00:00:00+00'
--      and coalesce(p.trial_ends_at, p.trial_started_at + interval '14 days', '-infinity'::timestamptz) < now() + interval '14 days'
-- )
-- select (select count(*) from app)                                          as accounts_seen_in_an_app,
--        (select count(*) from unpaid where user_id in (select user_id from app)) as restart_by_session,
--        (select count(*) from unpaid)                                       as every_unpaid_account_whose_trial_ends_soon;
-- (restart_by_session leaves out feedback-only accounts and paying households; the migration's own notice gives the exact number.)

-- ============================================================================
-- VERIFICATION (after; counts only)
-- ============================================================================
-- select count(*)                                                   as restarted,
--        count(*) filter (where r.evidence = 'app_feedback')        as found_by_feedback_only,
--        min(p.trial_ends_at)                                       as earliest_new_end,
--        count(*) filter (where p.plan <> 'trial' or p.founder_flag) as changed_since   -- expect 0 right after
--   from public.native_trial_restart_2026_10 r join public.profiles p using (user_id);

-- ============================================================================
-- ROLLBACK (puts back each restarted row's plan and trial dates, then drops the copy)
-- ============================================================================
-- A row that has since become a founder or moved off 'trial' is left alone.
--
-- begin;
-- select set_config('request.jwt.claims', '{"role":"service_role"}', true);
-- update public.profiles p
--    set plan = r.old_plan, trial_started_at = r.old_trial_started_at, trial_ends_at = r.old_trial_ends_at
--   from public.native_trial_restart_2026_10 r
--  where r.user_id = p.user_id and p.plan = 'trial' and p.founder_flag = false;
-- drop table public.native_trial_restart_2026_10;
-- commit;
