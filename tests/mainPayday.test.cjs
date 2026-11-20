// tests/mainPayday.test.cjs — MATH-LOCK
// -----------------------------------------------------------------------------
// SAFE TO SPEND COUNTS EVERY BILL DUE BEFORE THE NEXT MAIN PAYDAY (audit of 2026-11-13, finding 2).
//
// The bill window used to end at the next deposit of any size. A $560 child benefit landing a week before a $2,400
// paycheque ended the window on the benefit's day, so $1,800 of rent due between the two was not counted: Today
// showed $2,365 "until next payday" where the same household without the benefit entered showed $334.
//
// THE RULE (forecastEdits.js nextMainPaydayFor):
//   - A household's MAIN pay is the income that brings in the most per month, together with any other income that
//     brings in at least half as much per month (two earners with similar pay both have main paydays).
//   - The bill window runs from today to the next main payday. A smaller income (a child benefit, a pension beside a
//     job, a side job, a second earner's much smaller pay) never ends it.
//   - A smaller income still counts as money coming in everywhere else: the forecast, monthly income, the savings
//     row. It raises safe to spend on the day it lands, when it is in the balance, and not before.
//   - An income the household stopped is not a payday at all; the largest income still expected is the main one.
//   - With no income, the window is 10 days, as before.
//
//   1  the audit's household: rent and hydro between a benefit and the paycheque are counted
//   2  the same household with no benefit entered is unchanged ($334)
//   3  two earners with similar pay: both are main paydays
//   4  a second earner's much smaller pay, and a weekly side job, never end the window
//   5  a weekly main job beside a monthly pension: the weekly pay is the main payday
//   6  benefit-only households: the largest benefit is the main payday
//   7  exactly half as much per month is main; a dollar less is not
//   8  a main income the household stopped is no longer a payday
//   9  the daily pace runs to the main payday too
//  10  no income: 10 days, as before; "next deposit" (the display) is still the next deposit of any size
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");

