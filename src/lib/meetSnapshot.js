// src/lib/meetSnapshot.js — Step 9: bridge from appData → the Meet agenda.
//
// buildMeetSnapshot() reads ONLY existing engine outputs (ForecastEngine, SafeSpendEngine,
// decisionEngine) and appData arrays, and hands them to meetingAgenda.js, which assembles the
// agenda without computing any figure. meetAgendaFor() is the single function both the Meet screen
// and the facilitator context use — so what is displayed is exactly what is generated and sent.

import { ForecastEngine } from "./forecastEngine.js";
import { SafeSpendEngine } from "./safeSpendEngine.js";
import { selectHighestRateDebt, debtPayoffMonths, savingsBufferAfter, computeSavingsOpportunity } from "./decisionEngine.js";
import { buildMeetingAgenda } from "./meetingAgenda.js";
import { detectRecurringBills } from "./plaidNormalize.js";
import { billPrompts, billChangeQuestion } from "./billsReconcile.js";
import { dismissedEntries, lastMeeting, meetingOpening } from "./meetingRecord.js";
import { formatMoney } from "./format.js";

const _round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const _num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
function _fmtDate(d) {
  try { return new Date(d).toLocaleDateString("en-CA", { weekday: "short", day: "numeric" }); }
  catch { return String(d); }
}
// Presentation-only formatting of an engine-computed month count (240 = the amortization ceiling).
function _fmtMonths(m) {
  if (m >= 240) return "20+ yrs";
  if (m >= 24) return `${Math.round(m / 12)} yrs`;
  return `${m} mo`;
}

// Assemble the snapshot from engine outputs. Sections with no data are omitted; buildMeetingAgenda
// handles a partial snapshot gracefully.
export function buildMeetSnapshot(data = {}) {
  const snap = {};

  // Upcoming risks — from ForecastEngine only (overdraft + low-balance events, next 14 days).
  try {
    const fc = ForecastEngine.generate(data, 14) || {};
    const forecast = fc.forecast || [];
    const byDay = new Map(forecast.map(f => [f.day, f]));
    const seen = new Set();
    const risks = [];
    [...(fc.overdraftRisk || []), ...(fc.lowBalanceWarnings || [])].forEach(r => {
      if (seen.has(r.day)) return; seen.add(r.day);
      const f = byDay.get(r.day);
      risks.push({
        date: _fmtDate(r.date),
        label: r.balance < 0 ? "Balance goes negative" : "Low balance",
        amount: f ? _round2(Math.abs(f.expenses || 0)) : null,
        balanceAfter: _round2(r.balance),
      });
    });
    if (risks.length) snap.forecastRisks = risks.slice(0, 4);
  } catch { /* forecast unavailable → no risk section */ }

  // Debts and goals → progress (values read straight from appData / engine, never recomputed here).
  const debts = (data.debts || []).filter(d => _num(d.balance) > 0);
  if (debts.length) {
    snap.debts = debts.map(d => ({ name: d.name || "Debt", balance: _round2(_num(d.balance)), prevBalance: null, payoffDate: null }));
  }
  const goals = data.goals || [];
  if (goals.length) {
    snap.goals = goals.map(g => ({
      name: g.name || "Goal",
      current: _round2(_num(g.saved != null ? g.saved : g.current)),
      target: _round2(_num(g.target)),
      projectedDate: g.projectedDate || null,
    }));
  }

  // One decision — top-rate debt vs savings — with BOTH outcomes engine-computed and PARALLEL:
  // the debt option shows before/after payoff (debtPayoffMonths, extra 0 vs extra), the savings option
  // shows what the buffer becomes (savingsBufferAfter). "this period" → the actual pay-period end date.
  try {
    const safe = (SafeSpendEngine.calculate(data) || {}).safeAmount || 0;
    const top = selectHighestRateDebt(debts);
    const extra = computeSavingsOpportunity(safe); // engine: suggested spare $ this period
    if (top && extra > 0) {
      const before = debtPayoffMonths(top, 0);      // engine: payoff at the minimum
      const after  = debtPayoffMonths(top, extra);  // engine: payoff with the extra
      const buf    = savingsBufferAfter(data.accounts, extra); // engine helper: { current, after }
      let periodEnd = "";
      try {
        const fc2 = ForecastEngine.generate(data, 31) || {};
        const pay = (fc2.forecast || []).find(f => f.day > 0 && f.isPayday);
        if (pay && pay.date) periodEnd = new Date(pay.date).toLocaleDateString("en-CA", { month: "short", day: "numeric" });
      } catch { /* no payday found → generic period label */ }
      snap.decisions = [{
        question: `Put an extra ${formatMoney(extra)} toward ${top.name || "your top debt"}, or into savings${periodEnd ? `, before ${periodEnd}` : " this period"}?`,
        options: [
          { label: `Extra ${formatMoney(extra)} to ${top.name || "the debt"}`, outcome: after < before ? `paid off in ${_fmtMonths(after)} instead of ${_fmtMonths(before)}` : `paid off in ${_fmtMonths(after)}` },
          { label: `Add ${formatMoney(extra)} to savings`, outcome: `savings grows to ${formatMoney(buf.after)}` },   // "savings", not "buffer": buf.after IS the savings balance (savingsBufferAfter), and "Spending buffer" on Today is a different quantity
        ],
      }];
    }
  } catch { /* decision unavailable → no decision */ }

  return snap;
}

