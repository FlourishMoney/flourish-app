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

  // ── 9. The demos are unchanged (their card debts carry account_id; nothing is linked by sameAsAccountId) ─
  const demo = (c) => ({ profile: D.demoProfileFor(c), accounts: D.demoAccountsFor(c), debts: D.demoDebtsFor(c), incomes: D.buildDemoIncomes(T, c),
    bills: D.buildDemoBills(T, c), transactions: D.buildDemoTxns(T, c), goals: [], bankConnected: true, demo: true });
  const demoSim = (d) => F.buildDebtListForSimulator(d.debts, d.liabilities, d).map(e => [e.name, e.balance, e.rate, Math.round(e.min * 100) / 100, e.source, e.mayBeSame || null, !!e.linked]);
  t.eq(demoSim(demo("CA")), [["Visa card", 3420, 19.99, 68, "manual", null, false], ["Car Loan", 8200, 6.99, 280, "manual", null, false]], "9a CA demo: the simulator's list is unchanged");
  t.eq(demoSim(demo("US")), [["Chase Sapphire", 4180, 24.99, 105, "manual", null, false], ["Federal Student Loan", 18400, 5.5, 195, "manual", null, false]], "9b US demo: unchanged");

  t.summary("linkedDebtPair.test");
  setImmediate(() => process.exit(process.exitCode || 0));
})();
