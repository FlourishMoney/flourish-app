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
  try { A = loadApp(["patternCards", "computeStats", "CC"]); } catch (e) { t.ok(false, `App.jsx bundles: ${describe(e)}`); }

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

  t.summary("sourcedFigures.test");
  setImmediate(() => process.exit(process.exitCode || 0));
})();
