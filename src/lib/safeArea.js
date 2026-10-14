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
