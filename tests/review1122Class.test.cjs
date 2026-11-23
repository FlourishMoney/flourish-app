// tests/review1122Class.test.cjs
// -----------------------------------------------------------------------------
// FULL-APP REVIEW OF 2026-11-22: CLASSIFICATION, FORECAST, INCOME AND BILL DETECTION.
//
// Three outside reviewers read the code (ChatGPT, Grok, Gemini). Each finding in this area is proved
// here against the real code: a REAL one by a worked example that was wrong before its fix, a NOT
// REAL one by a test that shows the thing it describes cannot happen.
//
//   G4      "How we got this number" stated monthly income from the amount typed, not the going rate
//           every other screen uses (a change from a date on, a stopped income, pay that varies).
//   P6-01   (with P7-04, P8-03, P9-04) the money meeting, the same panel's Spending tab, the Family
//           spending check and the coach's context read the category a transaction ARRIVED with, not
//           the one the household corrected it to.
//   P6-02   the money meeting dropped any charge with "autopay" in its name as a card payment.
//   P4-05   (with P6-03) a what-if purchase on a Time Machine day was printed as daily spending.
//   P4-06   budget suggestions read "based on your spending" for a household with no recent spending.
//   P5-05   a bill reminder was skipped for the whole month once any payment that month matched.
//   P5-09   two employers paying similar amounts were phased on one employer's pay dates.
//   P8-01   changing a bill's type or how often it is due dropped the amounts the household corrected.
//   P9-06   an amount typed in Settings, Bills was not remembered as a correction.
//   P7-05   the US student loan interest tip was shown only to students.
//   P10-04, P10-05  detection ran again only when the NUMBER of transactions changed.
//   NOT REAL: P8-04 (the income banner already reads the classified deposits), P6-04 (before a
//   purchase there is no provider date; after it the provider's own date is shown), and the watch
//   range half of P6-03 (Watch never runs a what-if).
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const { loadApp, textOf } = require("./_renderApp.cjs");
const fs = require("fs");
const path = require("path");

const REPO = path.join(__dirname, "..");
const APP = fs.readFileSync(path.join(REPO, "src", "App.jsx"), "utf8");
const DAY = 86400000;
const pad = (n) => String(n).padStart(2, "0");
const isoOfDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const agoFrom = (now) => (days) => isoOfDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - days, 12));
// The text of one top-level function of App.jsx (from its name to the next top-level function).
const fnText = (name) => {
  const at = APP.indexOf(`function ${name}(`);
  if (at < 0) return "";
  const next = APP.indexOf("\nfunction ", at + 10);
  return APP.slice(at, next < 0 ? APP.length : next);
};
const tryLoad = (names) => { try { return loadApp(names); } catch { return null; } };

