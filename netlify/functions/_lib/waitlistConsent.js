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

const { openSignupEnabled } = require("./signupGate");

// 2026-10-06: the purpose and unsubscribe, with "Contact" linking to the page's Contact block, which
// names the sender, its mailing address and its contact (the owner keeps the company name and address
// out of the form). Every earlier version stays below, word for word, for the rows that saw it.
const CONSENT_VERSION = "2026-10-06";

const CONSENT_TEXT = "We'll email you when flourish launches in Canada, plus a few updates before then. Unsubscribe any time. Who we are: see Contact below.";
// The sender's identity on its own: the welcome email's footer (waitlistWelcome.js), and the second of
// the two lines version 2026-10-01 showed.
const IDENTITY_TEXT = "flourish is made by GrowSmart Inc., PO Box 29, Foxboro ON K0K 2B0, hello@flourishmoney.app. You can unsubscribe at any time.";

// Every version ever shown, with its exact words. Rows from before the consent line existed carry
// LEGACY_CONSENT_VERSION (set by migration 0012); it has no wording because none was shown.
const CONSENT_VERSIONS = {
  "2026-10-01": { consent: "Email me when flourish launches in Canada, plus a few updates before then. Unsubscribe any time.", identity: IDENTITY_TEXT },
  "2026-10-05": { consent: "We'll email you when flourish launches in Canada, plus a few updates before then. From GrowSmart Inc. (flourish), PO Box 29, Foxboro ON K0K 2B0, hello@flourishmoney.app. Unsubscribe any time.", identity: null }, // the identity is inside the one line
  "2026-10-06": { consent: CONSENT_TEXT, identity: null, identityAt: "the page's Contact block: flourish is operated by GrowSmart Inc., PO Box 29, Foxboro ON K0K 2B0. hello@flourishmoney.app" },
};
const LEGACY_CONSENT_VERSION = "pre-2026-10-01";

// WHAT EACH VERSION'S WORDS ASKED FOR (billing day review, 2026-10-14). "launch": an email when flourish
// launches in Canada. "updates": a few updates before then. Read from the wording above, word for word.
// The legacy rows have no recorded wording; the form they joined from said (git history, before 2026-09-30)
// "Join the waitlist and we'll email you the moment flourish launches" and, once joined, "We'll email you
// the moment flourish launches. No spam, just the launch news." That asked for the launch email only.
// Every version ever shown is here; tests/consentCoverage.test.cjs fails if one is added without it.
const CONSENT_COVERS = Object.freeze({
  [LEGACY_CONSENT_VERSION]: Object.freeze(["launch"]),
  "2026-10-01": Object.freeze(["launch", "updates"]),
  "2026-10-05": Object.freeze(["launch", "updates"]),
  "2026-10-06": Object.freeze(["launch", "updates"]),
});

// THE FOUNDING LINK EMAIL (_lib/foundingLinkEmail.js) goes to every version whose words asked for updates.
// A version not listed above gets nothing.
const FOUNDING_LINK_CONSENT_VERSIONS = Object.freeze(Object.keys(CONSENT_COVERS).filter(v => CONSENT_COVERS[v].includes("updates")));
function mayEmailFoundingLink(row) {
  return !!row && !row.unsubscribed_at && FOUNDING_LINK_CONSENT_VERSIONS.includes(row.consent_version);
}

// THE CANADA LAUNCH EMAIL, for the pre-2026-10-01 rows only. Amanda's decision (2026-10-14): October 26,
// with signup open (OPEN_SIGNUP), is the Canada launch those rows asked to hear about. Their consent was
// launch news only (CASL), so the email is launch news only: no price, no founding number, no checkout link
// (_lib/foundingLinkEmail.js, kind "canada_launch"). It is the ONE email they ever get (mayEmailWaitlistRow).
const LAUNCH_EMAIL_CONSENT_VERSIONS = Object.freeze([LEGACY_CONSENT_VERSION]);
const CANADA_LAUNCH_KIND = "canada_launch";
// Has this row had its billing-day email already? The sweep records every one in metadata.founding_link
// (kind "founding_link" or "canada_launch"); a row that has it gets nothing more, ever (mayEmailWaitlistRow).
const billingDayEmailSent = (row) => !!(row && row.metadata && typeof row.metadata === "object" && row.metadata.founding_link);

