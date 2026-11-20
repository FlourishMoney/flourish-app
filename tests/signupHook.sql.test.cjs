// tests/signupHook.sql.test.cjs
// -----------------------------------------------------------------------------
// MIGRATION 0048 (THE SIGNUP HOOK) IN A REAL POSTGRES (written, not run in production).
//   0  it applies, and a second time
//   1  Apple and Google may create an account; an email or phone sign-up, an anonymous one, or one with no provider is
//      refused with a 403 and a message (Supabase's "Before User Created" hook contract)
//   2  only supabase_auth_admin may run it: anon and authenticated (the Data API) may not
// Our own server creates email accounts with the admin API, which Supabase never sends through this hook.
// -----------------------------------------------------------------------------
"use strict";
const { tempDir } = require("./_tmp.cjs");
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");
const net = require("net");
const { execFileSync } = require("child_process");

const FILE = path.join(__dirname, "..", "supabase", "migrations", "0048_signup_hook.sql");
// As in Supabase: new functions in public are runnable by anon and authenticated unless a migration says otherwise.
const STUB = "create role anon nologin; create role authenticated nologin; create role supabase_auth_admin nologin;" +
  " alter default privileges in schema public grant execute on functions to anon, authenticated;";
function pgBin() {
  const c = [process.env.FOUNDING_PG_BIN, "/opt/homebrew/opt/postgresql@17/bin", "/usr/local/opt/postgresql@17/bin"];
  try { for (const v of fs.readdirSync("/usr/lib/postgresql").sort().reverse()) c.push(`/usr/lib/postgresql/${v}/bin`); } catch {}
  return c.find((d) => d && ["initdb", "pg_ctl", "psql"].every((b) => fs.existsSync(path.join(d, b)))) || null;
}
const freePort = () => new Promise((ok) => { const s = net.createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => ok(p)); }); });

(async () => {
  const t = create();
  const bin = pgBin();
  if (!bin) { t.ok(false, "0 a Postgres to run the migration in"); t.summary("SIGNUP HOOK (sql)"); return; }
  const env = { ...process.env, LC_ALL: "C", LANG: "C" };
  const dir = tempDir("pgh");
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
    t.ok(true, "0a 0048 applies, and a second time");

    const ask = (user) => JSON.parse(sql(`select public.flourish_before_user_created('${JSON.stringify({ metadata: { name: "before-user-created" }, user }).replace(/'/g, "''")}'::jsonb)`));
    const u = (provider, extra = {}) => ({ email: "new@example.invalid", app_metadata: provider ? { provider, providers: [provider] } : {}, is_anonymous: false, ...extra });
    t.eq([ask(u("google")), ask(u("apple"))], [{}, {}], "1a Apple and Google may create an account");
    for (const [label, user] of [["email", u("email")], ["phone", u("phone")], ["anonymous Google", u("google", { is_anonymous: true })], ["no provider", u(null)], ["another provider", u("discord")]]) {
      const r = ask(user);
      t.ok(r.error && r.error.http_code === 403 && /flourishmoney\.app/.test(r.error.message), `1b ${label}: refused with a 403 and where to sign up`);
    }
    t.ok(refused("set role anon; select public.flourish_before_user_created('{}'::jsonb)") && refused("set role authenticated; select public.flourish_before_user_created('{}'::jsonb)"),
      "2a anon and authenticated cannot run it");
    t.ok(!refused("set role supabase_auth_admin; select public.flourish_before_user_created('{}'::jsonb)"), "2b supabase_auth_admin can");
  } catch (e) {
    t.ok(false, `the suite ran: ${String(e.message).split("\n")[0]}`);
  } finally {
    if (started) try { execFileSync(path.join(bin, "pg_ctl"), ["-D", path.join(dir, "data"), "-m", "immediate", "stop"], { env, stdio: "ignore" }); } catch {}
  }
  t.summary("SIGNUP HOOK (sql)");
  setImmediate(() => process.exit(process.exitCode || 0));
})();
