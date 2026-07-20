// tests/incomeDetect.test.cjs — units contract for detectIncomeFromTxns (plaidNormalize.js).
//
// Guards the defect where `typical` was an average MONTHLY TOTAL but every caller stored it in
// income.amount, which the forecast reads as a PER-DEPOSIT figure — inflating auto-detected income by
// roughly the number of deposits per month. These assertions pin the two units apart so they cannot be
// silently reconflated.
"use strict";

const { create } = require("./_runner.cjs");

(async () => {
  const t = create();
  const pn = await import("../src/lib/plaidNormalize.js");

  const dep = (date, amount, name = "ACME PAYROLL") =>
    ({ name, amount: -Math.abs(amount), cat: "INCOME", date });

  // ── A biweekly earner on $2,000/cheque ─────────────────────────────────────────────────────────
  // 7 deposits across 3 months: Jan has 3, Feb and Mar have 2 each.
  const biweekly = [
    dep("2026-01-02", 2000), dep("2026-01-16", 2000), dep("2026-01-30", 2000),
    dep("2026-02-13", 2000), dep("2026-02-27", 2000),
    dep("2026-03-13", 2000), dep("2026-03-27", 2000),
  ];
  const bw = pn.detectIncomeFromTxns(biweekly);

  t.ok(bw !== null, "baseline: biweekly payroll deposits are detected as income");
  t.eq(bw.perDeposit, 2000,
       "perDeposit is ONE PAYCHEQUE ($2,000). This is the value income.amount must receive — the " +
       "forecast multiplies it by the pay cadence, so a monthly total here inflates income ~2.2x.");
  t.eq(bw.monthlyAvg, 4667,
       "monthlyAvg is the average CALENDAR-MONTH TOTAL ((6000+4000+4000)/3), a genuinely different " +
       "quantity from perDeposit — it is correct for its own purpose and must not feed income.amount.");
  t.ok(bw.monthlyAvg !== bw.perDeposit,
       "the two units must not be byte-identical — they were (`typical` was a copy of monthlyAvg), " +
       "which is exactly what let the monthly total masquerade as a paycheque.");
  t.eq(bw.perDepositLow, 2000, "perDepositLow is a single-cheque floor, not a monthly floor");
  t.eq(bw.perDepositHigh, 2000, "perDepositHigh is a single-cheque ceiling, not a monthly ceiling");
  t.eq(bw.monthlyLow, 4000, "monthlyLow is the smallest calendar-month total (a 2-cheque month)");
  t.eq(bw.monthlyHigh, 6000, "monthlyHigh is the largest calendar-month total (the 3-cheque month)");

  // The removed field names must stay gone: an un-migrated caller has to fail loudly, not silently
  // read a monthly total as a paycheque.
  t.eq(bw.typical, undefined, "`typical` is removed — it was ambiguous and always held a monthly total");
  t.eq(bw.low,     undefined, "`low` is removed in favour of the unit-explicit monthlyLow/perDepositLow");
  t.eq(bw.high,    undefined, "`high` is removed in favour of the unit-explicit monthlyHigh/perDepositHigh");

  // ── isVariable describes the PER-DEPOSIT amount ────────────────────────────────────────────────
  t.eq(bw.isVariable, false,
       "identical $2,000 cheques are NOT variable. Measuring spread on monthly totals flagged every " +
       "biweekly earner as variable, because a 3-cheque month is ~50% above a 2-cheque month.");

  const variable = [
    dep("2026-01-05", 1600), dep("2026-01-19", 2400),
    dep("2026-02-02", 1550), dep("2026-02-16", 2450),
  ];
  t.eq(pn.detectIncomeFromTxns(variable).isVariable, true,
       "genuinely swinging cheques ($1,550–$2,450) ARE variable — the flag still fires when it should");

  // ── Median robustness ──────────────────────────────────────────────────────────────────────────
  // A one-off bonus must not drag the detected paycheque upward the way a mean would.
  const withBonus = biweekly.concat([dep("2026-03-20", 5000, "ACME BONUS")]);
  t.eq(pn.detectIncomeFromTxns(withBonus).perDeposit, 2000,
       "a $5,000 bonus leaves perDeposit at $2,000 (median). A mean would report $2,375 and quietly " +
       "overstate every future paycheque.");

  // A partial first month (Plaid's window rarely starts on the 1st) must not distort the paycheque.
  const partialFirstMonth = [
    dep("2026-01-30", 2000),                                   // lone tail-end deposit
    dep("2026-02-13", 2000), dep("2026-02-27", 2000),
    dep("2026-03-13", 2000), dep("2026-03-27", 2000),
  ];
  t.eq(pn.detectIncomeFromTxns(partialFirstMonth).perDeposit, 2000,
       "a partial first month leaves perDeposit at $2,000 — the figure is derived from real deposits, " +
       "not from a month total that happens to be truncated by the sync window");

  t.eq(pn.detectIncomeFromTxns(biweekly).depositsPerMonth, 2.33,
       "depositsPerMonth (7 deposits / 3 months) is reported so the monthly<->per-deposit relationship " +
       "is inspectable rather than implied");

  // ── Non-income is still excluded ───────────────────────────────────────────────────────────────
  t.eq(pn.detectIncomeFromTxns([{ name: "CC PAYMENT", amount: -500, cat: "TRANSFER", date: "2026-06-01" }]),
       null, "baseline: transfers / credit-card payments are still excluded from income detection");
  t.eq(pn.detectIncomeFromTxns([]), null, "baseline: empty input returns null");

  t.summary("incomeDetect.test");
})();
