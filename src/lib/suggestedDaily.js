// src/lib/suggestedDaily.js
// -----------------------------------------------------------------------------
// Consolidation 1: the ONE suggested daily-spend pace. Sibling of safeToSpendView,
// consumed the same way. Today and Decisions previously answered "how much can I
// spend per day" with two different divisions of the same money (Today: safe/7,
// Decisions: safe/14-floored) — a user saw one number on Today and roughly half on
// Decisions. This helper owns the pace: it takes the (already-displayed) safe-to-spend
// value and the income schedule, floors the divisor at 14 via computeDailySpendLimit
// (the correct logic, kept), and returns the daily figure plus a weekly framing that
// is EXACTLY daily*7 — never a second division of the safe value.
//
// PURE. computeDailySpendLimit does the one division of safe, in the lib layer; no
// surface divides a safe-to-spend value by anything.
// -----------------------------------------------------------------------------

import { formatMoney } from "./format.js";
import { computeDailySpendLimit } from "./decisionEngine.js";
import { daysToNextFutureDeposit } from "./incomeSchedule.js";

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
