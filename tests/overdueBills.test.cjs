// tests/overdueBills.test.cjs — MATH-LOCK
// -----------------------------------------------------------------------------
// A BILL PAST ITS DUE DATE THAT HAS NOT BEEN SEEN PAID STAYS COUNTED (audit of 2026-11-13, finding 3).
//
// A monthly bill used to roll to next month the day after its due day. Rent due Sunday Nov 1 and still in the
// account on Monday dropped out of safe to spend and the forecast: $591 became $2,409 with the money not yet gone.
//
// THE RULE (forecastEdits.js billOccurrences, OVERDUE_GRACE_DAYS):
//   - A bill stays counted after its due date until a matching payment is seen (the one "already paid" rule,
//     billArrived), for up to 5 days. Five days is a due date on a Saturday, a holiday Monday, the payment on Tuesday
//     and one more day for the bank's feed. Longer would keep counting a bill that was paid in a way the app cannot
//     match (another payee name, a balance typed in by hand).
//   - Only a bill known to be on file before that due date: a bill added on the 3rd with a due day of the 1st was
//     not missed. The sign is createdAt (added by hand), the saved next due date (found from the bank) or onFileSince
//     (stamped the first time the app sees any other recurring bill: stampOnFile). A recurring bill with none of the
//     three is never called overdue. A one-time bill's date was a coming date when it was made.
//   - "Just this one: skip" still drops it. A bill moved to a later date is counted on that date, once.
//   - It is counted in safe to spend and taken out of today's forecast balance, listed under its own due date.
//
//   1  the audit's case: rent due Nov 1, unpaid on Nov 2
//   2  the grace: counted through Nov 6, not from Nov 7
//   3  a payment ends it: late, on the day, or early
//   4  the forecast takes it out too
//   5  only a bill already on file before the due date
//   6  an every-two-weeks bill, and a one-time bill
//   7  the household's own edits: skipped, and moved
//   8  the next occurrence is still counted once, and both when both fall in the window
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");

