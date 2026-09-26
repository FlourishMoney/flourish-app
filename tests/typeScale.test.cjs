// tests/typeScale.test.cjs
// -----------------------------------------------------------------------------
// NOTHING A PERSON READS IS UNDER 13PX, AND NOTHING SHOUTS IN LETTER-SPACED CAPS.
//
// The app had 1,718 hand-written font sizes across 39 distinct values, and 905 of them — more than
// half the text on screen — were under 13. That is the whole of "the text is really small": not
// one bad screen, but no floor anywhere. It also had 139 labels styled uppercase with positive
// letter-spacing, which is the other half of "messy": every section heading shouting at the same
// pitch, so none of them ranks above another.
//
// This file is the floor and the ban, checked on every build. The allow-list is a marker written
// beside the declaration it excuses, so there is no separate list to forget and adding one shows
// up in a diff as an explicit sentence.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");

const SRC = path.join(__dirname, "..", "src");
const walk = (d) => fs.readdirSync(d, { withFileTypes: true })
  .flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
// The token module DEFINES the rules; its doc comment shows an example declaration, so scanning
// it would count that example as a use.
const FILES = walk(SRC).filter(f => /\.(jsx?|tsx?)$/.test(f) && !f.endsWith("lib/type.js"));

(async () => {
  const t = create();
  const T = await import("../src/lib/type.js");
  // SPACE, LAYOUT and tap() moved to space.js when the layout rule grew its own vocabulary around
  // them (see docs/design/LAYOUT-RULES.md). Section 5 still checks them from here, because this file
  // is where "the sizes and the distances are decided, not guessed" has always been asserted.
  const S = await import("../src/lib/space.js");

  // ── 1. one scale, and it is the one Apple uses by another name ───────────────────────────────
  t.eq(T.TYPE_MIN, 13, "1a the floor is 13");
  t.eq(T.TYPE.largeTitle.fontSize, 34, "1b large title 34");
  t.eq(T.TYPE.title.fontSize, 28, "1c title 28");
  t.eq(T.TYPE.title2.fontSize, 22, "1d title 2 22");
  t.eq(T.TYPE.headline.fontSize, 17, "1e headline 17");
  t.eq(T.TYPE.headline.fontWeight, 600, "1f …semibold, so it ranks above body at the same size");
  t.eq(T.TYPE.body.fontSize, 17, "1g body 17");
  t.eq(T.TYPE.callout.fontSize, 16, "1h callout 16");
  t.eq(T.TYPE.subhead.fontSize, 15, "1i subhead 15");
  t.eq(T.TYPE.footnote.fontSize, 13, "1j footnote 13");
  t.eq(Math.min(...T.TYPE_SIZES), T.TYPE_MIN, "1k the smallest thing in the scale IS the floor");

  // ── 2. the floor holds across every source file ──────────────────────────────────────────────
  const under = [];
  for (const f of FILES) {
    const src = fs.readFileSync(f, "utf8");
    const re = /(?:fontSize:|font-size:)\s*([0-9]+(?:\.[0-9]+)?)/g;
    let m;
    while ((m = re.exec(src)) !== null) {
      if (parseFloat(m[1]) >= T.TYPE_MIN) continue;
      // The allow-list: a marker on the same declaration, saying why.
      if (src.slice(m.index + m[0].length, m.index + m[0].length + 60).includes(T.SMALL_TEXT_OK)) continue;
      under.push(`${path.relative(SRC, f)}:${src.slice(0, m.index).split("\n").length} = ${m[1]}`);
    }
  }
  t.ok(/font-size:/.test(fs.readFileSync(path.join(SRC, "App.jsx"), "utf8")),
    "2a0 (control) there IS CSS-written type in the file, so the scan below is doing work — the " +
    "first version of this test only looked at the JS property and missed an entire stylesheet");
  t.eq(under.join(" | ") || "(none)", "(none)",
    `2a no font size below ${T.TYPE_MIN} outside the allow-list. To add one, write ` +
    `/* ${T.SMALL_TEXT_OK}: <why> */ beside it — and say why in the diff.`);

  // ── 3. the allow-list is exactly ONE exception, and no more ─────────────────────────────────
  const allowed = [];
  for (const f of FILES) {
    const src = fs.readFileSync(f, "utf8");
    const re = new RegExp(`fontSize:\\s*([0-9.]+)[^\\n]{0,20}${T.SMALL_TEXT_OK}:\\s*([^*\\n]+)`, "g");
    let m;
    while ((m = re.exec(src)) !== null) allowed.push({ size: parseFloat(m[1]), why: m[2].trim() });
  }
  t.eq(allowed.length, 1, "3a exactly one declaration is excused");
  t.ok(allowed.every(a => a.size >= 11), "3b …and it does not go below 11, which is Apple's own floor for a tab bar");
  t.ok(allowed.some(a => /tab bar/i.test(a.why)), "3c it is the tab bar label");
  // The sample-data tag used to be the second exception, at 11px on Meet. It is the label that tells
  // someone the numbers are not theirs, and on a real phone it was the thing people squinted at, so
  // it now lives by the floor like everything else. It must never come back to the allow-list.
  t.ok(!allowed.some(a => /tag|provenance|sample/i.test(a.why)),
    "3d the sample-data tag is NOT excused — it renders at the floor now");
  t.ok(allowed.every(a => a.why.length > 12), "3e it says why, in words, not just that it is allowed");

  // ── 4. no letter-spaced shouting ─────────────────────────────────────────────────────────────
  const shouty = [];
  for (const f of FILES) {
    const src = fs.readFileSync(f, "utf8");
    const re = /textTransform:\s*"uppercase"|text-transform:\s*uppercase/g;
    let m;
    while ((m = re.exec(src)) !== null) shouty.push(`${path.relative(SRC, f)}:${src.slice(0, m.index).split("\n").length}`);
  }
  t.eq(shouty.join(" | ") || "(none)", "(none)",
    "4a no label is rendered in uppercase. Section headings are sentence case, which is what lets " +
    "one of them look more important than another.");
  // Positive letter-spacing is the other half of the effect; negative is legitimate on big numerals.
  const spaced = [];
  for (const f of FILES) {
    const src = fs.readFileSync(f, "utf8");
    const re = /letterSpacing:\s*([0-9.]+)|letter-spacing:\s*([0-9.]+)px/g;
    let m;
    while ((m = re.exec(src)) !== null) {
      if (parseFloat(m[1] || m[2]) < 1) continue;   // hairline tracking on a wordmark is not a shouted label
      if (/code field|character/i.test(src.slice(m.index, m.index + 120))) continue;  // a character spacer, marked as one
      spaced.push(`${path.relative(SRC, f)}:${src.slice(0, m.index).split("\n").length} = ${m[1] || m[2]}`);
    }
  }
  t.eq(spaced.join(" | ") || "(none)", "(none)",
    "4b and none is tracked out by 1px or more, which only ever read as a label shouting");

  // ── 5. spacing and touch, as numbers rather than habits ──────────────────────────────────────
  t.eq(S.LAYOUT.sideMargin, 16, "5a 16px side margins");
  t.eq(S.LAYOUT.cardPadding, 16, "5b 16px card padding");
  t.eq(S.LAYOUT.cardGap, 12, "5c 12px between cards");
  t.eq(S.LAYOUT.minTap, 44, "5d 44px minimum tap target");
  t.eq(JSON.stringify(Object.values(S.SPACE)), JSON.stringify([4, 8, 12, 16, 24, 32]),
    "5e and the spacing steps are an 8px grid (with a 4px half-step), not free numbers");
  t.eq(S.tap().minWidth, 44, "5f tap() gives anything a 44px target");
  t.eq(S.tap().minHeight, 44, "5g …in both dimensions");

  t.summary("typeScale.test");
})();
