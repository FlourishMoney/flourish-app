// tests/meetingRecord.test.cjs
// -----------------------------------------------------------------------------
// THE MEETING REMEMBERS — and the model cannot write a number into what it remembers.
//
// Covers items 4, 5 and 6: an agenda item carries an answer back, the answer is stored
// with its date, the next meeting opens with what changed, a dismissed question is not
// re-asked, an answered question changes the next agenda, and no figure a facilitator
// model produced can reach storage.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");

const AUTH_PATH = require.resolve("../netlify/functions/_lib/auth.js");
const FN_PATH = require.resolve("../netlify/functions/meeting.js");

function loadFn({ user_id = null, authError = null, state }) {
  delete require.cache[FN_PATH];
  delete require.cache[AUTH_PATH];
  const real = require("../netlify/functions/_lib/auth.js");
  require.cache[AUTH_PATH].exports = {
    ...real,
    getUserFromRequest: async () => ({ user_id, error: authError }),
    getAdminClient: () => ({
      from: () => ({ upsert: async (row) => { state.writes.push(row); return { error: null }; } }),
    }),
  };
  const mod = require(FN_PATH);
  delete require.cache[FN_PATH];
  return mod;
}
const post = (body) => ({ httpMethod: "POST", headers: {}, body: JSON.stringify(body) });

