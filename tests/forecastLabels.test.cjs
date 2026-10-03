// tests/forecastLabels.test.cjs
// -----------------------------------------------------------------------------
// FORECAST LABELS ARE THE HOUSEHOLD'S OWN NAMES, NEVER AN INTERNAL TAG (demo-fixes B2).
//
// An outside review reported "Full-time Job (dup)" on the Oct 29 entry, the second biweekly payday
// in the window. It did not reproduce: not in a demo built from main, not on the live site, not in
// any label the code builds (incomeOccurrences labels a deposit with the income's own trimmed
// label), and "(dup)" has never been a string in this repo's history. This pins it anyway: across
// both demos at 7, 30 and 90 days, every label the forecast hands to a screen (the engine's deposits
// and bills, the day list's lines, the day breakdown's rows, the range summary's lines, and the
// rendered Watch screen) is a name, with no "(dup)" or other internal tag, no source key, and
// nothing undefined; and every payday of an income, the second one included, carries that income's
// own name.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const { loadApp, textOf, describe } = require("./_renderApp.cjs");

// An internal tag in a label: "(dup)", "(copy)", "(tmp)" and the like; a source or occurrence key
// (income:1, bill:name:rent, expected:x, a|2026-10-29 occurrence key); a value that never resolved.
const INTERNAL = /\((dup|dupe|copy|tmp|temp|test|draft|internal|auto|clone|\d+)\)|\bdup\b|\b(income|bill|expected):|\|\d{4}-\d{2}-\d{2}|\bundefined\b|\bnull\b|\bNaN\b|\[object/i;

(async () => {
  const t = create();
  const { ForecastEngine } = await import("../src/lib/forecastEngine.js");
  const V = await import("../src/lib/forecastView.js");
  const { forecastWalk } = await import("../src/lib/forecastWalk.js");
  const W = await import("../src/lib/watchRange.js");
  const D = await import("../src/lib/demoFixture.js");
  let A = {};
  try { A = loadApp(["PlanAhead"]); } catch (e) { t.ok(false, `App.jsx bundles: ${describe(e)}`); }
  const now = new Date();
  for (const c of D.DEMO_COUNTRIES) {
    const data = { profile: D.demoProfileFor(c), accounts: D.demoAccountsFor(c), debts: D.demoDebtsFor(c), incomes: D.buildDemoIncomes(now, c),
      bills: D.buildDemoBills(now, c), transactions: D.buildDemoTxns(now, c), bankConnected: true, demo: true };
    const incomeNames = new Set(data.incomes.map(i => String(i.label).trim()));
    for (const r of W.WATCH_RANGES) {
      const g = ForecastEngine.generate(data, Math.max(r, 30), null, now);
      const win = W.rangeWindow(g.forecast, r);
      const labels = [];
      for (const f of win) {
        f.deposits.forEach(d => labels.push(d.label));
        f.bills.forEach(b => labels.push(b.name));
        V.depositLines(f).forEach(l => labels.push(l.label));
        V.billLines(f).forEach(l => labels.push(l.label));
        V.skippedLines(f).forEach(l => labels.push(l.label));
        const w = forecastWalk({ opening: 0, income: f.income, deposits: V.depositLines(f), bills: f.bills, avgDailySpend: g.avgDailySpend, closing: f.balance, isToday: f.day === 0 });
        [...(w.rows || []), ...(w.billRows || [])].forEach(row => labels.push(row.label));
      }
      const s = W.rangeSummary(g.forecast, r, { avgDailySpend: g.avgDailySpend });
      [...s.deposits, ...s.bills].forEach(l => labels.push(l.label));
      t.ok(labels.length > 5, `0 ${c} ${r}d: the scan read ${labels.length} labels`);
      t.eq([...new Set(labels.filter(l => typeof l !== "string" || !l.trim() || INTERNAL.test(l)))], [], `1 ${c} ${r}d: no forecast label carries "(dup)", an internal tag or a source key`);
      // Every payday of an income, the second and later ones included, is that income's own name.
      const pays = win.flatMap(f => f.deposits.filter(d => d.kind === "income").map(d => ({ day: f.day, label: d.label })));
      const byName = {};
      for (const p of pays) (byName[p.label] = byName[p.label] || []).push(p.day);
      t.eq(Object.keys(byName).filter(n => !incomeNames.has(n)), [], `2 ${c} ${r}d: every payday is labelled with its income's own name (${Object.entries(byName).map(([n, d]) => `${n} x${d.length}`).join(", ") || "none in range"})`);
      if (r >= 30) t.ok(Object.values(byName).some(d => d.length >= 2), `2b ${c} ${r}d: (the window holds a second payday of the same income, the case that was reported)`);
      // What the screen shows.
      let txt = "";
      try { txt = textOf(A.render(A.h(A.PlanAhead, { data, setAppData: () => {}, setScreen: () => {}, initialRange: r }))); } catch (e) { t.ok(false, `3 ${c} ${r}d renders: ${describe(e)}`); continue; }
      t.ok(!INTERNAL.test(txt), `3 ${c} ${r}d: the rendered Watch screen shows no internal tag${INTERNAL.test(txt) ? ` (found "${txt.match(INTERNAL)[0]}")` : ""}`);
    }
  }
  t.ok(INTERNAL.test("Full-time Job (dup)") && INTERNAL.test("income:1") && !INTERNAL.test("Full-time Job") && !INTERNAL.test("Canada Child Benefit"), "4 (the check catches the reported label and passes real names)");
  t.summary("forecastLabels.test");
  setImmediate(() => process.exit(process.exitCode || 0));
})();
