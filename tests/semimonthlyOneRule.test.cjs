// tests/semimonthlyOneRule.test.cjs
// -----------------------------------------------------------------------------
// ONE SEMIMONTHLY RULE FOR BILLS AND INCOME (math-reconcile item 3).
//
// Income placed its two monthly days with semimonthlyDays: the anchor day and the anchor + 15,
// clamped to the month and kept distinct (Feb 28/29, 30-day months). Bills used ((d1 + 14) % 28) + 1,
// a second formula that disagreed with it: a bill anchored on the 15th landed on the 15th and the
// 2nd, an income anchored on the 15th on the 15th and the 30th, and a bill anchored on the 31st
// landed on the 18th.
//
// Now billNextDue and billOccursOnDate use semimonthlyDays too, with the pair income uses: a known
// anchor day and the anchor + 15, or the 1st and the 15th when there is no anchor at all.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");

(async () => {
  const t = create();
  const FC = await import("../src/lib/financialCalculations.js");
  const { depositDatesFor } = await import("../src/lib/incomeSchedule.js");

  const dim = (y, m) => new Date(y, m + 1, 0).getDate();
  const iso = (d) => FC.dateToISO(d);
  // Every day of month (y, m) on which the bill occurs, asked on the 1st of that month.
  const billDays = (bill, y, m) => {
    const out = [];
    for (let d = 1; d <= dim(y, m); d++) if (FC.billOccursOnDate(bill, new Date(y, m, d, 12), new Date(y, m, 1, 12))) out.push(d);
    return out;
  };
  // Every day of month (y, m) the income pays, from the income schedule itself.
  const incomeDays = (inc, y, m) => depositDatesFor(inc, 1000, [], new Date(y, m, 0, 12), dim(y, m))
    .filter(d => d.getFullYear() === y && d.getMonth() === m).map(d => d.getDate());

  // ── 1. Anchor 15 ──────────────────────────────────────────────────────────────────────────────
  const b15 = { name: "Insurance", amount: "90", freq: "semimonthly", nextDueDate: "2026-01-15" };
  t.eq(billDays(b15, 2026, 0), [15, 30], "1a anchor 15, January 2026: the 15th and the 30th");
  t.eq(billDays(b15, 2026, 1), [15, 28], "1b anchor 15, February 2026: the 15th and the 28th (month end)");
  t.eq(billDays({ ...b15, nextDueDate: "2028-01-15" }, 2028, 1), [15, 29], "1c anchor 15, February 2028: the 15th and the 29th (leap year)");
  t.eq(billDays(b15, 2026, 3), [15, 30], "1d anchor 15, April 2026: the 15th and the 30th");
  t.eq(iso(FC.billNextDue(b15, new Date(2026, 1, 16, 12))), "2026-02-28", "1e next due after Feb 15, 2026: Feb 28");
  t.eq(iso(FC.billNextDue({ ...b15, nextDueDate: "2028-01-15" }, new Date(2028, 1, 16, 12))), "2028-02-29", "1f next due after Feb 15, 2028: Feb 29");
  t.eq(iso(FC.billNextDue(b15, new Date(2026, 1, 1, 12))), "2026-02-15", "1g next due on Feb 1: Feb 15");

  // ── 2. Anchor 31 ──────────────────────────────────────────────────────────────────────────────
  const b31 = { name: "Loan", amount: "200", freq: "semimonthly", nextDueDate: "2026-01-31" };
  t.eq(billDays(b31, 2026, 0), [16, 31], "2a anchor 31, January 2026: the 16th and the 31st");
  t.eq(billDays(b31, 2026, 1), [16, 28], "2b anchor 31, February 2026: the 16th and the 28th, still two dates");
  t.eq(billDays({ ...b31, nextDueDate: "2028-01-31" }, 2028, 1), [16, 29], "2c anchor 31, February 2028: the 16th and the 29th");
  t.eq(billDays(b31, 2026, 3), [16, 30], "2d anchor 31, April 2026: the 16th and the 30th");
  t.eq(iso(FC.billNextDue(b31, new Date(2026, 1, 17, 12))), "2026-02-28", "2e next due after Feb 16, 2026: Feb 28");
  t.eq(iso(FC.billNextDue({ ...b31, nextDueDate: "2028-01-31" }, new Date(2028, 1, 17, 12))), "2028-02-29", "2f next due after Feb 16, 2028: Feb 29");
  t.eq(iso(FC.billNextDue(b31, new Date(2026, 1, 28, 12))), "2026-02-28", "2g on Feb 28, 2026 it is due that day");

  // ── 2b. An anchor late in the month pairs with the day half a month EARLIER ──────────────────
  // The anchor + 15 only works when it fits in the month. A bill (or pay) on the 10th and 25th,
  // anchored on its 25th, is not the 25th and the 40th clamped to month end (the 31st): it is the
  // 10th and the 25th. The pair is the same from either end of the schedule.
  const b25 = { name: "Insurance", amount: "90", freq: "semimonthly", nextDueDate: "2026-09-25" };
  t.eq(billDays(b25, 2026, 9), [10, 25], "2h anchor 25, October 2026: the 10th and the 25th, not the 25th and the 31st");
  t.eq(billDays({ ...b25, nextDueDate: "2026-09-10" }, 2026, 9), [10, 25], "2i …the same pair when anchored on the 10th");
  t.eq(iso(FC.billNextDue(b25, new Date(2026, 9, 1, 12))), "2026-10-10", "2j next due on Oct 1: Oct 10, not Oct 25");
  const b30 = { name: "Loan", amount: "200", freq: "semimonthly", nextDueDate: "2026-09-30" };
  t.eq(billDays(b30, 2026, 9), [15, 30], "2k anchor 30, October (31 days): the 15th and the 30th, not the 30th and the 31st");
  t.eq(billDays(b30, 2026, 1), [15, 28], "2l anchor 30, February 2026: the 15th and the 28th");
  t.eq(FC.semimonthlyPair(25), [10, 25], "2m semimonthlyPair(25) = [10, 25]");
  t.eq(FC.semimonthlyPair(16), [16, 31], "2n semimonthlyPair(16) = [16, 31] (it fits)");
  t.eq(FC.semimonthlyPair(17), [2, 17], "2o semimonthlyPair(17) = [2, 17] (17 + 15 would not)");
  t.eq(FC.semimonthlyPair(undefined), [1, 15], "2p no anchor: the 1st and the 15th");
  let spread = 0, cases = 0;
  for (let a = 1; a <= 31; a++) for (const [y, m] of [[2026, 0], [2026, 1], [2026, 3], [2028, 1]]) {
    const d = billDays({ name: "B", amount: "1", freq: "semimonthly", date: String(a) }, y, m);
    cases++; if (d.length === 2 && d[1] - d[0] >= 12) spread++;
  }
  t.eq(spread, cases, `2q every anchor 1 to 31 puts the two dates at least 12 days apart, never piled at month end (${cases} cases)`);

  // ── 3. A bill and an income on the same schedule land on the same days ───────────────────────
  for (const [y, m, label] of [[2026, 0, "Jan 2026"], [2026, 1, "Feb 2026"], [2028, 1, "Feb 2028"], [2026, 3, "Apr 2026"]]) {
    for (const a of [15, 31]) {
      const bill = { name: "B", amount: "1", freq: "semimonthly", nextDueDate: iso(new Date(y, m, 1, 12)).slice(0, 8) + String(Math.min(a, dim(y, m))).padStart(2, "0") };
      // An anchor of 31 has to be stored on a month that has a 31st, so the anchor day is the 31st.
      if (a === 31) bill.nextDueDate = "2026-01-31";
      const inc = { label: "Pay", amount: "1000", freq: "semimonthly", anchorDay: a };
      t.eq(billDays(bill, y, m), incomeDays(inc, y, m), `3 anchor ${a}, ${label}: the bill and the income pay on the same days`);
    }
  }
  // …for every anchor day, in every month of 2026 and 2027 and in February 2028.
  let same = 0, pairs = 0, two = 0;
  for (let a = 1; a <= 31; a++) {
    for (const [y, m] of [...Array.from({ length: 24 }, (_, k) => [2026 + Math.floor(k / 12), k % 12]), [2028, 1]]) {
      const bill = { name: "B", amount: "1", freq: "semimonthly", date: String(a) };
      const inc = { label: "Pay", amount: "1000", freq: "semimonthly", anchorDay: a };
      const bd = billDays(bill, y, m), id = incomeDays(inc, y, m);
      pairs++;
      if (JSON.stringify(bd) === JSON.stringify(id)) same++;
      if (bd.length === 2 && bd[0] !== bd[1]) two++;
    }
  }
  t.eq(same, pairs, `3e bill (by its day) and income agree for every anchor 1 to 31 in ${pairs / 31} months (${pairs} pairs)`);
  t.eq(two, pairs, "3f …and a semimonthly bill always lands on two distinct days a month");

  // With no anchor at all, both fall back to the 1st and the 15th.
  t.eq(billDays({ name: "B", amount: "1", freq: "semimonthly" }, 2026, 1), [1, 15], "3g no anchor: a bill lands on the 1st and the 15th");
  t.eq(incomeDays({ label: "Pay", amount: "1000", freq: "semimonthly" }, 2026, 1), [1, 15], "3h …and so does an income");

  // ── 4. The old formula is gone ────────────────────────────────────────────────────────────────
  const src = fs.readFileSync(path.join(__dirname, "..", "src", "lib", "financialCalculations.js"), "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, ""); // code only; a comment may still name the old rule
  t.ok(!/% 28\)/.test(code), "4a no ((d1 + 14) % 28) + 1 rule remains in financialCalculations.js");
  t.ok((code.match(/semimonthlyDays\(/g) || []).length >= 3, "4b billNextDue and billOccursOnDate both call semimonthlyDays");

  t.summary("semimonthlyOneRule.test");
})();
