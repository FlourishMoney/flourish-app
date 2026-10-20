// tests/foundingLedger.sql.test.cjs
// -----------------------------------------------------------------------------
// ONE LEDGER OF 50 FOUNDING POSITIONS, IN A REAL POSTGRES (migration 0021, founder's decision 2026-10-17).
//
// Every migration in supabase/migrations runs, in order, in a throwaway Postgres cluster started for this
// test and removed when it ends, on top of a small stand-in for what Supabase provides (the anon,
// authenticated and service_role roles, an auth.users table, the extensions schema). Then:
//   1  positions issued to waitlist rows (0014) and to accounts confirmed by link (0021) share one ledger,
//      in arrival order; #50 is issued, #51 never is, from either side;
//   2  concurrent confirmations and waitlist joins never share a number;
//   3  a waitlist address that later signs up in an app keeps its original number, even when its waitlist
//      row was deleted first, and no second number is issued;
//   4  who never takes a position: an unconfirmed account, an account confirmed on creation ("auto"), the
//      founder's own domains, an address on a waitlist test row;
//   5  founding_accounts_start() numbers already-confirmed accounts after the waitlist, then runs never again;
//   6  the lookup checkout uses (waitlist_founding_position_for_email) answers from the same ledger, and
//      checkout's own rule (_lib/foundingCohort.js mayBuyFoundingPrice, run here against this database)
//      offers the founding price to #50 and never to #51;
//   7  nothing is callable from the browser roles;
//   8  the rollback in 0021's header returns the database to what 0016 left.
// Postgres comes from FOUNDING_PG_BIN, Homebrew (postgresql@17) or the copy GitHub's Ubuntu runner ships
// (/usr/lib/postgresql/*/bin). Without one the suite fails rather than passing on nothing.
// -----------------------------------------------------------------------------
"use strict";
const { tempDir } = require("./_tmp.cjs");
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");
const net = require("net");
const { execFileSync, spawn } = require("child_process");

const ROOT = path.join(__dirname, "..");
const MIGRATIONS = path.join(ROOT, "supabase", "migrations");

