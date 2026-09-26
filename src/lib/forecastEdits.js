// src/lib/forecastEdits.js
// -----------------------------------------------------------------------------
// The household's corrections to the forecast, and THE list of projected money in and out.
//
// Every surface that projects (the forecast, safe-to-spend, the next deposit, the health score's
// monthly income, the money meeting and coach snapshots) reads its occurrences from here, so a
// correction made on one screen is the figure on every screen.
//
// What a household can correct (stored in appData.forecastEdits, synced and exported with the rest):
//   one:      { "<source>|<YYYY-MM-DD>": { amount?, date?, skip? } }        "Just this one"
//   series:   { "<source>": [ { from: "YYYY-MM-DD", amount?, shiftDays?, skip? } ] }  "From this date on"
//   expected: [ { id, name, amount, direction: "in"|"out", date, repeat: once|monthly|quarterly|yearly } ]
//   dailySpend: number | null                                                 the Watch "Est. daily spend"
// plus, on an income source, isVariable ("My pay varies") and expectedAmount.
//
// Rules:
//   • An occurrence is identified by its SOURCE (income id, bill id or name, expected item id) and its
//     ORIGINAL date, never by its amount. Two $500 deposits on different schedules stay apart.
//   • A series entry holds the full state from its date on (amount, date shift, stopped). The latest
//     entry on or before an occurrence's original date applies; a "just this one" edit sits on top.
//   • Edits change projections only. Actual bank transactions are never altered, and when the real
//     deposit or bill arrives it replaces the projection for that occurrence.
//
// PURE: `today` is injected; no storage, no React.
// -----------------------------------------------------------------------------

import { depositDatesFor, findAnchor, depositConfidence, isDepositToday } from "./incomeSchedule.js";
import { billOccursOnDate, isBillArchived, num, clampDayToMonth } from "./financialCalculations.js";
import { anchorEvidence, incomeEvidence } from "./depositClassify.js";

export const EDIT_LOOKAHEAD_DAYS = 62; // an occurrence moved up to this far earlier still appears
export const MAX_MOVE_DAYS = 60;
export const REPEATS = Object.freeze(["once", "monthly", "quarterly", "yearly"]);
export const MIN_VARIABLE_PAYS = 3;

