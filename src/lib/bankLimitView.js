// src/lib/bankLimitView.js
// -----------------------------------------------------------------------------
// THE LINE FOR A NEW BANK THE PLAN DOES NOT INCLUDE (2026-11-10). The server decides (netlify/functions/_lib/
// bankLimits.js, behind PLUS_ENABLED) and answers 402 { error: "bank_limit", scope, used, limit }; this only words
// that answer, with the server's own numbers. Nothing is counted on the phone, and nothing here disconnects
// anything: a refused NEW bank is the only thing a limit ever does.
//   scope "person"      this person has used every bank login their plan includes (banks-limit-person)
//   scope "household"   Plus's fair-use limit for the household (banks-limit-household)
// Any other error is not this file's: null, and the screen says what it said before.
// -----------------------------------------------------------------------------
import { netWorthWords } from "./netWorthWords.js";

const whole = (v) => Number.isInteger(v) && v >= 0;

export function bankLimitMessage(err) {
  const b = err && err.body;
  if (!b || b.error !== "bank_limit") return null;
  // Numbers that did not come through whole are never shown: the plain line instead.
  if (!whole(b.used) || !whole(b.limit) || !["person", "household"].includes(b.scope)) return netWorthWords("plus-status-unavailable");
  return netWorthWords(b.scope === "household" ? "banks-limit-household" : "banks-limit-person", { used: b.used, limit: b.limit });
}

// Settings: more banks connected than the plan includes. Every one stays; the line says so.
export function overLimitLine(status) {
  if (!status || status.over !== true || !whole(status.connected) || !whole(status.limit)) return null;
  return netWorthWords("banks-over-limit-kept", { count: status.connected, limit: status.limit });
}
