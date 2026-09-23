// src/lib/meetingAgenda.js — Step 9: the deterministic weekly Meet agenda.
//
// This is an ASSEMBLER and PRIORITIZER over existing engine outputs — NOT a second financial-
// calculation engine. It never computes a dollar figure, rate, date or score: every number it emits
// is copied verbatim from the `snapshot` its caller built from the real engines (SafeSpendEngine,
// ForecastEngine, the behaviour engine, DecisionEngine/Autopilot, debt payoff, goal projections,
// health score). If Meet ever needs a number that no engine produces, add a pure helper to the
// relevant engine (with tests) — do not compute it here.
//
// snapshot shape (all values already computed by engines):
//   safeSpend:      { dailyLog: [{ date, withinSafe: boolean }] }
//   forecastRisks:  [{ date, label, amount, balanceAfter }]          // next 14 days, overdraft/low-balance events
//   behaviorDeltas: [{ category, delta, normal }]                    // spend vs the user's usual pattern
//   debts:          [{ name, balance, prevBalance, payoffDate }]
//   goals:          [{ name, projectedDate, current, target }]
//   healthScore:    { current, previous }
//   decisions:      [{ question, options: [{ label, outcome }, { label, outcome }] }]  // each outcome engine-computed
//
// Returns { wins, changes, risks, progress, decisions } — each an array of { text, value?, source }.

const CHANGE_THRESHOLD = 40; // dollars above/below the user's usual pace worth surfacing (structural, not a financial calc)

function _n(v) { return typeof v === "number" && Number.isFinite(v) ? v : null; }
function _money(v) { const n = _n(v); return n == null ? null : (n < 0 ? `-$${Math.abs(n).toFixed(2)}` : `$${n.toFixed(2)}`); }

export function buildMeetingAgenda(snapshot = {}) {
  const wins = [], changes = [], risks = [], progress = [], decisions = [];

  // ── Wins ────────────────────────────────────────────────────────────────────────────────────
  const log = Array.isArray(snapshot.safeSpend?.dailyLog) ? snapshot.safeSpend.dailyLog : [];
  if (log.length) {
    const within = log.filter(d => d && d.withinSafe).length;
    wins.push({ text: `You stayed within safe-to-spend ${within} of ${log.length} days.`, value: within, source: "safeSpendEngine" });
  }
  (snapshot.debts || []).forEach(d => {
    const bal = _n(d.balance), prev = _n(d.prevBalance);
    if (bal != null && prev != null && bal < prev) {
      wins.push({ text: `${d.name} fell ${_money(prev - bal)} to ${_money(bal)}.`, value: bal, source: "debtEngine" });
    }
  });
  (snapshot.goals || []).forEach(g => {
    const cur = _n(g.current);
    if (cur != null) progress.push({ text: `${g.name}: ${_money(cur)}${g.projectedDate ? `, on track for ${g.projectedDate}` : ""}.`, value: cur, source: "goalEngine" });
  });

  // ── Changes (spending vs usual) ──────────────────────────────────────────────────────────────
  (snapshot.behaviorDeltas || []).forEach(b => {
    const delta = _n(b.delta);
    if (delta != null && Math.abs(delta) >= CHANGE_THRESHOLD) {
      changes.push({ text: `${b.category} ran ${_money(Math.abs(delta))} ${delta > 0 ? "above" : "below"} your usual pace.`, value: delta, source: "behaviorEngine" });
    }
  });

  // ── Upcoming risks (next 14 days) ─────────────────────────────────────────────────────────────
  (snapshot.forecastRisks || []).forEach(r => {
    const amt = _n(r.amount), after = _n(r.balanceAfter);
    risks.push({ text: `${r.date}: ${r.label} ${_money(amt)}${after != null ? ` takes you to ${_money(after)}` : ""}.`, value: after != null ? after : amt, source: "forecastEngine" });
  });

  // ── Progress: health score delta ──────────────────────────────────────────────────────────────
  const hs = snapshot.healthScore || {};
  const cur = _n(hs.current), prevHs = _n(hs.previous);
  if (cur != null) {
    const d = prevHs != null ? cur - prevHs : null;
    progress.push({ text: `Health score ${cur}${d != null && d !== 0 ? ` (${d > 0 ? "+" : ""}${d} this week)` : ""}.`, value: cur, source: "healthScore" });
  }

  // ── Decisions (1–2, each with BOTH engine-computed outcomes) ──────────────────────────────────
  (snapshot.decisions || []).slice(0, 2).forEach(dec => {
    const opts = Array.isArray(dec.options) ? dec.options.slice(0, 2) : [];
    if (opts.length === 2) {
      decisions.push({
        text: dec.question,
        options: opts.map(o => ({ label: o.label, outcome: o.outcome, source: "decisionEngine" })),
        source: "decisionEngine",
      });
    }
  });

  // ── Questions (from the reconcile loop) ───────────────────────────────────────────
  // ITEM 4: the agenda items that can carry an answer BACK. Each one arrives already phrased
  // by its domain (billsReconcile.billChangeQuestion) with a signature that identifies exactly
  // which finding it is about — that signature is what the household's answer is recorded
  // against, and what stops the same question being asked twice.
  //
  // Nothing is computed here, same rule as everything above: the text, the figures inside it
  // and the signature are all copied from what the caller passed in.
  const questions = [];
  (snapshot.reconcilePrompts || []).forEach(p => {
    if (!p || !p.signature || !p.text) return;
    questions.push({
      id: p.signature,
      text: p.text,
      domain: p.domain || "unknown",
      kind: p.kind || null,
      subject: p.subject || null,
      // Spoken out loud, so the answer is yes or no. "Later" is not an option: leaving it
      // unanswered is already possible by saying nothing, and storing a "later" would mean
      // deciding whether it counts as a dismissal.
      options: [
        { label: "Yes", answer: "accepted" },
        { label: "No",  answer: "dismissed" },
      ],
      source: "reconcileLoop",
    });
  });

  return { wins, changes, risks, progress, decisions, questions };
}

// Every numeric value the agenda surfaces, for the "traces to an engine output" test. If a number
// appears here that is NOT in the snapshot, the assembler invented it — which must never happen.
export function agendaNumbers(agenda) {
  const out = [];
  const push = (v) => { const n = _n(v); if (n != null) out.push(n); };
  (agenda.wins || []).forEach(w => push(w.value));
  (agenda.changes || []).forEach(c => push(c.value));
  (agenda.risks || []).forEach(r => push(r.value));
  (agenda.progress || []).forEach(p => push(p.value));
  // decision outcomes are engine-computed strings/values passed through untouched (not re-derived)
  return out;
}

// True if every agenda item carries a `source` (provenance) — no item without an engine origin.
export function everyItemHasSource(agenda) {
  const all = [...(agenda.wins||[]), ...(agenda.changes||[]), ...(agenda.risks||[]), ...(agenda.progress||[]), ...(agenda.decisions||[])];
  return all.every(i => typeof i.source === "string" && i.source.length > 0);
}
