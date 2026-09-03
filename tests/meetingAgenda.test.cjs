// tests/meetingAgenda.test.cjs — Step 9: the Meet agenda is deterministic and never invents a figure.
"use strict";
const { create } = require("./_runner.cjs");
const t = create();

(async () => {
  const { buildMeetingAgenda, agendaNumbers, everyItemHasSource } =
    await import("../src/lib/meetingAgenda.js");

  const snap = {
    safeSpend: { dailyLog: [
      { date: "1", withinSafe: true }, { date: "2", withinSafe: true },
      { date: "3", withinSafe: false }, { date: "4", withinSafe: true },
      { date: "5", withinSafe: true },  { date: "6", withinSafe: true }, { date: "7", withinSafe: false },
    ]},
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
  t.ok(a.wins.some(w => /5 of 7 days/.test(w.text)), "1a safe-to-spend win counts 5 of 7 days");
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
  snapNums.add(snap.safeSpend.dailyLog.filter(d => d.withinSafe).length); // structural day-count
  snapNums.add(snap.safeSpend.dailyLog.length);
  agendaNumbers(a).forEach(n => t.ok(snapNums.has(n), `3a agenda number ${n} traces to the snapshot`));

  // the assembler invents nothing when handed nothing
  const empty = buildMeetingAgenda({});
  t.eq(agendaNumbers(empty).length, 0, "3b empty snapshot → no numbers");
  t.eq(empty.decisions.length, 0, "3c and no decisions");

  // ── determinism ───────────────────────────────────────────────────────────────────────────────
  t.eq(JSON.stringify(buildMeetingAgenda(snap)), JSON.stringify(a), "4a deterministic for identical input");

  t.summary("meetingAgenda");
})();
