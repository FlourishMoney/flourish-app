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
//   6  the owner deleting their account makes the partner the owner; the last one out takes the data with them;
//   7  each person's own keys (AI and Plaid consent) live in their own private row, never in the shared blob,
//      and only that person reads or writes it; the partner's old user_data row goes when they join;
//   8  brute force: every failed try is counted at once (tries at the same moment included), per account, per
//      invited address and per network, and an invite dies after 5 wrong tries; a code only works for its address;
//   9  races: a remove at the same moment as a leave or an ownership change runs one after the other;
//  10  one purchase at a time: ONE purchase attempt holds the household; any other attempt is refused, the same
//      person's on another platform included; a pending store purchase holds it for 7 days; every hold's end is
//      fixed from when its attempt began, and nothing ends it sooner (only a member leaving takes their own with them);
//  11  what a departed member's banks left behind (derived data) leaves with them;
//  12  disconnecting a bank cleans the shared blob before its Plaid row goes, in one transaction; the server's
//      record of who linked each account makes leave's cleanup work even after a bank went another way; a sign-in
//      deleted directly takes its record with it, once its banks have left the shared blob;
//  13  someone holding a leaked invite link cannot cancel it by opening it from another account.
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
const M33 = fs.readFileSync(path.join(MIGRATIONS, "0033_meeting_records_grants.sql"), "utf8");
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
  // A statement held open in its own connection (begin … pg_sleep … commit), to race another against it.
  const slowly = (q, sleep = 1) => {
    const child = spawn(path.join(bin, "psql"), psqlArgs(["-c", `begin; ${q}; select pg_sleep(${sleep}); commit;`]), { env });
    let out = "", errOut = "";
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { errOut += d; });
    const done = new Promise((ok) => child.on("close", () => ok({ out, err: errOut })));
    return done;
  };
  const pause = (ms) => new Promise((ok) => setTimeout(ok, ms));
  const keysOf = (o) => Object.fromEntries(Object.entries(o || {}).sort(([a], [b]) => (a < b ? -1 : 1)));   // jsonb orders keys its own way
  const json = (s) => JSON.parse(s.split("\n").find((l) => l.trim().startsWith("{")) || "null");
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
    t.eq(file(path.join(dir, "c30.sql")), "f|t|t|f|f|t|f|f", "1a 0030: anon nothing; signed in: select the blob, update its data only, never its version, never insert a member; no anon on the private rows, and nobody moves one");
    t.ok(/Expected after: false, true, true, false, false, true, false, false\./.test(M30), "1b …which is what 0030's footer says to expect");
    t.eq(file(path.join(dir, "c31.sql")), "f|f|f|t|f|f|f", "1c 0031: nobody signed in reaches the invites, the cursors, the holds or the purchase attempts, or calls the join; the service role does, but never the inner leave");
    t.ok(/Expected after: false, false, false, true, false, false, false\./.test(M31), "1d …which is what 0031's footer says to expect");
    const fnRoles = sql(`select string_agg(p.proname || ':' || has_function_privilege('authenticated', p.oid, 'execute')::text, ',' order by p.proname)
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'household\\_%'`);
    t.ok(fnRoles.split(",").every((x) => x.endsWith(":false")), `1e no household_* function is callable by a signed-in user (${fnRoles})`);
    const attemptFns = sql(`select string_agg(p.proname || ':' || has_function_privilege('authenticated', p.oid, 'execute')::text || ':' || has_function_privilege('anon', p.oid, 'execute')::text
      || ':' || has_function_privilege('service_role', p.oid, 'execute')::text, ',' order by p.proname)
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'purchase\\_attempt\\_%'`);
    t.eq(attemptFns, "purchase_attempt_begin:false:false:true,purchase_attempt_clear:false:false:true,purchase_attempt_pending:false:false:true",
      "1f the purchase-attempt functions (round 5): the service role only");
    // 0033: meeting_records' grants, run over Supabase's old default grants as production has them (everything for
    // anon and authenticated on a new public table).
    sql(`grant all privileges on table public.meeting_records to anon, authenticated`);
    fs.writeFileSync(path.join(dir, "c33.sql"), footerCheck(M33));
    t.eq(file(path.join(dir, "c33.sql")), "t|t|t|t|t|t|t", "1g before 0033, with the old default grants: anon and a signed-in user hold everything on meeting_records");
    file(path.join(MIGRATIONS, "0033_meeting_records_grants.sql"));
    t.eq(file(path.join(dir, "c33.sql")), "f|f|t|f|f|t|t", "1h 0033: anon nothing, a signed-in user select only (no column more), the server all, RLS still on");
    t.ok(/Expected after: false, false, true, false, false, true, true\./.test(M33), "1i …which is what 0033's footer says to expect");
    t.eq(err(() => file(path.join(MIGRATIONS, "0033_meeting_records_grants.sql"))), "", "1j 0033 runs a second time without error");

    // Four people. O owns the household, P is invited, S is a stranger, T is a third adult.
    const id = (email) => sql(`insert into auth.users (email, email_confirmed_at) values ('${email}', now()) returning id`);
    const O = id("owner@example.test"), P = id("partner@example.test"), S = id("stranger@example.test"), T = id("third@example.test");
    const blob = { userId: O, core: { onboarded: true, appData: { profile: { name: "Owner" }, bills: [{ id: "b1", name: "Rent" }],
      accounts: [{ id: "a-own", _item: "item-O" }, { id: "a-part", _item: "item-P" }, { id: "a-hand" }],
      transactions: [{ id: "t1", account_id: "a-own" }, { id: "t2", account_id: "a-part" }, { id: "t3", account_id: "a-hand" }],
      liabilities: [{ account_id: "a-part" }, { account_id: "a-own" }] } },
      sideKeys: { flourish_streak: "3", flourish_ai_third_party_consent: "1", flourish_plan: "premium" } };
    const pBlob = { core: { appData: { bills: [{ id: "p-own" }] } }, sideKeys: { flourish_ai_third_party_consent: "0", flourish_plaid_consented_at: "2026-10-01T00:00:00Z" } };
    sql(`insert into public.user_data (user_id, data) values ('${O}', '${JSON.stringify(blob)}'::jsonb), ('${P}', '${JSON.stringify(pBlob)}'::jsonb)`);
    sql(`insert into public.plaid_items (user_id, item_id, access_token) values ('${O}', 'item-O', 'tok-O'), ('${P}', 'item-P', 'tok-P')`);

    // 2 BEFORE ANYTHING: nobody reaches anything
    t.eq(count(S, "select * from public.households"), "0", "2a before any invite a signed-in user sees no household");

    const inv = svc(`household_create_invite('${O}', 'partner@example.test', 'tok-hash-1', 'code-hash-1')`);
    t.eq([inv.result, inv.created], ["invited", true], "3a the owner's first invite makes the household");
    const H = inv.household_id;
    t.eq(as(O, `select data->'core'->'appData'->'bills'->0->>'name' from public.household_data where household_id = '${H}'`), "Rent",
      "3b …with the owner's own blob copied in as the shared one");
    t.eq(as(O, `select role from public.household_members where user_id = '${O}'`), "owner", "3c …and the owner as its owner");
    // 7 PERSONAL KEYS: the owner's consent did not travel into the shared blob; it is in their own private row.
    t.eq(JSON.parse(sql(`select data->'sideKeys' from public.household_data where household_id = '${H}'`)), { flourish_streak: "3" },
      "7a the shared blob carries the shared keys only: the owner's AI consent and plan cache stayed out of it");
    t.eq(keysOf(JSON.parse(as(O, `select data from public.household_member_private where user_id = '${O}'`))), { flourish_ai_third_party_consent: "1", flourish_plan: "premium" },
      "7b …they are in the owner's own private row");

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
    for (const tbl of ["household_invites", "household_join_attempts", "plaid_item_cursors", "household_purchase_holds"]) {
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
    t.eq(keysOf(JSON.parse(as(P, `select data from public.household_member_private where user_id = '${P}'`))), keysOf(pBlob.sideKeys),
      "7c joining, the partner's own AI and Plaid consent go to their own private row");
    t.eq(sql(`select count(*) from public.user_data where user_id = '${P}'`), "0", "7d …and their old user_data row is deleted (replaced by the household's, as their consent screen says)");
    t.eq(count(P, "select * from public.household_member_private"), "1", "7e the partner reads one private row: their own");
    t.eq(count(P, `select * from public.household_member_private where user_id = '${O}'`), "0", "7f …never the owner's");
    t.eq(count(O, `select * from public.household_member_private where user_id = '${P}'`), "0", "7g …and the owner never the partner's");
    t.eq(updated(P, `update public.household_member_private set data = '{"flourish_ai_third_party_consent":"0"}'::jsonb where user_id = '${O}'`), "0",
      "7h the partner's update of the owner's consent changes 0 rows");
    t.ok(/row-level security/.test(err(() => as(P, `insert into public.household_member_private (user_id, data) values ('${O}', '{}')`))),
      "7i …and they cannot make a private row in the owner's name");
    t.ok(/permission denied/.test(err(() => as(P, `update public.household_member_private set user_id = '${O}' where user_id = '${P}'`))),
      "7j …or hand their own row to someone else");
    t.eq(count(S, "select * from public.household_member_private"), "0", "7k a non-member reads no private row");
    t.ok(/permission denied/.test(err(() => anon("select count(*) from public.household_member_private"))), "7l anon is refused the private rows outright");
    as(P, `update public.household_member_private set data = '{"flourish_ai_third_party_consent":"1","core":{"appData":{}}}'::jsonb where user_id = '${P}'`);
    t.eq(JSON.parse(as(P, `select data from public.household_member_private where user_id = '${P}'`)), { flourish_ai_third_party_consent: "1" },
      "7m a private row keeps only personal keys, whatever is written to it");

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
    // A member who writes consent into the shared blob, as a key or as someone's "personal" section: it never lands.
    as(P, `update public.household_data set data = jsonb_set(jsonb_set(data, '{sideKeys,flourish_ai_third_party_consent}', '"1"'), '{personal}',
      jsonb_build_object('${O}', jsonb_build_object('flourish_ai_third_party_consent', '0'))) where household_id = '${H}'`);
    const written = JSON.parse(sql(`select data from public.household_data where household_id = '${H}'`));
    t.ok(!("personal" in written) && !("flourish_ai_third_party_consent" in written.sideKeys) && written.sideKeys.flourish_streak === "3",
      "7n consent written into the shared blob (a key, or a section in someone's name) is taken out by the database; the shared keys stay");
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
    t.eq(sql(`select count(*) from public.household_member_private where user_id = '${P}'`), "0", "7o …and so is their private row");
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
    sql(`insert into public.user_data (user_id, data) values ('${T}', '{"core":{"appData":{}},"sideKeys":{"flourish_ai_coach_enabled":"1"}}'::jsonb)`);
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
    t.eq(sql(`select data->'sideKeys'->>'flourish_ai_coach_enabled' from public.user_data where user_id = '${T}'`), "1", "7p …with their own keys back in it");
    t.eq(sql(`select count(*) from public.household_member_private where user_id = '${T}'`), "0", "7q …and no private row left over");
    t.eq(svc(`household_leave('${P}')`).remaining, 1, "6g the partner leaves the first household");
    t.eq(as(O, `select role from public.household_members where user_id = '${O}'`), "owner", "6h the owner stays its owner");
    t.eq(svc(`household_leave('${P}')`).result, "not_member", "6i leaving twice changes nothing");

    // Fresh people for the rest, so each section starts clean.
    const who = (tag) => id(`${tag}@example.test`);
    const tries = (u) => sql(`select count(*) from public.household_join_attempts where user_id = '${u}'`);
    const pair = (tag) => {
      const o = who(`${tag}-owner`), p = who(`${tag}-partner`);
      const made = svc(`household_create_invite('${o}', '${tag}-partner@example.test', 'tok-${tag}', 'code-${tag}')`);
      const joined = svc(`household_accept_invite('${p}', '${tag}-partner@example.test', 'tok-${tag}', null)`);
      if (joined.result !== "joined") throw new Error(`pair ${tag}: ${joined.result}`);
      return { o, p, h: made.household_id };
    };
    const memberRole = (u) => sql(`select coalesce((select role from public.household_members where user_id = '${u}'), 'none')`);

    // 8 BRUTE FORCE (audit H2) ----------------------------------------------------------------------------------
    const O8 = who("o8"), P8 = who("p8"), X8 = who("x8");
    svc(`household_create_invite('${O8}', 'p8@example.test', 'tok-8', 'code-8')`);
    t.eq(svc(`household_accept_invite('${X8}', 'x8@example.test', null, 'code-8')`).result, "invalid", "8a the right code from an account with another address is refused");
    t.eq(sql(`select failed_attempts::text || ',' || (revoked_at is null)::text from public.household_invites where token_hash = 'tok-8'`), "0,true",
      "8b …and cannot use up the invited person's invite (a code only ever finds invites to the caller's own address)");
    for (let i = 0; i < 4; i++) svc(`household_accept_invite('${P8}', 'p8@example.test', null, 'wrong-8-${i}')`);
    t.eq(sql(`select failed_attempts::text || ',' || (revoked_at is null)::text from public.household_invites where token_hash = 'tok-8'`), "4,true",
      "8c four wrong codes from the invited account count against the invite, which still works");
    t.eq(svc(`household_accept_invite('${P8}', 'p8@example.test', null, 'wrong-8-4')`).result, "invalid", "8d a fifth wrong code is refused…");
    t.eq(sql(`select revoke_reason from public.household_invites where token_hash = 'tok-8'`), "too_many_tries", "8e …and the invite dies after 5 wrong tries");
    t.eq(svc(`household_accept_invite('${P8}', 'p8@example.test', null, 'code-8')`).result, "invalid", "8f the right code no longer works: the owner sends a new invite");
    t.eq(svc(`household_accept_invite('${P8}', 'p8@example.test', 'tok-8', null)`).result, "invalid", "8g …nor does its link");
    t.eq([tries(P8), tries(X8)], ["7", "1"], "8h every failed try was recorded, unknown codes included, against the account that made it");
    svc(`household_create_invite('${O8}', 'p8@example.test', 'tok-8b', 'code-8b')`);
    t.eq(svc(`household_accept_invite('${P8}', 'p8@example.test', null, 'code-8b')`).result, "joined", "8i the new invite's code works for the invited address");

    // Twelve wrong tries at the same moment from one account: the limit of 10 holds, and each try is recorded.
    const Y8 = who("y8");
    const burst = await Promise.all(Array.from({ length: 12 }, (_, i) =>
      slowly(`set role service_role; select public.household_accept_invite('${Y8}', 'y8@example.test', null, 'burst-${i}')`, 0.2)));
    const answers = burst.map((b) => (json(b.out) || {}).result).sort();
    t.eq([answers.filter((a) => a === "invalid").length, answers.filter((a) => a === "too_many_attempts").length], [10, 2],
      "8j twelve wrong tries at the same moment: 10 are refused as wrong and counted, then the account is stopped (none slips past the count)");
    t.eq(tries(Y8), "10", "8k …and exactly 10 failed tries were recorded");

    // Ten failed tries against one address in the hour, from any accounts, stop that address (stood in here by rows).
    const Z8 = who("z8"), OZ = who("oz8");
    svc(`household_create_invite('${OZ}', 'z8@example.test', 'tok-z8', 'code-z8')`);
    sql(`insert into public.household_join_attempts (user_id, target_key, result) select '${X8}', encode(sha256(convert_to('z8@example.test', 'UTF8')), 'hex'), 'wrong_account' from generate_series(1, 10)`);
    t.eq(svc(`household_accept_invite('${Z8}', 'z8@example.test', 'tok-z8', null)`).result, "too_many_attempts", "8l ten failed tries for one address in an hour stop it, even from its own account with a good link");
    sql(`delete from public.household_join_attempts where target_key = encode(sha256(convert_to('z8@example.test', 'UTF8')), 'hex')`);
    t.eq(svc(`household_accept_invite('${Z8}', 'z8@example.test', 'tok-z8', null)`).result, "joined", "8m …and the hour passing (the rows gone) lets it in");

    // Thirty failed tries from one network, spread over accounts, stop that network; another network is not stopped.
    for (const tag of ["n1", "n2", "n3"]) { const u = who(tag); for (let i = 0; i < 10; i++) svc(`household_accept_invite('${u}', '${tag}@example.test', null, 'n-${i}', 'net-A')`); }
    t.eq(sql(`select count(*) from public.household_join_attempts where net_key = 'net-A'`), "30", "8n' thirty failed tries recorded from one network, ten from each of three accounts");
    const N4 = who("n4");
    t.eq(svc(`household_accept_invite('${N4}', 'n4@example.test', null, 'n-x', 'net-A')`).result, "too_many_attempts", "8n thirty failed tries from one network in an hour stop a new account on it");
    t.eq(svc(`household_accept_invite('${N4}', 'n4@example.test', null, 'n-x', 'net-B')`).result, "invalid", "8o …the same account from another network is only refused as wrong");
    sql(`insert into public.household_join_attempts (user_id, target_key, result, at) values ('${N4}', 'old', 'invalid', now() - interval '2 days')`);
    svc(`household_accept_invite('${N4}', 'n4@example.test', null, 'n-y', 'net-C')`);
    t.eq(sql(`select count(*) from public.household_join_attempts where target_key = 'old'`), "0", "8p a failed try is kept a day, then deleted");
    t.ok(!/\b(?:\d{1,3}\.){3}\d{1,3}\b/.test(sql(`select coalesce(string_agg(coalesce(net_key, ''), ','), '') from public.household_join_attempts`)),
      "8q no IP address is stored (the server sends a keyed hash of the network)");

    // 9 RACES (audit B1): each pair of changes at the same moment runs one after the other ------------------------
    {
      const a = pair("r1");
      const slow = slowly(`set role service_role; select public.household_remove_partner('${a.o}')`);
      await pause(300);
      const leave = svc(`household_leave('${a.p}')`);
      const removed = json((await slow).out);
      t.eq([removed && removed.result, leave.result], ["removed", "not_member"], "9a the owner removes the partner while the partner leaves: the remove wins, the leave finds them already gone");
      t.eq([memberRole(a.o), memberRole(a.p), sql(`select count(*) from public.households where id = '${a.h}'`)], ["owner", "none", "1"], "9b …the owner keeps the household");
    }
    {
      const a = pair("r2");
      const slow = slowly(`set role service_role; select public.household_leave('${a.p}')`);
      await pause(300);
      const rm = svc(`household_remove_partner('${a.o}')`);
      const left = json((await slow).out);
      t.eq([left && left.result, rm.result], ["left", "no_partner"], "9c the partner leaves while the owner removes them: the leave wins, the remove finds no partner");
      t.eq([memberRole(a.o), memberRole(a.p)], ["owner", "none"], "9d …and the household is the owner's");
    }
    {
      const a = pair("r3");
      sql(`update public.household_data set data = jsonb_set(data, '{core}', '{"appData":{"bills":[{"id":"kept"}]}}') where household_id = '${a.h}'`);
      const slow = slowly(`delete from auth.users where id = '${a.o}'`);
      await pause(300);
      const rm = svc(`household_remove_partner('${a.o}')`);
      await slow;
      t.eq(rm.result, "not_owner", "9e the owner's account is deleted while they remove the partner: the removal is refused (they are no longer the owner)");
      t.eq(memberRole(a.p), "owner", "9f …the partner becomes the owner, and is not removed by someone who has gone");
      t.eq(sql(`select data->'core'->'appData'->'bills'->0->>'id' from public.household_data where household_id = '${a.h}'`), "kept", "9g …and the household's data survives");
    }
    {
      const a = pair("r4");
      const slow = slowly(`set role service_role; select public.household_leave('${a.o}')`);
      await pause(300);
      const rm = svc(`household_remove_partner('${a.o}')`);
      await slow;
      t.eq([rm.result, memberRole(a.p)], ["not_owner", "owner"], "9h the owner leaves while removing the partner: the removal is refused and the partner is the owner");
    }
    {
      const a = pair("r5");
      const slow = slowly(`set role service_role; select public.household_remove_partner('${a.o}')`);
      await pause(300);
      sql(`delete from auth.users where id = '${a.o}'`);
      await slow;
      t.eq([memberRole(a.p), sql(`select count(*) from public.households where id = '${a.h}'`), sql(`select count(*) from public.household_data where household_id = '${a.h}'`)], ["none", "0", "0"],
        "9i the owner removes the partner, then their account is deleted at once: the removed partner is not promoted, and no empty household is left behind");
    }

    // 10 ONE PURCHASE AT A TIME (audit H5, round 2 a; rounds 3-4 a): one ATTEMPT holds the household, to a FIXED end ---
    {
      const hold = (u, prov, att, replaces) => svc(`household_hold_purchase('${u}', '${prov}', '${att}'${replaces ? `, interval '32 minutes', '${replaces}'` : ""})`).result;
      const ends = (h) => sql(`select expires_at from public.household_purchase_holds where household_id = '${h}'`);
      // Whether a hold ends exactly `iv` after its attempt began (compared as Postgres adds it, clock changes included).
      const lifeIs = (h, iv) => sql(`select expires_at = created_at + interval '${iv}' from public.household_purchase_holds where household_id = '${h}'`);
      const lapse = (h) => sql(`update public.household_purchase_holds set expires_at = now() - interval '1 minute' where household_id = '${h}'`);
      // Every function in public whose body deletes holds, or is named for ending one (round 4 a3: only leaving does).
      const holdEnders = () => sql(`select coalesce(string_agg(p.proname, ',' order by p.proname), '') from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and (p.prosrc ilike '%delete from public.household_purchase_holds%' or (p.proname ilike 'household%' and p.proname ilike '%release%'))`);
      const a = pair("b1");
      t.eq(hold(a.o, "stripe", "cs_1"), "held", "10a the owner starts a Stripe checkout: that attempt holds the household");
      t.eq(hold(a.p, "app_store", "p-ios-1"), "held_elsewhere", "10b the partner cannot start a purchase meanwhile");
      t.eq(hold(a.o, "app_store", "o-ios-1"), "held_elsewhere", "10c nor can the SAME person, Stripe then the iOS app");
      t.eq(hold(a.o, "play_store", "o-and-1"), "held_elsewhere", "10d …or Stripe then the Android app");
      const end1 = ends(a.h);
      t.eq([hold(a.o, "stripe", "cs_1"), ends(a.h), lifeIs(a.h, "32 minutes")], ["held", end1, "t"], "10e the same attempt may ask again: held, and its end stays where it was (32 minutes from when it began)");
      // 20 minutes in, the same attempt asks five more times: 12 minutes left stays 12 minutes left.
      sql(`update public.household_purchase_holds set created_at = created_at - interval '20 minutes', expires_at = expires_at - interval '20 minutes' where household_id = '${a.h}'`);
      const end2 = ends(a.h);
      for (let i = 0; i < 5; i++) hold(a.o, "stripe", "cs_1");
      t.eq([ends(a.h), lifeIs(a.h, "32 minutes")], [end2, "t"], "10e2 asking again and again never moves a hold's end: no one can keep a household held by asking (round 3 a)");
      t.eq(hold(a.o, "stripe", "cs_2"), "held_elsewhere", "10f a second Stripe checkout of the same person is refused…");
      t.eq(hold(a.o, "stripe", "cs_2", "cs_1"), "held", "10g …unless it replaces their own checkout the server has just seen expire at Stripe (it can never complete)");
      t.eq(hold(a.p, "stripe", "cs_3", "cs_2"), "held_elsewhere", "10h nobody can replace someone else's checkout");
      t.eq([sql("select to_regprocedure('public.household_release_purchase(uuid, text)') is null"), sql("select to_regprocedure('public.household_release_store_purchase(uuid, text, timestamptz)') is null"),
        holdEnders(), hold(a.p, "app_store", "p-ios-2")], ["t", "t", "household_leave_locked", "held_elsewhere"],
        "10i nothing ends a hold early (rounds 3-4 a): no call on the app's word, none on a store's report; the only function that deletes one is a member leaving; the checkout still holds the household");
      lapse(a.h);   // a checkout cancelled or abandoned lapses on its own
      t.eq(hold(a.o, "app_store", "o-ios-2"), "held", "10j iOS…");
      t.eq(hold(a.o, "play_store", "o-and-2"), "held_elsewhere", "10k …then the Android app: refused");
      t.eq([svc(`household_hold_pending('${a.o}', 'o-ios-2')`).result, lifeIs(a.h, "7 days")], ["pending", "t"], "10l the store says the purchase is pending: the hold lasts, to 7 days from when the attempt began");
      const end3 = ends(a.h);
      t.eq([svc(`household_hold_pending('${a.o}', 'o-ios-2')`).result, hold(a.o, "app_store", "o-ios-2"), ends(a.h)], ["pending", "held_elsewhere", end3],
        "10l2 \"pending\" again changes nothing, and the pending attempt asking to hold again is refused (the store is still on it): its end never moves (round 3 a)");
      // 40 minutes later: past the 32-minute lease, but the store has not reported.
      sql(`update public.household_purchase_holds set created_at = now() - interval '40 minutes' where household_id = '${a.h}'`);
      t.eq([hold(a.p, "stripe", "cs_4"), hold(a.o, "play_store", "o-and-3")], ["held_elsewhere", "held_elsewhere"], "10m a purchase pending for more than 32 minutes still holds the household against everyone");
      t.eq(svc(`household_hold_pending('${a.p}', 'p-ios-9')`).result, "not_held", "10n only the attempt that holds it can be marked pending");
      t.eq([hold(a.p, "stripe", "cs_5"), ends(a.h)], ["held_elsewhere", end3],
        "10o whatever the store later says about it, the pending purchase holds to its fixed end: nothing ends it sooner (round 4 a3; a paid one is read first: billing.js)");
      lapse(a.h);   // its 7 days are up
      t.eq(hold(a.p, "stripe", "cs_5"), "held", "10p then the other may buy");
      // A NEWER ATTEMPT (round 4 a3): an older purchase being reported, completed or not, can never clear it.
      lapse(a.h);
      t.eq(hold(a.o, "play_store", "o-and-4"), "held", "10y the owner taps a plan in the Android app: a newer store attempt…");
      const endY = ends(a.h);
      t.eq([hold(a.p, "stripe", "cs_6"), hold(a.o, "app_store", "o-ios-5"), ends(a.h), lifeIs(a.h, "32 minutes"), holdEnders()], ["held_elsewhere", "held_elsewhere", endY, "t", "household_leave_locked"],
        "10y2 …holds the household against everyone, to its own fixed end (32 minutes from when it began); nothing about an older purchase can end it");
      lapse(a.h);
      t.eq(hold(a.p, "stripe", "cs_6"), "held", "10y3 …and once that end passes, the next attempt may hold");
      const c = pair("b3");
      t.eq(hold(c.o, "stripe", "cs_c1"), "held", "10z a web checkout holds the household…");
      const endC = ends(c.h);
      t.eq([svc(`household_hold_pending('${c.o}', 'cs_c1')`).result, ends(c.h)], ["not_held", endC], "10z2 …and can never be made \"pending\" on the app's word: its end stays 32 minutes (round 3 a)");
      const b = pair("b2");
      t.eq(hold(b.o, "app_store", "b2-ios"), "held", "10q (a second household) an attempt that is not pending…");
      sql(`update public.household_purchase_holds set expires_at = now() - interval '8 minutes', created_at = now() - interval '40 minutes' where household_id = '${b.h}'`);
      t.eq(hold(b.p, "play_store", "b2-and"), "held", "10r …lapses after 32 minutes");
      sql(`update public.household_purchase_holds set created_at = now() - interval '3 days' where household_id = '${b.h}'`);
      svc(`household_hold_pending('${b.p}', 'b2-and')`);
      t.eq([lifeIs(b.h, "7 days"), sql(`select expires_at < now() + interval '4 days 1 minute' and expires_at > now() + interval '3 days 23 hours' from public.household_purchase_holds where household_id = '${b.h}'`)], ["t", "t"],
        "10s0 \"pending\" counts its 7 days from when the attempt began (3 days ago: 4 days left), never from now");
      lapse(b.h);
      t.eq(hold(b.o, "stripe", "cs_b2"), "held", "10s a pending purchase the store never reports ends at its backstop (7 days)");
      t.ok(/attempt_required/.test(err(() => svc(`household_hold_purchase('${b.o}', 'stripe', '')`))), "10t no hold without an attempt id");
      t.eq(svc(`household_hold_purchase('${S}', 'stripe', 'cs_s')`).result, "no_household", "10u someone in no household holds nothing");
      svc(`household_leave('${b.o}')`);
      t.eq(sql(`select count(*) from public.household_purchase_holds where household_id = '${b.h}'`), "0", "10v a member who leaves takes their hold with them");
      t.ok(/permission denied/.test(err(() => as(a.o, "select count(*) from public.household_purchase_holds"))) && /permission denied/.test(err(() => as(a.o, "delete from public.household_purchase_holds")))
        && /permission denied/.test(err(() => as(a.o, `select public.household_hold_pending('${a.o}', 'x-attempt-1')`))),
        "10w nobody signed in reads the holds, deletes one, or marks one pending");
    }

    // 11 WHAT A DEPARTED MEMBER'S BANKS LEFT BEHIND (audit M7) ------------------------------------------------------
    {
      const a = pair("m7");
      const q = (v) => `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
      const canon = (v) => JSON.stringify(v, (k, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([p], [r]) => (p < r ? -1 : 1))) : x));
      sql(`insert into public.plaid_items (user_id, item_id, access_token, institution_name) values
        ('${a.o}', 'item-o11', 'tok-o11', 'Owner Bank'), ('${a.o}', 'item-o11s', 'tok-o11s', 'Shared Bank'),
        ('${a.p}', 'item-p11', 'tok-p11', 'Partner Bank'), ('${a.p}', 'item-p11s', 'tok-p11s', 'Shared Bank')`);
      const appData = {
        accounts: [{ id: "a-o", _item: "item-o11", institution: "Owner Bank" }, { id: "a-p", _item: "item-p11", institution: "Partner Bank" },
          { id: "a-p-old", institution: "Partner Bank" }, { id: "a-both", institution: "Shared Bank" }, { id: "a-hand", institution: "Manual" }],
        transactions: [{ id: "t-o", account_id: "a-o" }, { id: "t-p", account_id: "a-p" }, { id: "t-old", account_id: "a-p-old" }, { id: "t-hand", account_id: "a-hand" }],
        liabilities: { credit: [{ account_id: "a-p", apr: 21 }, { account_id: "a-o", apr: 19 }], mortgage: [{ account_id: "a-p-old" }], student: [] },
        investments: [{ id: "a-p_sec1", account_id: "a-p" }, { id: "a-o_sec2", account_id: "a-o" }],
        debts: [{ account_id: "a-p", fromBank: true, name: "Card" }, { id: "debt-own", account_id: "a-o", fromBank: true },
          { id: "debt-hand", name: "Car loan", sameAsAccountId: "a-p" }, { id: "debt-hand2", sameAsAccountId: "a-o" }],
        debtLinkDismissed: ["debt-hand|a-p", "debt-hand2|a-o", "a-p|a-hand"],
        bills: [{ id: "b1", debtId: "a-p" }, { id: "b2", debtId: "debt-own" }, { id: "b3" }],
        incomeSuggestion: { signature: "2400|biweekly|5" }, bankConnected: true, goals: [{ id: "g1" }],
      };
      sql(`update public.household_data set data = jsonb_build_object('core', jsonb_build_object('appData', ${q(appData)})) where household_id = '${a.h}'`);
      // The partner joined 10 days ago; their meeting records: one from before, two since (one on a day the owner has one).
      sql(`update public.household_members set joined_at = now() - interval '10 days' where user_id = '${a.p}'`);
      sql(`insert into public.meeting_records (user_id, met_on) values ('${a.p}', current_date - 20), ('${a.p}', current_date - 5), ('${a.p}', current_date - 2), ('${a.o}', current_date - 2)`);
      t.eq(count(a.o, `select * from public.meeting_records where user_id = '${a.p}'`), "2", "11a the owner reads the partner's meeting records since they joined, never those from before");

      t.eq(svc(`household_remove_partner('${a.o}')`).result, "removed", "11b the owner removes the partner");
      const after = JSON.parse(sql(`select data->'core'->'appData' from public.household_data where household_id = '${a.h}'`));
      t.eq(after.accounts.map((x) => x.id), ["a-o", "a-both", "a-hand"], "11c their accounts are gone: stamped with their bank, or (saved before stamping) at a bank only they linked; one at a bank both linked stays");
      t.eq(after.transactions.map((x) => x.id), ["t-o", "t-hand"], "11d …with the transactions on them");
      t.eq(canon(after.liabilities), canon({ credit: [{ account_id: "a-o", apr: 19 }], mortgage: [], student: [] }), "11e …their card, mortgage and loan details (liabilities, kept as an object of lists)");
      t.eq(after.investments.map((x) => x.id), ["a-o_sec2"], "11f …their holdings");
      t.eq(canon(after.debts), canon([{ id: "debt-own", account_id: "a-o", fromBank: true }, { id: "debt-hand", name: "Car loan" }, { id: "debt-hand2", sameAsAccountId: "a-o" }]),
        "11g …the debt made from their card, and a hand-entered debt's link to it; the owner's stay");
      t.eq(after.debtLinkDismissed, ["debt-hand2|a-o"], "11h …the \"these are different\" answers that named them");
      t.eq(after.bills, [{ id: "b1" }, { id: "b2", debtId: "debt-own" }, { id: "b3" }], "11i …a bill's link to their debt (the bill itself stays: it is the household's)");
      t.eq(["incomeSuggestion" in after, after.bankConnected, after.goals], [false, true, [{ id: "g1" }]], "11j the cached pay suggestion goes (worked out again); still a bank; goals untouched");
      t.eq([count(a.p, "select * from public.meeting_records"), sql(`select count(*) from public.meeting_records where user_id = '${a.p}'`)], ["0", "0"],
        "11k the removed partner reads no meeting record, and none is left in their name: they start fresh");
      t.eq(sql(`select string_agg((current_date - met_on)::text, ',' order by met_on) from public.meeting_records where user_id = '${a.o}'`), "5,2",
        "11l the household keeps its meeting since they joined (moved to the owner); a day the owner already had is not doubled");
      t.eq([count(a.p, "select * from public.household_data"), count(a.p, "select * from public.household_member_private"), count(S, "select * from public.meeting_records")], ["0", "0", "0"],
        "11m after removal the partner reads no blob and no private row, and a stranger reads no meeting record");
      t.eq(sql(`select count(*) from public.plaid_items where user_id = '${a.p}'`), "2", "11n their bank links stay theirs");

      // The app strips the same way when it merges (src/lib/household.js stripAccounts): the same answer.
      const Hm = await import("../src/lib/household.js");
      t.eq(canon(Hm.stripAccounts(appData, ["a-p", "a-p-old"])), canon(after), "11o the app's stripAccounts gives exactly what the database left");
      t.eq(sql("select array_to_string(public.household_personal_keys(), ',')"), Hm.PERSONAL_SIDE_KEYS.join(","), "11p the database's personal keys are the app's, in the same order");
    }

    // 12 DISCONNECTING A BANK, THEN LEAVING (audit round 2 c) -------------------------------------------------------
    {
      const a = pair("dc");
      const q = (v) => `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
      sql(`insert into public.plaid_items (user_id, item_id, access_token, institution_name) values
        ('${a.o}', 'item-dc1', 'tok-dc1', 'Shared Name'), ('${a.p}', 'item-dc2', 'tok-dc2', 'Shared Name')`);
      // What plaid.js records whenever Plaid lists an item's accounts: who linked each one.
      sql(`insert into public.plaid_account_owners (user_id, item_id, account_id) values
        ('${a.o}', 'item-dc1', 'acc-1'), ('${a.o}', 'item-dc1', 'acc-2'), ('${a.p}', 'item-dc2', 'acc-3')`);
      const appData = {
        accounts: [{ id: "acc-1", _item: "item-dc1", institution: "Shared Name" }, { id: "acc-2", institution: "Shared Name" },
          { id: "acc-3", _item: "item-dc2", institution: "Shared Name" }, { id: "acc-h", institution: "Manual" }],
        transactions: [{ id: "t1", account_id: "acc-1" }, { id: "t2", account_id: "acc-2" }, { id: "t3", account_id: "acc-3" }, { id: "th", account_id: "acc-h" }],
        liabilities: { credit: [{ account_id: "acc-1" }, { account_id: "acc-3" }] },
        investments: [{ id: "acc-2_s", account_id: "acc-2" }, { id: "acc-3_s", account_id: "acc-3" }],
        debts: [{ account_id: "acc-1", fromBank: true }, { id: "dh", sameAsAccountId: "acc-2" }, { account_id: "acc-3", fromBank: true }],
        debtLinkDismissed: ["dh|acc-1", "dh|acc-3"], bills: [{ id: "b1", debtId: "acc-1" }, { id: "b3", debtId: "acc-3" }],
        incomeSuggestion: { s: 1 }, bankConnected: true,
      };
      sql(`update public.household_data set data = jsonb_build_object('core', jsonb_build_object('appData', ${q(appData)})) where household_id = '${a.h}'`);
      const blobNow = () => JSON.parse(sql(`select data->'core'->'appData' from public.household_data where household_id = '${a.h}'`));
      t.eq(svc(`household_disconnect_item('${a.p}', 'item-dc1')`).result, "not_found", "12a a member cannot disconnect a bank the other linked");
      t.eq(blobNow().accounts.length, 4, "12b …and nothing of it changes");
      t.eq(svc(`household_disconnect_item('${a.o}', 'item-dc1')`).result, "removed", "12c the owner disconnects their bank");
      const after = blobNow();
      const mentions = (v, ids) => ids.some((id) => JSON.stringify(v).includes(`"${id}"`) || JSON.stringify(v).includes(`|${id}"`));
      t.ok(!mentions(after, ["acc-1", "acc-2"]) && !("incomeSuggestion" in after),
        "12d nothing from that bank remains: its accounts (the unstamped one found by the server's record), transactions, liabilities, holdings, debts, links and the cached suggestion");
      t.eq([after.accounts.map((x) => x.id), after.transactions.map((x) => x.id), after.debts.length], [["acc-3", "acc-h"], ["t3", "th"], 2], "12e the partner's bank and the hand-entered account stay");
      t.eq([sql(`select count(*) from public.plaid_items where item_id = 'item-dc1'`), sql(`select count(*) from public.plaid_account_owners where item_id = 'item-dc1'`)], ["0", "2"],
        "12f the Plaid row is gone, after the cleanup and in the same transaction; the record of who linked the accounts stays");
      // The partner's bank went the OLD way (only its Plaid row deleted), leaving its data in the blob; then they are removed.
      sql(`delete from public.plaid_items where item_id = 'item-dc2'`);
      t.eq(svc(`household_remove_partner('${a.o}')`).result, "removed", "12g the partner's bank was disconnected without the cleanup, then the partner is removed");
      const gone = blobNow();
      t.ok(!mentions(gone, ["acc-3"]), "12h …and nothing from that bank remains: the server's record says it was theirs, though its Plaid row is long gone");
      t.eq(gone.accounts.map((x) => x.id), ["acc-h"], "12i only the hand-entered account is left");
      // A sign-in deleted without leaving first (the admin dashboard, say): the trigger cleans up just the same. acc-dd2
      // carries no stamp, and its bank has no Plaid row of theirs left: only the server's record says it was theirs.
      const c = pair("dd");
      sql(`insert into public.plaid_account_owners (user_id, item_id, account_id) values ('${c.p}', 'item-dd', 'acc-dd'), ('${c.p}', 'item-dd', 'acc-dd2'), ('${c.o}', 'item-do', 'acc-do')`);
      sql(`update public.household_data set data = jsonb_build_object('core', jsonb_build_object('appData', ${q({ accounts: [{ id: "acc-dd", _item: "item-dd" }, { id: "acc-dd2", institution: "Bank DD" }, { id: "acc-m", institution: "Manual" }], transactions: [{ id: "tdd", account_id: "acc-dd" }, { id: "tdd2", account_id: "acc-dd2" }] })})) where household_id = '${c.h}'`);
      sql(`delete from auth.users where id = '${c.p}'`);
      t.eq(JSON.parse(sql(`select data->'core'->'appData'->'accounts' from public.household_data where household_id = '${c.h}'`)).map((x) => x.id), ["acc-m"],
        "12j a partner's sign-in deleted outright: their bank leaves the shared blob all the same, the account only the server's record knew included");
      t.eq([sql(`select count(*) from public.plaid_account_owners where user_id = '${c.p}'`), sql(`select count(*) from public.plaid_account_owners where user_id = '${c.o}'`)], ["0", "1"],
        "12m …and then their record of who linked what is deleted with them (round 3: it has no foreign key); the owner's stays");
      const lone = who("dc-lone");
      sql(`insert into public.plaid_account_owners (user_id, item_id, account_id) values ('${lone}', 'item-lone', 'acc-l1'), ('${lone}', 'item-lone', 'acc-l2')`);
      sql(`delete from auth.users where id = '${lone}'`);
      t.eq(sql(`select count(*) from public.plaid_account_owners where user_id = '${lone}'`), "0", "12n a sign-in in no household, deleted directly: none of its ownership rows remain");
      const dOwner = pair("dx");
      sql(`insert into public.plaid_account_owners (user_id, item_id, account_id) values ('${dOwner.o}', 'item-dx', 'acc-dx')`);
      sql(`update public.household_data set data = jsonb_build_object('core', jsonb_build_object('appData', ${q({ accounts: [{ id: "acc-dx" }, { id: "acc-dm", institution: "Manual" }] })})) where household_id = '${dOwner.h}'`);
      sql(`delete from auth.users where id = '${dOwner.o}'`);
      t.eq([memberRole(dOwner.p), JSON.parse(sql(`select data->'core'->'appData'->'accounts' from public.household_data where household_id = '${dOwner.h}'`)).map((x) => x.id),
        sql(`select count(*) from public.plaid_account_owners where user_id = '${dOwner.o}'`)], ["owner", ["acc-dm"], "0"],
        "12o an OWNER's sign-in deleted directly: the partner becomes the owner, the owner's bank leaves the blob, and none of their ownership rows remain");
      const solo = who("dc-solo");
      sql(`insert into public.plaid_items (user_id, item_id, access_token) values ('${solo}', 'item-solo', 'tok-solo')`);
      t.eq([svc(`household_disconnect_item('${solo}', 'item-solo')`).result, sql(`select count(*) from public.plaid_items where item_id = 'item-solo'`)], ["removed", "0"], "12k in no household, disconnecting deletes the row, as before");
      t.ok(/permission denied/.test(err(() => as(a.o, `select public.household_disconnect_item('${a.o}', 'x')`))) && /permission denied/.test(err(() => as(a.o, "select count(*) from public.plaid_account_owners"))),
        "12l nobody signed in calls the disconnect or reads who linked what");
    }

    // 13 A LEAKED LINK (audit round 2 d) -----------------------------------------------------------------------------
    {
      const O13 = who("o13"), Z13 = who("z13"), X13 = who("x13");
      svc(`household_create_invite('${O13}', 'z13@example.test', 'tok-13', 'code-13')`);
      for (let i = 0; i < 6; i++) t.eq(svc(`household_accept_invite('${X13}', 'x13@example.test', 'tok-13', null, 'net-13')`).result, "wrong_account", `13a open ${i + 1} of the link from an account with another address: refused`);
      t.eq(sql(`select failed_attempts::text || ',' || (revoked_at is null)::text from public.household_invites where token_hash = 'tok-13'`), "0,true", "13b …and the invite takes no strike: opening a leaked link cannot cancel it");
      t.eq([tries(X13), sql(`select count(*) from public.household_join_attempts where target_key = encode(sha256(convert_to('z13@example.test', 'UTF8')), 'hex')`)], ["6", "0"],
        "13c the opener's own tries are counted (their account, their network), never against the invited address");
      t.eq(svc(`household_accept_invite('${Z13}', 'z13@example.test', 'tok-13', null, 'net-13b')`).result, "joined", "13d the person it was sent to still joins by it");
    }

    // 14 EVERY BUYER'S ONE PURCHASE ATTEMPT (audit round 5) ----------------------------------------------------------
    // A purchase begun ALONE now has an attempt too, with the household hold's fixed ends; while it lives, the person
    // cannot create or join a household, so it can never complete inside one that already pays.
    {
      const begin = (u, prov, att, replaces) => svc(`purchase_attempt_begin('${u}', '${prov}', '${att}'${replaces ? `, interval '32 minutes', '${replaces}'` : ""})`);
      const attempt = (u) => sql(`select coalesce((select provider || ',' || attempt_id || ',' || pending::text from public.purchase_attempts where user_id = '${u}' and expires_at > now()), 'none')`);
      const ends = (u) => sql(`select expires_at from public.purchase_attempts where user_id = '${u}'`);
      const lifeIs = (u, iv) => sql(`select expires_at = created_at + interval '${iv}' from public.purchase_attempts where user_id = '${u}'`);
      const lapse = (u) => sql(`update public.purchase_attempts set expires_at = now() - interval '1 minute' where user_id = '${u}'`);
      const holds = (h) => sql(`select count(*) from public.household_purchase_holds where household_id = '${h}' and expires_at > now()`);
      const households = () => sql(`select count(*) from public.households`);

      // Alone: the attempt itself.
      const A = who("solo-a");
      t.eq([begin(A, "stripe", "cs_solo_1").result, attempt(A), lifeIs(A, "32 minutes")], ["held", "stripe,cs_solo_1,false", "t"],
        "14a someone in no household starts a web checkout: their one attempt is recorded, 32 minutes from when it began");
      const endA = ends(A);
      t.eq([begin(A, "stripe", "cs_solo_1").result, ends(A)], ["held", endA], "14b the same attempt again: held, its end unchanged");
      const other = begin(A, "app_store", "store-solo-1");
      t.eq([other.result, other.mine, other.provider, other.attempt_id], ["held_elsewhere", true, "stripe", "cs_solo_1"],
        "14c alone, a second purchase while the first lives (web then iPhone) is refused: one attempt per person");
      t.eq([begin(A, "stripe", "cs_solo_2").result, begin(A, "stripe", "cs_solo_2", "cs_solo_1").result, attempt(A)], ["held_elsewhere", "held", "stripe,cs_solo_2,false"],
        "14d …a second web checkout replaces the first only as its own expired one (the server checks Stripe first)");

      // Alone, web checkout, then JOIN a paying household: refused while it lives.
      const J = { o: who("join14-owner") };   // an owner on their own, so there is room to join
      sql(`insert into public.subscriptions (user_id, provider, status, current_period_end, plan_key) values ('${J.o}', 'stripe', 'active', now() + interval '20 days', 'annual')
           on conflict (user_id) do update set status = 'active'`);
      const Bj = who("solo-b");
      svc(`household_create_invite('${J.o}', 'solo-b@example.test', 'tok-14b', 'code-14b')`);
      begin(Bj, "stripe", "cs_b_1");
      const refused = svc(`household_accept_invite('${Bj}', 'solo-b@example.test', 'tok-14b', null)`);
      t.eq([refused.result, refused.provider, refused.attempt_id, memberRole(Bj), tries(Bj)], ["purchase_in_progress", "stripe", "cs_b_1", "none", "0"],
        "14e alone with a web checkout open, they try to join a household that pays: refused (purchase_in_progress, naming the checkout for the server to expire), not a member, and not counted as a failed try");
      t.eq(sql(`select (used_at is null)::text from public.household_invites where token_hash = 'tok-14b'`), "true", "14f …and the invite is still unused");
      t.eq(svc(`purchase_attempt_clear('${Bj}', 'cs_other')`).result, "not_held", "14g an attempt is cleared only by its own id…");
      t.eq([svc(`purchase_attempt_clear('${Bj}', 'cs_b_1')`).result, attempt(Bj)], ["cleared", "none"], "14h …which the server does once Stripe says that checkout has expired");
      t.eq(svc(`household_accept_invite('${Bj}', 'solo-b@example.test', 'tok-14b', null)`).result, "joined", "14i then the join goes through: the old checkout can no longer charge");

      // Alone, store purchase (or pending), then join: refused until it ends.
      const K = { o: who("join14k-owner") };
      const Ck = who("solo-c");
      svc(`household_create_invite('${K.o}', 'solo-c@example.test', 'tok-14c', 'code-14c')`);
      begin(Ck, "app_store", "store-c-1");
      t.eq(svc(`household_accept_invite('${Ck}', 'solo-c@example.test', 'tok-14c', null)`).result, "purchase_in_progress", "14j alone with an iPhone purchase sheet open, they try to join: refused");
      t.eq([svc(`purchase_attempt_pending('${Ck}', 'store-c-1')`).result, lifeIs(Ck, "7 days"), svc(`household_accept_invite('${Ck}', 'solo-c@example.test', 'tok-14c', null)`).result],
        ["pending", "t", "purchase_in_progress"], "14k the store says pending: the attempt keeps 7 days from when it began, and the join is still refused");
      const endC = ends(Ck);
      t.eq([svc(`purchase_attempt_pending('${Ck}', 'store-c-1')`).result, ends(Ck), begin(Ck, "app_store", "store-c-1").result], ["pending", endC, "held_elsewhere"],
        "14l pending again changes nothing; the pending attempt asking again is refused (the store is still on it)");
      t.eq(svc(`purchase_attempt_pending('${Ck}', 'cs_none')`).result, "not_held", "14m only the live store attempt can be made pending");
      lapse(Ck);
      t.eq(svc(`household_accept_invite('${Ck}', 'solo-c@example.test', 'tok-14c', null)`).result, "joined", "14n once it has ended, the join goes through");
      const Dk = who("solo-d");
      t.eq([begin(Dk, "stripe", "cs_d_1").result, svc(`purchase_attempt_pending('${Dk}', 'cs_d_1')`).result, lifeIs(Dk, "32 minutes")], ["held", "not_held", "t"],
        "14o a web checkout can never be made pending: its end stays 32 minutes");

      // Alone, checkout, then CREATE a household: the same protection.
      const E = who("solo-e");
      const before = households();
      begin(E, "play_store", "store-e-1");
      const made = svc(`household_create_invite('${E}', 'e-partner@example.test', 'tok-14e', 'code-14e')`);
      t.eq([made.result, made.provider, households(), memberRole(E)], ["purchase_in_progress", "play_store", before, "none"],
        "14p alone with an Android purchase open, they try to invite a partner: refused, and no household is made");
      lapse(E);
      t.eq(svc(`household_create_invite('${E}', 'e-partner@example.test', 'tok-14e', 'code-14e')`).result, "invited", "14q once it has ended, the invite is made");

      // In a household: the attempt holds the household too, and each member's attempt refuses the other's.
      const H = pair("hh14");
      t.eq([begin(H.o, "stripe", "cs_h_1").result, attempt(H.o), holds(H.h)], ["held", "stripe,cs_h_1,false", "1"],
        "14r a member's purchase records their attempt AND holds the household, in one transaction");
      t.eq([begin(H.p, "app_store", "store-h-1").result, attempt(H.p)], ["held_elsewhere", "none"], "14s the other member cannot start one meanwhile, and nothing of theirs is written");
      // The backstop (round 5, 3): an attempt of a member's own refuses the other even with no household hold, the
      // window a join could only have reached before the database refused joins with a live attempt.
      const W = pair("win14"), Ww = who("win14-third");
      sql(`insert into public.purchase_attempts (user_id, provider, attempt_id, pending, expires_at, created_at) values ('${W.p}', 'app_store', 'store-w-1', false, now() + interval '20 minutes', now())`);
      const wo = begin(W.o, "stripe", "cs_w_1");
      t.eq([wo.result, wo.mine, holds(W.h), attempt(W.o)], ["held_elsewhere", false, "0", "none"],
        "14t a household purchase checks every member's own attempt as well as the household's hold: the owner is refused while the partner's store purchase lives");
      t.eq(begin(Ww, "stripe", "cs_ww_1").result, "held", "14u …and someone outside the household is never held by it");

      // The one lock: an attempt starting and a join never interleave.
      const R = pair("race14"), Rb = who("race14-b");
      sql(`delete from public.household_members where user_id = '${R.p}'`);
      svc(`household_create_invite('${R.o}', 'race14-b@example.test', 'tok-14r', 'code-14r')`);
      const slow = slowly(`set role service_role; select public.purchase_attempt_begin('${Rb}', 'app_store', 'store-race-1')`);
      await pause(300);
      const raced = svc(`household_accept_invite('${Rb}', 'race14-b@example.test', 'tok-14r', null)`);
      const began = json((await slow).out);
      t.eq([began && began.result, raced.result, memberRole(Rb)], ["held", "purchase_in_progress", "none"],
        "14v a store purchase starts while the same person joins: the join waits for the purchase's lock, then sees the attempt and is refused");
      lapse(Rb);
      const slow2 = slowly(`set role service_role; select public.household_accept_invite('${Rb}', 'race14-b@example.test', 'tok-14r', null)`);
      await pause(300);
      const second = begin(Rb, "stripe", "cs_race_2");
      const joined = json((await slow2).out);
      t.eq([joined && joined.result, second.result, holds(R.h)], ["joined", "held", "1"],
        "14w …the other way round, the purchase waits for the join, then holds the household it joined (billing.js then reads the household's cover again)");

      t.ok(/permission denied/.test(err(() => as(A, "select count(*) from public.purchase_attempts"))) && /permission denied/.test(err(() => anon("select count(*) from public.purchase_attempts")))
        && /permission denied/.test(err(() => as(A, `select public.purchase_attempt_clear('${A}', 'cs_solo_2')`))),
        "14x nobody signed in, and nobody anonymous, reads the attempts or clears one");
      sql(`delete from auth.users where id = '${A}'`);
      t.eq(sql(`select count(*) from public.purchase_attempts where user_id = '${A}'`), "0", "14y a deleted sign-in takes its attempt with it");
    }

    // 15 A JOIN WAITS FOR THE HOUSEHOLD'S OWN PURCHASE (audit round 6) -----------------------------------------------
    // The owner invites, then buys alone (allowed: they are alone, and it holds their household). A partner who already
    // pays must not join until that ends, or the owner's purchase completes inside a household with two paid plans.
    {
      const begin = (u, prov, att) => svc(`purchase_attempt_begin('${u}', '${prov}', '${att}')`);
      const attempt = (u) => sql(`select coalesce((select provider || ',' || attempt_id || ',' || pending::text from public.purchase_attempts where user_id = '${u}' and expires_at > now()), 'none')`);
      const holdOf = (h) => sql(`select coalesce((select provider || ',' || attempt_id || ',' || pending::text from public.household_purchase_holds where household_id = '${h}' and expires_at > now()), 'none')`);
      const lapse = (o, h) => sql(`update public.household_purchase_holds set expires_at = now() - interval '1 minute' where household_id = '${h}';
                                   update public.purchase_attempts set expires_at = now() - interval '1 minute' where user_id = '${o}'`);
      const invited = (tag, pays = true) => {
        const o = who(`${tag}-owner`), p = who(`${tag}-partner`);
        const made = svc(`household_create_invite('${o}', '${tag}-partner@example.test', 'tok-${tag}', 'code-${tag}')`);
        if (pays) sql(`insert into public.subscriptions (user_id, provider, status, current_period_end, plan_key) values ('${p}', 'stripe', 'active', now() + interval '20 days', 'annual')
                       on conflict (user_id) do update set status = 'active'`);
        return { o, p, h: made.household_id, tag };
      };
      const join = (x) => svc(`household_accept_invite('${x.p}', '${x.tag}-partner@example.test', 'tok-${x.tag}', null)`);
      const unused = (x) => sql(`select (used_at is null)::text from public.household_invites where token_hash = 'tok-${x.tag}'`);

      // The owner opens a web checkout after inviting.
      const S = invited("r6s");
      t.eq([begin(S.o, "stripe", "cs_r6s_1").result, holdOf(S.h)], ["held", "stripe,cs_r6s_1,false"], "15a the owner invites, then opens a web checkout alone: it holds their household");
      const rs = join(S);
      t.eq([rs.result, memberRole(S.p), tries(S.p), unused(S)], ["household_purchase_in_progress", "none", "0", "true"],
        "15b a partner who already pays tries to join: refused (household_purchase_in_progress), not a member, no try counted, the invite unused");
      t.eq([Object.keys(rs), holdOf(S.h), attempt(S.o)], [["result"], "stripe,cs_r6s_1,false", "stripe,cs_r6s_1,false"],
        "15c …the answer names nothing of the owner's (no store, no attempt id), and the owner's hold and attempt are untouched");
      lapse(S.o, S.h);
      t.eq(join(S).result, "joined", "15d once the owner's checkout has ended, the join goes through");
      // The hold alone: the owner's own attempt is cleared (the server expired that checkout when they invited again),
      // and the household's hold still runs to its fixed end.
      const Q = invited("r6q");
      begin(Q.o, "stripe", "cs_r6q_1");
      svc(`purchase_attempt_clear('${Q.o}', 'cs_r6q_1')`);
      t.eq([attempt(Q.o), holdOf(Q.h), join(Q).result, memberRole(Q.p)], ["none", "stripe,cs_r6q_1,false", "household_purchase_in_progress", "none"],
        "15d2 the owner's own attempt cleared, the household's hold still live: the hold alone refuses the join");

      // The owner taps a plan in the iPhone app after inviting: the store sheet.
      const T = invited("r6t");
      begin(T.o, "app_store", "store-r6t-1");
      t.eq([join(T).result, memberRole(T.p), holdOf(T.h)], ["household_purchase_in_progress", "none", "app_store,store-r6t-1,false"],
        "15e the same with the owner's iPhone purchase sheet open: refused, and the sheet's hold stands");

      // The owner's store purchase goes pending (Ask to Buy): 7 days.
      const U = invited("r6u");
      begin(U.o, "play_store", "store-r6u-1");
      t.eq([svc(`purchase_attempt_pending('${U.o}', 'store-r6u-1')`).result, holdOf(U.h),
            sql(`select expires_at = created_at + interval '7 days' from public.household_purchase_holds where household_id = '${U.h}'`)],
        ["pending", "play_store,store-r6u-1,true", "t"], "15f the owner's Android purchase goes pending: the household is held 7 days from the tap");
      sql(`update public.household_purchase_holds set created_at = created_at - interval '6 days', expires_at = expires_at - interval '6 days' where household_id = '${U.h}';
           update public.purchase_attempts set created_at = created_at - interval '6 days', expires_at = expires_at - interval '6 days' where user_id = '${U.o}'`);
      t.eq([join(U).result, memberRole(U.p), tries(U.p)], ["household_purchase_in_progress", "none", "0"],
        "15g six days later the join is still refused, and still no try is counted");
      lapse(U.o, U.h);
      t.eq(join(U).result, "joined", "15h once the 7 days have passed, the join goes through");

      // The backstop: a member's own live attempt refuses a join even with no household hold.
      const V = invited("r6v");
      sql(`insert into public.purchase_attempts (user_id, provider, attempt_id, pending, expires_at, created_at) values ('${V.o}', 'app_store', 'store-r6v-1', false, now() + interval '20 minutes', now())`);
      t.eq([holdOf(V.h), join(V).result, memberRole(V.p)], ["none", "household_purchase_in_progress", "none"],
        "15i the owner's own live attempt refuses the join too, as it refuses the other member's purchase");

      // Both: the household's hold is answered first, so the joiner's own checkout is never expired for a join that
      // would be refused anyway (household.js settles only purchase_in_progress).
      const X = invited("r6x", false);
      begin(X.o, "stripe", "cs_r6x_1"); begin(X.p, "stripe", "cs_r6x_p");
      t.eq([join(X).result, attempt(X.p), attempt(X.o)], ["household_purchase_in_progress", "stripe,cs_r6x_p,false", "stripe,cs_r6x_1,false"],
        "15j the joiner has a checkout of their own too: the household's purchase is answered first, and both attempts stand");
      lapse(X.o, X.h);
      t.eq([join(X).result, attempt(X.p)], ["purchase_in_progress", "stripe,cs_r6x_p,false"], "15k …once the owner's has ended, the joiner's own is what refuses them (round 5)");

      // Both orders at the same moment.
      const Y = invited("r6y");
      const slowBuy = slowly(`set role service_role; select public.purchase_attempt_begin('${Y.o}', 'stripe', 'cs_r6y_1')`);
      await pause(300);
      const late = join(Y);
      const bought = json((await slowBuy).out);
      t.eq([bought && bought.result, late.result, memberRole(Y.p)], ["held", "household_purchase_in_progress", "none"],
        "15l the owner's checkout starts while the partner joins: the join waits for the household's lock, then sees the hold and is refused");
      const Z = invited("r6z");
      const slowJoin = slowly(`set role service_role; select public.household_accept_invite('${Z.p}', 'r6z-partner@example.test', 'tok-r6z', null)`);
      await pause(300);
      const buy = begin(Z.o, "stripe", "cs_r6z_1");
      const joinedZ = json((await slowJoin).out);
      t.eq([joinedZ && joinedZ.result, buy.result, memberRole(Z.p), holdOf(Z.h)], ["joined", "held", "partner", "stripe,cs_r6z_1,false"],
        "15m …the other way round, the checkout waits for the join, then holds a household that now has a payer: billing.js reads the household's cover again after it and refuses the checkout (householdServer 15i)");
    }

    // 16 ONE LOCK ORDER: THE HOUSEHOLD, THEN ITS INVITE (audit round 7) ----------------------------------------------
    // household_create_invite and household_revoke_invite lock the household row, then its invites. The join used to
    // lock the invite first, then the household, so a join and a revoke at the same moment could deadlock (a 503). The
    // owner's call is held open here just after it has locked the household, as each does first, while the join comes in.
    {
      const deadlock = (s) => /deadlock/i.test(String(s || ""));
      const tryJoin = (u, mail, tok, code) => {
        try { return svc(`household_accept_invite('${u}', '${mail}', ${tok ? `'${tok}'` : "null"}, ${code ? `'${code}'` : "null"})`).result; }
        catch (e) { return String(e.stderr || e.message); }
      };
      const invite = (tok) => sql(`select (used_at is not null)::text || ',' || coalesce(used_by::text, '-') || ',' || coalesce(revoke_reason, '-') from public.household_invites where token_hash = '${tok}'`);
      const ownerHolds = (h, then) => slowly(`select 1 from public.households where id = '${h}' for update; select pg_sleep(1); set role service_role; ${then}`, 0);

      // Revoke, with the join arriving while the owner's call holds the household.
      const O1 = who("lock16-o1"), P1 = who("lock16-p1");
      const h1 = svc(`household_create_invite('${O1}', 'lock16-p1@example.test', 'tok-16a', 'code-16a')`).household_id;
      const rv = ownerHolds(h1, `select public.household_revoke_invite('${O1}')`);
      await pause(300);
      const j1 = tryJoin(P1, "lock16-p1@example.test", "tok-16a", null);
      const r1 = await rv;
      t.eq([deadlock(j1) || deadlock(r1.err), j1, (json(r1.out) || {}).result, (json(r1.out) || {}).count],
        [false, "invalid", "revoked", 1],
        "16a a join by link while the owner revokes: no deadlock; the join waits for the household, then reads the invite again and finds it revoked");
      t.eq([memberRole(P1), invite("tok-16a")], ["none", "false,-,owner"], "16b …not a member, and the invite was never used");

      // The same by code.
      const O2 = who("lock16-o2"), P2 = who("lock16-p2");
      const h2 = svc(`household_create_invite('${O2}', 'lock16-p2@example.test', 'tok-16c', 'code-16c')`).household_id;
      const rv2 = ownerHolds(h2, `select public.household_revoke_invite('${O2}')`);
      await pause(300);
      const j2 = tryJoin(P2, "lock16-p2@example.test", null, "code-16c");
      const r2 = await rv2;
      t.eq([deadlock(j2) || deadlock(r2.err), j2, (json(r2.out) || {}).result, memberRole(P2)], [false, "invalid", "revoked", "none"],
        "16c the same by code: no deadlock, refused, not a member");

      // A new invite replacing the open one, with a join by the old link arriving meanwhile.
      const O3 = who("lock16-o3"), P3 = who("lock16-p3");
      const h3 = svc(`household_create_invite('${O3}', 'lock16-p3@example.test', 'tok-16d', 'code-16d')`).household_id;
      const mk = ownerHolds(h3, `select public.household_create_invite('${O3}', 'lock16-p3@example.test', 'tok-16d2', 'code-16d2')`);
      await pause(300);
      const j3 = tryJoin(P3, "lock16-p3@example.test", "tok-16d", null);
      const m3 = await mk;
      t.eq([deadlock(j3) || deadlock(m3.err), j3, (json(m3.out) || {}).result, invite("tok-16d")], [false, "invalid", "invited", "false,-,replaced"],
        "16d a join by the old link while the owner sends a new invite: no deadlock; the old invite is replaced and refused, never used");
      t.eq([tryJoin(P3, "lock16-p3@example.test", "tok-16d2", null), invite("tok-16d2").split(",").slice(0, 2).join(",")], ["joined", `true,${P3}`],
        "16e …and the new invite's link joins");

      // The other order: the join first, then the revoke. Single use holds.
      const O4 = who("lock16-o4"), P4 = who("lock16-p4");
      svc(`household_create_invite('${O4}', 'lock16-p4@example.test', 'tok-16f', 'code-16f')`);
      const jn = slowly(`set role service_role; select public.household_accept_invite('${P4}', 'lock16-p4@example.test', 'tok-16f', null)`);
      await pause(300);
      let r4; try { r4 = svc(`household_revoke_invite('${O4}')`); } catch (e) { r4 = { result: String(e.stderr || e.message) }; }
      const j4 = await jn;
      t.eq([deadlock(j4.err) || deadlock(r4.result), (json(j4.out) || {}).result, r4.result, r4.count, invite("tok-16f"), memberRole(P4)],
        [false, "joined", "revoked", 0, `true,${P4},-`, "partner"],
        "16f the join first, the revoke at the same moment: no deadlock; the join goes through once, and the revoke, which waited for it, finds nothing open");
      t.eq(tryJoin(P4, "lock16-p4@example.test", "tok-16f", null), "already_member", "16g the used link again: already a member, not a second use");
    }
  } catch (e) {
    t.ok(false, "the suite ran to the end: " + String((e && (e.stderr || e.message)) || e).split("\n").slice(0, 3).join(" | ").slice(0, 300));
  } finally {
    if (started) { try { execFileSync(path.join(bin, "pg_ctl"), ["-D", path.join(dir, "data"), "-m", "immediate", "stop"], { env, stdio: "ignore" }); } catch {} }
  }
  t.summary("HOUSEHOLD (sql)");
})();
