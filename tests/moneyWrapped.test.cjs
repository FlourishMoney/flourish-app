// tests/moneyWrapped.test.cjs
// -----------------------------------------------------------------------------
// Sprint C Fix 2 — Money Wrapped must not present CURRENT net worth as an annual CHANGE.
//
// The slide rendered current net worth as "Your net worth changed by +$75.0k / You grew richer this
// year" — over ~90 days of data, with a Share button. There is no trustworthy annual baseline, so the
// headline must be current-state: a signed magnitude, no leading "+", never labelled "changed".
// -----------------------------------------------------------------------------
"use strict";

const { create } = require("./_runner.cjs");

(async () => {
  const { formatWrappedNetWorth } = await import("../src/lib/moneyWrapped.js");
  const t = create();

  // ── No baseline → CURRENT STATE, never "change" ─────────────────────────────────────────────────
  {
    const r = formatWrappedNetWorth(75000);
    t.eq(r.mode, "current", "with no baseline the headline is current-state, not a change");
    t.eq(r.label, "Your net worth today",
         "label never says 'changed' — the old 'Your net worth changed by' claimed a delta that " +
         "doesn't exist without a baseline");
    t.ok(!/chang|grew|this year|increase|decrease/i.test(r.label + " " + r.caption),
         "neither label nor caption implies a year-over-year gain/loss");
  }

  // ── Positive value gets NO leading "+" ──────────────────────────────────────────────────────────
  {
    const r = formatWrappedNetWorth(75000);
    t.eq(r.display, "$75.0k", "a positive net worth shows '$75.0k' — NO leading '+' implying a gain");
    t.ok(!r.display.startsWith("+"), "explicitly: no '+' prefix");
    t.eq(r.positive, true, "positive flag set for colouring, without asserting a change");
  }

  // ── Negative formats correctly ──────────────────────────────────────────────────────────────────
  {
    const r = formatWrappedNetWorth(-12400);
    t.eq(r.display, "-$12.4k", "a negative net worth shows '-$12.4k'");
    t.eq(r.positive, false, "negative flag set");
    t.eq(r.mode, "current", "still current-state, still no false 'you shrank this year' claim");
  }

  // ── A real baseline (supported, tested) produces the correct signed delta ────────────────────────
  {
    const up = formatWrappedNetWorth(100000, 40000);
    t.eq(up.mode, "change", "a valid baseline switches to change mode");
    t.eq(up.value, 60000, "delta is current − baseline (100k − 40k = 60k)");
    t.eq(up.display, "$60.0k", "positive delta shows '$60.0k' — still no leading '+'");
    t.eq(up.positive, true, "positive delta flagged");

    const down = formatWrappedNetWorth(40000, 100000);
    t.eq(down.value, -60000, "negative delta is current − baseline (40k − 100k = -60k)");
    t.eq(down.display, "-$60.0k", "negative delta shows '-$60.0k'");
    t.eq(down.label, "Your net worth changed by", "change mode may say 'changed by' — it is TRUE here");
  }

  // ── Missing/invalid baseline falls back to current-state ────────────────────────────────────────
  {
    t.eq(formatWrappedNetWorth(50000, null).mode, "current", "null baseline → current-state");
    t.eq(formatWrappedNetWorth(50000, undefined).mode, "current", "undefined baseline → current-state");
    t.eq(formatWrappedNetWorth(50000, NaN).mode, "current",
         "NaN baseline is not a real value → current-state, never a nonsense delta");
    t.eq(formatWrappedNetWorth(50000, NaN).display, "$50.0k", "and it shows the current figure");
  }

  // ── Malformed current value → no NaN ────────────────────────────────────────────────────────────
  {
    t.eq(formatWrappedNetWorth(NaN).display, "$0.0k", "NaN net worth → $0.0k, never 'NaNk'");
    t.eq(formatWrappedNetWorth(undefined).display, "$0.0k", "undefined net worth → $0.0k");
    t.eq(formatWrappedNetWorth(0).display, "$0.0k", "exactly zero shows $0.0k, no sign");
  }

  t.summary("moneyWrapped.test");
})();
