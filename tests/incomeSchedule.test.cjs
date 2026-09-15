// tests/incomeSchedule.test.cjs
// -----------------------------------------------------------------------------
// Truth-fix item 2: incomeSchedule is the ONE source of income timing. These tests
// pin the public facts other surfaces read — anchor detection, deposit dates, the
// NEXT FUTURE deposit (its date + amount + confidence), whether a deposit lands
// TODAY, and days-to-next. Frozen dates only; per-deposit amounts, never monthly.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");

(async () => {
  const sched = await import("../src/lib/incomeSchedule.js");
  const { findAnchor, anchorDayOf, depositDatesFor, nextFutureDeposit, daysToNextFutureDeposit, isDepositToday, perDepositAmount } = sched;
  const t = create();

  const paid = (date, amount, name = "ACME PAYROLL") => ({ name, amount: -amount, cat: "Income", date });
  const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  // ── findAnchor: most-recent matching deposit; amount OR name match ──────────────────────────────
  {
    const inc = { id: 1, label: "Full-time Job", amount: "2000", freq: "biweekly" };
    const txns = [paid("2026-05-18", 2000), paid("2026-06-01", 2000)];
    const a = findAnchor(inc, 2000, txns);
    t.eq(a && ymd(a), "2026-06-01", "findAnchor returns the MOST RECENT matching deposit");
    t.eq(findAnchor(inc, 2000, []), null, "findAnchor with no transactions → null");
    // amount 8% out of tolerance and no name overlap → no match
    t.eq(findAnchor({ label: "Side Gig", amount: "2500", freq: "biweekly" }, 2500, [paid("2026-06-01", 2000)]), null,
      "findAnchor rejects a deposit >8% off the amount with no name match");
    // name match path
    const byName = findAnchor({ label: "Acme Payroll", amount: "9999", freq: "biweekly" }, 9999, [paid("2026-06-01", 2000)]);
    t.eq(byName && ymd(byName), "2026-06-01", "findAnchor matches by name when the amount is far off");
  }

  // ── anchorDayOf: explicit wins → observed → 1 ──────────────────────────────────────────────────
  t.eq(anchorDayOf({ anchorDay: 25, amount: "3000", freq: "monthly" }, 3000, []), 25, "anchorDayOf: explicit anchorDay wins");
  t.eq(anchorDayOf({ label: "Acme Payroll", amount: "3000", freq: "monthly" }, 3000, [paid("2026-05-18", 3000)]), 18,
    "anchorDayOf: falls back to the observed deposit day (18)");
  t.eq(anchorDayOf({ label: "Mystery", amount: "3000", freq: "monthly" }, 3000, []), 1,
    "anchorDayOf: genuine no-signal → the 1st (last resort)");

  // ── depositDatesFor: biweekly steps by 14 from the anchor; monthly matches the anchor day ───────
  {
    const today = new Date(2026, 5, 5, 12, 0, 0); // Jun 5 2026
    const inc = { id: 1, label: "Full-time Job", amount: "2000", freq: "biweekly" };
    const dates = depositDatesFor(inc, 2000, [paid("2026-06-01", 2000)], today, 30).map(ymd);
    t.eq(dates.join(","), "2026-06-15,2026-06-29", "depositDatesFor: biweekly advances 14 days from the anchor within the horizon");

    const m = depositDatesFor({ label: "Salary", amount: "3000", freq: "monthly", anchorDay: 25 }, 3000, [], today, 40).map(ymd);
    t.eq(m.join(","), "2026-06-25", "depositDatesFor: monthly matches the anchor day within the horizon");
  }

  // ── nextFutureDeposit: real date + per-deposit amount + label + confidence; earliest wins ───────
  {
    const today = new Date(2026, 5, 5, 12, 0, 0);
    const incomes = [{ id: 1, label: "Full-time Job", amount: "2840", freq: "biweekly" }];
    const txns = [paid("2026-06-01", 2840, "PAYROLL DEPOSIT")];
    const n = nextFutureDeposit(incomes, txns, today);
    t.eq(n && ymd(n.date), "2026-06-15", "nextFutureDeposit: the next FUTURE deposit date");
    t.eq(n && n.amount, 2840, "nextFutureDeposit: PER-DEPOSIT amount (never the monthly figure)");
    t.eq(n && n.sourceLabel, "Full-time Job", "nextFutureDeposit: carries the income label");
    t.eq(n && n.confidence, "high", "nextFutureDeposit: high confidence when phased off real history");
    t.eq(daysToNextFutureDeposit(incomes, txns, today), 10, "daysToNextFutureDeposit: 10 days (Jun 5 → Jun 15)");
  }

  // ── A deposit landing TODAY is excluded from nextFutureDeposit but true for isDepositToday ──────
  {
    const incomes = [{ id: 1, label: "Full-time Job", amount: "2840", freq: "biweekly" }];
    const txns = [paid("2026-06-01", 2840)];
    const payday = new Date(2026, 5, 15, 9, 0, 0); // Jun 15 = anchor + 14 → a deposit lands today
    t.eq(isDepositToday(incomes, txns, payday), true, "isDepositToday: true on a real cadence day");
    const n = nextFutureDeposit(incomes, txns, payday);
    t.eq(n && ymd(n.date), "2026-06-29", "nextFutureDeposit skips today's deposit (already in the balance) → the NEXT one");
    t.eq(isDepositToday(incomes, txns, new Date(2026, 5, 16, 9, 0, 0)), false, "isDepositToday: false off-cadence");
  }

  // ── Two income streams: the earliest future deposit wins ───────────────────────────────────────
  {
    const today = new Date(2026, 5, 5, 12, 0, 0);
    const incomes = [
      { id: 1, label: "Full-time Job", amount: "2840", freq: "biweekly" },       // next Jun 15
      { id: 2, label: "Canada Child Benefit", amount: "560", freq: "monthly", anchorDay: 20 }, // next Jun 20
    ];
    const txns = [paid("2026-06-01", 2840)];
    const n = nextFutureDeposit(incomes, txns, today);
    t.eq(n && ymd(n.date), "2026-06-15", "two streams → the sooner deposit (Jun 15) wins");
    t.eq(n && n.amount, 2840, "…and reports that stream's amount");
    t.eq(nextFutureDeposit([], txns, today), null, "no incomes → null (never a fabricated date)");
  }

  // ── Monthly isDepositToday + estimated confidence with no anchor ────────────────────────────────
  t.eq(isDepositToday([{ label: "Salary", amount: "3000", freq: "monthly", anchorDay: 25 }], [], new Date(2026, 5, 25, 9, 0, 0)), true,
    "isDepositToday: monthly matches today's day-of-month");
  {
    const today = new Date(2026, 5, 5, 12, 0, 0);
    const n = nextFutureDeposit([{ label: "New Job", amount: "1500", freq: "biweekly" }], [], today);
    t.eq(n && n.confidence, "estimated", "confidence is 'estimated' when there is no anchor to phase off");
    t.eq(n && ymd(n.date), "2026-06-19", "no-anchor biweekly counts forward from today (Jun 5 + 14 = Jun 19)");
  }

  // ── perDepositAmount: the REAL per-deposit figure from the record, never a monthly division ─────
  t.eq(perDepositAmount({ amount: "2840", freq: "biweekly" }), 2840, "perDepositAmount reads the per-deposit amount straight from the record");
  t.eq(perDepositAmount({ amount: "2,840" }), 2840, "perDepositAmount parses a comma amount via num");
  t.eq(perDepositAmount({ amount: "2000", freq: "biweekly" }), 2000, "perDepositAmount is the stream's OWN per-deposit, independent of any other stream (no blended division)");
  t.eq(perDepositAmount({ amount: "0" }), null, "perDepositAmount: a non-positive amount → null (unknown, not an estimate)");
  t.eq(perDepositAmount(null), null, "perDepositAmount: no record → null");
  t.eq(perDepositAmount({}), null, "perDepositAmount: no amount field → null");

  t.summary("incomeSchedule.test");
})();
