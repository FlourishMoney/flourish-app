// tests/watchRangeSummary.test.cjs
// -----------------------------------------------------------------------------
// WATCH: WHAT THE SELECTED RANGE ADDS UP TO (watch-meet-fixes, item 1).
//
// Watch showed one headline figure, "Starting balance", the same at 7, 30 and 90 days, so the range
// looked broken. lib/watchRange.js adds up the selected range from the same forecast array as the
// day list. Checked here on both demos at 7, 30 and 90 days:
//   the identity  start + money in - bills - everyday spending = balance on the last day, to the cent;
//   the figures   differ between ranges;
//   the lowest    balance matches the day list and the overdraft card.
// MATH-LOCK, hand-worked: $1,000 in chequing, no pay, no spending, $1,500 rent due on day 20.
//   7 days:  $1,000 + $0 - $0 - $0 = $1,000; lowest $1,000, today. The card names day 20, no figure.
// demo-fixes B3: the summary shows every check-line figure to the cent, and 2a2 reads them back off
// the rendered screen and adds them up.
//   30 days: $1,000 + $0 - $1,500 - $0 = -$500; lowest -$500 on day 20, and the card quotes -$500.
//   with a $20.00 daily spend of your own, 7 days: $1,000 - 7 x $20 = $860.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");
const { loadApp, textOf, describe, REPO } = require("./_renderApp.cjs");

const APP = fs.readFileSync(path.join(REPO, "src", "App.jsx"), "utf8");

