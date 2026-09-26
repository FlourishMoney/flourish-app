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
// THE FLOOR IS 13. Nothing a person reads is smaller. One exception, and only one:
//   the tab bar labels, which Apple itself sets at 10-12 and which are never read as prose.
//
// The "Example · sample data" tag used to be the second. The argument was that a marker on top of
// content is not content — true on paper, wrong on a phone, where it was the thing people squinted
// at, and it is the one label that says the numbers are not yours. It renders at the floor now.
// The remaining exception is marked in the source with SMALL_TEXT_OK, and tests/typeScale.test.cjs fails the build
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

// SPACE, LAYOUT and tap() used to live here. They are distances, not type, and the layout rule grew
// its own vocabulary around them (GAP, row, rowControl), so they moved next door to space.js.
// See docs/design/LAYOUT-RULES.md.
