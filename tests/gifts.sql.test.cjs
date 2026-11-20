// tests/gifts.sql.test.cjs
// -----------------------------------------------------------------------------
// GIFTS IN A REAL POSTGRES (migration 0050). Every migration runs in order in a throwaway cluster started for this test
// and removed when it ends, on the same small stand-in for Supabase as tests/foundingSeats.sql.test.cjs. Then:
//   0  every migration applies, and 0050 a second time changes nothing
//   1  locked: row level security on, no policy; the browser roles can neither read the table nor call a function; the
//      server can select, insert and update, and nobody can delete
//   2  one code per Stripe session: a repeated webhook gets the same row back, never a second code; a code already taken
//      is reported as a collision; the code's shape and the emailed gift's fields are enforced by the table
//   3  redeeming: 12 months from now; from the buyer's start day (00:00 Eastern) when that is later; from the end of a
//      paid period when the account already pays; after the end of a gift it already holds; "used" for another account
//      (never who), "mine" for the same one, "void" once refunded, "invalid" for anything else
//   4  two accounts redeeming one code at the same moment: exactly one gets it
//   5  the entitlement: covered while the 12 months run, not before, not after, never once voided
//   6  a refund: a full one voids an unused gift and clears the name and message; a partial one, or a redeemed gift, is
//      left as it is
//   7  the recipient's email queue: claimed only from 07:00 Eastern on its day (winter and summer time), once, never
//      again once sent, never while another run holds it, again after 30 minutes; never a refunded or redeemed gift
// Postgres comes from FOUNDING_PG_BIN, Homebrew (postgresql@17) or the copy GitHub's Ubuntu runner ships.
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
const M50 = path.join(MIGRATIONS, "0050_gift_codes.sql");

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
  user_id uuid references auth.users(id) on delete cascade,
  user_agent text,
  created_at timestamptz not null default now()
);
create or replace function auth.uid() returns uuid language sql stable as $f$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $f$;
create or replace function auth.jwt() returns jsonb language sql stable as $f$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $f$;
create or replace function auth.role() returns text language sql stable as $f$
  select coalesce(auth.jwt()->>'role', '') $f$;