// THE LAUNCH ENDS THE CONSENT. Every version's words asked for an email when flourish launches "plus a few
// updates before then", so nothing else is covered once it has launched (ChatGPT and Grok, 2026-10-15). For
// this rule the launch is signup opening: OPEN_SIGNUP exactly "true" (deploy D2, 2026-10-26), the same
// switch that releases the Canada launch email. From then on the only waitlist emails are the launch emails
// themselves, once per row:
const LAUNCH_EMAIL_KINDS = Object.freeze(["founding_link", CANADA_LAUNCH_KIND]);
// Consent versions reviewed for any OTHER email after the launch. None. A new consent wording that covers
// email after the launch must be reviewed and listed here first (tests/launchEmail.test.cjs pins this list).
const POST_LAUNCH_CONSENT_VERSIONS = Object.freeze([]);

// Which billing-day email this row gets: "founding_link", "canada_launch", or null. `launched` is true only
// once signup is open on billing day (the sweep reads OPEN_SIGNUP). Never both: a row's version decides one.
function foundingEmailKindFor(row, { launched = false } = {}) {
  if (!row || row.unsubscribed_at) return null;
  if (mayEmailFoundingLink(row)) return "founding_link";
  if (launched === true && LAUNCH_EMAIL_CONSENT_VERSIONS.includes(row.consent_version)
      && (CONSENT_COVERS[row.consent_version] || []).includes("launch") && !billingDayEmailSent(row)) return CANADA_LAUNCH_KIND;
  return null;
}

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
//   - A row that has had its founding link email or its Canada launch email gets nothing more, of any kind.
//   - After the launch (signup open), a row gets only those launch emails, unless its consent version was
//     reviewed for more (POST_LAUNCH_CONSENT_VERSIONS, empty): no welcome, no update, no reminder, nothing.
//     The flag is read here, so no caller can leave it out; a caller can add `launched: true`, never remove it.
//   - A pre-2026-10-01 row (consent was launch news only) gets EXACTLY ONE email, ever: the Canada launch
//     email (kind "canada_launch"), once. Every other kind says no, now and later: a welcome, an update, a
//     founding reminder, a store release-day email, a generic "launch", anything (round 5, CASL).
//   - A row with no consent version on record gets nothing (fails closed; 0012 gave every older row one).
//   - Before the launch, a row with current consent (a version the site showed) may get a waitlist email,
//     but never the Canada launch email, which is for the pre-2026-10-01 rows only.
function mayEmailWaitlistRow(row, kind, opts = {}) {
  if (!row || row.unsubscribed_at) return false;
  if (billingDayEmailSent(row)) return false;
  const v = row.consent_version;
  if (kind === CANADA_LAUNCH_KIND) return v === LEGACY_CONSENT_VERSION;
  if (!v || v === LEGACY_CONSENT_VERSION) return false;
  if (!Object.prototype.hasOwnProperty.call(CONSENT_VERSIONS, v)) return false;
  const launched = openSignupEnabled() || (!!opts && opts.launched === true);
  if (launched && !LAUNCH_EMAIL_KINDS.includes(kind) && !POST_LAUNCH_CONSENT_VERSIONS.includes(v)) return false;
  return true;
}

module.exports = { CONSENT_VERSION, CONSENT_TEXT, IDENTITY_TEXT, CONSENT_VERSIONS, LEGACY_CONSENT_VERSION, CONSENT_COVERS, FOUNDING_LINK_CONSENT_VERSIONS, mayEmailFoundingLink, LAUNCH_EMAIL_CONSENT_VERSIONS, CANADA_LAUNCH_KIND, billingDayEmailSent, foundingEmailKindFor, LAUNCH_EMAIL_KINDS, POST_LAUNCH_CONSENT_VERSIONS, WAITLIST_PLACEMENTS, WAITLIST_SRCS, WAITLIST_SRC_DEFAULT, waitlistSourceFor, WAITLIST_COUNTRY, mayEmailWaitlistRow };
