// src/lib/share.js
// -----------------------------------------------------------------------------
// "SHARE FLOURISH" (tester suggestions, item 2).
//
// Settings → Share Flourish called navigator.share, which the Android WebView does not have, so on
// Android the tap tried the clipboard, and on a phone whose WebView refused that too, nothing
// happened. Now, in order:
//   1. a store app (iOS, Android): the system share sheet, through @capacitor/share;
//   2. a browser with the Web Share API: the browser's share sheet;
//   3. otherwise: the link is copied, and the caller says so;
//   4. if even that fails: the caller shows the link so it can be copied by hand.
// A share the person cancels is not a failure: nothing more happens.
// -----------------------------------------------------------------------------

export const SHARE_URL = "https://flourishmoney.app";
export const SHARE_TITLE = "Flourish Money";
export const SHARE_TEXT = "I've been using Flourish to track my spending. It shows how much is safe to spend each day, until my next deposit.";

const isCancel = (e) => /cancel|abort/i.test(String((e && (e.message || e.name)) || e || ""));

// deps (all optional, for tests): platform ("ios" | "android" | "web"), nativeShare (the plugin's
// share function), webShare (navigator.share), copy (clipboard writeText).
export async function shareFlourish(deps = {}) {
  const platform = deps.platform || "web";
  const payload = { title: SHARE_TITLE, text: SHARE_TEXT, url: SHARE_URL };

  if (platform === "ios" || platform === "android") {
    let nativeShare = deps.nativeShare;
    if (!nativeShare) {
      try { const { Share } = await import("@capacitor/share"); nativeShare = (p) => Share.share(p); } catch { nativeShare = null; }
    }
    if (nativeShare) {
      try { await nativeShare({ ...payload, dialogTitle: "Share Flourish" }); return "shared"; }
      catch (e) { if (isCancel(e)) return "cancelled"; /* plugin missing or refused: fall through to copy */ }
    }
  } else {
    const webShare = deps.webShare !== undefined ? deps.webShare
      : (typeof navigator !== "undefined" && typeof navigator.share === "function" ? (p) => navigator.share(p) : null);
    if (webShare) {
      try { await webShare(payload); return "shared"; }
      catch (e) { if (isCancel(e)) return "cancelled"; }
    }
  }

  const copy = deps.copy !== undefined ? deps.copy
    : (typeof navigator !== "undefined" && navigator.clipboard && typeof navigator.clipboard.writeText === "function" ? (s) => navigator.clipboard.writeText(s) : null);
  if (copy) {
    try { await copy(SHARE_URL); return "copied"; } catch { /* fall through */ }
  }
  return "failed";
}
