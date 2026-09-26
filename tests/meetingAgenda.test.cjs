// tests/meetingAgenda.test.cjs — Step 9: the Meet agenda is deterministic and never invents a figure.
"use strict";
const { create } = require("./_runner.cjs");
const t = create();

(async () => {
  const { buildMeetingAgenda, agendaNumbers, everyItemHasSource } =
    await import("../src/lib/meetingAgenda.js");

  const snap = {
    weekTotal: { thisWeek: 176, normal: 229.45, delta: -53.45 },   // below a usual week → a win
    forecastRisks: [{ date: "Thu 12", label: "Hydro One", amount: 184, balanceAfter: -62 }],
    behaviorDeltas: [
      { category: "Groceries", delta: 62, normal: 200 },   // >= threshold → surfaced
      { category: "Coffee",    delta: 10, normal: 50 },     // < threshold → dropped
    ],
    debts: [{ name: "Visa", balance: 2340, prevBalance: 2550, payoffDate: "May 2027" }],
    goals: [{ name: "Emergency fund", projectedDate: "February", current: 1400, target: 2000 }],
    healthScore: { current: 72, previous: 70 },
    decisions: [{ question: "Extra $75 to Visa or the emergency fund?",
      options: [{ label: "Visa", outcome: "payoff May 2027" }, { label: "Emergency", outcome: "target December" }] }],
  };

  const a = buildMeetingAgenda(snap);

  // ── structure ────────────────────────────────────────────────────────────────────────────────
  t.ok(a.wins.some(w => /came in \$53\.45 under a usual week/.test(w.text)), "1a a week below its usual is a win");
  t.ok(a.wins.some(w => /Visa/.test(w.text)), "1b a debt that fell is a win");
  t.eq(a.changes.length, 1, "1c only the above-threshold change is surfaced");
  t.ok(/Groceries/.test(a.changes[0].text), "1d Groceries change surfaced");
  t.eq(a.risks.length, 1, "1e the forecast risk is surfaced");
  t.ok(/Hydro One/.test(a.risks[0].text), "1f Hydro risk surfaced");
  t.ok(a.progress.some(p => /Health score 72/.test(p.text)), "1g health score in progress");
  t.eq(a.decisions.length, 1, "1h one decision");
  t.eq(a.decisions[0].options.length, 2, "1i the decision carries BOTH computed outcomes");

  // ── provenance: every item is sourced to an engine ────────────────────────────────────────────
  t.ok(everyItemHasSource(a), "2a every agenda item carries an engine source");

  // ── THE guarantee: every number in the agenda traces to an engine output (the snapshot) ────────
  const snapNums = new Set();
  JSON.stringify(snap, (k, v) => { if (typeof v === "number") snapNums.add(v); return v; });
  agendaNumbers(a).forEach(n => t.ok(snapNums.has(n), `3a agenda number ${n} traces to the snapshot`));
  // No allow-listed exception. The day-count win used to need two structural numbers added here by
  // hand — a count the assembler worked out itself — which is precisely the invariant this section
  // exists to enforce. Every figure now arrives in the snapshot already.
  t.ok(agendaNumbers(a).length >= 4, `3a2 …and there are numbers to check (${agendaNumbers(a).length})`);

  // ── the whole-week figure is ROUTED by its sign, not filed as a win either way ────────────────
  // "You stayed within safe-to-spend 0 of 7 days" was a win, on screen and in the text the coach is
  // handed. A week that cost MORE than usual is a change.
  {
    const over = buildMeetingAgenda({ weekTotal: { thisWeek: 320, normal: 229.45, delta: 90.55 } });
    t.eq(over.wins.length, 0, "5a a week that cost more than usual is not a win");
    t.ok(over.changes.some(c => /came in \$90\.55 over a usual week/.test(c.text)), "5b …it is a change, and says over");
    const small = buildMeetingAgenda({ weekTotal: { thisWeek: 220, normal: 229.45, delta: -9.45 } });
    t.eq(small.wins.length + small.changes.length, 0, "5c a week within the threshold of usual is neither");
    const none = buildMeetingAgenda({ weekTotal: null });
    t.eq(none.wins.length + none.changes.length, 0, "5d no week figure at all says nothing");
  }

  // the assembler invents nothing when handed nothing
  const empty = buildMeetingAgenda({});
  t.eq(agendaNumbers(empty).length, 0, "3b empty snapshot → no numbers");
  t.eq(empty.decisions.length, 0, "3c and no decisions");

  // ── determinism ───────────────────────────────────────────────────────────────────────────────
  t.eq(JSON.stringify(buildMeetingAgenda(snap)), JSON.stringify(a), "4a deterministic for identical input");

  t.summary("meetingAgenda");
})();
