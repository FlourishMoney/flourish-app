// src/lib/type.js
// -----------------------------------------------------------------------------
// ONE TYPE SCALE, AND A FLOOR NOBODY GOES UNDER.
//
// The app grew 1,718 hand-written font sizes across 39 distinct values, and 905 of them — more
// than half the text a person reads — were under 13px. That is why the screens read as "really
// small and messy": there is no hierarchy, because with 39 sizes there is no such thing as bigger.
//
// These are the eight sizes. They are Apple's text styles by another name, and the point of a
// closed set is that a screen built from it has an order you can see at a glance.
//
// THE FLOOR IS 13. Nothing a person reads is smaller. Two exceptions, and only two:
//   the tab bar labels, which Apple itself sets at 10-12 and which are never read as prose;
//   the "Example · sample data" tag, which is a marker on top of content, not content.
// Both are marked in the source with SMALL_TEXT_OK, and tests/typeScale.test.cjs fails the build
// on any other font size below the floor. The marker is the allow-list: there is no separate file
// to forget to update, and adding one is a visible act in a diff.
// -----------------------------------------------------------------------------

// The floor. Below this, text stops being readable for a lot of people — and "a lot" includes
// everyone over about forty, in a moving car, in the sun.
export const TYPE_MIN = 13;

// The marker that opts a single declaration out of the floor. Written as a comment beside the
// fontSize it applies to, e.g.  fontSize:11,   /* SMALL_TEXT_OK: tab bar label */
export const SMALL_TEXT_OK = "SMALL_TEXT_OK";

// The scale. fontWeight and lineHeight travel WITH the size, because a headline is not a body
// line in bold — it is its own thing, and splitting them is how the hierarchy got lost.
export const TYPE = {
  largeTitle: { fontSize: 34, fontWeight: 800, lineHeight: 1.12 },  // the one number on a screen
  title:      { fontSize: 28, fontWeight: 800, lineHeight: 1.18 },  // screen titles
  title2:     { fontSize: 22, fontWeight: 700, lineHeight: 1.25 },  // section and card titles
  headline:   { fontSize: 17, fontWeight: 600, lineHeight: 1.4 },   // the lead line of a card
  body:       { fontSize: 17, fontWeight: 400, lineHeight: 1.55 },  // sentences
  callout:    { fontSize: 16, fontWeight: 500, lineHeight: 1.5 },   // secondary sentences
  subhead:    { fontSize: 15, fontWeight: 600, lineHeight: 1.4 },   // labels above a value
  footnote:   { fontSize: 13, fontWeight: 400, lineHeight: 1.5 },   // disclaimers, timestamps
};

// The sizes the scale allows, for the test to check against.
export const TYPE_SIZES = Object.values(TYPE).map(t => t.fontSize);

// Spacing: an 8px grid, so that "a bit more room" is a decision rather than a guess.
export const SPACE = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

// The three numbers that decide whether a screen feels calm.
export const LAYOUT = {
  sideMargin: 16,   // every screen, both edges
  cardPadding: 16,  // every card, all four sides
  cardGap: 12,      // between cards
  minTap: 44,       // every tappable thing, both dimensions
};

// A tap target that is at least 44x44 however small its contents are.
export const tap = (extra = {}) => ({ minWidth: LAYOUT.minTap, minHeight: LAYOUT.minTap, ...extra });
