// tests/meetDebtPairs.test.cjs
// -----------------------------------------------------------------------------
// MEET'S DEBT PROGRESS COUNTS A LINKED PAIR ONCE.
//
// buildMeetSnapshot listed data.debts as stored, so a debt the household entered by hand and linked
// to a bank account (sameAsAccountId, the one-tap link) sat beside that account's own bank row
// (fromBank, account_id): the same card or loan twice. Debt Sim and the coach already count the pair
// once (buildDebtListForSimulator), and so do the minimums (debtMinimums). Meet's progress now reads
// that same list, without the bank's liability feed: the household's debts, with a linked pair as one
// entry (the bank's name and its balance now). A likely pair not yet answered stays as both, as it
// does in Debt Sim. No other Meet figure moves.
//
// MATH-LOCK, hand-worked (clock pinned to Oct 2, 2026, noon):
//   card:     bank Visa ••1111 −1,287.42, its bank row 1,287.42, and a hand-entered "Credit Card"
//             1,287.42 (19.99%, $40). Linked: one entry, Visa ••1111 $1,287.42. Not yet answered: both.
//             The bank's balance moves to 1,500.00: the one entry is $1,500.00, as Debt Sim shows it.
//   auto loan: bank Auto Loan ••4410 18,250.00 (type loan, subtype auto), its bank row 18,250.00 (the
//             balance sync makes one for every isCreditLiability account, loans included), and a
//             hand-entered "Car Loan" 18,400.00 (6.99%, $395). Linked: one entry, Auto Loan ••4410
//             $18,250.00. Not linked: both.
//   unlinked: Visa $2,340, Car Loan $8,200, a $0 store card, a bank Mastercard row $640.50 and an
//             unnamed $120.10: the four with a balance, as stored, in order ($0 left out, unnamed "Debt").
//   CA demo:  the whole Meet snapshot, and the agenda read from it, are exactly what main built
//             before this change (captured from main fa2386c with this clock).
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");

// buildMeetSnapshot reads new Date() for the forecast and the week, so the clock is pinned.
const RealDate = Date;
const FIXED = new RealDate("2026-10-02T12:00:00").getTime();
class PinnedDate extends RealDate {
  constructor(...a) { super(...(a.length ? a : [FIXED])); }
  static now() { return FIXED; }
}
global.Date = PinnedDate;

