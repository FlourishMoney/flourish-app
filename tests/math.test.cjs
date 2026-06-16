// tests/math.test.cjs — MATH-LOCK unit suite.
// Every pure lib function, the branches that matter, and the scope's edge cases: currency precision
// (exact multi-year amortization), cadence (every freq + rollovers + paid-N-days-ago), DST
// transitions, month boundaries (Feb 28/29, 30/31, year-end), empty/zero/negative/NaN, and the
// amount-parsing contract (machine-decimal; comma-grouping is a documented gap, see below).
// Dates are FROZEN (passed explicitly); localStorage shapes are FROZEN (catOverrides passed in).
"use strict";

const { create, fromCents } = require("./_runner.cjs");

// Local-noon date builder so assertions are TZ-stable for day-granularity logic.
const D = (iso) => new Date(iso + "T12:00:00");

(async () => {
  const fc = await import("../src/lib/financialCalculations.js");
  const pn = await import("../src/lib/plaidNormalize.js");
  const ss = await import("../src/lib/safeSpendEngine.js");
  const fe = await import("../src/lib/forecastEngine.js");
  const de = await import("../src/lib/decisionEngine.js");
  const t = create();

  // ── CURRENCY PRECISION: amortization / compound growth (exact, multi-year) ──────────────────────
  // The code's own documented case: $1000 @ 12% APR, $100/mo → 11 months, $1058.98 paid, $58.98 int.
  const dp = fc.simulateDebtPayoff({ balance: 1000, apr: 12, monthlyPayment: 100 });
  t.eq(dp.monthsToPayoff, 11, "debtPayoff $1000@12%/$100 → 11 months");
  t.eq(dp.totalPaid, 1058.98, "debtPayoff totalPaid exact (month-by-month, not ceil*pmt)");
  t.eq(dp.totalInterest, 58.98, "debtPayoff totalInterest exact");
  t.eq(fc.simulateDebtPayoff({ balance: 0, apr: 20, monthlyPayment: 50 }).totalInterest, 0, "debtPayoff zero balance → 0 interest");
  t.eq(fc.simulateDebtPayoff({ balance: 1000, apr: 20, monthlyPayment: 0 }).monthsToPayoff, Infinity, "debtPayoff zero payment → Infinity");
  // Payment ≤ monthly interest never amortizes: $5000 @ 24% → monthly interest $100; paying $100 → Infinity.
  t.eq(fc.simulateDebtPayoff({ balance: 5000, apr: 24, monthlyPayment: 100 }).monthsToPayoff, Infinity, "debtPayoff payment ≤ interest → never amortizes");
  // Multi-year: $20k @ 6% / $400 amortizes in a finite, >1 (interest>0) span.
  const dpLong = fc.simulateDebtPayoff({ balance: 20000, apr: 6, monthlyPayment: 400 });
  t.ok(Number.isFinite(dpLong.monthsToPayoff) && dpLong.monthsToPayoff > 50 && dpLong.totalInterest > 0, "debtPayoff multi-year finite + interest>0");

  // simulateInvestmentGrowth: r=0 → pure contributions; with return → compound annuity.
  const ig0 = fc.simulateInvestmentGrowth({ monthlyContribution: 100, annualReturnPct: 0, years: 1 });
  t.eq(ig0.finalValue, 1200, "investment r=0 → 100*12 = 1200");
  t.eq(ig0.totalGrowth, 0, "investment r=0 → 0 growth");
  const ig = fc.simulateInvestmentGrowth({ monthlyContribution: 100, annualReturnPct: 12, years: 1 });
  t.approx(ig.finalValue, 1268.25, 0.01, "investment $100/mo @12% 1yr → ~1268.25 (ordinary annuity)");
  const igInit = fc.simulateInvestmentGrowth({ monthlyContribution: 0, annualReturnPct: 0, years: 5, initialPrincipal: 1000 });
  t.eq(igInit.finalValue, 1000, "investment r=0 no contrib → principal unchanged");
  t.eq(fc.simulateInvestmentGrowth({ monthlyContribution: 100, annualReturnPct: 8, years: 0 }).finalValue, 0, "investment 0 years → 0");
  t.eq(fc.simulateInvestmentGrowth({ monthlyContribution: -50, annualReturnPct: 8, years: 1 }).totalContributed, 0, "investment negative contrib clamped to 0");

  // simulateSavingsTimeline
  t.eq(fc.simulateSavingsTimeline({ targetAmount: 1000, currentSaved: 400, monthlyContribution: 200 }).monthsToGoal, 3, "savings 600 needed / 200 → 3 months");
  t.eq(fc.simulateSavingsTimeline({ targetAmount: 1000, currentSaved: 1000, monthlyContribution: 0 }).monthsToGoal, 0, "savings already met → 0");
  t.eq(fc.simulateSavingsTimeline({ targetAmount: 1000, currentSaved: 0, monthlyContribution: 0 }).reachable, false, "savings 0 contribution → unreachable");

  // simulateDebtPayoffBoost: months/interest saved are positive
  const boost = fc.simulateDebtPayoffBoost({ balance: 3000, apr: 19.99, currentPayment: 100, extraPayment: 150 });
  t.ok(boost.monthsSaved > 0 && boost.interestSaved > 0, "debt boost saves months + interest");

  // ── toMonthly / billMonthlyAmount (every cadence + one-off + zero/negative) ──────────────────────
  t.approx(fc.toMonthly(100, "weekly"), 433.3, 0.001, "toMonthly weekly ×4.333");
  t.approx(fc.toMonthly(100, "biweekly"), 216.7, 0.001, "toMonthly biweekly ×2.167");
  t.eq(fc.toMonthly(100, "semimonthly"), 200, "toMonthly semimonthly ×2");
  t.eq(fc.toMonthly(1200, "annually"), 100, "toMonthly annually ÷12");
  t.eq(fc.toMonthly(100, "monthly"), 100, "toMonthly monthly ×1");
  t.eq(fc.toMonthly("abc", "monthly"), 0, "toMonthly NaN amount → 0");
  // ── Amount-parsing contract (en-CA / en-US both use "." decimal + "," thousands) ──────────────
  // Amounts reach the lib as MACHINE-DECIMAL: Plaid sends numbers; UI inputs are sanitized. parseFloat
  // is locale-blind by design here. KNOWN GAP (surfaced, NOT fixed — would be a behavior change):
  // a comma-GROUPED string truncates, e.g. parseFloat("1,234.56") === 1. If such input can ever reach
  // the lib, sanitize at the input boundary. These assertions pin the supported (machine-decimal) contract.
  t.eq(fc.toMonthly(1234.56, "monthly"), 1234.56, "numeric amount (Plaid sends numbers) → exact");
  t.eq(fc.toMonthly("1234.56", "monthly"), 1234.56, "machine-decimal string → exact");
  t.approx(fc.billMonthlyAmount({ amount: "2499.99", freq: "annually" }), 208.3325, 1e-6, "machine-decimal bill amount → to the cent");
  t.eq(fc.billMonthlyAmount({ amount: "300", freq: "quarterly" }), 100, "billMonthly quarterly ÷3");
  t.eq(fc.billMonthlyAmount({ amount: "100", freq: "monthly", type: "one_off" }), 0, "billMonthly one_off → 0 (not recurring)");
  t.eq(fc.billMonthlyAmount({ amount: "-50", freq: "monthly" }), 0, "billMonthly negative amount → 0");
  t.eq(fc.billMonthlyAmount(null), 0, "billMonthly null → 0");

  // ── dateToISO (local, DST-safe) ──────────────────────────────────────────────────────────────────
  t.eq(fc.dateToISO(D("2026-02-09")), "2026-02-09", "dateToISO round-trips local Y-M-D");
  t.eq(fc.dateToISO(new Date(2026, 0, 5, 23, 30)), "2026-01-05", "dateToISO uses LOCAL date (not UTC) at late hour");

  // ── CADENCE: billNextDue across every freq + paid-N-days-ago + boundaries ───────────────────────
  // Biweekly anchored 7 days ago → next due in 7 days (NOT 14) — the Sprint Q regression case.
  t.eq(fc.dateToISO(fc.billNextDue({ freq: "biweekly", nextDueDate: "2026-06-04" }, D("2026-06-11"))), "2026-06-18", "biweekly anchored 7d ago → due +7");
  t.eq(fc.dateToISO(fc.billNextDue({ freq: "weekly", nextDueDate: "2026-06-10" }, D("2026-06-11"))), "2026-06-17", "weekly anchored yesterday → due +6");
  // Monthly day-of-month
  t.eq(fc.dateToISO(fc.billNextDue({ freq: "monthly", date: "20" }, D("2026-06-11"))), "2026-06-20", "monthly day 20, today 11 → this month");
  t.eq(fc.dateToISO(fc.billNextDue({ freq: "monthly", date: "5" }, D("2026-06-11"))), "2026-07-05", "monthly day 5, today 11 → next month");
  // Month-boundary clamp: day 31 in a 30-day month → clamps to 30
  t.eq(fc.dateToISO(fc.billNextDue({ freq: "monthly", date: "31" }, D("2026-06-11"))), "2026-06-30", "monthly day 31 in June (30d) → clamps to 30");
  // Feb clamp: day 30 in Feb 2026 (28d) → Feb 28
  t.eq(fc.dateToISO(fc.billNextDue({ freq: "monthly", date: "30" }, D("2026-02-10"))), "2026-02-28", "monthly day 30 in Feb 2026 (28d) → Feb 28");
  // Leap Feb 2028 (29d): day 30 → Feb 29
  t.eq(fc.dateToISO(fc.billNextDue({ freq: "monthly", date: "30" }, D("2028-02-10"))), "2028-02-29", "monthly day 30 in Feb 2028 (leap, 29d) → Feb 29");
  // Quarterly: only every 3rd month from the anchor
  t.eq(fc.dateToISO(fc.billNextDue({ freq: "quarterly", nextDueDate: "2026-01-15" }, D("2026-06-11"))), "2026-07-15", "quarterly anchor Jan15 → next on/after Jun is Jul15");
  // Annual rollover
  t.eq(fc.dateToISO(fc.billNextDue({ freq: "annual", nextDueDate: "2026-03-01" }, D("2026-06-11"))), "2027-03-01", "annual anchor Mar1, today Jun → next year");
  // One-off: future kept, past → null
  t.eq(fc.dateToISO(fc.billNextDue({ type: "one_off", isoDate: "2026-12-25" }, D("2026-06-11"))), "2026-12-25", "one-off future → itself");
  t.eq(fc.billNextDue({ type: "one_off", isoDate: "2026-01-01" }, D("2026-06-11")), null, "one-off past → null");
  // Stale anchor: a biweekly anchor from a year ago still lands on a correct future phase.
  const staleNext = fc.billNextDue({ freq: "biweekly", nextDueDate: "2025-06-11" }, D("2026-06-11"));
  t.ok(staleNext >= D("2026-06-11") && ((staleNext - D("2025-06-11")) / 86400000) % 14 === 0, "biweekly stale anchor → future date on the 14-day phase");

  // ── DST: spring-forward (US Sun Mar 8 2026) + fall-back (Sun Nov 1 2026) stay calendar-correct ──
  t.eq(fc.dateToISO(fc.billNextDue({ freq: "biweekly", nextDueDate: "2026-03-01" }, D("2026-03-02"))), "2026-03-15", "biweekly across spring-forward → +14 calendar days (no drift)");
  t.eq(fc.dateToISO(fc.billNextDue({ freq: "biweekly", nextDueDate: "2026-10-25" }, D("2026-10-26"))), "2026-11-08", "biweekly across fall-back → +14 calendar days (no drift)");
  t.eq(fc.dateToISO(fc.billNextDue({ freq: "weekly", nextDueDate: "2027-03-07" }, D("2027-03-08"))), "2027-03-14", "weekly across 2027 spring-forward → +7 (multi-year)");

  // ── billOccursOnDate ─────────────────────────────────────────────────────────────────────────────
  t.eq(fc.billOccursOnDate({ freq: "monthly", date: "20" }, D("2026-06-20"), D("2026-06-11")), true, "occursOn monthly on the due day");
  t.eq(fc.billOccursOnDate({ freq: "monthly", date: "20" }, D("2026-06-21"), D("2026-06-11")), false, "occursOn monthly not on a non-due day");
  t.eq(fc.billOccursOnDate({ freq: "quarterly", nextDueDate: "2026-01-15" }, D("2026-02-15"), D("2026-01-10")), false, "occursOn quarterly skips off-cycle months");
  t.eq(fc.billOccursOnDate({ freq: "biweekly", nextDueDate: "2026-06-04" }, D("2026-06-18"), D("2026-06-11")), true, "occursOn biweekly on a phase date");

  // ── Account + transaction classifiers ───────────────────────────────────────────────────────────
  t.eq(fc.isCashAccount({ type: "checking" }), true, "isCashAccount checking");
  t.eq(fc.isCashAccount({ type: "credit" }), false, "isCashAccount excludes credit");
  t.eq(fc.isInvestmentAccount({ type: "investment" }), true, "isInvestmentAccount");
  t.eq(fc.isCreditLiability({ type: "credit" }), true, "isCreditLiability");
  t.eq(fc.isInternalTransfer({ name: "INTERAC E-TRANSFER" }), true, "isInternalTransfer e-transfer");
  t.eq(fc.isInternalTransfer({ cat: "transfer" }), true, "isInternalTransfer by cat");
  t.eq(fc.isInternalTransfer({ name: "Starbucks" }), false, "isInternalTransfer false for purchase");
  t.eq(fc.isCCPayment({ name: "VISA PAYMENT", amount: 200 }), true, "isCCPayment keyword");
  t.eq(fc.isCCPayment({ name: "transfer", amount: 68, cat: "TRANSFER" }, [{ min: "68", balance: "3420" }]), true, "isCCPayment by debt-amount match");
  t.eq(fc.isCCPayment({ name: "Groceries", amount: 50 }), false, "isCCPayment false for spend");
  t.eq(fc.isCashAdvance({ name: "ATM CASH ADVANCE" }), true, "isCashAdvance");
  // isBillArchived with frozen today
  t.eq(fc.isBillArchived({ type: "one_off", isoDate: "2026-01-01" }, D("2026-06-11")), true, "isBillArchived past one-off");
  t.eq(fc.isBillArchived({ type: "one_off", isoDate: "2026-12-01" }, D("2026-06-11")), false, "isBillArchived future one-off");
  t.eq(fc.isBillArchived({ type: "fixed", isoDate: "2020-01-01" }, D("2026-06-11")), false, "isBillArchived only applies to one-off");

  // ── FinancialCalcEngine (frozen date + frozen catOverrides) ─────────────────────────────────────
  const JUN = D("2026-06-15");
  const baseData = {
    incomes: [{ amount: "2000", freq: "monthly" }],
    bills: [{ name: "Rent", amount: "1000", freq: "monthly" }],
    accounts: [{ type: "checking", balance: "500" }, { type: "investment", balance: "8000" }],
    debts: [{ balance: "1200" }],
    transactions: [
      { id: "t1", date: "2026-06-10", amount: 100, cat: "Shopping", pending: false },
      { id: "t2", date: "2026-05-10", amount: 300, cat: "Shopping", pending: false }, // prev month → excluded
      { id: "t3", date: "2026-06-12", amount: 50, cat: "Groceries", pending: true },   // pending → excluded
    ],
  };
  const cf = fc.FinancialCalcEngine.cashFlow(baseData, {}, JUN);
  t.eq(cf.monthlyIncome, 2000, "cashFlow monthlyIncome from data.incomes");
  t.eq(cf.monthlyBills, 1000, "cashFlow monthlyBills from data.bills");
  t.eq(cf.monthlySpend, 100, "cashFlow monthlySpend excludes prev-month + pending");
  t.eq(cf.totalExpenses, 1100, "cashFlow totalExpenses = bills + spend");
  t.eq(cf.cashFlow, 900, "cashFlow = income - totalExpenses");
  // FROZEN catOverrides: recategorize t1 Shopping→Rent (a BILL_CAT) → excluded from spend
  t.eq(fc.FinancialCalcEngine.cashFlow(baseData, { t1: "Rent" }, JUN).monthlySpend, 0, "cashFlow catOverrides reclassify drops spend (re-categorization works)");
  t.eq(fc.FinancialCalcEngine.netWorth(baseData).netWorth, 7300, "netWorth = (500+8000) - 1200");
  // ── Sprint Z3 #6: currency-mix safety (single-currency IDENTICAL; foreign excluded + flag) ─────────
  t.eq(fc.FinancialCalcEngine.netWorth(baseData).mixedCurrencyDetected, false, "#6 netWorth single-currency → no mixed flag");
  const mixedNW = fc.FinancialCalcEngine.netWorth({ ...baseData, profile: { country: "CA" }, accounts: [...baseData.accounts, { type: "savings", balance: "5000", currency: "USD" }] });
  t.eq(mixedNW.netWorth, 7300, "#6 netWorth excludes a USD account (CAD base) → totals unchanged vs single-currency");
  t.eq(mixedNW.mixedCurrencyDetected, true, "#6 netWorth mixed-currency → flag set");
  const usNW = fc.FinancialCalcEngine.netWorth({ debts: [], profile: { country: "US" }, accounts: [{ type:"checking", balance:"500", currency:"USD" }, { type:"savings", balance:"5000", currency:"CAD" }] });
  t.eq(usNW.netWorth, 500, "#6 netWorth US base → USD counts (500), CAD excluded");
  t.eq(usNW.mixedCurrencyDetected, true, "#6 netWorth US base + a CAD account → flag set");
  const cfMixed = fc.FinancialCalcEngine.cashFlow({ profile:{country:"CA"}, accounts:[{type:"checking",balance:"0",currency:"USD",id:"usd1"}], transactions:[{id:"x1",date:"2026-06-10",amount:100,cat:"Shopping",account_id:"usd1"}] }, {}, JUN);
  t.eq(cfMixed.monthlySpend, 0, "#6 cashFlow excludes spend from a USD account");
  t.eq(cfMixed.mixedCurrencyDetected, true, "#6 cashFlow mixed-currency → flag set");
  t.eq(fc.FinancialCalcEngine.cashFlow(baseData, {}, JUN).mixedCurrencyDetected, false, "#6 cashFlow single-currency → no flag");
  // ── Sprint Z3 #8: debt dedupe by ACCOUNT_ID, not name (manual name-coincident debt still counts) ──
  const dnw = fc.FinancialCalcEngine.netWorth({
    accounts: [{ id:"acc1", type:"credit", balance:"-500", currency:"CAD" }],
    debts: [{ name:"Visa", balance:"500", fromBank:true, account_id:"acc1" }, { name:"Visa", balance:"300" }],
  });
  t.eq(dnw.bankCreditLiabilities, 500, "#8 bank credit account counted once");
  t.eq(dnw.manualNonBankDebts, 300, "#8 manual debt counts even when name-coincident with a bank card");
  t.eq(dnw.liabilities, 800, "#8 liabilities = bank 500 + manual 300 (name-dedupe no longer drops it)");
  t.approx(fc.FinancialCalcEngine.debtRatio(baseData, {}, JUN), 0.05, 1e-9, "debtRatio = 1200/(2000*12)");
  t.eq(fc.FinancialCalcEngine.cashFlow({}, {}, JUN).monthlyIncome, 0, "cashFlow empty data → 0 income (no invented fallback)");
  t.eq(fc.FinancialCalcEngine.avgDailySpend({ transactions: [] }), 0, "avgDailySpend no txns → 0");
  t.ok(Number.isFinite(fc.FinancialCalcEngine.savingsRate(baseData, {}, JUN)), "savingsRate finite");

  // ── plaidNormalize ──────────────────────────────────────────────────────────────────────────────
  const norm = pn.normaliseTxns([{ id: "x1", date: "2026-06-10", name: "Starbucks", amount: 5.25, category: "FOOD_AND_DRINK", account_id: "a1" }]);
  t.eq(norm[0].cat, "Coffee & Dining", "normaliseTxns maps PFC category → display cat");
  t.eq(norm[0].dow, 3, "normaliseTxns day-of-week (2026-06-10 = Wed)");
  t.eq(pn.normaliseTxns([{ amount: 1 }])[0].id, "plaid_0", "normaliseTxns id fallback");
  // detectRecurringBills: 3 monthly → 1 bill (original case preserved per Group C)
  const bills = pn.detectRecurringBills([
    { id: "n1", name: "Netflix", amount: 18.99, cat: "Entertainment", date: "2026-04-22" },
    { id: "n2", name: "Netflix", amount: 18.99, cat: "Entertainment", date: "2026-05-22" },
    { id: "n3", name: "Netflix", amount: 18.99, cat: "Entertainment", date: "2026-06-22" },
  ]);
  t.eq(bills.length, 1, "detectRecurringBills collapses 3 monthly into 1");
  t.eq(bills[0].freq, "monthly", "detectRecurringBills classifies monthly cadence");
  t.eq(bills[0].name, "Netflix", "detectRecurringBills Title-Cases the name (Netflix → Netflix)");
  // MATH-LOCK finding #1: Title Case bill names, preserving short ALL-CAPS acronyms (TD/RBC/BC/…).
  t.eq(["NETFLIX SUBSCRIPTION", "TD VISA", "BC HYDRO", "goodlife gym"].map(pn.titleCaseBillName),
       ["Netflix Subscription", "TD Visa", "BC Hydro", "Goodlife Gym"],
       "Title Case bill names, preserving short acronyms (finding #1)");
  // Explicit 4+ char banking/financial acronym allowlist (CIBC/HSBC/TFSA/RRSP/AMEX) — preserved at any
  // length; common short words (MY/OF) and ordinary words (BANK/AUTO/LOAN/CARD) are Title-Cased.
  t.eq(["CIBC MORTGAGE", "HSBC CREDIT CARD", "MY TFSA CONTRIBUTION", "RRSP TRANSFER",
        "AMEX PAYMENT", "BANK OF MONTREAL", "AUTO LOAN PAYMENT", "CREDIT CARD PAYMENT"].map(pn.titleCaseBillName),
       ["CIBC Mortgage", "HSBC Credit Card", "My TFSA Contribution", "RRSP Transfer",
        "AMEX Payment", "Bank Of Montreal", "Auto Loan Payment", "Credit Card Payment"],
       "Title Case preserves allowlisted acronyms (any length), Title-Cases everything else");
  t.eq(pn.detectRecurringBills([]).length, 0, "detectRecurringBills empty → []");
  // detectIncomeFromTxns
  const inc = pn.detectIncomeFromTxns([{ name: "PAYROLL", amount: -2000, cat: "INCOME", date: "2026-05-15" }, { name: "PAYROLL", amount: -2000, cat: "INCOME", date: "2026-06-15" }]);
  t.eq(inc.typical, 2000, "detectIncome typical");
  t.eq(pn.detectIncomeFromTxns([{ name: "CC PAYMENT", amount: -500, cat: "TRANSFER", date: "2026-06-01" }]), null, "detectIncome excludes transfers/CC payments");
  t.eq(pn._levenshtein("netflix", "netflix"), 0, "levenshtein identical → 0");
  t.ok(pn._levenshtein("bell", "bell insurance") > 3, "levenshtein distinguishes Bell vs Bell Insurance");
  // markTransfers: cross-account opposite-sign + transfer keyword pairs
  const mt = pn.markTransfers([
    { id: "o", date: "2026-06-10", name: "Transfer to Visa", amount: 500, account_id: "chk" },
    { id: "i", date: "2026-06-10", name: "Payment", amount: -500, account_id: "visa" },
  ], fc.isInternalTransfer, fc.isCashAdvance);
  t.eq(mt[0].isTransfer && mt[1].isTransfer && mt[0].transferPairId === mt[1].transferPairId, true, "markTransfers pairs cross-account transfer");
  t.eq(pn.markTransfers([], fc.isInternalTransfer, fc.isCashAdvance).length, 0, "markTransfers empty → []");

  // ── SafeSpendEngine (frozen date) ───────────────────────────────────────────────────────────────
  const sd = ss.SafeSpendEngine.calculate({
    accounts: [{ type: "checking", balance: "2000" }],
    bills: [{ name: "Rent", amount: "1000", date: "20", freq: "monthly", type: "fixed" }],
    debts: [{ min: "50" }], incomes: [{ amount: "3000", freq: "monthly" }], transactions: [],
  }, JUN);
  t.eq(sd.balance, 2000, "safeSpend balance from cash accounts");
  t.eq(sd.upcomingBills, 1000, "safeSpend counts bill due in 10-day window");
  t.eq(sd.safeAmount, 850, "safeSpend = 2000 - 1000 - 50 - 0 - 100(savings)");
  t.eq(sd.noIncome, false, "safeSpend noIncome false with income");
  t.eq(ss.SafeSpendEngine.calculate({ accounts: [], bills: [], debts: [], incomes: [], transactions: [] }, JUN).noIncome, true, "safeSpend noIncome true when no income");

  // ── ForecastEngine (frozen date) ────────────────────────────────────────────────────────────────
  const fcast = fe.ForecastEngine.generate({
    accounts: [{ type: "checking", balance: "1000" }],
    bills: [{ name: "Rent", amount: "1500", date: "10", freq: "monthly", type: "fixed" }],
    debts: [], incomes: [], transactions: [],
  }, 30, null, D("2026-06-01"));
  t.eq(fcast.forecast[0].balance, 1000, "forecast day0 = starting balance");
  t.eq(fcast.forecast.length, 31, "forecast 0..30 inclusive");
  t.eq(fcast.willGoNegative, true, "forecast detects overdraft (1500 rent > 1000)");
  t.eq(fcast.firstNegativeDay.day, 9, "forecast first-negative on rent day (Jun 10 = day 9)");

  // ── decisionEngine: helpers + engines ───────────────────────────────────────────────────────────
  t.eq(de.computePaydayGap(D("2026-01-10")).daysToPayday, 5, "paydayGap day10 → 5 to the 15th");
  t.eq(de.computePaydayGap(D("2026-01-20")).daysToPayday, 12, "paydayGap day20 (Jan, 31d) → 12 to the 1st");
  // Sprint Z2 #9: month-end wraparound uses the ACTUAL days-in-month, not a hardcoded 31.
  t.eq(de.computePaydayGap(D("2026-02-20")).daysToPayday, 9,  "paydayGap Feb 20 (28d, non-leap) → 9");
  t.eq(de.computePaydayGap(D("2024-02-20")).daysToPayday, 10, "paydayGap Feb 20 2024 (29d, leap) → 10");
  t.eq(de.computePaydayGap(D("2026-04-20")).daysToPayday, 11, "paydayGap Apr 20 (30d) → 11");
  t.eq(de.computeDailySpendLimit(280, 7).safeToday, 40, "dailySpendLimit 280/7 → 40");
  t.eq(de.computeDailySpendLimit(280, 0).daysLeft, 14, "dailySpendLimit floors days at 14");
  t.eq(de.selectHighestRateDebt([{ name: "A", rate: "6" }, { name: "B", rate: "20" }]).name, "B", "selectHighestRateDebt picks highest APR");
  t.eq(de.selectHighestRateDebt([]), null, "selectHighestRateDebt empty → null");
  t.ok(de.computeDebtPayoffImpact({ rate: "19.99", balance: "3000" }, 150) > 0, "computeDebtPayoffImpact > 0 for positive APR/principal");
  t.eq(de.computeDebtPayoffImpact(null, 150), 0, "computeDebtPayoffImpact null debt → 0");
  t.eq(de.computeSavingsOpportunity(500), 125, "computeSavingsOpportunity 25% floored");
  t.eq(de.detectLowCashWarning(100, 3000), true, "detectLowCashWarning safe < 15% income");
  t.eq(de.detectLowCashWarning(500, 3000), false, "detectLowCashWarning safe >= 15% income");
  // calcHealthScore: in range, 6 pillars, catOverrides flow (cap-free data)
  const lowSaveData = { accounts: [{ type: "checking", balance: "500" }], bills: [], debts: [], incomes: [{ amount: "1000", freq: "monthly" }], goals: [], transactions: [{ id: "t1", date: "2026-06-05", name: "BigShop", amount: 600, cat: "Shopping" }, { id: "t2", date: "2026-06-08", name: "Food", amount: 300, cat: "Groceries" }], profile: { creditScore: "680" } };
  const h = de.calcHealthScore(lowSaveData, {}, JUN);
  t.ok(h.score >= 8 && h.score <= 100 && h.pillars.length === 6, "calcHealthScore in [8,100] with 6 pillars");
  t.ok(de.calcHealthScore(lowSaveData, {}, JUN).score !== de.calcHealthScore(lowSaveData, { t1: "Rent" }, JUN).score, "calcHealthScore reflects catOverrides (re-categorization changes score)");
  // Sprint Z2 #5: $0 income + investment account with $0 balance → finite score ≥ 8 (was 0/0 = NaN).
  const noIncInv = { accounts: [{ type: "investment", balance: "0" }], bills: [], debts: [], incomes: [], goals: [], transactions: [], profile: {} };
  const nanGuard = de.calcHealthScore(noIncInv, {}, JUN).score;
  t.ok(Number.isFinite(nanGuard) && nanGuard >= 8, "calcHealthScore finite + ≥8 for $0 income + $0-balance investment (no NaN)");
  // BehaviorEngine + AutopilotEngine
  t.ok(de.BehaviorEngine.analyze(lowSaveData).spendingStability >= 0, "BehaviorEngine spendingStability >= 0");
  t.ok(!("insights" in de.BehaviorEngine.analyze(lowSaveData)), "BehaviorEngine insights array removed (finding #3 — it was dead output)");
  const plan = de.AutopilotEngine.generate(lowSaveData, {}, JUN);
  t.ok(typeof plan.dailySpendLimit === "number" && ["low", "medium", "high"].includes(plan.mode), "AutopilotEngine produces a valid plan");

  // ── NaN / Infinity guards (no garbage propagation into headline numbers) ────────────────────────
  t.ok(Number.isFinite(fc.FinancialCalcEngine.cashFlow({ incomes: [{ amount: "NaN", freq: "monthly" }], bills: [], accounts: [], debts: [], transactions: [] }, {}, JUN).monthlyIncome), "cashFlow guards NaN income → finite");
  t.ok(Number.isFinite(ss.SafeSpendEngine.calculate({ accounts: [{ type: "checking", balance: "oops" }], bills: [], debts: [], incomes: [], transactions: [] }, JUN).safeAmount), "safeSpend guards bad balance → finite");

  return t.summary("math.test");
})().catch(e => { console.error("math.test crashed:", e); process.exitCode = 1; });
