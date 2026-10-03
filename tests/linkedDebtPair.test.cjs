// tests/linkedDebtPair.test.cjs
// -----------------------------------------------------------------------------
// A LINKED PAIR IS ONE DEBT (demo-fixes C8).
//
// Once the household says a hand-entered debt is the same as a bank account (Yes sets
// sameAsAccountId), the debt and the account's own entries are one debt in every engine. Until it
// is answered, both stay counted and are marked "may be the same card" wherever they are listed.
//
// The household (the C7 table): Chequing +2,150.37, Savings +4,000.00, bank Visa ••1111 −1,287.42
// with its live-balance row as bank sync makes it (no rate, no minimum), and a hand-entered
// "Credit Card", 1,287.42 at 19.99% with a $40 minimum. The variant: the bank's row also has $40.
// MATH-LOCK, hand-worked, to the cent:
//   simulator, linked:   one entry: Visa ••1111, $1,287.42 (the bank's), 19.99% and $40 (the debt's)
//   simulator, unlinked: two entries, both marked: the bank's row (20% assumed, $25.75 = 2% of
//                        1,287.42 above the $25 floor) and Credit Card (19.99%, $40)
//   minimums held back:  linked $40 in both households (one minimum, the debt's, never the sum);
//                        unlinked $40, or $80 in the variant (both kept until the household answers)
//   90-day forecast minimums (due Nov 1 and Dec 1): linked $80; unlinked $80, or $160 in the variant
//   Meet's week ahead (Oct 28): linked, one $40; unlinked variant, two
//   Today's Total debt: linked $1.3k, "1 account"; unlinked $2.6k (2,574.84), "2 accounts"
//   Do tab payoff (C8d), the one payoff model (What-If's) with the tab's +$50/mo:
//     linked: Visa ••1111 $1,287.42 at 19.99%, $40 → paid off in 1y 5m (17 months, $195.55 interest)
//             against 47 months and $572.61 at the minimum: 2y 6m and $377 saved
//     unlinked, as synced: the bank's row first, 20% (assumed), $25.75 (estimated) → 1y 9m; 7y 4m, $1,265
//     unlinked variant: the bank's row, 20% (assumed), its $40 → 1y 5m; 2y 6m, $377 saved
//   Family "Min payments": linked $40/mo in both; unlinked $40, or $80 in the variant
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");
const { loadApp, textOf, describe, REPO } = require("./_renderApp.cjs");

