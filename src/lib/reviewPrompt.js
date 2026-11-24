// src/lib/reviewPrompt.js
// -----------------------------------------------------------------------------
// The store review prompt: the thin, impure half of reviewRules.js.
//
// This file owns the per-install record (localStorage) and the call into the native plugin. Every
// decision is reviewRules.decideReviewAsk. Nothing here shows any screen of its own: the only UI is
// the store's sheet, and the store decides whether to show even that.
//
// Three moments may ask (reviewRules.js): a money meeting marked done, the first safe-to-spend number (about 3 seconds
// after it shows) and the 3rd different day the app is opened. The last two come once per install.
//
// The plugin is the app's own FlourishReview (version 1.1, item 4): Apple's current API,
// AppStore.requestReview(in:), on iOS (ios/App/App/FlourishReviewPlugin.swift), and Google's in-app review
// API on Android (android/.../FlourishReviewPlugin.java). It is looked up only at the moment of asking,
// and only on a native shell, so the web never touches it and never writes the record. On the web every
// function here returns without doing anything.
// -----------------------------------------------------------------------------

import {
  decideReviewAsk, normalizeReviewState, withTrouble, withAsked, withOpenDay, withMomentSpent, localDayKey, REVIEW_TRIGGERS, FIRST_SAFE_DELAY_MS,
  REVIEW_SESSION_GAP_MINUTES,
} from "./reviewRules.js";

// Deliberately NOT under the "flourish_" prefix: sign-out and the shared-device wipe remove every
// flourish_* key, and this record is per INSTALL. Wiped with the rest, signing out and back in would
// reset both the three-a-year limit and the memory of recent trouble.
export const REVIEW_STORAGE_KEY = "flourishReviewPrompt_v1";

function isNative() {
  try { return typeof window !== "undefined" && window.Capacitor?.isNativePlatform?.() === true; }
  catch { return false; }
}

function load() {
  try { return normalizeReviewState(JSON.parse(window.localStorage.getItem(REVIEW_STORAGE_KEY) || "null")); }
  catch { return normalizeReviewState(null); }
}

function save(state) {
  try { window.localStorage.setItem(REVIEW_STORAGE_KEY, JSON.stringify(state)); } catch {}
}

// Something went wrong (an error, a failed bank link, a declined payment, a refused coach message). Safe to
// call from anywhere, including error handlers: it never throws.
export function noteReviewTrouble(now = new Date()) {
  if (!isNative()) return;
  try { save(withTrouble(load(), now)); } catch {}
}

// Tests only: a stand-in for the native plugin (node cannot load it).
let _pluginForTest = null;
export function _setReviewPluginForTest(plugin) { _pluginForTest = plugin; }

// The reasons a once-per-install moment passes without being spent: it never came (web, demo), it already had, or this
// session already asked (it waits for a later session).
const NOT_A_MOMENT = ["web", "demo", "unknown_trigger", "moment_spent", "not_third_day", "session_already_asked"];

// THE APP SESSION (review round 1): at most one ask per session. A session starts when the app loads, and again when it
// comes back after REVIEW_SESSION_GAP_MINUTES or more in the background. Kept in memory only: a new launch is a new session.
const SESSION_GAP_MS = REVIEW_SESSION_GAP_MINUTES * 60 * 1000;
let _askedThisSession = false;
let _hiddenAt = null;

function inForeground() {
  try { return typeof document === "undefined" || document.visibilityState !== "hidden"; } catch { return true; }
}

// prepare: for the third day, the record with today counted (and saved) before the decision.
async function askIfAllowed(trigger, { demo = false, now = new Date(), meetingKey = localDayKey(now), prepare = null } = {}) {
  const native = isNative();
  let state = native ? load() : null;
  if (native && !demo && prepare) {
    const next = prepare(state);
    if (JSON.stringify(next) !== JSON.stringify(state)) save(next);   // a day already counted writes nothing
    state = next;
  }
  const decision = decideReviewAsk({ state, trigger, now, native, demo, meetingKey, askedThisSession: _askedThisSession });
  // A once-per-install moment has come: spent now, whether or not the rules let it ask.
  if (native && !demo && trigger !== REVIEW_TRIGGERS.MEETING_DONE && !NOT_A_MOMENT.includes(decision.reason)) {
    state = withMomentSpent(state, trigger, now);
    save(state);
  }
  if (!decision.ask) return decision;
  // Recorded BEFORE the call: if the plugin throws or the app is killed mid-sheet, the next launch
  // must still see that Flourish asked, rather than asking again.
  save(withAsked(state, now, trigger === REVIEW_TRIGGERS.MEETING_DONE ? meetingKey : null));
  _askedThisSession = true;
  try {
    if (_pluginForTest) await _pluginForTest.requestReview();
    else {
      const { registerPlugin } = await import("@capacitor/core");
      await registerPlugin("FlourishReview").requestReview();
    }
  } catch {}
  return decision;
}

