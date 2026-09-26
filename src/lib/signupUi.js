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