(async () => {
  const t = create();
  const F = await import("../src/lib/financialCalculations.js");
  const DE = await import("../src/lib/decisionEngine.js");
  const M = await import("../src/lib/meetSnapshot.js");
  const D = await import("../src/lib/demoFixture.js");
  const T = new Date("2026-10-02T12:00:00");

  const household = (liveMin, at = T) => ({
    profile: D.demoProfileFor("CA"), incomes: D.buildDemoIncomes(at, "CA"), bills: D.buildDemoBills(at, "CA"), transactions: D.buildDemoTxns(at, "CA"), goals: [],
    accounts: [{ id: "c1", name: "Chequing", type: "checking", balance: 2150.37 }, { id: "s1", name: "Savings", type: "savings", balance: 4000 },
      { id: "v1", name: "Visa ••1111", type: "credit", balance: -1287.42, institution: "TD" }],
    debts: F.withDebtIds([{ name: "Visa ••1111", balance: "1287.42", rate: "", min: liveMin, fromBank: true, account_id: "v1" },
      { name: "Credit Card", balance: "1287.42", rate: "19.99", min: "40" }]),
  });
  const link = (d) => F.linkDebtToAccount(d, F.likelyDebtAccountMatches(d)[0]);
  const demo = (c) => ({ profile: D.demoProfileFor(c), accounts: D.demoAccountsFor(c), debts: D.demoDebtsFor(c), incomes: D.buildDemoIncomes(T, c),
    bills: D.buildDemoBills(T, c), transactions: D.buildDemoTxns(T, c), goals: [], bankConnected: true, demo: true });
  const H = household(""), HL = link(H), V = household("40"), VL = link(V);
  const feed = { credit: [{ account_id: "v1", name: "Visa ••1111", balance: 1287.42, apr: null, minPayment: 40 }], mortgage: [], student: [] };
  const sim = (d, L = d.liabilities) => F.buildDebtListForSimulator(d.debts, L, d).map(e => [e.name, e.balance, e.rate, Math.round(e.min * 100) / 100, e.mayBeSame || null, !!e.linked]);

  // ── 1. The debt simulator's list (C8a) ───────────────────────────────────────────────────────
  t.ok(HL.debts[1].sameAsAccountId === "v1" && !HL.debts[0].sameAsAccountId, "1 (the household said Yes: the hand-entered debt is linked to Visa ••1111)");
  t.eq(sim(HL), [["Visa ••1111", 1287.42, 19.99, 40, null, true]], "1a linked: one entry, the bank's balance with the debt's rate and minimum");
  t.eq(sim(HL, feed), [["Visa ••1111", 1287.42, 19.99, 40, null, true]], "1b linked, with the bank's liability feed: still one entry");
  t.eq(sim(VL), [["Visa ••1111", 1287.42, 19.99, 40, null, true]], "1c linked, the bank's row with its own $40: one entry, one $40 minimum");
  t.eq(sim(H), [["Visa ••1111", 1287.42, 20, 25.75, "card", false], ["Credit Card", 1287.42, 19.99, 40, "card", false]],
    "1d unlinked: both entries stay, each marked \"may be the same card\"");
  t.eq(sim(H, feed), [["Visa ••1111", 1287.42, 20, 40, "card", false], ["Credit Card", 1287.42, 19.99, 40, "card", false]], "1e unlinked, with the feed: both stay, both marked");
  // Rate and minimum come from the hand-entered debt when it has them, else the bank's.
  const bare = { ...HL, debts: [{ ...HL.debts[0], rate: "22.99", min: "55" }, { ...HL.debts[1], rate: "", min: "" }] };
  t.eq(sim(bare), [["Visa ••1111", 1287.42, 22.99, 55, null, true]], "1f a debt with no rate or minimum takes the bank row's");
  t.eq(sim(bare, { ...feed, credit: [{ ...feed.credit[0], apr: 21.5, minPayment: 50 }] }), [["Visa ••1111", 1287.42, 21.5, 50, null, true]], "1g …or, with the feed, the bank's APR and minimum");
  t.eq(sim(HL, { ...feed, credit: [{ ...feed.credit[0], apr: 24.99, minPayment: 60 }] }), [["Visa ••1111", 1287.42, 19.99, 40, null, true]], "1h the debt's own rate and minimum come first");
  // The balance is the bank's, as it is now: the live-balance row is written once, at sync, and not refreshed.
  const moved = { ...HL, accounts: HL.accounts.map(a => a.id === "v1" ? { ...a, balance: -1500 } : a) };
  t.eq(sim(moved).map(e => e[1]), [1500], "1i the balance is the bank account's now ($1,500.00), not the row written at sync");
  t.eq(sim(moved, { ...feed, credit: [{ ...feed.credit[0], balance: 1490.1 }] }).map(e => e[1]), [1490.1], "1j …or the feed's, when the bank sends one");
  // A rate entered on the linked entry is written where the entry reads it first: the hand-entered debt.
  const noRate = { ...HL, debts: [HL.debts[0], { ...HL.debts[1], rate: "" }] };
  const entry = F.buildDebtListForSimulator(noRate.debts, undefined, noRate)[0];
  t.ok(entry.rateEstimated && F.applyDebtRate(noRate.debts, entry, 18.5)[1].rate === "18.5" && F.buildDebtListForSimulator(F.applyDebtRate(noRate.debts, entry, 18.5), undefined, noRate)[0].rate === 18.5,
    "1k a rate entered on the linked entry is saved on the hand-entered debt, and used");
  // Every place that reads the list passes the household, so they all see one entry.
  const SRC = (p) => fs.readFileSync(path.join(REPO, ...p.split("/")), "utf8");
  t.ok(/buildDebtListForSimulator\(data\.debts, data\.liabilities, data\)/.test(SRC("src/App.jsx")) && /buildDebtListForSimulator\(data\.debts, data\.liabilities, data\)/.test(SRC("src/lib/decisionEngine.js"))
    && /buildDebtListForSimulator\(data\.debts, data\.liabilities, data\)/.test(SRC("src/lib/meetSnapshot.js")), "1l What-If, Decisions and Meet read the list with the household's accounts");
  const owed = (d) => DE.AutopilotEngine.generate(d, {}, T).debtsOwed.map(x => [x.name, x.balance, x.mayBeSame || null]);
  t.eq([owed(HL), owed(H)], [[["Visa ••1111", 1287.42, null]], [["Visa ••1111", 1287.42, "card"], ["Credit Card", 1287.42, "card"]]], "1m Decisions: one debt once linked; until then two, both marked");
  const now = new Date();
  const top = (d) => { const o = ((M.buildMeetSnapshot(d).decisions || [])[0] || {}).options || []; return o[0] ? `${o[0].label}: ${o[0].outcome}` : null; };
  t.eq([top(link(household("", now))), top(household("", now))], ["Visa ••1111: $1,287 owed at 19.99%", "Visa ••1111: $1,287 owed at 20%, may be the same card"],
    "1n Meet's top debt: the linked card at the debt's rate; until answered, marked");
  let A = {};
  try { A = loadApp(["debtScenarioResult", "AutopilotCard"]); } catch (e) { t.ok(false, `App.jsx bundles: ${describe(e)}`); }
  try {
    const r = A.debtScenarioResult(F.buildDebtListForSimulator(H.debts, undefined, H)[0], 100, F.buildDebtListForSimulator(H.debts, undefined, H));
    t.ok(r.debtMayBeSame === "card" && A.debtScenarioResult(F.buildDebtListForSimulator(HL.debts, undefined, HL)[0], 100, []).debtMayBeSame === null
      && /\{result\.debtMayBeSame&&<div[^>]*>May be the same \{result\.debtMayBeSame\} as another debt in your list\.<\/div>\}/.test(SRC("src/App.jsx")),
      "1o What-If: the debt it is applied to says \"May be the same card as another debt in your list\" until answered");
    const auto = (d) => textOf(A.render(A.h(A.AutopilotCard, { data: d, setScreen: () => {} })));
    t.ok((auto(household("", now)).match(/may be the same card/g) || []).length === 2 && !auto(link(household("", now))).includes("may be the same"),
      "1p Decisions lists both, marked, until answered; once linked, one and unmarked");
  } catch (e) { t.ok(false, `1o/1p render: ${describe(e)}`); }

  // ── 2. Minimum payments (C8b) ────────────────────────────────────────────────────────────────
  const { SafeSpendEngine } = await import("../src/lib/safeSpendEngine.js");
  const { ForecastEngine } = await import("../src/lib/forecastEngine.js");
  const mins = (d) => F.unbilledDebtMinimums(d.debts, d.bills).map(m => [m.debt.fromBank ? "bank row" : m.debt.name, m.amount]);
  const held = (d) => SafeSpendEngine.calculate(d, T).debtPayments;
  const ninety = (d) => F.debtMinimumDates(d, T, 90).reduce((n, m) => n + m.amount, 0);
  t.eq([mins(HL), held(HL), ninety(HL)], [[["Credit Card", 40]], 40, 80], "2a linked: one minimum, the debt's: $40 held back, $80 over 90 days (Nov 1, Dec 1)");
  t.eq([mins(VL), held(VL), ninety(VL)], [[["Credit Card", 40]], 40, 80], "2b linked, the bank's row with its own $40: still one minimum, never the sum");
  const bankOnly = { ...VL, debts: [VL.debts[0], { ...VL.debts[1], min: "" }] };
  t.eq([mins(bankOnly), held(bankOnly)], [[["bank row", 40]], 40], "2c linked, the debt with no minimum: the bank row's, once");
  t.eq([mins(H), held(H), ninety(H)], [[["Credit Card", 40]], 40, 80], "2d unlinked: the debt's $40 (the bank's row has none)");
  t.eq([mins(V), held(V), ninety(V)], [[["bank row", 40], ["Credit Card", 40]], 80, 160], "2e unlinked variant: both kept, $80 held back, until the household answers");
  // A bill that pays either one pays the pair.
  const billFor = (debtId) => ({ name: "Visa payment", amount: 40, dueDay: 1, frequency: "monthly", category: "Debt", debtId });
  t.eq([mins({ ...VL, bills: [...VL.bills, billFor("v1")] }), mins({ ...VL, bills: [...VL.bills, billFor(VL.debts[1].id)] })], [[], []],
    "2f linked: a bill that pays the bank's row or the hand-entered debt pays the pair's minimum");
  const at28 = new Date("2026-10-28T12:00:00");
  const weekAhead = (d) => (SafeSpendEngine.calculate(d, at28).minimumsDueSoon || []).map(x => `${x.name} ${x.amount}`);
  const V28 = household("40", at28);
  t.eq([weekAhead(link(V28)), weekAhead(V28)], [["Credit Card minimum payment 40"], ["Visa ••1111 minimum payment 40", "Credit Card minimum payment 40"]],
    "2g Meet's week ahead and Today's Due soon (Oct 28): linked, one $40; unlinked variant, both");
  // Linking moves nothing else. In the household as synced, every figure is identical; in the variant,
  // exactly the bank row's minimum leaves: $40 more safe to spend, $80 more on day 90.
  const figs = (d) => ({ safe: SafeSpendEngine.calculate(d, T), shown: DE.displayedSafeToSpend(d, T), spare: DE.spareUntilDeposit(d, T),
    forecast: ForecastEngine.generate(d, 90, null, T).forecast.map(f => [f.day, Math.round(f.balance * 100), Math.round(f.income * 100), Math.round(f.expenses * 100)]),
    flow: F.FinancialCalcEngine.cashFlow(d, {}, T), daily: F.FinancialCalcEngine.avgDailySpend(d), assets: F.FinancialCalcEngine.netWorth(d).assets });
  t.eq(JSON.stringify(figs(HL)), JSON.stringify(figs(H)), "2h as synced: safe to spend, the spare amount, the 90-day forecast, cash flow, daily spending and assets are identical before and after linking");
  const fv = figs(V), fvl = figs(VL), day90 = (f) => f.forecast[f.forecast.length - 1][1];
  t.eq([Math.round((fvl.safe.safeAmount - fv.safe.safeAmount) * 100), fv.safe.debtPayments - fvl.safe.debtPayments, day90(fvl) - day90(fv), JSON.stringify(fvl.flow) === JSON.stringify(fv.flow), fvl.daily === fv.daily, fvl.assets === fv.assets],
    [4000, 40, 8000, true, true, true], "2i variant: linking releases exactly the bank row's $40 (safe to spend +$40.00, day 90 +$80.00); nothing else moves");

  // ── 3. Today's Total debt tile (C8c) ─────────────────────────────────────────────────────────
  let B = {};
  try { B = loadApp(["Dashboard"]); } catch (e) { t.ok(false, `App.jsx bundles Dashboard: ${describe(e)}`); }
  const noop = () => {};
  const tile = (d) => {
    const txt = textOf(B.render(B.h(B.Dashboard, { data: d, setAppData: noop, setScreen: noop, setShowNotifs: noop, onUpgrade: noop, onWhatIf: noop })));
    const i = txt.indexOf("Total debt");
    const m = i < 0 ? null : txt.slice(i, i + 40).match(/Total debt\s*(\d+ accounts?)\s*(\$[\d.]+k)/); // the tile reads its count, then the figure
    return m ? `${m[2]} ${m[1]}` : txt.slice(i, i + 40);
  };
  try {
    const Hn = household("", now);
    t.eq([tile(link(Hn)), tile(Hn)], ["$1.3k 1 account", "$2.6k 2 accounts"], "3a Total debt: one linked card is $1.3k, \"1 account\"; unlinked, $2.6k, \"2 accounts\" (the same rows as the total)");
    const paidOff = { ...link(Hn), accounts: [...Hn.accounts, { id: "v2", name: "Rewards ••2222", type: "credit", balance: 0 }] };
    t.eq(tile(paidOff), "$1.3k 1 account", "3b a card with nothing owed adds nothing to the total and is not counted");
    const demoNow = (c) => ({ ...demo(c), incomes: D.buildDemoIncomes(now, c), bills: D.buildDemoBills(now, c), transactions: D.buildDemoTxns(now, c) });
    t.eq([tile(demoNow("CA")), tile(demoNow("US"))], ["$11.6k 2 accounts", "$22.6k 2 accounts"], "3c the demos are unchanged: CA $11.6k, US $22.6k, 2 accounts each");
  } catch (e) { t.ok(false, `3 Dashboard renders: ${describe(e)}`); }

  // ── 4. The Do tab, Family and every other debt total read the same helpers (C8d) ───────────────
  let G = {}, FM = {};
  try { G = loadApp(["Goals", "debtScenarioResult"]); } catch (e) { t.ok(false, `App.jsx bundles Goals: ${describe(e)}`); }
  try { FM = loadApp(["familyDebtMetric"]); } catch (e) { t.ok(false, `App.jsx has familyDebtMetric, Family's "Debt progress" line: ${describe(e).slice(0, 80)}`); }
  const doTab = (d) => { try { return textOf(G.render(G.h(G.Goals, { data: d, initialTab: "sim", setScreen: noop, setAppData: noop }))); } catch (e) { return `render failed: ${describe(e)}`; } };
  const has = (txt, parts) => parts.filter(p => !txt.includes(p));
  const Hn = household("", now), Vn = household("40", now);
  t.eq(has(doTab(link(Hn)), ["Visa ••1111", "$1,287.42", "19.99% interest · $40/mo minimum", "1y 5m", "Time saved 2y 6m", "Interest saved $377", "All Debts (1)", "Visa ••1111 $1,287.42 · 19.99%"]), [],
    "4a Do tab, linked: one debt, the bank's balance at the debt's 19.99% and $40; paid off in 1y 5m with +$50, 2y 6m and $377 saved");
  t.ok(!doTab(link(Hn)).includes("Credit Card") && !doTab(link(Hn)).includes("may be the same"), "4a2 …the hand-entered debt is not listed a second time, and nothing is marked");
  t.eq(has(doTab(link(Vn)), ["19.99% interest · $40/mo minimum", "1y 5m", "Time saved 2y 6m", "Interest saved $377", "All Debts (1)"]), [], "4b Do tab, linked variant: the same, one $40 minimum");
  t.eq(has(doTab(Hn), ["All Debts (2)", "20% interest (assumed) · $25.75/mo minimum (estimated)", "1y 9m", "Time saved 7y 4m", "Interest saved $1,265", "May be the same card as another debt in your list.",
    "Visa ••1111, may be the same card $1,287.42 · 20%", "Credit Card, may be the same card $1,287.42 · 19.99%"]), [],
    "4c Do tab, unlinked: both listed, each marked; the bank's row is simulated at 20% (assumed) and $25.75 (estimated): 1y 9m, 7y 4m and $1,265 saved");
  t.eq(has(doTab(Vn), ["All Debts (2)", "20% interest (assumed) · $40/mo minimum", "1y 5m", "Time saved 2y 6m", "Interest saved $377"]), [], "4d Do tab, unlinked variant: the bank's row with its own $40");
  try {
    const e0 = F.buildDebtListForSimulator(HL.debts, undefined, HL)[0], w = G.debtScenarioResult(e0, 50, [e0]);
    t.eq([w.boostedMonths, w.monthsSaved, w.interestSaved, w.baselineMonths, w.baselineInterest], [17, 30, 377.06, 47, 572.61], "4e What-If on the same entry gives the same payoff: 17 months, 30 saved, $377.06 interest saved (47 months, $572.61 at the minimum)");
  } catch (e) { t.ok(false, `4e What-If: ${describe(e)}`); }
  // Family's "Debt progress" line: the same pair-aware minimums.
  const fam = (d) => { try { return FM.familyDebtMetric(F.FinancialCalcEngine.netWorth(d).liabilities, d); } catch (e) { return `failed: ${describe(e).slice(0, 60)}`; } };
  t.eq([fam(HL), fam(H), fam(VL), fam(V)], ["Total debt: $1,287.42 · Min payments: $40/mo", "Total debt: $2,574.84 · Min payments: $40/mo", "Total debt: $1,287.42 · Min payments: $40/mo", "Total debt: $2,574.84 · Min payments: $80/mo"],
    "4f Family: one linked card is one $40 minimum (variant too); unlinked, both are kept, $80 in the variant");
  const APPSRC = SRC("src/App.jsx");
  const famDebt = APPSRC.slice(APPSRC.indexOf('if(item.id==="debt"){'), APPSRC.indexOf('if(item.id==="debt"){') + 2000);
  t.ok(/metric:familyDebtMetric\(totalDebt, data\)/.test(APPSRC) && /buildDebtListForSimulator\(data\.debts, data\.liabilities, data\)/.test(famDebt) && !/d\.apr/.test(famDebt),
    "4g Family's debt list reads the pair-aware list, at each debt's rate (it read d.apr, a field debts do not have, so every rate showed 0%)");
  const doSrc = APPSRC.slice(APPSRC.indexOf("function Goals("), APPSRC.indexOf('{tab==="worth"&&(()=>{'));
  t.ok(/const debts *= *buildDebtListForSimulator\(data\.debts, data\.liabilities, data\);/.test(doSrc) && /simulateDebtPayoffForDebt\(debt, extra\)/.test(doSrc) && !/const calc *= *\(xtra\)/.test(doSrc),
    "4h the Do tab builds no list of its own and runs What-If's payoff model, not a second loop");
  const budget = APPSRC.slice(APPSRC.indexOf("function BudgetScreen("), APPSRC.indexOf("function BudgetScreen(") + 30000);
  t.ok(/unbilledDebtMinimums\(data\.debts, data\.bills\)\.map\(/.test(budget) && !/\(data\.debts\|\|\[\]\)\.map\(\(d,i\)=>/.test(budget),
    "4i Budget's fixed rows list the same minimums as its \"Total fixed\" (unbilledDebtMinimums), so the rows add up to the total");
  const coach = APPSRC.slice(APPSRC.indexOf("function AICoach("), APPSRC.indexOf("function AICoach(") + 8000);
  t.ok(/const debts = buildDebtListForSimulator\(data\.debts, data\.liabilities, data\)/.test(coach), "4j the coach is told about each debt once, from the same list");
  // Health score's debt ratio: the same total as Today's Total debt.
  const income12 = (d) => F.FinancialCalcEngine.cashFlow(d, {}, T).monthlyIncome * 12;
  t.eq([HL, H, VL, V].map(d => Math.round(F.FinancialCalcEngine.debtRatio(d, {}, T) * income12(d) * 100)), [128742, 257484, 128742, 257484],
    "4k health score's debt ratio uses the same total as Today: $1,287.42 linked, $2,574.84 until answered (it summed every debt row, so a synced card counted twice)");

  // ── 9. The demos are unchanged (their card debts carry account_id; nothing is linked by sameAsAccountId) ─
  const demoSim = (d) => F.buildDebtListForSimulator(d.debts, d.liabilities, d).map(e => [e.name, e.balance, e.rate, Math.round(e.min * 100) / 100, e.source, e.mayBeSame || null, !!e.linked]);
  t.eq(demoSim(demo("CA")), [["Visa card", 3420, 19.99, 68, "manual", null, false], ["Car Loan", 8200, 6.99, 280, "manual", null, false]], "9a CA demo: the simulator's list is unchanged");
  t.eq(demoSim(demo("US")), [["Chase Sapphire", 4180, 24.99, 105, "manual", null, false], ["Federal Student Loan", 18400, 5.5, 195, "manual", null, false]], "9b US demo: unchanged");
  const demoMins = (d) => [mins(d), F.debtMinimumDates(d, T, 90).map(m => [m.day, m.amount]), SafeSpendEngine.calculate(d, T).debtPayments, Math.round(SafeSpendEngine.calculate(d, T).safeAmount * 100), DE.displayedSafeToSpend(d, T)];
  t.eq(demoMins(demo("CA")), [[["Visa card", 68], ["Car Loan", 280]], [[30, 68], [60, 68], [30, 280], [60, 280]], 348, 194488, 1944], "9c CA demo: minimums, their dates and safe to spend unchanged");
  t.eq(demoMins(demo("US")), [[["Chase Sapphire", 105], ["Federal Student Loan", 195]], [[30, 105], [60, 105], [30, 195], [60, 195]], 300, 241555, 2415], "9d US demo: unchanged");
  const demoNowC = (c) => ({ ...demo(c), incomes: D.buildDemoIncomes(now, c), bills: D.buildDemoBills(now, c), transactions: D.buildDemoTxns(now, c) });
  t.eq(has(doTab(demoNowC("CA")), ["Visa card $3,420 19.99% interest · $68/mo minimum", "3y 4m", "Time saved 5y 11m", "Interest saved $2,778", "All Debts (2)", "Visa card $3,420 · 19.99%", "Car Loan $8,200 · 6.99%"]), [],
    "9e CA demo Do tab unchanged: Visa card $3,420 at 19.99%, $68: 3y 4m with +$50, 5y 11m and $2,778 saved");
  t.eq(has(doTab(demoNowC("US")), ["Chase Sapphire $4,180 24.99% interest · $105/mo minimum", "3y 5m", "Time saved 3y 9m", "Interest saved $2,797", "All Debts (2)"]), [],
    "9f US demo Do tab unchanged: Chase Sapphire $4,180 at 24.99%, $105: 3y 5m, 3y 9m and $2,797 saved");
  t.eq([fam(demo("CA")), fam(demo("US"))], ["Total debt: $11,620 · Min payments: $348/mo", "Total debt: $22,580 · Min payments: $300/mo"], "9g demo Family lines unchanged");
  t.eq(["CA", "US"].map(c => [Math.round(F.FinancialCalcEngine.debtRatio(demo(c), {}, T) * 1e5), DE.calcHealthScore(demo(c), {}, T).score]), [[14422, 66], [32658, 63]], "9h demo debt ratio and health score unchanged");

  t.summary("linkedDebtPair.test");
  setImmediate(() => process.exit(process.exitCode || 0));
})();
