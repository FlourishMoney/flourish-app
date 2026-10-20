// tests/nativeTrialRestart.sql.test.cjs
// -----------------------------------------------------------------------------
// EXISTING STORE APP ACCOUNTS START A FRESH 14 DAYS, IN A REAL POSTGRES (migrations 0023 and 0024,
// founder's decision 2026-10-20).
//
// Every migration in supabase/migrations runs, in order, in a throwaway Postgres cluster started for this
// test and removed when it ends, on a small stand-in for what Supabase provides (the API roles, auth.users,
// auth.sessions with its user_agent column, auth.jwt(), the extensions schema). Then, for households set up
// the way production has them:
//   1  who restarts: an account seen in the Android or iOS app (by its sign-in's browser string, or by
//      feedback sent from an app), on the free plan or a trial that ends within 14 days, never a founder,
//      never a paid plan or a paying subscription, never an account made on or after 2026-10-19, never
//      a trial that already runs longer;
//   2  what changes: plan 'trial', trial_started_at now, trial_ends_at now + 14 days, and the server's own
//      rule (_lib/planRules.js) reads that as the trial today and the free plan 15 days on;
//   3  every changed row's old values are kept, and a second run changes nothing;
//   4  the profile guard is real (an update without the service role setting is refused) and the copy is
//      not readable from the browser roles;
//   5  0023 still runs where production may lack public.feedback (0013) or public.subscriptions (0009);
//   6  the rollback in 0023's footer puts every row back exactly;
//   7  0024's daily counter counts per user, kind and UTC day, and the browser roles cannot call it.
// Postgres comes from FOUNDING_PG_BIN, Homebrew (postgresql@17) or the copy GitHub's Ubuntu runner ships
// (/usr/lib/postgresql/*/bin). Without one the suite fails rather than passing on nothing.
// -----------------------------------------------------------------------------
"use strict";
const { tempDir } = require("./_tmp.cjs");
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");
const net = require("net");
const { execFileSync } = require("child_process");
const { derivePlan } = require("../netlify/functions/_lib/planRules.js");

const ROOT = path.join(__dirname, "..");
const MIGRATIONS = path.join(ROOT, "supabase", "migrations");
const RESTART = path.join(MIGRATIONS, "0023_native_trial_restart.sql");

const SUPABASE_STUB = `
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  email_confirmed_at timestamptz,
  raw_app_meta_data jsonb not null default '{}'::jsonb,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create table if not exists auth.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  user_agent text
);
create or replace function auth.uid() returns uuid language sql stable as $f$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $f$;
create or replace function auth.role() returns text language sql stable as $f$ select coalesce(current_setting('request.jwt.claim.role', true), 'anon') $f$;
create or replace function auth.jwt() returns jsonb language sql stable as $f$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $f$;
create schema if not exists extensions;
create extension if not exists pgcrypto schema extensions;
-- What Supabase did for a new public table before 2026-10-30: grant it to the API roles. With this, a
-- browser role is refused only where a migration revokes, which is what sections 4 and 7 check.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
`;

// Browser strings as each client sends them.
const UA = {
  android: "Mozilla/5.0 (Linux; Android 15; Pixel 8 Build/AP4A.250105.002; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/134.0.6998.135 Mobile Safari/537.36",
  ios: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
  ipad: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)",
  iosSafari: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1",
  iosChrome: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/134.0.6998.99 Mobile/15E148 Safari/604.1",
  androidChrome: "Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Mobile Safari/537.36",
  macSafari: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15",
  desktopChrome: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
};

function pgBin() {
  const cands = [process.env.FOUNDING_PG_BIN, "/opt/homebrew/opt/postgresql@17/bin", "/usr/local/opt/postgresql@17/bin"];
  try { for (const v of fs.readdirSync("/usr/lib/postgresql").sort().reverse()) cands.push(`/usr/lib/postgresql/${v}/bin`); } catch {}
  return cands.find((d) => d && fs.existsSync(path.join(d, "initdb")) && fs.existsSync(path.join(d, "pg_ctl")) && fs.existsSync(path.join(d, "psql"))) || null;
}
const freePort = () => new Promise((ok) => { const s = net.createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => ok(p)); }); });

