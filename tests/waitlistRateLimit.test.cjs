// tests/waitlistRateLimit.test.cjs
// -----------------------------------------------------------------------------
// THE WAITLIST IS METERED LIKE SIGNUP (audit 2026-10-26, H3).
//
// join_waitlist had no rate limit, and every insert takes a founding number at once: 34 scripted signups could
// take every remaining spot for good. It now asks the same gate as signup (_lib/signupLimit.js), against a real
// counting store here, through the REAL beta.js handler with fetch stubbed:
//   1  five joins an hour from one machine; the sixth is a 429, and it never reaches the database (no number)
//   2  a join refused by the cheap checks (a bad address) does not use up an attempt
//   3  the counter unavailable: refused (fails closed, as signup does)
//   4  each welcome email sent counts against that inbox, as signup's mail does
// -----------------------------------------------------------------------------
"use strict";
// The emails refuse to send a "[WORDS: id]" placeholder (2026-10-29): sample words stand in (tests/_sampleWords.cjs).
require("./_sampleWords.cjs").useSampleWords();
const { create } = require("./_runner.cjs");
const path = require("path");

const REPO = path.join(__dirname, "..");
const BETA_PATH = require.resolve("../netlify/functions/beta.js");
const BLOBS_PATH = require.resolve("@netlify/blobs", { paths: [path.join(REPO, "netlify", "functions")] });
const { CONSENT_VERSION } = require("../netlify/functions/_lib/waitlistConsent.js");

// A counting in-memory store, shared across calls (the limiter's own keys and windows).
function countingBlobs(state) {
  const d = new Map();
  return { getStore: () => {
    if (state.down) throw new Error("blobs unavailable (test)");
    return { async get(k, o) { const v = d.has(k) ? d.get(k) : null; return v && o && o.type === "json" ? JSON.parse(JSON.stringify(v)) : v; },
      async setJSON(k, v) { d.set(k, v); }, async delete(k) { d.delete(k); }, async list() { return { blobs: [...d.keys()].map((key) => ({ key })) }; } };
  }, _d: d };
}

(async () => {
  const t = create();
  const saved = { ...process.env };
  Object.assign(process.env, { SUPABASE_URL: "https://stub.supabase.invalid", SUPABASE_SECRET_KEY: "stub", LIMITER_HASH_SECRET: "test-limiter-secret", RESEND_API_KEY: "re_TESTONLY_notreal" });
  const state = { down: false };
  const blobs = countingBlobs(state);
  require.cache[BLOBS_PATH] = { id: BLOBS_PATH, filename: BLOBS_PATH, loaded: true, exports: blobs };
  delete require.cache[BETA_PATH];
  const { handler } = require(BETA_PATH);
  const inserts = [], mails = [];
  const realFetch = global.fetch;
  const quiet = { e: console.error, l: console.log, w: console.warn };
  console.error = console.log = console.warn = () => {};
  global.fetch = async (url, opts = {}) => {
    const u = String(url);
    const json = (s, b) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json", "content-range": "0-0/3" } });
    if (u.includes("/rest/v1/waitlist") && opts.method === "POST") { inserts.push(u); return json(201, [{ id: "row-" + inserts.length, founding_position: inserts.length }]); }
    if (u.includes("api.resend.com")) { mails.push(u); return json(200, { id: "email_1" }); }
    return json(200, []);
  };
  const join = (email, ip = "203.0.113.7") => handler({ httpMethod: "POST", headers: { origin: "https://flourishmoney.app", "x-nf-client-connection-ip": ip },
    body: JSON.stringify({ action: "join_waitlist", email, placement: "hero", consentVersion: CONSENT_VERSION }) });
  try {
    // ── 1. Five an hour from one machine ──────────────────────────────────────────────────────────
    {
      const codes = [];
      for (let i = 1; i <= 5; i++) codes.push((await join(`person${i}@example.invalid`)).statusCode);
      const before = inserts.length;
      const sixth = await join("person6@example.invalid");
      t.eq(codes, [200, 200, 200, 200, 200], "1a five joins from one machine in an hour go through");
      t.eq([sixth.statusCode, JSON.parse(sixth.body).error], [429, "rate_limited"], "1b the sixth is refused (429 rate_limited)");
      t.eq(inserts.length, before, "1c …before the database is asked: no row, so no founding number is taken");
      t.eq((await join("person7@example.invalid", "198.51.100.9")).statusCode, 200, "1d another machine is not affected");
    }
    // ── 2. The cheap checks come first ────────────────────────────────────────────────────────────
    {
      const ip = "192.0.2.44";
      for (let i = 0; i < 6; i++) await join("not-an-email", ip);
      t.eq((await join("real@example.invalid", ip)).statusCode, 200, "2a six joins refused for a bad address used up no attempt");
    }
    // ── 3. Fails closed ───────────────────────────────────────────────────────────────────────────
    {
      state.down = true;
      const before = inserts.length;
      const r = await join("down@example.invalid", "192.0.2.99");
      state.down = false;
      t.eq([r.statusCode, inserts.length], [429, before], "3a the counter unavailable: refused, and nothing is stored (as signup)");
    }
    // ── 4. Welcome emails count against the inbox ─────────────────────────────────────────────────
    {
      const { subjectKey } = require("../netlify/functions/_lib/limiterKeys.js");
      const rec = blobs._d.get(subjectKey("email", "person1@example.invalid", "test-limiter-secret"));
      t.ok(mails.length > 0 && rec && rec.n === 1, `4a each welcome email sent is counted for its inbox (${mails.length} sent; person1's counter ${rec ? rec.n : "none"})`);
    }
  } finally {
    global.fetch = realFetch; Object.assign(console, { error: quiet.e, log: quiet.l, warn: quiet.w });
    delete require.cache[BLOBS_PATH]; delete require.cache[BETA_PATH];
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  }
  t.summary("waitlistRateLimit");
})();
