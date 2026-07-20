// tests/forecastIncomes.test.cjs
// -----------------------------------------------------------------------------
// N-income projection in src/lib/forecastEngine.js.
//
// The engine used to project ONLY incomes[0] with a weekly/biweekly cadence and filter every other
// income down to monthly/semimonthly, so a second biweekly earner (the Add Income default) vanished
// from the forecast entirely. These tests pin the unified behaviour: every income is projected on its
// own cadence and its own anchor, none is privileged, and day 0 credits nothing for any of them.
//
// Frozen dates only. Fixtures carry no spending transactions, so avgDailySpend is 0 and every
// projected balance is exact to the dollar.
// -----------------------------------------------------------------------------
"use strict";

const { create } = require("./_runner.cjs");

(async () => {
  const { ForecastEngine } = await import("../src/lib/forecastEngine.js");
  const t = create();

  const sumIncome = (fc) => fc.reduce((s, d) => s + d.income, 0);
  const chq = (balance) => ([{ id: "chq", name: "Chequing", type: "depository", subtype: "checking", balance }]);

  // ═══════════════════════════════════════════════════════════════════════════
  // 1 — TWO BIWEEKLY INCOMES (the dual-earner case the old filter dropped)
  // No transactions => no anchor => both fall back to today+14, today+28, ...
  // ═══════════════════════════════════════════════════════════════════════════
  {
    const today = new Date(2026, 2, 10, 12, 0, 0); // Tue Mar 10 2026
    const data = {
      accounts: chq(1000),
      incomes: [
        { id: 1, label: "Earner One", amount: "2000", freq: "biweekly" },
        { id: 2, label: "Earner Two", amount: "600",  freq: "biweekly" },
      ],
      bills: [], debts: [], transactions: [],
    };
    const { forecast } = ForecastEngine.generate(data, 30, null, today);

    t.eq(forecast[14].income, 2600,
         "two biweekly incomes both land on day 14 and SUM ($2000 + $600). The second earner used to " +
         "be filtered out entirely because only monthly/semimonthly secondaries were kept.");
    t.eq(forecast[28].income, 2600, "and again on day 28 — the second earner recurs, not just once");
    t.eq(sumIncome(forecast), 5200, "30-day total is 2 x $2,600 — neither earner is dropped or double-counted");
    t.eq(forecast[30].balance, 6200, "$1,000 opening + $5,200 projected income");
    t.eq(forecast[13].income, 0, "no income on a non-payday");
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 2 — WEEKLY + MONTHLY MIXED (different cadence families in one household)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    const today = new Date(2026, 2, 10, 12, 0, 0); // Tue Mar 10 2026
    const data = {
      accounts: chq(500),
      incomes: [
        { id: 1, label: "Weekly Shifts", amount: "500",  freq: "weekly" },
        { id: 2, label: "Salary",        amount: "3000", freq: "monthly" },
      ],
      bills: [], debts: [], transactions: [],
    };
    const { forecast } = ForecastEngine.generate(data, 30, null, today);

    t.eq(forecast[7].income,  500, "weekly income lands on day 7");
    t.eq(forecast[14].income, 500, "weekly income lands on day 14");
    t.eq(forecast[21].income, 500, "weekly income lands on day 21");
    t.eq(forecast[28].income, 500, "weekly income lands on day 28");
    t.eq(forecast[22].income, 3000,
         "monthly income lands on Apr 1 (day 22) — a monthly income alongside a weekly one is projected " +
         "on its own cadence, not forced onto the weekly schedule");
    t.eq(sumIncome(forecast), 5000, "30-day total is 4 x $500 weekly + 1 x $3,000 monthly");
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 3 — THREE INCOMES, THREE DIFFERENT ANCHORS
  // Each income finds its OWN last deposit and phases off it, so the three land on
  // three different days. A single global anchor would collapse them onto one day.
  // ═══════════════════════════════════════════════════════════════════════════
  {
    const today = new Date(2026, 2, 10, 12, 0, 0); // Tue Mar 10 2026
    const paid = (date, amount, name) => ({ name, amount: -amount, cat: "Income", date });
    const data = {
      accounts: chq(0),
      incomes: [
        { id: 1, label: "Acme Payroll",  amount: "2000", freq: "biweekly" },
        { id: 2, label: "Beta Payroll",  amount: "1500", freq: "biweekly" },
        { id: 3, label: "Gamma Payroll", amount: "1000", freq: "biweekly" },
      ],
      bills: [], debts: [],
      transactions: [
        paid("2026-03-02", 2000, "ACME PAYROLL"),   // -> next Mar 16 = day 6
        paid("2026-03-05", 1500, "BETA PAYROLL"),   // -> next Mar 19 = day 9
        paid("2026-03-09", 1000, "GAMMA PAYROLL"),  // -> next Mar 23 = day 13
      ],
    };
    const { forecast } = ForecastEngine.generate(data, 30, null, today);

    t.eq(forecast[6].income,  2000, "income 1 is phased off ITS anchor (Mar 2 + 14 = Mar 16, day 6)");
    t.eq(forecast[9].income,  1500, "income 2 is phased off ITS anchor (Mar 5 + 14 = Mar 19, day 9)");
    t.eq(forecast[13].income, 1000, "income 3 is phased off ITS anchor (Mar 9 + 14 = Mar 23, day 13)");
    t.ok(forecast[6].income !== forecast[9].income && forecast[9].income !== forecast[13].income,
         "the three land on three DIFFERENT days — anchors are resolved per income, not once globally");
    t.eq(forecast[20].income, 2000, "income 1 recurs 14 days later (day 20)");
    t.eq(forecast[23].income, 1500, "income 2 recurs 14 days later (day 23)");
    t.eq(forecast[27].income, 1000, "income 3 recurs 14 days later (day 27)");
    t.eq(sumIncome(forecast), 9000, "30-day total is 2 x ($2000 + $1500 + $1000) — all three, twice");
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 4 — DAY 0 CREDITS NOTHING, FOR EVERY CADENCE
  // Today is the 1st: a monthly (day 1), a semimonthly (days 1 & 15) and a biweekly
  // income are all "due" today. The starting balance already contains them.
  // ═══════════════════════════════════════════════════════════════════════════
  {
    const today = new Date(2026, 3, 1, 12, 0, 0); // Wed Apr 1 2026 — the 1st
    const data = {
      accounts: chq(3000),
      incomes: [
        { id: 1, label: "Monthly Salary", amount: "1000", freq: "monthly" },
        { id: 2, label: "Semi Monthly",   amount: "500",  freq: "semimonthly" },
        { id: 3, label: "Biweekly Gig",   amount: "800",  freq: "biweekly" },
      ],
      bills: [], debts: [], transactions: [],
    };
    const { forecast } = ForecastEngine.generate(data, 30, null, today);

    t.eq(forecast[0].income, 0,
         "day 0 credits NO income for ANY cadence — today's deposits are already in the posted balance. " +
         "This guard previously applied to incomes[0] only, so monthly/semimonthly secondaries " +
         "double-counted on the 1st and left a permanent overstatement across the whole horizon.");
    t.eq(forecast[0].balance, 3000, "day-0 balance equals the real opening balance, with nothing invented");
    t.eq(forecast[0].isPayday, false, "day 0 is never flagged a payday");
    t.eq(forecast[14].income, 1300,
         "day 14 (Apr 15) sums the semimonthly $500 AND the biweekly $800 fallback — guarding day 0 " +
         "does not suppress genuine future paydays, and co-landing incomes add rather than overwrite");
    t.eq(forecast[14].isPayday, true, "a day with income IS flagged a payday");
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 5 — NO INCOME PRIVILEGED BY POSITION
  // Reversing the array must not change the forecast. Under the old code incomes[0]
  // was the only one projected on a weekly/biweekly cadence, so order mattered.
  // ═══════════════════════════════════════════════════════════════════════════
  {
    const today = new Date(2026, 2, 10, 12, 0, 0);
    const mk = (incomes) => ({ accounts: chq(1000), incomes, bills: [], debts: [], transactions: [] });
    const a = { id: 1, label: "Alpha", amount: "2000", freq: "biweekly" };
    const b = { id: 2, label: "Bravo", amount: "900",  freq: "weekly" };

    const fwd = ForecastEngine.generate(mk([a, b]), 30, null, today).forecast;
    const rev = ForecastEngine.generate(mk([b, a]), 30, null, today).forecast;

    t.eq(sumIncome(fwd), sumIncome(rev),
         "total projected income is identical whichever income is listed first — position confers no " +
         "privilege now that there is no incomes[0] special case");
    t.eq(fwd.map(d => d.income).join(","), rev.map(d => d.income).join(","),
         "the full day-by-day income series is identical under reordering, not merely the total");
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 6 — A SINGLE INCOME STILL BEHAVES (no regression for the common case)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    const today = new Date(2026, 2, 10, 12, 0, 0);
    const data = {
      accounts: chq(1200),
      incomes: [{ id: 1, label: "Only Job", amount: "1800", freq: "biweekly" }],
      bills: [], debts: [], transactions: [],
    };
    const { forecast } = ForecastEngine.generate(data, 30, null, today);
    t.eq(forecast[14].income, 1800, "single biweekly income still lands on day 14");
    t.eq(sumIncome(forecast), 3600, "single biweekly income still totals 2 paydays over 30 days");
    t.eq(forecast[0].income, 0, "single income still skips day 0");
  }

  t.summary("forecastIncomes.test");
})();
