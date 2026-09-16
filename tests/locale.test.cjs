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

  // ── 6. A FORECAST ROW MUST NOT NAME THE INCOME IT CANNOT KNOW ──────────────────────────────────
  // Spelling the word correctly is only half of it. forecastEngine sums EVERY income landing on a date
  // into one bare number (incomeByDate) and attaches no source label, so `ev.income` / `day.income` is
  // an aggregate whose origin is genuinely unknown to the surface. Both the Time Machine row and the
  // Watch forecast row used to render it as "+$560 paycheque" — over a $560 Canada Child Benefit.
  // They now say "deposit", which is true for every income type and matches the Decision Engine card
  // directly below ("your next deposit of $2,840"). Naming the ACTUAL source is the better answer and
  // requires the engine to carry it; until it does, this guard keeps the claim from creeping back.
  {
    const fs = require("fs"), path = require("path");
    const raw = fs.readFileSync(path.join(__dirname, "..", "src", "App.jsx"), "utf8");
    // Blank out every comment before scanning — the comments at these very sites EXPLAIN the rule and
    // must quote the word they banned. Newlines are preserved so reported line numbers stay true.
    const blanked = raw
      .replace(/\{?\/\*[\s\S]*?\*\/\}?/g, (m) => m.replace(/[^\n]/g, " "))
      .replace(/^\s*\/\/.*$/gm, (m) => m.replace(/[^\n]/g, " "));
    const app = blanked.split("\n");
    const payish = /paycheque|paycheck|payWord\s*\(/i;
    const perDayIncome = /\b(?:ev|day)\.income\b/;
    const offenders = [];
    app.forEach((line, i) => {
      if (perDayIncome.test(line) && payish.test(line)) offenders.push(`${i + 1}: ${line.trim().slice(0, 90)}`);
    });
    t.eq(offenders.join("\n"), "", "no surface pairs a summed per-day income figure with a pay-word claim");

    // Same defect, second shape: a sentence about what arrives NEXT. "Keeps you safe until your next
    // paycheque" sat beside a sibling branch already saying "deposit", and it fires precisely when no
    // deposit could be projected — i.e. when the app knows least about what is coming.
    const nextClaims = [];
    app.forEach((line, i) => {
      if (/until your next/i.test(line) && payish.test(line)) nextClaims.push(`${i + 1}: ${line.trim().slice(0, 90)}`);
    });
    t.eq(nextClaims.join("\n"), "", "no sentence about the NEXT income event names it as a pay cheque");
    const nextDeposit = raw.split("\n").filter(l => /until your next deposit/i.test(l) && !l.includes("/*")).length;
    t.ok(nextDeposit >= 3, `…and the surfaces that make that claim say "deposit" (found ${nextDeposit})`);

    // …and the replacement really is in place on both surfaces, so this guard cannot pass vacuously.
    const depositRows = raw.split("\n").filter(l => /\b(?:ev|day)\.income\b/.test(l) && /\bdeposit\b/.test(l) && !l.includes("/*")).length;
    t.ok(depositRows >= 3, `both forecast surfaces label a per-day income figure "deposit" (found ${depositRows} rows)`);
  }

  t.summary("locale.test");
})();
