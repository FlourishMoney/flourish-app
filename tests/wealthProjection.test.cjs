// tests/wealthProjection.test.cjs — MATH-LOCK
// -----------------------------------------------------------------------------
// THE WEALTH TAB COUNTS THE EXTRA MONTHLY AMOUNT ONCE (audit of 2026-11-13, finding 13).
//
// Goals > Wealth. The slider's amount was added to the monthly contribution first, and then every figure was worked
// out from that sum: "Current Path" already held the extra, the "+$200" and "+$500" bars held it on top of theirs,
// and the line under the slider added it a second time. Starting at $20,000 and putting in $300 a month, with the
// slider at $200 over 20 years, the line read "+$200/mo → $422k in 20 years vs $323k now". The true figures are
// $323k and $225k.
//
// THE RULE (src/lib/wealthProjection.js): "now" and "Current Path" are what the household puts in today and never
// move with the slider. Each other figure adds its own extra to that, once.
//
//   1  the audit's case
//   2  Current Path and the two fixed bars do not move with the slider
//   3  the slider at $200 gives the +$200 bar's figure; at $0 it gives "now"
//   4  the projection itself: the same arithmetic the screen has always used
//   5  the screen reads these figures and no longer adds the extra itself
// -----------------------------------------------------------------------------
"use strict";
const fs = require("fs");
const path = require("path");
const { create } = require("./_runner.cjs");

(async () => {
  const t = create();
  let W = {};
  try { W = await import("../src/lib/wealthProjection.js"); } catch { /* not written yet: every check below fails */ }
  // Until the module exists every figure is a different "missing" marker, so no comparison below can pass by accident.
  let missing = 0; const m = () => "missing " + (missing++);
  const view = (o) => (typeof W.wealthForecastView === "function" ? W.wealthForecastView(o)
    : { now: m(), withExtra: m(), scenarios: [{ monthly: m(), value: m() }, { monthly: m(), value: m() }, { monthly: m(), value: m() }] });
  const k = (n) => Math.round(n / 1000);                       // the screen shows whole thousands
  const base = { startingBal: 20000, monthlyContrib: 300, horizon: 20 };

  // ── 1. The audit's case ──────────────────────────────────────────────────────────────────────────
  {
    const v = view({ ...base, extra: 200 });
    t.eq([k(v.withExtra), k(v.now)], [323, 225], "1a +$200/mo: $323k in 20 years vs $225k now (was $422k vs $323k)");
    t.approx(v.withExtra - v.now, 200 * 12 * ((1.07 ** 20 - 1) / 0.07), 1, "1b the difference is what $200 a month grows to at 7% over 20 years, counted once ($98,389)");
  }

  // ── 2. The bars ──────────────────────────────────────────────────────────────────────────────────
  {
    const at0 = view({ ...base, extra: 0 }), at500 = view({ ...base, extra: 500 });
    t.eq(at0.scenarios.map(s => s.monthly), [300, 500, 800], "2a the bars are today's $300, $300 + $200 and $300 + $500");
    t.eq(at500.scenarios.map(s => s.value), at0.scenarios.map(s => s.value), "2b and none of them moves when the slider does");
    t.eq(k(at500.scenarios[0].value), 225, "2c Current Path is $225k with the slider at $500 (was $471k)");
    t.eq(at0.scenarios[0].value, at0.now, "2d Current Path is the figure the slider's line calls \"now\"");
  }

  // ── 3. The slider's line ───────────────────────────────────────────────────────────────────────
  {
    const v = view({ ...base, extra: 200 });
    t.eq(v.withExtra, v.scenarios[1].value, "3a the slider at $200 gives the +$200 bar's figure");
    const z = view({ ...base, extra: 0 });
    t.eq(z.withExtra, z.now, "3b at $0 the two figures are the same");
    t.eq(k(view({ startingBal: 0, monthlyContrib: 0, horizon: 10, extra: 100 }).now), 0, "3c nothing in and nothing held: $0 now");
  }

  // ── 4. The projection ──────────────────────────────────────────────────────────────────────────
  {
    const p = (typeof W.projectWealth === "function") ? W.projectWealth : () => null;
    let val = 20000; for (let y = 0; y < 20; y++) val = val * 1.07 + 300 * 12;      // the loop the screen has always run
    t.eq(p(20000, 300, 20), Math.round(val), "4a the balance grows 7% a year and a year's contributions are added each year");
    t.eq([p(1000, 0, 0), p(0, 100, 1), p(-5000, 0, 1)], [1000, 1200, 0], "4b no years: the balance; one year from nothing: twelve months in; never below zero");
    t.eq(W.WEALTH_ASSUMED_RETURN, 0.07, "4c the assumed return is the 7% the screen states");
  }

  // ── 5. The screen ────────────────────────────────────────────────────────────────────────────────
  {
    const app = fs.readFileSync(path.join(__dirname, "..", "src", "App.jsx"), "utf8");
    const comp = app.slice(app.indexOf("function WealthForecast("), app.indexOf("function WealthForecast(") + 9000);
    t.ok(/wealthForecastView\(\{ startingBal, monthlyContrib, extra, horizon \}\)/.test(comp), "5a WealthForecast reads its figures from wealthForecastView");
    t.ok(!/monthlyInvest/.test(comp), "5b and no longer keeps a contribution with the extra already in it");
    t.ok(/\{fmt\(wealth\.withExtra\)\} in \{horizon\} years vs \{fmt\(wealth\.now\)\} now/.test(comp), "5c the slider's line shows the figure with the extra against the one without");
  }

  t.summary("wealthProjection");
})();