(async () => {
  const t = create();
  const bin = pgBin();
  if (!bin) { t.ok(false, "0 a Postgres to run the migrations in (FOUNDING_PG_BIN, Homebrew postgresql@17, or /usr/lib/postgresql)"); t.summary("NATIVE TRIAL RESTART (sql)"); return; }
  const env = { ...process.env, LC_ALL: "C", LANG: "C" };
  const dir = tempDir("pg");
  const port = await freePort();
  const psql = (args, db) => execFileSync(path.join(bin, "psql"), ["-h", dir, "-p", String(port), "-U", "postgres", "-d", db, "-v", "ON_ERROR_STOP=1", "-qAtX", ...args], { env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  let db = "t";
  const sql = (q) => psql(["-c", q], db);
  const file = (f) => psql(["-f", f], db);
  const fails = (q) => { try { sql(q); return null; } catch (e) { return String(e.stderr || e.message); } };
  const svc = (q) => sql(`begin; select set_config('request.jwt.claims', '{"role":"service_role"}', true); ${q}; commit;`);
  const ts = (col) => `coalesce(to_char(${col} at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), '')`;

  // A household: an auth user (handle_new_user gives it a profile), its profile as given, its sign-ins.
  const household = ({ created = "2026-09-01T00:00:00Z", profile = {}, agents = [], sub = null, feedback = null }) => {
    const id = sql(`insert into auth.users (email, email_confirmed_at, created_at) values ('h' || gen_random_uuid() || '@example.ca', now(), '${created}') returning id`);
    const set = Object.entries(profile).map(([k, v]) => `${k} = ${v === null ? "null" : typeof v === "boolean" ? v : `'${v}'`}`).join(", ");
    if (set) svc(`update public.profiles set ${set} where user_id = '${id}'`);
    for (const a of agents) sql(`insert into auth.sessions (user_id, user_agent) values ('${id}', '${a.replace(/'/g, "''")}')`);
    if (sub) sql(`insert into public.subscriptions (user_id, status, current_period_end) values ('${id}', '${sub.status}', ${sub.end ? `'${sub.end}'` : "null"})`);
    if (feedback) sql(`insert into public.feedback (user_id, kind, message, platform) values ('${id}', 'problem', 'from the app', '${feedback}')`);
    return id;
  };
  const row = (id) => {
    const [plan, started, ends, founder] = sql(`select plan, ${ts("trial_started_at")}, ${ts("trial_ends_at")}, founder_flag from public.profiles where user_id = '${id}'`).split("|");
    return { plan, trial_started_at: started || null, trial_ends_at: ends || null, founder_flag: founder === "t" };
  };
  const ago = (d) => new Date(Date.now() - d * 86400000).toISOString();
  const ahead = (d) => new Date(Date.now() + d * 86400000).toISOString();
  const ENDED = { plan: "trial", trial_started_at: ago(40), trial_ends_at: ago(26) };

  let started = false;
  try {
    execFileSync(path.join(bin, "initdb"), ["-D", path.join(dir, "data"), "-U", "postgres", "-A", "trust"], { env, stdio: "ignore" });
    execFileSync(path.join(bin, "pg_ctl"), ["-D", path.join(dir, "data"), "-o", `-p ${port} -k ${dir} -c listen_addresses=''`, "-l", path.join(dir, "log"), "-w", "start"], { env, stdio: "ignore" });
    started = true;
    const files = fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();
    const build = (name) => {
      psql(["-c", `create database ${name}`], "postgres");
      db = name;
      fs.writeFileSync(path.join(dir, "stub.sql"), SUPABASE_STUB);
      file(path.join(dir, "stub.sql"));
      const failed = [];
      for (const f of files) { try { file(path.join(MIGRATIONS, f)); } catch (e) { failed.push(`${f}: ${String(e.stderr || e.message).split("\n")[0]}`); } }
      return failed;
    };
    t.eq(build("t"), [], `0 every migration applies in order (${files.length}, with 0023 and 0024: ${files.includes("0023_native_trial_restart.sql") && files.includes("0024_ai_usage_daily.sql")})`);
    t.eq(sql("select count(*) from public.native_trial_restart_2026_10"), "0", "0b (on an empty database 0023 changes nothing)");

    // ── the households ──────────────────────────────────────────────────────────────────────────────
    const H = {
      android:        household({ profile: ENDED, agents: [UA.android] }),
      iosTrialEnding: household({ profile: { plan: "trial", trial_started_at: ago(11), trial_ends_at: ahead(3) }, agents: [UA.ios] }),
      ipad:           household({ profile: { plan: "free", trial_started_at: null, trial_ends_at: null }, agents: [UA.ipad] }),
      webAndApp:      household({ profile: ENDED, agents: [UA.desktopChrome, UA.ios] }),
      feedbackOnly:   household({ profile: ENDED, feedback: "android" }),
      cancelled:      household({ profile: ENDED, agents: [UA.android], sub: { status: "canceled", end: ago(5) } }),
      // never restarted
      iosSafari:      household({ profile: ENDED, agents: [UA.iosSafari, UA.iosChrome] }),
      webOnly:        household({ profile: ENDED, agents: [UA.desktopChrome, UA.macSafari, UA.androidChrome] }),
      webFeedback:    household({ profile: ENDED, agents: [UA.desktopChrome], feedback: "web" }),
      founder:        household({ profile: { ...ENDED, founder_flag: true }, agents: [UA.ios] }),
      plus:           household({ profile: { plan: "plus" }, agents: [UA.android] }),
      paying:         household({ profile: ENDED, agents: [UA.android], sub: { status: "active", end: ahead(300) } }),
      payingTrialing: household({ profile: ENDED, agents: [UA.ios], sub: { status: "trialing", end: ahead(10) } }),
      longTrial:      household({ profile: { plan: "trial", trial_started_at: ago(2), trial_ends_at: ahead(26) }, agents: [UA.ios] }),
      newAccount:     household({ created: new Date(Math.max(Date.now(), Date.parse("2026-10-19T12:00:00Z"))).toISOString(), profile: ENDED, agents: [UA.android] }),
    };
    const RESTARTS = ["android", "iosTrialEnding", "ipad", "webAndApp", "feedbackOnly", "cancelled"];
    const before = Object.fromEntries(Object.entries(H).map(([k, id]) => [k, row(id)]));

    // ── 4a. the guard is real: without the service-role setting, the trial dates cannot be written ──
    t.ok(/server-managed/.test(fails(`update public.profiles set trial_ends_at = now() + interval '1 year' where user_id = '${H.android}'`) || ""),
      "4a (the profile guard refuses a trial date written without the service role, so 0023's setting is what lets it run)");

    file(RESTART);
    const after = Object.fromEntries(Object.entries(H).map(([k, id]) => [k, row(id)]));
    const now = Date.now();

    // ── 1. who restarts ───────────────────────────────────────────────────────────────────────────────
    t.eq(Object.keys(H).filter(k => after[k].trial_started_at !== before[k].trial_started_at).sort(), [...RESTARTS].sort(),
      "1a exactly the app accounts with no paid plan restart: Android, iPhone, iPad, web-and-app, feedback from an app, a cancelled subscription");
    for (const k of Object.keys(H).filter(k => !RESTARTS.includes(k))) {
      t.eq(after[k], before[k], `1b ${k}: unchanged`);
    }

    // ── 2. what changes ───────────────────────────────────────────────────────────────────────────────
    for (const k of RESTARTS) {
      const r = after[k];
      const startedAt = Date.parse(r.trial_started_at), endsAt = Date.parse(r.trial_ends_at);
      t.ok(r.plan === "trial" && Math.abs(startedAt - now) < 120000 && endsAt - startedAt === 14 * 86400000 && !r.founder_flag,
        `2a ${k}: plan trial, started now, ending 14 days from now`);
      t.eq([derivePlan(r, now), derivePlan(r, now + 13 * 86400000), derivePlan(r, now + 15 * 86400000)], ["trial", "trial", "free"],
        `2b ${k}: the server's rule reads it as the trial today and on day 13, and the free plan on day 15`);
    }

    // ── 3. the copy, and a second run ──────────────────────────────────────────────────────────────
    for (const k of RESTARTS) {
      const kept = sql(`select old_plan || '|' || ${ts("old_trial_started_at")} || '|' || ${ts("old_trial_ends_at")} || '|' || evidence from public.native_trial_restart_2026_10 where user_id = '${H[k]}'`);
      const b = before[k];
      t.eq(kept, `${b.plan}|${b.trial_started_at || ""}|${b.trial_ends_at || ""}|${k === "feedbackOnly" ? "app_feedback" : "app_session"}`, `3a ${k}: its old plan and trial dates are kept, with how it was found`);
    }
    t.eq(sql("select count(*) from public.native_trial_restart_2026_10"), String(RESTARTS.length), "3b …and nobody else is in the copy");
    sql("select pg_sleep(0.05)");
    file(RESTART);
    t.eq(Object.fromEntries(Object.entries(H).map(([k, id]) => [k, row(id)])), after, "3c a second run changes nothing");

    // ── 4. nothing for the browser ─────────────────────────────────────────────────────────────────────
    for (const role of ["anon", "authenticated"]) {
      t.ok(/permission denied/.test(fails(`set role ${role}; select count(*) from public.native_trial_restart_2026_10`) || ""), `4b ${role} cannot read the copy`);
    }

    // ── 6. the rollback ─────────────────────────────────────────────────────────────────────────────
    const src = fs.readFileSync(RESTART, "utf8");
    const rollback = src.slice(src.indexOf("-- ROLLBACK")).split("\n").filter(l => /^-- (begin|select set_config|update|   set|  from|  where| where|drop|commit)/.test(l)).map(l => l.replace(/^-- ?/, "")).join("\n");
    t.ok(/^begin;[\s\S]*update public\.profiles[\s\S]*drop table public\.native_trial_restart_2026_10;\ncommit;$/.test(rollback), "6a (the rollback is read out of 0023's footer)");
    fs.writeFileSync(path.join(dir, "rollback.sql"), rollback);
    file(path.join(dir, "rollback.sql"));
    t.eq(Object.fromEntries(Object.entries(H).map(([k, id]) => [k, row(id)])), before, "6b the rollback puts every row back exactly");
    t.eq(sql("select to_regclass('public.native_trial_restart_2026_10') is null"), "t", "6c …and removes the copy");

    // ── 7. 0024's daily counter ─────────────────────────────────────────────────────────────────────
    const count = (id) => sql(`select public.increment_ai_usage_daily('${id}', 'simulator')`);
    t.eq([count(H.android), count(H.android), count(H.ipad)], ["1", "2", "1"], "7a the counter counts per account");
    sql(`update public.ai_usage_daily set day = day - 1 where user_id = '${H.android}'`);
    t.eq(count(H.android), "1", "7b …and starts again on a new UTC day");
    t.eq(sql(`select day = (now() at time zone 'utc')::date from public.ai_usage_daily where user_id = '${H.ipad}'`), "t", "7c …keyed on the UTC date");
    t.ok(/violates check constraint/.test(fails(`select public.increment_ai_usage_daily('${H.ipad}', 'chat')`) || ""), "7d only the kinds it names can be counted");
    for (const role of ["anon", "authenticated"]) {
      t.ok(/permission denied/.test(fails(`set role ${role}; select public.increment_ai_usage_daily('${H.ipad}', 'simulator')`) || ""), `7e ${role} cannot call the counter`);
      t.ok(/permission denied/.test(fails(`set role ${role}; select count(*) from public.ai_usage_daily`) || ""), `7f ${role} cannot read the counts`);
    }

    // ── 5. a database without public.feedback or public.subscriptions (production may lack 0013) ──────
    t.eq(build("t2"), [], "5a (a second database, every migration applied)");
    sql("drop table public.feedback cascade; drop table public.subscriptions cascade");
    const a = household({ profile: ENDED, agents: [UA.android] });
    const w = household({ profile: ENDED, agents: [UA.iosSafari] });
    file(RESTART);
    t.eq([row(a).plan, Date.parse(row(a).trial_ends_at) > Date.now() + 13 * 86400000, Date.parse(row(w).trial_ends_at) < Date.now()],
      ["trial", true, true], "5b 0023 still restarts the Android account and leaves the Safari one, with neither table there");
    const b = household({ profile: ENDED, agents: [UA.android] });
    const bBefore = row(b);
    sql("alter table auth.sessions drop column user_agent");
    let err = "";
    try { file(RESTART); } catch (e) { err = String(e.stderr || e.message); }
    t.ok(/auth\.sessions\.user_agent does not exist/.test(err), "5c without auth.sessions.user_agent, 0023 stops with a clear error");
    t.eq(row(b), bBefore, "5d …and changes nothing");
  } finally {
    if (started) { try { execFileSync(path.join(bin, "pg_ctl"), ["-D", path.join(dir, "data"), "-m", "immediate", "stop"], { env, stdio: "ignore" }); } catch {} }
  }
  t.summary("NATIVE TRIAL RESTART (sql)");
})();
