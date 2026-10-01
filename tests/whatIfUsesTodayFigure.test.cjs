// tests/whatIfUsesTodayFigure.test.cjs
// -----------------------------------------------------------------------------
// WHAT-IF, MEET AND DECISIONS START FROM THE NUMBER TODAY SHOWS (math-reconcile item 2).
//
// Today shows safeToSpendView's integer headline: $1,944 in the CA demo. What-If passed the engine's
// raw safeAmount ($1,944.88) into simulatePurchaseImpact, so "spend $800" left $1,144.88, a figure no
// screen shows. It also rebuilt the cash balance and monthly income itself, with parseFloat and no
// currency filter, instead of reading the engines. Meet's "extra" and Decisions' "move to savings"
// took 25% of the raw figure too.
//
// Now all of them read decisionEngine.displayedSafeToSpend(data): Today's headline, with Today's own
// setup gate (no cash account: Today shows no figure, and callers get 0).
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");

(async () => {
  const t = create();
  const { SafeSpendEngine } = await import("../src/lib/safeSpendEngine.js");
  const { safeToSpendView } = await import("../src/lib/safeToSpendView.js");
  const { FinancialCalcEngine, simulatePurchaseImpact, isCashAccount, num } = await import("../src/lib/financialCalculations.js");
  const DE = await import("../src/lib/decisionEngine.js");
  const { buildMeetSnapshot } = await import("../src/lib/meetSnapshot.js");
  const { demoAccountsFor, demoDebtsFor, buildDemoIncomes, buildDemoBills, buildDemoTxns } = await import("../src/lib/demoFixture.js");

  const demoAt = (now) => ({
    profile: { name: "Alex", country: "CA" }, accounts: demoAccountsFor("CA"), debts: demoDebtsFor("CA"),
    incomes: buildDemoIncomes(now), bills: buildDemoBills(now), transactions: buildDemoTxns(now), demo: true,
  });
  // Today's figure, computed exactly the way the Today card computes it.
  const todayHeadline = (data, now) => safeToSpendView(SafeSpendEngine.calculate(data, now), {
    hasCashAccount: (data.accounts || []).filter(a => isCashAccount(a)).length > 0,
    hasIncome: (data.incomes || []).some(i => num(i && i.amount) > 0),
  }).headline;

  // ── 1. The demo: spend $800 leaves $1,144, matching Today ─────────────────────────────────────
  const now = new Date();
  const demo = demoAt(now);
  const ss = SafeSpendEngine.calculate(demo, now);
  t.eq(todayHeadline(demo, now), 1944, "1a Today shows $1,944");
  t.ok(ss.safeAmount > 1944 && ss.safeAmount < 1945, `1b (the engine's raw figure is ${ss.safeAmount.toFixed(2)})`);
  t.eq(DE.displayedSafeToSpend(demo, now), 1944, "1c displayedSafeToSpend is Today's $1,944");
  // What-If's inputs, as App.jsx now builds them.
  const impact = simulatePurchaseImpact({
    amount: 800,
    currentBalance: ss.balance,
    currentSafeToSpend: DE.displayedSafeToSpend(demo, now),
    avgDailySpend: FinancialCalcEngine.avgDailySpend(demo),
    monthlyIncome: FinancialCalcEngine.cashFlow(demo, {}, now).monthlyIncome,
    monthlySurplus: FinancialCalcEngine.cashFlow(demo, {}, now).cashFlow,
  });
  t.eq(impact.newSafeToSpend, 1144, "1d spend $800: $1,144 left, which is Today's $1,944 less $800");
  t.eq(impact.newSafeToSpend, todayHeadline(demo, now) - 800, "1e …exactly Today minus the purchase");

  // ── 2. Meet's extra and Decisions' move-to-savings are 25% of the same figure ─────────────────
  const dec = (buildMeetSnapshot(demo).decisions || [])[0];
  // Prompt 3e: Meet states the spare amount and moves none of it; the $486 is in the question.
  t.ok(dec && /^\$486 is spare /.test(dec.question) && /a quarter of your \$1,944 safe to spend/.test(dec.question) && dec.options[1].label === "Savings", "2a Meet: $486, 25% of $1,944");
  t.eq(DE.computeSavingsOpportunity(DE.displayedSafeToSpend(demo, now)), 486, "2b Decisions: the same $486");
  // Across a year of dates, Meet's extra is always 25% of what Today shows, never of the raw amount.
  let agree = 0, checked = 0;
  for (let k = 0; k < 365; k += 7) {
    const d = new Date(2026, 0, 1 + k, 12);
    const data = demoAt(d);
    const shown = todayHeadline(data, d);
    const want = DE.computeSavingsOpportunity(shown);
    checked++;
    if (DE.computeSavingsOpportunity(DE.displayedSafeToSpend(data, d)) === want) agree++;
  }
  t.eq(agree, checked, `2c on ${checked} dates the savings figure is 25% of Today's number`);

  // ── 3. The edges keep their old meaning ───────────────────────────────────────────────────────
  const noCash = { ...demo, accounts: demo.accounts.filter(a => !isCashAccount(a)) };
  t.eq(todayHeadline(noCash, now), null, "3a no cash account: Today shows no figure");
  t.eq(DE.displayedSafeToSpend(noCash, now), 0, "3b …and What-If and Meet start from 0, as they did from the clamped engine figure");
  const noIncome = { ...demo, incomes: [] };
  t.eq(SafeSpendEngine.calculate(noIncome, now).noIncome, true, "3d no income: Today asks for the income instead of showing a figure");
  t.eq(DE.displayedSafeToSpend(noIncome, now), 0, "3e …so the displayed figure is 0 for What-If, Meet and Decisions too");
  t.eq((buildMeetSnapshot(noIncome).decisions || []).length, 0, "3f …and Meet offers no extra payment out of a figure Today does not show");
  t.eq(DE.computeSavingsOpportunity(DE.displayedSafeToSpend({ ...demo, accounts: [{ id: "c", type: "checking", balance: 100 }] }, now)), 0,
       "3c over-committed: Today shows a negative figure, and there is nothing to move to savings");

  // ── 4. The wiring ─────────────────────────────────────────────────────────────────────────────
  const REPO = path.join(__dirname, "..");
  const app = fs.readFileSync(path.join(REPO, "src", "App.jsx"), "utf8");
  const meet = fs.readFileSync(path.join(REPO, "src", "lib", "meetSnapshot.js"), "utf8");
  const whatIf = app.slice(app.indexOf("function WhatIfSimulator("), app.indexOf("function WhatIfSimulator(") + 30000);
  t.ok(/const safeToSpend\s*=\s*displayedSafeToSpend\(data\);/.test(whatIf), "4a What-If passes the displayed figure");
  t.ok(!/SafeSpendEngine\.calculate\(data\)\.safeAmount/.test(whatIf), "4b …not the raw safeAmount");
  t.ok(/currentBalance:\s*ssNow\.balance,/.test(whatIf), "4c What-If's balance is the engine's (base-currency cash only)");
  t.ok(/monthlyIncome:\s*cashFlowObj\.monthlyIncome,/.test(whatIf), "4d …and its monthly income is cashFlow's");
  t.ok(!/\.filter\(a => isCashAccount\(a\)\)\s*\.reduce\(\(s,a\) => s \+ parseFloat\(a\.balance\|\|0\), 0\)/.test(whatIf), "4e the parseFloat rebuild of cash is gone");
  t.ok(!/_toMoSim\(i\.amount,i\.freq\)/.test(whatIf), "4f …and so is the parseFloat rebuild of income");
  t.ok(/spareUntilDeposit\(data\)/.test(meet) && /const \{ tight, safe \} = cashIsTight\(data, todayDate\);/.test(fs.readFileSync(path.join(__dirname, "..", "src", "lib", "decisionEngine.js"), "utf8")),
    "4g Meet's spare amount is based on the displayed figure (spareUntilDeposit reads cashIsTight's safe, displayedSafeToSpend)");
  t.ok(/<DecisionEngine data=\{data\} safe=\{displayedSafe\}/.test(app), "4h Decisions gets the displayed figure too");

  t.summary("whatIfUsesTodayFigure.test");
})();
