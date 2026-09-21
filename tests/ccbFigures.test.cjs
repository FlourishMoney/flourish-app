// tests/ccbFigures.test.cjs
// -----------------------------------------------------------------------------
// THE CANADA CHILD BENEFIT HAS ONE OWNER: TAX_DATA.CA.CCB.
//
// The app shipped the July 2025 to June 2026 figures ($7,997 under 6, $6,748 ages
// 6 to 17) into a benefit year where the CRA pays $8,157 and $6,883. It went stale
// because four surfaces each printed their own copy of the numbers: the Tax Tips
// card, the benefits checker row, a Learn card, and the coach's system prompt.
//
// So this file pins two things:
//   1. the table holds the 2026-27 figures the CRA publishes, and
//   2. NO CCB dollar amount exists anywhere in src/ or netlify/ outside that table.
//
// Rule 2 is the one that matters in a year's time. It fails on the specific
// statutory numbers wherever they appear, AND on any literal dollar figure sitting
// on a line that talks about the CCB — so the next person cannot reintroduce a
// hardcoded amount, whatever its value.
//
// Source for every figure asserted here, verified 2026-09-21:
// https://www.canada.ca/en/revenue-agency/services/child-family-benefits/canada-child-benefit/how-much.html
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");

const REPO = path.join(__dirname, "..");
const TABLE_FILE = path.join("src", "lib", "taxData.js");

function walk(dir, out = []) {
  for (const e of fs.readdirSync(path.join(REPO, dir), { withFileTypes: true })) {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== "node_modules") walk(rel, out); }
    else if (/\.(js|jsx|cjs|mjs)$/.test(e.name)) out.push(rel);
  }
  return out;
}

