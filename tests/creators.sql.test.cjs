// tests/creators.sql.test.cjs
// -----------------------------------------------------------------------------
// THE CREATOR PROGRAM'S RULES, IN A REAL POSTGRES (the migration is written, not run in production).
//
// Every migration runs, in order, in a throwaway Postgres on a stand-in for Supabase, whose default grants give a new
// table everything for anon and authenticated, as production's old defaults did. Then:
//   1  nobody signed in, and nobody anonymous, reaches a table or a function; RLS is on; the footer's check says so
//   2  entering a code: a wrong code, a creator's own code (however they write their address), an ended creator;
//      first code wins; 14 days from sign-up; only before the first payment
//   3  a partner joining never changes the household's code, and a partner cannot add one
//   4  a commission: 20% of the base, one per payment, Canadian dollars only, ended creators, a creator's own household
//   5  the 12 months from the first payment, the renewal on the anniversary, and one a store dates a day early
//   6  a refund claws back that one payment's commission, whole or in part, and a replay adds nothing
//   7  pending becomes payable only once a payment is more than 30 days old
//   8  the monthly report and payout: the $25 minimum, the carry-over, clawbacks across payouts, and nothing per household
//   9  a deleted account's money stays correct, with the account id gone
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
const CREATOR_FILE = fs.readdirSync(MIGRATIONS).find((f) => /^\d{4}_creator_program\.sql$/.test(f));
const SRC = fs.readFileSync(path.join(MIGRATIONS, CREATOR_FILE), "utf8");
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
  if (!bin) { t.ok(false, "0 a Postgres to run the migrations in"); t.summary("CREATORS (sql)"); return; }
  const env = { ...process.env, LC_ALL: "C", LANG: "C" };
  const dir = tempDir("pgc");
  const port = await freePort();
  const psqlArgs = (args) => ["-h", dir, "-p", String(port), "-U", "postgres", "-d", "t", "-v", "ON_ERROR_STOP=1", "-qAtX", ...args];
  const psql = (args) => execFileSync(path.join(bin, "psql"), psqlArgs(args), { env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const sql = (q) => psql(["-c", q]);
  const file = (f) => psql(["-f", f]);
  const last = (s) => s.split("\n").pop();
  const err = (fn) => { try { fn(); return ""; } catch (e) { return String(e.stderr || e.message); } };
  const as = (uid, q) => last(sql(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false); ${q}`));
  const anon = (q) => last(sql(`set role anon; ${q}`));
  const svc = (fn) => JSON.parse(last(sql(`set role service_role; select public.${fn}`)));
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
    t.eq(failed, [], "0a every migration applies in order, the creator program's included");
    t.eq(err(() => file(path.join(MIGRATIONS, CREATOR_FILE))), "", "0b it runs a second time without error");

    // Fixtures --------------------------------------------------------------------------------------------------
    let n = 0;
    const person = (email, signedUpDaysAgo = 0) => {
      n += 1;
      const mail = email || `person${n}@example.test`;
      return sql(`insert into auth.users (email, email_confirmed_at, created_at) values ('${mail}', now(), now() - interval '${signedUpDaysAgo} days') returning id`).split("\n")[0];
    };
    const creator = (code, status = "active", mail) => {
      sql(`insert into public.creators (code, name, payout_email, status) values ('${code}', 'Creator ${code}', '${mail || `${code.toLowerCase()}@creators.test`}', '${status}')`);
      return code;
    };
    const attribute = (u, code, source = "web") => svc(`creator_attribute('${u}', '${code}', '${source}')`).result;
    const check = (code) => svc(`creator_code_check('${code}')`).result;
    const backdate = (u, days) => sql(`update public.creator_attributions set attributed_at = now() - interval '${days} days' where user_id = '${u}'`);
    const pay = (u, ref, whenSql = "now() + interval '1 second'", { base = 1000, provider = "stripe", gross = "null", currency = "CAD", original = "null" } = {}) =>
      svc(`creator_commission_record('${u}', '${provider}', '${ref}', ${original === "null" ? "null" : `'${original}'`}, ${whenSql}, ${base}, ${gross}, '${currency}')`);
    const rowOf = (ref) => sql(`select commission_cents || ',' || status from public.creator_commissions where payment_ref = '${ref}' and clawback_of is null`);
    const creditedTo = (ref) => sql(`select c.code from public.creator_commissions cc join public.creators c on c.id = cc.creator_id where cc.payment_ref = '${ref}' and cc.clawback_of is null`);
    const report = (code, asOf = "now()") => {
      const r = sql(`select households_credited || '|' || payable_this_month_cents || '|' || carry_over_cents || '|' || clawbacks_cents || '|' || not_yet_30_days_cents from public.creator_payout_report(${asOf}) where code = '${code}'`);
      const [households, payable, carry, clawbacks, young] = r.split("|").map(Number);
      return { households, payable, carry, clawbacks, young };
    };
    const mature = (asOf = "now()") => svc(`creator_commissions_mature(${asOf})`);

    // 1 GRANTS --------------------------------------------------------------------------------------------------
    fs.writeFileSync(path.join(dir, "check.sql"), footerCheck(SRC));
    t.eq(file(path.join(dir, "check.sql")), "t|f|f|f|f|f|f|t", "1a RLS on all three; anon and a signed-in user reach no table and no function; the server does");
    t.ok(/Expected after: true, false, false, false, false, false, false, true\./.test(SRC), "1b …which is what the footer says to expect");
    const U1 = person();
    for (const table of ["creators", "creator_attributions", "creator_commissions"]) {
      t.ok(/permission denied/.test(err(() => as(U1, `select count(*) from public.${table}`))) && /permission denied/.test(err(() => anon(`select count(*) from public.${table}`))), `1c ${table}: nobody signed in, and nobody anonymous, reads it`);
      t.ok(/permission denied/.test(err(() => as(U1, `delete from public.${table}`))), `1d ${table}: nobody signed in writes it`);
    }
    const fnGrants = sql(`select string_agg(p.proname, ',' order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname like 'creator\\_%' and (has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('anon', p.oid, 'execute') or not has_function_privilege('service_role', p.oid, 'execute'))`);
    t.eq(fnGrants, "", "1e every creator function: the service role only");
    t.eq(sql(`select count(*) from pg_policies where tablename like 'creator%'`), "0", "1f no policy on any of them: RLS refuses everyone but the service role");

    // 2 ENTERING A CODE -----------------------------------------------------------------------------------------
    creator("ALICE", "active", "alice.smith+pay@gmail.com");
    creator("BEN");
    creator("ENDED", "ended");
    creator("CAUSE", "ended_for_cause");
    t.eq([check("NOPE"), check("ALICE"), check(" alice ")], ["invalid", "ok", "ok"], "2a a wrong code is refused; a right one is fine, whatever its case or spaces");
    t.ok(/creator_code_check\(p_code text\)/.test(SRC), "2b the check before sign-up takes the code and no address: it can't be used to test whether an address is a creator's");
    t.eq([check("ENDED"), check("CAUSE")], ["invalid", "invalid"], "2c an ended creator's code takes no new household");

    const A = person();
    t.eq(attribute(A, "NOPE"), "invalid", "2d a wrong code: nothing recorded");
    t.eq(sql(`select count(*) from public.creator_attributions where user_id = '${A}'`), "0", "2e …no row");
    t.eq(attribute(A, "alice", "ios"), "attributed", "2f a right code, in any case: recorded");
    t.eq(sql(`select code || ',' || source from public.creator_attributions where user_id = '${A}'`), "ALICE,ios", "2g …with its uppercase code and where it came from");
    t.eq([attribute(A, "BEN"), sql(`select code from public.creator_attributions where user_id = '${A}'`)], ["already", "ALICE"], "2h first code wins: a second changes nothing");
    t.eq([attribute(person("alice.smith+pay@gmail.com"), "ALICE"), attribute(person("Alice.Smith@gmail.com"), "ALICE"), attribute(person("alicesmith+other@googlemail.com"), "ALICE")], ["invalid", "invalid", "invalid"],
      "2i a creator's own code goes on no account, however they write their address (case, a +tag, Gmail's dots), with the same answer as a wrong code");
    t.eq(attribute(person(null, 15), "BEN"), "too_late", "2j more than 14 days after sign-up: too late");
    t.eq(attribute(person(null, 13), "BEN"), "attributed", "2k within 14 days: fine");
    const Paid = person();
    sql(`insert into public.subscriptions (user_id, provider, status, plan_key) values ('${Paid}', 'stripe', 'active', 'monthly')`);
    t.eq(attribute(Paid, "BEN"), "paid", "2l after the first payment: refused");
    const Lapsed = person();
    sql(`insert into public.subscriptions (user_id, provider, status, plan_key) values ('${Lapsed}', 'stripe', 'canceled', 'monthly')`);
    t.eq(attribute(Lapsed, "BEN"), "paid", "2m a subscription since cancelled was still a first payment");
    const Unpaid = person();
    sql(`insert into public.subscriptions (user_id, provider, status, plan_key) values ('${Unpaid}', 'stripe', 'incomplete', 'monthly')`);
    t.eq(attribute(Unpaid, "BEN"), "attributed", "2n a checkout that never paid is no first payment");
    t.eq([svc(`creator_status('${person()}')`).may_add, svc(`creator_status('${A}')`).why], [true, "already"], "2o Settings is told whether a code can be added");

    // 3 THE PARTNER RULE ----------------------------------------------------------------------------------------
    const pair = (tag, owner, partner) => {
      svc(`household_create_invite('${owner}', '${tag}@example.test', 'tok-${tag}', 'code-${tag}')`);
      const j = svc(`household_accept_invite('${partner}', '${tag}@example.test', 'tok-${tag}', null)`);
      if (j.result !== "joined") throw new Error(`join ${tag}: ${j.result}`);
    };
    const O1 = person(), P1 = person();
    attribute(O1, "ALICE"); attribute(P1, "BEN");
    pair("p31", O1, P1);
    t.eq([sql(`select code from public.creator_attributions where user_id = '${O1}'`), sql(`select code from public.creator_attributions where user_id = '${P1}'`)], ["ALICE", "BEN"], "3a a partner joining changes nobody's row");
    t.eq([pay(P1, "inv_p31").result, creditedTo("inv_p31")], ["recorded", "ALICE"], "3b the household's code is its owner's: a payment by the partner, who entered another code, is credited to the owner's creator");
    t.eq([pay(O1, "inv_o31").result, creditedTo("inv_o31")], ["recorded", "ALICE"], "3c …and so is the owner's");
    t.eq(sql(`select (household_id is not null)::text from public.creator_attributions where user_id = '${O1}'`), "true", "3d the first commission ties the code to the household");

    const O2 = person(), P2 = person();
    attribute(P2, "BEN");
    pair("p32", O2, P2);
    t.eq(pay(P2, "inv_p32").result, "no_creator", "3e an owner with no code, a partner who has one: the household still has none, and nothing is earned while they are together");
    t.eq([svc(`creator_status('${P2}')`).why, attribute(O2, "ALICE")], ["already", "attributed"], "3f the partner's own row stands, and the owner, in their window, may still add the household's code");
    t.eq([pay(P2, "inv_p32b").result, creditedTo("inv_p32b")], ["recorded", "ALICE"], "3g …which is the one that counts from then on");
    const O3 = person(), P3 = person();
    pair("p33", O3, P3);
    t.eq([attribute(P3, "ALICE"), sql(`select count(*) from public.creator_attributions where user_id = '${P3}'`)], ["not_owner", "0"], "3h a partner cannot add a code");
    const O4 = person(), P4 = person();
    pair("p34", O4, P4);
    sql(`insert into public.subscriptions (user_id, provider, status, plan_key) values ('${P4}', 'stripe', 'active', 'monthly')`);
    t.eq(attribute(O4, "ALICE"), "paid", "3i the partner's payment is the household's first payment: the owner can no longer add one");
    const O5 = person(), P5 = person();
    attribute(P5, "BEN");
    pair("p35", O5, P5);
    t.eq(pay(P5, "inv_p35a").result, "no_creator", "3j together: nothing");
    svc(`household_leave('${P5}')`);
    t.eq([pay(P5, "inv_p35b").result, creditedTo("inv_p35b")], ["recorded", "BEN"], "3k having left, the partner is on their own again, with their own code");
    // A partner's own plan from before they joined is not the household's subscribing.
    const O7 = person(), P7 = person();
    attribute(O7, "ALICE");
    sql(`insert into public.subscriptions (user_id, provider, status, plan_key, created_at) values ('${P7}', 'stripe', 'active', 'monthly', now() - interval '700 days')`);
    pair("p37", O7, P7);
    t.eq([pay(P7, "inv_p37").result, sql(`select first_payment_at is null from public.creator_attributions where user_id = '${O7}'`)], ["partner_plan_before_join", "t"], "3m someone who has paid for two years joins a household holding a code: their renewal earns nothing, and starts no 12 months");
    t.eq([pay(O7, "inv_p37o").result, creditedTo("inv_p37o")], ["recorded", "ALICE"], "3n …the owner's own subscribing still counts");
    const O8 = person(), P8 = person();
    attribute(O8, "ALICE");
    pair("p38", O8, P8);
    sql(`insert into public.subscriptions (user_id, provider, status, plan_key) values ('${P8}', 'stripe', 'active', 'monthly')`);
    t.eq([pay(P8, "inv_p38").result, creditedTo("inv_p38")], ["recorded", "ALICE"], "3o a partner who subscribes after joining: the household subscribing, and it counts");
    const CreatorMate = person("ben@creators.test"), O6 = person();
    attribute(O6, "BEN");
    pair("p36", O6, CreatorMate);
    t.eq(pay(O6, "inv_p36").result, "own_code", "3l a creator who joins a household using their own code earns nothing on it");

    // 4 A COMMISSION --------------------------------------------------------------------------------------------
    const C1 = person();
    attribute(C1, "ALICE");
    t.eq([pay(C1, "inv_c1", undefined, { base: 1199 }).commission_cents, rowOf("inv_c1")], [240, "240,pending"], "4a 20% of the base, to the nearest cent, pending");
    t.eq([pay(C1, "inv_c1", undefined, { base: 1199 }).result, sql(`select count(*) from public.creator_commissions where payment_ref = 'inv_c1'`)], ["duplicate", "1"], "4b a replay records nothing twice");
    t.eq(pay(C1, "txn_c1", undefined, { base: 702, provider: "app_store", gross: 1199, original: "orig1" }).commission_cents, 140, "4c a store payment: 20% of the base the server passes, its proceeds");
    t.eq(pay(C1, "inv_usd", undefined, { currency: "USD" }).result, "not_cad", "4d Canada only for now: another currency earns nothing");
    t.eq(pay(person(), "inv_none").result, "no_creator", "4e an account with no code earns nobody anything");
    t.ok(/check_violation|creator_commission_bad_payment/.test(err(() => pay(C1, "", undefined))), "4f a payment with no reference is refused");
    const C2 = person();
    attribute(C2, "BEN");
    sql(`update public.creators set status = 'ended' where code = 'BEN'`);
    t.eq(pay(C2, "inv_ended").result, "recorded", "4g a creator whose partnership ended keeps earning on households already credited");
    sql(`update public.creators set status = 'ended_for_cause' where code = 'BEN'`);
    t.eq(pay(C2, "inv_cause").result, "creator_ended", "4h …unless it ended for cause");
    sql(`update public.creators set status = 'active' where code = 'BEN'`);
    const Late = person();
    attribute(Late, "ALICE");
    t.eq(pay(Late, "inv_before", "now() - interval '1 hour'").result, "before_code", "4i a payment made before the code was entered is not credited (the webhook can arrive after the code)");
    t.eq(pay(Late, "inv_before2", "now() + interval '30 days'").result, "before_code", "4j …nor is anything after it: the code came after the first payment");

    // 5 THE 12 MONTHS -------------------------------------------------------------------------------------------
    const Y = person();
    attribute(Y, "ALICE");
    backdate(Y, 400);
    const first = "(now() - interval '380 days')";
    t.eq(pay(Y, "y0", first).result, "recorded", "5a the first payment starts the 12 months");
    t.eq(pay(Y, "y1", `${first} + interval '11 months'`).result, "recorded", "5b the twelfth monthly payment counts");
    t.eq(pay(Y, "y2", `${first} + interval '12 months'`).result, "outside_window", "5c the renewal on the anniversary does not");
    t.eq(pay(Y, "y3", `${first} + interval '12 months' - interval '1 day'`).result, "outside_window", "5d nor does one a store dates a day early (Apple charges within the 24 hours before the period ends)");
    t.eq(pay(Y, "y4", `${first} + interval '12 months' - interval '3 days'`).result, "recorded", "5e three days before it is still in the first year");
    t.eq(pay(Y, "y5", `${first} + interval '13 months'`).result, "outside_window", "5f later still: nothing");
    // The first payment starts the clock whether or not it earned anything.
    const YU = person();
    attribute(YU, "ALICE");
    backdate(YU, 400);
    t.eq(svc(`creator_first_payment_seen('${YU}', ${first})`).result, "anchored", "5f2 a first payment whose amounts can't be read: no commission, but the 12 months start");
    t.eq(pay(YU, "yu1", `${first} + interval '12 months'`).result, "outside_window", "5f3 …so next year's renewal is not a fresh first payment");
    const YC = person();
    attribute(YC, "ALICE");
    backdate(YC, 400);
    t.eq(pay(YC, "yc0", first, { currency: "USD" }).result, "not_cad", "5f4 a first payment not in dollars earns nothing");
    t.eq(pay(YC, "yc1", `${first} + interval '12 months'`).result, "outside_window", "5f5 …and still starts the 12 months");
    t.eq(svc(`creator_first_payment_seen('${person()}', now())`).result, "no_creator", "5f6 nobody's code, nothing to start");
    const Z = person();
    attribute(Z, "ALICE");
    backdate(Z, 100);
    t.eq(pay(Z, "z1", "now() - interval '10 days'").result, "recorded", "5g a renewal delivered first");
    t.eq(pay(Z, "z0", "now() - interval '40 days'").result, "recorded", "5h then the earlier payment, delivered late");
    t.eq(sql(`select (first_payment_at < now() - interval '39 days')::text from public.creator_attributions where user_id = '${Z}'`), "true", "5i the 12 months run from the earliest payment, whatever order they arrive in");

    // 6 REFUNDS -------------------------------------------------------------------------------------------------
    const claw = (ref, { provider = "stripe", original = null, when = null, refunded = "null" } = {}) =>
      svc(`creator_commission_clawback('${provider}', '${ref}', ${original ? `'${original}'` : "null"}, ${when || "null"}, ${refunded})`);
    const clawed = (ref) => Number(sql(`select coalesce(sum(commission_cents), 0) from public.creator_commissions where payment_ref = '${ref}' and clawback_of is not null`));
    const R = person();
    attribute(R, "ALICE");
    backdate(R, 60);
    const day = "(now() - interval '50 days')";
    pay(R, "r1", day, { base: 1000 });
    pay(R, "r2", day, { base: 2000, gross: 2000 });
    t.eq([claw("r1").result, clawed("r1"), clawed("r2")], ["clawback", -200, 0], "6a a refund claws back that payment's commission, and no other's");
    t.eq([claw("r1").result, clawed("r1")], ["already", -200], "6b a replay adds nothing");
    t.eq([claw("r2", { refunded: 500 }).cents, clawed("r2")], [100, -100], "6c a partial refund claws back its share of what was charged");
    t.eq([claw("r2", { refunded: 500 }).result, claw("r2", { refunded: 2000 }).cents, clawed("r2")], ["already", 300, -400], "6d the same amount again adds nothing; the rest of it adds only what is new");
    t.eq(claw("nope").result, "not_found", "6e a refund matching no commission: nothing is guessed");
    t.eq(rowOf("r1"), "200,pending", "6f the payment's own row stands; the clawback is a row of its own");
    pay(R, "txn9", day, { provider: "play_store", original: "orig9", base: 500 });
    t.eq(claw("unknown-txn", { provider: "play_store", original: "orig9", when: "(now() - interval '1 year')" }).result, "not_found", "6g a store refund naming another transaction and another date: no match, no guess");
    t.eq(sql(`select count(*) from public.creator_commissions where payment_ref = 'txn9' and clawback_of is not null`), "0", "6h …nothing clawed back");

    // 6b LOST CHARGEBACKS ---------------------------------------------------------------------------------------
    const lost = (ref, id, cents) => svc(`creator_commission_clawback('stripe', '${ref}', null, null, ${cents}, '${id}')`);
    const CB = person();
    attribute(CB, "ALICE");
    backdate(CB, 60);
    pay(CB, "cb1", day, { base: 1000, gross: 1000 });
    pay(CB, "cb2", day, { base: 2000, gross: 2000 });
    pay(CB, "cb3", day, { base: 1000, gross: 1000 });
    t.eq([lost("cb1", "du_1", 1000).result, clawed("cb1"), clawed("cb2")], ["clawback", -200, 0], "6i a lost chargeback claws back that payment's commission, and no other's");
    t.eq([lost("cb1", "du_1", 1000).result, clawed("cb1"), sql(`select count(*) from public.creator_commissions where dispute_ref = 'du_1'`)], ["already", -200, "1"], "6j the same dispute again adds nothing: one row, carrying the dispute's id");
    t.eq([lost("cb3", "du_1", 1000).result, clawed("cb3")], ["already", 0], "6k one dispute id never takes from a second payment");
    t.eq([claw("cb1").result, clawed("cb1")], ["already", -200], "6l a refund on top of it takes nothing more: never more than the payment earned");
    t.eq([lost("cb2", "du_2", 500).cents, lost("cb2", "du_3", 500).cents, clawed("cb2")], [100, 100, -200], "6m two disputes on parts of one payment each take their own share");
    t.eq([claw("cb2", { refunded: 500 }).cents, clawed("cb2")], [100, -300], "6n a refund of another part adds its own share, not less for the disputes");
    t.eq([lost("cb2", "du_4", 2000).cents, clawed("cb2")], [100, -400], "6o a dispute on top: only what is left of the payment's commission");
    t.eq([lost("cb2", "du_5", 2000).result, sql(`select count(*) from public.creator_commissions where dispute_ref = 'du_5'`)], ["already", "0"], "6p nothing left: no row");
    t.eq(lost("nope", "du_6", 100).result, "not_found", "6q a chargeback matching no commission: nothing is guessed");
    t.eq(rowOf("cb1"), "200,pending", "6r the payment's own row stands; the clawback is a row of its own");
    t.ok(/creator_commissions_dispute_on_clawback/.test(err(() => sql(`update public.creator_commissions set dispute_ref = 'du_7' where payment_ref = 'cb3' and clawback_of is null`))), "6s only a clawback can carry a dispute's id");
    t.ok(/creator_commissions_one_per_dispute/.test(err(() => sql(`update public.creator_commissions set dispute_ref = 'du_1' where dispute_ref = 'du_2'`))), "6t the database itself holds one row per dispute");

    // 7 MATURITY ------------------------------------------------------------------------------------------------
    const M = person();
    attribute(M, "ALICE");
    backdate(M, 100);
    sql(`insert into public.creator_commissions (creator_id, attribution_id, provider, payment_ref, payment_date, base_amount_cents, commission_cents, status)
         select a.creator_id, a.id, 'stripe', v.ref, '2026-01-01 00:00:00+00'::timestamptz + v.age, 1000, 200, 'pending'
           from public.creator_attributions a, (values ('m_old', interval '0 days'), ('m_edge', interval '1 day')) v(ref, age) where a.user_id = '${M}'`);
    const asOf = "'2026-01-31 00:00:00+00'::timestamptz";   // m_old is exactly 30 days old; m_edge is 29
    mature(asOf);
    t.eq([rowOf("m_old"), rowOf("m_edge")], ["200,pending", "200,pending"], "7a a payment exactly 30 days old is still pending: it must be more than 30 days old");
    t.eq(mature("'2026-01-31 00:00:01+00'::timestamptz"), 1, "7b a second later it is payable");
    t.eq([rowOf("m_old"), rowOf("m_edge")], ["200,payable", "200,pending"], "7c …and only it");

    // 8 THE REPORT AND THE PAYOUT -------------------------------------------------------------------------------
    const money = (code, ref, cents, { daysOld = 40 } = {}) => sql(`insert into public.creator_commissions (creator_id, attribution_id, provider, payment_ref, payment_date, base_amount_cents, commission_cents, status)
        select a.creator_id, a.id, 'stripe', '${ref}', now() - interval '${daysOld} days', ${cents * 5}, ${cents}, 'pending' from public.creator_attributions a where a.code = '${code}' limit 1`);
    const setUp = (code) => { creator(code); attribute(person(), code); attribute(person(), code); return code; };
    setUp("LOW");
    money("LOW", "low1", 2499);
    t.eq(report("LOW"), { households: 2, payable: 0, carry: 2499, clawbacks: 0, young: 0 }, "8a under $25: nothing payable, it carries over; households as a count");
    const payout = (code, ref, cents, asOf = "now()") => svc(`creator_payout_record('${code}', '${ref}', ${cents}, ${asOf})`);
    money("LOW", "low2", 1);
    t.eq(report("LOW"), { households: 2, payable: 2500, carry: 0, clawbacks: 0, young: 0 }, "8b exactly $25: payable");
    money("LOW", "low3", 700, { daysOld: 10 });
    t.eq(report("LOW").young, 700, "8c a payment under 30 days old is not payable yet");
    t.eq(payout("NOSUCH", "pay-x", 1).result, "no_such_creator", "8d no such creator");
    setUp("SMALL");
    money("SMALL", "small1", 1000);
    t.eq([payout("SMALL", "pay-1", 1000).result, report("SMALL").carry], ["below_minimum", 1000], "8e a payout under $25 is refused, and the money carries over");
    t.eq([payout("LOW", "pay-wrong", 9999).result, payout("LOW", "pay-wrong", 9999).cents, rowOf("low1")], ["amount_changed", 2500, "2499,pending"], "8e2 an amount that isn't what the report says is refused, and nothing is settled");
    const paid = payout("LOW", "pay-2026-11", 2500);
    t.eq([paid.result, paid.cents, rowOf("low1"), rowOf("low2")], ["paid", 2500, "2499,paid", "1,paid"], "8f recording a payout settles what it covered");
    t.eq([rowOf("low3"), payout("LOW", "pay-again", 2500).result], ["700,pending", "below_minimum"], "8g …and only that: the young payment waits, and a second run finds nothing to pay");
    t.eq(report("LOW"), { households: 2, payable: 0, carry: 0, clawbacks: 0, young: 700 }, "8h after the payout, nothing is left but the young payment");
    t.eq(svc(`creator_commission_clawback('stripe', 'low1', null, null, null)`).result, "clawback", "8i a payment refunded after it was paid out");
    t.eq(report("LOW"), { households: 2, payable: 0, carry: -2499, clawbacks: -2499, young: 700 }, "8j …is owed back: it comes off later payouts, and shows as a negative carry-over");
    money("LOW", "low4", 3000);
    t.eq(report("LOW"), { households: 2, payable: 0, carry: 501, clawbacks: -2499, young: 700 }, "8k a later month's earnings pay it down first; what is left is under $25, so it carries over");
    money("LOW", "low5", 2000);
    t.eq(report("LOW"), { households: 2, payable: 2501, carry: 0, clawbacks: -2499, young: 700 }, "8l once the net reaches $25 it is payable");
    t.eq(payout("LOW", "pay-2026-12", 2501).cents, 2501, "8m the payout is the net");
    t.eq(report("LOW"), { households: 2, payable: 0, carry: 0, clawbacks: 0, young: 700 }, "8n the clawback is settled with it, and not taken twice");
    t.eq(sql(`select status from public.creator_commissions where payment_ref = 'low1' and clawback_of is not null`), "clawback", "8o the clawback stays a clawback");
    // A lost chargeback comes off the same way: the next payout, then later ones if short.
    setUp("CBK");
    money("CBK", "cbk1", 3000);
    t.eq(payout("CBK", "pay-cbk-1", 3000).result, "paid", "8o2 a payment paid out");
    money("CBK", "cbk2", 1000);
    t.eq(svc(`creator_commission_clawback('stripe', 'cbk1', null, null, null, 'du_cbk')`).result, "clawback", "8o3 …then lost to a chargeback");
    t.eq(report("CBK"), { households: 2, payable: 0, carry: -2000, clawbacks: -3000, young: 0 }, "8o4 it comes off what is earned next; the $20 still owed shows as a negative carry-over");
    money("CBK", "cbk3", 4500);
    t.eq(report("CBK"), { households: 2, payable: 2500, carry: 0, clawbacks: -3000, young: 0 }, "8o5 a later month pays down the rest first, and what is left is payable");
    t.eq([payout("CBK", "pay-cbk-2", 2500).cents, report("CBK").clawbacks, report("CBK").carry], [2500, 0, 0], "8o6 settled with that payout, and not taken twice");
    t.eq(svc(`creator_commission_clawback('stripe', 'cbk1', null, null, null, 'du_cbk')`).result, "already", "8o7 the same dispute, delivered again after all that: nothing");
    setUp("YOUNG");
    money("YOUNG", "y_ref", 500, { daysOld: 5 });
    svc(`creator_commission_clawback('stripe', 'y_ref', null, null, null)`);
    t.eq(report("YOUNG"), { households: 2, payable: 0, carry: 0, clawbacks: 0, young: 0 }, "8p refunded before it is 30 days old: the two cancel out, and nothing is taken from anything else");
    // The report and the payout are one snapshot: what happens after the report waits for next month.
    setUp("SNAP");
    money("SNAP", "snap1", 4000);
    const snapAt = sql(`select now()`);
    const at = `'${snapAt}'::timestamptz`;
    t.eq(report("SNAP", at).payable, 4000, "8p2 the report says $40, and $40 is sent");
    money("SNAP", "snap_late", 900);
    svc(`creator_commission_clawback('stripe', 'snap1', null, null, 1000)`);
    t.eq(report("SNAP", at).payable, 4000, "8p3 the same report, read again after a new payment and a refund, says the same");
    const snap = payout("SNAP", "pay-snap", 4000, at);
    t.eq([snap.result, rowOf("snap1"), rowOf("snap_late")], ["paid", "4000,paid", "900,pending"], "8p4 recording it settles what was sent and nothing newer, though more has matured since");
    t.eq(sql(`select (payout_ref is null)::text from public.creator_commissions where payment_ref = 'snap1' and clawback_of is not null`), "true", "8p5 a refund landing after the report is not marked settled");
    t.eq(report("SNAP").clawbacks, -4000, "8p6 …it comes off the next payout, and is recovered");
    t.ok(/check_violation|creator_payout_needs/.test(err(() => svc(`creator_payout_record('SNAP', 'x', null, ${at})`))) && /check_violation|creator_payout_needs/.test(err(() => svc(`creator_payout_record('SNAP', 'x', 1, null)`))), "8p7 a payout must say how much and as of when");
    // Households, not accounts.
    creator("COUNT");
    const cOwner = person(), cPartner = person(), cUnconfirmed = person(), cSolo = person();
    attribute(cOwner, "COUNT"); attribute(cPartner, "COUNT"); attribute(cUnconfirmed, "COUNT"); attribute(cSolo, "COUNT");
    sql(`update auth.users set email_confirmed_at = null where id = '${cUnconfirmed}'`);
    pair("count1", cOwner, cPartner);
    t.eq(report("COUNT").households, 2, "8p8 a couple who both entered it count once, and an address never confirmed doesn't count");
    creator("OTHER");
    const oOwner = person(), oPartner = person();
    attribute(oPartner, "OTHER");
    pair("count2", oOwner, oPartner);
    t.eq(report("OTHER").households, 0, "8p9 a partner's own code earns nothing while they are together, and counts for nothing");
    const shape = sql(`select pg_get_function_result('public.creator_payout_report(timestamptz)'::regprocedure)`);
    t.eq(shape.replace(/TABLE\(|\)/g, "").split(", ").map((c) => c.split(" ")[0]), ["code", "name", "payout_email", "status", "households_credited", "payable_this_month_cents", "carry_over_cents", "clawbacks_cents", "not_yet_30_days_cents"],
      "8q the report's columns: the creator's own, and totals. No household, no customer, nothing per household");

    // 9 A DELETED ACCOUNT ---------------------------------------------------------------------------------------
    creator("GONE");
    const D = person();
    attribute(D, "GONE");
    backdate(D, 60);
    pay(D, "gone1", "now() - interval '50 days'", { base: 20000 });
    sql(`delete from auth.users where id = '${D}'`);
    t.eq(sql(`select count(*) || ',' || count(user_id) from public.creator_attributions where code = 'GONE'`), "1,0", "9a the attribution stays, with the account id gone");
    t.eq(sql(`select commission_cents || ',' || (user_id is null)::text from public.creator_commissions where payment_ref = 'gone1'`), "4000,true", "9b the commission stays, with the account id gone");
    t.eq(report("GONE"), { households: 1, payable: 4000, carry: 0, clawbacks: 0, young: 0 }, "9c the money is still right");
    t.eq(svc(`creator_commission_clawback('stripe', 'gone1', null, null, null)`).result, "clawback", "9d a refund afterwards still claws back");
  } catch (e) {
    t.ok(false, "the suite ran to the end: " + String((e && (e.stderr || e.message)) || e).split("\n").slice(0, 3).join(" | ").slice(0, 300));
  } finally {
    if (started) { try { execFileSync(path.join(bin, "pg_ctl"), ["-D", path.join(dir, "data"), "-m", "immediate", "stop"], { env, stdio: "ignore" }); } catch {} }
  }
  t.summary("CREATORS (sql)");
})();
