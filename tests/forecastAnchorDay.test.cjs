// tests/forecastAnchorDay.test.cjs
// -----------------------------------------------------------------------------
// anchorDay derivation + clamping.
//
// Two defects are pinned here:
//   (a) anchorDay was READ (forecastEngine) but WRITTEN NOWHERE, so `inc.anchorDay || 1` always
//       evaluated to 1 and every monthly income silently landed on the 1st.
//   (b) the payday test used exact equality (d.getDate() === payDay) while bills clamp via
//       clampDayToMonth, so an anchor of 31 vanished entirely in Feb/Apr/Jun/Sep/Nov.
//
// Frozen dates only. No spending transactions, so avgDailySpend is 0 and balances are exact.
// -----------------------------------------------------------------------------
"use strict";

const { create } = require("./_runner.cjs");

(async () => {
  const { ForecastEngine } = await import("../src/lib/forecastEngine.js");
  const { clampDayToMonth, daysInMonth } = await import("../src/lib/financialCalculations.js");
  const pn = await import("../src/lib/plaidNormalize.js");
  const t = create();

  const chq = (balance) => ([{ id: "chq", name: "Chequing", type: "depository", subtype: "checking", balance }]);
  const sumIncome = (fc) => fc.reduce((s, d) => s + d.income, 0);
  const dayOf = (fc, y, m, d) => fc.find(e =>
    e.date.getFullYear() === y && e.date.getMonth() === m && e.date.getDate() === d);

  // ── The shared clamp helper itself ─────────────────────────────────────────────────────────────
  t.eq(daysInMonth(2026, 1), 28, "Feb 2026 has 28 days (not a leap year)");
  t.eq(daysInMonth(2028, 1), 29, "Feb 2028 has 29 days (leap year)");
  t.eq(clampDayToMonth(31, 2026, 1), 28, "day 31 clamps to Feb 28 in a non-leap year");
  t.eq(clampDayToMonth(31, 2028, 1), 29, "day 31 clamps to Feb 29 in a leap year");
  t.eq(clampDayToMonth(31, 2026, 3), 30, "day 31 clamps to Apr 30 in a 30-day month");
  t.eq(clampDayToMonth(15, 2026, 1), 15, "a day that exists is returned unchanged");
  t.eq(clampDayToMonth(0, 2026, 1), 1, "day 0 floors to 1 rather than underflowing");

  // ── (b) CLAMPING — anchorDay 31 across short months ────────────────────────────────────────────
  {
    // Start Jan 15 2026 and run far enough to cross Feb (28d), Mar (31d) and Apr (30d).
    const today = new Date(2026, 0, 15, 12, 0, 0);
    const data = {
      accounts: chq(4000),
      incomes: [{ id: 1, label: "Month End Salary", amount: "2500", freq: "monthly", anchorDay: 31 }],
      bills: [], debts: [], transactions: [],
    };
    const { forecast } = ForecastEngine.generate(data, 120, null, today);

    t.eq(dayOf(forecast, 2026, 0, 31).income, 2500, "anchorDay 31 pays on Jan 31 (a month that has a 31st)");
    t.eq(dayOf(forecast, 2026, 1, 28).income, 2500,
         "anchorDay 31 pays on Feb 28 in a NON-LEAP year — clamped to the last day rather than skipped. " +
         "Exact equality dropped a whole month's pay here.");
    t.eq(dayOf(forecast, 2026, 2, 31).income, 2500, "anchorDay 31 pays on Mar 31");
    t.eq(dayOf(forecast, 2026, 3, 30).income, 2500,
         "anchorDay 31 pays on Apr 30 — clamped in a 30-day month (Apr/Jun/Sep/Nov all behaved this way)");
    t.eq(dayOf(forecast, 2026, 1, 27).income, 0, "no phantom pay the day BEFORE the clamped Feb date");
    t.eq(sumIncome(forecast), 10000, "four consecutive months each pay exactly once — none dropped, none doubled");
  }

  // ── Leap year: anchorDay 31 must land on Feb 29 ────────────────────────────────────────────────
  {
    const today = new Date(2028, 0, 15, 12, 0, 0); // 2028 IS a leap year
    const data = {
      accounts: chq(1000),
      incomes: [{ id: 1, label: "Salary", amount: "2000", freq: "monthly", anchorDay: 31 }],
      bills: [], debts: [], transactions: [],
    };
    const { forecast } = ForecastEngine.generate(data, 60, null, today);
    t.eq(dayOf(forecast, 2028, 1, 29).income, 2000, "anchorDay 31 pays on Feb 29 in a LEAP year");
    t.eq(dayOf(forecast, 2028, 1, 28).income, 0, "and NOT on Feb 28 — the clamp targets the real last day");
  }

  // ── anchorDay 30 in February ───────────────────────────────────────────────────────────────────
  {
    const today = new Date(2026, 1, 1, 12, 0, 0);
    const data = {
      accounts: chq(1000),
      incomes: [{ id: 1, label: "Salary", amount: "1500", freq: "monthly", anchorDay: 30 }],
      bills: [], debts: [], transactions: [],
    };
    const { forecast } = ForecastEngine.generate(data, 27, null, today);
    t.eq(dayOf(forecast, 2026, 1, 28).income, 1500, "anchorDay 30 also clamps to Feb 28");
  }

  // ── A real mid-month anchor is honoured (the phase bug) ────────────────────────────────────────
  {
    const today = new Date(2026, 4, 1, 12, 0, 0); // May 1 2026
    const data = {
      accounts: chq(2000),
      incomes: [{ id: 1, label: "Salary", amount: "3000", freq: "monthly", anchorDay: 25 }],
      bills: [], debts: [], transactions: [],
    };
    const { forecast } = ForecastEngine.generate(data, 40, null, today);
    t.eq(dayOf(forecast, 2026, 4, 25).income, 3000, "a monthly income anchored to the 25th pays on the 25th");
    t.eq(dayOf(forecast, 2026, 4, 1).income, 0,
         "and NOT on the 1st — every monthly income used to be forced onto the 1st because anchorDay " +
         "was read but never written, so the whole cash-flow phase was wrong for mid-month earners");
  }

  // ── (a) DERIVATION from irregular observed deposits ────────────────────────────────────────────
  {
    // Paid the 25th, but weekends/holidays pull some deposits earlier (never later).
    const paid = (date, amount) => ({ name: "ACME PAYROLL", amount: -amount, cat: "Income", date });
    const det = pn.detectIncomeFromTxns([
      paid("2026-01-23", 3000), // Jan 25 was a Sunday -> paid Fri 23
      paid("2026-02-25", 3000),
      paid("2026-03-25", 3000),
      paid("2026-04-24", 3000), // Apr 25 was a Saturday -> paid Fri 24
      paid("2026-05-25", 3000),
    ]);
    t.eq(det.anchorDay, 25,
         "anchorDay is the MODAL deposit day (25), not the mean (24.4). Deposits shift earlier for " +
         "weekends and holidays but never later, so the mode is the true scheduled day.");

    // Month-boundary case: a mean would be catastrophically wrong here.
    const boundary = pn.detectIncomeFromTxns([
      paid("2026-02-01", 2000), paid("2026-03-01", 2000),
      paid("2026-05-01", 2000), paid("2026-03-31", 2000), // one landed on the prior month's 31st
    ]);
    t.eq(boundary.anchorDay, 1,
         "pay on the 1st that occasionally lands on the 31st still derives anchorDay 1 — a mean would " +
         "report the 9th and phase the entire forecast wrong");

    // Tie-break goes to the LATEST day, for the same shift-earlier reason.
    const tie = pn.detectIncomeFromTxns([paid("2026-01-14", 1000), paid("2026-02-15", 1000)]);
    t.eq(tie.anchorDay, 15, "a tie breaks to the LATEST day, since shifts only ever move payment earlier");
  }

  // ── Derived anchorDay actually drives the forecast, end to end ─────────────────────────────────
  {
    const paid = (date, amount) => ({ name: "ACME PAYROLL", amount: -amount, cat: "Income", date });
    const txns = [paid("2026-03-20", 4000), paid("2026-04-20", 4000), paid("2026-05-20", 4000)];
    const det = pn.detectIncomeFromTxns(txns);
    const today = new Date(2026, 5, 1, 12, 0, 0); // Jun 1 2026
    const data = {
      accounts: chq(1000),
      incomes: [{ id: 1, label: det.label, amount: String(det.perDeposit), freq: "monthly", anchorDay: det.anchorDay }],
      bills: [], debts: [], transactions: txns,
    };
    const { forecast } = ForecastEngine.generate(data, 40, null, today);
    t.eq(det.anchorDay, 20, "detection reports the 20th");
    t.eq(dayOf(forecast, 2026, 5, 20).income, 4000, "and the forecast pays on the 20th, end to end");
  }

  // ── No explicit anchorDay: fall back to the observed deposit day, then to the 1st ──────────────
  {
    const paid = (date, amount) => ({ name: "ACME PAYROLL", amount: -amount, cat: "Income", date });
    const today = new Date(2026, 5, 1, 12, 0, 0);
    const withSignal = {
      accounts: chq(1000),
      incomes: [{ id: 1, label: "Acme Payroll", amount: "4000", freq: "monthly" }], // no anchorDay
      bills: [], debts: [],
      transactions: [paid("2026-05-18", 4000)],
    };
    const fc1 = ForecastEngine.generate(withSignal, 40, null, today).forecast;
    t.eq(dayOf(fc1, 2026, 5, 18).income, 4000,
         "with no explicit anchorDay the engine falls back to the day of this income's OBSERVED deposit " +
         "(the 18th) — findAnchor is reused, so there is one anchor concept rather than two competing ones");

    const noSignal = {
      accounts: chq(1000),
      incomes: [{ id: 1, label: "Mystery Pay", amount: "4000", freq: "monthly" }],
      bills: [], debts: [], transactions: [],
    };
    const fc2 = ForecastEngine.generate(noSignal, 40, null, today).forecast;
    t.eq(dayOf(fc2, 2026, 5, 1).income, 0, "day 0 is still guarded even on the fallback path");
    t.eq(dayOf(fc2, 2026, 6, 1).income, 4000,
         "with genuinely NO signal — no anchorDay, no deposits — it falls back to the 1st, as a last " +
         "resort rather than as the de-facto default it used to be");
  }

  // ── Semimonthly still pays twice, and clamps ───────────────────────────────────────────────────
  {
    const today = new Date(2026, 0, 5, 12, 0, 0);
    const dflt = {
      accounts: chq(1000),
      incomes: [{ id: 1, label: "Semi", amount: "1200", freq: "semimonthly" }],
      bills: [], debts: [], transactions: [],
    };
    const fc = ForecastEngine.generate(dflt, 40, null, today).forecast;
    t.eq(dayOf(fc, 2026, 0, 15).income, 1200, "semimonthly with no anchor keeps the historical 15th");
    t.eq(dayOf(fc, 2026, 1, 1).income, 1200, "…and the 1st");

    const anchored = {
      accounts: chq(1000),
      incomes: [{ id: 1, label: "Semi", amount: "1200", freq: "semimonthly", anchorDay: 15 }],
      bills: [], debts: [], transactions: [],
    };
    const fc2 = ForecastEngine.generate(anchored, 60, null, today).forecast;
    t.eq(dayOf(fc2, 2026, 0, 15).income, 1200, "semimonthly anchored to the 15th pays on the 15th");
    t.eq(dayOf(fc2, 2026, 0, 30).income, 1200, "…and ~15 days later (the 30th)");
    t.eq(dayOf(fc2, 2026, 1, 28).income, 1200,
         "…and that second date clamps to Feb 28 rather than vanishing (15 + 15 = 30 > 28)");
  }

  t.summary("forecastAnchorDay.test");
})();
