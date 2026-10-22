// src/lib/landingCounts.js
// -----------------------------------------------------------------------------
// THE LANDING'S OWN COUNTS (the trial-first landing, 2026-10-22). Our code only: no third-party tracker,
// no cookie, no email, no IP. The page sends an event name and the visit's ?src= (lib/waitlistSrc.js);
// the server adds the device kind from the browser's own description of itself (phone, tablet or desktop,
// nothing more is kept) and adds one to that day's count (beta.js action "landing_count", migration 0027).
//
//   landing_view   the landing was shown (once per browser session)
//   main_tap       "Try flourish free for 14 days" was tapped
//
// "account_created" and "founding_join" are counted by the server itself, when they happen (beta.js).
// A count that cannot be sent is simply lost: it never blocks or slows the page.
// -----------------------------------------------------------------------------
import { currentWaitlistSrc } from "./waitlistSrc.js";

export const CLIENT_COUNT_EVENTS = Object.freeze(["landing_view", "main_tap"]);
const VIEW_KEY = "flourish_landing_viewed";

export function countLanding(event, { fetchImpl = (typeof fetch === "function" ? fetch : null), base = "" } = {}) {
  if (!CLIENT_COUNT_EVENTS.includes(event) || !fetchImpl) return;
  try {
    const p = fetchImpl(`${base}/api/beta`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "landing_count", event, src: currentWaitlistSrc() }),
      keepalive: true,
    });
    if (p && p.catch) p.catch(() => {});
  } catch { /* lost count, never an error */ }
}

// One landing_view per browser session, so a reload is not a second visit.
export function countLandingViewOnce(opts = {}, storage) {
  let st = null;
  try { st = storage !== undefined ? storage : (globalThis.sessionStorage || null); } catch { st = null; }
  try { if (st && st.getItem(VIEW_KEY)) return; } catch { /* count it */ }
  try { st && st.setItem(VIEW_KEY, "1"); } catch { /* storage refused */ }
  countLanding("landing_view", opts);
}
