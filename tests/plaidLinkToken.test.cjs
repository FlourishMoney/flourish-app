// tests/plaidLinkToken.test.cjs
// -----------------------------------------------------------------------------
// PLAID LINK TOKENS AND THE FAILED-LINK COUNT (2026-11-11).
//   1  every link token names its country and redirect address. Update mode (reconnecting a bank whose sign-in ran
//      out, ITEM_LOGIN_REQUIRED) had neither, and Plaid answered 400 MISSING_FIELDS country_codes, so a bank could
//      never be reconnected (Plaid logs, Scotiabank, Nov 10). The stand-in Plaid below refuses a token without
//      country_codes, as Plaid does.
//   2  a failed link is counted with its platform (ios, android, web) and Plaid's error code from a fixed list;
//      never Plaid's message, never an id. Until migration 0047 widens the table's check, the count falls back to
//      today's empty detail.
// Synthetic data only; nothing leaves the machine.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");

const REPO = path.join(__dirname, "..");
const SUPA_PATH = require.resolve("@supabase/supabase-js", { paths: [path.join(REPO, "netlify", "functions")] });
const PLAID_PATH = require.resolve("../netlify/functions/plaid.js");
const AUTH_PATH = require.resolve("../netlify/functions/_lib/auth.js");
const ACT_PATH = require.resolve("../netlify/functions/activation.js");

// A stand-in service-role client that knows one bank row for the signed-in account.
function fakeSupabase() {
  const from = (table) => {
    const filters = [];
    const answer = () => (table === "plaid_items" && filters.some(([k, v]) => k === "item_id" && v === "item-scotia")
      ? { data: { access_token: "access-production-test", status: "login_required" }, error: null } : { data: null, error: null });
    const api = {
      select() { return api; }, eq(k, v) { filters.push([k, v]); return api; }, in() { return api; }, order() { return api; }, limit() { return api; },
      single: async () => answer(), maybeSingle: async () => answer(),
      then(res, rej) { return Promise.resolve({ data: [], error: null }).then(res, rej); },
    };
    return api;
  };
  return { from, rpc: async () => ({ data: null, error: null }), auth: { admin: {} } };
}

// plaid.js's real create_link_token against the stand-in database and a stand-in Plaid that checks what Plaid checks.
async function linkToken(body) {
  const saved = { ...process.env };
  Object.assign(process.env, { SUPABASE_URL: "https://example.supabase.test", SUPABASE_SECRET_KEY: "test-service-role", PLAID_CLIENT_ID: "test-client", PLAID_SECRET: "test-secret", PLAID_ENV: "sandbox" });
  require.cache[SUPA_PATH] = { id: SUPA_PATH, filename: SUPA_PATH, loaded: true, exports: { createClient: () => fakeSupabase() } };
  delete require.cache[AUTH_PATH]; delete require.cache[PLAID_PATH];
  const auth = require(AUTH_PATH);
  auth.getUserFromRequest = async () => ({ user_id: "u-owner", error: null });
  const handler = require(PLAID_PATH).handler;
  const realFetch = global.fetch; const sent = [];
  global.fetch = async (url, init) => {
    const u = String(url);
    if (!/plaid\.com/.test(u)) throw new Error("network blocked in test: " + u);
    const req = JSON.parse(init.body || "{}"); sent.push({ ep: u.replace(/^https:\/\/[^/]+/, ""), req });
    const missing = ["client_name", "language", "country_codes", "user"].filter((k) => req[k] == null || (Array.isArray(req[k]) && !req[k].length));
    const json = missing.length
      ? { error_type: "INVALID_REQUEST", error_code: "MISSING_FIELDS", error_message: `the following required fields are missing: ${missing.join(", ")}` }
      : { link_token: req.access_token ? "link-production-update" : "link-production-new" };
    const status = missing.length ? 400 : 200;
    return { ok: status === 200, status, json: async () => json, text: async () => JSON.stringify(json) };
  };
  const realErr = console.error; console.error = () => {};
  try {
    const res = await handler({ httpMethod: "POST", headers: { origin: "https://flourishmoney.app", authorization: "Bearer x" }, body: JSON.stringify({ action: "create_link_token", ...body }) });
    return { status: res.statusCode, body: JSON.parse(res.body || "{}"), sent: sent.filter((s) => s.ep === "/link/token/create").map((s) => s.req) };
  } finally {
    console.error = realErr; global.fetch = realFetch; process.env = saved;
    delete require.cache[PLAID_PATH]; delete require.cache[AUTH_PATH]; delete require.cache[SUPA_PATH];
  }
}

