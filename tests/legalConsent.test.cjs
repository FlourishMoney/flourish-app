// tests/legalConsent.test.cjs
// -----------------------------------------------------------------------------
// THE CONSENT STEP IS RECORDED AGAINST THE ACCOUNT (1.1.7, approved words 2026-11-12).
//   1  the words: the app's two lines are the approved ones, word for word, and the server's copy is the same
//   2  the step: the Terms and the Privacy Policy are each tappable on it, before Get started; Get started records it
//   3  the server (beta.js record_consent): the server's own words for the id, both documents' dates, when, where, once;
//      a send that is not one is refused (400); a database that cannot take it yet answers 503 so the app sends it again
//   4  the app (lib/legalConsent.js): kept on the device at once; sent with the dates the pages show; kept on a failure and
//      sent again with the same time; dropped only when the server refuses it as malformed
//   5  the documents' dates are the pages' own
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");

const REPO = path.join(__dirname, "..");
const AUTH_PATH = require.resolve("../netlify/functions/_lib/auth.js");
const BETA_PATH = require.resolve("../netlify/functions/beta.js");
const BLOBS_PATH = require.resolve("@netlify/blobs");
const L = require("../netlify/functions/_lib/legalConsent.js");
const USER = "00000000-0000-4000-8000-0000000000c1";
const APPROVED_TITLE = "Before you start";
const APPROVED_LINE = "By tapping Get started, you agree to the Terms and the Privacy Policy, including how flourish collects and uses your information.";

async function record(body, { signedIn = true, origin = "capacitor://localhost", upsertError = null } = {}) {
  const writes = [];
  const saved = { ...process.env };
  for (const k of [AUTH_PATH, BETA_PATH, BLOBS_PATH]) delete require.cache[k];
  require.cache[BLOBS_PATH] = { id: BLOBS_PATH, filename: BLOBS_PATH, loaded: true, exports: { getStore: () => ({ async get() { return null; }, async setJSON() {} }) } };
  require.cache[AUTH_PATH] = { id: AUTH_PATH, filename: AUTH_PATH, loaded: true, exports: {
    getUserFromRequest: async () => ({ user_id: signedIn ? USER : null }),
    getAdminClient: () => ({ from: (table) => ({ upsert: async (row, opts) => { writes.push({ table, row, opts }); return { error: upsertError }; } }) }),
    getPublicClient: () => ({}),
  } };
  const quiet = console.error, quietLog = console.log; console.error = () => {}; console.log = () => {};
  try {
    process.env.SUPABASE_URL = "https://supabase.test.invalid"; process.env.SUPABASE_SECRET_KEY = "test-secret-not-real";
    const res = await require(BETA_PATH).handler({ httpMethod: "POST", headers: { origin, authorization: "Bearer x" }, body: JSON.stringify({ action: "record_consent", ...body }) });
    return { status: res.statusCode, body: JSON.parse(res.body || "{}"), writes };
  } finally {
    console.error = quiet; console.log = quietLog;
    for (const k of [AUTH_PATH, BETA_PATH, BLOBS_PATH]) delete require.cache[k];
    process.env = saved;
  }
}

