// tests/forecastPaysDebtMinimums.test.cjs
// -----------------------------------------------------------------------------
// THE FORECAST PAYS DEBT MINIMUMS, ONCE (math-reconcile item 4).
//
// Safe to spend reserves every debt's minimum ($68 Visa + $280 car loan = $348 in the CA demo). The
// forecast subtracted bills and average daily spend but never a debt minimum, so every projected
// balance from the first of the month on was $348 a month too high.
//
// Now each debt's minimum leaves on its due day (the 1st of the month when it has none) as a named
// line in that day's bills, EXCEPT when a bill already is that debt's payment. That is decided by
// identity only (billPaysDebt: the bill's debtId names the debt by its id or its bank account id),
// never by amount, date or name. Card and loan payment transactions are kept out of the average
// daily spend, so a payment is never counted as both a minimum and spending.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");

(async () => {
  const t = create();
  const { ForecastEngine } = await import("../src/lib/forecastEngine.js");
  const { SafeSpendEngine } = await import("../src/lib/safeSpendEngine.js");
  const { safeToSpendView } = await import("../src/lib/safeToSpendView.js");
  const FC = await import("../src/lib/financialCalculations.js");
  const { forecastWalk } = await import("../src/lib/forecastWalk.js");
  const { billSrcKey } = await import("../src/lib/forecastEdits.js");
  const { demoAccountsFor, demoDebtsFor, buildDemoIncomes, buildDemoBills, buildDemoTxns } = await import("../src/lib/demoFixture.js");

  const NOW = new Date(2026, 8, 29, 12); // Tue Sep 29, 2026: the 90 days hold Oct 1, Nov 1 and Dec 1
  const demo = {
    profile: { name: "Alex", country: "CA" }, accounts: demoAccountsFor("CA"), debts: demoDebtsFor("CA"),
    incomes: buildDemoIncomes(NOW), bills: buildDemoBills(NOW), transactions: buildDemoTxns(NOW), demo: true,
  };
  const debtLines = (f) => (f.bills || []).filter(b => b._debt);

  // ── 1. The demo forecast subtracts the $348 of minimums once per month ────────────────────────
  const fc = ForecastEngine.generate(demo, 90, null, NOW);
  const noDebts = ForecastEngine.generate({ ...demo, debts: [] }, 90, null, NOW);
  const firsts = fc.forecast.filter(f => f.day > 0 && f.date.getDate() === 1);
  t.eq(firsts.map(f => FC.dateToISO(f.date)), ["2026-10-01", "2026-11-01", "2026-12-01"], "1a (the horizon holds three 1sts)");
  for (const f of firsts) {
    const lines = debtLines(f);
    t.eq(lines.map(b => [b.name, b.amount]), [["Visa card minimum payment", 68], ["Car Loan minimum payment", 280]],
         `1b ${FC.dateToISO(f.date)}: the Visa's $68 and the car loan's $280, named`);
  }
  t.eq(fc.forecast.filter(f => debtLines(f).length && f.date.getDate() !== 1).length, 0, "1c no minimum lands on any other day");
  const perMonth = {};
  for (const f of fc.forecast) for (const b of debtLines(f)) perMonth[FC.dateToISO(f.date).slice(0, 7)] = (perMonth[FC.dateToISO(f.date).slice(0, 7)] || 0) + b.amount;
  t.eq(perMonth, { "2026-10": 348, "2026-11": 348, "2026-12": 348 }, "1d exactly $348 a month, once");
  // Every day's balance is lower than it was without the minimums by $348 per 1st passed, no more.
  let exact = 0;
  for (const f of fc.forecast) {
    const passed = firsts.filter(x => x.day <= f.day).length;
    if (Math.abs((noDebts.forecast[f.day].balance - f.balance) - 348 * passed) < 1e-6) exact++;
  }
  t.eq(exact, fc.forecast.length, `1e on all ${fc.forecast.length} days the balance is lower by exactly $348 per 1st passed`);
  t.eq(fc.forecast[0].balance, noDebts.forecast[0].balance, "1f today's balance is untouched");

  // ── 2. No bill is subtracted twice ────────────────────────────────────────────────────────────
  let dupDays = 0;
  for (const f of fc.forecast) {
    const keys = (f.bills || []).map(b => b._debt ? `debt:${b.name}` : billSrcKey(b));
    if (new Set(keys).size !== keys.length) dupDays++;
  }
  t.eq(dupDays, 0, "2a no day carries the same bill or the same minimum twice");
  const rentDays = fc.forecast.filter(f => (f.bills || []).some(b => b.name === "Rent")).length;
  t.eq(rentDays, 3, "2b rent is subtracted once a month (three times in 90 days)");
  const out = fc.forecast.reduce((s, f) => s + (f.bills || []).reduce((a, b) => a + FC.num(b.amount), 0), 0);
  const outNo = noDebts.forecast.reduce((s, f) => s + (f.bills || []).reduce((a, b) => a + FC.num(b.amount), 0), 0);
  t.eq(Math.round((out - outNo) * 100) / 100, 1044, "2c across 90 days the only new money out is 3 x $348 = $1,044");

  // ── 3. Dedupe by identity only ────────────────────────────────────────────────────────────────
  const car = { ...demo.debts[1], id: "debt-car" };
  const visa = { ...demo.debts[0], account_id: "acct-visa" };
  const withIds = { ...demo, debts: [visa, car] };
  const linked = { name: "Auto loan", amount: "280", freq: "monthly", date: "1", nextDueDate: "2026-10-01", debtId: "debt-car" };
  const fcL = ForecastEngine.generate({ ...withIds, bills: [...demo.bills, linked] }, 90, null, NOW);
  const oct1 = fcL.forecast.find(f => FC.dateToISO(f.date) === "2026-10-01");
  t.eq(oct1.bills.map(b => b.name).filter(n => /Auto loan|Car Loan/.test(n)), ["Auto loan"], "3a a bill linked to the car loan (debtId) replaces its minimum: $280 once, not twice");
  t.eq(debtLines(oct1).map(b => b.name), ["Visa card minimum payment"], "3b …and the Visa's minimum still leaves");
  const byAcct = { name: "Visa payment", amount: "68", freq: "monthly", date: "1", nextDueDate: "2026-10-01", debtId: "acct-visa" };
  const fcA = ForecastEngine.generate({ ...withIds, bills: [...demo.bills, byAcct] }, 90, null, NOW);
  t.eq(debtLines(fcA.forecast.find(f => FC.dateToISO(f.date) === "2026-10-01")).map(b => b.name), ["Car Loan minimum payment"],
       "3c a bill linked by the debt's bank account id also replaces that minimum");
  // Same amount, same day, same name: none of those is identity.
  const lookalike = { name: "Car Loan", amount: "280", freq: "monthly", date: "1", nextDueDate: "2026-10-01" };
  const fcN = ForecastEngine.generate({ ...withIds, bills: [...demo.bills, lookalike] }, 90, null, NOW);
  const o1 = fcN.forecast.find(f => FC.dateToISO(f.date) === "2026-10-01");
  t.eq(o1.bills.filter(b => /Car Loan/.test(b.name)).length, 2, "3d a $280 bill named Car Loan on the 1st, with no link, is NOT treated as the minimum");
  t.eq(FC.billPaysDebt(lookalike, car), false, "3e billPaysDebt says no to amount, date and name alike");
  t.eq(FC.billPaysDebt(linked, car), true, "3f …and yes to a link by id");
  t.eq(FC.billPaysDebt({ debtId: "" }, { id: "" }), false, "3g an empty link links nothing");

  // Safe to spend applies the same identity rule, so the two screens reserve the same things.
  t.eq(SafeSpendEngine.calculate({ ...withIds, bills: [...demo.bills, linked] }, NOW).debtPayments, 68,
       "3h safe to spend stops reserving the car loan's minimum once a bill is its payment");

  // ── 4. Safe to spend on Today does not change ─────────────────────────────────────────────────
  const ss = SafeSpendEngine.calculate(demo, NOW);
  const view = safeToSpendView(ss);
  t.eq(view.rows.map(r => r.display), [3083, 65, 348, 435, 291], "4a Today: $3,083 - 65 - 348 - 435 - 291");
  t.eq(view.headline, 1944, "4b = $1,944");

  // ── 5. A payment of a minimum the forecast pays is not also daily spend ───────────────────────
  // Only the payment that IS a minimum is taken out: a card, loan or transfer payment whose amount
  // matches a minimum the forecast subtracts (within $2 or 5%). Everything else is exactly as it was
  // on main, because for a statement import a card paid in full, a loan with no debt entered, or a
  // bill paid by online banking IS the household's spending, and nothing else would count it.
  const day = (n) => FC.dateToISO(new Date(2026, 8, n, 12));
  const spend = [
    { id: "s1", name: "Loblaws", amount: 60, cat: "Groceries", date: day(1) },
    { id: "s2", name: "Tim Hortons", amount: 5, cat: "Coffee & Dining", date: day(15) },
    { id: "s3", name: "Winners", amount: 40, cat: "Shopping", date: day(28) },
  ];
  const minPayments = [
    { id: "p1", name: "MB-VISA 4521", amount: 68, cat: "Other", date: day(3) },                 // the Visa minimum
    { id: "p2", name: "TD AUTO FINANCE", amount: 280, cat: "Other", date: day(5) },             // the car loan minimum
    { id: "p3", name: "NAVIENT", amount: 280.5, cat: "Other", date: day(6) },                   // a lender name, within tolerance
    { id: "p4", name: "Transfer to loan", amount: 68, cat: "Other", date: day(7), isTransfer: true },
  ];
  const realSpending = [
    { id: "r1", name: "PAYMENT - VISA 4521", amount: 1200, cat: "Other", date: day(8) },        // card paid in full
    { id: "r2", name: "TD AUTO FINANCE", amount: 450, cat: "Other", date: day(9) },             // a loan with no matching minimum
    { id: "r3", name: "ONLINE BILL PAYMENT - ROGERS", amount: 95, cat: "Other", date: day(10) },// a bill paid by online banking
  ];
  const est = (txns, debts = demo.debts) => FC.FinancialCalcEngine.avgDailySpendEstimate({ transactions: txns, debts, bills: [] });
  t.eq(est([...spend, ...minPayments]), est(spend), "5a a payment that matches a minimum the forecast pays adds nothing to the daily spend");
  t.eq(est([...spend, ...realSpending]), (60 + 5 + 40 + 1200 + 450 + 95) / 27, "5b a card paid in full, an unmatched loan payment and an online-banking bill payment still count");
  t.eq(est([...spend, ...minPayments], []), (60 + 5 + 40 + 68 + 280 + 280.5 + 68) / 27,
       "5c with no debts entered, nothing is paid as a minimum, so nothing is taken out of the spend");
  t.eq(FC.isLoanPayment({ name: "TD AUTO FINANCE", amount: 280 }) && FC.isLoanPayment({ name: "Student loan payment", amount: 195 }), true, "5d TD Auto Finance and a student loan payment are loan payments");
  t.eq(FC.isLoanPayment(spend[0]) || FC.isLoanPayment({ name: "Loan refund", amount: -100 }), false, "5e groceries, and money coming in, are not");
  t.eq(FC.FinancialCalcEngine.avgDailySpendEstimate(demo), 33.46171428571429, "5f the demo's own daily spend is unchanged ($33.46, to the last digit it had before)");
  // A linked bill takes the debt off the minimum list, so its payment is ordinary spending again.
  const carId = { ...demo.debts[1], id: "debt-car" };
  t.eq(FC.FinancialCalcEngine.avgDailySpendEstimate({ transactions: [...spend, minPayments[1]], debts: [demo.debts[0], carId],
       bills: [{ name: "Auto loan", amount: "280", freq: "monthly", date: "1", debtId: "debt-car" }] }),
       (60 + 5 + 40 + 280) / 27, "5g once a bill pays the car loan, the forecast takes no minimum for it, so its payment is not taken out either");

  // ── 6. The drill-down still adds up on a day a minimum leaves ─────────────────────────────────
  const oct = fc.forecast.find(f => FC.dateToISO(f.date) === "2026-10-01");
  const w = forecastWalk({ opening: fc.forecast[oct.day - 1].balance, income: oct.income, bills: oct.bills,
                           avgDailySpend: FC.FinancialCalcEngine.avgDailySpend(demo), closing: oct.balance });
  t.ok(w.reconciles && w.spendDriftCents <= 1, "6a Oct 1: opening - bills - minimums - daily spend = closing, to the cent");
  t.eq(w.rows.filter(r => /minimum payment/.test(r.label)).map(r => r.value), ["$68.00", "$280.00"], "6b …and the minimums are named rows in it");

  // ── 7. Day 0 and the due day ──────────────────────────────────────────────────────────────────
  const ON_FIRST = new Date(2026, 9, 1, 12);
  const fc1 = ForecastEngine.generate({ ...demo, incomes: buildDemoIncomes(ON_FIRST), bills: buildDemoBills(ON_FIRST), transactions: buildDemoTxns(ON_FIRST) }, 40, null, ON_FIRST);
  t.eq(debtLines(fc1.forecast[0]).length, 0, "7a on the 1st itself nothing is subtracted for today (today's balance already reflects it)");
  t.eq(fc1.forecast.filter(f => debtLines(f).length).map(f => FC.dateToISO(f.date)), ["2026-11-01"], "7b …the next minimum leaves on Nov 1");
  const due15 = ForecastEngine.generate({ ...demo, debts: [{ ...demo.debts[0], dueDay: "15" }] }, 50, null, NOW);
  t.eq(due15.forecast.filter(f => debtLines(f).length).map(f => FC.dateToISO(f.date)), ["2026-10-15", "2026-11-15"], "7c a debt with a due day pays on that day");
  const due31 = ForecastEngine.generate({ ...demo, debts: [{ ...demo.debts[0], dueDay: "31" }] }, 40, null, NOW);
  t.eq(due31.forecast.filter(f => debtLines(f).length).map(f => FC.dateToISO(f.date)), ["2026-09-30", "2026-10-31"], "7d due day 31 clamps to month end (Sep 30, Oct 31)");

  // ── 8. Today's "Due soon" lists the minimums Watch shows in the same window ───────────────────
  {
    const ssNow = SafeSpendEngine.calculate(demo, NOW);
    t.eq(ssNow.minimumsDueSoon.map(m => [m.name, m.amount, FC.dateToISO(m.date)]),
         [["Visa card minimum payment", 68, "2026-10-01"], ["Car Loan minimum payment", 280, "2026-10-01"]],
         "8a Sep 29: the two minimums leaving Oct 1 are due soon");
    const dueSoon = ssNow.upcomingBills + ssNow.minimumsDueSoon.reduce((s, m) => s + m.amount, 0);
    t.eq(dueSoon, 413, "8b Due soon = the $65 phone bill + $348 of minimums = $413");
    // The same money out as the forecast shows over those days.
    const { daysToNextDepositFor } = await import("../src/lib/forecastEdits.js");
    const horizon = daysToNextDepositFor(demo, NOW); // the window safe to spend reserves over
    t.eq(horizon, 13, "8c0 (the next deposit is 13 days out)");
    const watchOut = fc.forecast.filter(f => f.day >= 1 && f.day <= horizon).reduce((s, f) => s + (f.bills || []).reduce((a, b) => a + FC.num(b.amount), 0), 0);
    t.eq(watchOut, dueSoon, "8c …which is exactly what Watch shows leaving before the next deposit");
    t.eq(ssNow.debtPayments, 348, "8d (the reservation is unchanged: $348)");
    const app = require("fs").readFileSync(require("path").join(__dirname, "..", "src", "App.jsx"), "utf8");
    t.ok(/const dueSoonTotal = soonTotal \+ \(_ss\.minimumsDueSoon \|\| \[\]\)\.reduce/.test(app) && /label:"Due soon",value:`\$\$\{\(dueSoonTotal\|\|0\)/.test(app),
         "8e the Today card shows bills plus the minimums due in the window");
  }

  t.summary("forecastPaysDebtMinimums.test");
})();