(async () => {
  const t = create();
  const F = await import("../src/lib/financialCalculations.js");
  const M = await import("../src/lib/meetSnapshot.js");
  const D = await import("../src/lib/demoFixture.js");
  const T = new Date();

  const household = (accounts, debts) => ({
    profile: D.demoProfileFor("CA"), incomes: D.buildDemoIncomes(T, "CA"), bills: D.buildDemoBills(T, "CA"), transactions: D.buildDemoTxns(T, "CA"), goals: [],
    accounts: [{ id: "c1", name: "Chequing", type: "checking", balance: 2150.37 }, ...accounts],
    debts: F.withDebtIds(debts),
  });
  const progress = (d) => (M.buildMeetSnapshot(d).debts || []).map(x => [x.name, x.balance]);
  const sim = (d) => F.buildDebtListForSimulator(d.debts, d.liabilities, d).map(e => [e.name, e.balance]);
  const withBalance = (d, id, balance) => ({ ...d, accounts: d.accounts.map(a => a.id === id ? { ...a, balance } : a) });

  // ── 1. A card and its bank row ───────────────────────────────────────────────────────────────
  const card = household([{ id: "v1", name: "Visa ••1111", type: "credit", balance: -1287.42, institution: "TD" }],
    [{ name: "Visa ••1111", balance: "1287.42", rate: "", min: "", fromBank: true, account_id: "v1" },
     { name: "Credit Card", balance: "1287.42", rate: "19.99", min: "40" }]);
  const match = F.likelyDebtAccountMatches(card)[0];
  const cardL = F.linkDebtToAccount(card, match);
  t.ok(match && match.accountId === "v1" && cardL.debts[1].sameAsAccountId === "v1" && !cardL.debts[0].sameAsAccountId,
    "1 the household said Yes: Credit Card is linked to Visa ••1111");
  t.eq(progress(cardL), [["Visa ••1111", 1287.42]], "1a linked: one entry, the bank's card at $1,287.42 (it was listed twice)");
  t.eq(progress(card), [["Visa ••1111", 1287.42], ["Credit Card", 1287.42]], "1b not yet answered: both stay, as in Debt Sim");
  const flipped = { ...cardL, debts: [cardL.debts[1], cardL.debts[0]] };
  t.eq(progress(flipped), [["Visa ••1111", 1287.42]], "1c the hand-entered debt first: still one entry");
  t.eq(progress(withBalance(cardL, "v1", -1500)), [["Visa ••1111", 1500]], "1d the bank's balance moves to $1,500.00: the one entry is the bank's balance now");
  t.eq([progress(cardL), progress(card), progress(withBalance(cardL, "v1", -1500))], [sim(cardL), sim(card), sim(withBalance(cardL, "v1", -1500))],
    "1e the same entries Debt Sim lists");
  t.eq(M.buildMeetSnapshot(cardL).debts, [{ name: "Visa ••1111", balance: 1287.42, prevBalance: null, payoffDate: null }],
    "1f the entry's shape is unchanged: no previous balance or payoff date is made up");

  // ── 2. An auto loan entered by hand, linked to the bank's auto loan ──────────────────────────
  const loan = household([{ id: "l1", name: "Auto Loan ••4410", type: "loan", subtype: "auto", balance: 18250, institution: "TD" }],
    [{ name: "Car Loan", balance: "18400", rate: "6.99", min: "395" },
     { name: "Auto Loan ••4410", balance: "18250.00", rate: "", min: "", fromBank: true, account_id: "l1" }]);
  t.ok(F.isCreditLiability(loan.accounts[1]), "2 a bank loan account is a liability the balance sync makes a bank row for");
  const loanL = F.linkDebtToAccount(loan, { debtKey: F.debtKey(loan.debts[0]), accountId: "l1" });
  t.ok(loanL.debts[0].sameAsAccountId === "l1" && !loanL.debts[1].sameAsAccountId, "2a the household linked Car Loan to Auto Loan ••4410");
  t.eq(progress(loanL), [["Auto Loan ••4410", 18250]], "2b linked: one entry, the bank's loan at $18,250.00 (it was listed twice)");
  t.eq(progress(loan), [["Car Loan", 18400], ["Auto Loan ••4410", 18250]], "2c not linked: both, as before");
  t.eq([progress(loanL), progress(loan)], [sim(loanL), sim(loan)], "2d the same entries Debt Sim lists");

  // ── 3. Unlinked debts are listed as they were ────────────────────────────────────────────────
  const plain = household([{ id: "m1", name: "Mastercard ••7788", type: "credit", balance: -640.5 }],
    [{ name: "Visa", balance: 2340, rate: 19.99, min: 60 }, { name: "Car Loan", balance: "8200", rate: "6.99", min: "280" },
     { name: "Store card", balance: "0", rate: "", min: "" }, { name: "Mastercard ••7788", balance: "640.50", rate: "", min: "", fromBank: true, account_id: "m1" },
     { name: "", balance: "120.10" }]);
  const before = (d) => d.debts.filter(x => parseFloat(x.balance) > 0).map(x => [x.name || "Debt", Math.round(parseFloat(x.balance) * 100) / 100]);
  t.eq(progress(plain), [["Visa", 2340], ["Car Loan", 8200], ["Mastercard ••7788", 640.5], ["Debt", 120.1]],
    "3a unlinked: every debt with a balance, as stored and in order ($0 left out, an unnamed one is \"Debt\")");
  t.eq(progress(plain), before(plain), "3b …exactly the list Meet built before");
  // A link whose bank account is gone (disconnected): nothing to pair it with, so the debt as entered.
  const gone = { ...cardL, accounts: cardL.accounts.filter(a => a.id !== "v1"), debts: [cardL.debts[1]] };
  t.eq(progress(gone), [["Credit Card", 1287.42]], "3c a link to an account no longer connected: the hand-entered debt, as entered");
  t.eq(progress({ goals: [] }), [], "3d no debts: no progress entries");
  t.ok(!("debts" in M.buildMeetSnapshot({ debts: [{ name: "Paid off", balance: "0" }] })), "3e nothing owed: no debts section at all, as before");

  // ── 4. The demos' Meet is unchanged ──────────────────────────────────────────────────────────
  const demo = (c) => ({ profile: D.demoProfileFor(c), accounts: D.demoAccountsFor(c), debts: D.demoDebtsFor(c), incomes: D.buildDemoIncomes(T, c),
    bills: D.buildDemoBills(T, c), transactions: D.buildDemoTxns(T, c), goals: [], bankConnected: true, demo: true });
  // Captured from main fa2386c (before this change) with the clock pinned as above.
  const CA_SNAPSHOT_ON_MAIN = '{"weekTotal":{"thisWeek":176,"normal":229.45,"delta":-53.45},"behaviorDeltas":[{"category":"Coffee & Dining","thisWeek":13.25,"normal":70.79,"delta":-57.54},{"category":"Groceries","thisWeek":89.22,"normal":41.57,"delta":47.65},{"category":"Shopping","thisWeek":24.15,"normal":55.69,"delta":-31.54}],"debts":[{"name":"Visa card","balance":3420,"prevBalance":null,"payoffDate":null},{"name":"Car Loan","balance":8200,"prevBalance":null,"payoffDate":null}],"decisions":[{"question":"$486 is spare before Oct 15: a quarter of your $1,944 safe to spend. Is there anything you want to do with it?","explain":{"title":"Spare before Oct 15","value":"$486","meaning":"A quarter of what\'s safe to spend until your next payday, rounded down to the dollar. It is a figure to talk about: nothing is moved.","rows":[{"label":"In your accounts","value":"$3,083"},{"label":"− Upcoming bills","value":"$65"},{"label":"− Min. debt payments","value":"$348"},{"label":"− Spending buffer","value":"$435"},{"label":"− Savings","value":"$291"},{"label":"= Safe until next payday","value":"$1,944"},{"label":"× 25%, rounded down","value":"$486"}],"source":"Safe to spend on Today"},"options":[{"label":"Visa card","outcome":"$3,420 owed at 19.99%","explain":{"title":"Visa card","value":"$3,420","meaning":"The debt with the highest interest rate in your list, and what is owed on it now.","rows":[{"label":"Owed now","value":"$3,420"},{"label":"Interest rate","value":"19.99%"},{"label":"Minimum payment","value":"$68"}],"source":"Your debts"}},{"label":"Savings","outcome":"$1,840 saved now","explain":{"title":"Savings","value":"$1,840","meaning":"The balance of your savings accounts now.","rows":[{"label":"Savings ••8803","value":"$1,840"},{"label":"Total","value":"$1,840"}],"source":"Your accounts"}}]}]}';
  const CA_AGENDA_ON_MAIN = "Wins:\n- Your spending came in $53.45 under a usual week.\nChanges:\n- Coffee & Dining ran $57.54 below your usual pace.\n- Groceries ran $47.65 above your usual pace.\nDecisions:\n- $486 is spare before Oct 15: a quarter of your $1,944 safe to spend. Is there anything you want to do with it?\n    • Visa card: $3,420 owed at 19.99%\n    • Savings: $1,840 saved now";
  t.eq(progress(demo("CA")), [["Visa card", 3420], ["Car Loan", 8200]], "4a CA demo: Visa card $3,420 and Car Loan $8,200, as before");
  t.eq(JSON.stringify(M.buildMeetSnapshot(demo("CA"))), CA_SNAPSHOT_ON_MAIN, "4b CA demo: the whole Meet snapshot is the one main built");
  t.eq(M.agendaToText(M.meetAgendaFor(demo("CA"))), CA_AGENDA_ON_MAIN, "4c CA demo: the agenda the household reads and the facilitator receives is unchanged");
  t.eq(progress(demo("US")), [["Chase Sapphire", 4180], ["Federal Student Loan", 18400]], "4d US demo: Chase Sapphire $4,180 and Federal Student Loan $18,400, as before");

  t.summary("meetDebtPairs.test");
  setImmediate(() => process.exit(process.exitCode || 0));
})();
