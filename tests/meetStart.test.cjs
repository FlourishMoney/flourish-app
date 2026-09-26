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
const MEET_AT = APP.indexOf("function MeetAgenda({ data, isCouple, setScreen }){");
const MEET = APP.slice(MEET_AT, APP.indexOf("\nfunction Family({data,", MEET_AT));

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
  const startBtn = MEET.slice(MEET.indexOf("<button onClick={start}"), MEET.indexOf("</button>", MEET.indexOf("<button onClick={start}")));
  t.eq((startBtn.match(/disabled=\{([^}]*)\}/) || [])[1], undefined,
    "2a nothing switches the start button off at all — not an empty agenda, under any spelling");
  t.ok(!/hasAgenda|items\.length|agenda\./.test(startBtn),
    "2b …and nothing about the agenda's contents reaches the button at all");
  t.ok(!/const hasAgenda/.test(MEET), "2c the flag that gated it is gone");

  // ── 3. an empty agenda still gives the facilitator something real to open with ───────────────
  // Whatever it opens with must come from the engines, and must match what the rest of the app
  // shows for the same label.
  t.ok(typeof S.quietWeekAgendaFor === "function",
    "3a there is a function that builds an agenda for a week with nothing unusual in it");
  {
    const built = S.quietWeekAgendaFor({
      safeToSpendText: "$420", safeToSpend: 420,
      upcoming: [{ text: "Thu 1: Rent $1,800 out." }, { text: "Sat 3: Pay $2,100 in." }],
    });
    const text = S.agendaToText(built);
    t.ok(/420/.test(text), "3b it carries the safe-to-spend figure it was handed");
    t.ok(/Thu 1: Rent \$1,800 out\./.test(text), "3c …and the bills and deposits the forecast found");
    t.ok(/nothing unusual/i.test(text), "3d …and says plainly that nothing unusual happened");
    const figures = (text.match(/\$?\d[\d,]*/g) || []).map(x => x.replace(/[$,]/g, ""));
    const allowed = new Set(["420", "1800", "1", "2100", "3"]);
    t.eq(figures.filter(f => !allowed.has(f)).join(",") || "(none)", "(none)",
      "3e and no figure appears that was not handed in — the facilitator gets engine output only");
    t.ok(/nothing unusual/i.test(S.agendaToText(S.quietWeekAgendaFor({}))),
      "3f with no figures at all it still produces an opening rather than an empty string");
  }
  // The figure must come PRE-FORMATTED from the one owner of how it is displayed. Formatting the
  // engine's raw safeAmount here rounds half-up, where the display policy floors the balance and
  // ceils the deductions — so the same label showed $2,951 in the meeting and $2,950 everywhere
  // else, overstating what is available, which is what that policy exists to prevent.
  {
    const raw = S.quietWeekAgendaFor({ safeToSpend: 2950.75, safeToSpendText: null });
    t.ok(!/2,?95[01]/.test(S.agendaToText(raw)),
      "3g a raw engine amount with no formatted text prints no figure at all, rather than its own");
    const src = fs.readFileSync(path.join(__dirname, "..", "src", "lib", "meetSnapshot.js"), "utf8");
    t.ok(/safeToSpendView\(SafeSpendEngine\.calculate\(data\)/.test(src),
      "3h the figure is read through safeToSpendView, the one owner of how it is shown");
    t.ok(/if \(hasCashAccount && hasIncome\)/.test(src),
      "3i …and only when the app is willing to show it at all — no private version for the meeting");
    t.ok(/num\(b\?\.amount\)/.test(src), "3j bill amounts use num(), so \"$1,800\" cannot read as 1");
  }
  // What is coming is neither a risk nor a win. A paycheque listed under "Upcoming risks" is read
  // out as one by the facilitator, which works through the agenda in order.
  {
    const a = S.quietWeekAgendaFor({ upcoming: [{ text: "Thu 1: Pay $3,000 in." }] });
    t.eq(a.risks.length, 0, "3k upcoming items are not filed as risks");
    const text = S.agendaToText(a);
    t.ok(/Coming up:/.test(text) && /Pay \$3,000 in\./.test(text), "3l they get their own heading");
    t.ok(!/Upcoming risks:/.test(text), "3m …and the risks heading does not appear for them");
    t.ok(/Nothing unusual happened this week\./.test(text),
      "3n the closing line speaks about the week that happened, so it cannot contradict what is coming");
    t.ok(/More items follow/.test(S.agendaToText(S.quietWeekAgendaFor({ upcoming: [{text:"x"}], truncated: true }))),
      "3o a truncated list says so rather than dropping items silently");
  }
  // The substitution must not fire on an agenda that has questions: agendaToText SENDS questions,
  // and they are the reconcile loop's entire output.
  {
    const onlyQuestions = { wins: [], changes: [], risks: [], progress: [], decisions: [], questions: [{ text: "Netflix looks like a new regular bill. Add it?" }] };
    t.eq(S.agendaIsEmpty(onlyQuestions), false,
      "3p an agenda carrying only questions is NOT empty — replacing it would throw the question " +
      "away and then claim nothing came up, in the week the app had something to ask");
    t.eq(S.agendaIsEmpty({ wins: [], changes: [], risks: [], progress: [], decisions: [], questions: [] }), true,
      "3q (control) a genuinely empty one still is");
  }

  // ── 4. FAULT B: a refusal is never dressed up as the coach ───────────────────────────────────
  t.ok(!/Let's begin\. First, the win\. What went well this week\?/.test(APP),
    "4a the invented opening line is gone from the app entirely");
  t.ok(/if \(!r\.ok\)/.test(MEET), "4b the facilitator call checks the response before reading it");
  t.ok(/setMeetError/.test(MEET), "4c …and a failure sets an error state rather than a fake message");
  t.ok(/Try again/.test(MEET), "4d …which the card shows with a Try again button");
  // A limit must read exactly as the coach chat reads it, and sell nothing on a store app.
  const limitBlock = MEET.slice(MEET.indexOf("r.status === 429"), MEET.indexOf("} else if (r.status === 401"));
  t.ok(/r\.status === 429 && j\.error === "rate_limited"/.test(MEET),
    "4e only the server's own rate_limited payload counts as a limit — the facilitator is not " +
    "metered server-side, so a bare 429 is an upstream rate limit and retrying is what works");
  t.ok(/kind:"busy"/.test(MEET) && /The coach is busy right now/.test(MEET),
    "4e2 …and a bare 429 says the coach is busy, keeping its Try again");
  t.ok(/j\.error === "ai_consent_required"/.test(MEET) && /Privacy & AI/.test(MEET),
    "4e3 a consent 403 gives the real remedy, not 'your session expired' on a loop");
  t.ok(/const alreadyThere = !!userText && last && last\.role === "user"/.test(MEET),
    "4e4 Try again does not append the same turn twice into what the coach receives");
  t.ok(/isNativeApp\(\)/.test(limitBlock), "4f a weekly limit branches on the platform");
  const nativeLimit = limitBlock.slice(limitBlock.indexOf("isNativeApp()"), limitBlock.indexOf(": (j.message"));
  t.ok(/They reset Monday\./.test(nativeLimit), "4f2 the native wording is the coach chat's wording");
  t.ok(!/[Uu]pgrade|Plus|flourishmoney\.app|subscribe|\$\d/.test(nativeLimit),
    "4g …and names no price, no Plus, no website — there is nothing to buy in a store app");
  const limitStrings = (limitBlock.match(/You've used this week's[^`]*/g) || []);
  t.eq(limitStrings.length, 2, "4h both the native and web limit strings are present");
  for (const [i, str] of limitStrings.entries()) {
    t.ok(/They reset Monday\./.test(str), `4i limit string ${i + 1} says when the limit lifts`);
  }
  t.ok(/kind:"limit"/.test(limitBlock) && /meetError\.kind !== "limit"/.test(MEET),
    "4j a limit gets no Try again — retrying is what will not work until it lifts");

  // ── 5. AI off cannot be a silent no-op ───────────────────────────────────────────────────────
  t.eq(S.facilitatorGateState({ demo: false, canFacilitate: true, aiOn: false }), "ai-off",
    "5a AI off resolves to its own state");
  t.ok(!/const start = \(\) => \{ if \(!aiEnabled\(\)\) return;/.test(MEET),
    "5b start() no longer returns silently — the button is not rendered in that state at all");

  // ── 6. the tap is acknowledged immediately ───────────────────────────────────────────────────
  t.ok(/const start = \(\) => \{ setStarted\(true\); sendToFacilitator\(null\); \};/.test(MEET),
    "6a the tap flips started in the same frame, so the card replaces the button immediately");
  t.ok(/\{busy && <div[^>]*>\{msgs\.length \? "…" : "Starting the meeting…"\}<\/div>\}/.test(MEET),
    "6b …and before the first reply the card says what it is doing, so a slow connection never " +
    "looks like nothing happened");
  t.ok(!/\{busy\?"Starting…"/.test(MEET),
    "6c the label is not put on the start button, which unmounts on tap and could never show it");
  t.ok(/<button onClick=\{send\} disabled=\{busy\}/.test(MEET),
    "6d and the send button, which DOES stay mounted, is disabled while a reply is in flight");

  t.summary("meetStart.test");
})();
