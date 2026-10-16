// tests/phoneScrollSource.test.cjs
// -----------------------------------------------------------------------------
// THE CAUSE OF THE vc14 SCROLL FREEZE, CHECKED IN THE SOURCE (hotfix vc15).
//
// overscroll-behavior: contain stops a scroll gesture from passing to the page. Current Chromium applies
// it to any scroll container, even one that can never scroll, so it belongs only on an element that
// really scrolls its own contents: one with a bounded height (height or maxHeight, not minHeight) and
// overflow-y auto or scroll. On vc14 it sat on the phone layout's content column, which has no height
// limit (the page scrolls), and every tab froze under a finger. The behaviour in a browser is
// tests/phoneScroll.browser.test.cjs.
//
// SRC (env) points the check at another copy of src/App.jsx, to show it fails on the vc14 source.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const APP_PATH = process.env.SRC || path.join(ROOT, "src", "App.jsx");

// The inline style object around position i: from the nearest "style={{" before it to its closing "}}".
function styleAround(src, i) {
  const start = src.lastIndexOf("style={{", i);
  if (start < 0) return null;
  let depth = 0;
  for (let j = start + "style=".length; j < src.length; j++) {
    if (src[j] === "{") depth++;
    else if (src[j] === "}") { depth--; if (depth === 0) return src.slice(start, j + 1); }
  }
  return null;
}
// The CSS rule around position i in a stylesheet string: from the "{" before it to the "}" after it.
function ruleAround(src, i) {
  const open = src.lastIndexOf("{", i), close = src.indexOf("}", i);
  return open < 0 || close < 0 ? null : src.slice(open, close + 1);
}

(async () => {
  const t = create();
  const files = [APP_PATH, ...fs.readdirSync(path.join(ROOT, "src", "lib")).filter((f) => /\.(js|jsx)$/.test(f)).map((f) => path.join(ROOT, "src", "lib", f)), path.join(ROOT, "index.html")];
  const offenders = [];
  let seen = 0;
  for (const f of files) {
    const src = fs.readFileSync(f, "utf8");
    for (const m of src.matchAll(/overscrollBehavior(?:Y)?\s*:\s*["'](contain|none)["']/g)) {
      seen++;
      const s = styleAround(src, m.index) || "";
      const bounded = /(?:^|[{,\s])(?:height|maxHeight)\s*:/.test(s), scrolls = /overflowY?\s*:\s*["'](auto|scroll)["']/.test(s);
      if (!(bounded && scrolls)) offenders.push(`${path.relative(ROOT, f)}: ${s.slice(0, 140)}`);
    }
    for (const m of src.matchAll(/overscroll-behavior(?:-y)?\s*:\s*(contain|none)/g)) {
      seen++;
      const r = ruleAround(src, m.index) || "";
      const bounded = /(?:^|[{;\s])(?:height|max-height)\s*:/.test(r), scrolls = /overflow(?:-y)?\s*:\s*(auto|scroll)/.test(r);
      if (!(bounded && scrolls)) offenders.push(`${path.relative(ROOT, f)}: ${r.slice(0, 140)}`);
    }
  }
  t.eq(offenders, [], `1 overscroll-behavior contain or none only on an element that really scrolls (a bounded height and overflow auto or scroll); ${seen} found`);

  const app = fs.readFileSync(APP_PATH, "utf8");
  const mobile = app.slice(app.indexOf("// ── MOBILE LAYOUT"));
  const col = mobile.match(/<div style=\{\{flex:1,padding:"16px 18px 120px"[^}]*\}\}>\{content\(\)\}<\/div>/);
  t.ok(!!col, "2 (the phone layout's content column is found)");
  t.ok(!!col && !/overscroll/i.test(col[0]), "3 the phone layout's content column sets no overscroll-behavior: it has no height limit, so the page scrolls, not the column");
  t.ok(!!col && !/(?:^|[{,])(?:height|maxHeight)\s*:/.test(col[0].replace(/minHeight/g, "")), "4 …and it still has no height limit (if it is ever given one, it becomes the scroller and this file must change with it)");

  t.summary("phoneScrollSource.test");
})();
