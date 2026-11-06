// tests/billNotDailySpend.test.cjs
// -----------------------------------------------------------------------------
// MATH-LOCK: A BILL'S PAYMENT IS NOT ALSO DAILY SPENDING (balance-truth, Amanda 2026-11-06).
//
// Safe to spend takes each bill out on its own date, and it also takes daily spending (the average of the
// household's everyday spending, times the days to payday) as a buffer. Daily spending left out only the bill
// CATEGORIES (Utilities, Housing, Rent, Phone & Internet, Insurance, ...), so a bill outside them, Netflix filed under
// Entertainment or Subscriptions, was counted twice: once as the bill, and again inside the daily average. The sandbox
// proof showed it ($18.99 of Netflix in both). Now a transaction that pays one of the household's bills (found or
// entered) is never daily spending, whatever its category, by the same "this payment paid this bill" rule that
// "already paid" uses (financialCalculations.js paysABill, read by forecastEdits.js billArrived).
//   1  a bill in a bill category: left out of daily spending, as before, and taken once
//   2  a bill outside the bill categories (Netflix): now left out of daily spending, and taken once
//   3  spending that is not a bill: still daily spending, including look-alikes that pay no bill
//   4  one rule: "already paid" and daily spending read the same paysABill; Today and Watch use one daily figure
// -----------------------------------------------------------------------------
"use strict";
const fs = require("fs");
const path = require("path");
const { create } = require("./_runner.cjs");