// ── The reconcile questions (items 2 and 4) ─────────────────────────────────────────────────────
// This is what moves the ASKING into the money meeting. Without it every piece of the loop exists
// and none of it reaches a household: buildMeetingAgenda iterates snapshot.reconcilePrompts, and
// nothing set it.
//
// Suppression comes from DISMISSED answers only (meetingRecord.dismissedSignatures) plus the local
// dismissal field, never from accepted ones — accepting changes the data, so the detector stops
// finding a difference by itself, and treating a yes as permanent would mean a bill added in
// September could never be asked about again.
export function buildReconcilePrompts(data = {}) {
  try {
    const txns = data.transactions || [];
    if (!txns.length) return [];
    // userBillOverrides, NOT billOverrides. The wrong name fell back to {} and the detector ran
    // blind to removed bills, typed amounts, corrected types and corrected cadences — so the
    // meeting asked about bills the household had already removed, with amounts they had already
    // corrected. App.jsx:14155 is the other caller and names it correctly.
    const detected = detectRecurringBills(txns, { overrides: data.userBillOverrides || {}, debts: data.debts || [] });
    const dismissed = [
      ...dismissedEntries(data.meetingRecords || [], "bills"),
      ...(Array.isArray(data.billSuggestionDismissed) ? data.billSuggestionDismissed : []),
    ];
    return billPrompts({ detectedBills: detected, currentBills: data.bills || [], dismissedSignatures: dismissed })
      .map(p => ({
        signature: p.signature,
        text: billChangeQuestion(p.change),
        domain: "bills",
        kind: p.change.kind,
        subject: p.change.name,
      }));
  } catch {
    // A detector failure must not take the meeting down with it: the agenda is still worth having
    // without its questions.
    return [];
  }
}

// The one function the screen renders AND the facilitator receives — displayed === generated === sent.
export function meetAgendaFor(data) {
  const snap = buildMeetSnapshot(data);
  snap.reconcilePrompts = buildReconcilePrompts(data);
  return buildMeetingAgenda(snap);
}

// ITEM 5: what the meeting opens with. Stored answers plus engine output, never the model.
export function meetOpeningFor(data = {}) {
  const records = data.meetingRecords || [];
  return meetingOpening({ lastRecord: lastMeeting(records), snapshot: buildMeetSnapshot(data) });
}

