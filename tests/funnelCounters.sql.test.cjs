// tests/funnelCounters.sql.test.cjs
// -----------------------------------------------------------------------------
// MIGRATION 0042 (THE FULL FUNNEL) IN A REAL POSTGRES (written, not run in production).
//   0  it applies on its own, and a second time; counting starts once and the start does not move
//   1  anon and authenticated reach no table and no report; RLS is on
//   2  a milestone or channel outside the fixed lists is refused; a second device adds no second row
//   3  the cohort report: a household counted once across two accounts and devices, web and store sign-ups apart,
//      Apple and Google never in one number, returns on day 1, 7 and 28 with their denominators, test accounts out
//   4  the gates: activation and repeat use, numerator and denominator worked out by hand below
//   5  a deleted account takes its rows with it
// -----------------------------------------------------------------------------
"use strict";
const { tempDir } = require("./_tmp.cjs");
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");
const net = require("net");
const { execFileSync } = require("child_process");

const MIGRATIONS = path.join(__dirname, "..", "supabase", "migrations");
const FILES = ["0036_source_funnel.sql", "0042_funnel_counters.sql"];
// Stand-ins for what 0042 reads: Supabase's auth.users, 0001's profiles and 0030's household tables (the columns read).
const STUB = `
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text, created_at timestamptz not null default now());
grant usage on schema public, auth to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
create table public.profiles (user_id uuid primary key references auth.users(id) on delete cascade, plan text, trial_started_at timestamptz);
create table public.households (id uuid primary key default gen_random_uuid());
create table public.household_members (household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade, role text, joined_at timestamptz not null default now(),
  primary key (household_id, user_id), unique (user_id));
`;
function pgBin() {
  const c = [process.env.FOUNDING_PG_BIN, "/opt/homebrew/opt/postgresql@17/bin", "/usr/local/opt/postgresql@17/bin"];
  try { for (const v of fs.readdirSync("/usr/lib/postgresql").sort().reverse()) c.push(`/usr/lib/postgresql/${v}/bin`); } catch {}
  return c.find((d) => d && ["initdb", "pg_ctl", "psql"].every((b) => fs.existsSync(path.join(d, b)))) || null;
}
const freePort = () => new Promise((ok) => { const s = net.createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => ok(p)); }); });

