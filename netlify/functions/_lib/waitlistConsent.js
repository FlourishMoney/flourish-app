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

const CONSENT_VERSION = "2026-10-01";

const CONSENT_TEXT = "Email me when flourish launches in Canada, plus a few updates before then. Unsubscribe any time.";
const IDENTITY_TEXT = "flourish is made by GrowSmart Inc., PO Box 29, Foxboro ON K0K 2B0, hello@flourishmoney.app. You can unsubscribe at any time.";

// Every version ever shown, with its exact words. Rows from before the consent line existed carry
// LEGACY_CONSENT_VERSION (set by migration 0012); it has no wording because none was shown.
const CONSENT_VERSIONS = {
  "2026-10-01": { consent: CONSENT_TEXT, identity: IDENTITY_TEXT },
};
const LEGACY_CONSENT_VERSION = "pre-2026-10-01";

// Where a signup may come from. The homepage form tags "hero" and "bottom_cta" ("landing" is the form's
// own default); the benefit calendar and CCB clawback pages will use "calendar" and "clawback".
// Anything else is refused, so the source column only ever holds a value someone chose.
const WAITLIST_SOURCES = ["landing", "hero", "bottom_cta", "calendar", "clawback"];

module.exports = { CONSENT_VERSION, CONSENT_TEXT, IDENTITY_TEXT, CONSENT_VERSIONS, LEGACY_CONSENT_VERSION, WAITLIST_SOURCES };
