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
        question: `Put an extra $${extra} toward ${top.name || "your top debt"}, or into savings${periodEnd ? `, before ${periodEnd}` : " this period"}?`,
        options: [
          { label: `Extra $${extra} to ${top.name || "the debt"}`, outcome: after < before ? `paid off in ${_fmtMonths(after)} instead of ${_fmtMonths(before)}` : `paid off in ${_fmtMonths(after)}` },
          { label: `Add $${extra} to savings`, outcome: `buffer grows to $${Math.round(buf.after).toLocaleString("en-US")}` },
        ],
      }];
    }
  } catch { /* decision unavailable → no decision */ }

  return snap;
}

// The one function the screen renders AND the facilitator receives — displayed === generated === sent.
export function meetAgendaFor(data) {
  return buildMeetingAgenda(buildMeetSnapshot(data));
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
  return lines.join("\n");
}
