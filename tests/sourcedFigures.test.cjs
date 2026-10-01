// tests/sourcedFigures.test.cjs
// -----------------------------------------------------------------------------
// NOTHING SHOWS A FINANCIAL FIGURE OR CLAIM FLOURISH DID NOT CALCULATE OR SOURCE (prelaunch-copy, prompt 3).
//
//   1. Spend → Patterns (was "Smart Cuts"): every dollar figure on a card comes from the household's own
//      transactions this month. No promised saving, no "studies show", no "Potential Monthly Savings"
//      total, no card without a computed figure (the Amazon impulse card is gone). MATH-LOCK, hand-worked:
//        coffee 3 runs: $5.25 + $4.75 + $6.00 = $16.00; for a year 12 × $16.00 = $192.00
//        delivery 2 orders: $28.40 + $31.10 = $59.50
//        subscriptions: $18.99
//        busiest day: Friday, $59.50 (Mon $16.00, Wed $18.99)
//   2. Learn: concepts, not instructions. The removed instruction lines never come back; a dollar figure in
//      a Learn card or a retirement account appears only with its source and year ("(CRA, 2026)"), or as
//      plain arithmetic shown in full; no "learns", "remembers" or "smarter"; never the retired benefit.
//   3. The rest of src (item 3 audit): claims and figures with no source are gone, and the figures that have
//      one read TAX_DATA. MATH-LOCK, hand-worked:
//        interest credit: FEDERAL_LOWEST_RATE 0.14 → "14% of interest paid (federal, 2026)"
//        Child Tax Credit: 2200 → "$2,200" (OBBBA); the unsourced "$1,700" refundable figure is gone
//        OAS at 65 to 74: $751.97/mo (was a hard-coded $727); small-supplier threshold $30,000
//        kids lesson: $100 × 1.07^20 = 386.97 → "$387" (was "$386"); compound card 1.07^30 × 100 = 761.23 → "$761"
//   4. Prompt 3b: no figure ships without a source. Every US figure the tips and the coach state reads a
//      TAX_DATA entry read on irs.gov (or usda.gov, tax.ny.gov, tax.illinois.gov, alberta.ca, canada.ca)
//      with its year; ended programs are gone; no estimated credit score; no uncomputed "+X pts"; an
//      assumed debt rate is labelled and editable; the RRSP deadline is computed. Hand-worked:
//        Roth at 50+: $7,500 + $1,100 = $8,600; LLC 20% × $10,000 = $2,000; home office 300 × $5 = $1,500
//        ACFB one child: $1,529 + $782 = $2,311; QCD $111,000 (not $105,000 or $108,000)
//        health score, pillars 25 + 20 + 20 + 15 + 0 = 80: no score entered → 80 × 100 / 90 = 88.9 → 89;
//          entered 718 (≥ 670 → 6 points) → 86; entered 780 (≥ 760 → 10) → 90
//        RRSP deadline: 60th day of 2026 = March 1, 2026, a Sunday → March 2, 2026 (the CRA's date);
//          2024 → March 3, 2025; 2023 → February 29, 2024; 2026 → March 1, 2027
//   6. Prompt 3c: What-If states results, never a verdict. Hand-worked payoff, $1,000 at 12% APR:
//        $100 a month: 11 months, total paid $1,058.98, interest $58.98 (the engine's own pinned example)
//        $200 a month: 10.00 + 8.10 + 6.18 + 4.24 + 2.29 + 0.31 = $31.12 interest, 6 months
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");
const { loadApp, textOf, describe, REPO } = require("./_renderApp.cjs");

const APP = fs.readFileSync(path.join(REPO, "src", "App.jsx"), "utf8");
const MONEY = /\$\s?\d[\d,]*(?:\.\d+)?/g;

