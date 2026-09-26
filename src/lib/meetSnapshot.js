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
import { safeToSpendView } from "./safeToSpendView.js";
import { isCashAccount, num } from "./financialCalculations.js";
import { weekVersusUsual, categoryPaceDeltas } from "./weeklyReview.js";

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

  // The week that just went — the wins and changes sections, which nothing used to fill.
  //
  // Both figures come from weeklyReview.js, which does the counting; this bridge only forwards, the
  // way it already forwards the forecast and the decision. One `now` for both, so a meeting opened
  // a millisecond either side of midnight cannot read two different weeks. weeklyReview returns
  // null / [] when the week or the history is too thin to describe, and nothing is added then —
  // which is what keeps a quiet week quiet, and keeps quietWeekAgendaFor reachable.
  try {
    const now = new Date();
    const txns = data.transactions || [];
    const week = weekVersusUsual({ transactions: txns, now });
    if (week) snap.weekTotal = week;
    // Top three by size. The agenda applies its own threshold on top, so a quiet week still says
    // nothing rather than reading out three differences of four dollars each.
    const deltas = categoryPaceDeltas({ transactions: txns, now }).slice(0, 3);
    if (deltas.length) snap.behaviorDeltas = deltas;
  } catch { /* no usable history → no wins and no changes, which is not a failure */ }

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
export function quietWeekAgendaFor({ safeToSpendText = null, safeToSpend = null, safeToSpendLabel = "Safe until next payday", upcoming = [], truncated = false } = {}) {
  const progress = [];
  // The figure comes PRE-FORMATTED from safeToSpendView, the one owner of how this number is shown.
  // Formatting the engine's raw safeAmount here produced a different number from the rest of the
  // app for the same label — it rounds half-up where the display policy floors the balance and
  // ceils the deductions, so a $2,950 dashboard became a $2,951 agenda. Overstating what is
  // available is the single thing that policy exists to prevent.
  if (safeToSpendText) {
    progress.push({ text: `${safeToSpendLabel}: ${safeToSpendText}.`, value: safeToSpend, source: "safeSpendEngine" });
  }
  // What is coming is neither a risk nor a win. Listing a paycheque under "Upcoming risks" — which
  // the facilitator reads out in order — is simply wrong, and mislabels routine rent the same way.
  const up = (upcoming || []).filter(u => u && u.text).map(u => ({ text: u.text, value: u.value ?? null, source: "forecastEngine" }));
  if (truncated) up.push({ text: "More items follow in the week ahead.", value: null, source: "meetSnapshot" });
  // Always last, and always present. It speaks about the week that HAPPENED, so it does not
  // contradict the items above, which are about the week ahead.
  progress.push({ text: "Nothing unusual happened this week.", value: null, source: "meetSnapshot" });
  return { wins: [], changes: [], risks: [], progress, decisions: [], questions: [], upcoming: up, quiet: true };
}

// The figures for the above, read from the engines exactly as every other part of the agenda does.
export function quietWeekFiguresFor(data = {}) {
  // Read the figure through safeToSpendView, exactly as every screen that shows it does — including
  // its refusals. No cash account means no balance to subtract from, and no income means the app
  // already declines to show this number anywhere else; the meeting does not get a private version.
  let safeToSpendText = null, safeToSpend = null;
  try {
    const hasCashAccount = (data.accounts || []).filter(a => isCashAccount(a)).length > 0;
    const hasIncome = (data.incomes || []).some(i => num(i && i.amount) > 0);
    if (hasCashAccount && hasIncome) {
      const view = safeToSpendView(SafeSpendEngine.calculate(data), { hasCashAccount, hasIncome });
      if (!view.needsSetup && view.headlineText) { safeToSpendText = view.headlineText; safeToSpend = view.headline; }
    }
  } catch { safeToSpendText = null; safeToSpend = null; }

  const upcoming = [];
  try {
    const fc = ForecastEngine.generate(data, 7) || {};
    (fc.forecast || []).forEach(day => {
      if (!day || day.day < 1 || day.day > 7) return;
      (day.bills || []).forEach(b => {
        const amt = num(b?.amount);   // num(), not parseFloat: "$1,800" must not read as 1
        if (!b?.name || !amt) return;
        upcoming.push({ text: `${_fmtDate(day.date)}: ${b.name} ${formatMoney(amt)} out.`, value: amt });
      });
      (day.deposits || []).forEach(dep => {
        const amt = num(dep?.amount);
        if (!dep?.label || !amt) return;
        upcoming.push({ text: `${_fmtDate(day.date)}: ${dep.label} ${formatMoney(amt)} in.`, value: amt });
      });
    });
  } catch { /* no forecast is not a reason to refuse the meeting */ }
  return { safeToSpendText, safeToSpend, upcoming: upcoming.slice(0, 6), truncated: upcoming.length > 6 };
}

// ── WHAT IS COMING IS NOT ONLY FOR A QUIET WEEK ─────────────────────────────────────────────────
// quietWeekAgendaFor was written as a SUBSTITUTE: an empty agenda was replaced wholesale by the
// safe-to-spend figure and what falls due in the next seven days. That was safe while the wins and
// changes sections were dead, because almost every agenda without a decision was empty. Now that
// they fill, a household whose week had something in it would have LOST the rent due on Thursday
// and the number they came to the meeting for, in exchange for one line about their groceries.
//
// So those figures are ADDED instead, to any agenda that does not already carry what is coming.
// Nothing is computed here either: both come from quietWeekFiguresFor, which reads them through
// safeToSpendView exactly as every screen that shows them does, refusals included.
export function withWeekAhead(agenda, data = {}, label = "Safe until next payday") {
  if (!agenda || agenda.quiet) return agenda;
  if ((agenda.risks || []).length || (agenda.upcoming || []).length) return agenda;
  let f;
  try { f = quietWeekFiguresFor(data); } catch { return agenda; }
  const upcoming = (f.upcoming || []).filter(u => u && u.text)
    .map(u => ({ text: u.text, value: u.value != null ? u.value : null, source: "forecastEngine" }));
  if (f.truncated) upcoming.push({ text: "More items follow in the week ahead.", value: null, source: "meetSnapshot" });
  const progress = [...(agenda.progress || [])];
  if (f.safeToSpendText) progress.unshift({ text: `${label}: ${f.safeToSpendText}.`, value: f.safeToSpend, source: "safeSpendEngine" });
  if (!upcoming.length && progress.length === (agenda.progress || []).length) return agenda;
  return { ...agenda, upcoming, progress };
}

// True when the assembled agenda has nothing in it — the case quietWeekAgendaFor exists for.
export function agendaIsEmpty(agenda) {
  if (!agenda) return true;
  const n = (k) => (agenda[k] || []).length;
  // questions MUST be counted. agendaToText sends them, and they are the reconcile loop's whole
  // output — "is Netflix a new regular bill?" — so treating an agenda that holds only questions as
  // empty would replace it, throw the questions away, and then tell the household nothing came up
  // in the very week the app had something to ask.
  return n("wins") + n("changes") + n("risks") + n("progress") + n("decisions") + n("questions") === 0;
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
  sect("Coming up", agenda.upcoming, i => i.text);
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
