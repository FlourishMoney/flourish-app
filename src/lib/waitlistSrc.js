// src/lib/waitlistSrc.js
// THE CAMPAIGN A VISITOR ARRIVED FROM. The campaign links carry ?src= (ig, fb, tt, calendar, clawback,
// email, press). It is read when the page loads and kept for the browser session, so a visitor who
// reloads, or wanders the page before joining, is still credited to the link they came from. A later
// link with its own ?src= replaces it. Storage can be unavailable (private windows, blocked site data),
// so every access is guarded and the join simply goes without a src; the server then stores "direct".
// The value is passed through as sent: the server alone decides whether it is a known campaign.

export const WAITLIST_SRC_KEY = "flourish_waitlist_src";

function _store(storage) {
  try { return storage !== undefined ? storage : (globalThis.sessionStorage || null); }
  catch { return null; }
}

// Call on page load. Returns the src now in effect ("" when none).
export function captureWaitlistSrc(search = (typeof window !== "undefined" ? window.location.search : ""), storage) {
  const st = _store(storage);
  let fromUrl = "";
  try { fromUrl = (new URLSearchParams(search || "").get("src") || "").trim().slice(0, 32); } catch { fromUrl = ""; }
  if (fromUrl) {
    try { st && st.setItem(WAITLIST_SRC_KEY, fromUrl); } catch { /* storage refused: still used for this page */ }
    return fromUrl;
  }
  return currentWaitlistSrc(st);
}

export function currentWaitlistSrc(storage) {
  const st = _store(storage);
  try { return (st && st.getItem(WAITLIST_SRC_KEY)) || ""; } catch { return ""; }
}