(async () => {
  const t = create();
  const { FIRST_RUN_WORDS: W } = await import(path.join(REPO, "src", "lib", "firstRunWords.js"));
  const C = await import(path.join(REPO, "src", "lib", "legalConsent.js"));
  const APP = fs.readFileSync(path.join(REPO, "src", "App.jsx"), "utf8");

  // ── 1. The words ────────────────────────────────────────────────────────────────────────────
  t.eq([W.consentTitle, W.consentLine, W.getStarted], [APPROVED_TITLE, APPROVED_LINE, "Get started"], "1a the app's consent step uses the approved words, word for word");
  t.eq(L.CONSENTS[C.CONSENT_ID], { title: W.consentTitle, line: W.consentLine, button: W.getStarted }, "1b the server's copy for the app's consent id is the same words");
  t.ok(new RegExp(`\\| \`onboarding-consent-title\` \\| [^|]+ \\| ${APPROVED_TITLE} \\|`).test(fs.readFileSync(path.join(REPO, "docs", "product", "FIRST-RUN-117-WORDS.md"), "utf8")) &&
    !/\[WORDS:/.test(fs.readFileSync(path.join(REPO, "docs", "product", "FIRST-RUN-117-WORDS.md"), "utf8")), "1c FIRST-RUN-117-WORDS.md lists the approved lines, no placeholder");

  // ── 2. The step ─────────────────────────────────────────────────────────────────────────────
  {
    const at = APP.indexOf("<div data-onboarding-consent=\"\"");
    const step = APP.slice(at, APP.indexOf("// 1: Bank Connection", at));
    const terms = step.indexOf('data-consent-legal="terms" onClick={()=>onViewLegal&&onViewLegal("terms")}');
    const privacy = step.indexOf('data-consent-legal="privacy" onClick={()=>onViewLegal&&onViewLegal("privacy")}');
    const accept = step.indexOf("data-consent-accept=");
    t.ok(terms > 0 && privacy > terms && accept > privacy, "2a the Terms and the Privacy Policy are each a button on the step, before Get started");
    t.ok(/minHeight:LAYOUT\.minTap[^>]*>Terms<\/button>/.test(step) && /minHeight:LAYOUT\.minTap[^>]*>Privacy Policy<\/button>/.test(step), "2b …each a full-size tap target");
    t.ok(/data-consent-accept="" onClick=\{\(\)=>\{ try\{ onConsent&&onConsent\(\); \}catch\{[^}]*\} done\("welcome",1\); \}\}[^>]*>\{FIRST_RUN_WORDS\.getStarted\}<\/button>/.test(step),
      "2c Get started records the consent, then goes on (the record never holds the step)");
    t.ok(/<Onboarding key="before"[\s\S]{0,1800}onConsent=\{\(\)=>\{ recordLegalConsent\(consentDeps\(user\?\.id\)\); \}\}/.test(APP), "2d the app records it for the signed-in account");
    t.ok(/useEffect\(\(\) => \{\s*if \(!user\?\.id\) return;\s*flushLegalConsent\(consentDeps\(user\.id\)\);/.test(APP), "2e one not yet sent goes on the next launch");
    t.ok(/if\(screen==="terms"\)return[^\n]*<TermsOfService/.test(APP) && /if\(screen==="privacy"\)return[^\n]*<PrivacyPolicy/.test(APP) && /onViewLegal=\{s=>setScreen\(s\)\}/.test(APP),
      "2f the buttons open the pages themselves");
  }

  // ── 3. The server ───────────────────────────────────────────────────────────────────────────
  const now = Date.now();
  const good = { consent_id: C.CONSENT_ID, terms_version: "2026-10-14", privacy_version: "2026-10-26", shown_at: new Date(now - 60000).toISOString() };
  {
    const r = await record({ ...good, words: { title: "something else" } });
    t.eq([r.status, r.body], [200, { recorded: true }], "3a recorded");
    const w = r.writes[0];
    t.eq([r.writes.length, w.table, w.opts], [1, "legal_consents", { onConflict: "user_id,consent_id", ignoreDuplicates: true }], "3b one row in legal_consents, once per account per consent");
    t.eq([w.row.user_id, w.row.consent_id, w.row.words, w.row.terms_version, w.row.privacy_version, w.row.shown_at, w.row.platform],
      [USER, C.CONSENT_ID, { title: APPROVED_TITLE, line: APPROVED_LINE, button: "Get started" }, "2026-10-14", "2026-10-26", good.shown_at, "ios"],
      "3c against the account: the server's own words (never the app's), both documents' dates, when it was tapped, the platform");
    t.ok(Math.abs(Date.parse(w.row.recorded_at) - Date.now()) < 5000, "3d …and when the server wrote it");
    t.eq((await record(good, { origin: "https://localhost" })).writes[0].row.platform, "android", "3e Android");
    t.eq((await record(good, { origin: "https://flourishmoney.app" })).writes[0].row.platform, "web", "3f the website");
  }
  for (const [label, b] of [["an unknown consent id", { ...good, consent_id: "something-else" }], ["no Terms date", { ...good, terms_version: undefined }],
    ["a Privacy date that is not a date", { ...good, privacy_version: "2026-02-31" }], ["a Terms date in another shape", { ...good, terms_version: "October 14, 2026" }]]) {
    const r = await record(b);
    t.eq([r.status, r.writes.length], [400, 0], `3g ${label}: refused, nothing written`);
  }
  {
    const future = await record({ ...good, shown_at: new Date(now + 3600 * 1000).toISOString() });
    t.ok(Math.abs(Date.parse(future.writes[0].row.shown_at) - Date.now()) < 5000, "3h a time in the future is not taken: the server's time instead");
    const old = await record({ ...good, shown_at: "2020-01-01T00:00:00Z" });
    t.ok(Math.abs(Date.parse(old.writes[0].row.shown_at) - Date.now()) < 5000, "3i nor one from long ago");
    const kept = await record({ ...good, shown_at: new Date(now - 3 * 86400 * 1000).toISOString() });
    t.eq(kept.writes[0].row.shown_at, new Date(now - 3 * 86400 * 1000).toISOString(), "3j a send tried again days later keeps the time Get started was tapped");
    const down = await record(good, { upsertError: { message: "relation legal_consents does not exist" } });
    t.eq(down.status, 503, "3k the table is not there yet (0049 not run): 503, so the app keeps it and sends it again");
    t.eq((await record(good, { signedIn: false })).status, 401, "3l signed out: refused");
  }

  // ── 4. The app ──────────────────────────────────────────────────────────────────────────────
  const store = () => { const m = new Map(); return { m, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
  const api = (answer) => { const sent = []; const fetchImpl = async (url, init) => {
    if (String(url).endsWith("/api/newsletter")) return { ok: true, json: async () => answer.policyDate ? { open: false, policyDate: answer.policyDate } : { open: false } };
    if (String(url).endsWith("/api/trial-plan-first")) return answer.tpf ? { ok: true, status: 200, json: async () => ({ on: true, since: answer.tpf }) } : { ok: false, status: 404, json: async () => ({}) };
    sent.push(JSON.parse(init.body)); if (answer.fail) throw new Error("offline"); return { ok: answer.status === 200, status: answer.status };
  }; return { sent, fetchImpl }; };
  const KEY = `flourish_consent_pending:${USER}`;
  {
    const s = store(); const a = api({ status: 200 });
    const tap = Date.UTC(2026, 10, 12, 20, 0, 0);
    t.eq(await C.recordLegalConsent({ uid: USER, storage: s, getJwt: async () => "jwt", fetchImpl: a.fetchImpl, apiBase: "", now: tap }), "recorded", "4a Get started: recorded");
    t.eq(a.sent, [{ action: "record_consent", consent_id: C.CONSENT_ID, shown_at: new Date(tap).toISOString(), terms_version: "2026-10-14", privacy_version: "2026-10-26" }],
      "4b sent with the consent id, when, and the dates the pages show (today's: October 14 and October 26, 2026)");
    t.eq(s.m.has(KEY), false, "4c nothing left on the device once recorded");
  }
  {
    const s = store(); const down = api({ status: 503 });
    const tap = Date.UTC(2026, 10, 12, 20, 0, 0);
    t.eq(await C.recordLegalConsent({ uid: USER, storage: s, getJwt: async () => "jwt", fetchImpl: down.fetchImpl, now: tap }), "kept", "4d the server cannot take it: kept on the device");
    const off = api({ fail: true });
    t.eq(await C.flushLegalConsent({ uid: USER, storage: s, getJwt: async () => "jwt", fetchImpl: off.fetchImpl }), "kept", "4e offline: still kept");
    const up = api({ status: 200, policyDate: "2026-12-01" });
    t.eq(await C.flushLegalConsent({ uid: USER, storage: s, getJwt: async () => "jwt", fetchImpl: up.fetchImpl }), "recorded", "4f the next launch: recorded");
    t.eq([up.sent[0].shown_at, up.sent[0].privacy_version], [new Date(tap).toISOString(), "2026-10-26"], "4g …with the time Get started was tapped and the dates as they were then, not the newer policy");
    const bad = store(); bad.setItem(KEY, JSON.stringify({ consent_id: C.CONSENT_ID, shown_at: "x", terms_version: "2026-10-14", privacy_version: "2026-10-26" }));
    t.eq(await C.flushLegalConsent({ uid: USER, storage: bad, getJwt: async () => "jwt", fetchImpl: api({ status: 400 }).fetchImpl }), "dropped", "4h refused as malformed: dropped, not sent forever");
    t.eq(await C.flushLegalConsent({ uid: USER, storage: store(), getJwt: async () => "jwt", fetchImpl: api({ status: 200 }).fetchImpl }), "recorded", "4i nothing kept: nothing sent");
    const s2 = store();
    t.eq(await C.recordLegalConsent({ uid: USER, storage: s2, getJwt: async () => null, fetchImpl: api({ status: 200 }).fetchImpl }), "kept", "4j not signed in yet: kept");
    let threw = false; try { await C.recordLegalConsent({ uid: USER, storage: { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); }, removeItem() {} }, getJwt: async () => "j", fetchImpl: api({ status: 200 }).fetchImpl }); } catch { threw = true; }
    t.eq(threw, false, "4k storage blocked: never throws");
  }
  {
    const since = "2026-11-20T15:00:00.000Z";
    const local = new Date(since); const iso = `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, "0")}-${String(local.getDate()).padStart(2, "0")}`;
    t.eq(await C.currentLegalVersions({ fetchImpl: api({ tpf: since, policyDate: "2026-11-15" }).fetchImpl, termsDatedBySwitch: true }), { terms_version: iso, privacy_version: "2026-11-15" },
      "4l with trial plan first on and the newsletter live: the Terms' section 7 date and the policy's new date, as the pages show");
    t.eq(await C.currentLegalVersions({ fetchImpl: api({ tpf: since }).fetchImpl, termsDatedBySwitch: false }), { terms_version: "2026-10-14", privacy_version: "2026-10-26" },
      "4m a store build that does not sell: the Terms keep their own date, as the page does");
    t.eq(await C.currentLegalVersions({ fetchImpl: async () => { throw new Error("offline"); }, termsDatedBySwitch: true }), { terms_version: "2026-10-14", privacy_version: "2026-10-26" },
      "4n no answer: the pages' own fallback dates");
    t.ok(/termsDatedBySwitch: !isNativeApp\(\) \|\| storeBillingBuild\(\)/.test(APP) && /const tpfTerms = \(!isNativeApp\(\) \|\| storeBillingBuild\(\)\) \? trialFirstTermsSection7\(tpfSince\) : null;/.test(APP),
      "4o the record dates the Terms where the Terms page does");
  }

  // ── 5. The pages' own dates ─────────────────────────────────────────────────────────────────
  {
    const { policyDateLabel } = await import(path.join(REPO, "src", "lib", "privacyLaunchWords.js"));
    const terms = (APP.match(/const last = tpfTerms \? chargeDateLabel\(new Date\(tpfSince\)\) : "([^"]+)";/) || [])[1];
    const privacy = (APP.match(/const last=launchLabel\|\|"([^"]+)";/) || [])[1];
    t.eq([policyDateLabel(C.TERMS_BASE_DATE), policyDateLabel(C.PRIVACY_BASE_DATE)], [terms, privacy], "5a the Terms' and the Privacy Policy's own dates are the ones recorded");
  }

  t.summary("legalConsent.test");
})();
