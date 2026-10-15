// tests/waitlistCount.test.cjs
// -----------------------------------------------------------------------------
// /api/beta action "waitlist_count" (2026-10-15): how many households are on the waitlist, and nothing
// else. The default "count" action counts AUTH ACCOUNTS (beta cap), and /api/founding answers founding
// spots left, so neither gave this number.
//   1. One PostgREST HEAD with count=exact, of the rows that are not test rows: no row is read.
//   2. The answer is {waitlistCount: N} and nothing else: no address, no row, no other field.
//   3. Anything that is not a count it read is a 503 with no number.
// Runs the REAL beta.js handler with global fetch stubbed.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const path = require("path");
const BETA = path.join(__dirname, "..", "netlify", "functions", "beta.js");

async function run(supabase = { range: "0-0/41" }, body = { action: "waitlist_count" }) {
  const calls = []; const realFetch = global.fetch; const realErr = console.error, realLog = console.log;
  process.env.SUPABASE_URL = "https://example.supabase.co"; process.env.SUPABASE_SECRET_KEY = "test-service-role";
  global.fetch = async (url, o = {}) => {
    calls.push({ url: String(url), method: o.method || "GET", headers: o.headers || {} });
    if (supabase.throws) throw Object.assign(new Error("x"), { name: supabase.throws });
    return { ok: !supabase.status || supabase.status < 300, status: supabase.status || 200,
      headers: { get: (h) => (h.toLowerCase() === "content-range" ? (supabase.range === undefined ? null : supabase.range) : null) },
      json: async () => { throw new Error("no body may be read"); }, text: async () => "" };
  };
  console.error = () => {}; console.log = () => {};
  let res;
  try {
    delete require.cache[require.resolve(BETA)];
    res = await require(BETA).handler({ httpMethod: "POST", headers: { origin: "https://flourishmoney.app" }, body: JSON.stringify(body) });
  } finally { global.fetch = realFetch; console.error = realErr; console.log = realLog; }
  let parsed = null; try { parsed = JSON.parse(res.body); } catch {}
  return { res, body: parsed, calls };
}

(async () => {
  const t = create();
  const ok = await run();
  t.eq([ok.res.statusCode, JSON.stringify(ok.body)], [200, '{"waitlistCount":41}'], "1a 41 waitlist rows that are not test rows: {waitlistCount: 41}, and that is the whole answer");
  const reads = ok.calls.filter(c => c.url.includes("/rest/v1/"));
  t.eq(reads.length, 1, "1b one database read");
  t.ok(reads[0].method === "HEAD" && reads[0].headers.Prefer === "count=exact", "1c …a HEAD with count=exact, so no row comes back");
  t.ok(/\/rest\/v1\/waitlist\?select=id&is_test=is\.false$/.test(reads[0].url), "1d …of the waitlist rows not marked is_test");
  t.ok(!/@|email|name/i.test(ok.res.body), "2a no address, name or row in the answer");
  for (const [why, sb] of [["Supabase 500", { status: 500 }], ["no count header", { range: undefined }], ["a timeout", { throws: "AbortError" }], ["a network failure", { throws: "TypeError" }]]) {
    const r = await run(sb);
    t.eq([r.res.statusCode, JSON.stringify(r.body)], [503, '{"error":"unavailable"}'], `3a ${why}: 503 unavailable, no number`);
  }
  // The default action still counts accounts, unchanged.
  const def = await run({ range: "0-0/7" }, {});
  t.ok(def.calls.some(c => c.url.includes("/auth/v1/admin/users")) && !def.calls.some(c => c.url.includes("/rest/v1/waitlist")), "3b the default count is unchanged: it still counts accounts, not the waitlist");
  t.summary("waitlistCount.test");
  setImmediate(() => process.exit(process.exitCode || 0));
})();
