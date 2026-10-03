// tests/debtLink.test.cjs
// -----------------------------------------------------------------------------
// THE SAME CARD ENTERED TWICE: ASK, THEN COUNT IT ONCE, AND CHANGE NOTHING ELSE (demo-fixes B4).
//
// A household that links its bank and also adds the card as a debt by hand has the card twice: a bank
// credit account and an unlinked debt. Net worth counted both. Now the pair is found
// (likelyDebtAccountMatches), the Worth screen and the debt editor ask "Is this the same as your Visa
// ••1111?", and until it is answered both rows are marked "may be counted twice" and still summed:
// nothing is dropped on a guess. Yes sets debt.sameAsAccountId, which only net worth reads.
//
// MATH-LOCK, hand-worked, to the cent:
//   Chequing +2,150.37   Savings +4,000.00   Visa ••1111 (bank card) −1,287.42
//   Visa (hand-entered debt, unlinked) −1,287.42   Car loan (installment) −9,875.10
//   before:  2,150.37 + 4,000.00 − 1,287.42 − 1,287.42 − 9,875.10 = −6,299.57  (both Visa rows marked)
//   after Yes: the debt is the card already listed:           = −5,012.15  (counted once)
//   after No:  they are different cards, both stay:           = −6,299.57  (no mark, never asked again)
// Safe to spend, minimum payments, the debt simulator (with and without the bank's liability feed)
// and the 90-day forecast are identical, to the cent, before and after linking.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const { loadApp, textOf, describe } = require("./_renderApp.cjs");

