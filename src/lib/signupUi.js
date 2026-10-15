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

// THE LANDING'S WAITLIST FORMS (billing day, 2026-10-15). The waitlist consent promises an email at launch.
// After the launch (signup open) the only waitlist email is the founding link email, and only a household
// that joins while a founding spot is left gets one (netlify/functions/_lib/waitlistConsent.js). So once
// signup is open AND the spots read 0, a new joiner would get no email at all: the forms go. Anything less
// certain (not asked yet, no answer, a count not read) keeps them, as the page is today.
export function showWaitlistForms({ openSignup, spotsLeft } = {}) {
  return !(openSignup === true && spotsLeft === 0);
}

// The landing's ONE signup_status read per page load. Never throws: anything but a clear yes is false.
let _signupStatus = null;
export function sharedSignupStatus(base = "", fetchImpl = (typeof fetch === "function" ? fetch : null)) {
  if (!_signupStatus) {
    _signupStatus = (async () => {
      if (!fetchImpl) return false;
      try {
        const res = await fetchImpl(`${base}/api/beta`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "signup_status" }),
        });
        return statusFromResponse(await res.json().catch(() => ({})));
      } catch {
        return false;
      }
    })();
  }
  return _signupStatus;
}
// For tests: forget the shared answer.
export function _resetSharedSignupStatus() { _signupStatus = null; }
