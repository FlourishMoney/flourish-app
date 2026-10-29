// tests/foundingLinkOnly.test.cjs
// -----------------------------------------------------------------------------
// FOUNDING_LINK_EMAIL_ONLY: the founding sweep's allowlist (2026-10-28, the founding dress rehearsal).
//
// The rehearsal email goes through the production sweep itself, to one address, while 15 real founding
// households are owed the same email and must get nothing. This pins:
//   1. Set: only the listed addresses are selected AND sent, even with FOUNDING_LINK_EMAIL=true, even if the
//      database returned every owed row, and on the launch path (OPEN_SIGNUP) too. Nothing is written for anyone else.
//   2. Set but not a clean list of addresses: the run reads, sends and writes nothing.
//   3. It never replaces the switches: with FOUNDING_LINK_EMAIL off, nothing happens whatever the list says.
//   4. Unset (or empty): the run is exactly what it was, call for call, log for log.
//   5. Logs carry counts only, never an address.
// The sweep runs for real against a stubbed fetch, as in tests/foundingLink.test.cjs section 5.
// -----------------------------------------------------------------------------
"use strict";
// The emails refuse to send a "[WORDS: id]" placeholder (2026-10-29): sample words stand in (tests/_sampleWords.cjs).
const { sample: sampleWords } = require("./_sampleWords.cjs");
require("./_sampleWords.cjs").useSampleWords();
const { create } = require("./_runner.cjs");
const path = require("path");

const REPO = path.join(__dirname, "..");
const SWEEP = path.join(REPO, "netlify", "functions", "founding-link-sweep.js");
const { CONSENT_VERSION, LEGACY_CONSENT_VERSION } = require(path.join(REPO, "netlify", "functions", "_lib", "waitlistConsent.js"));
const KEY_NAME = ["RESEND", "API", "KEY"].join("_");

const REHEARSAL = "simplify.holt+founding@example.com";
const row = (id, n, email, extra = {}) => ({ id, founding_position: n, email, is_test: false, unsubscribed_at: null, consent_version: CONSENT_VERSION, metadata: { placement: "hero" }, ...extra });
const HOUSEHOLDS = [
  row("00000000-0000-4000-8000-000000000001", 1, "first.household@example.com"),
  row("00000000-0000-4000-8000-000000000003", 3, "third.household@example.com"),
  row("00000000-0000-4000-8000-000000000007", 7, "seventh.household@example.com"),
];
const LAUNCH_ROW = row("00000000-0000-4000-8000-0000000000aa", null, "launch.household@example.com", { consent_version: LEGACY_CONSENT_VERSION });
const OURS = row("cfce6b18-848d-49cb-b1ff-6ee315e5570b", 36, REHEARSAL);
const ALL = [...HOUSEHOLDS, OURS];

// The email=in.( ) filter as PostgREST reads it: the quoted addresses, or null when the URL has none.
function emailFilter(url) {
  const m = /[?&]email=in\.\(([^)]*)\)/.exec(url);
  if (!m) return null;
  return decodeURIComponent(m[1]).split(",").map((s) => s.replace(/^"|"$/g, ""));
}

