// tests/safeSpendCents.test.cjs — MATH-LOCK
// -----------------------------------------------------------------------------
// SAFE TO SPEND IN INTEGER CENTS; ONLY THE FINAL FIGURES ARE ROUNDED (audit 2026-10-26, M1).
//
// The engine summed dollars as floats, so whole-dollar totals drifted and the view's floor and ceiling then
// moved them a dollar: balances of exactly $11,640.00 showed "$11,639", bills of exactly $3,725.00 showed
// "Upcoming bills $3,726" beside Due soon's $3,725, and the spending buffer and savings were each rounded to a
// whole dollar inside the engine before the view rounded again. Now every part is summed in cents and the one
// rounding is the view's (balance down, each deduction up, headline from the shown rows).
//   1  the audit's two cases, to the cent
//   2  every figure the engine returns is a whole number of cents, and the buffer and savings are not pre-rounded
//   3  many households: each figure equals its parts summed in cents, and the shown rows add up to the headline
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");

(async () => {
  const t = create();
  const { SafeSpendEngine } = await import("../src/lib/safeSpendEngine.js");
  const { safeToSpendView } = await import("../src/lib/safeToSpendView.js");
  const at = (y, m, d) => new Date(y, m - 1, d, 10);
  const today = at(2026, 10, 26);
  const income = [{ id: "i", label: "Job", amount: 2000, freq: "biweekly", nextPayDate: "2026-11-06" }];
  const cash = (bals) => bals.map((b, i) => ({ id: "a" + i, type: "depository", subtype: "checking", balance: b }));
  const isCents = (x) => Number.isFinite(x) && Math.round(x * 100) / 100 === x;

  // ── 1. The audit's cases ────────────────────────────────────────────────────────────────────────
  {
    const ss = SafeSpendEngine.calculate({ accounts: cash([4189.63, 1384.79, 4199.36, 1866.22]), incomes: income, bills: [], debts: [], transactions: [] }, today);
    t.eq([ss.balance, safeToSpendView(ss).balanceText], [11640, "$11,640"], "1a balances of exactly $11,640.00 show $11,640 (were 11639.999…, shown $11,639)");
    const bills = [163.55, 545.32, 475.68, 1614.14, 926.31].map((a, i) => ({ id: "b" + i, name: "Bill " + i, amount: a, date: String(28 + (i % 3)), freq: "monthly" }));
    const sb = SafeSpendEngine.calculate({ accounts: cash([8000]), incomes: income, bills, debts: [], transactions: [] }, today);
    const row = safeToSpendView(sb).rows.find((r) => r.key === "upcomingBills");
    t.eq([sb.upcomingBills, row && row.value], [3725, "$3,725"], "1b bills of exactly $3,725.00 show Upcoming bills $3,725 (were 3725.0000000000005, shown $3,726)");
  }

  // ── 2. Whole cents, no rounding inside ──────────────────────────────────────────────────────────
  {
    const txns = Array.from({ length: 40 }, (_, k) => ({ id: "g" + k, name: "Corner Grocery", amount: 23.37 + (k % 5), date: `2026-10-${String(1 + (k % 25)).padStart(2, "0")}` }));
    const ss = SafeSpendEngine.calculate({ accounts: cash([3083.41]), incomes: income, bills: [], debts: [], transactions: txns }, today);
    t.ok(["balance", "upcomingBills", "debtPayments", "safetyBuf", "savingsAlloc", "safeAmount"].every((k) => isCents(ss[k])), "2a every figure is a whole number of cents");
    t.ok(ss.savingsAlloc !== Math.round(ss.savingsAlloc) || ss.safetyBuf !== Math.round(ss.safetyBuf), `2b the buffer ($${ss.safetyBuf}) and savings ($${ss.savingsAlloc}) keep their cents until the view rounds them`);
    const v = safeToSpendView(ss);
    const want = Math.floor(ss.balance) - Math.ceil(ss.upcomingBills) - Math.ceil(ss.debtPayments) - Math.ceil(ss.safetyBuf) - Math.ceil(ss.savingsAlloc);
    t.eq(v.headline, want, "2c the one rounding: balance down, each deduction up, headline from those");
  }

  // ── 3. Many households ──────────────────────────────────────────────────────────────────────────
  {
    let s = 11640 >>> 0;
    const r = () => { s = (s + 0x6D2B79F5) >>> 0; let x = s; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
    const c = () => Math.round(r() * 250000) / 100;
    let n = 0, sumBad = 0, rowBad = 0, centBad = 0;
    for (let k = 0; k < 3000; k++) {
      const bals = Array.from({ length: 1 + Math.floor(r() * 4) }, c);
      const bills = Array.from({ length: Math.floor(r() * 6) }, (_, i) => ({ id: "b" + i, name: "Bill " + i, amount: Math.round(r() * 160000) / 100, date: String(27 + Math.floor(r() * 5)), freq: "monthly" }));
      const ss = SafeSpendEngine.calculate({ accounts: cash(bals), incomes: income, bills, debts: [], transactions: [] }, today);
      n++;
      if (Math.round(ss.balance * 100) !== bals.reduce((x, b) => x + Math.round(b * 100), 0)) sumBad++;
      if (Math.round(ss.upcomingBills * 100) !== ss.billsDueSoon.reduce((x, b) => x + Math.round(b.amount * 100), 0)) sumBad++;
      if (!["balance", "upcomingBills", "safetyBuf", "savingsAlloc", "safeAmount"].every((f) => isCents(ss[f]))) centBad++;
      const v = safeToSpendView(ss);
      if (v.rows.reduce((x, row) => x + (row.kind === "balance" ? row.display : -row.display), 0) !== v.headline) rowBad++;
    }
    t.eq([n, sumBad, centBad], [3000, 0, 0], "3a balance and bills equal their parts summed in cents, in every household");
    t.eq(rowBad, 0, "3b the shown rows add up to the headline");
  }

  t.summary("safeSpendCents");
})();
