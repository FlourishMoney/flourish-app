// WHERE EVERYTHING SITS, computed once and shared.
//
// The composition draws from these numbers, and the quality gate checks against the same ones —
// so "the ring is inside the screen" is one calculation, not two that can disagree.
export const FRAME = { w: 1080, h: 1920 };
export const SAFE_BAND = { top: 250, bottom: 400 };

// THE CAPTION NEVER TOUCHES THE DEVICE. It sits in the clean strip under the top safe band, and
// the device begins below it — further down on a wide shot, a little higher on a zoom, eased
// between so it never jumps. The device keeps its 80% width and simply runs further off the bottom,
// which Instagram's own UI covers anyway.
export const BEZEL = 11;
export const PHONE = { w: 864, h: 1870, radius: 76, topWide: 600, topClose: 530 };
export const PHONE_TOP_FOR = (close) => (close ? PHONE.topClose : PHONE.topWide);

/** The app's screen — inside the bezel — in frame coordinates. */
export function screenRect(close = true) {
  return {
    x: (FRAME.w - PHONE.w) / 2 + BEZEL,
    y: PHONE_TOP_FOR(close) + BEZEL,
    w: PHONE.w - BEZEL * 2,
    h: PHONE.h - BEZEL * 2,
  };
}

/** The whole device, bezel included, in frame coordinates — what the caption must stay clear of. */
export function deviceRect(close = true) {
  return { x: (FRAME.w - PHONE.w) / 2, y: PHONE_TOP_FOR(close), w: PHONE.w, h: PHONE.h };
}

/**
 * The part of the screen the VIEWER can actually see. The device is taller than the canvas and
 * runs off the bottom, so the screen rect and the visible rect are not the same thing — and a
 * target centred in the screen can sit below the frame entirely, which is exactly what happened.
 * Returned in screen-local coordinates.
 */
export function visibleScreen(close = true) {
  const s = screenRect(close);
  return { top: Math.max(0, -s.y), bottom: Math.min(s.h, FRAME.h - s.y) };
}

/**
 * Zoom to a rectangle, the way a camera does: the target ends up centred, the scale is capped so
 * the target keeps at least `pad` pixels of breathing room on every side, and the translation is
 * clamped so the edges of the recording never come into view.
 *
 * `box` is {x, y, w, h} in fractions of the screen — the centre and size of the measured element.
 * Returns the transform to apply and the target's resulting rect, both in screen pixels.
 */
export function zoomToRect(box, requestedZoom, pad = 40, close = true) {
  const s = screenRect(close);
  if (!box) return { scale: 1, tx: 0, ty: 0, target: null };

  // Two constraints pull against each other: the target must sit fully on screen with `pad` to
  // spare, AND the translation may never expose an edge of the recording. Centring the target and
  // then clamping the translation satisfies the second and quietly breaks the first — which is how
  // a ring ended up hanging over the bezel. So: find the largest scale for which a translation
  // exists that satisfies BOTH, and use it.
  const feasible = (scale, len, centre, size) => {
    const half = (size * len * scale) / 2;
    const c = centre * len * scale;
    const lo = Math.max(pad - (c - half), len - len * scale);   // not past the left/top edge
    const hi = Math.min(len - pad - (c + half), 0);             // not past the right/bottom edge
    if (lo > hi) return null;
    return Math.min(hi, Math.max(lo, (0.5 - centre) * len * scale));   // centre it, within reach
  };

  // Vertically the target must land inside the VISIBLE window, not merely inside the screen.
  const vis = visibleScreen(close);
  const feasibleY = (scale) => {
    const half = (box.h * s.h * scale) / 2;
    const c = box.y * s.h * scale;
    const lo = Math.max(vis.top + pad - (c - half), s.h - s.h * scale);
    const hi = Math.min(vis.bottom - pad - (c + half), 0);
    if (lo > hi) return null;
    const centreOfVisible = (vis.top + vis.bottom) / 2;
    return Math.min(hi, Math.max(lo, centreOfVisible - c));
  };

  let scale = 1, tx = 0, ty = 0;
  for (let cand = requestedZoom; cand >= 1; cand -= 0.02) {
    const cx = feasible(cand, s.w, box.x, box.w);
    const cy = feasibleY(cand);
    if (cx !== null && cy !== null) { scale = cand; tx = cx; ty = cy; break; }
  }

  const target = {
    x: (box.x - box.w / 2) * s.w * scale + tx,
    y: (box.y - box.h / 2) * s.h * scale + ty,
    w: box.w * s.w * scale,
    h: box.h * s.h * scale,
  };
  return { scale, tx, ty, target };
}

/** The target's rect in FRAME coordinates, which is what the caption has to stay clear of. */
export function targetRectInFrame(box, zoom, pad = 40, close = true) {
  const { target } = zoomToRect(box, zoom, pad, close);
  if (!target) return null;
  const s = screenRect(close);
  return { x: s.x + target.x, y: s.y + target.y, w: target.w, h: target.h };
}

// The "Example" pill: in the clear strip between the top safe line and the device, so it can never
// sit over app text.
export const MAX_SHOT_SECONDS = 2.5;

// The caption block, anchored to whichever half of the frame the target is NOT in.
// `band` is how far the opaque background extends past the caption box before it fades.
// The caption lives in the clean strip between the top safe band and the device. Two lines at
// 76px is 180px tall; 24px is the minimum air between the words and the phone.
export const CAPTION = { maxH: 180, side: 70, top: SAFE_BAND.top + 14, gap: 24 };
export function captionRect() {
  return { x: CAPTION.side, y: CAPTION.top, w: FRAME.w - CAPTION.side * 2, h: CAPTION.maxH };
}

// Between the caption and the device: clear of the app (it covers no pixel of the phone) AND clear
// of the words (it used to sit top-right, straight through the end of a caption line).
export const PILL = { h: 56, right: 80, top: CAPTION.top + CAPTION.maxH + 14 };
export function pillRect(width = 230) {
  return { x: FRAME.w - PILL.right - width, y: PILL.top, w: width, h: PILL.h };
}
// STYLE.md pace: no shot may run longer than this, the end card excepted.

export const intersects = (a, b) =>
  !!a && !!b && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

// The caption is always above the device now, so there is no side left to choose. Kept as a
// function because the beat records its answer and the gate reads it.
export function captionAnchorFor() { return "top"; }

