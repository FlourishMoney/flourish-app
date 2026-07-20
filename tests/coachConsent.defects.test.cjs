// tests/coachConsent.defects.test.cjs
// -----------------------------------------------------------------------------
// CONSENT-GATE CONTRACT for netlify/functions/coach.js.
//
// This file originally demonstrated the defect (FINDING 4): the gate read only revoked_at, so a user
// who never granted consent — and a user with no profiles row — reached Anthropic. It now encodes the
// FIXED contract, which draws the distinction the old gate collapsed:
//
//   "we couldn't check"            (read error / thrown query)         → FAIL OPEN  (reaches Anthropic)
//   "we checked, no consent on file" (missing row / consent_at null / revoked) → BLOCK 403
//   "we checked, consent on file"  (consent_at set, no later revoke)   → ALLOW      (reaches Anthropic)
//
// Fail-open-on-error is a deliberate availability tradeoff: a transient DB blip must not take AI down
// for everyone. It is NOT the same as "checked and found no consent", which must block.
//
// NO NETWORK, NO CREDENTIALS:
//   * @supabase/supabase-js is replaced in the require cache BEFORE _lib/auth.js loads.
//   * @netlify/blobs is replaced (coach.js requires it at module load for the per-IP backstop).
//   * global.fetch is replaced with a recorder that NEVER performs I/O. Any egress to a non-stubbed
//     host throws, so a real request cannot pass silently.
"use strict";

const path = require("path");
const assert = require("assert");

const FN_DIR = path.resolve(__dirname, "../netlify/functions");
const FN = path.join(FN_DIR, "coach.js");

const USER_ID = "11111111-2222-3333-4444-555555555555";
const GRANT = "2026-01-01T00:00:00Z";        // an affirmative consent timestamp
const REVOKE_AFTER = "2026-07-01T00:00:00Z";  // a revoke that post-dates the grant

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
      // The consent gate's read.
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
// expect: "block" → must NOT reach Anthropic (403);  "allow" → MUST reach Anthropic.
const results = [];
async function check(name, sc, type, expect) {
  scenario = sc;
  anthropicCalled = false;
  lastOutboundUrl = null;
  const res = await handler(evt(bodyFor(type)));
  let error = null;
  try {
    if (expect === "block") {
      assert.strictEqual(anthropicCalled, false,
        `gate should have BLOCKED this request, but user data reached api.anthropic.com ` +
        `(handler returned ${res.statusCode})`);
      assert.strictEqual(res.statusCode, 403, `expected a 403 consent block, got ${res.statusCode}`);
    } else {
      assert.strictEqual(anthropicCalled, true,
        `gate should have ALLOWED this request (fail-open / consented), but nothing reached Anthropic ` +
        `(handler returned ${res.statusCode})`);
    }
  } catch (e) { error = e; }
  results.push({ name, type, expect, status: res.statusCode, anthropicCalled, error });
  console.log(`${error ? "FAIL" : "PASS"}  [${type}] ${name}`);
  console.log(`        expect=${expect}  status=${res.statusCode}  anthropicCalled=${anthropicCalled}  outbound=${lastOutboundUrl || "(none)"}`);
  if (error) console.log(`        AssertionError: ${error.message}`);
}

