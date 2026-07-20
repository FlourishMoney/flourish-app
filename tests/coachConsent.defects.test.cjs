// tests/coachConsent.defects.test.cjs
// FINDING 4 — DEFECT DEMONSTRATION for netlify/functions/coach.js consent gate (lines 145-161).
//
// Claim under test: "server-enforced consent GATE — block ALL AI paths if consent was revoked".
// Each assertion below states what a correct consent gate MUST do: NOT call Anthropic unless the
// server has POSITIVELY CONFIRMED the user granted consent. Assertions that FAIL are the defects.
//
// NO NETWORK, NO CREDENTIALS:
//   * @supabase/supabase-js is replaced in the require cache BEFORE _lib/auth.js loads, so the real
//     auth.js (real getAdminClient, real env reads, real _admin caching) executes against a stub.
//   * @netlify/blobs is replaced (coach.js requires it at module load for the per-IP backstop).
//   * global.fetch is replaced with a recorder that NEVER performs I/O. If anything tries to reach
//     a non-stubbed host the recorder throws, so a real egress attempt cannot pass silently.
"use strict";

const path = require("path");
const assert = require("assert");

const FN_DIR = path.resolve(__dirname, "../netlify/functions");
const FN = path.join(FN_DIR, "coach.js");

const USER_ID = "11111111-2222-3333-4444-555555555555";

// ── mutable scenario driving the stubbed profiles read ───────────────────────
let scenario = {};

// ── stub @supabase/supabase-js (resolved from the function dir, as auth.js sees it) ──
function makeQuery(columns) {
  const q = {
    select(cols) { return makeQuery(cols); },
    eq() { return q; },
    async maybeSingle() {
      // getUserPlan's read — keep it healthy so it never masks the consent gate.
      if (columns && columns.includes("plan")) {
        return { data: { plan: "plus", founder_flag: false, trial_started_at: null }, error: null };
      }
      // The consent gate's read (coach.js:150-154).
      if (scenario.throwOnConsentRead) throw new Error("boom: supabase unreachable");
      return { data: scenario.profileRow ?? null, error: scenario.consentReadError ?? null };
    },
    update() { return q; },
    then(res) { return Promise.resolve({ data: null, error: null }).then(res); },
  };
  return q;
}

const supabaseId = require.resolve("@supabase/supabase-js", { paths: [FN_DIR] });
require.cache[supabaseId] = {
  id: supabaseId, filename: supabaseId, loaded: true, paths: [],
  exports: {
    createClient: () => ({
      auth: { getUser: async () => ({ data: { user: { id: USER_ID } }, error: null }) },
      from: () => makeQuery(null),
      rpc: async () => ({ data: 1, error: null }), // usage counter healthy
    }),
  },
};

// ── stub @netlify/blobs ──────────────────────────────────────────────────────
const blobsId = require.resolve("@netlify/blobs", { paths: [FN_DIR] });
require.cache[blobsId] = {
  id: blobsId, filename: blobsId, loaded: true, paths: [],
  exports: { getStore: () => ({ get: async () => ({ n: 0 }), setJSON: async () => {} }) },
};

// ── env the REAL auth.js reads inside getAdminClient() (lazy, at call time) ──
process.env.SUPABASE_URL = "https://stub.invalid";
process.env.SUPABASE_SECRET_KEY = "stub-secret-not-real";
process.env.ANTHROPIC_API_KEY = "stub-key-not-real";

const { handler } = require(FN);

// ── fetch recorder: records, never transmits ─────────────────────────────────
let anthropicCalled = false;
let lastOutboundUrl = null;
global.fetch = async (url) => {
  lastOutboundUrl = String(url);
  if (lastOutboundUrl.startsWith("https://api.anthropic.com")) {
    anthropicCalled = true;
    return {
      ok: true, status: 200,
      json: async () => ({ content: [{ type: "text", text: "stub" }], stop_reason: "end_turn", usage: { output_tokens: 1 } }),
    };
  }
  throw new Error(`UNSTUBBED EGRESS ATTEMPT: ${lastOutboundUrl}`);
};

function evt(body) {
  return {
    httpMethod: "POST",
    headers: { origin: "https://flourishmoney.app", authorization: "Bearer stub-jwt" },
    body: JSON.stringify(body),
  };
}

function bodyFor(type) {
  return type === "chat" || type === "plan"
    ? { type, payload: { messages: [{ role: "user", content: "hi" }], context: "balance: $100" } }
    : { type, payload: { prompt: "explain this" } };
}

