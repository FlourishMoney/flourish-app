// tests/marketingSetups.sql.test.cjs
// -----------------------------------------------------------------------------
// MIGRATIONS 0036, 0037 AND 0038 IN A REAL POSTGRES (written, not run in production).
//   0  they apply on their own, and a second time
//   1  anon and authenticated reach no table and no function; RLS is on
//   2  the counts: one row a day per src, cr, platform and event; the 2,000-row ceiling; bad tags refused
//   3  the Tuesday report: all five columns, by src and cr
//   4  a deleted account takes its attribution and tester rows with it
//   5  the newsletter's table refuses no consent, or an address not lowercased, or a second row for one address
// -----------------------------------------------------------------------------
"use strict";
const { tempDir } = require("./_tmp.cjs");
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");
const net = require("net");
const { execFileSync } = require("child_process");

const MIGRATIONS = path.join(__dirname, "..", "supabase", "migrations");
const FILES = ["0036_source_funnel.sql", "0037_newsletter.sql", "0038_testers.sql"];
const STUB = `
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text);
grant usage on schema public, auth to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
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
  if (!bin) { t.ok(false, "0 a Postgres to run the migrations in"); t.summary("MARKETING SETUPS (sql)"); return; }
  const env = { ...process.env, LC_ALL: "C", LANG: "C" };
  const dir = tempDir("pgm");
  const port = await freePort();
  const psql = (args) => execFileSync(path.join(bin, "psql"), ["-h", dir, "-p", String(port), "-U", "postgres", "-d", "t", "-v", "ON_ERROR_STOP=1", "-qAtX", ...args], { env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const sql = (q) => psql(["-c", q]);
  const refused = (q) => { try { sql(q); return false; } catch { return true; } };
  let started = false;
  try {
    execFileSync(path.join(bin, "initdb"), ["-D", path.join(dir, "data"), "-U", "postgres", "-A", "trust"], { env, stdio: "ignore" });
    execFileSync(path.join(bin, "pg_ctl"), ["-D", path.join(dir, "data"), "-o", `-p ${port} -k ${dir} -c listen_addresses=''`, "-l", path.join(dir, "log"), "-w", "start"], { env, stdio: "ignore" });
    started = true;
    execFileSync(path.join(bin, "psql"), ["-h", dir, "-p", String(port), "-U", "postgres", "-d", "postgres", "-qAtX", "-c", "create database t"], { env, stdio: "ignore" });
    sql(STUB);
    for (const f of FILES) psql(["-f", path.join(MIGRATIONS, f)]);
    t.ok(true, "0a all three apply");
    for (const f of FILES) psql(["-f", path.join(MIGRATIONS, f)]);
    t.ok(true, "0b and a second time, with no error");

    const TABLES = ["attribution_counts", "account_attribution", "newsletter_subscribers", "tester_codes", "tester_accounts", "tester_answers"];
    for (const tb of TABLES) {
      t.ok(refused(`set role anon; select * from public.${tb}`) && refused(`set role authenticated; select * from public.${tb}`), `1a ${tb}: anon and authenticated are refused`);
      t.eq(sql(`select relrowsecurity from pg_class where oid = 'public.${tb}'::regclass`), "t", `1b ${tb}: RLS is on`);
      t.ok(!refused(`set role service_role; select count(*) from public.${tb}`), `1c ${tb}: the service role can read it`);
    }
    t.ok(refused("set role anon; select public.bump_attribution_count('landing_visit','a','b','ios')"), "1d anon can't bump a count");
    t.ok(refused("set role authenticated; select public.source_funnel('2026-01-01','2026-01-02')"), "1e nor read the report");

    const bump = (e, s, c, p = "ios") => sql(`set role service_role; select public.bump_attribution_count('${e}','${s}','${c}','${p}')`).split("\n").pop();
    t.eq([bump("landing_visit", "ig", "reel_7"), bump("landing_visit", "ig", "reel_7")], ["1", "2"], "2a the same day, src, cr and event add up");
    bump("store_click", "ig", "reel_7"); bump("install", "ig", "reel_7", "android"); bump("landing_visit", "ig", "reel_7", "android");
    t.ok(refused("set role service_role; select public.bump_attribution_count('landing_visit','Bad Tag!','x','ios')"), "2b a tag that isn't a plain word is refused");
    t.ok(refused("set role service_role; select public.bump_attribution_count('purchase','a','b','ios')"), "2c so is an unknown event");

    const person = () => sql("insert into auth.users (email) values ('a@example.test') returning id").split("\n")[0];
    const u1 = person(), u2 = person(), u3 = person();
    sql(`insert into public.account_attribution (user_id, src, cr, platform, activated_at) values ('${u1}','ig','reel_7','android', now()), ('${u2}','ig','reel_7','web', null), ('${u3}','direct','none','ios', null)`);
    const from = "(now() at time zone 'America/Toronto')::date";
    const rows = sql(`set role service_role; select src||','||cr||','||landing_visit||','||store_click||','||install||','||account_created||','||activated_household from public.source_funnel(${from}, ${from})`).split("\n").filter((l) => l.includes(","));
    t.eq(rows, ["direct,none,0,0,0,1,0", "ig,reel_7,3,1,1,2,1"], "3a the Tuesday report: landing visit, store click, install, account created, activated household");
    t.eq(sql(`set role service_role; select count(*) from public.source_funnel(${from} - 30, ${from} - 1)`).split("\n").pop(), "0", "3b another week is empty");

    // The ceiling: 2,000 rows a day, then a new pair goes under other/other. An existing pair keeps counting.
    sql(`insert into public.attribution_counts (day, src, cr, platform, event, n) select (now() at time zone 'America/Toronto')::date, 'fill', 'c' || g, 'ios', 'landing_visit', 1 from generate_series(1, 2000) g`);
    bump("landing_visit", "newpair", "x");
    t.eq(sql("select count(*) from public.attribution_counts where src = 'newpair'"), "0", "2d past the ceiling a new pair adds no row");
    t.eq(sql("select n from public.attribution_counts where src = 'other' and cr = 'other'"), "1", "2e …it counts under other/other");
    t.eq(bump("landing_visit", "ig", "reel_7"), "3", "2f an existing pair keeps counting");

    sql("insert into public.tester_codes (code) values ('FM-TEST1')");
    t.ok(refused("insert into public.tester_codes (code) values ('bad code')"), "4a a code is a plain word");
    sql(`insert into public.tester_accounts (user_id, code) values ('${u1}','FM-TEST1')`);
    sql(`insert into public.tester_answers (user_id, question_id, question_wording, answer) values ('${u1}','q1','Question?','Yes')`);
    t.ok(refused(`insert into public.tester_answers (user_id, question_id, question_wording, answer) values ('${u2}','q1','Question?','')`), "4b an empty answer is refused");
    sql(`delete from auth.users where id = '${u1}'`);
    t.eq([sql(`select count(*) from public.account_attribution where user_id = '${u1}'`), sql(`select count(*) from public.tester_accounts where user_id = '${u1}'`), sql(`select count(*) from public.tester_answers where user_id = '${u1}'`)], ["0", "0", "0"], "4c a deleted account takes its rows with it");

    const sub = (email, consent = "true") => `insert into public.newsletter_subscribers (email, consent, consent_version, consent_wording, source, ua_family) values ('${email}', ${consent}, 'v', 'w', 'site_newsletter', 'safari')`;
    sql(sub("a@example.ca"));
    t.ok(refused(sub("b@example.ca", "false")), "5a no consent, no row");
    t.ok(refused(sub("Upper@example.ca")), "5b an address is stored lowercased");
    t.ok(refused(sub("a@example.ca")), "5c one row per address");
    t.ok(refused("insert into public.newsletter_subscribers (email, consent, consent_version, consent_wording, source, ua_family) values ('c@example.ca', true, 'v', 'w', 'waitlist', 'safari')"), "5d the waitlist is not a source");
    t.eq(sql("select count(*) from information_schema.columns where table_name = 'newsletter_subscribers' and column_name ~ 'ip|user_agent'"), "0", "5e no column for an IP or a user agent");
  } finally {
    if (started) { try { execFileSync(path.join(bin, "pg_ctl"), ["-D", path.join(dir, "data"), "-m", "immediate", "stop"], { env, stdio: "ignore" }); } catch {} }
  }
  t.summary("MARKETING SETUPS (sql)");
})();
