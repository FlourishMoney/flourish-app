// tests/forecastWalk.test.cjs
// -----------------------------------------------------------------------------
// THE DEFECT THIS EXISTS FOR. The forecast drill-down — the panel a user opens specifically to check
// the arithmetic — printed an equation that did not add up on four of the demo's seven event days:
//
//     Opening balance             $2,617
//     Deposit                    +$2,840
//     Est. daily spend (30d avg)    −$33
//     Projected balance (est.)    $5,423      ← 2,617 + 2,840 − 33 = 5,424
//
// Three rounding directions in one equation, and a daily-spend estimate of $33.4617 displayed as $33
// while the result kept the 46 cents. The walk now carries CENTS throughout and is computed in
// integer cents by lib/forecastWalk.js, so it is exact by construction rather than by luck.
//
// These tests do NOT re-implement the walk. They render it, PARSE THE DISPLAYED STRINGS BACK, and
// require the printed numbers to reconcile — because a user reads the strings, not the integers.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");

(async () => {
  const { forecastWalk } = await import("../src/lib/forecastWalk.js");
  const { ForecastEngine } = await import("../src/lib/forecastEngine.js");
  const { FinancialCalcEngine } = await import("../src/lib/financialCalculations.js");
  const F = await import("../src/lib/demoFixture.js");
  const t = create();

  // Parse a rendered money string back to integer cents, exactly as a reader would add it up.
  const parse = (str) => {
    const neg = str.trim().startsWith("-");
    const n = Number(String(str).replace(/[-$,\s]/g, ""));
    return Math.round(n * 100) * (neg ? -1 : 1);
  };
  t.eq(parse("$2,916.00"), 291600, "0a the string parser reads a formatted amount back to cents");
  t.eq(parse("-$629.12"), -62912, "0b …including a negative one");

  // ── 1. The printed equation reconciles, on EVERY event day, for BOTH demo households ───────────
  // Twelve dates spread across a month, both month ends, a 28-day February, a leap February and a
  // year boundary — the same spread the fixtures' stability is pinned on.
  const DATES = ["2026-09-16", "2026-09-22", "2026-09-30", "2026-10-01", "2026-10-31", "2026-11-01",
                 "2026-02-01", "2026-02-27", "2026-02-28", "2028-02-29", "2026-12-31", "2027-01-01"];
  let daysChecked = 0, eventDays = 0, maxDrift = 0;

  for (const cc of ["CA", "US"]) {
    for (const s of DATES) {
      const d = new Date(`${s}T12:00:00`);
      const snap = {
        profile: F.demoProfileFor(cc), accounts: F.demoAccountsFor(cc), debts: F.demoDebtsFor(cc),
        incomes: F.buildDemoIncomes(d, cc), bills: F.buildDemoBills(d, cc),
        transactions: F.buildDemoTxns(d, cc), bankConnected: true, demo: true,
      };
      const avgDailySpend = FinancialCalcEngine.avgDailySpend(snap, d);
      const { forecast } = ForecastEngine.generate(snap, 45, null, d);

      for (let i = 0; i < forecast.length; i++) {
        const ev = forecast[i];
        const w = forecastWalk({
          opening: i > 0 ? forecast[i - 1].balance : ev.balance,
          income: ev.income, bills: ev.bills, avgDailySpend,
          closing: ev.balance, isToday: i === 0,
        });
        daysChecked++;
        if (!w.hasWalk) continue;
        eventDays++;

        // THE assertion: add up what is PRINTED and require it to equal the PRINTED result.
        const walked = w.rows.reduce((sum, r) => sum + (r.sign === "−" ? -parse(r.value) : parse(r.value)), 0);
        if (walked !== parse(w.closingText)) {
          t.eq(`${cc}@${s} day ${i}: ${w.rows.map(r => r.sign + r.value).join(" ")} = ${w.closingText}`,
               "reconciles", "the printed walk must add up");
        }
        maxDrift = Math.max(maxDrift, w.spendDriftCents);
      }
    }
  }
  t.ok(daysChecked >= 2 * DATES.length * 40, `1a walked ${daysChecked} forecast days across both fixtures and all ${DATES.length} dates`);
  t.ok(eventDays > 0, `1b …of which ${eventDays} render a full walk`);
  t.eq(maxDrift <= 1, true, `1c the displayed "Est. daily spend" never drifts more than a cent from the real 30-day average (max seen: ${maxDrift}¢)`);

  // The old whole-dollar walk really did fail — pinned so nobody "simplifies" back to it.
  {
    const open = 2617.08, spend = 33.4617, income = 2840, close = open + income - spend;
    const oldWalk = Math.floor(open) + Math.round(income) - Math.round(spend);
    t.eq(oldWalk, 5424, "1d the old whole-dollar walk printed 2,617 + 2,840 − 33 = 5,424…");
    t.eq(Math.floor(close), 5423, "1e …above a projected balance of 5,423 — the $1 the user was shown");
    const w = forecastWalk({ opening: open, income, bills: [], avgDailySpend: spend, closing: close, isToday: false });
    t.eq(w.rows.map(r => r.sign + r.value).join(" ") + " = " + w.closingText,
         "$2,617.08 +$2,840.00 −$33.46 = $5,423.62", "1f …and the cents walk prints an equation that is true");
    t.eq(w.headlineText, "$5,423", "1g the collapsed row is still whole dollars, floored");
    t.eq(w.roundedFromText, "$5,423.62", "1h …and the panel says what it was rounded down from");
  }

  // ── 2. The two precisions are one rule, not an exception ───────────────────────────────────────
  t.eq(forecastWalk({ opening: 100, bills: [], avgDailySpend: 0, closing: 100, isToday: false }).roundedFromText, null,
    "2a no 'rounded down from' caption when there are no cents to explain");
  {
    const w = forecastWalk({ opening: 700.00, bills: [{ name: "Rent", amount: "650.40" }], avgDailySpend: 0, closing: 49.60, isToday: false });
    t.eq(w.headlineText, "$49", "2b the headline floors");
    t.eq(w.roundedFromText, "$49.60", "2c …and names the exact value it floored");
  }
  {
    // A balance below zero floors AWAY from zero — the conservative direction for an overdraft — and
    // the walk still reconciles across the sign change.
    const w = forecastWalk({ opening: 100, bills: [{ name: "Rent", amount: "700" }], avgDailySpend: 29.12, closing: -629.12, isToday: false });
    t.eq(w.closingText, "-$629.12", "2d a negative projected balance shows the ASCII sign, per the minus-glyph rule");
    t.eq(w.headlineText, "-$630", "2e …and floors to -$630, never -$629");
    const walked = w.rows.reduce((sum, r) => sum + (r.sign === "−" ? -parse(r.value) : parse(r.value)), 0);
    t.eq(walked, parse(w.closingText), "2f …and the printed walk still reconciles through the sign change");
  }

  // ── 3. Day 0 is a snapshot, not a walk ─────────────────────────────────────────────────────────
  {
    const w = forecastWalk({ opening: 0, income: 999, bills: [{ name: "Phone", amount: "65" }], avgDailySpend: 33.46, closing: 3083.88, isToday: true });
    t.eq(w.hasWalk, false, "3a today has no walk — the balance already exists, nothing walks to it");
    t.eq(w.rows.length, 0, "3b …so no opening or spend row is offered");
    t.eq(w.billRows.length, 1, "3c …but today's bills are still itemised");
    t.eq(w.closingText, "$3,083.88", "3d the snapshot carries cents like the rest of the panel");
    t.eq(w.headlineText, "$3,083", "3e and the collapsed row is the floored whole-dollar balance");
  }

  // ── 4. Degenerate inputs never produce a false or NaN equation ─────────────────────────────────
  {
    const w = forecastWalk();
    t.eq(w.closingText, "$0.00", "4a no arguments at all -> $0.00, not NaN");
    t.eq(w.reconciles, true, "4b …and it still reconciles");
  }
  {
    const w = forecastWalk({ opening: "oops", income: null, bills: [{ name: "X", amount: undefined }], avgDailySpend: NaN, closing: "nope", isToday: false });
    t.eq(w.closingText, "$0.00", "4c non-numeric inputs coerce to zero");
    const walked = w.rows.reduce((sum, r) => sum + (r.sign === "−" ? -parse(r.value) : parse(r.value)), 0);
    t.eq(walked, 0, "4d …and the walk still adds up");
  }
  {
    // No spending history: the spend row must be exactly zero, not a rounding artifact like -$0.01.
    const w = forecastWalk({ opening: 500, income: 0, bills: [{ name: "Phone", amount: "65" }], avgDailySpend: 0, closing: 435, isToday: false });
    t.eq(w.spendText, "$0.00", "4e with no spending history the estimate is exactly zero, never a negative cent");
  }

  t.summary("forecastWalk.test");
})();
