// tests/meetSnapshot.test.cjs — Step 9 UI contract: the agenda displayed is the agenda generated,
// and it is exactly what the facilitator receives.
"use strict";
const { create } = require("./_runner.cjs");
const t = create();

(async () => {
  const { buildMeetSnapshot, meetAgendaFor, agendaToText, facilitatorGateState } = await import("../src/lib/meetSnapshot.js");

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

  // Item 1 — empty "Flourish noticed" state. A steady, demo-like week (debts + accounts + income but
  // NO goals and NO forecast risks) yields ZERO noticed items (wins+changes+risks+progress) while a
  // decision is still surfaced — so the UI's empty state must key off the noticed items, NOT the whole
  // agenda (a decision present must not suppress the calm "Nothing stood out this week." message).
  const steady = {
    debts: [{ name: "TD Visa", balance: 3420, rate: 19.99, min: 68 }, { name: "Car Loan", balance: 8200, rate: 6.99, min: 280 }],
    accounts: [{ type: "checking", balance: 1243.88 }, { type: "savings", balance: 1840 }, { type: "credit", balance: -3420 }],
    incomes: [{ amount: "2840", freq: "biweekly", type: "employment" }],
    bills: [{ name: "Hydro", amount: "95", date: "11" }],
    goals: [], transactions: [], profile: { country: "CA" },
  };
  const sa = meetAgendaFor(steady);
  const noticed = [...sa.wins, ...sa.changes, ...sa.risks, ...sa.progress];
  t.eq(noticed.length, 0, "5a steady demo-like week → zero 'Flourish noticed' items (calm empty state)");
  t.ok(sa.decisions.length >= 1, "5b ...but a decision is still surfaced (empty state must not depend on decisions)");

  // Item 2 — parallel decision outcomes + real date range.
  const dec = sa.decisions[0];
  t.ok(/paid off in .+ instead of /.test(dec.options[0].outcome), "6a debt outcome shows before/after payoff");
  t.ok(/buffer grows to \$/.test(dec.options[1].outcome), "6b savings outcome shows what the buffer becomes");
  t.ok(!/this period/.test(dec.text), "6c decision question uses an actual date range, not 'this period'");

  // Item 3 — facilitator gate: three states, and only 'ready' shows the input.
  t.eq(facilitatorGateState({ demo: true, canFacilitate: true, aiOn: true }), "trial", "7a demo (unauthenticated) → trial line, no input");
  t.eq(facilitatorGateState({ demo: false, canFacilitate: false, aiOn: true }), "trial", "7b signed-in free tier → trial line, no input");
  t.eq(facilitatorGateState({ demo: false, canFacilitate: true, aiOn: false }), "ai-off", "7c eligible tier but AI off → coach-off line, no input");
  t.eq(facilitatorGateState({ demo: false, canFacilitate: true, aiOn: true }), "ready", "7d signed-in trial/premium/beta_founder + AI on → input shown");
  t.eq(facilitatorGateState({ demo: true, canFacilitate: true, aiOn: false }), "trial", "7e demo takes precedence over AI-off");

  t.summary("meetSnapshot");
})();
