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

// The reasons a once-per-install moment passes without being spent: it never came (web, demo), or it already had.
const NOT_A_MOMENT = ["web", "demo", "unknown_trigger", "moment_spent", "not_third_day"];

// prepare: for the third day, the record with today counted (and saved) before the decision.
async function askIfAllowed(trigger, { demo = false, now = new Date(), meetingKey = localDayKey(now), prepare = null } = {}) {
  const native = isNative();
  let state = native ? load() : null;
  if (native && !demo && prepare) {
    const next = prepare(state);
    if (JSON.stringify(next) !== JSON.stringify(state)) save(next);   // a day already counted writes nothing
    state = next;
  }
  const decision = decideReviewAsk({ state, trigger, now, native, demo, meetingKey });
  // A once-per-install moment has come: spent now, whether or not the rules let it ask.
  if (native && !demo && trigger !== REVIEW_TRIGGERS.MEETING_DONE && !NOT_A_MOMENT.includes(decision.reason)) {
    state = withMomentSpent(state, trigger, now);
    save(state);
  }
  if (!decision.ask) return decision;
  // Recorded BEFORE the call: if the plugin throws or the app is killed mid-sheet, the next launch
  // must still see that Flourish asked, rather than asking again.
  save(withAsked(state, now, trigger === REVIEW_TRIGGERS.MEETING_DONE ? meetingKey : null));
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
// install, it may ask, under the same limits (reviewRules.js). The rules are read after the wait, so trouble in those
// seconds still rules it out. Today and the first-number screen can both show the number at once: one wait at a time.
let _firstSafeWaiting = null;
export function reviewOnFirstSafe({ demo = false, now = null, delayMs = FIRST_SAFE_DELAY_MS } = {}) {
  if (!isNative() || demo) return askIfAllowed(REVIEW_TRIGGERS.FIRST_SAFE, { demo, now: now || new Date() });
  if (_firstSafeWaiting) return _firstSafeWaiting.then(() => ({ ask: false, reason: "moment_spent" }));
  _firstSafeWaiting = new Promise((done) => setTimeout(done, Math.max(0, delayMs)))
    .then(() => askIfAllowed(REVIEW_TRIGGERS.FIRST_SAFE, { now: now || new Date() }))
    .finally(() => { _firstSafeWaiting = null; });
  return _firstSafeWaiting;
}

// The app was opened (a signed-in household whose data has loaded). The 3rd different day it is opened may ask, once
// per install, under the same limits. Safe to call on every render: a day already counted changes nothing.
export function reviewOnAppOpen({ demo = false, now = new Date() } = {}) {
  return askIfAllowed(REVIEW_TRIGGERS.THIRD_OPEN_DAY, { demo, now, prepare: (state) => withOpenDay(state, now) });
}
