// tests/_trialFakes.cjs
// -----------------------------------------------------------------------------
// Fakes for tests/trialPlanFirst*.test.cjs: an in-memory Supabase admin client (the few query shapes the functions
// use), a Stripe that records every call, and loaders that put them under the real functions. Synthetic data only.
// -----------------------------------------------------------------------------
"use strict";

function fakeAdmin(state, { failRead = null, rpc = null } = {}) {
  const calls = [];
  const from = (table) => {
    const f = {}; let op = "select"; let payload = null; let cols = ""; let gt = {}; let lte = {}; let ins = {};
    const rows = () => (state[table] || []);
    const match = (r) => Object.entries(f).every(([k, v]) => r[k] === v)
      && Object.entries(gt).every(([k, v]) => r[k] != null && r[k] > v)
      && Object.entries(lte).every(([k, v]) => r[k] != null && r[k] <= v)
      && Object.entries(ins).every(([k, v]) => v.includes(r[k]));
    const q = {
      select(c) { if (op === "select") cols = String(c || ""); return q; },
      eq(c, v) { f[c] = v; return q; },
      gt(c, v) { gt[c] = v; return q; },
      lte(c, v) { lte[c] = v; return q; },
      in(c, v) { ins[c] = v; return q; },
      limit() { return q; },
      order() { return q; },
      insert(p) { op = "insert"; payload = p; return q; },
      upsert(p) { op = "upsert"; payload = p; return q; },
      update(p) { op = "update"; payload = p; return q; },
      async maybeSingle() { return q._run(true); },
      then(res, rej) { return q._run(false).then(res, rej); },
      async _run(single) {
        calls.push({ table, op, cols, f: { ...f }, payload });
        if (failRead && failRead(table, op)) return { data: null, error: { message: "read failed", code: "XX000" } };
        if (op === "insert") {
          state[table] = state[table] || [];
          const list = Array.isArray(payload) ? payload : [payload];
          for (const r of list) {
            const key = state.__unique && state.__unique[table];
            if (key && state[table].some((x) => key.every((k) => x[k] === r[k]))) return { data: null, error: { code: "23505", message: "duplicate" } };
            state[table].push({ ...r });
          }
          return { data: list, error: null };
        }
        if (op === "upsert") { state[table] = state[table] || []; state[table].push({ ...payload }); return { data: [payload], error: null }; }
        if (op === "update") { const hit = rows().filter(match); hit.forEach((r) => Object.assign(r, payload)); return { data: hit, error: null }; }
        const hit = rows().filter(match);
        return { data: single ? hit[0] || null : hit, error: null };
      },
    };
    return q;
  };
  return {
    calls,
    from,
    rpc: async (name, args) => { calls.push({ rpc: name, args }); return rpc ? rpc(name, args) : { data: null, error: null }; },
    auth: { admin: { getUserById: async (id) => ({ data: { user: (state.__users || {})[id] || { email: "person@example.test", email_confirmed_at: "2026-10-01T00:00:00Z" } } }) } },
  };
}

function fakeStripe(responses = {}) {
  const calls = [];
  const answer = (method, url, body) => {
    for (const [prefix, fn] of Object.entries(responses)) if (url.startsWith(prefix)) return typeof fn === "function" ? fn(body, url, method) : fn;
    return method === "GET" ? { data: [] } : { id: "obj_test", url: "https://checkout.stripe.test/c/x" };
  };
  return {
    calls,
    stripeGet: async (url) => { calls.push({ method: "GET", url }); return answer("GET", url); },
    stripePost: async (url, body, opts) => { calls.push({ method: "POST", url, body, opts }); return answer("POST", url, body); },
  };
}

// Load a function with the fakes under it. modPath: the function file; returns its module.
function loadWith(modPath, { admin, stripe, userId = "u1" } = {}) {
  const AUTH = require.resolve("../netlify/functions/_lib/auth.js");
  const API = require.resolve("../netlify/functions/_lib/stripeApi.js");
  for (const k of Object.keys(require.cache)) if (k.includes("/netlify/functions/")) delete require.cache[k];
  const real = require(AUTH);
  require.cache[AUTH].exports = { ...real, getUserFromRequest: async () => ({ user_id: userId, error: null }), getAdminClient: () => admin };
  if (stripe) require.cache[API] = { id: API, filename: API, loaded: true, exports: { stripeGet: stripe.stripeGet, stripePost: stripe.stripePost } };
  return require(modPath);
}

module.exports = { fakeAdmin, fakeStripe, loadWith };
