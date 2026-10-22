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
//   6. NOTHING AFTER IT, AND NOTHING AFTER THE LAUNCH (2026-10-15): no waitlist row gets any email after its
//      founding link or launch email; after the launch (signup open) no module sends a waitlist row anything
//      but those, unless its consent version was reviewed for more (none is); the real welcome sweep and
//      join_waitlist prove it; there are no founding reminders.
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
      "flourish is now available in Canada at flourishmoney.app, on the App Store and on Google Play.",
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
      if (u.includes("/rpc/waitlist_founding_number_for_email")) {
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
      "_lib/supportAlert.js": "not a household send at all: an internal alert to our own support inbox when the server flags a store subscription (version 1.1, 2026-10-18)",
    };
    const extra = senders.filter(f => !KNOWN[f]);
    t.eq(extra, [], "5e every module that sends email is known and reviewed for the one-email rule");
    // …and the internal alert can only ever reach our own inbox: a fixed default, or SUPPORT_ALERT_TO from the server's
    // own settings; never an address from a waitlist row or an account.
    const alertSrc = fs.readFileSync(path.join(fnDir, "_lib", "supportAlert.js"), "utf8").replace(/\/\/[^\n]*/g, "");
    t.ok(/const DEFAULT_TO = "hello@flourishmoney\.app";/.test(alertSrc) && /to: \[String\(env\.SUPPORT_ALERT_TO \|\| DEFAULT_TO\)\.trim\(\)\]/.test(alertSrc)
      && !/waitlist|\.email\b|p_email/.test(alertSrc), "5e2 the support alert goes only to our own inbox, never to a household or a waitlist row");
    const ask = (f, rx) => rx.test(fs.readFileSync(path.join(fnDir, f), "utf8"));
    t.ok(ask("_lib/foundingLinkEmail.js", /mayEmailWaitlistRow\(row, kind\)/) && ask("waitlist-sweep.js", /mayEmailWaitlistRow\(row, "welcome"\)/)
      && ask("beta.js", /mayEmailWaitlistRow\(rowForGuard, "welcome"\)/), "5f …and each waitlist sender asks the shared rule");
  }

  // ── 6. nothing after the founding link or launch email; nothing after the launch without review ────
  // The waitlist consent ("…when flourish launches in Canada, plus a few updates before then") ends at the
  // launch (ChatGPT and Grok, 2026-10-15). So: after a row's founding link or Canada launch email, nothing
  // more, of any kind; and after the launch (signup open), no waitlist email but those, unless a consent
  // version was reviewed for more. There are no founding reminders.
  {
    const KINDS = ["welcome", "update", "launch", "founding_link", "canada_launch", "founding_reminder", "founding_last_call", "store_release", "release_day", "newsletter", "", undefined];
    const WORDED = ["2026-10-01", "2026-10-05", "2026-10-06"];
    const LINK_SENT = { founding_link: { kind: "founding_link", sent_at: "2026-10-26T15:00:00Z", consent_version: "2026-10-06", position: 7 } };
    const row = (v, over = {}) => ({ ...ROW, founding_position: 7, consent_version: v, metadata: null, ...over });
    delete process.env.OPEN_SIGNUP;

    for (const v of [...WORDED, LEGACY]) {
      for (const launched of [false, true]) {
        const r = row(v, { metadata: v === LEGACY ? SENT : LINK_SENT });
        t.eq(KINDS.filter(k => C.mayEmailWaitlistRow(r, k, { launched })), [], `6a ${v}${launched ? ", after the launch" : ""}: after its founding link or launch email, no kind at all`);
      }
    }
    for (const v of WORDED) {
      t.eq(KINDS.filter(k => C.mayEmailWaitlistRow(row(v), k, { launched: true })), ["founding_link"], `6b ${v}, after the launch: the founding link email and nothing else`);
      t.ok(["welcome", "update", "founding_link"].every(k => C.mayEmailWaitlistRow(row(v), k)), `6c ${v}, before the launch: the welcome and updates its words asked for (the rule is not shut)`);
    }
    t.eq(KINDS.filter(k => C.mayEmailWaitlistRow(row(LEGACY), k, { launched: true })), ["canada_launch"], "6b2 pre-2026-10-01, after the launch: the Canada launch email and nothing else");

    // The launch is read inside the rule: a caller cannot leave it out or switch it off.
    process.env.OPEN_SIGNUP = "true";
    t.eq(KINDS.filter(k => C.mayEmailWaitlistRow(row("2026-10-06"), k)), ["founding_link"], "6d signup open: the rule itself knows it is after the launch");
    t.eq(KINDS.filter(k => C.mayEmailWaitlistRow(row("2026-10-06"), k, { launched: false })), ["founding_link"], "6d2 …and a caller saying launched: false changes nothing");
    delete process.env.OPEN_SIGNUP;

    // Reviewed consent versions. A new version, or one cleared for email after the launch, fails here until
    // someone has read its words and listed what it may get.
    t.eq(Object.keys(C.CONSENT_VERSIONS).sort(), [...WORDED, "2026-10-22", "2026-10-26"].sort(), "6e every consent version the site has shown is one reviewed here (2026-10-26 and 2026-10-22: the founding link email only, tests/foundingSpotConsent.test.cjs)");
    t.eq([...C.POST_LAUNCH_CONSENT_VERSIONS], [], "6f no consent version is cleared for any email after the launch");
    t.eq([...C.LAUNCH_EMAIL_KINDS], ["founding_link", "canada_launch"], "6g after the launch, only the founding link and Canada launch emails");

    // The real senders, run after the launch: the welcome sweep and join_waitlist send nothing.
    async function welcomeSweep(r, open) {
      const sends = [], realFetch = global.fetch, quiet = { log: console.log, error: console.error };
      process.env.SUPABASE_URL = "https://example.supabase.co"; process.env[KEY_NAME] = "re_TESTONLY_notarealkey";
      if (open) process.env.OPEN_SIGNUP = "true"; else delete process.env.OPEN_SIGNUP;
      global.fetch = async (url, o = {}) => {
        const u = String(url);
        if (u.includes("api.resend.com")) { sends.push(u); return { ok: true, status: 200, json: async () => ({}) }; }
        if (u.includes("welcomed_at=gte.")) return { ok: true, status: 200, headers: { get: () => "*/0" }, json: async () => [] };
        if (u.includes("/rest/v1/waitlist?select=")) return { ok: true, status: 200, json: async () => [{ id: r.id, email: ADDRESS, created_at: "2026-10-20T00:00:00Z", unsubscribed_at: null, consent_version: r.consent_version, founding_position: r.founding_position, metadata: r.metadata }] };
        return { ok: true, status: 204, json: async () => ({}) };
      };
      console.log = () => {}; console.error = () => {};
      try { delete require.cache[require.resolve(WELCOME_SWEEP)]; await require(WELCOME_SWEEP).runSweep({ minAgeMs: 0 }); }
      finally { global.fetch = realFetch; console.log = quiet.log; console.error = quiet.error; delete process.env.OPEN_SIGNUP; }
      return sends.length;
    }
    t.eq(await welcomeSweep(row("2026-10-06"), false), 1, "6h (the welcome sweep, before the launch, sends a welcome: the check below is not blind)");
    t.eq(await welcomeSweep(row("2026-10-06"), true), 0, "6i the welcome sweep, after the launch: nothing");
    t.eq(await welcomeSweep(row("2026-10-06", { metadata: LINK_SENT }), false), 0, "6j the welcome sweep, to a row that had its founding link email: nothing");

    async function join(open) {
      const sends = [], realFetch = global.fetch, quiet = { log: console.log, error: console.error, warn: console.warn };
      process.env.SUPABASE_URL = "https://example.supabase.co"; process.env[KEY_NAME] = "re_TESTONLY_notarealkey";
      if (open) process.env.OPEN_SIGNUP = "true"; else delete process.env.OPEN_SIGNUP;
      global.fetch = async (url, o = {}) => {
        const u = String(url);
        if (u.includes("api.resend.com")) { sends.push(u); return { ok: true, status: 200, json: async () => ({ id: "x" }) }; }
        if (u.endsWith("/rest/v1/waitlist") && o.method === "POST") return { ok: true, status: 201, json: async () => [{ id: "row-1", founding_position: 9 }], text: async () => "" };
        return { ok: true, status: 204, json: async () => [], text: async () => "" };
      };
      console.log = console.error = console.warn = () => {};
      const beta = path.join(REPO, "netlify", "functions", "beta.js");
      try {
        delete require.cache[require.resolve(beta)];
        await require(beta).handler({ httpMethod: "POST", headers: {}, body: JSON.stringify({ action: "join_waitlist", email: "new.person@example.test", country: "CA", placement: "hero", consentVersion: C.CONSENT_VERSION }) });
      } finally { global.fetch = realFetch; Object.assign(console, quiet); delete process.env.OPEN_SIGNUP; }
      return sends.length;
    }
    t.eq(await join(false), 1, "6k (join_waitlist, before the launch, sends the welcome: the check below is not blind)");
    t.eq(await join(true), 0, "6l join_waitlist, after the launch: the row is kept, no email");

    // No founding reminders: no sender, no flag, no schedule.
    const fnDir = path.join(REPO, "netlify", "functions");
    t.ok(!fs.existsSync(path.join(fnDir, "founding-reminder-sweep.js")) && !fs.existsSync(path.join(fnDir, "_lib", "foundingReminderEmail.js")), "6m the founding reminder sweep and its email are gone");
    const toml = fs.readFileSync(path.join(REPO, "netlify.toml"), "utf8");
    const scheduled = [...toml.matchAll(/\[functions\."([^"]+)"\]\s*\n\s*schedule/g)].map(m => m[1]).sort();
    const sends = (f) => /require\("\.\/_lib\/(?:waitlistWelcome|foundingLinkEmail|foundingConfirm)"\)|api\.resend\.com|sendFoundingLinkEmail|sendWelcome/.test(fs.readFileSync(path.join(fnDir, `${f}.js`), "utf8"));
    t.eq([scheduled, scheduled.filter(sends)], [["founding-link-sweep", "limiter-cleanup", "waitlist-sweep"], ["founding-link-sweep", "waitlist-sweep"]],
      "6n0 three scheduled functions, and the limiter cleanup sends nothing");
    t.eq(scheduled.filter(sends), ["founding-link-sweep", "waitlist-sweep"], "6n the only scheduled senders are the welcome sweep and the founding link sweep");
    const everywhere = [toml, fs.readFileSync(path.join(REPO, "docs", "ops", "BILLING-DAY-OCT-26.md"), "utf8"),
      ...fs.readdirSync(fnDir).filter(f => f.endsWith(".js")).map(f => fs.readFileSync(path.join(fnDir, f), "utf8")),
      ...fs.readdirSync(path.join(fnDir, "_lib")).filter(f => f.endsWith(".js")).map(f => fs.readFileSync(path.join(fnDir, "_lib", f), "utf8"))].join("\n");
    t.ok(!/FOUNDING_REMINDERS|founding_reminders|foundingReminder/.test(everywhere), "6o no FOUNDING_REMINDERS flag, and no reminder record, anywhere in the functions or the runbook");
  }

  process.env = saved;
  t.summary("launchEmail.test");
})();
