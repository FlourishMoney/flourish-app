// tests/spaceTokens.test.cjs
// -----------------------------------------------------------------------------
// THE SPACING SCALE EXISTS, AND THE PILE OF HAND-WRITTEN PIXELS ONLY GETS SMALLER.
//
// src/lib/space.js closes the set of distances the way type.js closed the set of font sizes. This
// file checks the tokens are what the rule says they are, and ratchets the count of raw px gaps and
// margins still in App.jsx so new code cannot add to it.
//
// A ratchet rather than a ban, because App.jsx carries 1,374 of them and converting all 1,374 blind
// would be a far riskier change than the defect it fixes. The rule is "no raw px in NEW code", and a
// number that may only go down is how you enforce that on a file this size.
//
// If this fails: use SPACE / GAP / LAYOUT from src/lib/space.js. If a raw pixel is genuinely right —
// a 6px dot, a 2px hairline, a 1px optical nudge — it will not match these patterns anyway, because
// they only look at gaps and margins. Lowering BASELINE when you convert some is expected and good.
// Raising it needs a sentence in the PR saying why a token would not do.
//
// The layout rule this serves is docs/design/LAYOUT-RULES.md; the geometry itself is measured by
// tests/layout.browser.test.cjs.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");

const APP = path.join(__dirname, "..", "src", "App.jsx");

// The count on the commit that introduced the rule. It may go down freely.
const BASELINE = 1373;

// gap/margin declarations written as a bare number. `gap: SPACE.sm` and `gap: n * 2` are not raw.
const PATTERNS = {
  gap:          /\bgap:\s*\d+(?!\d*\s*\*)/g,
  columnGap:    /\bcolumnGap:\s*\d+/g,
  rowGap:       /\browGap:\s*\d+/g,
  margin:       /\bmargin:\s*\d+/g,
  marginTop:    /\bmarginTop:\s*\d+/g,
  marginBottom: /\bmarginBottom:\s*\d+/g,
  marginLeft:   /\bmarginLeft:\s*\d+/g,
  marginRight:  /\bmarginRight:\s*\d+/g,
};

(async () => {
  const t = create();
  const S = await import("../src/lib/space.js");

  // ── 1. the tokens ────────────────────────────────────────────────────────────
  t.eq(S.SPACE, { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 }, "1a the 8px scale, unchanged");
  t.eq(S.LAYOUT, { sideMargin: 16, cardPadding: 16, cardGap: 12, minTap: 44 }, "1b the layout numbers");
  t.eq(S.GAP.textToControl, 12, "1c text to control: 12");
  t.eq(S.GAP.controlToControl, 8, "1d control to control: 8");
  t.ok(S.GAP.textToControl > S.GAP.controlToControl,
    "1e text needs MORE clearance than another control — a sentence has no edge a finger can feel");
  t.eq(S.tap(), { minWidth: 44, minHeight: 44 }, "1f tap() is 44 square");
  t.eq(S.tap({ width: 10 }), { minWidth: 44, minHeight: 44, width: 10 }, "1g …and takes overrides");

  // ── 2. the row helpers ───────────────────────────────────────────────────────
  const r = S.row();
  t.eq(r.display, "flex", "2a row() is flex");
  t.eq(r.flexWrap, "wrap", "2b …and wraps");
  t.eq(r.columnGap, 12, "2c …with 12 across");
  t.eq(r.rowGap, 12, "2d …and 12 down, because what is above a wrapped control is text");
  t.ok(!("gap" in r), "2e …and never the `gap` shorthand, whose override depends on declaration order");
  t.eq(S.row({ justifyContent: "space-between" }).justifyContent, "space-between", "2f row() takes overrides");
  t.eq(S.rowControl(), { flexShrink: 0, whiteSpace: "nowrap", minHeight: 44 }, "2g rowControl() holds its size");
  t.eq(S.rowText(), { flexShrink: 1, minWidth: 0 }, "2h rowText() gives way instead");
  t.ok(!("flex" in S.rowControl()) && !("flex" in S.row()),
    "2i neither helper offers flex:1 — a growing control is what ate the gap on Today");

  // ── 3. App.jsx reads the tokens from space.js ────────────────────────────────
  const raw = fs.readFileSync(APP, "utf8");
  t.ok(/import\s*\{[^}]*\bSPACE\b[^}]*\}\s*from\s*"\.\/lib\/space\.js"/.test(raw),
    "3a SPACE comes from space.js");
  t.ok(/import\s*\{[^}]*\bGAP\b[^}]*\}\s*from\s*"\.\/lib\/space\.js"/.test(raw), "3b so does GAP");
  t.ok(/import\s*\{[^}]*\brow\b[^}]*\}\s*from\s*"\.\/lib\/space\.js"/.test(raw), "3c and row()");
  const typeImport = (raw.match(/import\s*\{([^}]*)\}\s*from\s*"\.\/lib\/type\.js"/) || [, ""])[1];
  t.eq(/\b(SPACE|LAYOUT|GAP|tap)\b/.test(typeImport), false,
    `3d …and no distance token comes from type.js any more (it imports: ${typeImport.trim()})`);

  // ── 4. the ratchet ───────────────────────────────────────────────────────────
  const src = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const counts = {};
  let total = 0;
  for (const [name, re] of Object.entries(PATTERNS)) {
    counts[name] = (src.match(re) || []).length;
    total += counts[name];
  }
  t.ok(total <= BASELINE,
    `4a raw px gaps/margins in App.jsx: ${total}, baseline ${BASELINE}. ` +
    `Use SPACE / GAP / LAYOUT from src/lib/space.js for new spacing — see docs/design/LAYOUT-RULES.md. ` +
    `Breakdown: ${JSON.stringify(counts)}`);
  if (total < BASELINE) {
    console.log(`    note: ${BASELINE - total} raw px gap/margin(s) converted since the baseline — lower BASELINE to ${total}.`);
  }

  t.summary("SPACE tokens");
})();
