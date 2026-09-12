"use strict";
// Deterministic numeric guard for the CHAT and CHECKIN coach OUTPUT (server-side).
//
// Same approach as facilitatorGuard.js — it REUSES that module's validator so behaviour is identical
// — but the fact source is the canonical snapshot the client sends as `context` (balances, income,
// bills, debts, goals, category totals, engine outputs) PLUS any numbers the user typed in their own
// message (a purchase amount they state is a legitimate figure for the coach to echo). Any dollar
// figure, rate, date, count, percentage or derived statistic in the coach's prose that is not an
// explicit snapshot/user fact fails — including arithmetic on snapshot numbers (a computed surplus,
// total or average). Program NAMES are words (never flagged); program limits/rates/amounts are
// numbers and fail unless the snapshot supplied them. Does not touch facilitator, simulator or
// document-import behaviour.
const { validateFacilitatorProse } = require("./facilitatorGuard");

// Allow-list source = the snapshot context + whatever text the user themselves supplied.
function buildSnapshotFactText(context, userText) {
  return [context || "", userText || ""].join("\n");
}

// Identical validation to the facilitator guard, over the snapshot fact text.
function validateSnapshotProse(prose, factText) {
  return validateFacilitatorProse(prose, factText);
}

// Safe qualitative fallback — contains NO numbers and no FLOURISH_UPDATE.
const SAFE_SNAPSHOT_FALLBACK =
  "Let me stick to the numbers Flourish has calculated for you rather than introduce a figure that isn't in your data. " +
  "Tell me which part you want to dig into — your safe-to-spend, a bill, a debt, or a goal — and I'll work from exactly what's there.";

// Decide which output to use: clean first reply, else validated retry, else safe fallback. Pure and
// deterministic (no network) so it is unit-testable directly.
function resolveSnapshotOutput(factText, firstProse, retryProse) {
  if (validateSnapshotProse(firstProse, factText).ok) return { kind: "first", text: firstProse };
  if (retryProse != null && validateSnapshotProse(retryProse, factText).ok) return { kind: "retry", text: retryProse };
  return { kind: "fallback", text: SAFE_SNAPSHOT_FALLBACK };
}

module.exports = { buildSnapshotFactText, validateSnapshotProse, resolveSnapshotOutput, SAFE_SNAPSHOT_FALLBACK };
