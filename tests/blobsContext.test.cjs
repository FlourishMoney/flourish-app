// tests/blobsContext.test.cjs
// -----------------------------------------------------------------------------
// NETLIFY BLOBS IN THE LAMBDA-STYLE FUNCTIONS (incident 2026-10-20: every signup refused).
//
//   1  without the event's context, getStore throws exactly what production logged, and the signup limiter
//      then refuses every attempt (its fail-closed rule): this is the incident, reproduced;
//   2  connectBlobs(event) reads the context Netlify puts on the event, and getStore then works: the real
//      signup limiter, against a local stand-in for the Blobs service, allows a first attempt;
//   3  connectBlobs never throws, whatever the event;
//   4  every function that uses getStore calls connectBlobs(event) first in its handler.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");
const http = require("http");

const FN = path.join(__dirname, "..", "netlify", "functions");
const clearContext = () => { delete process.env.NETLIFY_BLOBS_CONTEXT; delete globalThis.netlifyBlobsContext; };

(async () => {
  const t = create();
  const savedEnv = process.env.NETLIFY_BLOBS_CONTEXT;
  const { getStore } = require("@netlify/blobs");
  const { connectBlobs } = require("../netlify/functions/_lib/blobsContext.js");
  const { checkSignupLimit, TOO_MANY_MESSAGE } = require("../netlify/functions/_lib/signupLimit.js");

  // ── 1. The incident ───────────────────────────────────────────────────────────────────────────
  clearContext();
  let thrown = "";
  try { getStore("signup_attempts"); } catch (e) { thrown = e.message; }
  t.ok(/The environment has not been configured to use Netlify Blobs/.test(thrown), "1a no context: getStore throws what production logged");
  let store = null; try { store = getStore("signup_attempts"); } catch { store = null; }
  const refused = await checkSignupLimit({ store, ip: "203.0.113.7", email: "someone@example.com" });
  t.eq([refused.allowed, refused.reason, refused.message], [false, "store_unavailable", TOO_MANY_MESSAGE], "1b …so the limiter refuses a first attempt with \"Too many attempts\"");

  // ── 2. With the event's context ───────────────────────────────────────────────────────────────
  const seen = [];
  const server = http.createServer((req, res) => {
    seen.push(`${req.method} ${req.url.split("?")[0]} ${req.headers.authorization || ""}`);
    if (req.method === "GET") { res.statusCode = 404; return res.end(); }
    let body = ""; req.on("data", (c) => (body += c)); req.on("end", () => { res.statusCode = 200; res.end(); });
  });
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  const url = `http://127.0.0.1:${server.address().port}`;
  try {
    const event = { headers: { "x-nf-site-id": "site-test", "x-nf-deploy-id": "deploy-test" }, blobs: Buffer.from(JSON.stringify({ url, token: "tok-test" })).toString("base64") };
    clearContext();
    connectBlobs(event);
    let s2 = null, err2 = "";
    try { s2 = getStore("signup_attempts"); } catch (e) { err2 = e.message; }
    t.eq([!!s2, err2], [true, ""], "2a after connectBlobs(event), getStore works");
    const ok = await checkSignupLimit({ store: s2, ip: "203.0.113.7", email: "someone@example.com", secret: "test-limiter-secret-not-real" });
    t.eq([ok.allowed, ok.reason], [true, null], "2b …and the real limiter allows a first attempt");
    t.ok(seen.some((x) => /^GET .*signup_attempts.* Bearer tok-test$/.test(x)) && seen.some((x) => /^PUT .*signup_attempts/.test(x)),
      `2c …reading and writing the counter in the store, with the event's token (${seen.length} requests)`);
  } finally {
    server.close();
  }

  // ── 3. Never throws ───────────────────────────────────────────────────────────────────────────
  clearContext();
  const tries = [undefined, null, {}, { headers: {} }, { blobs: "" }, { blobs: "not-base64-json", headers: {} }, { blobs: 42 }];
  t.eq(tries.map((e) => { try { connectBlobs(e); return "ok"; } catch { return "threw"; } }), tries.map(() => "ok"), "3a connectBlobs never throws, whatever the event");
  t.ok(!process.env.NETLIFY_BLOBS_CONTEXT, "3b …and a bad or missing context leaves the environment as it was");

  // ── 4. Every function that uses getStore connects first ───────────────────────────────────────
  const users = fs.readdirSync(FN).filter((f) => f.endsWith(".js") && /getStore\(|require\("@netlify\/blobs"\)/.test(fs.readFileSync(path.join(FN, f), "utf8")));
  t.eq(users.sort(), ["beta.js", "billing.js", "coach.js", "limiter-cleanup.js"], "4a (the functions that use Netlify Blobs)");
  for (const f of users) {
    const src = fs.readFileSync(path.join(FN, f), "utf8");
    t.ok(/require\("\.\/_lib\/blobsContext"\)/.test(src) && /exports\.handler = async \(event\) => \{\n  connectBlobs\(event\);/.test(src), `4b ${f}: its handler calls connectBlobs(event) before anything else`);
  }

  if (savedEnv === undefined) delete process.env.NETLIFY_BLOBS_CONTEXT; else process.env.NETLIFY_BLOBS_CONTEXT = savedEnv;
  t.summary("blobsContext.test");
})();
