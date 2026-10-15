// tests/launchEmail.test.cjs
// -----------------------------------------------------------------------------
// THE CANADA LAUNCH EMAIL, AND THE ONE-EMAIL RULE FOR THE PRE-2026-10-01 ROWS (billing day, rounds 4-5).
//
// Those rows joined before the consent line existed, from a form that said "we'll email you the moment
// flourish launches" and "No spam, just the launch news." Their consent was launch news only (CASL). Amanda
// decided (2026-10-14) that October 26 with signup open is that launch. Round 5 (wording approved by ChatGPT
// and Grok): the email is launch news only, and it is the one email those rows ever get. Pinned:
//   1. the words, exactly: no price, no founding number, no checkout link;
//   2. the CASL footer, recording the version they agreed to;
//   3. who gets it: pre-2026-10-01 rows only, number or not, only with signup open, and only once;
//   4. the sweep, run for real against a stubbed fetch: it sends it without a founding lookup, records it,
//      and never sends a second email to that row;
//   5. EXACTLY ONE EMAIL EVER: the shared rule says no to every other kind, now and later (a store release-day
//      email included); the real welcome sender skips them; and every module that sends email is known here,
//      so a new sender cannot slip past the rule unreviewed. Nothing is sent.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");

const REPO = path.join(__dirname, "..");
const SWEEP = path.join(REPO, "netlify", "functions", "founding-link-sweep.js");
const WELCOME_SWEEP = path.join(REPO, "netlify", "functions", "waitlist-sweep.js");
const E = require("../netlify/functions/_lib/foundingLinkEmail.js");
const U = require("../netlify/functions/_lib/waitlistUnsubscribe.js");
const C = require("../netlify/functions/_lib/waitlistConsent.js");
const KEY_NAME = ["RESEND", "API", "KEY"].join("_");
const LEGACY = C.LEGACY_CONSENT_VERSION;
const ADDRESS = "early.household@example.test";
const ROW = Object.freeze({ id: "3b1f7e20-5c44-4b1e-9a77-0c2d6e8f1a23", founding_position: 2, is_test: false, unsubscribed_at: null, consent_version: LEGACY, metadata: null });
const SENT = { founding_link: { kind: "canada_launch", sent_at: "2026-10-26T15:00:00Z", consent_version: LEGACY } };

