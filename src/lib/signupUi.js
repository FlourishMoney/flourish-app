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

// THE LANDING'S WAITLIST AREA (billing day, approved by ChatGPT and Grok, 2026-10-15). What the hero form and
// the bottom form show, from the one /api/founding answer ({ spotsLeft, openSignup }, foundingOffer.js):
//   "waitlist"  signup shut: the page exactly as it is today ("Join the waitlist", the launch consent line);
//   "founding"  signup open and founding spots remain: "Get my founding spot" and the founding spot line
//               (consent version 2026-10-26, the founding link email only);
//   "account"   signup open and all 50 spots taken: no form; "Create your account", which opens sign-up.
//   "hold"      the answer is not in yet, from launch day on: the area keeps its space and shows nothing,
//               so a form is never shown and then swapped or removed a moment later. Before launch day
//               signup is shut (it opens on October 26, deploy D2), so the page shows today's form at
//               once, exactly as it does now, and nothing is held.
// Anything not a clear answer is "waitlist", as today: the server refuses a signup carrying the wrong
// wording, so a page that guessed wrong is told to refresh, never recorded under words it did not show.
// A store app never shows the landing's forms: "waitlist", and nothing is asked.
export const LAUNCH_DAY = Date.parse("2026-10-26T00:00:00-04:00");
// The longest the area is held. After it, the page settles on today's form and keeps it.
export const LANDING_HOLD_MS = 4000;
export function landingWaitlistArea({ answer = null, now = Date.now(), native = false } = {}) {
  if (native) return "waitlist";
  if (!answer) return Number.isFinite(now) && now >= LAUNCH_DAY ? "hold" : "waitlist";
  if (answer.openSignup !== true) return "waitlist";
  return answer.spotsLeft === 0 ? "account" : "founding";
}
