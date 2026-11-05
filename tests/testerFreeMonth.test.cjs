// tests/testerFreeMonth.test.cjs
// -----------------------------------------------------------------------------
// THE TESTERS' FREE MONTH, FROM THE SIGN-UP (Amanda, 2026-11-05). The real beta.js with a stand-in database.
//   1  a live code: the account is marked a tester, then asks for the free month
//   2  a bad code: refused before any account exists, and no free month
//   3  no code: no tester row and no free month
//   4  the grant failing (0039 not run) still leaves a working account
//   5  the entitlement: on Plus until day 30, on the free plan from day 30, in both copies of the rule, with no card or purchase
//   6  nothing is tied to a rating or a review
// The cap and the real date write are in tests/testerFreeMonth.sql.test.cjs.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");

const FN = path.join(__dirname, "..", "netlify", "functions");
const AUTH_PATH = path.join(FN, "_lib", "auth.js"), BETA_PATH = path.join(FN, "beta.js"), BLOBS_PATH = require.resolve("@netlify/blobs");
const NEW_ID = "00000000-0000-4000-8000-000000000001";

function freshBlobs() {
  const mem = new Map();
  const store = { get: async (k) => (mem.has(k) ? JSON.parse(mem.get(k)) : null), setJSON: async (k, v) => { mem.set(k, JSON.stringify(v)); } };
  return { getStore: () => store, connectLambda: () => {} };
}

function fakeAdmin(state) {
  return {
    rpc: async (fn, args) => { state.rpc.push({ fn, args }); if (fn === "tester_free_month_grant" && state.grantError) return { data: null, error: { message: "missing" } }; return { data: fn === "reserve_beta_seat" ? "ok" : [{ granted: true }], error: null }; },
    from: (table) => ({
      select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: state.liveCodes.includes(state.lastCode) ? { code: state.lastCode } : null, error: null }) }) }) }),
      insert: async (row) => { state.inserts.push({ table, row }); return { error: null }; },
      delete: () => ({ eq: async () => ({ error: null }) }),
    }),
    auth: { admin: { createUser: async (u) => { state.created.push(u); return { data: { user: { id: NEW_ID } }, error: null }; } } },
  };
}

async function signup(state, testerCode) {
  const saved = { ...process.env }, savedFetch = global.fetch;
  for (const p of [AUTH_PATH, BETA_PATH, BLOBS_PATH]) delete require.cache[p];
  require.cache[BLOBS_PATH] = { id: BLOBS_PATH, filename: BLOBS_PATH, loaded: true, exports: freshBlobs() };
  require.cache[AUTH_PATH] = { id: AUTH_PATH, filename: AUTH_PATH, loaded: true, exports: { getAdminClient: () => fakeAdmin(state), getPublicClient: () => ({ auth: { resend: async () => ({ error: null }) } }) } };
  global.fetch = async () => { throw new Error("network blocked in test"); };
  state.lastCode = String(testerCode || "").trim().toUpperCase();
  try {
    Object.assign(process.env, { SUPABASE_URL: "https://supabase.test.invalid", SUPABASE_SECRET_KEY: "test-secret-not-real", OPEN_SIGNUP: "true" });
    const body = { action: "signup", email: "tester@example.ca", password: "long-enough-1", ...(testerCode ? { tester_code: testerCode } : {}) };
    const res = await require(BETA_PATH).handler({ httpMethod: "POST", headers: { origin: "https://flourishmoney.app" }, body: JSON.stringify(body) });
    return JSON.parse(res.body);
  } finally {
    process.env = saved; global.fetch = savedFetch;
    for (const p of [AUTH_PATH, BETA_PATH, BLOBS_PATH]) delete require.cache[p];
  }
}
const fresh = (over = {}) => ({ rpc: [], created: [], inserts: [], liveCodes: ["FM-TEST1"], ...over });
const grants = (s) => s.rpc.filter((r) => r.fn === "tester_free_month_grant");
const testerRows = (s) => s.inserts.filter((i) => i.table === "tester_accounts");

