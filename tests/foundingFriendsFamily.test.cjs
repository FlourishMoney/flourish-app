// tests/foundingFriendsFamily.test.cjs
// -----------------------------------------------------------------------------
// FRIENDS AND FAMILY (Amanda, 2026-10-25: "It's okay to send those ones before Oct 1 the link. They are my friends
// and family."). CASL's personal and family relationship exemption, as she stated it.
//
// The real waitlist on 2026-10-25 (read-only counts): 11 real rows on consent version pre-2026-10-01, every one with a
// founding number; 4 newer holders (2026-10-01 and 2026-10-06); one real row created before Oct 1 on version
// 2026-10-06 with no number; 5 test rows. This runs the REAL founding-link sweep, every outside call stubbed, over
// those shapes plus the cases the rule must also get right:
//   1  the rule (_lib/waitlistConsent.js): a recorded personal relationship on a pre-2026-10-01 founding holder opens
//      the founding link email and nothing else, never the launch email; a basis that is incomplete opens nothing
//   2  the sweep, signup open: the 11 get the founding link email with their number, never the launch email; the 4
//      newer holders are unchanged; a pre-2026-10-01 row with no number gets the launch email only; the 2026-10-06
//      row with no number gets nothing (as today); test and unsubscribed rows get nothing
//   3  once ever: a second sweep sends nothing; nobody gets two founding emails; each send is recorded with its basis
//   4  signup shut: the 11 and the 4 still get their founding link email, and no launch email goes to anyone
//   5  every email keeps the CASL footer, the consent on record, the one-click unsubscribe and its headers, and the
//      Idempotency-Key per row
//   6  the server still needs a confirmed address and a ledger number before the founding price (unchanged)
// -----------------------------------------------------------------------------
"use strict";
// The emails refuse to send a "[WORDS: id]" placeholder (2026-10-29): sample words stand in (tests/_sampleWords.cjs).
const { sample: sampleWords } = require("./_sampleWords.cjs");
require("./_sampleWords.cjs").useSampleWords();
require("./_blobsStub.cjs").install(); // join_waitlist is metered (H3); this suite is not about the limiter
const { create } = require("./_runner.cjs");
const path = require("path");
const fs = require("fs");

const REPO = path.join(__dirname, "..");
const SWEEP = path.join(REPO, "netlify", "functions", "founding-link-sweep.js");
const C = require("../netlify/functions/_lib/waitlistConsent.js");
const E = require("../netlify/functions/_lib/foundingLinkEmail.js");
const LEGACY = C.LEGACY_CONSENT_VERSION;
const BASIS = { type: "personal_relationship", stated_by: "Amanda Holt", stated_at: "2026-10-25", note: "friends and family, per founder" };

function waitlist() {
  const rows = [];
  let n = 0;
  const add = (r) => rows.push({ id: `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`, is_test: false, unsubscribed_at: null, metadata: {}, ...r });
  for (let p = 1; p <= 11; p++) add({ email: `friend${p}@example.test`, consent_version: LEGACY, founding_position: p, metadata: { placement: "landing", consent_basis: { ...BASIS } } });
  add({ email: "newer12@example.test", consent_version: "2026-10-01", founding_position: 12 });
  add({ email: "newer13@example.test", consent_version: "2026-10-01", founding_position: 13 });
  add({ email: "newer14@example.test", consent_version: "2026-10-06", founding_position: 14 });
  add({ email: "newer15@example.test", consent_version: "2026-10-06", founding_position: 15 });
  add({ email: "early-no-number@example.test", consent_version: "2026-10-06", founding_position: null });             // the real one
  add({ email: "legacy-no-number@example.test", consent_version: LEGACY, founding_position: null });                 // the launch email's case
  add({ email: "legacy-holder-no-basis@example.test", consent_version: LEGACY, founding_position: 16 });              // basis never recorded
  add({ email: "friend-unsubscribed@example.test", consent_version: LEGACY, founding_position: 17, unsubscribed_at: "2026-10-20T00:00:00Z", metadata: { consent_basis: { ...BASIS } } });
  add({ email: "friend-test@example.test", consent_version: LEGACY, founding_position: null, is_test: true, metadata: { consent_basis: { ...BASIS } } });
  for (let i = 0; i < 5; i++) add({ email: `test${i}@example.test`, consent_version: "2026-10-06", founding_position: null, is_test: true });
  return rows;
}

