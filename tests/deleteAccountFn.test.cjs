// tests/deleteAccountFn.test.cjs
// -----------------------------------------------------------------------------
// DELETING AN ACCOUNT EITHER FINISHES OR STOPS BEFORE THE SIGN-IN GOES (round-3, item 3).
//
// Runs the real delete_account handler in netlify/functions/plaid.js against a recording stand-in
// for the database and for Plaid:
//   - if the bank links cannot be loaded, NOTHING is deleted, so the app's "nothing was changed" is true;
//   - meeting_records and subscriptions are deleted with everything else;
//   - if either of those deletes fails, the auth user is left in place so a retry can finish;
//   - a Plaid /item/remove failure is still best-effort: the account is deleted anyway.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");

const AUTH_PATH = require.resolve("../netlify/functions/_lib/auth.js");
const FN_PATH = require.resolve("../netlify/functions/plaid.js");
const USER = "00000000-0000-4000-8000-000000000001";

function run({ fail = {}, plaidFails = false } = {}) {
  const log = { deletes: [], plaidCalls: 0, authDeleted: false };
  const result = (table, op) => ({ data: op === "select" ? [{ item_id: "item-1", access_token: "access-sandbox-x" }] : null,
    error: fail[`${op}:${table}`] ? { message: `${op} ${table} failed` } : null });
  const admin = {
    from: (table) => ({
      select: () => ({ eq: async () => result(table, "select") }),
      delete: () => ({ eq: async () => { const r = result(table, "delete"); if (!r.error) log.deletes.push(table); return r; } }),
    }),
    auth: { admin: {
      getUserById: async () => ({ data: { user: { email: "someone@example.invalid" } } }),
      deleteUser: async () => { if (fail.authDelete) return { error: { message: "no" } }; log.authDeleted = true; return { error: null }; },
    } },
  };
  delete require.cache[FN_PATH];
  delete require.cache[AUTH_PATH];
  const real = require("../netlify/functions/_lib/auth.js");
  require.cache[AUTH_PATH].exports = { ...real, getUserFromRequest: async () => ({ user_id: USER }), getAdminClient: () => admin };
  process.env.PLAID_CLIENT_ID = process.env.PLAID_CLIENT_ID || "test-client";
  process.env.PLAID_SECRET = process.env.PLAID_SECRET || "test-secret";
  const realFetch = global.fetch;
  global.fetch = async () => { log.plaidCalls++; return plaidFails
    ? { ok: false, json: async () => ({ error_code: "INTERNAL_SERVER_ERROR", error_message: "down" }) }
    : { ok: true, json: async () => ({ removed: true }) }; };
  const { handler } = require(FN_PATH);
  delete require.cache[FN_PATH];
  const quiet = { e: console.error, w: console.warn };
  console.error = () => {}; console.warn = () => {};
  return handler({ httpMethod: "POST", headers: { origin: "https://flourishmoney.app" }, body: JSON.stringify({ action: "delete_account" }) })
    .then((res) => ({ res, body: JSON.parse(res.body || "{}"), log }))
    .finally(() => { global.fetch = realFetch; console.error = quiet.e; console.warn = quiet.w; });
}
const steps = (b) => (b.errors || []).map((e) => e.step);

(async () => {
  const t = create();

  // ── 1. The bank links cannot be loaded: nothing is touched ───────────────────────────────────
  {
    const { body, log } = await run({ fail: { "select:plaid_items": true } });
    t.eq(log.deletes, [], "1a a failed plaid_items load deletes nothing");
    t.eq(log.plaidCalls, 0, "1b …revokes nothing at Plaid");
    t.eq(log.authDeleted, false, "1c …and leaves the sign-in in place");
    t.eq([body.deleted, steps(body)], [false, ["load_items"]], "1d the response says it stopped at load_items");
  }

  // ── 2. Everything works ──────────────────────────────────────────────────────────────────────
  {
    const { body, log } = await run();
    t.ok(log.deletes.includes("meeting_records"), "2a meeting_records are deleted");
    t.ok(log.deletes.includes("subscriptions"), "2b subscriptions are deleted");
    t.ok(["plaid_items", "user_data", "coach_usage", "profiles"].every((x) => log.deletes.includes(x)), "2c …with plaid_items, user_data, coach_usage and profiles");
    t.eq([log.authDeleted, body.deleted, steps(body)], [true, true, []], "2d the auth user is deleted and the response says so");
  }

  // ── 3. A critical delete fails: the auth user stays ──────────────────────────────────────────
  for (const table of ["meeting_records", "subscriptions", "plaid_items"]) {
    const { body, log } = await run({ fail: { [`delete:${table}`]: true } });
    t.eq(log.authDeleted, false, `3 a failed ${table} delete leaves the auth user in place`);
    t.eq(body.deleted, false, `3 …and the response says the account was not deleted (${steps(body).join(",")})`);
  }

  // ── 4. Plaid is down: still best-effort ──────────────────────────────────────────────────────
  {
    const { body, log } = await run({ plaidFails: true });
    t.eq([log.authDeleted, body.deleted], [true, true], "4a a Plaid /item/remove failure does not trap the person in their account");
    t.eq(steps(body), ["plaid_remove"], "4b …it is recorded as plaid_remove, which the app treats as non-blocking");
  }

  // ── 5. The app tells the truth about which happened ──────────────────────────────────────────
  {
    const app = fs.readFileSync(path.join(__dirname, "..", "src", "App.jsx"), "utf8");
    t.ok(/const untouched = criticalErrors\.length > 0 && criticalErrors\.every\(e => e\.step === "load_items"\);/.test(app),
      "5a \"nothing was changed\" is said only when the server stopped at load_items");
    t.ok(/criticalErrors\.length \|\| resp\?\.deleted === false/.test(app), "5b a response with deleted:false is a failure even with no listed step");
  }

  t.summary("deleteAccountFn.test");
})();
