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
//   weekTotal:      { thisWeek, normal, delta }                      // the week just gone vs a usual one
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

// HOW FLOURISH GOT EACH FIGURE (watch-meet-fixes item 2). Every item that carries a figure also
// carries `explain`: { title, value, meaning, rows: [{ label, value }], source }, which the Meet
// screen opens in How we got this. It is built from the same snapshot values as the item's text and
// is formatted here, never computed: a row with no value is left out. agendaToText sends `text`
// only, so the facilitator receives exactly what it did before.
function _explain(title, value, meaning, rows, source) {
  return { title, value, meaning, rows: (rows || []).filter(r => r && r.value != null && r.value !== ""), source };
}
const _WEEK_MEANING = "Your everyday spending in the 7 full days before today, against your average week over the weeks before it (up to four). Bills, transfers and card payments are left out.";

export function buildMeetingAgenda(snapshot = {}) {
  const wins = [], changes = [], risks = [], progress = [], decisions = [];

  // ── Wins and the whole-week total ───────────────────────────────────────────────────────────
  // The same figure, routed by its sign: a week that cost less than usual is a win, a week that
  // cost more is a change. Routing BOTH to wins is how "you stayed within safe-to-spend 0 of 7
  // days" came to be filed as a win and read out to the household as one.
  const wk = snapshot.weekTotal;
  const wkDelta = wk ? _n(wk.delta) : null;
  if (wkDelta != null && Math.abs(wkDelta) >= CHANGE_THRESHOLD) {
    (wkDelta < 0 ? wins : changes).push({
      text: `Your spending came in ${_money(Math.abs(wkDelta))} ${wkDelta < 0 ? "under" : "over"} a usual week.`,
      value: wkDelta, source: "weeklyReview",
      explain: _explain("This week against a usual week", `${_money(Math.abs(wkDelta))} ${wkDelta < 0 ? "under" : "over"}`, _WEEK_MEANING, [
        { label: "Spent in the last 7 days", value: _money(wk.thisWeek) },
        { label: "A usual week", value: _money(wk.normal) },
        { label: wkDelta < 0 ? "Under a usual week" : "Over a usual week", value: _money(Math.abs(wkDelta)) },
      ], "Your transactions"),
    });
  }
  (snapshot.debts || []).forEach(d => {
    const bal = _n(d.balance), prev = _n(d.prevBalance);
    if (bal != null && prev != null && bal < prev) {
      wins.push({ text: `${d.name} fell ${_money(prev - bal)} to ${_money(bal)}.`, value: bal, source: "debtEngine",
        explain: _explain(d.name, _money(bal), "What is owed on this debt now, against what was owed before.", [
          { label: "Owed before", value: _money(prev) }, { label: "Owed now", value: _money(bal) }, { label: "Paid down", value: _money(prev - bal) },
        ], "Your debts") });
    }
  });
  (snapshot.goals || []).forEach(g => {
    const cur = _n(g.current);
    if (cur != null) progress.push({ text: `${g.name}: ${_money(cur)}${g.projectedDate ? `, on track for ${g.projectedDate}` : ""}.`, value: cur, source: "goalEngine",
      explain: _explain(g.name, _money(cur), "What is saved toward this goal now, from your goals.", [
        { label: "Saved so far", value: _money(cur) },
        { label: "Target", value: _n(g.target) ? _money(g.target) : null },
        { label: "On track for", value: g.projectedDate || null },
      ], "Your goals") });
  });

  // ── Changes (spending vs usual) ──────────────────────────────────────────────────────────────
  (snapshot.behaviorDeltas || []).forEach(b => {
    const delta = _n(b.delta);
    if (delta != null && Math.abs(delta) >= CHANGE_THRESHOLD) {
      changes.push({ text: `${b.category} ran ${_money(Math.abs(delta))} ${delta > 0 ? "above" : "below"} your usual pace.`, value: delta, source: "weeklyReview",
        explain: _explain(`${b.category} this week`, `${_money(Math.abs(delta))} ${delta > 0 ? "above" : "below"}`, _WEEK_MEANING, [
          { label: `Spent on ${b.category} in the last 7 days`, value: _money(b.thisWeek) },
          { label: `A usual week of ${b.category}`, value: _money(b.normal) },
          { label: delta > 0 ? "Above your usual pace" : "Below your usual pace", value: _money(Math.abs(delta)) },
        ], "Your transactions") });
    }
  });

  // ── Upcoming risks (next 14 days) ─────────────────────────────────────────────────────────────
  (snapshot.forecastRisks || []).forEach(r => {
    const amt = _n(r.amount), after = _n(r.balanceAfter);
    risks.push({ text: `${r.date}: ${r.label} ${_money(amt)}${after != null ? ` takes you to ${_money(after)}` : ""}.`, value: after != null ? after : amt, source: "forecastEngine",
      explain: _explain(`${r.label}, ${r.date}`, after != null ? _money(after) : _money(amt),
        "From the forecast on Watch: your balance now, your pay, your bills and your usual daily spending, day by day for today and the next 14 days.", [
          { label: "Money out that day", value: _money(amt) }, { label: "Balance after", value: _money(after) },
        ], "The forecast on Watch") });
  });

  // ── Progress: health score delta ──────────────────────────────────────────────────────────────
  const hs = snapshot.healthScore || {};
  const cur = _n(hs.current), prevHs = _n(hs.previous);
  if (cur != null) {
    const d = prevHs != null ? cur - prevHs : null;
    // Prompt 3d: a score on 5 of 6 parts (no credit score entered) says so.
    progress.push({ text: `Health score ${cur}${d != null && d !== 0 ? ` (${d > 0 ? "+" : ""}${d} this week)` : ""}${hs.partial ? ", based on 5 of 6 parts" : ""}.`, value: cur, source: "healthScore",
      explain: _explain("Health score", String(cur), hs.partial ? "Your health score, based on 5 of 6 parts: no credit score is entered." : "Your health score, out of 100.", [
        { label: "This week", value: String(cur) }, { label: "Last week", value: prevHs != null ? String(prevHs) : null },
      ], "Health score") });
  }

  // ── Decisions (1–2, each with BOTH engine-computed outcomes) ──────────────────────────────────
  (snapshot.decisions || []).slice(0, 2).forEach(dec => {
    const opts = Array.isArray(dec.options) ? dec.options.slice(0, 2) : [];
    if (opts.length === 2) {
      decisions.push({
        text: dec.question,
        options: opts.map(o => ({ label: o.label, outcome: o.outcome, source: "decisionEngine", ...(o.explain ? { explain: o.explain } : {}) })),
        source: "decisionEngine",
        ...(dec.explain ? { explain: dec.explain } : {}),
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
  // `upcoming` carries dollar values, agendaToText sends it to the facilitator under "Coming up"
  // and the Meet screen renders it. It was left out of both guards below while only the quiet-week
  // agenda produced it; withWeekAhead now puts it on ordinary agendas, so a whole section of the
  // meeting was outside the "every number traces to an engine output" rule.
  (agenda.upcoming || []).forEach(u => push(u.value));
  // questions carry figures inside their TEXT (never as a value), so there is nothing numeric to
  // collect here — but the section must be named, or a future numeric field would go unchecked.
  (agenda.questions || []).forEach(q => push(q.value));
  (agenda.progress || []).forEach(p => push(p.value));
  // decision outcomes are engine-computed strings/values passed through untouched (not re-derived)
  return out;
}

// True if every agenda item carries a `source` (provenance) — no item without an engine origin.
export function everyItemHasSource(agenda) {
  const all = [...(agenda.wins||[]), ...(agenda.changes||[]), ...(agenda.risks||[]), ...(agenda.upcoming||[]), ...(agenda.progress||[]), ...(agenda.decisions||[]), ...(agenda.questions||[])];
  return all.every(i => typeof i.source === "string" && i.source.length > 0);
}
