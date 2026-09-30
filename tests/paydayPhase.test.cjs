// tests/paydayPhase.test.cjs
// -----------------------------------------------------------------------------
// WEEKLY AND BIWEEKLY PAY IS PHASED OFF A REAL CYCLE (round-2 fix, item 1).
//
// findAnchor used to take the NEWEST deposit that was within 8% of the entered pay, or whose name
// matched a label longer than three characters, at any amount. So:
//   - variable pay ($1,600 to $2,400 against $2,000 entered) matched nothing, and the forecast
//     counted forward from today on the wrong days;
//   - a two-letter label ("UW") could never match its own deposits;
//   - an off-cycle bonus under the employer's name became the anchor and moved every payday.
//
// Now a deposit is this income's only within bounded amounts (±8%, or 0.6x-1.5x for variable pay),
// by a pay-like name or the label as a whole word; and the phase is the newest deposit on a chain of
// at least two whose gaps are about one cycle (7 ±2 or 14 ±3 days). Off-cycle deposits are on no chain.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");

(async () => {
  const t = create();
  const S = await import("../src/lib/incomeSchedule.js");
  const iso = (d) => d && `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const TODAY = new Date(2026, 8, 29, 12); // Tue Sep 29 2026
  const dep = (date, amount, name, cat = "Income") => ({ date, amount: -amount, name, cat });
  const next = (inc, txns) => S.nextFutureDeposit([inc], txns, TODAY);

  // ── 1. Variable pay, $1,600 to $2,400 against $2,000 entered ─────────────────────────────────
  {
    const inc = { id: 1, label: "Shifts", amount: "2000", freq: "biweekly", isVariable: true };
    const txns = [dep("2026-08-30", 1650, "PAYROLL DEPOSIT"), dep("2026-09-13", 2400, "PAYROLL DEPOSIT"), dep("2026-09-27", 1600, "PAYROLL DEPOSIT")];
    t.eq(iso(S.findAnchor(inc, 2000, txns)), "2026-09-27", "1a variable pay: phased off the last real payday (Sep 27), though no deposit is within 8% of $2,000");
    const n = next(inc, txns);
    t.eq([iso(n && n.date), n && n.confidence], ["2026-10-11", "high"], "1b …so the next payday is Oct 11, from real history, not Oct 13 counted from today");
    t.eq(S.isDepositToday([inc], txns, new Date(2026, 9, 11, 9)), true, "1c …and Oct 11 is a payday");
    // Bounded: a variable income still does not claim a deposit far outside its range.
    t.eq(S.findAnchor(inc, 2000, [dep("2026-09-13", 9000, "PAYROLL DEPOSIT"), dep("2026-09-27", 9000, "PAYROLL DEPOSIT")]), null,
         "1d variable pay is still bounded: $9,000 deposits are not this $2,000 income's");
  }

  // ── 2. A two-letter label ─────────────────────────────────────────────────────────────────────
  {
    const inc = { id: 1, label: "UW", amount: "1500", freq: "biweekly" };
    const txns = [dep("2026-09-08", 1500, "UW STIPEND", "Other"), dep("2026-09-22", 1500, "UW STIPEND", "Other")];
    t.eq(iso(S.findAnchor(inc, 1500, txns)), "2026-09-22", "2a a two-letter label matches its own deposits (\"UW STIPEND\")");
    t.eq(iso(next(inc, txns).date), "2026-10-06", "2b …so the next payday is Oct 6");
    // As a whole word only: "UW" is not inside "SUWANNEE".
    t.eq(S.findAnchor(inc, 1500, [dep("2026-09-08", 1500, "SUWANNEE CO", "Other"), dep("2026-09-22", 1500, "SUWANNEE CO", "Other")]), null,
         "2c …as a whole word only, not inside another name");
  }

  // ── 3. An off-cycle bonus ─────────────────────────────────────────────────────────────────────
  {
    const inc = { id: 1, label: "Acme Payroll", amount: "2000", freq: "biweekly" };
    const pay = [dep("2026-08-29", 2000, "ACME PAYROLL"), dep("2026-09-12", 2000, "ACME PAYROLL"), dep("2026-09-26", 2000, "ACME PAYROLL")];
    const withBonus = [...pay, dep("2026-09-28", 5000, "ACME PAYROLL BONUS")];
    t.eq(iso(S.findAnchor(inc, 2000, withBonus)), "2026-09-26", "3a a $5,000 bonus under the employer's name is not the anchor (its amount is out of bounds)");
    t.eq(iso(next(inc, withBonus).date), "2026-10-10", "3b …so the next payday stays Oct 10, not Oct 12");
    // Off-cycle at the SAME amount: only the cycle can rule it out.
    const withRefund = [...pay, dep("2026-09-28", 2000, "DIRECT DEPOSIT")];
    t.eq(iso(S.findAnchor(inc, 2000, withRefund)), "2026-09-26", "3c a same-amount deposit two days off the cycle is not the anchor either");
    t.eq(S.isDepositToday([inc], withRefund, new Date(2026, 9, 10, 9)), true, "3d …Oct 10 is still payday");
  }

  // ── 4. One deposit is not a cycle ─────────────────────────────────────────────────────────────
  {
    const inc = { id: 1, label: "Job", amount: "2000", freq: "biweekly" };
    const one = [dep("2026-09-22", 2000, "PAYROLL DEPOSIT")];
    t.eq(S.findAnchor(inc, 2000, one), null, "4a a single deposit gives no phase");
    const n = next(inc, one);
    t.eq([iso(n.date), n.confidence], ["2026-10-13", "estimated"], "4b …so the forecast counts forward from today and says it is an estimate");
    const weekly = { id: 2, label: "Job", amount: "500", freq: "weekly" };
    t.eq(iso(S.findAnchor(weekly, 500, [dep("2026-09-15", 500, "PAYROLL"), dep("2026-09-22", 500, "PAYROLL")])), "2026-09-22", "4c weekly: two deposits a week apart are a cycle");
  }

  t.summary("paydayPhase.test");
})();
