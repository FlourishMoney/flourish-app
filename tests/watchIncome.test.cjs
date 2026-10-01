// tests/watchIncome.test.cjs
// -----------------------------------------------------------------------------
// WATCH'S INCOME FIGURES COME FROM primaryIncome(), NOT incomes[0] (prelaunch-copy round 2, item 2).
//
// "Pay frequency", "Est. paycheque" and the balance-bar scale used to read the first income in the list.
// Hand-worked figures, MATH-LOCK style: each expected value is written out, not computed by the code
// under test. "Pay frequency" always describes the first Est. paycheque printed under it.
//
//   A. One job, but a $560 monthly benefit was added first:
//        before (incomes[0]): Monthly, $560, bar scale 560
//        after  (primary):    Every 2 weeks, $2,840, bar scale 2840
//   B. Two jobs (a $600 weekly side job added first, a $2,400 biweekly day job) and a $560 benefit:
//        before: Weekly, $600, bar scale 600
//        after:  Every 2 weeks; two paycheques, day job $2,400 every 2 weeks then side job $600 every week;
//                bar scale 2400
//   C. No job (a $1,800 monthly pension and a $560 benefit): the pension stands in: Monthly, $1,800.
//   D. The demo household: unchanged (Every 2 weeks, $2,840, scale 2840).
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");

