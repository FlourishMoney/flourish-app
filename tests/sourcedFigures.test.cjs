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
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");
const { loadApp, describe, REPO } = require("./_renderApp.cjs");

const APP = fs.readFileSync(path.join(REPO, "src", "App.jsx"), "utf8");
const MONEY = /\$\s?\d[\d,]*(?:\.\d+)?/g;

(async () => {
  const t = create();
  let A = {};
  try { A = loadApp(["patternCards", "computeStats", "CC", "TAX_DATA"]); } catch (e) { t.ok(false, `App.jsx bundles: ${describe(e)}`); }

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
    t.eq([ctcTip && ctcTip.body, ctcTip && ctcTip.savings], ["Up to $2,200 per qualifying child under 17 (OBBBA). Part of it is refundable, so it can be paid even when no tax is owed.", "$2,200/child (OBBBA)"],
      "3c the Child Tax Credit tip reads $2,200 from TAX_DATA, with no unsourced $1,700");
    const ctcBen = A.CC.US.benefitsChecker.find(x => x.name === "Child Tax Credit");
    t.eq(ctcBen && ctcBen.amount, "Up to $2,200/child (OBBBA)", "3d …and so does the benefits checker");
    t.ok(APP.includes("OAS (up to $${TAX_DATA.CA.OAS.maxMonthly65to74}/mo at 65 to 74)") && !APP.includes("OAS ($727/mo)"), "3e the coach's OAS figure reads TAX_DATA ($751.97), not $727");
    t.ok(APP.includes('HST/GST registration ($${TAX_DATA.CA.GSTHST_SMALL_SUPPLIER.value.toLocaleString("en-US")} threshold)') && !APP.includes("($30k threshold)"), "3f the coach's registration threshold reads TAX_DATA");
    t.ok(APP.includes('Child Tax Credit ($${TAX_DATA.US.CHILD_TAX_CREDIT.value.toLocaleString("en-US")}/child under 17, OBBBA)'), "3g the coach's Child Tax Credit reads TAX_DATA");
    t.eq((APP.match(/\$100 × 1\.07 to the power of 20 = \$387\. The 7% is an example rate\./g) || []).length, 2, "3h both kids decks show 1.07^20 × $100 = $387 in full (was $386)");
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

  t.summary("sourcedFigures.test");
  setImmediate(() => process.exit(process.exitCode || 0));
})();
