// tests/lowBalanceThreshold.test.cjs
// -----------------------------------------------------------------------------
// Low-balance warning threshold.
//
// The defect: the threshold was purely proportional (`running < balance * 0.12`). At balance 0 that
// reduces to `running < 0 && running >= 0` — never true — so users with no cash were the ONLY
// population that could never receive the warning. A negative balance was worse: the threshold went
// negative too.
//
// The fix takes the LARGER of the proportional band and an absolute floor, where the floor is the
// app's existing safetyBuf (~10 days of the user's own average daily spend), falling back to $100 when
// there is no spending history to derive a runway from.
// -----------------------------------------------------------------------------
"use strict";

const { create } = require("./_runner.cjs");

(async () => {
  const { ForecastEngine } = await import("../src/lib/forecastEngine.js");
  const { SafeSpendEngine, lowBalanceThreshold, LOW_BALANCE_FALLBACK_FLOOR } =
    await import("../src/lib/safeSpendEngine.js");
  const t = create();

  const chq = (balance) => ([{ id: "chq", name: "Chequing", type: "depository", subtype: "checking", balance }]);

  // ── The threshold function in isolation ───────────────────────────────────────────────────────
  t.eq(LOW_BALANCE_FALLBACK_FLOOR, 100, "the documented fallback floor is $100");
  t.eq(lowBalanceThreshold({ balance: 0, safetyBuf: 0 }), 100,
       "ZERO BALANCE yields a $100 threshold, not $0. This is the whole defect: a $0 threshold made " +
       "the warning unreachable for the users closest to the edge.");
  t.eq(lowBalanceThreshold({ balance: -50, safetyBuf: 0 }), 100,
       "a NEGATIVE balance also yields a positive threshold — proportional-only went negative");
  t.eq(lowBalanceThreshold({ balance: 200, safetyBuf: 0 }), 100,
       "at $200 the floor ($100) beats the proportional band ($24)");
  t.eq(lowBalanceThreshold({ balance: 10000, safetyBuf: 0 }), 1200,
       "at $10,000 the proportional band ($1,200) beats the floor — high-balance behaviour is UNCHANGED, " +
       "so this fix only ever adds warnings, never removes them");
  t.eq(lowBalanceThreshold({ balance: 1000, safetyBuf: 300 }), 300,
       "safetyBuf ($300 = 10 days of real spend) beats both the proportional band ($120) and the $100 " +
       "fallback — the floor is PERSONALISED rather than a flat constant");
  t.eq(lowBalanceThreshold({ balance: 5000, safetyBuf: 300 }), 600,
       "…but the proportional band still wins when it is the larger of the two");
  t.eq(lowBalanceThreshold({ balance: NaN, safetyBuf: NaN }), 100,
       "non-finite inputs degrade to the floor rather than producing a NaN threshold");
  t.eq(lowBalanceThreshold(undefined), 100, "a missing input object degrades safely");

  // ── The exact crossover where proportional and absolute disagree ──────────────────────────────
  // 0.12 * balance === 100 at balance === 833.33
  t.eq(lowBalanceThreshold({ balance: 800, safetyBuf: 0 }), 100,
       "just BELOW the crossover ($833) the absolute floor governs");
  t.eq(lowBalanceThreshold({ balance: 900, safetyBuf: 0 }), 108,
       "just ABOVE the crossover the proportional band governs");
  t.ok(lowBalanceThreshold({ balance: 833, safetyBuf: 0 }) === 100 &&
       lowBalanceThreshold({ balance: 834, safetyBuf: 0 }) > 100,
       "the handover between the two rules is continuous — no gap where neither applies");

  // ── ZERO BALANCE: the population that was being missed ────────────────────────────────────────
  {
    const today = new Date(2026, 2, 10, 12, 0, 0);
    // $0 to start, a modest payday, then a bill that drops them low again — the classic
    // living-paycheque-to-paycheque shape.
    const data = {
      accounts: chq(0),
      incomes: [{ id: 1, label: "Job", amount: "900", freq: "biweekly" }],
      bills: [{ name: "Rent", amount: "850", date: "26", freq: "monthly", type: "fixed" }],
      debts: [], transactions: [],
    };
    const r = ForecastEngine.generate(data, 30, null, today);
    t.eq(r.canProject, true, "baseline: this fixture projects cleanly");
    t.ok(r.lowBalanceWarnings.length > 0,
         "a user starting at $0 NOW RECEIVES low-balance warnings. Under proportional-only they got " +
         "exactly zero warnings, no matter how dire the projection — the warning was structurally " +
         "unreachable for them.");
    t.ok(r.lowBalanceWarnings.every(w => w.balance >= 0),
         "low-balance warnings stay in the non-negative band; anything below 0 is an overdraft instead");
  }

  // ── NEAR-ZERO BALANCE ─────────────────────────────────────────────────────────────────────────
  {
    const today = new Date(2026, 2, 10, 12, 0, 0);
    const data = {
      accounts: chq(40),
      incomes: [{ id: 1, label: "Job", amount: "700", freq: "biweekly" }],
      bills: [{ name: "Phone", amount: "660", date: "20", freq: "monthly", type: "fixed" }],
      debts: [], transactions: [],
    };
    const r = ForecastEngine.generate(data, 30, null, today);
    t.ok(r.lowBalanceWarnings.length > 0,
         "a near-zero balance ($40) also produces warnings — proportional-only gave a $4.80 threshold, " +
         "so effectively nothing could ever trip it");
  }

  // ── HIGH BALANCE: unchanged behaviour, no new noise ───────────────────────────────────────────
  {
    const today = new Date(2026, 2, 10, 12, 0, 0);
    const comfortable = {
      accounts: chq(20000),
      incomes: [{ id: 1, label: "Job", amount: "3000", freq: "biweekly" }],
      bills: [{ name: "Rent", amount: "1500", date: "1", freq: "monthly", type: "fixed" }],
      debts: [], transactions: [],
    };
    const r = ForecastEngine.generate(comfortable, 30, null, today);
    t.eq(r.lowBalanceWarnings.length, 0,
         "a comfortable user gets NO low-balance noise — the floor never fires for them because the " +
         "proportional band is far higher, so the fix does not trade one wrong signal for another");
  }

  // ── The floor tracks SPENDING, not balance — the noise/sensitivity tension ────────────────────
  {
    // Two users, same $0 balance. One spends heavily, one barely spends. A flat constant would treat
    // them identically; a runway-based floor does not.
    const today = new Date(2026, 2, 10, 12, 0, 0);
    const spendy = [];
    for (let d = 1; d <= 28; d++) {
      spendy.push({ name: "Groceries", amount: 60, cat: "Groceries",
                    date: `2026-02-${String(d).padStart(2, "0")}` });
    }
    const heavy = SafeSpendEngine.calculate(
      { accounts: chq(0), incomes: [], bills: [], debts: [], transactions: spendy }, today);
    const frugal = SafeSpendEngine.calculate(
      { accounts: chq(0), incomes: [], bills: [], debts: [], transactions: [] }, today);

    t.ok(lowBalanceThreshold(heavy) > lowBalanceThreshold(frugal),
         "a heavy spender gets a HIGHER low-balance floor than a frugal one at the same $0 balance — " +
         "this is why the floor is anchored on safetyBuf (a personal 10-day runway) rather than on a " +
         "flat constant, which would be too noisy for one and too quiet for the other");
    t.eq(lowBalanceThreshold(frugal), 100,
         "with no spending history at all we fall back to $100 rather than to $0");
  }

  t.summary("lowBalanceThreshold.test");
})();
