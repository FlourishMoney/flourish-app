// tests/foundingLedger.sql.test.cjs
// -----------------------------------------------------------------------------
// THE FOUNDING 50, IN A REAL POSTGRES (migration 0025, Amanda's decision 2026-10-20; it replaces 0017 and 0021).
//
// Every migration in supabase/migrations up to 0024 runs, in order, in a throwaway Postgres cluster started for
// this test and removed when it ends, on a small stand-in for what Supabase provides (the API roles with
// Supabase's default grants, auth.users, auth.sessions, auth.jwt(), the extensions schema). A ledger shaped like
// production's on 2026-10-20 is seeded: 33 numbers issued, 1 to 15 and 22 held by waitlist households, the
// twelve Amanda confirmed were her test sign-ups (16 to 21, 23 to 28, issued 2026-10-08 to 10-10, rows deleted),
// and 29 to 33 since, one at a test domain and one a beta founder's. Then:
//   0  the dry run in 0025's footer predicts, from that database, exactly what 0025 then does;
//   1  0025 voids the test numbers and the beta founder's, keeps every real household's number, and numbers the
//      accounts already confirmed by link after the highest number, in confirmation order;
//   2  waitlist joins and confirmed accounts then take numbers from one sequence, past 50 when numbers were
//      voided, until exactly 50 real households hold one; the 51st never does, from either side;
//   3  who never holds a seat: test rows and test addresses (also when marked later, which frees the seat),
//      beta founders, accounts confirmed on creation, accounts never confirmed;
//   4  checkout's own rule (_lib/foundingCohort.js mayBuyFoundingPrice) against this database: since 2026-10-29
//      (the first 50 who subscribe, migration 0032) it no longer reads this ledger: every confirmed household
//      while seats are left, number or not; never a test address; a beta founder still through the flag;
//   5  a second run of 0025 changes nothing, and founding_accounts_start() runs once;
//   6  concurrent confirmations and joins never share a number, and the cap holds under the race;
//   7  nothing is callable or readable from the browser roles;
//   8  the rollback in 0025's footer returns the database to what 0016 left (one inert trigger aside).
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
const M25 = path.join(MIGRATIONS, "0025_founding_ledger.sql");
const SRC25 = fs.readFileSync(M25, "utf8");

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
-- Supabase's grant to the API roles on a new public table (until 2026-10-30): a browser role is refused only
-- where a migration revokes.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
`;

// A block from 0025's footer, uncommented.
function footerBlock(from, to) {
  const s = SRC25.slice(SRC25.indexOf(from), to ? SRC25.indexOf(to) : undefined);
  return s.split("\n").filter((l) => l.startsWith("--   ")).map((l) => l.slice(5)).join("\n");
}

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
  const psql = (args, db) => execFileSync(path.join(bin, "psql"), ["-h", dir, "-p", String(port), "-U", "postgres", "-d", db, "-v", "ON_ERROR_STOP=1", "-qAtX", ...args], { env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const sql = (q, db = "t") => psql(["-c", q], db);
  const file = (f, db = "t") => psql(["-f", f], db);
  const fails = (q, db = "t") => { try { sql(q, db); return null; } catch (e) { return String(e.stderr || e.message); } };
  const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;
  // An account as beta.js creates it with signup open: unconfirmed, email_confirmation "link".
  const account = (email, how = "link", db = "t") => sql(`insert into auth.users (email, raw_app_meta_data) values (${lit(email)}, '{"email_confirmation":"${how}"}') returning id`, db);
  const confirm = (id, db = "t") => sql(`update auth.users set email_confirmed_at = clock_timestamp() where id = '${id}'`, db);
  const svc = (q, db = "t") => sql(`begin; select set_config('request.jwt.claims', '{"role":"service_role"}', true); ${q}; commit;`, db);
  const founder = (id, db = "t") => svc(`update public.profiles set founder_flag = true where user_id = '${id}'`, db);
  const join = (email, db = "t") => sql(`insert into public.waitlist (email) values (${lit(email)}) returning coalesce(founding_position::text, '')`, db);
  const numberOf = (email, db = "t") => sql(`select coalesce((select position::text from public.waitlist_founding_ledger where email_key = public.waitlist_email_key(${lit(email)})), '')`, db);
  const lookup = (email, db = "t") => sql(`select coalesce(public.waitlist_founding_number_for_email(${lit(email)})::text, '')`, db);
  const holders = (db = "t") => Number(sql("select count(*) from public.waitlist_founding_ledger where void_at is null", db));
  const ledgerSnapshot = (db = "t") => sql("select string_agg(position || ':' || coalesce(void_reason, '-') || ':' || source || ':' || (user_id is not null), ',' order by position) from public.waitlist_founding_ledger", db);
  const files = fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();
  const before25 = files.filter((f) => f < "0025");
  let started = false;
  try {
    execFileSync(path.join(bin, "initdb"), ["-D", path.join(dir, "data"), "-U", "postgres", "-A", "trust"], { env, stdio: "ignore" });
    execFileSync(path.join(bin, "pg_ctl"), ["-D", path.join(dir, "data"), "-o", `-p ${port} -k ${dir} -c listen_addresses=''`, "-l", path.join(dir, "log"), "-w", "start"], { env, stdio: "ignore" });
    started = true;
    fs.writeFileSync(path.join(dir, "stub.sql"), SUPABASE_STUB);
    const build = (db, list) => {
      psql(["-c", `create database ${db}`], "postgres");
      file(path.join(dir, "stub.sql"), db);
      const failed = [];
      for (const f of list) { try { file(path.join(MIGRATIONS, f), db); } catch (e) { failed.push(`${f}: ${String(e.stderr || e.message).split("\n").find((l) => /ERROR/.test(l)) || ""}`); } }
      return failed;
    };
    t.eq(files.filter((f) => /^00(17|21)_/.test(f)), [], "0a 0017 and 0021 are gone: 0025 replaces both");
    t.eq(build("t", before25), [], `0b every migration before 0025 applies in order (${before25.length}, the last ${before25[before25.length - 1]})`);

    // ── Production on 2026-10-20 ──────────────────────────────────────────────────────────────────────
    const at = (n, iso) => sql(`update public.waitlist_founding_ledger set issued_at = '${iso}' where position = ${n}`);
    for (let i = 1; i <= 15; i++) sql(`insert into public.waitlist (email, created_at) values ('real${i}@example.ca', timestamptz '2026-10-01 12:00:00+00' + interval '${i} minutes')`);
    sql("insert into public.waitlist (email, is_test) values ('tester@example.ca', true)");
    t.eq(sql("select public.waitlist_founding_start()"), "15", "(setup) 0014's start() numbers the first 15 households");
    for (let n = 1; n <= 15; n++) at(n, "2026-10-07 06:00:00+00");
    const orphan = (n, day) => { const e = `amanda.test${n}@example.ca`; t.eq(join(e), String(n), `(setup) Amanda's test sign-up takes #${n}`); at(n, `2026-10-${day} 02:00:00+00`); sql(`delete from public.waitlist where email = ${lit(e)}`); };
    for (const n of [16, 17, 18, 19, 20, 21]) orphan(n, "09");
    t.eq(join("real22@example.ca"), "22", "(setup) a real household takes #22"); at(22, "2026-10-09 12:00:00+00");
    for (const n of [23, 24, 25, 26, 27, 28]) orphan(n, "10");
    t.eq(join("real29@example.ca"), "29", "(setup) #29 after 2026-10-14");
    t.eq(join("real30@example.ca"), "30", "(setup) #30");
    t.eq(join("amanda@getgrowsmart.com"), "31", "(setup) #31, a test-domain address 0014 numbered like anyone");
    t.eq(join("beta.founder@example.ca"), "32", "(setup) #32, a beta founder's address on the waitlist");
    t.eq(join("real33@example.ca"), "33", "(setup) #33");
    const bf = account("beta.founder@example.ca", "auto"); confirm(bf); founder(bf);
    // Accounts already confirmed by link, before 0025, in this confirmation order.
    const a1 = account("app.first@example.ca"); confirm(a1);
    const a3 = account("real3@example.ca"); confirm(a3);                  // a waitlist household's address: keeps #3
    const a2 = account("app.second@example.ca"); confirm(a2);
    const aT = account("qa@flourishmoney.app"); confirm(aT);              // test domain
    const aF = account("founder.in.app@example.ca"); founder(aF); confirm(aF);   // a beta founder confirmed by link
    const aA = account("invited@example.ca", "auto"); confirm(aA);        // confirmed on creation
    account("never.confirmed@example.ca");                                // never confirmed
    const a4 = account("app.third@example.ca"); confirm(a4);
    t.eq([Number(sql("select count(*) from public.waitlist_founding_ledger")), 50 - Number(sql("select count(*) from public.waitlist_founding_ledger"))], [33, 17],
      "(setup) 33 issued: /api/founding reads 17 spots left today");

    // ── 0. The dry run, before 0025 ───────────────────────────────────────────────────────────────────
    fs.writeFileSync(path.join(dir, "dry.sql"), footerBlock("-- READ-ONLY DRY RUN", "-- READ-ONLY CHECK AFTERWARDS"));
    const dry = file(path.join(dir, "dry.sql")).split("|");
    t.eq(dry, ["33", "17", "{31}", "{16,17,18,19,20,21,23,24,25,26,27,28}", "{32}", "5", "19", "3", "3", "28"],
      "0c the dry run: 33 issued, 17 left now; void #31 (test domain), the twelve confirmed orphans and #32 (a beta founder); 5 issued since Oct 14; 19 real holders; 3 accounts to number; 28 left after");
    t.eq(sql("select count(*) from information_schema.columns where table_name = 'waitlist_founding_ledger' and column_name = 'void_at'"), "0", "0d (the dry run ran on the schema before 0025)");

    // ── 1. 0025 ──────────────────────────────────────────────────────────────────────────────────────────
    file(M25);
    fs.writeFileSync(path.join(dir, "check.sql"), footerBlock("-- READ-ONLY CHECK AFTERWARDS", "-- A TEST ACCOUNT"));
    const check = file(path.join(dir, "check.sql")).split("|");
    t.eq(check, ["36", "22", "28", "13", "1", "3", "37", "t"],
      "1a the check after: 36 issued, 22 real holders, 28 left (the dry run's figure), 13 test voids, 1 beta founder void, 3 from accounts, next #37, accounts take seats");
    t.eq([numberOf("app.first@example.ca"), numberOf("app.second@example.ca"), numberOf("app.third@example.ca")], ["34", "35", "36"],
      "1b the accounts already confirmed by link are numbered after #33, in the order they confirmed");
    t.eq([numberOf("real3@example.ca"), sql(`select user_id = '${a3}' from public.waitlist_founding_ledger where position = 3`)], ["3", "t"],
      "1c a waitlist household that confirmed an account keeps #3, recorded against the account; nothing new issued");
    t.eq(sql("select string_agg(founding_position::text, ',' order by founding_position) from public.waitlist where founding_position is not null and not is_test").split(",").map(Number),
      [...Array.from({ length: 15 }, (_, i) => i + 1), 22, 29, 30, 33], "1d every real waitlist household keeps its own number");
    t.eq([sql("select is_test::text || coalesce(founding_position::text, '-') from public.waitlist where email = 'amanda@getgrowsmart.com'"),
          sql("select coalesce(founding_position::text, '-') from public.waitlist where email = 'beta.founder@example.ca'")], ["true-", "-"],
      "1e the test-domain row is a test row now, without its number; the beta founder's row keeps no number");
    t.eq(sql("select string_agg(waitlist_id is not null || ':' || founding_position || ':' || reason, ',' order by founding_position) from public.founding_0025_cleared"), "true:31:test,true:32:beta_founder",
      "1f both cleared positions are kept for the rollback");
    t.eq([numberOf("qa@flourishmoney.app"), numberOf("founder.in.app@example.ca"), numberOf("invited@example.ca"), numberOf("never.confirmed@example.ca")], ["", "", "", ""],
      "1g no number for a test-domain account, a beta founder's account, an account confirmed on creation or one never confirmed");

    // ── 2. One sequence, past 50, exactly 50 real households ─────────────────────────────────────────
    const arrivals = [];
    let i = 0;
    while (holders() < 49 && i < 40) {   // bounded: a broken cap must fail here, never loop
      const e = i % 2 === 0 ? `join${i}@example.ca` : `acct${i}@example.ca`;
      if (i % 2 === 0) join(e); else confirm(account(e));
      arrivals.push(numberOf(e)); i++;
    }
    t.eq(arrivals.map(Number), Array.from({ length: arrivals.length }, (_, k) => 37 + k),
      `2a waitlist joins and confirmed accounts take numbers from one sequence, in arrival order (#37 to #${36 + arrivals.length})`);
    const fiftieth = "fiftieth@example.ca"; confirm(account(fiftieth));
    t.eq([numberOf(fiftieth), lookup(fiftieth), String(holders())], ["64", "64", "50"], "2b the 50th real household (an app signup) gets #64, past 50 because 14 numbers were voided, and checkout finds it");
    const fiftyFirst = "fiftyfirst@example.ca"; confirm(account(fiftyFirst));
    t.eq([numberOf(fiftyFirst), join("fiftyfirst-web@example.ca"), String(holders())], ["", "", "50"], "2c the 51st never gets one, from an app or the website's form");
    t.eq(sql("select greatest(0, 50 - count(*)) from public.waitlist_founding_ledger where void_at is null"), "0", "2d /api/founding's count (real holders, void_at is null): 0 left");

    // ── 3. Marking a test row later frees its seat ─────────────────────────────────────────────────────
    const freed = sql("select founding_position from public.waitlist where email = 'join0@example.ca'");
    sql("update public.waitlist set is_test = true where email = 'join0@example.ca'");
    t.eq([sql(`select void_reason from public.waitlist_founding_ledger where position = ${freed}`), sql("select coalesce(founding_position::text, '-') from public.waitlist where email = 'join0@example.ca'"), lookup("join0@example.ca"), String(holders())],
      ["test", "-", "", "49"], "3a a row marked is_test later: its number is voided, the row cleared, checkout refuses it, and a seat is free");
    t.eq(join("next.household@example.ca"), "65", "3b …which the next real household takes, as #65");
    sql("update public.waitlist set is_test = false where email = 'join0@example.ca'");
    t.eq([lookup("join0@example.ca"), sql(`select void_reason from public.waitlist_founding_ledger where position = ${freed}`)], ["", "test"], "3c unmarking it does not bring the number back (void is final)");
    t.eq(join("someone@sub.getgrowsmart.com"), "", "3d a subdomain of a test domain is a test address too");

    // ── 4. Checkout's rule, against this database: it no longer reads the ledger ────────────────────────
    const { mayBuyFoundingPrice } = require("../netlify/functions/_lib/foundingCohort.js");
    const idOf = (email) => sql(`select id from auth.users where email = ${lit(email)}`);
    const asked = [];
    const admin = {
      rpc: async (name, args) => { asked.push(name); return name === "waitlist_founding_number_for_email"
        ? { data: (() => { const v = lookup(args.p_email); return v === "" ? null : Number(v); })(), error: null }
        : name === "founding_seats_taken" ? { data: 0, error: null } : { data: null, error: { message: `not in this test: ${name}` } }; },
      from: (table) => ({ select: () => ({ eq: (_c, uid) => ({ maybeSingle: async () => ({
        data: table === "profiles" ? { founder_flag: sql(`select coalesce((select founder_flag::text from public.profiles where user_id = '${uid}'), 'false')`) === "true" } : null,
        error: null }) }) }) }),
    };
    const linkUser = (email) => ({ email, email_confirmed_at: "2026-10-20T00:00:00Z", app_metadata: { email_confirmation: "link" } });
    const buy = (email) => mayBuyFoundingPrice(admin, idOf(email), linkUser(email));
    t.eq([await buy(fiftieth), await buy(fiftyFirst)], [true, true], "4a the 50th real waitlist household (#64) and the 51st alike: seats are left, numbers do not decide");
    t.eq([await buy("app.first@example.ca"), await buy("real3@example.ca")], [true, true], "4b …an account numbered by 0025, and a waitlist household that signed up in an app");
    t.eq(asked.filter((n) => n !== "founding_seats_taken"), [], "4c …and the ledger is never asked");
    t.eq([await buy("amanda@getgrowsmart.com"), await buy("qa@flourishmoney.app")], [false, false], "4d never to a test address");
    t.eq(await mayBuyFoundingPrice(admin, bf, { email: "beta.founder@example.ca", email_confirmed_at: "2026-10-01T00:00:00Z", app_metadata: {} }), true,
      "4f a beta founder keeps the founding price through the flag, outside the 50, with no number");
    t.eq(await mayBuyFoundingPrice(admin, idOf(fiftieth), { email: fiftieth, email_confirmed_at: null, app_metadata: { email_confirmation: "link" } }), false,
      "4g never to an address the household has not confirmed");
    t.eq(lookup("amanda.test16@example.ca"), "", "4h (the ledger itself is unchanged) a confirmed orphan's number is still void");
    t.eq(sql("select public.waitlist_founding_position_for_email('app.first@example.ca')"), "34", "4i 0016's lookup name gives the same answer");

    // ── 5. A second run changes nothing; start() runs once ──────────────────────────────────────────────
    const snap = ledgerSnapshot();
    file(M25);
    t.eq(ledgerSnapshot(), snap, "5a a second run of 0025 changes nothing");
    t.ok(/already run/.test(fails("select public.founding_accounts_start()") || ""), "5b a second founding_accounts_start() raises and changes nothing");
    t.eq(ledgerSnapshot(), snap, "5c (the ledger is unchanged)");

    // ── 6. Concurrency, in a second database ────────────────────────────────────────────────────────────
    t.eq(build("c", files), [], "6a (a second database, every migration applied, 0025 included)");
    for (let k = 1; k <= 10; k++) sql(`insert into public.waitlist (email) values ('w${k}@example.ca')`, "c");
    sql("select public.waitlist_founding_start()", "c");
    sql("update public.waitlist set is_test = true where email in ('w1@example.ca', 'w2@example.ca')", "c");   // 2 voids: 8 real holders
    const ids = [];
    for (let k = 1; k <= 30; k++) ids.push(account(`c${k}@example.ca`, "link", "c"));
    const run = (q) => new Promise((ok) => {
      const p = spawn(path.join(bin, "psql"), ["-h", dir, "-p", String(port), "-U", "postgres", "-d", "c", "-v", "ON_ERROR_STOP=1", "-qAtX", "-c", q], { env });
      p.on("close", (code) => ok(code));
    });
    // 30 confirmations and 14 website joins at once for the 42 seats left: two must be refused, none may share.
    const jobs = ids.map((id) => run(`select pg_sleep(random() * 0.2); update auth.users set email_confirmed_at = clock_timestamp() where id = '${id}'`));
    for (let k = 1; k <= 14; k++) jobs.push(run(`select pg_sleep(random() * 0.2); insert into public.waitlist (email) values ('cw${k}@example.ca')`));
    const codes = await Promise.all(jobs);
    t.eq(codes.filter((c) => c !== 0).length, 0, "6b 44 concurrent confirmations and joins all commit (nobody's confirmation or join fails because of the ledger)");
    t.eq(sql("select count(*) filter (where void_at is null) || ' ' || count(distinct position) || ' ' || count(*) from public.waitlist_founding_ledger", "c"), "50 52 52",
      "6c exactly 50 real holders, every number distinct: the cap holds under the race");
    t.eq(sql("select count(*) from public.waitlist w join public.waitlist_founding_ledger l on l.position = w.founding_position and l.email_key <> public.waitlist_email_key(w.email)", "c"), "0",
      "6d every waitlist row's number is its own in the ledger");

    // ── 7. Nothing for the browser ───────────────────────────────────────────────────────────────────────
    const fns = ["waitlist_is_test_email(text)", "founding_is_beta_founder_key(text)", "founding_issue_for_key(text,text,uuid)", "founding_issue_for_account(uuid,text)",
      "founding_accounts_start()", "founding_on_account_confirmed()", "waitlist_assign_founding_position()", "waitlist_void_founding_on_test()",
      "waitlist_founding_number_for_email(text)", "waitlist_founding_position_for_email(text)"];
    t.eq(fns.filter((f) => sql(`select has_function_privilege('anon', 'public.${f}', 'execute') or has_function_privilege('authenticated', 'public.${f}', 'execute')`) === "t"), [],
      "7a no founding function is executable by anon or authenticated");
    t.eq(["waitlist_founding_ledger", "founding_settings", "founding_0025_cleared"].filter((tb) => sql(`select has_table_privilege('anon', 'public.${tb}', 'select') or has_table_privilege('authenticated', 'public.${tb}', 'select')`) === "t"), [],
      "7b no founding table is readable by anon or authenticated");
    t.eq(sql("select has_function_privilege('service_role', 'public.waitlist_founding_number_for_email(text)', 'execute')"), "t", "7c the service role (checkout) calls the lookup");

    // ── 8. The rollback ─────────────────────────────────────────────────────────────────────────────────
    const rb = footerBlock("-- ROLLBACK");
    t.ok(/^begin;[\s\S]*commit;$/.test(rb) && !/alter table auth\.users|drop trigger[^;]*auth\.users/.test(rb), "8a (the rollback is one block, and it never alters auth.users, which Supabase's auth admin owns)");
    fs.writeFileSync(path.join(dir, "rb.sql"), rb);
    const issuedBefore = sql("select count(*) from public.waitlist_founding_ledger");
    file(path.join(dir, "rb.sql"));
    t.eq(sql("select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'waitlist_founding_ledger' and column_name in ('source', 'user_id', 'void_at', 'void_reason')"), "0", "8b the rollback removes the four ledger columns…");
    t.eq(sql("select count(*) from pg_proc where proname in ('founding_issue_for_key', 'founding_issue_for_account', 'founding_accounts_start', 'founding_is_beta_founder_key', 'waitlist_founding_number_for_email', 'waitlist_is_test_email', 'waitlist_void_founding_on_test')")
      + sql("select count(*) from pg_class where relname in ('founding_settings', 'founding_0025_cleared')"), "00", "8c …every new function and table…");
    t.eq(sql("select coalesce(founding_position::text, '-') from public.waitlist where email = 'beta.founder@example.ca'"), "32", "8d …puts back the waitlist position 0025 cleared…");
    t.eq([sql("select coalesce(public.waitlist_founding_position_for_email('real22@example.ca')::text, '')"), sql("select coalesce(public.waitlist_founding_position_for_email('app.first@example.ca')::text, '')")], ["22", ""],
      "8e …and the lookup is 0016's again: a waitlist row's number counts, an account-only number does not (it stays spent)");
    t.eq([sql("select count(*) from public.waitlist_founding_ledger"), sql("select count(*) from pg_constraint where conname = 'waitlist_founding_ledger_position_check'")], [issuedBefore, "0"],
      "8f no issued number is freed, and the 1 to 50 check stays off because numbers past 50 were issued");
    const after = account("after.rollback@example.ca"); confirm(after);
    t.eq(numberOf("after.rollback@example.ca"), "", "8g the trigger left on auth.users does nothing: a confirmation after the rollback takes no number");
  } catch (e) {
    t.ok(false, "the suite ran to the end: " + String((e && (e.stderr || e.message)) || e).split("\n").slice(0, 3).join(" | ").slice(0, 300));
  } finally {
    if (started) { try { execFileSync(path.join(bin, "pg_ctl"), ["-D", path.join(dir, "data"), "-m", "immediate", "stop"], { env, stdio: "ignore" }); } catch {} }
  }
  t.summary("FOUNDING LEDGER (sql)");
})();
