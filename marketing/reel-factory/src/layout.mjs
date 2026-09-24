// WHERE EVERYTHING SITS, computed once and shared.
//
// The composition draws from these numbers, and the quality gate checks against the same ones —
// so "the ring is inside the screen" is one calculation, not two that can disagree.
export const FRAME = { w: 1080, h: 1920 };
export const SAFE_BAND = { top: 250, bottom: 400 };

// The device. 864 is 80% of the frame; at the recording's true 390:844 ratio that is 1870 tall,
// so it runs off the bottom edge. It starts below the top band, leaving a clear strip there for
// the "Example" pill that covers no app pixel.
export const BEZEL = 11;
export const PHONE = { w: 864, h: 1870, radius: 76, top: 350 };

/** The app's screen — inside the bezel — in frame coordinates. */
export function screenRect() {
  return {
    x: (FRAME.w - PHONE.w) / 2 + BEZEL,
    y: PHONE.top + BEZEL,
    w: PHONE.w - BEZEL * 2,
    h: PHONE.h - BEZEL * 2,
  };
}

/**
 * The part of the screen the VIEWER can actually see. The device is taller than the canvas and
 * runs off the bottom, so the screen rect and the visible rect are not the same thing — and a
 * target centred in the screen can sit below the frame entirely, which is exactly what happened.
 * Returned in screen-local coordinates.
 */
export function visibleScreen() {
  const s = screenRect();
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
export function zoomToRect(box, requestedZoom, pad = 40) {
  const s = screenRect();
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
  const vis = visibleScreen();
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
export function targetRectInFrame(box, zoom, pad = 40) {
  const { target } = zoomToRect(box, zoom, pad);
  if (!target) return null;
  const s = screenRect();
  return { x: s.x + target.x, y: s.y + target.y, w: target.w, h: target.h };
}

// The "Example" pill: in the clear strip between the top safe line and the device, so it can never
// sit over app text.
export const PILL = { h: 56, top: SAFE_BAND.top + 14, right: 80 };
// STYLE.md pace: no shot may run longer than this, the end card excepted.
export const MAX_SHOT_SECONDS = 2.5;

// The caption block, anchored to whichever half of the frame the target is NOT in.
// `band` is how far the opaque background extends past the caption box before it fades.
export const CAPTION = { maxH: 210, side: 70, gap: 40, band: 90 };
export function captionRect(anchor) {
  return anchor === "top"
    ? { x: CAPTION.side, y: PILL.top + PILL.h + 26, w: FRAME.w - CAPTION.side * 2, h: CAPTION.maxH }
    : { x: CAPTION.side, y: FRAME.h - SAFE_BAND.bottom - CAPTION.maxH, w: FRAME.w - CAPTION.side * 2, h: CAPTION.maxH };
}

export const intersects = (a, b) =>
  !!a && !!b && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** Which side the caption goes: opposite the element being talked about. */
export function captionAnchorFor(targetFrameRect) {
  if (!targetFrameRect) return "bottom";
  const centre = targetFrameRect.y + targetFrameRect.h / 2;
  return centre > FRAME.h / 2 ? "top" : "bottom";
}
