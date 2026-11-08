// tests/meetingMemory.test.cjs
// -----------------------------------------------------------------------------
// THE MONEY MEETING REMEMBERS WHAT THE HOUSEHOLD DECIDED (1.1.6, 2026-11-08).
//
// The pieces existed (meeting.js wrote meeting_records, meetingRecord.js built the opening) and nothing
// connected them. This drives the real ones together: the client library (src/lib/meetingMemory.js) talks
// to the REAL netlify/functions/meeting.js over an in-memory table that keeps the 0011 and 0030 row rules
// (tests/_meetingStore.cjs), and the agenda and opening come from the real meetAgendaFor / meetOpeningFor.
//   1  the read runs as the signed-in person, with their token, never the secret key, and RLS decides
//   2  a read that fails is "unknown" (null), never an empty history
//   3  a saved meeting reopens with "Last meeting:" and its decisions
//   4  a "no" stops that question coming back
//   5  the first meeting shows the first-meeting line
//   6  couple mode: both partners see the same history, and neither sees a meeting from before they joined
//   7  each kind of yes changes the bills exactly once; a no changes nothing; applying twice applies once
//   8  a failed save changes nothing (the screen's order: save, then mark done, then apply)
//   9  the records never reach a saved blob
//  10  the screen shows only words that already existed
// Synthetic households only.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");
const { createStore } = require("./_meetingStore.cjs");

const iso = (d) => d.toISOString().slice(0, 10);
const monthsAgo = (n) => { const d = new Date(); d.setMonth(d.getMonth() - n); return d; };
const charge = (name, amount, n, cat = "Subscriptions") => ({ id: `${name}-${n}`, name, amount, date: iso(monthsAgo(n)), cat });

// Netflix has gone up (the bank sees $24.99, they recorded $18.99), the bank sees a gym they never recorded,
// and a Spotify bill the bank once found has stopped showing up.
const HOUSEHOLD = () => ({
  transactions: [
    charge("Netflix", 24.99, 0), charge("Netflix", 24.99, 1), charge("Netflix", 24.99, 2),
    charge("Goodlife Gym", 45, 0), charge("Goodlife Gym", 45, 1), charge("Goodlife Gym", 45, 2),
  ],
  bills: [{ name: "Netflix", amount: "18.99", date: "16", origin: "observed" }, { name: "Spotify", amount: "11.99", date: "4", origin: "observed" }],
  debts: [], incomes: [], accounts: [], goals: [],
});

const O = "00000000-0000-4000-8000-0000000000a1";   // the owner
const P = "00000000-0000-4000-8000-0000000000b2";   // the partner
const X = "00000000-0000-4000-8000-0000000000c3";   // someone in no household with them

