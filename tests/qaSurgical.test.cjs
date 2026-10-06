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
    // Prompt 3e: the plan no longer splits a surplus or shows a residual ("Left over" was net of the
    // split). What 1b/1c protected, a figure that ignored what is due first, cannot come back: there is
    // no residual and no split field at all.
    t.ok(!("buffer" in plan) && !("surplus" in plan), "1b QA: the plan has no \"Left over\" residual and no surplus of its own");
    t.ok(!("savingsTransfer" in plan) && !("debtPayment" in plan) && !("goalContribution" in plan), "1c …and no split of any amount into savings, a debt or a goal");
    // Prompt 3d: the labels state what the engine found ("Bills covered" / "Cash is tight" / "Overdraft risk"), not a grade.
    t.eq(plan.modeLabel, "Cash is tight", "1d QA: with cash tight the plan says so, not \"Bills covered\"");
    t.eq([plan.spare, plan.spareReason], [0, "tight"], "1e …and nothing is spare, because cash is tight");
    t.ok(plan.alerts.some(a => /Safe to spend is below 15% of your monthly income/.test(a.msg)), "1f …and says why");

    const ssF = SafeSpendEngine.calculate(FIXED, VIEW);
    const planF = DE.AutopilotEngine.generate(FIXED, {}, VIEW);
    t.eq(planF.modeLabel, "Bills covered", "1g fixed date: not tight, so \"Bills covered\"");
    // Prompt 3e: the fixed-date plan used to send $240 to savings and $200 to the Visa (its own 40% / 40%
    // rules). It now shows the one spare amount, $486 = 25% × $1,944, the same figure as Decisions.
    t.eq([planF.spare, planF.spareFrom, planF.spareReason], [486, 1944, null], "1h …with $486 spare: 25% × $1,944, the Decisions figure");
    t.ok(!("savingsTransfer" in planF) && !("buffer" in planF) && ssF.balance > 0, "1i …and no $240 / $200 split and no Left over");
    const app = fs.readFileSync(path.join(REPO, "src", "App.jsx"), "utf8");
    t.ok(!/label:"Left over"/.test(app) && /label:"Spare until your next deposit"/.test(app), "1j the card shows the spare amount, and no residual");
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
    // Prompt 3d: the savings and debt cards state facts ("$486 spare until your next deposit", "Visa card: $150 more a month").
    t.ok(!/\$\d+ spare until your next deposit/.test(qa) && !/: \$\d+ more a month/.test(qa), "2f …and shows neither the spare-for-savings card nor the extra-on-debt card");
    // Prompt 3e: the "$150 more a month on the Visa" card is gone (a suggested amount for a debt).
    t.ok(!/Cash is running tight/.test(fixed) && /\$486 spare until your next deposit/.test(fixed) && !/more a month/.test(fixed),
         "2g fixed date: no warning, and the spare-amount card is back (with no debt amount card)");
    const app = fs.readFileSync(path.join(REPO, "src", "App.jsx"), "utf8");
    t.ok(/const lowCash = cashIsTight\(data, todayD\)\.tight;/.test(app), "2h Decisions asks the same rule the Money Plan asks");
    // Meet reads the clock itself, so its demo is aged relative to today: 25 days old, like the QA's.
    const { buildMeetSnapshot } = await import("../src/lib/meetSnapshot.js");
    const now2 = new Date(); const made = new Date(now2); made.setDate(made.getDate() - 25);
    const aged = demoMadeOn(made);
    t.eq(typeof DE.cashIsTight === "function" && DE.cashIsTight(aged).tight, true, "2i (a 25-day-old demo, today: cash is tight)");
    t.eq((buildMeetSnapshot(aged).decisions || []).length, 0, "2j …and Meet does not offer to move money to debt or savings either");
    t.eq((buildMeetSnapshot(demoMadeOn(now2)).decisions || []).length, 1, "2k (a fresh demo still gets its Meet decision)");

    // 4. The daily card's wording.
    t.ok(/Today's pace: about \$138 a day/.test(fixed) && /Today's pace is about \$138 a day: \$1,944 safe to spend spread over 14 days\. It's a pace, not a limit\./.test(fixed),
         "4a the daily card: about $138 a day, a 14-day pace of what is safe to spend, not a limit (demo-clarity item 10)");
    t.ok(/\$973 safe to spend spread over 14 days/.test(qa), "4b …$973 over 14 days in the QA demo");
    t.ok(!/Keeps you safe until/.test(qa + fixed), "4c …and it no longer claims to keep anyone safe until the next deposit");

    // 5. No invented rates.
    let opp = "";
    try { opp = textOf(A.render(A.h(A.OpportunityDetector, { data: FIXED, setScreen: noop, setGoalsTab: noop }))); }
    catch (e) { t.ok(false, `Room Flourish found renders: ${describe(e)}`); }
    t.ok(/Visa card: 19\.99% interest/.test(opp) && /Your savings: \$/.test(opp), "5a sanity: both cards still render (as facts since prompt 3d)");
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
    const pay = (name) => BS && BS.isCardPaymentCharge({ name, amount: 500 }, []);
    t.eq(["CAPITAL ONE AUTOPAY PYMT", "CHASE CREDIT CRD AUTOPAY", "Citi Autopay", "MB-VISA 4521", "PAYMENT - MASTERCARD PAYMENT"].map(pay), [true, true, true, true, true],
         "8b2 card issuers' autopay lines and the bank's card-payment names are card payments");
    t.eq(["Spotify Autopay", "Rogers Autopay", "Hydro One Autopay", "Netflix"].map(pay), [false, false, false, false],
         "8b3 a subscription or utility paid by autopay is spending");
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
    const spend = src.slice(src.indexOf("function SpendScreen("), src.indexOf("\nfunction ", src.indexOf("function SpendScreen(") + 10));
    t.ok(!/isCCPayment\(/.test(spend) && (spend.match(/isCardPaymentCharge\(/g) || []).length >= 5,
         "8h the Activity screen (breakdown, category cards, list, total) uses the same card-payment rule as its Budget Plan card");
  }

  t.summary("qaSurgical.test");
  setImmediate(() => process.exit(process.exitCode || 0));
})();
