// tests/storeMigrations.sql.test.cjs
// -----------------------------------------------------------------------------
// MIGRATIONS 0020 AND 0022, IN A REAL POSTGRES, IN PRODUCTION'S ORDER (version 1.1, in-app purchase).
//
// Production already has every migration but these two (0025 and 0026 went live on 2026-10-20), so 0020 and
// 0022 run last, on top of all of them, in a throwaway Postgres on the same Supabase stand-in as
// billingGrants.sql.test.cjs. Then:
//   1  0020's footer check reads exactly what it says to expect, and the rows a store purchase writes go in;
//      a provider we do not use is still refused;
//   2  0022 adds the two nullable flag columns, and its footer check reads as stated;
//   3  a second run of both changes nothing (still exactly one provider check per table);
//   4  0020 replaces the old 'stripe'-only check whatever it is called, so it cannot survive under another name;
//   5  0026's grants still hold after both (anon nothing; a household SELECT only, its own row);
//   6  the rollbacks in the footers run, and 0020's refuses while a store row exists, changing nothing.
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
const M20 = path.join(MIGRATIONS, "0020_store_subscriptions.sql");
const M22 = path.join(MIGRATIONS, "0022_store_support_flags.sql");
const S20 = fs.readFileSync(M20, "utf8");
const S22 = fs.readFileSync(M22, "utf8");
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
  if (!bin) { t.ok(false, "0 a Postgres to run the migrations in"); t.summary("STORE MIGRATIONS (sql)"); return; }
  const env = { ...process.env, LC_ALL: "C", LANG: "C" };
  const dir = tempDir("pg");
  const port = await freePort();
  const psql = (args) => execFileSync(path.join(bin, "psql"), ["-h", dir, "-p", String(port), "-U", "postgres", "-d", "t", "-v", "ON_ERROR_STOP=1", "-qAtX", ...args], { env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const sql = (q) => psql(["-c", q]);
  const file = (f) => psql(["-f", f]);
  const refused = (q) => { try { sql(q); return ""; } catch (e) { return String(e.stderr || e.message); } };
  const write = (name, body) => { const f = path.join(dir, name); fs.writeFileSync(f, body); return f; };
  let started = false;
  try {
    execFileSync(path.join(bin, "initdb"), ["-D", path.join(dir, "data"), "-U", "postgres", "-A", "trust"], { env, stdio: "ignore" });
    execFileSync(path.join(bin, "pg_ctl"), ["-D", path.join(dir, "data"), "-o", `-p ${port} -k ${dir} -c listen_addresses=''`, "-l", path.join(dir, "log"), "-w", "start"], { env, stdio: "ignore" });
    started = true;
    execFileSync(path.join(bin, "psql"), ["-h", dir, "-p", String(port), "-U", "postgres", "-d", "postgres", "-qAtX", "-c", "create database t"], { env, stdio: "ignore" });
    file(write("stub.sql", STUB));
    const live = fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql") && !/^002[02]_/.test(f)).sort();
    const failed = [];
    for (const f of live) { try { file(path.join(MIGRATIONS, f)); } catch (e) { failed.push(`${f}: ${String(e.stderr || e.message).split("\n").find((l) => /ERROR/.test(l)) || ""}`); } }
    t.eq(failed, [], "0a every migration production has (0025 and 0026 included) applies in order");
    t.ok(live.includes("0025_founding_ledger.sql") && live.includes("0026_billing_grants.sql"), "0b (0025 and 0026 ran before 0020 and 0022, as in production)");

    const u1 = sql("insert into auth.users (email) values ('one@example.test') returning id");
    const u2 = sql("insert into auth.users (email) values ('two@example.test') returning id");
    sql(`insert into public.subscriptions (user_id, provider, status, plan_key) values ('${u1}', 'stripe', 'active', 'annual')`);
    t.ok(/subscriptions_provider_check/.test(refused(`insert into public.subscriptions (user_id, provider, status) values ('${u2}', 'app_store', 'active')`)), "0c before 0020: a store row is refused, as in production today");

    // ── 1. 0020 ─────────────────────────────────────────────────────────────────────────────────
    const check20 = write("check20.sql", footer(S20, "-- CHECK AFTERWARDS (read-only):"));
    file(M20);
    const expect20 = "billing_events|CHECK ((provider = ANY (ARRAY['stripe'::text, 'revenuecat'::text])))\nsubscriptions|CHECK ((provider = ANY (ARRAY['stripe'::text, 'app_store'::text, 'play_store'::text])))";
    t.eq(file(check20), expect20, "1a 0020's footer check reads exactly two rows, the widened checks");
    t.ok(S20.includes("--   billing_events | CHECK ((provider = ANY (ARRAY['stripe'::text, 'revenuecat'::text])))") && S20.includes("--   subscriptions  | CHECK ((provider = ANY (ARRAY['stripe'::text, 'app_store'::text, 'play_store'::text])))"),
      "1b …which is what the footer says to expect");
    sql(`insert into public.subscriptions (user_id, provider, status, plan_key, provider_subscription_id) values ('${u2}', 'app_store', 'active', 'founding_annual', '2000000123456789')`);
    sql(`insert into public.billing_events (event_id, provider, type, status) values ('rc-evt-1', 'revenuecat', 'INITIAL_PURCHASE', 'received')`);
    t.eq(sql("select provider || ':' || status from public.subscriptions order by provider"), "app_store:active\nstripe:active", "1c a store row goes in beside a web one, and the web row is untouched");
    t.ok(/subscriptions_provider_check/.test(refused(`update public.subscriptions set provider = 'paypal' where user_id = '${u2}'`)) && /billing_events_provider_check/.test(refused(`insert into public.billing_events (event_id, provider, type) values ('x', 'paypal', 'x')`)),
      "1d a provider we do not use is still refused, on both tables");

    // ── 2. 0022 ─────────────────────────────────────────────────────────────────────────────────
    const check22 = write("check22.sql", footer(S22, "-- CHECK AFTERWARDS (read-only):"));
    file(M22);
    t.eq(file(check22), "support_flag|text|YES\nsupport_flag_at|timestamp with time zone|YES", "2a 0022 adds the two nullable flag columns; its footer check reads as stated");
    t.ok(/Expected: support_flag \| text \| YES, then support_flag_at \| timestamp with time zone \| YES\./.test(S22), "2b …which is what the footer says to expect");
    t.eq(sql(`select count(*) from public.subscriptions where support_flag is not null or support_flag_at is not null`), "0", "2c no existing row changes");

    // ── 3. A second run changes nothing ──────────────────────────────────────────────────────────
    file(M20); file(M22);
    t.eq([file(check20), file(check22)], [expect20, "support_flag|text|YES\nsupport_flag_at|timestamp with time zone|YES"], "3a a second run of both changes nothing: still one provider check per table");

    // ── 4. Whatever the old check is called ──────────────────────────────────────────────────────
    sql("alter table public.subscriptions drop constraint subscriptions_provider_check; alter table public.subscriptions add constraint some_other_name check (provider in ('stripe','app_store','play_store'));");
    sql("alter table public.billing_events drop constraint billing_events_provider_check; alter table public.billing_events add constraint legacy_provider check (provider in ('stripe','revenuecat'));");
    file(M20);
    t.eq(file(check20), expect20, "4a an old provider check under another name is replaced, not left beside the new one");
    t.eq(sql("select count(*) from pg_constraint where conname in ('some_other_name', 'legacy_provider')"), "0", "4b …and no other provider check is left");

    // ── 5. 0026's grants still hold ──────────────────────────────────────────────────────────────
    t.eq(sql("select has_table_privilege('anon', 'public.subscriptions', 'select') || '|' || has_table_privilege('authenticated', 'public.subscriptions', 'update') || '|' || has_table_privilege('authenticated', 'public.billing_events', 'select') || '|' || has_table_privilege('authenticated', 'public.subscriptions', 'select')"),
      "false|false|false|true", "5a after both: anon nothing, a household reads subscriptions only, nobody signed in reaches billing_events");
    t.eq(sql(`set role authenticated; select set_config('request.jwt.claim.sub', '${u1}', false); select count(*) from public.subscriptions`).split("\n").pop(), "1", "5b a household still reads its own row only");

    // ── 6. The rollbacks ─────────────────────────────────────────────────────────────────────────
    const back20 = write("back20.sql", footer(S20, "-- ROLLBACK (only while no store row or RevenueCat event exists; it fails, changing nothing, if one does):"));
    const back22 = write("back22.sql", footer(S22, "-- ROLLBACK:"));
    t.ok(/check \(provider in \('stripe'\)\)/.test(fs.readFileSync(back20, "utf8")), "6a (0020's rollback is read out of its footer)");
    t.ok(/violated by some row|check constraint/.test((() => { try { file(back20); return ""; } catch (e) { return String(e.stderr || e.message); } })()) && file(check20) === expect20,
      "6b with a store row present, 0020's rollback refuses and changes nothing");
    sql("delete from public.subscriptions where provider <> 'stripe'; delete from public.billing_events where provider <> 'stripe';");
    file(back22); file(back20);
    t.eq([file(check22), file(check20)], ["", "billing_events|CHECK ((provider = 'stripe'::text))\nsubscriptions|CHECK ((provider = 'stripe'::text))"],
      "6c without one, both rollbacks put production's state back");
  } catch (e) {
    t.ok(false, "the suite ran to the end: " + String((e && (e.stderr || e.message)) || e).split("\n").slice(0, 3).join(" | ").slice(0, 300));
  } finally {
    if (started) { try { execFileSync(path.join(bin, "pg_ctl"), ["-D", path.join(dir, "data"), "-m", "immediate", "stop"], { env, stdio: "ignore" }); } catch {} }
  }
  t.summary("STORE MIGRATIONS (sql)");
})();
