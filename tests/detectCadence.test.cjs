// tests/detectCadence.test.cjs
// -----------------------------------------------------------------------------
// Pay-cadence detection from observed deposit dates.
//
// Both Plaid write sites stamped freq:"biweekly" unconditionally, so a monthly earner was projected
// at ~2.2x their real income. Sprint A fixed the per-deposit AMOUNT; a correct amount with a wrong
// multiplier is still a wrong forecast, so the cadence has to come from the data too.
// -----------------------------------------------------------------------------
"use strict";

const { create } = require("./_runner.cjs");

(async () => {
  const pn = await import("../src/lib/plaidNormalize.js");
  const t = create();
  const { detectCadence, detectIncomeFromTxns } = pn;

  // Build a run of dates `stepDays` apart, most recent last.
  const every = (startISO, stepDays, n) => {
    const out = []; const d = new Date(startISO + "T12:00:00");
    for (let i = 0; i < n; i++) { out.push(d.toISOString().slice(0, 10)); d.setDate(d.getDate() + stepDays); }
    return out;
  };

  // ── The big, dangerous distinction: monthly vs biweekly (a 2.17x income error) ─────────────────
  t.eq(detectCadence(every("2026-01-02", 14, 8)), "biweekly", "clean 14-day cycle -> biweekly");
  t.eq(detectCadence(["2026-01-28","2026-02-28","2026-03-28","2026-04-28"]), "monthly",
       "same day each month -> monthly. Under the old hardcoding this earner was forecast at ~2.2x.");
  t.eq(detectCadence(every("2026-01-05", 7, 10)), "weekly", "clean 7-day cycle -> weekly");
  t.eq(detectCadence(["2026-01-31","2026-02-28","2026-03-31","2026-04-30"]), "monthly",
       "month-end pay, where gaps vary 28-31 days, is still monthly");

  // ── The ambiguous band: biweekly vs semimonthly ────────────────────────────────────────────────
  // Gap length and gap REGULARITY both fail here: 1st-and-15th pay across Jan-Mar 2026 produces gaps
  // of 14,17,14,14,14 — four of five exactly 14, indistinguishable from a fortnightly cycle. Only
  // day-of-month stability separates them.
  t.eq(detectCadence(["2026-01-01","2026-01-15","2026-02-01","2026-02-15","2026-03-01","2026-03-15"]),
       "semimonthly",
       "1st-and-15th pay is semimonthly despite four of its five gaps being exactly 14 days — it is " +
       "identified by its two fixed day-of-month anchors, which never drift");
  t.eq(detectCadence(["2026-01-15","2026-01-31","2026-02-15","2026-02-28","2026-03-15","2026-03-31"]),
       "semimonthly",
       "15th-and-month-end is semimonthly — the 31st, 28th and 31st collapse to a single month-end " +
       "anchor rather than reading as three different pay days");
  t.eq(detectCadence(every("2026-01-02", 14, 7)), "biweekly",
       "a uniform 14-day cycle stays biweekly and is not mistaken for semimonthly");

  // Real deposits shift earlier for weekends; the ±1 tolerance must absorb that.
  t.eq(detectCadence(["2026-01-02","2026-01-16","2026-01-30","2026-02-13","2026-02-27","2026-03-13"]),
       "biweekly", "a real biweekly run reads as biweekly");
  t.eq(detectCadence(["2026-01-02","2026-01-15","2026-01-30","2026-02-13","2026-02-26","2026-03-13"]),
       "biweekly", "…and still does when weekend shifts move gaps to 13/15");

  // ── Sparse and degenerate input ────────────────────────────────────────────────────────────────
  t.eq(detectCadence(["2026-01-02"]), null,
       "a SINGLE deposit yields null — one date carries no frequency information, and guessing here " +
       "is what produced the original defect");
  t.eq(detectCadence([]), null, "no deposits -> null");
  t.eq(detectCadence(null), null, "missing input -> null, not a throw");
  t.eq(detectCadence(["2026-01-02","2026-01-16"]), "biweekly", "two deposits 14 days apart -> biweekly");
  t.eq(detectCadence(["2026-01-02","2026-02-02"]), "monthly", "two deposits a month apart -> monthly");
  t.eq(detectCadence(["garbage","also bad"]), null, "unparseable dates -> null rather than a bogus cadence");
  t.eq(detectCadence(["2026-03-13","2026-01-02","2026-02-13","2026-01-16","2026-02-27","2026-01-30"]),
       "biweekly", "input order does not matter — dates are sorted before gaps are measured");

  // ── End to end through detectIncomeFromTxns ────────────────────────────────────────────────────
  const dep = (date, amount, name = "ACME PAYROLL") =>
    ({ name, amount: -Math.abs(amount), cat: "INCOME", date });

  {
    const monthly = ["2025-11-28","2025-12-28","2026-01-28","2026-02-28"].map(d => dep(d, 5000));
    const det = detectIncomeFromTxns(monthly);
    t.eq(det.freq, "monthly", "a $5,000/month earner is detected as monthly, not biweekly");
    t.eq(det.perDeposit, 5000, "…with the correct per-deposit amount");
    t.eq(det.anchorDay, 28, "…and the correct anchor day");
    // The whole point: amount x cadence must equal reality.
    t.eq(det.perDeposit * 1, 5000,
         "monthly cadence x $5,000 = $5,000/mo. The old hardcoded biweekly would have implied " +
         "~$10,835/mo for the same person.");
  }

  {
    const biweekly = every("2026-01-02", 14, 8).map(d => dep(d, 2000));
    const det = detectIncomeFromTxns(biweekly);
    t.eq(det.freq, "biweekly", "a genuine biweekly earner is still detected as biweekly");
    t.eq(det.perDeposit, 2000, "…with the correct per-deposit amount");
  }

  {
    const semi = ["2026-01-15","2026-01-31","2026-02-15","2026-02-28","2026-03-15","2026-03-31"]
      .map(d => dep(d, 1800));
    const det = detectIncomeFromTxns(semi);
    t.eq(det.freq, "semimonthly", "a semimonthly earner is detected as semimonthly");
  }

  {
    const one = [dep("2026-02-14", 3000)];
    t.eq(detectIncomeFromTxns(one).freq, null,
         "a single observed deposit reports null freq, leaving the write site to apply its own " +
         "conservative fallback rather than inheriting a confident guess from here");
  }

  t.summary("detectCadence.test");
})();
