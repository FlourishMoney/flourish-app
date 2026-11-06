// src/lib/webClarity.js
// -----------------------------------------------------------------------------
// MICROSOFT CLARITY ON THE WEBSITE'S PUBLIC PAGES (Amanda, 2026-11-06). Project z9lh2hoxvh, masking Strict and cookies off,
// both set in Clarity itself.
//
//   - Website only. A native build is compiled with VITE_NATIVE_BUILD=true, which removes the tag's address from the
//     bundle (scripts/check-native-build.mjs --artifact refuses a native dist/ that mentions clarity.ms), and nothing
//     loads inside Capacitor either. The App Store and Play privacy answers don't change.
//   - Public pages only (clarityPage): the landing, the demo, privacy and terms, signed out. Never a signed-in screen,
//     the sign-in or sign-up form, onboarding, checkout, /confirmed, a reset link, /support or /delete-account. The
//     static pages (/get, the guides) load it with public/clarity/loader.js, under the same rules.
//   - Never where the edge says no (netlify/edge-functions/clarity-gate.js): Quebec, the EEA, the UK, Switzerland, a place
//     it cannot name, or before CLARITY_ENABLED is on. The answer is asked for on each visit and never kept here.
//   - Never with a query string or a hash in the address (an email, a token, a checkout id would go with the page URL).
//   - After the page is interactive: the load event, then the browser's next idle moment.
//   - STOPPED FOR THE REST OF THE VISIT the moment a page that may not be recorded shows (signing in, the sign-in form,
//     a reset link, any other screen): clarity("stop"), and it is never started again in that visit.
// -----------------------------------------------------------------------------

import { isNativeApp } from "./billingVisibility.js";

export const CLARITY_PROJECT = "z9lh2hoxvh";
// Compiled out of a native build: Vite replaces the flag with a constant and the minifier drops the address.
export const CLARITY_TAG_SRC = import.meta.env.VITE_NATIVE_BUILD === "true" ? "" : "https://www.clarity.ms/tag/z9lh2hoxvh";
export const CLARITY_GATE = "/api/clarity-gate";
// The app's public pages Clarity may record, as webAnalytics.analyticsPage names them. /support is not one of them.
export const CLARITY_PAGES = Object.freeze(["/", "/demo", "/privacy", "/terms"]);
const IDLE_TIMEOUT_MS = 4000;

// The page Clarity may record, or null. analyticsPath: webAnalytics.analyticsPage(...), which is already null for a
// signed-in household, a store app, a reset link and before sign-in is known. authForm: the sign-in or sign-up form is open.
export function clarityPage(analyticsPath, { authForm = false } = {}) {
  if (authForm) return null;
  return CLARITY_PAGES.includes(analyticsPath) ? analyticsPath : null;
}

// No query string and no hash (beyond a bare "#").
export function cleanAddress(win) {
  const l = win && win.location;
  return !!l && !l.search && (!l.hash || l.hash === "#");
}

let _page = null;        // the public page now showing, or null
let _authForm = false;   // the sign-in or sign-up form is open
let _state = "idle";     // idle → waiting (for the page to be interactive and the edge's answer) → loaded; or stopped, for good

function allowedNow(win) {
  return !!_page && !_authForm && !!CLARITY_TAG_SRC && !!win && !!win.document && !isNativeApp(win) && cleanAddress(win);
}

function whenInteractive(win, fn) {
  const idle = () => (typeof win.requestIdleCallback === "function" ? win.requestIdleCallback(fn, { timeout: IDLE_TIMEOUT_MS }) : win.setTimeout(fn, 1500));
  if (win.document.readyState === "complete") idle();
  else win.addEventListener("load", idle, { once: true });
}

async function edgeSaysYes(win) {
  try {
    const r = await win.fetch(CLARITY_GATE, { credentials: "omit", cache: "no-store" });
    if (!r || !r.ok) return false;
    const j = await r.json();
    return !!j && j.load === true;
  } catch { return false; }
}

// The tag as Microsoft gives it: a queue for calls made before the script arrives, then the script.
function inject(win) {
  win.clarity = win.clarity || function () { (win.clarity.q = win.clarity.q || []).push(arguments); };
  const s = win.document.createElement("script");
  s.async = true;
  s.src = CLARITY_TAG_SRC;
  win.document.head.appendChild(s);
}

function update(win) {
  if (_state === "stopped") return;
  if (!allowedNow(win)) {
    if (_state === "loaded" && win && typeof win.clarity === "function") win.clarity("stop");
    if (_state !== "idle") _state = "stopped";
    return;
  }
  if (_state !== "idle") return;
  _state = "waiting";
  whenInteractive(win, async () => {
    if (_state !== "waiting" || !allowedNow(win)) return;
    const yes = await edgeSaysYes(win);
    if (_state !== "waiting") return;
    if (!yes || !allowedNow(win)) { _state = "stopped"; return; }
    inject(win);
    _state = "loaded";
  });
}

// The public page now showing (clarityPage), or null.
export function setClarityPage(page, win = typeof window === "undefined" ? undefined : window) {
  _page = page || null;
  update(win);
}

// The landing's sign-in or sign-up form opened (true) or closed (false).
export function setClarityAuthForm(open, win = typeof window === "undefined" ? undefined : window) {
  _authForm = !!open;
  update(win);
}

// Tests only.
export function _clarityState() { return _state; }
export function _resetClarity() { _page = null; _authForm = false; _state = "idle"; }
