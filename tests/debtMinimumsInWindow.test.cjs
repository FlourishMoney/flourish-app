// tests/debtMinimumsInWindow.test.cjs — MATH-LOCK
// -----------------------------------------------------------------------------
// MINIMUM DEBT PAYMENTS: ONLY THOSE DUE BEFORE PAYDAY, AND NOT ALREADY PAID (audit 2026-10-26, H1).
//
// Safe to spend used to deduct every debt minimum in every pay period: one due after payday, and one already paid.
// Due soon said $0 on the same screen. Now one list (financialCalculations.js debtMinimumDates) decides for safe to
// spend, Due soon and the forecast: the minimums due in the window (today included for Today, as Due soon lists
// them) and not already paid (a matching debt payment marks the due date it is nearest to).
//   1  the audit's cases: due after payday, $0 (was $348); paid, $0 (was $348)
//   2  due before payday, and today: reserved, once
//   3  Due soon adds up to the deduction exactly; Watch takes the same minimums on the same days
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");

(async () => {
  const t = create();
  const { SafeSpendEngine } = await import("../src/lib/safeSpendEngine.js");
  const { ForecastEngine } = await import("../src/lib/forecastEngine.js");
  const FE = await import("../src/lib/forecastEdits.js");
  const at = (y, m, d) => new Date(y, m - 1, d, 10);
  const house = (extra = {}) => ({
    accounts: [{ id: "a", type: "depository", subtype: "checking", balance: 2000 }],
    incomes: [{ id: "i", label: "Job", amount: 2000, freq: "biweekly", nextPayDate: "2026-10-16" }],
    bills: [], debts: [{ id: "visa", name: "Visa", balance: "3000", rate: "19.99", min: "348", dueDay: 28 }], transactions: [], ...extra,
  });

  // ── 1. The audit's cases ────────────────────────────────────────────────────────────────────────
  {
    const ss = SafeSpendEngine.calculate(house(), at(2026, 10, 10));
    t.eq([ss.debtPayments, ss.minimumsDueSoon.length], [0, 0], "1a Oct 10, minimum due the 28th, payday the 16th: nothing deducted (was $348), and Due soon agrees");
    const paid = house({ incomes: [{ id: "i", label: "Job", amount: 2000, freq: "biweekly", nextPayDate: "2026-11-06" }],
      transactions: [{ id: "p", name: "VISA PAYMENT", amount: 348, date: "2026-10-28" }] });
    t.eq(SafeSpendEngine.calculate(paid, at(2026, 10, 29)).debtPayments, 0, "1b Oct 29, the minimum paid on the 28th: not deducted again (was $348)");
  }

  // ── 2. Due before payday, and today ─────────────────────────────────────────────────────────────
  {
    const before = house({ incomes: [{ id: "i", label: "Job", amount: 2000, freq: "biweekly", nextPayDate: "2026-10-30" }] });
    const ss = SafeSpendEngine.calculate(before, at(2026, 10, 20));
    t.eq([ss.debtPayments, ss.minimumsDueSoon.map((m) => `${m.amount} ${FE.isoOf(m.date)}`)], [348, ["348 2026-10-28"]], "2a due the 28th, payday the 30th: $348 reserved, once, and Due soon lists it");
    const today = SafeSpendEngine.calculate(house(), at(2026, 10, 28));
    t.eq(today.debtPayments, 348, "2b due today and not yet paid: reserved (Today counts day 0, as Due soon does)");
    const paidEarly = house({ incomes: [{ id: "i", label: "Job", amount: 2000, freq: "biweekly", nextPayDate: "2026-10-30" }],
      transactions: [{ id: "p", name: "VISA PAYMENT", amount: 348, date: "2026-10-18" }] });
    t.eq(SafeSpendEngine.calculate(paidEarly, at(2026, 10, 20)).debtPayments, 0, "2c paid ten days early (Oct 18 for Oct 28): not reserved again");
    const lastMonth = house({ incomes: [{ id: "i", label: "Job", amount: 2000, freq: "biweekly", nextPayDate: "2026-10-30" }],
      transactions: [{ id: "p", name: "VISA PAYMENT", amount: 348, date: "2026-09-29" }] });
    t.eq(SafeSpendEngine.calculate(lastMonth, at(2026, 10, 20)).debtPayments, 348, "2d last month's payment (Sep 29, a day late) does not pay October's");
    const dinner = house({ incomes: [{ id: "i", label: "Job", amount: 2000, freq: "biweekly", nextPayDate: "2026-10-30" }],
      transactions: [{ id: "p", name: "THE KEG", amount: 348, date: "2026-10-18" }] });
    t.eq(SafeSpendEngine.calculate(dinner, at(2026, 10, 20)).debtPayments, 348, "2e a $348 dinner is not the Visa payment (it must look like a debt payment)");
  }

  // ── 2f. Which payment pays which minimum (review of 2026-10-26) ────────────────────────────────
  {
    const two = (transactions) => ({ accounts: [{ id: "a", type: "depository", subtype: "checking", balance: 2000 }],
      incomes: [{ id: "i", label: "Job", amount: 2000, freq: "biweekly", nextPayDate: "2026-11-06" }], bills: [],
      debts: [{ id: "v", name: "Visa card", balance: "900", rate: "20", min: "25", dueDay: 30 }, { id: "m", name: "Mastercard", balance: "900", rate: "20", min: "26", dueDay: 30 }], transactions });
    const day = at(2026, 10, 26);
    const left = (d) => SafeSpendEngine.calculate(d, day).minimumsDueSoon.map((m) => m.name).sort();
    t.eq(left(two([{ id: "s", name: "Transfer to savings", amount: 25, date: "2026-10-24", isTransfer: true, transferPairId: "s+s2" }])), ["Mastercard minimum payment", "Visa card minimum payment"],
      "2f a $25 transfer to savings pays no minimum (was: both dropped)");
    t.eq(left(two([{ id: "p", name: "VISA PAYMENT", amount: 25, date: "2026-10-24" }])), ["Mastercard minimum payment"], "2g one VISA PAYMENT pays the Visa minimum only (was: both dropped)");
    t.eq(left(two([{ id: "g", name: "CREDIT CARD PAYMENT", amount: 25, date: "2026-10-24" }])).length, 1, "2h one payment that names no debt pays one minimum, never two");
    t.eq(left(two([{ id: "p", name: "VISA PAYMENT", amount: 25, date: "2026-10-12" }])), ["Mastercard minimum payment", "Visa card minimum payment"], "2i 18 days early (past the 10-day cap): still reserved");
  }

  // ── 3. Due soon adds up; Watch agrees ───────────────────────────────────────────────────────────
  {
    let s = 26102026 >>> 0;
    const r = () => { s = (s + 0x6D2B79F5) >>> 0; let x = s; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
    let n = 0, sumBad = 0, watchBad = 0;
    for (let k = 0; k < 800; k++) {
      const today = at(2026, 1 + Math.floor(r() * 12), 1 + Math.floor(r() * 28));
      const addD = (d) => { const x = new Date(today); x.setHours(12, 0, 0, 0); x.setDate(x.getDate() + d); return x; };
      const debts = [], transactions = [];
      for (let i = 0; i < 1 + Math.floor(r() * 3); i++) {
        const min = Math.round((20 + r() * 400) * 100) / 100;
        debts.push({ id: "d" + i, name: ["Visa", "Mastercard", "Car loan"][i], balance: "5000", rate: "10", min: String(min), dueDay: 1 + Math.floor(r() * 31) });
        if (r() < 0.5) transactions.push({ id: "p" + i, name: "CREDIT CARD PAYMENT", amount: min, date: FE.isoOf(addD(-Math.floor(r() * 35))) });
      }
      const data = { accounts: [{ id: "a", type: "depository", subtype: "checking", balance: 3000 }], bills: [], debts, transactions,
        incomes: [{ id: "i", label: "Job", amount: 2500, freq: "biweekly", nextPayDate: FE.isoOf(addD(1 + Math.floor(r() * 14))) }] };
      const ss = SafeSpendEngine.calculate(data, today);
      const H = FE.daysToNextDepositFor(data, today);
      if (!(H > 0)) continue;
      n++;
      const listCents = ss.minimumsDueSoon.reduce((x, m) => x + Math.round(m.amount * 100), 0);
      if (listCents !== Math.round(ss.debtPayments * 100)) sumBad++;
      const dayN = ss.minimumsDueSoon.filter((m) => FE.dayDiff(today, m.date) >= 1).reduce((x, m) => x + Math.round(m.amount * 100), 0);
      const fc = ForecastEngine.generate(data, H, null, today);
      const watch = fc.forecast.filter((f) => { const d = FE.dayDiff(today, f.date); return d >= 1 && d <= H; })
        .reduce((x, f) => x + f.bills.filter((b) => b._debt || /minimum payment$/.test(b.name || "")).reduce((y, b) => y + Math.round(b.amount * 100), 0), 0);
      if (dayN !== watch) watchBad++;
    }
    t.ok(n > 600, `3a (${n} households with debts, half with payments)`);
    t.eq(sumBad, 0, "3b Due soon's minimums add up to the deduction exactly");
    t.eq(watchBad, 0, "3c Watch takes the same minimums, on the same days, before payday");
  }

  t.summary("debtMinimumsInWindow");
})();
