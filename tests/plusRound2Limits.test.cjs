// tests/plusRound2Limits.test.cjs
// -----------------------------------------------------------------------------
// ROUND 2 OF THE PLUS 1.1.8 REVIEW (2026-11-22, on 05fb6a7): THE BANK LIMIT AND THE NET WORTH ENTRY CAP.
//
// Round 1 added a second look after the write (H3, M3): count again, and take your own row back out if the count is
// past the limit. Two writers at the same moment, one below the limit, then BOTH see one too many and BOTH take
// themselves out: one fewer than the limit is left, and both people are refused.
//   N3  two (or three) new banks at once: exactly the limit stays, and only the real extra is refused
//   N4  two (or three) new net worth entries at once at 49: exactly 50 stay
// The rule now: everyone reads the rows in ONE fixed order (when each was made, then its id). A writer whose own row
// is beyond the limit in that order goes at once. A writer inside the limit waits a moment for the extra to go and
// looks again; if the count is still past the limit it goes too. So the count never ends past the limit whatever the
// timing, and in the ordinary case exactly the limit stays.
//
// The writers here really do run at the same moment against one stand-in database: a write is held until all of
// them have reached it, so every one of them has written before any of them counts again.
// -----------------------------------------------------------------------------
"use strict";
const fs = require("fs");
const path = require("path");
const { create } = require("./_runner.cjs");

