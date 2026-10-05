// netlify/functions/_lib/waitlistConsent.js
// -----------------------------------------------------------------------------
// THE WAITLIST CONSENT RECORD (CASL). What a person agreed to, by version, and where they could sign up.
//
// Canada's anti-spam law needs express consent for commercial email, and proof of it: which wording the
// person saw and when they agreed. The form shows the wording below; join_waitlist refuses a signup that
// does not carry the current version, and stores that version with a timestamp (consent_version,
// consented_at, migration 0012). Changing a word means a NEW version here, never an edit to an old one:
// a stored version must always resolve to the exact wording that person saw.
//
// src/lib/waitlistConsent.js is the browser's copy of the same constants; tests/waitlistCasl.test.cjs
// fails if the two ever differ.
// -----------------------------------------------------------------------------
"use strict";

// 2026-10-05: one line under the button, with every CASL element in it (purpose, sender, mailing
// address, contact, unsubscribe). It replaced 2026-10-01's two lines, which stay below, word for word,
// for the rows that saw them.
const CONSENT_VERSION = "2026-10-05";

const CONSENT_TEXT = "We'll email you when flourish launches in Canada, plus a few updates before then. From GrowSmart Inc. (flourish), PO Box 29, Foxboro ON K0K 2B0, hello@flourishmoney.app. Unsubscribe any time.";
// The sender's identity on its own: the welcome email's footer (waitlistWelcome.js), and the second of
// the two lines version 2026-10-01 showed.
const IDENTITY_TEXT = "flourish is made by GrowSmart Inc., PO Box 29, Foxboro ON K0K 2B0, hello@flourishmoney.app. You can unsubscribe at any time.";

// Every version ever shown, with its exact words. Rows from before the consent line existed carry
// LEGACY_CONSENT_VERSION (set by migration 0012); it has no wording because none was shown.
const CONSENT_VERSIONS = {
  "2026-10-01": { consent: "Email me when flourish launches in Canada, plus a few updates before then. Unsubscribe any time.", identity: IDENTITY_TEXT },
  "2026-10-05": { consent: CONSENT_TEXT, identity: null }, // the identity is inside the one line
};
const LEGACY_CONSENT_VERSION = "pre-2026-10-01";

// WHERE ON THE PAGE the form sat (stored in metadata.placement). The homepage form tags "hero" and
// "bottom_cta" ("landing" is the form's own default); the benefit calendar and CCB clawback pages will use
// "calendar" and "clawback". Anything else is refused: it is our own code, so an unknown value is a bug.
const WAITLIST_PLACEMENTS = ["landing", "hero", "bottom_cta", "calendar", "clawback"];

// WHICH CAMPAIGN brought them (stored in the source column). The campaign links carry ?src=<one of these>.
// A known src is stored as is; an unknown or missing one is stored as "direct". The column never holds
// free text and is never empty.
const WAITLIST_SRCS = ["ig", "fb", "tt", "calendar", "clawback", "email", "press", "meta_a", "meta_b"];
const WAITLIST_SRC_DEFAULT = "direct";
function waitlistSourceFor(src) {
  const v = typeof src === "string" ? src.trim().toLowerCase() : "";
  return WAITLIST_SRCS.includes(v) ? v : WAITLIST_SRC_DEFAULT;
}

// Launch is Canada only (Amanda, 2026-09-30): every waitlist row is stored as Canada, whatever a
// client sends, and the form offers no other country.
const WAITLIST_COUNTRY = "CA";

// THE ONE RULE FOR WHO MAY BE EMAILED. Every waitlist send asks this first.
//   - An unsubscribed row gets nothing, of any kind.
//   - A row whose consent predates the consent line (LEGACY_CONSENT_VERSION, or no version at all) only
//     ever gets the launch-day email: those people asked to hear when flourish launches, and agreed to
//     nothing else. Any other kind ("welcome", "update", ...) skips them.
//   - A row with current consent may get any waitlist email.
// kind is "launch" for the launch-day email and anything else for every other waitlist email.
function mayEmailWaitlistRow(row, kind) {
  if (!row || row.unsubscribed_at) return false;
  if (kind === "launch") return true;
  const v = row.consent_version;
  return !!v && v !== LEGACY_CONSENT_VERSION && Object.prototype.hasOwnProperty.call(CONSENT_VERSIONS, v);
}

module.exports = { CONSENT_VERSION, CONSENT_TEXT, IDENTITY_TEXT, CONSENT_VERSIONS, LEGACY_CONSENT_VERSION, WAITLIST_PLACEMENTS, WAITLIST_SRCS, WAITLIST_SRC_DEFAULT, waitlistSourceFor, WAITLIST_COUNTRY, mayEmailWaitlistRow };
