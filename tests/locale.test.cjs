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
  const { payWord, isUS, retirementAccountsLabel } = await import("../src/lib/locale.js");
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

  // The Money Personality "Wealth Builder" insight told every user to max their RRSP/TFSA — Canadian
  // registered accounts a US household cannot open — on two surfaces with no country gate.
  t.eq(retirementAccountsLabel("CA"), "RRSP/TFSA", "4d Canada's registered accounts");
  t.eq(retirementAccountsLabel("US"), "401(k)/IRA", "4e …and the US equivalents the product already teaches");
  t.eq(retirementAccountsLabel(undefined), "RRSP/TFSA", "4f an absent country falls back to Canada, like every other helper here");
  t.ok(!retirementAccountsLabel("US").includes("RRSP") && !retirementAccountsLabel("CA").includes("401"),
    "4g neither label leaks the other country's accounts");

  // The two spellings must actually differ, and neither may leak the other's letters — a guard against
  // someone "simplifying" this to a single string and quietly making every user read the same word.
  t.ok(payWord("US") !== payWord("CA"), "5a the two spellings are genuinely different");
  t.ok(!payWord("US").includes("que"), "5b the US spelling carries no -que");
  t.ok(payWord("CA").endsWith("que"), "5c the Canadian spelling ends in -que");

  // ── 6. A FORECAST ROW MUST NOT NAME THE INCOME IT CANNOT KNOW ──────────────────────────────────
  // Spelling the word correctly is only half of it. forecastEngine sums EVERY income landing on a date
  // into one bare number (incomeByDate), so `ev.income` / `day.income` is an aggregate that cannot name
  // its own origin. Both the Time Machine row and the
  // Watch forecast row used to render it as "+$560 paycheque" — over a $560 Canada Child Benefit.
  // They then said "deposit", which is true for every income type. The engine now carries the source
  // (ev.deposits, recorded as each income is credited), and the rows render depositLines(ev): one line
  // per deposit, named after its income entry ("+$560 Canada Child Benefit"), with "deposit" as the
  // fallback for an unnamed entry. This guard still keeps a pay-word from creeping back onto any of it.
  {
    const fs = require("fs"), path = require("path");
    const raw = fs.readFileSync(path.join(__dirname, "..", "src", "App.jsx"), "utf8");
    // Blank out every comment before scanning — the comments at these very sites EXPLAIN the rule and
    // must quote the word they banned. Newlines are preserved so reported line numbers stay true.
    const blanked = raw
      .replace(/\{?\/\*[\s\S]*?\*\/\}?/g, (m) => m.replace(/[^\n]/g, " "))
      // Trailing `//` comments too, not just line-leading ones — the widened "your next" scan below
      // otherwise trips on its own explanatory comments. The lookbehind spares `https://`.
      .replace(/(?<!:)\/\/[^\n]*/g, (m) => " ".repeat(m.length));
    const app = blanked.split("\n");
    const payish = /paycheque|paycheck|payWord\s*\(/i;
    const perDayIncome = /\b(?:ev|day)\.income\b|\bdepositLines\s*\(/;
    const offenders = [];
    app.forEach((line, i) => {
      if (perDayIncome.test(line) && payish.test(line)) offenders.push(`${i + 1}: ${line.trim().slice(0, 90)}`);
    });
    t.eq(offenders.join("\n"), "", "no surface pairs a summed per-day income figure with a pay-word claim");

    // Same defect, second shape: a sentence about what arrives NEXT. "Keeps you safe until your next
    // paycheque" sat beside a sibling branch already saying "deposit", and it fires precisely when no
    // deposit could be projected — i.e. when the app knows least about what is coming.
    // GUARD GAP, closed: this used to test only /until your next/, and a THIRD instance of the same
    // claim sat in the "Can I afford this?" widget as "after your next ${payWord(...)}" — the guard
    // walked straight past it. The pattern is now "your next <pay-word>" in any preposition.
    const nextClaims = [];
    app.forEach((line, i) => {
      if (/your next/i.test(line) && payish.test(line)) nextClaims.push(`${i + 1}: ${line.trim().slice(0, 90)}`);
    });
    t.eq(nextClaims.join("\n"), "", "no sentence about the NEXT income event names it as a pay cheque, in ANY preposition");
    const nextDeposit = raw.split("\n").filter(l => /until your next deposit/i.test(l) && !l.includes("/*")).length;
    t.ok(nextDeposit >= 3, `…and the surfaces that make that claim say "deposit" (found ${nextDeposit})`);

    // …and the replacement really is in place on both surfaces, so this guard cannot pass vacuously:
    // every forecast row renders depositLines(), whose only generic word is "deposit".
    const depositRows = raw.split("\n").filter(l => /\bdepositLines\((?:ev|day)\)\.map\(/.test(l) && !l.includes("/*")).length;
    t.ok(depositRows >= 3, `both forecast surfaces label a per-day income figure by source, else "deposit" (found ${depositRows} rows)`);
    const view = fs.readFileSync(path.join(__dirname, "..", "src", "lib", "forecastView.js"), "utf8");
    const fn = view.slice(view.indexOf("export function depositLines"));
    t.ok(/label: "deposit"/.test(fn) && !payish.test(fn), "depositLines falls back to \"deposit\" and never to a pay-word");
  }

  // ── 7. A BENEFIT THAT IS NOT FEDERAL MUST CARRY A PROVINCE ────────────────────────────────────
  // The Ontario Trillium Benefit was named to every Canadian in TWO arrays — the tax-tip list and the
  // benefits checker. Both are claims about money a person is owed, made to people who are not owed
  // it. A checker entry is now gated by a `province` field. This scans the benefits-checker arrays and
  // fails if any entry whose own text names a province or state lacks that gate, so the next one
  // cannot be added ungated.
  {
    const fs = require("fs"), path = require("path");
    const raw = fs.readFileSync(path.join(__dirname, "..", "src", "App.jsx"), "utf8");
    const PLACES = /Ontario|Quebec|Alberta|Manitoba|Saskatchewan|British Columbia|Nova Scotia|New Brunswick|Newfoundland|Northern Ontario|New York|Illinois|Minnesota|California|Texas|Florida/;
    const blocks = [...raw.matchAll(/benefitsChecker:\s*\[([\s\S]*?)\n\s*\],/g)].map(m => m[1]);
    t.eq(blocks.length, 2, "7a both country benefits-checker arrays are found (CA and US)");
    const offenders = [];
    for (const block of blocks) {
      for (const row of block.split(/\n/)) {
        if (!row.includes("{name:")) continue;
        if (PLACES.test(row) && !/province:/.test(row)) offenders.push(row.trim().slice(0, 96));
      }
    }
    t.eq(offenders.join("\n"), "", "7b every benefits-checker entry naming a province or state carries a `province` gate");
    // Non-vacuous: the gated entry really is there, and it really is gated.
    const trillium = blocks.join("\n").split(/\n/).find(r => r.includes("Ontario Trillium Benefit"));
    t.ok(!!trillium, "7c …and the Ontario Trillium row is present to be gated");
    t.ok(/province:"ON"/.test(trillium || ""), "7d …gated to Ontario specifically");
    // The render must read a FILTERED list, and the count badge must read the same one.
    t.eq((raw.match(/_eligibleBenefits/g) || []).length, 3, "7e one filtered list, read by both the count badge and the list itself");
    t.eq((raw.match(/cfg\.benefitsChecker\.(map|length)/g) || []).join(","), "", "7f …and nothing renders the unfiltered array any more");
  }

  // ── 8. ONE WORD, ONE MEANING: "buffer" ────────────────────────────────────────────────────────
  // Three screens used it for three different quantities: the "Spending buffer" line inside
  // safe-to-spend (~10 days of average spend, held back), the Meet card's "buffer grows to $2,326"
  // (which is the SAVINGS BALANCE after a transfer), and Autopilot's "Untouched buffer" (the residual
  // after the day's plan allocates everything). The headline line item keeps the word because it is a
  // term in the calculation a user can see; the other two now say what they actually are.
  {
    const fs = require("fs"), path = require("path");
    const read = (f) => fs.readFileSync(path.join(__dirname, "..", "src", f), "utf8");
    const view = read("lib/safeToSpendView.js"), meet = read("lib/meetSnapshot.js"), app = read("App.jsx");
    t.ok(/label: "Spending buffer"/.test(view), "8a the safe-to-spend line item keeps the word");
    t.ok(!/buffer grows to/.test(meet), "8b the Meet card no longer calls the savings balance a buffer");
    t.ok(/savings grows to/.test(meet), "8c …it says savings, which is what savingsBufferAfter returns");
    t.ok(!/"Untouched buffer"/.test(app), "8d Autopilot no longer calls its residual a buffer");
    t.ok(/label:"Left over"/.test(app), "8e …it says what it is");
  }

  t.summary("locale.test");
})();
