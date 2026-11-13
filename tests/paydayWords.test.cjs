// tests/paydayWords.test.cjs — MATH-LOCK
// -----------------------------------------------------------------------------
// "UNTIL YOUR NEXT PAYDAY": THE WORDS AND THE DATE MATCH THE WINDOW SAFE TO SPEND USES (2026-11-13).
//
// Since PR #138 safe to spend counts what is due up to the next MAIN payday (forecastEdits.js nextMainPaydayFor),
// not the next deposit of any size. Nine places still said "your next deposit", and two of them (the money meeting
// and the demo's sample coach) also quoted a DATE that was the next deposit of any size: with a $560 benefit on
// Nov 20 and the paycheque on Nov 26, the meeting said "spare before Nov 20" for a figure worked out to Nov 26.
//
// The words below are the approved ones, word for word. Four lines state a fact about the next deposit itself and
// stay as they were (section 5).
//
//   1  Today and the term sheet (App.jsx): the six approved lines
//   2  Money Plan's alert (decisionEngine.js)
//   3  the money meeting: the date is the next main payday; "until your next payday" when there is no date
//   4  the demo's sample coach: the date is the next main payday, and the approved sentences
//   5  the four lines about the next deposit itself are unchanged
// -----------------------------------------------------------------------------
"use strict";
const fs = require("fs"), path = require("path");
const { create } = require("./_runner.cjs");