(async () => {
  const t = create();
  const WR = await import("../src/lib/weeklyReview.js");
  const MS = await import("../src/lib/meetSnapshot.js");
  const CO = await import("../src/lib/categoryOverrides.js");
  const F = await import("../src/lib/financialCalculations.js");
  const FE = await import("../src/lib/forecastEdits.js");
  const FW = await import("../src/lib/forecastWalk.js");
  const { ForecastEngine } = await import("../src/lib/forecastEngine.js");
  const BB = await import("../src/lib/budgetBasis.js");
  const NP = await import("../src/lib/notificationPlanner.js");
  const IS = await import("../src/lib/incomeSchedule.js");
  const BR = await import("../src/lib/billReeval.js");
  const PN = await import("../src/lib/plaidNormalize.js");
  const RL = await import("../src/lib/reconcileLoop.js");
  const DC = await import("../src/lib/depositClassify.js");
  const TP = await import("../src/lib/trialPlanFirst.js");

  // Existing names in one bundle; the helpers the fixes add in another, so a missing one is a failed
  // assertion here and not a suite that cannot load.
  const A = tryLoad(["DataTransparencyPanel", "detectPayroll", "getPersonalizedTaxCredits", "generateBudgetSuggestions"]);
  const H = tryLoad(["transparencySpendSplit", "familyTopSpend", "coachRecentSpend"]);
  t.ok(!!A, "0a App.jsx loads");

  // ── G4. "How we got this number": monthly income is the going rate, as every other screen has it ──
  {
    const now = new Date();
    const base = { profile: { country: "CA" }, accounts: [], bills: [], transactions: [] };
    // Pay that varies: $3,000 typed, $2,500 expected. The engine counts the low end.
    const varies = { ...base, incomes: [{ id: 1, label: "Shift work", amount: "3000", freq: "biweekly", isVariable: true, expectedAmount: "2500" }] };
    const engineVaries = F.FinancialCalcEngine.cashFlow(varies, {}, now).monthlyIncome;
    t.eq([engineVaries.toFixed(0), F.toMonthly(3000, "biweekly").toFixed(0)], ["5417", "6501"],
      "G4a the engine's monthly income for pay that varies is its low end ($2,500 each pay = $5,417 a month), not the typed $3,000 ($6,501)");
    // A change from a date on: $2,000 typed, $2,400 from 2020 on.
    const changed = { ...base, incomes: [{ id: 7, label: "Day job", amount: "2000", freq: "biweekly" }],
      forecastEdits: { series: { "income:7": [{ from: "2020-01-01", amount: 2400 }] } } };
    const engineChanged = F.FinancialCalcEngine.cashFlow(changed, {}, now).monthlyIncome;
    t.eq([engineChanged.toFixed(0), F.toMonthly(2000, "biweekly").toFixed(0)], ["5201", "4334"],
      "G4b the engine's monthly income after a change from a date on is the new amount ($2,400 each pay = $5,201 a month), not the old $4,334");
    if (A) {
      const panel = (data) => textOf(A.render(A.h(A.DataTransparencyPanel, { data, onClose: () => {} })));
      const v = panel(varies);
      t.ok(v.includes("Total monthly income $5417"), "G4c the panel's total is the engine's $5,417");
      t.ok(!v.includes("$6501"), "G4d the typed pay's $6,501 a month appears nowhere on it");
      t.ok(/\$2500\.00 [a-z0-9 -]+ = \$5417\/mo/.test(v), "G4e the row's own sum is true: $2,500.00 each pay = $5,417 a month");
      const c = panel(changed);
      t.ok(c.includes("Total monthly income $5201") && !c.includes("$4334"), "G4f a change from a date on: the panel says $5,201, not the old $4,334");
      // An ordinary income is exactly as before.
      const plain = panel({ ...base, incomes: [{ id: 2, label: "Salary", amount: "2000", freq: "biweekly" }] });
      t.ok(plain.includes("Total monthly income $4334") && /\$2000\.00 [a-z0-9 -]+ = \$4334\/mo/.test(plain), "G4g an income with no correction reads as it always did ($2,000.00 each pay = $4,334 a month)");
    }
    t.ok(/monthlyIncomeBasis\(i, ?data, ?now\)/.test(fnText("DataTransparencyPanel")), "G4h the panel reads forecastEdits.monthlyIncomeBasis, the helper cashFlow reads");
  }

  // ── P6-01. The money meeting counts the week by the category the household corrected to ──────────
  const now = new Date(2026, 10, 22, 12);          // Sunday November 22, 2026
  const ago = agoFrom(now);
  {
    const txns = [];
    // Four ordinary weeks behind this one: three $50 meals out each week, $150 a week.
    for (let w = 2; w <= 5; w++) for (let d = 1; d <= 3; d++) txns.push({ id: `b${w}${d}`, name: "Bean There", cat: "Other", amount: 50, date: ago((w - 1) * 7 + d) });
    // The week just gone: the same three meals, and the rent, which the bank filed under Shopping.
    for (let d = 1; d <= 3; d++) txns.push({ id: `w${d}`, name: "Bean There", cat: "Other", amount: 50, date: ago(d) });
    txns.push({ id: "rent1", name: "Maple Property Mgmt", cat: "Shopping", amount: 900, date: ago(4) });
    const overrides = { byId: { rent1: "Rent" }, byMerchant: { [CO.merchantKey("Bean There")]: "Coffee & Dining" } };
    const categoryOf = (x) => CO.effectiveCategory(x, overrides);
    t.eq([categoryOf(txns[0]), categoryOf(txns[txns.length - 1])], ["Coffee & Dining", "Rent"], "P6-01a the household's corrections: the meals are Coffee & Dining, the $900 is Rent");
    t.eq(WR.weekVersusUsual({ transactions: txns, now }), { thisWeek: 1050, normal: 150, delta: 900 },
      "P6-01b read by the bank's own categories the week is $900 over (the rent counted as shopping)");
    t.eq(WR.weekVersusUsual({ transactions: txns, now, categoryOf }), { thisWeek: 150, normal: 150, delta: 0 },
      "P6-01c read by the corrected categories the rent is a bill: $150 this week, $150 usual, no difference");
    t.eq(WR.categoryPaceDeltas({ transactions: txns, now, categoryOf }).map((d) => d.category), ["Coffee & Dining"],
      "P6-01d the category named is the corrected one, never \"Other\"");
    const snap = MS.buildMeetSnapshot({ transactions: txns, accounts: [], bills: [], incomes: [], catOverrides: overrides }, now);
    t.eq(snap.weekTotal, { thisWeek: 150, normal: 150, delta: 0 }, "P6-01e the meeting's snapshot carries the corrected week");
    t.eq(MS.buildMeetSnapshot({ transactions: txns, accounts: [], bills: [], incomes: [] }, now).weekTotal, { thisWeek: 1050, normal: 150, delta: 900 },
      "P6-01f with no corrections passed, every figure is as before");
    t.ok(/meetAgendaFor\(data\.demo \? data : \{ \.\.\.data, catOverrides: getCatOv\(\) \}\)/.test(APP),
      "P6-01g the Meet screen hands the household's corrections to the agenda");
    const legacy = MS.buildMeetSnapshot({ transactions: txns, accounts: [], bills: [], incomes: [], catOverrides: { rent1: "Rent" } }, now);
    t.eq(legacy.weekTotal, { thisWeek: 150, normal: 150, delta: 0 }, "P6-01h the older flat map of corrections (by transaction id) is read the same way");
  }

  // ── P7-04, P8-03, P9-04. The other three places that read the raw category ───────────────────────
  {
    const overrides = { byId: { t1: "Transfer", t2: "Groceries" }, byMerchant: {} };
    const categoryOf = (x) => CO.effectiveCategory(x, overrides);
    // A $500 card payment the bank filed under Shopping (corrected to Transfer), and $100 of groceries filed under Shopping.
    const rows = [
      { id: "t1", name: "Payment to card ending 4417", cat: "Shopping", amount: 500, date: ago(2) },
      { id: "t2", name: "Corner Market", cat: "Shopping", amount: 100, date: ago(3) },
    ];
    const split = H && H.transparencySpendSplit ? H.transparencySpendSplit(rows, categoryOf) : null;
    t.ok(!!split, "P7-04a the panel's Spending split is one function that takes the household's categories");
    if (split) {
      t.eq([split.included.map((x) => x.id), split.excluded.map((x) => x.id)], [["t2"], ["t1"]], "P7-04b the corrected card payment is excluded; the groceries are included");
      t.eq(split.included.reduce((s, x) => s + x.amount, 0), 100, "P7-04c total included spending is $100, not $600");
      const raw = H.transparencySpendSplit(rows);
      t.eq(raw.included.length, 2, "P7-04d (by the bank's categories alone both rows counted: the $600 the panel used to show)");
    }
    const panelSrc = fnText("DataTransparencyPanel");
    t.ok(/transparencySpendSplit\(thisMonthTxns, ?catOf\)/.test(panelSrc) && /effCat\(/.test(panelSrc) && !/catBreakdown\[t\.cat\]/.test(panelSrc),
      "P7-04e the panel splits and totals by the corrected category");

    const fam = H && H.familyTopSpend ? H.familyTopSpend(rows, categoryOf) : null;
    t.eq(fam, { Groceries: 100 }, "P8-03a the Family spending check: $100 of Groceries, and the card payment is not spending");
    t.ok(/familyTopSpend\(data\.transactions, ?\(?t\)? ?=> ?effCat\(/.test(fnText("Family")), "P8-03b the Family screen passes the corrected category");

    const coach = H && H.coachRecentSpend ? H.coachRecentSpend(rows, categoryOf) : null;
    t.eq(coach, { spending: 100, topCats: [["Groceries", 100]] }, "P9-04a the coach is told $100 of recent spending, top category Groceries");
    t.ok(/coachRecentSpend\(txns, ?\(?t\)? ?=> ?effCat\(/.test(fnText("AICoach")), "P9-04b the coach's context passes the corrected category");
  }

  // ── P6-02. "Autopay" alone is how a subscription is paid; it is spending ─────────────────────────
  {
    const d = ago(2);
    const spend = (name, cat = "Subscriptions") => WR.isDiscretionarySpend({ name, cat, amount: 30, date: d });
    t.eq(["Spotify Autopay", "Goodlife Fitness Autopay", "Netflix"].map((n) => spend(n)), [true, true, true],
      "P6-02a a subscription paid by autopay is spending in the week's review");
    t.eq(["RBC Visa Autopay", "CAPITAL ONE AUTOPAY PYMT", "Credit card payment", "PAYMENT - MASTERCARD PAYMENT"].map((n) => spend(n)), [false, false, false, false],
      "P6-02b autopay with a card word or a card issuer, and a card-payment phrase, is still a card payment");
    const txns = [];
    for (let w = 2; w <= 5; w++) for (let k = 1; k <= 3; k++) txns.push({ id: `a${w}${k}`, name: "Lunch Counter", cat: "Coffee & Dining", amount: 50, date: ago((w - 1) * 7 + k) });
    for (let k = 1; k <= 3; k++) txns.push({ id: `c${k}`, name: "Lunch Counter", cat: "Coffee & Dining", amount: 50, date: ago(k) });
    txns.push({ id: "gym", name: "Goodlife Fitness Autopay", cat: "Health", amount: 60, date: ago(2) });
    t.eq(WR.weekVersusUsual({ transactions: txns, now }), { thisWeek: 210, normal: 150, delta: 60 },
      "P6-02c a $60 gym charge paid by autopay is in the week: $210 against a usual $150");
  }

  // ── P4-05 with P6-03. A what-if purchase is its own line, not daily spending ─────────────────────
  {
    const today = new Date(2026, 10, 22, 12);
    const data = { accounts: [{ id: "a", name: "Chequing", type: "depository", subtype: "checking", balance: 3000 }],
      incomes: [], bills: [{ id: "r", name: "Rent", amount: "1200", freq: "monthly", date: "23", nextDueDate: "2026-11-23", createdAt: "2026-01-01" }],
      transactions: [], forecastEdits: { dailySpend: 33.46 } };
    const base = ForecastEngine.generate(data, 3, null, today);
    const what = ForecastEngine.generate(data, 3, { type: "purchase", amount: 500 }, today);
    t.eq(Math.round((base.forecast[1].balance - what.forecast[1].balance) * 100), 50000, "P4-05a a $500 what-if purchase lowers tomorrow's balance by exactly $500.00");
    t.eq(what.forecast[1].scenario, 500, "P4-05b the forecast day says how much of that was the what-if");
    t.ok(!("scenario" in base.forecast[1]) && !("scenario" in what.forecast[2]), "P4-05c a day with no what-if amount carries nothing new");
    const d1 = what.forecast[1];
    const walk = FW.forecastWalk({ opening: what.forecast[0].balance, income: 0, bills: d1.bills, avgDailySpend: 33.46, closing: d1.balance,
      scenario: d1.scenario, scenarioLabel: "$500 purchase" });
    const row = (k) => walk.rows.find((r) => r.key === k);
    t.eq(row("scenario") && [row("scenario").label, row("scenario").cents, row("scenario").sign], ["$500 purchase", 50000, "−"], "P4-05d the breakdown has a line for the $500.00 purchase");
    t.eq(row("spend").cents, 3346, "P4-05e \"Est. daily spend\" is $33.46, not $533.46");
    t.ok(walk.reconciles && walk.spendDriftCents <= 1, "P4-05f the printed sum still adds up to the cent");
    const plain = FW.forecastWalk({ opening: 3000, income: 0, bills: [{ name: "Rent", amount: 1200 }], avgDailySpend: 33.46, closing: 1766.54 });
    t.eq([plain.rows.map((r) => r.key), plain.spendCents], [["opening", "bill", "spend"], 3346], "P4-05g with no what-if the breakdown is exactly as before");
    t.ok(/scenario: ?ev\.scenario/.test(fnText("TimeMachine")), "P4-05h the Time Machine passes the day's what-if amount to the breakdown");
    // Watch (the range half of P6-03): no what-if ever reaches it.
    const calls = APP.match(/ForecastEngine\.generate\([^)]*\)/g) || [];
    t.eq(calls.filter((c) => /activeScenario/.test(c)).length, 1, "P6-03a one forecast call in the app takes a what-if: the Time Machine's");
    t.ok(/ForecastEngine\.generate\(data, 30, activeScenario\)/.test(fnText("TimeMachine")) && fnText("PlanAhead").includes("rangeSummary(") && fnText("watchRangeExplanation").includes("rangeSummary(")
      && !/activeScenario|scenario/i.test(fnText("PlanAhead") + fnText("watchRangeExplanation")),
      "P6-03b Watch's forecast and its range summary are built with no what-if");
  }

  // ── P4-06. Budget suggestions are "based on your spending" only with spending in the last 30 days ─
  {
    const today = new Date(2026, 10, 22, 12);
    const tx = (daysAgo, amount, cat) => ({ date: isoOfDate(new Date(today.getTime() - daysAgo * DAY)), amount, cat, name: cat });
    const old = { transactions: [tx(120, 400, "Groceries"), tx(110, 300, "Groceries"), tx(100, 80, "Coffee & Dining")] };
    t.eq(BB.observedMonthlySpend(old, today), {}, "P4-06a three purchases, all more than 90 days ago: nothing to average");
    t.eq([BB.budgetSuggestionBasis(old, today).basis, BB.budgetSuggestionBasis(old, today).label], ["typical", "Starting points"],
      "P4-06b …so the suggestions are labelled \"Starting points\", not \"Based on your spending over the last 90 days\"");
    const sofa = { transactions: [tx(35, 900, "Shopping")] };
    t.eq(BB.budgetSuggestionBasis(sofa, today).basis, "typical", "P4-06c one $900 purchase 35 days ago and nothing since is not a spending habit");
    const live = { transactions: [tx(45, 300, "Groceries"), tx(29, 50, "Coffee & Dining")] };
    t.eq(BB.budgetSuggestionBasis(live, today).basis, "observed", "P4-06d 46 days of history with spending 29 days ago is still observed");
    const t30 = { transactions: [tx(29, 300, "Groceries"), tx(10, 300, "Groceries"), tx(5, 60, "Coffee & Dining")] };
    t.eq([BB.ownHistoryDays(t30, today), BB.budgetSuggestionBasis(t30, today).basis, BB.observedMonthlySpend(t30, today)], [30, "observed", { "Groceries": 610, "Coffee & Dining": 60 }],
      "P4-06e the locked 30-day example is unchanged");
    if (A && A.generateBudgetSuggestions) {
      const real = new Date();
      const g = A.generateBudgetSuggestions({ profile: { country: "CA" }, incomes: [{ id: 1, amount: "2000", freq: "biweekly" }], bills: [], debts: [], goals: [],
        transactions: [{ date: isoOfDate(new Date(real.getTime() - 35 * DAY)), amount: 900, cat: "Shopping", name: "Sofa Shop" }] });
      t.ok(g.basis.basis === "typical" && g.suggestions.Groceries > 0 && g.suggestions.Shopping !== 785,
        "P4-06f that household keeps the full list of starting points (Groceries and the rest), not one $785 Shopping line");
    }
  }

  // ── P5-05. A reminder belongs to one due date; an earlier payment does not cancel the next one ───
  {
    const at = new Date(2026, 10, 17, 10);         // Tuesday November 17, 10:00
    const shell = { accounts: [], incomes: [] };
    const due = (list, name) => list.filter((n) => n.type === "billDue" && n.title === name).map((n) => isoOfDate(n.at));
    const weekly = { id: "dc", name: "Kinder Daycare", amount: "200", freq: "weekly", date: "20", nextDueDate: "2026-11-20", createdAt: "2026-01-01" };
    const paidWeekly = [{ id: "p1", date: "2026-11-06", name: "KINDER DAYCARE", amount: 200 }, { id: "p2", date: "2026-11-13", name: "KINDER DAYCARE", amount: 200 }];
    t.eq(due(NP.planNotifications({ ...shell, bills: [weekly], transactions: paidWeekly }, at), "Kinder Daycare"), ["2026-11-19"],
      "P5-05a a weekly bill paid on the 6th and 13th is still reminded the day before the 20th");
    const rent = { id: "rent", name: "Maple Property", amount: "1500", freq: "monthly", date: "1", nextDueDate: "2026-11-01", createdAt: "2026-01-01" };
    const paidRent = [{ id: "r1", date: "2026-11-01", name: "MAPLE PROPERTY", amount: 1500 }];
    t.eq(due(NP.planNotifications({ ...shell, bills: [rent], transactions: paidRent }, at), "Maple Property"), ["2026-11-30"],
      "P5-05b rent due the 1st and paid November 1 is reminded on November 30 for December 1");
    const early = [{ id: "e1", date: "2026-11-17", name: "KINDER DAYCARE", amount: 200 }];
    t.eq(due(NP.planNotifications({ ...shell, bills: [weekly], transactions: [...paidWeekly, ...early] }, new Date(2026, 10, 18, 10)), "Kinder Daycare"), [],
      "P5-05c the 20th's payment made three days early: no reminder for a bill already paid");
    const hydro = { id: "h", name: "City Hydro", amount: "90", freq: "monthly", date: "25", nextDueDate: "2026-11-25", createdAt: "2026-01-01" };
    t.eq(due(NP.planNotifications({ ...shell, bills: [hydro], transactions: [{ id: "h1", date: "2026-11-16", name: "CITY HYDRO", amount: 90 }] }, at), "City Hydro"), [],
      "P5-05d a monthly bill due the 25th and paid on the 16th: no reminder, as before");
    t.eq(due(NP.planNotifications({ ...shell, bills: [hydro], transactions: [] }, at), "City Hydro"), ["2026-11-24"], "P5-05e an unpaid bill is reminded the day before, as before");
    t.ok(typeof FE.billOccurrencePaid === "function" && FE.billOccurrencePaid(hydro, new Date(2026, 10, 25, 12), [{ id: "h1", date: "2026-11-16", name: "CITY HYDRO", amount: 90 }], at) === true,
      "P5-05f the planner asks the one \"already paid\" rule the forecast and safe to spend use (forecastEdits.js)");
  }

  // ── P5-09. Each income is phased from its own employer's deposits ────────────────────────────────
  {
    const dep = (date, amount, name) => ({ id: date + name, date, amount: -amount, name, cat: "Income" });
    const txns = [
      dep("2026-10-02", 2000, "ACME CORP PAYROLL"), dep("2026-10-16", 2000, "ACME CORP PAYROLL"), dep("2026-10-30", 2000, "ACME CORP PAYROLL"), dep("2026-11-13", 2000, "ACME CORP PAYROLL"),
      dep("2026-10-09", 2050, "GLOBEX PAYROLL"), dep("2026-10-23", 2050, "GLOBEX PAYROLL"), dep("2026-11-06", 2050, "GLOBEX PAYROLL"), dep("2026-11-20", 2050, "GLOBEX PAYROLL"),
    ];
    const acme = { id: 1, label: "Acme Corp", amount: "2000", freq: "biweekly" };
    const globex = { id: 2, label: "Globex", amount: "2050", freq: "biweekly" };
    const today = new Date(2026, 10, 22, 12);
    t.eq([isoOfDate(IS.findAnchor(acme, 2000, txns)), isoOfDate(IS.findAnchor(globex, 2050, txns))], ["2026-11-13", "2026-11-20"],
      "P5-09a two employers on alternate Fridays: Acme is phased from its own November 13 deposit, Globex from its November 20");
    const data = { incomes: [acme, globex], transactions: txns, accounts: [{ id: "a", type: "depository", subtype: "checking", balance: 1000 }] };
    t.eq(FE.incomeOccurrences(data, today, 14).map((o) => `${o.label} ${isoOfDate(o.date)} ${o.amount}`), ["Acme Corp 2026-11-27 2000", "Globex 2026-12-04 2050"],
      "P5-09b the forecast pays Acme's $2,000 on November 27 and Globex's $2,050 on December 4, not both on December 4");
    // An income whose name is on none of the deposits is phased as before, from the newest chain.
    const job = { id: 3, label: "Job", amount: "2000", freq: "biweekly" };
    t.eq(isoOfDate(IS.findAnchor(job, 2000, txns)), "2026-11-20", "P5-09c an income named on no deposit is phased exactly as before");
    // A name that has stopped appearing does not hold the phase: the bank now shows only "PAYROLL DEPOSIT", a week off the old cycle.
    const moved = [dep("2026-08-07", 2000, "ACME CORP PAYROLL"), dep("2026-08-21", 2000, "ACME CORP PAYROLL"),
      dep("2026-10-16", 2000, "PAYROLL DEPOSIT"), dep("2026-10-30", 2000, "PAYROLL DEPOSIT"), dep("2026-11-13", 2000, "PAYROLL DEPOSIT")];
    t.eq(isoOfDate(IS.findAnchor(acme, 2000, moved)), "2026-11-13", "P5-09d when the employer's name has stopped appearing, the newest pay cycle is used, as before");
    // Monthly pay: each income lands on its own employer's day.
    const mA = { id: 4, label: "Acme Corp", amount: "3000", freq: "monthly" }, mG = { id: 5, label: "Globex", amount: "3100", freq: "monthly" };
    const monthly = [dep("2026-10-15", 3000, "ACME CORP PAYROLL"), dep("2026-11-13", 3000, "ACME CORP PAYROLL"), dep("2026-09-30", 3100, "GLOBEX PAYROLL"), dep("2026-10-30", 3100, "GLOBEX PAYROLL")];
    t.eq([IS.anchorDayOf(mA, 3000, monthly), IS.anchorDayOf(mG, 3100, monthly)], [13, 30], "P5-09e monthly pay: Acme on its own day (the 13th), Globex on the 30th, not both on the 13th");
  }

  // ── P8-01, P9-06. A bill correction keeps every other correction ─────────────────────────────────
  {
    const before = { removed: ["old gym"], typed: { hydro: "variable" }, cadence: { "car insurance": "annually" }, amounts: { rogers: 95, "rogers wireless": 95 } };
    const next = typeof BR.withBillOverride === "function" ? BR.withBillOverride(before, "typed", "rogers", "variable") : null;
    t.eq(next, { removed: ["old gym"], typed: { hydro: "variable", rogers: "variable" }, cadence: { "car insurance": "annually" }, amounts: { rogers: 95, "rogers wireless": 95 } },
      "P8-01a changing a bill's type keeps the amount the household corrected ($95) and everything else");
    const cad = typeof BR.withBillOverride === "function" ? BR.withBillOverride(before, "cadence", "rogers", "quarterly") : null;
    t.eq(cad && cad.amounts, { rogers: 95, "rogers wireless": 95 }, "P8-01b …and so does changing how often it is due");
    t.eq(typeof BR.withBillOverride === "function" ? BR.withBillOverride(null, "amounts", "rogers", 95) : null, { removed: [], typed: {}, cadence: {}, amounts: { rogers: 95 } },
      "P8-01c a first correction starts from the full empty shape");
    // What the dropped amount cost: the meeting's detector went back to the bank's average.
    const charges = [1, 2, 3, 4].map((m) => ({ id: `rg${m}`, name: "ROGERS WIRELESS", cat: "Phone & Internet", amount: 85, date: `2026-${pad(7 + m)}-05` }));
    const amountOf = (ov) => { const b = PN.detectRecurringBills(charges, { overrides: ov, debts: [] }).find((x) => /rogers/i.test(x.name)); return b ? Number(b.amount) : null; };
    t.eq([amountOf(before), amountOf({ removed: before.removed, typed: before.typed, cadence: before.cadence })], [95, 85],
      "P8-01d with the amounts kept the detector reports the household's $95; with them dropped it reported the bank's $85 and the meeting asked about a change");
    // Every line that still builds the object by hand carries the amounts; the rest go through the helper.
    const byHand = APP.split("\n").filter((l) => /userBillOverrides: ?\{/.test(l));
    t.ok(byHand.every((l) => /amounts/.test(l)) && (APP.match(/withBillOverride\(prev\.userBillOverrides/g) || []).length >= 3,
      "P8-01e no place in the app rebuilds the corrections without the amounts");
    const bm = fnText("BillManager");
    t.ok(/withBillOverride\(prev\.userBillOverrides, ?"cadence"/.test(bm) && /withBillOverride\(prev\.userBillOverrides, ?"typed"/.test(bm), "P8-01f Manage Bills writes type and cadence corrections through the one helper");
    const settings = APP.slice(APP.indexOf("const updateBillAmt"), APP.indexOf("const removeBillS"));
    t.ok(/withBillOverride\(prev\.userBillOverrides, ?"amounts"/.test(settings) && /origin ?!== ?"manual"/.test(settings),
      "P9-06a an amount typed in Settings, Bills for a bill the bank found is remembered as a correction, as in Manage Bills");
    t.ok(/bills:\(prev\.bills\|\|\[\]\)\.map\(\(b,x\)=>x===i\?\{\.\.\.b,amount:val/.test(settings) || /amount: ?val/.test(settings), "P9-06b …and the bill's own amount is still saved in place");
  }

  // ── P7-05. The US student loan interest tip follows the loan, not the life stage ─────────────────
  if (A) {
    const has = (tips) => tips.some((x) => /student loan interest/i.test(x.title));
    const grad = { country: "US", province: "TX", lifeStages: ["w2"] };
    t.eq(has(A.getPersonalizedTaxCredits(grad)), false, "P7-05a a US employee with no student loan does not see the tip, as before");
    t.eq(has(A.getPersonalizedTaxCredits(grad, { debts: [{ name: "Student Loan (Federal)", balance: 20000 }] })), true,
      "P7-05b a US employee paying a student loan sees the Student Loan Interest Deduction tip");
    t.eq(has(A.getPersonalizedTaxCredits(grad, { debts: [{ name: "Navient", debtType: "student", balance: 9000 }] })), true, "P7-05c …also when the bank reported it as a student loan");
    t.eq(has(A.getPersonalizedTaxCredits(grad, { debts: [{ name: "Car Loan", balance: 9000 }] })), false, "P7-05d a car loan does not bring it up");
    t.eq(has(A.getPersonalizedTaxCredits({ country: "US", lifeStages: ["student"] })), true, "P7-05e a student sees it, as before");
    t.eq((APP.match(/getPersonalizedTaxCredits\(data\.profile, ?\{ ?debts:/g) || []).length, 2, "P7-05f both places that list the tips pass the household's debts");
  }

  // ── P10-04, P10-05. Detection runs again when a transaction changes, not only when one is added ──
  {
    const fp = RL.transactionsFingerprint;
    t.ok(typeof fp === "function", "P10-04a there is one fingerprint of the transactions' content");
    if (typeof fp === "function") {
      const a = [{ id: "1", date: "2026-11-01", amount: -2000, name: "ACME PAYROLL", cat: "Income" }, { id: "2", date: "2026-11-02", amount: 85, name: "ROGERS", cat: "Phone & Internet" }];
      const edited = [{ ...a[0], amount: -2400 }, a[1]];
      const posted = [a[0], { ...a[1], pending: true }];
      t.ok(fp(a) === fp(a.map((x) => ({ ...x }))), "P10-04b the same transactions give the same fingerprint");
      t.ok(fp(a) === fp([a[1], a[0]]), "P10-04c …in any order");
      t.ok(fp(a) !== fp(edited), "P10-04d an edited deposit ($2,000 to $2,400, same count) changes it");
      t.ok(fp(a) !== fp(posted) && fp(a) !== fp([a[0], { ...a[1], name: "ROGERS WIRELESS" }]) && fp(a) !== fp([a[0], { ...a[1], cat: "Other" }]),
        "P10-05a a bill charge that changes state, name or category (same count) changes it");
      t.ok(fp([]) === fp(null) && fp(a) !== fp([a[0]]), "P10-04e empty and missing lists agree; a removed transaction changes it");
    }
    const inc = APP.slice(APP.indexOf("const incomeDetectSig = useMemo"), APP.indexOf("useEffect", APP.indexOf("const incomeDetectSig = useMemo")));
    const bill = APP.slice(APP.indexOf("const billHealSig = useMemo"), APP.indexOf("useEffect", APP.indexOf("const billHealSig = useMemo")));
    t.ok(/transactionsFingerprint\(appData\?\.transactions\)/.test(inc), "P10-04f income detection's signature reads the fingerprint");
    t.ok(/transactionsFingerprint\(appData\?\.transactions\)/.test(bill), "P10-05b the bill check's signature reads the fingerprint");
  }

  // ── P8-04 (NOT REAL). The income banner is fed classified deposits, never the raw list ───────────
  {
    const data = { transactions: [
      { id: "s1", date: ago(40), amount: -500, name: "TFR FROM SAVINGS 4417", cat: "Transfer", transferPairId: "x1" },
      { id: "s2", date: ago(10), amount: -500, name: "TFR FROM SAVINGS 4417", cat: "Transfer", transferPairId: "x2" },
      { id: "e1", date: ago(35), amount: -400, name: "INTERAC E-TRANSFER FROM JORDAN P", cat: "Transfer" },
      { id: "e2", date: ago(5), amount: -400, name: "INTERAC E-TRANSFER FROM JORDAN P", cat: "Transfer" },
    ] };
    const evidence = DC.incomeEvidence(data);
    t.eq(evidence.length, 0, "P8-04a two transfers from the household's own savings and two e-transfers from a person are not income evidence");
    if (A) {
      t.eq(A.detectPayroll(evidence, []).length, 0, "P8-04b so the banner suggests nothing for them");
      t.ok(A.detectPayroll(data.transactions, []).length > 0, "P8-04c (the raw list would have: which is why the banner is not given it)");
    }
    const uses = APP.match(/<IncomeDetectionBanner [^>]*>/g) || [];
    t.ok(uses.length === 1 && /transactions=\{incomeEvidence\(/.test(uses[0]) && (APP.match(/detectPayroll\(/g) || []).length === 2,
      "P8-04d the banner is rendered once, with incomeEvidence(...), and is detectPayroll's only caller");
  }

  // ── P6-04 (NOT REAL). Before a purchase the trial starts when they buy; after it the provider's date is shown ─
  {
    const viewed = new Date(2026, 10, 10, 15, 0).getTime();      // the plans screen, 3 pm
    const bought = viewed + 6 * 3600000;                          // bought six hours later
    const stripeTrialEnd = new Date(bought + 14 * DAY);           // Stripe trial_period_days 14, from the purchase
    const web = TP.trialDates("web", viewed), ios = TP.trialDates("ios", viewed);
    t.ok(web.charge.getTime() <= stripeTrialEnd.getTime() && web.cancelBy.getTime() < web.charge.getTime(),
      "P6-04a the date stated before buying is never later than the real first charge, and \"cancel before\" is a day earlier still");
    t.eq(ios.charge.getTime(), web.charge.getTime() - DAY, "P6-04b on an iPhone it is stated a day earlier (Apple may charge up to 24 hours before the trial ends)");
    t.eq(TP.firstChargeAt(bought).getTime(), stripeTrialEnd.getTime(), "P6-04c read at the moment of purchase it is the provider's trial end exactly");
    t.eq(TP.chipChargeDateFor("stripe", stripeTrialEnd.toISOString()).getTime(), stripeTrialEnd.getTime(), "P6-04d once bought, the date shown is the provider's own trial end");
    t.eq(TP.chipChargeDateFor("app_store", stripeTrialEnd.toISOString()).getTime(), stripeTrialEnd.getTime() - DAY, "P6-04e …a day before it for an App Store trial");
    t.ok(/tpfStatus\?\.trialing&&chipChargeDateFor\(tpfPaySource\?\.provider, ?tpfStatus\.trial_ends\)/.test(APP), "P6-04f the app's trial line reads the server's trial_ends, not the screen's clock");
    t.eq((APP.match(/trialDisclosure\(\{[^}]*\bnow\b/g) || []).length, 0, "P6-04g neither plans screen holds a saved time: each render reads the clock");
  }

  // ── Grok lows ────────────────────────────────────────────────────────────────────────────────────
  {
    const inc = { id: 1, label: "Job", amount: "2000", freq: "biweekly" };
    t.eq([IS.depositConfidence(inc, 2000, []), IS.depositConfidence({ ...inc, nextPayDate: "2026-12-04" }, 2000, [])], ["estimated", "high"],
      "L1a with no deposits and no payday entered the pay cycle is marked estimated; an entered next payday phases it");
    const onboarding = APP.slice(APP.indexOf("const needsPayDate"), APP.indexOf("const needsPayDate") + 400);
    t.ok(/!findAnchor\(inc, ?num\(inc\.amount\), ?bankTxns\)/.test(onboarding) && /incomes\.some\(payDateMissing\)/.test(APP),
      "L1b onboarding asks for the next payday when the phase is unknown and waits for it");
    const dash = fnText("Dashboard");
    t.ok(/const showsNumber = hasCashAccount && !_ss\.noIncome;/.test(dash), "L2a the first-number stamp reads the safe-to-spend result the screen already has");
    t.eq((dash.slice(0, dash.indexOf("const showsNumber")).match(/const _ss\s*= SafeSpendEngine\.calculate\(data\);/g) || []).length, 1, "L2b …which is the same calculation, made once above it");
  }

  t.summary("review of 2026-11-22: classification, forecast, income and bill detection");
})().catch((e) => { console.error(e); process.exit(1); });