(async () => {
  const t = create();
  const F = await import("../src/lib/financialCalculations.js");
  const { SafeSpendEngine } = await import("../src/lib/safeSpendEngine.js");
  const { ForecastEngine } = await import("../src/lib/forecastEngine.js");
  const DE = await import("../src/lib/decisionEngine.js");
  const D = await import("../src/lib/demoFixture.js");
  const T = new Date("2026-10-02T12:00:00");

  // A household: the Canadian demo's pay, bills and spending, with this fixture's accounts and debts.
  const base = { profile: D.demoProfileFor("CA"), incomes: D.buildDemoIncomes(T, "CA"), bills: D.buildDemoBills(T, "CA"), transactions: D.buildDemoTxns(T, "CA"), goals: [] };
  const before = { ...base,
    accounts: [
      { id: "c1", name: "Chequing", type: "checking", balance: 2150.37 },
      { id: "s1", name: "Savings", type: "savings", balance: 4000 },
      { id: "v1", name: "Visa ••1111", type: "credit", balance: -1287.42, institution: "TD" },
    ],
    debts: [
      { id: "d1", name: "Visa", balance: "1287.42", rate: "19.99", min: "40" },
      { id: "d2", name: "Car loan", balance: "9875.10", rate: "6.49", min: "310" },
    ],
  };

  // ── 1. Before: found, marked, and summed as shown ───────────────────────────────────────────────
  const matches = F.likelyDebtAccountMatches(before);
  t.eq(matches.map(m => [m.debtKey, m.accountId, m.accountLabel, m.reasons.join("+")]), [["d1", "v1", "Visa ••1111", "issuer+balance"]],
    "1a the hand-entered Visa is matched to the bank's Visa ••1111 (same issuer, balances within $1), keyed on its id");
  const r0 = F.netWorthRows(before);
  t.eq(r0.rows.map(r => [r.label, r.cents, !!r.mayCountTwice]), [["Chequing", 215037, false], ["Savings", 400000, false], ["Visa ••1111", -128742, true], ["Visa", -128742, true], ["Car loan", -987510, false]],
    "1b both Visa rows are listed and marked \"may be counted twice\"; nothing is dropped");
  t.eq([r0.totalCents, Math.round(F.FinancialCalcEngine.netWorth(before).netWorth * 100)], [-629957, -629957], "1c net worth is the sum of the rows shown: −$6,299.57");

  // ── 2. Yes, link them: counted once ─────────────────────────────────────────────────────────────
  const after = F.linkDebtToAccount(before, matches[0]);
  t.eq(after.debts.map(d => [d.id, d.sameAsAccountId || null, d.account_id || null]), [["d1", "v1", null], ["d2", null, null]], "2a Yes sets sameAsAccountId on that debt only (account_id is left alone)");
  const r1 = F.netWorthRows(after);
  t.eq([r1.rows.map(r => r.label), r1.totalCents, Math.round(F.FinancialCalcEngine.netWorth(after).netWorth * 100), r1.matches.length],
    [["Chequing", "Savings", "Visa ••1111", "Car loan"], -501215, -501215, 0], "2b the card is counted once: −$5,012.15, and nothing is asked again");

  // ── 3. …and nothing else changes, to the cent ───────────────────────────────────────────────────
  const same = (label, f) => t.eq(JSON.stringify(f(after)), JSON.stringify(f(before)), `3 ${label}: identical before and after linking`);
  same("safe to spend (every field)", d => SafeSpendEngine.calculate(d, T));
  same("the safe-to-spend figure Today shows", d => DE.displayedSafeToSpend(d, T));
  same("the spare amount", d => DE.spareUntilDeposit(d, T));
  same("minimum payments not already paid by a bill", d => F.unbilledDebtMinimums(d.debts, d.bills).map(m => [m.debt && m.debt.name, m.amount]));
  same("minimum payment dates in the forecast", d => F.debtMinimumDates(d, T, 90).map(m => [m.day, m.amount, m.debt && m.debt.name]));
  same("the 90-day forecast (every day's balance, money in and out)", d => ForecastEngine.generate(d, 90, null, T).forecast.map(f => [f.day, Math.round(f.balance * 100), Math.round(f.income * 100), Math.round(f.expenses * 100)]));
  same("the debt simulator's list", d => F.buildDebtListForSimulator(d.debts, d.liabilities));
  const feed = { credit: [{ account_id: "v1", name: "Visa ••1111", balance: 1287.42, apr: null, minPayment: 40 }], mortgage: [], student: [] };
  same("the debt simulator with the bank's liability feed (no APR sent)", d => F.buildDebtListForSimulator(d.debts, feed));
  same("monthly cash flow", d => F.FinancialCalcEngine.cashFlow(d, {}, T));
  same("daily spending", d => F.FinancialCalcEngine.avgDailySpend(d));
  same("net worth's assets", d => F.FinancialCalcEngine.netWorth(d).assets);

  // ── 4. No, they're different: both stay, unmarked, never asked again ─────────────────────────────
  const no = F.dismissDebtAccountMatch(before, matches[0]);
  const r2 = F.netWorthRows(no);
  t.eq([no.debtLinkDismissed, F.likelyDebtAccountMatches(no).length, r2.totalCents, r2.rows.some(r => r.mayCountTwice)], [["d1|v1"], 0, -629957, false],
    "4a No stores the pair, asks nothing more, and both cards count (−$6,299.57, no mark)");
  t.eq(F.dismissDebtAccountMatch(no, matches[0]).debtLinkDismissed, ["d1|v1"], "4b …once, keyed on the debt's id");

  // ── 5. The rule ─────────────────────────────────────────────────────────────────────────────────
  const card = (name, balance, extra = {}) => ({ id: "x", name, type: "credit", balance, ...extra });
  const one = (debt, acct) => F.likelyDebtAccountMatches({ accounts: [acct], debts: [debt] }).map(m => m.reasons.join("+"));
  t.eq(one({ id: 1, name: "Credit Card 4471", balance: "900" }, card("Rewards ••4471", -2000)), ["last4"], "5a the last 4 digits");
  t.eq(one({ id: 1, name: "Mastercard", balance: "900" }, card("World Elite Mastercard", -2000)), ["issuer"], "5b the issuer or network");
  t.eq(one({ id: 1, name: "Credit Card", balance: "1500.40" }, card("Card ••0001", -1500)), ["balance"], "5c balances within $1");
  t.eq(one({ id: 1, name: "Credit Card", balance: "1502" }, card("Card ••0001", -1500)), [], "5d …not $2 apart");
  t.eq(one({ id: 1, name: "Line of Credit", balance: "3000" }, { id: "l", name: "TD Line of Credit", type: "line of credit", balance: -3000 }), ["balance"], "5e a line of credit");
  t.eq(one({ name: "Visa", balance: "900" }, card("Visa ••1", -900)), [], "5l a debt with no id is never offered (it is given one on load)");
  t.eq(one({ id: 1, name: "Car Loan", balance: "1500" }, card("Card ••0001", -1500)), [], "5f a car loan is never matched to a card, whatever its balance");
  t.eq(one({ id: 1, name: "Visa", balance: "900", fromBank: true }, card("Visa ••1", -900)), [], "5g a debt that came from the bank is already that account");
  t.eq(F.likelyDebtAccountMatches({ accounts: [card("Visa ••1", -900)], debts: [{ id: 1, name: "Visa", balance: "900" }, { id: 2, name: "Visa", balance: "900", account_id: "x" }] }), [],
    "5h an account another debt is already linked to is not offered again");
  t.eq(F.likelyDebtAccountMatches({ accounts: [card("Visa ••1", -900), { id: "y", name: "Visa ••2", type: "credit", balance: -900 }], debts: [{ id: 1, name: "Visa", balance: "900" }] }).length, 1,
    "5i one debt is paired with one account at most");

  // ── 7. Two debts with one name (demo-fixes C1) ────────────────────────────────────────────────
  // MATH-LOCK: chequing +2,150.37, Visa ••1111 (bank card) −1,287.42, two hand-entered debts both named
  // "Credit Card", −1,287.42 (id cc-a) and −640.25 (id cc-b). Net worth −1,064.72. Yes on cc-a links
  // cc-a only: +1,287.42 exactly, to +222.70, and cc-b is still counted. (Keyed on the name, Yes linked
  // both, and net worth jumped by 1,927.67.)
  {
    const two = { profile: { country: "CA" }, accounts: [{ id: "c1", name: "Chequing", type: "checking", balance: 2150.37 }, { id: "v1", name: "Visa ••1111", type: "credit", balance: -1287.42 }],
      debts: [{ id: "cc-a", name: "Credit Card", balance: "1287.42", rate: "19.99", min: "40" }, { id: "cc-b", name: "Credit Card", balance: "640.25", rate: "21.99", min: "25" }] };
    const nw = (d) => F.netWorthRows(d).totalCents;
    t.eq(nw(two), -106472, "7a two Credit Card debts and the bank Visa: −$1,064.72");
    t.eq(F.likelyDebtAccountMatches(two).map(m => [m.debtKey, m.accountId]), [["cc-a", "v1"]], "7b cc-a is offered for Visa ••1111 (equal balances)");
    const linked = F.linkDebtToAccount(two, { debtKey: "cc-a", accountId: "v1", pairKey: "cc-a|v1" });
    t.eq(linked.debts.map(d => [d.id, d.sameAsAccountId || null]), [["cc-a", "v1"], ["cc-b", null]], "7c Yes on cc-a links cc-a only, by its id");
    t.eq([nw(linked), nw(linked) - nw(two)], [22270, 128742], "7d net worth changes by exactly that debt's balance: +$1,287.42, to +$222.70");
    t.ok(F.netWorthRows(linked).rows.some(r => r.kind === "debt" && r.id === "cc-b" && r.cents === -64025), "7e the other Credit Card is still counted, −$640.25");
    t.eq(F.dismissDebtAccountMatch(two, { debtKey: "cc-a", accountId: "v1", pairKey: "cc-a|v1" }).debtLinkDismissed, ["cc-a|v1"], "7f a dismissal is keyed on the id too");
    // The same with names that qualify, so the second debt's own prompt can be seen.
    const visas = { ...two, debts: [{ id: "v-a", name: "Visa", balance: "1287.42", rate: "19.99", min: "40" }, { id: "v-b", name: "Visa", balance: "640.25", rate: "21.99", min: "25" }] };
    const m1 = F.likelyDebtAccountMatches(visas);
    t.eq(m1.map(m => [m.debtKey, m.accountId]), [["v-a", "v1"]], "7g two debts both named Visa: the one whose balance is closer is offered for Visa ••1111");
    const l1 = F.linkDebtToAccount(visas, m1[0]);
    t.eq([l1.debts.map(d => d.sameAsAccountId || null), nw(l1) - nw(visas)], [["v1", null], 128742], "7h Yes links that one only, +$1,287.42");
    const more = { ...l1, accounts: [...l1.accounts, { id: "v2", name: "Visa ••2222", type: "credit", balance: -640.25 }] };
    t.eq(F.likelyDebtAccountMatches(more).map(m => [m.debtKey, m.accountId]), [["v-b", "v2"]], "7i the other Visa is still eligible for its own prompt (here, against Visa ••2222)");
    const d1 = F.dismissDebtAccountMatch(visas, m1[0]);
    t.eq(F.likelyDebtAccountMatches(d1).map(m => [m.debtKey, m.accountId]), [["v-b", "v1"]], "7j …and No on the first leaves the second free to be asked about the same card");
    // Stable ids: the same saved data gives the same ids on every load and device, and two debts with one name get two ids.
    const legacy = [{ name: "Credit Card", balance: "1287.42" }, { name: "Credit Card", balance: "640.25" }, { name: "Visa card", balance: "3420", account_id: "a3" }];
    const once = F.withDebtIds(legacy), again = F.withDebtIds(legacy.map(d => ({ ...d })));
    t.eq(once.map(d => d.id), again.map(d => d.id), "7k ids given on load are the same on every load of the same data");
    t.ok(once[0].id && once[1].id && once[0].id !== once[1].id && once[2].id === undefined, "7l two debts named Credit Card get two ids; a bank-imported debt keeps its bank account id as its key");
    t.ok(F.withDebtIds(once) === once && F.withDebtIds(once.map((d, i) => i === 0 ? { ...d, balance: "1000" } : d))[0].id === once[0].id, "7m once given, an id is kept when the debt changes");
  }

  // ── 6. On screen ────────────────────────────────────────────────────────────────────────────────
  let A = {};
  try { A = loadApp(["Goals", "InlineDebtEditor"]); } catch (e) { t.ok(false, `App.jsx bundles: ${describe(e)}`); }
  const worth = (d) => textOf(A.render(A.h(A.Goals, { data: d, initialTab: "worth", setScreen: () => {}, setAppData: () => {} })));
  const editor = (d) => textOf(A.render(A.h(A.InlineDebtEditor, { data: d, setAppData: () => {}, color: "#000", navToScreen: () => {} })));
  try {
    const w0 = worth(before), e0 = editor(before);
    t.ok(w0.includes("Is this the same as your Visa ••1111?") && w0.includes("Yes, link them") && w0.includes("No, they're different"), "6a Worth asks, with both answers");
    t.ok((w0.match(/May be counted twice/g) || []).length === 2, "6b …and marks both rows on the list");
    t.ok(e0.includes("Is this the same as your Visa ••1111?") && e0.includes("Yes, link them"), "6c the debt editor asks the same question");
    t.ok(!worth(after).includes("Is this the same as") && !editor(after).includes("Is this the same as") && !worth(no).includes("Is this the same as"), "6d once answered, neither asks again");
    const demo = { profile: D.demoProfileFor("CA"), accounts: D.demoAccountsFor("CA"), debts: D.demoDebtsFor("CA"), incomes: base.incomes, bills: base.bills, transactions: base.transactions, demo: true };
    t.ok(!worth(demo).includes("Is this the same as"), "6e the demo, whose card debt is linked, is not asked");
  } catch (e) { t.ok(false, `6 renders: ${describe(e)}`); }
  const fs = require("fs"), path = require("path");
  const APP = fs.readFileSync(path.join(__dirname, "..", "src", "App.jsx"), "utf8");
  t.ok(/label:r\.mayCountTwice\?`\$\{r\.label\}, may be counted twice`:r\.label/.test(APP) && /Two rows marked below may be the same card counted twice/.test(APP),
    "6f How we got this marks both rows \"may be counted twice\" and says so in one line");
  t.ok(!/sameAsAccountId/.test(fs.readFileSync(path.join(__dirname, "..", "src", "lib", "safeSpendEngine.js"), "utf8") + fs.readFileSync(path.join(__dirname, "..", "src", "lib", "forecastEngine.js"), "utf8")),
    "6g (safe to spend and the forecast never read the link)");

  t.summary("debtLink.test");
  setImmediate(() => process.exit(process.exitCode || 0));
})();