// A money meeting was just marked done. Each completed meeting may ask once, at most three times in
// any 365 days, never within 24 hours of trouble, and never in demo mode (reviewRules.js).
export function reviewOnMeetingDone(opts = {}) {
  return askIfAllowed(REVIEW_TRIGGERS.MEETING_DONE, opts);
}

// The first safe-to-spend number has just shown (the first-number screen, or Today). About 3 seconds later, once per
// install, it may ask, under the same limits (reviewRules.js). Review round 1: the wait is cancellable, and the caller
// cancels it when the number leaves the screen or the demo starts; the app going to the background cancels it too. Right
// before asking it checks again: a phone app, not the demo, in the foreground, the number still on screen. Any of those
// failing means no ask, and the moment is not spent (it comes again the next time the number shows). A second showing
// replaces the first wait. Returns a promise of the decision, with cancel().
//   onScreen  () => is the number still on screen?   isDemo  () => is the demo on now?
let _firstSafe = null;   // the wait in progress: { timer, finish }
function endFirstSafe(reason) {
  const w = _firstSafe;
  if (!w) return;
  _firstSafe = null;
  clearTimeout(w.timer);
  w.finish({ ask: false, reason });
}
export function reviewOnFirstSafe({ demo = false, now = null, delayMs = FIRST_SAFE_DELAY_MS, onScreen = () => true, isDemo = () => false } = {}) {
  if (!isNative() || demo) {
    const p = askIfAllowed(REVIEW_TRIGGERS.FIRST_SAFE, { demo, now: now || new Date() });
    p.cancel = () => {};
    return p;
  }
  endFirstSafe("replaced");
  let w;
  const p = new Promise((finish) => {
    w = { finish, timer: null };
    w.timer = setTimeout(() => {
      if (_firstSafe !== w) return;
      _firstSafe = null;
      let still = { reason: null };
      try {
        if (!isNative()) still.reason = "web";
        else if (isDemo()) still.reason = "demo";
        else if (!inForeground()) still.reason = "background";
        else if (!onScreen()) still.reason = "not_on_screen";
      } catch { still.reason = "not_on_screen"; }
      if (still.reason) { finish({ ask: false, reason: still.reason }); return; }
      finish(askIfAllowed(REVIEW_TRIGGERS.FIRST_SAFE, { now: now || new Date() }));
    }, Math.max(0, delayMs));
  });
  _firstSafe = w;
  p.cancel = () => { if (_firstSafe === w) endFirstSafe("cancelled"); };
  return p;
}

// AN OPEN IS A REAL OPEN (review round 1): once when the app loads (reviewOnAppLaunch, once per launch however often the
// household's data changes, so a data update after midnight is no new day), and each time the app comes back to the
// foreground (the watch below). The 3rd different calendar day it is opened may ask, once per install.
let _launchCounted = false;
function countOpen(demo, now) {
  return askIfAllowed(REVIEW_TRIGGERS.THIRD_OPEN_DAY, { demo, now, prepare: (state) => withOpenDay(state, now) });
}
export function reviewOnAppLaunch({ demo = false, now = new Date() } = {}) {
  if (!isNative() || demo) return countOpen(demo, now);
  if (_launchCounted) return Promise.resolve({ ask: false, reason: "already_counted" });
  _launchCounted = true;
  return countOpen(false, now);
}

// The foreground and the background. Hidden: the first number's wait ends, and the session's clock starts. Visible: a
// new session after the gap, and an open counted when gate() says a signed-in household's data is on screen (not the demo).
let _gate = null;
export function _reviewVisibility(state, nowMs = Date.now()) {
  if (state === "hidden") {
    endFirstSafe("background");
    if (_hiddenAt == null) _hiddenAt = nowMs;
    return Promise.resolve(null);
  }
  if (_hiddenAt != null && nowMs - _hiddenAt >= SESSION_GAP_MS) _askedThisSession = false;
  const wasHidden = _hiddenAt != null;
  _hiddenAt = null;
  let g = null;
  try { g = _gate ? _gate() : null; } catch { g = null; }
  if (!wasHidden || !g || !g.ready || !isNative()) return Promise.resolve(null);
  return countOpen(!!g.demo, new Date(nowMs));
}

// The app starts watching once (App.jsx). Phone apps only; returns the way to stop. gate: () => ({ ready, demo }).
let _listening = false;
function onVisibility() { try { _reviewVisibility(document.visibilityState); } catch {} }
export function startReviewWatch(gate) {
  _gate = typeof gate === "function" ? gate : null;
  try {
    if (_gate && !_listening && isNative() && typeof document !== "undefined" && document.addEventListener) {
      document.addEventListener("visibilitychange", onVisibility);
      _listening = true;
    }
  } catch {}
  return () => {
    _gate = null;
    try { if (_listening) document.removeEventListener("visibilitychange", onVisibility); } catch {}
    _listening = false;
  };
}

// Tests only.
export function _resetLaunchForTest() { _launchCounted = false; }
export function _resetReviewForTest() { endFirstSafe("cancelled"); _launchCounted = false; _askedThisSession = false; _hiddenAt = null; }
