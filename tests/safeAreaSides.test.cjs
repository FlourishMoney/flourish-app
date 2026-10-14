// tests/safeAreaSides.test.cjs
// -----------------------------------------------------------------------------
// SAFE-AREA PADDING IS NOT CANCELLED, AND EVERY FIXED SHELL HAS IT (xcode27-duo).
//
// The iPhone Duo keeps an 84 px strip on the left, the right or the top depending on the display and
// the rotation (tests/_duo.cjs), and iOS reports each side through env(safe-area-inset-*). The layout
// and a11y browser suites measure the result at the Duo's four viewports. This file pins the two
// ways it breaks in the source, where those suites cannot always see it:
//
//   1. A later `padding:` shorthand in the same style object resets a safe-area longhand before it.
//      React applies a style object's keys in order, so {...safeX(20), padding:24} pads 24 on every
//      side and the inset is gone, with nothing on screen to say so until the strip covers a button.
//   2. A full-screen backdrop or fixed bar without per-side padding. Every position:fixed, inset:0
//      layer that holds content, the banner stack, the tab bar and the tour card take theirs from
//      src/lib/safeArea.js.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");

const APP = fs.readFileSync(path.join(__dirname, "..", "src", "App.jsx"), "utf8");

// Every inline style object literal, with where it starts: the text between `style={{` and its
// matching `}}`. Template literals and strings are skipped while counting braces.
function styleObjects(src) {
  const out = [];
  let i = 0;
  while ((i = src.indexOf("style={{", i)) !== -1) {
    const start = i + "style={".length;
    let depth = 0, j = start, q = null;
    for (; j < src.length; j++) {
      const c = src[j];
      if (q) { if (c === "\\") { j++; continue; } if (c === q) q = null; continue; }
      if (c === '"' || c === "'" || c === "`") { q = c; continue; }
      if (c === "{") depth++;
      else if (c === "}") { depth--; if (depth === 0) break; }
    }
    out.push({ at: src.slice(0, i).split("\n").length, text: src.slice(start, j + 1) });
    i = j;
  }
  return out;
}

