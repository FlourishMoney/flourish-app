// netlify/functions/_lib/coachTypes.js
// Single source of truth for which coach request types are LIVE.
//
// Step 2 (2026-09): removed the dead types `plan`, `insights`, `buckets` and `tax`. None was sent by
// the app; `plan` was an UNMETERED duplicate of `chat`, and `insights`/`buckets`/`tax` prompted the
// model to PRODUCE financial figures ("use exact numbers", "generate savings buckets", "calculate
// tax scenarios") — which the approved coach role forbids. coach.js validates against this list
// before dispatch, so any removed/unknown type returns 400.
"use strict";

// The only types coach.js will service. (Step 9 added "facilitator" for the Meet money meeting.)
const LIVE_COACH_TYPES = ["chat", "simulator", "checkin", "document", "facilitator"];

// Of the live types, these return PROSE the app renders as coach text; the app never reads a numeric
// field from their response. (`document` is a transcription path validated + user-confirmed before
// any number enters the data — see Step 2b — so it is intentionally NOT in this set.)
const PROSE_ONLY_COACH_TYPES = ["chat", "simulator", "checkin", "facilitator"];

// The What-If numeric figures are computed in JavaScript (src/lib/financialCalculations.js) and only
// EXPLAINED by the model. The simulator asks the model for exactly these prose fields — none is a
// financial figure — and the scenario numbers below must never originate from the model.
const SIMULATOR_PROSE_FIELDS = ["cashDetail", "debtDetail", "healthDetail", "verdictReason", "tip"];
const SCENARIO_NUMERIC_FIELDS = [
  "cashImpact", "savingsDelay", "savingsDelayDays", "savingsDelayWeeks",
  "healthScoreDelta", "recoveryMonths", "verdict",
];

const isLiveCoachType = (t) => LIVE_COACH_TYPES.includes(t);

module.exports = {
  LIVE_COACH_TYPES,
  PROSE_ONLY_COACH_TYPES,
  SIMULATOR_PROSE_FIELDS,
  SCENARIO_NUMERIC_FIELDS,
  isLiveCoachType,
};
