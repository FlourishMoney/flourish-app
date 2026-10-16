// src/lib/textScale.js
// -----------------------------------------------------------------------------
// THE PHONE'S TEXT SIZE IS THE APP'S TEXT SIZE.
//
// Someone who has turned their phone's text up has already told the operating system how big they
// need text to be. An app that ignores that is asking them to say it twice, and most people don't
// know they can. This is the single accessibility setting that matters most to the most people,
// and honouring it costs a WebView app almost nothing.
//
// HOW, given ~1,700 inline pixel sizes. Rewriting every one into a scalable unit would be a huge
// and risky change. `-webkit-text-size-adjust` was built for exactly this: WebKit (iOS) and
// Chromium (Android WebView) multiply the COMPUTED size of text by it, pixel values included,
// without touching any layout unit. One property on the root element scales all of it.
//
// HOW WE KNOW THE SETTING. iOS exposes Dynamic Type to the web through the `-apple-system-body`
// font shorthand: measure it and the result is 17px at the default size and larger as the slider
// moves. Android WebView applies its font scale to the default document font, so measuring a plain
// 16px element against 16 gives the same ratio. Both are a measurement, not a guess.
//
// NOT pinch zoom: that scales layout and leaves people scrolling sideways. This scales text only.
// -----------------------------------------------------------------------------

// Apple's own range runs to about 235% at the accessibility sizes. Clamped so a mis-read can never
// make the app unusable in either direction.
export const MIN_SCALE = 1;
export const MAX_SCALE = 1.6;

export function clampScale(n) {
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, n));
}

// Measure what the OS thinks "body text" is. 17 is iOS's default body size, 16 the web's.
export function measureScale(doc = typeof document === "undefined" ? null : document) {
  if (!doc || !doc.body) return 1;
  let el;
  try {
    el = doc.createElement("div");
    el.setAttribute("aria-hidden", "true");
    el.style.cssText = "position:absolute;visibility:hidden;pointer-events:none;font:-apple-system-body;";
    doc.body.appendChild(el);
    // Only WebKit knows the shorthand. Chromium drops it and the probe falls back to the default size,
    // which on Android is already the system's: at 130% that read 20.8 / 17 = 1.22, not 1.3.
    const ios = appleBody(doc) ? parseFloat(getComputedStyle(el).fontSize) : NaN;
    if (Number.isFinite(ios) && ios > 0 && Math.abs(ios - 17) > 0.5) return clampScale(ios / 17);
    // Android (and anything that ignored the shorthand): compare the default document size to 16.
    el.style.cssText = "position:absolute;visibility:hidden;pointer-events:none;font-size:medium;";
    const base = parseFloat(getComputedStyle(el).fontSize);
    if (Number.isFinite(base) && base > 0 && Math.abs(base - 16) > 0.5) return clampScale(base / 16);
    return 1;
  } catch {
    return 1;
  } finally {
    try { if (el && el.parentNode) el.parentNode.removeChild(el); } catch {}
  }
}

// Apply it. Text only: no layout unit, no viewport scale, no pinch zoom.
export function applyTextScale(scale, doc = typeof document === "undefined" ? null : document) {
  const s = clampScale(scale);
  if (!doc || !doc.documentElement) return s;
  const pct = `${Math.round(s * 100)}%`;
  try {
    doc.documentElement.style.webkitTextSizeAdjust = pct;
    doc.documentElement.style.textSizeAdjust = pct;
    doc.documentElement.style.setProperty("--text-scale", String(s));
  } catch {}
  return s;
}

// Does this engine understand iOS's system font shorthand (WebKit), or not (Chromium)?
function appleBody(doc) {
  try {
    const css = (doc && doc.defaultView && doc.defaultView.CSS) || (typeof globalThis !== "undefined" && globalThis.CSS) || null;
    return !!(css && css.supports && css.supports("font", "-apple-system-body"));
  } catch { return false; }
}

// WHO SCALES, THE ENGINE OR THE APP. Exactly one of them, never both.
//   iOS: WKWebView does not apply Dynamic Type to a page, so the app does, with text-size-adjust.
//   Android: WebView already renders every text size bigger under a larger system font (its textZoom,
//   pixel sizes included); "medium" reading above 16 is that scaling, seen. Adding text-size-adjust on
//   top multiplied the two in newer WebViews: 130% system text came out near 1.3 x 1.22 = 1.6x and text
//   overlapped across the app (overlap-fix). There the app leaves text-size-adjust at 100% and only
//   records the scale in --text-scale.
export function textSetting(doc = typeof document === "undefined" ? null : document) {
  const scale = measureScale(doc);
  return { scale, engineScales: scale !== 1 && !appleBody(doc) };
}

// Read it and apply it. Called once at boot; iOS re-creates the WebView when the setting changes.
export function initTextScale(doc = typeof document === "undefined" ? null : document) {
  const { scale, engineScales } = textSetting(doc);
  if (!engineScales) return applyTextScale(scale, doc);
  applyTextScale(1, doc);
  try { doc.documentElement.style.setProperty("--text-scale", String(scale)); } catch {}
  return scale;
}
