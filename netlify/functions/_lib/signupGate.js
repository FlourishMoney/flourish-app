// netlify/functions/_lib/signupGate.js
// -----------------------------------------------------------------------------
// WHO MAY CREATE AN ACCOUNT, AND WHAT KIND OF SIGNUP IT IS.
//
// Until the store launch, the only way in is an invite code: beta.js validates it against BETA_CODES
// and fails CLOSED when that variable is unset. That is correct for a private beta and wrong for a
// public app store listing, where the first thing a stranger does is tap "Create account".
//
// So the door is built now and left shut behind a server flag. OPEN_SIGNUP is read on the server, in
// this process, and never reaches the browser bundle — the store apps bundle the web code at build
// time, so a build-time flag would freeze whatever value was true on the day the binary was cut, and
// Amanda could not change it without a new App Store review.
//
// THE FLAG IS OFF UNLESS IT IS EXACTLY "true". Not "1", not "yes", not "TRUE " with a stray space:
// this matches ENFORCE_PLAN_LIMITS and BILLING_ENABLED, the two flags already in these functions, and
// an unset or misspelt variable must mean the door stays shut rather than "probably open".
//
// PURE. decideSignup takes the code, the flag and a validator, and returns a decision. No env, no
// network, no storage, so the rule can be tested without a database or an HTTP request.
// -----------------------------------------------------------------------------

"use strict";

// Read once per call, never cached: Netlify can change an environment variable between invocations of
// a warm function, and Amanda turning the door on should not need a redeploy to take effect.
function openSignupEnabled(env = process.env) {
  return (env && env.OPEN_SIGNUP) === "true";
}

/**
 * @param {object}   o
 * @param {string}   o.code          the code the person typed; "" or absent means they typed none
 * @param {boolean}  o.open          openSignupEnabled()
 * @param {Function} o.isValidCode   (code) => boolean, beta.js's validateBetaCode (fails closed)
 * @returns {{allow: boolean, source?: "invited"|"self_serve", usedCode: boolean, error?: string}}
 *
 * Three cases, in this order:
 *   a code was typed      -> it must be valid, whether the door is open or not. A wrong code is
 *                            always wrong: someone holding a code that no longer works needs to be
 *                            told so, not quietly let in as a self-serve signup under a different
 *                            cohort and a different cap.
 *   no code, door shut    -> invalid_code, byte for byte what today's build answers.
 *   no code, door open    -> in, as self_serve.
 *
 * `source` is what signup_completed reports, so the two cohorts stay separable in the funnel after
 * the door opens: `invited` is someone who was handed a code, `self_serve` is a stranger.
 */
function decideSignup({ code, open, isValidCode }) {
  const supplied = String(code == null ? "" : code).trim();
  if (supplied) {
    return isValidCode(supplied)
      ? { allow: true, source: "invited", usedCode: true }
      : { allow: false, error: "invalid_code", usedCode: true };
  }
  if (!open) return { allow: false, error: "invalid_code", usedCode: false };
  return { allow: true, source: "self_serve", usedCode: false };
}

module.exports = { openSignupEnabled, decideSignup };
