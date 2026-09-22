// tests/decisionEngine.test.cjs — the pure helpers that are the single source of truth for Meet's
// decision outcomes: debtPayoffMonths (before/after payoff) and savingsBufferAfter (what the buffer
// becomes). Also pins that debtPayoffMonths stays consistent with computeDebtPayoffImpact (one
// amortization, no drift).
"use strict";
const { create } = require("./_runner.cjs");
const t = create();

(async () => {
  const { debtPayoffMonths, savingsBufferAfter, computeDebtPayoffImpact } = await import("../src/lib/decisionEngine.js");

  const visa = { name: "Visa card", balance: "3420", rate: "19.99", min: "68" };

  // debtPayoffMonths — before vs after
  const before = debtPayoffMonths(visa, 0);
  const after = debtPayoffMonths(visa, 604);
  t.ok(before > after, "1a extra payment shortens payoff (before > after)");
  t.ok(after > 0 && after < 24, "1b $604 extra clears the card within two years");
  t.ok(before > 24 && before <= 240, "1c baseline payoff at the minimum is much longer, within the ceiling");
  // single source: computeDebtPayoffImpact (months saved) must equal baseline − with-extra
  t.eq(computeDebtPayoffImpact(visa, 604), before - after, "1d months-saved == baseline − with-extra (one amortization, no drift)");
  t.eq(debtPayoffMonths(null, 100), 0, "1e null debt → 0");
  t.eq(debtPayoffMonths({ balance: "0", rate: "19.99" }, 100), 0, "1f zero balance → 0");
  t.ok(debtPayoffMonths({ balance: "50000", rate: "29.99" }, 0) <= 240, "1g respects the 240-month ceiling");

  // savingsBufferAfter — what the buffer becomes
  const buf = savingsBufferAfter([{ type: "savings", balance: 1840 }, { type: "checking", balance: 1243.88 }, { type: "credit", balance: -3420 }], 604);
  t.eq(buf.current, 1840, "2a current buffer = sum of savings accounts only (chequing/credit excluded)");
  t.eq(buf.after, 2444, "2b after = current + floored extra");
  t.eq(savingsBufferAfter([], 604).current, 0, "2c no savings accounts → current 0");
  t.eq(savingsBufferAfter([], 604).after, 604, "2d ...after = the extra");
  t.eq(savingsBufferAfter([{ type: "savings", balance: 1000 }], 0).after, 1000, "2e zero extra → unchanged");
  t.eq(savingsBufferAfter(null, 100).after, 100, "2f null accounts guarded");

  t.summary("decisionEngine");
})();
