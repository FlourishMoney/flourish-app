// tests/household.sql.test.cjs
// -----------------------------------------------------------------------------
// COUPLE MODE'S SECURITY, IN A REAL POSTGRES (migrations 0030 + 0031, not yet run in production).
//
// Every migration runs, in order, in a throwaway Postgres on a stand-in for Supabase (the roles, auth.uid()
// from the JWT claim, and production's user_data, which no migration in this repo creates). Then, as a
// signed-in user, exactly as the app's own requests would be:
//   1  the grants: anon has nothing, a signed-in user only what 0030's footer says, and nobody signed in
//      reaches 0031's tables or calls a function that changes membership;
//   2  a NON-MEMBER reads nothing and writes nothing on any household table, and cannot read the
//      household's meeting records;
//   3  invites: the link and the code work once, for the invited address only; expired, used, revoked and
//      wrong-address invites are refused; two joins at the same moment cannot both use one invite; ten
//      failed tries in an hour stop an account; a third adult cannot join;
//   4  members share the blob; the app cannot set the version or move the row;
//   5  a REMOVED partner loses access in the same transaction, their banks leave the shared blob, and their
//      own row is deleted (they start fresh);
//   6  the owner deleting their account makes the partner the owner; the last one out takes the data with them.
// Postgres comes from FOUNDING_PG_BIN, Homebrew (postgresql@17) or GitHub's Ubuntu runner (/usr/lib/postgresql).
// -----------------------------------------------------------------------------
"use strict";
const { tempDir } = require("./_tmp.cjs");
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");
const net = require("net");
const { execFileSync, spawn } = require("child_process");