const DAY_MS = 86400000;
const noon = (d) => { const x = new Date(d); x.setHours(12, 0, 0, 0); return x; };
export const isoOf = (d) => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`; };
export const fromIso = (s) => { const d = new Date(String(s) + "T12:00:00"); return isNaN(d.getTime()) ? null : d; };
const addDays = (d, n) => { const x = noon(d); x.setDate(x.getDate() + n); return x; };
export const dayDiff = (a, b) => Math.round((noon(b) - noon(a)) / DAY_MS);
const finiteOrNull = (v) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v))) ? null : Number(v);

// ── Reading the stored corrections ──────────────────────────────────────────────────────────────
export function correctionsOf(data) {
  const fe = (data && data.forecastEdits) || {};
  const ds = finiteOrNull(fe.dailySpend);
  return {
    one: fe.one && typeof fe.one === "object" ? fe.one : {},
    series: fe.series && typeof fe.series === "object" ? fe.series : {},
    expected: Array.isArray(fe.expected) ? fe.expected.filter(x => x && x.id != null) : [],
    dailySpend: ds != null && ds >= 0 ? ds : null,
    // The date of an edited weekly / every-two-weeks occurrence, kept so an income with no deposits
    // to phase from does not drift one day per day (and lose its edits) while it is being corrected.
    phase: fe.phase && typeof fe.phase === "object" ? fe.phase : {},
  };
}

// ── Source identity ─────────────────────────────────────────────────────────────────────────────
const normName = (s) => String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
export function incomeSrcKey(inc) { return inc && inc.id != null ? `income:${inc.id}` : `income:name:${normName(inc && inc.label)}`; }
export function billSrcKey(b) { return b && b.id != null ? `bill:${b.id}` : `bill:name:${normName(b && b.name)}`; }
export function expectedSrcKey(item) { return `expected:${item && item.id}`; }
export const occKey = (srcKey, originalDate) => `${srcKey}|${typeof originalDate === "string" ? originalDate : isoOf(originalDate)}`;

// The series state in force for an occurrence whose original date is `iso`.
export function seriesStateAt(entries, iso) {
  let best = null;
  for (const e of Array.isArray(entries) ? entries : []) {
    if (!e || typeof e.from !== "string" || e.from > iso) continue;
    if (!best || e.from > best.from) best = e;
  }
  return best;
}

// Apply the household's edits to one occurrence.
function applyEdit(ed, srcKey, orig, base) {
  const iso = isoOf(orig);
  const s = seriesStateAt(ed.series[srcKey], iso);
  const o = ed.one[occKey(srcKey, iso)] || null;
  const oAmt = o ? finiteOrNull(o.amount) : null;
  const sAmt = s ? finiteOrNull(s.amount) : null;
  const amount = oAmt != null && oAmt >= 0 ? oAmt : (sAmt != null && sAmt >= 0 ? sAmt : base);
  let date = noon(orig);
  const oDate = o && o.date ? fromIso(o.date) : null;
  if (oDate) date = oDate;
  else if (s && Number.isFinite(Number(s.shiftDays)) && Number(s.shiftDays) !== 0) date = addDays(orig, Math.round(Number(s.shiftDays)));
  const skipped = o && Object.prototype.hasOwnProperty.call(o, "skip") ? !!o.skip : !!(s && s.skip);
  const edited = (o || s) ? { scope: o ? "one" : "series", from: s ? s.from : null, one: !!o, series: !!s, oneEdit: o, seriesEdit: s } : null;
  return { amount, date, skipped, edited };
}

// ── Variable pay: a conservative estimate ───────────────────────────────────────────────────────
// Lower quartile of recent pays, from at least three; otherwise the household's own expected amount;
// otherwise the entered amount, flagged so the screen asks for an expected amount.
function quantile(sorted, q) {
  if (!sorted.length) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}
export function variablePay(inc, data, today = new Date()) {
  const entered = num(inc && inc.amount);
  const label = normName(inc && inc.label);
  const others = (data && data.incomes || []).filter(o => o !== inc).map(o => num(o.amount)).filter(a => a > 0);
  const t0 = noon(today);
  const pays = incomeEvidence(data || {})
    .filter(t => {
      if (!(Number(t.amount) < 0) || !t.date) return false;
      const d = fromIso(t.date);
      if (!d) return false;
      const age = dayDiff(d, t0);
      if (age < 0 || age > 180) return false;
      const a = Math.abs(Number(t.amount));
      const name = normName(t.name);
      if (label.length > 3 && name.includes(label.slice(0, 6))) return true;
      if (!(entered > 0)) return false;
      if (a < entered * 0.5 || a > entered * 2) return false;
      return !others.some(o => Math.abs(a - o) < Math.abs(a - entered)); // closer to another income
    })
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, 12)
    .map(t => Math.abs(Number(t.amount)))
    .sort((a, b) => a - b);
  if (pays.length >= MIN_VARIABLE_PAYS) {
    const low = Math.floor(quantile(pays, 0.25));
    const high = Math.round(quantile(pays, 0.75));
    return { amount: low, low, high, n: pays.length, basis: "recent" };
  }
  const exp = num(inc && inc.expectedAmount);
  if (exp > 0) return { amount: exp, low: exp, high: Math.max(exp, entered), n: pays.length, basis: "expected" };
  return { amount: entered, low: entered, high: entered, n: pays.length, basis: "needs-expected" };
}

// The amount an income is planned at before any per-date edit.
export function incomeBase(inc, data, today = new Date()) {
  if (inc && inc.isVariable) return variablePay(inc, data, today);
  const a = num(inc && inc.amount);
  return { amount: a, low: a, high: a, n: 0, basis: "entered" };
}

const cadenceDays = (freq) => freq === "weekly" ? 7 : freq === "biweekly" ? 14 : freq === "semimonthly" ? 15 : 30;

// The per-deposit amount to use for MONTHLY income (health score, savings rate, coach): the going rate
// now. A "from this date on" change counts once it starts within the next pay period; a single edit
// does not; variable pay counts at its low end; a stopped income counts as nothing.
export function monthlyIncomeBasis(inc, data, today = new Date()) {
  const base = incomeBase(inc, data, today).amount;
  const ed = correctionsOf(data);
  const s = seriesStateAt(ed.series[incomeSrcKey(inc)], isoOf(addDays(today, cadenceDays(inc && inc.freq))));
  if (s && s.skip) return 0;
  const sAmt = s ? finiteOrNull(s.amount) : null;
  return sAmt != null && sAmt >= 0 ? sAmt : base;
}

// ── "Has the real one arrived?" ─────────────────────────────────────────────────────────────────
// Each real deposit belongs to at most ONE income (a name match first, else the closest amount within
// tolerance), and replaces at most one of its occurrences. Without that, a $1,950 pay from one job could
// cancel a $2,000 payday from another, and one deposit could clear two occurrences.
const arrivalWindow = (freq) => Math.min(5, Math.floor(cadenceDays(freq) / 3));
const _isIncomeLike = (t) => {
  const name = String(t.name || "").toLowerCase();
  return t.cat === "Income" || name.includes("payroll") || name.includes("direct deposit") || name.includes("deposit");
};
function depositOwners(incomes, bases, anchorTx) {
  const owner = new Map();
  for (const t of anchorTx) {
    if (!(Number(t.amount) < 0)) continue;
    const a = Math.abs(Number(t.amount));
    const name = normName(t.name);
    let best = -1, bestScore = Infinity;
    incomes.forEach((inc, i) => {
      const { matchAmt, b } = bases[i];
      if (!(matchAmt > 0)) return;
      const label = normName(inc.label);
      const nameOk = label.length > 3 && name.includes(label.slice(0, 6));
      const ratio = Math.abs(a - matchAmt) / matchAmt;
      const amtOk = ratio < 0.08 || (inc.isVariable && b.low > 0 && a >= b.low * 0.8 && a <= b.high * 1.25);
      if (!nameOk && !(amtOk && _isIncomeLike(t))) return;
      const score = (nameOk ? 0 : 10) + ratio;
      if (score < bestScore) { best = i; bestScore = score; }
    });
    if (best >= 0) owner.set(t, best);
  }
  return owner;
}
function arrivedDeposit(idx, freq, orig, eff, anchorTx, owner, claimed, today) {
  const start = addDays(orig < eff ? orig : eff, -arrivalWindow(freq));
  const t0 = noon(today);
  if (start > t0) return null;
  let hit = null, hitGap = Infinity;
  for (const t of anchorTx) {
    if (owner.get(t) !== idx || claimed.has(t)) continue;
    const d = fromIso(t.date);
    if (!d || d < start || d > t0) continue;
    const gap = Math.abs(dayDiff(d, eff));
    if (gap < hitGap) { hit = t; hitGap = gap; }
  }
  return hit;
}
const _normBill = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
function billArrived(b, orig, eff, txns, today) {
  const freq = b.freq || "monthly";
  const W = freq === "weekly" ? 2 : (freq === "biweekly" || freq === "semimonthly") ? 4 : 5;
  const start = addDays(orig < eff ? orig : eff, -W);
  const t0 = noon(today);
  if (start > t0) return false;
  const billName = _normBill(b.vendorPattern || b.name);
  const billAmt = num(b.amount);
  if (billName.length < 3 || !(billAmt > 0)) return false;
  const variable = b.type === "variable" || b.variable === true;
  return txns.some(t => {
    if (!(Number(t.amount) > 0) || t.pending) return false;
    const d = fromIso(t.date);
    if (!d || d < start || d > t0) return false;
    const name = _normBill(t.name);
    const nameMatch = name && (name.includes(billName) || billName.includes(name));
    const amtMatch = variable || Math.abs(Math.abs(Number(t.amount)) - billAmt) <= Math.max(2, billAmt * 0.05);
    return nameMatch && amtMatch;
  });
}

// ── Expected items: their own schedule ──────────────────────────────────────────────────────────
const MONTHS = { monthly: 1, quarterly: 3, yearly: 12 };
function expectedDates(item, today, horizonDays, back = 0) {
  const start = fromIso(item.date);
  if (!start) return [];
  const end = addDays(today, horizonDays);
  const t0 = addDays(today, -back);
  const step = MONTHS[item.repeat];
  if (!step) return start >= t0 && start <= end ? [start] : [];
  const out = [];
  const day = start.getDate();
  for (let k = 0; k < 1200; k++) {
    const y = start.getFullYear(), m = start.getMonth() + k * step;
    const d = new Date(y, m, 1, 12);
    d.setDate(clampDayToMonth(day, d.getFullYear(), d.getMonth()));
    if (d > end) break;
    if (d >= t0) out.push(d);
  }
  return out;
}

// Does the household have any edit on this source? Only then do we look back for an occurrence whose
// ORIGINAL date has passed but which was moved later: a pay the employer said is late must stay
// projected until the real one arrives, not vanish the day it was first due.
function hasEditsFor(ed, srcKey) {
  if (Array.isArray(ed.series[srcKey]) && ed.series[srcKey].length) return true;
  const prefix = srcKey + "|";
  return Object.keys(ed.one).some(k => k.startsWith(prefix));
}

// ── THE projected occurrences ───────────────────────────────────────────────────────────────────
// Money in: every income source (its own cadence and anchor) and every expected item marked "in".
// Only days 1..days: today's deposits are already in the balance. Skipped occurrences are returned
// with skipped:true so a screen can show them and offer a reset; nothing counts them.
export function incomeOccurrences(data, today = new Date(), days = 90, { lookahead = EDIT_LOOKAHEAD_DAYS } = {}) {
  const ed = correctionsOf(data);
  const anchorTx = anchorEvidence(data || {});
  const incomes = (data && data.incomes) || [];
  const bases = incomes.map(inc => {
    const entered = num(inc.amount);
    const b = incomeBase(inc, data, today);
    return { b, matchAmt: entered > 0 ? entered : b.amount };
  });
  const owner = depositOwners(incomes, bases, anchorTx);
  const claimed = new Set();
  const out = [];
  incomes.forEach((inc, idx) => {
    const { b, matchAmt } = bases[idx];
    const base = b.amount;
    if (!(matchAmt > 0)) return;
    const srcKey = incomeSrcKey(inc);
    const label = typeof inc.label === "string" ? inc.label.trim() : "";
    const edited = hasEditsFor(ed, srcKey);
    const freq = inc.freq || "biweekly";
    const step = freq === "weekly" ? 7 : freq === "biweekly" ? 14 : null;
    const anchor = findAnchor(inc, matchAmt, anchorTx);
    let dates;
    if (step && !anchor && edited && ed.phase[srcKey] && fromIso(ed.phase[srcKey])) {
      // No deposit to phase from: step from the occurrence the household edited, so it stays put.
      const p = fromIso(ed.phase[srcKey]);
      const from = addDays(today, -MAX_MOVE_DAYS), to = addDays(today, days + lookahead);
      dates = [];
      for (let d = addDays(p, Math.ceil(dayDiff(p, from) / step) * step); d <= to; d = addDays(d, step)) dates.push(d);
    } else {
      // Weekly and every-two-weeks pay is stepped from the last real deposit, so dates since then are
      // already in the list. Calendar-day pay (monthly, twice a month) looks back explicitly when edited.
      const back = !step && edited ? MAX_MOVE_DAYS : 0;
      dates = depositDatesFor(inc, matchAmt, anchorTx, addDays(today, -back), days + lookahead + back);
    }
    // When the schedule is stepped from a real deposit that was itself a shifted "from this date on"
    // occurrence, the stepped dates already carry the shift: take it back out so it is applied once.
    const explicitDay = parseInt(inc.anchorDay, 10);
    if (anchor && (step || !(explicitDay >= 1 && explicitDay <= 31))) {
      const entries = (ed.series[srcKey] || []).filter(e => e && Number(e.shiftDays)).sort((x, y) => y.from.localeCompare(x.from));
      for (const e of entries) {
        const k = Math.round(Number(e.shiftDays));
        const o = isoOf(addDays(anchor, -k));
        if (o >= e.from && seriesStateAt(ed.series[srcKey], o) === e) { dates = dates.map(d => addDays(d, -k)); break; }
      }
    }
    for (const orig of dates) {
      const e = applyEdit(ed, srcKey, orig, base);
      const day = dayDiff(today, e.date);
      if (day < 1 || day > days) continue;
      if (!e.skipped) {
        const hit = arrivedDeposit(idx, freq, noon(orig), e.date, anchorTx, owner, claimed, today);
        if (hit) { claimed.add(hit); continue; }
      }
      out.push({ kind: "income", srcKey, sourceId: inc.id ?? null, label, originalDate: noon(orig), date: e.date, day,
                 amount: e.amount, estimate: base, variable: !!inc.isVariable, low: b.low, high: b.high, basis: b.basis,
                 skipped: e.skipped, edited: e.edited });
    }
  });
  for (const item of ed.expected) {
    if (item.direction !== "in") continue;
    out.push(...expectedOccurrences(item, ed, today, days, 1));
  }
  return out.sort((a, b) => a.date - b.date);
}

function expectedOccurrences(item, ed, today, days, minDay) {
  const base = num(item.amount);
  if (!(base > 0)) return [];
  const srcKey = expectedSrcKey(item);
  const out = [];
  const back = hasEditsFor(ed, srcKey) ? MAX_MOVE_DAYS : 0;
  for (const orig of expectedDates(item, today, days + EDIT_LOOKAHEAD_DAYS, back)) {
    const e = applyEdit(ed, srcKey, orig, base);
    const day = dayDiff(today, e.date);
    if (day < minDay || day > days) continue;
    out.push({ kind: "expected", direction: item.direction === "in" ? "in" : "out", srcKey, sourceId: item.id,
               label: String(item.name || "").trim(), originalDate: noon(orig), date: e.date, day,
               amount: e.amount, estimate: base, repeat: item.repeat || "once", skipped: e.skipped, edited: e.edited });
  }
  return out;
}

// Money out: every bill (freq-aware, one-offs, archived skipped) and every expected item marked "out".
// Recurring bills never land on day 0 in the forecast (today's balance already reflects them);
// safe-to-spend counts today too, so it passes includeToday.
export function billOccurrences(data, today = new Date(), days = 90, { includeToday = false, lookahead = EDIT_LOOKAHEAD_DAYS } = {}) {
  const ed = correctionsOf(data);
  const txns = (data && data.transactions) || [];
  const out = [];
  for (const b of (data && data.bills) || []) {
    if (!b) continue;
    const srcKey = billSrcKey(b);
    // Looking back only for an edited bill: its original date may have passed while it was moved later
    // (a one-off whose date has passed is "archived", but not if the household moved it forward).
    const back = hasEditsFor(ed, srcKey) ? MAX_MOVE_DAYS : 0;
    if (!back && isBillArchived(b, today)) continue;
    const base = num(b.amount);
    const from = addDays(today, -back);
    for (let i = -back; i <= days + lookahead; i++) {
      const d = addDays(today, i);
      const occurs = i < 0
        ? billOccursOnDate(b, d, from)
        : b.type === "one_off" ? billOccursOnDate(b, d, today) : ((includeToday || i > 0) && billOccursOnDate(b, d, today));
      if (!occurs) continue;
      const e = applyEdit(ed, srcKey, d, base);
      const day = dayDiff(today, e.date);
      const minDay = (b.type === "one_off" || includeToday) ? 0 : 1;
      if (day < minDay || day > days) continue;
      if (!e.skipped && billArrived(b, d, e.date, txns, today)) continue;
      out.push({ kind: "bill", srcKey, sourceId: b.id ?? null, bill: b, label: b.name || "Bill", originalDate: d, date: e.date, day,
                 amount: e.amount, estimate: base, skipped: e.skipped, edited: e.edited });
    }
  }
  for (const item of ed.expected) {
    if (item.direction !== "out") continue;
    out.push(...expectedOccurrences(item, ed, today, days, 0));
  }
  return out.sort((a, b) => a.date - b.date);
}

// ── The next deposit, edit-aware ────────────────────────────────────────────────────────────────
// Income sources only: an expected gift is money in, but it is not payday.
export function nextDepositFor(data, today = new Date(), horizonDays = 400) {
  const occ = incomeOccurrences(data, today, horizonDays).filter(o => o.kind === "income" && !o.skipped && o.amount > 0);
  if (!occ.length) return null;
  const first = occ[0];
  const inc = ((data && data.incomes) || []).find(i => incomeSrcKey(i) === first.srcKey);
  const conf = inc ? depositConfidence(inc, num(inc.amount) || first.amount, anchorEvidence(data)) : "estimated";
  return { date: first.date, amount: first.amount, sourceLabel: first.label || "Income", confidence: conf,
           low: first.low, high: first.high, variable: first.variable, edited: first.edited };
}
export function daysToNextDepositFor(data, today = new Date(), horizonDays = 400) {
  const n = nextDepositFor(data, today, horizonDays);
  return n ? dayDiff(today, n.date) : null;
}
export function isDepositTodayFor(data, today = new Date()) {
  return isDepositToday((data && data.incomes) || [], anchorEvidence(data || {}), today);
}

// ── Writers. Each returns a new forecastEdits object and never mutates. ─────────────────────────
function cloneEdits(fe) {
  const c = correctionsOf({ forecastEdits: fe });
  return { ...(fe || {}), one: { ...c.one }, series: { ...c.series }, expected: [...c.expected], dailySpend: c.dailySpend, phase: { ...c.phase } };
}

/**
 * Record an edit on one projected occurrence.
 *   occ:    the occurrence as returned above ({ srcKey, originalDate, ... })
 *   scope:  "one" (just this one) | "series" (from this date on)
 *   change: { amount } | { date: "YYYY-MM-DD" } | { skip: true }
 */
export function editOccurrence(fe, occ, scope, change) {
  const next = cloneEdits(fe);
  const iso = isoOf(occ.originalDate);
  const key = occKey(occ.srcKey, iso);
  const clean = {};
  if (change && change.amount != null) {
    const a = finiteOrNull(change.amount);
    if (a == null || a < 0) return next;
    clean.amount = Math.round(a * 100) / 100;
  }
  if (change && change.date) {
    const d = fromIso(change.date);
    if (!d || Math.abs(dayDiff(occ.originalDate, d)) > MAX_MOVE_DAYS) return next;
    clean.date = isoOf(d);
  }
  if (change && change.skip) clean.skip = true;
  if (!Object.keys(clean).length) return next;
  // Remember where a weekly / every-two-weeks income's schedule stood (see correctionsOf.phase).
  if (String(occ.srcKey).startsWith("income:") && !next.phase[occ.srcKey]) next.phase = { ...next.phase, [occ.srcKey]: iso };

  if (scope === "series") {
    const prevState = seriesStateAt(next.series[occ.srcKey], iso) || {};
    const entry = { from: iso, amount: prevState.amount ?? null, shiftDays: prevState.shiftDays || 0, skip: !!prevState.skip };
    if (clean.amount != null) entry.amount = clean.amount;
    if (clean.date) entry.shiftDays = dayDiff(occ.originalDate, fromIso(clean.date));
    // A new amount or date means it happens: that clears a stop set earlier.
    entry.skip = clean.skip ? true : (clean.amount != null || clean.date) ? false : entry.skip;
    // From this date on replaces anything set for later dates of the same source.
    next.series[occ.srcKey] = [...(next.series[occ.srcKey] || []).filter(e => e && e.from < iso), entry];
    delete next.one[key];
    return next;
  }
  const cur = { ...(next.one[key] || {}) };
  if (clean.amount != null) cur.amount = clean.amount;
  if (clean.date) cur.date = clean.date;
  // Skipping sets skip; a new amount or date for this one un-skips it (even under a stopped series).
  if (clean.skip) cur.skip = true; else cur.skip = false;
  next.one[key] = cur;
  return next;
}

// ── The edit sheet's state ──────────────────────────────────────────────────────────────────────
// Reopening an edited occurrence must show the edit AS SAVED: its scope, its action and its value.
// Opening on "Just this one" over a "From this date on" edit meant a plain Save silently rewrote a
// series change into a single-date one.
export function sheetDefaults(occ) {
  const e = occ && occ.edited;
  const amount = String(occ && occ.amount != null ? occ.amount : "");
  const date = isoOf(occ.date);
  if (!e) return { action: occ.skipped ? "skip" : "amount", scope: "one", amount, date };
  const src = e.one ? e.oneEdit : e.seriesEdit;
  const scope = e.one ? "one" : "series";
  const action = occ.skipped || (src && src.skip) ? "skip"
    : e.one ? (src && src.date ? "date" : "amount")
    : (src && Number(src.shiftDays) ? "date" : "amount");
  return { action, scope, amount, date };
}

// Save from the sheet. Nothing changed from how it opened means nothing is written (the same object
// comes back), so reopening and saving can never alter an edit.
export function sheetSave(fe, occ, form) {
  const d = sheetDefaults(occ);
  const unchanged = form.scope === d.scope && form.action === d.action && (
    form.action === "amount" ? Number(form.amount) === Number(occ.amount)
    : form.action === "date" ? form.date === isoOf(occ.date)
    : !!occ.skipped);
  if (unchanged) return fe;
  if (form.action === "amount") return editOccurrence(fe, occ, form.scope, { amount: form.amount });
  if (form.action === "date") return editOccurrence(fe, occ, form.scope, { date: form.date });
  return editOccurrence(fe, occ, form.scope, { skip: true });
}

// "Reset to Flourish's estimate": remove every edit that shapes this occurrence. When that edit is a
// "from this date on" change, the later dates it covered reset with it (the sheet says so).
export function resetOccurrence(fe, occ) {
  const next = cloneEdits(fe);
  const iso = isoOf(occ.originalDate);
  const k = occKey(occ.srcKey, iso);
  // A "just this one" edit is removed on its own; the change from a date on beneath it stays.
  if (next.one[k]) { delete next.one[k]; return next; }
  const s = seriesStateAt(next.series[occ.srcKey], iso);
  if (s) {
    const rest = (next.series[occ.srcKey] || []).filter(e => e !== s);
    if (rest.length) next.series[occ.srcKey] = rest; else delete next.series[occ.srcKey];
  }
  return next;
}

let _seq = 0;
export function newExpectedId(now = Date.now()) { _seq = (_seq + 1) % 1000; return `x${now.toString(36)}${_seq}`; }
export function validExpectedItem(item) {
  if (!item) return false;
  const name = String(item.name || "").trim();
  const amt = finiteOrNull(item.amount);
  return !!name && amt != null && amt > 0 && !!fromIso(item.date) && (item.direction === "in" || item.direction === "out")
    && REPEATS.includes(item.repeat || "once");
}
export function upsertExpected(fe, item) {
  const next = cloneEdits(fe);
  if (!validExpectedItem(item)) return next;
  const clean = { id: item.id != null ? item.id : newExpectedId(), name: String(item.name).trim(), amount: Math.round(Number(item.amount) * 100) / 100,
                  direction: item.direction, date: isoOf(fromIso(item.date)), repeat: item.repeat || "once" };
  const i = next.expected.findIndex(x => x.id === clean.id);
  if (i >= 0) next.expected[i] = clean; else next.expected.push(clean);
  return next;
}
export function removeExpected(fe, id) {
  const next = cloneEdits(fe);
  next.expected = next.expected.filter(x => x.id !== id);
  const src = expectedSrcKey({ id });
  delete next.series[src];
  for (const k of Object.keys(next.one)) if (k.startsWith(src + "|")) delete next.one[k];
  return next;
}
export function setDailySpend(fe, value) {
  const next = cloneEdits(fe);
  const v = finiteOrNull(value);
  next.dailySpend = v != null && v >= 0 ? Math.round(v * 100) / 100 : null;
  return next;
}
