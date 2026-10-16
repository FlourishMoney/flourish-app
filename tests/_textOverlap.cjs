// tests/_textOverlap.cjs
// -----------------------------------------------------------------------------
// TEXT THAT RUNS INTO OTHER TEXT, OR UNDER A CONTROL, OR IS CUT OFF: the measurement used by
// textOverlap.browser.test.cjs.
//
// Why a second measurement next to tests/_layoutScan.cjs. That one compares ELEMENT boxes and skips any
// pair in different clipping containers. A word that is too long for a squeezed flex column spills out
// of its own box, so its box never overlaps anything; and the control it runs under usually sits in its
// own overflow:hidden wrapper (the "$ 840 /mo" amount boxes on Do), so the pair is skipped. On a real
// Android phone with a larger system font the budget's category names ran under those amount boxes and
// the sweep passed.
//
// This one measures the TEXT ITSELF: the rectangles of every rendered line of every text node
// (Range.getClientRects, the glyph boxes the reader sees), each cut down to what its clipping ancestors
// let show. Three findings:
//   text over text      two lines of different text nodes share area (more than SLOP px each way);
//   text under control  a line of text shares area with a control it is not part of (a button, an input);
//   cut off             a line is cut by an overflow:hidden or clip ancestor (a scroller is not a cut:
//                       its text is reached by scrolling). An intended ellipsis (text-overflow) is not.
// Pairs in different fixed or sticky layers are not compared (the tab bar floats over the page by
// design), and when a sheet is open only the sheet is measured (scope "overlay").
// -----------------------------------------------------------------------------
"use strict";