(async () => {
  const t = create();
  const savedEnv = { ...process.env };
  process.env.SUPABASE_SECRET_KEY = "test-service-role";
  delete process.env.WAITLIST_UNSUBSCRIBE_SECRET;

  // filterHonoured: the stub database applies the email filter (real PostgREST). false: it returns every row it
  // has, as if the filter were ignored, to prove the per-row check holds on its own.
  async function sweep({ env = {}, rows = ALL, filterHonoured = true, sweepFile = SWEEP } = {}) {
    const calls = [], logs = [];
    const realFetch = global.fetch, realLog = console.log, realErr = console.error, realWarn = console.warn;
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env[KEY_NAME] = "re_TESTONLY_notarealkey";
    process.env.BILLING_ENABLED = "true";
    process.env.FOUNDING_LINK_EMAIL = "true";
    delete process.env.OPEN_SIGNUP;
    delete process.env.FOUNDING_LINK_EMAIL_ONLY;
    for (const [k, v] of Object.entries(env)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    global.fetch = async (url, o = {}) => {
      const u = String(url);
      const call = { url: u, method: o.method || "GET", body: o.body, idem: o.headers && o.headers["Idempotency-Key"] };
      calls.push(call);
      if (u.includes("api.resend.com")) return { ok: true, status: 200, json: async () => ({ id: "x" }) };
      if (u.includes("/rpc/waitlist_founding_number_for_email")) {
        const email = JSON.parse(o.body).p_email;
        return { ok: true, status: 200, json: async () => (rows.find((r) => r.email === email) || {}).founding_position ?? null };
      }
      if (call.method === "PATCH") return { ok: true, status: 204, json: async () => ({}) };
      if (u.includes("sent_at=gte.")) return { ok: true, status: 200, headers: { get: (k) => (k === "content-range" ? "*/0" : null) }, json: async () => [] };
      if (u.includes("/rest/v1/waitlist?select=")) {
        const only = filterHonoured ? emailFilter(u) : null;
        return { ok: true, status: 200, json: async () => (only ? rows.filter((r) => only.includes(r.email)) : rows) };
      }
      return { ok: false, status: 599, json: async () => ({}) };
    };
    const cap = (...a) => logs.push(a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" "));
    console.log = cap; console.error = cap; console.warn = cap;
    let result;
    try {
      delete require.cache[require.resolve(sweepFile)];
      result = await require(sweepFile).runFoundingLinkSweep();
    } finally {
      global.fetch = realFetch; console.log = realLog; console.error = realErr; console.warn = realWarn;
    }
    const resend = calls.filter((c) => c.url.includes("api.resend.com"));
    return {
      result, calls, logs, resend,
      sentTo: resend.map((c) => JSON.parse(c.body).to),
      patches: calls.filter((c) => c.method === "PATCH"),
      lookups: calls.filter((c) => c.url.includes("/rpc/")).map((c) => JSON.parse(c.body).p_email),
      select: calls.find((c) => c.url.includes("/rest/v1/waitlist?select=id,email,")),
    };
  }

  // ── 1. set: only the listed address ─────────────────────────────────────────────────────────────
  {
    const r = await sweep({ env: { FOUNDING_LINK_EMAIL_ONLY: REHEARSAL } });
    t.eq(emailFilter(r.select.url), [REHEARSAL], "1a the select reads only the listed address (email=in.(\"…\"))");
    t.ok(r.select.url.includes("%2B") && !/email=in\.\([^)]*\+/.test(r.select.url), "1b the + in the address is sent as %2B, never a bare + (which PostgREST would read as a space)");
    t.eq(r.sentTo, [[REHEARSAL]], "1c FOUNDING_LINK_EMAIL=true with the list set: exactly one email, to the listed address alone");
    t.eq(r.resend[0].idem, `founding-link/${OURS.id}`, "1d …with production's Idempotency-Key for that row");
    const sentText = JSON.parse(r.resend[0].body).text;
    t.eq([sentText.includes("#36"), sentText.includes(sampleWords("founding-email-position"))], [false, true], "1e …and no longer naming the row's founding number (2026-10-29: the line is words to come)");
    t.eq([r.patches.length, r.patches[0] && r.patches[0].url.includes(`id=eq.${OURS.id}`)], [1, true], "1f the only record written is the listed row's");
    t.eq(r.lookups, [REHEARSAL], "1g billing's lookup is asked about the listed address only");
    t.eq([r.result.sent, r.result.allowlist, r.result.notAllowed], [1, 1, 0], "1h result: sent 1, allowlist of 1, none skipped (the others were never read)");
  }
  {
    // The database returns every owed row anyway: the per-row check alone keeps the households out.
    const r = await sweep({ env: { FOUNDING_LINK_EMAIL_ONLY: REHEARSAL }, filterHonoured: false });
    t.eq(r.sentTo, [[REHEARSAL]], "1i every owed row returned (filter ignored): still only the listed address is sent to");
    t.eq([r.patches.length, r.result.notAllowed], [1, 3], "1j …the three households are skipped: no record written for them");
    t.eq(r.lookups, [REHEARSAL], "1k …and never even looked up");
    const someone = HOUSEHOLDS.map((h) => h.email);
    t.ok(r.calls.every((c) => !someone.some((e) => (c.body || "").includes(e))), "1l no call carries any household's address");
  }
  {
    // Case and spaces never matter; several addresses; the launch path (signup open) is narrowed too.
    const r = await sweep({ env: { FOUNDING_LINK_EMAIL_ONLY: `  ${REHEARSAL.toUpperCase()} , third.household@example.com ` } });
    t.eq(r.sentTo, [["third.household@example.com"], [REHEARSAL]], "1m a list of two, in any case and spacing: those two, lowest number first");
    const L = await sweep({ env: { FOUNDING_LINK_EMAIL_ONLY: REHEARSAL, OPEN_SIGNUP: "true" }, rows: [...ALL, LAUNCH_ROW], filterHonoured: false });
    t.eq(L.sentTo, [[REHEARSAL]], "1n with signup open (the launch email path), a launch row not on the list gets nothing");
    const none = await sweep({ env: { FOUNDING_LINK_EMAIL_ONLY: "nobody.listed@example.com" } });
    t.eq([none.resend.length, none.patches.length], [0, 0], "1o a listed address that owes nothing: nobody is emailed");
  }

  // ── 2. set but not a clean list: nothing at all ─────────────────────────────────────────────────
  for (const bad of [" ", ",", "not-an-email", `${REHEARSAL},junk`, "a@b", "\"x\"@example.com", "x@example.com)", "x@exa,mple"]) {
    const r = await sweep({ env: { FOUNDING_LINK_EMAIL_ONLY: bad } });
    t.eq([r.result.skipped, r.calls.length], ["allowlist_invalid", 0], `2a FOUNDING_LINK_EMAIL_ONLY=${JSON.stringify(bad)}: nothing read, sent or written`);
  }

  // ── 3. never replaces the switches ──────────────────────────────────────────────────────────────
  for (const [why, env, skipped] of [
    ["FOUNDING_LINK_EMAIL unset", { FOUNDING_LINK_EMAIL: undefined }, "founding_link_email_off"],
    ["BILLING_ENABLED unset", { BILLING_ENABLED: undefined }, "billing_off"],
  ]) {
    const r = await sweep({ env: { ...env, FOUNDING_LINK_EMAIL_ONLY: REHEARSAL } });
    t.eq([r.result.skipped, r.calls.length], [skipped, 0], `3a list set, ${why}: nothing read, sent or written`);
  }

  // ── 4. unset: exactly as before ─────────────────────────────────────────────────────────────────
  {
    const T = (x) => (x || "").replace(/\d{4}-\d\d-\d\dT\d\d(%3A|:)\d\d(%3A|:)\d\d\.\d+Z/g, "T");   // the clock, nothing else
    const strip = (r) => ({ result: r.result, logs: r.logs, calls: r.calls.map((c) => ({ ...c, url: T(c.url), body: T(c.body) })) });
    const unset = await sweep({});
    const empty = await sweep({ env: { FOUNDING_LINK_EMAIL_ONLY: "" } });
    t.eq(unset.sentTo, ALL.map((r) => [r.email]), "4a unset: every owed row is sent to, lowest number first, as before");
    t.eq([emailFilter(unset.select.url), "allowlist" in unset.result, "notAllowed" in unset.result], [null, false, false], "4b unset: no email filter in the select, no new fields in the result");
    t.ok(unset.logs.every((l) => !/allowlist|not_allowed/.test(l)), "4c unset: the log line is the one it always was");
    t.eq(JSON.stringify(strip(empty)), JSON.stringify(strip(unset)), "4d empty is the same as unset, call for call and log for log");
    const launched = await sweep({ env: { OPEN_SIGNUP: "true" }, rows: [...ALL, LAUNCH_ROW] });
    t.eq(launched.sentTo.length, 5, "4e unset with signup open: the launch row is sent to as well, as before");
  }

  // ── 5. logs: counts only ────────────────────────────────────────────────────────────────────────
  {
    const r = await sweep({ env: { FOUNDING_LINK_EMAIL_ONLY: REHEARSAL }, filterHonoured: false });
    const line = r.logs.find((l) => l.startsWith("[founding-link] {"));
    t.ok(!!line && /"allowlist":1/.test(line) && /"not_allowed":3/.test(line), "5a the run's log line says how long the list is and how many rows it kept out");
    t.ok(r.logs.every((l) => !l.includes("@")), "5b no log line carries an address");
  }

  process.env = savedEnv;
  t.summary("foundingLinkOnly.test");
})();