// What Supabase has before the first migration: the three API roles, the auth schema, the extensions schema.
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
create or replace function auth.uid() returns uuid language sql stable as $f$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $f$;
create or replace function auth.role() returns text language sql stable as $f$ select coalesce(current_setting('request.jwt.claim.role', true), 'anon') $f$;
create or replace function auth.jwt() returns jsonb language sql stable as $f$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $f$;
create schema if not exists extensions;
create extension if not exists pgcrypto schema extensions;
`;

function pgBin() {
  const cands = [process.env.FOUNDING_PG_BIN, "/opt/homebrew/opt/postgresql@17/bin", "/usr/local/opt/postgresql@17/bin"];
  try { for (const v of fs.readdirSync("/usr/lib/postgresql").sort().reverse()) cands.push(`/usr/lib/postgresql/${v}/bin`); } catch {}
  return cands.find((d) => d && fs.existsSync(path.join(d, "initdb")) && fs.existsSync(path.join(d, "pg_ctl")) && fs.existsSync(path.join(d, "psql"))) || null;
}
const freePort = () => new Promise((ok) => { const s = net.createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => ok(p)); }); });

(async () => {
  const t = create();
  const bin = pgBin();
  if (!bin) { t.ok(false, "0 a Postgres to run the migrations in (FOUNDING_PG_BIN, Homebrew postgresql@17, or /usr/lib/postgresql)"); t.summary("FOUNDING LEDGER (sql)"); return; }
  const env = { ...process.env, LC_ALL: "C", LANG: "C" };
  const dir = tempDir("pg");
  const port = await freePort();
  const sql = (q, db = "t") => execFileSync(path.join(bin, "psql"), ["-h", dir, "-p", String(port), "-U", "postgres", "-d", db, "-v", "ON_ERROR_STOP=1", "-qAtX", "-c", q], { env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const file = (f, db = "t") => execFileSync(path.join(bin, "psql"), ["-h", dir, "-p", String(port), "-U", "postgres", "-d", db, "-v", "ON_ERROR_STOP=1", "-qAtX", "-f", f], { env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const fails = (q) => { try { sql(q); return null; } catch (e) { return String(e.stderr || e.message); } };
  // An account as beta.js creates it with signup open: unconfirmed, email_confirmation "link".
  const account = (email, how = "link") => sql(`insert into auth.users (email, raw_app_meta_data) values ('${email}', '{"email_confirmation":"${how}"}') returning id`);
  const confirm = (id) => sql(`update auth.users set email_confirmed_at = clock_timestamp() where id = '${id}'`);
  const join = (email, test = false) => sql(`insert into public.waitlist (email, is_test) values ('${email}', ${test}) returning coalesce(founding_position::text, '')`);
  const lookup = (email) => sql(`select coalesce(public.waitlist_founding_position_for_email('${email}')::text, '')`);
  const issued = () => Number(sql("select count(*) from public.waitlist_founding_ledger"));
  const positionOf = (email) => sql(`select coalesce((select position::text from public.waitlist_founding_ledger where email_key = public.waitlist_email_key('${email}')), '')`);
  let started = false;
  try {
    execFileSync(path.join(bin, "initdb"), ["-D", path.join(dir, "data"), "-U", "postgres", "-A", "trust"], { env, stdio: "ignore" });
    execFileSync(path.join(bin, "pg_ctl"), ["-D", path.join(dir, "data"), "-o", `-p ${port} -k ${dir} -c listen_addresses=''`, "-l", path.join(dir, "log"), "-w", "start"], { env, stdio: "ignore" });
    started = true;
    sql("create database t", "postgres");
    fs.writeFileSync(path.join(dir, "stub.sql"), SUPABASE_STUB);
    file(path.join(dir, "stub.sql"));
    const files = fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();
    const failed = [];
    for (const f of files) { try { file(path.join(MIGRATIONS, f)); } catch (e) { failed.push(`${f}: ${String(e.stderr || e.message).split("\n")[0]}`); } }
    t.eq(failed, [], `0 every migration applies in order (${files.length}, 0021 among them: ${files.includes("0021_founding_ledger_accounts.sql")})`);

    // The waitlist as production has it: households joined before 0014, one marked test, numbered once.
    for (let i = 1; i <= 6; i++) join(`early${i}@example.ca`);
    join("tester@example.ca", true);
    t.eq(sql("select public.waitlist_founding_start()"), "6", "1a (setup) the waitlist is numbered once: 6 households, the test row not counted");
    // An account confirmed before 0021's start(): it waits, and start() numbers it after the waitlist.
    const before = account("came-early@example.ca"); confirm(before);
    t.eq(positionOf("came-early@example.ca"), "", "5a until founding_accounts_start() runs, a confirmed account takes no number (the trigger is created disabled)");
    t.eq(sql("select public.founding_accounts_start()"), "1", "5b start() numbers the accounts already confirmed by link (1 here)…");
    t.eq(positionOf("came-early@example.ca"), "7", "5c …after every number the waitlist already holds (#7)");
    t.ok(/already run/.test(fails("select public.founding_accounts_start()") || ""), "5d a second start() raises an error and changes nothing");
    t.eq(issued(), 7, "5e (and the ledger still holds 7)");

    // 3. A waitlist address that later signs up in an app keeps its number.
    const w3 = account("early3@example.ca"); confirm(w3);
    t.eq([positionOf("early3@example.ca"), lookup("early3@example.ca"), String(issued())], ["3", "3", "7"],
      "3a a waitlist household (#3) that signs up in an app keeps #3; no second number is issued");
    sql("delete from public.waitlist where email = 'early3@example.ca'");
    t.eq(lookup("early3@example.ca"), "3", "3b …and keeps it when its waitlist row is deleted (the account is recorded against the number)");
    sql("delete from public.waitlist where email = 'early5@example.ca'");
    t.eq(lookup("early5@example.ca"), "", "3c (a waitlist household whose row was deleted and who has no account: no founding price, as 0016 had it)");
    const w5 = account("early5@example.ca"); confirm(w5);
    t.eq([positionOf("early5@example.ca"), lookup("early5@example.ca"), String(issued())], ["5", "5", "7"],
      "3d …until it signs up in an app: it gets its original #5 back, and still nothing new is issued");
    t.eq(join("early5@example.ca"), "5", "3e …and rejoining the waitlist gives the same #5 (0014's rule, unchanged)");

    // 4. Who never takes a position.
    const unconf = account("never-confirmed@example.ca");
    t.eq(positionOf("never-confirmed@example.ca"), "", "4a an account that never confirms its address takes no number");
    const auto = sql(`insert into auth.users (email, raw_app_meta_data, email_confirmed_at) values ('invited@example.ca', '{"email_confirmation":"auto"}', now()) returning id`);
    sql(`update auth.users set email_confirmed_at = now() + interval '1 second' where id = '${auto}'`);
    t.eq(positionOf("invited@example.ca"), "", "4b an account confirmed on creation (an invite code while signup was shut) takes no number");
    const own = account("amanda+test9@getgrowsmart.com"); confirm(own);
    const own2 = account("Test@FlourishMoney.app"); confirm(own2);
    t.eq([positionOf("amanda+test9@getgrowsmart.com"), positionOf("Test@FlourishMoney.app")], ["", ""], "4c the founder's own domains never take a number");
    const tst = account("tester@example.ca"); confirm(tst);
    t.eq(positionOf("tester@example.ca"), "", "4d an address on a waitlist test row never takes one through an account either");
    t.eq(issued(), 7, "4e (the ledger still holds 7)");
    void unconf;

    // 1. One ledger, arrival order, #50 and #51. Alternate a waitlist join and a confirmed account.
    let next = issued();
    const order = [];
    while (next < 49) {
      if (next % 2 === 0) { const e = `join${next}@example.ca`; join(e); order.push([e, positionOf(e)]); }
      else { const e = `acct${next}@example.ca`; confirm(account(e)); order.push([e, positionOf(e)]); }
      next = issued();
    }
    t.eq(order.map(([, p]) => p), order.map((_, i) => String(8 + i)), "1a waitlist joins and confirmed accounts take numbers from one sequence, in the order they arrive (#8 to #49)");
    const fifty = "fiftieth@example.ca"; confirm(account(fifty));
    t.eq([positionOf(fifty), lookup(fifty)], ["50", "50"], "1b the 50th household (an app signup) gets #50, and checkout's lookup finds it");
    const fiftyOne = "fiftyfirst@example.ca"; confirm(account(fiftyOne));
    t.eq([positionOf(fiftyOne), lookup(fiftyOne), String(issued())], ["", "", "50"], "1c the 51st (an app signup) never gets a number, and the ledger stops at 50");
    t.eq(join("fiftyfirst-web@example.ca"), "", "1d …nor does a 51st on the website's form");
    t.eq(sql("select count(distinct position) from public.waitlist_founding_ledger where position between 1 and 50"), "50", "1e 50 distinct numbers, 1 to 50");

    // 6. Checkout's rule, against this database: the real mayBuyFoundingPrice, its lookup answered here.
    const { mayBuyFoundingPrice } = require("../netlify/functions/_lib/foundingCohort.js");
    const admin = {
      rpc: async (name, args) => name === "waitlist_founding_position_for_email"
        ? { data: (() => { const v = sql(`select coalesce(public.waitlist_founding_position_for_email('${String(args.p_email).replace(/'/g, "''")}')::text, '')`); return v === "" ? null : Number(v); })(), error: null }
        : { data: null, error: { message: "not in this test" } },
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
    };
    const confirmedUser = (email) => ({ email, email_confirmed_at: "2026-10-17T00:00:00Z", app_metadata: { email_confirmation: "link" } });
    const idOf = (email) => sql(`select id from auth.users where email = '${email}'`);
    t.eq([await mayBuyFoundingPrice(admin, idOf(fifty), confirmedUser(fifty)), await mayBuyFoundingPrice(admin, idOf(fiftyOne), confirmedUser(fiftyOne))], [true, false],
      "6b checkout offers the founding price to #50 (an app signup) and refuses #51");
    t.eq(await mayBuyFoundingPrice(admin, idOf("early3@example.ca"), confirmedUser("early3@example.ca")), true,
      "6c …and to the waitlist household that signed up in an app later, after its waitlist row was deleted");
    t.eq(await mayBuyFoundingPrice(admin, idOf(fifty), { email: fifty, email_confirmed_at: null, app_metadata: { email_confirmation: "link" } }), false,
      "6d …never to an address the household has not confirmed");
    t.eq(await mayBuyFoundingPrice(admin, idOf("amanda+test9@getgrowsmart.com"), confirmedUser("amanda+test9@getgrowsmart.com")), false, "6e …nor to a test address");

    // 6. The landing count reads this ledger (founding.js counts its rows): 50 issued, 0 left.
    t.eq(sql("select greatest(0, 50 - count(*)) from public.waitlist_founding_ledger"), "0", "6f the count /api/founding takes (50 less the ledger's rows) includes the app signups: 0 left");

    // 2. Concurrency, in a second database so the first stays as it is.
    sql("create database c", "postgres");
    file(path.join(dir, "stub.sql"), "c");
    for (const f of files) file(path.join(MIGRATIONS, f), "c");
    const sqlc = (q) => sql(q, "c");
    for (let i = 1; i <= 10; i++) sqlc(`insert into public.waitlist (email) values ('w${i}@example.ca')`);
    sqlc("select public.waitlist_founding_start()"); sqlc("select public.founding_accounts_start()");
    const ids = [];
    for (let i = 1; i <= 30; i++) ids.push(sqlc(`insert into auth.users (email, raw_app_meta_data) values ('c${i}@example.ca', '{"email_confirmation":"link"}') returning id`));
    const run = (q) => new Promise((ok) => {
      const p = spawn(path.join(bin, "psql"), ["-h", dir, "-p", String(port), "-U", "postgres", "-d", "c", "-v", "ON_ERROR_STOP=1", "-qAtX", "-c", q], { env });
      p.on("close", (code) => ok(code));
    });
    // Exactly as many households as numbers left: 30 confirmations and 10 website joins at once, each after a
    // random pause, for the 40 numbers 11 to 50. Every one must get a number; a race lost to the primary key
    // (two reading the same count) would leave one without.
    const jobs = ids.map((id) => run(`select pg_sleep(random() * 0.2); update auth.users set email_confirmed_at = clock_timestamp() where id = '${id}'`));
    for (let i = 1; i <= 10; i++) jobs.push(run(`select pg_sleep(random() * 0.2); insert into public.waitlist (email) values ('cw${i}@example.ca')`));
    const codes = await Promise.all(jobs);
    t.eq(codes.filter((c) => c !== 0).length, 0, "2a 40 concurrent confirmations and joins all commit (nobody's confirmation fails because of the ledger)");
    t.eq(sqlc("select count(*) from auth.users u where u.email like 'c%@example.ca' and exists (select 1 from public.waitlist_founding_ledger l where l.email_key = public.waitlist_email_key(u.email))") + " " +
      sqlc("select count(founding_position) from public.waitlist where email like 'cw%'"), "30 10",
      "2d every one of the 40 got a number: all 30 confirmed accounts and all 10 website joins");
    t.eq(sqlc("select count(*) || ' ' || count(distinct position) || ' ' || max(position) from public.waitlist_founding_ledger"), "50 50 50",
      "2b they never share a number: 50 issued, 50 distinct, none past 50");
    t.eq(sqlc("select count(*) from public.waitlist w join public.waitlist_founding_ledger l on l.position = w.founding_position and l.email_key <> public.waitlist_email_key(w.email)"), "0",
      "2c every waitlist row's number is its own in the ledger");

    // 7. Nothing here can be called from the browser.
    const fns = ["founding_issue_for_key(text,text,uuid)", "founding_issue_for_account(uuid,text)", "founding_accounts_start()", "founding_on_account_confirmed()", "founding_test_address(text)", "waitlist_founding_position_for_email(text)"];
    t.eq(fns.filter((f) => sql(`select has_function_privilege('anon', 'public.${f}', 'execute') or has_function_privilege('authenticated', 'public.${f}', 'execute')`) === "t"), [],
      "7a no founding function is executable by anon or authenticated");
    t.eq(sql("select has_function_privilege('service_role', 'public.waitlist_founding_position_for_email(text)', 'execute')"), "t", "7b the service role (checkout) still calls the lookup");

    // 8. The rollback in 0021's header.
    const header = fs.readFileSync(path.join(MIGRATIONS, "0021_founding_ledger_accounts.sql"), "utf8");
    const rb = header.slice(header.indexOf("-- ROLLBACK"), header.indexOf("-- (tests/foundingLedger.sql.test.cjs"))
      .split("\n").filter((l) => l.startsWith("--   ")).map((l) => l.slice(5)).join("\n");
    fs.writeFileSync(path.join(dir, "rollback.sql"), rb);
    file(path.join(dir, "rollback.sql"), "c");
    t.eq(sqlc("select count(*) from information_schema.columns where table_schema='public' and table_name='waitlist_founding_ledger' and column_name in ('source','user_id')"), "0", "8a the rollback removes the two ledger columns…");
    t.eq(sqlc("select count(*) from pg_trigger where tgname='founding_account_confirmed'") + sqlc("select count(*) from pg_proc where proname like 'founding_%'"), "00", "8b …the trigger and every new function…");
    t.eq([sqlc("select coalesce(public.waitlist_founding_position_for_email('w4@example.ca')::text,'')"), sqlc("select coalesce(public.waitlist_founding_position_for_email('c1@example.ca')::text,'')")], ["4", ""],
      "8c …and the lookup is 0016's again: a waitlist row's number counts, an account-only number does not (it stays spent)");
    t.eq(sqlc("select count(*) from public.waitlist_founding_ledger"), "50", "8d (no issued number is freed by the rollback)");
  } catch (e) {
    t.ok(false, "the suite ran to the end: " + String((e && (e.stderr || e.message)) || e).split("\n").slice(0, 3).join(" | ").slice(0, 300));
  } finally {
    if (started) { try { execFileSync(path.join(bin, "pg_ctl"), ["-D", path.join(dir, "data"), "-m", "immediate", "stop"], { env, stdio: "ignore" }); } catch {} }
  }
  t.summary("FOUNDING LEDGER (sql)");
})();
