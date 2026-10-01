// tests/coachPaths.test.cjs — Step 2: coach paths locked down.
//
// Two guarantees:
//   1. The dead types plan, insights, buckets, tax are gone; only chat/simulator/checkin/document
//      are live. coach.js validates against isLiveCoachType() before dispatch.
//   2. No LIVE type hands the app a numeric financial field to display as data. The What-If figures
//      are computed by the engine (simulatePurchaseImpact) and only FROZEN
//      for the model to explain; the simulator asks the model for prose fields only, and none of
//      those prose fields is a scenario figure. (document is hardened separately in Step 2b.)
"use strict";

const { create } = require("./_runner.cjs");
const t = create();

(async () => {
  const { LIVE_COACH_TYPES, PROSE_ONLY_COACH_TYPES, SIMULATOR_PROSE_FIELDS, SCENARIO_NUMERIC_FIELDS,
          isLiveCoachType } = require("../netlify/functions/_lib/coachTypes.js");
  const FC = await import("../src/lib/financialCalculations.js");
  const { simulatePurchaseImpact, summarizeScenarioForCoach } = FC;

  // ── 1. dead types removed ─────────────────────────────────────────────────────────────────────
  ["plan", "insights", "buckets", "tax"].forEach(dead => {
    t.ok(!isLiveCoachType(dead), `1a "${dead}" is not a live coach type`);
    t.ok(!LIVE_COACH_TYPES.includes(dead), `1b "${dead}" absent from LIVE_COACH_TYPES`);
  });
  t.eq([...LIVE_COACH_TYPES].sort(), ["chat", "checkin", "document", "facilitator", "simulator"],
       "1c exactly five live types remain (Step 9 added facilitator)");
  ["chat", "simulator", "checkin", "document", "facilitator"].forEach(live =>
    t.ok(isLiveCoachType(live), `1d "${live}" is live`));
  t.ok(!isLiveCoachType("anything_else"), "1e an unknown type is rejected");

  // ── 2. prose-only types + the simulator field contract ────────────────────────────────────────
  t.eq([...PROSE_ONLY_COACH_TYPES].sort(), ["chat", "checkin", "facilitator", "simulator"], "2a prose-only set");
  t.ok(!PROSE_ONLY_COACH_TYPES.includes("document"), "2b document is not prose-only (it's validated)");
  // The model is asked for these prose fields and nothing else — none is a financial figure.
  const numeric = new Set(SCENARIO_NUMERIC_FIELDS);
  SIMULATOR_PROSE_FIELDS.forEach(f =>
    t.ok(!numeric.has(f), `2c simulator prose field "${f}" is not a scenario figure`));
  t.ok(SCENARIO_NUMERIC_FIELDS.includes("cashImpact") && SCENARIO_NUMERIC_FIELDS.includes("verdict"),
       "2d the scenario figures the model must never originate are enumerated");

  // ── 3. What-If figures originate in deterministic JS, not the model ───────────────────────────
  const inputs = { amount: 500, currentBalance: 1200, currentSafeToSpend: 300,
                   avgDailySpend: 40, monthlyIncome: 4000, monthlySurplus: 600 };
  const impact = simulatePurchaseImpact(inputs);
  t.ok(Number.isFinite(impact.newBalance),     "3a newBalance is a finite JS number");
  t.ok(Number.isFinite(impact.newSafeToSpend), "3b newSafeToSpend is a finite JS number");
  t.ok(Number.isFinite(impact.savingsDelayDays) && Number.isFinite(impact.savingsDelayWeeks),
       "3c savings-delay is JS-computed");
  t.ok(Number.isFinite(impact.healthScoreDelta), "3d healthScoreDelta is a JS number");
  t.ok(typeof impact.cashImpact === "string",  "3e cashImpact is a JS category string");
  // Prompt 3d: What-If gives no verdict, so the engine no longer grades a purchase at all.
  t.eq(typeof FC.calculateScenarioVerdict, "undefined", "3f there is no verdict function to grade a purchase");

  // Determinism: identical inputs → identical figures (no model in the loop).
  const again = simulatePurchaseImpact(inputs);
  t.eq(again, impact, "3g simulation is deterministic");

  // The block the model receives is entirely engine-produced: every value equals an impact value.
  // The model can echo these but cannot originate them, and it is handed no judgment to repeat.
  const frozen = summarizeScenarioForCoach(impact);
  t.eq(frozen.newBalance,       impact.newBalance,       "3h frozen.newBalance === engine value");
  t.eq(frozen.newSafeToSpend,   impact.newSafeToSpend,   "3i frozen.newSafeToSpend === engine value");
  t.ok(!("healthScoreDelta" in frozen) && !("cashImpact" in frozen), "3j the model is sent no health change (it was a fixed -4/-8) and no safe/tight/risky rating");
  t.eq(frozen.savingsDelayDays, impact.savingsDelayDays, "3k frozen.savingsDelayDays === engine value");
  t.ok(!("verdict" in frozen), "3l the model is sent no verdict");
  // Every key the model sees is a scenario figure or amount — supplied BY the engine, not requested FROM the model.
  Object.keys(frozen).forEach(k =>
    t.ok(k === "amount" || SCENARIO_NUMERIC_FIELDS.includes(k) || k === "newBalance" || k === "newSafeToSpend",
         `3m frozen key "${k}" is an engine-supplied field`));

  t.summary("coachPaths");
})();