const AUTH_PATH = require.resolve("../netlify/functions/_lib/auth.js");
const PLUS_PATH = require.resolve("../netlify/functions/_lib/plusAddon.js");
const LIM_PATH = require.resolve("../netlify/functions/_lib/bankLimits.js");
const NW_PATH = require.resolve("../netlify/functions/networth.js");
const PLAID_PATH = require.resolve("../netlify/functions/plaid.js");
const REPO = path.join(__dirname, "..");
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const future = new Date(Date.now() + 20 * 86400000).toISOString();
const PK = { plaid_items: ["user_id", "item_id"], net_worth_entries: ["id"] };
let uuidN = 0;
const newId = () => `00000000-0000-4000-8000-${String(++uuidN).padStart(12, "0")}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// A stand-in service-role client that does what the database does for these two tables: a new plaid_items row gets
// an id and a created_at from the database's own clock (later for each new row); filters are real; a write lands when
// it is awaited. state.hold = { table, n }: the next n writes to that table wait for each other, then land together in
// the order they arrived (so n requests have all written before any of them reads again).
function makeDb({ items = {}, partner = false, plus = null, entries = {} } = {}) {
  let clock = Date.parse("2026-11-01T12:00:00.000Z");
  const tick = () => new Date((clock += 1000)).toISOString();
  const state = { rows: { plaid_items: [], household_members: [], plus_addon_subscriptions: [], complimentary_access: [], net_worth_entries: [], net_worth_shares: [], plaid_account_owners: [] },
    writes: [], hold: null, waiting: [], tick, afterWrite: null, disconnectFails: 0 };
  for (const [user, n] of Object.entries(items)) for (let i = 0; i < n; i++) state.rows.plaid_items.push({ id: newId(), user_id: user, item_id: `${user.slice(0, 1)}-item-${i}`, status: "active", access_token: `access-${user.slice(0, 1)}-${i}`, institution_id: `ins_${user.slice(0, 1)}_${i}`, institution_name: `Bank ${user.slice(0, 1)}${i}`, created_at: tick() });
  for (const [user, n] of Object.entries(entries)) for (let i = 0; i < n; i++) state.rows.net_worth_entries.push({ id: newId(), user_id: user, kind: "home", label: `e${i}`, value_cents: 100, currency: "CAD", shared: false, entered_at: tick() });
  if (partner) state.rows.household_members.push({ user_id: A, household_id: "h1", role: "owner" }, { user_id: B, household_id: "h1", role: "partner" });
  if (plus) state.rows.plus_addon_subscriptions.push({ user_id: plus, provider: "stripe", plan_key: "plus_monthly", status: "active", product_id: "price_pm", current_period_end: future });
  // Held writes: resolve together once `n` have arrived.
  const gate = (table) => {
    const h = state.hold;
    if (!h || h.table !== table || h.n <= 0) return Promise.resolve();
    return new Promise((res) => {
      state.waiting.push(res);
      if (state.waiting.length >= h.n) { const all = state.waiting.splice(0); state.hold = null; all.forEach((r) => r()); }
    });
  };
  const from = (table) => {
    const rows = () => (state.rows[table] = state.rows[table] || []);
    const pkOf = (row, keys) => (r) => keys.every((k) => r[k] === row[k]);
    const filtered = (f) => rows().filter((r) => f.every((fn) => fn(r)));
    const q = {
      f: [],
      select() { return q; }, eq(c, v) { q.f.push((r) => r[c] === v); return q; }, in(c, vs) { q.f.push((r) => vs.includes(r[c])); return q; }, not() { return q; },
      async maybeSingle() { return { data: filtered(q.f)[0] || null, error: null }; },
      async single() { const h = filtered(q.f)[0]; return h ? { data: h, error: null } : { data: null, error: { message: "none" } }; },
      then(res, rej) { const h = filtered(q.f).map((r) => ({ ...r })); return Promise.resolve({ data: h, error: null, count: h.length }).then(res, rej); },
      async upsert(row, opts) {
        await gate(table);
        state.writes.push([table, "upsert"]);
        const keys = opts && opts.onConflict ? opts.onConflict.split(",") : (PK[table] || ["user_id"]);
        const i = rows().findIndex(pkOf(row, keys));
        if (i >= 0) rows()[i] = { ...rows()[i], ...row };
        else rows().push({ ...(table === "plaid_items" ? { id: newId(), created_at: tick() } : {}), ...row });
        if (state.afterWrite) state.afterWrite(table, row);
        return { error: null };
      },
      insert(row) {
        const land = async () => {
          await gate(table);
          state.writes.push([table, "insert"]);
          const r = { ...row }; if (table === "net_worth_entries" && !r.id) r.id = newId();
          const dup = PK[table] && rows().some(pkOf(r, PK[table]));
          if (!dup) rows().push(r);
          if (!dup && state.afterWrite) state.afterWrite(table, r);
          return dup ? { data: null, error: { code: "23505", message: "duplicate key value violates unique constraint" } } : { data: [{ ...r }], error: null };
        };
        let done = null; const once = () => (done = done || land());
        return { select: () => once(), then: (res, rej) => once().then(res, rej) };
      },
      update(p) {
        const u = { f: [], eq(c, v) { u.f.push((r) => r[c] === v); return u; },
          _run() { state.writes.push([table, "update"]); const hit = filtered(u.f); hit.forEach((r) => Object.assign(r, p)); return { data: hit.map((r) => ({ id: r.id })), error: null }; },
          async select() { return u._run(); }, then(res, rej) { return Promise.resolve(u._run()).then(res, rej); } };
        return u;
      },
      delete() {
        const d = { f: [], eq(c, v) { d.f.push((r) => r[c] === v); return d; },
          then(res, rej) { state.writes.push([table, "delete"]); state.rows[table] = rows().filter((r) => !d.f.every((fn) => fn(r))); return Promise.resolve({ error: null }).then(res, rej); } };
        return d;
      },
    };
    return q;
  };
  const rpc = async (name, args) => {
    if (name === "household_disconnect_item") {
      if (state.disconnectFails > 0) { state.disconnectFails--; state.writes.push(["plaid_items", "disconnect failed"]); return { data: null, error: { code: "57014", message: "canceling statement due to statement timeout" } }; }
      const n = state.rows.plaid_items.length;
      state.rows.plaid_items = state.rows.plaid_items.filter((r) => !(r.user_id === args.p_user && r.item_id === args.p_item));
      state.writes.push(["plaid_items", "disconnect"]);
      return { data: { result: state.rows.plaid_items.length < n ? "removed" : "not_found" }, error: null };
    }
    return { data: null, error: null };
  };
  return { state, admin: { from, rpc, auth: { admin: {} } } };
}

// One loaded copy of the functions for one signed-in person. The waits between looks are shortened: the rule is the
// same, the test is not three seconds long.
const WAITS = [5, 10, 20];
function load(db, user, plan = { unlimited: true }) {
  for (const p of [AUTH_PATH, PLUS_PATH, LIM_PATH, NW_PATH, PLAID_PATH]) delete require.cache[p];
  const real = require(AUTH_PATH);
  require.cache[AUTH_PATH].exports = { ...real, getAdminClient: () => db.admin, getUserFromRequest: async () => ({ user_id: user, error: null }), getUserPlan: async () => ({ plan: plan.unlimited ? "plus" : "free", unlimited: !!plan.unlimited, status_unavailable: false }) };
  const lim = require(LIM_PATH), plaid = require(PLAID_PATH), nw = require(NW_PATH);
  const shorten = (arr) => { if (Array.isArray(arr)) { arr.length = 0; arr.push(...WAITS); } };
  shorten(lim.RECHECK_WAITS_MS); shorten(nw._test && nw._test.RECHECK_WAITS_MS);
  return { plaid, nw, lim };
}
const call = async (fn, body) => {
  const r = await fn.handler({ httpMethod: "POST", headers: { origin: "https://flourishmoney.app", authorization: "Bearer x" }, body: JSON.stringify({ client_version: "1.1.8", ...body }) });
  let b = null; try { b = JSON.parse(r.body); } catch { b = null; }
  return { status: r.statusCode, body: b };
};

(async () => {
  const t = create();
  const saved = { ...process.env };
  const errors = [];
  const quiet = { e: console.error, w: console.warn }; console.error = (...a) => { errors.push(a.map(String).join(" ")); }; console.warn = () => {};
  const realFetch = global.fetch;
  // The pretend Plaid: a public token "pt-x" becomes item "item-x" with token "access-x". removeDelayMs: how long
  // /item/remove takes.
  const P = { calls: [], removeDelayMs: 0, neverRemoves: false, byToken: {} };
  const ok = (j) => ({ ok: true, status: 200, json: async () => j });
  global.fetch = async (url, init) => {
    const u = String(url).replace(/^https:\/\/[^/]+/, ""); const body = init && init.body ? JSON.parse(init.body) : {};
    P.calls.push({ url: u, token: body.access_token || null });
    if (/item\/remove/.test(u)) {
      if (P.removeDelayMs) await sleep(P.removeDelayMs);
      if (P.neverRemoves) return { ok: false, status: 500, json: async () => ({ error_code: "INTERNAL_SERVER_ERROR", error_message: "plaid is down" }) };
      return ok({ removed: true });
    }
    if (/public_token\/exchange/.test(u)) { const x = String(body.public_token || "").replace(/^pt-/, ""); return ok({ access_token: `access-${x}`, item_id: `item-${x}` }); }
    if (/item\/get/.test(u)) return ok({ item: P.byToken[body.access_token] || { item_id: "item-legacy", institution_id: "ins_legacy" } });
    return ok({});
  };
  const removes = () => P.calls.filter((c) => /item\/remove/.test(c.url)).map((c) => c.token);
  const reset = () => { P.calls.length = 0; P.removeDelayMs = 0; P.neverRemoves = false; errors.length = 0; };
  for (const k of Object.keys(process.env)) if (/^PLUS_ENABLED$|^PLUS_TESTER_USER_IDS$|^HOUSEHOLD_ENABLED$|^ENFORCE_PLAN_LIMITS$|^STRIPE_PRICE_/.test(k)) delete process.env[k];
  Object.assign(process.env, { PLAID_CLIENT_ID: "test-client", PLAID_SECRET: "test-secret", PLAID_ENV: "sandbox", HOUSEHOLD_ENABLED: "true", PLUS_ENABLED: "true",
    STRIPE_PRICE_MONTHLY_CAD: "price_m", STRIPE_PRICE_ANNUAL_CAD: "price_a", STRIPE_PRICE_FOUNDING_ANNUAL_CAD: "price_f", STRIPE_PRICE_PLUS_MONTHLY_CAD: "price_pm", STRIPE_PRICE_PLUS_ANNUAL_CAD: "price_pa" });
  const src = (...p) => fs.readFileSync(path.join(REPO, ...p), "utf8");
  const banks = (db, user) => db.state.rows.plaid_items.filter((r) => !user || r.user_id === user).map((r) => r.item_id);
  const newBank = (x) => ({ action: "exchange_token", public_token: `pt-${x}`, institution_name: `New Bank ${x}`, institution_id: `ins_new_${x}` });
  const statuses = (rs) => rs.map((r) => r.status).sort();
  // n requests at the same moment: every one has written before any of them counts again.
  const together = (db, table, jobs) => { db.state.hold = { table, n: jobs.length }; return Promise.all(jobs.map((j) => j())); };

  try {
    // ── N3. TWO NEW BANKS AT THE SAME MOMENT, ONE BELOW THE LIMIT ───────────────────────────────────────────────
    {
      // With Plus, a household at 9 of 10: each partner finishes connecting a bank at the same moment.
      reset();
      const hh = makeDb({ items: { [A]: 5, [B]: 4 }, partner: true, plus: A });
      const before = banks(hh);
      const rs = await together(hh, "plaid_items", [() => call(load(hh, A).plaid, newBank("a")), () => call(load(hh, B).plaid, newBank("b"))]);
      t.eq(banks(hh).length, 10, "N3a with Plus at 9 of 10, two new banks at the same moment: exactly 10 stay (was 9: each saw 11 and both took themselves out)");
      t.eq(statuses(rs), [200, 402], "N3b …one is saved and one is refused (was: both refused)");
      const refused = rs.find((r) => r.status === 402);
      t.eq(refused && refused.body, { error: "bank_limit", scope: "household", used: 10, limit: 10 }, "N3c the refusal is the one older apps already know (402 bank_limit, with the numbers)");
      t.ok(before.every((id) => banks(hh).includes(id)), "N3d none of the nine banks that were already connected is touched");
      const kept = banks(hh).filter((id) => !before.includes(id));
      t.eq([kept.length, removes().length, removes()[0] === `access-${kept[0] === "item-a" ? "b" : "a"}`], [1, 1, true], "N3e the one that stays is one of the two new banks, and only the OTHER one is removed at Plaid");

      // Three at once (two devices of one person, and the partner).
      reset();
      const three = makeDb({ items: { [A]: 5, [B]: 4 }, partner: true, plus: A });
      const r3 = await together(three, "plaid_items", [() => call(load(three, A).plaid, newBank("a1")), () => call(load(three, A).plaid, newBank("a2")), () => call(load(three, B).plaid, newBank("b1"))]);
      t.eq([banks(three).length, statuses(r3), removes().length], [10, [200, 402, 402], 2], "N3f three at once at 9 of 10: exactly 10 stay, one saved, two refused and removed at Plaid (was: all three refused, 9 left)");

      // The basic plan: 2 per person. One person on two devices, at 1 of 2.
      reset();
      const solo = makeDb({ items: { [A]: 1 } });
      const r2 = await together(solo, "plaid_items", [() => call(load(solo, A).plaid, newBank("x")), () => call(load(solo, A).plaid, newBank("y"))]);
      t.eq([banks(solo, A).length, statuses(r2), banks(solo, A).includes("a-item-0")], [2, [200, 402], true], "N3g the basic plan at 1 of 2, the same person on two devices: exactly 2 stay (was 1), and the bank they already had is one of them");

      // Room for both: nothing waits and nothing is removed.
      reset();
      const room = makeDb({ items: { [A]: 4, [B]: 4 }, partner: true, plus: A });
      const t0 = Date.now();
      const rr = await together(room, "plaid_items", [() => call(load(room, A).plaid, newBank("a")), () => call(load(room, B).plaid, newBank("b"))]);
      t.eq([banks(room).length, statuses(rr), removes().length], [10, [200, 200], 0], "N3h at 8 of 10 two at once both fit: both saved, nothing removed");

      // NEVER PAST THE LIMIT, WHATEVER THE ORDER SAYS. A bank that was written a moment after this one read (so its
      // request never saw this one, and has kept itself) can still carry an EARLIER or LATER time than this one. Here
      // it is later: by the order alone this request would be "inside the limit". It waits, sees that bank is not
      // going anywhere, and goes itself.
      reset();
      const late = makeDb({ items: { [A]: 5, [B]: 4 }, partner: true, plus: A });
      late.state.afterWrite = (table, row) => {
        if (table !== "plaid_items" || row.item_id !== "item-a") return;
        late.state.afterWrite = null;
        late.state.rows.plaid_items.push({ id: newId(), user_id: B, item_id: "b-item-settled", status: "active", access_token: "access-settled", institution_id: "ins_settled", institution_name: "Settled Bank", created_at: new Date(Date.parse(late.state.tick()) + 3600000).toISOString() });
      };
      const lone = await call(load(late, A).plaid, newBank("a"));
      t.eq([lone.status, banks(late).length, banks(late).includes("b-item-settled"), banks(late).includes("item-a"), removes()], [402, 10, true, false, ["access-a"]],
        "N3i a bank that has already settled but carries a LATER time: this request does not trust the order alone; it looks again, and when the count is still 11 it takes itself out (10 stay, never 11)");

      // The extra one is slow to go (Plaid takes longer than the waits): the one inside the limit gives up and goes
      // too. One fewer than the limit, never one more, and a retry connects.
      reset(); P.removeDelayMs = 250;
      const slow = makeDb({ items: { [A]: 5, [B]: 4 }, partner: true, plus: A });
      const rs2 = await together(slow, "plaid_items", [() => call(load(slow, A).plaid, newBank("a")), () => call(load(slow, B).plaid, newBank("b"))]);
      t.ok(banks(slow).length <= 10 && rs2.every((r) => r.status === 200 || r.status === 402), `N3j the extra one's removal outlasts the waits: still never more than 10 (${banks(slow).length} here), and every answer is a save or the known refusal`);

      // H3 (was "partly": the clean-up can fail). The extra one cannot be removed at Plaid at all: it keeps its row
      // (never live at Plaid with no row), so its request answers 200. The household is then one past the limit, and
      // the other new bank, which was inside the limit and waited, does not stay on top of it.
      reset(); P.neverRemoves = true;
      const stuck = makeDb({ items: { [A]: 5, [B]: 4 }, partner: true, plus: A });
      const rs3 = await together(stuck, "plaid_items", [() => call(load(stuck, A).plaid, newBank("a")), () => call(load(stuck, B).plaid, newBank("b"))]);
      t.ok(banks(stuck).length <= 11 && rs3.every((r) => r.status === 200) && errors.some((e) => /still live at Plaid, remove it by hand/.test(e)),
        `H3a Plaid will not remove either extra: each bank keeps its row (${banks(stuck).length} connected, none live at Plaid without a row), and an error line names each for a person`);
      // Plaid removed the extra, and then the table would not let its row go at the first try: it is tried again.
      // (Another device's bank landed first here, so this request's bank is the extra and goes at once.)
      const otherFirst = (db) => { db.state.afterWrite = (table, row) => { if (table !== "plaid_items" || row.item_id !== "item-x") return; db.state.afterWrite = null;
        db.state.rows.plaid_items.push({ id: newId(), user_id: A, item_id: "a-item-other", status: "active", access_token: "access-other", institution_id: "ins_other", institution_name: "Other Bank", created_at: "2026-11-01T12:00:00.500Z" }); }; };
      reset();
      const rowStuck = makeDb({ items: { [A]: 1 } });
      otherFirst(rowStuck); rowStuck.state.disconnectFails = 2;
      const r4 = await call(load(rowStuck, A).plaid, newBank("x"));
      t.eq([r4.status, banks(rowStuck, A).sort(), rowStuck.state.writes.filter((w) => w[1] === "disconnect failed").length, removes()], [402, ["a-item-0", "a-item-other"], 2, ["access-x"]],
        "H3b the extra is removed at Plaid and its row will not delete at once: the delete is tried again (the third try works), so no row is left for a bank that no longer exists at Plaid (was: one try, then the row stayed)");
      reset();
      const rowDead = makeDb({ items: { [A]: 1 } });
      otherFirst(rowDead); rowDead.state.disconnectFails = 99;
      const r5 = await call(load(rowDead, A).plaid, newBank("x"));
      t.eq([r5.status, rowDead.state.writes.filter((w) => w[1] === "disconnect failed").length, errors.filter((e) => /exchange_token limit recheck: row delete failed/.test(e)).length], [402, 3, 1],
        "H3c a row that will not delete in three tries: the refusal still stands, and one error line names the bank, as before");

      // migrate_items (banks moved over from an old copy of the app): the same rule, rows only.
      reset(); P.byToken["access-legacy-1"] = { item_id: "item-legacy-1", institution_id: "ins_l1" }; P.byToken["access-legacy-2"] = { item_id: "item-legacy-2", institution_id: "ins_l2" };
      const mig = makeDb({ items: { [A]: 1 } });
      const m = await together(mig, "plaid_items", [
        () => call(load(mig, A).plaid, { action: "migrate_items", tokens: [{ token: "access-legacy-1", institution_name: "Legacy 1" }] }),
        () => call(load(mig, A).plaid, { action: "migrate_items", tokens: [{ token: "access-legacy-2", institution_name: "Legacy 2" }] }),
      ]);
      const done = m.map((r) => [r.body.successes.length, r.body.failures.length]).sort();
      t.eq([banks(mig, A).length, done, removes().length], [2, [[0, 1], [1, 0]], 0], "N3k migrate_items, two devices at once at 1 of 2: exactly 2 stay (was 1), one saved and one refused, and nothing is removed at Plaid");

      // The rule itself.
      const L = load(makeDb({ items: { [A]: 3 } }), A).lim;
      const over = makeDb({ items: { [A]: 3 } });
      t.eq((await L.overAfterAdding(over.admin, A)).over, true, "N3l a caller that names no bank gets the plain answer, as before: past the limit");
      t.eq((await L.overAfterAdding(over.admin, A, { itemId: "a-item-2" })).over, true, "N3m the newest of three on the basic plan (limit 2) is the extra: it goes at once");
      let waited = 0;
      const first = await L.overAfterAdding(over.admin, A, { itemId: "a-item-0", sleep: async () => { waited++; }, waits: [1, 1] });
      t.eq([first.over, waited], [true, 2], "N3n the oldest is inside the limit, so it waits and looks again (twice here); nobody goes, so in the end it does");
      const leaves = makeDb({ items: { [A]: 3 } });
      const stays = await L.overAfterAdding(leaves.admin, A, { itemId: "a-item-0", waits: [1, 1], sleep: async () => { leaves.state.rows.plaid_items = leaves.state.rows.plaid_items.filter((r) => r.item_id !== "a-item-2"); } });
      t.eq(stays.over, false, "N3o …and when the extra one has gone by the next look, it stays");
      const gone = makeDb({ items: { [A]: 3 } });
      t.eq((await L.overAfterAdding(gone.admin, A, { itemId: "not-there" })).over, false, "N3p a bank that is no longer in the table has nothing to undo");
      const revoked = makeDb({ items: { [A]: 3 } }); revoked.state.rows.plaid_items[0].status = "revoked";
      t.eq((await L.overAfterAdding(revoked.admin, A, { itemId: "a-item-2" })).over, false, "N3q a bank its bank has revoked is not counted, here as everywhere");
      const plaid = src("netlify", "functions", "plaid.js");
      t.eq((plaid.match(/overAfterAdding\(admin, user_id, \{ itemId: item_id \}\)/g) || []).length, 2, "N3r both ways a new bank is written (exchange_token and migrate_items) name the bank they just wrote");
      void t0;
    }

    // ── N4. TWO NEW NET WORTH ENTRIES AT THE SAME MOMENT, AT 49 OF 50 ───────────────────────────────────────────
    {
      const entry = (label) => ({ action: "save_entry", kind: "car", label, value: 9000, currency: "CAD" });
      const count = (db) => db.state.rows.net_worth_entries.length;
      const two = makeDb({ plus: A, entries: { [A]: 49 } });
      const olds = two.state.rows.net_worth_entries.map((e) => e.id);
      const rs = await together(two, "net_worth_entries", [() => call(load(two, A).nw, entry("One")), () => call(load(two, A).nw, entry("Two"))]);
      t.eq(count(two), 50, "N4a at 49 entries, two saves at the same moment: exactly 50 stay (was 49: each saw 51 and both took themselves out)");
      t.eq(statuses(rs), [200, 409], "N4b …one is saved and one is refused (was: both refused)");
      const saved1 = rs.find((r) => r.status === 200), refused = rs.find((r) => r.status === 409);
      t.eq([refused && refused.body, !!(saved1 && two.state.rows.net_worth_entries.some((e) => e.id === saved1.body.id))], [{ error: "too_many_entries" }, true], "N4c the refusal is the one the app knows, and the saved one's id is really in the table");
      t.ok(olds.every((id) => two.state.rows.net_worth_entries.some((e) => e.id === id)), "N4d none of the 49 that were there is touched");

      const three = makeDb({ plus: A, entries: { [A]: 49 } });
      const r3 = await together(three, "net_worth_entries", [() => call(load(three, A).nw, entry("One")), () => call(load(three, A).nw, entry("Two")), () => call(load(three, A).nw, entry("Three"))]);
      t.eq([count(three), statuses(r3)], [50, [200, 409, 409]], "N4e three at once at 49: exactly 50 stay, one saved and two refused (was: all three refused, 49 left)");

      const room = makeDb({ plus: A, entries: { [A]: 48 } });
      const rr = await together(room, "net_worth_entries", [() => call(load(room, A).nw, entry("One")), () => call(load(room, A).nw, entry("Two"))]);
      t.eq([count(room), statuses(rr)], [50, [200, 200]], "N4f at 48 two at once both fit: both saved");

      // Never past 50 whatever the order says: an entry that has already settled but carries a later time.
      const late = makeDb({ plus: A, entries: { [A]: 49 } });
      late.state.afterWrite = (table, row) => {
        if (table !== "net_worth_entries" || row.label !== "Mine") return;
        late.state.afterWrite = null;
        late.state.rows.net_worth_entries.push({ id: newId(), user_id: A, kind: "home", label: "Settled", value_cents: 1, currency: "CAD", shared: false, entered_at: new Date(Date.now() + 3600000).toISOString() });
      };
      const lone = await call(load(late, A).nw, entry("Mine"));
      t.eq([lone.status, count(late), late.state.rows.net_worth_entries.some((e) => e.label === "Settled"), late.state.rows.net_worth_entries.some((e) => e.label === "Mine")], [409, 50, true, false],
        "N4g an entry that has already settled but carries a LATER time: this save looks again, and when there are still 51 it takes itself out (50 stay, never 51)");

      // Each person has their own 50: a partner's save at the same moment is nobody's extra.
      const pair = makeDb({ plus: A, partner: true, entries: { [A]: 49, [B]: 49 } });
      const rp = await together(pair, "net_worth_entries", [() => call(load(pair, A).nw, entry("A's")), () => call(load(pair, B).nw, entry("B's"))]);
      t.eq([count(pair), statuses(rp)], [100, [200, 200]], "N4h two partners each saving their fiftieth at the same moment: both saved (the cap is per person)");
    }
  } finally {
    global.fetch = realFetch; console.error = quiet.e; console.warn = quiet.w;
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  }
  t.summary("plusRound2Limits");
})().catch((e) => { console.error(e); process.exit(1); });