(async () => {
  const t = create();
  const { ForecastEngine } = await import("../src/lib/forecastEngine.js");
  const { SafeSpendEngine } = await import("../src/lib/safeSpendEngine.js");
  const { forecastLow } = await import("../src/lib/forecastView.js");
  const { formatBalance } = await import("../src/lib/format.js");
  const W = await import("../src/lib/watchRange.js");
  const M = await import("../src/lib/meetSnapshot.js");
  const D = await import("../src/lib/demoFixture.js");
  const now = new Date();
  const demo = (c) => ({ profile: D.demoProfileFor(c), accounts: D.demoAccountsFor(c), debts: D.demoDebtsFor(c), incomes: D.buildDemoIncomes(now, c),
    bills: D.buildDemoBills(now, c), transactions: D.buildDemoTxns(now, c), bankConnected: true, demo: true });
  const summaryOf = (data, r, today = now) => {
    const g = ForecastEngine.generate(data, Math.max(r, 30), null, today);
    return { g, s: W.rangeSummary(g.forecast, r, { avgDailySpend: g.avgDailySpend }) };
  };

  // ── 1a. The identity, on both demos at 7, 30 and 90 days ─────────────────────────────────────
  t.eq(W.WATCH_RANGES, [7, 30, 90], "1a0 the ranges are 7, 30 and 90 days");
  for (const c of D.DEMO_COUNTRIES) {
    const data = demo(c);
    const start = Math.round(SafeSpendEngine.calculate(data, now).balance * 100);
    const seen = {};
    for (const r of W.WATCH_RANGES) {
      const { g, s } = summaryOf(data, r);
      t.ok(!!s, `1a ${c} ${r}d: a summary`);
      if (!s) continue;
      seen[r] = s;
      t.eq(s.startCents + s.inCents - s.billsCents - s.spendCents, s.endCents, `1b ${c} ${r}d: ${s.check.line}`);
      t.eq(s.startCents, start, `1c ${c} ${r}d: it starts from the balance Watch's headline shows (to the cent)`);
      t.eq([s.days, s.endDay, s.endCents], [r + 1, r, Math.round(g.forecast[r].balance * 100)], `1d ${c} ${r}d: it ends on forecast day ${r}, the list's last day, at that day's balance`);
      t.ok(Math.abs(s.spendCents - s.spendEstimateCents) <= 2, `1e ${c} ${r}d: everyday spending is the daily figure x ${s.spendDays} days, within 2 cents (${s.spendCents} vs ${s.spendEstimateCents})`);
      const win = W.rangeWindow(g.forecast, r);
      t.eq(s.lowCents, Math.round(Math.min(...win.map(f => f.balance)) * 100), `1f ${c} ${r}d: the lowest balance is the lowest day in the list's own window`);
      t.eq(s.text.end, formatBalance(g.forecast[r].balance), `1g ${c} ${r}d: the last day reads as the list prints it (${s.text.end})`);
      t.eq(s.deposits.reduce((a, d) => a + d.cents, 0), s.inCents, `1h ${c} ${r}d: the money-in lines add up to the total`);
      t.eq(s.bills.reduce((a, d) => a + d.cents, 0), s.billsCents, `1i ${c} ${r}d: the bill lines add up to the total`);
    }
    // ── 1j. Every range-wide figure changes with the range ─────────────────────────────────────
    for (const k of ["endCents", "inCents", "billsCents", "spendCents"]) {
      const v = W.WATCH_RANGES.map(r => seen[r] && seen[r][k]);
      t.eq(new Set(v).size, 3, `1j ${c}: ${k.replace("Cents", "")} differs at 7, 30 and 90 days (${v.join(", ")})`);
    }
    // The lowest balance can only stay or fall as the range grows, and it does not move when the low
    // day is inside both ranges: on the demos the low is day 12, inside 30 and 90.
    t.ok(seen[7].lowCents >= seen[30].lowCents && seen[30].lowCents >= seen[90].lowCents, `1k ${c}: the lowest balance never rises with a longer range`);
    t.ok(seen[7].lowCents !== seen[30].lowCents, `1l ${c}: the lowest balance differs between 7 and 30 days (${seen[7].text.low}, ${seen[30].text.low})`);
  }

  // ── 1m. MATH-LOCK, hand-worked ──────────────────────────────────────────────────────────────
  const T = new Date("2026-10-01T12:00:00");
  const due = new Date(T); due.setDate(due.getDate() + 20);
  const rent = { accounts: [{ id: "a1", name: "Chequing", type: "depository", subtype: "checking", balance: 1000 }], incomes: [], transactions: [], debts: [],
    bills: [{ id: "b1", name: "Rent", amount: "1500", freq: "monthly", date: String(due.getDate()) }], profile: { country: "CA" } };
  {
    const a = summaryOf(rent, 7, T).s, b = summaryOf(rent, 30, T).s;
    t.eq([a.startCents, a.inCents, a.billsCents, a.spendCents, a.endCents, a.lowCents, a.lowDay], [100000, 0, 0, 0, 100000, 100000, 0], "1m 7 days: $1,000 + $0 - $0 - $0 = $1,000, lowest $1,000 today");
    t.eq([b.startCents, b.inCents, b.billsCents, b.spendCents, b.endCents, b.lowCents, b.lowDay], [100000, 0, 150000, 0, -50000, -50000, 20], "1n 30 days: $1,000 - $1,500 rent = -$500, lowest on day 20");
    t.eq(b.check.line, "$1,000.00 + $0.00 − $1,500.00 − $0.00 = -$500.00", "1o …and the check line prints exactly that");
    const c = summaryOf({ ...rent, forecastEdits: { dailySpend: 20 } }, 7, T).s;
    t.eq([c.spendCents, c.endCents, c.check.line], [14000, 86000, "$1,000.00 + $0.00 − $0.00 − $140.00 = $860.00"], "1p with your own $20.00 a day: 7 x $20 = $140, and $860 on day 7");
  }

  // ── 2. Rendered Watch: the summary, the list and the overdraft card agree ──────────────────────
  let A = {};
  try { A = loadApp(["PlanAhead"]); } catch (e) { t.ok(false, `App.jsx bundles: ${describe(e)}`); }
  const watch = (data, r) => A.render(A.h(A.PlanAhead, { data, setAppData: () => {}, setScreen: () => {}, initialRange: r }));
  const listLabel = (d) => d.toLocaleDateString("en", { weekday: "short", month: "short", day: "numeric" });
  const broke = (() => { const d = demo("CA"); d.accounts = d.accounts.map(a => (a.type === "checking" || a.type === "savings") ? { ...a, balance: 0 } : a); d.demo = false; return d; })();
  for (const [name, data] of [["CA demo", demo("CA")], ["US demo", demo("US")], ["CA demo with $0 cash", broke], ["$1,000 and rent on day 20", rent]]) {
    for (const r of W.WATCH_RANGES) {
      let html = "";
      try { html = watch(data, r); } catch (e) { t.ok(false, `2 ${name} ${r}d renders: ${describe(e)}`); continue; }
      const txt = textOf(html);
      const { g, s } = summaryOf(data, r, data === rent ? new Date() : now);
      if (data === rent) continue; // rendered against today's date; the hand-worked figures are pinned in 1m to 1p
      // demo-fixes B3: the figures the check line adds up are shown to the cent, in its order.
      const endLabel = `Balance on ${s.endDate.toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric" })}`;
      const order = [`Today and the next ${r} days Starting balance, to the cent ${s.check.start}`, `Money in ${s.check.in}`, `Bills and minimum payments ${s.check.bills}`,
        `Everyday spending Estimated from your usual spending ${s.check.spend}`, `${endLabel} ${s.check.end}`, `Lowest balance ${s.text.low}`, `Check: ${s.check.line}`];
      const pos = order.map(x => txt.indexOf(x));
      t.ok(txt.includes(`Today and the next ${r} days.`) && pos.every((x, i) => x > 0 && (i === 0 || x > pos[i - 1])),
        `2a ${name} ${r}d: the summary shows start, money in, bills, spending and the last day to the cent, in the check line's order, then the lowest balance and the check line${pos.some(x => x < 0) ? ` (missing: ${order.filter((x, i) => pos[i] < 0).join(" | ")})` : ""}`);
      // The figures as displayed, read back off the screen, add up to the displayed last day exactly.
      const shown = (label) => { const i = txt.indexOf(label); const m = i < 0 ? null : /-?\$[\d,]+\.\d{2}/.exec(txt.slice(i + label.length)); return m ? Math.round(Number(m[0].replace(/[$,]/g, "")) * 100) : NaN; };
      const [st, mi, bo, es, en] = ["Starting balance, to the cent", "Money in", "Bills and minimum payments", "Estimated from your usual spending", endLabel].map(shown);
      t.eq(st + mi - bo - es, en, `2a2 ${name} ${r}d: as shown, ${s.check.start} + ${s.check.in} − ${s.check.bills} − ${s.check.spend} = ${s.check.end}, to the cent`);
      // The lowest day is on the day list, at the balance the summary quotes.
      const lowLabel = s.lowDay === 0 ? "Today ✦" : listLabel(s.low.date);
      const at = txt.indexOf(lowLabel, txt.indexOf("Day-by-Day Cash Flow"));
      t.ok(at > 0 && txt.slice(at, at + 400).includes(s.text.low), `2b ${name} ${r}d: the day list shows the lowest day (${lowLabel}) at ${s.text.low}`);
      // The overdraft card quotes the same lowest balance, or no figure when the dip is after the range.
      const card = /Projected overdraft (.*?)(?:Pick a longer range above to see it\.|The day-by-day list below shows that day, and what lands on it\.)/.exec(txt);
      if (g.willGoNegative) {
        t.ok(!!card, `2c ${name} ${r}d: the overdraft card shows`);
        const quoted = card ? (card[1].match(/-?\$[\d,]+/) || [null])[0] : null;
        if (s.lowCents < 0) t.eq(quoted, s.text.low, `2d ${name} ${r}d: the card and the summary quote one lowest balance (${s.text.low})`);
        else t.eq(quoted, null, `2d ${name} ${r}d: the dip is after the range, so the card names its day and quotes no figure`);
      } else t.ok(!card, `2c ${name} ${r}d: no overdraft, no card`);
    }
  }
  // ── 2n. Every row of the summary opens its own figure (demo-fixes C3) ────────────────────────
  // The "Starting balance, to the cent" row opened the last day's sheet. Each row now opens the sheet
  // for its own key, titled with the row's label and showing the row's figure; the starting balance's
  // sheet lists the everyday accounts, to the cent, and they add up to it.
  {
    let X = {};
    try { X = loadApp(["watchRangeRows", "watchRangeExplanation"]); } catch (e) { t.ok(false, `2n bundles: ${describe(e)}`); }
    for (const c of D.DEMO_COUNTRIES) for (const r of W.WATCH_RANGES) {
      const data = demo(c);
      const g = ForecastEngine.generate(data, Math.max(r, 30), null, now);
      const s = W.rangeSummary(g.forecast, r, { avgDailySpend: g.avgDailySpend });
      const rows = X.watchRangeRows(s);
      const ctx = { summary: s, range: r, forecast: g.forecast, avgDailySpend: g.avgDailySpend, data, watchIncome: null, canEdit: false };
      const wrong = rows.map(row => ({ row, ex: X.watchRangeExplanation(row.key, ctx) }))
        .filter(({ row, ex }) => !ex || ex.title !== row.label || ex.value !== row.figure).map(({ row, ex }) => `${row.key}: "${row.label}" ${row.figure} opened ${ex ? `"${ex.title}" ${ex.value}` : "nothing"}`);
      t.eq(wrong, [], `2n ${c} ${r}d: each of the ${rows.length} rows opens a sheet with its own label and figure`);
      const start = X.watchRangeExplanation("start", ctx);
      const listed = start.inputs.filter(i => i.label !== "Total").reduce((sum, i) => sum + Math.round(Number(i.value.replace(/[$,]/g, "")) * 100), 0);
      t.eq(listed, s.startCents, `2o ${c} ${r}d: the starting balance's sheet lists the everyday accounts, adding up to ${s.check.start}`);
    }
    const SRC = fs.readFileSync(path.join(__dirname, "..", "src", "App.jsx"), "utf8");
    const rowsSrc = SRC.slice(SRC.indexOf("function watchRangeRows("), SRC.indexOf("function watchRangeExplanation("));
    t.ok(!/\bopen:/.test(rowsSrc) && /onClick=\{\(\) => onOpen\(r\.key\)\}/.test(SRC), "2p no row is sent to another row's sheet");
  }

  // ── 2g. The label says exactly which days the range covers (watch-meet-fixes 5b) ──────────────
  // Forecast days 0..N are today and N more days, N + 1 calendar days. "The next 7 days" undercounted
  // that by one; every place Watch names a range now says "Today and the next N days", and N must be
  // the number of forecast entries in the window minus one. The last day the summary names must be
  // the window's last entry.
  const occDay = (d) => new Date(d).toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric" });
  for (const c of D.DEMO_COUNTRIES) {
    for (const r of W.WATCH_RANGES) {
      const g = ForecastEngine.generate(demo(c), Math.max(r, 30), null, now);
      const win = W.rangeWindow(g.forecast, r);
      const n = Number((/(\d+) days$/.exec(W.rangeLabel(r)) || [])[1]);
      t.eq([W.rangeLabel(r), n], [`Today and the next ${r} days`, win.length - 1], `2g ${c} ${r}d: the label's day count is the window's entries minus one (${win.length} entries)`);
      t.eq(W.rangePhrase(r), `today and the next ${r} days`, `2h ${c} ${r}d: …and the same words mid-sentence`);
      let txt = "";
      try { txt = textOf(watch(demo(c), r)); } catch (e) { t.ok(false, `2i ${c} ${r}d renders: ${describe(e)}`); continue; }
      const named = [...txt.matchAll(/[Tt]oday and the next (\d+) days/g)].map(m => Number(m[1]));
      t.ok(named.length >= 2 && named.every(x => x === win.length - 1), `2i ${c} ${r}d: every range named on Watch (heading and summary) counts ${win.length - 1} days after today (${named.join(", ")})`);
      t.ok(!/\bthe next \d+ days\b/.test(txt.replace(/[Tt]oday and the next \d+ days/g, "")) && !/\d+ days shown/.test(txt), `2j ${c} ${r}d: no range is named the old way`);
      const last = win[win.length - 1];
      t.eq((/Balance on ([A-Z][a-z]{2}, [A-Z][a-z]{2} \d{1,2}) /.exec(txt) || [])[1], occDay(last.date), `2k ${c} ${r}d: the last day named is the last entry's date (${occDay(last.date)}, day ${last.day})`);
    }
  }
  // ── 2l. Today's Time Machine names its range the same way (watch-meet-fixes 5c) ────────────────
  // It draws ForecastEngine.generate(data, 30): 31 entries, days 0 to 30. With no deposit in them it
  // said "the 30 days shown"; it now says "today and the next 30 days", through the same helper.
  {
    let TM = {};
    try { TM = loadApp(["lowStretchLine"]); } catch (e) { t.ok(false, `2l bundles: ${describe(e)}`); }
    const g = ForecastEngine.generate(rent, 30, null, T);
    const line = TM.lowStretchLine ? TM.lowStretchLine(g.forecast, g.forecast[0]) : "";
    const n = Number((/No deposit is expected in today and the next (\d+) days\.$/.exec(line) || [])[1]);
    t.eq([n, g.forecast.length - 1], [30, 30], `2l the Time Machine's day count is its forecast's entries minus one ("${line.slice(-52)}")`);
    t.ok(!/days shown/.test(line) && /No deposit is expected in \$\{rangePhrase\(Math\.max\(0, list\.length - 1\)\)\}\./.test(APP), "2m …named by rangePhrase, the helper Watch uses, never \"the 30 days shown\"");
  }
  // The hand-worked rent case, rendered on the real calendar: at 7 days the card names the day and quotes nothing.
  {
    const due2 = new Date(); due2.setDate(due2.getDate() + 20);
    const r2 = { ...rent, bills: [{ ...rent.bills[0], date: String(due2.getDate()) }] };
    const txt = textOf(watch(r2, 7));
    t.ok(/Heads up: your balance could go below zero on .*, after the range shown \(today and the next 7 days\)\./.test(txt) && txt.includes("Lowest balance $1,000 today"),
      "2e $1,000 and rent on day 20, 7 days: the card names the day after the range and quotes no figure; the summary's lowest is $1,000 today");
    const t30 = textOf(watch(r2, 30));
    t.ok(t30.includes("Heads up: your balance could dip to -$500 on") && t30.includes("Lowest balance -$500 on"), "2f …and at 30 days both say -$500");
  }

  t.summary("watchRangeSummary.test");
  setImmediate(() => process.exit(process.exitCode || 0));
})();
