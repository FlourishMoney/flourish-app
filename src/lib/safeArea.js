// src/lib/safeArea.js
// -----------------------------------------------------------------------------
// SAFE-AREA PADDING, ONE SIDE AT A TIME (xcode27-duo).
//
// The iPhone Duo keeps an 84 px strip for its camera and status pill, on the RIGHT of the outer
// display held upright, on the LEFT when it is turned landscape, on the right of the inner display in
// landscape and along the top in portrait. iOS reports it through env(safe-area-inset-*), one value
// per side. Anything a person reads or taps must stay clear of all four, so each side is padded with
// its own inset: never assume left equals right, and never assume only the top and bottom matter.
//
// These helpers return LONGHAND properties (paddingLeft, left, …). In a React style object a later
// `padding:` shorthand silently resets them, so spread them AFTER any padding shorthand; the
// tests/safeAreaSides.test.cjs scan fails a style object that puts one after the other.
// On a phone or a browser with no insets every env() is 0 and these change nothing.
// -----------------------------------------------------------------------------

export const INSET = {
  top: "env(safe-area-inset-top, 0px)",
  right: "env(safe-area-inset-right, 0px)",
  bottom: "env(safe-area-inset-bottom, 0px)",
  left: "env(safe-area-inset-left, 0px)",
};

// The Android app (Capacitor's own platform name) and nothing else: not the website, not the iPhone app.
export function isAndroidApp(win = typeof window === "undefined" ? undefined : window) {
  try { return !!win && !!win.Capacitor && typeof win.Capacitor.getPlatform === "function" && win.Capacitor.getPlatform() === "android"; } catch { return false; }
}

// THE STATUS BAR'S COVER, ANDROID ONLY (found on the emulator, 2026-11-18). From Android 15 the app is drawn edge to
// edge: the status bar is transparent and the page runs behind it. Every screen pads its top by the bar's height, but
// that padding scrolls away with the page, so on a screen with no header of its own the words slid up under the clock
// and the icons. The cover is a strip the height of the bar, fixed to the top, in the screen's own background: at rest
// it sits over the screen's empty top padding, the same colour, and takes no room; scrolled, the words pass behind it.
// z-index 1, and it goes FIRST in its screen, so anything the screen layers on purpose (a dialog's dimmed backdrop, a
// sheet) is drawn over it, later in the page. Not on the iPhone or the website: null there, nothing in the page.
export const statusBarCoverStyle = (bg) => ({ position: "fixed", top: 0, left: 0, right: 0, height: INSET.top, background: bg, zIndex: 1 });

// One side's padding: the design's own `min` px, or the inset when that is larger.
export const safeSide = (side, min = 0) => `max(${min}px, ${INSET[side]})`;

// The left and right padding of a block that runs edge to edge.
export const safeX = (min = 0) => ({ paddingLeft: safeSide("left", min), paddingRight: safeSide("right", min) });

// A full-screen backdrop (a sheet or dialog behind a dimmed page): keeps the box it holds clear of the
// top and side strips. `min` is the backdrop's own padding (one number, or [vertical, horizontal]),
// kept wherever it is larger than the inset. The bottom is left to a bottom sheet, which pads its own
// content above the home indicator; a dialog centred on the screen passes { bottom: true }.
export const overlaySafe = (min = 0, { bottom = false } = {}) => {
  const [v, h] = Array.isArray(min) ? min : [min, min];
  return {
    paddingTop: safeSide("top", v), paddingLeft: safeSide("left", h), paddingRight: safeSide("right", h),
    ...(bottom ? { paddingBottom: safeSide("bottom", v) } : {}),
  };
};

// A fixed bar or card centred in the safe area, `gap` px in from each side strip, at most `maxWidth`
// wide. It replaces left:50% + translateX(-50%), which centres on the whole screen and so runs under
// a side strip.
export const centredInSafeArea = (gap, maxWidth) => ({
  left: `calc(${INSET.left} + ${gap}px)`, right: `calc(${INSET.right} + ${gap}px)`,
  maxWidth, marginLeft: "auto", marginRight: "auto",
});
