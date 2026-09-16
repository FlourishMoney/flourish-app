// tests/locale.test.cjs
// -----------------------------------------------------------------------------
// The defect this pins: a US user read "paycheque" on Today, in onboarding, in the
// income-detection banner, in the Plan Ahead assumptions table and in the Goals
// placeholder, while reading "paycheck" on the timeline three screens away — because
// the spelling was an inline ternary at seven sites and hard-coded Canadian at eight.
// payWord is now the single owner, so the rule is testable instead of copied.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");

(async () => {
  const { payWord, isUS } = await import("../src/lib/locale.js");
  const t = create();

  t.eq(payWord("CA"), "paycheque", "1a Canada gets the Canadian spelling");
  t.eq(payWord("US"), "paycheck", "1b the US gets the US spelling");
  t.eq(payWord("us"), "paycheck", "1c case-insensitive — profile.country is not guaranteed uppercase");
  t.eq(payWord(" US "), "paycheck", "1d tolerates stray whitespace");

  // An ABSENT country must not read as the US. The app's own default profile is country:\"CA\", and every
  // real user picks one in onboarding, so the only way to get here is a missing/partial profile — where
  // the existing behaviour (and the larger market) is Canadian.
  t.eq(payWord(undefined), "paycheque", "2a undefined falls back to the Canadian spelling, matching the app's default profile");
  t.eq(payWord(null), "paycheque", "2b null likewise");
  t.eq(payWord(""), "paycheque", "2c empty string likewise");
  t.eq(payWord("GB"), "paycheque", "2d any non-US country gets the non-US spelling");

  t.eq(payWord("CA", { plural: true }), "paycheques", "3a plural, Canada");
  t.eq(payWord("US", { plural: true }), "paychecks", "3b plural, US");
  t.eq(payWord("CA", { capital: true }), "Paycheque", "3c sentence-initial, Canada");
  t.eq(payWord("US", { capital: true }), "Paycheck", "3d sentence-initial, US");
  t.eq(payWord("US", { plural: true, capital: true }), "Paychecks", "3e both at once");
  t.eq(payWord("CA", {}), "paycheque", "3f empty options behave like no options");

  t.eq(isUS("US"), true, "4a isUS");
  t.eq(isUS("CA"), false, "4b");
  t.eq(isUS(undefined), false, "4c an unknown country is not the US");

  // The two spellings must actually differ, and neither may leak the other's letters — a guard against
  // someone "simplifying" this to a single string and quietly making every user read the same word.
  t.ok(payWord("US") !== payWord("CA"), "5a the two spellings are genuinely different");
  t.ok(!payWord("US").includes("que"), "5b the US spelling carries no -que");
  t.ok(payWord("CA").endsWith("que"), "5c the Canadian spelling ends in -que");

  t.summary("locale.test");
})();
