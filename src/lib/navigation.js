// src/lib/navigation.js — Step 6: five-tab information architecture map (single source of truth).
//
// The redesign is navigation only: every screen that existed before still exists and is reachable.
// Screens that used to be their own tab are re-homed under a parent tab and shown via a segmented
// control; their old screen ids still route. This map drives active-tab highlighting and is the
// contract the reachability test enforces — dropping a screen from a tab fails that test.

// The five bottom-nav tabs, by id (labels live in the NAV array: Today / Watch / Do / Learn / Meet).
export const TABS = ["home", "watch", "do", "coach", "family"];

// Which screen ids each tab holds. A tab id is also a valid screen id (it renders the first sub).
export const TAB_SCREENS = {
  home:   ["home"],
  watch:  ["plan", "spend"],            // Plan Ahead + Time Machine/What-If, and Activity
  do:     ["budget", "goals", "credit"],
  coach:  ["coach"],                    // Learn
  family: ["family"],                   // Meet
};

// Full-screen routes that are reachable but are not bottom-nav tabs (no active-tab highlight).
export const STANDALONE_SCREENS = ["widget", "kids", "privacy", "terms"];

// Every screen reachable before Step 6 — the reachability contract. If any of these stops resolving
// to a tab (or a standalone route), the five-tab redesign has dropped a feature.
export const PRE_STEP6_SCREENS = [
  "home", "plan", "spend", "budget", "goals", "credit", "coach", "family",
  ...STANDALONE_SCREENS,
];

// The parent tab that owns a screen id, for active-tab highlighting. null for standalone/unknown.
export function tabForScreen(screenId) {
  for (const tab of TABS) {
    if (tab === screenId) return tab;
    if (TAB_SCREENS[tab].includes(screenId)) return tab;
  }
  return null;
}

// Is this screen reachable (a tab, a tab's sub-screen, or a standalone route)?
export function isReachableScreen(screenId) {
  return tabForScreen(screenId) !== null || STANDALONE_SCREENS.includes(screenId);
}
