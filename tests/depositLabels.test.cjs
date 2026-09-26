// tests/depositLabels.test.cjs
// -----------------------------------------------------------------------------
// Every projected deposit is named after the income entry that generated it.
//
// The forecast rows (Today's Time Machine, the Financial Timeline, Watch's day-by-day list) said
// "+$560 deposit" because the engine summed each day's income into one number and kept no source.
// ForecastEngine now records, per day, the income entries it credited (ev.deposits), and
// depositLines(ev) turns them into "+$560 Canada Child Benefit" / "+$2,840 Full-time Job".
// "deposit" is the fallback only when the entry has no name or the event carries no sources.
//
// The name must come from the entry that produced the deposit, never from matching amounts: the
// "same amount, different sources" cases below would label the wrong income if it did.
//
// Frozen dates only.
// -----------------------------------------------------------------------------
"use strict";

const fs = require("fs");
const path = require("path");
const { create } = require("./_runner.cjs");

(async () => {
  const { depositLines, paydayLineAmount } = await import("../src/lib/forecastView.js");
  const { forecastWalk } = await import("../src/lib/forecastWalk.js");
  const { ForecastEngine } = await import("../src/lib/forecastEngine.js");
  const { DEMO_INCOMES, buildDemoIncomes, buildDemoTxns, buildDemoBills, demoAccountsFor } = await import("../src/lib/demoFixture.js");
  const t = create();

  const chq = (b) => ([{ id: "chq", name: "Chequing", type: "depository", subtype: "checking", balance: b }]);
  const TODAY = new Date(2026, 2, 10, 12, 0, 0); // Mar 10 2026
  const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const text = (ev) => depositLines(ev).map(l => `+${l.amount} ${l.label}`);

  // ── 1. A named source: the row carries the income entry's own name ─────────────────────────────
  {
    const data = {
      accounts: chq(1000),
      incomes: [
        { id: 1, label: "Full-time Job", amount: "2840", freq: "biweekly", type: "employment" },
        { id: 2, label: "Canada Child Benefit", amount: "560", freq: "monthly", type: "ccb", anchorDay: 20 },
      ],
      bills: [], debts: [], transactions: [],
    };
    const { forecast } = ForecastEngine.generate(data, 30, null, TODAY);
    const ccbDay = forecast.find(e => e.isPayday && ymd(e.date) === "2026-03-20");
    t.ok(!!ccbDay, "the CCB lands on the 20th");
    t.eq(text(ccbDay), ["+560 Canada Child Benefit"], "the CCB day reads \"+$560 Canada Child Benefit\", not \"+$560 deposit\"");
    t.eq(depositLines(ccbDay)[0].named, true, "the CCB line is marked as named");
    const payDay = forecast.find(e => e.isPayday && e.income === 2840);
    t.eq(text(payDay), ["+2840 Full-time Job"], "a paycheque day reads \"+$2,840 Full-time Job\"");
    t.eq(payDay.deposits.map(d => d.incomeId), [1], "the engine records WHICH entry it credited (id 1)");
    for (const ev of forecast.filter(e => e.isPayday)) {
      t.eq(depositLines(ev).reduce((s, l) => s + l.amount, 0), paydayLineAmount(ev),
           `${ymd(ev.date)}: the named lines add up to exactly what the forecast credited`);
    }
    t.eq(forecast[0].deposits, [], "day 0 credits nothing, so it carries no deposits either");
  }

  // ── 2. Two sources on the same day: two lines, each named after its own entry ────────────────────
  {
    // No transactions -> both biweekly incomes fall back to today+14 / +28 and co-land.
    const data = {
      accounts: chq(1000),
      incomes: [
        { id: 1, label: "Full-time Job", amount: "2000", freq: "biweekly" },
        { id: 2, label: "Weekend shifts", amount: "600", freq: "biweekly" },
      ],
      bills: [], debts: [], transactions: [],
    };
    const { forecast } = ForecastEngine.generate(data, 20, null, TODAY);
    const ev = forecast.find(e => e.isPayday);
    t.eq(ev.income, 2600, "the two deposits still sum to $2,600 in the balance walk");
    t.eq(text(ev), ["+2000 Full-time Job", "+600 Weekend shifts"], "two same-day deposits are two named lines, in profile order");

    const w = forecastWalk({ opening: forecast[ev.day - 1].balance, income: ev.income, deposits: depositLines(ev),
                             bills: ev.bills, avgDailySpend: 0, closing: ev.balance });
    t.eq(w.rows.filter(r => r.key === "income").map(r => `${r.label} ${r.value}`),
         ["Full-time Job $2,000.00", "Weekend shifts $600.00"], "the drill-down shows one named row per source");
    t.eq(w.incomeCents, 260000, "the drill-down's income total is unchanged");
    t.ok(w.reconciles, "the drill-down equation still adds up exactly");
  }

  // ── 3. Same amount, different sources: the name follows the entry, never the amount ─────────────
  {
    const data = {
      accounts: chq(1000),
      incomes: [
        { id: 7, label: "Rental income", amount: "500", freq: "monthly", anchorDay: 15 },
        { id: 8, label: "Canada Child Benefit", amount: "500", freq: "monthly", anchorDay: 20 },
      ],
      bills: [], debts: [], transactions: [],
    };
    const { forecast } = ForecastEngine.generate(data, 30, null, TODAY);
    const on = (iso) => forecast.find(e => ymd(e.date) === iso);
    t.eq(text(on("2026-03-15")), ["+500 Rental income"], "the 15th is the rental income");
    t.eq(text(on("2026-03-20")), ["+500 Canada Child Benefit"], "the 20th is the CCB, though the amount is identical");
    // Reversing the profile order must not swap the names (an amount lookup would take the first $500).
    const rev = ForecastEngine.generate({ ...data, incomes: [...data.incomes].reverse() }, 30, null, TODAY).forecast;
    t.eq(text(rev.find(e => ymd(e.date) === "2026-03-15")), ["+500 Rental income"], "order-independent: the 15th stays Rental income");
    t.eq(text(rev.find(e => ymd(e.date) === "2026-03-20")), ["+500 Canada Child Benefit"], "order-independent: the 20th stays the CCB");
  }

  // ── 4. Fallback: "deposit" only when no source name exists ───────────────────────────────────────
  {
    const data = {
      accounts: chq(1000),
      incomes: [
        { id: 1, label: "", amount: "1500", freq: "monthly", anchorDay: 12 },
        { id: 2, label: "   ", amount: "300", freq: "monthly", anchorDay: 14 },
        { id: 3, amount: "200", freq: "monthly", anchorDay: 16 },
        { id: 4, label: "Full-time Job", amount: "2000", freq: "monthly", anchorDay: 18 },
        { id: 5, label: "", amount: "250", freq: "monthly", anchorDay: 18 },
      ],
      bills: [], debts: [], transactions: [],
    };
    const { forecast } = ForecastEngine.generate(data, 30, null, TODAY);
    const on = (iso) => forecast.find(e => ymd(e.date) === iso);
    t.eq(text(on("2026-03-12")), ["+1500 deposit"], "an empty name falls back to \"deposit\"");
    t.eq(text(on("2026-03-14")), ["+300 deposit"], "a whitespace-only name falls back to \"deposit\"");
    t.eq(text(on("2026-03-16")), ["+200 deposit"], "an entry with no label field falls back to \"deposit\"");
    t.eq(text(on("2026-03-18")), ["+2000 Full-time Job", "+250 deposit"], "a named and an unnamed deposit on one day: only the unnamed one says \"deposit\"");
    t.eq(depositLines(on("2026-03-12"))[0].named, false, "a fallback line is marked unnamed");

    // Events that carry no sources (or sources that do not add up) keep one summed "deposit" line.
    t.eq(text({ income: 900 }), ["+900 deposit"], "an event with no deposits field -> one \"deposit\" line with the total");
    t.eq(text({ income: 900, deposits: [] }), ["+900 deposit"], "an empty deposits list -> one \"deposit\" line");
    t.eq(text({ income: 900, deposits: [{ label: "Job", amount: 800 }] }), ["+900 deposit"],
         "sources that do not add up to the credited income are not shown; the total is, as \"deposit\"");
    t.eq(depositLines({ income: 0, deposits: [{ label: "Job", amount: 800 }] }), [], "a zero-income day has no deposit lines");
    t.eq(depositLines(null), [], "a null event has no deposit lines");

    const w = forecastWalk({ opening: 100, income: 900, deposits: depositLines({ income: 900 }), bills: [], closing: 950 });
    t.eq(w.rows.filter(r => r.key === "income").map(r => r.label), ["Deposit"], "the drill-down fallback row reads \"Deposit\"");
    const w2 = forecastWalk({ opening: 100, income: 900, bills: [], closing: 950 });
    t.eq(w2.rows.filter(r => r.key === "income").map(r => r.label), ["Deposit"], "a caller that passes no deposits keeps the single \"Deposit\" row");
  }

  // ── 5. The Canadian demo: the CCB row inside Watch's 30 days is named ─────────────────────────────
  {
    const now = new Date(2026, 8, 25, 12, 0, 0);
    const data = { accounts: demoAccountsFor("CA"), incomes: buildDemoIncomes(now, "CA"), bills: buildDemoBills(now, "CA"),
                   transactions: buildDemoTxns(now, "CA"), debts: [] };
    const { forecast } = ForecastEngine.generate(data, 30, null, now);
    const lines = forecast.filter(e => e.isPayday).flatMap(e => depositLines(e));
    t.ok(lines.some(l => l.label === "Canada Child Benefit" && l.amount === 560), "the demo forecast shows \"+$560 Canada Child Benefit\" within 30 days");
    t.ok(lines.some(l => l.label === "Full-time Job" && l.amount === 2840), "the demo forecast shows \"+$2,840 Full-time Job\" within 30 days");
    t.ok(lines.every(l => l.named), "every demo deposit is named (no \"deposit\" fallback in the demo)");
    t.eq(DEMO_INCOMES.map(i => i.label), ["Full-time Job", "Canada Child Benefit"], "sanity: the demo's two income entries");
  }

  // ── 6. Wiring: every forecast row that prints a projected deposit names its source ───────────────
  {
    const app = fs.readFileSync(path.join(__dirname, "../src/App.jsx"), "utf8");
    t.ok(!/formatMoney\((?:ev|day)\.income(?:\|\|0)?\)\}? ?deposit/.test(app), "no forecast row prints a summed \"+$X deposit\" any more");
    t.eq((app.match(/depositLines\((?:ev|day)\)\.map\(/g) || []).length, 4,
         "Time Machine row, Financial Timeline row and drill-down, and Watch row all render depositLines()");
    t.eq((app.match(/deposits: (?:ev\.isPayday \? )?depositLines\((?:ev|day)\)/g) || []).length, 2,
         "both cash-flow drill-downs (Time Machine and Watch) pass the named lines to forecastWalk");
    t.ok(/income: f\.income, deposits: f\.deposits/.test(app), "the Watch list keeps the engine's deposits on each day");
  }

  t.summary("depositLabels.test");
})();