const SAFE = /\.\.\.(?:safeX|overlaySafe|bannerEdges)\(|padding(?:Top|Right|Bottom|Left)\s*:\s*(?:[^,]*env\(safe-area-inset|safeSide\(|INSET\.|`calc\([^`]*\$\{INSET\.)/;
// Only keys at the object's own top level count: a nested object (a spread argument, a ternary
// branch) is not the same style object.
function topLevelKeys(obj) {
  const keys = [];
  let depth = 0, q = null, tokenStart = 1;
  for (let j = 1; j < obj.length - 1; j++) {
    const c = obj[j];
    if (q) { if (c === "\\") { j++; continue; } if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === "`") { q = c; continue; }
    if (c === "{" || c === "(" || c === "[") depth++;
    else if (c === "}" || c === ")" || c === "]") depth--;
    else if (c === "," && depth === 0) { keys.push({ at: tokenStart, text: obj.slice(tokenStart, j).trim() }); tokenStart = j + 1; }
  }
  keys.push({ at: tokenStart, text: obj.slice(tokenStart, obj.length - 1).trim() });
  return keys.filter((k) => k.text);
}

(async () => {
  const t = create();
  const objs = styleObjects(APP);
  t.ok(objs.length > 1000, `0 the scan sees the app's style objects (${objs.length})`);

  // ── 1. no shorthand after a safe-area longhand ──────────────────────────────────────────────
  const cancelled = [];
  let safeObjects = 0;
  for (const o of objs) {
    const keys = topLevelKeys(o.text);
    const first = keys.findIndex((k) => SAFE.test(k.text));
    if (first < 0) continue;
    safeObjects++;
    const later = keys.slice(first + 1).find((k) => /^padding\s*:/.test(k.text));
    if (later) cancelled.push(`App.jsx:${o.at} "${later.text.slice(0, 40)}" after "${keys[first].text.slice(0, 50)}"`);
  }
  t.ok(safeObjects >= 25, `1a the scan finds the safe-area padding (${safeObjects} style objects)`);
  t.eq(cancelled, [], "1b no padding shorthand comes after a safe-area longhand in the same style object");

  // The scan itself, on the two shapes it exists for.
  const probe = (src) => { const o = styleObjects(src)[0]; const k = topLevelKeys(o.text); const f = k.findIndex((x) => SAFE.test(x.text)); return f >= 0 && k.slice(f + 1).some((x) => /^padding\s*:/.test(x.text)); };
  t.eq(probe('<div style={{...safeX(20),padding:24}}/>'), true, "1c the scan catches a shorthand after a spread");
  t.eq(probe('<div style={{paddingLeft:"env(safe-area-inset-left)",color:"red",padding:"4px"}}/>'), true, "1d …and after an env() longhand");
  t.eq(probe('<div style={{padding:24,...overlaySafe(24, { bottom: true })}}/>'), false, "1e a shorthand BEFORE the safe padding is fine");

  // centredInSafeArea places a fixed bar with left, right and auto side margins; a later key that
  // sets any of those, or the margin shorthand, puts it back across the strip.
  const uncentred = [];
  for (const o of objs) {
    const keys = topLevelKeys(o.text);
    const f = keys.findIndex((k) => /^\.\.\.centredInSafeArea\(/.test(k.text));
    if (f < 0) continue;
    const later = keys.slice(f + 1).find((k) => /^(?:margin|marginLeft|marginRight|left|right|width|transform|inset)\s*:/.test(k.text));
    if (later) uncentred.push(`App.jsx:${o.at} "${later.text.slice(0, 40)}"`);
  }
  t.eq(uncentred, [], "1f nothing after centredInSafeArea moves the bar back across a side strip");

  // ── 2. every fixed full-screen layer that holds content pads per side ───────────────────────
  const fixedFull = objs.filter((o) => /^\{\s*position:\s*(["'])fixed\1,\s*inset:\s*0\b/.test(o.text));   // either quote: the Reorder sheet's single quotes hid it once
  // The two that hold no content of their own: the ambient background, and the tour's root, whose
  // card is placed by centredInSafeArea (check 3).
  const decorative = fixedFull.filter((o) => /pointerEvents:\s*["']none["']/.test(o.text));
  const holders = fixedFull.filter((o) => !decorative.includes(o));
  t.ok(holders.length >= 20, `2a the scan finds the app's sheets and dialogs (${holders.length})`);
  t.eq(holders.filter((o) => !/\.\.\.overlaySafe\(/.test(o.text)).map((o) => `App.jsx:${o.at}`), [],
    "2b every backdrop that holds a sheet or dialog keeps it clear of the side and top strips (overlaySafe)");
  t.eq(decorative.length, 2, "2c …and the only fixed full-screen layers without it are the two that take no taps");

  // ── 3. the fixed bars ────────────────────────────────────────────────────────────────────────
  t.ok(/position:"fixed",bottom:"max\(16px, env\(safe-area-inset-bottom\)\)",\.\.\.centredInSafeArea\(20, 390\)/.test(APP),
    "3a the tab bar is centred in the safe area, not on the whole screen");
  t.ok(/id="tour-sheet"[^>]*\.\.\.centredInSafeArea\(20, 390\)/.test(APP), "3b …and so is the tour card");
  t.ok(!/left:"50%",transform:"translateX\(-50%\)",zIndex:50/.test(APP), "3c the old screen-centred tab bar is gone");
  for (const name of ["syncBanner", "migratedBanner", "demoBanner", "offlineBanner"]) {
    const at = APP.indexOf(`const ${name} = `);
    const decl = APP.slice(at, APP.indexOf("}}>", at));
    t.ok(/\.\.\.bannerEdges\("/.test(decl), `3d ${name} pads the side strips, and the top inset when it is first`);
  }
  t.ok(/right:`calc\(2px \+ \$\{INSET\.right\}\)`/.test(APP), "3e the demo banner's close button sits inside the right-hand safe area");
  t.ok(/padding:"max\(14px, calc\(env\(safe-area-inset-top, 0px\) - var\(--banner-h, 0px\)\)\) 20px 12px"/.test(APP),
    "3f the mobile header takes the top inset only when no banner above it already has");

  t.summary("safeAreaSides.test");
})();