const MIGRATIONS = path.join(__dirname, "..", "supabase", "migrations");
const M30 = fs.readFileSync(path.join(MIGRATIONS, "0030_couple_household.sql"), "utf8");
const M31 = fs.readFileSync(path.join(MIGRATIONS, "0031_couple_household_private.sql"), "utf8");
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
-- production's user_data (no migration in this repo creates it; docs/ops/SUPABASE-GRANTS.md "Two gaps")
create table if not exists public.user_data (user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb, schema_version integer not null default 1, updated_at timestamptz not null default now());
alter table public.user_data enable row level security;
create policy user_data_own on public.user_data for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
`;
const footerCheck = (src) => src.slice(src.indexOf("-- READ-ONLY CHECK")).split("\n").filter((l) => l.startsWith("--   ") && !/Expected after/.test(l))
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
  if (!bin) { t.ok(false, "0 a Postgres to run the migrations in"); t.summary("HOUSEHOLD (sql)"); return; }
  const env = { ...process.env, LC_ALL: "C", LANG: "C" };
  const dir = tempDir("pg");
  const port = await freePort();
  const psqlArgs = (args) => ["-h", dir, "-p", String(port), "-U", "postgres", "-d", "t", "-v", "ON_ERROR_STOP=1", "-qAtX", ...args];
  const psql = (args) => execFileSync(path.join(bin, "psql"), psqlArgs(args), { env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const sql = (q) => psql(["-c", q]);
  const file = (f) => psql(["-f", f]);
  const last = (s) => s.split("\n").pop();
  const err = (fn) => { try { fn(); return ""; } catch (e) { return String(e.stderr || e.message); } };
  // As a signed-in user (the app's own requests), as anon, and as the Netlify functions (service role).
  const as = (uid, q) => last(sql(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false); ${q}`));
  const anon = (q) => last(sql(`set role anon; ${q}`));
  const svc = (fn) => JSON.parse(last(sql(`set role service_role; select public.${fn}`)));
  const count = (uid, q) => as(uid, `select count(*) from (${q}) x`);
  const updated = (uid, q) => as(uid, `with u as (${q} returning 1) select count(*) from u`);
  let started = false;
  try {
    execFileSync(path.join(bin, "initdb"), ["-D", path.join(dir, "data"), "-U", "postgres", "-A", "trust"], { env, stdio: "ignore" });
    execFileSync(path.join(bin, "pg_ctl"), ["-D", path.join(dir, "data"), "-o", `-p ${port} -k ${dir} -c listen_addresses=''`, "-l", path.join(dir, "log"), "-w", "start"], { env, stdio: "ignore" });
    started = true;
    execFileSync(path.join(bin, "psql"), ["-h", dir, "-p", String(port), "-U", "postgres", "-d", "postgres", "-qAtX", "-c", "create database t"], { env, stdio: "ignore" });
    fs.writeFileSync(path.join(dir, "stub.sql"), STUB); file(path.join(dir, "stub.sql"));
    const files = fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();
    const failed = [];
    for (const f of files) { try { file(path.join(MIGRATIONS, f)); } catch (e) { failed.push(`${f}: ${String(e.stderr || e.message).split("\n").find((l) => /ERROR/.test(l)) || ""}`); } }
    t.eq(failed, [], "0a every migration applies in order, 0030 and 0031 included");
    t.ok(files.indexOf("0030_couple_household.sql") < files.indexOf("0031_couple_household_private.sql"), "0b 0030 runs before 0031");
    for (const f of ["0030_couple_household.sql", "0031_couple_household_private.sql"]) {
      const again = err(() => file(path.join(MIGRATIONS, f)));
      t.eq(again, "", `0c ${f} runs a second time without error`);
    }

    // 1 GRANTS ------------------------------------------------------------------------------------------------
    fs.writeFileSync(path.join(dir, "c30.sql"), footerCheck(M30));
    fs.writeFileSync(path.join(dir, "c31.sql"), footerCheck(M31));
    t.eq(file(path.join(dir, "c30.sql")), "f|t|t|f|f|t", "1a 0030: anon nothing; signed in: select the blob, update its data only, never its version, never insert a member");
    t.ok(/Expected after: false, true, true, false, false, true\./.test(M30), "1b …which is what 0030's footer says to expect");
    t.eq(file(path.join(dir, "c31.sql")), "f|f|f|t", "1c 0031: nobody signed in reaches the invites or the cursors, or calls the join; the service role does");
    t.ok(/Expected after: false, false, false, true\./.test(M31), "1d …which is what 0031's footer says to expect");
    const fnRoles = sql(`select string_agg(p.proname || ':' || has_function_privilege('authenticated', p.oid, 'execute')::text, ',' order by p.proname)
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'household\\_%'`);
    t.ok(fnRoles.split(",").every((x) => x.endsWith(":false")), `1e no household_* function is callable by a signed-in user (${fnRoles})`);

    // Four people. O owns the household, P is invited, S is a stranger, T is a third adult.
    const id = (email) => sql(`insert into auth.users (email, email_confirmed_at) values ('${email}', now()) returning id`);
    const O = id("owner@example.test"), P = id("partner@example.test"), S = id("stranger@example.test"), T = id("third@example.test");
    const blob = { userId: O, core: { onboarded: true, appData: { profile: { name: "Owner" }, bills: [{ id: "b1", name: "Rent" }],
      accounts: [{ id: "a-own", _item: "item-O" }, { id: "a-part", _item: "item-P" }, { id: "a-hand" }],
      transactions: [{ id: "t1", account_id: "a-own" }, { id: "t2", account_id: "a-part" }, { id: "t3", account_id: "a-hand" }],
      liabilities: [{ account_id: "a-part" }, { account_id: "a-own" }] } }, sideKeys: { flourish_streak: "3" } };
    sql(`insert into public.user_data (user_id, data) values ('${O}', '${JSON.stringify(blob)}'::jsonb), ('${P}', '{"core":{"appData":{"bills":[{"id":"p-own"}]}}}'::jsonb)`);
    sql(`insert into public.plaid_items (user_id, item_id, access_token) values ('${O}', 'item-O', 'tok-O'), ('${P}', 'item-P', 'tok-P')`);

    // 2 BEFORE ANYTHING: nobody reaches anything
    t.eq(count(S, "select * from public.households"), "0", "2a before any invite a signed-in user sees no household");

    const inv = svc(`household_create_invite('${O}', 'partner@example.test', 'tok-hash-1', 'code-hash-1')`);
    t.eq([inv.result, inv.created], ["invited", true], "3a the owner's first invite makes the household");
    const H = inv.household_id;
    t.eq(as(O, `select data->'core'->'appData'->'bills'->0->>'name' from public.household_data where household_id = '${H}'`), "Rent",
      "3b …with the owner's own blob copied in as the shared one");
    t.eq(as(O, `select role from public.household_members where user_id = '${O}'`), "owner", "3c …and the owner as its owner");

    // 2 THE NON-MEMBER, on every household table
    for (const [tbl, where] of [["households", `id = '${H}'`], ["household_members", `household_id = '${H}'`], ["household_data", `household_id = '${H}'`]]) {
      t.eq(count(S, `select * from public.${tbl}`), "0", `2b a non-member reads 0 rows of ${tbl}`);
      t.ok(/permission denied/.test(err(() => as(S, `delete from public.${tbl} where ${where}`))), `2c a non-member cannot delete from ${tbl}`);
      t.ok(/permission denied/.test(err(() => anon(`select count(*) from public.${tbl}`))), `2d anon is refused ${tbl} outright`);
    }
    t.eq(updated(S, `update public.household_data set data = '{}'::jsonb where household_id = '${H}'`), "0", "2e a non-member's update of the blob changes 0 rows");
    t.ok(/permission denied/.test(err(() => as(S, `insert into public.household_data (household_id, data) values ('${H}', '{}')`))), "2f a non-member cannot insert a blob");
    t.ok(/permission denied/.test(err(() => as(S, `insert into public.household_members (household_id, user_id, role, consented_at) values ('${H}', '${S}', 'partner', now())`))),
      "2g a non-member cannot add themselves to the household");
    t.ok(/permission denied/.test(err(() => as(S, `insert into public.households (owner_consented_at) values (now())`))), "2h a signed-in user cannot make a household directly");
    for (const tbl of ["household_invites", "household_join_attempts", "plaid_item_cursors"]) {
      t.ok(/permission denied/.test(err(() => as(S, `select count(*) from public.${tbl}`))), `2i nobody signed in reads ${tbl}`);
      t.ok(/permission denied/.test(err(() => as(O, `select count(*) from public.${tbl}`))), `2j …not even the owner (${tbl})`);
    }
    for (const call of [`household_accept_invite('${S}', 'stranger@example.test', 'tok-hash-1', null)`, `household_leave('${O}')`,
      `household_remove_partner('${O}')`, `household_create_invite('${S}', 'x@example.test', 'a', 'b')`, `household_revoke_invite('${O}')`]) {
      t.ok(/permission denied/.test(err(() => as(S, `select public.${call}`))), `2k a signed-in user cannot call ${call.split("(")[0]}`);
    }

    // 3 INVITES
    t.eq(svc(`household_accept_invite('${S}', 'stranger@example.test', 'tok-hash-1', null)`).result, "wrong_account", "3d the link is refused to an account with another address");
    t.eq(svc(`household_accept_invite('${P}', 'partner@example.test', 'no-such-token', null)`).result, "invalid", "3e an unknown link is refused");
    t.eq(svc(`household_accept_invite('${P}', 'partner@example.test', null, 'wrong-code')`).result, "invalid", "3f a wrong code is refused");
    t.eq(svc(`household_accept_invite('${S}', 'stranger@example.test', null, 'code-hash-1')`).result, "invalid", "3g the right code from the wrong address is refused");
    // Two joins at the same moment: P's holds the invite inside a transaction for a second; T's waits on the lock.
    const slow = spawn(path.join(bin, "psql"), psqlArgs(["-c", `begin; set role service_role; select public.household_accept_invite('${P}', 'partner@example.test', 'tok-hash-1', null); select pg_sleep(1); commit;`]), { env });
    let slowOut = ""; slow.stdout.on("data", (d) => { slowOut += d; });
    const slowDone = new Promise((ok) => slow.on("close", ok));
    await new Promise((ok) => setTimeout(ok, 300));
    const racer = svc(`household_accept_invite('${T}', 'partner@example.test', 'tok-hash-1', null)`);
    await slowDone;
    t.ok(/"result": "joined"/.test(slowOut), "3h the partner joins by the link");
    t.eq(racer.result, "used", "3i a second join at the same moment finds the invite used (the row is locked)");
    t.eq(svc(`household_accept_invite('${P}', 'partner@example.test', 'tok-hash-1', null)`).result, "already_member", "3j the same link again changes nothing");
    t.eq(svc(`household_create_invite('${O}', 'third@example.test', 'tok-hash-2', 'code-hash-2')`).result, "household_full", "3k a third adult cannot be invited");
    t.ok(/household_full/.test(err(() => sql(`insert into public.household_members (household_id, user_id, role, consented_at) values ('${H}', '${T}', 'partner', now())`))),
      "3l …and cannot be added even by the database owner (the trigger)");
    t.eq(as(P, `select consented_at is not null from public.household_members where user_id = '${P}'`), "t", "3m the partner's consent time is recorded");

    // 4 SHARED
    t.eq(count(P, `select * from public.household_data where household_id = '${H}'`), "1", "4a the partner reads the shared blob");
    t.eq(count(P, `select * from public.household_members`), "2", "4b …and sees both members");
    t.eq(as(P, `with u as (update public.household_data set data = jsonb_set(data, '{core,appData,bills,0,name}', '"Mortgage"') where household_id = '${H}' and version = 1 returning version) select version from u`), "2",
      "4c the partner saves over the version they read, and the version moves on");
    t.eq(as(O, `select data->'core'->'appData'->'bills'->0->>'name' from public.household_data where household_id = '${H}'`), "Mortgage", "4d the owner sees the partner's change");
    t.eq(updated(O, `update public.household_data set data = '{}'::jsonb where household_id = '${H}' and version = 1`), "0", "4e a save over an old version changes nothing (the app merges and tries again)");
    t.ok(/permission denied/.test(err(() => as(P, `update public.household_data set version = 99 where household_id = '${H}'`))), "4f the app cannot set the version");
    t.ok(/permission denied/.test(err(() => as(P, `update public.household_data set household_id = gen_random_uuid() where household_id = '${H}'`))), "4g …or move the row");
    t.ok(/permission denied/.test(err(() => as(P, `update public.household_members set role = 'owner' where user_id = '${P}'`))), "4h …or change anyone's role");
    sql(`insert into public.meeting_records (user_id, met_on) values ('${O}', current_date)`);
    t.eq(count(P, "select * from public.meeting_records"), "1", "4i the partner reads the owner's meeting record");
    t.eq(count(S, "select * from public.meeting_records"), "0", "4j a non-member does not");

    // 5 REMOVED
    const rm = svc(`household_remove_partner('${O}')`);
    t.eq([rm.result, rm.remaining], ["removed", 1], "5a the owner removes the partner");
    t.eq(count(P, "select * from public.household_data"), "0", "5b the removed partner reads nothing of the blob at once");
    t.eq(updated(P, `update public.household_data set data = '{}'::jsonb where household_id = '${H}'`), "0", "5c …and their update changes nothing");
    t.eq(count(P, "select * from public.household_members"), "0", "5d …sees no members");
    t.eq(count(P, "select * from public.households"), "0", "5e …no household");
    t.eq(count(P, "select * from public.meeting_records"), "0", "5f …and no longer the owner's meeting records");
    t.eq(sql(`select count(*) from public.user_data where user_id = '${P}'`), "0", "5g the partner's own row is gone: they start fresh");
    const left = JSON.parse(sql(`select data->'core'->'appData' from public.household_data where household_id = '${H}'`));
    t.eq(left.accounts.map((a) => a.id), ["a-own", "a-hand"], "5h the partner's bank accounts are out of the shared blob; the owner's and the hand-entered one stay");
    t.eq(left.transactions.map((x) => x.id), ["t1", "t3"], "5i …with the transactions on them");
    t.eq(left.liabilities.map((x) => x.account_id), ["a-own"], "5j …and their liabilities");
    t.eq(sql(`select count(*) from public.plaid_items where user_id = '${P}'`), "1", "5k the partner's bank link stays theirs");
    t.eq(as(O, `select role from public.household_members where user_id = '${O}'`), "owner", "5l the owner stays");

    // 3 continued: expiry, the code, the attempt limit
    const inv2 = svc(`household_create_invite('${O}', 'partner@example.test', 'tok-hash-3', 'code-hash-3')`);
    t.eq([inv2.result, inv2.created], ["invited", false], "3n a new invite to the same household");
    sql(`update public.household_invites set expires_at = now() - interval '1 minute' where token_hash = 'tok-hash-3'`);
    t.eq(svc(`household_accept_invite('${P}', 'partner@example.test', 'tok-hash-3', null)`).result, "expired", "3o an expired link is refused");
    t.eq(svc(`household_accept_invite('${P}', 'partner@example.test', null, 'code-hash-3')`).result, "expired", "3p …and so is its code");
    svc(`household_create_invite('${O}', 'partner@example.test', 'tok-hash-4', 'code-hash-4')`);
    t.eq(sql(`select count(*) from public.household_invites where token_hash = 'tok-hash-3' and revoked_at is not null`), "1", "3q a new invite cancels the open one");
    t.eq(svc(`household_revoke_invite('${O}')`).result, "revoked", "3r the owner cancels the invite");
    t.eq(svc(`household_accept_invite('${P}', 'partner@example.test', 'tok-hash-4', null)`).result, "invalid", "3s a cancelled link is refused");
    svc(`household_create_invite('${O}', 'partner@example.test', 'tok-hash-5', 'code-hash-5')`);
    t.eq(svc(`household_accept_invite('${P}', 'partner@example.test', null, 'code-hash-5')`).result, "joined", "3t the partner joins by the code");
    t.eq(svc(`household_accept_invite('${T}', 'third@example.test', null, 'code-hash-5')`).result, "invalid", "3u a used code is refused");
    for (let i = 0; i < 9; i++) svc(`household_accept_invite('${T}', 'third@example.test', null, 'guess-${i}')`);
    const inv3 = svc(`household_create_invite('${S}', 'third@example.test', 'tok-hash-6', 'code-hash-6')`);
    t.eq(svc(`household_accept_invite('${T}', 'third@example.test', 'tok-hash-6', null)`).result, "too_many_attempts", "3v ten failed tries in an hour stop the account, even with a good link");
    sql(`delete from public.household_join_attempts where user_id = '${T}'`);
    t.eq(svc(`household_accept_invite('${P}', 'partner@example.test', 'tok-hash-6', null)`).result, "wrong_account", "3w an invite is only for its own address");
    t.eq(svc(`household_accept_invite('${T}', 'third@example.test', 'tok-hash-6', null)`).result, "joined", "3x a second household forms independently");
    t.eq(count(T, `select * from public.household_data where household_id = '${H}'`), "0", "3y a member of another household reads nothing of this one");
    t.eq(svc(`household_accept_invite('${P}', 'partner@example.test', 'tok-hash-6', null)`).result, "used", "3z one household each: an invite already used is refused");

    // 6 THE OWNER DELETES THEIR ACCOUNT; THE LAST ONE OUT
    sql(`delete from auth.users where id = '${S}'`);
    t.eq(as(T, `select role from public.household_members where user_id = '${T}'`), "owner", "6a the owner deleting their account makes the partner the owner");
    t.eq(count(T, `select * from public.household_data where household_id = '${inv3.household_id}'`), "1", "6b …who keeps the household's data");
    const out = svc(`household_leave('${T}')`);
    t.eq([out.result, out.remaining], ["left", 0], "6c the last member leaves");
    t.eq(sql(`select count(*) from public.households where id = '${inv3.household_id}'`), "0", "6d …the household is gone");
    t.eq(sql(`select count(*) from public.household_data where household_id = '${inv3.household_id}'`), "0", "6e …with its data");
    t.eq(sql(`select data is not null from public.user_data where user_id = '${T}'`), "t", "6f …and the last one out has the data back in their own row");
    t.eq(svc(`household_leave('${P}')`).remaining, 1, "6g the partner leaves the first household");
    t.eq(as(O, `select role from public.household_members where user_id = '${O}'`), "owner", "6h the owner stays its owner");
    t.eq(svc(`household_leave('${P}')`).result, "not_member", "6i leaving twice changes nothing");
  } catch (e) {
    t.ok(false, "the suite ran to the end: " + String((e && (e.stderr || e.message)) || e).split("\n").slice(0, 3).join(" | ").slice(0, 300));
  } finally {
    if (started) { try { execFileSync(path.join(bin, "pg_ctl"), ["-D", path.join(dir, "data"), "-m", "immediate", "stop"], { env, stdio: "ignore" }); } catch {} }
  }
  t.summary("HOUSEHOLD (sql)");
})();