(async () => {
  console.log("\n=== coach.js consent gate — contract ===");
  console.log("Reaches api.anthropic.com ONLY when consent is confirmed, or when the check could not be performed.\n");

  // ---- HARNESS SANITY CHECKS ----
  console.log("--- harness sanity ---");

  // S1: negative control. A CONFIRMED revoke must block. If this ever fails, the stub never reaches
  // the gate and nothing below is trustworthy.
  await check("S1 (negative control) CONFIRMED revoke -> must block",
    { profileRow: { ai_third_party_consent_at: GRANT, ai_third_party_consent_revoked_at: REVOKE_AFTER } },
    "chat", "block");

  // S2: positive control for the recorder. A genuine grant (consent_at set, no revoke) proves
  // anthropicCalled CAN flip to true, so a "false" reading elsewhere means "not called", not "recorder
  // broken". NOTE: under the OLD gate this control used a bare {revoked_at: null} row with no
  // consent_at; that now correctly BLOCKS, so the control must carry a real grant to be reachable.
  await check("S2 (positive control) genuine grant -> recorder observes Anthropic",
    { profileRow: { ai_third_party_consent_at: GRANT, ai_third_party_consent_revoked_at: null } },
    "chat", "allow");

  // ---- (a) COULD NOT CHECK -> fail open (deliberate availability tradeoff) ----
  console.log("\n--- (a) consent read could not be performed -> fail OPEN ---");
  await check("a1 consent read returns an ERROR (cErr truthy) -> fail open",
    { profileRow: null, consentReadError: { message: "db read failed" } }, "chat", "allow");
  await check("a2 consent read THROWS -> fail open",
    { throwOnConsentRead: true }, "chat", "allow");
  await check("a3 consent read THROWS, unmetered type -> fail open",
    { throwOnConsentRead: true }, "insights", "allow");
  await check("a4 consent read returns an ERROR, unmetered type -> fail open",
    { profileRow: null, consentReadError: { message: "db read failed" } }, "document", "allow");

  // ---- (b) CHECKED, NO CONSENT ON FILE -> block (this is the fix) ----
  console.log("\n--- (b) successful read, no affirmative consent -> BLOCK ---");

  // Never granted: consent_at NULL, revoked_at NULL. The old gate read only revoked_at, so this was
  // indistinguishable from a grant.
  await check("b1 never granted: consent_at NULL + revoked_at NULL -> block",
    { profileRow: { ai_third_party_consent_at: null, ai_third_party_consent_revoked_at: null } }, "chat", "block");

  // No profiles row at all: maybeSingle() returns data:null.
  await check("b2 no profiles row at all (prof === null) -> block",
    { profileRow: null }, "chat", "block");

  await check("b3 never granted, unmetered type -> block",
    { profileRow: { ai_third_party_consent_at: null, ai_third_party_consent_revoked_at: null } }, "document", "block");

  // "plan" shares the chat branch; same gate.
  await check("b4 never granted, type=plan -> block",
    { profileRow: { ai_third_party_consent_at: null, ai_third_party_consent_revoked_at: null } }, "plan", "block");

  // ---- (c) CHECKED, CONSENT ON FILE -> allow ----
  console.log("\n--- (c) successful read, affirmative consent -> ALLOW ---");
  await check("c1 granted, never revoked -> allow",
    { profileRow: { ai_third_party_consent_at: GRANT, ai_third_party_consent_revoked_at: null } }, "chat", "allow");

  // Re-consent: a grant that post-dates an earlier revoke is live again (accept clears revoked_at, but
  // the timestamp comparison holds even if a stale revoke lingers).
  await check("c2 re-granted after an earlier revoke -> allow",
    { profileRow: { ai_third_party_consent_at: "2026-08-01T00:00:00Z", ai_third_party_consent_revoked_at: REVOKE_AFTER } },
    "chat", "allow");

  // ---- summary ----
  const failed = results.filter(r => r.error);
  console.log(`\n=== SUMMARY: ${results.length - failed.length}/${results.length} assertions passed, ${failed.length} FAILED ===`);
  for (const f of failed) {
    console.log(`  FAILED  [${f.type}] ${f.name}  (expect=${f.expect}, status=${f.status}, anthropicCalled=${f.anthropicCalled})`);
  }
  console.log(failed.length
    ? "\nCONTRACT VIOLATED — see failures above.\n"
    : "\nConsent gate contract holds: affirmative consent required, fail-open only on unreadable check.\n");
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error("HARNESS ERROR:", e); process.exit(2); });
