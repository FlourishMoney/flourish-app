// src/lib/weeklyReview.js — how the week that just ended compares with a usual one.
//
// meetingAgenda.js has always had a "wins" section and a "changes" section, and nothing ever filled
// either: buildMeetSnapshot set neither of the fields they read, and no engine produced either
// shape. Every household, demo or real, opened the money meeting to "Nothing stood out this week"
// however their week had actually gone.
//
// This is the missing half: pure functions that look BACKWARDS, which nothing else in this app
// does. They compute, so they live here with tests rather than in meetingAgenda.js, which is an
// assembler and is not allowed to work anything out.
//
// ── WHAT THE COMPARISON IS, AND WHAT IT IS NOT ───────────────────────────────────────────────────
//
// Everything here compares the household against ITSELF, backwards. An earlier draft of this file
// marked each day against the forward-looking "safe to spend per day" figure, and that was not a
// measurement: that figure is today's balance minus today's commitments over the days to payday, so
// five households with the identical week — same purchases, same days — scored 7 of 7 or 0 of 7
// purely on the balance they happened to hold on the morning of the meeting. A household was told
// it had had a good week for being paid recently. Nothing in here reads a balance, a forecast or a
// pace, so nothing in here can move when only the calendar moves.
//
// THE WEEK IS THE SEVEN COMPLETE DAYS BEFORE TODAY. Today is half lived: counting it would move
// every answer each time the screen was opened.
//
// ── WHY THERE ARE EVIDENCE BARS ──────────────────────────────────────────────────────────────────
//
// Silence is not evidence. A household whose bank connected on Thursday, or who was away and paid
// with another card, has an empty week that looks exactly like a frugal one. Saying "you spent $220
// less than usual" to someone whose data simply is not there is worse than saying nothing: it is a
// congratulation they cannot check, on a screen whose whole job is trust. So a week has to carry
// spending on MIN_SPEND_DAYS separate days before it is described at all, and "usual" needs
// MIN_BASELINE_WEEKS weeks of history behind it.

import { BILL_CATS, CC_PAYMENT_KEYWORDS, isInternalTransfer } from "./financialCalculations.js";

const DAY = 24 * 60 * 60 * 1000;
const WEEK = 7;
const BASELINE_WEEKS = 4;        // the four weeks before this one, which is what "usual" means here
const MIN_BASELINE_WEEKS = 3;    // fewer than three weeks of history is not a habit to compare against
const MIN_SPEND_DAYS = 3;        // days of the week that must carry spending before the week is described

const _round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Midnight local, so "how many days ago" counts calendar days and not elapsed hours — a 9am reading
// and a 9pm one must put the same transaction in the same week.
function _midnight(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }

// A transaction's date as a LOCAL day. "2026-09-26" through new Date() is parsed as UTC midnight,
// which in every timezone behind UTC is the evening BEFORE — so on this side of the Atlantic each
// bare date would land in the previous day's bucket and the seventh day would drop out of the
// window. Plaid and the statement importer both hand us bare dates, so this is the normal case.
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

// Which week a day belongs to: 1 = the week just gone, 2..5 = the four baseline weeks behind it.
const _weekOf = (ago) => Math.ceil(ago / WEEK);

// The spend a household chooses. Bills are excluded because safe-to-spend has already reserved
// them, so the month's rent must not read as a week that went wrong; income, transfers and card
// payments are not spending at all.
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

// Everything both public functions need, read from the transactions in one pass.
//
// coveredWeeks is the part worth reading twice. It is how far the household's HISTORY reaches, not
// how many weeks happened to contain a purchase. Counting only weeks with spend silently drops the
// week they were away from the divisor, which inflates "usual" and can invert the answer: three
// weeks at $200 and one away week is a $150 usual, but dropped it reads $200, and a $160 week is
// then reported as $40 under when it was $10 over.
function _scan(transactions, now) {
  const thisWeek = new Map();                  // category -> total
  const baseline = new Map();                  // category -> Map(week -> total)
  const spendDays = new Set();                 // distinct days of the week just gone that carry spend
  let thisWeekTotal = 0, baselineTotal = 0, oldest = 0;

  for (const t of transactions || []) {
    if (!isDiscretionarySpend(t)) continue;
    const ago = _daysAgo(t, now);
    if (ago == null || ago < 1) continue;
    if (ago > oldest) oldest = ago;
    if (ago > WEEK * (1 + BASELINE_WEEKS)) continue;
    const cat = t.cat || "Uncategorised";
    const amt = Math.abs(Number(t.amount) || 0);
    if (ago <= WEEK) {
      spendDays.add(ago);
      thisWeekTotal += amt;
      thisWeek.set(cat, (thisWeek.get(cat) || 0) + amt);
      continue;
    }
    const w = _weekOf(ago);
    baselineTotal += amt;
    if (!baseline.has(cat)) baseline.set(cat, new Map());
    baseline.get(cat).set(w, (baseline.get(cat).get(w) || 0) + amt);
  }

  // A baseline week counts as covered when the household's history reaches back past the whole of
  // it. A week inside that span with nothing in it is a real zero and stays in the divisor.
  let coveredWeeks = 0;
  for (let w = 2; w <= 1 + BASELINE_WEEKS; w++) if (oldest >= w * WEEK) coveredWeeks++;

  return { thisWeek, baseline, thisWeekTotal, baselineTotal, coveredWeeks, spendDays: spendDays.size };
}

// True when the week just gone carries enough spending to be described at all.
const _describable = (scan) => scan.spendDays >= MIN_SPEND_DAYS && scan.coveredWeeks >= MIN_BASELINE_WEEKS;

/**
 * The week's whole discretionary spend against a usual week.
 * Returns { thisWeek, normal, delta } — delta positive means the week cost more than usual — or
 * null when there is not enough history, or not enough of a week, to say anything.
 */
export function weekVersusUsual({ transactions = [], now = new Date() } = {}) {
  const scan = _scan(transactions, now);
  if (!_describable(scan)) return null;
  const normal = scan.baselineTotal / scan.coveredWeeks;
  return { thisWeek: _round2(scan.thisWeekTotal), normal: _round2(normal), delta: _round2(scan.thisWeekTotal - normal) };
}

/**
 * Per category: what the week just gone cost, what a usual week costs, and the difference.
 * Returns [{ category, thisWeek, normal, delta }], biggest difference first.
 *
 * A category has to appear in at least MIN_BASELINE_WEEKS of the covered weeks before it has a
 * usual pace. Two was not enough: a laptop in one week and a sofa in the next made "usual" $1,200 of
 * Shopping, and the household was then congratulated for spending $1,050 under it on a week they
 * bought a shirt. An annual policy paid in two instalments did the same. Three separate weeks is a
 * habit; two purchases are two purchases.
 */
export function categoryPaceDeltas({ transactions = [], now = new Date() } = {}) {
  const scan = _scan(transactions, now);
  if (!_describable(scan)) return [];
  const out = [];
  for (const [cat, perWeek] of scan.baseline) {
    if (perWeek.size < MIN_BASELINE_WEEKS) continue;
    let total = 0;
    for (const v of perWeek.values()) total += v;
    const normal = total / scan.coveredWeeks;
    const spent = scan.thisWeek.get(cat) || 0;
    out.push({ category: cat, thisWeek: _round2(spent), normal: _round2(normal), delta: _round2(spent - normal) });
  }
  out.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || a.category.localeCompare(b.category));
  return out;
}