(async () => {
  const t = create();
  let A = {};
  try { A = loadApp(["patternCards", "computeStats", "CC", "TAX_DATA", "getPersonalizedTaxCredits", "CreditScreen", "debtResultSentence", "KIDS_LESSONS", "Dashboard"]); } catch (e) { t.ok(false, `App.jsx bundles: ${describe(e)}`); }

  // ── 1. Patterns ──────────────────────────────────────────────────────────────────────────────
  {
    const tx = (name, amount, dow, extra = {}) => ({ name, amount, dow, cat: "Food & Drink", date: "2026-10-01", ...extra });
    const txns = [
      tx("Tim Hortons", 5.25, 1, { icon: "☕" }), tx("Tim Hortons", 4.75, 1, { icon: "☕" }), tx("Starbucks", 6.00, 1, { icon: "☕" }),
      tx("Uber Eats", 28.40, 5), tx("DoorDash", 31.10, 5),
      tx("Netflix", 18.99, 3, { cat: "Subscriptions" }),
    ];
    const stats = A.computeStats(txns, {});
    const cards = A.patternCards(stats);
    t.eq(cards.map(c => c.title), ["Coffee this month", "Food delivery this month", "Subscriptions this month", "Fri is your biggest spending day"],
      "1a four cards, each with a computed figure (no Amazon impulse card)");
    t.eq(cards[0].body, "3 coffee runs this month, $16.00. At the same pace for a year: 12 × $16.00 = $192.00. Is that about what you expected?", "1b coffee: the observed amount, the year as arithmetic shown in full, a neutral question");
    t.eq(cards[1].body, "2 delivery orders this month, $59.50. Is that about what you expected?", "1c delivery: the observed amount");
    t.eq(cards[2].body, "$18.99 on subscriptions this month. Which of them did you use?", "1d subscriptions: the observed amount");
    t.eq(cards[3].body, "$59.50 spent on Fris this month, more than on any other day of the week. Does that match how your week goes?", "1e busiest day: the observed amount");
    const allowed = new Set(["$16.00", "$192.00", "$59.50", "$18.99"]);
    const shown = cards.flatMap(c => (c.title + " " + c.body).match(MONEY) || []);
    t.eq(shown.filter(m => !allowed.has(m)), [], "1f every dollar figure on the cards is one derived from these transactions");
    const words = cards.map(c => c.title + " " + c.body).join(" ");
    t.ok(!/%|\bsav(e|es|ing|ings)\b|\/mo\b|studies|awareness|cuts? (this|it)|reliably|most households/i.test(words), "1g no percentage, promised saving, per-month claim or \"studies show\"");
    t.ok(cards.every(c => !("saving" in c) && !("effort" in c)), "1h no card carries a saving or effort field");
    t.eq(A.patternCards(A.computeStats([], {})), [], "1i no transactions, no cards");
    t.ok(!/Potential Monthly Savings/.test(APP) && !/Amazon impulse purchases/.test(APP), "1j the savings total and the Amazon card are gone from the source");
    // Quoted where the bare figure would also match unrelated copy ("$50/mo" is inside "$50/month").
    for (const line of ['"$50/mo"', "$40 to $70/mo", "$15 to $35/mo", "$30 to $60/mo", "cuts this by 60%", "Studies show this cuts impulse spend by 30 to 40%",
      "Awareness alone cuts it 20 to 30%", "One fewer order per week saves $40 to $60/month"]) {
      t.ok(!APP.includes(line), `1k gone: "${line}"`);
    }
    t.ok(/:"Patterns"\}/.test(APP) && !/Smart Cuts/.test(APP), "1l the tab is \"Patterns\", not \"Smart Cuts\"");
    t.ok(/const cuts=patternCards\(stats\)\.filter/.test(APP), "1m the Spend screen renders exactly these cards");
  }

  // ── 2. Learn and the retirement accounts ─────────────────────────────────────────────────────
  {
    const REMOVED = ["Low income now → TFSA. High income now → RRSP.", "Open an FHSA before your RRSP", "Invest in ETFs inside your TFSA. Don't just park cash.",
      "Never just pay the minimum.", "Build $1,000 in a TFSA HISA first.", "Start investing early. Pay debt fast."];
    for (const line of REMOVED) t.ok(!APP.includes(line), `2a gone: "${line}"`);
    const texts = [];
    for (const c of ["CA", "US"]) {
      for (const l of A.CC[c].learnCards) texts.push([`${c} learn "${l.title}"`, [l.title, l.body, l.key].join(" ")]);
      for (const r of A.CC[c].retirementAccounts) texts.push([`${c} ${r.name}`, [r.annualLimit, r.taxNote, r.tip].join(" ")]);
    }
    const compound = (APP.match(/title:"How compound interest works",body:"([^"]+)",key:"([^"]+)"/) || []);
    t.ok(!!compound[1], "2b the compound interest card is a concept card");
    texts.push(["compound interest", compound[1] + " " + compound[2]]);
    t.ok(texts.length >= 21, `2c every Learn card and retirement account was read (${texts.length})`);
    const unsourced = texts.filter(([, s]) => (s.match(MONEY) || []).length && !/\((?:CRA|IRS), \d{4}/.test(s) && !/×/.test(s)).map(([n]) => n);
    t.eq(unsourced, [], "2d every dollar figure in Learn and the accounts is shown with its source and year, or as arithmetic shown in full");
    t.ok(/\$100 × 1\.07 to the power of 30 = \$761\. The 7% is an example rate, not a prediction\./.test(compound[1]), "2e the compound card shows its arithmetic in full, and calls 7% an example");
    const all = texts.map(([, s]) => s).join(" ");
    t.ok(!/\blearns\b|\bremembers\b|\bsmarter\b/i.test(all), "2f no \"learns\", \"remembers\" or \"smarter\"");
    t.ok(!/GST\/HST credit|GST credit/i.test(all), "2g never the retired benefit");
    t.ok(!/\b(?:should|always|never|don't|make sure)\b/i.test(texts.filter(([n]) => / learn /.test(n)).map(([, s]) => s).join(" ")),
      "2h the Learn cards give no instruction (no should / always / never / don't)");
  }

  // ── 3. Other hard-coded savings, rates and claims ────────────────────────────────────────────
  {
    const T = A.TAX_DATA;
    t.eq([T.CA.FEDERAL_LOWEST_RATE.value, T.CA.FEDERAL_LOWEST_RATE.year, T.US.CHILD_TAX_CREDIT.value, T.CA.OAS.maxMonthly65to74, T.CA.GSTHST_SMALL_SUPPLIER.value],
      [0.14, 2026, 2200, 751.97, 30000], "3a (the TAX_DATA figures the copy now reads)");
    t.ok(APP.includes('savings:`${(TAX_DATA.CA.FEDERAL_LOWEST_RATE.value*100).toFixed(0)}% of interest paid (federal, ${TAX_DATA.CA.FEDERAL_LOWEST_RATE.year})`') && !APP.includes('"15% of interest paid"'),
      "3b the student-loan interest credit reads the federal rate from TAX_DATA (14%, 2026), not a hard-coded 15%");
    const ctcTip = A.CC.US.taxTips.find(x => x.title === "Child Tax Credit");
    // Prompt 3b re-sourced the CTC to Rev. Proc. 2025-32 on irs.gov, which also states the $1,700 refundable part.
    t.eq([ctcTip && ctcTip.body, ctcTip && ctcTip.savings], ["Up to $2,200 per qualifying child under 17, of which up to $1,700 is refundable, so it can be paid even when no tax is owed (IRS, 2026).", "$2,200/child (IRS, 2026)"],
      "3c the Child Tax Credit tip reads $2,200 and the $1,700 refundable part from TAX_DATA, cited (IRS, 2026)");
    const ctcBen = A.CC.US.benefitsChecker.find(x => x.name === "Child Tax Credit");
    t.eq(ctcBen && ctcBen.amount, "Up to $2,200/child (IRS, 2026)", "3d …and so does the benefits checker");
    t.ok(APP.includes("OAS (up to $${TAX_DATA.CA.OAS.maxMonthly65to74}/mo at 65 to 74)") && !APP.includes("OAS ($727/mo)"), "3e the coach's OAS figure reads TAX_DATA ($751.97), not $727");
    t.ok(APP.includes('HST/GST registration ($${TAX_DATA.CA.GSTHST_SMALL_SUPPLIER.value.toLocaleString("en-US")} threshold)') && !APP.includes("($30k threshold)"), "3f the coach's registration threshold reads TAX_DATA");
    t.ok(APP.includes('Child Tax Credit (${usd(TAX_DATA.US.CHILD_TAX_CREDIT.value)}/child under 17, ${TAX_DATA.US.CHILD_TAX_CREDIT.year})'), "3g the coach's Child Tax Credit reads TAX_DATA");
    // Prompt 3c merged the two kids decks into one (KIDS_LESSONS), used by both kids screens, so the line appears once.
    t.eq((APP.match(/\$100 × 1\.07 to the power of 20 = \$387\. The 7% is an example rate\./g) || []).length, 1, "3h the kids deck (one, shared by both kids screens) shows 1.07^20 × $100 = $387 in full (was $386)");
    t.ok(/const allLessons=KIDS_LESSONS;/.test(APP) && /const lessons=KIDS_LESSONS;/.test(APP), "3h2 …and both kids screens read that one deck");
    const tfsa = A.CC.CA.taxTips.find(x => /^TFSA/.test(x.title));
    t.ok(tfsa && !/\$/.test(tfsa.body) && /CRA My Account/.test(tfsa.body), "3i the TFSA tip names no unsourced room figure and points to CRA My Account");
    const rrsp = A.CC.CA.taxTips.find(x => x.action === "Check My RRSP Room");
    t.eq(rrsp && rrsp.savings, "Your marginal rate", "3j the RRSP chip no longer promises \"Up to 33%\"");
    for (const gone of ["$45 to $48", "saves ~$180/mo", "frees $50-100/mo", "can save $150+/mo", "Worth more than any subscription cancel", "typically 19.99% to 29.99%",
      "Most people leave thousands on the table", "#1 habit of couples", "what most couples never do", "#1 cause of US bankruptcy", "becomes $386", "$245,000", "$68,000",
      "boost your score in 60 days", "utilization significantly", "Potentially thousands", "often $3,000 to $15,000", "often worth $1,000 to $4,000", "Up to 33%", "$75,000+",
      "most under-claimed", "most tax-advantaged", "most valuable education credit", "largest deductions", "most generous graduate", "miss hundreds", "never claim it",
      "Better than donating cash", "can mean thousands back", "saving thousands", "save your household thousands", "30y · 7%<", "% conservative", "% moderate", "% aggressive", "7% avg return",
      "Partially refundable up to $1,700"]) {
      t.ok(!APP.includes(gone), `3k gone: "${gone}"`);
    }
  }

  // ── 4. Prompt 3b: every figure sourced ───────────────────────────────────────────────────────
  {
    const T = A.TAX_DATA;
    const tipsFor = (profile) => A.getPersonalizedTaxCredits(profile).map(x => `${x.title} ${x.body} ${x.savings || ""}`).join("\n");
    const US = [tipsFor({ country: "US", province: "TX", lifeStages: ["w2"], hasKids: true }), tipsFor({ country: "US", province: "NY", lifeStages: ["student"] }),
      tipsFor({ country: "US", province: "IL", lifeStages: ["student"] }), tipsFor({ country: "US", province: "TX", lifeStages: ["senior"] }),
      tipsFor({ country: "US", province: "TX", lifeStages: ["selfemployed"] })].join("\n");
    const CAt = [tipsFor({ country: "CA", province: "MB", lifeStages: ["student"] }), tipsFor({ country: "CA", province: "BC", lifeStages: ["t4"] }),
      tipsFor({ country: "CA", province: "AB", lifeStages: ["t4"] }), tipsFor({ country: "CA", province: "ON", lifeStages: ["selfemployed", "senior"] })].join("\n");
    const has = (txt, parts, label) => { const miss = parts.filter(x => !txt.includes(x)); t.eq(miss, [], label); };
    // a. US figures, each from TAX_DATA with its source and year
    has(US, ["phases out completely at $62,974 of income (single) or $70,244 (married filing jointly) (IRS, 2026)"], "4a EITC phase-out $62,974 / $70,244 (IRS, 2026)");
    has(US, ["up to $7,500 a year ($8,600 at 50 or older)", "between $153,000 and $168,000", "$242,000 and $252,000", "(IRS, 2026)"], "4b Roth IRA: $7,500, $7,500 + $1,100 = $8,600 at 50+, 2026 phase-outs");
    has(US, ["up to $2,500 of interest a year", "above $85,000 of income (single) or $175,000 (joint) (IRS, 2026)"], "4c student loan interest: $2,500, phase-out from $85,000 / $175,000");
    has(US, ["up to $3,000 of care expenses (1 person) or $6,000 (2 or more). The top rate is 50%", "Check the current rates on IRS.gov"], "4d care credit: $3,000 / $6,000, top rate 50% (2026); the lower rate is not published, so IRS.gov");
    has(US, ["up to $1,000 ($2,000 joint)", "$40,250 single, $60,375 head of household and $80,500 joint (IRS, 2026)"], "4e Saver's Credit: limits for 2026");
    has(US, ["up to $2,500 a year per eligible student, and 40% of it is refundable: up to $1,000"], "4f AOTC $2,500, 40% refundable, up to $1,000");
    has(US, ["20% × $10,000 = $2,000 a year per return (IRS, 2026)"], "4g LLC shown as arithmetic in full");
    has(US, ["above 7.5% of your adjusted gross income", "300 × $5 = $1,500 (IRS, 2026)"], "4h medical 7.5% floor; home office 300 × $5 = $1,500");
    has(US, ["Deduct up to $25,000 of qualified tips", "above $150,000 of modified adjusted gross income ($300,000 joint), and applies 2025 through 2028",
      "up to $12,500 ($25,000 if married filing jointly)"], "4i tips and overtime deductions, 2025 through 2028");
    has(US, ["Up to 85% of Social Security benefits", "$2,050 if unmarried, $1,650 for each qualifying spouse if married (IRS, 2026)",
      "senior deduction of $6,000 per person 65 or older, phasing out above $75,000", "($150,000 joint)"], "4j seniors: 85%, additional standard deduction 2026, senior deduction");
    has(US, ["$17,500 or more cannot take it", "$3,750, $5,000 or $7,500 depending on filing status (IRS, 2025 instructions)"], "4k Schedule R from the 2025 instructions, the latest published");
    has(US, ["From age 73", "excise tax of 25% of the amount, 10% if corrected in time (IRS, 2026)", "up to $111,000 a year directly from your IRA to charity (IRS, 2026)"],
      "4l RMD 73 / 25% / 10%; QCD $111,000 for 2026");
    has(US, ["You pay 15.3% self-employment tax", "up to 20% of qualified business income", "the lesser of 25% of compensation or $72,000 (IRS, 2026)"], "4m SE tax 15.3%, QBI 20%, SEP $72,000 (2026)");
    has(US, ["up to $400 per eligible student, or an itemized deduction of up to $10,000 per student, but not both (tax.ny.gov, 2025)"], "4n New York: $400 credit or $10,000 deduction, not both");
    has(US, ["25% of qualified K-12 education expenses after the first $250, up to $750 per return (tax.illinois.gov, 2026)"], "4o Illinois: 25% after $250, up to $750 (was \"up to $500\")");
    const snap = A.CC.US.benefitsChecker.find(b => /SNAP/.test(b.name));
    t.eq(snap && snap.amount, "Up to $306/mo for a household of 1 in the 48 states and DC (USDA, FY2027)", "4p SNAP: the FY2027 maximum for 1 person, from USDA");
    const eitcBen = A.CC.US.benefitsChecker.find(b => /Earned Income/.test(b.name));
    t.eq(eitcBen && eitcBen.eligible, "Working; with 3+ children, under $62,974 (single) / $70,244 (joint) (IRS, 2026)", "4q the benefits checker's EITC limits too");
    // every new US entry names an official page and its year
    const NEW_US = ["EITC_PHASEOUT_3PLUS", "CHILD_TAX_CREDIT", "ROTH_IRA", "STUDENT_LOAN_INTEREST", "CHILD_CARE_CREDIT", "SAVERS_CREDIT", "AOTC", "LLC", "MEDICAL_AGI_FLOOR",
      "HOME_OFFICE_SIMPLIFIED", "SS_TAXABLE_MAX", "TIPS_DEDUCTION", "OVERTIME_DEDUCTION", "SENIOR_DEDUCTION", "ADDITIONAL_STD_65", "SCHEDULE_R", "RMD", "QCD_LIMIT", "SE_TAX",
      "QBI", "SEP_LIMIT", "DEPENDENT_CARE_FSA", "IRA_FIRST_HOME", "SNAP_MAX_1", "NY_TUITION", "IL_EDUCATION"];
    t.eq(NEW_US.filter(k => !T.US[k] || !/^\S+ https:\/\/(www\.)?[a-z.]*(irs\.gov|usda\.gov|tax\.ny\.gov|tax\.illinois\.gov)\//.test(T.US[k].source) || !T.US[k].year || T.US[k].lastVerified !== "2026-10-01"),
      [], "4r each new US entry cites an official .gov page, its year, and the date it was read");
    // b. the coach's US reference figures read the same entries
    for (const frag of ["(${TAX_DATA.US.SE_TAX.ratePct}%, half of it deductible)", "SEP-IRA (up to ${usd(TAX_DATA.US.SEP_LIMIT.value)} for ${TAX_DATA.US.SEP_LIMIT.year})",
      "(up to ${TAX_DATA.US.SS_TAXABLE_MAX.pct}% taxable), RMDs start at ${TAX_DATA.US.RMD.startAge}", "${usd(TAX_DATA.US.ADDITIONAL_STD_65.unmarried)} unmarried",
      "senior deduction (${usd(TAX_DATA.US.SENIOR_DEDUCTION.perPerson)} per person", "QCD from IRA up to ${usd(TAX_DATA.US.QCD_LIMIT.value)} (${TAX_DATA.US.QCD_LIMIT.year})",
      "the excise tax on a missed amount is ${TAX_DATA.US.RMD.exciseTaxPct}%", "(up to ${usd(TAX_DATA.US.IRA_FIRST_HOME.value)} lifetime)",
      "Dependent Care FSA (up to ${usd(TAX_DATA.US.DEPENDENT_CARE_FSA.value)} pre-tax for ${TAX_DATA.US.DEPENDENT_CARE_FSA.year})", "AOTC for college (${usd(TAX_DATA.US.AOTC.max)}/yr, ${TAX_DATA.US.AOTC.refundablePct}% refundable)"]) {
      t.ok(APP.includes(frag), `4s the coach reads TAX_DATA: ${frag.slice(0, 48)}`);
    }
    t.eq([T.US.QCD_LIMIT.value, T.US.SEP_LIMIT.value, T.US.ADDITIONAL_STD_65.unmarried, T.US.DEPENDENT_CARE_FSA.value], [111000, 72000, 2050, 7500],
      "4t (the QCD figure the tip and the coach now share is 2026's $111,000; SEP $72,000; $2,050; FSA $7,500)");
    // c. provinces and states: ended programs gone, the rest sourced
    t.ok(!/Manitoba Tuition Fee Income Tax Rebate|Up to 60% of MB tuition/.test(CAt + APP.replace(/\/\/.*$/gm, "")), "4u the Manitoba tuition rebate (ended 2018) is gone");
    t.ok(!/BC Climate Action Tax Credit|\$447/.test(CAt + APP.replace(/\/\/.*$/gm, "")), "4v the BC Climate Action Tax Credit (ended April 2025) is gone");
    has(CAt, ["starts at 8% on your first $61,200 and reaches 15% over $370,220, with a basic personal amount of $22,769 (alberta.ca, 2026)",
      "base part is up to $1,529 and the working part up to $782", "One child: up to $1,529 + $782 = $2,311/yr"], "4w Alberta: 2026 tax figures and the 2026 to 2027 ACFB, the total as arithmetic");
    has(CAt, ["employee (5.95%) and employer (5.95%)", "11.9% in all (CRA, 2026)", "at least 40 km closer", "meals (50%, CRA, 2026)", "split up to 50% with your spouse (CRA, 2026)"],
      "4x CPP rates, the 40 km rule, meals 50% and pension splitting 50%, each from the CRA");
    // d. gone: every figure that had no source or was out of date
    for (const gone of ["$61,555", "$68,675", "Under $150k single", "$236k married", "$7,000/yr tax-free", "Under $39,500", "20 to 35%", "$600 to $2,100", "$75k single / $155k married",
      "$1,950", "$1,550 to $3,900", "$105,000", "up to $108,000", "max $69,000", "Up to $69,000", "~$191/mo", "\"Up to $500\"", "Up to $750/yr (8% bracket)", "highest basic personal amount",
      "Both can be worth claiming", "$5,000 pre-tax for 2025", "$10k IRA", "OBBBA NEW $6,000", "phases out at $75k MAGI", "Phases out above $150k MAGI", "(50% of SE tax)"]) {
      t.ok(!APP.includes(gone), `4y gone: "${gone}"`);
    }
    // e. credit: no estimated score, no FICO weights for Canada
    const real = globalThis.Capacitor;
    const credit = (profile) => textOf(A.render(A.h(A.CreditScreen, { data: { profile, transactions: [], accounts: [], incomes: [], bankConnected: true }, setScreen: () => {} })));
    const caNone = credit({ country: "CA", creditScore: 680, creditKnown: false });
    t.ok(/Flourish does not estimate your credit score/.test(caNone), "4z1 with no score entered, Credit says it does not estimate one");
    t.eq((caNone.replace(/300 to (900|850)/g, "").match(/\b[3-9]\d\d\b/g) || []), [], "4z2 …and shows no score number (not the onboarding slider's 680, not a 720 / 718 base)");
    t.ok(!/\d+%/.test(caNone), "4z3 Canadian users see no FICO weights (no percentages at all)");
    const caMine = credit({ country: "CA", creditScore: 742, creditKnown: true });
    t.ok(/The score you entered 742/.test(caMine) && !/%/.test(caMine), "4z4 a Canadian score the household entered is shown as theirs");
    const usNone = credit({ country: "US" });
    t.ok(/Payment history 35%/.test(usNone) && /FICO's published figures \(myfico\.com\)/.test(usNone), "4z5 the US list shows FICO's weights, named as FICO's");
    t.ok(!/baseScore|isCA \? 720 : 718|creditScore\|\|720|: 680;/.test(APP + fs.readFileSync(path.join(REPO, "src", "lib", "decisionEngine.js"), "utf8")), "4z6 no assumed score anywhere (720, 718, 680)");
    globalThis.Capacitor = real;
  }

  // ── 5. Engines (prompt 3b): health score, debt rates, the RRSP deadline ────────────────────────
  {
    const DE = await import("../src/lib/decisionEngine.js");
    const FC = await import("../src/lib/financialCalculations.js");
    const R = await import("../src/lib/rrspDeadline.js");
    const JUN = new Date("2026-06-15T12:00:00");
    const base = { accounts: [{ type: "checking", balance: "3000" }, { type: "savings", balance: "6000" }], bills: [{ name: "Rent", amount: "1500", freq: "monthly", date: "1" }],
      debts: [], incomes: [{ amount: "5000", freq: "monthly", type: "employment" }], transactions: [] };
    const hs = (profile) => DE.calcHealthScore({ ...base, profile }, {}, JUN);
    const none = hs({ creditScore: 680, creditKnown: false });
    const b = none.breakdown;
    t.eq([b.srScore, b.drScore, b.efScore, b.ssScore, b.ivScore], [25, 20, 20, 15, 0], "5a (the other five pillars: 25 + 20 + 20 + 15 + 0 = 80)");
    t.eq([none.score, none.pillars.at(-1).max, none.pillars.at(-1).detail], [89, 0, "Not entered"], "5b no score entered (the slider's 680 ignored): 80 × 100 / 90 = 89, Credit not rated");
    t.eq([hs({}).score, hs({ creditScore: 718, creditKnown: true }).score, hs({ creditScore: 780, creditKnown: true }).score], [89, 86, 90], "5c no profile 89; entered 718 → 80 + 6 = 86; entered 780 → 80 + 10 = 90");
    t.ok(!/\+\d+ pts|\$150\/mo extra|discretionary 10%/.test(APP), "5d the health score tips promise no points the engine did not compute");
    // assumed debt rates: labelled, editable, and the entered rate replaces the assumption
    const manual = [{ name: "Visa", balance: "3000", rate: "", min: "60" }, { name: "Loan", balance: "5000", rate: "7", min: "150" }];
    const l1 = FC.buildDebtListForSimulator(manual, null);
    t.eq([l1[0].rate, l1[0].rateEstimated, l1[0].manualIndex], [20, true, 0], "5e a manual debt with no rate gets the assumed 20%, flagged as assumed");
    const l2 = FC.buildDebtListForSimulator(FC.applyDebtRate(manual, l1[0], 22.99), null);
    t.eq([l2[0].rate, l2[0].rateEstimated, l2[1].rate], [22.99, false, 7], "5f the rate the household enters replaces it, on that debt only");
    const liab = { credit: [{ name: "Card", balance: 1200, apr: null, account_id: "acc1" }] };
    const p1 = FC.buildDebtListForSimulator([], liab);
    t.eq([p1[0].rate, p1[0].rateEstimated], [20, true], "5g a bank card with no rate from the bank: assumed 20%, flagged");
    const saved = FC.applyDebtRate([], p1[0], 19.5);
    const p2 = FC.buildDebtListForSimulator(saved, liab);
    t.eq([saved.length, saved[0].account_id, saved[0].fromBank, p2.length, p2[0].rate, p2[0].rateEstimated], [1, "acc1", true, 1, 19.5, false],
      "5h …its entered rate is kept on that account's debt entry and used, with no duplicate debt");
    t.ok(APP.includes("Assumed rate, tap to enter yours") && !/APR\{result\.debtAprEstimated \? " \(est\.\)"/.test(APP), "5i What-If labels the assumed rate \"Assumed rate, tap to enter yours\", not \"(est.)\"");
    // the RRSP deadline
    const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    t.eq([2023, 2024, 2025, 2026, 2027].map(y => iso(R.rrspDeadline(y))), ["2024-02-29", "2025-03-03", "2026-03-02", "2027-03-01", "2028-02-29"],
      "5j the deadline is the 60th day, moved off a weekend: 2025 tax year → March 2, 2026 (the CRA's date)");
    const n1 = R.nextRrspDeadline(new Date("2026-03-02T12:00:00")), n2 = R.nextRrspDeadline(new Date("2026-10-01T12:00:00"));
    t.eq([n1.taxYear, iso(n1.date), n2.taxYear, iso(n2.date)], [2025, "2026-03-02", 2026, "2027-03-01"], "5k on March 2, 2026 it is still 2025's; on October 1 it is 2026's, March 1, 2027");
    t.ok(!/deadline for last tax year is March 1/.test(APP) && /nextRrspDeadline\(\)/.test(APP), "5l the coach and the RRSP tip compute it; no hard-coded March 1");
  }

  // ── 6. Prompt 3c: What-If states the result, with no verdict ────────────────────────────────
  {
    const FC = await import("../src/lib/financialCalculations.js");
    const base = FC.simulateDebtPayoff({ balance: 1000, apr: 12, monthlyPayment: 100 });
    const more = FC.simulateDebtPayoff({ balance: 1000, apr: 12, monthlyPayment: 200 });
    t.eq([base.monthsToPayoff, base.totalInterest, more.monthsToPayoff, more.totalInterest], [11, 58.98, 6, 31.12], "6a (the engine: 11 months / $58.98 at $100, 6 months / $31.12 at $200)");
    const r = (bm, bi, bd, am, ai, ad) => ({ baseline: { monthsToPayoff: bm, totalInterest: bi, payoffDate: bd }, boosted: { monthsToPayoff: am, totalInterest: ai, payoffDate: ad } });
    t.eq(A.debtResultSentence(r(11, 58.98, "2027-09-01", 6, 31.12, "2027-04-01"), 100, 100),
      "Paying $100 more a month moves the payoff date from September 2027 to April 2027 and changes total interest from $58.98 to $31.12.",
      "6b the debt result is the engine's dates and totals, stated, with no verdict");
    t.eq(A.debtResultSentence(r(11, 58.98, "2027-09-01", 11, 58.98, "2027-09-01"), 0, 100),
      "Paying $0 more a month changes nothing: the payoff date stays September 2027 and total interest stays $58.98.", "6c when the extra changes nothing, it says exactly that");
    t.eq(A.debtResultSentence(r(Infinity, Infinity, null, 30, 412.5, "2029-04-01"), 50, 20),
      "At the current $20 a month the balance is not paid off. Paying $50 more a month pays it off by April 2029, with total interest of $412.50.", "6d a payment that never clears the debt, stated as a fact");
    t.ok(/does not cover the interest, so the balance is not paid off\.$/.test(A.debtResultSentence(r(Infinity, Infinity, null, Infinity, Infinity, null), 5, 20)), "6e …and when neither payment clears it");
    for (const gone of ["Worth doing", "already optimal", "Long-term winner", "\"Go for it\"", "\"Not recommended\"", "\"Think twice\"", "\"Proceed carefully\"", "Better option:", "justifying the verdict",
      "an alternative if risky/tight", "calculateScenarioVerdict(", "\" pts\":impactIcon"]) {
      t.ok(!APP.includes(gone), `6f gone from What-If: ${gone}`);
    }
    t.ok(/summary: debtResultSentence\(result, extraPayment, currentPayment\)/.test(APP), "6g the debt card's line is debtResultSentence");
    t.ok(/do not recommend, judge, or call the purchase safe, risky, affordable or unaffordable, and do not suggest an alternative/.test(APP) && /JSON\.stringify\(factsForProse/.test(APP),
      "6h the purchase explanation is told facts only, and is sent no verdict, rating or health change");
  }

  // ── 7. Prompt 3c: the kids lessons are concepts ──────────────────────────────────────────────
  {
    const all = Object.values(A.KIDS_LESSONS).flat();
    t.eq(all.length, 8, "7a (the one deck: 8 lessons)");
    const text = all.map(l => [l.title, l.body, l.activity, l.key].filter(Boolean).join(" ")).join("\n");
    for (const gone of ["Pay your credit card in full every month", "Use debt only for things that gain value", "Invest with your very first", "Start saving young",
      "Use it wisely or not at all", "Start investing at your first job", "Ask a parent to open", "Play store at home", "Put $1 in a piggy bank", "Use an online compound interest calculator",
      "That's how people get into trouble", "Try this activity", "Split every dollar"]) {
      t.ok(!APP.includes(gone), `7b gone from the kids screens: "${gone}"`);
    }
    // No sentence in a lesson starts with an instruction verb, and none says should / always / never / don't.
    const sentences = text.split(/(?<=[.!?])\s+|\n/).map(x => x.trim()).filter(Boolean);
    const IMPERATIVE = /^(Pay|Use|Invest|Start|Ask|Put|Play|Save|Spend|Split|Try|Open|Watch|Avoid|Keep|Never|Always|Don't|Do|Make|Get|Buy|Borrow|Budget|Check)\b/;
    t.eq(sentences.filter(x => IMPERATIVE.test(x)), [], "7c no lesson sentence is an instruction");
    t.ok(!/\b(should|always|never|don't|must)\b/i.test(text), "7d no should / always / never / don't / must");
    t.ok(/\$10 - \$3 = \$7/.test(text) && /\$1 × 3 = \$3/.test(text), "7e the lesson figures are arithmetic shown in full ($10 - $3 = $7; $1 × 3 = $3)");
  }

  // ── 8. Prompt 3c: a health score on 5 of 6 parts says so ─────────────────────────────────────
  {
    const DE = await import("../src/lib/decisionEngine.js");
    const LABEL = "Based on 5 of 6 parts. Add your credit score in Settings for the full score.";
    t.eq(DE.HEALTH_SCORE_PARTIAL_LABEL, LABEL, "8a the label, word for word");
    const JUN = new Date("2026-06-15T12:00:00");
    const base = { accounts: [{ type: "checking", balance: "3000" }, { type: "savings", balance: "6000" }], bills: [{ name: "Rent", amount: "1500", freq: "monthly", date: "1" }],
      debts: [], incomes: [{ amount: "5000", freq: "monthly", type: "employment" }], transactions: [] };
    const none = DE.calcHealthScore({ ...base, profile: { country: "CA" } }, {}, JUN);
    const mine = DE.calcHealthScore({ ...base, profile: { country: "CA", creditScore: 718, creditKnown: true } }, {}, JUN);
    t.eq([none.score, none.partial, none.basisLabel], [89, true, LABEL], "8b no credit score: 80 × 100 / 90 = 89, labelled as 5 of 6 parts");
    t.eq([mine.score, mine.partial, mine.basisLabel], [86, false, null], "8c a credit score entered (718): 80 + 6 = 86, no label");
    const engine = fs.readFileSync(path.join(REPO, "src", "lib", "decisionEngine.js"), "utf8");
    t.ok(!/neither costs nor earns points/.test(engine) && engine.includes("That is a score on 5 of 6 parts, and it can") &&
      engine.includes("differ from the score the same household gets once a credit score is entered, in either direction"),
      "8d the engine comment says what the code does (scaled, and it can differ either way), not that it costs or earns nothing");
    // The Today tile shows the label beside the score
    const D = await import("../src/lib/demoFixture.js");
    const now = new Date();
    const data = { accounts: D.demoAccountsFor("CA"), debts: D.demoDebtsFor("CA"), incomes: D.buildDemoIncomes(now, "CA"), bills: D.buildDemoBills(now, "CA"),
      transactions: D.buildDemoTxns(now, "CA"), bankConnected: true };
    const noop = () => {};
    const today = (profile) => textOf(A.render(A.h(A.Dashboard, { data: { ...data, profile }, setAppData: noop, setScreen: noop, setShowNotifs: noop, onUpgrade: noop, onWhatIf: noop })));
    t.ok(today({ ...D.demoProfileFor("CA"), creditKnown: false }).includes(LABEL), "8e Today's health score tile shows the label when no credit score is entered");
    t.ok(!today(D.demoProfileFor("CA")).includes(LABEL), "8f …and not when one is (the demo's 718)");
    t.ok(/\{healthBasis&&<div style=\{\{color:"#ffffff88"/.test(APP), "8g Money Wrapped shows it under its score too");
  }

  t.summary("sourcedFigures.test");
  setImmediate(() => process.exit(process.exitCode || 0));
})();
