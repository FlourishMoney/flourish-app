// tests/plusPurchaseHold.sql.test.cjs
// -----------------------------------------------------------------------------
// MIGRATION 0052 (ONE FLOURISH PLUS PURCHASE AT A TIME) IN A REAL POSTGRES (written, not run in production).
// Every migration is applied in order first, so the real household tables are what it meets.
//   0  it applies, and a second time; the table starts empty
//   1  only our server: RLS on; anon and authenticated can neither read, write, nor call the functions
//   2  a person alone: one live attempt; the same attempt again keeps its end; another of their own is refused
//   3  TWO PARTNERS: while one has a live attempt the other's is refused, in either direction, on any platform
//   4  the website: a person's own earlier website checkout is replaced by a new one; a store attempt never is
//   5  an attempt that has ended holds nobody
//   6  pending: 7 days from when it began, set once; refused even to itself; never for a website checkout
//   7  TWO PARTNERS AT THE SAME INSTANT, 20 rounds from two connections: exactly one is held, every round; and a partner
//      who asks while the other's attempt is not yet committed waits for it, then is refused
//   8  it never touches the main plan's attempts (purchase_attempts), and the main plan's never hold up Plus
//   9  a bad call writes nothing; the row goes with the account
// -----------------------------------------------------------------------------
"use strict";
const { tempDir } = require("./_tmp.cjs");
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");
const net = require("net");
const { execFileSync } = require("child_process");

const MIGRATIONS = path.join(__dirname, "..", "supabase", "migrations");
const creatorsTest = fs.readFileSync(path.join(__dirname, "creators.sql.test.cjs"), "utf8");
const STUB = creatorsTest.slice(creatorsTest.indexOf("const STUB = `") + 14, creatorsTest.indexOf("`;", creatorsTest.indexOf("const STUB = `")));
function pgBin() {
  const c = [process.env.FOUNDING_PG_BIN, "/opt/homebrew/opt/postgresql@17/bin", "/usr/local/opt/postgresql@17/bin"];
  try { for (const v of fs.readdirSync("/usr/lib/postgresql").sort().reverse()) c.push(`/usr/lib/postgresql/${v}/bin`); } catch {}
  return c.find((d) => d && ["initdb", "pg_ctl", "psql"].every((b) => fs.existsSync(path.join(d, b)))) || null;
}
const freePort = () => new Promise((ok) => { const s = net.createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => ok(p)); }); });

const { spawn } = require("child_process");