// A fake of the PostgREST calls the sweep makes, applying its own query: the founding range or (signup open) the
// legacy version, real rows, not unsubscribed, the versions named, never sent, lowest number first, the limit.
function supabaseFake(rows) {
  const calls = [];
  const fetch = async (url, o = {}) => {
    const u = decodeURIComponent(String(url)), method = o.method || "GET";
    calls.push({ url: u, method, headers: o.headers || {}, body: o.body });
    if (u.includes("api.resend.com")) return { ok: true, status: 200, json: async () => ({}) };
    if (u.includes("/rpc/waitlist_founding_number_for_email")) {
      const e = JSON.parse(o.body).p_email;
      const r = rows.find((x) => x.email === e && !x.is_test);
      return { ok: true, status: 200, json: async () => (r ? r.founding_position : null) };
    }
    if (u.includes("sent_at=gte.")) {
      const since = Date.parse(u.match(/sent_at=gte\.([^&]+)/)[1]);
      const k = rows.filter((r) => r.metadata && r.metadata.founding_link && Date.parse(r.metadata.founding_link.sent_at) >= since).length;
      return { ok: true, status: 200, headers: { get: () => `*/${k}` }, json: async () => [] };
    }
    if (method === "PATCH") {
      const id = u.match(/id=eq\.([^&]+)/)[1];
      const r = rows.find((x) => x.id === id);
      if (r && !(r.metadata && r.metadata.founding_link)) r.metadata = JSON.parse(o.body).metadata;
      return { ok: true, status: 204, json: async () => ({}) };
    }
    if (u.includes("/rest/v1/waitlist?select=id,email,")) {
      const versions = (u.match(/&consent_version=in\.\(([^)]*)\)/) || [, ""])[1].split(",");
      const orLegacy = /&or=\(and\(founding_position\.gte\.1,founding_position\.lte\.50\),consent_version\.in\.\(([^)]*)\)\)/.exec(u);
      const ranged = /&founding_position=gte\.1&founding_position=lte\.50/.test(u);
      const limit = Number((u.match(/&limit=(\d+)/) || [, "1000"])[1]);
      const inRange = (r) => Number.isInteger(r.founding_position) && r.founding_position >= 1 && r.founding_position <= 50;
      const out = rows.filter((r) => (orLegacy ? (inRange(r) || orLegacy[1].split(",").includes(r.consent_version)) : ranged ? inRange(r) : true)
        && r.is_test === false && r.unsubscribed_at === null && versions.includes(r.consent_version) && !(r.metadata && r.metadata.founding_link))
        .sort((a, b) => (a.founding_position ?? 1e9) - (b.founding_position ?? 1e9)).slice(0, limit)
        .map((r) => JSON.parse(JSON.stringify(r)));
      return { ok: true, status: 200, json: async () => out };
    }
    return { ok: false, status: 599, json: async () => ({}) };
  };
  return { fetch, calls };
}

async function sweepUntilDone(rows, { open }) {
  const fake = supabaseFake(rows);
  const realFetch = global.fetch, quiet = { log: console.log, error: console.error };
  Object.assign(process.env, { SUPABASE_URL: "https://example.supabase.co", SUPABASE_SECRET_KEY: "test-secret-not-real", RESEND_API_KEY: "re_TESTONLY_notarealkey",
    BILLING_ENABLED: "true", FOUNDING_LINK_EMAIL: "true" });
  if (open) process.env.OPEN_SIGNUP = "true"; else delete process.env.OPEN_SIGNUP;
  delete process.env.WAITLIST_UNSUBSCRIBE_SECRET;
  global.fetch = fake.fetch;
  console.log = () => {}; console.error = () => {};
  const runs = [];
  try {
    for (let i = 0; i < 6; i++) {
      delete require.cache[require.resolve(SWEEP)];
      for (const k of Object.keys(require.cache)) if (k.includes(path.join("netlify", "functions", "_lib"))) delete require.cache[k];
      require("./_sampleWords.cjs").useSampleWords();
      runs.push(await require(SWEEP).runFoundingLinkSweep());
      if (runs[runs.length - 1].sent === 0) break;
    }
  } finally { global.fetch = realFetch; console.log = quiet.log; console.error = quiet.error; }
  const sends = fake.calls.filter((c) => c.url.includes("api.resend.com")).map((c) => ({ ...JSON.parse(c.body), _headers: c.headers }));
  return { runs, sends, calls: fake.calls };
}

