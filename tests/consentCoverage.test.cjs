// tests/consentCoverage.test.cjs
// -----------------------------------------------------------------------------
// WHICH CONSENT VERSIONS THE FOUNDING LINK EMAIL MAY GO TO (billing day, round 3).
//
// Every consent version the waitlist ever recorded, what its words asked for, and the rule the founding
// link email follows: every version whose words asked for updates, and no other. Pinned here:
//   1. every version ever shown is classified (a new one cannot slip in unreviewed);
//   2. each classification is read from that version's own words;
//   3. the founding link email goes to 2026-10-01, 2026-10-05 and 2026-10-06; pre-2026-10-01 gets the
//      LAUNCH email instead, and only once signup is open (Amanda's decision, 2026-10-14: October 26 with
//      OPEN_SIGNUP on is the launch those rows asked about); no version the site never showed gets either;
//   4. the sweep asks the database for exactly those versions.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");

const REPO = path.join(__dirname, "..");
const C = require("../netlify/functions/_lib/waitlistConsent.js");
const E = require("../netlify/functions/_lib/foundingLinkEmail.js");

(() => {
  const t = create();
  process.env.SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY || "test-service-role";

  // ── 1. every version is classified ──────────────────────────────────────────────────────────────
  const shown = [C.LEGACY_CONSENT_VERSION, ...Object.keys(C.CONSENT_VERSIONS)].sort();
  t.eq(Object.keys(C.CONSENT_COVERS).sort(), shown, "1a every consent version ever recorded has its coverage written down, and nothing else does");
  t.eq(shown, ["2026-10-01", "2026-10-05", "2026-10-06", "pre-2026-10-01"], "1b (the four versions: the legacy rows and three worded ones)");

  // ── 2. read from the words ──────────────────────────────────────────────────────────────────────
  for (const v of Object.keys(C.CONSENT_VERSIONS)) {
    const words = C.CONSENT_VERSIONS[v].consent;
    t.eq(C.CONSENT_COVERS[v].includes("launch"), /when flourish launches/.test(words), `2a ${v}: "launch" exactly when the words promise the launch email`);
    t.eq(C.CONSENT_COVERS[v].includes("updates"), /a few updates/.test(words), `2b ${v}: "updates" exactly when the words promise updates`);
  }
  const src = fs.readFileSync(path.join(REPO, "netlify", "functions", "_lib", "waitlistConsent.js"), "utf8");
  t.eq(C.CONSENT_COVERS[C.LEGACY_CONSENT_VERSION], ["launch"], "2c pre-2026-10-01: the launch email only");
  t.ok(src.includes("No spam, just the launch news.") && src.includes("we'll email you the moment flourish launches"),
    "2d …recorded from the words that form showed (no consent line existed yet)");

  // ── 3. who gets the founding link email ─────────────────────────────────────────────────────────
  t.eq([...C.FOUNDING_LINK_CONSENT_VERSIONS], ["2026-10-01", "2026-10-05", "2026-10-06"], "3a the founding link email: every version whose words asked for updates");
  const row = (v, over = {}) => ({ id: "7d0c2a51-0b1e-4f7a-9c43-2a6f0e1d9b10", founding_position: 7, is_test: false, unsubscribed_at: null, consent_version: v, ...over });
  for (const v of ["2026-10-01", "2026-10-05", "2026-10-06"]) {
    const p = E.foundingLinkEmailPayload("household@example.test", row(v));
    t.ok(!!p && p.tags[1].value === v && p.text.includes(`Consent on record: version ${v}.`), `3b ${v}: the email goes, and records ${v}`);
  }
  for (const [why, v] of [["pre-2026-10-01 before signup opens", C.LEGACY_CONSENT_VERSION], ["a version the site never showed", "2026-10-07"], ["no version", null]]) {
    t.eq(E.foundingLinkEmailPayload("household@example.test", row(v)), null, `3c ${why}: no email`);
    t.eq(C.mayEmailFoundingLink(row(v)), false, `3d ${why}: the founding link rule says no`);
  }
  t.eq([...C.LAUNCH_EMAIL_CONSENT_VERSIONS], [C.LEGACY_CONSENT_VERSION], "3d2 the launch email: pre-2026-10-01 only");
  const launched = { launched: true };
  t.eq(C.foundingEmailKindFor(row(C.LEGACY_CONSENT_VERSION), launched), "canada_launch", "3d3 pre-2026-10-01 with signup open: the Canada launch email");
  t.eq(C.foundingEmailKindFor(row(C.LEGACY_CONSENT_VERSION, { metadata: { founding_link: { kind: "canada_launch" } } }), launched), null, "3d3b …once only");
  t.eq(C.foundingEmailKindFor(row(C.LEGACY_CONSENT_VERSION)), null, "3d4 …and nothing before signup opens");
  for (const v of ["2026-10-01", "2026-10-05", "2026-10-06"]) {
    t.eq(C.foundingEmailKindFor(row(v), launched), "founding_link", `3d5 ${v} with signup open: still the founding link email, never the launch one`);
  }
  t.eq([C.foundingEmailKindFor(row("2026-10-07"), launched), C.foundingEmailKindFor(row(C.LEGACY_CONSENT_VERSION, { unsubscribed_at: "2026-10-20T00:00:00Z" }), launched)],
    [null, null], "3d6 an unknown version, or an unsubscribed legacy row: nothing, even with signup open");
  t.eq(C.mayEmailFoundingLink(row("2026-10-06", { unsubscribed_at: "2026-10-20T00:00:00Z" })), false, "3e unsubscribed: never");
  t.eq([C.mayEmailWaitlistRow(row(C.LEGACY_CONSENT_VERSION), "canada_launch"), C.mayEmailWaitlistRow(row(C.LEGACY_CONSENT_VERSION), "launch")], [true, false],
    "3f the shared CASL rule lets the legacy rows have the Canada launch email, and not a generic \"launch\" one");

  // ── 4. the sweep asks for exactly those versions ────────────────────────────────────────────────
  const sweep = fs.readFileSync(path.join(REPO, "netlify", "functions", "founding-link-sweep.js"), "utf8");
  t.ok(/const versionsFor = \(launched\) => \[\.\.\.FOUNDING_LINK_CONSENT_VERSIONS, \.\.\.\(launched \? LAUNCH_EMAIL_CONSENT_VERSIONS : \[\]\)\];/.test(sweep)
    && /&consent_version=in\.\(\$\{versionsFor\(launched\)\.map\(encodeURIComponent\)\.join\(","\)\}\)/.test(sweep), "4a the sweep's query names exactly those versions (the legacy one only with signup open)");
  t.ok(/const launched = flagOn\("OPEN_SIGNUP"\);/.test(sweep) && /const kind = foundingEmailKindFor\(row, \{ launched \}\);\s*\n\s*if \(!kind \|\| !mayEmailWaitlistRow\(row, kind\)\)/.test(sweep),
    "4b …reads signup from OPEN_SIGNUP, and checks each row again for the email it gets");
  const doc = fs.readFileSync(path.join(REPO, "docs", "ops", "BILLING-DAY-OCT-26.md"), "utf8");
  t.ok(Object.keys(C.CONSENT_COVERS).every(v => doc.includes(`| \`${v}\` |`)) && /\*\*Amanda's decision \(2026-10-14\): the `pre-2026-10-01` rows get the launch email\.\*\*/.test(doc)
    && /\| \*\*Yes, as the launch email\*\*, once signup is open/.test(doc), "4c the runbook tables every version and records the launch decision for the legacy rows");

  t.summary("consentCoverage.test");
})();