(async () => {
  const t = create();
  const F = await import("../src/lib/financialCalculations.js");
  const { SafeSpendEngine } = await import("../src/lib/safeSpendEngine.js");
  const { ForecastEngine } = await import("../src/lib/forecastEngine.js");
  const r2 = (n) => Math.round(n * 100) / 100;

  // A household on Nov 6, 2026 (a Friday), paid every second Thursday ($2,150, next Nov 12), with $3,184.27.
  const TODAY = new Date(2026, 10, 6, 12);
  const iso = (y, m, d) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const groceries = [ // every Saturday, Aug 15 to Oct 31: 12 visits
    ["2026-08-15", 84.12], ["2026-08-22", 132.40], ["2026-08-29", 97.65], ["2026-09-05", 118.03], ["2026-09-12", 76.90], ["2026-09-19", 141.22],
    ["2026-09-26", 103.37], ["2026-10-03", 89.58], ["2026-10-10", 125.10], ["2026-10-17", 94.44], ["2026-10-24", 112.86], ["2026-10-31", 80.31],
  ].map(([date, amount], i) => ({ id: `g${i}`, date, amount, name: "Loblaws", cat: "Groceries" }));
  const GROC_TOTAL = groceries.reduce((s, x) => s + x.amount, 0); // 1255.98
  const GROC_SPAN = 77; // Aug 15 to Oct 31
  const hydro = [["2026-08-15", 96.40], ["2026-09-15", 98.10], ["2026-10-15", 95.75]].map(([date, amount], i) => ({ id: `h${i}`, date, amount, name: "Hydro One", cat: "Utilities" }));
  const netflix = [9, 9, 9].map((d, i) => ({ id: `n${i}`, date: iso(2026, 8 + i, d), amount: 18.99, name: "Netflix", cat: "Entertainment" }));
  const base = (extra = {}) => ({
    profile: { country: "CA", province: "ON" },
    accounts: [{ id: "chq", type: "depository", subtype: "checking", balance: 3184.27, institution: "Sandbox Bank", _item: "item-1" }],
    incomes: [{ id: "i1", label: "Acme", amount: "2150", freq: "biweekly", nextPayDate: "2026-11-12", type: "employment" }],
    bills: [], transactions: [...groceries], debts: [], ...extra,
  });
  const HYDRO_BILL = { name: "Hydro One", amount: "96.75", date: "15", freq: "monthly", type: "fixed" };
  const NETFLIX_BILL = { name: "Netflix", amount: "18.99", date: "9", freq: "monthly", type: "fixed" };
  const daily = (d) => F.FinancialCalcEngine.avgDailySpend(d);
  const groceriesOnly = GROC_TOTAL / GROC_SPAN;

  // ── 1. A bill in a bill category ─────────────────────────────────────────────────────────────
  {
    const d = base({ bills: [HYDRO_BILL], transactions: [...groceries, ...hydro] });
    t.eq(r2(daily(d)), r2(groceriesOnly), `1a Hydro One (Utilities) pays a bill: daily spending is the groceries alone, $${r2(groceriesOnly)} a day`);
    const noBill = base({ transactions: [...groceries, ...hydro] });
    t.eq(r2(daily(noBill)), r2(groceriesOnly), "1b …and it was already left out by its category, with or without the bill (nothing changes here)");
    // Taken once: due Nov 15, after payday, so not in this window; on Nov 13 (window to Nov 26) it is, once.
    const later = SafeSpendEngine.calculate({ ...d, incomes: [{ ...d.incomes[0], nextPayDate: "2026-11-26" }] }, new Date(2026, 10, 13, 12));
    t.eq(later.upcomingBills, 96.75, "1c in a window that holds Nov 15, Hydro One is taken once, $96.75");
  }

  // ── 2. A bill outside the bill categories (Netflix, Entertainment) ───────────────────────────
  {
    const withBill = base({ bills: [NETFLIX_BILL], transactions: [...groceries, ...netflix] });
    const withoutBill = base({ transactions: [...groceries, ...netflix] });
    t.eq(r2(daily(withBill)), r2(groceriesOnly), "2a Netflix pays a bill the household has: it is NOT daily spending, though Entertainment is not a bill category");
    const span = Math.round((Date.parse("2026-10-31") - Date.parse("2026-08-09")) / 86400000); // the Netflix charges widen the span
    t.eq(r2(daily(withoutBill)), r2((GROC_TOTAL + 3 * 18.99) / span), "2b with no Netflix bill found, nothing else takes it, so it stays daily spending");
    const ss = SafeSpendEngine.calculate(withBill, TODAY);
    // By hand: window Nov 6 to Nov 12 (6 days). Bills due: Netflix Nov 9, $18.99. Buffer: groceries $1,255.98 over 77
    // days x 6 = $97.87. Savings: $2,150 x 2.167 = $4,659.05 a month, 10% / 30 x 6 = $93.18. Safe: 3,184.27 - 18.99 -
    // 97.87 - 93.18 = $2,974.23. Before this rule the buffer took Netflix again ($1,312.95 over 83 days x 6 = $94.91,
    // and the Netflix-free span changes too), which is what the sandbox proof's $2,955.18 held.
    t.eq([ss.balance, ss.upcomingBills, ss.safetyBuf, ss.savingsAlloc, ss.safeAmount], [3184.27, 18.99, 97.87, 93.18, 2974.23],
      "2c safe to spend takes Netflix once: $3,184.27 - $18.99 - $97.87 - $93.18 = $2,974.23 (by hand)");
    t.eq(r2(3184.27 - 18.99 - r2(groceriesOnly * 6) - r2(2150 * 2.167 * 0.10 / 30 * 6)), 2974.23, "2d …the same arithmetic, written out");
  }

  // ── 3. Spending that is not a bill ───────────────────────────────────────────────────────────
  {
    const lookalikes = [
      { id: "x1", date: "2026-10-20", amount: 50.00, name: "Netflix", cat: "Entertainment" },            // a $50 gift card: not $18.99
      { id: "x2", date: "2026-10-21", amount: 18.99, name: "NETFLIX REFUND", cat: "Entertainment" },     // a refund is not a payment
      { id: "x3", date: "2026-10-22", amount: 18.99, name: "Spotify", cat: "Entertainment" },            // another merchant
      { id: "x4", date: "2026-10-23", amount: 18.99, name: "Netflix", cat: "Entertainment", pending: true }, // pending: not counted at all, as before
    ];
    const d = base({ bills: [NETFLIX_BILL], transactions: [...groceries, ...lookalikes] });
    const counted = GROC_TOTAL + 50 + 18.99 + 18.99;
    t.eq(r2(daily(d)), r2(counted / GROC_SPAN), "3a groceries, a $50 Netflix gift card, a refund line and another merchant pay no bill: all still daily spending (a pending charge never was)");
    t.eq(r2(daily(base())), r2(groceriesOnly), "3b a household with no bills: its spending is counted exactly as before");
    const variable = { ...HYDRO_BILL, type: "variable" };
    const odd = { id: "h9", date: "2026-10-28", amount: 140.10, name: "Hydro One", cat: "Home" };
    t.eq(r2(daily(base({ bills: [variable], transactions: [...groceries, odd] }))), r2(groceriesOnly), "3c a bill that varies takes its payment whatever the amount (the \"already paid\" rule)");
    t.eq(r2(daily(base({ bills: [HYDRO_BILL], transactions: [...groceries, odd] }))), r2((GROC_TOTAL + 140.10) / GROC_SPAN), "3d …a fixed bill does not take a payment far from its amount: that one is still spending");
  }

  // ── 4. One rule ──────────────────────────────────────────────────────────────────────────────
  {
    const FE = fs.readFileSync(path.join(__dirname, "..", "src", "lib", "forecastEdits.js"), "utf8");
    const FC = fs.readFileSync(path.join(__dirname, "..", "src", "lib", "financialCalculations.js"), "utf8");
    t.ok(/return paysABill\(t, b\);/.test(FE) && /!bills\.some\(b => paysABill\(t, b\)\)/.test(FC), "4a \"already paid\" and daily spending read the same paysABill");
    t.eq([F.paysABill({ amount: 18.99, name: "NETFLIX.COM" }, NETFLIX_BILL), F.paysABill({ amount: -18.99, name: "Netflix" }, NETFLIX_BILL), F.paysABill({ amount: 18.99, name: "Netflix", transferPairId: "p" }, NETFLIX_BILL)],
      [true, false, false], "4b it pays: a Netflix charge; it doesn't: money in, or a transfer between the household's own accounts");
    const d = base({ bills: [NETFLIX_BILL], transactions: [...groceries, ...netflix] });
    const fc = ForecastEngine.generate(d, 30, null, TODAY);
    t.eq([r2(fc.avgDailySpend), r2(SafeSpendEngine.calculate(d, TODAY).safetyBuf / 6)], [r2(groceriesOnly), r2(groceriesOnly)], "4c Watch's forecast and Today's buffer use the same daily figure, without Netflix");
  }

  t.summary("billNotDailySpend.test");
})();