create schema if not exists extensions;
create extension if not exists pgcrypto schema extensions;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
`;

function pgBin() {
  const cands = [process.env.FOUNDING_PG_BIN, "/opt/homebrew/opt/postgresql@17/bin", "/usr/local/opt/postgresql@17/bin"];
  try { for (const v of fs.readdirSync("/usr/lib/postgresql").sort().reverse()) cands.push(`/usr/lib/postgresql/${v}/bin`); } catch {}
  return cands.find((d) => d && fs.existsSync(path.join(d, "initdb")) && fs.existsSync(path.join(d, "pg_ctl")) && fs.existsSync(path.join(d, "psql"))) || null;
}
const freePort = () => new Promise((ok) => { const s = net.createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => ok(p)); }); });

(async () => {
  const t = create();
  const bin = pgBin();
  if (!bin) { t.ok(false, "0 a Postgres to run the migrations in (FOUNDING_PG_BIN, Homebrew postgresql@17, or /usr/lib/postgresql)"); t.summary("GIFTS (sql)"); return; }
  const env = { ...process.env, LC_ALL: "C", LANG: "C", PGTZ: "UTC" };
  const dir = tempDir("pg-gift");
  const port = await freePort();
  const psqlArgs = (db) => ["-h", dir, "-p", String(port), "-U", "postgres", "-d", db, "-v", "ON_ERROR_STOP=1", "-qAtX"];
  const psql = (args, db = "t") => execFileSync(path.join(bin, "psql"), [...psqlArgs(db), ...args], { env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const sql = (q, db = "t") => psql(["-c", q], db);
  const file = (f, db = "t") => psql(["-f", f], db);
  const fails = (q, db = "t") => { try { sql(q, db); return null; } catch (e) { return String(e.stderr || e.message); } };
  const lit = (s) => (s == null ? "null" : `'${String(s).replace(/'/g, "''")}'`);
  const j = (q) => JSON.parse(sql(q) || "null");
  const account = (email) => sql(`insert into auth.users (email, email_confirmed_at) values (${lit(email)}, now()) returning id`);
  const create_ = (o) => j(`select public.gift_create(${lit(o.code)}, ${lit(o.plan || "flourish")}, ${lit(o.session)}, ${lit(o.pi || null)}, false,
      ${lit(o.buyer || "buyer@example.ca")}, ${lit(o.delivery || "print")}, ${lit(o.name || null)}, ${lit(o.email || null)}, ${lit(o.message || null)},
      ${lit(o.sendOn || null)}, ${lit(o.startOn || null)}, 9999, 1300, 11299, 'cad')`);
  const redeem = (code, user, notBefore, now) => j(`select public.gift_redeem(${lit(code)}, ${lit(user)}::uuid, ${notBefore ? lit(notBefore) + "::timestamptz" : "null"}, ${lit(now)}::timestamptz)`);
  const cover = (user, now) => j(`select public.gift_cover(${lit(user)}::uuid, ${lit(now)}::timestamptz)`);
  const claim = (now, limit = 5) => sql(`select string_agg(code, ',' order by code) from public.gift_claim_due_sends(${lit(now)}::timestamptz, ${limit})`);
  const iso = (v) => new Date(v).toISOString();

  let started = false;
  try {
    execFileSync(path.join(bin, "initdb"), ["-D", path.join(dir, "data"), "-U", "postgres", "-A", "trust"], { env, stdio: "ignore" });
    execFileSync(path.join(bin, "pg_ctl"), ["-D", path.join(dir, "data"), "-o", `-p ${port} -k ${dir} -c listen_addresses=''`, "-l", path.join(dir, "log"), "-w", "start"], { env, stdio: "ignore" });
    started = true;
    fs.writeFileSync(path.join(dir, "stub.sql"), SUPABASE_STUB);
    psql(["-c", "create database t"], "postgres");
    file(path.join(dir, "stub.sql"));
    const files = fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();
    const failed = [];
    for (const f of files) { try { file(path.join(MIGRATIONS, f)); } catch (e) { failed.push(`${f}: ${String(e.stderr || e.message).split("\n").find((l) => /ERROR/.test(l)) || ""}`); } }
    t.eq(failed, [], `0a every migration applies in order (${files.length}, the last ${files[files.length - 1]})`);
    t.eq(fails(`\\i ${M50}`) && null, null, "0b …and 0050 again changes nothing");
    try { file(M50); t.ok(true, "0c 0050 runs a second time"); } catch (e) { t.ok(false, `0c 0050 runs a second time: ${e.stderr}`); }

    // ── 1. locked ────────────────────────────────────────────────────────────────────────────────────
    t.eq(sql("select relrowsecurity from pg_class where oid = 'public.gift_codes'::regclass"), "t", "1a row level security is on");
    t.eq(sql("select count(*) from pg_policies where tablename = 'gift_codes'"), "0", "1b …with no policy");
    t.eq(sql("select string_agg(grantee || ':' || privilege_type, ',' order by grantee, privilege_type) from information_schema.role_table_grants where table_schema = 'public' and table_name = 'gift_codes' and grantee in ('anon','authenticated','service_role')"),
      "service_role:INSERT,service_role:SELECT,service_role:UPDATE", "1c only the server reads and writes it, and nobody deletes a row");
    const FNS = ["gift_create(text,text,text,text,boolean,text,text,text,text,text,date,date,integer,integer,integer,text)", "gift_mark_buyer_emailed(text,timestamp with time zone)",
      "gift_refund(text,boolean,timestamp with time zone)", "gift_redeem(text,uuid,timestamp with time zone,timestamp with time zone)", "gift_cover(uuid,timestamp with time zone)",
      "gift_claim_due_sends(timestamp with time zone,integer)", "gift_mark_sent(text,timestamp with time zone)", "gift_mark_send_failed(text,text)", "gift_release_send(text,text)"];
    const can = (role, fn) => sql(`select has_function_privilege('${role}', 'public.${fn}', 'execute')`);
    t.eq(FNS.map((f) => [can("anon", f), can("authenticated", f), can("service_role", f)].join("")), FNS.map(() => "fft"), "1d no browser role may call a gift function; the server may");
    t.ok(/permission denied/.test(fails("set role authenticated; select * from public.gift_codes;") || ""), "1e a signed-in browser cannot read a single code");

    // ── 2. one code per Stripe session ───────────────────────────────────────────────────────────────
    const first = create_({ code: "ABCDEFGHJKMN", session: "cs_test_1", pi: "pi_1", delivery: "email", name: "Sam", email: "sam@example.ca", message: "Merry Christmas", sendOn: "2026-12-25" });
    t.eq([first.created, first.collision, first.code, first.status, first.send_on], [true, false, "ABCDEFGHJKMN", "unused", "2026-12-25"], "2a a paid session makes its code");
    const again = create_({ code: "ZZZZZZZZZZZZ", session: "cs_test_1", pi: "pi_1", delivery: "email", name: "Sam", email: "sam@example.ca", sendOn: "2026-12-25" });
    t.eq([again.created, again.code], [false, "ABCDEFGHJKMN"], "2b the same session again (a repeated webhook) answers the same code and makes none");
    t.eq(sql("select count(*) from public.gift_codes where stripe_session_id = 'cs_test_1'"), "1", "2c …one row");
    const clash = create_({ code: "ABCDEFGHJKMN", session: "cs_test_2", pi: "pi_2" });
    t.eq([clash.created, clash.collision], [false, true], "2d a code already taken is a collision, and the server tries another");
    t.ok(/check constraint/.test(fails("select public.gift_create('abc', 'flourish', 'cs_x', null, false, 'b@x.ca', 'print', null, null, null, null, null, null, null, null, null)") || ""), "2e a code of the wrong shape is refused");
    t.ok(/gift_codes_email_delivery/.test(fails("select public.gift_create('BBBBBBBBBBBB', 'flourish', 'cs_y', null, false, 'b@x.ca', 'email', 'Al', null, null, null, null, null, null, null, null)") || ""), "2f an emailed gift needs an address and a day");
    t.ok(/check constraint/.test(fails("select public.gift_create('CCCCCCCCCCCC', 'pro', 'cs_z', null, false, 'b@x.ca', 'print', null, null, null, null, null, null, null, null, null)") || ""), "2g only the two gift plans exist");

    // ── 3. redeeming ─────────────────────────────────────────────────────────────────────────────────
    const U1 = account("one@example.ca"), U2 = account("two@example.ca"), U3 = account("three@example.ca"), U4 = account("four@example.ca");
    create_({ code: "DDDDDDDDDDDD", session: "cs_3a" });
    const r1 = redeem("DDDDDDDDDDDD", U1, null, "2026-12-26T15:00:00Z");
    t.eq([r1.result, iso(r1.starts_at), iso(r1.ends_at)], ["ok", "2026-12-26T15:00:00.000Z", "2027-12-26T15:00:00.000Z"], "3a no start day: 12 months from the moment it is redeemed");
    t.eq(redeem("DDDDDDDDDDDD", U2, null, "2026-12-27T15:00:00Z").result, "used", "3b another account: used, and never whose");
    const mine = redeem("DDDDDDDDDDDD", U1, null, "2026-12-27T15:00:00Z");
    t.eq([mine.result, iso(mine.ends_at)], ["mine", "2027-12-26T15:00:00.000Z"], "3c the same account again: mine, with its dates, and nothing changes");
    create_({ code: "EEEEEEEEEEEE", session: "cs_3b", startOn: "2027-01-01" });
    const r2 = redeem("EEEEEEEEEEEE", U2, null, "2026-12-25T15:00:00Z");
    t.eq([iso(r2.starts_at), iso(r2.ends_at)], ["2027-01-01T05:00:00.000Z", "2028-01-01T05:00:00.000Z"], "3d a start day still to come: 00:00 Eastern that day, for 12 months");
    create_({ code: "FFFFFFFFFFFF", session: "cs_3c", startOn: "2026-12-01" });
    t.eq(iso(redeem("FFFFFFFFFFFF", U3, null, "2026-12-20T15:00:00Z").starts_at), "2026-12-20T15:00:00.000Z", "3e a start day already past: from the moment it is redeemed");
    create_({ code: "GGGGGGGGGGGG", session: "cs_3d" });
    const paid = redeem("GGGGGGGGGGGG", U4, "2027-03-10T12:00:00Z", "2026-12-20T15:00:00Z");
    t.eq([iso(paid.starts_at), iso(paid.ends_at)], ["2027-03-10T12:00:00.000Z", "2028-03-10T12:00:00.000Z"], "3f an account that already pays: from the end of its paid period");
    create_({ code: "HHHHHHHHHHHH", session: "cs_3e" });
    const stacked = redeem("HHHHHHHHHHHH", U1, null, "2027-02-01T15:00:00Z");
    t.eq([iso(stacked.starts_at), iso(stacked.ends_at)], ["2027-12-26T15:00:00.000Z", "2028-12-26T15:00:00.000Z"], "3g a second gift on one account: it starts when the first one ends");
    t.eq(redeem("JJJJJJJJJJJJ", U1, null, "2027-02-01T15:00:00Z").result, "invalid", "3h a code that does not exist: invalid");
    t.eq(redeem("not a code", U1, null, "2027-02-01T15:00:00Z").result, "invalid", "3i …and anything not shaped like one");
    t.eq(sql("select string_agg(status, ',' order by code) from public.gift_codes where code in ('DDDDDDDDDDDD','JJJJJJJJJJJJ')"), "redeemed", "3j the status follows the dates");

    // ── 4. one code, two accounts, the same moment ───────────────────────────────────────────────────
    create_({ code: "KKKKKKKKKKKK", session: "cs_4" });
    const U5 = account("five@example.ca"), U6 = account("six@example.ca");
    const race = (u) => new Promise((ok) => {
      const p = spawn(path.join(bin, "psql"), [...psqlArgs("t"), "-c", `select pg_sleep(0.3); select public.gift_redeem('KKKKKKKKKKKK', '${u}'::uuid, null, now())->>'result'`], { env });
      let out = ""; p.stdout.on("data", (d) => { out += d; }); p.on("close", () => ok(out.trim().split("\n").pop()));
    });
    const results = (await Promise.all([race(U5), race(U6)])).sort();
    t.eq(results, ["ok", "used"], "4a exactly one of the two gets it; the other is told it was already redeemed");
    t.eq(sql("select count(*) from public.gift_codes where code = 'KKKKKKKKKKKK' and redeemed_by is not null"), "1", "4b …and the row names one account");

    // ── 5. the entitlement ───────────────────────────────────────────────────────────────────────────
    const c1 = cover(U1, "2027-06-01T00:00:00Z");
    t.eq([c1.covered, c1.plus, iso(c1.ends_at), c1.next_starts_at], [true, false, "2028-12-26T15:00:00.000Z", "2027-12-26T15:00:00+00:00"], "5a while the 12 months run: covered; ends_at is the last gift's end, and the next one's start is known");
    t.eq(cover(U2, "2026-12-30T00:00:00Z").covered, false, "5b before its start day: not yet");
    t.eq(iso(cover(U2, "2026-12-30T00:00:00Z").next_starts_at), "2027-01-01T05:00:00.000Z", "5c …and when it starts");
    t.eq(cover(U2, "2027-01-02T00:00:00Z").covered, true, "5d from its start day: covered");
    t.eq(cover(U2, "2028-01-02T00:00:00Z").covered, false, "5e after the 12 months: not covered");
    create_({ code: "TTTTTTTTTTTT", session: "cs_5", plan: "flourish_plus" });
    const U7 = account("seven@example.ca");
    redeem("TTTTTTTTTTTT", U7, null, "2026-12-20T15:00:00Z");
    t.eq([cover(U7, "2027-01-01T00:00:00Z").covered, cover(U7, "2027-01-01T00:00:00Z").plus], [true, true], "5f a Plus gift says so");
    sql("update public.gift_codes set voided_at = now(), void_reason = 'test' where code = 'TTTTTTTTTTTT'");
    t.eq(cover(U7, "2027-01-01T00:00:00Z").covered, false, "5g a voided gift never counts");
    t.eq(cover(U6, "2027-01-01T00:00:00Z").covered || cover(U5, "2027-01-01T00:00:00Z").covered, true, "5h the race's winner holds the gift");

    // ── 6. refunds ───────────────────────────────────────────────────────────────────────────────────
    create_({ code: "MMMMMMMMMMMM", session: "cs_6a", pi: "pi_6a", delivery: "email", name: "Lee", email: "lee@example.ca", message: "hi", sendOn: "2026-12-24" });
    t.eq(j("select public.gift_refund('pi_6a', false)"), { found: true, partial: true }, "6a a partial refund leaves the code as it is");
    t.eq(j("select public.gift_refund('pi_6a', true)"), { found: true, voided: true }, "6b a full refund of an unused gift voids it");
    t.eq(sql("select status || ':' || coalesce(recipient_name, '-') || ':' || coalesce(gift_message, '-') from public.gift_codes where code = 'MMMMMMMMMMMM'"), "void:-:-", "6c …and clears the name and the message");
    t.eq(j("select public.gift_refund('pi_6a', true)"), { found: true, already_void: true }, "6d a refund delivered twice changes nothing");
    t.eq(redeem("MMMMMMMMMMMM", U3, null, "2026-12-26T15:00:00Z").result, "void", "6e a voided code cannot be redeemed: void");
    create_({ code: "NNNNNNNNNNNN", session: "cs_6b", pi: "pi_6b" });
    redeem("NNNNNNNNNNNN", U3, null, "2026-12-26T15:00:00Z");
    t.eq(j("select public.gift_refund('pi_6b', true)"), { found: true, redeemed: true }, "6f a refund after it was redeemed: the code stays, and the server logs it");
    t.eq(sql("select status from public.gift_codes where code = 'NNNNNNNNNNNN'"), "redeemed", "6g …still redeemed");
    t.eq(j("select public.gift_refund('pi_nothing', true)"), { found: false }, "6h a refund for anything else: not a gift");

    // ── 7. the recipient's email, on its day ─────────────────────────────────────────────────────────
    sql("update public.gift_codes set recipient_sent_at = now() where delivery = 'email' and code <> 'MMMMMMMMMMMM'");   // the earlier rows are done with
    create_({ code: "PPPPPPPPPPPP", session: "cs_7a", delivery: "email", name: "Pat", email: "pat@example.ca", sendOn: "2026-12-25" });
    create_({ code: "QQQQQQQQQQQQ", session: "cs_7b", delivery: "email", name: "Quinn", email: "quinn@example.ca", sendOn: "2027-07-01" });
    create_({ code: "RRRRRRRRRRRR", session: "cs_7c", delivery: "email", name: "Robin", email: "robin@example.ca", sendOn: "2026-12-25" });
    create_({ code: "SSSSSSSSSSSS", session: "cs_7d", pi: "pi_7d", delivery: "email", name: "Sky", email: "sky@example.ca", sendOn: "2026-12-25" });
    redeem("RRRRRRRRRRRR", U6, null, "2026-12-20T15:00:00Z");         // the buyer passed the code on early
    j("select public.gift_refund('pi_7d', true)");                     // refunded before its day
    t.eq(claim("2026-12-25T11:59:00Z"), "", "7a at 06:59 Eastern on its day (winter time): nothing yet");
    t.eq(claim("2026-12-25T12:00:00Z"), "PPPPPPPPPPPP", "7b at 07:00 Eastern: claimed; never the redeemed one or the refunded one");
    t.eq(claim("2026-12-25T12:15:00Z"), "", "7c the next run, 15 minutes later: another run holds it, so it is not taken again");
    t.eq(claim("2026-12-25T12:31:00Z"), "PPPPPPPPPPPP", "7d a claim older than 30 minutes (a run that died) may be taken again");
    t.eq(sql("select public.gift_mark_sent('PPPPPPPPPPPP', '2026-12-25T12:31:05Z')"), "t", "7e the send is recorded");
    t.eq(sql("select public.gift_mark_sent('PPPPPPPPPPPP', '2026-12-25T12:32:00Z')"), "f", "7f …once");
    t.eq(claim("2026-12-26T12:00:00Z"), "", "7g once sent, never claimed again");
    t.eq(sql("select coalesce(recipient_name, '-') || coalesce(gift_message, '-') from public.gift_codes where code = 'PPPPPPPPPPPP'"), "--", "7h …and its name and message are gone");
    t.eq(claim("2027-07-01T10:59:00Z"), "", "7i summer time: nothing at 06:59 Eastern");
    t.eq(claim("2027-07-01T11:00:00Z"), "QQQQQQQQQQQQ", "7j …claimed at 07:00 Eastern (11:00 UTC)");
    sql("select public.gift_release_send('QQQQQQQQQQQQ', 'email_no_key')");
    t.eq(sql("select recipient_send_attempts || ':' || (recipient_send_claimed_at is null) from public.gift_codes where code = 'QQQQQQQQQQQQ'"), "0:true", "7k email switched off: the claim and the attempt both go back");
    sql("update public.gift_codes set recipient_send_attempts = 10 where code = 'QQQQQQQQQQQQ'");
    t.eq(claim("2027-07-02T11:00:00Z"), "", "7l after 10 attempts the row is left for Amanda");
  } catch (e) {
    t.ok(false, `the run threw: ${e.stderr || e.message}`);
  } finally {
    if (started) { try { execFileSync(path.join(bin, "pg_ctl"), ["-D", path.join(dir, "data"), "-m", "immediate", "stop"], { env, stdio: "ignore" }); } catch {} }
  }
  t.summary("GIFTS (sql)");
})();