(async () => {
  const M = await import("../src/lib/meetingMemory.js");
  const snap = await import("../src/lib/meetSnapshot.js");
  const t = create();
  const as = (store, who) => ({ apiBase: "", getJwt: async () => `tok:${who}`, fetchImpl: store.fetchFor() });
  const q = (agenda, re) => agenda.questions.find(x => re.test(x.text));

  // ── 1. THE READ RUNS AS THE PERSON ─────────────────────────────────────────────────────────────
  {
    const st = createStore();
    st.S.rows.push({ user_id: O, met_on: "2026-11-01", answers: [{ signature: "s1", domain: "bills", kind: "amount", answer: "dismissed", subject: "Netflix", amount: 25 }] });
    st.S.rows.push({ user_id: X, met_on: "2026-11-02", answers: [] });
    const recs = await M.loadMeetingRecords(as(st, O));
    t.eq(st.S.log.scopedTokens, [`tok:${O}`], "1a the meetings are read with the person's OWN token (a user-scoped client)");
    t.eq(st.S.log.adminReads, 0, "1b …never through the service-role client");
    t.eq(st.S.log.listFilters, [[]], "1c …with no user filter of its own: the row policies decide what comes back");
    t.eq(recs.map(r => r.metOn), ["2026-11-01"], "1d only this person's meeting comes back, not a stranger's");
    t.eq(Object.keys(recs[0].answers[0]).sort(), ["answer", "domain", "kind", "signature", "subject"], "1e a stored answer comes back through the allow-list (no figure)");
    t.eq(recs[0].mine, true, "1f …marked as their own");
    const fnSrc = fs.readFileSync(path.join(__dirname, "..", "netlify", "functions", "meeting.js"), "utf8");
    const listBody = fnSrc.slice(fnSrc.indexOf("async function listMeetings"), fnSrc.indexOf("exports.handler"));
    t.ok(listBody.length > 200 && /getUserScopedClient/.test(listBody) && !/getAdminClient|SUPABASE_SECRET_KEY/.test(listBody),
      "1g the list code builds only a user-scoped client; the secret key is not in it");
    const authSrc = fs.readFileSync(path.join(__dirname, "..", "netlify", "functions", "_lib", "auth.js"), "utf8");
    const scoped = authSrc.slice(authSrc.indexOf("function getUserScopedClient"), authSrc.indexOf("// Sprint Q (v1 policy)"));
    t.ok(/SUPABASE_ANON_KEY/.test(scoped) && !/SUPABASE_SECRET_KEY/.test(scoped) && /Authorization: `Bearer \$\{token\}`/.test(scoped),
      "1h getUserScopedClient is the publishable key plus the person's own token, never the secret key");
    const r401 = await st.fn.handler({ httpMethod: "POST", headers: {}, body: JSON.stringify({ action: "list" }) });
    t.eq(r401.statusCode, 401, "1i no token, no meetings");
  }

  // ── 2. UNKNOWN IS NOT EMPTY ────────────────────────────────────────────────────────────────────
  {
    const st = createStore();
    t.eq(await M.loadMeetingRecords(as(st, O)), [], "2a a household that has held no meeting reads as an empty list");
    st.S.fail.list = true;
    t.eq(await M.loadMeetingRecords(as(st, O)), null, "2b a database error reads as null (unknown), never as no meetings");
    st.S.fail.list = false; st.S.fail.auth = true;
    t.eq(await M.loadMeetingRecords(as(st, O)), null, "2c …as does an expired session");
    t.eq(await M.loadMeetingRecords({ getJwt: async () => null, fetchImpl: st.fetchFor() }), null, "2d …and no session at all");
    t.eq(await M.loadMeetingRecords({ getJwt: async () => "tok:x", fetchImpl: async () => { throw new Error("offline"); } }), null, "2e …and no network");
    t.eq(await M.loadMeetingRecords({ getJwt: async () => "tok:x", fetchImpl: async () => ({ ok: true, json: async () => ({ records: "nope" }) }) }), null,
      "2f …and an answer of the wrong shape");
    t.eq(await M.loadMeetingRecords({ getJwt: async () => "tok:x", fetchImpl: async () => ({ ok: true, json: async () => { throw new Error("bad json"); } }) }), null,
      "2g …and a body that is not JSON");
    const st2 = createStore();
    st2.S.members.push({ household_id: "h", user_id: O, joined_at: "2026-10-01T09:00:00Z" }, { household_id: "h", user_id: P, joined_at: "2026-10-10T09:00:00Z" });
    st2.S.rows.push({ user_id: O, met_on: "2026-10-20", answers: [] });
    st2.S.fail.members = true;
    t.eq(await M.loadMeetingRecords(as(st2, P)), null, "2h a partner's meetings whose join date cannot be read: the whole read is unknown, not shown undated");
    // The screen's rule for unknown: no opening, no questions (App.jsx MeetAgenda).
    const app = fs.readFileSync(path.join(__dirname, "..", "src", "App.jsx"), "utf8");
    t.ok(/if \(data\.demo \|\| !Array\.isArray\(data\.meetingRecords\)\) return null;\s*\n\s*try \{ return meetOpeningFor\(data\); \}/.test(app),
      "2i Meet shows no opening unless the meetings were actually read");
    t.ok(/if \(!data\.demo && !Array\.isArray\(data\.meetingRecords\)\) full\.questions = \[\];/.test(app),
      "2j …and asks no question (on screen or by the coach) while the household's no answers are unknown");
  }

  // ── 3–5. SAVE, REOPEN, A NO DOES NOT COME BACK, THE FIRST MEETING ───────────────────────────────
  {
    const st = createStore();
    const data = HOUSEHOLD();
    const first = await M.loadMeetingRecords(as(st, O));
    const open1 = snap.meetOpeningFor({ ...data, meetingRecords: first });
    t.eq(open1.lines.map(l => l.text), ["This is your first money meeting, so there is nothing to compare against yet."], "5a the first meeting opens with the first-meeting line");
    t.eq(open1.hasHistory, false, "5b …and no history");

    const agenda1 = snap.meetAgendaFor({ ...data, meetingRecords: first });
    const gym = q(agenda1, /Goodlife Gym/), netflix = q(agenda1, /Netflix/), spotify = q(agenda1, /Spotify/);
    t.ok(!!gym && !!netflix && !!spotify, "3a the first meeting asks about the new gym, Netflix's new amount and Spotify stopping");
    const answers = M.answersFor(agenda1.questions, { [gym.id]: "accepted", [netflix.id]: "dismissed" });
    t.eq(answers.length, 2, "3b only the questions they answered are recorded (Spotify left unanswered)");
    const saved = await M.saveMeetingRecord({ ...as(st, O), metOn: "2026-11-01", answers });
    t.eq(saved.ok, true, "3c the meeting is saved through /api/meeting");
    t.eq(st.S.rows.length === 1 && st.S.rows[0].user_id, O, "3d …as one row, against the person from the token");

    const later = await M.loadMeetingRecords(as(st, O));
    const open2 = snap.meetOpeningFor({ ...data, meetingRecords: later });
    t.eq(open2.lines.map(l => l.text), [
      "Last meeting: 2026-11-01.",
      "Since then, you said yes to Goodlife Gym.",
      "You said no to Netflix, so it is not being raised again.",
    ], "3e the next meeting opens with \"Last meeting:\" and what was decided");

    const agenda2 = snap.meetAgendaFor({ ...data, meetingRecords: later });
    t.ok(!q(agenda2, /Netflix/), "4a the question they said no to is not asked again");
    t.ok(!!q(agenda2, /Spotify/), "4b …while the one they left unanswered still is");
    t.ok(!/Netflix went up/.test(snap.agendaToText(agenda2)), "4c …and the coach is not given it either");

    // A meeting with nothing decided is still a meeting.
    const st3 = createStore();
    await M.saveMeetingRecord({ ...as(st3, O), metOn: "2026-11-02", answers: [] });
    t.eq(snap.meetOpeningFor({ ...data, meetingRecords: await M.loadMeetingRecords(as(st3, O)) }).lines.map(l => l.text),
      ["Last meeting: 2026-11-02.", "No decisions were recorded at that meeting."], "3f a meeting with no answers opens the next one as exactly that");
  }

  // ── 6. COUPLE MODE: THE SAME HISTORY FOR BOTH ──────────────────────────────────────────────────
  {
    const st = createStore();
    // The owner made the household on Oct 1; the partner joined Oct 10.
    st.S.members.push({ household_id: "h", user_id: O, joined_at: "2026-10-01T09:00:00Z" }, { household_id: "h", user_id: P, joined_at: "2026-10-10T09:00:00Z" });
    st.S.rows.push({ user_id: O, met_on: "2026-09-20", answers: [] });                                   // the owner alone, before the household
    st.S.rows.push({ user_id: O, met_on: "2026-10-05", answers: [{ signature: "early", domain: "bills", answer: "dismissed", subject: "Early" }] }); // after it began, before the partner joined
    st.S.rows.push({ user_id: P, met_on: "2026-10-08", answers: [] });                                   // the partner alone, before joining
    st.S.rows.push({ user_id: O, met_on: "2026-10-18", answers: [{ signature: "x1", domain: "bills", kind: "appeared", answer: "accepted", subject: "Goodlife Gym" }] });
    st.S.rows.push({ user_id: P, met_on: "2026-10-25", answers: [{ signature: "x2", domain: "bills", kind: "amount", answer: "dismissed", subject: "Netflix" }] });
    st.S.rows.push({ user_id: X, met_on: "2026-10-26", answers: [] });
    const ro = await M.loadMeetingRecords(as(st, O));
    const rp = await M.loadMeetingRecords(as(st, P));
    const shared = (list) => list.filter(r => r.metOn >= "2026-10-10").map(r => [r.metOn, r.answers]);
    t.eq(shared(ro), shared(rp), "6a both partners read the same meetings since they were both in the household");
    t.eq(rp.map(r => r.metOn), ["2026-10-25", "2026-10-18", "2026-10-08"], "6b the partner: the household's meetings, plus their own from before");
    t.ok(!rp.some(r => r.metOn === "2026-10-05"), "6c the partner is NOT shown the owner's meeting from before they joined (meeting.js leaves it out on top of 0030)");
    t.eq(ro.map(r => r.metOn), ["2026-10-25", "2026-10-18", "2026-10-05", "2026-09-20"], "6d the owner: theirs, and the partner's only since the partner joined");
    t.ok(!ro.concat(rp).some(r => r.metOn === "2026-10-26"), "6e neither sees a meeting of someone outside the household");
    const data = HOUSEHOLD();
    t.eq(snap.meetOpeningFor({ ...data, meetingRecords: ro }).lines.map(l => l.text), snap.meetOpeningFor({ ...data, meetingRecords: rp }).lines.map(l => l.text),
      "6f …so both open the next meeting the same way");
    t.eq(snap.meetOpeningFor({ ...data, meetingRecords: rp }).lines[0].text, "Last meeting: 2026-10-25.", "6g …with the household's latest meeting, whoever recorded it");
    t.eq(rp.map(r => r.mine), [true, false, true], "6h each record says whether it is the reader's own (no account id is sent)");
    t.ok(rp.every(r => !("user_id" in r)), "6i …and no account id reaches the app");
    // A former partner (no membership left) sees only their own.
    st.S.members = st.S.members.filter(m => m.user_id !== P);
    t.eq((await M.loadMeetingRecords(as(st, P))).map(r => r.metOn), ["2026-10-25", "2026-10-08"], "6j after leaving, only their own meetings");
  }

  // ── 7. A YES CHANGES THE BILLS EXACTLY ONCE ────────────────────────────────────────────────────
  {
    const data = HOUSEHOLD();
    const agenda = snap.meetAgendaFor({ ...data, meetingRecords: [] });
    const yes = (re) => M.answersFor(agenda.questions, { [q(agenda, re).id]: "accepted" });
    const names = (bills) => bills.map(b => `${b.name}:${b.amount}`).sort();

    const a1 = snap.applyMeetingAnswers(data, yes(/Goodlife Gym/));
    t.eq(names(a1.bills), ["Goodlife Gym:45", "Netflix:18.99", "Spotify:11.99"], "7a yes to a new bill adds it");
    t.eq(a1.bills.find(b => b.name === "Goodlife Gym").origin, "observed", "7b …marked as found by the bank, so its end can be asked about later");
    t.eq(snap.applyMeetingAnswers({ ...data, bills: a1.bills }, yes(/Goodlife Gym/)).applied, [], "7c the same yes again adds nothing");

    const a2 = snap.applyMeetingAnswers(data, yes(/Netflix/));
    t.eq(names(a2.bills), ["Netflix:24.99", "Spotify:11.99"], "7d yes to a changed amount updates that bill");
    t.eq(snap.applyMeetingAnswers({ ...data, bills: a2.bills }, yes(/Netflix/)).applied, [], "7e …once");

    const a3 = snap.applyMeetingAnswers(data, yes(/Spotify/));
    t.eq(names(a3.bills), ["Netflix:18.99"], "7f yes to a bill that ended removes it");
    t.eq(snap.applyMeetingAnswers({ ...data, bills: a3.bills }, yes(/Spotify/)).applied, [], "7g …once");

    const all = M.answersFor(agenda.questions, Object.fromEntries(agenda.questions.map(x => [x.id, "accepted"])));
    const once = snap.applyMeetingAnswers(data, all);
    const twice = snap.applyMeetingAnswers({ ...data, bills: once.bills }, all);
    t.eq([once.applied.length, names(once.bills)], [3, ["Goodlife Gym:45", "Netflix:24.99"]], "7h all three at once: each applied exactly once");
    t.eq([twice.applied.length, names(twice.bills)], [0, names(once.bills)], "7i marking the meeting done again (or a second device, or a replay) changes nothing more");
    const dup = snap.applyMeetingAnswers(data, [...yes(/Goodlife Gym/), ...yes(/Goodlife Gym/)]);
    t.eq(dup.bills.filter(b => b.name === "Goodlife Gym").length, 1, "7j the same yes twice in one record adds the bill once");

    const no = snap.applyMeetingAnswers(data, M.answersFor(agenda.questions, Object.fromEntries(agenda.questions.map(x => [x.id, "dismissed"]))));
    t.ok(no.bills === data.bills && no.applied.length === 0, "7k a no changes no bill");
    const stranger = snap.applyMeetingAnswers(data, [{ signature: "appeared|made up|?|999", domain: "bills", answer: "accepted" }]);
    t.ok(stranger.bills === data.bills, "7l a yes the bank does not show (a made-up or stale signature) changes nothing");
    t.ok(snap.applyMeetingAnswers({ bills: data.bills, transactions: "broken" }, all).bills === data.bills, "7m a malformed household keeps its bills");
  }

  // ── 8. A FAILED SAVE CHANGES NOTHING ───────────────────────────────────────────────────────────
  {
    const st = createStore();
    st.S.fail.record = true;
    const r = await M.saveMeetingRecord({ ...as(st, O), metOn: "2026-11-03", answers: [{ signature: "s", domain: "bills", answer: "accepted" }] });
    t.eq([r.ok, st.S.rows.length], [false, 0], "8a a save the server could not store reports failure and stores nothing");
    t.eq((await M.saveMeetingRecord({ getJwt: async () => "tok:x", fetchImpl: async () => { throw new Error("offline"); }, metOn: "2026-11-03", answers: [] })).ok, false, "8b …as does no network");
    t.eq((await M.saveMeetingRecord({ getJwt: async () => "tok:x", fetchImpl: async () => ({ ok: true, json: async () => ({ met_on: "2026-11-04", answers: [] }) }), metOn: "2026-11-03", answers: [] })).ok, false,
      "8c …and an answer for a different day");
    t.eq((await M.saveMeetingRecord({ getJwt: async () => "tok:x", fetchImpl: async () => { throw new Error("must not be called"); }, metOn: "Nov 3", answers: [] })).ok, false,
      "8d a meeting with no real date is never sent");
    // The screen's order (App.jsx MeetAgenda markDone): saved first; nothing else happens unless it said ok.
    const app = fs.readFileSync(path.join(__dirname, "..", "src", "App.jsx"), "utf8");
    const md = app.slice(app.indexOf("const markDone = async () => {"), app.indexOf("return heldToday"));
    const iSave = md.indexOf("meetingMemory.record("), iFail = md.indexOf("if (!res || !res.ok) { setSaveFailed(true)"), iApply = md.indexOf("applyMeetingAnswers(");
    const iDone = md.indexOf("lastMeetingAt: new Date().toISOString()");
    t.ok(iSave > 0 && iSave < iFail && iFail < iApply && iFail < iDone, "8e Meet saves first, stops on a failed save, and only then marks done and applies a yes");
    t.ok(/return; \}/.test(md.slice(iFail, iFail + 120)), "8f …a failed save returns before anything changes");
    t.ok(/if \(savingRef\.current\) return;/.test(md) && /savingRef\.current = true/.test(md), "8g a second tap while saving does nothing");
    t.ok(/applyMeetingAnswers\(prev \|\| \{\}, stored\)/.test(md), "8h the yes is applied to the latest bills, from what the server stored");
    // Saving the same day again keeps what was already recorded that day.
    const st2 = createStore();
    await M.saveMeetingRecord({ ...as(st2, O), metOn: "2026-11-05", answers: M.mergeAnswers([], [{ signature: "a", domain: "bills", answer: "dismissed" }]) });
    const known = await M.loadMeetingRecords(as(st2, O));
    const earlier = known.find(x => x.mine && x.metOn === "2026-11-05").answers;
    await M.saveMeetingRecord({ ...as(st2, O), metOn: "2026-11-05", answers: M.mergeAnswers(earlier, [{ signature: "b", domain: "bills", answer: "accepted" }]) });
    t.eq(st2.S.rows[0].answers.map(a => a.signature).sort(), ["a", "b"], "8i a second save the same day adds to that day's record rather than erasing it");
    t.eq(M.withRecord(null, { metOn: "2026-11-05", answers: [] }), null, "8j a save while the history is unknown leaves it unknown");
    t.eq(M.withRecord([{ metOn: "2026-11-05", mine: true, answers: [1] }, { metOn: "2026-11-05", mine: false, answers: [2] }], { metOn: "2026-11-05", answers: [3] }).map(r => r.answers[0]),
      [3, 2], "8k a saved record replaces this person's own for that day, never the partner's");
  }

  // ── 9. NEVER IN A SAVED BLOB ───────────────────────────────────────────────────────────────────
  {
    const P_ = await import("../src/lib/persistence.js");
    const recs = [{ metOn: "2026-11-01", mine: true, answers: [] }];
    const blob = P_.buildDbBlob({ onboarded: true, appData: { ...HOUSEHOLD(), meetingRecords: recs } }, { userId: O, nowIso: "2026-11-08T00:00:00Z" });
    t.ok(!("meetingRecords" in blob.core.appData), "9a buildDbBlob (user_data) drops meetingRecords even if it reached appData");
    t.ok(Array.isArray(blob.core.appData.bills), "9b …and keeps everything else");
    const app = fs.readFileSync(path.join(__dirname, "..", "src", "App.jsx"), "utf8");
    t.ok(/const slimAppData = ad \? withoutRenderOnly\(/.test(app), "9c the household blob drops it too");
    t.ok(/appData: withoutRenderOnly\(patch\.appData\)/.test(app), "9d …and this device's storage");
    t.ok(/const dataWithHousehold=\{\.\.\.appData,isPremium,householdRole,bankStatus,meetingRecords\};/.test(app), "9e the records are handed to the screens beside appData (render only)");
    t.eq((app.match(/setMeetingRecords\(/g) || []).length, 1, "9f one setter writes them, and it is not setAppData");
    t.ok(!/setAppData\([^;]{0,200}meetingRecords/.test(app), "9g no setAppData call carries meetingRecords");
  }

  // ── 10. ONLY WORDS THAT ALREADY EXISTED ────────────────────────────────────────────────────────
  {
    const app = fs.readFileSync(path.join(__dirname, "..", "src", "App.jsx"), "utf8");
    const qCard = app.slice(app.indexOf('data-meet="questions"'), app.indexOf("{data.demo ? (", app.indexOf('data-meet="questions"')));
    t.ok(qCard.length > 100 && !/>[A-Za-z][^<{]*</.test(qCard.replace(/\{[^}]*\}/g, "")), "10a the questions card has no heading and no words of its own: the question and its Yes / No labels come from the agenda");
    const oCard = app.slice(app.indexOf('data-meet="opening"'), app.indexOf('data-tour="meet"'));
    t.ok(oCard.length > 50 && /\{l\.text\}/.test(oCard) && !/>[A-Za-z][^<{]*</.test(oCard.replace(/\{[^}]*\}/g, "")), "10b the opening card prints only meetingRecord.js's lines");
    t.eq((app.match(/That didn't save\. Please try again in a moment\./g) || []).length, 3, "10c the failed-save line is the one the tester card already used");
  }

  t.summary("MEETING MEMORY");
})();
