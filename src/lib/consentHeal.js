// src/lib/consentHeal.js
// -----------------------------------------------------------------------------
// Pure decision core for the AI-consent client self-heal.
//
// The server consent gate (netlify/functions/coach.js) now requires an affirmative consent record and
// blocks with 403 ai_consent_required otherwise. That is correct, but it can strand a user whose
// consent was granted in the UI yet never durably written server-side (the accept POST was
// fire-and-forget and could be lost). Such a user believes they consented, sees the disclosure no
// more, and would be permanently locked out.
//
// The self-heal recovers exactly that case — WITHOUT becoming a bypass. The whole safety of it rests
// on one distinction, kept explicit here so it cannot blur:
//
//   "consent was granted but the server write was lost"  → recoverable → re-post + retry (heal)
//   "consent was never granted"                          → NOT recoverable here → route to disclosure
//
// Local acceptance state is the only thing that separates the two. If the user never accepted the
// disclosure locally, we must send them through disclosure — never silently re-consent them.
// -----------------------------------------------------------------------------

// Decide how the client should react to a coach response that may be a consent block.
//   status, errorCode  — from the coach HTTP response.
//   localAccepted      — the localStorage flag acceptAIDisclosure sets (=== "1"). TRUE means the user
//                        previously went through the disclosure and accepted.
//   healedThisSession  — we already attempted a self-heal this page-load.
// Returns:
//   "none"     — not a consent block; proceed normally.
//   "heal"     — granted locally but the server has no record → re-post accept_consent, retry once.
//   "disclose" — either never accepted, or a heal was already tried and still failed → show disclosure.
export function decideConsentAction({ status, errorCode, localAccepted, healedThisSession }) {
  if (status !== 403 || errorCode !== "ai_consent_required") return "none";
  // Never granted locally → the user must go through disclosure, not get silently re-consented.
  if (!localAccepted) return "disclose";
  // Already healed once this session and still blocked → stop; do not loop. Surface disclosure.
  if (healedThisSession) return "disclose";
  // Granted locally, server has no record, first attempt this session → recoverable.
  return "heal";
}

// After awaiting the accept_consent POST at disclosure time, decide whether the user may proceed as
// though consent is recorded.
//   hadJwt — whether an authenticated request was actually made. FALSE is the anonymous/demo path:
//            there is no server user to record consent for, so proceeding is correct.
//   ok     — the server acknowledged the write.
// A logged-in user whose write FAILED must NOT proceed as if consent were recorded — otherwise they
// fall straight into the lockout this whole mechanism exists to prevent.
export function canProceedAfterAccept({ hadJwt, ok }) {
  return hadJwt === false || ok === true;
}
