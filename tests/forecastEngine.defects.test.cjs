// tests/forecastEngine.defects.test.cjs
// -----------------------------------------------------------------------------
// DEFECT-DEMONSTRATION suite for src/lib/forecastEngine.js.
//
// Every assertion below states the CORRECT behaviour. They therefore FAIL against
// today's code — each failure is a real production defect, not a test bug.
//
// Frozen dates only (never `new Date()` with no args): ForecastEngine.generate takes
// `today` as its 4th argument. Dates use noon to stay clear of DST edges.
//
// Fixtures carry NO transactions, so FinancialCalcEngine.avgDailySpend(data) === 0 and
// SafeSpendEngine.calculate(data, today).balance is the plain sum of the cash accounts.
// That makes every projected balance exact to the dollar.
// -----------------------------------------------------------------------------
"use strict";

const { create } = require("./_runner.cjs");

(async () => {
  const { ForecastEngine } = await import("../src/lib/forecastEngine.js");
  const t = create();

  const sumIncome = (fc) => fc.reduce((s, d) => s + d.income, 0);
  const sumExpenses = (fc) => fc.reduce((s, d) => s + d.expenses, 0);

  // ═══════════════════════════════════════════════════════════════════════════
  // F1 — Secondary monthly income is credited on day 0 (double-count on the 1st)
  //
  // getSecondary(dayNum) is called with NO `i > 0` guard, unlike the primary income
  // whose isPayday is `i > 0 && paydayDates.has(...)`. When the forecast starts on a
  // day matching the secondary's deposit day, that deposit is added to day 0 — but
  // day 0's balance is the ALREADY-BANKED balance, so the money is counted twice.
  // ═══════════════════════════════════════════════════════════════════════════
  {
    const today = new Date(2026, 0, 1, 12, 0, 0); // Thu Jan 1 2026, noon — the 1st
    const data = {
      accounts: [
        { id: "chq", name: "Everyday Chequing", type: "depository", subtype: "checking", balance: 5000 },
      ],
      incomes: [
        { label: "Acme Payroll", amount: 3000, freq: "monthly", anchorDay: 1 }, // primary
        { label: "Rental Suite", amount: 800,  freq: "monthly", anchorDay: 1 }, // secondary
      ],
      bills: [],
      debts: [],
      transactions: [],
    };

    const days = 90; // Jan 1 → Apr 1 2026
    const { forecast } = ForecastEngine.generate(data, days, null, today);

    // ── Baselines: prove the fixture is well-formed ──────────────────────────
    t.eq(forecast.length, days + 1, "F1 baseline: forecast covers days 0..90 inclusive");
    t.eq(forecast[31].date.getMonth(), 1, "F1 baseline: day 31 is in February (Feb 1 2026)");
    t.eq(forecast[31].date.getDate(), 1, "F1 baseline: day 31 is the 1st of the month");
    t.eq(forecast[31].isPayday, true, "F1 baseline: Feb 1 IS a payday for the monthly primary income");
    t.eq(forecast[31].income, 3800,
      "F1 baseline: on a real payday BOTH incomes deposit (3000 primary + 800 secondary = $3800)");
    t.eq(forecast[0].expenses, 0,
      "F1 baseline: day 0 has no bills and avgDailySpend is 0, so day-0 expenses are $0");

    // ── The defect ───────────────────────────────────────────────────────────
    t.eq(forecast[0].income, 0,
      "F1 DEFECT: day 0 must credit NO income — the starting balance already contains today's " +
      "money. The secondary monthly income ($800, anchorDay 1) is deposited on day 0 anyway, " +
      "inventing $800 that does not exist. Note the PRIMARY income correctly skips day 0 " +
      "(isPayday is gated on i > 0) — only the secondary path is unguarded.");

    t.eq(forecast[0].isPayday, false,
      "F1: day 0 is correctly NOT flagged isPayday — yet income is credited anyway, so the " +
      "$800 is invisible in the UI's payday markers while still inflating the balance.");

    t.eq(forecast[0].balance, 5000,
      "F1 DEFECT: day-0 balance must equal the starting cash balance of $5000. It is overstated " +
      "by the phantom $800 secondary deposit.");

    // The overstatement is not transient — it rides the running balance to the horizon.
    // Correct: 5000 start + 3 primary paydays (Feb 1, Mar 1, Apr 1 = $9000)
    //               + 3 secondary deposits (Feb 1, Mar 1, Apr 1 = $2400) = $16,400.
    t.eq(sumIncome(forecast), 11400,
      "F1 DEFECT: total projected income over 90 days must be $11,400 (3 x $3000 primary + " +
      "3 x $800 secondary). A 4th phantom secondary deposit on day 0 inflates it to $12,200.");

    t.eq(forecast[days].balance, 16400,
      "F1 DEFECT: the day-90 balance must be $16,400. The day-0 double-count persists to the " +
      "horizon, overstating the user's projected cash by $800 on EVERY day of the forecast — " +
      "which can hide a genuine overdraft.");
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // F2 — Monthly income with anchorDay 31 is silently DROPPED in short months
  //
  // Payday projection tests `d2.getDate() === payDay` with no clamp to month length.
  // February has no 31st, so a payday anchored on the 31st never fires: the user's
  // whole February paycheque vanishes from the forecast.
  //
  // Bills anchored on day 31 go through billOccursOnDate, which DOES clamp
  // (`Math.min(dueDay, _daysInMonth(...))`). Same calendar, same day-of-month, opposite
  // treatment: money out is charged, money in is not. The asymmetry is the bug.
  // ═══════════════════════════════════════════════════════════════════════════
  {
    const today = new Date(2026, 1, 1, 12, 0, 0); // Sun Feb 1 2026, noon (2026 is NOT a leap year)
    const data = {
      accounts: [
        { id: "chq", name: "Everyday Chequing", type: "depository", subtype: "checking", balance: 4000 },
      ],
      incomes: [
        { label: "Acme Payroll", amount: 2500, freq: "monthly", anchorDay: 31 },
      ],
      bills: [
        { name: "Rent", amount: 1500, date: "31", freq: "monthly", type: "recurring" },
      ],
      debts: [],
      transactions: [],
    };

    const days = 27; // Feb 1 (day 0) .. Feb 28 (day 27) — stays entirely inside February
    const { forecast } = ForecastEngine.generate(data, days, null, today);
    const lastDay = forecast[days];

    // ── Baselines: prove the fixture is well-formed ──────────────────────────
    t.eq(lastDay.date.getMonth(), 1, "F2 baseline: the final forecast day is still in February");
    t.eq(lastDay.date.getDate(), 28, "F2 baseline: the final forecast day is Feb 28 2026");
    t.eq(forecast[0].balance, 4000, "F2 baseline: day-0 balance equals the $4000 starting cash");

    // ── Baseline that proves the ASYMMETRY: the day-31 BILL clamps to Feb 28 ──
    t.eq(lastDay.expenses, 1500,
      "F2 baseline: the day-31 RENT bill correctly clamps to Feb 28 and is charged ($1500)");
    t.eq(sumExpenses(forecast), 1500,
      "F2 baseline: exactly one $1500 rent charge lands inside February");

    // ── The defect: the day-31 INCOME does not clamp ─────────────────────────
    t.eq(lastDay.isPayday, true,
      "F2 DEFECT: a monthly income with anchorDay 31 must be paid on Feb 28 (clamped to the last " +
      "day of a short month), exactly as the day-31 rent bill above is. It is never flagged as a " +
      "payday, so February shows zero paydays.");

    t.eq(lastDay.income, 2500,
      "F2 DEFECT: Feb 28 must deposit the $2500 paycheque. It deposits $0 — the entire month's " +
      "income is dropped because February has no 31st and the payday test does not clamp.");

    t.eq(sumIncome(forecast), 2500,
      "F2 DEFECT: total projected February income must be $2500. It is $0 — a full paycheque " +
      "missing from the forecast.");

    t.eq(lastDay.balance, 5000,
      "F2 DEFECT: the Feb 28 balance must be $4000 - $1500 rent + $2500 pay = $5000. The forecast " +
      "charges the clamped rent but omits the clamped pay, reporting $2500 — understating the " +
      "user's cash by $2500 and manufacturing a false cash-crunch/overdraft warning every " +
      "February (and in any 30-day month for anchorDay 31).");
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // F3 — Only the FIRST income is projected; additional weekly/biweekly incomes
  //      are dropped entirely
  //
  // `paycheque` is derived from `incomes[0]` alone, and `secondaryMo` filters
  // incomes.slice(1) down to freq monthly/semimonthly. A second BIWEEKLY (or weekly)
  // income therefore matches neither path and contributes $0 to the forecast — every
  // dual-income household is under-forecast.
  // ═══════════════════════════════════════════════════════════════════════════
  {
    const today = new Date(2026, 0, 1, 12, 0, 0); // Thu Jan 1 2026, noon
    const data = {
      accounts: [
        { id: "chq", name: "Everyday Chequing", type: "depository", subtype: "checking", balance: 2000 },
      ],
      incomes: [
        { label: "Acme Payroll",  amount: 2000, freq: "biweekly" }, // primary
        { label: "Partner Wages", amount: 600,  freq: "biweekly" }, // second earner — dropped
      ],
      bills: [],
      debts: [],
      transactions: [],
    };

    const days = 90;
    const { forecast } = ForecastEngine.generate(data, days, null, today);

    // With no matching deposit transactions the engine falls back to counting forward from
    // `today` at the cadence: paydays land on days 14, 28, 42, 56, 70, 84 → 6 paydays.
    const paydays = forecast.filter(d => d.isPayday);

    // ── Baselines: prove the fixture is well-formed ──────────────────────────
    t.eq(forecast[0].balance, 2000, "F3 baseline: day-0 balance equals the $2000 starting cash");
    t.eq(paydays.length, 6, "F3 baseline: a biweekly cadence yields 6 paydays in a 90-day horizon");
    t.eq(paydays.map(d => d.day), [14, 28, 42, 56, 70, 84],
      "F3 baseline: paydays fall on days 14/28/42/56/70/84");
    t.ok(forecast[14].income >= 2000,
      "F3 baseline: the PRIMARY biweekly income of $2000 does appear on its payday");

    // ── The defect ───────────────────────────────────────────────────────────
    const daysWithIncome = forecast.filter(d => d.income > 0).length;
    t.eq(daysWithIncome, 6,
      "F3: both biweekly incomes share the same paydays, so exactly 6 days carry income");

    t.eq(forecast[14].income, 2600,
      "F3 DEFECT: day 14 must deposit BOTH biweekly incomes ($2000 + $600 = $2600). Only " +
      "incomes[0] is projected; the second earner's $600 is silently dropped because " +
      "secondaryMo only admits freq monthly/semimonthly.");

    t.eq(sumIncome(forecast), 15600,
      "F3 DEFECT: total projected income over 90 days must be $15,600 (6 x $2600). It is " +
      "$12,000 — short by exactly $3,600, the second income's entire contribution " +
      "(6 paydays x $600).");

    t.eq(forecast[days].balance, 17600,
      "F3 DEFECT: the day-90 balance must be $2000 + $15,600 = $17,600. The forecast reports " +
      "$14,000, understating a dual-income household's projected cash by $3,600 and triggering " +
      "spurious low-balance / overdraft warnings.");
  }

  t.summary("forecastEngine.defects.test");
})();
