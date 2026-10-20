// src/lib/reviewPrompt.js
// -----------------------------------------------------------------------------
// The store review prompt: the thin, impure half of reviewRules.js.
//
// This file owns the per-install record (localStorage) and the call into the native plugin. Every
// decision is reviewRules.decideReviewAsk. Nothing here shows any screen of its own: the only UI is
// the store's sheet, and the store decides whether to show even that.
//
// The plugin is the app's own FlourishReview (version 1.1, item 4): Apple's current API,
// AppStore.requestReview(in:), on iOS (ios/App/App/FlourishReviewPlugin.swift), and Google's in-app review
// API on Android (android/.../FlourishReviewPlugin.java). It is looked up only at the moment of asking,
// and only on a native shell, so the web never touches it and never writes the record. On the web every
// function here returns without doing anything.
// -----------------------------------------------------------------------------

import {
  decideReviewAsk, normalizeReviewState, withTrouble, withAsked, localDayKey, REVIEW_TRIGGERS,
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

async function askIfAllowed(trigger, { demo = false, now = new Date(), meetingKey = localDayKey(now) } = {}) {
  const native = isNative();
  const state = native ? load() : null;
  const decision = decideReviewAsk({ state, trigger, now, native, demo, meetingKey });
  if (!decision.ask) return decision;
  // Recorded BEFORE the call: if the plugin throws or the app is killed mid-sheet, the next launch
  // must still see that Flourish asked, rather than asking again.
  save(withAsked(state, now, meetingKey));
  try {
    const { registerPlugin } = await import("@capacitor/core");
    await registerPlugin("FlourishReview").requestReview();
  } catch {}
  return decision;
}

// A money meeting was just marked done. Each completed meeting may ask once, at most three times in
// any 365 days, never within 24 hours of trouble, and never in demo mode (reviewRules.js).
export function reviewOnMeetingDone(opts = {}) {
  return askIfAllowed(REVIEW_TRIGGERS.MEETING_DONE, opts);
}
