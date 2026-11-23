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
    writes: [], hold: null, waiting: [], tick, afterWrite: null, disconnectFails: 0, deleteFails: {}, updateFails: {}, upsertFails: {} };
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
      select() { return q; }, eq(c, v) { q.f.push((r) => r[c] === v); return q; }, in(c, vs) { q.f.push((r) => vs.includes(r[c])); return q; }, not() { return q; }, order() { return q; },
      async maybeSingle() { return { data: filtered(q.f)[0] || null, error: null }; },
      async single() { const h = filtered(q.f)[0]; return h ? { data: h, error: null } : { data: null, error: { message: "none" } }; },
      then(res, rej) { const h = filtered(q.f).map((r) => ({ ...r })); return Promise.resolve({ data: h, error: null, count: h.length }).then(res, rej); },
      async upsert(row, opts) {
        await gate(table);
        if (state.upsertFails[table] > 0) { state.upsertFails[table]--; state.writes.push([table, "upsert failed"]); return { error: { code: "57014", message: "timeout" } }; }
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
          _run() {
            if (state.updateFails[table] > 0) { state.updateFails[table]--; state.writes.push([table, "update failed"]); return { data: null, error: { code: "57014", message: "timeout" } }; }
            state.writes.push([table, "update"]); const hit = filtered(u.f); hit.forEach((r) => Object.assign(r, p)); return { data: hit.map((r) => ({ id: r.id })), error: null }; },
          async select() { return u._run(); }, then(res, rej) { return Promise.resolve(u._run()).then(res, rej); } };
        return u;
      },
      delete() {
        const d = { f: [], eq(c, v) { d.f.push((r) => r[c] === v); return d; },
          then(res, rej) {
            if (state.deleteFails[table] > 0) { state.deleteFails[table]--; state.writes.push([table, "delete failed"]); return Promise.resolve({ error: { code: "57014", message: "timeout" } }).then(res, rej); }
            state.writes.push([table, "delete"]); state.rows[table] = rows().filter((r) => !d.f.every((fn) => fn(r))); return Promise.resolve({ error: null }).then(res, rej); } };
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
  const P = { calls: [], alerts: [], removeDelayMs: 0, neverRemoves: false, alreadyGone: false, removeFailsLeft: 0, onRemove: null, byToken: {} };
  const ok = (j) => ({ ok: true, status: 200, json: async () => j });
  global.fetch = async (url, init) => {
    const u = String(url).replace(/^https:\/\/[^/]+/, "");
    let body = {}; try { body = init && init.body ? JSON.parse(init.body) : {}; } catch { body = {}; }
    // Anything sent to a person outside the database (round 7): the error tracker and the support inbox.
    if (/sentry\.io|resend\.com/.test(String(url))) { P.alerts.push({ to: /sentry\.io/.test(String(url)) ? "sentry" : "email", url: String(url), raw: String((init && init.body) || ""), headers: (init && init.headers) || {} }); return ok({ id: "sent" }); }
    P.calls.push({ url: u, token: body.access_token || null });
    if (/item\/remove/.test(u)) {
      if (P.removeDelayMs) await sleep(P.removeDelayMs);
      if (P.onRemove) P.onRemove(body.access_token);
      if (P.removeFailsLeft > 0) { P.removeFailsLeft--; return { ok: false, status: 500, json: async () => ({ error_code: "INTERNAL_SERVER_ERROR", error_message: "plaid is down" }) }; }
      if (P.alreadyGone) return { ok: false, status: 400, json: async () => ({ error_code: "ITEM_NOT_FOUND", error_message: "The Item you requested cannot be found." }) };
      if (P.neverRemoves) return { ok: false, status: 500, json: async () => ({ error_code: "INTERNAL_SERVER_ERROR", error_message: "plaid is down" }) };
      return ok({ removed: true });
    }
    if (/public_token\/exchange/.test(u)) { const x = String(body.public_token || "").replace(/^pt-/, ""); return ok({ access_token: `access-${x}`, item_id: `item-${x}` }); }
    if (/item\/get/.test(u)) return ok({ item: P.byToken[body.access_token] || { item_id: "item-legacy", institution_id: "ins_legacy" } });
    return ok({});
  };
  const removes = () => P.calls.filter((c) => /item\/remove/.test(c.url)).map((c) => c.token);
  const reset = () => { P.calls.length = 0; P.alerts.length = 0; P.removeDelayMs = 0; P.neverRemoves = false; P.alreadyGone = false; P.removeFailsLeft = 0; P.onRemove = null; errors.length = 0; };
  for (const k of Object.keys(process.env)) if (/^PLUS_ENABLED$|^PLUS_TESTER_USER_IDS$|^HOUSEHOLD_ENABLED$|^ENFORCE_PLAN_LIMITS$|^STRIPE_PRICE_/.test(k)) delete process.env[k];
  Object.assign(process.env, { PLAID_CLIENT_ID: "test-client", PLAID_SECRET: "test-secret", PLAID_ENV: "sandbox", HOUSEHOLD_ENABLED: "true", PLUS_ENABLED: "true",
    STRIPE_PRICE_MONTHLY_CAD: "price_m", STRIPE_PRICE_ANNUAL_CAD: "price_a", STRIPE_PRICE_FOUNDING_ANNUAL_CAD: "price_f", STRIPE_PRICE_PLUS_MONTHLY_CAD: "price_pm", STRIPE_PRICE_PLUS_ANNUAL_CAD: "price_pa" });
  const src = (...p) => fs.readFileSync(path.join(REPO, ...p), "utf8");
  const banks = (db, user) => db.state.rows.plaid_items.filter((r) => !user || r.user_id === user).map((r) => r.item_id);
  // The banks that count toward a limit and show in the app: not one that was refused and is on its way out.
  const counted = (db, user) => db.state.rows.plaid_items.filter((r) => (!user || r.user_id === user) && !["revoked", "refused"].includes(r.status)).map((r) => r.item_id);
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
      // Changed 2026-11-22 (round 3, NEW-3; Amanda: "never remove an in-limit bank because another bank's cleanup is
      // slow. Return unresolved and reconcile later."). This used to expect 402 and the bank gone: the request could
      // not tell "the other is slow to go" from "the other is staying", and took its own in-limit bank out.
      t.eq([lone.status, banks(late).length, banks(late).includes("b-item-settled"), banks(late).includes("item-a"), removes()], [200, 11, true, true, []],
        "N3i a bank that has already settled but carries a LATER time: this request's bank is inside the limit by the order, so it is never removed; the household sits one over, unresolved");
      t.ok(errors.some((e) => /\[bank-limits\] unresolved/.test(e)), "N3i2 …and one line says so, for a person");
      const next = await call(load(late, A).plaid, newBank("z"));
      t.eq([next.status, next.body && next.body.error, banks(late).length], [402, "bank_limit", 11], "N3i3 …and while it is over, no further bank is accepted: it can only come back down");

      // The extra one is slow to go (Plaid takes longer than the waits): the one inside the limit gives up and goes
      // too. One fewer than the limit, never one more, and a retry connects.
      reset(); P.removeDelayMs = 250;
      const slow = makeDb({ items: { [A]: 5, [B]: 4 }, partner: true, plus: A });
      const rs2 = await together(slow, "plaid_items", [() => call(load(slow, A).plaid, newBank("a")), () => call(load(slow, B).plaid, newBank("b"))]);
      // Changed 2026-11-22 (round 3, NEW-3): it used to allow 9 here (the in-limit one gave up and went too).
      t.eq([banks(slow).length, counted(slow).length, statuses(rs2)], [10, 10, [200, 402]],
        "N3j the extra one's removal at Plaid is slow (longer than every wait): it steps out of the count at once, so the one inside the limit stays. Exactly 10, one saved and one refused (was: both could go, 9 left)");

      // H3 (was "partly": the clean-up can fail). The extra one cannot be removed at Plaid at all: it keeps its row
      // (never live at Plaid with no row), so its request answers 200. The household is then one past the limit, and
      // the other new bank, which was inside the limit and waited, does not stay on top of it.
      reset(); P.neverRemoves = true;
      const stuck = makeDb({ items: { [A]: 5, [B]: 4 }, partner: true, plus: A });
      const rs3 = await together(stuck, "plaid_items", [() => call(load(stuck, A).plaid, newBank("a")), () => call(load(stuck, B).plaid, newBank("b"))]);
      // Changed 2026-11-22 (round 3, M3: "a failed rollback must not return success"). This used to expect 200 for the
      // bank Plaid would not remove, connected and one over the limit.
      const left = stuck.state.rows.plaid_items.filter((r) => r.status === "refused");
      t.eq([statuses(rs3), counted(stuck).length, left.length, banks(stuck).length], [[200, 402], 10, 1, 11],
        "H3a Plaid will not remove the extra: it is still refused (402, never a success), it does not count and is not connected, and its row is kept as the record of what is still to be removed");
      t.ok(errors.some((e) => /still live at Plaid/.test(e)), "H3a2 …and an error line names it for a person");
      // …and it is finished later: the next time its owner's banks are listed, with Plaid answering again.
      P.neverRemoves = false; P.calls.length = 0;
      const owner = left[0] ? left[0].user_id : A;
      const listed = await call(load(stuck, owner).plaid, { action: "list_items" });
      t.ok(listed.status === 200 && Array.isArray(listed.body.items) && !listed.body.items.some((i) => i.item_id === (left[0] && left[0].item_id)) && !listed.body.items.some((i) => i.status === "refused"), "H3a3 a refused bank is never in the list the app is sent");
      t.eq([removes(), stuck.state.rows.plaid_items.some((r) => r.status === "refused"), banks(stuck).length], [[left[0] && left[0].access_token], false, 10],
        "H3a4 listing the banks finishes the job: the bank is removed at Plaid and its row goes (was: a line in a log, for a person to act on by hand)");
      const other = await call(load(stuck, owner === A ? B : A).plaid, { action: "list_items" });
      t.eq(((other.body && other.body.items) || []).length, 10, "H3a5 the partner's list never held it either");
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
      // Changed 2026-11-23 (round 5, R5-1, Amanda: GRANDFATHER). This expected one saved and one refused. A legacy bank is
      // one the person already had: it is imported, never refused, even past the limit, and nothing is removed at Plaid.
      t.eq([banks(mig, A).length, done, removes()], [3, [[1, 0], [1, 0]], []], "N3k migrate_items, two devices at once at 1 of 2: both legacy banks are imported (3 connected, one past the limit), and nothing is removed at Plaid");

      // The rule itself.
      const L = load(makeDb({ items: { [A]: 3 } }), A).lim;
      const over = makeDb({ items: { [A]: 3 } });
      t.eq((await L.overAfterAdding(over.admin, A)).over, true, "N3l a caller that names no bank gets the plain answer, as before: past the limit");
      t.eq((await L.overAfterAdding(over.admin, A, { itemId: "a-item-2" })).over, true, "N3m the newest of three on the basic plan (limit 2) is the extra: it goes at once");
      let waited = 0;
      const first = await L.overAfterAdding(over.admin, A, { itemId: "a-item-0", sleep: async () => { waited++; }, waits: [1, 1] });
      // Changed 2026-11-22 (round 3, NEW-3): it used to end "over" (the in-limit bank went too).
      t.eq([first.over, first.unresolved, waited], [false, true, 2], "N3n the oldest is inside the limit, so it waits and looks again (twice here); nobody goes, and it is still never removed: unresolved");
      const leaves = makeDb({ items: { [A]: 3 } });
      const stays = await L.overAfterAdding(leaves.admin, A, { itemId: "a-item-0", waits: [1, 1], sleep: async () => { leaves.state.rows.plaid_items = leaves.state.rows.plaid_items.filter((r) => r.item_id !== "a-item-2"); } });
      t.eq(stays.over, false, "N3o …and when the extra one has gone by the next look, it stays");
      const gone = makeDb({ items: { [A]: 3 } });
      t.eq((await L.overAfterAdding(gone.admin, A, { itemId: "not-there" })).over, false, "N3p a bank that is no longer in the table has nothing to undo");
      const revoked = makeDb({ items: { [A]: 3 } }); revoked.state.rows.plaid_items[0].status = "revoked";
      t.eq((await L.overAfterAdding(revoked.admin, A, { itemId: "a-item-2" })).over, false, "N3q a bank its bank has revoked is not counted, here as everywhere");
      const plaid = src("netlify", "functions", "plaid.js");
      // Changed 2026-11-23 (round 5, R5-1): this counted two (exchange_token and migrate_items). The import of banks the
      // person already had asks no limit any more.
      t.eq((plaid.match(/overAfterAdding\(admin, user_id, \{ itemId: item_id \}\)/g) || []).length, 1, "N3r the one way a NEW bank is written (exchange_token) names the bank it just wrote");
      void t0;
    }

    // ── ROUND 3 (2026-11-22): NEW-3, Grok's low, and M3 for banks ───────────────────────────────────────────────────
    {
      reset();
      const { lim: L } = load(makeDb(), A);
      const at = (n) => new Date(Date.parse("2026-11-01T12:00:00.000Z") + n * 1000).toISOString();
      const row = (user, item, n, status = "active") => ({ id: newId(), user_id: user, item_id: item, status, access_token: `access-${item}`, institution_id: `ins_${item}`, institution_name: item, created_at: at(n) });
      const hhWith = (extra) => { const d = makeDb({ partner: true, plus: A }); for (let i = 0; i < 9; i++) d.state.rows.plaid_items.push(row(i % 2 ? A : B, `old-${i}`, i)); d.state.rows.plaid_items.push(...extra); return d; };
      const noWait = { waits: [1, 1, 1], settleMs: 1 };
      // this request's bank is inside the limit, the other never goes
      const d1 = hhWith([row(A, "mine", 20), row(B, "theirs-later", 30)]);
      const r1 = await L.overAfterAdding(d1.admin, A, { itemId: "mine", ...noWait });
      t.eq([r1.over, r1.unresolved, r1.unavailable], [false, true, false], "NEW3-a a bank inside the limit is never \"over\", however long the other one stays: the answer is unresolved (was: over, and it was removed)");
      const r2 = await L.overAfterAdding(d1.admin, B, { itemId: "theirs-later", ...noWait });
      t.eq([r2.over, !!r2.unresolved], [true, false], "NEW3-b the bank beyond the limit in the fixed order is the extra, at once");
      // the extra has stepped out of the count (refused, its removal at Plaid still running): resolved, nothing to wait for
      const d3 = hhWith([row(A, "mine", 20), row(B, "extra", 30, "refused")]);
      const r3 = await L.overAfterAdding(d3.admin, A, { itemId: "mine", ...noWait });
      t.eq([r3.over, !!r3.unresolved], [false, false], "NEW3-c an extra that was refused does not count while it is being removed: the bank inside the limit is simply kept");
      t.ok(L.NOT_COUNTED.includes("refused") && L.NOT_COUNTED.includes("revoked"), "NEW3-d a refused bank counts toward no limit");
      // exactly at the limit: looked at once more after a short pause, so a bank that was landing is seen
      const d4 = hhWith([row(A, "mine-later", 30)]);
      let pauses = 0;
      const r4 = await L.overAfterAdding(d4.admin, A, { itemId: "mine-later", waits: [1, 1, 1], settleMs: 1, sleep: async () => { if (pauses++ === 0) d4.state.rows.plaid_items.push(row(B, "landed-earlier", 20)); } });
      t.eq([r4.over, pauses >= 1], [true, true], "NEW3-e a count exactly at the limit is confirmed after a short pause: a bank that was landing at that moment is seen, and the real extra goes (so \"unresolved\" needs both requests to miss each other twice)");
      const d5 = hhWith([row(A, "mine", 20)]);
      const r5 = await L.overAfterAdding(d5.admin, A, { itemId: "mine", ...noWait });
      t.eq([r5.over, !!r5.unresolved], [false, false], "NEW3-f exactly at the limit and nothing else lands: kept, resolved");
      const r6 = await L.overAfterAdding(hhWith([]).admin, A, { itemId: "anything", ...noWait });
      t.eq([r6.over, !!r6.unresolved], [false, false], "NEW3-g below the limit: no pause, no second look needed");
      // Grok's low: the second look cannot be read
      const d7 = hhWith([row(A, "mine", 20), row(B, "theirs", 30)]);
      let reads = 0; const realFrom = d7.admin.from;
      d7.admin.from = (table) => { const q = realFrom(table); if (table === "plaid_items") { const then = q.then; q.then = (res, rej) => (++reads > 2 ? Promise.resolve({ data: null, error: { code: "57014", message: "timeout" } }).then(res, rej) : then.call(q, res, rej)); } return q; };
      const r7 = await L.overAfterAdding(d7.admin, B, { itemId: "theirs", ...noWait });
      t.eq([r7.over, r7.unavailable, r7.unresolved], [false, true, true], "GROK-a a second look that cannot be read undoes nothing, and now says unresolved (it used to look like a clean \"not over\")");
      t.ok(errors.some((e) => /\[bank-limits\] unresolved/.test(e)), "GROK-b …with a line for a person");
      // M3 for migrate_items: the extra's row will not delete
      reset();
      // Changed 2026-11-23 (round 5, R5-1): M3-a held that a legacy bank refused at the limit was not reported as saved
      // when its row would not delete. There is no refusal of a legacy bank any more, so there is no rollback to fail.
      P.byToken["access-legacy-8"] = { item_id: "item-legacy-8", institution_id: "ins_l8" }; P.byToken["access-legacy-9"] = { item_id: "item-legacy-9", institution_id: "ins_l9" };
      const mig3 = makeDb({ items: { [A]: 1 } }); mig3.state.disconnectFails = 9;
      const m3 = await together(mig3, "plaid_items", [
        () => call(load(mig3, A).plaid, { action: "migrate_items", tokens: [{ token: "access-legacy-8", institution_name: "Legacy 8" }] }),
        () => call(load(mig3, A).plaid, { action: "migrate_items", tokens: [{ token: "access-legacy-9", institution_name: "Legacy 9" }] }),
      ]);
      const done3 = m3.map((r) => [r.body.successes.length, r.body.failures.length]).sort();
      t.eq([done3, counted(mig3, A).length, mig3.state.rows.plaid_items.filter((r) => r.status === "refused").length, mig3.state.writes.filter((w) => w[1] === "disconnect failed").length], [[[1, 0], [1, 0]], 3, 0, 0],
        "M3-a migrate_items, two devices at once at 1 of 2: both are saved and say so, nothing is marked refused, and no row delete is even tried");
      const src3 = src("netlify", "functions", "plaid.js");
      t.ok(!/if \(after\.over && await removeRefusedItem\(/.test(src3), "M3-b exchange_token no longer makes the refusal depend on Plaid's removal working");
    }

    // ── ROUND 4 (2026-11-23): R4-1 and R4-2 ─────────────────────────────────────────────────────────────────────────
    {
      const twoLegacy = async (db, a = "access-legacy-21", b = "access-legacy-22") => {
        P.byToken[a] = { item_id: `item-${a}`, institution_id: `ins_${a}` }; P.byToken[b] = { item_id: `item-${b}`, institution_id: `ins_${b}` };
        const rs = await together(db, "plaid_items", [
          () => call(load(db, A).plaid, { action: "migrate_items", tokens: [{ token: a, institution_name: "Legacy one" }] }),
          () => call(load(db, A).plaid, { action: "migrate_items", tokens: [{ token: b, institution_name: "Legacy two" }] }),
        ]);
        return rs.map((r) => [r.body.successes.length, r.body.failures.length, (r.body.failures[0] || {}).error]).sort();
      };
      // R4-1a to d and f were about a legacy bank REFUSED at the limit (removed at Plaid first, row kept if Plaid would
      // not). Replaced 2026-11-23 by round 5, R5-1 (Amanda: GRANDFATHER): a legacy bank is never refused, so there is
      // nothing of its to remove. R4-1e (a NEW bank, exchange_token) stands.
      // R5-1: at the limit, the legacy bank is imported
      reset();
      const g1 = makeDb({ items: { [A]: 2 } });                                  // the basic plan: 2 of 2 already
      P.byToken["access-legacy-31"] = { item_id: "item-legacy-31", institution_id: "ins_l31" };
      const i1 = await call(load(g1, A).plaid, { action: "migrate_items", tokens: [{ token: "access-legacy-31", institution_name: "Legacy bank" }] });
      const row31 = g1.state.rows.plaid_items.find((r) => r.item_id === "item-legacy-31") || {};
      t.eq([i1.status, i1.body.successes, i1.body.failures, banks(g1, A).length, row31.status, row31.access_token, removes()], [200, [{ item_id: "item-legacy-31", index: 0 }], [], 3, "active", "access-legacy-31", []],
        "(P7-01 index from main, 2026-11-23) R5-1a a legacy bank the person already had, with their plan's 2 of 2 used: it is IMPORTED (was refused, with no row and still live at Plaid). Its row is there with its token, and Plaid is not asked to remove anything");
      const st1 = await call(load(g1, A).plaid, { action: "bank_limit_status" });
      t.eq([st1.body.used, st1.body.limit, st1.body.allowed, st1.body.over, st1.body.connected], [3, 2, false, true, 3], "R5-1b it counts toward the limit: 3 of 2, over, and no room for another");
      const new1 = await call(load(g1, A).plaid, newBank("after"));
      const link1 = await call(load(g1, A).plaid, { action: "create_link_token", country: "CA" });
      t.eq([new1.status, new1.body && new1.body.error, link1.status, banks(g1, A).length], [402, "bank_limit", 402, 3], "R5-1c so no NEW bank is accepted until they are back under: the link is not opened and a new bank is refused; nothing connected is touched");
      // with Plus, at the household's 10
      reset();
      const g2 = makeDb({ items: { [A]: 5, [B]: 5 }, partner: true, plus: A });
      P.byToken["access-legacy-32"] = { item_id: "item-legacy-32", institution_id: "ins_l32" };
      const i2 = await call(load(g2, B).plaid, { action: "migrate_items", tokens: [{ token: "access-legacy-32", institution_name: "Legacy bank" }] });
      const new2 = await call(load(g2, A).plaid, newBank("plusafter"));
      t.eq([i2.body.successes.length, i2.body.failures.length, banks(g2).length, new2.status, removes()], [1, 0, 11, 402, ["access-plusafter"]], "R5-1d with Plus at the household's 10 of 10: the legacy bank is imported (11), and then a new bank is refused for either member (the NEW one is what is removed at Plaid, never the legacy one)");
      // two devices at once, already at the limit: both imported
      reset();
      const g3 = makeDb({ items: { [A]: 2 } });
      const d3 = await twoLegacy(g3, "access-legacy-33", "access-legacy-34");
      t.eq([d3.map((x) => x.slice(0, 2)), banks(g3, A).length, g3.state.rows.plaid_items.some((r) => r.status === "refused"), removes()], [[[1, 0], [1, 0]], 4, false, []],
        "R5-1e two devices importing at the same moment, already at the limit: both imported, nothing marked refused, nothing removed at Plaid");
      // the limit cannot be read: still imported (an existing bank does not wait on a plan read)
      reset();
      const g4 = makeDb({ items: { [A]: 2 } }); g4.state.rows.plus_addon_subscriptions = null;
      const realFrom4 = g4.admin.from;
      g4.admin.from = (table) => (table === "plus_addon_subscriptions" || table === "household_members" ? { select() { return this; }, eq() { return this; }, in() { return this; }, not() { return this; }, async maybeSingle() { return { data: null, error: { code: "57014", message: "timeout" } }; }, then(res, rej) { return Promise.resolve({ data: null, error: { code: "57014", message: "timeout" } }).then(res, rej); } } : realFrom4(table));
      P.byToken["access-legacy-35"] = { item_id: "item-legacy-35", institution_id: "ins_l35" };
      const i4 = await call(load(g4, A).plaid, { action: "migrate_items", tokens: [{ token: "access-legacy-35", institution_name: "Legacy bank" }] });
      t.eq([i4.status, (i4.body.successes || []).length, banks(g4, A).length], [200, 1, 3], "R5-1f the plan or the limit cannot be read: the legacy bank is still imported (was: the whole import answered unavailable, and nothing was saved)");
      // the same bank sent again is one bank
      reset();
      const i5 = await call(load(g1, A).plaid, { action: "migrate_items", tokens: [{ token: "access-legacy-31", institution_name: "Legacy bank" }] });
      t.eq([i5.body.successes.length, banks(g1, A).length], [1, 3], "R5-1g the same legacy bank sent again is still one bank");
      // NO PATH LEAVES AN ITEM LIVE AT PLAID WITH NO ROW: every bank Plaid knows either has a row or its answer is a failure
      reset();
      const g6 = makeDb({ items: { [A]: 2 } });
      P.byToken["access-legacy-36"] = { item_id: "item-legacy-36", institution_id: "ins_l36" }; P.byToken["access-legacy-37"] = { item_id: "item-legacy-37", institution_id: "ins_l37" };
      const i6 = await call(load(g6, A).plaid, { action: "migrate_items", tokens: [{ token: "access-legacy-36" }, { token: "access-legacy-37" }, { token: "" }] });
      const rows6 = g6.state.rows.plaid_items.map((r) => r.access_token);
      t.eq([i6.body.successes.map((x) => x.item_id), i6.body.failures.map((f) => f.error), ["access-legacy-36", "access-legacy-37"].every((tok) => rows6.includes(tok))], [["item-legacy-36", "item-legacy-37"], ["missing token"], true],
        "R5-1h several at once, past the limit: every bank Plaid knows has its row; the only failure is the entry that named no bank at all");
      const srcM = src("netlify", "functions", "plaid.js");
      const mBlock = srcM.slice(srcM.indexOf('if (action === "migrate_items")'), srcM.indexOf('if (action === "delete_account")'));
      t.ok(mBlock.length > 500 && !/bankLimitFor\(|overAfterAdding\(|markRefused\(|removeRefusedItem\(|removeRefusedRow\(|limitBody\(|\/item\/remove|plan_limit/.test(mBlock.replace(/\/\/[^\n]*/g, "")), "R5-1i migrate_items asks no bank limit, refuses nothing for it, and removes nothing at Plaid");

      reset(); P.alreadyGone = true;
      const x3 = makeDb({ items: { [A]: 5, [B]: 4 }, partner: true, plus: A });
      const rx = await together(x3, "plaid_items", [() => call(load(x3, A).plaid, newBank("ga")), () => call(load(x3, B).plaid, newBank("gb"))]);
      t.eq([statuses(rx), banks(x3).length, x3.state.rows.plaid_items.some((r) => r.status === "refused")], [[200, 402], 10, false], "R4-1e the same for a bank just linked (exchange_token): \"already gone at Plaid\" lets its row go");
      // R4-2: the mark cannot be written
      reset();
      const k1 = makeDb({ items: { [A]: 5, [B]: 4 }, partner: true, plus: A });
      k1.state.afterWrite = (table, row) => { if (table === "plaid_items" && /^item-k/.test(row.item_id || "")) k1.state.updateFails.plaid_items = 9; };
      const rk = await together(k1, "plaid_items", [() => call(load(k1, A).plaid, newBank("ka")), () => call(load(k1, B).plaid, newBank("kb"))]);
      const extra = rk.find((r) => r.status !== 200);
      t.eq([statuses(rk), extra && extra.body && extra.body.error, removes().length, banks(k1).length, k1.state.rows.plaid_items.every((r) => r.status === "active")], [[200, 503], "status_unavailable", 0, 11, true],
        "R4-2a the extra bank cannot be marked refused (three tries): it is NOT treated as refused. The answer is unavailable (was 402), nothing is removed at Plaid, and the bank stays an ordinary connected row");
      t.ok(errors.some((e) => /could not mark the refused bank/.test(e) && /item-k[ab]/.test(e)), "R4-2b …and one error line names it, so it can be found");
      k1.state.updateFails.plaid_items = 0;
      const lk = await call(load(k1, A).plaid, { action: "list_items" });
      t.eq(lk.body.items.length, 11, "R4-2c it is in the list the app is sent (it is connected), so the person can see it and disconnect it");
      const more = await call(load(k1, A).plaid, newBank("kz"));
      t.eq([more.status, more.body && more.body.error], [402, "bank_limit"], "R4-2d and while the household is over its limit no further bank is accepted");
      // R4-2e (migrate_items with a mark that cannot be written) was replaced 2026-11-23 by R5-1: nothing is marked there
      // any more. A database that refuses updates does not stop a legacy bank being imported.
      reset();
      const k2 = makeDb({ items: { [A]: 1 } });
      k2.state.updateFails.plaid_items = 9;
      const dk = await twoLegacy(k2, "access-legacy-27", "access-legacy-28");
      t.eq([dk.map((x) => x.slice(0, 2)), removes().length, banks(k2, A).length], [[[1, 0], [1, 0]], 0, 3], "R4-2e migrate_items: both legacy banks imported, nothing removed at Plaid, nothing marked");
    }

    // ── ROUND 6 (2026-11-23), R6-1: A REFUSED BANK ALWAYS HAS A ROW UNTIL PLAID HAS REMOVED IT ──────────────────────
    // exchange_token refuses a NEW bank at the limit before anything is written. The Item Plaid had just made was
    // removed in three tries and the result ignored: if all three failed, the Item stayed live at Plaid with no row,
    // so nothing could ever find it. Now a refused row (its token; never counted, never listed, never read) is
    // written BEFORE the removal, deleted only once Plaid has removed the Item, and otherwise finished later.
    {
      const refused = (db) => db.state.rows.plaid_items.filter((r) => r.status === "refused");
      const full = () => makeDb({ items: { [A]: 2 } });                         // the basic plan: 2 of 2
      // Plaid's removal blocked three times at the limit
      reset(); P.removeFailsLeft = 3;
      const d1 = full(); const seen = [];
      P.onRemove = (token) => seen.push(`${token}:${refused(d1).some((r) => r.access_token === token) ? "row there" : "NO ROW"}`);
      const r1 = await call(load(d1, A).plaid, newBank("r6"));
      const row1 = refused(d1)[0] || {};
      t.eq([r1.status, r1.body && r1.body.error, row1.item_id, row1.access_token, row1.user_id === A], [402, "bank_limit", "item-r6", "access-r6", true],
        "R6-1a a new bank refused at the limit, and Plaid will not remove its Item (three tries): the answer is the refusal, and a refused row holds the Item's id and token (was: no row at all, the Item live at Plaid with nothing to find it by)");
      t.eq([seen.length, [...new Set(seen)]], [3, ["access-r6:row there"]], "R6-1b the row is written BEFORE Plaid is asked: it is there at each of the three tries");
      const st1 = await call(load(d1, A).plaid, { action: "bank_limit_status" });
      const li1pre = d1.state.rows.plaid_items.length;
      t.eq([st1.body.used, st1.body.connected, li1pre], [2, 2, 3], "R6-1c it is never counted: 2 of 2, as before the try");
      const acc1 = await call(load(d1, A).plaid, { action: "get_accounts", item_id: "item-r6" });
      t.eq([acc1.status, P.calls.filter((c) => /accounts\/get/.test(c.url)).length], [400, 0], "R6-1d it is never read: asked for by its id it is \"not found\", and Plaid is not asked for its accounts");
      // then the banks are listed
      P.calls.length = 0; P.onRemove = null;
      const li1 = await call(load(d1, A).plaid, { action: "list_items" });
      t.eq([li1.status, li1.body.items.map((i) => i.item_id).sort(), removes(), refused(d1).length, d1.state.rows.plaid_items.length], [200, ["a-item-0", "a-item-1"], ["access-r6"], 0, 2],
        "R6-1e then the banks are listed: it was never in the list, the Item is removed at Plaid with its token, and the row is gone");
      // Plaid removes it at once: nothing is left
      reset();
      const d2 = full();
      const r2 = await call(load(d2, A).plaid, newBank("r6b"));
      t.eq([r2.status, removes(), d2.state.rows.plaid_items.length, d2.state.writes.filter((w) => w[0] === "plaid_items").map((w) => w[1])], [402, ["access-r6b"], 2, ["upsert", "disconnect"]],
        "R6-1f Plaid removes it at the first try: the row is written, the Item removed, the row deleted. Nothing is left");
      // the limit could not be read (the other reason this refusal happens)
      reset(); P.removeFailsLeft = 3;
      const d3 = makeDb({ items: { [A]: 1 } });
      const realFrom3 = d3.admin.from;
      d3.admin.from = (table) => (table === "plus_addon_subscriptions" ? { select() { return this; }, eq() { return this; }, in() { return this; }, not() { return this; }, async maybeSingle() { return { data: null, error: { code: "57014", message: "timeout" } }; }, then(res, rej) { return Promise.resolve({ data: null, error: { code: "57014", message: "timeout" } }).then(res, rej); } } : realFrom3(table));
      const r3 = await call(load(d3, A).plaid, newBank("r6c"));
      t.eq([r3.status, r3.body && r3.body.error, refused(d3).map((r) => r.access_token)], [503, "status_unavailable", ["access-r6c"]], "R6-1g the limit could not be read, and Plaid will not remove the Item: \"unavailable\", and the same refused row is kept");
      // the refused row itself cannot be written
      reset();
      const d4 = full(); d4.state.upsertFails.plaid_items = 9;
      const r4 = await call(load(d4, A).plaid, newBank("r6d"));
      t.eq([r4.status, removes(), d4.state.rows.plaid_items.length], [402, ["access-r6d"], 2], "R6-1h the row cannot be written but Plaid answers: the Item is still removed there, and the refusal stands");
      reset(); P.removeFailsLeft = 9;
      const d5 = full(); d5.state.upsertFails.plaid_items = 9;
      const r5 = await call(load(d5, A).plaid, newBank("r6e"));
      // Changed 2026-11-23 (round 7, R7-1): this expected the ordinary 402. With no row and the Item still live at Plaid it
      // is now the explicit "unavailable" (the R7 section below holds the alert that goes with it).
      t.ok(r5.status === 503 && r5.body.error === "status_unavailable" && errors.some((e) => /item-r6e/.test(e) && /still live at Plaid/.test(e)), "R6-1i neither can be done (the database and Plaid both down): the answer is \"unavailable\", not the ordinary refusal, and one error line names the Item for a person");

      // EVERY OTHER PATH THAT REMOVES A BANK AT PLAID (checked for the same gap)
      // 1. the save of a new bank fails after Plaid made the Item
      reset(); P.removeFailsLeft = 3;
      const s1 = makeDb({ items: { [A]: 1 } }); s1.state.upsertFails.plaid_items = 1;
      const rs1 = await call(load(s1, A).plaid, newBank("sv"));
      t.eq([rs1.status, refused(s1).map((r) => r.access_token), counted(s1, A).length], [500, ["access-sv"], 1],
        "R6-2a the new bank's row could not be saved, and Plaid will not remove its Item: the answer is still \"could not save\", and a refused row is kept for it (was: one try at Plaid, then nothing)");
      P.calls.length = 0;
      await call(load(s1, A).plaid, { action: "list_items" });
      t.eq([removes(), refused(s1).length], [["access-sv"], 0], "R6-2b …and it is finished when the banks are listed");
      reset();
      const s2 = makeDb({ items: { [A]: 1 } }); s2.state.upsertFails.plaid_items = 1;
      const rs2 = await call(load(s2, A).plaid, newBank("sv2"));
      t.eq([rs2.status, removes(), s2.state.rows.plaid_items.length], [500, ["access-sv2"], 1], "R6-2c the same with Plaid answering: removed at once, no row left");
      // 2. the person disconnects a bank and Plaid will not remove it
      reset(); P.removeFailsLeft = 9;
      const x1 = makeDb({ items: { [A]: 2 } });
      const dx = await call(load(x1, A).plaid, { action: "delete_item", item_id: "a-item-1" });
      t.eq([dx.status, dx.body && dx.body.removed, counted(x1, A), refused(x1).map((r) => r.item_id)], [200, true, ["a-item-0"], ["a-item-1"]],
        "R6-2d the person disconnects a bank and Plaid will not remove the Item: the bank IS disconnected for them, and a refused row keeps its token so it can still be removed (was: the row deleted, the Item live at Plaid for good)");
      P.removeFailsLeft = 0; P.calls.length = 0;
      const lx = await call(load(x1, A).plaid, { action: "list_items" });
      t.eq([lx.body.items.map((i) => i.item_id), removes(), x1.state.rows.plaid_items.length], [["a-item-0"], ["access-a-1"], 1], "R6-2e …it is not in their list, and listing finishes the removal");
      reset();
      const x2 = makeDb({ items: { [A]: 2 } });
      const dx2 = await call(load(x2, A).plaid, { action: "delete_item", item_id: "a-item-1" });
      t.eq([dx2.body && dx2.body.removed, x2.state.rows.plaid_items.length, removes()], [true, 1, ["access-a-1"]], "R6-2f with Plaid answering, a disconnect leaves no row, as before");
      // 3. a duplicate of the same bank, removed when the bank is linked again
      reset(); P.removeFailsLeft = 9;
      const u1 = makeDb({ items: { [A]: 1 } });
      u1.state.rows.plaid_items[0].institution_id = "ins_same";
      const ru = await call(load(u1, A).plaid, { action: "exchange_token", public_token: "pt-dup", institution_name: "Same Bank", institution_id: "ins_same" });
      t.eq([ru.status, counted(u1, A), refused(u1).map((r) => r.item_id)], [200, ["item-dup"], ["a-item-0"]],
        "R6-2g the same bank linked again and Plaid will not remove the older Item: one connected bank (the new one), and the older one's token is kept in a refused row, not lost");
      // 4. collapsing duplicates
      reset(); P.removeFailsLeft = 9;
      const c1 = makeDb({ items: { [A]: 2 } });
      c1.state.rows.plaid_items.forEach((r) => { r.institution_id = "ins_twice"; });
      const rc = await call(load(c1, A).plaid, { action: "collapse_duplicate_items" });
      t.eq([rc.status, counted(c1, A).length, refused(c1).length], [200, 1, 1], "R6-2h collapsing duplicates when Plaid will not remove the older one: one bank stays connected and the other's token is kept in a refused row");
      const srcR = src("netlify", "functions", "plaid.js");
      const withoutComments = srcR.replace(/\/\/[^\n]*/g, "");
      const removals = [...withoutComments.matchAll(/plaid\("\/item\/remove"/g)].length;
      t.eq(removals, 4, "R6-2i Plaid's removal is called in four places only: the one helper every refusal, disconnect and duplicate goes through; the later finish; remove_item (which leaves the row where it is); and deleting the whole account");
      const leftBare = [...withoutComments.matchAll(/try \{ await plaid\("\/item\/remove"/g)].length;
      t.eq(leftBare, 2, "R6-2j the only one-line \"try it\" removals left are inside that helper (three tries) and the later finish: the save-failed, duplicate and disconnect paths no longer try once and carry on");
    }

    // ── ROUND 7 (2026-11-23), R7-1: THE ROW AND THE REMOVAL BOTH FAIL ───────────────────────────────────────────────
    // keepRefusedRow answers false when the row could not be written (three tries), and no caller looked. If Plaid's
    // removal failed too, the request answered an ordinary 402 or 200 with a live Item and no record of it anywhere.
    // Now every caller looks. When both fail: the answer is the explicit "unavailable" wherever the API allows it, and
    // an alert goes OUTSIDE the database, to the error tracker and to the support inbox, naming the Item and the path,
    // never its token, so a person can remove it by hand.
    {
      const refused = (db) => db.state.rows.plaid_items.filter((r) => r.status === "refused");
      const savedEnv = { RESEND_API_KEY: process.env.RESEND_API_KEY, SENTRY_DSN: process.env.SENTRY_DSN, VITE_SENTRY_DSN: process.env.VITE_SENTRY_DSN };
      process.env.RESEND_API_KEY = "re_test_round7"; process.env.SENTRY_DSN = "https://abc123def@o111.ingest.sentry.io/4242"; delete process.env.VITE_SENTRY_DSN;
      const sentry = () => P.alerts.filter((a) => a.to === "sentry"), email = () => P.alerts.filter((a) => a.to === "email");
      const noToken = () => P.alerts.every((a) => !/access-/.test(a.raw) && !/access-/.test(JSON.stringify(a.headers).replace(/re_test_round7/, "")));
      // what an alert must say
      const says = (item, pathWord) => {
        const sn = sentry()[0], em = email()[0];
        const mail = em ? JSON.parse(em.raw) : {};
        return [sentry().length, email().length,
          !!sn && sn.url === "https://o111.ingest.sentry.io/api/4242/envelope/" && /sentry_key=abc123def/.test(String(sn.headers["X-Sentry-Auth"] || "")) && sn.raw.includes(item) && sn.raw.includes(pathWord) && /"level":"error"/.test(sn.raw),
          !!em && Array.isArray(mail.to) && mail.to[0] === "hello@flourishmoney.app" && String(mail.text || "").includes(item) && String(mail.text || "").includes(pathWord) && String(mail.text || "").includes(A),
          noToken()];
      };
      const BOTH = [1, 1, true, true, true];

      // 1. a NEW bank refused at the limit
      reset(); P.removeFailsLeft = 9;
      const a1 = makeDb({ items: { [A]: 2 } }); a1.state.upsertFails.plaid_items = 9;
      const ra = await call(load(a1, A).plaid, newBank("r7a"));
      t.eq([ra.status, ra.body && ra.body.error, a1.state.rows.plaid_items.length, a1.state.writes.filter((w) => w[1] === "upsert failed").length, removes().length], [503, "status_unavailable", 2, 3, 3],
        "R7-1a a new bank refused at the limit; its row cannot be written (three tries) AND Plaid will not remove its Item (three tries): the answer is 503 \"unavailable\" (was an ordinary 402)");
      t.eq(says("item-r7a", "exchange_token limit"), BOTH, "R7-1b …and one error goes to the error tracker and one email to support, each naming the Item, the path and the account, and neither carrying its token");
      // 2. the save of a new bank fails
      reset(); P.removeFailsLeft = 9;
      const b1 = makeDb({ items: { [A]: 1 } }); b1.state.upsertFails.plaid_items = 9;
      const rb = await call(load(b1, A).plaid, newBank("r7b"));
      t.eq([rb.status, rb.body && rb.body.error, b1.state.rows.plaid_items.length], [503, "status_unavailable", 1], "R7-1c the save of a new bank fails, the refused row cannot be written either, and Plaid will not remove the Item: 503 \"unavailable\" (was 500 \"could not save\", with nothing said about the Item)");
      t.eq(says("item-r7b", "exchange_token save failed"), BOTH, "R7-1d …with the same alert");
      // 3. the person disconnects a bank: the mark cannot be written, so nothing is deleted
      reset(); P.removeFailsLeft = 9;
      const e1 = makeDb({ items: { [A]: 2 } }); e1.state.updateFails.plaid_items = 9;
      const re1 = await call(load(e1, A).plaid, { action: "delete_item", item_id: "a-item-1" });
      const still = e1.state.rows.plaid_items.find((r) => r.item_id === "a-item-1") || {};
      t.eq([re1.status, re1.body && re1.body.error, still.status, still.access_token, e1.state.writes.some((w) => w[1] === "disconnect")], [503, "status_unavailable", "active", "access-a-1", false],
        "R7-1e a disconnect when Plaid will not remove the Item and the row cannot be marked: 503 \"unavailable\", and NOTHING is deleted, so the bank still has its row and its token (was: the row was deleted first, then lost)");
      t.eq(says("a-item-1", "delete_item"), BOTH, "R7-1f …with the same alert");
      // 3b. the mark lands, the disconnect goes through, and then the refused row cannot be put back
      reset(); P.removeFailsLeft = 9;
      const e2 = makeDb({ items: { [A]: 2 } }); e2.state.upsertFails.plaid_items = 9;
      const re2 = await call(load(e2, A).plaid, { action: "delete_item", item_id: "a-item-1" });
      t.eq([re2.status, re2.body && re2.body.error, e2.state.rows.plaid_items.map((r) => r.item_id)], [503, "status_unavailable", ["a-item-0"]], "R7-1g the disconnect goes through and then its token cannot be kept: 503 \"unavailable\", not \"removed\"");
      t.eq(says("a-item-1", "delete_item"), BOTH, "R7-1h …with the same alert, which is then the only record of that Item");
      // 4. a duplicate on re-link: the new bank IS connected, so the answer cannot honestly be an error
      reset(); P.removeFailsLeft = 9;
      const c1 = makeDb({ items: { [A]: 1 } }); c1.state.rows.plaid_items[0].institution_id = "ins_same7";
      c1.state.afterWrite = (table, row) => { if (table === "plaid_items" && row.item_id === "item-dup7") c1.state.updateFails.plaid_items = 9; };
      const rc1 = await call(load(c1, A).plaid, { action: "exchange_token", public_token: "pt-dup7", institution_name: "Same Bank", institution_id: "ins_same7" });
      const old1 = c1.state.rows.plaid_items.find((r) => r.item_id === "a-item-0") || {};
      t.eq([rc1.status, rc1.body && rc1.body.ok, old1.status, old1.access_token, c1.state.writes.some((w) => w[1] === "disconnect")], [200, true, "active", "access-a-0", false],
        "R7-1i the same bank linked again; the older Item cannot be removed at Plaid and its row cannot be marked: the new bank is connected (the answer cannot honestly be an error), and the older bank's row is NOT deleted, so it keeps its record and its token");
      t.eq(says("a-item-0", "exchange_token dedupe"), BOTH, "R7-1j …with the same alert");
      // 5. collapsing duplicates
      reset(); P.removeFailsLeft = 9;
      const d1 = makeDb({ items: { [A]: 2 } }); d1.state.rows.plaid_items.forEach((r) => { r.institution_id = "ins_twice7"; });
      d1.state.updateFails.plaid_items = 9;
      const rd1 = await call(load(d1, A).plaid, { action: "collapse_duplicate_items" });
      t.eq([rd1.status, rd1.body && rd1.body.error, d1.state.rows.plaid_items.map((r) => r.status), d1.state.writes.some((w) => w[1] === "disconnect")], [503, "status_unavailable", ["active", "active"], false],
        "R7-1k collapsing duplicates when neither can be done: 503 \"unavailable\", and both rows are still there");
      t.ok(sentry().length === 1 && email().length === 1 && noToken() && sentry()[0].raw.includes("collapse"), "R7-1l …with the same alert");

      // ONE failure alone is not this: no alert, the ordinary answer
      reset(); P.removeFailsLeft = 9;
      const s1 = makeDb({ items: { [A]: 2 } });
      const rs1 = await call(load(s1, A).plaid, newBank("r7s"));
      t.eq([rs1.status, refused(s1).length, P.alerts.length], [402, 1, 0], "R7-1m Plaid will not remove the Item but its row is kept: the ordinary refusal, and no alert (it is finished later)");
      reset();
      const s2 = makeDb({ items: { [A]: 2 } }); s2.state.upsertFails.plaid_items = 9;
      const rs2 = await call(load(s2, A).plaid, newBank("r7t"));
      t.eq([rs2.status, removes(), P.alerts.length], [402, ["access-r7t"], 0], "R7-1n the row cannot be written but Plaid removes the Item: the ordinary refusal, and no alert (nothing is left)");
      // no alert settings on this deploy (a preview): the same answer, nothing thrown
      reset(); P.removeFailsLeft = 9; delete process.env.RESEND_API_KEY; delete process.env.SENTRY_DSN;
      const n1 = makeDb({ items: { [A]: 2 } }); n1.state.upsertFails.plaid_items = 9;
      const rn = await call(load(n1, A).plaid, newBank("r7n"));
      t.eq([rn.status, P.alerts.length, errors.some((e) => /item-r7n/.test(e))], [503, 0, true], "R7-1o with no error tracker and no mail key set (a preview): still 503, nothing thrown, and the function log names the Item");
      // the app's own error tracker address works too (it is the same public address, already in the app)
      reset(); P.removeFailsLeft = 9; process.env.VITE_SENTRY_DSN = "https://pubkey9@o222.ingest.sentry.io/77";
      const v1 = makeDb({ items: { [A]: 2 } }); v1.state.upsertFails.plaid_items = 9;
      await call(load(v1, A).plaid, newBank("r7v"));
      t.eq(sentry().map((a) => a.url), ["https://o222.ingest.sentry.io/api/77/envelope/"], "R7-1p the error tracker's address is taken from the server's own setting, or the app's public one");
      // the sender itself: never throws, never sends a token it was not given, and is quiet without an address
      const SA = require("../netlify/functions/_lib/serverAlert.js");
      const sentTo = [];
      const okFetch = async (url, init) => { sentTo.push({ url, init }); return { ok: true, status: 200 }; };
      t.eq([await SA.reportServerError({ message: "m", tags: { flag: "f", path: "p" }, extra: { item_id: "item-x" } }, { env: { SENTRY_DSN: "https://k@o9.ingest.sentry.io/5" }, fetchImpl: okFetch }), sentTo.length, sentTo[0] && sentTo[0].init.headers["Content-Type"], sentTo[0] && sentTo[0].init.body.trim().split("\n").length],
        [true, 1, "application/x-sentry-envelope", 3], "R7-1r the error tracker is sent one envelope: its header, the item's type, and the event");
      const ev = JSON.parse(sentTo[0].init.body.trim().split("\n")[2]);
      t.eq([ev.level, ev.tags, ev.extra, ev.message.formatted, /^[0-9a-f]{32}$/.test(ev.event_id)], ["error", { flag: "f", path: "p" }, { item_id: "item-x" }, "m", true], "R7-1s the event says exactly what it was given, as an error");
      t.eq([await SA.reportServerError({ message: "m" }, { env: {}, fetchImpl: okFetch }), await SA.reportServerError({ message: "m" }, { env: { SENTRY_DSN: "not an address" }, fetchImpl: okFetch }), sentTo.length], [false, false, 1], "R7-1t with no address, or one that is not an address, nothing is sent");
      t.eq([await SA.reportServerError({ message: "m" }, { env: { SENTRY_DSN: "https://k@o9.ingest.sentry.io/5" }, fetchImpl: async () => { throw new Error("network down"); } }), await SA.reportServerError({ message: "m" }, { env: { SENTRY_DSN: "https://k@o9.ingest.sentry.io/5" }, fetchImpl: async () => ({ ok: false, status: 429 }) })], [false, false], "R7-1u a send that fails answers false and never throws");
      const SUP = require("../netlify/functions/_lib/supportAlert.js");
      const m1 = SUP.supportAlertMessage({ flag: "plaid_item_no_record", userId: A, itemId: "item-x", path: "delete_item" });
      const m2 = SUP.supportAlertMessage({ flag: "plaid_item_removal_stuck", userId: A, itemId: "item-x", path: "collapse" });
      t.ok(/NO row/.test(m1.text) && /Remove it by hand/.test(m1.text) && /item-x/.test(m1.text) && /still connected/.test(m2.text) && /nothing was deleted/.test(m2.text) && !/\u2014/.test(m1.text + m2.text), "R7-1v the two support emails say which it is: no record anywhere (remove it by hand), or nothing deleted (still connected)");

      // every caller looks at the answer
      const srcK = src("netlify", "functions", "plaid.js").replace(/\/\/[^\n]*/g, "");
      const calls7 = [...srcK.matchAll(/^.*keepRefusedRow\(.*$/gm)].map((m) => m[0].trim()).filter((l) => !/^async function keepRefusedRow/.test(l));
      t.ok(calls7.length >= 3 && calls7.every((l) => /(const \w+ = |if \(!?\(?await |return |&& !?\(?await |\|\| !?\(?await )/.test(l) && !/^await keepRefusedRow\(/.test(l)), `R7-1q every call of keepRefusedRow uses its answer (${calls7.length} calls)`);
      Object.assign(process.env, Object.fromEntries(Object.entries(savedEnv).filter(([, v]) => v !== undefined)));
      for (const [k, v] of Object.entries(savedEnv)) if (v === undefined) delete process.env[k];
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

      // ROUND 3, M3: "a failed rollback must not return success". The extra entry cannot be deleted.
      const CID = "99999999-9999-4999-8999-999999999999";
      const stuckE = makeDb({ plus: A, entries: { [A]: 49 } });
      stuckE.state.afterWrite = (table, row) => {
        if (table !== "net_worth_entries" || row.label !== "Mine") return;
        stuckE.state.afterWrite = null;
        stuckE.state.rows.net_worth_entries.push({ id: newId(), user_id: A, kind: "home", label: "Landed first", value_cents: 1, currency: "CAD", shared: false, entered_at: "2026-11-01T12:00:30.000Z" });
      };
      stuckE.state.deleteFails.net_worth_entries = 9;
      const e1 = await call(load(stuckE, A).nw, { ...entry("Mine"), client_id: CID });
      t.eq([e1.status, e1.body && e1.body.error, e1.body && e1.body.ok, stuckE.state.writes.filter((w) => w[0] === "net_worth_entries" && w[1] === "delete failed").length],
        [503, "unavailable", undefined, 3], "M3-c the entry past the cap cannot be taken back out (three tries): the answer is a failure, never \"saved\" (was: 200 ok, with 51 entries)");
      t.eq(count(stuckE), 51, "M3-d (the entry is still there: the database would not let it go)");
      // the app sends the same entry again (same client_id): it is not waved through as a save; the removal is tried again
      stuckE.state.deleteFails.net_worth_entries = 0;
      const e2 = await call(load(stuckE, A).nw, { ...entry("Mine"), client_id: CID });
      t.eq([e2.status, e2.body && e2.body.error, count(stuckE), stuckE.state.rows.net_worth_entries.some((e) => e.id === CID)], [409, "too_many_entries", 50, false],
        "M3-e the same entry sent again is not waved through as a save: the removal is tried again, it goes, and the refusal is the one the app knows");
      // an ordinary second send of an entry that is inside the cap is still one entry, saved
      const fine = makeDb({ plus: A, entries: { [A]: 10 } });
      const f1 = await call(load(fine, A).nw, { ...entry("Car"), client_id: CID });
      const f2 = await call(load(fine, A).nw, { ...entry("Car, corrected"), client_id: CID });
      t.eq([f1.status, f2.status, count(fine), fine.state.rows.net_worth_entries.find((e) => e.id === CID).label], [200, 200, 11, "Car, corrected"], "M3-f an ordinary second send of the same entry is still one entry, saved, as before");
    }
  } finally {
    global.fetch = realFetch; console.error = quiet.e; console.warn = quiet.w;
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  }
  t.summary("plusRound2Limits");
})().catch((e) => { console.error(e); process.exit(1); });
