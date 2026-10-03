// tests/debtPayoffOneModel.test.cjs
// -----------------------------------------------------------------------------
// ONE DEBT PAYOFF MODEL, AT THE DEBT'S REAL MINIMUM (math-reconcile item 1).
//
// Three surfaces say how long a debt takes to clear: Today's Decisions card, the Meet decision and
// the What-If simulator. Decisions and Meet used their own loop at max($25, 2% of balance) and
// ignored the minimum the household entered, while What-If used the entered minimum. So the demo car
// loan ($8,200 at 6.99%, $280 minimum) was modelled at $164 a month and "cleared" in 60 months on
// two screens, and in 33 on the third.
//
// Now there is one function, financialCalculations.simulateDebtPayoffForDebt, built on the one
// amortization (simulateDebtPayoff), paying debtMinimumPayment(debt): num(debt.min) when it is above
// zero, and the max($25, 2% of balance) estimate only when the debt has no minimum at all.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");

(async () => {
  const t = create();
  const FC = await import("../src/lib/financialCalculations.js");
  const DE = await import("../src/lib/decisionEngine.js");
  const { buildMeetSnapshot } = await import("../src/lib/meetSnapshot.js");
  const { demoAccountsFor, demoDebtsFor, buildDemoIncomes, buildDemoBills, buildDemoTxns } = await import("../src/lib/demoFixture.js");

  const [visa, car] = demoDebtsFor("CA");
  t.eq([visa.name, visa.min, car.name, car.balance, car.rate, car.min], ["Visa card", "68", "Car Loan", "8200", "6.99", "280"],
       "(the CA demo debts are the Visa card at a $68 minimum and the $8,200 car loan at 6.99% with a $280 minimum)");

  // ── 1. The minimum rule ───────────────────────────────────────────────────────────────────────
  t.eq(FC.debtMinimumPayment(car), 280, "1a a debt's own minimum is the payment");
  t.eq(FC.debtMinimumPayment({ balance: "8200" }), 164, "1b no minimum: the estimate, 2% of the balance");
  t.eq(FC.debtMinimumPayment({ balance: "500", min: "" }), 25, "1c no minimum on a small balance: the $25 floor");
  t.eq(FC.debtMinimumPayment({ balance: "8200", min: "0" }), 164, "1d a zero minimum counts as missing");
  t.eq(FC.debtMinimumPayment({ balance: "8200", min: "$1,200" }), 1200, "1e the minimum is read with num(), so \"$1,200\" is 1200");

  // ── 2. The car loan pays off in 33 months, not 60 ─────────────────────────────────────────────
  t.eq(DE.debtPayoffMonths(car, 0), 33, "2a car loan at its $280 minimum: 33 months");
  t.eq(FC.simulateDebtPayoff({ balance: 8200, apr: 6.99, monthlyPayment: 164 }).monthsToPayoff, 60,
       "2b (the old $164 estimate is what produced 60)");
  t.eq(FC.simulateDebtPayoffForDebt(car, 0).baseline.monthsToPayoff, 33, "2c What-If's model says 33 too");
  t.eq(DE.debtPayoffMonths(car, 150), 21, "2d $150 extra on the car loan: 21 months");
  t.eq(DE.computeDebtPayoffImpact(car, 150), 12, "2e so Decisions would say it cuts 12 months, not the 31 the $164 estimate gave");

  // ── 3. Visa: what the screens show is unchanged ───────────────────────────────────────────────
  // Meet, in the demo exactly as it renders: the extra is 25% of the displayed $1,944.
  const now = new Date();
  const demo = {
    profile: { name: "Alex", country: "CA" }, accounts: demoAccountsFor("CA"), debts: demoDebtsFor("CA"),
    incomes: buildDemoIncomes(now), bills: buildDemoBills(now), transactions: buildDemoTxns(now), demo: true,
  };
  const dec = (buildMeetSnapshot(demo).decisions || [])[0];
  t.ok(!!dec, "3a the demo Meet agenda carries its one decision");
  // Prompt 3e: Meet names the debt with its own balance and suggests no amount for it, so it no
  // longer projects a payoff from moving the spare amount (what 3b/3c used to pin).
  t.eq(dec && dec.options[0].label, "Visa card", "3b …naming the Visa card");
  t.eq(dec && dec.options[0].outcome, "$3,420 owed at 19.99%", "3c …with its own balance and rate, and no extra amount or payoff projection");
  // What-If always used the entered $68, so its Visa figures are identical.
  const list = FC.buildDebtListForSimulator(demo.debts, null);
  const visaW = [...list].sort((a, b) => b.rate - a.rate)[0];
  const whatIf = FC.simulateDebtPayoffForDebt(visaW, 100);
  const before = FC.simulateDebtPayoffBoost({ balance: 3420, apr: 19.99, currentPayment: 68, extraPayment: 100 });
  t.eq([whatIf.baseline.monthsToPayoff, whatIf.boosted.monthsToPayoff, whatIf.monthsSaved, whatIf.interestSaved],
       [before.baseline.monthsToPayoff, before.boosted.monthsToPayoff, before.monthsSaved, before.interestSaved],
       "3d What-If's Visa result (+$100/mo) is unchanged");
  t.eq([whatIf.baseline.monthsToPayoff, whatIf.boosted.monthsToPayoff, whatIf.monthsSaved], [111, 26, 85], "3e (111 months at $68, 26 with $100 more)");
  // Decisions now models the Visa at $68 rather than the $68.40 estimate, so its "cuts N months"
  // moves by two. The figure it prints is now the same model every other surface uses.
  t.eq(DE.computeDebtPayoffImpact(visa, 150), 92, "3f Decisions' $150-extra figure for the Visa is 92 months (it was 90 at the $68.40 estimate)");
  t.eq(DE.debtPayoffMonths(visa, 0), 111, "3g Meet and Decisions agree with What-If: 111 months at the minimum");

  // ── 4. The ceiling and the edges keep their meaning ───────────────────────────────────────────
  t.eq(DE.debtPayoffMonths({ balance: "50000", rate: "29.99" }, 0), 240, "4a a payment below the interest never clears: the 240-month ceiling");
  t.eq(DE.debtPayoffMonths({ balance: "0", rate: "19.99", min: "50" }, 100), 0, "4b nothing owed: 0 months");
  t.eq(DE.debtPayoffMonths(null, 100), 0, "4c no debt: 0");
  t.eq(DE.debtPayoffMonths({ balance: "1000", min: "100" }, 0), DE.debtPayoffMonths({ balance: "1000", rate: "19.99", min: "100" }, 0),
       "4d no rate: 19.99%, as Decisions and Meet always assumed");

  // ── 5. Every surface calls the one model ──────────────────────────────────────────────────────
  const REPO = path.join(__dirname, "..");
  const read = (p) => fs.readFileSync(path.join(REPO, p), "utf8");
  const app = read("src/App.jsx"), de = read("src/lib/decisionEngine.js"), meet = read("src/lib/meetSnapshot.js"), fc = read("src/lib/financialCalculations.js");
  t.ok(/simulateDebtPayoffForDebt\(targetDebt, extraPayment\)/.test(app), "5a What-If calls simulateDebtPayoffForDebt");
  t.ok(/const currentPayment = debtMinimumPayment\(targetDebt\);/.test(app), "5b …and shows the payment it modelled");
  // Prompt 3e: Decisions and Meet suggest no extra payment, so neither models one any more; What-If is
  // the one surface that projects a payoff, through the one model (5a).
  t.ok(!/computeDebtPayoffImpact\(topDebt/.test(app) && !/extraPayment = 150/.test(app), "5c Decisions no longer projects a $150 extra payment");
  t.ok(!/debtPayoffMonths\(/.test(meet), "5d Meet no longer projects a payoff from the spare amount");
  t.ok(/simulateDebtPayoffForDebt\(debt, extraPayment\)/.test(de), "5e debtPayoffMonths is built on simulateDebtPayoffForDebt");
  t.ok(!/while \(b > 0/.test(de) && !/Math\.max\(25, balance \* 0\.02\)/.test(de), "5f decisionEngine has no amortization loop and no 2% rule of its own");
  t.eq((fc.match(/while \(remaining > 0/g) || []).length, 1, "5g financialCalculations has exactly one amortization loop");
  t.eq((fc.match(/Math\.max\(25, .*\* 0\.02\)/g) || []).length, 1, "5h …and exactly one max($25, 2%) rule, in debtMinimumPayment");

  // ── 6. A bank-linked card: Meet, Decisions and What-If model the same debt ───────────────────
  // The debt entry for a bank-imported card has no rate or minimum; the bank's liability record has
  // both. Meet and Decisions used the entry (19.99% and the 2% estimate) while What-If used the bank's
  // APR and minimum. All three now take the top debt from buildDebtListForSimulator.
  {
    const linked = {
      profile: { name: "Sam", country: "CA" },
      accounts: [{ id: "chq", type: "checking", balance: 4000 }, { id: "c1", type: "credit", balance: -3000 }],
      incomes: [{ id: 1, label: "Pay", amount: "2500", freq: "biweekly" }],
      bills: [], transactions: [],
      debts: [{ name: "Visa ••1234", balance: "3000", rate: "", min: "", fromBank: true, account_id: "c1" }],
      liabilities: { credit: [{ account_id: "c1", name: "Visa ••1234", balance: 3000, apr: 22.99, minPayment: 95 }] },
    };
    const listTop = DE.selectHighestRateDebt(FC.buildDebtListForSimulator(linked.debts, linked.liabilities));
    t.eq([listTop.rate, listTop.min], [22.99, 95], "6a the list carries the bank's APR and minimum");
    const whatIfBase = FC.simulateDebtPayoffForDebt(listTop, 0).baseline.monthsToPayoff;
    t.eq(DE.debtPayoffMonths(listTop, 0), Math.min(whatIfBase, 240), "6b Decisions' and Meet's months at the minimum are What-If's");
    const meetDec = (buildMeetSnapshot(linked).decisions || [])[0];
    const extra = DE.computeSavingsOpportunity(DE.displayedSafeToSpend(linked));
    const fmt = (m) => (m >= 240 ? "20+ yrs" : m >= 24 ? `${Math.round(m / 12)} yrs` : `${m} mo`);
    t.ok(extra > 0 && fmt(240) === "20+ yrs", "6c0 (the linked household has a spare amount)");
    t.eq(meetDec && meetDec.options[0].outcome, "$3,000 owed at 22.99%", "6c Meet names the card with the bank's balance and APR (prompt 3e: no payoff projection)");
    t.ok(/const top = selectHighestRateDebt\(buildDebtListForSimulator\(data\.debts, data\.liabilities, data\)\);/.test(meet), "6d Meet picks from the What-If list");
    t.ok(/buildDebtListForSimulator\(data\.debts, data\.liabilities, data\)/.test(read("src/lib/decisionEngine.js")), "6e the Money Plan lists debts from the What-If list too");
  }

  t.summary("debtPayoffOneModel.test");
})();
