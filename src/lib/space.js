// src/lib/space.js
// -----------------------------------------------------------------------------
// ONE SPACING SCALE, AND TWO CLEARANCES NOTHING GOES UNDER.
//
// type.js closed the set of font sizes. This closes the set of distances. The reason it exists is a
// row on Today: "✓ Calculated by Flourish" sat flush against the "Explain this →" pill, zero pixels
// between a sentence and a button, because the row said justifyContent:"space-between" and the
// button said flex:1 — the button ate every spare pixel and "space-between" had no space left to
// put between anything. Nobody wrote "0"; the zero was emergent, which is exactly why it needed a
// test rather than another careful reviewer.
//
// The two numbers below are the whole rule:
//
//   TEXT to CONTROL, never under 12.  A sentence touching a button reads as one object, and the
//   finger aimed at the end of the sentence lands on the button.
//   CONTROL to CONTROL, never under 8.  Two adjacent targets need a miss margin.
//
// Both are measured between bounding boxes — the same thing the browser hit-tests, and the same
// thing tests/layout.browser.test.cjs measures. A box includes its line-height leading, so a
// measured 11.5 can look like 14 on screen. The measured number is the one that governs: it is the
// one a finger obeys.
//
// The full statement of the rule, including what it does NOT cover, is docs/design/LAYOUT-RULES.md.
// -----------------------------------------------------------------------------

// The 8px grid, so that "a bit more room" is a decision rather than a guess.
// Use these. A raw px gap or margin in new code is a number nobody can defend later.
export const SPACE = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

// The four numbers that decide whether a screen feels calm.
export const LAYOUT = {
  sideMargin: 16,   // every screen, both edges
  cardPadding: 16,  // every card, all four sides
  cardGap: 12,      // between cards
  minTap: 44,       // every tappable thing, both dimensions
};

// The two clearances, named so a diff can be read. These are floors, not targets.
export const GAP = {
  textToControl: SPACE.md,    // 12
  controlToControl: SPACE.sm, // 8
};

// A tap target that is at least 44x44 however small its contents are.
export const tap = (extra = {}) => ({ minWidth: LAYOUT.minTap, minHeight: LAYOUT.minTap, ...extra });

// A row that mixes text with a control.
//
// Wrapping is the point. The alternative to wrapping is one of the three things the rule forbids:
// the text shrinks, the text truncates, or the two overlap. When the row runs out of width the
// control drops to its own line 8px below, and the sentence stays whole.
//
// rowGap is 12, not 8.
//
// The brief for this rule said the dropped control should land "8px above", and 8 is right when two
// controls stack. But the thing directly above a control that has just wrapped is the text it used to
// sit beside — so the clearance that applies is text-to-control, and that floor is 12. Using 8 here
// would mean a row PASSED the rule while it fit on one line and FAILED the moment it wrapped, which
// is the opposite of what wrapping is for. The stricter floor wins; see LAYOUT-RULES.md §"Why 12".
//
// columnGap/rowGap rather than the `gap` shorthand: the shorthand would set both and the override
// would then depend on declaration order, which is not something to rely on in an inline style.
export const row = (extra = {}) => ({
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  columnGap: GAP.textToControl,
  rowGap: GAP.textToControl,
  ...extra,
});

// The control inside such a row. It never shrinks and never wraps its own label: when there is no
// room it moves to the next line intact. flex:1 is the thing that caused the original bug — a
// control that grows has eaten the gap before anyone measures it — so it is not offered here.
export const rowControl = (extra = {}) => ({
  flexShrink: 0,
  whiteSpace: "nowrap",
  minHeight: LAYOUT.minTap,
  ...extra,
});

// The text inside such a row: it may wrap onto more lines, but it is never squeezed narrower than
// its content by a neighbouring control.
export const rowText = (extra = {}) => ({ flexShrink: 1, minWidth: 0, ...extra });