(async () => {
  const t = create();
  const saved = { ...process.env };
  process.env.SUPABASE_SECRET_KEY = "test-service-role";
  delete process.env.WAITLIST_UNSUBSCRIBE_SECRET;

  // ── 1. the words ────────────────────────────────────────────────────────────────────────────────
  const p = E.foundingLinkEmailPayload(ADDRESS, ROW, { launched: true });
  {
    t.ok(p !== null, "1a a pre-2026-10-01 row, signup open: the Canada launch email");
    t.eq(p.subject, "flourish has launched in Canada", "1b the subject");
    t.eq(E.launchParagraphs(), [
      "flourish has launched in Canada. When you joined the waitlist, you asked us to email you when it did, so here it is.",
      "flourish is now available in Canada at flourishmoney.app.",
      "This is the one email you asked for when you joined, so we won't send you anything else from the waitlist.",
      "Questions? Just reply to this email.",
      "Amanda, founder of flourish",
    ], "1c the approved words, exactly");
    const body = p.text.split("\n\n").slice(0, 5).join("\n\n");
    t.eq(body, E.launchParagraphs().join("\n\n"), "1d the text is those words, then the footer");
    for (const [what, rx] of [["a price", /\$\s?\d/], ["a founding number", /founding household|of 50|founding number/i], ["a checkout link", /checkout|\?checkout=|Founding Annual|founding price/i]]) {
      t.ok(!rx.test(p.text) && !rx.test(p.html), `1e no ${what}, in text or html`);
    }
    t.ok(!/#\d/.test(p.text), "1e2 no \"#N\" in the text (the html's only #s are colours)");
    t.eq([p.text.includes(ADDRESS), p.html.includes(ADDRESS), p.to], [false, false, [ADDRESS]], "1f the address is only in `to`");
    t.ok(p.html.includes("<title>flourish has launched in Canada</title>") && E.launchParagraphs().every(l => p.html.includes(l.replace(/'/g, "'"))),
      "1g the html carries the same subject and the same words");
  }

  // ── 2. the footer ───────────────────────────────────────────────────────────────────────────────
  {
    const url = U.unsubscribeUrl(ROW.id);
    t.eq(p.text.split("\n\n").slice(-5), [
      "You're receiving this because you joined the waitlist at flourishmoney.app.",
      `Consent on record: version ${LEGACY}.`,
      ...E.CONTACT_BLOCK,
      `Unsubscribe with one click: ${url}`,
    ], "2a the same CASL footer: why, the version they agreed to, the Contact block, one-click unsubscribe");
    t.eq([p.headers["List-Unsubscribe-Post"], p.tags], ["List-Unsubscribe=One-Click", [{ name: "kind", value: "canada_launch" }, { name: "consent_version", value: LEGACY }]],
      "2b one-click headers, and Resend records it as the Canada launch email under the legacy version");
  }

  // ── 3. who gets it ──────────────────────────────────────────────────────────────────────────────
  {
    t.eq(E.foundingLinkEmailPayload(ADDRESS, ROW), null, "3a signup not open: nothing");
    t.eq(E.foundingLinkEmailPayload(ADDRESS, ROW, { launched: "true" }), null, "3b only a real `true` counts as open");
    for (const [why, over] of [["no founding number", { founding_position: null }], ["number 51", { founding_position: 51 }]]) {
      t.ok(E.foundingLinkEmailPayload(ADDRESS, { ...ROW, ...over }, { launched: true }) !== null, `3c ${why}: still the launch email (it names no number)`);
    }
    t.eq(E.foundingLinkEmailPayload(ADDRESS, { ...ROW, metadata: SENT }, { launched: true }), null, "3d already sent: never again");
    for (const v of ["2026-10-01", "2026-10-05", "2026-10-06"]) {
      const q = E.foundingLinkEmailPayload(ADDRESS, { ...ROW, consent_version: v }, { launched: true });
      t.eq([q.subject, q.tags[0].value], ["Your founding price is ready", "founding_link"], `3e ${v}: the founding link email, never the launch one`);
    }
    for (const [why, over] of [["unsubscribed", { unsubscribed_at: "2026-10-20T00:00:00Z" }], ["a test row", { is_test: true }], ["a version never shown", { consent_version: "2026-09-01" }], ["no version", { consent_version: null }]]) {
      t.eq(E.foundingLinkEmailPayload(ADDRESS, { ...ROW, ...over }, { launched: true }), null, `3f ${why}: nothing`);
    }
  }

  // ── 4. the sweep ────────────────────────────────────────────────────────────────────────────────
  async function sweep(env, rows) {
    const calls = [], realFetch = global.fetch, quiet = { log: console.log, error: console.error };
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env[KEY_NAME] = "re_TESTONLY_notarealkey";
    process.env.BILLING_ENABLED = "true"; process.env.FOUNDING_LINK_EMAIL = "true";
    for (const [k, v] of Object.entries(env)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    global.fetch = async (url, o = {}) => {
      const u = String(url), call = { url: u, method: o.method || "GET", headers: o.headers || {}, body: o.body };
      calls.push(call);
      if (u.includes("api.resend.com")) return { ok: true, status: 200, json: async () => ({}) };
      if (u.includes("/rpc/waitlist_founding_position_for_email")) {
        const e = JSON.parse(o.body).p_email; return { ok: true, status: 200, json: async () => rows.find(r => r.email === e)?.founding_position ?? null };
      }
      if (call.method === "PATCH") return { ok: true, status: 204, json: async () => ({}) };
      if (u.includes("sent_at=gte.")) return { ok: true, status: 200, headers: { get: () => "*/0" }, json: async () => [] };
      if (u.includes("/rest/v1/waitlist?select=id,email,")) {
        const q = decodeURIComponent(u);
        const versions = (q.match(/&consent_version=in\.\(([^)]*)\)/) || [, ""])[1].split(",");
        return { ok: true, status: 200, json: async () => rows.filter(r => versions.includes(r.consent_version) && !(r.metadata && r.metadata.founding_link)) };
      }
      return { ok: false, status: 599, json: async () => ({}) };
    };
    console.log = () => {}; console.error = () => {};
    try { delete require.cache[require.resolve(SWEEP)]; return { result: await require(SWEEP).runFoundingLinkSweep(), calls }; }
    finally { global.fetch = realFetch; console.log = quiet.log; console.error = quiet.error; }
  }
  {
    const EARLY = { ...ROW, email: ADDRESS, founding_position: null };
    const LATER = { id: "0a8e9b77-3f4c-4d2b-8e1a-5c6d7e8f9a0b", email: "later.household@example.test", founding_position: 9, is_test: false, unsubscribed_at: null, consent_version: "2026-10-06", metadata: null };
    const open = await sweep({ OPEN_SIGNUP: "true" }, [EARLY, LATER]);
    const sends = open.calls.filter(c => c.url.includes("api.resend.com")).map(c => JSON.parse(c.body));
    t.eq(sends.map(s => [s.to[0], s.subject]).sort(), [[ADDRESS, "flourish has launched in Canada"], ["later.household@example.test", "Your founding price is ready"]].sort(),
      "4a signup open: the early household (no founding number) gets the launch email, the later one the founding link email");
    const select = decodeURIComponent(open.calls.find(c => c.url.includes("/rest/v1/waitlist?select=id,email,")).url);
    t.ok(select.includes(`or=(and(founding_position.gte.1,founding_position.lte.50),consent_version.in.(${LEGACY}))`), "4b the query lets a pre-2026-10-01 row in without a founding number");
    const lookups = open.calls.filter(c => c.url.includes("/rpc/")).map(c => JSON.parse(c.body).p_email);
    t.eq(lookups, ["later.household@example.test"], "4c the founding lookup is asked only for the founding link email");
    const records = open.calls.filter(c => c.method === "PATCH").map(c => JSON.parse(c.body).metadata.founding_link);
    t.eq(records.map(r => [r.kind, r.consent_version]).sort(), [["canada_launch", LEGACY], ["founding_link", "2026-10-06"]].sort(), "4d each send is recorded with its kind");
    const again = await sweep({ OPEN_SIGNUP: "true" }, [{ ...EARLY, metadata: SENT }]);
    t.eq(again.calls.filter(c => c.url.includes("api.resend.com")).length, 0, "4e the next run: nothing more to that row");
    // The stub hides recorded rows as the real query does; the per-row rule refuses them as well:
    t.eq(C.foundingEmailKindFor({ ...EARLY, metadata: SENT }, { launched: true }), null, "4f …and even if the query returned it, the per-row rule refuses it");
    const shut = await sweep({ OPEN_SIGNUP: undefined }, [EARLY, LATER]);
    t.eq(shut.calls.filter(c => c.url.includes("api.resend.com")).map(c => JSON.parse(c.body).to[0]), ["later.household@example.test"], "4g signup shut: no launch email");
  }

  // ── 5. exactly one email, ever ──────────────────────────────────────────────────────────────────
  {
    const legacy = { ...ROW };
    const kinds = ["welcome", "update", "launch", "founding_link", "founding_reminder", "founding_last_call", "store_release", "release_day", "app_store_launch", "newsletter", "", undefined];
    t.eq(kinds.filter(k => C.mayEmailWaitlistRow(legacy, k)), [], "5a the shared rule says no to the pre-2026-10-01 rows for every kind but the Canada launch email (a store release-day email included)");
    t.eq([C.mayEmailWaitlistRow(legacy, "canada_launch"), C.mayEmailWaitlistRow({ ...legacy, metadata: SENT }, "canada_launch")], [true, false], "5b …which they get once");
    t.eq(C.mayEmailWaitlistRow({ ...legacy, consent_version: "2026-10-06" }, "canada_launch"), false, "5c and nobody else gets that one");

    // The real welcome sender, handed a legacy row (as if its query had returned one): no email.
    const realFetch = global.fetch, quiet = { log: console.log, error: console.error }, resend = [];
    process.env.SUPABASE_URL = "https://example.supabase.co"; process.env[KEY_NAME] = "re_TESTONLY_notarealkey";
    global.fetch = async (url, o = {}) => {
      const u = String(url);
      if (u.includes("api.resend.com")) { resend.push(u); return { ok: true, status: 200 }; }
      if (u.includes("welcomed_at=gte.")) return { ok: true, status: 200, headers: { get: () => "*/0" }, json: async () => [] };
      if (u.includes("/rest/v1/waitlist?select=")) return { ok: true, status: 200, json: async () => [{ id: ROW.id, email: ADDRESS, created_at: "2026-09-20T00:00:00Z", unsubscribed_at: null, consent_version: LEGACY, founding_position: 2 }] };
      return { ok: true, status: 204, json: async () => ({}) };
    };
    console.log = () => {}; console.error = () => {};
    try { delete require.cache[require.resolve(WELCOME_SWEEP)]; await require(WELCOME_SWEEP).runSweep({ minAgeMs: 0 }); }
    finally { global.fetch = realFetch; console.log = quiet.log; console.error = quiet.error; }
    t.eq(resend.length, 0, "5d the welcome sender skips a pre-2026-10-01 row");

    // Every module that sends email through Resend is known here. A new one (a store release-day email, a
    // reminder) fails this until it is reviewed: a waitlist sender must ask mayEmailWaitlistRow.
    const fnDir = path.join(REPO, "netlify", "functions");
    const files = [...fs.readdirSync(fnDir).filter(f => f.endsWith(".js")).map(f => path.join(fnDir, f)),
      ...fs.readdirSync(path.join(fnDir, "_lib")).filter(f => f.endsWith(".js")).map(f => path.join(fnDir, "_lib", f))];
    const senders = files.filter(f => fs.readFileSync(f, "utf8").includes("api.resend.com")).map(f => path.relative(fnDir, f)).sort();
    const KNOWN = {
      "_lib/foundingLinkEmail.js": "waitlist: the founding link and Canada launch emails (asks mayEmailWaitlistRow)",
      "_lib/waitlistWelcome.js": "waitlist: the welcome email (both callers ask mayEmailWaitlistRow, \"welcome\")",
      "_lib/foundingConfirm.js": "not a waitlist send: a confirmation the account holder asked for, to their own account address",
    };
    const extra = senders.filter(f => !KNOWN[f]);
    t.eq(extra, [], "5e every module that sends email is known and reviewed for the one-email rule");
    const ask = (f, rx) => rx.test(fs.readFileSync(path.join(fnDir, f), "utf8"));
    t.ok(ask("_lib/foundingLinkEmail.js", /mayEmailWaitlistRow\(row, kind\)/) && ask("waitlist-sweep.js", /mayEmailWaitlistRow\(row, "welcome"\)/)
      && ask("beta.js", /mayEmailWaitlistRow\(rowForGuard, "welcome"\)/), "5f …and each waitlist sender asks the shared rule");
  }

  process.env = saved;
  t.summary("launchEmail.test");
})();
