// src/lib/aiGate.js — Step 8: one place that decides whether the AI coach may be called.
//
// When the user turns the AI coach off in Settings, NO request may reach /api/coach from any call
// site (chat, simulator, checkin, document, and the Meet facilitator). Every call site guards with
// ensureAiEnabled() before it builds or sends a request, so the render gate (AIDisabledNotice) is no
// longer the only thing standing between "AI off" and a network call.
//
// The flag is localStorage "flourish_ai_coach_enabled": absent/"1" = on, "0" = off. Defaults to ON
// (the app treats anything but "0" as enabled), and fails safe to ON only for read errors — never
// sends when the flag explicitly says "0".

export function aiEnabled() {
  try {
    if (typeof window === "undefined" || !window.localStorage) return true;
    return window.localStorage.getItem("flourish_ai_coach_enabled") !== "0";
  } catch {
    return true; // storage unreadable → treat as on (matches the app's default)
  }
}

// Throw BEFORE any network request when AI is off. Call this first in every coach call site.
// `message` is preserved per call site (e.g. the simulator's catch keys on "AI disabled").
export function ensureAiEnabled(message = "AI features are disabled") {
  if (!aiEnabled()) throw new Error(message);
  return true;
}
