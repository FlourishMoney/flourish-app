// tests/complimentaryAccess.sql.test.cjs
// -----------------------------------------------------------------------------
// MIGRATION 0051 (COMPLIMENTARY ACCESS, SET ON THE SERVER) IN A REAL POSTGRES (written, not run in production).
// Every migration is applied in order first, so the real profiles table and its real guard are what it meets.
//   0  it applies, and a second time; the table starts empty
//   1  only our server: RLS on; anon and authenticated can neither read, write, nor call the function
//   2  giving both: the profile becomes 'plus', what it said before is remembered, Plus is marked
//   3  without the service role's claim nothing is written at all (the profile guard refuses the plan change)
//   4  taking the main plan away puts the profile back; Plus alone can stay, or go alone
//   5  both off removes the row; a second "off" changes nothing
//   6  a profile that was already 'plus' or 'pro' is never changed, on the way in or out
//   7  an account with no profile, or a null, gets nothing
//   8  the row goes with the account
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
  if (!bin) { t.ok(false, "0 a Postgres to run the migrations in"); t.summary("COMPLIMENTARY ACCESS (sql)"); return; }
  const env = { ...process.env, LC_ALL: "C", LANG: "C" };
  const dir = tempDir("pgca");
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
    t.eq(failed, [], "0a every migration applies in order, 0051 included");
    const FILE = path.join(MIGRATIONS, "0051_complimentary_access.sql");
    psql(["-f", FILE]); t.ok(true, "0b and 0051 runs a second time without error");
    t.eq(sql("select count(*) from public.complimentary_access"), "0", "0c it gives nobody anything by itself: the table starts empty");

    // ── 1. only our server ──
    t.eq(sql("select relrowsecurity from pg_class where oid = 'public.complimentary_access'::regclass"), "t", "1a RLS is on");
    for (const role of ["anon", "authenticated"]) {
      t.ok(refused(`set role ${role}; select * from public.complimentary_access`), `1b ${role} cannot read it`);
      t.ok(refused(`set role ${role}; insert into public.complimentary_access (user_id, plus_addon) values (gen_random_uuid(), true)`), `1c ${role} cannot write it`);
      t.ok(refused(`set role ${role}; select * from public.complimentary_access_set(gen_random_uuid(), true, true)`), `1d ${role} cannot call the function`);
    }

    const person = (plan = "trial") => {
      const id = sql("insert into auth.users (email, email_confirmed_at) values ('t' || gen_random_uuid() || '@example.test', now()) returning id").split("\n")[0];
      sql(`insert into public.profiles (user_id, plan, trial_started_at, founder_flag) values ('${id}', 'trial', now(), false) on conflict (user_id) do nothing`);
      if (plan !== "trial") sql(`begin; set local request.jwt.claims = '{"role":"service_role"}'; update public.profiles set plan = '${plan}' where user_id = '${id}'; commit;`);
      return id;
    };
    // The steps as they are run by hand in the SQL editor: one transaction that claims the service role for itself.
    const set = (id, main, plus) => last(sql(`begin; set local request.jwt.claims = '{"role":"service_role"}'; select account_found::text || ',' || main_plan::text || ',' || plus_addon::text || ',' || coalesce(profile_plan, '-') from public.complimentary_access_set(${id === null ? "null" : `'${id}'`}, ${main}, ${plus}); commit;`));
    const row = (id) => sql(`select main_plan::text || ',' || plus_addon::text || ',' || coalesce(prior_plan, '-') from public.complimentary_access where user_id = '${id}'`);
    const plan = (id) => sql(`select plan from public.profiles where user_id = '${id}'`);

    // ── 2. giving both ──
    const a = person();
    const others = (id) => sql(`select trial_started_at::text || '|' || coalesce(trial_ends_at::text, '-') || '|' || founder_flag::text || '|' || coalesce(ai_third_party_consent_at::text, '-') from public.profiles where user_id = '${id}'`);
    const before = others(a);
    t.eq(set(a, true, true), "true,true,true,plus", "2a both given: the function answers what is now true");
    t.eq([plan(a), row(a)], ["plus", "true,true,trial"], "2b the profile is 'plus', what it said before is remembered, Plus is marked");
    t.eq([set(a, true, true), plan(a), row(a), sql("select count(*) from public.complimentary_access")], ["true,true,true,plus", "plus", "true,true,trial", "1"], "2c given twice: nothing changes, and 'trial' is still what is remembered");
    t.ok(before.split("|").length === 4 && others(a) === before, "2d nothing else on the profile moved: the trial dates, the founder flag and the AI consent are as they were");

    // ── 3. without the service role's claim ──
    const b = person();
    t.ok(refused(`select * from public.complimentary_access_set('${b}', true, true)`), "3a no service-role claim: the profile guard refuses the plan change");
    t.eq([plan(b), sql(`select count(*) from public.complimentary_access where user_id = '${b}'`)], ["trial", "0"], "3b …and then nothing was written at all, Plus included");

    // ── 4. taking the main plan away; Plus alone ──
    t.eq([set(a, false, true), plan(a), row(a)], ["true,false,true,trial", "trial", "false,true,-"], "4a the main plan taken away: the profile is back on 'trial' (long ended), Plus stays");
    t.eq([set(a, true, false), plan(a), row(a)], ["true,true,false,plus", "plus", "true,false,trial"], "4b the main plan alone: 'plus' again, no Plus");
    const c = person();
    t.eq([set(c, false, true), plan(c), row(c)], ["true,false,true,trial", "trial", "false,true,-"], "4c Plus alone, for an account whose main plan is its own business: the profile is not touched");

    // ── 5. both off ──
    t.eq([set(a, false, false), plan(a), sql(`select count(*) from public.complimentary_access where user_id = '${a}'`)], ["true,false,false,trial", "trial", "0"], "5a both off: the profile is back, the row is gone");
    t.eq([set(a, false, false), plan(a)], ["true,false,false,trial", "trial"], "5b off again: nothing to do, nothing changed");
    t.ok(refused(`set role service_role; insert into public.complimentary_access (user_id, main_plan, plus_addon) values ('${a}', false, false)`), "5c a row that gives nothing cannot exist");

    // ── 6. a profile that was already 'plus' or 'pro' ──
    const d = person("plus");
    t.eq([set(d, true, true), plan(d), row(d)], ["true,true,true,plus", "plus", "true,true,-"], "6a already 'plus' before: marked, with nothing remembered to go back to");
    t.eq([set(d, false, false), plan(d)], ["true,false,false,plus", "plus"], "6b …so taking it away never moves a profile this function did not move");
    const e = person("pro");
    t.eq([set(e, true, false), plan(e), set(e, false, false), plan(e)], ["true,true,false,pro", "pro", "true,false,false,pro", "pro"], "6c the same for 'pro'");
    const f = person("free");
    t.eq([set(f, true, true), plan(f), row(f), set(f, false, false), plan(f)], ["true,true,true,plus", "plus", "true,true,free", "true,false,false,free", "free"], "6d a 'free' profile goes to 'plus' and back to 'free'");

    // ── 7. nobody there ──
    const ghost = sql("select gen_random_uuid()");
    t.eq([set(ghost, true, true), sql(`select count(*) from public.complimentary_access where user_id = '${ghost}'`)], ["false,false,false,-", "0"], "7a an account with no profile gets nothing");
    t.eq(set(null, true, true), "false,false,false,-", "7b nor does a null");

    // ── 8. the row goes with the account ──
    set(c, true, true);
    sql(`delete from auth.users where id = '${c}'`);
    t.eq(sql(`select count(*) from public.complimentary_access where user_id = '${c}'`), "0", "8a deleting the account deletes its row");
    t.eq(sql("select count(*) from public.complimentary_access"), "0", "8b and after all of the above, nobody is left with anything");
  } catch (e) {
    t.ok(false, `the suite ran: ${String(e.stderr || e.message).split("\n").slice(0, 3).join(" | ")}`);
  } finally {
    if (started) { try { execFileSync(path.join(bin, "pg_ctl"), ["-D", path.join(dir, "data"), "-m", "immediate", "stop"], { env, stdio: "ignore" }); } catch {} }
  }
  t.summary("COMPLIMENTARY ACCESS (sql)");
})();
