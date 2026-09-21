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
  const { FinancialCalcEngine, toMonthly, isCashAccount, baseCurrencyOf, num } = await import("../src/lib/financialCalculations.js");
  const { formatBalance, formatMoney } = await import("../src/lib/format.js");
  const { AutopilotEngine } = await import("../src/lib/decisionEngine.js");
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
    const plan = AutopilotEngine.generate(snap, {}, date); // the Autopilot card's whole input
    const firstPayday = fc.forecast.find(f => f.day > 0 && f.income > 0) || null;
    return { ss, view, nd, days, today, fc, cf, pace, plan, firstPayday };
  }

  // The invariants that must hold for ANY snapshot/date — the heart of "one fact, one source".
  function assertConsistent(label, snap, date) {
    const f = facts(snap, date);

    // ONE balance — the displayed balance is the floor of the single engine balance, nothing else.
    t.eq(f.view.balanceDisplay, Math.floor(f.ss.balance), `${label}: one balance (display = floor of the engine balance)`);

    // THE DEFECT THAT SHIPPED: Today rendered "In your accounts $3,083" while Watch rendered
    // "STARTING BALANCE $3084" — same engine read, two rounding rules. Every surface that shows THE
    // balance must render the IDENTICAL string.
    const todayBalanceRow = f.view.rows.find(r => r.kind === "balance");
    t.eq(todayBalanceRow.value, f.view.balanceText, `${label}: Today's "In your accounts" === Watch's "Starting balance" string`);
    t.eq(f.view.balanceText, formatBalance(f.ss.balance), `${label}: …and both are formatBalance(engine balance)`);
    t.eq(f.view.balanceText, formatBalance(f.fc.forecast[0].balance), `${label}: …and the Watch day-0 forecast row renders it identically too`);

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

    // ONE daily pace across all THREE surfaces that print it. Week-2 defect a: the Autopilot card
    // divided the engine's raw safeAmount by the TRUE days to payday while Today and Decisions
    // divided the displayed headline by a divisor floored at 14. Same label, two numbers — and on
    // the day before payday the card offered a fortnight's money as one day's spending.
    t.eq(f.plan.dailySpendLimit, f.pace.daily, `${label}: Autopilot's daily figure IS the one pace (Today/Decisions read the same)`);
    t.eq(formatMoney(f.plan.dailySpendLimit), f.pace.dailyText, `${label}: …and the three surfaces print an identical string`);
    t.eq(f.plan.daysLeft, f.pace.daysLeft, `${label}: …over the same window, so the card's "for the next N days" is that pace's window`);
    t.ok(f.plan.daysLeft >= 14, `${label}: …which is never below the 14-day floor`);

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

  // ── WHICH ACCOUNTS MAKE UP THE BALANCE — the rule the transparency panel must obey ──────────────
  // The "how is this calculated" panel listed accounts with a DENY-list (everything that is not credit
  // or investment), ignored currency, and summed with parseFloat. On a simple demo household it agreed
  // with the engine by luck; on a household with a loan/mortgage account or foreign cash it did not —
  // on the single screen whose entire job is to be trusted. These pin the selection rule itself, so any
  // surface that lists "accounts used for your balance" can be checked against it.
  {
    const MIXED = {
      ...BASE,
      profile: { country: "CA" },
      accounts: [
        { id: "c",  type: "checking",   balance: "3000.88" },
        { id: "s",  type: "savings",    balance: "1000.50" },
        { id: "us", type: "checking",   balance: "5000", currency: "USD" }, // real money, no FX source
        { id: "m",  type: "mortgage",   balance: "-450000" },               // a LIABILITY, not spendable cash
        { id: "l",  type: "loan",       balance: "-8200" },
        { id: "i",  type: "investment", balance: "12480" },
        { id: "cc", type: "credit",     balance: "-3420" },
      ],
    };
    const date = new Date("2026-07-14T12:00:00");
    const ss = SafeSpendEngine.calculate(MIXED, date);
    const base = baseCurrencyOf(MIXED);

    // The panel's own filter, written exactly as the surface writes it.
    const listed = MIXED.accounts.filter(a => isCashAccount(a) && String(a.currency || "CAD").toUpperCase() === base);
    t.eq(listed.map(a => a.id).join(","), "c,s", "balance accounts: the cash ALLOW-list — no mortgage, no loan, no investment, no foreign cash");
    t.eq(listed.reduce((s, a) => s + num(a.balance), 0), ss.balance, "…and the listed accounts sum EXACTLY to the engine's balance (rows cannot disagree with their own total)");

    // The old deny-list, reproduced here only to prove it really did diverge.
    const denyList = MIXED.accounts.filter(a => a.type !== "credit" && a.type !== "investment");
    const denySum = denyList.reduce((s, a) => s + parseFloat(a.balance || 0), 0);
    t.ok(denySum !== ss.balance, "the old deny-list genuinely disagreed with the engine (it is not a formatting difference)");
    t.eq(Math.round(denySum), -449199, "…it swept a mortgage and a loan into 'available balance' and showed a household with $4,001 as deeply negative");

    // Rounding directions on this panel: cash DOWN, credit owed UP, net = the difference of the two
    // DISPLAYED figures — so the subtraction printed on screen is arithmetically true.
    const creditAccts = MIXED.accounts.filter(a => a.type === "credit" || a.type === "credit card" || a.subtype === "credit card" || a.type === "line of credit");
    const creditOwed  = creditAccts.reduce((s, a) => s + Math.abs(num(a.balance)), 0);
    const cashShown   = Math.floor(ss.balance);
    const creditShown = Math.ceil(creditOwed);
    t.eq(formatBalance(ss.balance), "$4,001", "displayed cash rounds DOWN from 4001.38 — never overstate what is there");
    t.eq(cashShown - creditShown, 581, "net cash = displayed cash − displayed credit owed, so the on-screen equation adds up");
    t.eq(ss.excludedForeignCash, 5000, "the excluded foreign cash is reported by the engine, so the panel can say what it left out");
    t.eq(ss.mixedCurrencyDetected, true, "…and flagged, rather than silently dropped");
  }

  t.summary("cross_surface.test");
})();
