// tests/meetStart.test.cjs
// -----------------------------------------------------------------------------
// THE BUTTON THAT STARTS THE MEETING IS NEVER A DEAD TAP.
//
// Reported 2026-09-26: on the Meet tab, "Start the meeting" does nothing. Two separate faults sit
// behind that one symptom, and they bite different accounts:
//
//   A. disabled={!hasAgenda}. A quiet week produces no wins, changes, risks, progress or
//      decisions, so the button greys out. Tapping a greyed-out button is silence with no
//      explanation, and a quiet week is the week you most want to talk about.
//
//   B. sendToFacilitator never checks r.ok. A 401, a rate limit, a plan limit or a 500 all parse
//      to an empty body, and the code then falls back to a hard-coded sentence — "Let's begin.
//      First, the win. What went well this week?" — displayed under the coach's own name. The app
//      invents a line the coach never said and shows it as if it had.
//
// B is the more serious of the two. A is the one that produces the reported symptom.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");

const APP = fs.readFileSync(path.join(__dirname, "..", "src", "App.jsx"), "utf8");
const MEET = APP.slice(APP.indexOf("function MeetAgenda({ data, isCouple, setScreen }){"),
                       APP.indexOf("function MeetAgenda({ data, isCouple, setScreen }){") + 9000);

(async () => {
  const t = create();
  const S = await import("../src/lib/meetSnapshot.js");

  // ── 1. which fault the reported account actually hits ────────────────────────────────────────
  // A signed-in trial or beta_founder with AI on reaches "ready" — the state that renders the
  // button. So the disabled attribute is what her tap meets, before any network call happens.
  t.eq(S.facilitatorGateState({ demo: false, canFacilitate: true, aiOn: true }), "ready",
    "1a a signed-in trial/founder with AI on reaches the state that renders the button");
  const quiet = { wins: [], changes: [], risks: [], progress: [], decisions: [] };
  const hasAgenda = (a) => [...a.wins, ...a.changes, ...a.risks, ...a.progress].length > 0 || a.decisions.length > 0;
  t.eq(hasAgenda(quiet), false, "1b …and a quiet week produces an agenda with nothing in it");

  // ── 2. FAULT A: the button must not be disabled by an empty agenda ───────────────────────────
  t.ok(!/disabled=\{!hasAgenda\}/.test(MEET),
    "2a the start button is not disabled by an empty agenda — a quiet week is still a meeting");
  t.ok(!/cursor:hasAgenda\?"pointer":"default"/.test(MEET),
    "2b …and it does not render as un-tappable either");

  // ── 3. an empty agenda still gives the facilitator something real to open with ───────────────
  // Whatever it opens with must come from the engines. The facilitator must never receive a figure
  // Flourish did not calculate, which is the whole basis of "calculated by Flourish".
  t.ok(typeof S.quietWeekAgendaFor === "function",
    "3a there is a function that builds an agenda for a week with nothing unusual in it");
  if (typeof S.quietWeekAgendaFor === "function") {
    const built = S.quietWeekAgendaFor({
      safeToSpend: 420, safeToSpendLabel: "Safe until next payday",
      upcoming: [{ text: "Rent $1,800 due in 3 days" }, { text: "Pay $2,100 due in 5 days" }],
    });
    const text = S.agendaToText(built);
    t.ok(/420/.test(text), "3b it carries the safe-to-spend the engine calculated");
    t.ok(/Rent \$1,800 due in 3 days/.test(text), "3c …and the bills and deposits the forecast found");
    t.ok(/nothing unusual/i.test(text), "3d …and says plainly that nothing unusual happened");
    // Nothing invented: every figure in the text must have been passed in.
    const figures = (text.match(/\$?\d[\d,]*/g) || []).map(x => x.replace(/[$,]/g, ""));
    const allowed = new Set(["420", "1800", "3", "2100", "5"]);
    const invented = figures.filter(f => !allowed.has(f));
    t.eq(invented.join(",") || "(none)", "(none)",
      "3e and no figure appears that was not handed in — the facilitator gets engine output only");
    const empty = S.quietWeekAgendaFor({ safeToSpend: null, upcoming: [] });
    t.ok(/nothing unusual/i.test(S.agendaToText(empty)),
      "3f with no figures at all it still produces an opening rather than an empty string");
  }


  t.summary("meetStart.test");
})();
