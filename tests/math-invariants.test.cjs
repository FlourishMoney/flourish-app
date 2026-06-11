// tests/math-invariants.test.cjs — MATH-LOCK property-based suite.
// Hand-rolled property testing with a SEEDED PRNG (deterministic → CI-stable). Each property runs
// over many random inputs; a failure reports the exact counterexample. These encode the invariants
// that must hold for ANY input — the "no math change ships that breaks an invariant" guardrail.
"use strict";

const { create } = require("./_runner.cjs");
const D = (iso) => new Date(iso + "T12:00:00");

// mulberry32 — tiny deterministic PRNG so the suite is reproducible (no flaky property failures).
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

(async () => {
  const fc = await import("../src/lib/financialCalculations.js");
  const pn = await import("../src/lib/plaidNormalize.js");
  const ss = await import("../src/lib/safeSpendEngine.js");
  const t = create();
  const r = rng(0x5EED1234); // fixed seed
  const randInt = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  const randAmt = (lo, hi) => Math.round((lo + r() * (hi - lo)) * 100) / 100; // 2-decimal dollars

  // forAll: run `prop(i)` over n cases; prop returns true/false. Records first few counterexamples.
  const forAll = (n, label, prop) => {
    let ok = true; let example = null;
    for (let i = 0; i < n; i++) {
      let res; try { res = prop(); } catch (e) { res = { pass: false, info: "threw: " + e.message }; }
      if (res === true) continue;
      if (res === false || (res && res.pass === false)) { ok = false; example = (res && res.info) || "(case " + i + ")"; break; }
    }
    t.ok(ok, ok ? label : `${label} — counterexample: ${example}`);
  };

  // ── INVARIANT 1: cashFlow.monthlyBills === Σ billMonthlyAmount(bill) ─────────────────────────────
  forAll(200, "monthlyBills = sum of per-bill monthly amounts", () => {
    const freqs = ["weekly", "biweekly", "semimonthly", "monthly", "quarterly", "annually"];
    const bills = Array.from({ length: randInt(0, 6) }, () => ({ amount: String(randAmt(0, 800)), freq: freqs[randInt(0, freqs.length - 1)] }));
    const cf = fc.FinancialCalcEngine.cashFlow({ incomes: [], bills, accounts: [], debts: [], transactions: [] }, {}, D("2026-06-15"));
    // Recompute from a LITERAL cadence table (not billMonthlyAmount) so this independently constrains
    // both the per-bill multipliers AND cashFlow's summation — not a tautology against the SUT.
    const FACTORS = { weekly: 4.333, biweekly: 2.167, semimonthly: 2, monthly: 1, quarterly: 1 / 3, annually: 1 / 12 };
    const expected = bills.reduce((s, b) => { const a = parseFloat(b.amount || 0) || 0; return s + (a <= 0 ? 0 : a * FACTORS[b.freq]); }, 0);
    return Math.abs(cf.monthlyBills - expected) < 1e-6 ? true : { pass: false, info: `${cf.monthlyBills} vs ${expected}` };
  });

  // ── INVARIANT 2: SafeSpend conservation — when not clamped, safe + committed = balance ──────────
  // safeAmount = max(0, balance - upcomingBills - debtPayments - safetyBuf - savingsAlloc).
  // So whenever safeAmount > 0 (the unclamped branch), the five terms must sum back to balance.
  forAll(200, "SafeSpend: safe + committed = balance (unclamped)", () => {
    const data = {
      accounts: [{ type: "checking", balance: String(randAmt(0, 8000)) }],
      bills: Array.from({ length: randInt(0, 3) }, () => ({ name: "B", amount: String(randAmt(0, 400)), date: String(randInt(1, 28)), freq: "monthly", type: "fixed" })),
      debts: [{ min: String(randAmt(0, 300)) }],
      incomes: [{ amount: String(randAmt(0, 6000)), freq: "monthly" }],
      transactions: [],
    };
    const s = ss.SafeSpendEngine.calculate(data, D("2026-06-15"));
    if (s.safeAmount <= 0) return true; // clamped branch — conservation intentionally broken by max(0,…)
    const sum = s.safeAmount + s.upcomingBills + s.debtPayments + s.safetyBuf + s.savingsAlloc;
    return Math.abs(sum - s.balance) < 1e-6 ? true : { pass: false, info: `Σ=${sum} balance=${s.balance}` };
  });

  // ── INVARIANT 3: debt payoff totalInterest > 0 (and finite) whenever it amortizes ───────────────
  forAll(300, "debt payoff: positive finite interest when payment amortizes", () => {
    const balance = randAmt(100, 50000);
    const apr = randAmt(1, 36);
    const r_m = apr / 100 / 12;
    const minToAmortize = balance * r_m;
    const monthlyPayment = minToAmortize + randAmt(1, 1000); // strictly above interest → finite payoff
    const res = fc.simulateDebtPayoff({ balance, apr, monthlyPayment });
    if (!Number.isFinite(res.monthsToPayoff)) return { pass: false, info: `non-finite payoff bal=${balance} apr=${apr} pmt=${monthlyPayment}` };
    return res.totalInterest > 0 ? true : { pass: false, info: `interest=${res.totalInterest} bal=${balance} apr=${apr} pmt=${monthlyPayment}` };
  });

  // ── INVARIANT 4: biweekly cadence phase — next-due is always on the 14-day phase and ≥ today ────
  // A biweekly bill anchored N days ago → next due is today + (14 - N), still on the 14-day grid.
  forAll(100, "biweekly next-due on the 14-day phase, ≥ today (paid-N-days-ago)", () => {
    const today = D("2026-06-15");
    const N = randInt(1, 13);
    const anchor = new Date(today); anchor.setDate(anchor.getDate() - N);
    const next = fc.billNextDue({ freq: "biweekly", nextDueDate: fc.dateToISO(anchor) }, today);
    const daysOut = Math.round((next - today) / 86400000);
    return (next >= today && daysOut === 14 - N) ? true : { pass: false, info: `N=${N} daysOut=${daysOut} expected ${14 - N}` };
  });

  // ── INVARIANT 5: toMonthly is linear (scaling + additivity) ─────────────────────────────────────
  forAll(200, "toMonthly linear: f(2a)=2f(a) and f(a+b)=f(a)+f(b)", () => {
    const freqs = ["weekly", "biweekly", "semimonthly", "monthly", "annually"];
    const f = freqs[randInt(0, freqs.length - 1)];
    const a = randAmt(0, 5000), b = randAmt(0, 5000);
    const scale = Math.abs(fc.toMonthly(2 * a, f) - 2 * fc.toMonthly(a, f)) < 1e-6;
    const add = Math.abs(fc.toMonthly(a + b, f) - (fc.toMonthly(a, f) + fc.toMonthly(b, f))) < 1e-6;
    return (scale && add) ? true : { pass: false, info: `f=${f} a=${a} b=${b}` };
  });

  // ── INVARIANT 6: netWorth = assets − liabilities (exact) ────────────────────────────────────────
  forAll(200, "netWorth = assets − liabilities", () => {
    const accounts = Array.from({ length: randInt(0, 5) }, () => {
      const types = ["checking", "savings", "investment", "credit"];
      return { type: types[randInt(0, 3)], balance: String(randAmt(-5000, 10000)) };
    });
    const debts = Array.from({ length: randInt(0, 4) }, () => ({ balance: String(randAmt(0, 8000)) }));
    const nw = fc.FinancialCalcEngine.netWorth({ accounts, debts });
    return Math.abs(nw.netWorth - (nw.assets - nw.liabilities)) < 1e-6 ? true : { pass: false, info: `${nw.netWorth} vs ${nw.assets - nw.liabilities}` };
  });

  // ── INVARIANT 7: markTransfers conserves count + never mutates input ────────────────────────────
  forAll(150, "markTransfers preserves txn count and doesn't mutate input", () => {
    const txns = Array.from({ length: randInt(0, 10) }, (_, i) => ({ id: "x" + i, date: "2026-06-10", name: r() < 0.3 ? "Transfer to Savings" : "Shop", amount: (r() < 0.5 ? 1 : -1) * randAmt(1, 500), account_id: "acc" + randInt(1, 3) }));
    const before = JSON.stringify(txns);
    const out = pn.markTransfers(txns, fc.isInternalTransfer, fc.isCashAdvance);
    const countOk = out.length === txns.length;
    const noMutate = JSON.stringify(txns) === before; // markTransfers must copy, not mutate
    return (countOk && noMutate) ? true : { pass: false, info: `count ${out.length}/${txns.length} mutate=${!noMutate}` };
  });

  // ── INVARIANT 8: sync merge idempotency — re-delivering the same fresh set never duplicates ─────
  forAll(150, "mergeById idempotent on re-delivery (at-least-once safe)", () => {
    const mk = (n) => Array.from({ length: n }, (_, i) => ({ id: "id" + randInt(0, 20), amount: randAmt(1, 100) }));
    const prev = mk(randInt(0, 8));
    const fresh = mk(randInt(0, 8));
    const once = pn.mergeById(prev, fresh);
    const twice = pn.mergeById(once, fresh);
    // Re-merging the same fresh set is a no-op (ids unique, fresh already present) → identical length + id set.
    const ids1 = once.map(x => x.id).sort().join(",");
    const ids2 = twice.map(x => x.id).sort().join(",");
    return (once.length === twice.length && ids1 === ids2) ? true : { pass: false, info: `${once.length} vs ${twice.length}` };
  });

  // ── INVARIANT 9: removeByIds ∘ mergeById — a removed id never survives, others always do ────────
  forAll(150, "removeByIds removes exactly the targeted ids", () => {
    const fresh = Array.from({ length: randInt(1, 10) }, (_, i) => ({ id: "n" + i, amount: randAmt(1, 100) }));
    const removeSet = fresh.filter(() => r() < 0.4).map(x => x.id);
    const merged = pn.removeByIds(pn.mergeById([], fresh), removeSet);
    const survivorIds = new Set(merged.map(x => x.id));
    const noneRemoved = removeSet.every(id => !survivorIds.has(id));
    const othersKept = fresh.filter(x => !removeSet.includes(x.id)).every(x => survivorIds.has(x.id));
    return (noneRemoved && othersKept) ? true : { pass: false, info: `removed=${removeSet.join("/")}` };
  });

  // ── INVARIANT 10: emergencyFundMonths / savingsRate never NaN or negative for any sane input ────
  forAll(200, "ratios are finite + non-negative for any input", () => {
    const data = {
      accounts: [{ type: "savings", balance: String(randAmt(0, 20000)) }],
      bills: [{ amount: String(randAmt(0, 2000)), freq: "monthly" }],
      debts: [{ balance: String(randAmt(0, 30000)) }],
      incomes: [{ amount: String(randAmt(0, 8000)), freq: "monthly" }],
      transactions: [],
    };
    const ef = fc.FinancialCalcEngine.emergencyFundMonths(data, {}, D("2026-06-15"));
    const sr = fc.FinancialCalcEngine.savingsRate(data, {}, D("2026-06-15"));
    const dr = fc.FinancialCalcEngine.debtRatio(data, {}, D("2026-06-15"));
    return ([ef, sr, dr].every(v => Number.isFinite(v) && v >= 0)) ? true : { pass: false, info: `ef=${ef} sr=${sr} dr=${dr}` };
  });

  return t.summary("math-invariants.test");
})().catch(e => { console.error("math-invariants.test crashed:", e); process.exitCode = 1; });