(async () => {
  const t = create();
  const { watchIncomeFigures } = await import("../src/lib/watchIncome.js");
  const { frequencyLabel, cadenceLabel } = await import("../src/lib/incomeReconcile.js");
  const D = await import("../src/lib/demoFixture.js");
  const TODAY = new Date("2026-09-29T12:00:00");
  const hh = (incomes) => ({ incomes, transactions: [], bills: [], accounts: [], profile: { country: "CA" } });
  const firstIncome = (data) => data.incomes[0]; // the old read, for the "before" figures

  // ── A. One job, benefit first ────────────────────────────────────────────────────────────────
  {
    const data = hh([
      { id: 1, label: "Canada Child Benefit", amount: "560", freq: "monthly", type: "ccb" },
      { id: 2, label: "Full-time Job", amount: "2840", freq: "biweekly", type: "employment" },
    ]);
    t.eq([frequencyLabel(firstIncome(data).freq), Number(firstIncome(data).amount)], ["Monthly", 560], "A0 (before: the first income said Monthly, $560)");
    const w = watchIncomeFigures(data, TODAY);
    t.eq(frequencyLabel(w.freq), "Every 2 weeks", "A1 Pay frequency is the job's: Every 2 weeks");
    t.eq(w.paycheques.map(p => p.amount), [2840], "A2 Est. paycheque is $2,840, one row");
    t.eq(w.scalePerDeposit, 2840, "A3 the bar scale uses the $2,840 paycheque");
  }

  // ── B. Two jobs ──────────────────────────────────────────────────────────────────────────────
  {
    const data = hh([
      { id: 1, label: "Weekend shifts", amount: "600", freq: "weekly", type: "employment" },
      { id: 2, label: "Day job", amount: "2400", freq: "biweekly", type: "employment" },
      { id: 3, label: "Canada Child Benefit", amount: "560", freq: "monthly", type: "ccb" },
    ]);
    t.eq([frequencyLabel(firstIncome(data).freq), Number(firstIncome(data).amount)], ["Weekly", 600], "B0 (before: Weekly, $600, the side job passed off as the paycheque)");
    const w = watchIncomeFigures(data, TODAY);
    t.eq(frequencyLabel(w.freq), "Every 2 weeks", "B1 Pay frequency is the primary job's: Every 2 weeks");
    t.eq(w.paycheques.map(p => [p.label, p.amount, cadenceLabel(p.freq)]),
      [["Day job", 2400, "every 2 weeks"], ["Weekend shifts", 600, "every week"]],
      "B2 two paycheques, the primary job first: $2,400 every 2 weeks, then $600 every week");
    t.ok(!w.paycheques.some(p => p.label === "Canada Child Benefit"), "B3 the benefit is not a paycheque");
    t.eq(w.scalePerDeposit, 2400, "B4 the bar scale uses the primary paycheque, $2,400");
  }

  // ── B2. The review's cases: frequency and paycheque come from the same income ──────────────
  {
    const w1 = watchIncomeFigures(hh([
      { id: 1, label: "Store job", amount: "1200", freq: "biweekly", type: "employment" },
      { id: 2, label: "Canada Child Benefit", amount: "1333", freq: "monthly", type: "ccb" },
    ]), TODAY);
    t.eq([frequencyLabel(w1.freq), w1.paycheques.map(p => p.amount), w1.scalePerDeposit], ["Every 2 weeks", [1200], 1333],
      "B5 a $1,200 biweekly job beside a larger $1,333 monthly benefit: Every 2 weeks over $1,200 (the bar scale still covers the $1,333)");
    const w2 = watchIncomeFigures(hh([
      { id: 1, label: "Part-time", amount: "500", freq: "biweekly", type: "employment" },
      { id: 2, label: "Consulting", amount: "4000", freq: "monthly", type: "selfemployed" },
    ]), TODAY);
    t.eq([frequencyLabel(w2.freq), w2.paycheques.map(p => [p.label, p.amount, cadenceLabel(p.freq)])],
      ["Monthly", [["Consulting", 4000, "every month"], ["Part-time", 500, "every 2 weeks"]]],
      "B6 self-employed pay counts: $4,000 every month first, then $500 every 2 weeks, under Monthly");
    const long = watchIncomeFigures(hh([{ id: 1, label: "Weekend warehouse shifts at the depot", amount: "600", freq: "weekly", type: "employment" },
      { id: 2, label: "Day job", amount: "2400", freq: "biweekly", type: "employment" }]), TODAY);
    t.eq(long.paycheques[1].label, "Weekend warehouse shifts…", "B7 a long income name is cut at a word, with an ellipsis");
  }

  // ── C. No job ────────────────────────────────────────────────────────────────────────────────
  {
    const w = watchIncomeFigures(hh([
      { id: 1, label: "CCB", amount: "560", freq: "monthly", type: "ccb" },
      { id: 2, label: "Pension", amount: "1800", freq: "monthly", type: "cpp" },
    ]), TODAY);
    t.eq([frequencyLabel(w.freq), w.paycheques.map(p => p.amount), w.scalePerDeposit], ["Monthly", [1800], 1800],
      "C1 with no job, the largest income stands in: Monthly, $1,800");
    t.eq(watchIncomeFigures(hh([]), TODAY), { freq: null, scalePerDeposit: 0, paycheques: [] }, "C2 no income at all: nothing is invented");
  }

  // ── D. The demo is unchanged ─────────────────────────────────────────────────────────────────
  {
    const demo = { incomes: D.buildDemoIncomes(TODAY, "CA"), transactions: D.buildDemoTxns(TODAY, "CA"), bills: [], accounts: [], profile: { country: "CA" } };
    const w = watchIncomeFigures(demo, TODAY);
    t.eq([frequencyLabel(w.freq), w.paycheques.map(p => p.amount), w.scalePerDeposit], ["Every 2 weeks", [2840], 2840],
      "D1 the CA demo still reads Every 2 weeks, $2,840, scale 2840 (its job is also its first income)");
  }

  // ── E. PlanAhead reads it for all three ──────────────────────────────────────────────────────
  {
    const app = fs.readFileSync(path.join(__dirname, "..", "src", "App.jsx"), "utf8");
    const plan = app.slice(app.indexOf("function PlanAhead("), app.indexOf("\n}\n", app.indexOf("function PlanAhead(")));
    t.ok(plan.length > 2000, "E0 (PlanAhead was read)");
    t.eq((plan.match(/incomes\|\|\[\]\)\[0\]/g) || []).length, 0, "E1 PlanAhead no longer reads incomes[0] anywhere");
    t.ok(/const income = watchIncome\.scalePerDeposit;/.test(plan), "E2 the bar scale reads the primary income");
    t.ok(/const _ffreq = watchIncome\.freq\|\|"biweekly";/.test(plan) && /frequencyLabel\(watchIncome\.freq\|\|"biweekly"\)/.test(plan), "E3 both Pay frequency rows read it");
    t.ok(/_fPays\.map\(\(p,i\)=>\(\{label:`Est\. \$\{payWord\(data\.profile\?\.country\)\}, \$\{p\.label\|\|`job \$\{i\+1\}`\}`, value:`\$\{formatMoney\(p\.amount\)\} \$\{cadenceLabel\(p\.freq\)\}`\}\)\)/.test(plan),
      "E4 a two-job household gets one Est. paycheque row per job, with its amount and how often it lands");
  }

  t.summary("watchIncome.test");
})();