(async () => {
  const t = create();
  const bin = pgBin();
  if (!bin) { t.ok(false, "0 a Postgres to run the migrations in"); t.summary("PLUS PURCHASE HOLD (sql)"); return; }
  const env = { ...process.env, LC_ALL: "C", LANG: "C" };
  const dir = tempDir("pgph");
  const port = await freePort();
  const ARGS = ["-h", dir, "-p", String(port), "-U", "postgres", "-d", "t", "-v", "ON_ERROR_STOP=1", "-qAtX"];
  const psql = (args) => execFileSync(path.join(bin, "psql"), [...ARGS, ...args], { env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const sql = (q) => psql(["-c", q]);
  const refused = (q) => { try { sql(q); return false; } catch { return true; } };
  // The same call from a connection of its own, not waited for: two of these are two people asking at the same moment.
  const sqlAsync = (q) => new Promise((ok) => {
    const p = spawn(path.join(bin, "psql"), [...ARGS, "-c", q], { env, stdio: ["ignore", "pipe", "pipe"] });
    let out = ""; p.stdout.on("data", (d) => { out += d; }); p.on("close", () => ok(out.trim()));
  });
  let started = false;
  try {
    execFileSync(path.join(bin, "initdb"), ["-D", path.join(dir, "data"), "-U", "postgres", "-A", "trust"], { env, stdio: "ignore" });
    execFileSync(path.join(bin, "pg_ctl"), ["-D", path.join(dir, "data"), "-o", `-p ${port} -k ${dir} -c listen_addresses=''`, "-l", path.join(dir, "log"), "-w", "start"], { env, stdio: "ignore" });
    started = true;
    execFileSync(path.join(bin, "psql"), ["-h", dir, "-p", String(port), "-U", "postgres", "-d", "postgres", "-qAtX", "-c", "create database t"], { env, stdio: "ignore" });
    fs.writeFileSync(path.join(dir, "stub.sql"), STUB); psql(["-f", path.join(dir, "stub.sql")]);
    const files = fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();
    const failed = [];
    for (const f of files) { try { psql(["-f", path.join(MIGRATIONS, f)]); } catch (e) { failed.push(`${f}: ${String(e.stderr || e.message).split("\n").find((l) => /ERROR/.test(l))}`); } }
    t.eq(failed, [], "0a every migration applies in order, 0052 included");
    const FILE = path.join(MIGRATIONS, "0052_plus_purchase_attempts.sql");
    psql(["-f", FILE]); t.ok(true, "0b and 0052 runs a second time without error");
    t.eq(sql("select count(*) from public.plus_purchase_attempts"), "0", "0c the table starts empty");

    // ── 1. only our server ──
    t.eq(sql("select relrowsecurity from pg_class where oid = 'public.plus_purchase_attempts'::regclass"), "t", "1a RLS is on");
    for (const role of ["anon", "authenticated"]) {
      t.ok(refused(`set role ${role}; select * from public.plus_purchase_attempts`), `1b ${role} cannot read it`);
      t.ok(refused(`set role ${role}; insert into public.plus_purchase_attempts (user_id, provider, attempt_id, expires_at) values (gen_random_uuid(), 'stripe', 'x', now())`), `1c ${role} cannot write it`);
      t.ok(refused(`set role ${role}; select public.plus_purchase_attempt_begin(gen_random_uuid(), 'app_store', 'plus-12345678')`), `1d ${role} cannot begin an attempt`);
      t.ok(refused(`set role ${role}; select public.plus_purchase_attempt_pending(gen_random_uuid(), 'plus-12345678')`), `1e ${role} cannot mark one pending`);
    }

    const person = () => sql("insert into auth.users (email, email_confirmed_at) values ('t' || gen_random_uuid() || '@example.test', now()) returning id").split("\n")[0];
    const household = (a, b) => {
      const h = sql(`insert into public.households (created_by, owner_consented_at) values ('${a}', now()) returning id`).split("\n")[0];
      sql(`insert into public.household_members (household_id, user_id, role, consented_at) values ('${h}', '${a}', 'owner', now()), ('${h}', '${b}', 'partner', now())`);
      return h;
    };
    const begin = (u, provider, attempt, ttl = "32 minutes") => JSON.parse(sql(`select public.plus_purchase_attempt_begin('${u}', '${provider}', '${attempt}', interval '${ttl}')`));
    const pending = (u, attempt) => JSON.parse(sql(`select public.plus_purchase_attempt_pending('${u}', '${attempt}')`));
    const row = (u) => sql(`select provider || '|' || attempt_id || '|' || pending || '|' || round(extract(epoch from (expires_at - created_at)) / 60) from public.plus_purchase_attempts where user_id = '${u}'`);
    const expire = (u) => sql(`update public.plus_purchase_attempts set expires_at = now() - interval '1 second' where user_id = '${u}'`);

    // ── 2. a person alone ──
    const solo = person();
    const s1 = begin(solo, "app_store", "plus-solo-0001");
    t.eq([s1.result, row(solo)], ["held", "app_store|plus-solo-0001|false|32"], "2a a person alone is held for their attempt: 32 minutes from when it began");
    const end1 = sql(`select expires_at from public.plus_purchase_attempts where user_id = '${solo}'`);
    const s2 = begin(solo, "app_store", "plus-solo-0001");
    t.eq([s2.result, s2.again, sql(`select expires_at from public.plus_purchase_attempts where user_id = '${solo}'`) === end1], ["held", true, true], "2b the same attempt again is still held, and its end has not moved");
    const s3 = begin(solo, "app_store", "plus-solo-0002");
    t.eq([s3.result, s3.mine, s3.provider, row(solo)], ["held_elsewhere", true, "app_store", "app_store|plus-solo-0001|false|32"], "2c another attempt of their own is refused while the first lives, and nothing is written");
    const s4 = begin(solo, "play_store", "plus-solo-0001");
    t.eq([s4.result, s4.mine], ["held_elsewhere", true], "2d …the same id from another store included");

    // ── 3. two partners ──
    const A = person(), B = person(); household(A, B);
    const a1 = begin(A, "app_store", "plus-aaaa-0001");
    const b1 = begin(B, "play_store", "plus-bbbb-0001");
    t.eq([a1.result, b1.result, b1.mine, b1.provider, sql(`select count(*) from public.plus_purchase_attempts where user_id = '${B}'`)], ["held", "held_elsewhere", false, "app_store", "0"],
      "3a while one partner has a live attempt the other's is refused, and nothing is written for them");
    t.eq(begin(B, "stripe", "plusweb-bbbb-0001").result, "held_elsewhere", "3b …on the website too");
    t.eq(begin(A, "app_store", "plus-aaaa-0001").result, "held", "3c the first partner's own attempt is still theirs");
    expire(A);
    const b2 = begin(B, "play_store", "plus-bbbb-0002");
    const a2 = begin(A, "app_store", "plus-aaaa-0002");
    t.eq([b2.result, a2.result, a2.mine], ["held", "held_elsewhere", false], "3d once it has ended the other partner can buy, and then it is the first who is refused");
    const C = person();
    t.eq(begin(C, "app_store", "plus-cccc-0001").result, "held", "3e somebody in no household, or in another one, is never held up by them");

    // ── 4. the website ──
    const web = person();
    begin(web, "stripe", "plusweb-0000-0001");
    const w2 = begin(web, "stripe", "plusweb-0000-0002");
    t.eq([w2.result, row(web)], ["held", "stripe|plusweb-0000-0002|false|32"], "4a a person's new website checkout replaces their own earlier one (the server expired that checkout at Stripe first)");
    const w3 = begin(web, "app_store", "plus-web0-0003");
    t.eq([w3.result, w3.mine, w3.provider], ["held_elsewhere", true, "stripe"], "4b …but they cannot buy it in a store while that checkout is open");
    const st = person(); begin(st, "app_store", "plus-stor-0001");
    t.eq(begin(st, "stripe", "plusweb-stor-0002").result, "held_elsewhere", "4c and a store attempt is never replaced by a website checkout");

    // ── 5. an attempt that has ended holds nobody ──
    expire(solo);
    const s5 = begin(solo, "play_store", "plus-solo-0005");
    t.eq([s5.result, row(solo)], ["held", "play_store|plus-solo-0005|false|32"], "5a after it ends, a new attempt is held and takes the row");

    // ── 6. pending ──
    const pe = person(), pp = person(); household(pe, pp);
    begin(pe, "app_store", "plus-pend-0001");
    const p1 = pending(pe, "plus-pend-0001");
    t.eq([p1.result, sql(`select pending || '|' || round(extract(epoch from (expires_at - created_at)) / 86400) from public.plus_purchase_attempts where user_id = '${pe}'`)], ["pending", "true|7"], "6a the store says pending: the attempt keeps 7 days from when it began");
    const endP = sql(`select expires_at from public.plus_purchase_attempts where user_id = '${pe}'`);
    pending(pe, "plus-pend-0001");
    t.eq(sql(`select expires_at from public.plus_purchase_attempts where user_id = '${pe}'`), endP, "6b set once: saying it again does not move the end");
    t.eq([begin(pe, "app_store", "plus-pend-0001").result, begin(pp, "play_store", "plus-ppar-0001").result], ["held_elsewhere", "held_elsewhere"], "6c a pending attempt is refused even to itself, and holds the partner for its 7 days");
    t.eq([pending(pe, "plus-other-0009").result, pending(pp, "plus-pend-0001").result], ["not_held", "not_held"], "6d an attempt that is not this person's live one is not made pending");
    const wp = person(); begin(wp, "stripe", "plusweb-pend-0001");
    t.eq([pending(wp, "plusweb-pend-0001").result, row(wp)], ["not_held", "stripe|plusweb-pend-0001|false|32"], "6e a website checkout is never pending");

    // ── 7. two partners at the same instant ──
    const X = person(), Y = person(); household(X, Y);
    const outcomes = [];
    for (let i = 0; i < 20; i++) {
      sql(`delete from public.plus_purchase_attempts where user_id in ('${X}', '${Y}')`);
      const [x, y] = await Promise.all([
        sqlAsync(`select public.plus_purchase_attempt_begin('${X}', 'app_store', 'plus-race-x-${i}') ->> 'result'`),
        sqlAsync(`select public.plus_purchase_attempt_begin('${Y}', 'play_store', 'plus-race-y-${i}') ->> 'result'`),
      ]);
      const live = sql(`select count(*) from public.plus_purchase_attempts where user_id in ('${X}', '${Y}') and expires_at > now()`);
      outcomes.push([x, y].sort().join("+") + ":" + live);
    }
    t.eq([...new Set(outcomes)], ["held+held_elsewhere:1"], "7a two partners asking at the same instant, 20 rounds from two connections: exactly one is held and one attempt is live, every round");

    // …and deliberately: the first partner's call is still inside its transaction (not committed) when the second asks.
    // The second must WAIT for it and then see it. Without the household's row lock it would read "nobody is buying".
    sql(`delete from public.plus_purchase_attempts where user_id in ('${X}', '${Y}')`);
    const slow = sqlAsync(`begin; select public.plus_purchase_attempt_begin('${X}', 'app_store', 'plus-slow-x-1') ->> 'result'; select pg_sleep(1.2); commit;`);
    await new Promise((r) => setTimeout(r, 400));
    const t0 = Date.now();
    const quick = JSON.parse(sql(`select public.plus_purchase_attempt_begin('${Y}', 'play_store', 'plus-slow-y-1')`));
    const waited = Date.now() - t0;
    t.eq([(await slow).split("\n")[0], quick.result, quick.mine, waited >= 500], ["held", "held_elsewhere", false, true],
      `7b a partner who asks while the other's attempt is still being written waits for it (${waited} ms) and is then refused: never two`);

    // ── 8. the main plan's attempts are its own ──
    const M = person();
    sql(`select public.purchase_attempt_begin('${M}', 'app_store', 'store-main-0001')`);
    const m1 = begin(M, "app_store", "plus-main-0001");
    t.eq([m1.result, sql(`select attempt_id from public.purchase_attempts where user_id = '${M}'`), sql(`select attempt_id from public.plus_purchase_attempts where user_id = '${M}'`)], ["held", "store-main-0001", "plus-main-0001"],
      "8a a household that has just bought the main plan (its attempt still live) can add Plus straight away; each attempt is in its own table");
    const m2 = JSON.parse(sql(`select public.purchase_attempt_begin('${C}', 'app_store', 'store-cccc-0001')`));
    t.eq(m2.result, "held", "8b …and a live Plus attempt never holds up a main-plan purchase");

    // ── 9. a bad call, and the account ──
    const before = sql("select count(*) from public.plus_purchase_attempts");
    t.ok(refused(`select public.plus_purchase_attempt_begin('${person()}', 'paypal', 'plus-bad0-0001')`) && refused(`select public.plus_purchase_attempt_begin('${person()}', 'app_store', '')`)
      && refused(`select public.plus_purchase_attempt_begin(null, 'app_store', 'plus-bad0-0002')`) && sql("select count(*) from public.plus_purchase_attempts") === before,
      "9a an unknown store, an empty attempt or no person is refused, and writes nothing");
    sql(`delete from auth.users where id = '${C}'`);
    t.eq(sql(`select count(*) from public.plus_purchase_attempts where user_id = '${C}'`), "0", "9b deleting the account deletes its attempt");
  } catch (e) {
    t.ok(false, `the suite ran: ${String(e.stderr || e.message).split("\n").slice(0, 3).join(" | ")}`);
  } finally {
    if (started) { try { execFileSync(path.join(bin, "pg_ctl"), ["-D", path.join(dir, "data"), "-m", "immediate", "stop"], { env, stdio: "ignore" }); } catch {} }
  }
  t.summary("PLUS PURCHASE HOLD (sql)");
})();
