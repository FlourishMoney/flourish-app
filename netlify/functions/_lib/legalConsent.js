// netlify/functions/_lib/legalConsent.js
// -----------------------------------------------------------------------------
// THE CONSENT STEP, RECORDED AGAINST THE ACCOUNT (1.1.7, 2026-11-12; migration 0049 legal_consents).
//
// The first step of onboarding, for every new account (email, Apple or Google): a heading, one consent sentence, the
// Terms and the Privacy Policy, each tappable, and Get started. Its words were approved 2026-11-12 (ChatGPT 100, Grok 100;
// docs/product/FIRST-RUN-117-WORDS.md) and are kept here word for word: what the server writes down as "shown" is its own
// copy for the consent id the app names, never text the app sends. tests/legalConsent.test.cjs holds this copy equal to
// the app's (src/lib/firstRunWords.js).
//
// A record: consent_id, the words, the date of the Terms and of the Privacy Policy the app showed (YYYY-MM-DD, the dates
// on those pages), when the step was shown (shown_at) and when the person tapped Get started (recorded_at, from the app's
// agreed_at), both the app's clock and kept only within the last 30 days, and the platform. An app that sends no agreed_at
// (builds before Privacy Policy 1.1.7) sent the tap as shown_at, so that is both times; the server's time when neither is
// usable. shown_at is never later than recorded_at.
// One per account per consent: a retried send changes nothing.
// -----------------------------------------------------------------------------
"use strict";

const CONSENTS = Object.freeze({
  "onboarding-2026-11-12": Object.freeze({
    title: "Before you start",
    line: "By tapping Get started, you agree to the Terms and the Privacy Policy, including how flourish collects and uses your information.",
    button: "Get started",
  }),
});

const DAY = 24 * 60 * 60 * 1000;
const isDate = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;

/** The row to write, or { error } for a send that is not one. The person's own clock is kept only when it is plausible. */
function consentRow(userId, body, platform, now = Date.now()) {
  const b = body && typeof body === "object" ? body : {};
  const words = CONSENTS[b.consent_id];
  if (!words) return { error: "unknown_consent" };
  if (!isDate(b.terms_version) || !isDate(b.privacy_version)) return { error: "bad_version" };
  const plausible = (v) => { const t = Date.parse(v); return Number.isFinite(t) && t <= now + 5 * 60 * 1000 && t >= now - 30 * DAY ? t : null; };
  const agreedAt = plausible(b.agreed_at) ?? (b.agreed_at == null ? plausible(b.shown_at) : null) ?? now;
  const shownAt = Math.min(plausible(b.shown_at) ?? agreedAt, agreedAt);
  return { row: {
    user_id: userId, consent_id: b.consent_id, words: { ...words },
    terms_version: b.terms_version, privacy_version: b.privacy_version,
    shown_at: new Date(shownAt).toISOString(), recorded_at: new Date(agreedAt).toISOString(),
    platform: ["web", "ios", "android"].includes(platform) ? platform : "web",
  } };
}

/** Write it once. { recorded: true } (also when it was already there), or { error }. Never throws. */
async function recordConsent(admin, userId, body, platform, now) {
  const r = consentRow(userId, body, platform, now);
  if (r.error) return r;
  try {
    const { error } = await admin.from("legal_consents").upsert(r.row, { onConflict: "user_id,consent_id", ignoreDuplicates: true });
    return error ? { error: "store_failed" } : { recorded: true };
  } catch { return { error: "store_failed" }; }
}

module.exports = { CONSENTS, consentRow, recordConsent, isDate };
