// tests/billingGrants.sql.test.cjs
// -----------------------------------------------------------------------------
// THE BILLING TABLES' GRANTS, IN A REAL POSTGRES (migration 0026, Amanda's decision 2026-10-20).
//
// Every migration runs, in order, in a throwaway Postgres on a stand-in for Supabase that gives every new
// public table its default grant (ALL to anon, authenticated and service_role, until 2026-10-30), which is
// how production got anon SELECT on public.subscriptions and authenticated SELECT on public.billing_events.
// Then:
//   1  before 0026 the check in its footer shows that state (it reproduces production's finding);
//   2  after 0026: anon has nothing on either table, a signed-in household may only SELECT subscriptions (its
//      select-own policy), nobody but the service role touches billing_events, and the service role keeps both;
//   3  a second run changes nothing, and the RLS select-own policy still lets a household read its own row only.
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
const M26 = path.join(MIGRATIONS, "0026_billing_grants.sql");
const SRC = fs.readFileSync(M26, "utf8");
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
const check = SRC.slice(SRC.indexOf("-- READ-ONLY CHECK")).split("\n").filter((l) => l.startsWith("--   ") && !/Expected after/.test(l))
  .map((l) => l.slice(5)).join("\n").split(";")[0] + ";";

function pgBin() {
  const c = [process.env.FOUNDING_PG_BIN, "/opt/homebrew/opt/postgresql@17/bin", "/usr/local/opt/postgresql@17/bin"];
  try { for (const v of fs.readdirSync("/usr/lib/postgresql").sort().reverse()) c.push(`/usr/lib/postgresql/${v}/bin`); } catch {}
  return c.find((d) => d && ["initdb", "pg_ctl", "psql"].every((b) => fs.existsSync(path.join(d, b)))) || null;
}
const freePort = () => new Promise((ok) => { const s = net.createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => ok(p)); }); });

(async () => {
  const t = create();
  const bin = pgBin();
  if (!bin) { t.ok(false, "0 a Postgres to run the migrations in"); t.summary("BILLING GRANTS (sql)"); return; }
  const env = { ...process.env, LC_ALL: "C", LANG: "C" };
  const dir = tempDir("pg");
  const port = await freePort();
  const psql = (args) => execFileSync(path.join(bin, "psql"), ["-h", dir, "-p", String(port), "-U", "postgres", "-d", "t", "-v", "ON_ERROR_STOP=1", "-qAtX", ...args], { env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const sql = (q) => psql(["-c", q]);
  const file = (f) => psql(["-f", f]);
  let started = false;
  try {
    execFileSync(path.join(bin, "initdb"), ["-D", path.join(dir, "data"), "-U", "postgres", "-A", "trust"], { env, stdio: "ignore" });
    execFileSync(path.join(bin, "pg_ctl"), ["-D", path.join(dir, "data"), "-o", `-p ${port} -k ${dir} -c listen_addresses=''`, "-l", path.join(dir, "log"), "-w", "start"], { env, stdio: "ignore" });
    started = true;
    execFileSync(path.join(bin, "psql"), ["-h", dir, "-p", String(port), "-U", "postgres", "-d", "postgres", "-qAtX", "-c", "create database t"], { env, stdio: "ignore" });
    fs.writeFileSync(path.join(dir, "stub.sql"), STUB); file(path.join(dir, "stub.sql"));
    const files = fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();
    const failed = [];
    for (const f of files.filter((f) => f < "0026")) { try { file(path.join(MIGRATIONS, f)); } catch (e) { failed.push(`${f}: ${String(e.stderr || e.message).split("\n").find((l) => /ERROR/.test(l)) || ""}`); } }
    t.eq(failed, [], "0a every migration before 0026 applies in order");
    fs.writeFileSync(path.join(dir, "check.sql"), check);
    t.ok(/^select has_table_privilege\('anon', 'public\.subscriptions'/.test(check), "0b (the check is read out of 0026's footer)");

    t.eq(file(path.join(dir, "check.sql")), "t|t|t|t|t|t", "1a before 0026: anon reaches subscriptions, a signed-in role can write it, and both reach billing_events, as in production");
    file(M26);
    t.eq(file(path.join(dir, "check.sql")), "f|t|f|f|f|t", "2a after 0026: anon nothing on either, signed-in SELECT only on subscriptions, nothing on billing_events; the service role keeps both");
    t.ok(/Expected after: false, true, false, false, false, true\./.test(SRC), "2b …which is what the footer says to expect");
    file(M26);
    t.eq(file(path.join(dir, "check.sql")), "f|t|f|f|f|t", "3a a second run changes nothing");
    // The select-own policy still works for a signed-in household, and only for its own row.
    const u1 = sql("insert into auth.users (email) values ('one@example.test') returning id");
    const u2 = sql("insert into auth.users (email) values ('two@example.test') returning id");
    sql(`insert into public.subscriptions (user_id, status) values ('${u1}', 'active'), ('${u2}', 'active')`);
    t.eq(sql(`set role authenticated; select set_config('request.jwt.claim.sub', '${u1}', false); select count(*) from public.subscriptions`).split("\n").pop(), "1",
      "3b a signed-in household still reads its own subscription row, and only its own");
    t.ok(/permission denied/.test((() => { try { sql("set role anon; select count(*) from public.subscriptions"); return ""; } catch (e) { return String(e.stderr || e.message); } })()), "3c anon is refused outright");
  } catch (e) {
    t.ok(false, "the suite ran to the end: " + String((e && (e.stderr || e.message)) || e).split("\n").slice(0, 3).join(" | ").slice(0, 300));
  } finally {
    if (started) { try { execFileSync(path.join(bin, "pg_ctl"), ["-D", path.join(dir, "data"), "-m", "immediate", "stop"], { env, stdio: "ignore" }); } catch {} }
  }
  t.summary("BILLING GRANTS (sql)");
})();
