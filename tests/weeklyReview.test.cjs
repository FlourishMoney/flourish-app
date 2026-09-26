// tests/weeklyReview.test.cjs
// -----------------------------------------------------------------------------
// THE MONEY MEETING HAD NOTHING TO SAY, AND IT WAS NOT THE HOUSEHOLD'S FAULT.
//
// meetingAgenda.js has always had a "wins" section fed by snapshot.safeSpend.dailyLog and a
// "changes" section fed by snapshot.behaviorDeltas. buildMeetSnapshot set neither, so both were
// dead: every household, on every week, opened Meet to "Nothing stood out this week." The week
// could have been their best in a year and the meeting would have said the same thing.
//
// weeklyReview.js is the half that was missing. It looks BACKWARDS, which nothing else in the app
// does, so these are the tests for what "the week just gone" and "usual" actually mean.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const t = create();

// A local date string N days before `now` — the shape Plaid and the statement importer produce.
const NOW = new Date(2026, 8, 26, 11, 0, 0);      // Sat 26 Sep 2026, local
const ago = (n) => { const d = new Date(NOW); d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const tx = (daysAgo, cat, amount, name = "Shop") => ({ id: `${daysAgo}-${cat}-${amount}`, date: ago(daysAgo), cat, amount, name });

(async () => {
  const { daysWithinPace, categoryPaceDeltas, isDiscretionarySpend } = await import("../src/lib/weeklyReview.js");
  const { meetAgendaFor } = await import("../src/lib/meetSnapshot.js");
  const { agendaNumbers, everyItemHasSource } = await import("../src/lib/meetingAgenda.js");
  const demo = await import("../src/lib/demoFixture.js");

  // ── 1. The week is the seven COMPLETE days before today ──────────────────────────────────────
  {
    const log = daysWithinPace({ transactions: [tx(0, "Shopping", 500), tx(1, "Shopping", 10)], dailyPace: 100, now: NOW });
    t.eq(log.length, 7, "1a seven days are reported");
    t.eq(log.map(d => d.date), [ago(7), ago(6), ago(5), ago(4), ago(3), ago(2), ago(1)], "1b oldest first, ending yesterday");
    t.ok(!log.some(d => d.date === ago(0)), "1c today is never one of them: it is only half lived");
    t.eq(log.filter(d => d.withinSafe).length, 7, "1d …so today's $500 cannot make yesterday a bad day");
  }

  // ── 2. A day is within pace when it comes in at or under the figure the app shows ────────────
  {
    const log = daysWithinPace({ transactions: [tx(2, "Shopping", 101), tx(3, "Shopping", 100), tx(4, "Shopping", 99)], dailyPace: 100, now: NOW });
    const by = Object.fromEntries(log.map(d => [d.date, d]));
    const day = (n) => by[ago(n)] || { withinSafe: "(day missing)", spent: "(day missing)" };
    t.eq(day(2).withinSafe, false, "2a a day over the pace is not within it");
    t.eq(day(3).withinSafe, true, "2b exactly the pace is within it, not over");
    t.eq(day(4).withinSafe, true, "2c under the pace is within it");
    t.eq(day(2).spent, 101, "2d each day carries what was actually spent");
    // Two purchases on one day are one day's spending, not two days of half the pace.
    const two = daysWithinPace({ transactions: [tx(2, "Shopping", 60), tx(2, "Groceries", 60)], dailyPace: 100, now: NOW });
    t.eq((two.find(d => d.date === ago(2)) || {}).withinSafe, false, "2e a day's purchases are added together before the comparison");
  }

  // ── 3. What counts as spending against a daily pace ──────────────────────────────────────────
  {
    t.eq(isDiscretionarySpend(tx(1, "Groceries", 40)), true, "3a groceries count");
    t.eq(isDiscretionarySpend(tx(1, "Utilities", 95)), false, "3b a bill does not: safe-to-spend already reserved it");
    t.eq(isDiscretionarySpend(tx(1, "Income", 2840)), false, "3c income is not spending");
    t.eq(isDiscretionarySpend({ date: ago(1), cat: "Shopping", amount: -120, name: "Refund" }), false, "3d money coming in is not spending");
    t.eq(isDiscretionarySpend({ date: ago(1), cat: "Shopping", amount: 20, name: "Shop", pending: true }), false, "3e a pending charge has not happened yet");
    // Rent leaving on rent day must never mark rent day a failure.
    const rentDay = daysWithinPace({ transactions: [tx(3, "Rent", 1650, "Rent"), tx(3, "Groceries", 20)], dailyPace: 100, now: NOW });
    t.eq((rentDay.find(d => d.date === ago(3)) || {}).withinSafe, true, "3f …so the day the rent leaves is still a day within pace");
  }

  // ── 4. Silence is not evidence ───────────────────────────────────────────────────────────────
  {
    t.eq(daysWithinPace({ transactions: [], dailyPace: 100, now: NOW }), [],
      "4a a household with no transactions is NOT congratulated for seven perfect days");
    t.eq(daysWithinPace({ transactions: [tx(20, "Shopping", 10)], dailyPace: 100, now: NOW }), [],
      "4b …nor is one whose only history is older than the week");
    t.eq(daysWithinPace({ transactions: [tx(1, "Shopping", 10)], dailyPace: 0, now: NOW }), [],
      "4c with no pace to judge against, no day is judged");
    t.eq(daysWithinPace({ transactions: [tx(0, "Shopping", 10)], dailyPace: 100, now: NOW }), [],
      "4d today's purchase is not evidence about the week before it either");
  }

  // ── 5. A bare date belongs to its own local day ──────────────────────────────────────────────
  // "2026-09-25" through new Date() is UTC midnight, which is the evening of the 24th anywhere west
  // of Greenwich. Parsed that way every transaction slides into the previous day's bucket and the
  // seventh day of the week falls off the end.
  {
    const log = daysWithinPace({ transactions: [tx(7, "Shopping", 500)], dailyPace: 100, now: NOW });
    const oldest = log[0] || { date: "(no days)", withinSafe: "(no days)" };
    t.eq(log.length, 7, "5a the oldest day of the week is still in the window");
    t.eq(oldest.date, ago(7), "5b …and it is day seven");
    t.eq(oldest.withinSafe, false, "5c …carrying its own spending, not the day before's");
    // Read as UTC, a bare date slides a day earlier and day seven's $500 falls out of the window,
    // leaving a day that looks spotless because its spending went missing.
    t.eq(log.filter(d => d.withinSafe).length, 6, "5d …so exactly six of the seven days are clean, not all seven");
  }

  // ── 6. "Usual" is the four weeks behind this one ─────────────────────────────────────────────
  {
    const txns = [
      tx(2, "Dining", 20), tx(5, "Dining", 10),                    // this week: 30
      tx(9, "Dining", 100), tx(16, "Dining", 80), tx(23, "Dining", 60),  // three baseline weeks: 240
      tx(9, "Petrol", 50),                                          // one baseline week only
    ];
    const d = categoryPaceDeltas({ transactions: txns, now: NOW });
    const dining = d.find(x => x.category === "Dining") || { thisWeek: null, normal: null, delta: null };
    t.ok(d.some(x => x.category === "Dining"), "6a a category seen in three baseline weeks has a usual pace");
    t.eq(dining.thisWeek, 30, "6b this week is the seven days just gone");
    t.eq(dining.normal, 80, "6c usual = 240 over the THREE weeks the household has history for, not four");
    t.eq(dining.delta, -50, "6d delta is this week minus usual, negative when the week came in under");
    t.ok(!d.some(x => x.category === "Petrol"),
      "6e a category seen in only one baseline week has no usual pace, so it is not reported");
  }

  // ── 7. The biggest difference is first, and direction is preserved ───────────────────────────
  {
    const txns = [
      tx(2, "Dining", 200), tx(9, "Dining", 50), tx(16, "Dining", 50),      // +150
      tx(2, "Books", 0.5), tx(9, "Books", 10), tx(16, "Books", 10),          // -9.5
      tx(3, "Travel", 5), tx(10, "Travel", 60), tx(17, "Travel", 60),        // -55
    ];
    const d = categoryPaceDeltas({ transactions: txns, now: NOW });
    t.eq(d.map(x => x.category), ["Dining", "Travel", "Books"], "7a sorted by how big the difference is, not by its sign");
    t.ok((d[0] || {}).delta > 0, "7b a week above usual reads positive");
    t.ok((d[1] || {}).delta < 0, "7c …and a week below usual reads negative");
  }

  // ── 8. The demo household's week now has something in it ─────────────────────────────────────
  // This is what the App Store screenshot shows, so it is pinned: exactly one win and one change,
  // both traceable, neither invented by the assembler.
  {
    const now = new Date();
    const data = {
      profile: demo.demoProfileFor("CA"), incomes: demo.buildDemoIncomes(now, "CA"),
      bills: demo.buildDemoBills(now, "CA"), debts: demo.demoDebtsFor("CA"),
      accounts: demo.demoAccountsFor("CA"), transactions: demo.buildDemoTxns(now, "CA"),
      bankConnected: true, demo: true,
    };
    const agenda = meetAgendaFor(data);
    // Read through a default rather than an index: a regression that empties either section must
    // FAIL these assertions by name, not throw before the runner has printed any of them.
    const win = agenda.wins[0] || { text: "(no win)", value: null };
    const change = agenda.changes[0] || { text: "(no change)", value: null };
    t.eq(agenda.wins.length, 1, "8a the demo week opens on exactly one win");
    t.ok(/^You stayed within safe-to-spend \d+ of 7 days\.$/.test(win.text),
      `8b …the day count, over the seven days just gone (got: "${win.text}")`);
    t.eq(agenda.changes.length, 1, "8c …and exactly one change");
    t.ok(/^Coffee & Dining ran \$\d+\.\d\d below your usual pace\.$/.test(change.text),
      `8d …the household cooked at home this week (got: "${change.text}")`);
    t.ok(change.value < 0, "8e the change is recorded as below, not above");
    t.ok(everyItemHasSource(agenda), "8f every item on the demo agenda names where it came from");
    t.ok(agendaNumbers(agenda).length >= 2, "8g the win and the change both carry a traceable number");
    t.eq(JSON.stringify(meetAgendaFor(data)), JSON.stringify(agenda), "8h and the demo agenda is deterministic");
  }

  // ── 9. A household with no history still gets a meeting, and no invented items ───────────────
  {
    const bare = meetAgendaFor({ transactions: [], accounts: [], bills: [], debts: [], profile: { country: "CA" } });
    t.eq(bare.wins.length, 0, "9a no transactions, no win");
    t.eq(bare.changes.length, 0, "9b no transactions, no change");
  }

  t.summary("weeklyReview.test");
})();
