// tests/plusHoldingsStore.sql.test.cjs
// -----------------------------------------------------------------------------
// MIGRATION 0055 (PLUS: EACH PERSON'S HOLDINGS, KEPT PRIVATELY ON THE SERVER) IN A REAL POSTGRES (written, not run in
// production). Every migration is applied in order first, so the real plaid_items table is what it meets.
//   0  it applies, and a second time; the table starts empty
//   1  only our server: RLS on; anon and authenticated can neither read nor write it
//   2  a connected bank's list is kept, and kept again replaces it; a list that is not a list is refused
//   3  NEW-1 (round 3 of the review): a list can only be kept for a bank that is CONNECTED, in the name of the person
//      who linked it. A bank that was disconnected takes its list with it, and a save that arrives late (the read of the
//      bank was already on its way when the person disconnected) is refused: nothing is left behind.
//   4  THE SAME, AT THE SAME INSTANT, from two connections: whichever of "disconnect" and "keep the list" gets there
//      first, the other waits for it, and the bank ends with no list
//   5  the rows go with the account
// -----------------------------------------------------------------------------
"use strict";
const { tempDir } = require("./_tmp.cjs");
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");
const net = require("net");
const { execFileSync, spawn } = require("child_process");

const MIGRATIONS = path.join(__dirname, "..", "supabase", "migrations");
const creatorsTest = fs.readFileSync(path.join(__dirname, "creators.sql.test.cjs"), "utf8");
const STUB = creatorsTest.slice(creatorsTest.indexOf("const STUB = `") + 14, creatorsTest.indexOf("`;", creatorsTest.indexOf("const STUB = `")));
function pgBin() {
  const c = [process.env.FOUNDING_PG_BIN, "/opt/homebrew/opt/postgresql@17/bin", "/usr/local/opt/postgresql@17/bin"];
  try { for (const v of fs.readdirSync("/usr/lib/postgresql").sort().reverse()) c.push(`/usr/lib/postgresql/${v}/bin`); } catch {}
  return c.find((d) => d && ["initdb", "pg_ctl", "psql"].every((b) => fs.existsSync(path.join(d, b)))) || null;
}
const freePort = () => new Promise((ok) => { const s = net.createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => ok(p)); }); });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const t = create();
  const bin = pgBin();
  if (!bin) { t.ok(false, "0 a Postgres to run the migrations in"); t.summary("PLUS HOLDINGS STORE (sql)"); return; }
  const env = { ...process.env, LC_ALL: "C", LANG: "C" };
  const dir = tempDir("pghs");
  const port = await freePort();
  const ARGS = ["-h", dir, "-p", String(port), "-U", "postgres", "-d", "t", "-v", "ON_ERROR_STOP=1", "-qAtX"];
  const psql = (args) => execFileSync(path.join(bin, "psql"), [...ARGS, ...args], { env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const sql = (q) => psql(["-c", q]);
  // The error a statement was refused with ("" when it was not refused).
  const refusal = (q) => { try { sql(q); return ""; } catch (e) { return String(e.stderr || e.message); } };
  // …with the SQLSTATE in it.
  const refusalCode = (q) => { try { psql(["-v", "VERBOSITY=verbose", "-c", q]); return ""; } catch (e) { return String(e.stderr || e.message); } };
  // The same from a connection of its own, not waited for: { out, err, ms }.
  const sqlAsync = (q) => new Promise((ok) => {
    const at = Date.now();
    const p = spawn(path.join(bin, "psql"), [...ARGS, "-c", q], { env, stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = ""; p.stdout.on("data", (d) => { out += d; }); p.stderr.on("data", (d) => { err += d; });
    p.on("close", () => ok({ out: out.trim(), err: err.trim(), ms: Date.now() - at }));
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
    t.eq(failed, [], "0a every migration applies in order, 0055 included");
    const FILE = path.join(MIGRATIONS, "0055_plus_holdings_private.sql");
    psql(["-f", FILE]); t.ok(true, "0b and 0055 runs a second time without error");
    t.eq(sql("select count(*) from public.plus_holdings"), "0", "0c the table starts empty");

    const person = () => sql("insert into auth.users (email, email_confirmed_at) values ('t' || gen_random_uuid() || '@example.test', now()) returning id").split("\n")[0];
    const connect = (u, item) => sql(`insert into public.plaid_items (user_id, item_id, access_token) values ('${u}', '${item}', 'access-sandbox-test')`);
    const disconnect = (u, item) => sql(`delete from public.plaid_items where user_id = '${u}' and item_id = '${item}'`);
    const LIST = `'[{"id":"acc-1_s1","account_id":"acc-1","name":"Index Fund","value":1234.5,"currency":"CAD"}]'::jsonb`;
    const keepSql = (u, item, list = LIST) => `insert into public.plus_holdings (user_id, item_id, holdings) values ('${u}', '${item}', ${list}) on conflict (user_id, item_id) do update set holdings = excluded.holdings, fetched_at = now()`;
    const kept = (u, item) => sql(`select count(*) from public.plus_holdings where user_id = '${u}' and item_id = '${item}'`);

    // ── 1. only our server ──
    t.eq(sql("select relrowsecurity from pg_class where oid = 'public.plus_holdings'::regclass"), "t", "1a RLS is on");
    const owner = person(); connect(owner, "item-own");
    for (const role of ["anon", "authenticated"]) {
      t.ok(!!refusal(`set role ${role}; select * from public.plus_holdings`), `1b ${role} cannot read it`);
      t.ok(!!refusal(`set role ${role}; ${keepSql(owner, "item-own")}`), `1c ${role} cannot write it`);
    }
    t.eq(refusal(`set role service_role; ${keepSql(owner, "item-own")}`), "", "1d the server can keep a list for a connected bank");

    // ── 2. kept, and kept again ──
    t.eq(kept(owner, "item-own"), "1", "2a a connected bank's list is kept");
    sql(keepSql(owner, "item-own", `'[]'::jsonb`));
    t.eq(sql(`select count(*) || '|' || jsonb_array_length(max(holdings::text)::jsonb) from public.plus_holdings where user_id = '${owner}'`), "1|0", "2b kept again replaces it (one row, the new list: this bank holds nothing now)");
    t.ok(!!refusal(keepSql(owner, "item-own", `'{"not":"a list"}'::jsonb`)), "2c something that is not a list is refused");
    sql(keepSql(owner, "item-own"));

    // ── 3. NEW-1: only for a bank that is connected ──
    disconnect(owner, "item-own");
    t.eq(kept(owner, "item-own"), "0", "3a disconnecting the bank removes its kept list");
    const late = refusal(keepSql(owner, "item-own"));
    t.ok(/not connected/.test(late), "3b a save that arrives AFTER the disconnect is refused (was: it put the list back, and it stayed for ever)");
    t.ok(/23503/.test(refusalCode(keepSql(owner, "item-own"))), "3c …with the foreign-key code, so the server can tell \"the bank is gone\" from a fault");
    t.eq(kept(owner, "item-own"), "0", "3d …and nothing is left behind");
    const other = person(); connect(other, "item-theirs");
    t.ok(/not connected/.test(refusal(keepSql(owner, "item-theirs"))), "3e a list is never kept in one person's name for a bank ANOTHER person linked");
    t.ok(/not connected/.test(refusal(keepSql(owner, "item-never"))), "3f …nor for a bank nobody linked");
    connect(owner, "item-own");
    t.eq([refusal(keepSql(owner, "item-own")), kept(owner, "item-own")], ["", "1"], "3g the same bank connected again is kept again");
    t.ok(/not connected/.test(refusal(`update public.plus_holdings set item_id = 'item-never' where user_id = '${owner}'`)), "3h a kept list cannot be moved to a bank that is not connected");

    // ── 4. at the same instant, from two connections ──
    // (a) The save is first and has not finished; the disconnect arrives. The disconnect waits, then takes the list.
    const a = person(); connect(a, "item-a");
    const saveFirst = sqlAsync(`begin; ${keepSql(a, "item-a")}; select pg_sleep(1.2); commit;`);
    await wait(350);
    const thenDisconnect = await sqlAsync(`delete from public.plaid_items where user_id = '${a}' and item_id = 'item-a'`);
    const s1 = await saveFirst;
    t.eq([s1.err, thenDisconnect.err], ["", ""], "4a the save is under way when the bank is disconnected: neither fails");
    t.ok(thenDisconnect.ms >= 600, `4b …the disconnect waited for the save to finish (${thenDisconnect.ms} ms)`);
    t.eq([kept(a, "item-a"), sql(`select count(*) from public.plaid_items where user_id = '${a}'`)], ["0", "0"], "4c …and then took the list with the bank: nothing is left");
    // (b) The disconnect is first and has not finished; the save arrives. The save waits, then is refused.
    const b = person(); connect(b, "item-b");
    const disconnectFirst = sqlAsync(`begin; delete from public.plaid_items where user_id = '${b}' and item_id = 'item-b'; select pg_sleep(1.2); commit;`);
    await wait(350);
    const thenSave = await sqlAsync(keepSql(b, "item-b"));
    const d1 = await disconnectFirst;
    t.eq(d1.err, "", "4d the disconnect is under way when the save arrives: the disconnect is not held up");
    t.ok(/not connected/.test(thenSave.err) && thenSave.ms >= 600, `4e …the save waited for it, then was refused (${thenSave.ms} ms)`);
    t.eq(kept(b, "item-b"), "0", "4f …and nothing is left");
    // (c) Twenty rounds of both at once, no waiting: whatever the order, the bank never ends with a list.
    let orphans = 0;
    for (let i = 0; i < 20; i++) {
      const u = person(); connect(u, `item-${i}`);
      await Promise.all([sqlAsync(keepSql(u, `item-${i}`)), sqlAsync(`delete from public.plaid_items where user_id = '${u}' and item_id = 'item-${i}'`)]);
      orphans += Number(kept(u, `item-${i}`));
    }
    t.eq(orphans, 0, "4g 20 rounds of \"keep the list\" and \"disconnect\" at the same moment: never a list without its bank");
    // A bank's ordinary updates (the webhook marking it, a sync moving its cursor) are not held up by a save in progress.
    const c = person(); connect(c, "item-c");
    const slowSave = sqlAsync(`begin; ${keepSql(c, "item-c")}; select pg_sleep(1.0); commit;`);
    await wait(300);
    const mark = await sqlAsync(`update public.plaid_items set status = 'error', updated_at = now() where user_id = '${c}' and item_id = 'item-c'`);
    await slowSave;
    t.ok(mark.err === "" && mark.ms < 600, `4h a status update of the bank's row does not wait for a save in progress (${mark.ms} ms)`);

    // ── 5. the account ──
    sql(`delete from auth.users where id = '${c}'`);
    t.eq([kept(c, "item-c"), sql(`select count(*) from public.plaid_items where user_id = '${c}'`)], ["0", "0"], "5a deleting the account deletes its banks and their kept lists");
  } catch (e) {
    t.ok(false, `the suite ran: ${String(e.stderr || e.message).split("\n").slice(0, 3).join(" | ")}`);
  } finally {
    if (started) { try { execFileSync(path.join(bin, "pg_ctl"), ["-D", path.join(dir, "data"), "-m", "immediate", "stop"], { env, stdio: "ignore" }); } catch {} }
  }
  t.summary("PLUS HOLDINGS STORE (sql)");
})();