// Kept as one function with no closure over Node scope: it is stringified by page.evaluate().
function TEXT_OVERLAP({ scope = "page", slop = 2 } = {}) {
  const CTRL = 'button, a[href], input, select, textarea, [role="button"], [role="switch"], [role="checkbox"], [role="tab"], [role="link"], [contenteditable="true"]';
  const cs = (el) => getComputedStyle(el);
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
  const root = (scope === "overlay" && overlayRoot()) || document.body;
  const displayed = (el) => {
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
      const s = cs(n);
      if (s.display === "none" || s.visibility === "hidden" || parseFloat(s.opacity) < 0.05) return false;
      if (n.tagName === "DETAILS" && !n.open && !el.closest("summary")) return false;
    }
    return true;
  };
  const layer = (el) => { for (let n = el; n; n = n.parentElement) { const p = cs(n).position; if (p === "fixed" || p === "sticky") return n; } return null; };
  // The ancestors that clip el's painting, nearest first, and whether each is a cut (hidden/clip) or a scroller.
  // The text's own element counts: a screen-reader-only label is clipped by its own overflow and clip.
  const clippers = (el, own = false) => {
    const out = [];
    for (let n = own ? el : el.parentElement; n && n !== document.documentElement; n = n.parentElement) {
      const s = cs(n);
      if (s.clip && s.clip !== "auto" || /inset\(50%|polygon\(0 0, 0 0|circle\(0/.test(s.clipPath)) { out.push({ n, gone: true }); continue; }
      if (s.overflowX === "visible" && s.overflowY === "visible") continue;
      const scroller = /(auto|scroll)/.test(s.overflowX + s.overflowY);
      out.push({ n, scroller, ellipsis: s.textOverflow === "ellipsis" });
    }
    return out;
  };
  const inter = (a, b) => ({ l: Math.max(a.l, b.l), t: Math.max(a.t, b.t), r: Math.min(a.r, b.r), b: Math.min(a.b, b.b) });
  const area = (q) => Math.max(0, q.r - q.l) * Math.max(0, q.b - q.t);
  const R = (r) => ({ l: r.left, t: r.top, r: r.right, b: r.bottom });
  const r1 = (n) => Math.round(n * 10) / 10;
  const label = (s) => s.replace(/\s+/g, " ").trim().slice(0, 50);

  // Every line of every visible text node.
  const lines = [];
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    const txt = n.nodeValue || "";
    if (!txt.trim()) continue;
    const el = n.parentElement;
    if (!el || el.closest("script, style, noscript, svg, [aria-hidden='true'] svg") || !displayed(el)) continue;
    // A watermark is decoration, not reading text: a large faint emoji behind a card's corner is cut
    // by the card on purpose. Text drawn at under 20% opacity (all ancestors counted) is not measured.
    let op = 1; for (let m = el; m && m !== document.documentElement; m = m.parentElement) op *= parseFloat(cs(m).opacity);
    if (op < 0.2) continue;
    const range = document.createRange(); range.selectNodeContents(n);
    const cl = clippers(el, true);
    if (cl.some((c) => c.gone)) continue;               // visually hidden on purpose (read by screen readers)
    for (const rr of range.getClientRects()) {
      if (rr.width < 1 || rr.height < 1) continue;
      const raw = R(rr);
      let vis = raw, cutBy = null;
      for (const c of cl) {
        if (c.gone) continue;
        const box = R(c.n.getBoundingClientRect());
        const next = inter(vis, box);
        if (!c.scroller && !c.ellipsis && area(next) < area(vis) - (vis.b - vis.t) * 1.5 && !cutBy) cutBy = c.n;
        vis = next;
      }
      if (area(vis) < 1) continue;                       // scrolled or clipped out of sight entirely
      // The glyphs, not the font's box: a line's box carries the font's ascent and descent, which overlap
      // a tightly set neighbour's without any letter touching. The middle of the line is where letters are.
      const inset = (raw.b - raw.t) * 0.18;
      const core = { l: vis.l + 0.5, r: vis.r - 0.5, t: Math.max(vis.t, raw.t + inset), b: Math.min(vis.b, raw.b - inset) };
      lines.push({ node: n, el, ctrl: el.closest(CTRL), layer: layer(el), raw, vis, core, cutBy, text: label(txt) });
    }
  }
  // Every visible control, cut down the same way.
  const controls = [];
  for (const el of root.querySelectorAll(CTRL)) {
    if (!displayed(el)) continue;
    // A link inside a sentence that wraps is two boxes, one per line; its bounding box would cover the
    // words between them.
    if (cs(el).display === "inline" && el.getClientRects().length > 1) {
      for (const rr of el.getClientRects()) {
        let v = R(rr);
        for (const c of clippers(el)) if (!c.gone) v = inter(v, R(c.n.getBoundingClientRect()));
        if (area(v) >= 1) controls.push({ el, layer: layer(el), vis: v, text: label(el.getAttribute("aria-label") || el.textContent || "") });
      }
      continue;
    }
    let vis = R(el.getBoundingClientRect());
    if (area(vis) < 1) continue;
    // A text field is measured by where its typing goes: a "$" set in its left padding is designed in.
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) {
      const s = cs(el), px = (v) => parseFloat(v) || 0;
      vis = { l: vis.l + px(s.borderLeftWidth) + px(s.paddingLeft), r: vis.r - px(s.borderRightWidth) - px(s.paddingRight),
        t: vis.t + px(s.borderTopWidth) + px(s.paddingTop), b: vis.b - px(s.borderBottomWidth) - px(s.paddingBottom) };
    }
    for (const c of clippers(el)) if (!c.gone) vis = inter(vis, R(c.n.getBoundingClientRect()));
    if (area(vis) < 1) continue;
    controls.push({ el, layer: layer(el), vis,
      text: label(el.getAttribute("aria-label") || el.textContent || el.getAttribute("placeholder") || el.value || el.tagName.toLowerCase()) });
  }

  const found = [];
  const seen = new Set();
  const hit = (a, b) => { const q = inter(a, b); return (q.r - q.l) > slop && (q.b - q.t) > slop ? q : null; };
  for (let i = 0; i < lines.length; i++) {
    const A = lines[i];
    for (let j = i + 1; j < lines.length; j++) {
      const B = lines[j];
      if (A.node === B.node || A.layer !== B.layer) continue;
      const q = hit(A.core, B.core);
      if (!q) continue;
      const key = `tt|${A.text}|${B.text}`; if (seen.has(key)) continue; seen.add(key);
      found.push({ kind: "text over text", a: A.text, b: B.text, by: `${r1(q.r - q.l)}x${r1(q.b - q.t)}px` });
    }
    for (const C of controls) {
      if (A.layer !== C.layer || (A.ctrl && (A.ctrl === C.el || A.ctrl.contains(C.el) || C.el.contains(A.ctrl))) || C.el.contains(A.el)) continue;
      const q = hit(A.core, C.vis);
      if (!q) continue;
      const key = `tc|${A.text}|${C.text}`; if (seen.has(key)) continue; seen.add(key);
      found.push({ kind: "text under control", a: A.text, b: C.text, by: `${r1(q.r - q.l)}x${r1(q.b - q.t)}px` });
    }
    if (A.cutBy) {
      const key = `cut|${A.text}`;
      if (!seen.has(key)) { seen.add(key); found.push({ kind: "cut off", a: A.text, b: `<${A.cutBy.tagName.toLowerCase()}> overflow hidden`, by: `${r1((A.raw.r - A.raw.l) - (A.vis.r - A.vis.l))}x${r1((A.raw.b - A.raw.t) - (A.vis.b - A.vis.t))}px hidden` }); }
    }
  }
  return { lines: lines.length, controls: controls.length, found };
}

// Text at k times its size, as Android WebView renders it under a larger system font: every element's
// computed size, read before any is changed, times k (reading and writing in one pass compounds, since a
// child inherits its parent's new size). Elements that appear later (a sheet opening) are scaled when
// this is called again; an element already done is left alone.
function SCALE_TEXT_ONCE(k) {
  const todo = [];
  for (const el of document.querySelectorAll("body *")) {
    if (el.dataset.fsOnce) continue;
    const fs = parseFloat(getComputedStyle(el).fontSize);
    if (fs) todo.push([el, fs, el.parentElement && el.parentElement.dataset.fsOnce ? parseFloat(el.parentElement.dataset.fsOnce) : null]);
  }
  for (const [el, fs, parentScaled] of todo) {
    // A child that only inherited its size from an already scaled parent already has it.
    const base = parentScaled && Math.abs(fs - parentScaled * k) < 0.01 ? fs / k : fs;
    el.style.fontSize = base * k + "px";
    el.dataset.fsOnce = String(base);
  }
  return todo.length;
}

module.exports = { TEXT_OVERLAP, SCALE_TEXT_ONCE };
