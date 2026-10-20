// src/lib/backButton.js
// -----------------------------------------------------------------------------
// ANDROID'S BACK KEY GOES BACK ONE SCREEN (version 1.1, item 8c).
//
// Before this, Android's back key in Settings (or anywhere) left the app: Capacitor's default with no back
// handler is to close the activity when the WebView has no history, and the app keeps none. Now:
//   1. whatever is on top closes first: a dialog (ModalHost), then a sheet that registered itself here;
//   2. then the app goes back one screen (backAction below): the paywall's Terms/Privacy page, the bank
//      consent sheet, Settings, the notifications, What-If, the money summary, the check-in, the upgrade
//      screen, a full-page screen, then any tab back to Today;
//   3. on Today with nothing open, the app goes to the background (Android's own "back at the start"), keeping
//      its state, rather than closing.
// The store paywall is not something back closes: back there sends the app to the background, as at Today.
// -----------------------------------------------------------------------------

const stack = [];

/** A layer on top (a dialog, a sheet) takes the back key while it is open. Returns the function that removes it. */
export function pushBackHandler(fn) {
  const entry = { fn };
  stack.push(entry);
  return () => { const i = stack.indexOf(entry); if (i >= 0) stack.splice(i, 1); };
}

/** The topmost registered layer handles the key, if it wants to. true when something closed. */
export function handleBackLayers() {
  for (let i = stack.length - 1; i >= 0; i--) {
    try { if (stack[i].fn() === true) return true; } catch { /* a broken handler never traps the key */ }
  }
  return false;
}

const FULL_PAGE = new Set(["privacy", "terms", "delete-account", "support", "widget", "family", "coach"]);

/**
 * The app's own "back one screen", from its state. Returns the action to take, or null when there is nothing
 * left to go back from (Today with nothing open), in which case the app goes to the background. The store
 * paywall is one more screen (2026-10-20: the household opens it, and back closes it, as on the web).
 */
export function backAction(s = {}) {
  if (s.paywallUp) return s.paywallLegal ? "closePaywallLegal" : "closePaywall";
  // The paywall opened from Settings for a founding holder on a regular plan (version 1.1, 2026-10-18): back closes it.
  if (s.foundingSwitchOpen) return s.paywallLegal ? "closePaywallLegal" : "closeFoundingSwitch";
  if (s.pendingPlaid) return "closeBankConsent";
  if (s.showSettings) return "closeSettings";
  if (s.showNotifs) return "closeNotifications";
  if (s.showWhatIf) return "closeWhatIf";
  if (s.showWrapped) return "closeWrapped";
  if (s.showCheckIn) return "closeCheckIn";
  if (s.showUpgrade) return "closeUpgrade";
  if (s.showPaywall) return "closePaywall";
  if (s.screen && FULL_PAGE.has(s.screen)) return "home";
  if (s.screen && s.screen !== "home") return "home";
  return null;
}
