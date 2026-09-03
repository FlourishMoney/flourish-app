// tests/meetSnapshot.test.cjs — Step 9 UI contract: the agenda displayed is the agenda generated,
// and it is exactly what the facilitator receives.
"use strict";
const { create } = require("./_runner.cjs");
const t = create();

(async () => {
  const { buildMeetSnapshot, meetAgendaFor, agendaToText } = await import("../src/lib/meetSnapshot.js");

  // debts + goals are read straight from appData by buildMeetSnapshot (no re-computation).
  const data = {
    debts: [{ name: "Visa", balance: 2340, rate: 19.99, min: 60 }],
    goals: [{ name: "Emergency fund", saved: 1400, target: 2000 }],
    transactions: [], accounts: [], bills: [], profile: { country: "CA" },
  };

  const snap = buildMeetSnapshot(data);
  t.ok(snap.debts && snap.debts[0].balance === 2340, "1a snapshot debt balance comes from appData");
  t.ok(snap.goals && snap.goals[0].current === 1400, "1b snapshot goal amount comes from appData");

  const agenda = meetAgendaFor(data);
  t.ok(agenda && Array.isArray(agenda.progress), "2a meetAgendaFor returns an agenda");
  t.ok(agenda.progress.some(p => p.value === 1400), "2b goal amount surfaced from data (traces to appData)");

  // determinism — same data → same agenda (what the screen renders is stable)
  t.eq(JSON.stringify(meetAgendaFor(data)), JSON.stringify(agenda), "2c meetAgendaFor is deterministic");

  // THE contract: the facilitator text is built from the SAME agenda the screen displays, so every
  // displayed item is present in what the facilitator receives — displayed === generated === sent.
  const text = agendaToText(agenda);
  [...agenda.wins, ...agenda.changes, ...agenda.risks, ...agenda.progress].forEach(it =>
    t.ok(text.includes(it.text), `3a displayed item is in the facilitator text: "${it.text.slice(0, 40)}"`));
  agenda.decisions.forEach(d => {
    t.ok(text.includes(d.text), "3b decision question in facilitator text");
    d.options.forEach(o => {
      t.eq(d.options.length, 2, "3c a decision carries both outcomes");
      t.ok(text.includes(o.outcome), "3d both computed outcomes in facilitator text");
    });
  });

  // empty data → a valid, empty, deterministic agenda (no invented content)
  const empty = meetAgendaFor({});
  t.eq(agendaToText(empty), agendaToText(meetAgendaFor({})), "4a empty agenda deterministic");
  t.eq(empty.decisions.length, 0, "4b nothing invented from empty data");

  t.summary("meetSnapshot");
})();
