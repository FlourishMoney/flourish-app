// tests/billPaidOnce.test.cjs — MATH-LOCK
// -----------------------------------------------------------------------------
// ONE "ALREADY PAID" RULE FOR TODAY, THE FIRST NUMBER AND WATCH (audit 2026-10-26, B1).
//
// Safe to spend used to call a monthly bill paid when ANY matching payment had posted this calendar month, so late
// in a month the next occurrence (next month, still before payday) dropped out of the number: rent of $1,500 due
// the 1st, paid Oct 1, next payday Nov 6, showed $2,291 safe on Oct 26 instead of $791, while Watch still took the
// rent out on Nov 1. Now one rule decides (forecastEdits.js billArrived, used by billOccurrences, which both engines
// read): a payment marks the occurrence it is nearest to.
//   1  the audit's case, to the cent, on Today, Due soon and Watch
//   2  a payment marks one occurrence: the one it is nearest to (early, on time, late, exactly halfway)
//   3  Today and Watch reserve the same bills, with payments in play, across many households and time zones
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const { execFileSync } = require("child_process");

const ZONES = ["America/Toronto", "America/Vancouver", "America/Halifax", "UTC", "Pacific/Auckland"];

async function main() {
  const t = create();
  const { SafeSpendEngine } = await import("../src/lib/safeSpendEngine.js");
  const { ForecastEngine } = await import("../src/lib/forecastEngine.js");
  const { safeToSpendView } = await import("../src/lib/safeToSpendView.js");
  const FE = await import("../src/lib/forecastEdits.js");
  const at = (y, m, d) => new Date(y, m - 1, d, 10);
  const tz = process.env.TZ || "local";

  // ── 1. The audit's case ─────────────────────────────────────────────────────────────────────────
  const rentHousehold = (paidOn) => ({
    accounts: [{ id: "a", type: "depository", subtype: "checking", balance: 3000 }],
    incomes: [{ id: "i1", label: "Job", amount: 2000, freq: "biweekly", nextPayDate: "2026-11-06" }],
    bills: [{ id: "b1", name: "Rent", amount: 1500, date: "1", freq: "monthly" }],
    transactions: paidOn ? [{ id: "t1", name: "Rent", amount: 1500, date: paidOn }] : [],
    debts: [],
  });
  {
    const today = at(2026, 10, 26);
    const data = rentHousehold("2026-10-01");
    const ss = SafeSpendEngine.calculate(data, today);
    t.eq([ss.upcomingBills, ss.billsDueSoon.map((b) => `${b.name} ${b.amount} ${FE.isoOf(b.date)}`)], [1500, ["Rent 1500 2026-11-01"]],
      `1a [${tz}] rent paid Oct 1 does not pay Nov 1's rent: Nov 1 is reserved, and Due soon shows it`);
    t.eq(safeToSpendView(ss, { hasCashAccount: true }).headlineText, "$791", `1b [${tz}] Today shows $791 safe (was $2,291)`);
    const fc = ForecastEngine.generate(data, 14, null, today);
    t.ok(fc.forecast.some((f) => FE.isoOf(f.date) === "2026-11-01" && f.bills.some((b) => b.name === "Rent" && b.amount === 1500)), `1c [${tz}] Watch takes the same rent out on Nov 1`);
  }

  // ── 2. A payment marks the occurrence it is nearest to ──────────────────────────────────────────
  const reserved = (paidOn, today, bill = { id: "b1", name: "Rent", amount: 1500, date: "20", freq: "monthly" }) => {
    const data = { ...rentHousehold(paidOn), bills: [bill], incomes: [{ id: "i1", label: "Job", amount: 2000, freq: "monthly", anchorDay: 28 }] };
    return SafeSpendEngine.calculate(data, today).upcomingBills;
  };
  t.eq(reserved("2026-10-10", at(2026, 10, 12)), 0, `2a [${tz}] paid ten days early (Oct 10 for Oct 20): the Oct 20 rent is paid, not reserved again`);
  t.eq(reserved("2026-10-20", at(2026, 10, 21)), 0, `2b [${tz}] paid on its day: nothing more reserved until the next one (outside the window)`);
  t.eq(reserved("2026-09-22", at(2026, 10, 12)), 1500, `2c [${tz}] last month's payment, posted late (Sep 22 for Sep 20): the Oct 20 rent is still reserved`);
  t.eq(reserved("2026-10-05", at(2026, 10, 12)), 1500, `2d [${tz}] exactly halfway between Sep 20 and Oct 20: it belongs to the earlier one, so Oct 20 is still reserved (cautious)`);
  // Review of 2026-10-26: past halfway but more than 10 days early, a payment may be the one before paid late.
  t.eq(reserved("2026-10-06", at(2026, 10, 12)), 1500, `2e [${tz}] a day past halfway, 14 days early, and Sep 20 has no payment: it may be Sep 20's paid late, so Oct 20 is still reserved`);
  {
    const data = { ...rentHousehold(null), bills: [{ id: "b1", name: "Rent", amount: 1500, date: "20", freq: "monthly" }], incomes: [{ id: "i1", label: "Job", amount: 2000, freq: "monthly", anchorDay: 28 }],
      transactions: [{ id: "p0", name: "Rent", amount: 1500, date: "2026-09-19" }, { id: "p1", name: "Rent", amount: 1500, date: "2026-10-06" }] };
    t.eq(SafeSpendEngine.calculate(data, at(2026, 10, 12)).upcomingBills, 0, `2e2 [${tz}] …but with Sep 20 paid (Sep 19), the Oct 6 payment is Oct 20's, 14 days early`);
    const late = { ...rentHousehold("2026-10-20") };
    t.eq(SafeSpendEngine.calculate(late, at(2026, 10, 26)).upcomingBills, 1500, `2e3 [${tz}] rent due the 1st, paid Oct 20 (October's, late): Nov 1 is still reserved`);
    const et = { ...rentHousehold(null), transactions: [{ id: "e", name: "INTERAC E-TRANSFER RENT", amount: 1500, date: "2026-10-30", isTransfer: true }] };
    t.eq(SafeSpendEngine.calculate(et, at(2026, 10, 31)).upcomingBills, 0, `2e4 [${tz}] rent paid by Interac e-transfer (flagged a transfer, not paired with another account) pays Nov 1`);
  }
  {
    // One payment, a weekly bill: it marks only the occurrence it is nearest to, never two.
    const today = at(2026, 10, 12);
    const bill = { id: "w", name: "Daycare", amount: 200, freq: "weekly", nextDueDate: "2026-10-13" };
    const data = { ...rentHousehold(null), bills: [bill], transactions: [{ id: "p", name: "Daycare", amount: 200, date: "2026-10-12" }],
      incomes: [{ id: "i1", label: "Job", amount: 2000, freq: "monthly", anchorDay: 28 }] };
    const occ = FE.billOccurrences(data, today, 16, { includeToday: true }).map((o) => FE.isoOf(o.date));
    t.eq(occ, ["2026-10-20", "2026-10-27"], `2f [${tz}] one payment the day before a weekly bill marks that one occurrence only`);
  }

  // ── 3. Today and Watch reserve the same bills, payments in play ─────────────────────────────────
  {
    let s = 20261026 >>> 0;
    const r = () => { s = (s + 0x6D2B79F5) >>> 0; let x = s; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
    const pick = (a) => a[Math.floor(r() * a.length)];
    let mismatches = 0, cases = 0, withPayments = 0;
    const first = [];
    for (let n = 0; n < 600; n++) {
      const today = at(2026, 1 + Math.floor(r() * 12), 1 + Math.floor(r() * 28));
      const addD = (k) => { const d = new Date(today); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + k); return d; };
      const bills = [], transactions = [];
      const nB = 1 + Math.floor(r() * 5);
      for (let i = 0; i < nB; i++) {
        const freq = pick(["monthly", "monthly", "monthly", "weekly", "biweekly", "quarterly"]);
        const b = { id: "b" + i, name: pick(["Rent", "Hydro", "Rogers", "Gym", "Insurance"]) + " " + i, amount: Math.round((10 + r() * 1500) * 100) / 100, freq, date: String(1 + Math.floor(r() * 31)) };
        if (freq !== "monthly" || r() < 0.3) b.nextDueDate = FE.isoOf(addD(Math.floor(r() * 30) - 5));
        if (r() < 0.6) transactions.push({ id: "p" + i, name: b.name, amount: b.amount, date: FE.isoOf(addD(-Math.floor(r() * 40))) });
        bills.push(b);
      }
      const data = { accounts: [{ id: "a", type: "depository", subtype: "checking", balance: 4000 }], debts: [], bills, transactions,
        incomes: [{ id: "i", label: "Job", amount: 2500, freq: pick(["biweekly", "monthly", "weekly"]), nextPayDate: FE.isoOf(addD(1 + Math.floor(r() * 20))) }] };
      const ss = SafeSpendEngine.calculate(data, today);
      const H = FE.daysToNextDepositFor(data, today);
      if (!(H > 0)) continue;
      cases++;
      if (transactions.length) withPayments++;
      // Today's reserve for days 1..H against Watch's bills on the same days (Watch does not take day 0).
      const todayCents = ss.billsDueSoon.filter((b) => FE.dayDiff(today, b.date) >= 1).reduce((x, b) => x + Math.round(b.amount * 100), 0);
      const fc = ForecastEngine.generate(data, H, null, today);
      const watchCents = fc.forecast.filter((f) => { const k = FE.dayDiff(today, f.date); return k >= 1 && k <= H; })
        .reduce((x, f) => x + f.bills.reduce((y, b) => y + Math.round(b.amount * 100), 0), 0);
      if (todayCents !== watchCents) { mismatches++; if (first.length < 2) first.push(`${FE.isoOf(today)}: Today ${todayCents} vs Watch ${watchCents}`); }
    }
    t.ok(cases > 400 && withPayments > 250, `3a [${tz}] (${cases} households, ${withPayments} with bill payments)`);
    t.eq(mismatches, 0, `3b [${tz}] Today and Watch reserve the same bills before payday, to the cent${first.length ? ": " + first.join("; ") : ""}`);
  }
  return t;
}

if (process.env.BILL_PAID_ONCE_CHILD) {
  main().then((t) => { const f = t.summary(`billPaidOnce [${process.env.TZ}]`); process.exitCode = f ? 1 : 0; });
} else {
  // Every zone in its own process (the engines read the local clock and zone).
  const t = create();
  for (const zone of ZONES) {
    let out = "", ok = true;
    try { out = execFileSync(process.execPath, [__filename], { env: { ...process.env, TZ: zone, BILL_PAID_ONCE_CHILD: "1" }, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }); }
    catch (e) { ok = false; out = String(e.stdout || "") + String(e.stderr || ""); }
    const m = out.match(/✓ billPaidOnce \[[^\]]+\]: (\d+)\/(\d+) passed/);
    t.ok(ok && !!m, `${zone}: every check passes${ok && m ? ` (${m[1]})` : "\n" + out.split("\n").filter((l) => /•|expected|actual|Error/.test(l)).slice(0, 8).join("\n")}`);
  }
  t.summary("billPaidOnce");
}
