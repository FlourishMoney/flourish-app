// tests/forecast-critic-verify.test.cjs
// -----------------------------------------------------------------------------
// CORRECT-BEHAVIOUR SPEC for the forecast path, derived from the completeness-critic audit.
//
// This file previously encoded CURRENT (buggy) behaviour as the expected value. It has been rewritten
// to encode what SHOULD be true, so an assertion here is a statement about correctness rather than a
// snapshot of whatever the engine happens to emit.
//
// Sections are labelled:
//   [FIXED] — was a defect, has been fixed, and these assertions now PASS.
//   [OPEN]  — a real defect found by the critic that was NOT part of the six-fix scope. These
//             assertions FAIL ON PURPOSE. They are the outstanding-work ledger; a failure here is a
//             known open defect, never a regression. This file is deliberately NOT in `npm run
//             test:math` so it cannot redden the release gate while those remain open.
// -----------------------------------------------------------------------------
"use strict";

const { create } = require("./_runner.cjs");
const D = (iso) => new Date(iso + "T12:00:00");

(async () => {
  const fc = await import("../src/lib/financialCalculations.js");
  const fe = await import("../src/lib/forecastEngine.js");
  const t = create();
  const G = fe.ForecastEngine.generate;

  const base = {
    accounts: [{ id: "a1", type: "depository", subtype: "checking", balance: 5000, currency: "CAD" }],
    bills: [], debts: [], transactions: [], incomes: [],
  };
  const sumInc = (r) => r.forecast.reduce((s, e) => s + e.income, 0);
  // LOCAL calendar date, not toISOString — UTC conversion can shift the day for western offsets and
  // silently make these assertions timezone-dependent.
  const ymd = (dt) => `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}-${String(dt.getDate()).padStart(2,"0")}`;
  const paydays = (r) => r.forecast.filter(e => e.isPayday).map(e => ymd(e.date));

  // ═══ A. [FIXED] A currency-formatted bill amount must parse, not poison the run ═══
  {
    const d = { ...base,
      bills: [{ id: "b1", name: "Rent", amount: "$1200", freq: "monthly", date: "5" }],
      accounts: [{ id: "a1", type: "depository", balance: 5000, currency: "CAD" }] };
    const r = G(d, 90, null, D("2026-03-02"));
    t.ok(r.forecast.every(e => Number.isFinite(e.balance)),
         "A1: a '$1200' bill amount parses — no NaN balance anywhere in the horizon");
    t.ok(Number.isFinite(r.forecast[90].balance), "A2: the final day's balance is a real number");
    t.eq(r.canProject, true, "A3: '$1200' is VALID input, so the projection is usable");
    t.eq(r.willGoNegative, false,
         "A4: the overdraft verdict is a real boolean. Previously NaN made every comparison false, so " +
         "willGoNegative returned false and the alarm was silenced by the very corruption it should catch.");
    t.eq(fc.billMonthlyAmount({ amount: "$1200", freq: "monthly" }), 1200,
         "A5: billMonthlyAmount() reads '$1200' as 1200 rather than discarding it as unparseable");
  }

  // ═══ B. [FIXED] Low-balance warnings must work at and below zero ═══
  {
    const mk = (bal) => ({ ...base,
      accounts: [{ id: "a1", type: "depository", balance: bal, currency: "CAD" }],
      bills: [{ id: "b1", name: "Rent", amount: 100, freq: "monthly", date: "5" }],
      transactions: [{ id:"t1", date:"2026-02-01", name:"Store", amount:900, cat:"Shopping" },
                     { id:"t2", date:"2026-02-28", name:"Store", amount:900, cat:"Shopping" }] });
    const pos  = G(mk(3000), 90, null, D("2026-03-02"));
    const zero = G(mk(0),    90, null, D("2026-03-02"));
    const neg  = G(mk(-50),  90, null, D("2026-03-02"));
    t.ok(pos.lowBalanceWarnings.length > 0, "B1: a positive balance emits low-balance warnings");
    t.ok(zero.lowBalanceWarnings.length > 0,
         "B2: a ZERO balance now emits them too. The threshold was balance*0.12, which at balance 0 " +
         "reduced to `running < 0 && running >= 0` — never true — so the users with no cash were the " +
         "only population structurally incapable of receiving the warning.");
    t.ok(neg.overdraftRisk.length > 0,
         "B3: a NEGATIVE balance is surfaced as an OVERDRAFT rather than a low balance — the right " +
         "channel for it, and no longer silently absent from both");
  }

  // ═══ C. [FIXED] A non-primary monthly income honours its own anchorDay ═══
  {
    const d = { ...base, incomes: [
      { label: "Main", amount: 2000, freq: "biweekly" },
      { label: "Side", amount: 900, freq: "monthly", anchorDay: 20 },
    ] };
    const r = G(d, 90, null, D("2026-03-02"));
    const on1st  = r.forecast.filter(e => e.date.getDate() === 1).some(e => e.income >= 900);
    const on20th = r.forecast.filter(e => e.date.getDate() === 20).some(e => e.income >= 900);
    t.ok(on20th, "C1: a second income with anchorDay=20 is credited ON THE 20TH");
    t.ok(!on1st,
         "C2: …and NOT on the 1st. Non-primary monthly income used to be hardcoded to the 1st while " +
         "primary income read its own anchor — an inconsistency inside a single file.");
  }

  // ═══ D. [FIXED] Semimonthly honours anchorDay, and clamps ═══
  {
    const a = { ...base, incomes: [{ label: "Job", amount: 1500, freq: "semimonthly", anchorDay: 10 }] };
    const b = { ...base, incomes: [{ label: "Job", amount: 1500, freq: "semimonthly", anchorDay: 25 }] };
    const c = { ...base, incomes: [{ label: "Job", amount: 1500, freq: "semimonthly" }] };
    const pa = paydays(G(a, 90, null, D("2026-03-02")));
    const pb = paydays(G(b, 90, null, D("2026-03-02")));
    const pc = paydays(G(c, 90, null, D("2026-03-02")));
    t.ok(pa.join() !== pc.join(), "D1: anchorDay=10 produces DIFFERENT paydays from the unanchored default");
    t.ok(pa.includes("2026-03-10"), "D2: …specifically it pays on the 10th");
    t.ok(pb.includes("2026-03-25"), "D3: anchorDay=25 pays on the 25th");
    t.ok(pb.includes("2026-03-31"),
         "D4: …and its second date (25 + 15 = 40) CLAMPS to the last day of the month instead of vanishing");
    t.ok(pc.includes("2026-03-15") && pc.includes("2026-04-01"),
         "D5: with no anchor the historical 1st-and-15th behaviour is preserved — no silent change " +
         "for users who never set one");
  }

  // ═══ E. [OPEN] Unhandled freq values yield ZERO forecast income ═══
  //   Not in the six-fix scope. `freqDays` handles weekly/biweekly and the else-branch handles
  //   monthly/semimonthly; anything else — including a capitalised "Biweekly" — falls through silently.
  {
    for (const f of ["annually", "quarterly", "Biweekly", "bi-weekly"]) {
      const d = { ...base, incomes: [{ label: "Freelance", amount: 6000, freq: f }] };
      const r = G(d, 90, null, D("2026-03-02"));
      t.ok(sumInc(r) > 0,
           `E(${f}): [OPEN] a sole income with freq "${f}" should contribute SOME income over 90 days; ` +
           `it currently contributes exactly zero`);
    }
    const q = fc.FinancialCalcEngine.cashFlow(
      { ...base, incomes: [{ amount: 6000, freq: "quarterly" }] }, {}, D("2026-03-02"));
    t.eq(q.monthlyIncome, 2000,
         "E5: [OPEN] cashFlow should treat $6,000/quarter as $2,000/mo; toMonthly's `default: return a` " +
         "makes it $6,000/mo, so cashFlow and the forecast disagree by 3x in opposite directions");
  }

  // ═══ F. [OPEN] One off-cycle deposit inside the 8% tolerance re-phases every payday ═══
  {
    const txnsClean = [];
    for (let k = 1; k <= 6; k++) {
      const dt = new Date(D("2026-02-27")); dt.setDate(dt.getDate() - 14 * (k - 1));
      txnsClean.push({ id: "p" + k, date: ymd(dt), name: "ACME PAYROLL", amount: -2000, cat: "Income" });
    }
    const clean = { ...base, incomes: [{ label: "Acme", amount: 2000, freq: "biweekly" }],
                    transactions: txnsClean };
    const pClean = paydays(G(clean, 90, null, D("2026-03-02")));
    const dirty = { ...clean, transactions: [...txnsClean,
      { id: "x", date: "2026-02-28", name: "ACME BONUS DEPOSIT", amount: -1940, cat: "Income" }] };
    const pDirty = paydays(G(dirty, 90, null, D("2026-03-02")));
    t.eq(pClean[0], "2026-03-13", "F0: a clean anchor projects the first payday correctly");
    t.eq(pDirty.join(), pClean.join(),
         "F1: [OPEN] a single off-cycle bonus within 8% of the paycheque should NOT re-phase the pay " +
         "cycle; the anchor is simply the most recent match, with no cadence validation, so every " +
         "projected payday shifts for the whole horizon");
  }

  // ═══ G. [OPEN] No matching deposit defers the first paycheque a full cycle ═══
  {
    const d = { ...base, incomes: [{ label: "Acme", amount: 2000, freq: "biweekly" }],
      accounts: [{ id: "a1", type: "depository", balance: 500, currency: "CAD" }],
      transactions: [],
      bills: [{ id: "b1", name: "Rent", amount: 800, freq: "monthly", date: "5" }] };
    const r = G(d, 13, null, D("2026-03-02"));
    t.ok(sumInc(r) > 0,
         "G1: [OPEN] a manual-entry user with no transaction history should still see a paycheque " +
         "within the first cycle; the fallback starts at k=freqDays, so days 0-13 are always empty");
    t.eq(r.willGoNegative, false,
         "G2: [OPEN] …and should not be warned of an overdraft that a real payday would have averted");
  }

  // ═══ H. [OPEN] Variable/hourly pay defeats the 8% tolerance and short-label match ═══
  {
    const txns = [];
    const amts = [1700, 2350, 1650, 2400, 1600];
    for (let k = 0; k < amts.length; k++) {
      const dt = new Date(D("2026-02-27")); dt.setDate(dt.getDate() - 14 * k);
      txns.push({ id: "h" + k, date: ymd(dt), name: "PAYROLL DEP", amount: -amts[k], cat: "Income" });
    }
    const d = { ...base, incomes: [{ label: "Sh", amount: 2000, freq: "biweekly" }], transactions: txns };
    const r = G(d, 90, null, D("2026-03-02"));
    t.eq(paydays(r)[0], "2026-03-13",
         "H1: [OPEN] an hourly worker with real biweekly deposits should be phased off them; amounts " +
         ">8% apart and a <=3-char label match nothing, so 8 real payroll rows are ignored in favour " +
         "of a today+14 guess. The app explicitly supports variable income, so this is reachable.");
  }

  // ═══ I. [FIXED] Forecast income should agree with cashFlow ═══
  //   This was a >$8,800 divergence because the forecast silently DROPPED the weekly second income
  //   while cashFlow counted it. Unifying the income path closed it. The residual ~8% is calendar
  //   discretization, not a defect: a 90-day window holds floor(90/7)=12 weekly and floor(90/14)=6
  //   biweekly paydays, whereas cashFlow annualises at 4.333 and 2.167 per month.
  {
    const d = { ...base, incomes: [
      { label: "Acme Payroll", amount: 2000, freq: "biweekly" },
      { label: "Side gig", amount: 600, freq: "weekly" },
    ] };
    const r = G(d, 90, null, D("2026-03-02"));
    const cf = fc.FinancialCalcEngine.cashFlow(d, {}, D("2026-03-02"));
    const fcast90 = sumInc(r);
    const cf90 = cf.monthlyIncome * 3;
    t.ok(Math.abs(fcast90 - cf90) / cf90 < 0.10,
         `I1: the forecast (${fcast90}) and cashFlow x3 (${cf90.toFixed(0)}) now agree within 10%. ` +
         `Before the income path was unified this gap was >$8,800 (~42%) because the forecast dropped ` +
         `the weekly second income entirely while cashFlow counted it.`);
  }

  // ═══ J. [FIXED] Day-0 map across every cash movement ═══
  {
    const d = {
      accounts: [{ id: "a1", type: "depository", balance: 5000, currency: "CAD" }],
      debts: [], incomes: [{ label: "Sec", amount: 400, freq: "monthly" },
                           { label: "Sec2", amount: 400, freq: "monthly" }],
      bills: [
        { id: "r", name: "Rent", amount: 1000, freq: "monthly", date: "1" },
        { id: "o", name: "Fridge", amount: 700, type: "one_off", isoDate: "2026-04-01" },
      ],
      transactions: [{ id: "t", date: "2026-03-15", name: "Store", amount: 300, cat: "Shopping" }],
    };
    const r = G(d, 5, null, D("2026-04-01"));
    const e0 = r.forecast[0];
    t.eq(e0.income, 0,
         "J1: day 0 credits NO income for ANY cadence — today's deposits are already in the posted " +
         "balance. Two monthly incomes due on the 1st used to add $800 of phantom money here, " +
         "persisting as a permanent offset across the entire horizon.");
    t.eq(e0.balance, 4300,
         "J2: …so day 0's balance is the $5,000 opening less only the $700 one_off that genuinely " +
         "lands today — no phantom income inflating it");
    t.eq(e0.expenses, 700,
         "J3: a one_off dated today DOES still land on day 0 (deliberate — it may not be paid yet), " +
         "while the recurring bill and avgDaily spend correctly do not");
    t.ok(!e0.isPayday, "J4: day 0 is never flagged a payday");
  }

  // ═══ K. [FIXED] A malformed scenario cannot NaN the projection ═══
  {
    const d = { ...base, incomes: [{ label: "J", amount: 2000, freq: "monthly" }] };
    const r = G(d, 10, { type: "purchase" }, D("2026-03-02")); // amount undefined
    t.ok(Number.isFinite(r.forecast[10].balance),
         "K1: a scenario with a missing amount no longer turns every balance into NaN");
    t.eq(r.canProject, true,
         "K2: an ABSENT scenario amount is treated as zero, not as corruption — missing is legitimately " +
         "nothing, which is different from unparseable");
  }

  // ═══ L. [FIXED unit bug / OPEN cadence bug] Plaid auto-detect ═══
  {
    const pn = await import("../src/lib/plaidNormalize.js");
    const bw = []; let dt = D("2026-02-27");
    for (let k = 0; k < 8; k++) {
      bw.push({ id: "p" + k, date: ymd(dt), name: "ACME PAYROLL", amount: -2000, cat: "Income" });
      dt = new Date(dt); dt.setDate(dt.getDate() - 14);
    }
    const detBw = pn.detectIncomeFromTxns(bw);
    t.eq(detBw.perDeposit, 2000,
         "L1: detection reports the PER-DEPOSIT amount ($2,000). The old `typical` was a copy of the " +
         "monthly total and was written straight into income.amount, inflating income ~2.2x.");
    t.ok(detBw.monthlyAvg > detBw.perDeposit,
         "L2: monthlyAvg remains a distinct, larger quantity — the two units are no longer interchangeable");

    const dBw = { ...base, transactions: bw,
      incomes: [{ id: 1, label: detBw.label, amount: String(detBw.perDeposit), freq: "biweekly" }] };
    const rBw = G(dBw, 90, null, D("2026-03-02"));
    const nPay = rBw.forecast.filter(e => e.isPayday).length;
    t.eq(sumInc(rBw), nPay * 2000,
         "L3: the forecast now pays one real paycheque per payday, not a month's total on every payday");

    const mo = ["2025-11-28", "2025-12-28", "2026-01-28", "2026-02-28"]
      .map(m => ({ id: m, date: m, name: "ACME PAYROLL", amount: -5000, cat: "Income" }));
    const detMo = pn.detectIncomeFromTxns(mo);
    t.eq(detMo.perDeposit, 5000, "L4: a monthly earner's per-deposit amount is their $5,000 cheque");
    t.approx(detMo.depositsPerMonth, 1, 0.01,
             "L5: depositsPerMonth is ~1 for a monthly earner — the cadence SIGNAL now exists in the " +
             "detection output, which is what a fix for the hardcoded freq would consume");
    t.ok(detBw.depositsPerMonth > 1.5,
         "L6: …and ~2+ for a biweekly earner, so the two are distinguishable from the data");

    // The remaining half of this defect: both Plaid write sites stamp freq:"biweekly" unconditionally.
    const dMo = { ...base, transactions: mo,
      incomes: [{ id: 1, label: detMo.label, amount: String(detMo.perDeposit), freq: "biweekly" }] };
    t.approx(sumInc(G(dMo, 90, null, D("2026-03-02"))), 15000, 5000,
             "L7: [OPEN] a $5,000/month earner should be forecast ~$15,000 over 90 days. App.jsx:13502 " +
             "and :6026 hardcode freq:'biweekly' regardless of the detected cadence, so they are " +
             "forecast at roughly double. The unit bug is fixed; the cadence bug is not.");
  }

  t.summary("forecast-critic-verify");
})();
