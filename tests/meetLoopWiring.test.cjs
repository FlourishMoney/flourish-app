// tests/meetLoopWiring.test.cjs
// -----------------------------------------------------------------------------
// THE LOOP IS ACTUALLY CONNECTED TO THE MEETING.
//
// Every piece of items 1-5 can be unit-tested green while reaching no household at all:
// buildMeetSnapshot is the ONLY producer of the snapshot buildMeetingAgenda consumes, and
// it never set `reconcilePrompts`, so agenda.questions was always empty in the running app
// and the facilitator never received a question to ask. That is the difference between a
// feature and a library, and it is what this file pins.
//
// It drives the REAL meetAgendaFor(appData) — the same function the Meet screen and the
// facilitator context both call — with a household that has three months of charges.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");

const iso = (d) => d.toISOString().slice(0, 10);
const monthsAgo = (n) => { const d = new Date(); d.setMonth(d.getMonth() - n); return d; };
const charge = (name, amount, n, cat = "Subscriptions") =>
  ({ id: `${name}-${n}`, name, amount, date: iso(monthsAgo(n)), cat });

// A household with a Netflix charge that has gone up, and a gym the bank sees but they never recorded.
const HOUSEHOLD = () => ({
  transactions: [
    charge("Netflix", 24.99, 0), charge("Netflix", 24.99, 1), charge("Netflix", 24.99, 2),
    charge("Goodlife Gym", 45, 0), charge("Goodlife Gym", 45, 1), charge("Goodlife Gym", 45, 2),
  ],
  bills: [{ name: "Netflix", amount: "18.99", date: "16", origin: "observed" }],
  debts: [], incomes: [], accounts: [], goals: [], meetingRecords: [],
});

(async () => {
  const m = await import("../src/lib/meetSnapshot.js");
  const r = await import("../src/lib/meetingRecord.js");
  const t = create();

  // ── 1. The questions reach the agenda the screen renders ─────────────────────────────────────
  {
    const agenda = m.meetAgendaFor(HOUSEHOLD());
    const kinds = agenda.questions.map(q => q.kind).sort().join(",");
    t.eq(kinds, "amount,appeared", "1a the real agenda carries both findings — the raised bill and the one never recorded");
    t.ok(agenda.questions.every(q => q.id && q.text && q.source === "reconcileLoop"), "1b …each with the signature its answer is recorded against");
    t.ok(agenda.questions.some(q => /Netflix went up from \$19 to \$25/.test(q.text)), "1c …phrased from engine figures, ready to say out loud");
    t.ok(Array.isArray(agenda.wins), "1d …and the sections that existed before are untouched");
  }

  // ── 2. The facilitator receives them ─────────────────────────────────────────────────────────
  {
    const text = m.agendaToText(m.meetAgendaFor(HOUSEHOLD()));
    t.ok(/Questions to ask/.test(text), "2a the facilitator context contains the questions");
    t.ok(/Netflix went up from \$19 to \$25/.test(text), "2b …verbatim, so it reads them rather than restating the figures");
    t.ok(/do not restate the figures/.test(text), "2c …and is told so explicitly");
  }

  // ── 3. An answer changes the next meeting ────────────────────────────────────────────────────
  {
    const data = HOUSEHOLD();
    const before = m.meetAgendaFor(data);
    const netflix = before.questions.find(q => /Netflix/.test(q.text));
    // Guard, not decoration: without it, an unwired snapshot makes this section throw on
    // `netflix.id` and the run dies before t.summary() — a real failure that prints nothing.
    t.ok(!!netflix, "3z the Netflix question exists to be answered (if this fails, the loop is not wired)");
    if (!netflix) { t.summary("meetLoopWiring.test"); return; }

    // The household says NO. The next meeting must not ask it again.
    data.meetingRecords = [r.buildMeetingRecord({
      metOn: iso(new Date()),
      answers: [{ signature: netflix.id, domain: "bills", kind: "amount", answer: "dismissed", subject: "Netflix" }],
    })];
    const after = m.meetAgendaFor(data);
    t.ok(!after.questions.some(q => /Netflix/.test(q.text)), "3a a question answered NO is not asked at the next meeting");
    t.eq(after.questions.length, before.questions.length - 1, "3b …and the others still are");

    // A YES is not a permanent silence: it changes the data instead.
    const data2 = HOUSEHOLD();
    data2.meetingRecords = [r.buildMeetingRecord({
      metOn: iso(new Date()),
      answers: [{ signature: netflix.id, domain: "bills", kind: "amount", answer: "accepted", subject: "Netflix" }],
    })];
    t.ok(m.meetAgendaFor(data2).questions.some(q => /Netflix/.test(q.text)),
      "3c a question answered YES is still asked until the change is actually applied — an accept is not a gag");
    data2.bills = [{ name: "Netflix", amount: "24.99", date: "16", origin: "observed" }];
    t.ok(!m.meetAgendaFor(data2).questions.some(q => /Netflix/.test(q.text)),
      "3d …and once applied, the detector stops finding a difference, which is what ends it");
  }

  // ── 4. The meeting opens with what changed (item 5) ──────────────────────────────────────────
  {
    const data = HOUSEHOLD();
    t.eq(m.meetOpeningFor(data).hasHistory, false, "4a a first meeting has nothing to compare against");

    data.meetingRecords = [r.buildMeetingRecord({
      metOn: "2026-09-16",
      answers: [{ signature: "appeared|goodlife gym|?|45", domain: "bills", kind: "appeared", answer: "accepted", subject: "Goodlife Gym" }],
    })];
    const opening = m.meetOpeningFor(data);
    t.eq(opening.metOn, "2026-09-16", "4b a later one opens with when the last was");
    t.ok(opening.lines.some(l => /you said yes to Goodlife Gym/.test(l.text)), "4c …and what was decided");
    t.ok(opening.lines.every(l => l.source && l.source !== "model" && l.source !== "coach"),
      "4d …every line sourced to the record or an engine, never the model");
  }

  // ── 5. It degrades quietly ───────────────────────────────────────────────────────────────────
  t.eq(m.buildReconcilePrompts({}).length, 0, "5a a household with no transactions is asked nothing");
  t.eq(m.buildReconcilePrompts({ transactions: null }).length, 0, "5b …and a malformed one does not throw");
  t.eq(m.meetAgendaFor({ transactions: [], bills: [] }).questions.length, 0, "5c an empty household gets an agenda with no questions");
  t.ok(Array.isArray(m.meetOpeningFor({}).lines), "5d …and an opening that still renders");

  t.summary("meetLoopWiring.test");
})();
