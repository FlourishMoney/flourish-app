// tests/_layoutScan.cjs
// -----------------------------------------------------------------------------
// THE LAYOUT MEASUREMENT, shared by layout.browser.test.cjs (every view, every width) and
// a11y.browser.test.cjs (its iPhone Duo passes, over every screen the axe check reaches).
// What it measures and why is the header of layout.browser.test.cjs and docs/design/LAYOUT-RULES.md.
// -----------------------------------------------------------------------------
"use strict";

// ─── the measurement, serialised into the page ────────────────────────────────
// Kept as one function with no closure over Node scope: it is stringified by page.evaluate().
function SCAN({ scope, textCtrlMin, ctrlCtrlMin, minTap, safe = null }) {
  const CTRL_SEL = 'button, a[href], input, select, textarea, [role="button"], [role="switch"], [role="checkbox"], [role="tab"], [role="link"], [contenteditable="true"]';
  const cs = (el) => getComputedStyle(el);

  // When a sheet is open, the page behind it is still in the DOM. Comparing a sheet's button against
  // a heading it is covering would be nonsense, so an overlay scan is scoped to the overlay: the
  // top-most positioned element that covers the screen.
  const overlayRoot = () => {
    const c = [...document.querySelectorAll("body *")].filter((e) => {
      const s = cs(e);
      if (s.position !== "fixed" && s.position !== "absolute") return false;
      const z = parseFloat(s.zIndex);
      if (!Number.isFinite(z) || z < 100) return false;
      const r = e.getBoundingClientRect();
      return r.width >= innerWidth * 0.5 && r.height >= innerHeight * 0.35;
    });
    if (!c.length) return null;
    c.sort((a, b) => parseFloat(cs(b).zIndex) - parseFloat(cs(a).zIndex));
    return c[0];
  };

  const root = scope === "overlay" ? overlayRoot() : document.body;
  if (!root) return { error: "no overlay found on screen" };

  // Displayed-ness and size are two different questions, and conflating them cost this suite two
  // whole sheets. An ancestor is only asked whether it is displayed: a container whose children are
  // all fixed or absolute is legitimately 0px tall, and when a modal is open #root and <body> are
  // exactly that. Requiring size of every ancestor rejected every element inside those modals, so
  // Check-In and What If measured 0 controls and 0 texts and passed by having nothing to check.
  const displayed = (el) => {
    const s = cs(el);
    return !(s.display === "none" || s.visibility === "hidden" || parseFloat(s.opacity) < 0.05);
  };
  const shown = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;            // size: the element's own business
    // A closed <details> lays its answer out but never paints it: Chromium keeps boxes for
    // content-visibility:hidden content, so without this an FAQ answer's link "overlapped" the next
    // question on the Support page.
    const d = el.closest("details");
    if (d && !d.open && !el.closest("summary")) return false;
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) if (!displayed(n)) return false;
    return true;
  };
  // Content in different fixed/sticky groups overlaps legitimately: the tab bar scrolls over the page.
  const fixedGroup = (el) => {
    for (let n = el; n; n = n.parentElement) { const p = cs(n).position; if (p === "fixed" || p === "sticky") return n; }
    return null;
  };
  // …and so does content in different scroll containers. A row scrolled out of the top of a sheet's
  // list still HAS a box, and that box sits over the sheet's footer buttons. It is not on screen and
  // no finger can reach it, so comparing the two is meaningless. Two elements are only neighbours if
  // the same scroller clips them both.
  const clipGroup = (el) => {
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
      const s = cs(n);
      if (/(auto|scroll|hidden)/.test(s.overflowY) || /(auto|scroll|hidden)/.test(s.overflowX)) return n;
    }
    return null;
  };

  const all = [...root.querySelectorAll("*")];
  // A control is an interactive element containing no other interactive element: the innermost one is
  // what a finger lands on. An outer clickable card is a container, not a control.
  const controls = all.filter((el) => el.matches(CTRL_SEL) && !el.querySelector(CTRL_SEL) && shown(el));
  // Text is an element owning its own text nodes and not living inside a control.
  const texts = all.filter((el) => {
    if (el.closest(CTRL_SEL)) return false;
    if (!shown(el)) return false;
    let own = "";
    for (const n of el.childNodes) if (n.nodeType === 3) own += n.nodeValue;
    return own.trim().length > 0;
  });

  const label = (el) => (el.textContent || el.getAttribute("aria-label") || el.tagName).trim().replace(/\s+/g, " ").slice(0, 40);
  const box = (el) => { const r = el.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, h: r.height }; };
  const r1 = (n) => Math.round(n * 10) / 10;

  // Everything the pair loop needs, computed ONCE per element. The loop is O(controls x texts) —
  // about 20,000 pairs on the Activity tab — and fixedGroup/clipGroup each walk to the root calling
  // getComputedStyle. Done per pair that is a few hundred thousand style resolutions and the suite
  // takes fifteen minutes; cached, the loop is arithmetic.
  const info = new Map();
  const at = (el) => {
    let v = info.get(el);
    if (!v) { v = { box: box(el), fixed: fixedGroup(el), clip: clipGroup(el), label: label(el) }; info.set(el, v); }
    return v;
  };
  // One box wholly inside the other is a glyph drawn ON a control — the "$" prefix inside a money
  // field — not two things sitting next to each other.
  const within = (A, B) => A.l >= B.l - 0.5 && A.r <= B.r + 0.5 && A.t >= B.t - 0.5 && A.b <= B.b + 0.5;

  const V = [];
  const pair = (a, b, min, rule) => {
    const ia = at(a), ib = at(b);
    const A = ia.box, B = ib.box;
    // Cheap arithmetic reject first, which is almost every pair. Separation of `min` or more on
    // EITHER axis is enough: that axis is clear, and it also rules the other axis out, because a
    // pair separated horizontally cannot overlap vertically-as-neighbours (the stacked test needs
    // horizontal overlap) and cannot overlap at all.
    const sx = Math.max(A.l - B.r, B.l - A.r);
    const sy = Math.max(A.t - B.b, B.t - A.b);
    if (sx >= min || sy >= min) return;
    if (ia.fixed !== ib.fixed) return;
    if (ia.clip !== ib.clip) return;
    if (a.contains(b) || b.contains(a)) return;
    if (within(A, B) || within(B, A)) return;
    const ovX = Math.min(A.r, B.r) - Math.max(A.l, B.l);
    const ovY = Math.min(A.b, B.b) - Math.max(A.t, B.t);
    const rec = (kind, gap) => V.push({ kind, rule, gap: r1(gap), need: min, a: ia.label, b: ib.label,
      ax: `${Math.round(A.l)},${Math.round(A.t)} ${Math.round(A.w)}x${Math.round(A.h)}`,
      bx: `${Math.round(B.l)},${Math.round(B.t)} ${Math.round(B.w)}x${Math.round(B.h)}` });
    if (ovX > 0.5 && ovY > 0.5) return rec("overlap", -Math.min(ovX, ovY));
    // side by side: they must share most of a line to be neighbours on the x axis
    if (ovY > 0.5 * Math.min(A.h, B.h)) {
      const g = A.r <= B.l ? B.l - A.r : A.l - B.r;
      if (g >= 0 && g < min - 1e-9) rec("gapX", g);
      return;
    }
    // stacked: they must share most of a column
    if (ovX > 0.5 * Math.min(A.w, B.w)) {
      const g = A.b <= B.t ? B.t - A.b : A.t - B.b;
      if (g >= 0 && g < min - 1e-9) rec("gapY", g);
    }
  };

  for (const c of controls) for (const x of texts) pair(x, c, textCtrlMin, "text-control");
  for (let i = 0; i < controls.length; i++) for (let j = i + 1; j < controls.length; j++) pair(controls[i], controls[j], ctrlCtrlMin, "control-control");

  const small = controls.filter((c) => at(c).box.h < minTap).map((c) => ({ h: r1(at(c).box.h), need: minTap, a: at(c).label, tag: c.tagName.toLowerCase() }));

  // Rule 3 forbids truncating text, and an ellipsis is truncation with a nicer face on it. This
  // catches the DECLARATION rather than waiting for a name long enough to trigger it: a row that
  // clips "Investment Portfolio" only when the name is long is still a row that will clip it, and
  // the demo fixture is not going to supply the name that proves it. Wrap instead.
  const clipped = texts
    .filter((e) => cs(e).textOverflow === "ellipsis")
    .map((e) => ({ text: at(e).label, tag: e.tagName.toLowerCase() }));

  // Every rendered "Example · sample data" tag, with the colour it actually came out. The sweep is
  // already standing in front of each screen in demo mode, so this costs nothing and is the only
  // place that sees the tag the way a person does. Checked in section 8.
  const exampleTags = [...root.querySelectorAll("*")]
    .filter((e) => e.children.length === 0 && /^Example · sample data$/i.test((e.textContent || "").trim()) && shown(e))
    .map((e) => { const s = cs(e); return { color: s.color, fontSize: parseFloat(s.fontSize), fontWeight: s.fontWeight }; });

  // Nothing a person reads or taps sits in the safe-area strip (the iPhone Duo's 84 px pill strip,
  // a notch, the home indicator). `safe` is what env(safe-area-inset-*) resolves to on the page; the
  // callers pass it only on the passes that emulate insets.
  //   • Left and right: every text and control, wherever it is.
  //   • Top: everything on screen with the page and every scroller at the top. Content may scroll
  //     under the status bar; it may not start there.
  //   • Bottom: only what is pinned (a fixed or sticky bar, a sheet's footer). Content that scrolls
  //     may pass under the home indicator; a button that stays put may not.
  // A text is measured by its glyphs, not its block: a full-width bar whose background runs under the
  // strip is fine as long as its words and buttons are padded clear. What is measured is the part on
  // screen, after every clipping ancestor: a row scrolled out of a sideways chip list is not in the
  // strip, it is out of sight.
  const unsafe = [];
  if (safe) {
    const W = innerWidth, H = innerHeight, EPS_SAFE = 1;
    const visible = (el, R) => {
      let { l, r, t, b } = R;
      for (let n = el.parentElement; n && n !== document.documentElement; n = n.parentElement) {
        const s = cs(n);
        if (s.overflowX !== "visible" || s.overflowY !== "visible") {
          const q = n.getBoundingClientRect();
          if (s.overflowX !== "visible") { l = Math.max(l, q.left); r = Math.min(r, q.right); }
          if (s.overflowY !== "visible") { t = Math.max(t, q.top); b = Math.min(b, q.bottom); }
        }
        if (s.position === "fixed") break;   // a fixed box escapes the clipping of everything above it
      }
      l = Math.max(l, 0); r = Math.min(r, W); t = Math.max(t, 0); b = Math.min(b, H);
      return r - l > 0.5 && b - t > 0.5 ? { l, r, t, b } : null;
    };
    const glyphs = (el) => {
      let l = Infinity, r = -Infinity, t = Infinity, b = -Infinity;
      for (const n of el.childNodes) {
        if (n.nodeType !== 3 || !n.nodeValue.trim()) continue;
        const rg = document.createRange(); rg.selectNodeContents(n);
        for (const q of rg.getClientRects()) {
          if (q.width < 0.5 || q.height < 0.5) continue;
          l = Math.min(l, q.left); r = Math.max(r, q.right); t = Math.min(t, q.top); b = Math.max(b, q.bottom);
        }
      }
      return l < Infinity ? { l, r, t, b } : null;
    };
    const scrollsY = (el, stop) => {
      for (let n = el; n && n !== stop; n = n.parentElement) if (/(auto|scroll)/.test(cs(n).overflowY)) return true;
      return false;
    };
    const check = (el, R) => {
      const v = R && visible(el, R);
      if (!v) return;
      const pinned = fixedGroup(el);
      const bad = [];
      if (v.l < safe.left - EPS_SAFE) bad.push(`left ${r1(v.l)} < ${safe.left}`);
      if (v.r > W - safe.right + EPS_SAFE) bad.push(`right ${r1(W - v.r)} from the edge < ${safe.right}`);
      if (v.t < safe.top - EPS_SAFE) bad.push(`top ${r1(v.t)} < ${safe.top}`);
      if (pinned && !scrollsY(el.parentElement, pinned.parentElement) && v.b > H - safe.bottom + EPS_SAFE)
        bad.push(`bottom ${r1(H - v.b)} from the edge < ${safe.bottom}`);
      if (bad.length) unsafe.push({ a: at(el).label, tag: el.tagName.toLowerCase(), bad: bad.join(", "),
        at: `${Math.round(v.l)},${Math.round(v.t)} ${Math.round(v.r - v.l)}x${Math.round(v.b - v.t)}` });
    };
    for (const c of controls) { const R = at(c).box; check(c, R); }
    for (const x of texts) check(x, glyphs(x));
  }

  return { counts: { controls: controls.length, texts: texts.length }, violations: V, small, exampleTags, clipped, unsafe,
    hOverflow: r1(document.documentElement.scrollWidth - innerWidth) };
}

module.exports = { SCAN };