(async () => {
  const t = create();
  const { SafeSpendEngine } = await import("../src/lib/safeSpendEngine.js");
  const { safeToSpendView } = await import("../src/lib/safeToSpendView.js");
  const { ForecastEngine } = await import("../src/lib/forecastEngine.js");
  const fe = await import("../src/lib/forecastEdits.js");
  const { editOccurrence, isoOf } = fe;

  const at = (y, m, d) => new Date(y, m - 1, d, 10);
  const cash = (bal) => [{ id: "a1", type: "depository", subtype: "checking", balance: bal }];
  const JOB = { id: 1, label: "Job", amount: "2400", freq: "biweekly", type: "employment", nextPayDate: "2026-11-13" };
  const RENT = { id: "b1", name: "Rent", amount: "1800", date: "1", freq: "monthly", nextDueDate: "2026-11-01" };
  const house = (over = {}) => ({ profile: { country: "CA" }, accounts: cash(2600), incomes: [JOB], bills: [RENT], debts: [], transactions: [], ...over });
  const calc = (d, day) => { const ss = SafeSpendEngine.calculate(d, day); return { ss, v: safeToSpendView(ss, { hasCashAccount: true, hasIncome: true }) }; };
  const shown = (d, day) => { const { ss, v } = calc(d, day); return [ss.upcomingBills, v.headlineText]; };
  const paid = (date, name = "Rent", amount = 1800) => ({ id: "t" + date, name, amount, date, cat: "Housing" });

  t.eq(fe.OVERDUE_GRACE_DAYS, 5, "0 the grace is 5 days");

  // ── 1. The audit's case ──────────────────────────────────────────────────────────────────────────
  {
    t.eq(shown(house(), at(2026, 10, 31)), [1800, "$574"], "1a Sat Oct 31, the day before: rent counted, $574");
    t.eq(shown(house(), at(2026, 11, 1)), [1800, "$591"], "1b Sun Nov 1, the due day: rent counted, $591");
    t.eq(shown(house(), at(2026, 11, 2)), [1800, "$609"], "1c Mon Nov 2, rent still not out: still counted, $609 (was $0 and $2,409)");
    const { ss } = calc(house(), at(2026, 11, 2));
    t.eq(ss.billsDueSoon.map(b => [b.name, isoOf(b.date)]), [["Rent", "2026-11-01"]], "1d listed as due soon under its own due date, Nov 1");
    t.eq(ss.soonBills.map(b => b.name), ["Rent"], "1e and in the short list Today reads");
  }

  // ── 2. The grace ───────────────────────────────────────────────────────────────────────────────
  {
    t.eq(shown(house(), at(2026, 11, 6)), [1800, "$678"], "2a Nov 6, five days after: still counted");
    t.eq(shown(house(), at(2026, 11, 7)), [0, "$2,495"], "2b Nov 7, six days after: no longer counted");
  }

  // ── 3. A payment ends it ───────────────────────────────────────────────────────────────────────
  {
    const late = house({ accounts: cash(800), transactions: [paid("2026-11-04")] });
    t.eq(calc(late, at(2026, 11, 4)).ss.upcomingBills, 0, "3a paid Nov 4, three days late: not counted from that day");
    t.eq(calc(late, at(2026, 11, 5)).ss.upcomingBills, 0, "3b nor the day after");
    const early = house({ accounts: cash(800), transactions: [paid("2026-10-30")] });
    t.eq(calc(early, at(2026, 11, 2)).ss.upcomingBills, 0, "3c paid Oct 30, two days early: Nov 1's rent is not overdue");
    const other = house({ transactions: [paid("2026-11-02", "Corner Grocery", 82.15)] });
    t.eq(calc(other, at(2026, 11, 3)).ss.upcomingBills, 1800, "3d some other payment does not end it");
    const refund = house({ transactions: [{ id: "r", name: "Rent", amount: -1800, date: "2026-11-02", cat: "Housing" }] });
    t.eq(calc(refund, at(2026, 11, 3)).ss.upcomingBills, 1800, "3e money in under the same name is not a payment");
  }

  // ── 4. The forecast ────────────────────────────────────────────────────────────────────────────
  {
    const f = ForecastEngine.generate(house(), 14, null, at(2026, 11, 2));
    t.eq(f.forecast[0].bills.map(b => b.name), ["Rent"], "4a Nov 2: the forecast lists the unpaid rent today");
    t.eq(Math.round(f.forecast[0].balance), 800, "4b and takes it out: $800 from today (was $2,600)");
    t.eq(Math.round(Math.min(...f.forecast.slice(0, 11).map(e => e.balance))), 800, "4c the lowest balance before payday is $800");
    const g = ForecastEngine.generate(house(), 14, null, at(2026, 11, 7));
    t.eq([g.forecast[0].bills.length, Math.round(g.forecast[0].balance)], [0, 2600], "4d Nov 7, past the grace: not in the forecast");
    const p = ForecastEngine.generate(house({ accounts: cash(800), transactions: [paid("2026-11-02")] }), 14, null, at(2026, 11, 3));
    t.eq([p.forecast[0].bills.length, Math.round(p.forecast[0].balance)], [0, 800], "4e paid Nov 2: not taken out a second time");
  }

  // ── 5. Only a bill already on file before the due date ───────────────────────────────────────────
  {
    const added = { id: "mb1", name: "Rent", amount: 1800, date: "1", freq: "monthly", origin: "manual", createdAt: "2026-11-03T15:00:00.000Z" };
    t.eq(calc(house({ bills: [added] }), at(2026, 11, 3)).ss.upcomingBills, 0, "5a a bill added on Nov 3 with a due day of the 1st: Nov 1 was not missed");
    t.eq(calc(house({ bills: [added] }), at(2026, 12, 2)).ss.upcomingBills, 1800, "5b the same bill a month on: Dec 1 unpaid on Dec 2 is counted");
    const found = { id: "d1", name: "Rent", amount: 1800, date: "1", freq: "monthly", auto: true, nextDueDate: "2026-12-01" };
    t.eq(calc(house({ bills: [found] }), at(2026, 11, 3)).ss.upcomingBills, 0, "5c a bill found from the bank whose saved next due date is Dec 1: Nov 1 is before it");
    const bare = { id: "o1", name: "Rent", amount: 1800, date: "1", freq: "monthly" };
    t.eq(calc(house({ bills: [bare] }), at(2026, 11, 3)).ss.upcomingBills, 0, "5d a recurring bill with no sign of when it was put on file is never called overdue");
    // ...so the app stamps such a bill the first time it sees it (onboarding's bills, older ones).
    t.eq([fe.needsOnFileStamp(bare), fe.needsOnFileStamp(added), fe.needsOnFileStamp(found), fe.needsOnFileStamp({ type: "one_off", isoDate: "2026-11-20" })],
         [true, false, false, false], "5e only a recurring bill with none of the three needs the stamp");
    const stamped = fe.stampOnFile([bare, added], at(2026, 10, 20));
    t.eq([stamped[0].onFileSince, stamped[1] === added, fe.stampOnFile(stamped, at(2026, 11, 9))[0].onFileSince], ["2026-10-20", true, "2026-10-20"],
         "5f stamped once, with the day it was first seen; a bill that needs nothing is left as it is");
    t.eq(calc(house({ bills: stamped }), at(2026, 11, 3)).ss.upcomingBills, 1800, "5g stamped Oct 20: Nov 1 unpaid on Nov 3 is counted");
    t.eq(calc(house({ bills: fe.stampOnFile([bare], at(2026, 11, 3)) }), at(2026, 11, 3)).ss.upcomingBills, 0, "5h stamped Nov 3 (typed in that day): Nov 1 was not missed");
    // The app does the stamping, in the same place it backfills a bill's next due date.
    const app = require("fs").readFileSync(require("path").join(__dirname, "..", "src", "App.jsx"), "utf8");
    t.ok(/useEffect\(\(\) => \{\s*const bs = appData\?\.bills;[^}]*?if \(!bs\.some\(needsOnFileStamp\)\) return;\s*setAppData\(d => \(\{ \.\.\.d, bills: stampOnFile\(d\.bills\) \}\)\);\s*\}, \[appData\?\.bills\]\)/.test(app),
         "5i App.jsx stamps a household's unstamped bills whenever its bills change");
  }

  // ── 6. Every two weeks; one time ───────────────────────────────────────────────────────────────
  {
    const job = { ...JOB, nextPayDate: "2026-06-26" };
    const daycare = { id: "w1", name: "Daycare", amount: "450", freq: "biweekly", nextDueDate: "2026-06-05" };   // Jun 5, 19, Jul 3
    const d = house({ incomes: [job], bills: [daycare] });
    t.eq(calc(d, at(2026, 6, 20)).ss.upcomingBills, 450, "6a every two weeks, due Jun 19, unpaid Jun 20: counted (was $0)");
    t.eq(calc(d, at(2026, 6, 24)).ss.upcomingBills, 450, "6b five days after: still counted");
    t.eq(calc(d, at(2026, 6, 25)).ss.upcomingBills, 0, "6c six days after: no longer");
    const tuition = { id: "x1", name: "Tuition", amount: "900", type: "one_off", isoDate: "2026-06-10" };
    const o = house({ incomes: [job], bills: [tuition] });
    t.eq(calc(o, at(2026, 6, 12)).ss.upcomingBills, 900, "6d a one-time bill due Jun 10, unpaid Jun 12: counted (was $0)");
    t.eq(calc(o, at(2026, 6, 16)).ss.upcomingBills, 0, "6e six days after: no longer");
    t.eq(calc({ ...o, transactions: [paid("2026-06-11", "Tuition", 900)] }, at(2026, 6, 12)).ss.upcomingBills, 0, "6f paid Jun 11: not counted");
  }

  // ── 7. The household's own edits ─────────────────────────────────────────────────────────────────
  {
    const occ = { srcKey: "bill:b1", originalDate: at(2026, 11, 1) };
    const skipped = house({ forecastEdits: editOccurrence({}, occ, "one", { skip: true }) });
    t.eq(calc(skipped, at(2026, 11, 2)).ss.upcomingBills, 0, "7a skipped by the household: not counted");
    const moved = house({ forecastEdits: editOccurrence({}, occ, "one", { date: "2026-11-10" }) });
    const { ss } = calc(moved, at(2026, 11, 2));
    t.eq([ss.upcomingBills, ss.billsDueSoon.map(b => isoOf(b.date))], [1800, ["2026-11-10"]], "7b moved to Nov 10: counted once, on Nov 10");
  }

  // ── 8. The next occurrence ───────────────────────────────────────────────────────────────────────
  {
    const d = house({ accounts: cash(3000), transactions: [paid("2026-11-03")] });
    const { ss } = calc(d, at(2026, 11, 28));                     // next payday Dec 11
    t.eq([ss.upcomingBills, ss.billsDueSoon.map(b => isoOf(b.date))], [1800, ["2026-12-01"]], "8a Nov 28: December's rent counted once; November's, paid Nov 3, is not");
    const job = { ...JOB, nextPayDate: "2026-06-26" };
    const weekly = { id: "w2", name: "Daycare", amount: "100", freq: "weekly", nextDueDate: "2026-06-05" };       // Fridays
    const both = calc(house({ incomes: [job], bills: [weekly] }), at(2026, 6, 15)).ss;                            // Jun 12 unpaid; Jun 19 and 26 ahead
    t.eq([both.upcomingBills, both.billsDueSoon.map(b => isoOf(b.date))], [300, ["2026-06-12", "2026-06-19", "2026-06-26"]], "8b a weekly bill unpaid on Monday: last Friday's and the two ahead, each once");
  }

  t.summary("overdueBills");
})();
