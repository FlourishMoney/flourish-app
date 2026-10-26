// tests/foundingFriendsFamily.sql.test.cjs
// -----------------------------------------------------------------------------
// THE ONE-TIME SQL FOR FRIENDS AND FAMILY (Amanda, 2026-10-25), IN A REAL POSTGRES ON EVERY MIGRATION.
//
// supabase/one-time/2026-10-25_founding_friends_family.sql records a personal relationship on the pre-2026-10-01
// founding holders. Here, on the same Supabase stand-in as storeMigrations.sql.test.cjs:
//   1  the dry run counts exactly the rows in scope (real, not unsubscribed, pre-2026-10-01, a founding number, no
//      basis, nothing sent), and the file writes the basis on exactly those, merged into their metadata, changing
//      nothing else on them and nothing on any other row
//   2  not exactly 11: it stops, and nothing is written; run twice: the second run stops, nothing changes
//   3  the check afterwards reads as its footer says; the rollback takes the basis off unsent rows only
//   4  the rows it writes are the ones the sweep's rule then opens to the founding link email
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
const ONE = path.join(__dirname, "..", "supabase", "one-time", "2026-10-25_founding_friends_family.sql");
const SRC = fs.readFileSync(ONE, "utf8");
const C = require("../netlify/functions/_lib/waitlistConsent.js");
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


