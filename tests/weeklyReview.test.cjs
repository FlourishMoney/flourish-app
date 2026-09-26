// tests/weeklyReview.test.cjs
// -----------------------------------------------------------------------------
// THE MONEY MEETING HAD NOTHING TO SAY, AND IT WAS NOT THE HOUSEHOLD'S FAULT.
//
// meetingAgenda.js has always had a "wins" section and a "changes" section, and nothing ever filled
// either: buildMeetSnapshot set neither field, and no engine produced either shape. Every household
// opened Meet to "Nothing stood out this week" however their week had gone.
//
// weeklyReview.js is the half that was missing, and it is the only place in this app that looks
// BACKWARDS. These are the tests for what "the week just gone" and "usual" mean, and for the two
// bars that stop the app congratulating somebody on data it does not have.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const path = require("path");
const { execFileSync } = require("child_process");
const { pathToFileURL } = require("url");
const t = create();

// A local date string N days before `now` — the shape Plaid and the statement importer produce.
const NOW = new Date(2026, 8, 26, 11, 0, 0);      // Sat 26 Sep 2026, local
const ago = (n) => { const d = new Date(NOW); d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
let _seq = 0;
const tx = (daysAgo, cat, amount, name = "Shop") => ({ id: `t${++_seq}`, date: ago(daysAgo), cat, amount, name });
// Three separate days of spending in the week just gone, which is the evidence bar. Every fixture
// that expects an answer has to clear it, so it is built once here rather than sprinkled about.
const evidence = (cat = "Groceries", each = 1) => [tx(2, cat, each), tx(4, cat, each), tx(6, cat, each)];
// Four weeks of ordinary history behind the week just gone. TWO spending days in each of the four
// baseline weeks is what makes them count: one charge five weeks old is not four weeks of history,
// and treating it as such let a single $900 sofa speak for a month. `weeks` stops the history short
// where a fixture needs a household that has been here two weeks rather than five.
const history = (weeks = 4) => [[8, 9], [15, 16], [22, 23], [29, 30]].slice(0, weeks)
  .flat().map(n => tx(n, "Petrol", 1));

(async () => {
  const { weekVersusUsual, categoryPaceDeltas, isDiscretionarySpend } = await import("../src/lib/weeklyReview.js");
  const { meetAgendaFor, withWeekAhead, agendaIsEmpty, agendaToText } = await import("../src/lib/meetSnapshot.js");
  const { everyItemHasSource, agendaNumbers } = await import("../src/lib/meetingAgenda.js");
  const demo = await import("../src/lib/demoFixture.js");
  const cats = (txns) => categoryPaceDeltas({ transactions: txns, now: NOW });
  const catOf = (txns, name) => cats(txns).find(x => x.category === name) || { thisWeek: null, normal: null, delta: null };

  // ── 1. The week is the seven COMPLETE days before today ──────────────────────────────────────
  {
    const txns = [...history(), ...evidence("Dining", 10), tx(0, "Dining", 500), tx(8, "Dining", 10), tx(15, "Dining", 10), tx(22, "Dining", 10)];
    const d = catOf(txns, "Dining");
    t.eq(d.thisWeek, 30, "1a this week is the seven days just gone: 3 x $10");
    t.ok(d.thisWeek !== 530, "1b today's $500 is not part of it: today is only half lived");
    const wk = weekVersusUsual({ transactions: txns, now: NOW });
    t.eq(wk && wk.thisWeek, 30, "1c the week total leaves today out too");
  }

  // ── 2. What counts as spending ───────────────────────────────────────────────────────────────
  {
    t.eq(isDiscretionarySpend(tx(1, "Groceries", 40)), true, "2a groceries count");
    t.eq(isDiscretionarySpend(tx(1, "Utilities", 95)), false, "2b a bill does not: safe-to-spend already reserved it");
    t.eq(isDiscretionarySpend(tx(1, "Income", 2840)), false, "2c income is not spending");
    t.eq(isDiscretionarySpend(tx(1, "Fees", 45)), false, "2d an NSF fee is not a choice the household made");
    t.eq(isDiscretionarySpend(tx(1, "Transfer", 300)), false, "2e moving your own money is not spending");
    t.eq(isDiscretionarySpend({ date: ago(1), cat: "Shopping", amount: -120, name: "Refund" }), false, "2f money coming in is not spending");
    t.eq(isDiscretionarySpend({ date: ago(1), cat: "Shopping", amount: 20, name: "Shop", pending: true }), false, "2g a pending charge has not happened yet");
    // The exclusions have to hold through the totals, not only through the predicate.
    const base = [...history(), ...evidence("Groceries", 10)];
    const plain = weekVersusUsual({ transactions: base, now: NOW });
    const noisy = weekVersusUsual({ transactions: [...base, tx(3, "Fees", 45), tx(3, "Transfer", 300), tx(3, "Rent", 1650, "Rent")], now: NOW });
    t.eq(noisy && noisy.thisWeek, plain && plain.thisWeek, "2h fees, transfers and rent change the week total by nothing");
  }

  // ── 3. Silence is not evidence ───────────────────────────────────────────────────────────────
  // A bank connected on Thursday, or a week paid for on another card, looks exactly like a frugal
  // week. Both of these used to produce "you spent $220 less than usual".
  {
    const rich = [...history(), tx(9, "Dining", 200), tx(16, "Dining", 200), tx(23, "Dining", 200), tx(30, "Dining", 200)];
    t.eq(weekVersusUsual({ transactions: [...rich, tx(3, "Dining", 6)], now: NOW }), null,
      "3a one purchase in the week is not a week: no total is reported");
    t.eq(cats([...rich, tx(3, "Dining", 6)]).length, 0, "3b …and no category is reported either");
    t.eq(weekVersusUsual({ transactions: [...rich, tx(2, "Dining", 2), tx(4, "Dining", 2)], now: NOW }), null,
      "3c two days is still not enough");
    t.ok(weekVersusUsual({ transactions: [...rich, tx(2, "Dining", 2), tx(4, "Dining", 2), tx(6, "Dining", 2)], now: NOW }) !== null,
      "3d three separate days of spending is the bar, and it is met");
    t.eq(weekVersusUsual({ transactions: [], now: NOW }), null, "3e no transactions at all, nothing to say");
    // Three purchases and three DAYS are different things. A Saturday of errands is one day of
    // evidence about a week, however many receipts it produced.
    t.eq(weekVersusUsual({ transactions: [...rich, tx(3, "Dining", 20), tx(3, "Groceries", 21), tx(3, "Shopping", 22)], now: NOW }), null,
      "3j three purchases on one day is one day, not three, whatever they were for");
    // …and the other side: a full week with only a fortnight of history behind it.
    t.eq(weekVersusUsual({ transactions: [...history(2), ...evidence("Dining", 10)], now: NOW }), null,
      "3f two weeks of history is not a 'usual' to compare against");
    t.ok(weekVersusUsual({ transactions: [...history(3), ...evidence("Dining", 10)], now: NOW }) !== null,
      "3g three weeks of it is");
    // The bar is weeks the household SPENT in, not the age of its oldest row. One charge five weeks
    // back used to unlock a "usual" of a quarter of itself.
    t.eq(weekVersusUsual({ transactions: [tx(35, "Shopping", 900), ...evidence("Dining", 3)], now: NOW }), null,
      "3h one $900 charge thirty-five days ago is not four weeks of history");
    t.eq(weekVersusUsual({ transactions: [...history(), tx(29, "Dining", 400), tx(30, "Dining", 400),
      tx(2, "Dining", 0.01), tx(4, "Dining", 0.01), tx(6, "Dining", 0.01)], now: NOW }), null,
      "3i three one-cent taps are not three days of spending: the week was paid for elsewhere");
    // ENOUGH of the window, not just its far edge. Anchoring on the oldest qualifying week alone let
    // one week five weeks back put three unexamined empty weeks into the divisor.
    t.eq(weekVersusUsual({ transactions: [tx(35, "Shopping", 900), tx(34, "Dining", 1.2), ...evidence("Dining", 3)], now: NOW }), null,
      "3k a sofa and a coffee five weeks ago is one week of history, not four");
    t.eq(weekVersusUsual({ transactions: [tx(32, "Dining", 100), tx(33, "Dining", 100), tx(34, "Dining", 100), tx(35, "Dining", 100),
      tx(1, "Dining", 100), tx(2, "Dining", 100), tx(3, "Dining", 100), tx(4, "Dining", 100)], now: NOW }), null,
      "3l …and one ordinary week five weeks back does not make an identical week now look $300 over");
    // The away week still works: three weeks of real spending, the fourth empty INSIDE the window.
    const awayOk = weekVersusUsual({ transactions: [tx(8, "Dining", 100), tx(9, "Dining", 100), tx(15, "Dining", 100),
      tx(16, "Dining", 100), tx(29, "Dining", 100), tx(30, "Dining", 100), ...evidence("Dining", 20)], now: NOW });
    t.eq(awayOk && awayOk.normal, 150, "3m three anchoring weeks and one empty one is four covered weeks");
  }

  // ── 4. "Usual" divides by the weeks of HISTORY, not by the weeks that had a purchase ──────────
  // Counting only weeks with spend silently drops the week the household was away, which inflates
  // "usual" and can invert the verdict.
  {
    // $200 of Dining in weeks 2, 3 and 5; week 4 the household was abroad and bought nothing at all.
    // Week 5 still anchors the window, so week 4 sits INSIDE it and is a real zero.
    const txns = [tx(8, "Petrol", 1), tx(9, "Dining", 200), tx(15, "Petrol", 1), tx(16, "Dining", 200),
                  tx(29, "Petrol", 1), tx(30, "Dining", 200), ...evidence("Dining", 53.34)];
    const d = catOf(txns, "Dining");
    t.eq(d.normal, 150, "4a usual = $600 over FOUR covered weeks, including the empty one");
    t.eq(d.delta, 10.02, "4b …so a $160 week reads as over usual, which is what happened");
    t.ok(d.delta > 0, "4c …and not as $40 under, which is what dropping the quiet week produced");
    // …and the mirror image: money from a week too old to be covered must not be in the numerator
    // either. Moving one lump across the window edge used to swing the verdict by hundreds.
    // Week 5 here holds nothing but the lump, so it does not anchor the window and is not covered.
    // Its money must be out of the NUMERATOR too: it used to be summed while being left out of the
    // divisor, so moving the lump seven days swung the verdict by hundreds and produced an agenda
    // that congratulated the week and warned about it at once.
    const wk = (n) => weekVersusUsual({ transactions: [...history(3), ...evidence("Dining", 53.34), tx(n, "Shopping", 2000)], now: NOW });
    t.eq(JSON.stringify(wk(29)), JSON.stringify(wk(36)),
      "4d a lump in an uncovered week counts for nothing, whichever side of the edge it sits");
    t.ok((wk(29) || {}).normal < 100, `4e …and it is not in "usual" either (got ${JSON.stringify(wk(29))})`);
  }

  // ── 5. The covered window is four weeks, and its far edge is day 35 ───────────────────────────
  {
    const withDay35 = [...history(), ...evidence("Dining", 10), tx(9, "Dining", 100), tx(16, "Dining", 100), tx(35, "Dining", 100)];
    const d = catOf(withDay35, "Dining");
    t.eq(d.normal, 75, "5a day 35 is inside the window: $300 over four covered weeks");
    t.eq(cats([...history(), ...evidence("Dining", 10), tx(9, "Dining", 100), tx(16, "Dining", 100), tx(36, "Dining", 100)])
      .find(x => x.category === "Dining"), undefined,
      "5b day 36 is outside it, so Dining is left with two weeks and no usual pace");
  }

  // ── 6. Day 7 belongs to the week just gone, day 8 to the first baseline week ──────────────────
  {
    const txns = [...history(), tx(2, "Dining", 5), tx(4, "Dining", 5), tx(7, "Dining", 90),
                  tx(9, "Dining", 40), tx(16, "Dining", 40), tx(23, "Dining", 40)];
    const d = catOf(txns, "Dining");
    t.eq(d.thisWeek, 100, "6a day 7 is counted in this week");
    t.eq(d.normal, 30, "6b …and not in the baseline, which is $120 over four weeks");
    const shifted = [...history(), ...evidence("Dining", 5), tx(8, "Dining", 90), tx(15, "Dining", 40), tx(22, "Dining", 40)];
    t.eq(catOf(shifted, "Dining").normal, 42.5, "6c day 8 is the first baseline day: $170 over four weeks");
    // The baseline weeks are [8..14], [15..21], [22..28], [29..35]. Days 8 and 14 are the SAME week;
    // an off-by-one in the binning (floor(ago/7)+1 rather than ceil) splits them, and a category
    // bought on three days inside two weeks then passes the three-week habit rule it should fail.
    const twoWeeks = [...history(), ...evidence("Dining", 5), tx(8, "Dining", 40), tx(14, "Dining", 40), tx(21, "Dining", 40)];
    t.eq(cats(twoWeeks).find(x => x.category === "Dining"), undefined,
      "6d days 8, 14 and 21 fall in two baseline weeks, not three, so Dining has no usual pace");
  }

  // ── 7. Two purchases are two purchases, not a usual pace ─────────────────────────────────────
  // A laptop one week and a sofa the next made "usual" $1,200 of Shopping, and the household was
  // congratulated for coming $1,050 under it on the week they bought a shirt.
  {
    const lumpy = [...history(), ...evidence("Shopping", 50), tx(9, "Shopping", 1200), tx(16, "Shopping", 1200)];
    t.eq(cats(lumpy).find(x => x.category === "Shopping"), undefined,
      "7a a category seen in two baseline weeks has no usual pace");
    const habit = [...history(), ...evidence("Shopping", 50), tx(9, "Shopping", 1200), tx(16, "Shopping", 1200), tx(23, "Shopping", 1200)];
    t.ok(cats(habit).some(x => x.category === "Shopping"), "7b three separate weeks is a habit, and does get one");
    t.eq(catOf(habit, "Shopping").normal, 900, "7c …divided by the four weeks covered, not by the three that had it");
  }

  // ── 8. Ordering, direction and stability ─────────────────────────────────────────────────────
  {
    const txns = [...history(),
      tx(2, "Dining", 200), tx(4, "Books", 1), tx(6, "Travel", 5),
      tx(9, "Dining", 50), tx(16, "Dining", 50), tx(23, "Dining", 50),
      tx(9, "Books", 10), tx(16, "Books", 10), tx(23, "Books", 10),
      tx(10, "Travel", 60), tx(17, "Travel", 60), tx(24, "Travel", 60)];
    const d = cats(txns);
    t.eq(d.map(x => x.category).slice(0, 3), ["Dining", "Travel", "Books"], "8a biggest difference first, whichever way it goes");
    t.ok((d[0] || {}).delta > 0, "8b a week above usual reads positive");
    t.ok((d[1] || {}).delta < 0, "8c …and a week below usual reads negative");
    t.eq(JSON.stringify(cats(txns)), JSON.stringify(d), "8d the same transactions give the same answer");
    t.eq(JSON.stringify(txns.map(x => x.id)), JSON.stringify([...txns].map(x => x.id)), "8e …and the caller's array is not reordered");
  }

  // ── 9. The demo household's week, which is what the store screenshot shows ───────────────────
  {
    const now = new Date();
    const data = {
      profile: demo.demoProfileFor("CA"), incomes: demo.buildDemoIncomes(now, "CA"),
      bills: demo.buildDemoBills(now, "CA"), debts: demo.demoDebtsFor("CA"),
      accounts: demo.demoAccountsFor("CA"), transactions: demo.buildDemoTxns(now, "CA"),
      bankConnected: true, demo: true,
    };
    const agenda = meetAgendaFor(data);
    const win = agenda.wins[0] || { text: "(no win)", value: null };
    t.eq(agenda.wins.length, 1, "9a the demo week opens on exactly one win");
    t.eq(win.text, "Your spending came in $53.45 under a usual week.", "9b …the week against a usual one");
    t.eq(agenda.changes.map(c => c.text), [
      "Coffee & Dining ran $57.54 below your usual pace.",
      "Groceries ran $47.65 above your usual pace.",
    ], "9c …and two changes, one each way, so the meeting is not only good news");
    t.ok(win.value < 0, "9d the win is recorded as under, not over");
    t.ok(everyItemHasSource(agenda), "9e every item on the demo agenda names where it came from");
    t.eq(JSON.stringify(meetAgendaFor(data)), JSON.stringify(agenda), "9f and the demo agenda is deterministic");
  }

  // ── 10. The same demo, read from four timezones ──────────────────────────────────────────────
  // The fixture used to stamp its transactions with toISOString() (UTC) while this file buckets by
  // LOCAL day, so east of Greenwich in the early morning every row shifted back a day and the demo
  // household's change fell under the threshold. A visitor in Sydney at 2am saw a different app.
  {
    const root = path.resolve(__dirname, "..");
    const url = (p) => pathToFileURL(path.join(root, p)).href;
    const script = `(async () => {
      const d = await import(${JSON.stringify(url("src/lib/demoFixture.js"))});
      const m = await import(${JSON.stringify(url("src/lib/meetSnapshot.js"))});
      const now = new Date();
      const a = m.meetAgendaFor({ profile: d.demoProfileFor("CA"), incomes: d.buildDemoIncomes(now, "CA"),
        bills: d.buildDemoBills(now, "CA"), debts: d.demoDebtsFor("CA"), accounts: d.demoAccountsFor("CA"),
        transactions: d.buildDemoTxns(now, "CA"), bankConnected: true, demo: true });
      process.stdout.write(JSON.stringify([...a.wins, ...a.changes].map(x => x.text)));
    })()`;
    const read = (tz) => execFileSync(process.execPath, ["-e", script],
      { env: { ...process.env, TZ: tz }, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    const seen = new Set(["Australia/Sydney", "Pacific/Auckland", "America/Los_Angeles", "Europe/London"].map(read));
    t.eq(seen.size, 1, `10a the demo agenda is the same in Sydney, Auckland, Los Angeles and London (got ${seen.size} versions)`);
    t.ok([...seen][0].includes("Coffee & Dining ran $57.54 below"), `10b …and it is the published one (${[...seen][0].slice(0, 70)})`);
  }

  // ── 11. What is coming is not only for a quiet week ──────────────────────────────────────────
  // quietWeekAgendaFor was a SUBSTITUTE for an empty agenda. Now that wins and changes fill, a
  // household whose week had something in it would have lost the rent due on Thursday and the
  // number they came for.
  {
    const now = new Date();
    const data = {
      profile: demo.demoProfileFor("CA"), incomes: demo.buildDemoIncomes(now, "CA"),
      bills: demo.buildDemoBills(now, "CA"), debts: demo.demoDebtsFor("CA"),
      accounts: demo.demoAccountsFor("CA"), transactions: demo.buildDemoTxns(now, "CA"),
    };
    const full = meetAgendaFor(data);
    t.eq(agendaIsEmpty(full), false, "11a the demo agenda is not empty, so the quiet-week substitute never runs");
    const merged = withWeekAhead(full, data) || {};
    t.ok(/^Safe until next payday: \$/.test(((merged.progress || [])[0] || {}).text || ""),
      "11b the safe-to-spend figure leads the meeting's progress, not trails the health score");
    t.ok((merged.upcoming || []).length > 0, "11c …and so is what falls due in the week ahead");
    t.ok(everyItemHasSource(merged), "11d both carry their source");
    const text = agendaToText(merged);
    [...(merged.upcoming || []), ...(merged.progress || [])].forEach(i =>
      t.ok(text.includes(i.text), `11e the facilitator is sent them too: "${i.text.slice(0, 32)}"`));
    // Nothing is added twice, and an agenda that already names what is coming is left alone.
    t.eq(JSON.stringify(withWeekAhead(merged, data)), JSON.stringify(merged), "11f adding them again changes nothing");
    t.ok(withWeekAhead(merged, data) === merged, "11f2 …and it hands back the very object it was given");
    const quiet = { wins: [], changes: [], risks: [], progress: [], decisions: [], questions: [], quiet: true };
    t.eq(withWeekAhead(quiet, data), quiet, "11g a quiet-week agenda already carries them and is returned untouched");

    // The household with an overdraft warning is the one most likely to want the safe number, and a
    // single early return on `risks` was denying it to exactly them: a risk is not a safe-to-spend
    // figure, so the two halves are decided separately.
    // The agenda carries a progress line of its own, so "first" is a real position rather than the
    // only one: pushed onto the end instead of the front, the number the household came for sits
    // below the health score and this reads as if nothing were wrong.
    const risky = withWeekAhead({ ...full,
      risks: [{ text: "Fri 2: Low balance.", value: 12, source: "forecastEngine" }],
      progress: [{ text: "Health score 66.", value: 66, source: "healthScore" }] }, data);
    t.ok(/^Safe until next payday: \$/.test(((risky.progress || [])[0] || {}).text || ""),
      "11h an agenda that already warns about a risk still gets its safe-to-spend line, first");
    t.eq((risky.upcoming || []).length, 0, "11i …and is not also given a week-ahead list it does not need");
    t.eq((risky.progress || []).map(p => p.text.slice(0, 12)), ["Safe until n", "Health score"],
      "11i2 …above the progress lines the agenda already had, not below them");

    // Nothing falling due in the next seven days leaves `upcoming` empty, so a guard that read it
    // would prepend the safe-to-spend line again on every call.
    const bare = { wins: [], changes: [], risks: [], progress: [], decisions: [], questions: [] };
    const noUpcoming = { ...data, bills: [] };
    const once = withWeekAhead(bare, noUpcoming);
    const twice = withWeekAhead(once, noUpcoming);
    t.eq((twice.progress || []).filter(x => /^Safe until next payday/.test(x.text)).length, 1,
      "11j the safe-to-spend line is added once, however many times it is asked for");
  }

  // ── 12. The two provenance guards cover every section, including what is coming ──────────────
  // `upcoming` carries dollar values, agendaToText sends them to the coach and the Meet screen
  // renders them, and both guards walked past the section entirely.
  {
    const bad = { wins: [], changes: [], risks: [], progress: [], decisions: [], questions: [],
                  upcoming: [{ text: "Thu 1: Rent $99,999.99 out.", value: 99999.99 }] };
    t.eq(everyItemHasSource(bad), false, "12a an upcoming item with no source fails the provenance guard");
    t.eq(agendaNumbers(bad), [99999.99], "12b …and its figure is one of the numbers that must trace to an engine");
    const good = { ...bad, upcoming: [{ ...bad.upcoming[0], source: "forecastEngine" }] };
    t.eq(everyItemHasSource(good), true, "12c …with a source it passes");
    // The guard must be capable of saying no at all: replacing its body with `return true` used to
    // leave the whole suite green.
    t.eq(everyItemHasSource({ wins: [{ text: "x" }] }), false, "12d the guard fails a sourceless win");
    t.eq(everyItemHasSource({ changes: [{ text: "x" }] }), false, "12e …a sourceless change");
    t.eq(everyItemHasSource({ risks: [{ text: "x" }] }), false, "12f …a sourceless risk");
    t.eq(everyItemHasSource({ progress: [{ text: "x" }] }), false, "12g …and a sourceless progress line");
  }

  t.summary("weeklyReview.test");
})();
