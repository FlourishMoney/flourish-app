// tests/paydayFromDeposits.test.cjs — MATH-LOCK
// -----------------------------------------------------------------------------
// THE BANK PATH'S EVERY-TWO-WEEKS PAYDAY COMES FROM THE LATEST DEPOSIT (audit 2026-10-26, H2).
//
// A linked household paid $2,100 every two weeks (deposits Oct 9 and Oct 23, and four before) was shown its
// next payday as Nov 9 and Nov 23 on Oct 26, when the deposits put it on Nov 6. The engines phase the cycle from
// the latest deposit (incomeSchedule.js findAnchor), but the saved household keeps manual transactions only
// (persistence.js manualTransactions): until the bank's transactions were fetched again there was no deposit
// to phase from, so the cycle was counted from today. Now the bank path saves the phase its deposits show as the
// income's next payday (withDepositPhase), so Today, Watch and the first number agree with or without them.
//   1  the audit's household: Nov 6 with the bank's transactions, and still Nov 6 without them (was Nov 9)
//   2  real deposits still win: pay that moved to the other week follows the deposits
//   3  nothing is saved where the deposits show no cycle (monthly pay, one deposit)
//   4  many households: the saved phase gives the same next payday as the deposits themselves
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");

(async () => {
  const t = create();
  const PN = await import("../src/lib/plaidNormalize.js");
  const IS = await import("../src/lib/incomeSchedule.js");
  const FE = await import("../src/lib/forecastEdits.js");
  const { ForecastEngine } = await import("../src/lib/forecastEngine.js");
  const { manualTransactions } = await import("../src/lib/persistence.js");
  const at = (y, m, d) => new Date(y, m - 1, d, 10);
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const BANK = { id: "acc-chq", institution: "RBC", type: "depository", subtype: "checking", balance: 3200, _item: "item-1" };

  // The audit's bank fixture (audit-ux server.cjs bankTxns), in Plaid's sign (money in is negative).
  const bankTxns = (today, payOffset = 3) => {
    const out = []; let id = 0;
    const push = (d, name, amount, category) => out.push({ id: `t${id++}`, date: FE.isoOf(d), name, amount, category, pending: false, account_id: "acc-chq" });
    for (let k = 1; k <= 6; k++) push(addDays(today, -payOffset - 14 * (k - 1)), "ACME CORP PAYROLL", -2100, "INCOME");
    for (let m = 0; m < 3; m++) push(addDays(today, -25 - 30 * m), "Landlord Rent", 1400, "RENT_AND_UTILITIES");
    for (let k = 1; k <= 40; k++) push(addDays(today, -k * 2), "Corner Grocery", 23 + (k % 5), "FOOD_AND_DRINK");
    return PN.normaliseTxns(out, today);
  };
  // What the bank path saves (App.jsx: the onboarding link and the first sync), and the household it reloads.
  const linked = (today, txns) => {
    const found = PN.detectIncomeFromTxns(txns);
    const inc = { id: 1, label: found.label, amount: String(found.perDeposit), freq: found.freq || "monthly", isVariable: found.isVariable,
      ...(found.anchorDay ? { anchorDay: found.anchorDay } : {}), ...IS.withDepositPhase(found, txns, today), autoDetected: true };
    return { accounts: [BANK], incomes: [inc], bills: [], debts: [], transactions: txns };
  };
  const reloaded = (data) => ({ ...data, transactions: manualTransactions(data.transactions, data.accounts) });
  const nextPay = (data, today) => { const n = FE.nextDepositFor(data, today); return n ? FE.isoOf(n.date) : null; };
  const watchPaydays = (data, today) => ForecastEngine.generate(data, 30, null, today).forecast
    .filter((f) => (f.incomes || []).length || f.income > 0).map((f) => FE.isoOf(f.date));

  // ── 1. The audit's household ────────────────────────────────────────────────────────────────────
  {
    const today = at(2026, 10, 26);
    const data = linked(today, bankTxns(today));
    t.eq(data.incomes[0].nextPayDate, "2026-11-06", "1a the bank path saves the next payday its deposits show (Oct 23 + 14 days)");
    t.eq([nextPay(data, today), watchPaydays(data, today)], ["2026-11-06", ["2026-11-06", "2026-11-20"]], "1b with the bank's transactions: Today and Watch say Nov 6, then Nov 20");
    const back = reloaded(data);
    t.eq(back.transactions.length, 0, "1c the saved household carries none of the bank's transactions (they are fetched again)");
    t.eq([nextPay(back, today), watchPaydays(back, today)], ["2026-11-06", ["2026-11-06", "2026-11-20"]], "1d without them: still Nov 6 and Nov 20 (was Nov 9 and Nov 23)");
    t.eq(FE.daysToNextDepositFor(back, today), 11, "1e safe to spend runs to Nov 6: 11 days, not 14");
  }

  // ── 2. Real deposits still win ──────────────────────────────────────────────────────────────────
  {
    const linkDay = at(2026, 10, 26);
    const data = linked(linkDay, bankTxns(linkDay));
    // A month on, the employer moved pay a week: the deposits now land 7 days off the saved phase.
    const later = at(2026, 11, 26);
    const moved = bankTxns(later, 10).filter((x) => /PAYROLL/.test(x.name));
    const now = { ...data, transactions: moved };
    t.eq(nextPay(now, later), FE.isoOf(addDays(later, 4)), "2a pay that moved a week follows the new deposits, not the saved date");
  }

  // ── 3. Nothing saved where the deposits show no cycle ───────────────────────────────────────────
  {
    const today = at(2026, 10, 26);
    const monthly = PN.normaliseTxns([0, 1, 2].map((m) => ({ id: "m" + m, date: FE.isoOf(new Date(2026, 9 - m, 15, 12)), name: "ACME CORP PAYROLL", amount: -4200, category: "INCOME", account_id: "acc-chq" })), today);
    const fm = PN.detectIncomeFromTxns(monthly);
    t.eq([fm.freq, IS.withDepositPhase(fm, monthly, today)], ["monthly", {}], "3a monthly pay keeps its day of the month: no next payday saved");
    const one = PN.normaliseTxns([{ id: "o", date: "2026-10-23", name: "ACME CORP PAYROLL", amount: -2100, category: "INCOME", account_id: "acc-chq" }], today);
    t.eq(IS.withDepositPhase({ label: "ACME CORP PAYROLL", perDeposit: 2100, freq: "biweekly" }, one, today), {}, "3b one deposit is not a cycle: nothing saved (the payday question is asked)");
    t.eq(IS.withDepositPhase(null, one, today), {}, "3c nothing detected: nothing saved");
  }

  // ── 4. The saved phase agrees with the deposits ─────────────────────────────────────────────────
  {
    let s = 26102026 >>> 0;
    const r = () => { s = (s + 0x6D2B79F5) >>> 0; let x = s; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
    let n = 0, bad = 0, saved = 0;
    const first = [];
    for (let k = 0; k < 400; k++) {
      const today = at(2026, 1 + Math.floor(r() * 12), 1 + Math.floor(r() * 28));
      const step = r() < 0.7 ? 14 : 7;
      const amt = Math.round(800 + r() * 3000);
      const raw = [];
      const last = 1 + Math.floor(r() * (step - 1));
      for (let j = 0; j < 3 + Math.floor(r() * 6); j++) raw.push({ id: "p" + j, date: FE.isoOf(addDays(today, -last - step * j)), name: "PAYROLL DEPOSIT", amount: -amt, category: "INCOME", account_id: "acc-chq" });
      const txns = PN.normaliseTxns(raw, today);
      const data = linked(today, txns);
      // Four deposits every two weeks can read as twice a month (detectCadence); that cadence keeps its days.
      if (!["weekly", "biweekly"].includes(data.incomes[0].freq)) continue;
      if (data.incomes[0].nextPayDate) saved++;
      n++;
      const withTx = nextPay(data, today), without = nextPay(reloaded(data), today);
      if (withTx !== without) { bad++; if (first.length < 2) first.push(`${FE.isoOf(today)} every ${step}: ${withTx} vs ${without}`); }
    }
    t.ok(n > 350 && saved === n, `4a (${n} linked households paid weekly or every two weeks, ${saved} with a saved next payday)`);
    t.eq(bad, 0, `4b the next payday is the same with and without the bank's transactions${first.length ? ": " + first.join("; ") : ""}`);
  }

  t.summary("paydayFromDeposits");
})();
