// src/lib/signupUi.js
// -----------------------------------------------------------------------------
// WHAT THE SIGN-UP SCREEN SHOWS, given what the server said about the door.
//
// The store apps bundle this code at build time, so a shipped binary cannot know whether Amanda has
// opened signup since. It asks the server (beta.js action "signup_status") and renders from the
// answer. There are three answers, not two (audit H12, 2026-10-26):
//   true            signup is open: no code field and no invite link (audit H11: the link is hidden while
//                   signup is open, so nobody wonders whether they need a code)
//   false           the server said, in a well-formed 200, that signup is invite-only: the code field
//   "unavailable"   no answer could be read (offline, a captive portal, a 5xx, an HTML error page): NOT the
//                   same as closed. The screen never asks for a beta code on an error. It says the check failed
//                   and offers to try again, and Create Account still works, because the server decides in the
//                   end anyway (beta.js refuses a codeless signup while the door is shut).
// While the answer is in flight (null) nothing about codes shows either.
//
// Pure, so the rule can be tested without a DOM.
// -----------------------------------------------------------------------------

export const SIGNUP_STATUS_UNAVAILABLE = "unavailable";

// The server's answer, read defensively. `ok` is the HTTP answer's res.ok. Only a 200 whose body says
// openSignup true or false is an answer; a 500's HTML, an empty body, a network throw (null) and anything
// else are "unavailable".
export function statusFromResponse(out, { ok = true } = {}) {
  if (!ok || !out || typeof out !== "object") return SIGNUP_STATUS_UNAVAILABLE;
  if (out.openSignup === true) return true;
  if (out.openSignup === false) return false;
  return SIGNUP_STATUS_UNAVAILABLE;
}

// How long to wait before each ask: at once, then twice more, before the screen says the check failed.
export const SIGNUP_STATUS_RETRY_MS = Object.freeze([0, 2000, 5000]);

/**
 * @param {object} o
 * @param {boolean|"unavailable"|null} o.openSignup   true / false / "unavailable" / null while in flight
 * @returns {{codeRequired: boolean, showField: boolean, showLink: boolean, unavailable: boolean}}
 */
export function signupCodeState({ openSignup } = {}) {
  const codeRequired = openSignup === false;
  return {
    codeRequired,
    showField: codeRequired,
    showLink: false,
    unavailable: openSignup === SIGNUP_STATUS_UNAVAILABLE,
  };
}

// Can Create Account be pressed? The code half of it; email and password are checked beside this.
export function signupSubmittable({ openSignup, code = "" } = {}) {
  return !signupCodeState({ openSignup }).codeRequired || String(code).trim().length > 0;
}

// INLINE FIELD ERRORS (audit H11). An error shows once the person has left the field (or tried to submit), and
// never while they are still typing their first go at it. The email test is the waitlist form's.
export const SIGNUP_EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const SIGNUP_PASSWORD_MIN = 8;
export function fieldErrors({ mode = "signup", email = "", password = "", touched = {} } = {}) {
  return {
    email: !!touched.email && !SIGNUP_EMAIL_RX.test(String(email)),
    password: mode === "signup" && !!touched.password && String(password).length < SIGNUP_PASSWORD_MIN,
  };
}

// ── WORDS ─────────────────────────────────────────────────────────────────────────────────────────────
// New lines for the sign-up card are NOT written here: each is a [WORDS: …] placeholder until the approved
// words are in (docs/product/SIGNUP-PATH-WORDS.md lists each one with what it must say and its limit).
export const SIGNUP_COPY = Object.freeze({
  statusUnavailable: "[WORDS: signup-status-unavailable]",
  emailError: "[WORDS: signup-email-error]",
  passwordError: "[WORDS: signup-password-error]",
  mailNotSent: "[WORDS: signup-mail-not-sent]",
});

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
