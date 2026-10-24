// tests/noFreePlanGrace.sql.test.cjs
// -----------------------------------------------------------------------------
// MIGRATION 0029 (no free plan, 2026-10-23), IN A REAL POSTGRES, ON TOP OF EVERY MIGRATION BEFORE IT.
//
// Accounts already past their trial when "no free plan" goes live get every feature for 30 days from go-live, then the
// paywall. 0029 stores that end date per account, server-side (profiles.grace_ends_at). Here, in a throwaway Postgres
// on the same Supabase stand-in as storeMigrations.sql.test.cjs:
//   1  who gets the 30 days: past the trial, no paid plan, not a founder; a lapsed subscription is in; a live trial,
//      a founder, a paid profile and a paying household are not; the end is go-live + 30 days exactly
//   2  the footer's dry run gives the same count, and its check afterwards reads as stated
//   3  a second run, days later, gives nobody new days and moves no end date
//   4  a signed-in browser cannot write the column (the profile guard), and still cannot write the older ones
//   5  the server's rule reads the end date it wrote (_lib/planRules.js): every feature until it, then no plan
//   6  the footer's rollback empties every end date and drops the go-live record
// Postgres comes from FOUNDING_PG_BIN, Homebrew (postgresql@17) or GitHub's Ubuntu runner (/usr/lib/postgresql).
// -----------------------------------------------------------------------------
"use strict";
const { tempDir } = require("./_tmp.cjs");
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");
const net = require("net");
const { execFileSync } = require("child_process");

const MIGRATIONS = path.join(__dirname, "..", "supabase", "migrations");
const M29 = path.join(MIGRATIONS, "0029_no_free_plan_grace.sql");
const S29 = fs.readFileSync(M29, "utf8");
const R = require("../netlify/functions/_lib/planRules.js");
const STUB = `
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key default gen_random_uuid(), email text, email_confirmed_at timestamptz,
  raw_app_meta_data jsonb not null default '{}'::jsonb, raw_user_meta_data jsonb not null default '{}'::jsonb, created_at timestamptz not null default now());
create table if not exists auth.sessions (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(), user_agent text);
create or replace function auth.uid() returns uuid language sql stable as $f$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $f$;
create or replace function auth.role() returns text language sql stable as $f$ select coalesce(current_setting('request.jwt.claim.role', true), 'anon') $f$;
create or replace function auth.jwt() returns jsonb language sql stable as $f$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $f$;
create schema if not exists extensions;
create extension if not exists pgcrypto schema extensions;
grant usage on schema public, auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
`;
// A footer block: the "--   " lines after a heading, up to the first blank comment line or "Expected".
const footer = (src, heading) => src.slice(src.indexOf(heading) + heading.length).split("\n").slice(1)
  .reduce((acc, l) => (acc.done || !l.startsWith("--   ") ? { ...acc, done: acc.lines.length > 0 || acc.done } : { ...acc, lines: [...acc.lines, l.slice(5)] }), { lines: [], done: false }).lines.join("\n");

function pgBin() {
  const c = [process.env.FOUNDING_PG_BIN, "/opt/homebrew/opt/postgresql@17/bin", "/usr/local/opt/postgresql@17/bin"];
  try { for (const v of fs.readdirSync("/usr/lib/postgresql").sort().reverse()) c.push(`/usr/lib/postgresql/${v}/bin`); } catch {}
  return c.find((d) => d && ["initdb", "pg_ctl", "psql"].every((b) => fs.existsSync(path.join(d, b)))) || null;
}
const freePort = () => new Promise((ok) => { const s = net.createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => ok(p)); }); });

// The dry run is a comment block of "-- " lines under its heading's closing "-- ===" line, ending at the first blank line.
const dryRun = (src) => { const lines = src.slice(src.indexOf("-- DRY RUN")).split("\n"); return lines.slice(lines.findIndex((l) => /^-- =+$/.test(l)) + 1); };
const dryRunSql = (src) => dryRun(src)
  .reduce((acc, l) => (acc.done || !l.startsWith("-- ") ? { ...acc, done: acc.lines.length > 0 || acc.done } : { ...acc, lines: [...acc.lines, l.slice(3)] }), { lines: [], done: false }).lines.join("\n");

