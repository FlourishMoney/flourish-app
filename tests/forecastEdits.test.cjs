// tests/forecastEdits.test.cjs
// -----------------------------------------------------------------------------
// The household corrects the forecast (src/lib/forecastEdits.js):
//   • tap a projected deposit or bill: change amount, move date, skip; "Just this one" or "From this
//     date on"; "Reset to Flourish's estimate"
//   • "My pay varies": the lower quartile of recent pays (three or more), else the amount they expect,
//     shown as a range; safe-to-spend and every projection use the low end
//   • "Add expected money in or out": once, monthly, quarterly, yearly, labelled by name
//   • the Watch "Est. daily spend" is theirs to set, and to reset
// and the rules:
//   • keyed by source id plus date, never by amount
//   • projections only: bank transactions are never altered, and a real deposit or bill that arrives
//     replaces the projection for that occurrence
//   • safe-to-spend, the forecast, the health score, the money meeting snapshot and the coach snapshot
//     all recompute from the corrected figures
//   • household data (appData), so it syncs and exports like incomes and bills
//
// Frozen dates only.
// -----------------------------------------------------------------------------
"use strict";

const fs = require("fs");
const path = require("path");
const { create } = require("./_runner.cjs");

(async () => {
  const E = await import("../src/lib/forecastEdits.js");
  const { ForecastEngine } = await import("../src/lib/forecastEngine.js");
  const { SafeSpendEngine } = await import("../src/lib/safeSpendEngine.js");
  const { FinancialCalcEngine, toMonthly } = await import("../src/lib/financialCalculations.js");
  const { depositLines, billLines, skippedLines } = await import("../src/lib/forecastView.js");
  const { forecastWalk } = await import("../src/lib/forecastWalk.js");
  const { calcHealthScore } = await import("../src/lib/decisionEngine.js");
  const { buildMeetSnapshot } = await import("../src/lib/meetSnapshot.js");
  const { demoCoachExchanges } = await import("../src/lib/demoCoach.js");
  const { suggestedDailyView } = await import("../src/lib/suggestedDaily.js");
  const { buildDbBlob } = await import("../src/lib/persistence.js");
  const t = create();

  const TODAY = new Date(2026, 2, 10, 12, 0, 0); // Tue Mar 10 2026
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const ago = (n, from = TODAY) => { const d = new Date(from); d.setDate(d.getDate() - n); return iso(d); };
  const chq = (b) => [{ id: "chq", name: "Chequing", type: "depository", subtype: "checking", balance: b }];
  // Job: $2,000 every two weeks, last paid Mar 6 (so Mar 20, Apr 3, Apr 17 ...). CCB $560 on the 20th.
  // Rent $1,500 on the 1st (has an id). Phone $65 on the 15th (no id: keyed by its name).
  const base = () => ({
    accounts: chq(3000),
    incomes: [
      { id: 1, label: "Job", amount: "2000", freq: "biweekly" },
      { id: 2, label: "Canada Child Benefit", amount: "560", freq: "monthly", anchorDay: 20 },
    ],
    bills: [
      { id: "b1", name: "Rent", amount: "1500", freq: "monthly", nextDueDate: "2026-04-01", date: "1" },
      { name: "Phone", amount: "65", freq: "monthly", nextDueDate: "2026-03-15", date: "15" },
    ],
    debts: [],
    transactions: [
      { id: "p1", date: "2026-02-20", name: "ACME PAYROLL", amount: -2000, cat: "Income" },
      { id: "p2", date: "2026-03-06", name: "ACME PAYROLL", amount: -2000, cat: "Income" },
      { id: "s1", date: "2026-03-08", name: "LOBLAWS", amount: 90, cat: "Groceries" },
      { id: "s2", date: "2026-02-25", name: "LOBLAWS", amount: 110, cat: "Groceries" },
    ],
  });
  const fc = (data, days = 60, today = TODAY) => ForecastEngine.generate(data, days, null, today).forecast;
  const on = (forecast, isoDate) => forecast.find(e => iso(e.date) === isoDate);
  const occOf = (data, srcKey, isoDate, days = 60, today = TODAY) =>
    [...E.incomeOccurrences(data, today, days), ...E.billOccurrences(data, today, days)].find(o => o.srcKey === srcKey && iso(o.originalDate) === isoDate);
  const withEdits = (data, fe) => ({ ...data, forecastEdits: fe });
  const depOf = (ev, label) => (ev ? ev.deposits : []).filter(d => d.label === label).map(d => d.amount);

  // ── Sanity: the baseline schedule ──────────────────────────────────────────────────────────────
  {
    const f = fc(base());
    t.eq(depOf(on(f, "2026-03-20"), "Job"), [2000], "baseline: Job pays $2,000 on Mar 20");
    t.eq(depOf(on(f, "2026-04-03"), "Job"), [2000], "…and Apr 3");
    t.eq(on(f, "2026-03-15").bills.map(b => b.name), ["Phone"], "…Phone is due Mar 15");
  }

  // ── 1. "Just this one" vs "From this date on" ──────────────────────────────────────────────────
  {
    const d = base();
    const mar20 = occOf(d, "income:1", "2026-03-20");
    let fe = E.editOccurrence(undefined, mar20, "one", { amount: 2500 });
    let f = fc(withEdits(d, fe));
    t.eq(depOf(on(f, "2026-03-20"), "Job"), [2500], "just this one: Mar 20 becomes $2,500");
    t.eq(depOf(on(f, "2026-04-03"), "Job"), [2000], "just this one: Apr 3 is untouched");
    t.ok(on(f, "2026-03-20").deposits.find(x => x.label === "Job").edited, "the edited deposit carries its Edited flag");
    t.eq(depositLines(on(f, "2026-03-20")).find(l => l.label === "Job").edited, true, "…and so does its display line");

    const apr3 = occOf(d, "income:1", "2026-04-03");
    fe = E.editOccurrence(undefined, apr3, "series", { amount: 2300 });
    f = fc(withEdits(d, fe));
    t.eq(depOf(on(f, "2026-03-20"), "Job"), [2000], "from this date on (Apr 3): Mar 20 stays $2,000");
    t.eq([...depOf(on(f, "2026-04-03"), "Job"), ...depOf(on(f, "2026-04-17"), "Job"), ...depOf(on(f, "2026-05-01"), "Job")], [2300, 2300, 2300],
         "from this date on: Apr 3, Apr 17 and May 1 are all $2,300 (a raise)");

    fe = E.editOccurrence(undefined, mar20, "one", { date: "2026-03-19" });
    f = fc(withEdits(d, fe));
    t.eq(depOf(on(f, "2026-03-19"), "Job"), [2000], "move just this one: the Mar 20 pay lands Mar 19");
    t.eq(depOf(on(f, "2026-03-20"), "Job"), [], "…and nothing lands on Mar 20");
    t.eq(depOf(on(f, "2026-04-03"), "Job"), [2000], "…and Apr 3 is where it was");

    fe = E.editOccurrence(undefined, apr3, "series", { date: "2026-04-02" });
    f = fc(withEdits(d, fe));
    t.eq([depOf(on(f, "2026-04-02"), "Job"), depOf(on(f, "2026-04-16"), "Job"), depOf(on(f, "2026-03-20"), "Job")], [[2000], [2000], [2000]],
         "move from this date on: every payday from Apr 3 moves a day earlier; Mar 20 does not");

    // Stacked: a date shift from Apr 3, then a raise from Apr 17, keeps the shift.
    fe = E.editOccurrence(fe, occOf(withEdits(d, fe), "income:1", "2026-04-17"), "series", { amount: 2600 });
    f = fc(withEdits(d, fe));
    t.eq([depOf(on(f, "2026-04-02"), "Job"), depOf(on(f, "2026-04-16"), "Job")], [[2000], [2600]], "a later change from a date on keeps the earlier shift");

    // Bills, with and without an id.
    const phone = occOf(d, "bill:name:phone", "2026-03-15");
    const rent = occOf(d, "bill:b1", "2026-04-01");
    t.ok(phone && rent, "a bill without an id is keyed by its name, one with an id by its id");
    fe = E.editOccurrence(E.editOccurrence(undefined, phone, "one", { amount: 80 }), rent, "series", { amount: 1600 });
    f = fc(withEdits(d, fe));
    t.eq(billLines(on(f, "2026-03-15")).map(b => [b.label, b.amount, b.edited]), [["Phone", 80, true]], "Phone just this one: $80, tagged Edited");
    t.eq([on(f, "2026-04-01").bills[0].amount, on(f, "2026-05-01").bills[0].amount], [1600, 1600], "Rent from Apr 1 on: $1,600 every month");
    t.eq(on(f, "2026-04-15").bills.find(b => b.name === "Phone").amount, "65", "Phone in April is back to its own $65");
  }

  // ── Keyed by source and date, never by amount ──────────────────────────────────────────────────
  {
    const d = base();
    d.incomes.push({ id: 3, label: "Rental", amount: "2000", freq: "monthly", anchorDay: 20 });
    const jobMar20 = occOf(d, "income:1", "2026-03-20");
    const f = fc(withEdits(d, E.editOccurrence(undefined, jobMar20, "one", { amount: 2500 })));
    t.eq(depOf(on(f, "2026-03-20"), "Job"), [2500], "two $2,000 deposits on the same day: editing Job changes Job");
    t.eq(depOf(on(f, "2026-03-20"), "Rental"), [2000], "…and leaves Rental alone");
    t.eq(Object.keys(E.editOccurrence(undefined, jobMar20, "one", { amount: 2500 }).one), ["income:1|2026-03-20"], "the edit is stored as source + original date");
  }

  // ── 2. Skip and reset ──────────────────────────────────────────────────────────────────────────
  {
    const d = base();
    const phone = occOf(d, "bill:name:phone", "2026-03-15");
    const ssBefore = SafeSpendEngine.calculate(d, TODAY);
    let fe = E.editOccurrence(undefined, phone, "one", { skip: true });
    let f = fc(withEdits(d, fe));
    t.eq(on(f, "2026-03-15").bills.length, 0, "skip just this one: no Phone on Mar 15");
    t.eq(skippedLines(on(f, "2026-03-15")).map(x => x.label), ["Phone"], "…but it is still shown, struck through, so it can be reset");
    t.eq(on(f, "2026-04-15").bills.map(b => b.name), ["Phone"], "…and April's Phone is still there");
    t.eq(on(fc(d), "2026-03-15").balance - on(f, "2026-03-15").balance, -65, "the balance from Mar 15 is $65 higher");
    const ssAfter = SafeSpendEngine.calculate(withEdits(d, fe), TODAY);
    t.eq(ssBefore.upcomingBills - ssAfter.upcomingBills, 65, "safe-to-spend stops reserving the skipped Phone bill");

    fe = E.resetOccurrence(fe, phone);
    f = fc(withEdits(d, fe));
    t.eq(on(f, "2026-03-15").bills.map(b => b.name), ["Phone"], "reset to Flourish's estimate: Phone is back");
    t.eq(fe.one, {}, "…and no edit is left behind");

    // A job ending: skip from a date on. Monthly income drops once the change starts this pay period.
    const mar20 = occOf(d, "income:1", "2026-03-20");
    fe = E.editOccurrence(undefined, mar20, "series", { skip: true });
    f = fc(withEdits(d, fe), 90);
    t.eq(f.filter(e => e.deposits.some(x => x.label === "Job")).length, 0, "skip from this date on: no Job deposits from Mar 20 on (a job ending)");
    t.eq(f.filter(e => e.deposits.some(x => x.label === "Canada Child Benefit")).length, 3, "…while the CCB carries on");
    t.approx(FinancialCalcEngine.cashFlow(withEdits(d, fe), {}, TODAY).monthlyIncome, 560, 0.01, "monthly income is now the CCB alone");

    const reset = E.resetOccurrence(fe, occOf(withEdits(d, fe), "income:1", "2026-04-17"));
    t.eq(reset.series, {}, "resetting any later date of that change removes the change (the sheet says so)");
    t.eq(fc(withEdits(d, reset)).filter(e => e.deposits.some(x => x.label === "Job")).length, 4, "and the Job pays are all back");
  }

  // ── 3. "My pay varies": a range, and the low end everywhere ────────────────────────────────────
  {
    const shifts = (extra = {}) => ({
      accounts: chq(1500), bills: [], debts: [],
      incomes: [{ id: 5, label: "Shifts", amount: "1000", freq: "biweekly", isVariable: true, ...extra }],
      transactions: [800, 1400, 950, 1200, 1000].map((a, i) => ({ id: `v${i}`, date: ago(3 + 14 * i), name: "CITY HOSPITAL PAYROLL", amount: -a, cat: "Income" })),
    });
    const d = shifts();
    const vp = E.variablePay(d.incomes[0], d, TODAY);
    t.eq([vp.basis, vp.n, vp.low, vp.high], ["recent", 5, 950, 1200], "five recent pays ($800 to $1,400): lower quartile $950, upper $1,200");
    const f = fc(d);
    const ev = f.find(e => e.deposits.some(x => x.label === "Shifts"));
    t.eq(ev.deposits.find(x => x.label === "Shifts").amount, 950, "the forecast plans on the low end, $950");
    const line = depositLines(ev).find(l => l.label === "Shifts");
    t.eq([line.low, line.high], [950, 1200], "and the row shows the range, $950 to $1,200");
    t.eq(E.nextDepositFor(d, TODAY).amount, 950, "the next deposit is quoted at the low end");
    const ss = SafeSpendEngine.calculate(d, TODAY);
    const horizon = E.daysToNextDepositFor(d, TODAY);
    t.eq(ss.savingsAlloc, Math.round(toMonthly(950, "biweekly") * 0.10 / 30 * horizon), "safe-to-spend's savings set-aside uses the low end");
    t.approx(FinancialCalcEngine.cashFlow(d, {}, TODAY).monthlyIncome, toMonthly(950, "biweekly"), 0.01, "monthly income (health score, coach) uses the low end");

    const few = shifts(); few.transactions = few.transactions.slice(0, 2);
    t.eq(E.variablePay(few.incomes[0], few, TODAY).basis, "needs-expected", "with fewer than three pays, Flourish asks for an expected amount");
    const expd = shifts({ expectedAmount: "700" }); expd.transactions = expd.transactions.slice(0, 2);
    t.eq([E.variablePay(expd.incomes[0], expd, TODAY).basis, E.nextDepositFor(expd, TODAY).amount], ["expected", 700], "and then plans on the $700 they expect");
    const off = shifts({ isVariable: false });
    t.eq(E.nextDepositFor(off, TODAY).amount, 1000, "turned off, it plans on the entered $1,000");
  }

  // ── 4. Expected money in or out, including a yearly repeat ─────────────────────────────────────
  {
    const d = base();
    let fe = E.upsertExpected(undefined, { name: "Car insurance", amount: 1200, direction: "out", date: "2026-04-15", repeat: "yearly" });
    fe = E.upsertExpected(fe, { name: "Tax refund", amount: 900, direction: "in", date: "2026-04-30", repeat: "once" });
    const f = fc(withEdits(d, fe), 420);
    const ins = f.filter(e => e.bills.some(b => b.name === "Car insurance")).map(e => iso(e.date));
    t.eq(ins, ["2026-04-15", "2027-04-15"], "a yearly item lands once a year, on its date, labelled by name");
    t.eq(billLines(on(f, "2026-04-15")).find(b => b.label === "Car insurance").expected, true, "it is marked as expected money out");
    const refundDay = on(f, "2026-04-30");
    t.eq(depositLines(refundDay).map(l => [l.label, l.amount]), [["Tax refund", 900]], "money in is labelled by its name");
    t.eq(refundDay.isPayday, false, "an expected refund is money in, but not payday");
    t.eq(f.filter(e => e.deposits.some(x => x.label === "Tax refund")).length, 1, "a once item happens once");
    const w = forecastWalk({ opening: on(f, "2026-04-29").balance, income: refundDay.income, deposits: depositLines(refundDay), bills: refundDay.bills,
                             avgDailySpend: FinancialCalcEngine.avgDailySpend(d), closing: refundDay.balance });
    t.ok(w.reconciles && w.rows.some(r => r.key === "income" && r.label === "Tax refund"), "the day's breakdown names it and still adds up");

    const q = E.upsertExpected(undefined, { name: "Quarterly tax instalment", amount: 400, direction: "out", date: "2026-03-31", repeat: "quarterly" });
    t.eq(fc(withEdits(d, q), 365).filter(e => e.bills.some(b => b.name === "Quarterly tax instalment")).map(e => iso(e.date)),
         ["2026-03-31", "2026-06-30", "2026-09-30", "2026-12-31"], "quarterly repeats every three months (and a 31st stays the month's last day)");
    const m = E.upsertExpected(undefined, { name: "Roommate share", amount: 700, direction: "in", date: "2026-01-31", repeat: "monthly" });
    t.eq(fc(withEdits(d, m), 90).filter(e => e.deposits.some(x => x.label === "Roommate share")).map(e => iso(e.date)),
         ["2026-03-31", "2026-04-30", "2026-05-31"], "monthly from Jan 31 lands on each month's last day from today on");

    const soon = E.upsertExpected(undefined, { name: "School trip", amount: 150, direction: "out", date: "2026-03-12", repeat: "once" });
    const s0 = SafeSpendEngine.calculate(d, TODAY), s1 = SafeSpendEngine.calculate(withEdits(d, soon), TODAY);
    t.eq(s1.upcomingBills - s0.upcomingBills, 150, "safe-to-spend reserves expected money out before the next payday");
    t.ok(s1.soonBills.some(b => b.name === "School trip"), "and lists it with the bills due soon");

    for (const bad of [{ name: "", amount: 5, direction: "in", date: "2026-04-01", repeat: "once" }, { name: "X", amount: 0, direction: "in", date: "2026-04-01", repeat: "once" },
                       { name: "X", amount: 5, direction: "sideways", date: "2026-04-01", repeat: "once" }, { name: "X", amount: 5, direction: "in", date: "2026-04-01", repeat: "weekly" }]) {
      t.eq(E.upsertExpected(undefined, bad).expected.length, 0, `an invalid item is refused (${JSON.stringify(bad).slice(0, 60)})`);
    }
    const id = fe.expected[0].id;
    const moved = E.editOccurrence(fe, occOf(withEdits(d, fe), `expected:${id}`, "2026-04-15", 400), "one", { amount: 1100 });
    t.eq(on(fc(withEdits(d, moved), 400), "2026-04-15").bills.find(b => b.name === "Car insurance").amount, 1100, "an expected item can be edited like any other");
    t.eq(E.removeExpected(moved, id).expected.map(x => x.name), ["Tax refund"], "and deleted, with its edits");
  }

  // ── 5. A real deposit or bill replaces its projection ──────────────────────────────────────────
  {
    // The CCB is due on the 20th and arrives two days early, on the 18th.
    const d = base();
    const mar18 = new Date(2026, 2, 18, 12);
    const early = { ...d, transactions: [...d.transactions, { id: "c1", date: "2026-03-18", name: "CANADA CHILD BENEFIT", amount: -560, cat: "Income" }] };
    t.eq(depOf(on(fc(d, 60, mar18), "2026-03-20"), "Canada Child Benefit"), [560], "sanity: without the real deposit, Mar 20 projects the CCB");
    t.eq(depOf(on(fc(early, 60, mar18), "2026-03-20"), "Canada Child Benefit"), [], "the real CCB on Mar 18 replaces the Mar 20 projection (no double count)");
    t.eq(depOf(on(fc(early, 60, mar18), "2026-04-20"), "Canada Child Benefit"), [560], "and April's is still projected");

    // An edited occurrence is replaced too.
    const ccbOcc = occOf(d, "income:2", "2026-03-20", 60, mar18);
    const editedEarly = withEdits(early, E.editOccurrence(undefined, ccbOcc, "one", { amount: 600 }));
    t.eq(depOf(on(fc(editedEarly, 60, mar18), "2026-03-20"), "Canada Child Benefit"), [], "an edited projection gives way to the real deposit");
    // A moved one: moved to Mar 25, but the real one came on Mar 20.
    const mar21 = new Date(2026, 2, 21, 12);
    const moved = { ...withEdits(d, E.editOccurrence(undefined, ccbOcc, "one", { date: "2026-03-25" })),
                    transactions: [...d.transactions, { id: "c2", date: "2026-03-20", name: "CANADA CHILD BENEFIT", amount: -560, cat: "Income" }] };
    t.eq(depOf(on(fc(moved, 60, mar21), "2026-03-25"), "Canada Child Benefit"), [], "a projection moved to Mar 25 disappears when the real one lands on Mar 20");
    t.eq(depOf(on(fc(withEdits(d, E.editOccurrence(undefined, ccbOcc, "one", { date: "2026-03-25" })), 60, mar21), "2026-03-25"), "Canada Child Benefit"), [560],
         "sanity: with no real deposit, the moved projection is still there");

    // A bill paid two days early.
    const mar14 = new Date(2026, 2, 14, 12);
    const paid = { ...d, transactions: [...d.transactions, { id: "b1", date: "2026-03-13", name: "PHONE", amount: 65, cat: "Utilities" }] };
    t.eq(on(fc(paid, 30, mar14), "2026-03-15").bills.length, 0, "a Phone bill paid on Mar 13 replaces its Mar 15 projection");
    t.eq(on(fc(d, 30, mar14), "2026-03-15").bills.length, 1, "sanity: unpaid, it is still projected");

    const txBefore = JSON.stringify(editedEarly.transactions);
    fc(editedEarly, 60, mar18); SafeSpendEngine.calculate(editedEarly, mar18);
    t.eq(JSON.stringify(editedEarly.transactions), txBefore, "edits never alter a bank transaction");
  }

  // ── 6. Est. daily spend: the household's figure, and reset ─────────────────────────────────────
  {
    const d = base();
    const est = FinancialCalcEngine.avgDailySpendEstimate(d);
    t.ok(est > 0, `sanity: Flourish estimates $${est.toFixed(2)}/day`);
    const fe = E.setDailySpend(undefined, 50);
    const dd = withEdits(d, fe);
    t.eq(FinancialCalcEngine.avgDailySpend(dd), 50, "their own figure replaces the estimate");
    t.eq(fc(dd)[1].expenses, 50, "every forecast day spends $50");
    const horizon = E.daysToNextDepositFor(d, TODAY);
    t.eq(SafeSpendEngine.calculate(dd, TODAY).safetyBuf, 50 * horizon, "and safe-to-spend's buffer is $50 a day to the next deposit");
    const reset = withEdits(d, E.setDailySpend(fe, null));
    t.eq(FinancialCalcEngine.avgDailySpend(reset), est, "reset to Flourish's estimate");
    t.eq(E.setDailySpend(undefined, -5).dailySpend, null, "a negative figure is refused");
  }

  // ── 7. Everything recomputes from the corrected figures ────────────────────────────────────────
  {
    const d = { ...base(), debts: [{ name: "Visa", balance: "3000", rate: "19.99", min: "60" }], accounts: chq(4000) };
    const mar20 = occOf(d, "income:1", "2026-03-20");
    const moved = withEdits(d, E.editOccurrence(undefined, mar20, "one", { date: "2026-03-24" }));
    t.eq(E.nextDepositFor(moved, TODAY).date.getDate(), 20, "sanity: the CCB still lands Mar 20, so the next deposit date holds");
    const onlyJob = { ...d, incomes: [d.incomes[0]] };
    const movedJob = withEdits(onlyJob, E.editOccurrence(undefined, occOf(onlyJob, "income:1", "2026-03-20"), "one", { date: "2026-03-24" }));
    t.eq([E.daysToNextDepositFor(onlyJob, TODAY), E.daysToNextDepositFor(movedJob, TODAY)], [10, 14], "moving the payday moves the next deposit: 10 days becomes 14");
    t.ok(SafeSpendEngine.calculate(movedJob, TODAY).safetyBuf > SafeSpendEngine.calculate(onlyJob, TODAY).safetyBuf, "safe-to-spend reserves the longer wait");
    t.eq(suggestedDailyView(500, onlyJob.incomes, onlyJob.transactions, TODAY, movedJob).daysLeft, 14, "the daily pace spreads over the corrected wait");

    const stopped = withEdits(d, E.editOccurrence(undefined, mar20, "series", { skip: true }));
    const h0 = calcHealthScore(d, {}, TODAY), h1 = calcHealthScore(stopped, {}, TODAY);
    t.ok(h1.score < h0.score, `the health score recomputes when the job stops (${h0.score} to ${h1.score})`);

    // buildMeetSnapshot reads the real clock (it takes no date), so this household is built around now.
    const now = new Date(); now.setHours(12, 0, 0, 0);
    const nowIso = (n) => { const x = new Date(now); x.setDate(x.getDate() + n); return iso(x); };
    const live = { accounts: chq(4000), bills: [], debts: [{ name: "Visa", balance: "3000", rate: "19.99", min: "60" }],
                   incomes: [{ id: 1, label: "Job", amount: "2000", freq: "biweekly" }],
                   transactions: [{ id: "p1", date: nowIso(-18), name: "ACME PAYROLL", amount: -2000, cat: "Income" },
                                  { id: "p2", date: nowIso(-4), name: "ACME PAYROLL", amount: -2000, cat: "Income" }] };
    const next = E.incomeOccurrences(live, now, 30).find(o => o.kind === "income");
    const liveMoved = withEdits(live, E.editOccurrence(undefined, next, "one", { date: nowIso(13) }));
    const q = (s) => (s.decisions && s.decisions[0] && s.decisions[0].question) || "";
    const q0 = q(buildMeetSnapshot(live)), q1 = q(buildMeetSnapshot(liveMoved));
    const label = (n) => { const x = new Date(now); x.setDate(x.getDate() + n); return x.toLocaleDateString("en-CA", { month: "short", day: "numeric" }); };
    t.ok(q0.includes(label(10)) && q1.includes(label(13)), `the money meeting snapshot reads the corrected payday ("${q0}" then "${q1}")`);

    const coach0 = JSON.stringify(demoCoachExchanges(onlyJob, TODAY)), coach1 = JSON.stringify(demoCoachExchanges(movedJob, TODAY));
    t.ok(coach0 !== coach1, "the coach snapshot (demo coach) recomputes from the corrected payday");
  }

  // ── 8. Household data: synced and exported with incomes and bills ──────────────────────────────
  {
    const fe = E.upsertExpected(E.setDailySpend(undefined, 40), { name: "Gift", amount: 100, direction: "in", date: "2026-04-01", repeat: "once" });
    const blob = buildDbBlob({ onboarded: true, household: null, isPremium: false, checkInBonus: 0,
                               appData: { incomes: [], forecastEdits: fe, depositDecisions: { x: { reason: "gift" } }, depositRules: { "jamie": { reason: "shared" } } } },
                             { userId: "u1", nowIso: "2026-03-10T12:00:00Z" });
    const a = blob.core.appData;
    t.ok(a.forecastEdits && a.forecastEdits.dailySpend === 40 && a.forecastEdits.expected.length === 1 && a.depositDecisions.x && a.depositRules.jamie,
         "the synced blob carries forecastEdits, depositDecisions and depositRules in the household's appData");
    const app = fs.readFileSync(path.join(__dirname, "../src/App.jsx"), "utf8");
    const exp = app.slice(app.indexOf("const exportMyData"), app.indexOf("const exportMyData") + 2500);
    t.ok(/forecastEdits: data\.forecastEdits/.test(exp) && /depositDecisions: data\.depositDecisions/.test(exp) && /depositRules: data\.depositRules/.test(exp),
         "the data export includes the corrections");
  }

  // ── 10. Review round: the cases that broke ─────────────────────────────────────────────────────
  {
    const sep = (m, d) => new Date(2026, m - 1, d, 12);
    // (a) One real deposit belongs to one income. Globex ($1,950, every two weeks) paid Sep 26 must not
    //     cancel Acme's $2,000 payday on Oct 1.
    const two = { accounts: chq(2000), bills: [], debts: [],
      incomes: [{ id: 1, label: "Acme", amount: "2000", freq: "monthly", anchorDay: 1 }, { id: 2, label: "Globex", amount: "1950", freq: "biweekly" }],
      transactions: [{ id: "g1", date: "2026-09-12", name: "GLOBEX PAYROLL DEPOSIT", amount: -1950, cat: "Income" },
                     { id: "g2", date: "2026-09-26", name: "GLOBEX PAYROLL DEPOSIT", amount: -1950, cat: "Income" }] };
    t.eq(depOf(on(fc(two, 30, sep(9, 28)), "2026-10-01"), "Acme"), [2000], "a deposit from one job never cancels another job's payday");
    t.eq(E.daysToNextDepositFor(two, sep(9, 28)), 3, "so the next deposit is Acme's, in 3 days");

    // (b) A "from this date on" shift is applied once, even after the shifted pay arrives and anchors.
    const fri = { accounts: chq(2000), bills: [], debts: [], incomes: [{ id: 1, label: "Job", amount: "2000", freq: "biweekly" }],
      transactions: [{ id: "p1", date: "2026-09-18", name: "ACME PAYROLL", amount: -2000, cat: "Income" }] };
    const oct2 = occOf(fri, "income:1", "2026-10-02", 60, sep(9, 20));
    const shifted = withEdits(fri, E.editOccurrence(undefined, oct2, "series", { date: "2026-10-05" }));
    t.eq(E.incomeOccurrences(shifted, sep(9, 20), 40).filter(o => !o.skipped).map(o => iso(o.date)), ["2026-10-05", "2026-10-19"], "Friday pay moved to Monday from Oct 2");
    const arrived = { ...shifted, transactions: [...shifted.transactions, { id: "p2", date: "2026-10-05", name: "ACME PAYROLL", amount: -2000, cat: "Income" }] };
    t.eq(E.incomeOccurrences(arrived, sep(10, 6), 30).filter(o => !o.skipped).map(o => iso(o.date)), ["2026-10-19", "2026-11-02"],
         "after the Monday pay arrives, the next ones are still Mondays two weeks apart (not three days later again)");

    // (c) Moved later, then its first date passes: still projected until the real one arrives.
    const oneOff = { accounts: chq(3000), incomes: [], debts: [], transactions: [],
      bills: [{ id: "x", name: "Roof repair", amount: "900", type: "one_off", isoDate: "2026-09-26" }] };
    const roof = occOf(oneOff, "bill:x", "2026-09-26", 30, sep(9, 24));
    const roofMoved = withEdits(oneOff, E.editOccurrence(undefined, roof, "one", { date: "2026-10-05" }));
    t.eq(on(fc(roofMoved, 30, sep(9, 27)), "2026-10-05").bills.map(b => b.name), ["Roof repair"], "a one-off bill moved later survives its original date");
    t.eq(SafeSpendEngine.calculate(roofMoved, sep(9, 27)).upcomingBills >= 0, true, "sanity: safe-to-spend runs");
    let fe = E.upsertExpected(undefined, { name: "Refund", amount: 700, direction: "in", date: "2026-09-26", repeat: "once" });
    const refund = { accounts: chq(3000), incomes: [], bills: [], debts: [], transactions: [], forecastEdits: fe };
    const rOcc = E.incomeOccurrences(refund, sep(9, 24), 30).find(o => o.kind === "expected");
    const refundMoved = withEdits(refund, E.editOccurrence(fe, rOcc, "one", { date: "2026-10-05" }));
    t.eq(depOf(on(fc(refundMoved, 30, sep(9, 27)), "2026-10-05"), "Refund"), [700], "an expected item moved later survives its original date");

    // (d) Resetting a "just this one" edit on top of a raise keeps the raise.
    const d = base();
    let raise = E.editOccurrence(undefined, occOf(d, "income:1", "2026-03-20"), "series", { amount: 2500 });
    raise = E.editOccurrence(raise, occOf(withEdits(d, raise), "income:1", "2026-04-17"), "one", { amount: 4000 });
    const after = E.resetOccurrence(raise, occOf(withEdits(d, raise), "income:1", "2026-04-17"));
    const f = fc(withEdits(d, after));
    t.eq([depOf(on(f, "2026-04-03"), "Job"), depOf(on(f, "2026-04-17"), "Job")], [[2500], [2500]], "reset of a one-off on top of a raise returns it to the raise");

    // (e) An edited occurrence of a bill already paid this month is still reserved by safe-to-spend.
    const hydro = { accounts: chq(3000), incomes: [{ id: 1, label: "Job", amount: "2000", freq: "biweekly" }], debts: [],
      bills: [{ id: "h", name: "Hydro", amount: "120", freq: "monthly", nextDueDate: "2026-10-03", date: "3" }],
      transactions: [{ id: "p1", date: "2026-09-18", name: "ACME PAYROLL", amount: -2000, cat: "Income" },
                     { id: "h1", date: "2026-09-03", name: "HYDRO", amount: 120, cat: "Utilities" }] };
    const hOcc = occOf(hydro, "bill:h", "2026-10-03", 30, sep(9, 25));
    const hMoved = withEdits(hydro, E.editOccurrence(undefined, hOcc, "one", { date: "2026-09-29" }));
    t.eq(SafeSpendEngine.calculate(hMoved, sep(9, 25)).upcomingBills, 120, "a bill moved into this pay period is reserved, even though last month's was paid this month");

    // (f) An income with no deposits yet: a skip made today is still there tomorrow.
    const manual = { accounts: chq(1000), bills: [], debts: [], transactions: [], incomes: [{ id: 9, label: "New job", amount: "1500", freq: "biweekly" }] };
    const first = E.incomeOccurrences(manual, sep(9, 25), 30)[0];
    const skipFe = E.editOccurrence(undefined, first, "one", { skip: true });
    const tomorrow = E.incomeOccurrences(withEdits(manual, skipFe), sep(9, 26), 30);
    t.ok(tomorrow.some(o => o.skipped && iso(o.originalDate) === iso(first.originalDate)), "the skipped date is still the skipped date the next day");

    // (g) Changing the amount of a skipped occurrence brings it back.
    const phone = occOf(d, "bill:name:phone", "2026-03-15");
    const back = E.editOccurrence(E.editOccurrence(undefined, phone, "one", { skip: true }), phone, "one", { amount: 70 });
    t.eq(on(fc(withEdits(d, back)), "2026-03-15").bills.map(b => b.amount), [70], "a new amount on a skipped bill un-skips it");
  }

  // ── 9. Wiring: every sheet is reachable, and the new copy has no em or en dashes ──────────────
  {
    const app = fs.readFileSync(path.join(__dirname, "../src/App.jsx"), "utf8");
    const fnBody = (name) => { const i = app.indexOf(`function ${name}(`); const j = app.indexOf("\nfunction ", i + 10); return i < 0 ? "" : app.slice(i, j < 0 ? undefined : j); };
    for (const [surface, name] of [["Today", "TimeMachine"], ["the Financial Timeline", "FinancialTimeline"], ["Watch", "PlanAhead"]]) {
      const body = fnBody(name);
      t.ok(/<OccurrenceSheet occ=\{editOcc\}/.test(body) && /openOcc\(dl\.occurrence\)/.test(body) && /openOcc\(bl\.occurrence\)/.test(body) && /openOcc\(sk\.occurrence\)/.test(body),
           `${surface}: tapping a projected deposit, bill or skipped item opens its edit sheet`);
      t.ok(/<EditedTag\/>/.test(body), `${surface}: an edited row shows its Edited tag`);
    }
    t.ok(/<DepositQuestionCard data=\{data\} setAppData=\{setAppData\}/.test(fnBody("Dashboard")), "Today raises \"Is this income?\"");
    t.ok(/<DepositSheet key=\{depositTxnKey\(depositTxn\)\} txn=\{depositTxn\}[^>]*mode="mark"/.test(fnBody("SpendScreen")) && /This isn't income/.test(fnBody("SpendScreen")), "Activity can mark any past deposit \"This isn't income\"");
    t.ok(/<ExpectedItemSheet /.test(fnBody("PlanAhead")) && /<DailySpendSheet /.test(fnBody("PlanAhead")), "Watch offers expected money in or out, and the daily spend sheet");
    t.ok((app.match(/<PayVariesControl /g) || []).length >= 2, "\"My pay varies\" is on every income source in Settings and in the deposit sheet");
    // Two rules over every user-facing string ANYWHERE in src: no em or en dash, and no "engine" or
    // "engines". Both are read from every string literal, template text and JSX text, parsed (so
    // comments, which say "ForecastEngine" constantly and may use dashes, are not scanned). Regex
    // literals are not strings, so input-normalising patterns like /[−–—]/ stay, and an identifier
    // such as ForecastEngine is not a string either, so the code keeps its names.
    //
    // "Engine" is the app describing its own plumbing. Meet used to tell the household "it reads what
    // the engines already calculated", which asks them to hold a model of how Flourish is built before
    // they can read their own agenda. What Flourish worked out is the household's business; what it
    // worked it out WITH is not.
    let parser;
    try { parser = require(path.join(__dirname, "../node_modules/@babel/parser")); } catch { parser = null; }
    t.ok(!!parser, "the copy check can load @babel/parser (installed with @vitejs/plugin-react)");
    if (parser) {
      const srcDir = path.join(__dirname, "../src");
      const files = [path.join(srcDir, "App.jsx"), path.join(srcDir, "main.jsx"), ...fs.readdirSync(path.join(srcDir, "lib")).filter(f => /\.jsx?$/.test(f)).map(f => path.join(srcDir, "lib", f))];
      const dashed = [], jargon = [];
      for (const file of files) {
        const ast = parser.parse(fs.readFileSync(file, "utf8"), { sourceType: "module", plugins: ["jsx"] });
        (function walk(n) {
          if (!n || typeof n.type !== "string") return;
          const text = n.type === "StringLiteral" ? n.value : n.type === "TemplateElement" ? (n.value.cooked ?? n.value.raw) : n.type === "JSXText" ? n.value : null;
          if (text && /[\u2013\u2014]/.test(text)) dashed.push(`${path.basename(file)}:${n.loc.start.line} ${text.trim().slice(0, 60)}`);
          // \bengines?\b on its own, so ForecastEngine inside a string (were one ever written) is not
          // what this catches: the word standing alone is the one a household is asked to read.
          if (text && /\bengines?\b/i.test(text)) jargon.push(`${path.basename(file)}:${n.loc.start.line} ${text.trim().slice(0, 60)}`);
          for (const k of Object.keys(n)) {
            if (["loc", "start", "end", "leadingComments", "trailingComments", "innerComments", "extra"].includes(k)) continue;
            const v = n[k];
            if (Array.isArray(v)) v.forEach(x => x && typeof x.type === "string" && walk(x));
            else if (v && typeof v.type === "string") walk(v);
          }
        })(ast.program);
      }
      t.eq(dashed, [], `no em or en dash in any string in src (${files.length} files scanned)`);
      t.eq(jargon, [], `no string in src calls Flourish's own machinery an "engine" (${files.length} files scanned)`);
      // index.html's <title> is the one string outside src/ that a person reads, on a browser tab and
      // in a search result, so the same rule applies to it.
      const pageTitle = (fs.readFileSync(path.join(__dirname, "../index.html"), "utf8").match(/<title>([\s\S]*?)<\/title>/) || [])[1] || "";
      t.ok(pageTitle.trim().length > 0 && !/[\u2013\u2014]/.test(pageTitle), `the page title has no em or en dash (got: "${pageTitle.trim()}")`);
    }
    // The rule is that the DISPLAYED value comes from frequencyLabel(), not the raw freq string.
    // Matched in either spelling, because the Watch card now passes its supporting figures as
    // objects rather than pairs — the source of the value is what matters, not the punctuation
    // around it. The second half of the check is unchanged.
    t.ok(/(?:\["Pay frequency",\s*frequencyLabel\(_ffreq\)\]|label:\s*"Pay frequency",\s*value:\s*frequencyLabel\(_ffreq\))/.test(app)
      && !/× \$\{r\.freq\}/.test(app), "pay frequency is shown in plain words (\"Every 2 weeks\"), not \"biweekly\"");
    t.ok(/detectIncomeFromTxns\(incomeEvidence\(/.test(app) && !/detectIncomeFromTxns\(markedTxns\)|detectIncomeFromTxns\(txns\)/.test(app),
         "every income detection reads only deposits that count as income");
    t.ok(/FinancialCalcEngine\.cashFlow\(data, getCatOv\(\)\)\.monthlyIncome/.test(app) && /Next deposit \(as the household corrected it\)/.test(app),
         "the live coach snapshot reads corrected monthly income and the corrected next deposit");
  }

  // ── 11. Reopening an edit keeps it exactly as saved ────────────────────────────────────────────
  {
    const { frequencyLabel } = await import("../src/lib/incomeReconcile.js");
    t.eq(["weekly", "biweekly", "semimonthly", "monthly"].map(frequencyLabel), ["Weekly", "Every 2 weeks", "Twice a month", "Monthly"], "frequencies read as plain words");

    const d = base();
    const fe = E.editOccurrence(undefined, occOf(d, "income:1", "2026-04-03"), "series", { amount: 2300 });
    const dd = withEdits(d, fe);
    const later = (x) => [depOf(on(fc(x), "2026-04-03"), "Job"), depOf(on(fc(x), "2026-04-17"), "Job"), depOf(on(fc(x), "2026-05-01"), "Job")];
    t.eq(later(dd), [[2300], [2300], [2300]], "sanity: a raise from Apr 3 on");
    for (const reopenIso of ["2026-04-03", "2026-04-17"]) {
      const occ = occOf(dd, "income:1", reopenIso);
      const init = E.sheetDefaults(occ);
      t.eq([init.scope, init.action, init.amount], ["series", "amount", "2300"], `reopening ${reopenIso} opens on "From this date on", Change amount, $2,300`);
      const saved = E.sheetSave(dd.forecastEdits, occ, { ...init, amount: Number(init.amount) });
      t.ok(saved === dd.forecastEdits, `Save with no changes (${reopenIso}) writes nothing`);
      t.eq(later(withEdits(d, saved)), [[2300], [2300], [2300]], `…and every later date is unchanged (${reopenIso})`);
    }
    // What the old default did: "Just this one" on a series edit turned it into a single-date edit.
    const occ17 = occOf(dd, "income:1", "2026-04-17");
    t.ok(E.sheetSave(dd.forecastEdits, occ17, { action: "amount", scope: "one", amount: 2300, date: "2026-04-17" }) !== dd.forecastEdits,
         "sanity: saving with the wrong scope would have written a change (the defect)");

    const shifted = withEdits(d, E.editOccurrence(undefined, occOf(d, "income:1", "2026-04-03"), "series", { date: "2026-04-02" }));
    const sOcc = occOf(shifted, "income:1", "2026-04-17");
    t.eq([E.sheetDefaults(sOcc).scope, E.sheetDefaults(sOcc).action, E.sheetDefaults(sOcc).date], ["series", "date", "2026-04-16"], "a date moved from a date on reopens on Move date, with the moved date");
    t.ok(E.sheetSave(shifted.forecastEdits, sOcc, E.sheetDefaults(sOcc)) === shifted.forecastEdits, "…and an unchanged Save writes nothing");

    const one = withEdits(d, E.editOccurrence(undefined, occOf(d, "income:1", "2026-03-20"), "one", { amount: 2500 }));
    t.eq(E.sheetDefaults(occOf(one, "income:1", "2026-03-20")).scope, "one", "a \"just this one\" edit reopens on Just this one");
    const skipped = withEdits(d, E.editOccurrence(undefined, occOf(d, "bill:name:phone", "2026-03-15"), "series", { skip: true }));
    t.eq([E.sheetDefaults(occOf(skipped, "bill:name:phone", "2026-04-15")).action, E.sheetDefaults(occOf(skipped, "bill:name:phone", "2026-04-15")).scope], ["skip", "series"], "a bill stopped from a date on reopens on Skip, From this date on");
    const plain = occOf(d, "income:1", "2026-03-20");
    t.ok(E.sheetSave(d.forecastEdits, plain, E.sheetDefaults(plain)) === d.forecastEdits, "an unedited row saved unchanged writes nothing");
    const narrowed = E.sheetSave(dd.forecastEdits, occ17, { action: "amount", scope: "one", amount: 2600, date: "2026-04-17" });
    t.eq(later(withEdits(d, narrowed)), [[2300], [2600], [2300]], "choosing Just this one on purpose changes only that date");

    const app = fs.readFileSync(path.join(__dirname, "../src/App.jsx"), "utf8");
    const sheet = app.slice(app.indexOf("function OccurrenceSheet("), app.indexOf("\nfunction ", app.indexOf("function OccurrenceSheet(") + 10));
    t.ok(/const init = sheetDefaults\(occ\)/.test(sheet) && /useState\(init\.scope\)/.test(sheet) && /useState\(init\.action\)/.test(sheet) && /sheetSave\(prev\.forecastEdits, occ,/.test(sheet),
         "the sheet opens from sheetDefaults and saves through sheetSave");
  }

  t.summary("forecastEdits.test");
})();
