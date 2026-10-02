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
      t.ok(txt.includes(`The next ${r} days`) && txt.includes(`Lowest balance ${s.text.low}`) && txt.includes(`Money in ${s.text.in}`)
        && txt.includes(`Bills and minimum payments ${s.text.bills}`) && txt.includes(`Everyday spending Estimated from your usual spending ${s.text.spend}`)
        && txt.includes(`Check: ${s.check.line}`), `2a ${name} ${r}d: the summary shows the range's figures and the check line`);
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
  // The hand-worked rent case, rendered on the real calendar: at 7 days the card names the day and quotes nothing.
  {
    const due2 = new Date(); due2.setDate(due2.getDate() + 20);
    const r2 = { ...rent, bills: [{ ...rent.bills[0], date: String(due2.getDate()) }] };
    const txt = textOf(watch(r2, 7));
    t.ok(/Heads up: your balance could go below zero on .*, after the 7 days shown\./.test(txt) && txt.includes("Lowest balance $1,000 today"),
      "2e $1,000 and rent on day 20, 7 days: the card names the day after the range and quotes no figure; the summary's lowest is $1,000 today");
    const t30 = textOf(watch(r2, 30));
    t.ok(t30.includes("Heads up: your balance could dip to -$500 on") && t30.includes("Lowest balance -$500 on"), "2f …and at 30 days both say -$500");
  }

  t.summary("watchRangeSummary.test");
  setImmediate(() => process.exit(process.exitCode || 0));
})();