(async () => {
  const t = create();
  const bin = pgBin();
  if (!bin) { t.ok(false, "0 a Postgres to run the migration in"); t.summary("NO FREE PLAN GRACE (sql)"); return; }
  const env = { ...process.env, LC_ALL: "C", LANG: "C" };
  const dir = tempDir("pg");
  const port = await freePort();
  const psql = (args) => execFileSync(path.join(bin, "psql"), ["-h", dir, "-p", String(port), "-U", "postgres", "-d", "t", "-v", "ON_ERROR_STOP=1", "-qAtX", ...args], { env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const sql = (q) => psql(["-c", q]);
  const file = (f) => psql(["-f", f]);
  const refused = (q) => { try { sql(q); return ""; } catch (e) { return String(e.stderr || e.message); } };
  const write = (name, body) => { const f = path.join(dir, name); fs.writeFileSync(f, body); return f; };
  let started = false;
  try {
    execFileSync(path.join(bin, "initdb"), ["-D", path.join(dir, "data"), "-U", "postgres", "-A", "trust"], { env, stdio: "ignore" });
    execFileSync(path.join(bin, "pg_ctl"), ["-D", path.join(dir, "data"), "-o", `-p ${port} -k ${dir} -c listen_addresses=''`, "-l", path.join(dir, "log"), "-w", "start"], { env, stdio: "ignore" });
    started = true;
    execFileSync(path.join(bin, "psql"), ["-h", dir, "-p", String(port), "-U", "postgres", "-d", "postgres", "-qAtX", "-c", "create database t"], { env, stdio: "ignore" });
    file(write("stub.sql", STUB));
    const before = fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql") && f < "0029").sort();
    const failed = [];
    for (const f of before) { try { file(path.join(MIGRATIONS, f)); } catch (e) { failed.push(`${f}: ${String(e.stderr || e.message).split("\n").find((l) => /ERROR/.test(l)) || ""}`); } }
    t.eq(failed, [], "0a every migration before 0029 applies in order");

    // Households, as production has them. The trigger handle_new_user gives each a profiles row; each is then set.
    const users = {};
    for (const k of ["ended", "never", "lapsed", "trial", "founder", "plus", "paying", "store", "ended2"]) users[k] = sql(`insert into auth.users (email) values ('${k}@example.test') returning id`);
    const set = (k, cols) => sql(`select set_config('request.jwt.claims', '{"role":"service_role"}', false); update public.profiles set ${cols} where user_id = '${users[k]}'`);
    sql(`select set_config('request.jwt.claims', '{"role":"service_role"}', false); insert into public.profiles (user_id) select id from auth.users on conflict (user_id) do nothing`);
    set("ended",   "plan = 'trial', trial_started_at = now() - interval '40 days', trial_ends_at = now() - interval '26 days', founder_flag = false");
    set("never",   "plan = 'free', trial_started_at = null, trial_ends_at = null, founder_flag = false");
    set("lapsed",  "plan = 'trial', trial_started_at = now() - interval '90 days', trial_ends_at = now() - interval '76 days', founder_flag = false");
    set("trial",   "plan = 'trial', trial_started_at = now() - interval '3 days', trial_ends_at = now() + interval '11 days', founder_flag = false");
    set("founder", "plan = 'free', trial_started_at = null, trial_ends_at = null, founder_flag = true");
    set("plus",    "plan = 'plus', trial_started_at = now() - interval '90 days', trial_ends_at = now() - interval '76 days', founder_flag = false");
    set("paying",  "plan = 'trial', trial_started_at = now() - interval '40 days', trial_ends_at = now() - interval '26 days', founder_flag = false");
    set("store",   "plan = 'trial', trial_started_at = now() - interval '40 days', trial_ends_at = now() - interval '26 days', founder_flag = false");
    set("ended2",  "plan = 'trial', trial_started_at = null, trial_ends_at = now() - interval '1 day', founder_flag = false");
    sql(`insert into public.subscriptions (user_id, provider, status, current_period_end) values ('${users.lapsed}', 'stripe', 'canceled', now() - interval '10 days')`);
    sql(`insert into public.subscriptions (user_id, provider, status, current_period_end) values ('${users.paying}', 'stripe', 'active', now() + interval '20 days')`);
    sql(`insert into public.subscriptions (user_id, provider, status, current_period_end) values ('${users.store}', 'app_store', 'active', now() + interval '20 days')`);

    // ── 2 (first half). The dry run, before ───────────────────────────────────────────────────────
    const dry = write("dry.sql", dryRunSql(S29));
    t.ok(/select count\(\*\) as get_30_days/.test(fs.readFileSync(dry, "utf8")), "2a (the dry run is read out of the file's own footer)");
    t.eq(file(dry), "4", "2b the dry run counts the accounts past their trial with no paid plan: 4");

    // ── 1. Who gets the 30 days ──────────────────────────────────────────────────────────────────
    file(M29);
    const live = sql("select go_live_at from public.no_free_plan_go_live");
    const ends = (k) => sql(`select coalesce(to_char(grace_ends_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS.US'), '-') from public.profiles where user_id = '${users[k]}'`);
    // 30 x 24 hours (the server's own rule), so the arithmetic is UTC's: in Toronto, Nov 1 would add an hour.
    const want = sql(`set timezone = 'UTC'; select to_char((timestamptz '${live}' + interval '30 days') at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS.US')`).split("\n").pop();
    t.eq((Date.parse(want + "Z") - Date.parse(new Date(sql(`select extract(epoch from timestamptz '${live}')`) * 1000).toISOString())) / 3600000 | 0, 720, "1 (the end is go-live + 720 hours)");
    for (const k of ["ended", "never", "lapsed", "ended2"]) t.eq(ends(k), want, `1a ${k}: past the trial, no paid plan: 30 days from go-live, exactly`);
    for (const k of ["trial", "founder", "plus", "paying", "store"]) t.eq(ends(k), "-", `1b ${k}: no end date (a live trial, a founder, a paid profile, a paying household)`);
    t.eq(sql("select count(*) from public.profiles where grace_ends_at is not null"), "4", "1c four accounts, and only those");

    // ── 2 (second half). The check afterwards ──────────────────────────────────────────────────────
    const check = write("check.sql", footer(S29, "-- CHECK AFTERWARDS (read-only; counts only):"));
    t.eq(file(check), "4|0", "2c the check afterwards reads the dry run's count, then 0");
    t.ok(/Expected: the dry run's count, then 0/.test(S29), "2d …which is what the footer says to expect");

    // ── 3. A second run, days later ────────────────────────────────────────────────────────────────
    set("trial", "trial_ends_at = now() - interval '1 day'");          // a trial that ended AFTER go-live
    sql(`select set_config('request.jwt.claims', '{"role":"service_role"}', false); update public.no_free_plan_go_live set go_live_at = go_live_at - interval '3 days'`);
    const live2 = sql("select go_live_at from public.no_free_plan_go_live");
    const before3 = ["ended", "never", "lapsed", "ended2"].map(ends);
    file(M29);
    t.eq(sql("select go_live_at from public.no_free_plan_go_live"), live2, "3a a second run keeps the go-live recorded on the first");
    t.eq(["ended", "never", "lapsed", "ended2"].map(ends), before3, "3b …moves no end date");
    t.eq(ends("trial"), "-", "3c …and gives nobody new days: a trial that ends after go-live goes to the paywall");

    // ── 4. The guard ──────────────────────────────────────────────────────────────────────────────
    const asUser = (k, q) => refused(`set role authenticated; select set_config('request.jwt.claims', '{"role":"authenticated","sub":"${users[k]}"}', false); select set_config('request.jwt.claim.sub', '${users[k]}', false); ${q}`);
    t.ok(/server-managed/.test(asUser("ended", `update public.profiles set grace_ends_at = now() + interval '5 years' where user_id = '${users.ended}'`)), "4a a signed-in browser cannot give itself more days");
    t.ok(/server-managed/.test(asUser("ended", `update public.profiles set grace_ends_at = null where user_id = '${users.ended}'`)), "4b …or clear them");
    t.ok(/server-managed/.test(asUser("ended", `update public.profiles set plan = 'plus' where user_id = '${users.ended}'`)) && /server-managed/.test(asUser("ended", `update public.profiles set trial_ends_at = now() + interval '1 year' where user_id = '${users.ended}'`)),
      "4c …and the older guarded columns are still guarded");
    t.eq(ends("ended"), want, "4d (nothing changed)");
    t.ok(/permission denied/.test(asUser("ended", "select * from public.no_free_plan_go_live")), "4e the go-live record is the service role's only");

    // ── 5. The server's rule reads it ──────────────────────────────────────────────────────────────
    const row = JSON.parse(sql(`select row_to_json(p) from (select plan, trial_started_at, trial_ends_at, founder_flag, grace_ends_at from public.profiles where user_id = '${users.ended}') p`));
    const end = Date.parse(row.grace_ends_at);
    t.eq([R.derivePlan(row, end - 60000), R.isUnlimitedProfile(row, end - 60000)], ["grace", true], "5a every feature until the end date");
    t.eq([R.derivePlan(row, end + 60000), R.isUnlimitedProfile(row, end + 60000)], ["free", false], "5b …then no plan");

    // ── 6. The rollback ────────────────────────────────────────────────────────────────────────────
    const back = write("back.sql", footer(S29, "-- ROLLBACK (empties every end date, then drops the go-live record; the guard\n-- keeps its extra line, which is harmless while the column is empty):"));
    t.ok(/update public\.profiles set grace_ends_at = null/.test(fs.readFileSync(back, "utf8")), "6a (the rollback is read out of the file's own footer)");
    file(back);
    t.eq([sql("select count(*) from public.profiles where grace_ends_at is not null"), sql("select to_regclass('public.no_free_plan_go_live') is null")], ["0", "t"], "6b the rollback empties every end date and drops the go-live record");
  } catch (e) {
    t.ok(false, "the suite ran to the end: " + String((e && (e.stderr || e.message)) || e).split("\n").slice(0, 3).join(" | ").slice(0, 300));
  } finally {
    if (started) { try { execFileSync(path.join(bin, "pg_ctl"), ["-D", path.join(dir, "data"), "-m", "immediate", "stop"], { env, stdio: "ignore" }); } catch {} }
  }
  t.summary("NO FREE PLAN GRACE (sql)");
})();
