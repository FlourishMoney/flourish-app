# Layout rules

**One sentence: nothing a finger aims at is touching something else.**

Tokens live in [`src/lib/space.js`](../../src/lib/space.js). The rule is enforced on every build by
[`tests/layout.browser.test.cjs`](../../tests/layout.browser.test.cjs), which measures the rendered
demo in Chromium at four widths and two text sizes. It is part of `npm run test:math`, the gate
branch protection requires.

## Why this exists

On Today, the line "✓ Calculated by Flourish" sat flush against the "Explain this →" pill. Zero
pixels between a sentence and a button.

Nobody wrote a zero. The row said `justifyContent:"space-between"` and the button said `flex:1`. The
button grew until it filled every spare pixel, and then "space-between" had no space left to put
between anything. The gap was *emergent* — a product of two reasonable-looking declarations and a
particular viewport width.

That is the whole argument for a measured test rather than a careful reviewer. You cannot see this
defect by reading the style object. You can only see it by asking the browser where things ended up.

## The rule

### 1. Distances come from the scale

`SPACE = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 }` — an 8px grid, so "a bit more room" is a
decision rather than a guess. New code uses these, `GAP`, or `LAYOUT`. A raw px gap or margin is a
number nobody can defend six months later.

### 2. Two clearances, and nothing goes under them

| From | To | Minimum |
| --- | --- | --- |
| text | a control (button, pill, link, chip, toggle, input, switch) | **12px** (`GAP.textToControl`) |
| a control | another control | **8px** (`GAP.controlToControl`) |
| anything | anything | **never overlapping** |

Both apply in every direction — across and down — and in both orders. A label 10px *below* a field
breaks the rule exactly as a label 10px above one does.

Text-to-text is not constrained. Two sentences may sit as close as they read well.

### 3. A row that mixes text and a control wraps

Use `row()` for the container, `rowControl()` for the control, `rowText()` for the text. When the row
runs out of width the control drops to its own line, left-aligned, and the sentence stays whole.

Never shrink the text, never truncate it, never let the two overlap. Those are the three things that
happen instead of wrapping, and all three are worse.

`row()` does not offer `flex: 1` for a control, and neither should you. A control that grows is the
thing that ate the gap in the first place.

### 4. Tap targets are at least 44px tall

`LAYOUT.minTap`, or `tap()` for both dimensions. This is Apple's number and it is not negotiable by
how small the glyph is: a 13px "✕" still needs a 44px box around it.

Where a control must *look* small — a 48×28 switch, a 22px caret — the visual element stays its own
size and the 44px box goes around it. `Toggle` is the worked example: the `role="switch"` and the
click handler live on a 44px-tall wrapper, and the pill inside is untouched.

Do not buy a tight look with negative margins. `InfoDot` used `marginLeft/Right: -10` to pull its
44px box back under the label beside it; the result was a tap aimed at the end of "Safe to spend
until next payday" opening the glossary.

### 5. It has to hold at every size we ship

**320, 375, 390 and 430px wide, at 100% and 130% text.** Those are the four phone widths and the
accessibility step. A layout that only works at 390 is not done.

## What the test measures, exactly

- **Gaps are measured between bounding boxes** — the rectangles the browser hit-tests, which is what
  a finger obeys. A text box includes its line-height leading, so a 12px token can measure 11.5. One
  pixel of tolerance (`EPS`) absorbs that; every real offender we found measured 0, 3, 4, 6, 8 or 10.
- **A control is an interactive element containing no other interactive element.** The innermost one
  is what a finger lands on; an outer clickable card is a container, not a control.
- **Text is an element that owns its own text nodes** and is not inside a control.
- **130% text is applied by scaling every rendered font size**, not by changing the root font size.
  The app is written in px, so a root font-size change would be a no-op and the test would pass
  vacuously.

Pairs are skipped when comparing them would be meaningless:

- one box wholly inside the other — a "$" drawn on a money field is part of the control, not a
  neighbour of it (so put currency prefixes *inside* the field, as `SheetField` does);
- different fixed/sticky groups — the tab bar is supposed to scroll over the page;
- different scroll containers — a row scrolled out of a sheet's list still has a box, and that box
  sits over the sheet's footer. It is not on screen and no finger can reach it.

## What it does not check

Being explicit, so nobody mistakes a green gate for more than it is:

- **Truncation.** Rule 3 forbids it, but the test does not detect it. `DashCustomize` still
  ellipsises long tile names by design.
- **Contrast and font size.** Those are `tests/typeScale.test.cjs` and the type scale.
- **Anything unreachable in demo.** The paywall, the upgrade screen and every bank-linking flow need
  a real session, so they are outside the sweep. Apply the rule by hand there.
- **Desktop widths.** The sweep is phone-first because the app is.

## A note on "8px above"

The brief for this rule said a wrapped control should land "8px above". It does not: `row()` uses 12.

8 is right when two controls stack. But the thing directly above a control that has just wrapped is
the *text* it used to sit beside, so the clearance that applies is text-to-control. Using 8 would
mean a row passed the rule while it fit on one line and failed the moment it wrapped — the opposite
of what wrapping is for. The stricter floor wins.

## Running it

```bash
npm run test:layout
```

It builds the app, serves it, and drives Chromium over every tab and every reachable sheet. Needs
`npx playwright install chromium` once. On failure it prints the screen, the width, the text of both
elements and the measured gap, so the output names the row to go and look at.
