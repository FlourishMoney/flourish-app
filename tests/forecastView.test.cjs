// tests/forecastView.test.cjs
// -----------------------------------------------------------------------------
// Sprint C Fix 3 — the payday drill-down must display the forecast EVENT's income, not the monthly
// cashFlow total.
//
// The collapsed forecast row showed ev.income (the $2,000 the forecast credited that day), but the
// expanded "💰 Paycheck" breakdown rendered monthlyIncome (~$4,333 for a biweekly earner). Both are
// now derived from the event via paydayLineAmount(ev), which never even receives the monthly total —
// so it is structurally impossible for the two to disagree again.
//
// Frozen dates only.
// -----------------------------------------------------------------------------
"use strict";

const { create } = require("./_runner.cjs");

(async () => {
  const { paydayLineAmount } = await import("../src/lib/forecastView.js");
  const { ForecastEngine } = await import("../src/lib/forecastEngine.js");
  const { FinancialCalcEngine } = await import("../src/lib/financialCalculations.js");
  const t = create();

  // ── Unit: the helper returns exactly the event income ───────────────────────────────────────────
  t.eq(paydayLineAmount({ income: 2000 }), 2000,
       "a biweekly event's $2,000 is returned as-is — the helper cannot return a monthly total, it " +
       "only receives the event");
  t.eq(paydayLineAmount({ income: 5000 }), 5000, "a monthly event shows its own $5,000");
  t.eq(paydayLineAmount({ income: 2600 }), 2600,
       "a combined same-day event ($2000 + $600) shows the combined $2,600, not a re-derived figure");
  t.eq(paydayLineAmount({ income: 0 }), 0, "a zero-income day yields 0");
  t.eq(paydayLineAmount({}), 0, "an event with no income field yields 0 (no NaN)");
  t.eq(paydayLineAmount(null), 0, "a null event yields 0");
  t.eq(paydayLineAmount({ income: NaN }), 0, "a NaN income yields 0, never 'NaN'");
  t.eq(paydayLineAmount({ income: -50 }), 0, "a negative income is not shown as a paycheck");

  const chq = (b) => ([{ id: "chq", name: "Chequing", type: "depository", subtype: "checking", balance: b }]);
  const TODAY = new Date(2026, 2, 10, 12, 0, 0);

  // ── Integration: biweekly earner — drill-down amount is the PER-DEPOSIT figure, not the monthly ──
  {
    const data = {
      accounts: chq(1000),
      incomes: [{ id: 1, label: "Job", amount: "2000", freq: "biweekly" }],
      bills: [], debts: [], transactions: [],
    };
    const { forecast } = ForecastEngine.generate(data, 30, null, TODAY);
    const payday = forecast.find(e => e.isPayday);
    t.ok(!!payday, "the biweekly forecast has a payday event");
    t.eq(paydayLineAmount(payday), 2000,
         "the drill-down shows the $2,000 the forecast credited — the per-deposit amount");

    const monthly = FinancialCalcEngine.cashFlow(data, {}, TODAY).monthlyIncome;
    t.ok(Math.round(monthly) > 4000,
         "sanity: the monthly cashFlow total (~$4,333) is the WRONG number the drill-down used to show");
    t.ok(paydayLineAmount(payday) !== Math.round(monthly),
         "the drill-down amount is NOT the monthly total — this is the exact defect being prevented");
  }

  // ── Integration: collapsed row and expanded breakdown share ONE numeric source ──────────────────
  {
    const data = {
      accounts: chq(500),
      incomes: [{ id: 1, label: "Job", amount: "1800", freq: "biweekly" }],
      bills: [], debts: [], transactions: [],
    };
    const { forecast } = ForecastEngine.generate(data, 30, null, TODAY);
    for (const ev of forecast.filter(e => e.isPayday)) {
      // The collapsed row renders ev.income; the drill-down renders paydayLineAmount(ev). Equal by
      // construction — the whole point of routing both through the same helper.
      t.eq(paydayLineAmount(ev), ev.income,
           "collapsed row (ev.income) and expanded drill-down (paydayLineAmount) use the same source");
    }
  }

  // ── Integration: two incomes landing the same day → combined ev.income shown ─────────────────────
  {
    // No transactions → both biweekly incomes fall back to today+14, today+28 → they co-land and sum.
    const data = {
      accounts: chq(1000),
      incomes: [
        { id: 1, label: "Main", amount: "2000", freq: "biweekly" },
        { id: 2, label: "Side", amount: "600",  freq: "biweekly" },
      ],
      bills: [], debts: [], transactions: [],
    };
    const { forecast } = ForecastEngine.generate(data, 20, null, TODAY);
    const combined = forecast.find(e => e.isPayday);
    t.eq(combined.income, 2600, "the two same-day deposits sum in the event to $2,600");
    t.eq(paydayLineAmount(combined), 2600,
         "the drill-down shows the combined $2,600 — the exact ev.income, not one deposit or a monthly total");
  }

  // ── A monthly earner's drill-down shows the event amount (== the monthly deposit) ───────────────
  {
    const data = {
      accounts: chq(1000),
      incomes: [{ id: 1, label: "Salary", amount: "5000", freq: "monthly", anchorDay: 20 }],
      bills: [], debts: [], transactions: [],
    };
    const { forecast } = ForecastEngine.generate(data, 40, null, TODAY);
    const payday = forecast.find(e => e.isPayday);
    t.eq(paydayLineAmount(payday), 5000,
         "for a monthly earner the per-deposit amount equals the monthly amount — the drill-down shows $5,000");
  }

  t.summary("forecastView.test");
})();
