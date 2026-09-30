// tests/round2Fixes.test.cjs
// -----------------------------------------------------------------------------
// ROUND-2 REVIEW FIXES, ITEMS 2 TO 5 (item 1, the payday phase, is paydayPhase.test).
//
//   2. First Visit uses Today's no-income gate: with a bank but no income, Today asks for the income
//      and prints no figure, and so does First Visit. It used to print a safe-to-spend figure.
//   3. Budget's fixed commitments count a debt minimum once. A minimum a bill already pays is in the
//      bills; generateBudgetSuggestions added it again. It now reads unbilledDebtMinimums, the rule
//      safe to spend and the forecast use.
//   4. The coach is told the safe-to-spend figure Today shows ($1,944), not the engine's raw amount
//      ($1944.88), and no figure at all when Today shows none.
//   5. The invest What-If says its 7% is "an assumed 7% a year, not a prediction".
// Today's figure does not move: 16 demo cases are pinned in 6.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");
const { loadApp, textOf, describe, REPO } = require("./_renderApp.cjs");

(async () => {
  const t = create();
  const D = await import("../src/lib/demoFixture.js");
  const DE = await import("../src/lib/decisionEngine.js");
  const { SafeSpendEngine } = await import("../src/lib/safeSpendEngine.js");
  const { safeToSpendView } = await import("../src/lib/safeToSpendView.js");
  const app = fs.readFileSync(path.join(REPO, "src", "App.jsx"), "utf8");

  const demo = (c, made) => ({ accounts: D.demoAccountsFor(c), debts: D.demoDebtsFor(c), incomes: D.buildDemoIncomes(made, c),
    bills: D.buildDemoBills(made, c), transactions: D.buildDemoTxns(made, c), profile: D.demoProfileFor(c) });
  const TODAY = new Date("2026-09-29T12:00:00");

  let A = {};
  try { A = loadApp(["FirstVisitScreen", "generateBudgetSuggestions"]); }
  catch (e) { t.ok(false, `App.jsx bundles: ${describe(e)}`); }
  const render = (el) => textOf(A.render(el));

  // ── 2. First Visit: no income, no figure ─────────────────────────────────────────────────────
  {
    const bankNoIncome = { profile: { name: "Sam", country: "CA" }, bankConnected: true,
      accounts: [{ id: "a1", name: "Chequing", type: "depository", subtype: "checking", balance: 3200 }],
      incomes: [], bills: [{ id: "b1", name: "Rent", amount: "1200", freq: "monthly", dueDay: 1 }], debts: [], transactions: [] };
    t.eq(SafeSpendEngine.calculate(bankNoIncome).noIncome, true, "2a (the household: a bank, a bill, no income; the engine says noIncome)");
    let txt = "";
    try { txt = render(A.h(A.FirstVisitScreen, { data: bankNoIncome, onDismiss: () => {} })); }
    catch (e) { t.ok(false, `2b First Visit renders: ${describe(e)}`); }
    t.ok(txt.includes("Add your income to see what's safe to spend"), `2b First Visit asks for the income, as Today does ("${txt.slice(0, 120)}")`);
    t.ok(!/\$\s*[\d,]+/.test(txt), "2c …and prints no dollar figure");
    t.ok(!/breathing room|to spend freely today|How is this calculated/.test(txt), "2d …no \"breathing room\", no \"to spend freely today\", no breakdown button");
    t.ok(txt.includes("Take me to my dashboard"), "2e …its button goes to the dashboard");
    // Today's gate is the same flag.
    t.ok(/\{hasCashAccount \? \(_ss\.noIncome \? \(/.test(app), "2f (Today's hero gates on the engine's noIncome, the flag First Visit now reads)");

    // With income, First Visit still shows Today's figure.
    const made = new Date(TODAY);
    const d = demo("CA", made);
    const today = safeToSpendView(SafeSpendEngine.calculate(d)).headline;
    let withIncome = "";
    try { withIncome = render(A.h(A.FirstVisitScreen, { data: d, onDismiss: () => {} })); } catch (e) { t.ok(false, `2g renders: ${describe(e)}`); }
    t.ok(withIncome.replace(/\s/g, "").includes("$" + Math.abs(today).toLocaleString("en-US")), `2g with income, First Visit shows Today's figure ($${today.toLocaleString("en-US")})`);
  }

  // ── 3. Budget: a debt minimum a bill pays is counted once ────────────────────────────────────
  {
    const base = { profile: { country: "CA" }, accounts: [{ id: "a1", name: "Chequing", type: "depository", balance: 2000 }],
      incomes: [{ id: 1, label: "Job", amount: "2500", freq: "biweekly" }], transactions: [], goals: [],
      debts: [{ id: "d1", name: "Visa", balance: "3000", min: "120", rate: "20" }, { id: "d2", name: "Car loan", balance: "9000", min: "350", rate: "6" }],
      bills: [{ id: "b1", name: "Rent", amount: "1400", freq: "monthly", dueDay: 1 }, { id: "b2", name: "Car payment", amount: "350", freq: "monthly", dueDay: 15, debtId: "d2" }] };
    let s = null;
    try { s = A.generateBudgetSuggestions(base); } catch (e) { t.ok(false, `3a generateBudgetSuggestions runs: ${describe(e)}`); }
    t.eq(s && Math.round(s.debtsMo), 120, "3a the car loan's $350 minimum is paid by the Car payment bill, so debt minimums are the Visa's $120 only");
    t.eq(s && s.fixedMo, 1400 + 350 + 120, "3b fixed commitments are $1,870: rent, the car payment once, the Visa minimum");
    const unlinked = { ...base, bills: base.bills.map(b => ({ ...b, debtId: undefined })) };
    t.eq(A.generateBudgetSuggestions(unlinked).debtsMo, 470, "3c with no bill linked, both minimums count");
    const fn = app.slice(app.indexOf("function generateBudgetSuggestions"), app.indexOf("function generateBudgetSuggestions") + 2500);
    t.ok(/unbilledDebtMinimums\(data\.debts, data\.bills\)/.test(fn), "3d it reads unbilledDebtMinimums, not a copy of the rule");
  }

  // ── 4. The coach gets the figure Today shows ─────────────────────────────────────────────────
  {
    t.eq(typeof DE.coachSafeToSpendLine, "function", "4a decisionEngine builds the coach's safe-to-spend line");
    if (typeof DE.coachSafeToSpendLine === "function") {
      const d = demo("CA", new Date(TODAY));
      const raw = SafeSpendEngine.calculate(d, TODAY).safeAmount;
      const line = DE.coachSafeToSpendLine(d, TODAY);
      t.eq(DE.displayedSafeToSpend(d, TODAY), 1944, "4b (Today shows $1,944 for the CA demo on Sep 29 2026)");
      t.ok(line.includes("$1,944 ") && !line.includes(raw.toFixed(2)), `4c the coach is told $1,944, not the raw ${raw.toFixed(2)}: "${line.slice(0, 60)}"`);
      const noInc = DE.coachSafeToSpendLine({ ...d, incomes: [] }, TODAY);
      t.ok(/none shown/.test(noInc) && !/\$\d/.test(noInc), "4d with no income Today shows no figure, and the coach is told none, not a number");
      const noCash = DE.coachSafeToSpendLine({ ...d, accounts: d.accounts.filter(a => !["checking", "savings", "depository"].includes(a.type)) }, TODAY);
      t.ok(/none shown/.test(noCash), "4e …nor with no cash account");
    }
    const coach = app.slice(app.indexOf("function AICoach("), app.indexOf("function AICoach(") + 12000);
    t.ok(coach.includes("${coachSafeToSpendLine(data)}"), "4f the coach prompt uses that line");
    t.ok(!/safeAmount/.test(coach), "4g …and reads no raw safeAmount");
  }

  // ── 5. The invest What-If names its assumption ───────────────────────────────────────────────
  {
    let V = null;
    try { V = loadApp(["investVerdictReason"]).investVerdictReason; } catch (e) { t.ok(false, `5a the invest verdict is its own function: ${String(e.message).split("\n")[0]}`); }
    if (V) {
      const result = { finalValue: 243994, totalGrowth: 171994 };
      const lines = [
        V({ isLumpSum: true, parsedAmount: 10000, initialPrincipal: 10000, monthlyContribution: 0, result }),
        V({ isLumpSum: false, parsedAmount: 200, initialPrincipal: 5000, monthlyContribution: 200, result }),
        V({ isLumpSum: false, parsedAmount: 200, initialPrincipal: 0, monthlyContribution: 200, result }),
      ];
      lines.forEach((l, i) => t.ok(l.includes("an assumed 7% a year, not a prediction"), `5${"bcd"[i]} verdict ${i + 1} says "an assumed 7% a year, not a prediction": "${l.slice(0, 70)}…"`));
      t.ok(lines.every(l => !/[–—]/.test(l)), "5e …with no em or en dash");
    }
    const inv = app.slice(app.indexOf("if (scenarioType === \"invest\")"), app.indexOf("// ── PURCHASE SCENARIO"));
    t.ok(!/at 7% for/.test(inv) && /investVerdictReason\(/.test(inv), "5f the invest scenario uses it, and no bare \"at 7% for\" is left");
  }

  // ── 6. Today's figure is unchanged ───────────────────────────────────────────────────────────
  {
    const want = { "CA 2026-09-29 0": 1944, "CA 2026-09-29 25": 973, "US 2026-09-29 0": 2415, "US 2026-09-29 25": 1422 };
    for (const [k, v] of Object.entries(want)) {
      const [c, iso, age] = k.split(" ");
      const now = new Date(iso + "T12:00:00"); const made = new Date(now); made.setDate(made.getDate() - Number(age));
      t.eq(safeToSpendView(SafeSpendEngine.calculate(demo(c, made), now)).headline, v, `6 Today, ${c} demo ${age} days old on ${iso}: $${v.toLocaleString("en-US")}`);
    }
  }

  t.summary("round2Fixes.test");
  setImmediate(() => process.exit(process.exitCode || 0));
})();
