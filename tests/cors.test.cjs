// tests/cors.test.cjs
// -----------------------------------------------------------------------------
// EVERY FUNCTION ANSWERS THE SAME SET OF ORIGINS.
//
// Five functions each carried their own copy of the allow-list, and they drifted: the Android shell's
// origin was added to beta.js so open signup could work, and coach, plaid, billing and meeting still
// refused it (KNOWN-DEFECTS 35). The list lives in _lib/cors.js now. This pins both halves: the list
// itself, and that every function is actually using it rather than a copy that looks like it.
//
// The Android origin is https://localhost because Capacitor 8 defaults androidScheme to "https" and
// capacitor.config.json does not override it, which tests/nativeParity.test.cjs states independently.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");

const FUNCTIONS = ["beta", "coach", "plaid", "billing", "meeting"];

const IOS = "capacitor://localhost";
const ANDROID = "https://localhost";
const WEB = "https://flourishmoney.app";

(async () => {
  const { corsHeadersFor, isAllowedOrigin, ALLOWED_ORIGINS, PRODUCTION_ORIGIN } = require("../netlify/functions/_lib/cors.js");
  const t = create();
  const REPO = path.join(__dirname, "..");

  // ── 1. The list ───────────────────────────────────────────────────────────────────────────────
  {
    t.eq([...ALLOWED_ORIGINS].sort(), [
      "capacitor://localhost", "http://localhost:5173", "http://localhost:8888",
      "https://flourishmoney.app", "https://localhost",
    ], "the allow-list is the site, the two store shells and the two dev servers, and nothing else");
    t.eq(PRODUCTION_ORIGIN, "https://flourishmoney.app", "the fallback is the production origin");

    for (const [label, o] of [["the site", WEB], ["the iOS shell", IOS], ["the Android shell", ANDROID],
                              ["vite dev", "http://localhost:5173"], ["netlify dev", "http://localhost:8888"]]) {
      t.eq(isAllowedOrigin(o), true, `${label} (${o}) is allowed`);
    }

    // Still strict: no wildcard, no pattern, no subdomain or scheme slippage, nothing reflected.
    for (const o of [
      "https://evil.example", "http://flourishmoney.app", "https://flourishmoney.app.evil.example",
      "https://sub.flourishmoney.app", "https://localhost:1234", "http://localhost", "capacitor://evil",
      "https://localhost/", "HTTPS://LOCALHOST", "null", "*", "", undefined, null,
    ]) {
      t.eq(isAllowedOrigin(o), false, `${JSON.stringify(o)} is refused`);
    }
    const src = fs.readFileSync(path.join(REPO, "netlify", "functions", "_lib", "cors.js"), "utf8");
    t.ok(!/[*]/.test(src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "")), "no wildcard anywhere in the code");
    t.ok(!/startsWith|endsWith|includes\(|RegExp|test\(/.test(src), "…and no prefix, suffix or pattern matching: exact strings only");
  }

  // ── 2. The headers ────────────────────────────────────────────────────────────────────────────
  {
    for (const [label, o] of [["the site", WEB], ["the iOS shell", IOS], ["the Android shell", ANDROID]]) {
      const h = corsHeadersFor({ headers: { origin: o } });
      t.eq(h["Access-Control-Allow-Origin"], o, `${label} is echoed back, so the browser accepts the response`);
    }
    t.eq(corsHeadersFor({ headers: { Origin: ANDROID } })["Access-Control-Allow-Origin"], ANDROID, "a capitalised Origin header works too");
    // An unknown origin gets production, which does not match the caller: the browser blocks it.
    for (const o of ["https://evil.example", "", "null"]) {
      t.eq(corsHeadersFor({ headers: { origin: o } })["Access-Control-Allow-Origin"], WEB,
           `an unknown origin (${JSON.stringify(o)}) is answered with production, which cannot match it`);
    }
    t.eq(corsHeadersFor({})["Access-Control-Allow-Origin"], WEB, "no headers at all is handled");
    t.eq(corsHeadersFor()["Access-Control-Allow-Origin"], WEB, "no event at all is handled");
    const h = corsHeadersFor({ headers: { origin: WEB } });
    t.eq(h["Access-Control-Allow-Methods"], "POST, OPTIONS", "the methods are unchanged");
    t.eq(h["Access-Control-Allow-Headers"], "Content-Type, Authorization", "the allowed headers are unchanged");
    t.ok(!("Access-Control-Allow-Credentials" in h), "credentials are still not allowed");
  }

  // ── 3. Every function uses it, and none keeps a copy ──────────────────────────────────────────
  {
    for (const f of FUNCTIONS) {
      const src = fs.readFileSync(path.join(REPO, "netlify", "functions", `${f}.js`), "utf8");
      t.ok(/require\("\.\/_lib\/cors"\)/.test(src), `${f}.js requires the shared allow-list`);
      t.ok(!/new Set\(\[\s*\n?\s*"https:\/\/flourishmoney\.app"/.test(src), `${f}.js keeps no copy of the list`);
      t.ok(!/function corsHeadersFor/.test(src), `${f}.js keeps no copy of corsHeadersFor`);
      t.ok(/corsHeadersFor\(event\)/.test(src), `${f}.js still builds its headers per request`);
    }
    // And nothing else in the functions directory defines its own.
    const dir = path.join(REPO, "netlify", "functions");
    const strays = fs.readdirSync(dir).filter(f => f.endsWith(".js"))
      .filter(f => /ALLOWED_ORIGINS = new Set/.test(fs.readFileSync(path.join(dir, f), "utf8")));
    t.eq(strays, [], "no function declares its own ALLOWED_ORIGINS");
  }

  // ── 4. Each function, run for real, answers the three origins ─────────────────────────────────
  // A request with no token: every one of these answers 401/405/404 rather than doing any work, which
  // is exactly what is wanted here — the assertion is about the CORS header on the way out.
  {
    const savedFetch = global.fetch;
    const savedEnv = { ...process.env };
    global.fetch = async () => { throw new Error("network blocked in test"); };
    process.env.SUPABASE_URL = "https://supabase.test.invalid";
    process.env.SUPABASE_SECRET_KEY = "test-secret-not-real";
    process.env.SUPABASE_ANON_KEY = "test-anon-not-real";
    try {
      for (const f of FUNCTIONS) {
        const p = require.resolve(`../netlify/functions/${f}.js`);
        delete require.cache[p];
        const mod = require(p);
        for (const [label, o] of [["iOS", IOS], ["Android", ANDROID], ["web", WEB]]) {
          const res = await mod.handler({ httpMethod: "OPTIONS", headers: { origin: o }, body: "" });
          t.eq(res.headers["Access-Control-Allow-Origin"], o, `${f}.js answers a preflight from ${label} with its own origin`);
        }
        const bad = await mod.handler({ httpMethod: "OPTIONS", headers: { origin: "https://evil.example" }, body: "" });
        t.eq(bad.headers["Access-Control-Allow-Origin"], WEB, `${f}.js refuses an unknown origin by answering production`);
        delete require.cache[p];
      }
    } finally {
      global.fetch = savedFetch;
      process.env = savedEnv;
    }
  }

  t.summary("cors.test");
})();
