// tests/testerFreeMonth.sql.test.cjs
// -----------------------------------------------------------------------------
// THE FREE MONTH IN A REAL POSTGRES (migration 0039, written, not run in production). Every migration runs in order, on the same
// stand-in for Supabase as tests/creators.sql.test.cjs, so the real profiles row, trial trigger and privilege guard are in play.
//   0  it applies, and a second time; anon and authenticated reach nothing
//   1  a sign-up: trial_ends_at moves to 30 days after signup; once only
//   2  the 11th gets nothing and keeps the ordinary 14 days; a deleted account's place is not given away
//   3  a founder or a paid account takes no place; an unknown account gets nothing
// -----------------------------------------------------------------------------
"use strict";
const { tempDir } = require("./_tmp.cjs");
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");
const net = require("net");
const { execFileSync } = require("child_process");

const MIGRATIONS = path.join(__dirname, "..", "supabase", "migrations");
const creatorsTest = fs.readFileSync(path.join(__dirname, "creators.sql.test.cjs"), "utf8");
const STUB = creatorsTest.slice(creatorsTest.indexOf("const STUB = `") + 14, creatorsTest.indexOf("`;", creatorsTest.indexOf("const STUB = `")));
function pgBin() {
  const c = [process.env.FOUNDING_PG_BIN, "/opt/homebrew/opt/postgresql@17/bin", "/usr/local/opt/postgresql@17/bin"];
  try { for (const v of fs.readdirSync("/usr/lib/postgresql").sort().reverse()) c.push(`/usr/lib/postgresql/${v}/bin`); } catch {}
  return c.find((d) => d && ["initdb", "pg_ctl", "psql"].every((b) => fs.existsSync(path.join(d, b)))) || null;
}
const freePort = () => new Promise((ok) => { const s = net.createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => ok(p)); }); });

(async () => {
  const t = create();
  const bin = pgBin();
  if (!bin) { t.ok(false, "0 a Postgres to run the migrations in"); t.summary("TESTER FREE MONTH (sql)"); return; }
  const env = { ...process.env, LC_ALL: "C", LANG: "C" };
  const dir = tempDir("pgf");
  const port = await freePort();
  const psql = (args) => execFileSync(path.join(bin, "psql"), ["-h", dir, "-p", String(port), "-U", "postgres", "-d", "t", "-v", "ON_ERROR_STOP=1", "-qAtX", ...args], { env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const sql = (q) => psql(["-c", q]);
  const last = (s) => s.split("\n").pop();
  const refused = (q) => { try { sql(q); return false; } catch { return true; } };
  let started = false;
  try {
    execFileSync(path.join(bin, "initdb"), ["-D", path.join(dir, "data"), "-U", "postgres", "-A", "trust"], { env, stdio: "ignore" });
    execFileSync(path.join(bin, "pg_ctl"), ["-D", path.join(dir, "data"), "-o", `-p ${port} -k ${dir} -c listen_addresses=''`, "-l", path.join(dir, "log"), "-w", "start"], { env, stdio: "ignore" });
    started = true;
    execFileSync(path.join(bin, "psql"), ["-h", dir, "-p", String(port), "-U", "postgres", "-d", "postgres", "-qAtX", "-c", "create database t"], { env, stdio: "ignore" });
    fs.writeFileSync(path.join(dir, "stub.sql"), STUB); psql(["-f", path.join(dir, "stub.sql")]);
    const files = fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();
    const failed = [];
    for (const f of files) { try { psql(["-f", path.join(MIGRATIONS, f)]); } catch (e) { failed.push(`${f}: ${String(e.stderr || e.message).split("\n").find((l) => /ERROR/.test(l))}`); } }
    t.eq(failed, [], "0a every migration applies in order, 0039 included");
    const FILE = path.join(MIGRATIONS, "0039_tester_free_month.sql");
    psql(["-f", FILE]); t.ok(true, "0b and 0039 runs a second time without error");
    t.ok(refused("set role anon; select * from public.tester_free_months") && refused("set role authenticated; select * from public.tester_free_months"), "0c anon and authenticated can't read the table");
    t.ok(refused(`set role authenticated; select * from public.tester_free_month_grant(gen_random_uuid())`), "0d nor give themselves a month");
    t.eq(sql("select relrowsecurity from pg_class where oid = 'public.tester_free_months'::regclass"), "t", "0e RLS is on");

    const person = () => {
      const id = sql("insert into auth.users (email, email_confirmed_at, created_at) values ('t' || gen_random_uuid() || '@example.test', now(), now() - interval '1 hour') returning id").split("\n")[0];
      sql(`insert into public.profiles (user_id, plan, trial_started_at, trial_ends_at, founder_flag) values ('${id}', 'trial', now(), now() + interval '14 days', false) on conflict (user_id) do nothing`);
      return id;
    };
    const grant = (id) => last(sql(`set role service_role; select set_config('request.jwt.claims', '{"role":"service_role"}', false); select granted::text || ',' || places_taken from public.tester_free_month_grant('${id}')`));
    const days = (id) => sql(`select round(extract(epoch from (p.trial_ends_at - u.created_at)) / 86400) from public.profiles p join auth.users u on u.id = p.user_id where p.user_id = '${id}'`);

    const first = person();
    t.eq(days(first), "14", "1a before: the ordinary 14 days");
    t.eq(grant(first), "true,1", "1b the first tester gets the month");
    t.eq(days(first), "30", "1c trial_ends_at is now 30 days after signup");
    t.eq(grant(first), "false,1", "1d asking twice takes nothing more");
    t.eq(days(first), "30", "1e and moves nothing");

    const others = [];
    for (let i = 2; i <= 10; i++) { const u = person(); others.push(u); t.eq(grant(u), `true,${i}`, `2a tester ${i} of 10 gets the month`); }
    const eleventh = person();
    t.eq(grant(eleventh), "false,10", "2b the 11th gets none");
    t.eq(days(eleventh), "14", "2c and keeps the ordinary 14 days");
    sql(`delete from auth.users where id = '${others[0]}'`);
    t.eq(sql(`select count(*) || ',' || count(user_id) from public.tester_free_months`), "10,9", "2d a deleted account keeps its place, with its id gone");
    const twelfth = person();
    t.eq(grant(twelfth), "false,10", "2e so no one takes it: 10 in total, ever");

    sql("delete from public.tester_free_months where user_id is null");   // one place free, for section 3
    const founder = person();
    sql(`set request.jwt.claims = '{"role":"service_role"}'; update public.profiles set founder_flag = true where user_id = '${founder}'`);
    t.eq(grant(founder), "false,9", "3a a founder takes no place");
    const paid = person();
    sql(`set request.jwt.claims = '{"role":"service_role"}'; update public.profiles set plan = 'plus' where user_id = '${paid}'`);
    t.eq(grant(paid), "false,9", "3b nor a paid account");
    t.eq(grant("00000000-0000-4000-8000-00000000abcd"), "false,9", "3c an unknown account gets nothing");
  } finally {
    if (started) { try { execFileSync(path.join(bin, "pg_ctl"), ["-D", path.join(dir, "data"), "-m", "immediate", "stop"], { env, stdio: "ignore" }); } catch {} }
  }
  t.summary("TESTER FREE MONTH (sql)");
})();
