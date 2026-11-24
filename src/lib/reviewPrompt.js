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

// Tests only: a stand-in for the native plugin (node cannot load it), or for the time it takes to load.
let _pluginForTest = null;
let _pluginLoaderForTest = null;
export function _setReviewPluginForTest(plugin) { _pluginForTest = plugin; }
export function _setReviewPluginLoaderForTest(load) { _pluginLoaderForTest = load; }

// The native plugin, resolved once. Looked up only at the moment of asking, and only on a native shell.
let _plugin = null;
async function reviewPlugin() {
  if (_pluginLoaderForTest) return _pluginLoaderForTest();
  if (_pluginForTest) return _pluginForTest;
  if (!_plugin) {
    const { registerPlugin } = await import("@capacitor/core");
    const native = registerPlugin("FlourishReview");
    // A plain object, never the plugin itself: Capacitor's plugin answers every property, "then" included, so an async
    // function returning it would be awaited as if it were a promise.
    _plugin = { requestReview: () => native.requestReview() };
  }
  return _plugin;
}

// The reasons a once-per-install moment passes without being spent: it never came (web, demo), it already had, this
// session already asked (it waits for a later session), or there was trouble in the last 24 hours (review round 4: it
// waits too; the first number for its next showing, the third day for a later open). Only the yearly limit spends it.
const NOT_A_MOMENT = ["web", "demo", "unknown_trigger", "moment_spent", "not_third_day", "session_already_asked", "recent_trouble"];

// THE APP SESSION (review round 1): at most one ask per session. A session starts when the app loads, and again when it
// comes back after REVIEW_SESSION_GAP_MINUTES or more in the background. Kept in memory only: a new launch is a new session.
const SESSION_GAP_MS = REVIEW_SESSION_GAP_MINUTES * 60 * 1000;
let _askedThisSession = false;
let _hiddenAt = null;

function inForeground() {
  try { return typeof document === "undefined" || document.visibilityState !== "hidden"; } catch { return true; }
}

// App's gate (startReviewWatch): () => ({ signedIn, hydrated, demo, sample }). sample: a sample household (App Review's).
let _gate = null;
function gateNow() { try { return _gate ? _gate() || null : null; } catch { return null; } }

// THE ONE CHECK an open passes, the launch's and every resume's (review round 2): a phone app, signed in, the household's
// data loaded, not the demo, not a sample household, in the foreground. Null when it passes, else the reason.
function openBlocker() {
  if (!isNative()) return "web";
  const g = gateNow();
  if (!g || !g.signedIn || !g.hydrated) return "not_ready";
  if (g.demo) return "demo";
  if (g.sample) return "sample";
  if (!inForeground()) return "background";
  return null;
}

// What must still hold for this moment, checked live: before the decision, and again right before asking.
//   isDemo, onScreen: the caller's own (the first number); needsOpen: the third day's open must still pass the one check;
//   cancelled: the first number's wait was cancelled (review round 3), even after its timer fired.
function liveBlocker({ demo = false, isDemo = null, onScreen = null, needsOpen = false, cancelled = null } = {}) {
  if (!isNative()) return "web";
  try { if (cancelled && cancelled()) return "cancelled"; } catch { return "cancelled"; }
  const g = gateNow();
  try { if (demo || (isDemo && isDemo()) || (g && g.demo)) return "demo"; } catch { return "demo"; }
  if (g && g.sample) return "sample";
  if (!inForeground()) return "background";
  try { if (onScreen && !onScreen()) return "not_on_screen"; } catch { return "not_on_screen"; }
  if (needsOpen) { const b = openBlocker(); if (b) return b; }
  return null;
}