(async () => {
  const t = create();
  const bin = pgBin();
  if (!bin) { t.ok(false, "0 a Postgres to run the file in"); t.summary("FRIENDS AND FAMILY (sql)"); return; }
  const env = { ...process.env, LC_ALL: "C", LANG: "C" };
  const dir = tempDir("pg");
  const port = await freePort();
  const psql = (args) => execFileSync(path.join(bin, "psql"), ["-h", dir, "-p", String(port), "-U", "postgres", "-d", "t", "-v", "ON_ERROR_STOP=1", "-qAtX", ...args], { env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const sql = (q) => psql(["-c", q]);
  const file = (f) => psql(["-f", f]);
  const fails = (f) => { try { file(f); return ""; } catch (e) { return String(e.stderr || e.message); } };
  const write = (name, body) => { const f = path.join(dir, name); fs.writeFileSync(f, body); return f; };
  let started = false;
  try {
    execFileSync(path.join(bin, "initdb"), ["-D", path.join(dir, "data"), "-U", "postgres", "-A", "trust"], { env, stdio: "ignore" });
    execFileSync(path.join(bin, "pg_ctl"), ["-D", path.join(dir, "data"), "-o", `-p ${port} -k ${dir} -c listen_addresses=''`, "-l", path.join(dir, "log"), "-w", "start"], { env, stdio: "ignore" });
    started = true;
    execFileSync(path.join(bin, "psql"), ["-h", dir, "-p", String(port), "-U", "postgres", "-d", "postgres", "-qAtX", "-c", "create database t"], { env, stdio: "ignore" });
    file(write("stub.sql", STUB));
    const failed = [];
    for (const f of fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
      try { file(path.join(MIGRATIONS, f)); } catch (e) { failed.push(`${f}: ${String(e.stderr || e.message).split("\n").find((l) => /ERROR/.test(l)) || ""}`); }
    }
    t.eq(failed, [], "0a every migration applies in order");

    // The waitlist as production has it on 2026-10-25. Founding numbers are the database's own (0014/0025), issued on
    // insert in created_at order; the shapes that hold none are made so after.
    const ins = (email, version, created, extra = "") => sql(`insert into public.waitlist (email, country, source, consent_version, consented_at, created_at, metadata${extra ? ", " + extra.split("=")[0] : ""}) values ('${email}', 'CA', 'direct', '${version}', '${created}', '${created}', '{"placement":"landing"}'::jsonb${extra ? ", " + extra.split("=")[1] : ""}) returning id`);
    for (let i = 1; i <= 11; i++) ins(`friend${i}@example.test`, "pre-2026-10-01", `2026-09-${String(i + 5).padStart(2, "0")}T12:00:00Z`);
    ins("friend-unsub@example.test", "pre-2026-10-01", "2026-09-27T12:00:00Z");
    ins("early-no-number@example.test", "2026-10-06", "2026-09-28T12:00:00Z");
    for (const [e, v] of [["newer1@example.test", "2026-10-01"], ["newer2@example.test", "2026-10-01"], ["newer3@example.test", "2026-10-06"], ["newer4@example.test", "2026-10-06"]]) ins(e, v, "2026-10-08T12:00:00Z");
    ins("tester@flourishmoney.app", "pre-2026-10-01", "2026-09-29T12:00:00Z");
    sql("update public.waitlist set unsubscribed_at = now() where email = 'friend-unsub@example.test'");
    // The shapes production holds: numbers 1 to 11 for the friends, 12 for the unsubscribed friend, 13 to 16 for the
    // newer holders, none for the 2026-10-06 row and the test row (which is a test row).
    sql("update public.waitlist w set founding_position = n.p from (select id, row_number() over (order by created_at, email) as p from public.waitlist where email like 'friend%' or email like 'newer%') n where n.id = w.id");
    sql("update public.waitlist set is_test = true, founding_position = null where email = 'tester@flourishmoney.app'");
    const numbered = sql("select count(*) from public.waitlist where founding_position is not null and consent_version = 'pre-2026-10-01' and is_test = false and unsubscribed_at is null");
    t.eq(numbered, "11", "0b (eleven real, subscribed pre-2026-10-01 rows hold a founding number, as in production)");
    t.eq(sql("select is_test::text || '|' || coalesce(founding_position::text, '-') from public.waitlist where email = 'tester@flourishmoney.app'"), "true|-", "0c (a test address is a test row with no number)");
    const before = sql("select md5(string_agg(id::text || email || consent_version || coalesce(consented_at::text,'') || coalesce(founding_position::text,'') || coalesce(unsubscribed_at::text,'') || is_test::text, ',' order by id)) from public.waitlist");
    const metaBefore = sql("select md5(string_agg(id::text || coalesce(metadata::text,''), ',' order by id)) from public.waitlist where not (consent_version = 'pre-2026-10-01' and is_test = false and unsubscribed_at is null and founding_position is not null)");

    // ── 1. The dry run, then the file ──────────────────────────────────────────────────────────────
    const dry = write("dry.sql", footer(SRC, "-- DRY RUN (run first; changes nothing; the count only, no email, no id):"));
    t.ok(/select count\(\*\) as friends_and_family/.test(fs.readFileSync(dry, "utf8")), "1a (the dry run is read out of the file's own footer)");
    t.eq(file(dry), "11", "1b the dry run counts 11");
    // The ledger check runs, read-only, against 0025's own lookup (the stand-in has no ledger entries, so it reads 0 here).
    const ledgerSql = SRC.slice(SRC.indexOf("--   select count(*) filter (where public.waitlist_founding_number_for_email")).split("\n").filter((l) => l.startsWith("--   ")).slice(0, 6).map((l) => l.slice(5)).join("\n");
    t.ok(/honoured_by_billing/.test(ledgerSql) && /^\d+$/.test(psql(["-c", ledgerSql])), "1b2 the ledger check runs read-only and gives one count");
    file(ONE);
    t.eq(sql("select count(*) from public.waitlist where metadata->'consent_basis'->>'type' = 'personal_relationship'"), "11", "1c the basis is on 11 rows");
    t.eq(sql("select metadata::text from public.waitlist where email = 'friend3@example.test'"),
      '{"placement": "landing", "consent_basis": {"note": "friends and family, per founder", "type": "personal_relationship", "stated_at": "2026-10-25", "stated_by": "Amanda Holt"}}',
      "1d …merged into each row's metadata, exactly as stated, keeping what was there");
    t.eq(sql("select md5(string_agg(id::text || email || consent_version || coalesce(consented_at::text,'') || coalesce(founding_position::text,'') || coalesce(unsubscribed_at::text,'') || is_test::text, ',' order by id)) from public.waitlist"), before,
      "1e nothing else on any row changes: consent_version, consented_at, founding numbers, unsubscribed, is_test");
    t.eq(sql("select md5(string_agg(id::text || coalesce(metadata::text,''), ',' order by id)) from public.waitlist where not (consent_version = 'pre-2026-10-01' and is_test = false and unsubscribed_at is null and founding_position is not null)"), metaBefore,
      "1f …and no row outside the scope is touched at all (the unsubscribed friend, the test row, the newer rows)");

    // ── 2. Exactly 11, or nothing ──────────────────────────────────────────────────────────────────
    t.ok(/expected 11 rows, found 0\. Nothing was changed\./.test(fails(ONE)), "2a run twice: the second run stops (it finds 0)");
    t.eq(sql("select count(*) from public.waitlist where metadata->'consent_basis'->>'type' = 'personal_relationship'"), "11", "2b …and nothing changes");
    const back = write("back.sql", footer(SRC, "-- ROLLBACK (only before the email goes out; a row already sent keeps its record):"));
    sql(`update public.waitlist set metadata = metadata || '{"founding_link":{"sent_at":"2026-10-26T00:00:00Z","kind":"founding_link"}}'::jsonb where email = 'friend1@example.test'`);
    file(back);
    t.eq(sql("select count(*) from public.waitlist where metadata ? 'consent_basis'"), "1", "3a the rollback takes the basis off every unsent row, and keeps the one already sent (its record)");
    sql("update public.waitlist set metadata = metadata - 'founding_link' - 'consent_basis' where email = 'friend1@example.test'");
    sql("update public.waitlist set unsubscribed_at = now() where email = 'friend2@example.test'");
    t.ok(/expected 11 rows, found 10\. Nothing was changed\./.test(fails(ONE)), "2c ten in scope (one unsubscribed since): it stops");
    t.eq(sql("select count(*) from public.waitlist where metadata ? 'consent_basis'"), "0", "2d …and nothing is written");
    sql("update public.waitlist set unsubscribed_at = null where email = 'friend2@example.test'");
    file(ONE);

    // ── 3. The check afterwards ────────────────────────────────────────────────────────────────────
    const check = write("check.sql", footer(SRC, "-- CHECK AFTERWARDS (read-only; counts only):"));
    t.eq(file(check), "11|0", "3b the check afterwards reads 11|0");
    t.ok(/Expected: 11\|0/.test(SRC), "3c …which is what the footer says to expect");

    // ── 4. The rule then opens exactly those rows ──────────────────────────────────────────────────
    const rows = JSON.parse(sql("select json_agg(json_build_object('email', email, 'consent_version', consent_version, 'founding_position', founding_position, 'is_test', is_test, 'unsubscribed_at', unsubscribed_at, 'metadata', metadata)) from public.waitlist"));
    const kinds = {};
    for (const r of rows.filter((r) => !r.is_test)) { const k = C.foundingEmailKindFor(r, { launched: true }); kinds[k] = (kinds[k] || 0) + 1; }
    t.eq(rows.filter((r) => !r.is_test && r.consent_version === "pre-2026-10-01" && r.founding_position && !r.unsubscribed_at).map((r) => C.foundingEmailKindFor(r, { launched: true })),
      Array(11).fill("founding_link"), "4a every row the file wrote is opened to the founding link email by the sweep's rule");
    t.eq(rows.filter((r) => r.unsubscribed_at || r.is_test).map((r) => !!C.foundingEmailKindFor(r, { launched: true }) && !r.is_test), [false, false], "4b the unsubscribed friend and the test row: nothing");
  } catch (e) {
    t.ok(false, "the suite ran to the end: " + String((e && (e.stderr || e.message)) || e).split("\n").slice(0, 3).join(" | ").slice(0, 300));
  } finally {
    if (started) { try { execFileSync(path.join(bin, "pg_ctl"), ["-D", path.join(dir, "data"), "-m", "immediate", "stop"], { env, stdio: "ignore" }); } catch {} }
  }
  t.summary("FRIENDS AND FAMILY (sql)");
})();