// activation.js's real handler, with the auth library replaced; rpc answers as the given function says.
async function activation(body, rpcAnswer) {
  const rpcs = [];
  const real = require(AUTH_PATH);
  const user = { id: "u1", email: "alex@example.ca", created_at: "2026-11-11T14:00:00Z" };
  require.cache[AUTH_PATH] = { id: AUTH_PATH, filename: AUTH_PATH, loaded: true, exports: { ...real,
    getUserFromRequest: async () => ({ user_id: user.id }),
    getAdminClient: () => ({ auth: { admin: { getUserById: async () => ({ data: { user }, error: null }) } },
      rpc: async (name, args) => { rpcs.push({ name, args }); return { data: null, error: rpcAnswer(args) }; } }),
  } };
  delete require.cache[ACT_PATH];
  const mod = require(ACT_PATH);
  const realErr = console.error; console.error = () => {};
  try {
    const res = await mod._test.handler({ httpMethod: "POST", headers: { origin: "https://flourishmoney.app", authorization: "Bearer x" }, body: JSON.stringify(body) }, {}, new Date("2026-11-11T14:05:00Z"));
    return { status: res.statusCode, rpcs: rpcs.filter((r) => r.name === "onboarding_bump").map((r) => r.args.p_detail) };
  } finally { console.error = realErr; delete require.cache[AUTH_PATH]; delete require.cache[ACT_PATH]; }
}

