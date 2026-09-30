// tests/billDebtLink.test.cjs
// -----------------------------------------------------------------------------
// A BILL CAN SAY WHICH DEBT IT PAYS (math-reconcile review, HIGH 1).
//
// The forecast pays each debt's minimum, except a debt a bill already pays, and that is decided by
// identity only: the bill's debtId names the debt. Nothing could set debtId, so a household with a
// "Car Payment" bill and a Car Loan debt was charged twice. Now:
//   - every debt has a stable link key (debtLinkKey: its id, or its bank account id); debts that
//     had neither are given an id once (withDebtIds), by a backfill in App and at creation;
//   - Add Bill asks "Which debt does this pay?" for the debt templates (Car Payment, Mortgage,
//     Credit Card, Student Loan), and every recurring bill row can be linked afterwards;
//   - a linked bill is the debt's payment everywhere: the forecast, safe to spend's reservation,
//     Today's Due soon and the daily-spend rule all read the same unbilledDebtMinimums.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");

(async () => {
  const t = create();
  const FC = await import("../src/lib/financialCalculations.js");
  const { ForecastEngine } = await import("../src/lib/forecastEngine.js");
  const { SafeSpendEngine } = await import("../src/lib/safeSpendEngine.js");
  const { safeToSpendView } = await import("../src/lib/safeToSpendView.js");
  const { demoAccountsFor, demoDebtsFor, buildDemoIncomes, buildDemoBills, buildDemoTxns } = await import("../src/lib/demoFixture.js");

  // ── 1. Every debt gets a stable link key ──────────────────────────────────────────────────────
  let n = 0;
  const makeId = () => `debt-test-${++n}`;
  const mixed = [
    { name: "Visa card", balance: "3420", min: "68" },                       // no id, no account
    { name: "Car Loan", balance: "8200", min: "280", id: "car-1" },           // has an id
    { name: "Bank card", balance: "900", min: "", fromBank: true, account_id: "acct-7" }, // bank account id
  ];
  const withIds = FC.withDebtIds(mixed, makeId);
  t.eq(withIds.map(FC.debtLinkKey), ["debt-test-1", "car-1", "acct-7"], "1a a debt with neither gets an id; an id or a bank account id is kept");
  t.eq(FC.withDebtIds(withIds, makeId).map(FC.debtLinkKey), ["debt-test-1", "car-1", "acct-7"], "1b …and running it again changes nothing (stable)");
  t.ok(FC.withDebtIds(withIds, makeId) === withIds, "1c …not even the array, so a backfill can tell there is nothing to write");
  t.eq(FC.debtLinkKey({ name: "x" }), null, "1d no id and no account: no key yet");
  t.ok(/^debt-[a-z0-9]+-[a-z0-9]+$/.test(FC.newDebtId()) && FC.newDebtId() !== FC.newDebtId(), "1e newDebtId makes distinct ids");

  // ── 2. A linked bill is the debt's payment, everywhere ────────────────────────────────────────
  const NOW = new Date(2026, 8, 29, 12);
  const debts = FC.withDebtIds(demoDebtsFor("CA"), makeId);
  const [visa, car] = debts;
  const base = {
    profile: { name: "Alex", country: "CA" }, accounts: demoAccountsFor("CA"), debts,
    incomes: buildDemoIncomes(NOW), bills: buildDemoBills(NOW), transactions: buildDemoTxns(NOW), demo: true,
  };
  const carPayment = { name: "Car Payment", amount: "280", date: "1", type: "fixed", freq: "monthly", manuallyAdded: true };
  const unlinked = { ...base, bills: [...base.bills, carPayment] };
  const linked = { ...base, bills: [...base.bills, { ...carPayment, debtId: FC.debtLinkKey(car) }] };
  const oct1 = (d) => ForecastEngine.generate(d, 40, null, NOW).forecast.find(f => FC.dateToISO(f.date) === "2026-10-01");
  const carLines = (f) => f.bills.filter(b => /Car/.test(b.name)).map(b => b.name);
  t.eq(carLines(oct1(unlinked)), ["Car Payment", "Car Loan minimum payment"], "2a unlinked: the car payment is counted twice (the case this fixes)");
  t.eq(carLines(oct1(linked)), ["Car Payment"], "2b linked: counted once, as the bill");
  t.eq(oct1(linked).bills.filter(b => b._debt).map(b => b.name), ["Visa card minimum payment"], "2c …and the Visa's minimum still leaves");
  const ssU = SafeSpendEngine.calculate(unlinked, NOW), ssL = SafeSpendEngine.calculate(linked, NOW);
  t.eq([ssU.debtPayments, ssL.debtPayments], [348, 68], "2d safe to spend stops reserving the car loan's minimum once the bill is linked");
  t.eq(ssL.upcomingBills - ssU.upcomingBills, 0, "2e (the bill itself is reserved either way)");
  t.eq(safeToSpendView(ssL).headline - safeToSpendView(ssU).headline, 280, "2f so the double-counted $280 comes back to safe to spend");
  const dueSoon = (ss) => ss.upcomingBills + ss.minimumsDueSoon.reduce((s, m) => s + m.amount, 0);
  t.eq(dueSoon(ssL), 65 + 280 + 68, "2g Due soon lists the car payment once: $65 phone + $280 car payment + $68 Visa minimum");
  t.eq(FC.billPaysDebt({ debtId: FC.debtLinkKey(visa) }, visa), true, "2h billPaysDebt matches a link made with debtLinkKey");
  t.eq(FC.billPaysDebt({ debtId: "acct-7" }, withIds[2]), true, "2i …including a bank debt, by its account id");

  // ── 3. The screens: the live "Your bills" sheet (ManualBillForm) ──────────────────────────────
  // (BillManager, with the old bill templates, is not rendered anywhere, so the link lives here.)
  const app = fs.readFileSync(path.join(__dirname, "..", "src", "App.jsx"), "utf8");
  const mbf = app.slice(app.indexOf("function ManualBillForm("), app.indexOf("function PlanAhead("));
  t.eq((app.match(/<BillManager\b/g) || []).length, 0, "3a (BillManager is not rendered anywhere; the bills sheet is ManualBillForm)");
  t.ok(/const \[payDebt, setPayDebt\] = useState\(""\);/.test(mbf), "3b the add/edit form keeps the chosen debt");
  t.ok(/recurring && linkableDebts\.length > 0 && \(/.test(mbf) && /Which debt does this pay\?/.test(mbf),
       "3c …and asks which debt a recurring bill pays, when there are debts");
  t.ok(/debtId: recurring \? payDebt : "",/.test(mbf), "3d saving writes the link (and an empty one clears it)");
  t.ok(/setPayDebt\(b\.debtId\|\|""\)/.test(mbf) && /setVariable\(false\); setPayDebt\(""\);/.test(mbf), "3e editing shows the current link; reset clears it");
  t.ok(/onChange=\{e=>linkObserved\(x\.i, e\.target\.value\)\}/.test(mbf) && /x === i \? \{ \.\.\.b, debtId: key \} : b/.test(mbf),
       "3f every bill detected from the bank can be linked, in place");
  t.ok((mbf.match(/<option key=\{k\} value=\{k\}>\{d\.name \|\| "Debt"\}<\/option>/g) || []).length >= 2, "3g the options are the debts, by their link key");
  t.ok(/withDebtIds\(prev\.debts\)/.test(app) && /\(appData\?\.debts \|\| \[\]\)\.some\(d => !debtLinkKey\(d\)\)/.test(app),
       "3h App gives any debt without a key an id, once");
  t.ok(/debts:\[\.\.\.\(prev\.debts\|\|\[\]\), \{\.\.\.form, id: newDebtId\(\)\}\]/.test(app), "3i a debt added on the Debts screen gets its id at once");
  const around = mbf.slice(mbf.indexOf("Which debt does this pay?") - 600, mbf.indexOf("Which debt does this pay?") + 900);
  t.ok(!/[\u2013\u2014]/.test(around), "3j no dash in the new copy");

  t.summary("billDebtLink.test");
})();