(async () => {
  const t = create();
  const bin = pgBin();
  if (!bin) { t.ok(false, "0 a Postgres to run the migration in"); t.summary("FUNNEL COUNTERS (sql)"); return; }
  const env = { ...process.env, LC_ALL: "C", LANG: "C" };
  const dir = tempDir("pgf");
  const port = await freePort();
  const psql = (args) => execFileSync(path.join(bin, "psql"), ["-h", dir, "-p", String(port), "-U", "postgres", "-d", "t", "-v", "ON_ERROR_STOP=1", "-qAtX", ...args], { env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const sql = (q) => psql(["-c", q]);
  const last = (q) => sql(q).split("\n").pop();
  const refused = (q) => { try { sql(q); return false; } catch { return true; } };
  let started = false;
  try {
    execFileSync(path.join(bin, "initdb"), ["-D", path.join(dir, "data"), "-U", "postgres", "-A", "trust"], { env, stdio: "ignore" });
    execFileSync(path.join(bin, "pg_ctl"), ["-D", path.join(dir, "data"), "-o", `-p ${port} -k ${dir} -c listen_addresses=''`, "-l", path.join(dir, "log"), "-w", "start"], { env, stdio: "ignore" });
    started = true;
    execFileSync(path.join(bin, "psql"), ["-h", dir, "-p", String(port), "-U", "postgres", "-d", "postgres", "-qAtX", "-c", "create database t"], { env, stdio: "ignore" });
    sql(STUB);

    // ── 0. applies, twice; the start is set once ────────────────────────────────────────────────────────────
    for (const f of FILES) psql(["-f", path.join(MIGRATIONS, f)]);
    t.ok(true, "0a 0042 applies (after 0036)");
    const start1 = sql("select started_at from public.funnel_start");
    for (const f of FILES) psql(["-f", path.join(MIGRATIONS, f)]);
    t.ok(true, "0b and a second time, with no error");
    t.eq([sql("select count(*) from public.funnel_start"), sql("select started_at from public.funnel_start")], ["1", start1], "0c one start marker, and running it again does not move it");

    // ── 1. the Data API reaches nothing ─────────────────────────────────────────────────────────────────────
    for (const tb of ["account_milestones", "account_days", "funnel_start"]) {
      t.ok(refused(`set role anon; select * from public.${tb}`) && refused(`set role authenticated; select * from public.${tb}`), `1a ${tb}: anon and authenticated are refused`);
      t.eq(sql(`select relrowsecurity from pg_class where oid = 'public.${tb}'::regclass`), "t", `1b ${tb}: RLS is on`);
      t.ok(!refused(`set role service_role; select count(*) from public.${tb}`), `1c ${tb}: the service role can read it`);
    }
    for (const fn of ["funnel_households()", "funnel_cohorts('2026-01-01','2026-01-02')", "funnel_gates()", "funnel_shown(1, 2)"]) {
      t.ok(refused(`set role anon; select * from public.${fn}`) && refused(`set role authenticated; select * from public.${fn}`), `1d ${fn}: anon and authenticated can't run it`);
      t.ok(!refused(`set role service_role; select * from public.${fn}`), `1e ${fn}: the service role can`);
    }
    t.eq(sql("select count(*) from information_schema.columns where table_schema = 'public' and table_name in ('account_milestones','account_days') and column_name ~ 'ip|agent|email|amount|device|note|text'"), "0",
      "1f no column for an IP, a user agent, an address, an amount, a device or free text");

    // ── fixtures. T is today in Toronto; ts(n) is noon, Toronto time, n days before T ────────────────────────
    const ts = (n) => `(((now() at time zone 'America/Toronto')::date - ${n}) + time '12:00') at time zone 'America/Toronto'`;
    const day = (n) => `((now() at time zone 'America/Toronto')::date - ${n})`;
    const T = sql("select (now() at time zone 'America/Toronto')::date");
    const dayStr = (n) => sql(`select ${day(n)}`);
    sql(`update public.funnel_start set started_at = ${ts(40)}`);
    const person = (email, n) => sql(`insert into auth.users (email, created_at) values ('${email}', ${ts(n)}) returning id`).split("\n")[0];
    const mark = (u, m, c, n) => sql(`insert into public.account_milestones (user_id, milestone, channel, first_at) values ('${u}', '${m}', '${c}', ${ts(n)}) on conflict do nothing`);
    const active = (u, kind, n) => sql(`insert into public.account_days (user_id, day, kind) values ('${u}', ${day(n)}, '${kind}') on conflict do nothing`);

    // H = A (website, day T-30) + her partner B (iPhone, day T-20). C android alone, D and E web alone (T-30). F web (T-3).
    // G web (T-50, before counting started). X and S are Flourish's own and the screenshot account: never counted.
    const A = person("a@example.ca", 30), B = person("b@example.ca", 20), C = person("c@example.ca", 30), D = person("d@example.ca", 30);
    const E = person("e@example.ca", 30), F = person("f@example.ca", 3), G = person("g@example.ca", 50);
    const X = person("x@flourishmoney.app", 30), S = person("snap@flourish.app", 30);
    const H = sql("insert into public.households default values returning id").split("\n")[0];
    sql(`insert into public.household_members (household_id, user_id, role) values ('${H}', '${A}', 'owner'), ('${H}', '${B}', 'partner')`);
    sql(`insert into public.profiles (user_id, plan, trial_started_at) values ('${A}', 'trial', ${ts(30)}), ('${C}', 'trial', ${ts(30)})`);
    mark(A, "signed_up", "web", 30); mark(B, "signed_up", "ios", 20); mark(C, "signed_up", "android", 30);
    mark(D, "signed_up", "web", 30); mark(E, "signed_up", "web", 30); mark(F, "signed_up", "web", 3); mark(G, "signed_up", "web", 50);
    mark(X, "signed_up", "web", 30); mark(S, "signed_up", "web", 30);
    mark(A, "setup_done", "manual", 30);
    for (const [u, n] of [[A, 29], [B, 19], [C, 29], [D, 29], [F, 3], [G, 49], [X, 29], [S, 29]]) mark(u, "first_safe", "app", n);
    mark(B, "paid", "apple", 19); mark(C, "paid", "google", 25); mark(X, "paid", "web", 25);
    active(A, "open", 29); active(B, "open", 23); active(A, "open", 22); active(D, "open", 26);
    active(A, "checkin", 29); active(C, "checkin", 28); active(C, "checkin", 19); active(D, "checkin", 22);

    // ── 2. the fixed lists, and the first time only ─────────────────────────────────────────────────────────
    t.ok(refused(`insert into public.account_milestones (user_id, milestone, channel) values ('${A}', 'opened_coach', 'app')`), "2a a milestone outside the list is refused");
    t.ok(refused(`insert into public.account_milestones (user_id, milestone, channel) values ('${A}', 'paid', 'store')`), "2b paid needs web, apple or google: there is no merged 'store'");
    t.ok(refused(`insert into public.account_milestones (user_id, milestone, channel) values ('${A}', 'store_trial', 'web')`), "2c a store trial is Apple's or Google's");
    t.ok(refused(`insert into public.account_days (user_id, day, kind) values ('${A}', '${T}', 'screen_view')`), "2d a day's kind is open or checkin");
    mark(B, "first_safe", "app", 1);
    t.eq(sql(`select count(*) || ',' || min(first_at)::date from public.account_milestones where user_id = '${B}' and milestone = 'first_safe'`), `1,${dayStr(19)}`,
      "2e the same milestone from a second device adds no row and keeps the first time");

    // ── 3. the cohort report ────────────────────────────────────────────────────────────────────────────────
    const rows = (from, to) => sql(`set role service_role; select channel||'|'||measure||'|'||shown from public.funnel_cohorts(${day(from)}, ${day(to)})`).split("\n").filter((l) => l.includes("|"));
    const r30 = rows(30, 30);
    const has = (line, label) => t.ok(r30.includes(line), `${label} (${line})`);
    has("web|households_created|3", "3a day T-30 on the website: three households (A with her partner, D, E)");
    has("web|accounts_created|4", "3b …and four accounts: the partner joined A's household, so his account is not a new household");
    has("web|first_safe_to_spend|2 of 3 (66.7%)", "3c A and her partner both reached the number: the household counts once");
    has("web|setup_done|1 of 3 (33.3%)", "3d setup done");
    has("web|trial_started|1 of 3 (33.3%)", "3e trial started, from the account's own 14-day trial");
    has("web|paid_apple|1 of 3 (33.3%)", "3f the partner paid on his iPhone: the household paid on Apple");
    has("web|paid_google|0 of 3 (0.0%)", "3g …and not on Google: the two stores are never one number");
    has("android|households_created|1", "3h an Android sign-up is its own line, apart from the website");
    has("android|paid_google|1 of 1 (100.0%)", "3i paid on Google");
    has("android|second_checkin_other_day|1 of 1 (100.0%)", "3j a second money check-in on a different day");
    has("web|second_checkin_other_day|0 of 3 (0.0%)", "3k one check-in day is not two");
    has("web|returned_day_1|1 of 3 (33.3%)", "3l returned on day 1, out of the households whose day 1 is over");
    has("web|returned_day_7|1 of 3 (33.3%)", "3m returned on day 7: the partner's open counts for the household");
    has("web|returned_day_28|0 of 3 (0.0%)", "3n returned on day 28: none");
    t.ok(!r30.some((l) => l.startsWith("unknown|")), "3o Flourish's own address and the screenshot account are not counted anywhere");
    t.ok(!r30.some((l) => l.includes("|paid_web|1 of")), "3p …so the test account's website payment is not either");
    t.ok(r30.length > 0 && r30.every((l) => !/%/.test(l) || / of \d+ \(\d+\.\d%\)$/.test(l)), "3q no percentage appears without 'n of d'");
    const r3 = rows(3, 3);
    t.ok(r3.includes("web|returned_day_7|0 of 0 (no household has finished this window yet)"), "3r a window that is not over says so, not 0%");
    t.eq(sql(`set role service_role; select distinct before_counting_started from public.funnel_cohorts(${day(50)}, ${day(50)})`), "t", "3s a cohort from before counting started is marked, so its blanks are not read as zeros");
    t.eq(sql(`set role service_role; select distinct before_counting_started from public.funnel_cohorts(${day(30)}, ${day(30)})`), "f", "3t …and one after is not");
    t.eq(sql(`set role service_role; select count(*) from public.funnel_cohorts(${day(20)}, ${day(20)})`), "0", "3u the partner's own signup day holds no household of its own");

    // ── 4. the gates ───────────────────────────────────────────────────────────────────────────────────────
    // activation: eligible H, C, D, E (7 days over; F is 3 days old, G before counting, X and S never). Reached it in 7 days: H, C, D.
    // activated: H, C, D, F. Repeat use, out of H, C, D (14 days since activation over; F's are not):
    //   returned days 6 to 8: H (the partner opened on day 6). Second check-in on another day, days 6 to 14: C (days 1 and 10).
    //   D's only check-in is on day 7: it is the first, not a second. Either: H and C.
    const gates = sql("set role service_role; select channel||'|'||measure||'|'||shown from public.funnel_gates()").split("\n").filter((l) => l.includes("|"));
    const gate = (line, label) => t.ok(gates.includes(line), `${label} (${line})`);
    gate("all|activation_within_7_days|3 of 4 (75.0%)", "4a activation: abandoned onboarding is in the denominator");
    gate("all|activated_households|4", "4b activated households");
    gate("all|returned_days_6_to_8|1 of 3 (33.3%)", "4c returned on days 6 to 8");
    gate("all|second_checkin_days_6_to_14|1 of 3 (33.3%)", "4d a second check-in on a different day, days 6 to 14");
    gate("all|either_repeat_use|2 of 3 (66.7%)", "4e either, each household once");
    gate("web|activation_within_7_days|2 of 3 (66.7%)", "4f split by the channel the household signed up on");
    gate("android|either_repeat_use|1 of 1 (100.0%)", "4g …the Android household");
    t.eq(gates[0].split("|")[0], "all", "4h the whole first, then each channel");
    const past = sql(`set role service_role; select shown from public.funnel_gates(${day(25)}) where channel = 'all' and measure = 'either_repeat_use'`);
    t.eq(past, "0 of 0 (no household has finished this window yet)", "4i as of an earlier day, nobody's window was over yet");

    // ── 5. a deleted account takes its rows with it ─────────────────────────────────────────────────────────
    sql(`delete from auth.users where id = '${C}'`);
    t.eq([last(`select count(*) from public.account_milestones where user_id = '${C}'`), last(`select count(*) from public.account_days where user_id = '${C}'`)], ["0", "0"],
      "5a milestones and days go with the account");
  } finally {
    if (started) { try { execFileSync(path.join(bin, "pg_ctl"), ["-D", path.join(dir, "data"), "-m", "immediate", "stop"], { env, stdio: "ignore" }); } catch {} }
  }
  t.summary("FUNNEL COUNTERS (sql)");
})();
