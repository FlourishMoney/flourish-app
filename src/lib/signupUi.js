// src/lib/signupUi.js
// -----------------------------------------------------------------------------
// WHAT THE SIGN-UP SCREEN SHOWS, given what the server said about the door.
//
// The store apps bundle this code at build time, so a shipped binary cannot know whether Amanda has
// opened signup since. It asks the server (beta.js action "signup_status") and renders from the
// answer. That makes the answer's ABSENCE the important case, not its presence: offline, on a plane,
// behind a captive portal, or with the function down, the screen must look exactly as it does today,
// with the code field in place. So anything that is not a clear yes keeps the field.
//
// Pure, so the rule can be tested without a DOM: three booleans in, three booleans out.
// -----------------------------------------------------------------------------

// The server's answer, read defensively. Only `openSignup: true` is a yes; a 500's HTML, an empty
// body, a network throw and a well-formed no all mean the same thing here.
export function statusFromResponse(out) {
  return !!out && out.openSignup === true;
}

/**
 * @param {object} o
 * @param {boolean|null} o.openSignup     true / false / null while the answer is still in flight
 * @param {boolean} o.showCodeField       the person tapped "Have an invite code?"
 * @returns {{codeRequired: boolean, showField: boolean, showLink: boolean}}
 */
export function signupCodeState({ openSignup, showCodeField = false } = {}) {
  const codeRequired = openSignup !== true;
  return {
    codeRequired,
    showField: codeRequired || showCodeField,
    showLink: !codeRequired && !showCodeField,
  };
}

// Can Create Account be pressed? The code half of it; email and password are checked beside this.
export function signupSubmittable({ openSignup, code = "" } = {}) {
  return !signupCodeState({ openSignup }).codeRequired || String(code).trim().length > 0;
}

// THE LANDING'S WAITLIST AREA (billing day, approved by ChatGPT and Grok, 2026-10-15; no flash, 2026-10-22). What
// the landing shows, from the one /api/founding answer ({ spotsLeft, openSignup }, foundingOffer.js):
//   "founding"  the trial-first page (approved Oct 22): the main button and the founding list form. This is
//               also what shows BEFORE the answer arrives and when the call fails or times out: flourish
//               launched on October 20, so the launch-news waitlist must never show on a guess.
//   "waitlist"  ONLY an actual answer with openSignup false: signup shut, the waitlist page as it was.
//   "account"   ONLY an actual answer with spotsLeft 0 (and signup not shut): "Create your account".
// No date gate and no hold: a page that guessed "founding" and is then told otherwise switches once.
// A store app never shows the landing's forms: "waitlist", and nothing is asked.
export function landingWaitlistArea({ answer = null, native = false } = {}) {
  if (native) return "waitlist";
  if (answer && answer.openSignup === false) return "waitlist";
  if (answer && answer.spotsLeft === 0) return "account";
  return "founding";
}
