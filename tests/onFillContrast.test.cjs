// tests/onFillContrast.test.cjs
// -----------------------------------------------------------------------------
// TEXT ON A FILLED COLOUR CLEARS AA 4.5:1, IN BOTH THEMES (prompt 4b item 4).
//
// White text sat on 45 coloured fills. On the dark theme's bright fills it was under 3:1 (white on
// green #00CC85 is 2.0:1). Each one now takes its colour from textOn(fill…) in App.jsx, which picks
// white or a near-black ink by measured contrast, or, in Money Wrapped, sits under a dark scrim.
// axe checks the screens it can reach (a11y.browser.test.cjs); this checks every fill, reachable or
// not, by arithmetic:
//   1. textOn clears 4.5:1 on every fill the app passes it, in the light and the dark palette;
//   2. no white text colour is left outside textOn, an isDark guard or Money Wrapped;
//   3. Money Wrapped: a 60% black scrim, secondary text at 86% white and card overlays at 12% white
//      keep every line at 4.5:1 or better on all eight slide colours;
//   4. Settings' section rows are real buttons (focusable, announced, Enter and Space).
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");
const { loadApp, describe, REPO } = require("./_renderApp.cjs");

const APP = fs.readFileSync(path.join(REPO, "src", "App.jsx"), "utf8");

const hex = (h) => { const m = /^#?([0-9a-f]{6})/i.exec(h); return [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16)); };
const lum = (c) => { const l = c.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2]; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const over = (fg, a, bg) => fg.map((c, i) => c * a + bg[i] * (1 - a));

(async () => {
  const t = create();
  let A = {};
  try { A = loadApp(["textOn", "contrastRatio", "DARK_C", "LIGHT_C", "WRAP_SCRIM", "WRAP_SUB"]); } catch (e) { t.ok(false, `App.jsx bundles: ${describe(e)}`); }

  // ── 1. textOn, on every fill the app gives it ─────────────────────────────────────────────────
  const FILLS = [["green"], ["teal"], ["red"], ["purple"], ["orange"], ["pink"], ["green", "greenBright"], ["teal", "tealBright"],
    ["purple", "purpleBright"], ["orange", "orangeBright"], ["orange", "gold"], ["pink", "pinkBright"]];
  for (const [name, P] of [["dark", A.DARK_C], ["light", A.LIGHT_C]]) {
    for (const f of FILLS) {
      const cols = f.map(k => k.startsWith("#") ? k : P[k]);
      const ink = A.textOn(...cols);
      const worst = Math.min(...cols.map(c => ratio(hex(ink), hex(c))));
      t.ok(worst >= 4.5, `1 ${name}: text on ${f.join(" → ")} is ${ink} at ${worst.toFixed(2)}:1`);
    }
  }
  t.eq([A.textOn("#0D3320", "#0A2518"), A.textOn("#FFFFFF")], ["#FFFFFF", "#0B1220"], "1b white on a dark fill, ink on a light one");

  // ── 2. No white text left outside textOn, an isDark guard or Money Wrapped ───────────────────
  const wi = APP.indexOf("function MoneyWrapped("), wj = APP.indexOf("\nfunction ", wi + 20);
  const rest = APP.slice(0, wi) + APP.slice(wj);
  const bare = [...rest.matchAll(/color:\s*["'](#fff|#FFF|#ffffff|#FFFFFF|white)["']/g)]
    .filter(m => !/isDark/.test(rest.slice(Math.max(0, m.index - 40), m.index + m[0].length + 5)))
    .map(m => rest.slice(Math.max(0, m.index - 80), m.index + 14).replace(/\s+/g, " "));
  t.eq(bare, [], "2 every white text colour outside Money Wrapped comes from textOn or an isDark guard");
  t.ok((APP.match(/textOn\(/g) || []).length >= 34, `2b textOn carries the fills it replaced (${(APP.match(/textOn\(/g) || []).length} uses)`);

  // ── 3. Money Wrapped ───────────────────────────────────────────────────────────────────────────
  const wrapped = APP.slice(wi, wj);
  const scrim = Number((/rgba\(0,0,0,([\d.]+)\)/.exec(A.WRAP_SCRIM || "") || [])[1]);
  const sub = Number((/rgba\(255,255,255,([\d.]+)\)/.exec(A.WRAP_SUB || "") || [])[1]);
  const cards = [...wrapped.matchAll(/background:"rgba\(255,255,255,([\d.]+)\)"/g)].map(m => Number(m[1]));
  t.eq([scrim, sub], [0.6, 0.86], "3a the scrim is 60% black and secondary text 86% white");
  t.ok(cards.length > 0 && Math.max(...cards) <= 0.12, `3b card overlays are at most 12% white (${[...new Set(cards)].join(", ")})`);
  t.eq((wrapped.match(/bg:`\$\{WRAP_SCRIM\},linear-gradient/g) || []).length, (wrapped.match(/bg:`/g) || []).length, "3c every slide sits under the scrim");
  t.ok(!/"#ffffff[0-9a-f]{2}"/i.test(wrapped), "3d no translucent white below 86% is left for text");
  let worst = 99;
  for (const P of [A.DARK_C, A.LIGHT_C]) for (const k of ["green", "teal", "purple", "orange"]) for (const card of [0, Math.max(...cards)]) {
    const bg = over([255, 255, 255], card, over([0, 0, 0], scrim, hex(P[k])));
    worst = Math.min(worst, ratio(over([255, 255, 255], sub, bg), bg), ratio([255, 255, 255], bg));
  }
  t.ok(worst >= 4.5, `3e every line of Money Wrapped clears 4.5:1 on all eight slide colours (worst ${worst.toFixed(2)}:1)`);

  // ── 4. Settings' section rows ─────────────────────────────────────────────────────────────────
  t.ok(/<div role="button" tabIndex=\{0\} aria-expanded=\{isActive\}\s*onClick=\{\(\)=>setActiveSection\(isActive \? null : item\.key\)\}\s*onKeyDown=\{e=>\{if\(e\.key==="Enter"\|\|e\.key===" "\)/.test(APP),
    "4 Settings' section rows (Profile & Income … Dashboard) are buttons: focusable, announced as expanded or not, and open with Enter or Space");

  t.summary("onFillContrast.test");
  setImmediate(() => process.exit(process.exitCode || 0));
})();
