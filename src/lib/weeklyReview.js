// src/lib/weeklyReview.js — how the week that just ended actually went.
//
// Meet's agenda has had a "wins" section and a "changes" section since it was written, and nothing
// ever filled either of them: meetingAgenda.js reads snapshot.safeSpend.dailyLog and
// snapshot.behaviorDeltas, and buildMeetSnapshot set neither. So every household, demo or real,
// opened the money meeting to "Nothing stood out this week" no matter what their week had been.
//
// This is the missing half. Two pure functions over transaction history, both LOOKING BACKWARDS —
// every other surface in the app looks forward. They compute, so they live here in a module with
// tests rather than in meetingAgenda.js, which is an assembler and is not allowed to work anything
// out.
//
// THE WEEK IS THE SEVEN COMPLETE DAYS BEFORE TODAY. Today is half-lived: counting it would call a
// Monday morning with one coffee on it a day the household "stayed within" its pace, and would move
// the answer every time the screen was opened. Day 1 is yesterday, day 7 is a week ago.

import { BILL_CATS, CC_PAYMENT_KEYWORDS, isInternalTransfer } from "./financialCalculations.js";

const DAY = 24 * 60 * 60 * 1000;
const WEEK = 7;
const BASELINE_WEEKS = 4;        // the four weeks before this one, which is what "usual" means here
const MIN_BASELINE_WEEKS = 2;    // a category seen once is a one-off, not a habit with a usual pace

const _round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Midnight local, so "how many days ago" is a count of calendar days and not of elapsed hours — a
// 9am comparison and a 9pm one must put the same transaction in the same week.
function _midnight(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }

// A transaction's date as a LOCAL day. "2026-09-26" through new Date() is parsed as UTC midnight,
// which in every timezone behind UTC is the evening BEFORE — so on this side of the Atlantic each
// bare date lands in the previous day's bucket and the whole week is off by one. Plaid and the
// statement importer both hand us bare dates, so this is the normal case, not an edge one.
function _localDay(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ""));
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(value);
  return isNaN(d) ? null : _midnight(d);
}

// Whole calendar days between a transaction's date and today. 0 = today, 1 = yesterday.
function _daysAgo(txn, now) {
  const d = _localDay(txn && txn.date);
  if (!d) return null;
  return Math.round((_midnight(now) - d) / DAY);
}

// The spend a daily pace is meant to cover: the household's own choices. Bills are excluded because
// the safe-to-spend figure has already reserved them, so counting the rent against the day it left
// would mark rent day a failure every month; income, transfers and card payments are not spending
// at all. Same filter as FinancialCalcEngine.avgDailySpendEstimate, so the bar and the spend
// measured against it are drawn from the same set of transactions.
export function isDiscretionarySpend(t) {
  if (!t || !(Number(t.amount) > 0) || t.pending) return false;   // expenses are positive in this app
  const cat = t.cat || "";
  if (cat === "Income" || cat === "Fees" || cat === "Transfer") return false;
  if (BILL_CATS.has(cat)) return false;
  if (isInternalTransfer(t)) return false;
  const name = (t.name || "").toLowerCase();
  if (CC_PAYMENT_KEYWORDS.some(kw => name.includes(kw))) return false;
  return true;
}

/**
 * One entry per day of the week just gone, oldest first: did that day's discretionary spending come
 * in at or under `dailyPace`?
 *
 * `dailyPace` is the figure the app already shows as "safe to spend per day" — the household's own
 * yardstick, not a second one invented here. It is today's pace applied to days already lived, which
 * is an approximation: the pace moves as bills land and pay arrives. It is the right approximation
 * because it is the number the household has been looking at all week.
 *
 * A pace of 0 or less means the app has no figure to judge against (no income, no cash account), so
 * there is nothing to report and the list comes back empty rather than marking every day a failure.
 *
 * A week with no spending in it at all comes back empty too. Silence is not evidence: a household
 * whose bank is not connected yet, or whose transactions have not synced, would otherwise be
 * congratulated for staying within their pace seven days out of seven on the strength of having no
 * data. The day count is only produced when at least one purchase is there to count.
 */
export function daysWithinPace({ transactions = [], dailyPace = 0, now = new Date() } = {}) {
  const pace = Number(dailyPace);
  if (!Number.isFinite(pace) || pace <= 0) return [];
  const byDay = new Map();                       // daysAgo -> total spent that day
  for (const t of transactions) {
    if (!isDiscretionarySpend(t)) continue;
    const ago = _daysAgo(t, now);
    if (ago == null || ago < 1 || ago > WEEK) continue;
    byDay.set(ago, (byDay.get(ago) || 0) + Math.abs(Number(t.amount) || 0));
  }
  if (!byDay.size) return [];
  const out = [];
  for (let ago = WEEK; ago >= 1; ago--) {
    const d = _midnight(now); d.setDate(d.getDate() - ago);
    const spent = _round2(byDay.get(ago) || 0);
    out.push({ date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
               spent, withinSafe: spent <= pace });
  }
  return out;
}

/**
 * Per category: what the week just gone cost, what a usual week costs, and the difference.
 * Returns [{ category, delta, normal, thisWeek }] — `delta` positive means above the usual pace.
 * meetingAgenda applies its own threshold to decide which of these is worth saying out loud.
 *
 * "Usual" is the four weeks before this one, divided by the number of those weeks the household
 * actually has history for — so a household three weeks into using Flourish is compared against
 * three weeks, not against four with a phantom empty one dragging every average down.
 *
 * A category has to appear in at least two of those weeks to have a usual pace at all. Without that
 * rule, one annual car insurance payment last month becomes a "usual" of a quarter of itself and the
 * meeting opens by congratulating the household for not paying it again this week.
 */
export function categoryPaceDeltas({ transactions = [], now = new Date() } = {}) {
  const weekOf = (ago) => Math.ceil(ago / WEEK);            // 1 = the week just gone, 2..5 = baseline
  const thisWeek = new Map();                               // category -> total
  const baseline = new Map();                               // category -> Map(weekIndex -> total)
  const weeksWithAnySpend = new Set();                      // baseline weeks the household has history for

  for (const t of transactions) {
    if (!isDiscretionarySpend(t)) continue;
    const ago = _daysAgo(t, now);
    if (ago == null || ago < 1 || ago > WEEK * (1 + BASELINE_WEEKS)) continue;
    const cat = t.cat || "Uncategorised";
    const amt = Math.abs(Number(t.amount) || 0);
    const w = weekOf(ago);
    if (w === 1) { thisWeek.set(cat, (thisWeek.get(cat) || 0) + amt); continue; }
    weeksWithAnySpend.add(w);
    if (!baseline.has(cat)) baseline.set(cat, new Map());
    const perWeek = baseline.get(cat);
    perWeek.set(w, (perWeek.get(w) || 0) + amt);
  }

  const weeksCovered = weeksWithAnySpend.size;
  if (!weeksCovered) return [];

  const out = [];
  for (const [cat, perWeek] of baseline) {
    if (perWeek.size < MIN_BASELINE_WEEKS) continue;
    let total = 0;
    for (const v of perWeek.values()) total += v;
    const normal = total / weeksCovered;
    const spent = thisWeek.get(cat) || 0;
    out.push({ category: cat, thisWeek: _round2(spent), normal: _round2(normal), delta: _round2(spent - normal) });
  }
  // Biggest difference first, so whatever a caller takes from the top is the one most worth saying.
  out.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  return out;
}
