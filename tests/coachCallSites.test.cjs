// tests/coachCallSites.test.cjs
// -----------------------------------------------------------------------------
// NO /api/coach CALL SITE MAY INVENT WHAT THE COACH SAID.
//
// The Meet facilitator was not alone. The same shape — read the body without checking r.ok, then
// `|| <something plausible>` — appeared at four call sites, and each failed in its own way:
//
//   check-in   printed "…look for one subscription you can pause" and, in the catch, advice with a
//              dollar figure ($20) no engine computed, under the heading "Your AI Coach Says".
//   simulator  swallowed every HTTP error into "{}" , so the neutral fallback it already had — the
//              whole point of which is failures — never ran.
//   statement  turned a refusal into zero rows, which reads as "your statement was empty" rather
//              than "we could not read it".
//   chat       already checked res.ok; its fallback says it failed rather than pretending.
//
// A wrong number is a bug. A sentence the coach never said, over the coach's name, on a screen
// about someone's money, is worse: it is advice from nobody.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");

const APP = fs.readFileSync(path.join(__dirname, "..", "src", "App.jsx"), "utf8");

// Every fetch to /api/coach, each paired with the code between it and the NEXT call site. That is
// the honest boundary: whatever handles a response must appear before the next call begins. A fixed
// character window does not work — the chat wraps its fetch in a doFetch() helper and checks res.ok
// in the caller, fifty lines further down.
function callSites() {
  const starts = [];
  let i = APP.indexOf("fetch(`${API_BASE}/api/coach`");
  while (i !== -1) { starts.push(i); i = APP.indexOf("fetch(`${API_BASE}/api/coach`", i + 1); }
  return starts.map((at, n) => ({
    at: APP.slice(0, at).split("\n").length,
    body: APP.slice(at, n + 1 < starts.length ? starts[n + 1] : at + 2600),
  }));
}

(async () => {
  const t = create();
  const sites = callSites();

  // ── 1. every call site checks the response before reading it ─────────────────────────────────
  t.ok(sites.length >= 4, `1a found the call sites (${sites.length})`);
  for (const s of sites) {
    // The consent post is the one that legitimately only logs: it returns {ok} to its caller and
    // renders nothing, so there is no text to invent.
    const isConsent = /consentAction/.test(s.body);
    t.ok(isConsent || /if\s*\(!r\.ok\)|if\(!res\.ok\)|if \(!res\.ok\)/.test(s.body),
      `1b the call at line ${s.at} checks r.ok before reading the body`);
  }

  // ── 2. the check-in invents nothing ──────────────────────────────────────────────────────────
  t.ok(!/Great job checking in/.test(APP), "2a the invented check-in advice is gone");
  t.ok(!/Even saving \$20 moves your score forward/.test(APP),
    "2b …including the version with a dollar figure no engine computed");
  const checkin = sites.find(s => /type:"checkin"/.test(s.body));
  t.ok(!!checkin, "2c the check-in call site is found");
  t.ok(/if \(!tip \|\| !String\(tip\)\.trim\(\)\) throw/.test(checkin.body),
    "2d an empty reply is a failure, not silence to fill");
  // The check-in still finishes. Failing to get a tip must not strand the person mid-flow — that is
  // the same dead tap this whole branch exists to remove.
  t.ok(/\(insight \|\| insightError\) && <div key=\{4\}/.test(APP),
    "2e the result step still shows when the tip failed, because the check-in itself succeeded");
  t.ok(/The coach didn't answer, so there's no tip this time\. Tap Done to record your check-in\./.test(APP),
    "2f …and says so plainly");
  t.ok(/The coach is off in Settings, so there's no tip this time\./.test(APP),
    "2g with AI off it gives the real reason instead");
  // Nothing is persisted when the tip fails: the +3 lands only when Done is tapped. Copy that says
  // the check-in is already saved invites closing the modal, which discards it.
  t.ok(!/no tip this time\. Your check-in is saved/.test(APP),
    "2g2 …and does not claim the check-in is saved when nothing has been written yet");
  t.ok(/onClick=\{fetchInsight\} disabled=\{loading\}/.test(APP), "2h and offers Try again");

  // ── 3. the simulator's own fallback can now fire ─────────────────────────────────────────────
  const sim = sites.find(s => /type:"simulator"/.test(s.body));
  t.ok(!!sim, "3a the simulator call site is found");
  t.ok(/if \(!r\.ok\) throw new Error\(`coach \$\{r\.status\}`\)/.test(sim.body),
    "3b an HTTP error throws, so the neutral fallback prose in the catch actually runs");
  t.ok(/This purchase will reduce your safe-to-spend balance\./.test(APP),
    "3c (control) that neutral fallback still exists to be reached");

  // ── 4. a statement that could not be read does not read as an empty statement ────────────────
  const doc = sites.find(s => /type:'document'/.test(s.body));
  t.ok(!!doc, "4a the statement call site is found");
  t.ok(/if \(!r\.ok\) \{/.test(doc.body),
    "4b it throws rather than returning zero rows from a refusal");
  // The thrown message is rendered verbatim on the onboarding bank screen, so it must be a
  // sentence with a way out — not "coach 500".
  t.ok(!/throw new Error\(`coach \$\{r\.status\}`\)/.test(doc.body),
    "4c …and not with a raw status string, which this one shows to the person");
  t.ok(/Upload a CSV instead, or enter your numbers by hand\./.test(doc.body),
    "4d it keeps the remedy the old zero-rows path used to offer");

  // ── 5. the chat was already honest, and stays that way ───────────────────────────────────────
  t.ok(/if\(!res\.ok\) throw new Error\(`Server error \$\{res\.status\}`\)/.test(APP),
    "5a the chat checks res.ok");
  t.ok(/Sorry, I couldn't get a response\. Try again\./.test(APP),
    "5b …and its fallback says it failed rather than offering advice nobody gave");

  t.summary("coachCallSites.test");
})();