// ── A QUIET WEEK IS STILL A MEETING ───────────────────────────────────────────────────────────
// When nothing stood out, the agenda comes back empty and there is nothing to talk about — which
// used to grey the start button out, so the one week you most want to check in was the week the
// app refused. This builds a short agenda for that case.
//
// Pure, and deliberately so: every figure is passed IN, already computed by an engine. Nothing here
// adds, rounds or estimates. The text carries no bare number of its own — "in the week ahead"
// rather than "in the next 7 days" — so anything numeric that reaches the facilitator can be traced
// to an engine that calculated it.
export function quietWeekAgendaFor({ safeToSpend = null, safeToSpendLabel = "Safe until next payday", upcoming = [] } = {}) {
  const progress = [];
  if (safeToSpend !== null && safeToSpend !== undefined && Number.isFinite(Number(safeToSpend))) {
    progress.push({ text: `${safeToSpendLabel}: ${formatMoney(Number(safeToSpend))}.`, value: Number(safeToSpend), source: "safeSpendEngine" });
  }
  const risks = (upcoming || []).filter(u => u && u.text).map(u => ({ text: u.text, value: u.value ?? null, source: "forecastEngine" }));
  // Always last, and always present: the reason this agenda is short is itself the news.
  progress.push({ text: "Nothing unusual came up in the week ahead.", value: null, source: "meetSnapshot" });
  return { wins: [], changes: [], risks, progress, decisions: [], questions: [], quiet: true };
}

// The figures for the above, read from the engines exactly as every other part of the agenda does.
export function quietWeekFiguresFor(data = {}) {
  let safeToSpend = null;
  try { const ss = SafeSpendEngine.calculate(data); safeToSpend = Number.isFinite(ss?.safeAmount) ? ss.safeAmount : null; }
  catch { safeToSpend = null; }

  const upcoming = [];
  try {
    const fc = ForecastEngine.generate(data, 7) || {};
    (fc.forecast || []).forEach(day => {
      if (!day || day.day < 1 || day.day > 7) return;
      (day.bills || []).forEach(b => {
        const amt = _num(b?.amount);
        if (!b?.name || !amt) return;
        upcoming.push({ text: `${_fmtDate(day.date)}: ${b.name} ${formatMoney(amt)} out.`, value: amt });
      });
      (day.deposits || []).forEach(dep => {
        const amt = _num(dep?.amount);
        if (!dep?.label || !amt) return;
        upcoming.push({ text: `${_fmtDate(day.date)}: ${dep.label} ${formatMoney(amt)} in.`, value: amt });
      });
    });
  } catch { /* no forecast is not a reason to refuse the meeting */ }
  return { safeToSpend, upcoming: upcoming.slice(0, 6) };
}

// True when the assembled agenda has nothing in it — the case quietWeekAgendaFor exists for.
export function agendaIsEmpty(agenda) {
  if (!agenda) return true;
  const n = (k) => (agenda[k] || []).length;
  return n("wins") + n("changes") + n("risks") + n("progress") + n("decisions") === 0;
}

// Which facilitator state the Meet screen shows (item 3). Pure, so it can be unit-tested:
//   'trial'  — unauthenticated/demo OR free tier: no input; "Start your trial to run the meeting..."
//   'ai-off' — eligible but AI off: no input; "Coach is off in Settings. Your agenda is above."
//   'ready'  — signed-in trial/premium/beta_founder with AI on: the ONLY state that shows the input.
export function facilitatorGateState({ demo, canFacilitate, aiOn }) {
  if (demo || !canFacilitate) return "trial";
  if (!aiOn) return "ai-off";
  return "ready";
}

// Serialize the agenda to the plain text the facilitator operates on (its ONLY source of figures).
export function agendaToText(agenda) {
  const lines = [];
  const sect = (title, items, render) => {
    if (!items || !items.length) return;
    lines.push(title + ":");
    items.forEach(i => lines.push("- " + render(i)));
  };
  sect("Wins", agenda.wins, i => i.text);
  sect("Changes", agenda.changes, i => i.text);
  sect("Upcoming risks", agenda.risks, i => i.text);
  sect("Progress", agenda.progress, i => i.text);
  if (agenda.decisions && agenda.decisions.length) {
    lines.push("Decisions:");
    agenda.decisions.forEach(d => {
      lines.push("- " + d.text);
      (d.options || []).forEach(o => lines.push(`    • ${o.label}: ${o.outcome}`));
    });
  }
  // The questions the household is being asked. The facilitator READS these out; it does not
  // compose them and must not restate their figures differently — every one is already phrased by
  // its domain, from engine output.
  if (agenda.questions && agenda.questions.length) {
    lines.push("Questions to ask (read as written, do not restate the figures):");
    agenda.questions.forEach(q => lines.push(`- ${q.text}`));
  }
  return lines.join("\n");
}