// ── runner ───────────────────────────────────────────────────────────────────
const results = [];
async function check(name, sc, type) {
  scenario = sc;
  anthropicCalled = false;
  lastOutboundUrl = null;
  const res = await handler(evt(bodyFor(type)));
  let error = null;
  try {
    assert.strictEqual(
      anthropicCalled, false,
      `consent gate should have blocked this request, but user data was sent to api.anthropic.com ` +
      `(handler returned ${res.statusCode})`
    );
  } catch (e) { error = e; }
  results.push({ name, type, status: res.statusCode, anthropicCalled, error });
  console.log(`${error ? "FAIL" : "PASS"}  [${type}] ${name}`);
  console.log(`        status=${res.statusCode}  anthropicCalled=${anthropicCalled}  outbound=${lastOutboundUrl || "(none)"}`);
  if (error) console.log(`        AssertionError: ${error.message}`);
}

(async () => {
  console.log("\n=== FINDING 4 — coach.js consent gate, defect demonstration ===");
  console.log("Assertion for every case: NO request reaches api.anthropic.com without CONFIRMED consent.\n");

  // ---- HARNESS SANITY CHECKS (must behave as stated, or nothing below is trustworthy) ----
  console.log("--- harness sanity ---");

  // S1: negative control. A CONFIRMED revoke is the one thing the gate does enforce.
  // This assertion MUST pass; if it fails, the stub never reaches the gate at all.
  await check("S1 (negative control) CONFIRMED revoke -> must block",
    { profileRow: { ai_third_party_consent_revoked_at: "2026-07-01T00:00:00Z" } }, "chat");

  // S2: positive control for the recorder. Prove anthropicCalled CAN flip to true, so a
  // "false" reading elsewhere means "not called" and not "recorder is broken".
  scenario = { profileRow: { ai_third_party_consent_revoked_at: null } };
  anthropicCalled = false;
  await handler(evt(bodyFor("chat")));
  assert.strictEqual(anthropicCalled, true,
    "HARNESS BROKEN: recorder never observed a call to api.anthropic.com on the known-reachable path");
  console.log("PASS  S2 (positive control) recorder observed api.anthropic.com on a known-reachable path\n");

  // ---- (a) CONSENT READ FAILS -> gate fails OPEN, request still reaches Anthropic ----
  console.log("--- (a) consent read failure still reaches Anthropic ---");

  // coach.js:155 -> `if (cErr) console.error(...)` then falls through. No return.
  await check("a1 consent read returns an ERROR (cErr truthy) -> must not send data",
    { profileRow: null, consentReadError: { message: "db read failed" } }, "chat");

  // coach.js:159-161 -> catch logs and falls through. No return.
  await check("a2 consent read THROWS -> must not send data",
    { throwOnConsentRead: true }, "chat");

  // Non-chat types have no rate-limit branch, so the consent gate is the only control.
  await check("a3 consent read THROWS, unmetered type -> must not send data",
    { throwOnConsentRead: true }, "insights");
  await check("a4 consent read returns an ERROR, unmetered type -> must not send data",
    { profileRow: null, consentReadError: { message: "db read failed" } }, "document");

  // ---- (b) USER NEVER GRANTED CONSENT -> not blocked ----
  console.log("\n--- (b) user who never granted consent is not blocked ---");

  // coach.js:156 only checks revoked_at. consent_at is never read, so "never granted"
  // (consent_at NULL, revoked_at NULL) is indistinguishable from "granted".
  await check("b1 never granted: consent_at NULL + revoked_at NULL -> must not send data",
    { profileRow: { ai_third_party_consent_at: null, ai_third_party_consent_revoked_at: null } }, "chat");

  // maybeSingle() returns data:null when no profiles row exists. prof is null ->
  // `prof && ...` short-circuits false -> falls through.
  await check("b2 no profiles row at all (prof === null) -> must not send data",
    { profileRow: null }, "chat");

  await check("b3 never granted, unmetered type -> must not send data",
    { profileRow: { ai_third_party_consent_at: null, ai_third_party_consent_revoked_at: null } }, "document");

  // "plan" shares the chat branch; same gate.
  await check("b4 never granted, type=plan -> must not send data",
    { profileRow: { ai_third_party_consent_at: null, ai_third_party_consent_revoked_at: null } }, "plan");

  // ---- summary ----
  const failed = results.filter(r => r.error);
  console.log(`\n=== SUMMARY: ${results.length - failed.length}/${results.length} assertions passed, ${failed.length} FAILED ===`);
  for (const f of failed) {
    console.log(`  FAILED  [${f.type}] ${f.name}  (status=${f.status}, data sent to Anthropic)`);
  }
  console.log(
    failed.length
      ? "\nDEFECT CONFIRMED: the consent gate does not prevent user data from reaching Anthropic\n" +
        "in the cases above. It only blocks a CONFIRMED revoked_at timestamp.\n"
      : "\nNo defect reproduced.\n"
  );
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error("HARNESS ERROR:", e); process.exit(2); });
