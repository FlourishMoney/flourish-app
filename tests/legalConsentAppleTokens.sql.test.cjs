// tests/legalConsentAppleTokens.sql.test.cjs
// -----------------------------------------------------------------------------
// MIGRATION 0049 (THE CONSENT RECORD AND THE SEALED APPLE TOKENS) IN A REAL POSTGRES (written, not run in production).
//   0  it applies, and a second time
//   1  legal_consents: one row per account per consent; a retried send changes nothing; a bad platform or id is refused
//   2  apple_tokens: one row per account per client; only "ios" and "web"
//   3  both go with the account (on delete cascade)
//   4  only our server: row level security on; anon and authenticated (the Data API) can neither read nor write either
// -----------------------------------------------------------------------------
"use strict";
const { tempDir } = require("./_tmp.cjs");
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");
const net = require("net");
const { execFileSync } = require("child_process");

const FILE = path.join(__dirname, "..", "supabase", "migrations", "0049_legal_consent_apple_tokens.sql");
// As in Supabase: auth.users exists, and new tables in public are open to anon and authenticated unless a migration says otherwise.
const STUB = "create role anon nologin; create role authenticated nologin; create role service_role nologin;" +
  " create schema auth; create table auth.users (id uuid primary key);" +
  " alter default privileges in schema public grant all on tables to anon, authenticated;" +
  " grant usage on schema public to anon, authenticated, service_role;";
function pgBin() {
  const c = [process.env.FOUNDING_PG_BIN, "/opt/homebrew/opt/postgresql@17/bin", "/usr/local/opt/postgresql@17/bin"];
  try { for (const v of fs.readdirSync("/usr/lib/postgresql").sort().reverse()) c.push(`/usr/lib/postgresql/${v}/bin`); } catch {}
  return c.find((d) => d && ["initdb", "pg_ctl", "psql"].every((b) => fs.existsSync(path.join(d, b)))) || null;
}
const freePort = () => new Promise((ok) => { const s = net.createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => ok(p)); }); });
const U1 = "00000000-0000-4000-8000-000000000001", U2 = "00000000-0000-4000-8000-000000000002";

(async () => {
  const t = create();
  const bin = pgBin();
  if (!bin) { t.ok(false, "0 a Postgres to run the migration in"); t.summary("CONSENT + APPLE TOKENS (sql)"); return; }
  const env = { ...process.env, LC_ALL: "C", LANG: "C" };
  const dir = tempDir("pgc");
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
    psql(["-f", FILE]);
    psql(["-f", FILE]);
    t.ok(true, "0a 0049 applies, and a second time");
    sql(`insert into auth.users values ('${U1}'), ('${U2}')`);

    const consent = (u, extra = "") => `insert into public.legal_consents (user_id, consent_id, words, terms_version, privacy_version, shown_at, platform)
      values ('${u}', 'onboarding-2026-11-12', '{"title":"Before you start"}', '2026-10-14', '2026-10-26', now(), ${extra || "'ios'"})`;
    sql(consent(U1));
    sql(consent(U1) + " on conflict (user_id, consent_id) do nothing");
    t.eq(sql("select count(*) from public.legal_consents"), "1", "1a one row per account per consent: a retried send changes nothing");
    t.ok(refused(consent(U2, "'windows'")), "1b a platform that is not web, ios or android is refused");
    t.ok(refused(consent(U2).replace("onboarding-2026-11-12", "Not An Id!")), "1c a consent id that is not one is refused");
    t.ok(sql("select recorded_at is not null from public.legal_consents") === "t", "1d the server's time is written");

    sql(`insert into public.apple_tokens (user_id, client, sealed) values ('${U1}', 'ios', 'v1.x'), ('${U1}', 'web', 'v1.y')`);
    t.ok(refused(`insert into public.apple_tokens (user_id, client, sealed) values ('${U1}', 'ios', 'v1.z')`), "2a one row per account per client");
    t.ok(refused(`insert into public.apple_tokens (user_id, client, sealed) values ('${U2}', 'android', 'v1.z')`), "2b only ios and web");

    sql(`delete from auth.users where id = '${U1}'`);
    t.eq([sql("select count(*) from public.legal_consents"), sql("select count(*) from public.apple_tokens")], ["0", "0"], "3a both go with the account");

    t.eq(sql("select string_agg(relname || '=' || relrowsecurity, ',' order by relname) from pg_class where relname in ('legal_consents','apple_tokens')"), "apple_tokens=true,legal_consents=true", "4a row level security on both");
    for (const role of ["anon", "authenticated"]) {
      for (const table of ["legal_consents", "apple_tokens"]) {
        t.ok(refused(`set role ${role}; select * from public.${table}`), `4b ${role} cannot read ${table}`);
        t.ok(refused(`set role ${role}; insert into public.${table} (user_id) values ('${U2}')`), `4c ${role} cannot write ${table}`);
      }
    }
    t.ok(!refused("set role service_role; select count(*) from public.apple_tokens; select count(*) from public.legal_consents"), "4d our server can");
  } catch (e) {
    t.ok(false, `the suite ran: ${String(e.message).split("\n")[0]}`);
  } finally {
    if (started) try { execFileSync(path.join(bin, "pg_ctl"), ["-D", path.join(dir, "data"), "-m", "immediate", "stop"], { env, stdio: "ignore" }); } catch {}
  }
  t.summary("CONSENT + APPLE TOKENS (sql)");
  setImmediate(() => process.exit(process.exitCode || 0));
})();