// prepare: for the third day, the record with today counted (and saved) before the decision.
// live: what liveBlocker checks for this moment.
async function askIfAllowed(trigger, { demo = false, now = new Date(), meetingKey = localDayKey(now), prepare = null, live = {} } = {}) {
  const native = isNative();
  if (native && !demo) { const why = liveBlocker({ demo, ...live }); if (why) return { ask: false, reason: why }; }
  let state = native ? load() : null;
  if (native && !demo && prepare) {
    const next = prepare(state);
    if (JSON.stringify(next) !== JSON.stringify(state)) save(next);   // a day already counted writes nothing
    state = next;
  }
  const decision = decideReviewAsk({ state, trigger, now, native, demo, meetingKey, askedThisSession: _askedThisSession });
  // A once-per-install moment has come but the rules say no (three a year; trouble only waits): spent now. A yes is spent only once
  // it has passed the live check below, together with the ask.
  if (native && !demo && !decision.ask && trigger !== REVIEW_TRIGGERS.MEETING_DONE && !NOT_A_MOMENT.includes(decision.reason)) {
    state = withMomentSpent(state, trigger, now);
    save(state);
  }
  if (!decision.ask) return decision;
  // Review round 2: the plugin first. Then, right before recording and asking, everything again, live: the person may
  // have left while it loaded. Any check failing means no ask, and the moment is not spent.
  let plugin;
  try { plugin = await reviewPlugin(); } catch { plugin = null; }
  if (!plugin) return { ask: false, reason: "no_plugin" };
  const why = liveBlocker({ demo, ...live });
  if (why) return { ask: false, reason: why };
  state = load();
  const again = decideReviewAsk({ state, trigger, now, native: isNative(), demo, meetingKey, askedThisSession: _askedThisSession });
  if (!again.ask) return again;
  // Recorded BEFORE the call: if the plugin throws or the app is killed mid-sheet, the next launch
  // must still see that Flourish asked, rather than asking again.
  if (trigger !== REVIEW_TRIGGERS.MEETING_DONE) state = withMomentSpent(state, trigger, now);
  save(withAsked(state, now, trigger === REVIEW_TRIGGERS.MEETING_DONE ? meetingKey : null));
  _askedThisSession = true;
  try { await plugin.requestReview(); } catch {}
  return again;
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
// replaces the first wait. Returns a promise of the decision, with cancel(). Review round 3: each wait has its own
// cancelled flag, which cancel() always sets, even after the timer fired; the live check right before asking reads it.
//   onScreen  () => is the number still on screen?   isDemo  () => is the demo on now?
let _firstSafe = null;   // the wait whose timer has not fired yet: { timer, finish, cancelled }
// Review round 4: the wait whose timer has fired and whose ask has not finished (the plugin may still be loading). Ending
// the first number's wait (the background, a second showing) cancels it too.
let _firstSafeAsking = null;
function endFirstSafe(reason) {
  if (_firstSafeAsking) _firstSafeAsking.cancelled = true;
  const w = _firstSafe;
  if (!w) return;
  w.cancelled = true;
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
    w = { finish, timer: null, cancelled: false };
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
      _firstSafeAsking = w;
      const asking = askIfAllowed(REVIEW_TRIGGERS.FIRST_SAFE, { now: now || new Date(), live: { isDemo, onScreen, cancelled: () => w.cancelled } });
      asking.finally(() => { if (_firstSafeAsking === w) _firstSafeAsking = null; }).catch(() => {});
      finish(asking);
    }, Math.max(0, delayMs));
  });
  _firstSafe = w;
  p.cancel = () => { w.cancelled = true; if (_firstSafe === w) endFirstSafe("cancelled"); };
  return p;
}

// AN OPEN IS A REAL OPEN (review round 1): once when the app loads (reviewOnAppLaunch, once per launch however often the
// household's data changes, so a data update after midnight is no new day), and each time the app comes back to the
// foreground (the watch below). The 3rd different calendar day it is opened may ask, once per install.
let _launchCounted = false;
function countOpen(now) {
  return askIfAllowed(REVIEW_TRIGGERS.THIRD_OPEN_DAY, { now, prepare: (state) => withOpenDay(state, now), live: { needsOpen: true } });
}
// Review round 2: the launch passes the same one check as a resume, and is marked counted only once it has, so a launch
// that fails it (a sample household, the background, data not yet loaded) can still count later in the same launch.
export function reviewOnAppLaunch({ now = new Date() } = {}) {
  if (_launchCounted) return Promise.resolve({ ask: false, reason: "already_counted" });
  const why = openBlocker();
  if (why) return Promise.resolve({ ask: false, reason: why });
  _launchCounted = true;
  return countOpen(now);
}

// The foreground and the background. Hidden: the first number's wait ends, and the session's clock starts. Visible: a
// new session after the gap; the launch's open if it has not counted yet, else a resume's open, each through the one check.
export function _reviewVisibility(state, nowMs = Date.now()) {
  if (state === "hidden") {
    endFirstSafe("background");
    if (_hiddenAt == null) _hiddenAt = nowMs;
    return Promise.resolve(null);
  }
  if (_hiddenAt != null && nowMs - _hiddenAt >= SESSION_GAP_MS) _askedThisSession = false;
  const wasHidden = _hiddenAt != null;
  _hiddenAt = null;
  if (!_launchCounted) return reviewOnAppLaunch({ now: new Date(nowMs) });
  if (!wasHidden || openBlocker()) return Promise.resolve(null);
  return countOpen(new Date(nowMs));
}

// The app starts watching once (App.jsx). Phone apps only; returns the way to stop. gate: () => ({ signedIn, hydrated,
// demo, sample }).
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
