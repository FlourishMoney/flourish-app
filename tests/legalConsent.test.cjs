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
  const { PRIVACY_117_DATE: P117, privacyDate } = await import(path.join(REPO, "src", "lib", "privacy117Words.js"));
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
    t.eq(w.row.recorded_at, good.shown_at, "3d …and, from an app that sends no agreed_at (before 1.1.7's policy), its shown_at as the tap");
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
    t.eq(a.sent, [{ action: "record_consent", consent_id: C.CONSENT_ID, shown_at: new Date(tap).toISOString(), agreed_at: new Date(tap).toISOString(), terms_version: "2026-10-14", privacy_version: P117 }],
      "4b sent with the consent id, when, and the dates the pages show (today's: October 14, 2026 and the 1.1.7 date)");
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
    t.eq([up.sent[0].shown_at, up.sent[0].privacy_version], [new Date(tap).toISOString(), P117], "4g …with the time Get started was tapped and the dates as they were then, not the newer policy");
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
    t.eq(await C.currentLegalVersions({ fetchImpl: api({ tpf: since, policyDate: "2026-12-15" }).fetchImpl, termsDatedBySwitch: true }), { terms_version: iso, privacy_version: "2026-12-15" },
      "4l with trial plan first on and the newsletter live: the Terms' section 7 date and the policy's new date, as the pages show");
    t.eq(await C.currentLegalVersions({ fetchImpl: api({ tpf: since }).fetchImpl, termsDatedBySwitch: false }), { terms_version: "2026-10-14", privacy_version: P117 },
      "4m a store build that does not sell: the Terms keep their own date, as the page does");
    t.eq(await C.currentLegalVersions({ fetchImpl: async () => { throw new Error("offline"); }, termsDatedBySwitch: true }), { terms_version: "2026-10-14", privacy_version: P117 },
      "4n no answer: the pages' own fallback dates");
    t.ok(/termsDatedBySwitch: !isNativeApp\(\) \|\| storeBillingBuild\(\)/.test(APP) && /const tpfTerms = \(!isNativeApp\(\) \|\| storeBillingBuild\(\)\) \? trialFirstTermsSection7\(tpfSince\) : null;/.test(APP),
      "4o the record dates the Terms where the Terms page does");
  }

  // ── 5. The pages' own dates ─────────────────────────────────────────────────────────────────
  {
    const { policyDateLabel } = await import(path.join(REPO, "src", "lib", "privacyLaunchWords.js"));
    const terms = (APP.match(/const last = tpfTerms \? chargeDateLabel\(new Date\(tpfSince\)\) : "([^"]+)";/) || [])[1];
    t.eq(policyDateLabel(C.TERMS_BASE_DATE), terms, "5a the Terms' own date is the one recorded");
    t.ok(/const last=policyDateLabel\(privacyVersion\(launchDate\|\|fetchedDate, native\?null:GIFT_LEGAL_DATE\)\);/.test(APP) && C.PRIVACY_BASE_DATE === P117 &&
      [undefined, null, "", "x", "2026-11-07", P117, "2027-01-05"].every((d) => C.privacyVersion(d) === privacyDate(d)),
      "5a the Privacy Policy's date is the one recorded: the page and the record both take privacyVersion (privacyDate of the newsletter date, with no gift date)");
    // The gift words (Terms' Gifts section, Privacy Policy's Gifts entry, approved 2026-11-20) date both pages on the website only.
    const RET = fs.readFileSync(path.join(REPO, "src", "lib", "giftReturn.js"), "utf8");
    const GIFT = (/export const GIFT_LEGAL_DATE = NATIVE_BUILD \? null : "(\d{4}-\d{2}-\d{2})";/.exec(RET) || [])[1];
    t.ok(!!GIFT && new Date(`${GIFT}T00:00:00Z`).toISOString().slice(0, 10) === GIFT && GIFT >= P117 && GIFT > C.TERMS_BASE_DATE,
      `5b the gift words' day (lib/giftReturn.js GIFT_LEGAL_DATE ${GIFT}) is a real date, no earlier than either page's own; null in a native build`);
    t.eq([C.privacyVersion(null, GIFT), C.privacyVersion("2027-01-05", GIFT), C.privacyVersion(null, null), C.privacyVersion(null, "soon")], [GIFT, "2027-01-05", P117, P117],
      "5c the Privacy Policy with the gift date: the later of it and the page's own (a later newsletter date still wins); none, or not a date: the page's own");
    const laterSwitch = "2027-02-03T15:00:00Z";
    t.eq([C.termsVersion(null, false, GIFT), C.termsVersion(null, true, GIFT), C.termsVersion(laterSwitch, true, GIFT), C.termsVersion(null, false, null)],
      [GIFT, GIFT, C.termsVersion(laterSwitch, true), "2026-10-14"], "5d the Terms with the gift date: the later of it and the page's own (a later switch date still wins); none: the page's own");
    t.eq(await C.currentLegalVersions({ fetchImpl: async () => { throw new Error("offline"); }, termsDatedBySwitch: true, giftDate: GIFT }), { terms_version: GIFT, privacy_version: GIFT },
      "5e the record on the website, no answer: both pages' gift date");
    t.ok(/giftDate: isNativeApp\(\) \? null : GIFT_LEGAL_DATE,/.test(APP) && /const giftDay = isNativeApp\(\) \? null : GIFT_LEGAL_DATE;/.test(APP) &&
      /const lastShown = giftDay && withGiftDate\(termsVersion\(tpfTerms \? tpfSince : null, true\), giftDay\) === giftDay \? policyDateLabel\(giftDay\) : last;/.test(APP) &&
      APP.includes("Terms of Service</div>\n          <div style={{...s,fontSize:13,color:C.muted}}>Last updated {lastShown}</div>"),
      "5f the record, the Terms page and the Privacy Policy take the gift date in the same place: on the website, never in a store app");
  }

  // ── 6. When the step was shown, and when Get started was tapped (Privacy Policy 1.1.7: "when those words were shown,
  //       when your agreement was recorded") ────────────────────────────────────────────────────────────────────
  {
    const U2 = "00000000-0000-4000-8000-0000000000c2", K2 = `flourish_consent_pending:${U2}`;
    const shown = Date.UTC(2026, 10, 20, 14, 0, 0), tap = shown + 95 * 1000;
    t.eq(C.markConsentShown(U2, shown), new Date(shown).toISOString(), "6a the step on screen: its time is kept");
    t.eq(C.markConsentShown(U2, shown + 30000), new Date(shown).toISOString(), "6b shown again in the same run (back from the Terms or the Privacy Policy): the first time stays");
    const s = store(); const a = api({ status: 200 });
    t.eq(await C.recordLegalConsent({ uid: U2, storage: s, getJwt: async () => "jwt", fetchImpl: a.fetchImpl, now: tap }), "recorded", "6c Get started: recorded");
    t.eq([a.sent[0].shown_at, a.sent[0].agreed_at], [new Date(shown).toISOString(), new Date(tap).toISOString()], "6d sent: when the step appeared, and when Get started was tapped");
    t.ok(Date.parse(a.sent[0].shown_at) <= Date.parse(a.sent[0].agreed_at), "6e shown_at is not after the tap");
    // Closing the app ends the run: a fresh copy of the module (a new launch) knows no earlier time.
    const C2 = await import(path.join(REPO, "src", "lib", "legalConsent.js") + "?run=2");
    const again = shown + 86400 * 1000, tap2 = again + 20000;
    C2.markConsentShown(U2, again);
    const s2 = store(); const b = api({ status: 200 });
    await C2.recordLegalConsent({ uid: U2, storage: s2, getJwt: async () => "jwt", fetchImpl: b.fetchImpl, now: tap2 });
    t.eq([b.sent[0].shown_at, b.sent[0].agreed_at], [new Date(again).toISOString(), new Date(tap2).toISOString()], "6f the app was closed in between: the time the step was shown again");
    const U3 = "00000000-0000-4000-8000-0000000000c3";
    C.markConsentShown(U3, tap + 60000);
    const c = api({ status: 200 });
    await C.recordLegalConsent({ uid: U3, storage: store(), getJwt: async () => "jwt", fetchImpl: c.fetchImpl, now: tap });
    t.eq(c.sent[0].shown_at, c.sent[0].agreed_at, "6g a clock that moved back: shown_at is the tap, never after it");
    const d = api({ status: 503 }); const s3 = store();
    C.markConsentShown(U2, shown); await C.recordLegalConsent({ uid: U2, storage: s3, getJwt: async () => "jwt", fetchImpl: d.fetchImpl, now: tap });
    const kept = JSON.parse(s3.getItem(K2) || "{}");
    t.eq([kept.shown_at, kept.agreed_at], [new Date(shown).toISOString(), new Date(tap).toISOString()], "6h not sent yet: both times kept on the device for the next launch");
    t.ok(/const done=\(name,next\)=>\{[^\n]*\n[^\n]*\n  useEffect\(\(\)=>\{ if\(step===0&&!after\) markConsentShown\(userId\); \},\[step,userId,after\]\);/.test(APP),
      "6i the consent step marks its time whenever it is on screen");
  }
  {
    const n = Date.now();
    const both = { ...good, shown_at: new Date(n - 120000).toISOString(), agreed_at: new Date(n - 60000).toISOString() };
    const r1 = (await record(both)).writes[0].row;
    t.eq([r1.shown_at, r1.recorded_at], [both.shown_at, both.agreed_at], "6j the server keeps both: shown_at, and recorded_at is the tap");
    const late = (await record({ ...good, shown_at: new Date(n - 1000).toISOString(), agreed_at: new Date(n - 60000).toISOString() })).writes[0].row;
    t.eq(late.shown_at, late.recorded_at, "6k a shown_at after the tap is taken as the tap");
    const oldApp = (await record(good)).writes[0].row;
    const future = (await record({ ...good, agreed_at: new Date(n + 3600 * 1000).toISOString() })).writes[0].row;
    const stale = (await record({ ...good, agreed_at: "2020-01-01T00:00:00Z", shown_at: "2020-01-01T00:00:00Z" })).writes[0].row;
    t.ok(Math.abs(Date.parse(future.recorded_at) - Date.now()) < 5000 && Math.abs(Date.parse(stale.recorded_at) - Date.now()) < 5000, "6l a tap time in the future or from long ago is not taken: the server's time");
    t.ok([r1, late, oldApp, future, stale].every((w) => Date.parse(w.shown_at) <= Date.parse(w.recorded_at)), "6m every record: shown_at before or equal to recorded_at");
    const retried = { ...good, shown_at: new Date(n - 3 * 86400 * 1000).toISOString() };
    const kept = (await record(retried)).writes[0].row;
    t.eq([kept.shown_at, kept.recorded_at], [retried.shown_at, retried.shown_at], "6n an older build's record sent days later: recorded_at is its tap, not the retry");
  }

  t.summary("legalConsent.test");
})();
