// netlify/functions/_lib/onboardingCounts.js
// -----------------------------------------------------------------------------
// ONBOARDING COUNTS: WHAT THE SERVER ACCEPTS AND HOW IT BUCKETS IT (2026-10-23). The app sends one event
// (src/lib/onboardingCounts.js); activation.js reads the account's signup time itself and turns the event into
// count-only rows for public.onboarding_counts (migration 0028), keyed by signup day in Toronto. No account id,
// address, IP or free text is kept: a row is a day, an event, a detail from the fixed lists below, and a number.
//
//   onboarding_step_completed  detail = one of ONBOARDING_STEPS
//   first_number_shown         two rows: "<mode>:signup:<bucket>" (from the account's created_at, read here) and,
//                              when the app sent it, "<mode>:signin:<bucket>" (from the device's first sign-in)
//   bank_link_*                detail = ""
// -----------------------------------------------------------------------------
"use strict";

const ONBOARDING_STEPS = Object.freeze(["welcome", "bank", "balance", "income", "bills", "debts"]);
const BANK_LINK_EVENTS = Object.freeze(["bank_link_started", "bank_link_completed", "bank_link_failed", "bank_link_cancelled"]);
const ONBOARDING_EVENTS = Object.freeze(["onboarding_step_completed", "first_number_shown", ...BANK_LINK_EVENTS]);
const MODES = Object.freeze(["manual", "linked"]);
const BUCKETS = Object.freeze(["under_60", "60_120", "120_180", "over_180"]);
const MAX_SIGNIN_MS = 90 * 24 * 3600 * 1000;   // a longer gap is not a first session's

// Under 60 s, 60 to 120, 120 to 180, over 180.
function timeBucket(ms) {
  if (!Number.isFinite(ms) || ms < 0) return null;
  if (ms < 60000) return "under_60";
  if (ms < 120000) return "60_120";
  if (ms < 180000) return "120_180";
  return "over_180";
}

// The rows one event adds, or null when the event is not one we count (the caller answers 400).
function onboardingRows(body, createdAt, now = new Date()) {
  const event = body && typeof body.metric === "string" ? body.metric : null;
  if (!ONBOARDING_EVENTS.includes(event)) return null;
  if (event === "onboarding_step_completed") {
    return ONBOARDING_STEPS.includes(body.detail) ? [{ event, detail: body.detail }] : null;
  }
  if (event === "first_number_shown") {
    if (!MODES.includes(body.mode)) return null;
    const created = new Date(createdAt).getTime();
    const fromSignup = Number.isFinite(created) ? timeBucket(now.getTime() - created) : null;
    const rows = fromSignup ? [{ event, detail: `${body.mode}:signup:${fromSignup}` }] : [];
    const ms = Number(body.fromSigninMs);
    const fromSignin = body.fromSigninMs != null && ms <= MAX_SIGNIN_MS ? timeBucket(ms) : null;
    if (fromSignin) rows.push({ event, detail: `${body.mode}:signin:${fromSignin}` });
    return rows;
  }
  return [{ event, detail: "" }];
}

module.exports = { ONBOARDING_STEPS, BANK_LINK_EVENTS, ONBOARDING_EVENTS, MODES, BUCKETS, timeBucket, onboardingRows };
