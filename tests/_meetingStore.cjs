// tests/_meetingStore.cjs — the REAL netlify/functions/meeting.js over an in-memory meeting_records table.
// -----------------------------------------------------------------------------
// Used by tests/meetingMemory.test.cjs and tests/meetingMemory.browser.test.cjs. Nothing reaches a real
// database. The stand-in keeps the rows the way the migrations do:
//   - the server's writes come through the admin (service-role) client, as upsert on (user_id, met_on);
//   - a read made AS A PERSON (getUserScopedClient) sees only what the row policies allow: their own rows
//     (0011 meeting_records_select_own) and a household member's rows dated on or after THAT member's
//     joined_at date (0030 meeting_records_select_household, shares_household_record);
//   - household_members is readable by a member of the same household (household_members_select_member).
// The admin client here can ONLY upsert: a read through it throws, so a list that used the secret key
// would fail the tests rather than quietly bypass the policies.
// Tokens: "tok:<user id>" or an unsigned JWT whose payload carries sub.
// -----------------------------------------------------------------------------
"use strict";

const AUTH_PATH = require.resolve("../netlify/functions/_lib/auth.js");
const FN_PATH = require.resolve("../netlify/functions/meeting.js");

function userFromToken(token) {
  if (!token) return null;
  if (token.startsWith("tok:")) return token.slice(4);
  try { return JSON.parse(Buffer.from(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")).sub || null; }
  catch { return null; }
}

function createStore() {
  const S = {
    rows: [],            // { user_id, met_on, answers }
    members: [],         // { household_id, user_id, joined_at }
    log: { scopedTokens: [], adminReads: 0, upserts: 0, listFilters: [] },
    fail: { list: false, record: false, members: false, auth: false },
  };

  const householdOf = (uid) => (S.members.find(m => m.user_id === uid) || {}).household_id || null;
  const memberRow = (uid) => S.members.find(m => m.user_id === uid) || null;
  // 0011 + 0030, as the database applies them to a signed-in reader.
  const visibleTo = (reader, row) => {
    if (row.user_id === reader) return true;
    const h = householdOf(reader);
    const owner = memberRow(row.user_id);
    return !!h && !!owner && owner.household_id === h && row.met_on >= String(owner.joined_at).slice(0, 10);
  };

  function scopedClient(token) {
    S.log.scopedTokens.push(token);
    const reader = userFromToken(token);
    return {
      from(table) {
        const q = { table, filters: [], order: null, limit: null, single: false };
        const run = async () => {
          if (table === "meeting_records") {
            S.log.listFilters.push(q.filters.slice());
            if (S.fail.list) return { data: null, error: { message: "list failed (test)" } };
            let out = S.rows.filter(r => visibleTo(reader, r));
            for (const [col, v] of q.filters) out = out.filter(r => r[col] === v);
            out = out.slice().sort((a, b) => String(b.met_on).localeCompare(String(a.met_on)));
            if (q.limit != null) out = out.slice(0, q.limit);
            return { data: out.map(r => ({ user_id: r.user_id, met_on: r.met_on, answers: JSON.parse(JSON.stringify(r.answers)) })), error: null };
          }
          if (table === "household_members") {
            if (S.fail.members) return { data: null, error: { message: "members failed (test)" } };
            const h = householdOf(reader);
            let out = h ? S.members.filter(m => m.household_id === h) : [];
            for (const [col, v] of q.filters) out = out.filter(r => r[col] === v);
            if (q.single) return { data: out[0] ? { joined_at: out[0].joined_at } : null, error: null };
            return { data: out, error: null };
          }
          return { data: [], error: null };
        };
        const b = {
          select() { return b; },
          eq(col, v) { q.filters.push([col, v]); return b; },
          order(col, o) { q.order = [col, o]; return b; },
          limit(n) { q.limit = n; return b; },
          maybeSingle() { q.single = true; return run(); },
          then(ok, bad) { return run().then(ok, bad); },
        };
        return b;
      },
    };
  }

  const admin = {
    from(table) {
      return {
        upsert: async (row) => {
          if (table !== "meeting_records") throw new Error("unexpected admin table " + table);
          if (S.fail.record) return { error: { message: "record failed (test)" } };
          S.log.upserts++;
          const i = S.rows.findIndex(r => r.user_id === row.user_id && r.met_on === row.met_on);
          const copy = { user_id: row.user_id, met_on: row.met_on, answers: JSON.parse(JSON.stringify(row.answers || [])) };
          if (i >= 0) S.rows[i] = copy; else S.rows.push(copy);
          return { error: null };
        },
        select() { S.log.adminReads++; throw new Error("the admin client must not read meeting_records"); },
      };
    },
  };

  // The real function, with only _lib/auth.js swapped for the stand-in.
  delete require.cache[FN_PATH];
  delete require.cache[AUTH_PATH];
  const real = require(AUTH_PATH);
  require.cache[AUTH_PATH].exports = {
    ...real,
    getUserFromRequest: async (event) => {
      if (S.fail.auth) return { user_id: null, error: "invalid or expired token" };
      const uid = userFromToken(real.extractToken(event));
      return uid ? { user_id: uid, error: null } : { user_id: null, error: "missing Authorization header" };
    },
    getAdminClient: () => admin,
    getUserScopedClient: (token) => { if (!token) throw new Error("no access token"); return scopedClient(token); },
  };
  const fn = require(FN_PATH);
  delete require.cache[FN_PATH];
  delete require.cache[AUTH_PATH];

  // A fetch the client library can use: /api/meeting goes to the real handler.
  const fetchFor = () => async (url, init = {}) => {
    const headers = init.headers || {};
    const r = await fn.handler({ httpMethod: init.method || "GET", headers: { authorization: headers.Authorization || headers.authorization, origin: "https://flourishmoney.app" }, body: init.body || "" });
    const body = r.body || "";
    return { ok: r.statusCode >= 200 && r.statusCode < 300, status: r.statusCode, json: async () => JSON.parse(body || "null") };
  };

  return { S, fn, fetchFor, userFromToken };
}

module.exports = { createStore, userFromToken };