(async () => {
  const t = create();
  const { SafeSpendEngine } = await import("../src/lib/safeSpendEngine.js");
  const { safeToSpendView } = await import("../src/lib/safeToSpendView.js");
  const fe = await import("../src/lib/forecastEdits.js");
  const { suggestedDailyView } = await import("../src/lib/suggestedDaily.js");
  const { nextDepositFor, incomeOccurrences, editOccurrence, isoOf } = fe;
  // Named so a missing export fails each check below instead of crashing the file.
  const nextMain = (d, today) => (typeof fe.nextMainPaydayFor === "function" ? fe.nextMainPaydayFor(d, today) : null);
  const daysToMain = (d, today) => (typeof fe.daysToNextMainPaydayFor === "function" ? fe.daysToNextMainPaydayFor(d, today) : undefined);

  const at = (y, m, d) => new Date(y, m - 1, d, 10);
  const today = at(2026, 11, 13);               // Friday
  const cash = (bal) => [{ id: "a1", type: "depository", subtype: "checking", balance: bal }];
  const JOB = { id: 1, label: "Job", amount: "2400", freq: "biweekly", type: "employment", nextPayDate: "2026-11-26" };
  const CCB = { id: 2, label: "Canada Child Benefit", amount: "560", freq: "monthly", type: "ccb", anchorDay: 20 };
  const RENT = { id: "b1", name: "Rent", amount: "1800", date: "23", freq: "monthly", nextDueDate: "2026-11-23" };
  const HYDRO = { id: "b2", name: "Hydro", amount: "140", date: "24", freq: "monthly", nextDueDate: "2026-11-24" };
  const house = (incomes, bills = [RENT, HYDRO], bal = 2500) => ({ profile: { country: "CA" }, accounts: cash(bal), incomes, bills, debts: [], transactions: [] });
  const calc = (d, day = today) => { const ss = SafeSpendEngine.calculate(d, day); return { ss, v: safeToSpendView(ss, { hasCashAccount: true, hasIncome: true }) }; };
  const mainOf = (d, day = today) => { const n = nextMain(d, day); return n ? [isoOf(n.date), n.sourceLabel] : null; };

  // ── 1. The audit's household ─────────────────────────────────────────────────────────────────────
  {
    const d = house([JOB, CCB]);
    t.eq(mainOf(d), ["2026-11-26", "Job"], "1a the main payday is the paycheque on Nov 26, not the benefit on Nov 20");
    t.eq(daysToMain(d, today), 13, "1b 13 days to the main payday");
    const { ss, v } = calc(d);
    t.eq(ss.upcomingBills, 1940, "1c rent $1,800 (Nov 23) and hydro $140 (Nov 24) are both counted (was $0)");
    t.eq(ss.billsDueSoon.map(b => b.name), ["Rent", "Hydro"], "1d and both are listed as due soon");
    t.eq(ss.savingsAlloc, 249.63, "1e the savings row is 13 days of 10% of monthly income, the benefit included");
    t.eq(v.headlineText, "$310", "1f Today shows $310 (was $2,365)");
    const nd = nextDepositFor(d, today);
    t.eq([isoOf(nd.date), nd.sourceLabel], ["2026-11-20", "Canada Child Benefit"], "1g the next deposit of any size is still the benefit on Nov 20");
    // The day the benefit lands it is in the balance, and the window still runs to the paycheque.
    const landed = calc(house([JOB, CCB], [RENT, HYDRO], 2500 + 560), at(2026, 11, 20));
    t.eq([landed.ss.upcomingBills, landed.v.headlineText], [1940, "$1,004"], "1h Nov 20, benefit landed: bills still $1,940 counted, and the number rises to $1,004");
    // Rent due after the paycheque is next cycle's: only what falls before the main payday is counted.
    const later = calc(house([JOB, CCB], [{ ...RENT, date: "1", nextDueDate: "2026-12-01" }, { id: "b3", name: "Car insurance", amount: "210", date: "23", freq: "monthly", nextDueDate: "2026-11-23" }, HYDRO]));
    t.eq(later.ss.upcomingBills, 350, "1i rent due Dec 1, after the paycheque, is not counted; insurance and hydro are (was $0)");
  }

  // ── 2. No benefit entered: unchanged ──────────────────────────────────────────────────────────────
  {
    const { ss, v } = calc(house([JOB]));
    t.eq([ss.upcomingBills, v.headlineText], [1940, "$334"], "2a the job-only household still shows $334");
    t.eq(mainOf(house([JOB])), ["2026-11-26", "Job"], "2b a single income is the main one");
  }

  // ── 3. Two earners with similar pay ─────────────────────────────────────────────────────────────
  {
    const partner = { id: 3, label: "Partner job", amount: "2200", freq: "biweekly", type: "employment", nextPayDate: "2026-11-19" };
    const d = house([JOB, partner]);
    t.eq(mainOf(d), ["2026-11-19", "Partner job"], "3a $2,200 beside $2,400: the partner's payday on Nov 19 is a main payday");
    t.eq(calc(d).ss.upcomingBills, 0, "3b so rent on Nov 23 belongs to the window after it, as for any payday");
    t.eq(mainOf(d, at(2026, 11, 20)), ["2026-11-26", "Job"], "3c and after Nov 19 the next main payday is the other earner's");
  }

  // ── 4. Smaller incomes never end the window ────────────────────────────────────────────────────
  {
    const small = { id: 3, label: "Partner job", amount: "900", freq: "biweekly", type: "employment", nextPayDate: "2026-11-19" };
    t.eq(mainOf(house([JOB, small])), ["2026-11-26", "Job"], "4a a second earner's $900 beside $2,400 is not a main payday");
    t.eq(calc(house([JOB, small])).ss.upcomingBills, 1940, "4b so rent and hydro are counted");
    const side = { id: 4, label: "Side job", amount: "150", freq: "weekly", type: "gig", nextPayDate: "2026-11-16" };
    t.eq(mainOf(house([JOB, side])), ["2026-11-26", "Job"], "4c a $150 weekly side job is not a main payday");
    t.eq(calc(house([JOB, side])).ss.upcomingBills, 1940, "4d so the window is never cut to a week");
    t.eq(mainOf(house([JOB, CCB, small, side])), ["2026-11-26", "Job"], "4e all three smaller incomes together still do not end it");
  }

  // ── 5. A weekly main job beside a monthly pension ───────────────────────────────────────────────
  {
    const weekly = { id: 5, label: "Shop", amount: "900", freq: "weekly", type: "employment", nextPayDate: "2026-11-16" };
    const pension = { id: 6, label: "Pension", amount: "560", freq: "monthly", type: "cpp", anchorDay: 20 };
    t.eq(mainOf(house([weekly, pension])), ["2026-11-16", "Shop"], "5a $900 a week is the main pay; the window runs to Monday");
    t.eq(mainOf(house([weekly, pension]), at(2026, 11, 17)), ["2026-11-23", "Shop"], "5b and then to the next Monday, past the pension on the 20th");
  }

  // ── 6. Benefit-only households ───────────────────────────────────────────────────────────────────
  {
    const odsp = { id: 7, label: "ODSP", amount: "1300", freq: "monthly", type: "odsp", anchorDay: 28 };
    const phone = { id: "b9", name: "Phone", amount: "60", date: "22", freq: "monthly", nextDueDate: "2026-11-22" };
    const d = house([odsp, CCB], [phone], 400);
    t.eq(mainOf(d), ["2026-11-28", "ODSP"], "6a ODSP $1,300 beside a $560 benefit: ODSP's day is the main payday");
    t.eq(calc(d).ss.upcomingBills, 60, "6b the phone bill on the 22nd is counted (was $0: the window ended on the 20th)");
    t.eq(mainOf(house([CCB])), ["2026-11-20", "Canada Child Benefit"], "6c a household with only the child benefit: that is its main payday");
    const cpp = { id: 8, label: "CPP", amount: "800", freq: "monthly", type: "cpp", anchorDay: 27 };
    const oas = { id: 9, label: "OAS", amount: "740", freq: "monthly", type: "cpp", anchorDay: 20 };
    t.eq(mainOf(house([cpp, oas])), ["2026-11-20", "OAS"], "6d two pensions of similar size: both are main paydays");
  }

  // ── 7. The line: at least half as much per month ───────────────────────────────────────────────
  {
    const big = { id: 10, label: "Salary", amount: "2000", freq: "monthly", type: "employment", anchorDay: 28 };
    const half = { id: 11, label: "Second", amount: "1000", freq: "monthly", type: "other", anchorDay: 20 };
    t.eq(mainOf(house([big, half])), ["2026-11-20", "Second"], "7a exactly half as much per month is a main payday");
    t.eq(mainOf(house([big, { ...half, amount: "999" }])), ["2026-11-28", "Salary"], "7b a dollar less is not");
    // Per month, not per deposit: $600 a week is $2,600 a month, half of a $5,200-a-month job.
    const weekly600 = { id: 12, label: "Weekly", amount: "600", freq: "weekly", type: "employment", nextPayDate: "2026-11-16" };
    t.eq(mainOf(house([JOB, weekly600])), ["2026-11-16", "Weekly"], "7c the measure is the month's total, not one deposit");
  }

  // ── 8. A main income the household stopped ─────────────────────────────────────────────────────
  {
    const d = house([JOB, CCB]);
    const firstJob = incomeOccurrences(d, today, 60).find(o => o.srcKey === "income:1");
    const stopped = { ...d, forecastEdits: editOccurrence({}, firstJob, "series", { skip: true }) };
    t.eq(mainOf(stopped), ["2026-11-20", "Canada Child Benefit"], "8a with the job stopped, the benefit is the only pay left and so the main one");
    t.eq(calc(stopped).ss.upcomingBills, 0, "8b and the window runs to it");
  }

  // ── 9. The daily pace ───────────────────────────────────────────────────────────────────────────
  {
    const salary = { id: 13, label: "Salary", amount: "5000", freq: "monthly", type: "employment", anchorDay: 30 };
    const side = { id: 14, label: "Side job", amount: "150", freq: "weekly", type: "gig", nextPayDate: "2026-11-06" };
    const d = house([salary, side], []);
    const day = at(2026, 11, 2);
    t.eq(daysToMain(d, day), 28, "9a 28 days to the salary on the 30th");
    t.eq(suggestedDailyView(1400, d.incomes, d.transactions, day, d).daysLeft, 28, "9b the pace divides over 28 days (was 14: the side job on Friday ended the count)");
  }

  // ── 10. No income; and the display's "next deposit" ─────────────────────────────────────────────
  {
    const d = house([], [{ ...RENT, date: "20", nextDueDate: "2026-11-20" }, HYDRO]);
    t.eq([nextMain(d, today), daysToMain(d, today)], [null, null], "10a no income: no main payday");
    const { ss } = calc(d);
    t.eq([ss.upcomingBills, ss.dueSoonToDeposit, ss.noIncome], [1800, false, true], "10b the window is 10 days (rent on the 20th in, hydro on the 24th out), as before");
    t.eq(calc(house([JOB, CCB])).ss.dueSoonToDeposit, true, "10c with income the list is still labelled as running to payday");
  }

  t.summary("mainPayday");
})();
