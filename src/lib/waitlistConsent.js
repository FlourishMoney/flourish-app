// src/lib/waitlistConsent.js
// The browser's copy of netlify/functions/_lib/waitlistConsent.js: the consent wording the waitlist form
// shows, its version (sent with the signup and stored with the row), and the sources a form may tag.
// tests/waitlistCasl.test.cjs fails if this file and the server's copy ever differ.

export const CONSENT_VERSION = "2026-10-01";

export const CONSENT_TEXT = "Email me when flourish launches in Canada, plus a few updates before then. Unsubscribe any time.";
export const IDENTITY_TEXT = "flourish is made by GrowSmart Inc., PO Box 29, Foxboro ON K0K 2B0, hello@flourishmoney.app. You can unsubscribe at any time.";

export const WAITLIST_SOURCES = ["landing", "hero", "bottom_cta", "calendar", "clawback"];
