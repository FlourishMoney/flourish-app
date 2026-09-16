// tests/affordability.test.cjs
// -----------------------------------------------------------------------------
// THE DEFECT. "Can I afford this?" read the ENGINE's raw safeAmount while the headline two inches
// above it read safeToSpendView's displayed headline — two owners for one fact, on one card:
//
//     SAFE TO SPEND UNTIL NEXT PAYDAY   $1,944
//     enter 800 -> "$1145 left in your safe limit today"     (1944.88 - 800 = 1144.88 -> "1145")
//
// A reader subtracts 1944 - 800 = 1144. Not an occasional rounding wobble: the raw safe amount
// carries a fraction (.88 in the CA demo, .55 in the US one) and toFixed rounds to NEAREST, so it was
// wrong for EVERY amount in BOTH demos.
//
// The invariant these pin: the remainder equals the DISPLAYED headline minus the entered amount,
// exactly, for every amount — including ones that flip it negative.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");

(async () => {
  const { affordabilityCheck, MAX_AFFORD_AMOUNT } = await import("../src/lib/affordability.js");
  const { SafeSpendEngine } = await import("../src/lib/safeSpendEngine.js");
  const { safeToSpendView } = await import("../src/lib/safeToSpendView.js");
  const F = await import("../src/lib/demoFixture.js");
  const t = create();

  const parse = (str) => {
    const s = String(str).trim();
    const neg = s.startsWith("-");
    return Math.round(Number(s.replace(/[-$,\s]/g, "")) * 100) * (neg ? -1 : 1);
  };

  // ── 1. THE INVARIANT, across both fixtures and a range that crosses zero ──────────────────────
  const AMOUNTS = [1, 5, 10, 25, 99, 100, 250, 500, 800, 1000, 1144, 1943, 1944, 1945, 2000, 2415,
                   2416, 3000, 5000, 12345, 99999];
  let checks = 0, negatives = 0;

  for (const cc of ["CA", "US"]) {
    const d = new Date("2026-09-16T12:00:00");
    const snap = {
      profile: F.demoProfileFor(cc), accounts: F.demoAccountsFor(cc), debts: F.demoDebtsFor(cc),
      incomes: F.buildDemoIncomes(d, cc), bills: F.buildDemoBills(d, cc),
      transactions: F.buildDemoTxns(d, cc), bankConnected: true, demo: true,
    };
    const ss = SafeSpendEngine.calculate(snap, d);
    const view = safeToSpendView(ss);

    // The premise of the whole bug: these two DIFFER, so which one you read is a real choice.
    t.ok(ss.safeAmount !== view.headline,
      `1a-${cc} the engine's raw safeAmount (${ss.safeAmount}) and the displayed headline (${view.headline}) genuinely differ`);

    for (const amt of AMOUNTS) {
      const r = affordabilityCheck(view.headline, String(amt));
      if (!r) { t.eq(amt > MAX_AFFORD_AMOUNT || amt <= 0, true, `1b-${cc} only absurd/empty input returns null (${amt})`); continue; }
      checks++;
      if (r.remaining < 0) negatives++;

      // THE assertion the user reads off the screen.
      if (r.remaining !== view.headline - amt) {
        t.eq(`${cc} @ ${amt}: ${r.remaining}`, `${view.headline - amt}`, "remainder = displayed headline − amount");
      }
      // …and the STRING says the same thing, since that is what is actually rendered.
      if (parse(r.remainingText) !== (view.headline - amt) * 100) {
        t.eq(`${cc} @ ${amt}: ${r.remainingText}`, `${view.headline - amt}`, "the rendered remainder string matches too");
      }
      // The old code's answer, reproduced, to prove this is not a theoretical difference.
      const oldAnswer = Number((ss.safeAmount - amt).toFixed(0));
      if (oldAnswer === view.headline - amt) {
        t.eq(`${cc} @ ${amt}`, "should differ from the old raw-value answer", "the old computation was wrong here");
      }
    }
  }
  t.ok(checks >= 2 * (AMOUNTS.length - 1), `1c checked ${checks} amounts across both fixtures`);
  t.ok(negatives >= 6, `1d …of which ${negatives} put the user over their limit — the negative side is covered`);

  // ── 2. The exact numbers from the production screenshot ───────────────────────────────────────
  {
    const r = affordabilityCheck(1944, "800");
    t.eq(r.remaining, 1144, "2a $1,944 headline − $800 = 1144, the number a reader computes");
    t.eq(r.remainingText, "$1,144", "2b …and that is the string rendered — production showed $1145");
    t.eq(Number((1944.88 - 800).toFixed(0)), 1145, "2c …which is exactly what the raw safeAmount produced");
    t.eq(r.state, "yes", "2d and it is comfortably affordable");
  }
  {
    // The old fixture's case, from before this stack: $2,009 − $800 displayed $1,210, not $1,209.
    const r = affordabilityCheck(2009, "800");
    t.eq(r.remaining, 1209, "2e the pre-stack case reconciles too");
    t.eq(Number((2009.88 - 800).toFixed(0)), 1210, "2f …where the raw value gave 1210");
  }

  // ── 3. Boundaries and states ──────────────────────────────────────────────────────────────────
  t.eq(affordabilityCheck(1944, "1944").remaining, 0, "3a spending exactly the headline leaves 0, not 1");
  t.eq(affordabilityCheck(1944, "1944").remainingText, "$0", "3b …and prints $0");
  t.eq(affordabilityCheck(1944, "1944").state, "tight", "3c …which is 'tight', not 'yes'");
  t.eq(affordabilityCheck(1944, "1945").state, "no", "3d one dollar more is over the limit");
  t.eq(affordabilityCheck(1944, "1945").overByText, "$1", "3e …by exactly $1");
  t.eq(affordabilityCheck(1944, "1750").state, "tight", "3f inside the 10% band is 'tight'");
  t.eq(affordabilityCheck(1944, "1744").state, "yes", "3g just outside it is 'yes' (threshold = 10% of the DISPLAYED headline)");
  // A negative headline — the over-committed household — must not claim anything is affordable.
  t.eq(affordabilityCheck(-1608, "50").state, "no", "3h nothing is affordable when the headline is already negative");
  t.eq(affordabilityCheck(-1608, "50").overByText, "$1,658", "3i …and the amount over is measured from there");

  // ── 4. Input handling ─────────────────────────────────────────────────────────────────────────
  t.eq(affordabilityCheck(1944, "$1,200"), affordabilityCheck(1944, "1200"), "4a currency formatting in the input is stripped");
  t.eq(affordabilityCheck(1944, ""), null, "4b empty input answers nothing");
  t.eq(affordabilityCheck(1944, "0"), null, "4c zero answers nothing");
  // A typed minus is STRIPPED, not rejected — the field asks how much you are about to spend, where a
  // negative spend is not a concept. This matches the behaviour that shipped; my first assertion here
  // assumed a rejection and was simply wrong about the input contract.
  t.eq(affordabilityCheck(1944, "-5").amount, 5, "4d a typed minus is stripped: \"-5\" means $5");
  t.eq(affordabilityCheck(1944, "abc"), null, "4e non-numeric answers nothing");
  t.eq(affordabilityCheck(1944, String(MAX_AFFORD_AMOUNT + 1)), null, "4f above the cap answers nothing");
  t.eq(affordabilityCheck(1944, null), null, "4g null answers nothing");
  {
    // A fractional amount keeps cents, so the reader's subtraction still matches exactly.
    const r = affordabilityCheck(1944, "800.50");
    t.eq(r.remaining, 1143.5, "4h a fractional amount subtracts exactly");
    t.eq(r.remainingText, "$1,143.50", "4i …and prints the cents rather than rounding them away");
  }

  // ── 5. THE RENDER SITE READS THE DISPLAYED HEADLINE ───────────────────────────────────────────
  // Everything above passes even if App.jsx hands this function the ENGINE's raw safeAmount again —
  // which is exactly how the defect shipped. The provenance has to be pinned where the value is
  // chosen, not only where it is used.
  {
    const fs = require("fs"), path = require("path");
    const app = fs.readFileSync(path.join(__dirname, "..", "src", "App.jsx"), "utf8");
    const calls = app.match(/affordabilityCheck\(([^,]+),/g) || [];
    t.eq(calls.length, 1, "5a exactly one call site");
    t.eq(calls[0], "affordabilityCheck(ssView.headline,", "5b …and it passes the DISPLAYED headline, never _ss.safeAmount or `safe`");
    t.eq((app.match(/affordabilityCheck\(\s*safe\s*,/g) || []).length, 0, "5c the raw engine value is not passed anywhere");
    // …and the old inline arithmetic is gone, not merely bypassed.
    t.eq((app.match(/left in your safe limit today/g) || []).length, 1, "5d one place renders the remainder");
    t.eq((app.match(/remaining\.toFixed\(0\)/g) || []).length, 0, "5e and no surface re-formats a remainder by hand");
  }

  t.summary("affordability.test");
})();