(async () => {
  const t = create();
  {
    const s = fresh();
    const out = await signup(s, " fm-test1 ");
    t.ok(out.ok === true, "1a a live code signs up");
    t.eq(testerRows(s).map((i) => i.row), [{ user_id: NEW_ID, code: "FM-TEST1" }], "1b the account is marked a tester, with the code");
    t.eq(grants(s).map((g) => g.args), [{ p_user_id: NEW_ID }], "1c and asks for the free month, once, for this account");
    t.eq(s.created[0].app_metadata.tester, true, "1d the app knows to ask for its day 30 questions");
    t.ok(!/plan|trial|founder/i.test(Object.keys(s.created[0].app_metadata).join()), "1e nothing about a plan goes on the account's metadata");
  }
  {
    const s = fresh();
    t.eq((await signup(s, "NOT-A-CODE")).error, "tester_code_invalid", "2a a code that isn't live is refused");
    t.eq([s.created.length, testerRows(s).length, grants(s).length], [0, 0, 0], "2b no account, no tester row, no free month");
    const s2 = fresh();
    t.eq((await signup(s2, "bad code!")).error, "tester_code_invalid", "2c nor one that isn't even a code");
    t.eq(grants(s2).length, 0, "2d no free month");
  }
  {
    const s = fresh();
    t.ok((await signup(s)).ok === true, "3a no code is an ordinary sign-up");
    t.eq([testerRows(s).length, grants(s).length, s.created[0].app_metadata.tester], [0, 0, undefined], "3b no tester row, no free month");
  }
  {
    const s = fresh({ grantError: true });
    t.ok((await signup(s, "FM-TEST1")).ok === true, "4a 0039 not run: the sign-up still works");
    t.eq(testerRows(s).length, 1, "4b and the account is still marked a tester");
  }
  {
    const R = require("../netlify/functions/_lib/planRules");
    const C = await import("../src/lib/planFromProfile.js");
    const signedUp = Date.parse("2026-11-05T12:00:00Z"), DAY = 86400000;
    const row = { plan: "trial", founder_flag: false, trial_started_at: new Date(signedUp).toISOString(), trial_ends_at: new Date(signedUp + 30 * DAY).toISOString() };
    const at = (d) => signedUp + d * DAY;
    t.eq([R.derivePlan(row, at(15)), R.deriveEntitlement(row, null, at(15)).unlimited], ["trial", true], "5a on day 15 it still has everything, past the ordinary 14");
    t.eq([R.derivePlan(row, at(30) - 1), R.isUnlimitedProfile(row, at(30) - 1)], ["trial", true], "5b right up to day 30");
    const end = R.deriveEntitlement(row, null, at(30));
    t.eq([end.plan, end.unlimited, end.paidSubscription], ["free", false, false], "5c on day 30 it ends by itself, with no subscription involved");
    t.eq([C.derivePlan(row, at(30) - 1), C.derivePlan(row, at(30)), C.isUnlimitedProfile(row, at(30))], ["trial", "free", false], "5d the app's copy of the rule agrees");
    const sql = fs.readFileSync(path.join(__dirname, "..", "supabase", "migrations", "0039_tester_free_month.sql"), "utf8").replace(/^--.*$/gm, "");
    t.ok(!/subscriptions|stripe|revenuecat|billing/i.test(sql), "5e no subscription, purchase or card is touched");
    t.ok(/interval '30 days'/.test(sql) && /taken >= 10/.test(sql), "5f 30 days, and a cap of 10");
  }
  {
    const beta = fs.readFileSync(BETA_PATH, "utf8");
    const part = beta.slice(beta.indexOf("THE FREE MONTH (migration 0039)"), beta.indexOf('[beta:signup] signup_completed'));
    t.ok(part.length > 50 && !/rating|review|storeReview/i.test(part), "6a the grant has nothing to do with a rating or review");
  }
  t.summary("TESTER FREE MONTH");
})();
