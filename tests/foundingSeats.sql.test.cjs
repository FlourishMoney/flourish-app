// tests/foundingSeats.sql.test.cjs
// -----------------------------------------------------------------------------
// THE FIRST 50 WHO SUBSCRIBE, IN A REAL POSTGRES (migration 0029, Amanda's decision 2026-10-29).
//
// Every migration in supabase/migrations up to 0028 runs, in order, in a throwaway Postgres cluster started for
// this test and removed when it ends, on the same small stand-in for Supabase as tests/foundingLedger.sql.test.cjs.
// A database with founding subscriptions already paid is seeded, then:
//   0  0029's read-only dry run lists exactly the seats its backfill then records;
//   1  the backfill: every household that paid for founding holds a seat (live, or ended without a refund we can
//      see), in the order it subscribed; never a regular plan, a test address, a beta founder, or a founding row
//      that never ran; the waitlist ledger is not touched;
//   2  taking a seat: once per account, from the website, the App Store or Google Play; never a test address, a
//      beta founder or an account that does not exist;
//   3  the 50 cut-off: the 51st payment is still recorded (a store purchase at the same moment), marked over_cap,
//      and the count says 51;
//   4  a refund gives the seat back (by provider when one is named), once; the seat is not taken again;
//   5  concurrent payments at the last seats are counted one after another: none lost, over_cap exactly right;
//   6  nothing is readable or callable from the browser roles;
//   7  a second run of 0029 changes nothing; its rollback removes it and leaves the rest as it was.
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
const M29 = path.join(MIGRATIONS, "0029_founding_seats.sql");
const SRC29 = fs.readFileSync(M29, "utf8");

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
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
`;

// A block from 0029's footer, uncommented: the lines after `from` up to the next blank comment line.
function footerBlock(from) {
  const lines = SRC29.slice(SRC29.indexOf(from)).split("\n").slice(1);
  const out = [];
  for (const l of lines) { if (!l.startsWith("-- ")) break; out.push(l.slice(3)); }
  return out.join("\n");
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
  if (!bin) { t.ok(false, "0 a Postgres to run the migrations in (FOUNDING_PG_BIN, Homebrew postgresql@17, or /usr/lib/postgresql)"); t.summary("FOUNDING SEATS (sql)"); return; }
  const env = { ...process.env, LC_ALL: "C", LANG: "C" };
  const dir = tempDir("pg");
  const port = await freePort();
  const psql = (args, db) => execFileSync(path.join(bin, "psql"), ["-h", dir, "-p", String(port), "-U", "postgres", "-d", db, "-v", "ON_ERROR_STOP=1", "-qAtX", ...args], { env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const sql = (q, db = "t") => psql(["-c", q], db);
  const file = (f, db = "t") => psql(["-f", f], db);
  const fails = (q, db = "t") => { try { sql(q, db); return null; } catch (e) { return String(e.stderr || e.message); } };
  const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;
  const account = (email, db = "t") => sql(`insert into auth.users (email, email_confirmed_at, raw_app_meta_data) values (${lit(email)}, now(), '{"email_confirmation":"link"}') returning id`, db);
  const svc = (q, db = "t") => sql(`begin; select set_config('request.jwt.claims', '{"role":"service_role"}', true); ${q}; commit;`, db);
  const founder = (id, db = "t") => svc(`update public.profiles set founder_flag = true where user_id = '${id}'`, db);
  const subscribe = (id, { provider = "stripe", status = "active", plan = "founding_annual", locked = null, ended = null, updated = "2026-10-27 10:00:00+00" } = {}, db = "t") =>
    sql(`insert into public.subscriptions (user_id, provider, status, plan_key, founding_locked_at, founding_ended_at, updated_at, provider_subscription_id)
         values ('${id}', '${provider}', '${status}', '${plan}', ${locked ? lit(locked) : "null"}, ${ended ? lit(ended) : "null"}, ${lit(updated)}, ${provider === "stripe" ? lit("sub_" + id.slice(0, 8)) : "null"})`, db);
  const take = (id, provider = "stripe", db = "t") => sql(`select (case when taken then 't' else 'f' end) || ' ' || seats || ' ' || (case when over_cap then 't' else 'f' end) from public.founding_seat_take('${id}', '${provider}', null)`, db);
  const release = (id, provider = null, db = "t") => sql(`select public.founding_seat_release('${id}', 'refund', ${provider ? lit(provider) : "null"})`, db);
  const held = (db = "t") => Number(sql("select public.founding_seats_taken()", db));
  const files = fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();
  const before29 = files.filter((f) => f < "0029");
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
    t.eq(build("t", before29), [], `0a every migration before 0029 applies in order (${before29.length}, the last ${before29[before29.length - 1]})`);

    // ── The database before 0029: founding subscriptions already paid ────────────────────────────────
    for (let i = 1; i <= 5; i++) sql(`insert into public.waitlist (email) values ('w${i}@example.ca')`);
    const A = account("a.web.founder@example.ca");     subscribe(A, { locked: "2026-10-26 15:00:00+00" });                        // web, live
    const B = account("b.ended@example.ca");           subscribe(B, { status: "canceled", ended: "2026-10-28 09:00:00+00", updated: "2026-10-26 16:00:00+00" }); // ended
    const C = account("c.iphone@example.ca");          subscribe(C, { provider: "app_store", updated: "2026-10-27 08:00:00+00" });  // App Store, live
    const P = account("p.android@example.ca");         subscribe(P, { provider: "play_store", status: "trialing", updated: "2026-10-27 09:00:00+00" }); // Play
    const D = account("d.annual@example.ca");          subscribe(D, { plan: "annual" });                                          // regular plan
    const E = account("qa@getgrowsmart.com");          subscribe(E, { locked: "2026-10-26 14:00:00+00" });                        // test domain
    const F = account("f.beta@example.ca"); founder(F); subscribe(F, { locked: "2026-10-26 13:00:00+00" });                       // beta founder
    const G = account("g.never.ran@example.ca");       subscribe(G, { status: "incomplete" });                                    // never paid
    const ledgerBefore = sql("select coalesce(string_agg(position || ':' || email_key, ',' order by position), '') from public.waitlist_founding_ledger");

    // ── 0. the dry run ───────────────────────────────────────────────────────────────────────────────
    const dry = sql(footerBlock("-- READ-ONLY DRY RUN")).split("\n").map((l) => l.split("|")[0]);
    t.eq(dry, [A, B, C, P], "0b the dry run lists the four households that paid for founding, in the order they subscribed");
    t.ok(/does not exist/.test(fails("select public.founding_seats_taken()") || ""), "0d before 0029 the count does not exist: the server cannot count, and offers founding to nobody");

    // ── 1. the backfill ──────────────────────────────────────────────────────────────────────────────
    file(M29);
    t.eq(sql("select string_agg(user_id::text || ':' || provider || ':' || source || ':' || over_cap, ',' order by taken_at) from public.founding_seats"),
      [`${A}:stripe:backfill:false`, `${B}:stripe:backfill:false`, `${C}:app_store:backfill:false`, `${P}:play_store:backfill:false`].join(","),
      "1a every household that paid for founding holds a seat, on its own provider, in the order it subscribed (an ended one too)");
    t.eq(held(), 4, "1b four seats held: 46 founding spots left");
    t.eq(sql(`select provider_ref from public.founding_seats where user_id = '${A}'`), `sub_${A.slice(0, 8)}`, "1c a web seat names its Stripe subscription");
    t.eq(sql(`select count(*) from public.founding_seats where user_id in ('${D}', '${E}', '${F}', '${G}')`), "0", "1d never a regular plan, a test address, a beta founder, or a founding row that never ran");
    t.eq(sql("select coalesce(string_agg(position || ':' || email_key, ',' order by position), '') from public.waitlist_founding_ledger"), ledgerBefore, "1e the waitlist ledger is exactly as it was");

    // ── 2. taking a seat ─────────────────────────────────────────────────────────────────────────────
    const H = account("h.new.household@example.ca");
    t.eq(take(H, "stripe"), "t 5 f", "2a a new household's first founding payment takes seat 5");
    t.eq(take(H, "app_store"), "f 5 f", "2b …once: a second call (a webhook retry, a store sync) changes nothing");
    const I = account("i.iphone@example.ca"), J = account("j.android@example.ca");
    t.eq([take(I, "app_store"), take(J, "play_store")], ["t 6 f", "t 7 f"], "2c the App Store and Google Play take seats the same way");
    t.eq([take(E), take(F), take("00000000-0000-4000-8000-000000000999")], ["f 7 f", "f 7 f", "f 7 f"], "2d never a test address, a beta founder, or an account that does not exist");
    t.ok(/check/.test(fails(`select public.founding_seat_take('${account("k@example.ca")}', 'paypal', null)`) || ""), "2e only the three providers");

    // ── 3. the 50 cut-off ────────────────────────────────────────────────────────────────────────────
    for (let k = held() + 1; k <= 50; k++) t.eq(take(account(`fill${k}@example.ca`), "stripe").startsWith("t "), true, `(fill) seat ${k}`);
    t.eq(held(), 50, "3a 50 seats held");
    const late = account("late.iphone@example.ca");
    t.eq(take(late, "app_store"), "t 51 t", "3b the 51st payment (a store purchase at the same moment) is still recorded: honoured, marked over the cap");
    t.eq([held(), sql("select count(*) from public.founding_seats where over_cap")], [51, "1"], "3c the count says 51, and the one over the cap is marked");

    // ── 4. refunds ───────────────────────────────────────────────────────────────────────────────────
    t.eq(release(late, "stripe"), "f", "4a a Stripe refund never frees a store purchase's seat");
    t.eq(release(late, "app_store"), "t", "4b the store's refund gives it back");
    t.eq([release(late, "app_store"), held()], ["f", 50], "4c …once; 50 held again");
    t.eq(release(H), "t", "4d a refund with no provider named releases the account's seat");
    t.eq([held(), take(H, "stripe")], [49, "f 49 f"], "4e a seat is free again, and the refunded account does not take it back by itself");
    t.eq(sql(`select release_reason from public.founding_seats where user_id = '${H}'`), "refund", "4f the row is kept, marked refunded");
    t.ok(/check/.test(fails(`update public.founding_seats set release_reason = 'lost' where user_id = '${H}'`) || ""), "4g a release is a refund or nothing");

    // ── 5. concurrent payments at the last seats ────────────────────────────────────────────────────
    t.eq(build("c", files), [], "5a (a second database, every migration applied, 0029 included)");
    for (let k = 1; k <= 47; k++) take(account(`c${k}@example.ca`, "c"), "stripe", "c");
    const racers = [];
    for (let k = 1; k <= 8; k++) racers.push(account(`race${k}@example.ca`, "c"));
    const run = (q) => new Promise((ok) => {
      const p = spawn(path.join(bin, "psql"), ["-h", dir, "-p", String(port), "-U", "postgres", "-d", "c", "-v", "ON_ERROR_STOP=1", "-qAtX", "-c", q], { env });
      p.on("close", (code) => ok(code));
    });
    const codes = await Promise.all(racers.map((id, i) => run(`select pg_sleep(random() * 0.2); select public.founding_seat_take('${id}', '${i % 2 ? "app_store" : "play_store"}', null)`)));
    t.eq(codes.filter((c) => c !== 0).length, 0, "5b eight payments at once for the last 3 seats all commit (a payment is never refused)");
    t.eq(sql("select count(*) || ' ' || count(*) filter (where over_cap) || ' ' || count(distinct user_id) from public.founding_seats", "c"), "55 5 55",
      "5c 55 seats recorded, exactly the 5 past 50 marked over the cap, one per account");

    // ── 6. nothing for the browser ───────────────────────────────────────────────────────────────────
    for (const role of ["anon", "authenticated"]) {
      t.ok(/permission denied/.test(fails(`set role ${role}; select count(*) from public.founding_seats`) || ""), `6a ${role} cannot read founding_seats`);
      for (const f of ["founding_seats_taken()", `founding_seat_take('${A}', 'stripe', null)`, `founding_seat_release('${A}', 'refund', null)`, `founding_seat_excluded('${A}')`]) {
        t.ok(/permission denied/.test(fails(`set role ${role}; select public.${f}`) || ""), `6b ${role} cannot call ${f.split("(")[0]}`);
      }
    }
    t.eq(sql("set role service_role; select public.founding_seats_taken()"), "49", "6c the service role can count");

    // ── 7. a second run, and the rollback ────────────────────────────────────────────────────────────
    const snap = sql("select string_agg(user_id || ':' || coalesce(released_at::text, '-'), ',' order by user_id) from public.founding_seats");
    file(M29);
    t.eq(sql("select string_agg(user_id || ':' || coalesce(released_at::text, '-'), ',' order by user_id) from public.founding_seats"), snap, "7a a second run of 0029 changes nothing (the backfill skips accounts that already hold a row, refunded ones too)");
    // (Accounts confirmed since still take ledger numbers through 0025's trigger: 0029 leaves that alone.)
    const ledgerNow = sql("select coalesce(string_agg(position || ':' || email_key, ',' order by position), '') from public.waitlist_founding_ledger");
    sql(footerBlock("-- ROLLBACK"));
    t.eq(sql("select count(*) from pg_proc where proname like 'founding_seat%'") + " " + sql("select to_regclass('public.founding_seats') is null"), "0 t", "7b the rollback removes the table and its functions");
    t.eq(sql("select coalesce(string_agg(position || ':' || email_key, ',' order by position), '') from public.waitlist_founding_ledger"), ledgerNow, "7c …and leaves the waitlist ledger exactly as it was");
    t.eq(sql("select count(*) from public.subscriptions"), "8", "7d …and every subscription row is still there");
  } catch (e) {
    t.ok(false, `the suite ran to the end: ${String(e.stderr || e.message).split("\n").slice(0, 3).join(" | ")}`);
  } finally {
    if (started) { try { execFileSync(path.join(bin, "pg_ctl"), ["-D", path.join(dir, "data"), "-m", "immediate", "stop"], { env, stdio: "ignore" }); } catch {} }
  }
  t.summary("FOUNDING SEATS (sql)");
})();
