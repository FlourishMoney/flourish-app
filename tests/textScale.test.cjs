// tests/textScale.test.cjs
// -----------------------------------------------------------------------------
// THE PHONE'S TEXT SIZE IS THE APP'S TEXT SIZE.
//
// Someone who has turned their phone's text up has already told the operating system how big they
// need text to be. An app that ignores that is asking them to say it twice, and most people do not
// know they can. It is the one accessibility setting that reaches the most people.
//
// The app has about 1,700 inline pixel font sizes, so rewriting them all into a scalable unit
// would be a large and risky change for something the platform already solves:
// -webkit-text-size-adjust multiplies the COMPUTED size of text, pixel values included, without
// moving a single layout unit. One property on the root scales all of it.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");

const MAIN = fs.readFileSync(path.join(__dirname, "..", "src", "main.jsx"), "utf8");
const HTML = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

(async () => {
  const t = create();
  const S = await import("../src/lib/textScale.js");

  // ── 1. the scale is read, not guessed, and clamped ───────────────────────────────────────────
  t.eq(S.clampScale(1), 1, "1a the default is 1");
  t.eq(S.clampScale(1.35), 1.35, "1b a real setting passes through");
  t.eq(S.clampScale(9), S.MAX_SCALE, "1c an absurd reading is clamped, so the app stays usable");
  t.eq(S.clampScale(0.2), S.MIN_SCALE, "1d …and it never shrinks text below the design size");
  t.eq(S.clampScale(NaN), 1, "1e a failed measurement reads as the default, not as zero");
  t.eq(S.clampScale(undefined), 1, "1f …and so does no measurement at all");
  t.ok(S.MAX_SCALE >= 1.6, `1g the range reaches the largest standard size (${S.MAX_SCALE})`);

  // ── 2. it is safe where there is no document ─────────────────────────────────────────────────
  t.eq(S.measureScale(null), 1, "2a measuring without a document returns the default");
  t.eq(S.applyTextScale(1.3, null), 1.3, "2b applying without a document does not throw");
  t.eq(S.measureScale({}), 1, "2c …nor does a document with no body");

  // ── 3. it is applied to the root, as TEXT size only ──────────────────────────────────────────
  {
    const styles = {}, props = {};
    const doc = { documentElement: { style: { setProperty: (k, v) => { props[k] = v; },
      set webkitTextSizeAdjust(v) { styles.webkit = v; }, get webkitTextSizeAdjust() { return styles.webkit; },
      set textSizeAdjust(v) { styles.std = v; }, get textSizeAdjust() { return styles.std; } } } };
    S.applyTextScale(1.6, doc);
    t.eq(styles.webkit, "160%", "3a WebKit (iOS) is told the scale");
    t.eq(styles.std, "160%", "3b …and so is the standard property, for Android's Chromium");
    t.eq(props["--text-scale"], "1.6", "3c and it is exposed as a variable for anything that needs it");
  }

  // ── 4. it runs before the first paint ────────────────────────────────────────────────────────
  t.ok(/import \{ initTextScale \} from '\.\/lib\/textScale\.js'/.test(MAIN), "4a main.jsx imports it");
  t.ok(/initTextScale\(\)/.test(MAIN), "4b …and calls it");
  t.ok(MAIN.indexOf("initTextScale()") < MAIN.indexOf("import('./App.jsx')"),
    "4c before the app is loaded, so nothing paints at the wrong size and then jumps");

  // ── 5. text only. Not pinch zoom. ────────────────────────────────────────────────────────────
  const src = fs.readFileSync(path.join(__dirname, "..", "src", "lib", "textScale.js"), "utf8");
  // Comments stripped: the prose explains why this is NOT pinch zoom, so scanning it for the word
  // "zoom" would fail on the explanation rather than on the behaviour.
  const code = src.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
  t.ok(!/zoom|transform:\s*scale|maximum-scale|viewport/.test(code),
    "5a it never scales layout: no zoom, no transform, no viewport change");
  t.ok(/user-scalable=no/.test(HTML), "5b …and pinch zoom stays locked in the shell, as the brief asks");
  t.ok(/-apple-system-body/.test(src), "5c iOS Dynamic Type is read through the system font shorthand");
  t.ok(/font-size:medium/.test(src), "5d …with a default-size probe for Android's font scale");

  t.summary("textScale.test");
})();