(async () => {
  const t = create();
  const REPO = path.join(__dirname, "..");
  const read = (p) => fs.readFileSync(path.join(REPO, p), "utf8");
  const APP = read("src/App.jsx");
  // Comments blanked, so a comment that quotes the old words cannot satisfy or trip a check.
  const code = (src) => src.replace(/\{?\/\*[\s\S]*?\*\/\}?/g, (m) => m.replace(/[^\n]/g, " ")).replace(/(?<!:)\/\/[^\n]*/g, (m) => " ".repeat(m.length));

  const fe = await import("../src/lib/forecastEdits.js");
  const { SafeSpendEngine } = await import("../src/lib/safeSpendEngine.js");
  const { meetAgendaFor } = await import("../src/lib/meetSnapshot.js");
  const DC = await import("../src/lib/demoCoach.js");
  const DE = await import("../src/lib/decisionEngine.js");
  const D = await import("../src/lib/demoFixture.js");
  const { localeTag } = await import("../src/lib/locale.js");

  const at = (y, m, d) => new Date(y, m - 1, d, 10);
  const today = at(2026, 11, 13);               // Friday
  const iso = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d, 12); };
  // The two modules' own date formats, applied to a date this file names: only the DAY is under test.
  const meetDay = (s) => iso(s).toLocaleDateString("en-CA", { month: "short", day: "numeric" });
  const coachDay = (s, country = "CA") => iso(s).toLocaleDateString(localeTag(country), { month: "short", day: "numeric" });

  const cash = (bal) => [{ id: "a1", type: "depository", subtype: "checking", balance: bal }];
  const JOB = { id: 1, label: "Job", amount: "2400", freq: "biweekly", type: "employment", nextPayDate: "2026-11-26" };
  const JOB2 = { id: 3, label: "Second job", amount: "2200", freq: "biweekly", type: "employment", nextPayDate: "2026-11-20" };
  const CCB = { id: 2, label: "Canada Child Benefit", amount: "560", freq: "monthly", type: "ccb", anchorDay: 20 };
  const RENT = { id: "b1", name: "Rent", amount: "1800", date: "23", freq: "monthly", nextDueDate: "2026-11-23" };
  const VISA = { id: "d1", name: "Visa", balance: 2340, rate: 19.99, min: 60 };
  const house = (incomes, bal = 6000) => ({ profile: { country: "CA" }, accounts: cash(bal), incomes, bills: [RENT], debts: [VISA], goals: [], transactions: [] });
  const spareOf = (d, day = today) => (meetAgendaFor(d, day).decisions || []).find((x) => /is spare /.test(x.question || x.text || "")) || null;
  const q = (dec) => (dec ? (dec.question || dec.text || "") : "");

  // ── 1. App.jsx: the six approved lines, word for word ────────────────────────────────────────────────────────
  {
    t.ok(APP.includes(">Heads up</strong>: your bills come to more than your balance before your next payday.{setScreen&&"),
      "1a Today, the red line: \"Heads up: your bills come to more than your balance before your next payday.\"");
    t.ok(APP.includes('meaning="What is left after bills, minimum debt payments, a spending buffer and savings are counted until your next payday."'),
      "1b the sheet from the safe to spend number: \"What is left after bills, minimum debt payments, a spending buffer and savings are counted until your next payday.\"");
    t.ok(APP.includes('"Safe to spend": "Not your balance. What is left after bills, minimum debt payments, a spending buffer and savings are counted until your next payday.",'),
      "1c the term sheet: \"Not your balance. What is left after bills, minimum debt payments, a spending buffer and savings are counted until your next payday.\"");
    t.ok(APP.includes("title: `$${safeToMove} spare until your next payday`,"), "1d Decisions, the green card: \"{amount} spare until your next payday\"");
    t.ok(APP.includes('label:"Spare until your next payday", amount:formatMoney(plan.spare),'), "1e Money Plan, the spare row: \"Spare until your next payday\"");
    t.ok(APP.includes(': "Nothing is left to spend until your next payday.";'), "1f Today, the pace line when nothing is left: \"Nothing is left to spend until your next payday.\"");
    // Raw lines, skipping whole-line comments (a comment-blanking pass loses real lines of this file to "/*" inside strings).
    const old = APP.split("\n").map((l, i) => [i + 1, l]).filter(([, l]) => !/^\s*(?:\/\/|\*|\{\/\*)/.test(l) && /(?:until|before) your next deposit[.`"]|already committed before|next deposit lands\./.test(l)).map(([n]) => n);
    t.eq(old, [], "1g none of the six still says \"your next deposit\" (lines found)");
  }

  // ── 2. Money Plan's alert ─────────────────────────────────────────────────────────────────────────────────
  {
    const SRC = read("src/lib/decisionEngine.js");
    const WORDS = "Safe to spend is below 15% of your monthly income, so flourish shows $0 spare until your next payday.";
    // A household whose safe to spend is under 15% of its monthly income, with no overdraft ahead.
    const tight = house([JOB, CCB], 2500);
    const info = DE.spareUntilDeposit(tight, today);
    const plan = DE.AutopilotEngine.generate(tight, {}, today);
    t.eq([info.tight, info.spare, plan.spare], [true, 0, 0], "2a a tight household: $0 spare");
    t.eq(plan.alerts.filter((a) => a.type === "warning").map((a) => a.msg), [WORDS], `2b …and the alert says "${WORDS}"`);
    t.ok(!/nothing is spare until your next deposit/.test(code(SRC)), "2c the old sentence is gone");
  }

  // ── 3. The money meeting ──────────────────────────────────────────────────────────────────────────────────
  {
    // A benefit lands before the paycheque: the figure runs to the paycheque, so the date is the paycheque's.
    const d = house([JOB, CCB]);
    t.eq([fe.isoOf(fe.nextDepositFor(d, today).date), fe.isoOf(fe.nextMainPaydayFor(d, today).date)], ["2026-11-20", "2026-11-26"],
      "3a the household: a $560 benefit on Nov 20, the paycheque (the main payday) on Nov 26");
    const dec = spareOf(d);
    const { spare, safe } = DE.spareUntilDeposit(d, today);
    t.ok(spare > 0 && dec, "3b something is spare, and the meeting asks about it");
    t.ok(q(dec).includes(` is spare before ${meetDay("2026-11-26")}: a quarter of your `) && !q(dec).includes(meetDay("2026-11-20")),
      `3c the question says "spare before ${meetDay("2026-11-26")}", the paycheque, not ${meetDay("2026-11-20")}, the benefit (got: ${q(dec).slice(0, 60)})`);
    t.eq(dec && dec.explain && dec.explain.title, `Spare before ${meetDay("2026-11-26")}`, "3d …and so does the title of its working");
    // The date is the last day of the window the figure was worked out over.
    const ss = SafeSpendEngine.calculate(d, today);
    t.eq([fe.daysToNextMainPaydayFor(d, today), Math.round(safe) > 0, ss.safeAmount > 0], [13, true, true], "3e …13 days out, the same window safe to spend uses");

    // No benefit entered: the same date, as before.
    const solo = spareOf(house([JOB]));
    t.ok(q(solo).includes(` is spare before ${meetDay("2026-11-26")}: `), "3f with only the paycheque: Nov 26, as before");

    // Two earners with similar pay: both are main paydays, so the date is whichever comes first.
    const two = spareOf(house([JOB, JOB2]));
    t.ok(q(two).includes(` is spare before ${meetDay("2026-11-20")}: `), "3g two earners with similar pay: the sooner one, Nov 20");

    // A weekly side job never moves the date.
    const side = spareOf(house([JOB, { id: 4, label: "Side job", amount: "150", freq: "weekly", type: "employment", nextPayDate: "2026-11-16" }]));
    t.ok(q(side).includes(` is spare before ${meetDay("2026-11-26")}: `), "3h a $150 weekly side job on Nov 16: still Nov 26");

    // A household that moved its paycheque: the date moves with it.
    const occ = fe.incomeOccurrences(d, today, 30).find((o) => o.label === "Job");
    const moved = { ...d, forecastEdits: fe.editOccurrence(d.forecastEdits, occ, "one", { date: "2026-11-27" }) };
    t.ok(q(spareOf(moved)).includes(` is spare before ${meetDay("2026-11-27")}: `), "3i a paycheque the household moved to Nov 27: Nov 27");

    // No date known: the approved fallback.
    const none = spareOf({ ...house([]), accounts: cash(6000) });
    if (none) {
      t.ok(q(none).includes(" is spare until your next payday: a quarter of your "), "3j no income entered: \"until your next payday\"");
      t.eq(none.explain.title, "Spare until your next payday", "3k …and in the title");
    }
    const SRC = code(read("src/lib/meetSnapshot.js"));
    t.eq([(SRC.match(/"until your next payday"/g) || []).length, /until your next deposit/.test(SRC)], [2, false],
      "3l the fallback is \"until your next payday\" in the question and the title, and \"until your next deposit\" is gone");
    t.ok(!/isPayday/.test(SRC.slice(SRC.indexOf("let periodEnd"), SRC.indexOf("snap.decisions = [{"))),
      "3m the date no longer comes from the forecast's first deposit of any size");
  }

  // ── 4. The demo's sample coach ────────────────────────────────────────────────────────────────────────────
  {
    const d = house([JOB, CCB]);
    const insight = DC.demoCheckInInsight(d, today);
    t.ok(typeof insight === "string" && insight.includes(` is safe to spend until your next payday on ${coachDay("2026-11-26")}. It starts from `),
      `4a the sample insight: "… is safe to spend until your next payday on ${coachDay("2026-11-26")}." (got: ${String(insight).slice(0, 70)})`);
    const ex = DC.demoCoachExchanges(d, today);
    t.ok(ex[0].a.endsWith(` That's what's safe to spend until your next payday on ${coachDay("2026-11-26")}.`),
      `4b the first answer ends "That's what's safe to spend until your next payday on ${coachDay("2026-11-26")}."`);
    const pace = ex.find((e) => /a pace, not a limit/.test(e.a));
    t.ok(pace && pace.a.includes("It's a pace, not a limit. Safe to spend is the amount left until your next payday. This shows it per day. The pace always uses at least 14 days, even when a deposit is closer."),
      "4c the pace answer: \"Safe to spend is the amount left until your next payday. This shows it per day.\"");
    // The answer about the next deposit itself still names the next deposit of any size.
    const next = ex.find((e) => e.a.includes("your Canada Child Benefit"));
    t.ok(next && next.a.startsWith(`$560 on ${coachDay("2026-11-20")}, your Canada Child Benefit, 7 days away.`), "4d the next deposit answer is still the benefit: $560 on Nov 20, 7 days away");

    const all = [insight, ...ex.map((e) => e.a)].join(" ");
    t.ok(!/until your next deposit|is the total until|spreads it across/.test(all), "4e no answer still says \"until your next deposit\"");

    // The real demo households, on the day they are made and for six weeks after: the date is the main payday.
    for (const c of ["CA", "US"]) {
      const made = at(2026, 11, 13);
      const demo = { demo: true, profile: D.demoProfileFor(c), accounts: D.demoAccountsFor(c), debts: D.demoDebtsFor(c, made), incomes: D.buildDemoIncomes(made, c),
        bills: D.buildDemoBills(made, c), transactions: D.buildDemoTxns(made, c), goals: [] };
      let wrong = 0, seen = 0, differs = 0, first = null;
      for (let i = 0; i < 42; i++) {
        const day = new Date(2026, 10, 13 + i, 10);
        const main = fe.nextMainPaydayFor(demo, day), any = fe.nextDepositFor(demo, day);
        const text = DC.demoCheckInInsight(demo, day);
        if (!main || text == null) continue;
        seen++;
        if (fe.isoOf(main.date) !== fe.isoOf(any.date)) differs++;
        const want = ` until your next payday on ${coachDay(fe.isoOf(main.date), c)}.`;
        if (!text.includes(want)) { wrong++; if (!first) first = [fe.isoOf(day), want, text.slice(0, 80)]; }
      }
      t.eq([wrong, first], [0, null], `4f ${c} demo: the insight names the main payday's date on each of ${seen} days (a smaller deposit came first on ${differs} of them)`);
      t.ok(seen >= 30 && (c !== "CA" || differs > 0), `4g ${c} demo: the sweep really ran${c === "CA" ? ", and included days when the benefit comes first" : ""}`);
    }
  }

  // ── 5. Four lines state a fact about the next deposit itself: unchanged ────────────────────────────────────────
  {
    t.ok(APP.includes("`Your next deposit is ${daysToPayday === 1 ? \"tomorrow\" : `in ${daysToPayday} days`}.`"), "5a Decisions: \"Your next deposit is in N days.\"");
    t.ok(APP.includes("`Before your next deposit, your balance is lowest on ${fmtD(low.date)}, at ${formatMoney(low.balance)}. The deposit lands on ${fmtD(pay.date)}.`"),
      "5b the forecast: \"Before your next deposit, your balance is lowest on …\"");
    t.ok(APP.includes(': "after your next deposit";'), "5c Can I afford this: \"after your next deposit\"");
    t.ok(APP.includes("Your next deposit lands ${waitMsg}.`"), "5d …and \"Your next deposit lands …\"");
  }

  t.summary("paydayWords");
})().catch((e) => { console.error(e); process.exit(1); });