(async () => {
  const { TAX_DATA, ccbMonthly } = await import("../src/lib/taxData.js");
  const t = create();
  const CCB = TAX_DATA.CA.CCB;

  // ── 1. The benefit year, and what the CRA pays in it ─────────────────────────────────────────
  t.eq(CCB.benefitYear, "2026-07/2027-06", "1a the table is on the July 2026 to June 2027 benefit year");
  t.eq(CCB.basedOnTaxYear, 2025, "1b …which the CRA calculates from 2025 adjusted family net income");
  t.eq(CCB.maxUnder6, 8157, "1c maximum per child under 6 is $8,157 (was $7,997 — a benefit year stale)");
  t.eq(CCB.max6to17, 6883, "1d maximum per child aged 6 to 17 is $6,883 (was $6,748)");
  t.eq(CCB.phaseOutStart, 38237, "1e the full amount is paid through an AFNI of $38,237");
  t.eq(CCB.phaseOutSecond, 82847, "1f the reduction continues at a lower rate over $82,847");
  t.ok(/canada\.ca/.test(CCB.source), "1g the source is a Canada.ca page");
  t.ok(/^\d{4}-\d{2}-\d{2}$/.test(CCB.lastVerified), "1h …with the date it was last checked against that page");

  // The CRA prints a monthly figure beside each annual one. Deriving it keeps one owner, so this
  // asserts the derivation lands exactly on the published monthly amounts.
  t.eq(ccbMonthly(CCB.maxUnder6), 679.75, "1i the derived monthly under-6 amount is the CRA's $679.75");
  t.eq(ccbMonthly(CCB.max6to17), 573.58, "1j …and the 6-to-17 one is the CRA's $573.58");

  // Invariants that hold in every benefit year — a typo in next July's bump trips these.
  t.ok(CCB.maxUnder6 > CCB.max6to17, "1k the under-6 amount is the larger of the two");
  t.ok(CCB.phaseOutStart < CCB.phaseOutSecond, "1l …and the first threshold sits below the second");
  t.ok(CCB.maxUnder6 > 7997, "1m the figures moved UP from the previous benefit year, as indexing does");

  // ── 2. No CCB dollar amount lives outside the table ──────────────────────────────────────────
  const files = [...walk("src"), ...walk("netlify")].filter(f => f !== TABLE_FILE);
  t.ok(files.length > 20, `2a scanning the shipped source (${files.length} files, excluding the table itself)`);

  // (a) the statutory figures themselves, current and stale, wherever they appear
  const STATUTORY = /\$\s?(8,?157|6,?883|38,?237|82,?847|679\.75|573\.58|7,?997|6,?748)\b/;
  const statutoryHits = [];
  // (b) any literal dollar amount on a line that talks about the CCB. `$${...}` is interpolation,
  //     not a literal, and does not match: the pattern needs a digit straight after the dollar sign.
  //
  //     No comment-skipping here, on purpose. The first version of this test tried to exempt
  //     comments by tracking /* ... */, and a line comment containing "/api/*" put the scanner into
  //     block-comment mode for the rest of App.jsx — it then passed with a hardcoded $9,100 sitting
  //     in the benefits checker. So every CCB line with a literal amount must be listed HERE, keyed
  //     to the file, a distinctive fragment of the line, and the EXACT set of literals allowed on
  //     it. Add a CCB amount to one of these lines and the literal set no longer matches: it fails.
  const CCB_LINE = /\bCCB\b|Canada Child Benefit|child benefit/i;
  const LITERAL = /\$\d[\d,]*(?:\.\d+)?/g;
  const ALLOWED = [
    { file: path.join("src", "App.jsx"), must: "RESP+CESG", literals: ["$2,500", "$500"],
      why: "the coach prompt names CCB (interpolated from the table) beside RESP/CESG, whose grant amounts these are" },
    { file: path.join("src", "App.jsx"), must: '"paycheque" over a', literals: ["$560"],
      why: "a comment explaining the demo household's own monthly benefit, which is asserted in section 3" },
  ];
  const hardcodedHits = [];

  for (const f of files) {
    const lines = fs.readFileSync(path.join(REPO, f), "utf8").split("\n");
    lines.forEach((line, i) => {
      if (STATUTORY.test(line)) statutoryHits.push(`${f}:${i + 1}`);
      if (!CCB_LINE.test(line)) return;
      const literals = line.match(LITERAL) || [];
      if (!literals.length) return;
      const exempt = ALLOWED.some(a => f === a.file && line.includes(a.must) && literals.every(l => a.literals.includes(l)));
      if (!exempt) hardcodedHits.push(`${f}:${i + 1} ${literals.join(",")}`);
    });
  }

  t.eq(statutoryHits.join(" | ") || "(none)", "(none)", "2b no CCB statutory figure appears outside TAX_DATA.CA.CCB");
  t.eq(hardcodedHits.join(" | ") || "(none)", "(none)", "2c no hardcoded dollar amount sits on a CCB line anywhere in src/ or netlify/");

  // …and the surfaces that print CCB really do read the table.
  const app = fs.readFileSync(path.join(REPO, "src", "App.jsx"), "utf8");
  const readers = (app.match(/TAX_DATA\.CA\.CCB\./g) || []).length;
  t.ok(readers >= 8, `2d App.jsx reads the table for every CCB figure it prints (${readers} reads)`);
  t.ok(/import \{ TAX_DATA, ccbMonthly \}/.test(app), "2e …including the monthly helper, so no surface divides by 12 itself");
  for (const needle of ["Canada Child Benefit (CCB)", "benefitsChecker", "PARENT: CCB"]) {
    t.ok(app.includes(needle), `2f the ${needle} surface is still present to read it`);
  }

  // ── 3. The demo household's benefit is a household amount, not a statutory one ────────────────
  // src/lib/demoFixture.js gives the sample family $560/month of CCB. That is what THAT family
  // receives at its income, not a maximum, so it is deliberately not in the table and is not
  // updated with the benefit year. What must stay true is that it remains payable.
  {
    const fixture = fs.readFileSync(path.join(REPO, "src", "lib", "demoFixture.js"), "utf8");
    const m = /label: "Canada Child Benefit", amount: "(\d+(?:\.\d+)?)"/.exec(fixture);
    t.ok(!!m, "3a the demo household has a Canada Child Benefit income");
    const demoMonthly = parseFloat(m[1]);
    t.ok(demoMonthly > 0, "3b …with a positive monthly amount");
    t.ok(demoMonthly <= ccbMonthly(CCB.maxUnder6),
      `3c …that never exceeds the monthly maximum (${demoMonthly} <= ${ccbMonthly(CCB.maxUnder6)}), so the sample stays possible`);
  }

  // ── 4. The wording says what the CRA does ────────────────────────────────────────────────────
  // The CRA pays the full amount THROUGH the first threshold and the benefit reduces only once income
  // is over it, so "under $38,237" is wrong at exactly $38,237. Over the second threshold the CRA
  // applies a fixed reduction plus a LOWER marginal rate, so the benefit keeps falling but more
  // slowly: "steeper" / "tapers faster" is backwards.
  {
    const P = "TAX_DATA.CA.CCB.phaseOutStart.toLocaleString()";
    const orLess = "an adjusted family net income of $${" + P + "} or less";
    const occurrences = app.split(orLess).length - 1;
    t.eq(occurrences, 3, "4a the Tax Tips card, the Learn card and the coach prompt each say 'adjusted family net income of $38,237 or less'");
    t.ok(!/income under \$\$\{TAX_DATA\.CA\.CCB\.phaseOutStart/.test(app), "4b …and none of them says 'income under $38,237'");
    t.ok(!/full amount under \$\$\{TAX_DATA\.CA\.CCB\.phaseOutStart/.test(app), "4c …including the coach prompt's old 'full amount under' form");
    t.ok(app.includes("Above that the amount gradually reduces, and it keeps reducing more slowly over $${TAX_DATA.CA.CCB.phaseOutSecond.toLocaleString()}."),
      "4d the Learn card says the reduction continues more slowly over the second threshold");
    t.ok(!/tapers faster|steeper/i.test(app), "4e nothing in App.jsx says the benefit tapers faster or steeper over the second threshold");
    const table = fs.readFileSync(path.join(REPO, TABLE_FILE), "utf8");
    t.ok(!/steeper/i.test(table), "4f …and neither does the table's own commentary");
    t.ok(/LOWER marginal rate/.test(table), "4g the table's commentary records that the rate over $82,847 is lower");
  }

  t.summary("ccbFigures.test");
})();
