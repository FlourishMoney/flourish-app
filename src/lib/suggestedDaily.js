// src/lib/suggestedDaily.js
// -----------------------------------------------------------------------------
// Consolidation 1: the ONE suggested daily-spend pace. Sibling of safeToSpendView,
// consumed the same way. Today and Decisions previously answered "how much can I
// spend per day" with two different divisions of the same money (Today: safe/7,
// Decisions: safe/14-floored) — a user saw one number on Today and roughly half on
// Decisions. Week-2 defect a: the Autopilot card was a THIRD answer — it divided the
// engine's raw safeAmount by the true days to payday, so on the day before payday it
// showed the entire safe balance as one day's spending ($3,912 against Today's $279).
// AutopilotEngine now reads this helper too. This helper owns the pace: it takes the
// (already-displayed) safe-to-spend
// value and the income schedule, floors the divisor at 14 via computeDailySpendLimit
// (the correct logic, kept), and returns the daily figure plus a weekly framing that
// is EXACTLY daily*7 — never a second division of the safe value.
//
// PURE. computeDailySpendLimit does the one division of safe, in the lib layer; no
// surface divides a safe-to-spend value by anything.
// -----------------------------------------------------------------------------

import { formatMoney } from "./format.js";
import { daysToNextFutureDeposit } from "./incomeSchedule.js";

// Daily safe-to-spend until payday. MOVED HERE from decisionEngine.js so that this file can be the
// one owner of the pace: AutopilotEngine now reads suggestedDailyView, and a lib cannot import a lib
// that imports it back. decisionEngine.js re-exports this name, so every existing caller is unchanged.
export function computeDailySpendLimit(safe, daysToPayday) {
  // Truth-fix item 7: a REAL floor, not a fallback. `daysToPayday > 0 ? daysToPayday : 14` used the raw
  // days-to-deposit whenever it was positive, so a deposit landing tomorrow (daysToPayday=1) divided the
  // whole safe amount into a SINGLE day and licensed spending the entire buffer at once. Floor the
  // divisor at 14 (~one biweekly pay cycle) so the daily pace always assumes at least a fortnight of
  // coverage. Because the divisor is deliberately floored above the true days-to-deposit, safe/divisor
  // is conservative PACING, not the most a person may safely spend — hence "Suggested spend", not a max.
  const daysLeft = Math.max(14, daysToPayday > 0 ? daysToPayday : 14);
  const safePerDay = safe > 0 ? safe / daysLeft : 0;
  const safeToday = Math.floor(safePerDay);
  return { daysLeft, safePerDay, safeToday };
}

export function suggestedDailyView(safeValue, incomes, transactions, today = new Date()) {
  const days = daysToNextFutureDeposit(incomes, transactions, today);
  const { daysLeft, safeToday } = computeDailySpendLimit(safeValue, days);
  const daily = Math.max(0, safeToday);
  const weekly = daily * 7; // a weekly framing is the daily figure times seven — NOT another division of safe
  return {
    daysLeft,
    daily,
    dailyText: formatMoney(daily),
    weekly,
    weeklyText: formatMoney(weekly),
  };
}
