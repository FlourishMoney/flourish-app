// src/lib/reviewPrompt.js
// -----------------------------------------------------------------------------
// The store review prompt: the thin, impure half of reviewRules.js.
//
// This file owns the per-install record (localStorage) and the call into the native plugin. Every
// decision is reviewRules.decideReviewAsk. Nothing here shows any screen of its own: the only UI is
// the store's sheet, and the store decides whether to show even that.
//
// The plugin (@capacitor-community/in-app-review) is imported only at the moment of asking, and
// only on a native shell, so the web never loads it and never writes the record. On the web every
// function here returns without doing anything.
// -----------------------------------------------------------------------------

import {
  decideReviewAsk, normalizeReviewState, withTodayOpen, withTrouble, withAsked, REVIEW_TRIGGERS,
} from "./reviewRules.js";

export const REVIEW_STORAGE_KEY = "flourish_review_v1";

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

// Something went wrong (an error, a failed bank link, a refused coach message). Safe to call from
// anywhere, including error handlers: it never throws.
export function noteReviewTrouble(now = new Date()) {
  if (!isNative()) return;
  try { save(withTrouble(load(), now)); } catch {}
}

async function askIfAllowed(trigger, { demo = false, now = new Date() } = {}) {
  const native = isNative();
  const state = native ? load() : null;
  const decision = decideReviewAsk({ state, trigger, now, native, demo });
  if (!decision.ask) return decision;
  // Recorded BEFORE the call: if the plugin throws or the app is killed mid-sheet, the next launch
  // must still see that Flourish asked, rather than asking again.
  save(withAsked(state, now));
  try {
    const { InAppReview } = await import("@capacitor-community/in-app-review");
    await InAppReview.requestReview();
  } catch {}
  return decision;
}

// Today was opened. Counts the day, then asks only if this is the third separate day.
export function reviewOnTodayOpen(opts = {}) {
  if (!isNative()) return Promise.resolve({ ask: false, reason: "web" });
  const now = opts.now || new Date();
  try { save(withTodayOpen(load(), now)); } catch {}
  return askIfAllowed(REVIEW_TRIGGERS.TODAY_OPEN, { ...opts, now });
}

// A weekly money check-in was just finished.
export function reviewOnCheckInDone(opts = {}) {
  return askIfAllowed(REVIEW_TRIGGERS.CHECKIN_DONE, opts);
}
