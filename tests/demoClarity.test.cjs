// tests/demoClarity.test.cjs
// -----------------------------------------------------------------------------
// DEMO CLARITY, THE PARTS A NODE TEST CAN HOLD (the browser parts are in landingDemo.browser.test.cjs).
//
//   10. The daily pace is safe to spend spread over the window and rounded DOWN to whole dollars, so it
//       says so: "Today's pace is $138 a day, rounded down so 14 days stay within $1,944 safe to spend."
//       ($1,944 / 14 = $138.86.) For any safe-to-spend figure and window, pace x days is at most safe to
//       spend and within one dollar a day of it, and every surface that shows the pace uses that sentence.
//    8. A purchase with no amount is never simulated: "Buy a $" has no amount, so What-If asks for one
//       instead of showing "Spending $0 takes safe to spend … from $1,944 to $1,944." A preset fills the
//       input with its own text, so pressing Simulate after it runs the same scenario.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");
const { loadApp, textOf, describe, REPO } = require("./_renderApp.cjs");

(async () => {
  const t = create();
  const SD = await import("../src/lib/suggestedDaily.js");
  const D = await import("../src/lib/demoFixture.js");
  const { formatMoney } = await import("../src/lib/format.js");
  const { parseAmountFromQuery } = await import("../src/lib/financialCalculations.js");

  // ── 10. The pace multiplies out, conservatively ────────────────────────────────────────────────
  {
    const bad = [];
    for (let safe = 0; safe <= 5000; safe += 37) {
      for (const days of [0, 1, 3, 7, 13, 14, 15, 21, 30]) {
        const { daysLeft, safeToday } = SD.computeDailySpendLimit(safe, days);
        const total = safeToday * daysLeft;
        if (total > safe || safe - total >= daysLeft) bad.push(`${safe}/${days}: ${safeToday} x ${daysLeft} = ${total}`);
      }
    }
    t.eq(bad.slice(0, 5), [], "10a for every safe-to-spend figure and window, pace x days is at most safe to spend and within one dollar a day of it");
    const p = { daily: 138, dailyText: "$138", daysLeft: 14 };
    t.eq(SD.paceSentence(p, 1944), "Today's pace is $138 a day, rounded down so 14 days stay within $1,944 safe to spend.", "10b the sentence says it is rounded down ($1,944 / 14 = $138.86)");
    for (const c of D.DEMO_COUNTRIES) {
      const now = new Date();
      const data = { profile: D.demoProfileFor(c), accounts: D.demoAccountsFor(c), debts: D.demoDebtsFor(c), incomes: D.buildDemoIncomes(now, c), bills: D.buildDemoBills(now, c), transactions: D.buildDemoTxns(now, c) };
      const { SafeSpendEngine } = await import("../src/lib/safeSpendEngine.js");
      const { safeToSpendView } = await import("../src/lib/safeToSpendView.js");
      const head = safeToSpendView(SafeSpendEngine.calculate(data)).headline;
      const pace = SD.suggestedDailyView(head, data.incomes, data.transactions, now, data);
      t.ok(pace.daily * pace.daysLeft <= head && head - pace.daily * pace.daysLeft < pace.daysLeft,
        `10c ${c} demo: ${formatMoney(pace.daily)} x ${pace.daysLeft} = ${formatMoney(pace.daily * pace.daysLeft)}, at most ${formatMoney(head)} and within a dollar a day`);
    }
    const APP = fs.readFileSync(path.join(REPO, "src", "App.jsx"), "utf8");
    const DE = fs.readFileSync(path.join(REPO, "src", "lib", "decisionEngine.js"), "utf8");
    const CO = fs.readFileSync(path.join(REPO, "src", "lib", "demoCoach.js"), "utf8");
    t.ok(/\? paceSentence\(dailyPace, ssView\.headline\)/.test(APP) && /detail: `\$\{paceSentence\(dailyPace, safe\)\} It's a pace, not a limit\.`/.test(APP)
      && /paceText: paceSentence\(pace, safeToSpendView\(ss\)\.headline\)/.test(DE) && /detail:plan\.paceText/.test(APP) && /\$\{paceSentence\(f\.pace, f\.view\.headline\)\}/.test(CO),
      "10d Today, the Decisions card, the Money Plan row and the demo coach all use the one pace sentence");
    t.ok(!/Today's pace is \$\{|Suggested spend today:|That paces \$\{/.test(APP + CO), "10e no surface keeps its own unqualified pace wording");
  }

  // ── 8. No purchase without an amount ─────────────────────────────────────────────────────────
  {
    t.eq([parseAmountFromQuery("Buy a $"), parseAmountFromQuery("Buy a $800 laptop")], [0, 800], "8a (\"Buy a $\" carries no amount; the laptop preset carries $800)");
    const APP = fs.readFileSync(path.join(REPO, "src", "App.jsx"), "utf8");
    const sim = APP.slice(APP.indexOf("function WhatIfSimulator("), APP.indexOf("// ── PAYWALL GATE (Phase 2)", APP.indexOf("function WhatIfSimulator(")));
    t.ok(/=== "purchase" && !\(parseAmountFromQuery\(qText\) > 0\)\) \{\s*setQuery\(qText\); setResult\(null\); setNeedAmount\(true\);\s*return;/.test(sim),
      "8b a purchase with no amount returns before any result is built, and before a simulation is counted");
    t.ok(/onClick=\{\(\)=>\{ setInputVal\(p\.label\); simulate\(p\.label, p\.type\); \}\}/.test(APP), "8c a quick scenario puts its own text in the input, so Simulate afterwards runs the same scenario");
    t.ok(/Type the amount too, like "Buy a \$800 laptop", then press Simulate\./.test(APP), "8d …and with no amount, What-If asks for one");
  }

  t.summary("demoClarity.test");
  setImmediate(() => process.exit(process.exitCode || 0));
})();
