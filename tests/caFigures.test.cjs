// tests/caFigures.test.cjs
// -----------------------------------------------------------------------------
// EVERY CANADIAN GOVERNMENT FIGURE HAS ONE OWNER: TAX_DATA.CA.
//
// The CCB audit (PR #4) found one stale program. This file is the same guard for
// the rest of them, after the 2026-09-21 audit against Canada.ca / CRA / Ontario.ca.
// What that audit found is pinned below, because these are claims about money the
// government owes a user: a stale one sends them to the CRA expecting the wrong
// amount, and several were one to three years out of date.
//
// Section 3 is the part that matters a year from now: no program figure, current
// OR stale, may appear anywhere in src/ or netlify/ outside the table.
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
  const { TAX_DATA, creditWorth } = await import("../src/lib/taxData.js");
  const t = create();
  const CA = TAX_DATA.CA;
  const app = fs.readFileSync(path.join(REPO, "src", "App.jsx"), "utf8");

  // ── 1. Every entry says where it came from and when it was checked ───────────────────────────
  {
    const entries = Object.entries(CA).filter(([, v]) => v && typeof v === "object");
    t.ok(entries.length >= 15, `1a the table holds every Canadian program (${entries.length} entries)`);
    const noSource = entries.filter(([, v]) => !/canada\.ca|ontario\.ca/.test(v.source || ""));
    t.eq(noSource.map(([k]) => k).join(",") || "(none)", "(none)", "1b every entry cites an official Canada.ca or Ontario.ca page");
    const noDate = entries.filter(([, v]) => !/^\d{4}-\d{2}-\d{2}$/.test(v.lastVerified || ""));
    t.eq(noDate.map(([k]) => k).join(",") || "(none)", "(none)", "1c …and the date it was last read off that page");
    const noPeriod = entries.filter(([k, v]) => !v.year && !v.period && !v.benefitYear && !v.taxYear &&
      !["FHSA_ANNUAL","FHSA_LIFETIME","HOME_ACCESSIBILITY_MAX","CANADA_TRAINING_CREDIT","GSTHST_SMALL_SUPPLIER","OAS","GIS","CPP_MAX_MONTHLY","HOME_BUYERS_AMOUNT","HBP_WITHDRAWAL_LIMIT"].includes(k));
    t.eq(noPeriod.map(([k]) => k).join(",") || "(none)", "(none)", "1d …and the period it applies to, unless the figure is not periodic");
  }

  // ── 2. What the official pages said on 2026-09-21 ────────────────────────────────────────────
  // The GST/HST credit is GONE: its CRA page reads "No longer available - Replaced by the CGEB".
  // The CRA builds the payment from parts. Pinning ONLY a single/couple total is what let the app
  // understate a single parent by $211: it showed $679 + $234 where the CRA pays $445 + $445 + $234.
  t.eq(CA.CGEB.eligibleIndividual, 445, "2a CGEB pays $445 for an eligible individual");
  t.eq(CA.CGEB.eligibleSpouse, 445, "2a2 …$445 for an eligible spouse");
  t.eq(CA.CGEB.firstChildSingleParent, 445, "2a3 …$445 for a single parent's FIRST child, not the per-child amount");
  t.eq(CA.CGEB.additionalSingle, 234, "2a4 …and $234 more for a single individual");
  t.eq(CA.CGEB.eligibleIndividual + CA.CGEB.firstChildSingleParent + CA.CGEB.additionalSingle, 1124,
    "2a5 …so a single parent with one child reaches $1,124, which $679 + $234 never would");
  t.eq(CA.CGEB.maxSingleNoChildren, 679, "2b CGEB single with no children is $679 (the GST/HST credit's $533 is two changes behind)");
  t.eq(CA.CGEB.maxCoupleNoChildren, 890, "2b2 …and a couple with no children $890 (was $698)");
  t.eq(CA.CGEB.eligibleIndividual + CA.CGEB.additionalSingle, CA.CGEB.maxSingleNoChildren, "2b3 …the single total is its own parts");
  t.eq(CA.CGEB.eligibleIndividual + CA.CGEB.eligibleSpouse, CA.CGEB.maxCoupleNoChildren, "2b4 …and so is the couple total");
  t.eq(CA.CGEB.perChildUnder19, 234, "2c CGEB per child under 19 is $234 (was $184)");
  t.ok(/new residents/i.test(CA.CGEB.applyNote), "2c2 …and the table records that new residents may have to apply");
  t.eq(CA.CGEB.benefitYear, "2026-07/2027-06", "2d …for the July 2026 to June 2027 benefit year");
  t.ok(!("GSTHST_MAX_SINGLE" in CA) && !("GSTHST_MAX_COUPLE" in CA) && !("GSTHST_PER_CHILD" in CA),
    "2e the GST/HST credit maxima are gone from the table, not left beside the CGEB to be picked up again");

  t.eq(CA.CWB.maxSingle, 1633, "2f CWB single max $1,633 (confirmed unchanged for the 2025 tax year)");
  t.eq(CA.CWB.maxFamily, 2813, "2g CWB family max $2,813 (confirmed unchanged)");
  t.eq(CA.CWB.nilOverSingle, 37742, "2h CWB pays nothing over $37,742 single (confirmed)");
  t.eq(CA.CWB.nilOverFamily, 49393, "2i …or over $49,393 family (confirmed)");

  t.eq(CA.OTB.oeptc18to64, 1307, "2j OEPTC 18-64 is $1,307 for the 2026 benefit year");
  t.eq(CA.OTB.ostcPerPerson, 378, "2k OSTC is $378 per person");
  t.eq(CA.OTB.oeptc65plus, 1488, "2l …and $1,488 at 65 or older, which is why no single total is 'the' maximum");
  t.ok(/canada\.ca|ontario\.ca/.test(CA.OTB.calculator || ""), "2l2 …so the table carries a calculator link instead");

  t.eq(CA.CDB.maxMonthly, 204.20, "2m Canada Disability Benefit is $204.20/month (was $200)");
  t.ok(!("maxAnnual" in CA.CDB), "2n …and no annual figure is held: the CRA page publishes only the monthly one for this period");

  t.eq(CA.INDEXED_2026.disabilityAmount, 10341, "2o the 2026 disability amount is $10,341 (the app had 2025's $10,138)");
  t.eq(CA.INDEXED_2026.ageAmount, 9208, "2p the 2026 age amount is $9,208 (the app had 2023's $8,396, labelled 2024)");
  t.eq(CA.INDEXED_2026.ageAmountThreshold, 46432, "2q …and its threshold is $46,432 (the app had $42,335)");
  t.eq(CA.INDEXED_2026.medicalExpenseCeiling, 2890, "2r the 2026 medical expense ceiling is $2,890 (the app had $2,635)");

  t.eq(CA.OAS.maxMonthly65to74, 751.97, "2s OAS 65-74 is $751.97 (the app had the previous quarter's $743.05)");
  t.eq(CA.GIS.maxMonthlySingle, 1123.17, "2t GIS single is $1,123.17/mo (the app had $1,065)");
  t.eq(CA.GIS.incomeUnderSingle, 22800, "2u …under an income of $22,800 (the app had ~$21,624)");
  t.eq(CA.CPP_MAX_MONTHLY.value, 1507.65, "2v CPP max at 65 is $1,507.65 (confirmed unchanged)");
  t.eq(CA.RRSP_LIMIT.value, 33810, "2w the 2026 RRSP dollar limit is $33,810 (confirmed)");
  t.eq(CA.TFSA_LIMIT.value, 7000, "2x the 2026 TFSA limit is $7,000 (confirmed)");
  t.eq(CA.FHSA_ANNUAL.value, 8000, "2y FHSA participation room is $8,000 (confirmed)");
  t.eq(CA.FHSA_LIFETIME.value, 40000, "2z …against a $40,000 lifetime limit (confirmed)");

  // The lowest federal bracket rate fell to 14% for 2026, so every "worth this much in tax" figure
  // moved even where the credit amount did not. One owner, so they cannot drift apart.
  t.eq(CA.FEDERAL_LOWEST_RATE.value, 0.14, "2aa the 2026 lowest federal rate is 14% (was 14.5% in 2025, 15% before)");
  t.eq(creditWorth(CA.INDEXED_2026.disabilityAmount), 1448, "2ab so the DTC is worth ~$1,448 in federal tax, not the old ~$1,470");
  t.eq(creditWorth(CA.INDEXED_2026.ageAmount), 1289, "2ac the age amount is worth ~$1,289 (was shown as $1,259)");
  t.eq(creditWorth(CA.HOME_ACCESSIBILITY_MAX.value), 2800, "2ad the home accessibility credit is worth up to $2,800 (was shown as $3,000 at 15%)");

  // ── 3. No program figure, current or stale, outside the table ────────────────────────────────
  // The banned list is GENERATED from TAX_DATA.CA rather than typed. Typing it meant the list only
  // ever covered the figures someone remembered to add: the FHSA limit, the HBP limit and the Home
  // Buyers' Tax Credit were all hardcoded in the coach's prompt while this section passed.
  //
  // Both written forms of each value are banned ("$8000" and "$8,000", plus the 2-decimal form for
  // money like $204.20), since either could be typed by hand.
  const numbers = new Set();
  (function walk(o) {
    for (const v of Object.values(o)) {
      if (v && typeof v === "object") walk(v);
      else if (typeof v === "number" && v >= 100) numbers.add(v);   // below 100 are rates and ages, not amounts
    }
  })(CA);
  const forms = v => [...new Set([String(v), v.toLocaleString("en-US"), v.toFixed(2)])];
  // Figures that were WRONG and are no longer in the table, so they cannot be generated from it.
  const STALE = ["533", "698", "184", "1,654", "1,685", "1,470", "10,138", "8,396", "42,335",
                 "1,259", "2,635", "743.05", "1,065", "21,624", "2,400", "679 + $234"];
  // NOT in the list: "1,500". Two RRSP tips use it as an illustration ("$5,000 in gets ~$1,500
  // back"). The stale Home Buyers' Tax Credit figure is banned by its own sentence in section 7.
  const allForms = [...[...numbers].flatMap(forms), ...STALE];
  const banned = new RegExp("\\$\\s?(" + allForms.map(x => x.replace(/[.+]/g, "\\$&")).join("|") + ")(?![\\d.,])");

  // Lines where a generated number legitimately means something else. Keyed to the file, a
  // distinctive fragment of the line, and the EXACT amounts allowed on it — so a Canadian benefit
  // figure typed onto one of these lines still fails.
  const ALLOWED = [
    { file: path.join("src", "App.jsx"), must: "At a 30% marginal rate", values: ["$5,000", "$1,500"], why: "an RRSP illustration, not the training credit's $5,000 lifetime room" },
    { file: path.join("src", "App.jsx"), must: "Roth IRA: Tax-Free Retirement", values: ["$7,000"], why: "the US Roth IRA limit, not the TFSA limit" },
    { file: path.join("src", "App.jsx"), must: 'id:"roth"', values: ["$7,000", "$8,000"], why: "the US Roth IRA card: its own limit and 50+ catch-up, not the TFSA or FHSA limits" },
    { file: path.join("src", "App.jsx"), must: "The Emergency Fund is Different in the US", values: ["$10,000"], why: "a US medical bill illustration, not the home buyers' amount" },
    { file: path.join("src", "App.jsx"), must: "Lifetime Learning Credit", values: ["$10,000"], why: "that US credit's own limit" },
    { file: path.join("src", "App.jsx"), must: "Buy a used car for", values: ["$8,000"], why: "a what-if scenario amount, not the FHSA limit" },
    { file: path.join("src", "App.jsx"), must: "Dependent Care FSA", values: ["$5,000"], why: "a US figure in the coach prompt" },
    { file: path.join("src", "lib", "plaidNormalize.js"), must: "variable bill", values: ["$250"], why: "bill-detection commentary, not the training credit accrual" },
    { file: path.join("src", "lib", "plaidNormalize.js"), must: "Costco at", values: ["$250"], why: "bill-detection commentary" },
  ];

  const files = [...walk("src"), ...walk("netlify")].filter(f => f !== TABLE_FILE);
  t.ok(files.length > 20, `3a scanning the shipped source (${files.length} files, excluding the table)`);
  t.ok(numbers.size >= 40, `3a2 the banned list is generated from the table (${numbers.size} amounts, ${allForms.length} written forms)`);
  for (const key of ["FHSA_ANNUAL", "HBP_WITHDRAWAL_LIMIT", "HOME_BUYERS_AMOUNT"])
    t.ok(numbers.has(CA[key].value), `3a3 …including ${key}, which the hand-typed list missed`);

  const hits = [];
  for (const f of files) {
    fs.readFileSync(path.join(REPO, f), "utf8").split("\n").forEach((line, i) => {
      const found = [...line.matchAll(new RegExp(banned.source, "g"))].map(m => m[0].replace(/\s/g, ""));
      if (!found.length) return;
      const exempt = ALLOWED.some(a => f === a.file && line.includes(a.must) && found.every(v => a.values.includes(v)));
      if (!exempt) hits.push(`${f}:${i + 1} ${found.join(",")}`);
    });
  }
  t.eq(hits.join(" | ") || "(none)", "(none)", "3b no Canadian program figure, current or stale, appears outside TAX_DATA.CA");

  // ── 4. The surfaces read the table ───────────────────────────────────────────────────────────
  for (const [key, why] of [
    ["TAX_DATA.CA.CGEB.maxSingle", "the CGEB tip and the benefits checker"],
    ["TAX_DATA.CA.CWB.maxSingle", "the CWB tip and row"],
    ["TAX_DATA.CA.OTB.oeptc18to64", "both Ontario Trillium surfaces"],
    ["TAX_DATA.CA.CDB.maxMonthly", "the disability benefit row"],
    ["TAX_DATA.CA.INDEXED_2026.disabilityAmount", "the DTC tip and row"],
    ["TAX_DATA.CA.INDEXED_2026.ageAmount", "the age amount tip"],
    ["TAX_DATA.CA.INDEXED_2026.medicalExpenseCeiling", "the medical expense tip"],
    ["TAX_DATA.CA.OAS.maxMonthly65to74", "the OAS and GIS tip"],
    ["TAX_DATA.CA.GIS.maxMonthlySingle", "the GIS figure"],
    ["TAX_DATA.CA.TFSA_LIMIT.value", "the TFSA account card"],
    ["TAX_DATA.CA.FHSA_LIFETIME.value", "the FHSA card and learn card"],
    ["TAX_DATA.CA.GSTHST_SMALL_SUPPLIER.value", "the HST registration tip"],
    ["TAX_DATA.CA.CANADA_TRAINING_CREDIT.annualAccrual", "the training credit tip"],
    ["TAX_DATA.CA.FEDERAL_LOWEST_RATE.value", "every credit-worth figure"],
    ["TAX_DATA.CA.CGEB.firstChildSingleParent", "the CGEB single-parent amount"],
    ["TAX_DATA.CA.CGEB.calculator", "the CGEB benefits-checker link"],
    ["TAX_DATA.CA.OTB.oeptc65plus", "the Ontario Trillium senior amount"],
    ["TAX_DATA.CA.OTB.calculator", "the Ontario Trillium link"],
    ["TAX_DATA.CA.CWB.variesIn", "the provinces where the CWB differs"],
    ["TAX_DATA.CA.CANADA_TRAINING_CREDIT.claimSharePct", "the training credit's 50% rule"],
    ["TAX_DATA.CA.HOME_BUYERS_AMOUNT.value", "the coach prompt's home buyers' amount"],
    ["TAX_DATA.CA.HBP_WITHDRAWAL_LIMIT.value", "the coach prompt's HBP limit"],
  ]) t.ok(app.includes(key), `4 ${why} reads ${key}`);

  // ── 5. Wording the audit had to change ───────────────────────────────────────────────────────
  t.ok(!/becomes Groceries|becomes the Canada Groceries|Jul 2026\)/.test(app),
    "5a nothing still says the GST/HST credit is about to become the CGEB: it already did, in July 2026");
  t.ok(app.includes("Canada Groceries and Essentials Benefit"), "5b the benefit is named as what it is now");
  t.ok(!/name:"GST\/HST Credit"/.test(app), "5c the benefits checker no longer lists a GST/HST credit a user cannot claim");

  // ── 6. Figures REMOVED because no official page could be found for them ──────────────────────
  // The rule for this audit was: if it cannot be verified, the dollar amount comes out of the UI
  // rather than being carried forward. These must stay out until someone adds them WITH a source.
  for (const [pattern, what] of [
    [/\$8,000\/child|\$5,000\/child/, "child care expense deduction per-child limits"],
    [/first \$2,500\/year = \$500|20% on the first \$2,500/, "the CESG grant rate and amount"],
    [/Canada Learning Bond adds another \$500/, "the Canada Learning Bond amount"],
    [/first \$2,000 of eligible pension income/, "the pension income amount"],
    [/\$300–\$2,000/, "the Quebec solidarity credit range"],
    [/\$20,000 in provincial tax credits/, "the Saskatchewan Graduate Retention amount"],
  ]) t.ok(!pattern.test(app), `6 ${what} stays out of the UI until it has a source`);

  // ── 7. Claims the PR #5 review found wrong ───────────────────────────────────────────────────
  // Each of these is a sentence the app stated as fact and the official page contradicts.
  for (const [pattern, what] of [
    [/is automatic, but the Guaranteed Income Supplement \(GIS\) is not/, "OAS is automatic and GIS is not (Service Canada may auto-enrol either)"],
    [/GIS\) is not — you must apply/, "you must apply for GIS"],
    [/First Home Buyers Tax Credit \(\$1,500\)/, "a $1,500 Home Buyers' Tax Credit (it is the amount times the lowest rate)"],
    [/\$1,654\/yr \(OEPTC\+OSTC\)/, "a single Ontario Trillium maximum"],
    [/Filing your taxes is the whole application/, "filing is the whole CGEB application (new residents may need to apply)"],
  ]) t.ok(!pattern.test(app), `7 the app no longer claims: ${what}`);
  t.ok(/variesIn|AB, QC, NU|Alberta, Quebec/.test(app), "7f …and it names the provinces where the CWB differs");
  t.ok(/enrols most people automatically|enrolment letter/i.test(app), "7g …and describes OAS/GIS enrolment as Service Canada describes it");

  t.summary("caFigures.test");
})();