(async () => {
  const t = create();

  // ── 1. Link tokens ─────────────────────────────────────────────────────────────────────────────
  {
    const fresh = await linkToken({ country: "CA", user_id: "u-owner" });
    const update = await linkToken({ item_id: "item-scotia", country: "CA" });
    t.eq([fresh.status, fresh.body.link_token], [200, "link-production-new"], "1a a new connection's token: 200");
    t.eq([update.status, update.body.link_token], [200, "link-production-update"], "1b a reconnect (update mode, a bank needing a sign-in) gets its token: 200, not 400 MISSING_FIELDS");
    const u = update.sent[0] || {}, f = fresh.sent[0] || {};
    t.eq(u.country_codes, ["CA"], "1c …it names the country, CA");
    t.ok(!!u.redirect_uri && u.redirect_uri === f.redirect_uri, `1d …and the same redirect address as a new connection (${u.redirect_uri})`);
    t.ok(u.access_token === "access-production-test" && !u.products, "1e …for that bank's own item, with no products (update mode)");
    const us = await linkToken({ item_id: "item-scotia", country: "US" });
    t.eq([us.status, (us.sent[0] || {}).country_codes], [200, ["US"]], "1f a US household's reconnect names US, as its new connection does");
    const noCountry = await linkToken({ item_id: "item-scotia" });
    t.eq((noCountry.sent[0] || {}).country_codes, ["CA"], "1g no country sent: CA");
    const SRC = fs.readFileSync(PLAID_PATH, "utf8");
    const fnDir = path.join(REPO, "netlify", "functions");
    const sites = fs.readdirSync(fnDir, { recursive: true }).filter((f) => /\.js$/.test(f))
      .flatMap((f) => (fs.readFileSync(path.join(fnDir, f), "utf8").match(/["'`]\/link\/token\/create["'`]/g) || []).map(() => f));
    t.eq(sites, ["plaid.js"], "1h plaid.js is the only place that creates a link token");
    t.eq((SRC.match(/country_codes:\s*COUNTRY_CODES/g) || []).length, 2, "1i …and both its token bodies (new and update) carry the one country list");
  }

  // ── 2. The failed-link count ───────────────────────────────────────────────────────────────────
  {
    const S = require("../netlify/functions/_lib/onboardingCounts.js");
    const C = await import(path.join(REPO, "src", "lib", "onboardingCounts.js"));
    t.eq([C.LINK_PLATFORMS, C.LINK_FAIL_CODES], [S.LINK_PLATFORMS, S.LINK_FAIL_CODES], "2a the app and the server hold the same platforms and codes");
    t.ok(["INVALID_CREDENTIALS", "INVALID_MFA", "ITEM_LOCKED", "INSTITUTION_NOT_RESPONDING", "EXCHANGE_FAILED", "PLAN_LIMIT", "OTHER"].every((c) => S.LINK_FAIL_CODES.includes(c)),
      "2b …including the four Plaid errors seen since Oct 16 and ours");
    t.eq([C.linkFailDetail("ios", "INVALID_CREDENTIALS"), C.linkFailDetail("android", "item_locked"), C.linkFailDetail("web", "SOMETHING_NEW"),
      C.linkFailDetail(undefined, undefined), C.linkFailDetail("windows", "Your password is wrong, alex@example.ca")],
      ["ios:INVALID_CREDENTIALS", "android:ITEM_LOCKED", "web:OTHER", "web:OTHER", "web:OTHER"], "2c the app's detail: platform and code from the lists; anything else web / OTHER, never text");
    t.eq(S.onboardingRows({ metric: "bank_link_failed", detail: "ios:ITEM_LOCKED" }, "2026-11-11T14:00:00Z"), [{ event: "bank_link_failed", detail: "ios:ITEM_LOCKED", fallbackDetail: "" }],
      "2d the server keeps a valid detail, with today's empty detail to fall back on");
    t.eq([S.onboardingRows({ metric: "bank_link_failed", detail: "ios:alex@example.ca" }), S.onboardingRows({ metric: "bank_link_failed", detail: "mac:ITEM_LOCKED" }),
      S.onboardingRows({ metric: "bank_link_started", detail: "ios:ITEM_LOCKED" })[0].detail],
      [null, null, ""], "2e …refuses anything outside the lists, and other bank events keep no detail");
    t.eq(S.onboardingRows({ metric: "bank_link_failed" }), [{ event: "bank_link_failed", detail: "" }], "2f an older app (no detail) is counted as before");

    // The database refuses the detail until 0047 runs: counted once, with no detail.
    const before = await activation({ metric: "bank_link_failed", detail: "android:INVALID_MFA" }, (a) => (a.p_detail ? { code: "23514", message: "check_violation" } : null));
    t.eq([before.status, before.rpcs], [204, ["android:INVALID_MFA", ""]], "2g before 0047: the detail is refused, and the failure is still counted (empty detail)");
    const after = await activation({ metric: "bank_link_failed", detail: "android:INVALID_MFA" }, () => null);
    t.eq([after.status, after.rpcs], [204, ["android:INVALID_MFA"]], "2h after 0047: counted once, with its platform and code");
    const down = await activation({ metric: "bank_link_failed", detail: "android:INVALID_MFA" }, () => ({ code: "08006", message: "down" }));
    t.eq(down.status, 503, "2i any other database failure is still a retry later, never a guess");

    // 0047's check accepts exactly the server's shape.
    const sql = fs.readFileSync(path.join(REPO, "supabase", "migrations", "0047_bank_link_failed_detail.sql"), "utf8");
    const rx = new RegExp((sql.match(/detail ~ '(\^\(ios\|android\|web\):[^']+)'/) || [])[1] || "^$");
    t.ok(S.LINK_PLATFORMS.every((p) => S.LINK_FAIL_CODES.every((c) => rx.test(`${p}:${c}`))) && !rx.test("ios:alex@example.ca") && !rx.test("mac:ITEM_LOCKED"),
      "2j migration 0047 accepts every platform:code the server keeps, and nothing like an address");
    t.ok(/drop constraint if exists onboarding_counts_known/.test(sql) && /and detail = ''/.test(sql), "2k …keeps today's empty-detail rows valid, and is safe to run twice");

    // The app sends the detail with a failure only.
    const sentBodies = [];
    const store = new Map();
    const storage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
    const opts = (detail) => ({ detail, userId: "u1", storage, getSession: async () => ({ userId: "u1", jwt: "j" }),
      fetchImpl: async (_u, init) => { sentBodies.push(JSON.parse(init.body)); return { status: 204, ok: true }; } });
    await C.sendOnboardingCount("bank_link_failed", opts("ios:INVALID_CREDENTIALS"));
    await C.sendOnboardingCount("bank_link_failed", opts("ios:not a code"));
    await C.sendOnboardingCount("bank_link_cancelled", opts("ios:INVALID_CREDENTIALS"));
    t.eq(sentBodies, [{ metric: "bank_link_failed", detail: "ios:INVALID_CREDENTIALS" }, { metric: "bank_link_failed" }, { metric: "bank_link_cancelled" }],
      "2l the app sends a failure's platform and code, drops anything else, and sends nothing extra with other events");

    const APP = fs.readFileSync(path.join(REPO, "src", "App.jsx"), "utf8");
    t.ok(APP.includes('if (err) count("bank_link_failed", linkFailDetail(currentPlatform(), err.error_code)); else count("bank_link_cancelled");')
      && APP.includes('count("bank_link_failed", linkFailDetail(currentPlatform(), /plan_limit/.test(String(err?.message||"")) ? "PLAN_LIMIT" : "EXCHANGE_FAILED"));'),
      "2m onboarding counts Plaid's own failures with Plaid's code, and ours as EXCHANGE_FAILED or PLAN_LIMIT");
  }

  t.summary("plaidLinkToken.test");
  setImmediate(() => process.exit(process.exitCode || 0));
})();
