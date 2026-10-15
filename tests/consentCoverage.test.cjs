// tests/consentCoverage.test.cjs
// -----------------------------------------------------------------------------
// WHICH CONSENT VERSIONS THE FOUNDING LINK EMAIL MAY GO TO (billing day, round 3).
//
// Every consent version the waitlist ever recorded, what its words asked for, and the rule the founding
// link email follows: every version whose words asked for updates, and no other. Pinned here:
//   1. every version ever shown is classified (a new one cannot slip in unreviewed);
//   2. each classification is read from that version's own words;
//   3. the founding link email goes to 2026-10-01, 2026-10-05 and 2026-10-06, and not to pre-2026-10-01
//      (launch email only: a human decision, not a guess) or to any version the site never showed;
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
  for (const [why, v] of [["pre-2026-10-01 (a human decision)", C.LEGACY_CONSENT_VERSION], ["a version the site never showed", "2026-10-07"], ["no version", null]]) {
    t.eq(E.foundingLinkEmailPayload("household@example.test", row(v)), null, `3c ${why}: no email`);
    t.eq(C.mayEmailFoundingLink(row(v)), false, `3d ${why}: the rule says no`);
  }
  t.eq(C.mayEmailFoundingLink(row("2026-10-06", { unsubscribed_at: "2026-10-20T00:00:00Z" })), false, "3e unsubscribed: never");
  t.eq(C.mayEmailWaitlistRow(row(C.LEGACY_CONSENT_VERSION), "launch"), true, "3f (unchanged) the legacy rows may still get the launch email itself");

  // ── 4. the sweep asks for exactly those versions ────────────────────────────────────────────────
  const sweep = fs.readFileSync(path.join(REPO, "netlify", "functions", "founding-link-sweep.js"), "utf8");
  t.ok(/&consent_version=in\.\(\$\{FOUNDING_LINK_CONSENT_VERSIONS\.map\(encodeURIComponent\)\.join\(","\)\}\)/.test(sweep), "4a the sweep's query names exactly those versions");
  t.ok(/!mayEmailFoundingLink\(row\)/.test(sweep), "4b …and checks each row again");
  const doc = fs.readFileSync(path.join(REPO, "docs", "ops", "BILLING-DAY-OCT-26.md"), "utf8");
  t.ok(Object.keys(C.CONSENT_COVERS).every(v => doc.includes(`| \`${v}\` |`)) && /\*\*Human decision: the `pre-2026-10-01` rows\.\*\*/.test(doc),
    "4c the runbook tables every version and flags the legacy rows as a human decision");

  t.summary("consentCoverage.test");
})();