(async () => {
  const t = create();

  // ── 1. The rule ────────────────────────────────────────────────────────────────────────────────
  {
    const friend = { consent_version: LEGACY, founding_position: 3, unsubscribed_at: null, metadata: { consent_basis: { ...BASIS } } };
    t.eq([C.foundingEmailKindFor(friend, { launched: true }), C.foundingEmailKindFor(friend, { launched: false })], ["founding_link", "founding_link"],
      "1a a pre-2026-10-01 founding holder with a recorded personal relationship: the founding link email, signup open or not");
    t.eq(["founding_link", "canada_launch", "welcome", "launch", "update", "founding_reminder"].map((k) => C.mayEmailWaitlistRow(friend, k)), [true, false, false, false, false, false],
      "1b …that email and nothing else: never the launch email, a welcome, an update or a reminder");
    t.eq(C.foundingLinkByRelationship(friend), true, "1c the rule reads the basis");
    for (const [why, b] of [["no stated_by", { ...BASIS, stated_by: "" }], ["no date", { ...BASIS, stated_at: "" }], ["another type", { ...BASIS, type: "implied" }], ["a string", "personal_relationship"], ["absent", undefined]]) {
      const r = { ...friend, metadata: b === undefined ? {} : { consent_basis: b } };
      t.eq([C.foundingEmailKindFor(r, { launched: true }), C.mayEmailWaitlistRow(r, "founding_link"), C.mayEmailWaitlistRow(r, "canada_launch")], ["canada_launch", false, true],
        `1d a basis that is not complete (${why}) opens nothing: the row keeps its launch email`);
    }
    t.eq(C.foundingEmailKindFor({ ...friend, founding_position: null }, { launched: true }), "canada_launch", "1e no founding number: the launch email, basis or not");
    t.eq([C.foundingEmailKindFor({ ...friend, consent_version: "2026-10-06", founding_position: null }, { launched: true })], ["founding_link"],
      "1f a newer version is unchanged by a basis (its own words already cover the founding email; the sweep needs a number)");
    t.eq([C.foundingEmailKindFor({ ...friend, unsubscribed_at: "2026-10-20T00:00:00Z" }, { launched: true }), C.mayEmailWaitlistRow({ ...friend, unsubscribed_at: "x" }, "founding_link")], [null, false],
      "1g unsubscribed: nothing, ever");
    t.eq(C.mayEmailWaitlistRow({ ...friend, metadata: { ...friend.metadata, founding_link: { sent_at: "2026-10-26T00:00:00Z" } } }, "founding_link"), false, "1h sent once: nothing more");
    t.eq(friend.consent_version, LEGACY, "1i the original consent version is never changed");
    process.env.SUPABASE_SECRET_KEY = "test-secret-not-real";   // the unsubscribe link is signed with it; no link, no email
    const payload = E.foundingLinkEmailPayload("friend3@example.test", { id: "00000000-0000-4000-8000-000000000003", is_test: false, ...friend }, { launched: true });
    t.eq(payload && payload.subject, E.SUBJECT, "1j the payload is the founding link email");
  }

  // ── 2 and 3. The sweep, signup open ─────────────────────────────────────────────────────────────
  {
    const rows = waitlist();
    const { sends, runs } = await sweepUntilDone(rows, { open: true });
    const to = (subject) => sends.filter((s) => s.subject === subject).map((s) => s.to[0]).sort();
    const friends = Array.from({ length: 11 }, (_, i) => `friend${i + 1}@example.test`).sort();
    const newer = ["newer12@example.test", "newer13@example.test", "newer14@example.test", "newer15@example.test"];
    t.eq(to(E.SUBJECT), [...friends, "newer12@example.test", "newer13@example.test", "newer14@example.test", "newer15@example.test"].sort(),
      "2a the founding link email: the 11 friends and family and the 4 newer holders, 15 in all");
    t.eq(to(E.LAUNCH_SUBJECT), ["legacy-holder-no-basis@example.test", "legacy-no-number@example.test"],
      "2b the launch email: only pre-2026-10-01 rows WITHOUT the recorded basis (none of the 11)");
    t.ok(friends.every((f) => !to(E.LAUNCH_SUBJECT).includes(f)), "2c none of the 11 ever gets the launch email (its \"we won't send you anything else\")");
    for (const [i, f] of friends.entries()) {
      const s = sends.find((x) => x.to[0] === f);
      const p = rows.find((r) => r.email === f).founding_position;
      t.ok(s && !s.text.includes(`#${p} of 50`) && s.text.includes(sampleWords("founding-email-position")) && s.text.includes(E.FOUNDING_GET_URL) && s.text.includes(E.FOUNDING_LINK_URL) && s.text.includes(E.FOUNDING_EMAIL_PRICE_LINE),
        `2d ${i + 1}: the founding email (no founding number named since 2026-10-29: the line is words to come), the device link, the website link and the price line`);
    }
    t.eq(sends.filter((s) => ["early-no-number@example.test", "friend-unsubscribed@example.test", "friend-test@example.test"].includes(s.to[0]) || /^test\d@/.test(s.to[0])).length, 0,
      "2e nothing to the 2026-10-06 row with no number (as today), the unsubscribed friend, or any test row");
    t.eq(newer.map((e) => sends.filter((s) => s.to[0] === e).map((s) => s.subject)), newer.map(() => [E.SUBJECT]), "2f the 4 newer holders: their founding email, unchanged");
    // once ever
    const counts = {};
    for (const s of sends) counts[s.to[0]] = (counts[s.to[0]] || 0) + 1;
    t.ok(Object.values(counts).every((c) => c === 1), "3a nobody gets two emails, of any kind");
    t.ok(runs.length >= 2 && runs[runs.length - 1].sent === 0 && runs.reduce((a, r) => a + r.sent, 0) === 17, `3b the runs send 17 in all, then nothing (${runs.map((r) => r.sent).join(", ")})`);
    const again = await sweepUntilDone(rows, { open: true });
    t.eq(again.sends.length, 0, "3c a later sweep sends nothing more");
    const rec = rows.find((r) => r.email === "friend3@example.test").metadata;
    t.eq([rec.founding_link.kind, rec.founding_link.consent_version, rec.founding_link.consent_basis, rec.consent_basis.type, rec.placement], ["founding_link", LEGACY, "personal_relationship", "personal_relationship", "landing"],
      "3d the send is recorded with the version and the basis it went out under; the row keeps its basis and its other metadata");
    t.eq(rows.find((r) => r.email === "newer12@example.test").metadata.founding_link.consent_basis, undefined, "3e a newer holder's record carries no basis (its own words covered it)");

    // ── 5. CASL on every email ────────────────────────────────────────────────────────────────────
    for (const s of sends) {
      const r = rows.find((x) => x.email === s.to[0]);
      const line = r.metadata.consent_basis ? "Consent on record: personal relationship (joined the waitlist before Oct 1, 2026)." : `Consent on record: version ${r.consent_version}.`;
      const ok = s.text.includes(E.WHY_LINE) && s.text.split("\n\n").includes(line) && E.CONTACT_BLOCK.every((l) => s.text.includes(l))
        && /Unsubscribe with one click: https:\/\/flourishmoney\.app\/api\/unsubscribe\?id=[^&]+&t=/.test(s.text)
        && s.headers && /<https:\/\/flourishmoney\.app\/api\/unsubscribe\?id=/.test(s.headers["List-Unsubscribe"]) && s.headers["List-Unsubscribe-Post"] === "List-Unsubscribe=One-Click"
        && /^founding-link\/[0-9a-f-]+$/.test(s._headers["Idempotency-Key"]);
      t.ok(ok, `5a ${s.subject} to row #${(sends.indexOf(s) + 1)}: footer, consent on record, one-click unsubscribe, headers, Idempotency-Key`);
    }
  }

  // ── 4. Signup shut ──────────────────────────────────────────────────────────────────────────────
  {
    const rows = waitlist();
    const { sends } = await sweepUntilDone(rows, { open: false });
    t.eq(sends.filter((s) => s.subject === E.SUBJECT).length, 15, "4a signup shut: the 11 and the 4 still get their founding link email");
    t.eq(sends.filter((s) => s.subject === E.LAUNCH_SUBJECT).length, 0, "4b …and no launch email goes to anyone");
  }

  // ── 6. The founding price itself is unchanged ────────────────────────────────────────────────────
  {
    const cohort = fs.readFileSync(path.join(REPO, "netlify", "functions", "_lib", "foundingCohort.js"), "utf8");
    t.ok(/if \(!emailConfirmed\(user\) \|\| isTestEmail\(user\.email\)\) return false;\s*\n\s*const held = await seatsTaken\(admin\);/.test(cohort) && !/consent_basis|personal_relationship/.test(cohort),
      "6a the founding price needs a confirmed address and a founding seat left (2026-10-29); the consent basis plays no part in it");
  }

  // ── 8. The consent line (Amanda, 2026-10-26) ─────────────────────────────────────────────────────
  {
    process.env.SUPABASE_SECRET_KEY = "test-secret-not-real";
    const friend = { id: "00000000-0000-4000-8000-000000000003", is_test: false, consent_version: LEGACY, founding_position: 3, unsubscribed_at: null, metadata: { consent_basis: { ...BASIS } } };
    const newer = { id: "00000000-0000-4000-8000-000000000012", is_test: false, consent_version: "2026-10-01", founding_position: 12, unsubscribed_at: null, metadata: {} };
    const legacy = { id: "00000000-0000-4000-8000-000000000020", is_test: false, consent_version: LEGACY, founding_position: null, unsubscribed_at: null, metadata: {} };
    const LINE = "Consent on record: personal relationship (joined the waitlist before Oct 1, 2026).";
    const f = E.foundingLinkEmailPayload("friend3@example.test", friend, { launched: true });
    const n = E.foundingLinkEmailPayload("newer12@example.test", newer, { launched: true });
    const l = E.foundingLinkEmailPayload("legacy@example.test", legacy, { launched: true });
    t.ok(f.text.split("\n\n").includes(LINE) && f.html.includes(`>${LINE}</p>`) && !/Consent on record: version/.test(f.text + f.html),
      "8a a personal-relationship row: the consent line reads exactly as Amanda wrote it, in the text and the HTML, and the version line is gone");
    t.ok(n.text.split("\n\n").includes("Consent on record: version 2026-10-01.") && !n.text.includes(LINE), "8b a newer holder keeps its version line");
    t.ok(l.text.split("\n\n").includes(`Consent on record: version ${LEGACY}.`) && !l.text.includes(LINE), "8c the launch email for a row with no basis keeps its version line");
    // Not another word changes: the friend's email is the newer holder's with only the number, the line and the link differing.
    const norm = (p) => p.text.replace(/#\d+ of 50/, "#N of 50").replace(/Consent on record: [^\n]+/, "LINE").replace(/https:\/\/flourishmoney\.app\/api\/unsubscribe\S+/, "URL");
    t.eq(norm(f), norm(n), "8d no other word of the founding email changes");
    t.eq([f.subject, n.subject, l.subject], [E.SUBJECT, E.SUBJECT, E.LAUNCH_SUBJECT], "8e the subjects are unchanged");
    t.eq(l.text.split("\n\n").slice(0, 5), E.launchParagraphs(), "8f the launch email's body is unchanged");
  }

  // ── 7. No signup can grant itself a basis, or mark itself as already emailed ─────────────────────
  {
    Object.assign(process.env, { SUPABASE_URL: "https://example.supabase.co", SUPABASE_SECRET_KEY: "test-service-role" });
    delete process.env.OPEN_SIGNUP;
    const BETA = path.join(REPO, "netlify", "functions", "beta.js");
    for (const k of Object.keys(require.cache)) if (k.includes(path.join("netlify", "functions"))) delete require.cache[k];
    require("./_sampleWords.cjs").useSampleWords();
    const beta = require(BETA);
    const calls = [], realFetch = global.fetch, quiet = { e: console.error, l: console.log, w: console.warn };
    console.error = console.log = console.warn = () => {};
    global.fetch = async (url, o = {}) => {
      calls.push({ url: String(url), method: o.method || "GET", body: o.body });
      const ok = (status, body) => ({ ok: status < 300, status, headers: { get: () => null }, json: async () => body, text: async () => JSON.stringify(body) });
      if (String(url).endsWith("/rest/v1/waitlist") && o.method === "POST") return ok(201, [{ id: "row-1", founding_position: null }]);
      return ok(200, []);
    };
    let res;
    try {
      res = await beta.handler({ httpMethod: "POST", headers: {}, body: JSON.stringify({ action: "join_waitlist", email: "someone@example.test", country: "CA", placement: "hero",
        consentVersion: C.CONSENT_VERSION, metadata: { utm_source: "ig", consent_basis: { ...BASIS }, founding_link: { sent_at: "2026-10-26T00:00:00Z" } } }) });
    } finally { global.fetch = realFetch; Object.assign(console, { error: quiet.e, log: quiet.l, warn: quiet.w }); }
    const ins = calls.find((c) => c.method === "POST" && c.url.endsWith("/rest/v1/waitlist"));
    const meta = ins ? JSON.parse(ins.body).metadata : null;
    t.eq([res && res.statusCode, meta && meta.utm_source, meta && meta.placement], [200, "ig", "hero"], "7a a signup still stores its own metadata (utm, placement)");
    t.ok(meta && !("consent_basis" in meta) && !("founding_link" in meta), "7b …but never consent_basis or founding_link: no form can grant itself a basis or mark itself as already emailed");
  }

  t.summary("foundingFriendsFamily");
})();
