// tests/cross_surface.test.cjs
// -----------------------------------------------------------------------------
// Truth-fix item 10: the cross-surface acceptance suite. MATH-LOCK tests the engines;
// this pins the FACTS that reach screens. It freezes one snapshot + one date and drives
// only the PRODUCTION selectors every surface consumes — SafeSpendEngine, ForecastEngine,
// incomeSchedule, FinancialCalcEngine, decisionEngine and the item-5 view-model — asserting
// they AGREE on each shared fact (so no surface can be deriving its own), that displayed
// rows reconcile to their displayed total, and that safe-to-spend and the suggested daily
// number are never the same fact. No calculation is re-implemented in this file.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");

(async () => {
  const { SafeSpendEngine } = await import("../src/lib/safeSpendEngine.js");
  const { ForecastEngine } = await import("../src/lib/forecastEngine.js");
  const { safeToSpendView } = await import("../src/lib/safeToSpendView.js");
  const { nextFutureDeposit, daysToNextFutureDeposit, isDepositToday, perDepositAmount } = await import("../src/lib/incomeSchedule.js");
  const { FinancialCalcEngine, toMonthly } = await import("../src/lib/financialCalculations.js");
  const { suggestedDailyView } = await import("../src/lib/suggestedDaily.js");
  const t = create();

  const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const iso = (d) => ymd(d);

  // ONE place computes ALL the facts a surface would read. Every surface calls these same selectors.
  function facts(snap, date) {
    const ss = SafeSpendEngine.calculate(snap, date);
    const view = safeToSpendView(ss);
    const nd = nextFutureDeposit(snap.incomes, snap.transactions, date);
    const days = daysToNextFutureDeposit(snap.incomes, snap.transactions, date);
    const today = isDepositToday(snap.incomes, snap.transactions, date);
    const fc = ForecastEngine.generate(snap, 45, null, date);
    const cf = FinancialCalcEngine.cashFlow(snap, {}, date);
    const pace = suggestedDailyView(view.headline, snap.incomes, snap.transactions, date); // the ONE daily pace helper
    const firstPayday = fc.forecast.find(f => f.day > 0 && f.income > 0) || null;
    return { ss, view, nd, days, today, fc, cf, pace, firstPayday };
  }

  // The invariants that must hold for ANY snapshot/date — the heart of "one fact, one source".
  function assertConsistent(label, snap, date) {
    const f = facts(snap, date);

    // ONE balance — the displayed balance is the floor of the single engine balance, nothing else.
    t.eq(f.view.balanceDisplay, Math.floor(f.ss.balance), `${label}: one balance (display = floor of the engine balance)`);

    // ONE safe-to-spend value, and the displayed rows reconcile EXACTLY to the displayed headline.
    const rowSum = f.view.rows.reduce((s, r) => s + (r.kind === "balance" ? r.display : -r.display), 0);
    t.eq(rowSum, f.view.headline, `${label}: displayed breakdown rows sum to the displayed headline`);
    t.eq(f.view.headlineText, "$" + f.view.headlineNumber, `${label}: one displayed safe-to-spend string (text == $ + number)`);

    if (f.nd) {
      // ONE next-payday DATE — the forecast (Plan Ahead) and nextFutureDeposit (Decisions/Today) agree.
      t.eq(iso(f.firstPayday.date), iso(f.nd.date), `${label}: Plan Ahead's next payday == the next future deposit (one date)`);
      // ONE next-payday AMOUNT — a per-deposit amount, present in the forecast on that day.
      t.ok(f.firstPayday.income >= f.nd.amount - 0.5, `${label}: the forecast credits the next-deposit amount on that day (one amount)`);
      // days-to-payday is consistent with the date.
      t.eq(f.days, Math.round((new Date(iso(f.nd.date)) - new Date(iso(date))) / 86400000), `${label}: daysToNextFutureDeposit matches the date`);
      // A deposit that lands today is excluded from the FUTURE deposit (never counted twice).
      t.ok(iso(f.nd.date) !== iso(date), `${label}: the next FUTURE deposit is never today (today's money is already in the balance)`);
    }

    // ONE normalised monthly income — and it is NOT the per-deposit amount (the item 4 bug).
    if (f.nd && (snap.incomes || []).length === 1) {
      const inc = snap.incomes[0];
      t.eq(f.cf.monthlyIncome, toMonthly(inc.amount, inc.freq), `${label}: one normalised monthly income (from the canonical converter)`);
      if (inc.freq === "biweekly" || inc.freq === "weekly") {
        t.ok(f.cf.monthlyIncome !== f.nd.amount, `${label}: monthly income != per-deposit amount (never call a monthly figure a deposit)`);
      }
      // The per-deposit amount a surface would show equals incomeSchedule's value — never a monthly division.
      t.eq(perDepositAmount(inc), f.nd.amount, `${label}: the per-deposit amount == incomeSchedule's next-deposit amount (single stream)`);
    }

    // safe-to-spend and the suggested daily number are DIFFERENT facts: the daily is the headline paced
    // over a floored horizon, strictly smaller for any non-trivial headline, never the same number.
    t.ok(f.pace.daysLeft >= 14, `${label}: the suggested-daily divisor is floored at 14 (item 7)`);
    if (f.view.headline > 14) {
      t.ok(f.pace.daily < f.view.headline, `${label}: suggested daily < safe-to-spend — two different facts, never conflated`);
    }

    // Consolidation 1/3: ONE suggested daily pace. A weekly figure is EXACTLY daily*7 (never a second
    // division of safe), and the number is single-valued given the facts — every surface reads this helper.
    t.eq(f.pace.weekly, f.pace.daily * 7, `${label}: weekly pace == daily * 7 exactly (no second division of safe)`);
    if (f.view.headline > 14) {
      t.ok(f.pace.daily <= Math.floor(f.view.headline / 7), `${label}: daily pace uses the floored divisor (<= the old safe/7 number) — one number on every surface`);
    }
    const paceAgain = suggestedDailyView(f.view.headline, snap.incomes, snap.transactions, date);
    t.eq(paceAgain.daily, f.pace.daily, `${label}: the daily pace is single-valued — Today and Decisions get the same figure`);

    // Consolidation 2/3: ONE normalised monthly income — produced solely by the shared toMonthly converter.
    t.eq(f.cf.monthlyIncome, (snap.incomes || []).reduce((s, i) => s + toMonthly(i.amount, i.freq), 0),
      `${label}: one normalised monthly income (only toMonthly produces it)`);

    return f;
  }

  // ── Base snapshot: a realistic household whose biweekly deposits do NOT fall on the 1st or 15th ──
  const P = (date, amt) => ({ name: "Payroll Deposit", amount: -amt, cat: "Income", date });
  const spend = (date, amt, name = "Groceries") => ({ name, amount: amt, cat: "Groceries", date });
  const BASE = {
    accounts: [{ id: "c", type: "checking", balance: "3000" }, { id: "s", type: "savings", balance: "1000" }],
    bills: [{ name: "Rent", amount: "1200", date: "1", freq: "monthly", type: "fixed" }, { name: "Phone", amount: "60", date: "20", freq: "monthly", type: "fixed" }],
    debts: [{ name: "Visa", balance: "3000", rate: "19.99", min: "60" }],
    incomes: [{ id: 1, label: "Job", amount: "2000", freq: "biweekly" }],
    transactions: [P("2026-06-10", 2000), P("2026-06-24", 2000), spend("2026-06-12", 80), spend("2026-06-18", 120)],
    bankConnected: true,
  };

  // ── Consistency across four frozen calendar dates (1st / 14th / 15th / 28th) ────────────────────
  for (const d of ["2026-07-01", "2026-07-14", "2026-07-15", "2026-07-28"]) {
    assertConsistent(`base@${d}`, BASE, new Date(d + "T12:00:00"));
  }

  // ── Calendar moved, money did not: isDepositToday must NOT fire on the 1st/15th just because of the
  //    date. The old heuristic (today===1||today===15) did exactly that; the real cadence is Jun10+14k. ──
  t.eq(isDepositToday(BASE.incomes, BASE.transactions, new Date("2026-07-01T12:00:00")), false, "no phantom payday on the 1st (real cadence is elsewhere)");
  t.eq(isDepositToday(BASE.incomes, BASE.transactions, new Date("2026-07-15T12:00:00")), false, "no phantom payday on the 15th (real cadence is elsewhere)");
  // A REAL cadence day (Jun 24 + 14 = Jul 8) does fire.
  t.eq(isDepositToday(BASE.incomes, BASE.transactions, new Date("2026-07-08T12:00:00")), true, "payday fires on the REAL cadence day (Jul 8)");

  // ── Edge case: deposit lands TODAY ─────────────────────────────────────────────────────────────
  {
    const date = new Date("2026-06-24T12:00:00"); // a payroll lands today
    const f = assertConsistent("deposit-today", BASE, date);
    t.eq(f.today, true, "deposit-today: isDepositToday true");
    t.eq(iso(f.nd.date), "2026-07-08", "deposit-today: next FUTURE deposit is +14 (Jul 8), not today");
  }

  // ── Edge case: deposit lands TOMORROW ──────────────────────────────────────────────────────────
  {
    const date = new Date("2026-07-07T12:00:00"); // next cadence step (Jun 24 + 14 = Jul 8) is tomorrow
    const f = assertConsistent("deposit-tomorrow", BASE, date);
    t.eq(f.days, 1, "deposit-tomorrow: daysToNextFutureDeposit == 1");
    t.eq(iso(f.nd.date), "2026-07-08", "deposit-tomorrow: next deposit is Jul 8");
    t.eq(f.today, false, "deposit-tomorrow: no deposit today");
  }

  // ── Edge case: deposit 14+ days out — the case that exposed the horizon bug (reservations scale) ─
  {
    const monthly = {
      ...BASE,
      incomes: [{ id: 1, label: "Salary", amount: "4000", freq: "monthly", anchorDay: 1 }],
      transactions: [spend("2026-06-05", 300), spend("2026-06-10", 300)], // avgDaily > 0 so the buffer is visible
    };
    const date = new Date("2026-06-15T12:00:00"); // next deposit is Jul 1 = 16 days out
    const f = assertConsistent("deposit-14plus", monthly, date);
    t.ok(f.days >= 14, "deposit-14plus: horizon is 14+ days");
    // The reservation scales to the real horizon: buffer + savings both reflect ~16 days, not 10.
    const ten = SafeSpendEngine.calculate({ ...monthly, incomes: [] }, date); // no income => 10-day fallback
    t.ok(f.ss.safetyBuf > ten.safetyBuf, "deposit-14plus: safety buffer reserves MORE than the 10-day fallback (scales to the 16-day horizon)");
    t.ok(f.ss.savingsAlloc > 0 && f.ss.savingsAlloc === Math.round(4000 * 0.10 / 30 * f.days), "deposit-14plus: savings allocation scales to the real horizon");
  }

  // ── Edge case: two income streams — the earliest future deposit wins, consistently ──────────────
  {
    const two = {
      ...BASE,
      incomes: [
        { id: 1, label: "Job", amount: "2000", freq: "biweekly" },                 // Jul 8 (from Jun 24 anchor)
        { id: 2, label: "CCB", amount: "500", freq: "monthly", anchorDay: 3 },       // Jul 3
      ],
    };
    const date = new Date("2026-06-30T12:00:00");
    const f = assertConsistent("two-streams", two, date);
    t.eq(iso(f.nd.date), "2026-07-03", "two-streams: the sooner deposit (CCB, Jul 3) wins");
    t.eq(f.nd.amount, 500, "two-streams: reports that stream's per-deposit amount");
    // item 3: the displayed "Est. paycheque" names incomes[0] and must equal ITS real per-deposit amount,
    // NOT a share of the blended monthly total (the surviving item-4 bug this fix removes).
    const pay = perDepositAmount(two.incomes[0]);
    t.eq(pay, 2000, "two-streams: the primary paycheque is incomes[0]'s REAL per-deposit (2000)");
    t.ok(Math.abs(pay - (f.cf.monthlyIncome / 2.167)) > 100,
      "two-streams: it is NOT the blended monthly / cadence (~2231) — a manufactured paycheque is gone");
    t.eq(pay, perDepositAmount(two.incomes[0]), "two-streams: the paycheque equals incomeSchedule's per-deposit for the named stream");
    // When no per-deposit can be determined, incomeSchedule says so (null) — a surface must show an unknown, never estimate.
    t.eq(perDepositAmount(undefined), null, "no income record → per-deposit is unknown (null), never a derived guess");
    t.eq(perDepositAmount({ amount: "0" }), null, "a non-positive amount → unknown (null)");
  }

  // ── Edge case: an income with NO matching anchor in history (fallback, estimated confidence) ────
  {
    const noAnchor = {
      ...BASE,
      incomes: [{ id: 1, label: "New Gig", amount: "1500", freq: "biweekly" }],
      transactions: [spend("2026-06-05", 100)], // no payroll deposit matches the income
    };
    const date = new Date("2026-06-15T12:00:00");
    const f = assertConsistent("no-anchor", noAnchor, date);
    t.eq(f.nd.confidence, "estimated", "no-anchor: confidence is 'estimated' (counted forward from today)");
    t.eq(iso(f.nd.date), "2026-06-29", "no-anchor: falls back to today + 14");
  }

  t.summary("cross_surface.test");
})();