(async () => {
  const r = await import("../src/lib/meetingRecord.js");
  const { buildMeetingAgenda } = await import("../src/lib/meetingAgenda.js");
  const bills = await import("../src/lib/billsReconcile.js");
  const t = create();
  const ok = (over = {}) => ({ signature: "amount|netflix|19|25", domain: "bills", kind: "amount", answer: "accepted", subject: "Netflix", ...over });

  // ── 1. What may be recorded ──────────────────────────────────────────────────────────────────
  t.eq(JSON.stringify(r.recordableAnswer(ok())),
    '{"signature":"amount|netflix|19|25","domain":"bills","kind":"amount","answer":"accepted","subject":"Netflix"}',
    "1a a real answer is kept whole");
  t.eq(r.recordableAnswer(ok({ answer: "later" })), null, "1b 'later' is not an answer — storing it would stop the question being asked again");
  t.eq(r.recordableAnswer(ok({ answer: undefined })), null, "1c nor is nothing");
  t.eq(r.recordableAnswer(ok({ signature: undefined })), null, "1d an answer with no signature cannot be matched to a question");
  t.eq(r.recordableAnswer(ok({ domain: undefined })), null, "1e …or to a domain");
  t.eq(r.recordableAnswer(null), null, "1f nothing at all is nothing");

  // ── 2. THE MODEL CANNOT WRITE A FIGURE ───────────────────────────────────────────────────────
  // The facilitator is a model holding the household's context. It may phrase a question and
  // summarise an answer. Anything numeric it attaches is dropped here, before storage.
  {
    const withNumbers = r.recordableAnswer(ok({ amount: 25, newBalance: 1200, confidence: 0.9, note: { text: "x" }, extra: ["a"] }));
    t.eq(Object.keys(withNumbers).sort().join(","), "answer,domain,kind,signature,subject", "2a only the five allowed fields survive");
    t.ok(!("amount" in withNumbers) && !("newBalance" in withNumbers), "2b a model-supplied figure never reaches storage");
    const numericSubject = r.recordableAnswer(ok({ subject: 4200 }));
    t.ok(!("subject" in numericSubject), "2c even an allowed field is dropped when its value is a number");
    t.eq(JSON.stringify(r.buildMeetingRecord({ metOn: "2026-09-23", answers: [ok({ amount: 999 })] }).answers[0].amount), undefined,
      "2d …and the same is true through buildMeetingRecord");
  }

  // ── 3. A meeting, and its answers ────────────────────────────────────────────────────────────
  {
    const rec = r.buildMeetingRecord({ metOn: "2026-09-23T10:00:00Z", answers: [ok(), ok({ signature: "appeared|gym|?|45", answer: "dismissed", subject: "Gym" }), { junk: true }] });
    t.eq(rec.metOn, "2026-09-23", "3a the date is the day, not the instant");
    t.eq(rec.answers.length, 2, "3b unrecordable entries are dropped rather than stored half-formed");
    t.eq(r.buildMeetingRecord({}).metOn, null, "3c a meeting with no date is not invented one");
    t.eq(r.answeredSignatures([rec]).length, 2, "3d both signatures are answered");
    t.eq(r.answeredSignatures([rec], "income").length, 0, "3e …and can be filtered by domain");
    t.eq(r.answeredSignatures([rec, rec]).length, 2, "3f the same answer twice is still one signature");
    t.eq(r.lastMeeting([{ metOn: "2026-09-01" }, { metOn: "2026-09-23" }, { metOn: "2026-08-01" }]).metOn, "2026-09-23", "3g the last meeting is the most recent");
    t.eq(r.lastMeeting([]), null, "3h …and there may not be one");
  }

  // ── 4. A DISMISSED QUESTION IS NOT RE-ASKED (item 6) ─────────────────────────────────────────
  {
    const cur = [{ name: "Netflix", amount: "18.99", origin: "observed" }];
    const det = [{ name: "Netflix", amount: "24.99" }];
    const first = bills.billPrompts({ detectedBills: det, currentBills: cur });
    t.eq(first.length, 1, "4a the change is asked once");

    const meeting = r.buildMeetingRecord({
      metOn: "2026-09-23",
      answers: [{ signature: first[0].signature, domain: "bills", kind: "amount", answer: "dismissed", subject: "Netflix" }],
    });
    const second = bills.billPrompts({ detectedBills: det, currentBills: cur, dismissedSignatures: r.answeredSignatures([meeting], "bills") });
    t.eq(second.length, 0, "4b and after the household answers it, the next meeting does not ask it again");

    // The same subject changing AGAIN is a new question, not the old one.
    const third = bills.billPrompts({ detectedBills: [{ name: "Netflix", amount: "31.99" }], currentBills: cur, dismissedSignatures: r.answeredSignatures([meeting], "bills") });
    t.eq(third.length, 1, "4c …while a further change does ask, because the facts moved");
  }

  // ── 5. AN ANSWERED QUESTION CHANGES THE NEXT AGENDA (items 4 and 6) ──────────────────────────
  {
    const cur = [{ name: "Netflix", amount: "18.99", origin: "observed" }];
    const det = [{ name: "Netflix", amount: "24.99" }];
    const prompts = bills.billPrompts({ detectedBills: det, currentBills: cur })
      .map(p => ({ signature: p.signature, text: bills.billChangeQuestion(p.change), domain: "bills", kind: p.change.kind, subject: p.change.name }));

    const agenda = buildMeetingAgenda({ reconcilePrompts: prompts });
    t.eq(agenda.questions.length, 1, "5a the agenda carries the question");
    t.eq(agenda.questions[0].id, prompts[0].signature, "5b …identified by the signature the answer will be recorded against");
    t.eq(agenda.questions[0].options.map(o => o.answer).join(","), "accepted,dismissed", "5c …with exactly two answers, because it is said out loud");
    t.eq(agenda.questions[0].source, "reconcileLoop", "5d …and it says where it came from");
    t.ok(Array.isArray(agenda.wins) && Array.isArray(agenda.decisions), "5e the sections that existed before still exist");

    // Accept it, apply it, and the next agenda has nothing to ask.
    const applied = bills.applyBillChange(cur, bills.billChanges(det, cur)[0]);
    t.eq(applied[0].amount, "24.99", "5f accepting applies the change to the household's bills");
    const nextPrompts = bills.billPrompts({ detectedBills: det, currentBills: applied });
    t.eq(buildMeetingAgenda({ reconcilePrompts: nextPrompts }).questions.length, 0,
      "5g …so the next meeting's agenda no longer carries it — the answer changed the agenda");
  }

  // ── 6. How the next meeting opens (item 5) ───────────────────────────────────────────────────
  {
    const first = r.meetingOpening({ lastRecord: null, snapshot: {} });
    t.eq(first.hasHistory, false, "6a a first meeting says so");
    t.ok(/first money meeting/.test(first.lines[0].text), "6b …rather than inventing a history");

    const last = r.buildMeetingRecord({ metOn: "2026-09-16", answers: [ok({ subject: "Netflix" }), ok({ signature: "appeared|gym|?|45", answer: "dismissed", subject: "Gym" })] });
    const opening = r.meetingOpening({ lastRecord: last, snapshot: { healthScore: { current: 71, previous: 66 } } });
    t.eq(opening.metOn, "2026-09-16", "6c a later meeting opens with when the last one was");
    t.ok(opening.lines.some(l => /you said yes to Netflix/.test(l.text)), "6d …what was decided");
    t.ok(opening.lines.some(l => /not being asked again/.test(l.text)), "6e …what was left, and that it will not be re-asked");
    t.ok(opening.lines.some(l => /moved up 5 since then, to 71/.test(l.text)), "6f …and what the engines say has changed since");

    // EVERY line must name an engine or the record. Nothing may come from the model.
    const sources = [...new Set(opening.lines.map(l => l.source))];
    t.eq(sources.filter(s => !["meetingRecord", "healthScore"].includes(s)).join(",") || "(none)", "(none)",
      "6g every opening line is sourced to the record or an engine — never to the model");
    t.ok(opening.lines.every(l => !!l.source), "6h …and no line is unsourced");

    const noMove = r.meetingOpening({ lastRecord: last, snapshot: { healthScore: { current: 71, previous: 71 } } });
    t.ok(!noMove.lines.some(l => l.source === "healthScore"), "6i a score that did not move is not reported as news");
    const noScore = r.meetingOpening({ lastRecord: last, snapshot: {} });
    t.ok(noScore.lines.every(l => l.source === "meetingRecord"), "6j …and with no engine output there is simply no engine line");
    const empty = r.meetingOpening({ lastRecord: { metOn: "2026-09-16", answers: [] }, snapshot: {} });
    t.ok(empty.lines.some(l => /No decisions were recorded/.test(l.text)), "6k a meeting where nothing was decided says that plainly");
  }

  // ── 7. The server is the only writer, and it applies the same allow-list ─────────────────────
  {
    const state = { writes: [] };
    const fn = loadFn({ user_id: null, authError: "missing Authorization header", state });
    const res = await fn.handler(post({ action: "record", met_on: "2026-09-23", answers: [ok()] }));
    t.eq(res.statusCode, 401, "7a an unauthenticated request records nothing");
    t.eq(state.writes.length, 0, "7b …and writes nothing");
  }
  {
    const state = { writes: [] };
    const fn = loadFn({ user_id: "u1", state });
    t.eq((await fn.handler(post({ action: "record", met_on: "23-09-2026", answers: [] }))).statusCode, 400, "7c a malformed date is refused");
    t.eq((await fn.handler(post({ action: "nonsense" }))).statusCode, 400, "7d …as is an unknown action");
    t.eq((await fn.handler(post({ action: "record", met_on: "2026-09-23", answers: [{ answer: "maybe" }] }))).statusCode, 400,
      "7e …and a body whose answers are ALL rejected is refused rather than stored as an empty meeting");

    const good = await fn.handler(post({ action: "record", met_on: "2026-09-23", answers: [ok({ amount: 999, newBalance: 5 })] }));
    t.eq(good.statusCode, 200, "7f a real answer is recorded");
    t.eq(state.writes[0].user_id, "u1", "7g …against the user from the verified token, never the body");
    t.eq(JSON.stringify(state.writes[0].answers[0].amount), undefined, "7h …with the model-supplied figures stripped server-side too");
    t.eq(Object.keys(state.writes[0].answers[0]).sort().join(","), "answer,domain,kind,signature,subject", "7i …leaving exactly the five allowed fields");

    // An unknown field like `amount` is dropped just by not being in the list, so it does not
    // exercise the type check at all. The case that does is an ALLOWED field carrying a number:
    // a facilitator summarising "Netflix" as 4200 must not be able to store 4200 as the subject.
    const numeric = await fn.handler(post({ action: "record", met_on: "2026-09-24", answers: [ok({ subject: 4200 })] }));
    t.eq(numeric.statusCode, 200, "7j an answer whose subject is a number is still recorded");
    t.ok(!("subject" in state.writes[1].answers[0]), "7k …with that number dropped, not stored as the subject");
    t.eq(Object.keys(state.writes[1].answers[0]).sort().join(","), "answer,domain,kind,signature", "7l …leaving only the string fields");
  }

  // ── 8. The two allow-lists agree ─────────────────────────────────────────────────────────────
  // The function cannot import the ESM lib, so the list is duplicated. Duplication is only safe
  // with a tripwire — this is it.
  {
    const lib = fs.readFileSync(path.join(__dirname, "..", "src", "lib", "meetingRecord.js"), "utf8");
    const fn = fs.readFileSync(path.join(__dirname, "..", "netlify", "functions", "meeting.js"), "utf8");
    const fields = (src) => (src.match(/ALLOWED_FIELDS = \[([^\]]+)\]/) || [])[1];
    t.eq(fields(fn), fields(lib), "8a the server's allowed fields are the same list as the client's");
    t.ok(/"accepted"[\s\S]{0,40}"dismissed"/.test(fn), "8b …and the same two answers");
  }

  // ── 9. The migration ─────────────────────────────────────────────────────────────────────────
  {
    const m = fs.readFileSync(path.join(__dirname, "..", "supabase", "migrations", "0011_meeting_records.sql"), "utf8");
    t.ok(/enable row level security/i.test(m), "9a RLS is on");
    t.ok(/for select using \(auth\.uid\(\) = user_id\)/i.test(m), "9b the client reads its own row");
    t.ok(!/for insert|for update|for delete/i.test(m), "9c …and has no policy that lets it write one");
    t.ok(/grant select\s+on table public\.meeting_records to authenticated/i.test(m), "9d authenticated may select");
    t.ok(/grant all privileges on table public\.meeting_records to service_role/i.test(m), "9e the service role writes");
    t.ok(!/to anon/i.test(m), "9f anon gets nothing");
    t.ok(/answers\s+jsonb/i.test(m), "9g answers are stored as given");
  }

  t.summary("meetingRecord.test");
})();
