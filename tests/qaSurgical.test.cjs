// tests/qaSurgical.test.cjs
// -----------------------------------------------------------------------------
// THE SURGICAL QA OF THE LIVE DEMO, ITEMS 1-5 AND 8.
//
// Two demo households, both on fixed dates:
//   QA     the demo as the QA saw it: created on 2026-09-04 and opened on 2026-09-29. The demo keeps
//          the dates it was created with, so by then its $1,650 rent and $348 of minimums fall due
//          before the next deposit, and Today shows $973 safe to spend.
//   FIXED  the demo created and opened on 2026-09-29, the published test date: $1,944.
//
//   1. Today's Money Plan: "Left over" is after everything due before the next deposit, and the
//      plan is not "On Track" while cash is tight.
//   2. Decisions: one rule decides tight cash; when it fires there is no move-to-savings or
//      extra-debt card, and the warning names safe to spend, not the balance.
//   3. Budget reads the engine's monthly income ($6,714), not a re-taxed $4,700.
//   4. The daily card uses the coach's wording: a 14-day pace, not a limit.
//   5. No invented interest rates.
//   8. Goals → Budget and Do → Budget count this month's spending the same way (#53).
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");
const { loadApp, textOf, describe, REPO } = require("./_renderApp.cjs");

(async () => {
  const t = create();
  const { SafeSpendEngine } = await import("../src/lib/safeSpendEngine.js");
  const { safeToSpendView } = await import("../src/lib/safeToSpendView.js");
  const { FinancialCalcEngine } = await import("../src/lib/financialCalculations.js");
  const DE = await import("../src/lib/decisionEngine.js");
  const { suggestedDailyView } = await import("../src/lib/suggestedDaily.js");
  const D = await import("../src/lib/demoFixture.js");

  const VIEW = new Date(2026, 8, 29, 12);
  const demoMadeOn = (made) => ({
    profile: D.demoProfileFor("CA"), accounts: D.demoAccountsFor("CA"), debts: D.demoDebtsFor("CA"),
    incomes: D.buildDemoIncomes(made), bills: D.buildDemoBills(made), transactions: D.buildDemoTxns(made), demo: true,
  });
  const QA = demoMadeOn(new Date(2026, 8, 4, 12));
  const FIXED = demoMadeOn(VIEW);
  const headline = (data) => safeToSpendView(SafeSpendEngine.calculate(data, VIEW)).headline;

  // ── Today's safe to spend does not move ───────────────────────────────────────────────────────
  t.eq(headline(QA), 973, "0a the QA demo still shows $973 safe to spend");
  t.eq(headline(FIXED), 1944, "0b the fixed-date demo still shows $1,944");

  // ── 1. The Money Plan ─────────────────────────────────────────────────────────────────────────
  {
    const ss = SafeSpendEngine.calculate(QA, VIEW);
    const plan = DE.AutopilotEngine.generate(QA, {}, VIEW);
    const due = ss.upcomingBills + ss.debtPayments;
    t.eq(due, 1650 + 348, "1a (QA: the $1,650 rent and $348 of minimums are due before the next deposit)");
    t.ok(plan.buffer <= ss.balance - due, `1b QA: "Left over" is after what's due first ($${Math.round(plan.buffer)}, not the $2,909 the QA saw)`);
    t.eq(Math.round(plan.buffer * 100) / 100, Math.round((ss.balance - due - plan.dailySpendLimit - plan.savingsTransfer - plan.debtPayment - plan.goalContribution) * 100) / 100,
         "1c …exactly: balance − due before the deposit − today's pace − the plan's moves");
    t.ok(plan.modeLabel !== "On Track", `1d QA: with cash tight the plan does not say "On Track" (says "${plan.modeLabel}")`);
    t.eq([plan.savingsTransfer, plan.debtPayment, plan.goalContribution], [0, 0, 0], "1e …and moves nothing to savings, debt or goals");
    t.ok(plan.alerts.some(a => /Safe to spend is below 15% of your monthly income/.test(a.msg)), "1f …and says why");

    const ssF = SafeSpendEngine.calculate(FIXED, VIEW);
    const planF = DE.AutopilotEngine.generate(FIXED, {}, VIEW);
    t.eq(planF.modeLabel, "On Track", "1g fixed date: not tight, so still On Track");
    t.eq([planF.savingsTransfer, planF.debtPayment], [240, 200], "1h …with its $240 to savings and $200 to the Visa");
    t.eq(Math.round(planF.buffer * 100) / 100, Math.round((ssF.balance - 65 - 348 - 138 - 240 - 200) * 100) / 100,
         "1i …and Left over is $3,083 − $65 − $348 − $138 − $240 − $200");
    const app = fs.readFileSync(path.join(REPO, "src", "App.jsx"), "utf8");
    t.ok(/label:"Left over"[^}]*detail:"after what's due before your next deposit"/.test(app), "1j the row says what it is net of");
  }

  // ── 2 to 5: Decisions, rendered ───────────────────────────────────────────────────────────────
  let A = null;
  try { A = loadApp(["DecisionEngine", "OpportunityDetector", "Goals", "BudgetScreen", "generateBudgetSuggestions"]); }
  catch (e) { t.ok(false, `src/App.jsx bundles for rendering: ${describe(e)}`); }
  if (A) {
    const noop = () => {};
    const decisions = (data) => {
      const safe = DE.displayedSafeToSpend(data, VIEW);
      const monthlyIncome = FinancialCalcEngine.cashFlow(data, {}, VIEW).monthlyIncome;
      const pace = suggestedDailyView(safe, data.incomes, data.transactions, VIEW, data);
      return textOf(A.render(A.h(A.DecisionEngine, { data, safe, bal: 3083, monthlyIncome, soonBills: [], todayDate: VIEW, dailyPace: pace, setScreen: noop })));
    };
    let qa = "", fixed = "";
    try { qa = decisions(QA); fixed = decisions(FIXED); } catch (e) { t.ok(false, `Decisions renders: ${describe(e)}`); }

    // 2. One rule decides tight cash.
    const tight = (d) => (typeof DE.cashIsTight === "function" ? DE.cashIsTight(d, VIEW).tight : "no cashIsTight rule");
    t.eq(tight(QA), true, "2a QA: $973 is under 15% of $6,714, so cash is tight");
    t.eq(tight(FIXED), false, "2b fixed date: $1,944 is not");
    t.ok(/Cash is running tight/.test(qa), "2c QA: Decisions warns");
    t.ok(/Your safe to spend \(\$973\) is below 15% of your monthly income \(\$6,714\)/.test(qa), "2d …in terms of safe to spend, with both figures");
    t.ok(!/Your balance is below/.test(qa), "2e …not the $3,083 balance");
    t.ok(!/Move \$\d+ to savings/.test(qa) && !/Pay \$\d+ extra on/.test(qa), "2f …and suggests neither moving money to savings nor paying extra on debt");
    t.ok(!/Cash is running tight/.test(fixed) && /Move \$486 to savings/.test(fixed) && /Pay \$150 extra on Visa card/.test(fixed),
         "2g fixed date: no warning, and the savings and debt cards are back");
    const app = fs.readFileSync(path.join(REPO, "src", "App.jsx"), "utf8");
    t.ok(/const lowCash = cashIsTight\(data, todayD\)\.tight;/.test(app), "2h Decisions asks the same rule the Money Plan asks");

    // 4. The daily card's wording.
    t.ok(/Suggested spend today: \$138/.test(fixed) && /That paces \$1,944 safe to spend over 14 days\. It's a pace, not a limit\./.test(fixed),
         "4a the daily card: a 14-day pace of what is safe to spend, not a limit");
    t.ok(/That paces \$973 safe to spend over 14 days/.test(qa), "4b …$973 over 14 days in the QA demo");
    t.ok(!/Keeps you safe until/.test(qa + fixed), "4c …and it no longer claims to keep anyone safe until the next deposit");

    // 5. No invented rates.
    let opp = "";
    try { opp = textOf(A.render(A.h(A.OpportunityDetector, { data: FIXED, setScreen: noop, setGoalsTab: noop }))); }
    catch (e) { t.ok(false, `Room Flourish found renders: ${describe(e)}`); }
    t.ok(/Compare rates on Visa card/.test(opp) && /Earn more on your savings/.test(opp), "5a sanity: both cards still render");
    t.ok(!/\b6\.5%|\b4%\+|\b0\.3%/.test(opp), "5b no invented rate: no 6.5% loan, no 4%+ savings, no typical 0.3%");
    t.ok(!/Save \$\d+\/yr|\+\$\d+\/yr/.test(opp), "5c …and no saving worked out from one");

    // 3. Budget reads the engine's income.
    const engine = Math.round(FinancialCalcEngine.cashFlow(FIXED).monthlyIncome);
    t.eq(engine, 6714, "3a (the engine's monthly income for the demo: $6,714)");
    t.eq(A.generateBudgetSuggestions(FIXED).netMo, engine, "3b Budget's take-home is the engine's $6,714, not a re-taxed $4,700");
    let budget = "";
    try { budget = textOf(A.render(A.h(A.BudgetScreen, { data: FIXED, setAppData: noop, setScreen: noop }))); }
    catch (e) { t.ok(false, `Do → Budget renders: ${describe(e)}`); }
    t.ok(/\$6,714\/mo take-home/.test(budget) || /Take-home \$6,714\/mo/.test(budget), "3c Do → Budget shows $6,714 a month take-home");
    t.ok(!/4,70\d\/mo/.test(budget), "3d …and nowhere $4,700");

    // 8. Both budget screens count spending the same way.
    const now = new Date();
    const thisMonth = (d) => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const hh = {
      profile: { country: "CA", status: "single" }, incomes: [{ name: "Pay", amount: 5000, freq: "monthly" }],
      bills: [], debts: [], accounts: [], budgets: { "Subscriptions": 20 },
      transactions: [
        { id: "a1", name: "Spotify Autopay", cat: "Subscriptions", amount: 30, date: thisMonth(1) },          // spending, paid by autopay
        { id: "a2", name: "RBC Visa Autopay", cat: "Subscriptions", amount: 500, date: thisMonth(1) },        // a card payment
        { id: "a3", name: "Credit card payment", cat: "Subscriptions", amount: 200, date: thisMonth(1) },     // a card payment
      ],
    };
    const BS = await import("../src/lib/budgetSpend.js").catch(() => null);
    t.eq(BS && BS.monthSpendByCategory(hh.transactions, { now }), { Subscriptions: 30 }, "8a the one tally: the autopaid subscription counts, the card payments do not");
    t.eq(BS && [BS.isCardPaymentCharge(hh.transactions[0]), BS.isCardPaymentCharge(hh.transactions[1]), BS.isCardPaymentCharge(hh.transactions[2])], [false, true, true],
         "8b a bare \"autopay\" is spending; autopay with a card word, or a card-payment phrase, is a card payment");
    let goals = "", doBudget = "";
    try {
      goals = textOf(A.render(A.h(A.Goals, { data: hh, initialTab: "budget", setAppData: noop, setScreen: noop })));
      doBudget = textOf(A.render(A.h(A.BudgetScreen, { data: hh, setAppData: noop, setScreen: noop })));
    } catch (e) { t.ok(false, `both budget screens render: ${describe(e)}`); }
    t.ok(/\$30 \/ \$20/.test(goals), "8c Goals → Budget: Subscriptions $30 of $20");
    t.ok(/Subscriptions \$30 \/ \$20/.test(doBudget.replace(/📱\s*/g, "")) || /\$30 \/ \$20/.test(doBudget), "8d Do → Budget: the same $30 of $20, not $0");
    t.ok(!/\$0 \/ \$20/.test(doBudget) && !/\$730 \/ \$20/.test(goals), "8e neither counts $0, nor the card payments");
    const src = fs.readFileSync(path.join(REPO, "src", "App.jsx"), "utf8");
    t.eq((src.match(/const monthSpend = monthSpendByCategory\(/g) || []).length, 4, "8f every budget tally (Today, Activity, Goals, Do) is the one helper");
    t.eq((src.match(/monthSpend\[[^\]]+\]\s*=\s*\(monthSpend/g) || []).length, 0, "8g …and nothing adds up its own");
  }

  t.summary("qaSurgical.test");
  setImmediate(() => process.exit(process.exitCode || 0));
})();
