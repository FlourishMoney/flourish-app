// src/lib/budgetBasis.js
// -----------------------------------------------------------------------------
// WHAT BUDGET SUGGESTIONS ARE BASED ON (Muse demo review, 2026-10-06, item 7).
//
// Until a household has 30 or more days of its OWN transactions, the suggestions are typical
// starting points for a household of its size and income (generateBudgetSuggestions in App.jsx), and
// they say so: "Starting points". From 30 days on they are its observed spending: each
// category's monthly average over the days it has, rounded to $5.
//
// The demo is a sample household. Its transactions are sample data, not its own, so the demo always
// shows typical starting points.
//
// Spending is a positive amount that is not a transfer and is not a bill, income, transfer or fee
// category (bills are already counted as fixed commitments; counting them here would put them in
// twice). The window runs from the earliest such transaction to today, inclusive, and never more than
// 90 days back, so one old purchase does not stretch a month's average across a year.
// -----------------------------------------------------------------------------
import { BILL_CATS, NON_SPEND_CATS } from "./financialCalculations.js";

export const OWN_HISTORY_DAYS = 30;
export const OBSERVED_WINDOW_MAX_DAYS = 90;
export const TYPICAL_LABEL = "Starting points";
const DAY = 86400000;
const AVG_DAYS_PER_MONTH = 30.44;

function dayOf(dateStr) {
  const t = typeof dateStr === "string" ? Date.parse(dateStr.slice(0, 10) + "T12:00:00") : NaN;
  return Number.isFinite(t) ? Math.floor(t / DAY) : null;
}

function isSpending(t, catOf) {
  if (!t || !t.date || t.isTransfer) return false;
  const amt = Number(t.amount);
  if (!Number.isFinite(amt) || amt <= 0) return false;
  const cat = catOf(t);
  return !!cat && !NON_SPEND_CATS.has(cat) && !BILL_CATS.has(cat);
}

// Days of the household's own spending history: earliest spending transaction to today, inclusive.
export function ownHistoryDays(data, today = new Date(), catOf = (t) => t.cat) {
  if (!data || data.demo) return 0;
  const todayDay = dayOf(new Date(today).toISOString());
  let first = null;
  for (const t of data.transactions || []) {
    if (!isSpending(t, catOf)) continue;
    const d = dayOf(t.date);
    if (d !== null && d <= todayDay && (first === null || d < first)) first = d;
  }
  return first === null ? 0 : todayDay - first + 1;
}

// Each spending category's monthly average over the window, rounded to $5 (and at least $10).
export function observedMonthlySpend(data, today = new Date(), catOf = (t) => t.cat) {
  const days = Math.min(ownHistoryDays(data, today, catOf), OBSERVED_WINDOW_MAX_DAYS);
  if (days <= 0) return {};
  const todayDay = dayOf(new Date(today).toISOString());
  const from = todayDay - days + 1;
  const totals = {};
  for (const t of data.transactions || []) {
    if (!isSpending(t, catOf)) continue;
    const d = dayOf(t.date);
    if (d === null || d < from || d > todayDay) continue;
    const cat = catOf(t);
    totals[cat] = (totals[cat] || 0) + Number(t.amount);
  }
  const out = {};
  for (const [cat, total] of Object.entries(totals)) {
    const monthly = total / days * AVG_DAYS_PER_MONTH;
    out[cat] = Math.max(10, Math.round(monthly / 5) * 5);
  }
  return out;
}

// Has the household spent anything in the last 30 days (today included)? (Review of 2026-11-22, P4-06.)
// ownHistoryDays counts from the EARLIEST purchase, so a few old ones made a long history by themselves:
// three purchases four months ago and nothing since read "Based on your spending over the last 90 days" above
// figures that were still the typical ones (nothing fell in the window), and one $900 purchase 35 days ago
// replaced the whole list with a single $785 Shopping line. Observed spending needs spending that is recent.
export function hasRecentSpending(data, today = new Date(), catOf = (t) => t.cat) {
  if (!data || data.demo) return false;
  const todayDay = dayOf(new Date(today).toISOString());
  const from = todayDay - OWN_HISTORY_DAYS + 1;
  return (data.transactions || []).some((t) => {
    if (!isSpending(t, catOf)) return false;
    const d = dayOf(t.date);
    return d !== null && d >= from && d <= todayDay;
  });
}

// "typical" until 30 days of the household's own transactions, with spending in the last 30, then "observed".
export function budgetSuggestionBasis(data, today = new Date(), catOf = (t) => t.cat) {
  const days = ownHistoryDays(data, today, catOf);
  if (days >= OWN_HISTORY_DAYS && hasRecentSpending(data, today, catOf)) {
    const window = Math.min(days, OBSERVED_WINDOW_MAX_DAYS);
    return { basis: "observed", days, label: `Based on your spending over the last ${window} days` };
  }
  return { basis: "typical", days, label: TYPICAL_LABEL };
}
