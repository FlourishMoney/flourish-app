// tests/manualBalances.test.cjs
// -----------------------------------------------------------------------------
// A HOUSEHOLD WITHOUT A BANK CONNECTION CAN ENTER ITS BALANCES (manual-balances).
//
// Manual and statement-import (PDF, CSV) accounts were created at $0 and nothing could change that,
// so safe to spend, Watch and net worth started from $0 for anyone who chose "Enter it myself".
// lib/manualBalances.js now lets the household enter and edit the balance of any manual or imported
// account (chequing, savings, card, loan) with an "as of" date. Linked bank accounts stay bank-fed.
//
// MATH-LOCK, hand-worked. Pinned clock: Wed Oct 14 2026, noon. One household, two ways:
//   LINKED  — TD chequing $2,150.00 (available), savings $3,000.00, card owing $640.00, car loan
//             owing $9,800.00, shaped as Plaid sends them and as bank sync stores them (card and loan
//             each get their own debt row, fromBank).
//   ENTERED — no bank: an imported October statement (chequing) and three manual accounts, every
//             balance typed in, as of Oct 14.
//   Both: pay $5,200 monthly on the 23rd (9 days out), Phone $60 on the 20th, Rent $1,400 on the 1st,
//   a hand-entered student loan $12,000 at 5% with a $150 minimum, and $420 of everyday spending
//   between Oct 1 and Oct 12 (an 11-day span, so the estimate uses 14 days: $30.00 a day).
//   Safe to spend = $5,150 cash (chequing + savings) − $60 Phone − $150 minimum − 9 × $30 buffer
//                   − $5,200 × 10% / 30 × 9 = $156 savings  =  $4,514.
//   Pace = $4,514 over 14 days (the pace window's floor) = $322.43, rounded down: $322.
//   Net worth = $5,150 − $640 − $9,800 − $12,000 = −$17,290.00.
//   Watch, 7 days: $5,150.00 + $0.00 − $60.00 − $210.00 = $4,880.00.
// Both households must give exactly these figures, and the same coach and What-If figures.
// Mutation check: if entered balances are ignored, the ENTERED household starts from $0 and section 4
// fails.
// The demos are unchanged (section 5): CA $3,083 in accounts, $1,944 safe to spend, $138 pace, and the
// Watch check lines captured from main b003f5b on the same pinned date.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");
const { loadApp, textOf, describe, REPO } = require("./_renderApp.cjs");

const RealDate = Date;
const FIXED = new RealDate("2026-10-14T12:00:00").getTime();
class PinnedDate extends RealDate {
  constructor(...a) { super(...(a.length ? a : [FIXED])); }
  static now() { return FIXED; }
}
global.Date = PinnedDate;

const APP = fs.readFileSync(path.join(REPO, "src", "App.jsx"), "utf8");
const BANNED = /sets? aside|holds? back|\blearns\b|\bremembers\b|\bsmarter\b|\bcovered\b/i;

(async () => {
  const t = create();
  const MB = await import("../src/lib/manualBalances.js");
  const SI = await import("../src/lib/statementImport.js");
  const F = await import("../src/lib/financialCalculations.js");
  const { SafeSpendEngine } = await import("../src/lib/safeSpendEngine.js");
  const { safeToSpendView } = await import("../src/lib/safeToSpendView.js");
  const { suggestedDailyView } = await import("../src/lib/suggestedDaily.js");
  const { ForecastEngine } = await import("../src/lib/forecastEngine.js");
  const W = await import("../src/lib/watchRange.js");
  const DE = await import("../src/lib/decisionEngine.js");
  const { promoteAccounts } = await import("../src/lib/multibank.js");
  const { normalizeAccountBalance } = await import("../src/lib/plaidNormalize.js");
  const { adviceProblems } = require("./_copyStrings.cjs");
  const D = await import("../src/lib/demoFixture.js");
  const today = new Date();

  // ── 1. Entering a balance ──────────────────────────────────────────────────────────────────────
  {
    const base = { profile: { country: "CA" }, accounts: [], debts: [] };
    const d1 = MB.enterBalance(base, { kind: "chequing", amount: "1,250.50", asOf: "2026-10-14" }, today);
    const a = d1.accounts[0] || {};
    t.eq([d1.accounts.length, a.institution, a.type, a.subtype, a.balance, a.balanceEntered, a.balanceAsOf, a.currency, a.name],
      [1, "Manual", "depository", "checking", 1250.5, true, "2026-10-14", "CAD", "Chequing"],
      "1a a new chequing account: Manual, shaped as a bank's chequing, $1,250.50 entered as of Oct 14, in the household's currency");
    t.ok(F.isCashAccount(a) && F.isCheckingAccount(a), "1b …it counts as cash, as a linked chequing account does");
    t.eq(base.accounts.length, 0, "1c the input is not mutated");
    const us = MB.enterBalance({ profile: { country: "US" }, accounts: [], debts: [] }, { kind: "chequing", amount: "10", asOf: "2026-10-14" }, today).accounts[0];
    t.eq([us.name, us.currency, MB.kindLabel("chequing", "US"), MB.kindLabel("chequing", "CA")], ["Checking", "USD", "Checking", "Chequing"], "1c2 in the US it is a checking account, in dollars US");

    const d2 = MB.enterBalance(d1, { kind: "card", amount: "640", asOf: "2026-10-14" }, today);
    const card = d2.accounts[1] || {};
    t.eq([card.type, card.subtype, card.balance, card.name, MB.amountShownFor(card)], ["credit", "credit card", -640, "Credit card", 640],
      "1d a card stores what is owed as a negative balance, as a linked card does, and the editor shows $640");
    const row = (d2.debts || []).filter(x => x.account_id === card.id);
    t.eq(row.map(x => [x.fromBank, x.balance, x.rate, x.min, x.name]), [[true, "640.00", "", "", "Credit card"]],
      "1e …and gets its own debt row, as bank sync makes for a linked card (fromBank, account_id)");

    const d3 = MB.enterBalance(d2, { accountId: card.id, kind: "card", amount: "712.40", asOf: "2026-10-14" }, today);
    t.eq([d3.accounts.find(x => x.id === card.id).balance, (d3.debts || []).filter(x => x.account_id === card.id).map(x => x.balance)], [-712.4, ["712.40"]],
      "1f updating the card's balance updates its one debt row, never a second");

    const d4 = MB.enterBalance(d3, { kind: "loan", loanType: "auto", amount: "9800", asOf: "2026-10-01" }, today);
    const loan = d4.accounts[2] || {};
    t.eq([loan.type, loan.subtype, loan.balance, loan.name, loan.balanceAsOf, (d4.debts || []).filter(x => x.account_id === loan.id).length],
      ["loan", "auto", -9800, "Car loan", "2026-10-01", 1], "1g a car loan: type loan, subtype auto, owed as negative, with its own debt row");

    const withHand = { ...d4, debts: [...d4.debts, { id: "h1", name: "Visa", balance: "500", rate: "19.99", min: "25", sameAsAccountId: card.id }] };
    const d5 = MB.enterBalance(withHand, { accountId: card.id, kind: "chequing", amount: "100", asOf: "2026-10-14" }, today);
    t.eq([d5.accounts.find(x => x.id === card.id).type, d5.debts.filter(x => x.account_id === card.id).length, d5.debts.some(x => x.id === "h1")], ["depository", 0, true],
      "1h changing a card to chequing drops the account's own debt row and keeps every hand-entered debt");

    const linked = { ...base, accounts: [{ id: "p1", name: "TD ••4521", type: "depository", subtype: "checking", balance: 900, institution: "TD", _item: "item1" }] };
    t.ok(MB.enterBalance(linked, { accountId: "p1", kind: "chequing", amount: "5", asOf: "2026-10-14" }, today) === linked, "1i a linked bank account is never edited (_item)");
    const legacy = { ...base, accounts: [{ id: "p2", name: "RBC ••1", type: "depository", subtype: "checking", balance: 900, institution: "RBC" }] };
    t.ok(MB.enterBalance(legacy, { accountId: "p2", kind: "chequing", amount: "5", asOf: "2026-10-14" }, today) === legacy, "1j …nor one from a bank that predates the _item stamp");
    t.eq([MB.isEditableAccount(linked.accounts[0]), MB.isEditableAccount(legacy.accounts[0]), MB.isEditableAccount({ institution: "Manual" }), MB.isEditableAccount({ institution: "Statement" })],
      [false, false, true, true], "1k editable: Manual and Statement accounts only");

    t.ok(MB.enterBalance(d1, { kind: "chequing", amount: "abc", asOf: "2026-10-14" }, today) === d1, "1l an amount that is not a number changes nothing");
    t.ok(MB.enterBalance(d1, { kind: "chequing", amount: "10", asOf: "2026-10-15" }, today) === d1, "1m a date after today changes nothing");
    t.ok(MB.enterBalance(d1, { kind: "chequing", amount: "", asOf: "2026-10-14" }, today) === d1, "1n an empty amount changes nothing");
    t.eq([MB.balanceEntryProblem({ amount: "abc", asOf: "2026-10-14" }, today), MB.balanceEntryProblem({ amount: "", asOf: "2026-10-14" }, today),
          MB.balanceEntryProblem({ amount: "10", asOf: "2026-10-15" }, today), MB.balanceEntryProblem({ amount: "10", asOf: "" }, today),
          MB.balanceEntryProblem({ amount: "-40.25", asOf: "2026-10-14" }, today)],
      ["Type the amount as a number, like 1250.00.", "Type the amount as a number, like 1250.00.", "The date can't be after today.", "Pick the date this balance was true.", null],
      "1o the editor's messages; an overdrawn chequing balance (−$40.25) is allowed");

    const stmt = { ...base, accounts: [{ id: "stmt_acct_0", name: "October statement", type: "checking", balance: 0, institution: "Statement", currency: "CAD" }] };
    const d6 = MB.enterBalance(stmt, { accountId: "stmt_acct_0", kind: "chequing", amount: "2150", asOf: "2026-09-30" }, today);
    const s0 = d6.accounts[0];
    t.eq([s0.id, s0.institution, s0.name, s0.balance, s0.balanceAsOf, s0.balanceEntered], ["stmt_acct_0", "Statement", "October statement", 2150, "2026-09-30", true],
      "1p an imported statement account keeps its id, institution and name, and takes the entered balance");
    t.eq([MB.accountKindOf(s0), MB.accountKindOf({ type: "savings" }), MB.accountKindOf({ type: "credit" }), MB.accountKindOf({ type: "loan", subtype: "mortgage" }), MB.accountKindOf({ type: "investment" })],
      ["chequing", "savings", "card", "loan", null], "1q kinds read from type/subtype, the legacy shapes included");
  }

  // ── 2. "Balance you entered, as of <date>", and the quiet stale line ─────────────────────────────
  {
    t.eq([MB.formatAsOf("2026-10-14", today), MB.formatAsOf("2025-12-31", today), MB.daysSince("2026-10-05", today), MB.daysSince("2026-10-14", today)],
      ["Oct 14", "Dec 31, 2025", 9, 0], "2a dates read \"Oct 14\" (the year only when it is not this year); Oct 5 is 9 days ago");
    const acct = (id, asOf, extra = {}) => ({ id, name: id, type: "depository", subtype: "checking", balance: 10, institution: "Manual", balanceEntered: true, balanceAsOf: asOf, ...extra });
    const one = MB.enteredBalanceNote([acct("Chequing", "2026-10-14")], today);
    t.eq([one.lines, one.stale], [["Balance you entered, as of Oct 14."], null], "2b one entered account: \"Balance you entered, as of Oct 14.\", nothing stale");
    const same = MB.enteredBalanceNote([acct("Chequing", "2026-10-10"), acct("Savings", "2026-10-10")], today);
    t.eq(same.lines, ["Balance you entered, as of Oct 10."], "2c two accounts entered the same day: one line");
    const two = MB.enteredBalanceNote([acct("Chequing", "2026-10-05"), acct("Savings", "2026-10-10")], today);
    t.eq(two.lines, ["Chequing: balance you entered, as of Oct 5.", "Savings: balance you entered, as of Oct 10."], "2d different days: a line for each account");
    t.eq(two.stale && [two.stale.accountId, two.stale.days, two.stale.text], ["Chequing", 9, "Entered 9 days ago."], "2e more than 7 days old: \"Entered 9 days ago.\", for the oldest");
    t.eq(MB.enteredBalanceNote([acct("Chequing", "2026-10-07")], today).stale, null, "2f exactly 7 days old is not stale");
    t.eq(MB.enteredBalanceNote([acct("Chequing", "2026-10-06")], today).stale.text, "Entered 8 days ago.", "2g 8 days old is");
    const linked = { id: "p1", name: "TD", type: "depository", subtype: "checking", balance: 10, institution: "TD", _item: "i" };
    t.eq(MB.enteredBalanceNote([linked, ...D.demoAccountsFor("CA"), ...D.demoAccountsFor("US")], today), { lines: [], stale: null }, "2h linked accounts and both demos: no line at all");
    const copy = [one.lines[0], two.lines[0], two.stale.text, ...MB.BALANCE_COPY_STRINGS];
    t.eq(copy.filter(s => BANNED.test(s)), [], "2i no banned word in the new copy (sets aside, holds back, learns, remembers, smarter, covered)");
    t.eq(copy.flatMap(s => adviceProblems(s).map(p => `${s}: ${p}`)), [], "2j no sentence starts with a money instruction verb, and no verdict");
  }

  // ── 3. Statement import pre-fills the closing balance ───────────────────────────────────────────
  {
    const text = "Opening balance $1,800.00 ... Closing balance $1,234.56 Statement period Sep 1 - Sep 30, 2026";
    t.eq(SI.closingBalancePrefill({ closingBalance: 1234.56, period: { start: "2026-09-01", end: "2026-09-30" } }, text), { amount: 1234.56, asOf: "2026-09-30" },
      "3a PDF: a closing balance printed in the statement text is offered, dated the period's end");
    t.eq(SI.closingBalancePrefill({ closingBalance: 1234.57, period: { end: "2026-09-30" } }, text), null, "3b …one that does not appear in the text is not (the model never supplies a figure)");
    t.eq([SI.closingBalancePrefill({}, text), SI.closingBalancePrefill({ closingBalance: "n/a" }, text)], [null, null], "3c no closing balance, nothing offered");
    t.eq(SI.closingBalancePrefill({ closingBalance: 1234.56 }, text), { amount: 1234.56, asOf: null }, "3d no period: the amount, and the household picks the date");
    const oldestFirst = "Date,Description,Amount,Balance\n2026-09-02,Coffee,4.50,995.50\n2026-09-15,Groceries,95.50,900.00\n2026-09-29,Pay,-2000,2900.00";
    const newestFirst = "Date,Description,Amount,Balance\n2026-09-29,Pay,-2000,2900.00\n2026-09-15,Groceries,95.50,900.00\n2026-09-02,Coffee,4.50,995.50";
    t.eq([SI.csvClosingBalance(oldestFirst), SI.csvClosingBalance(newestFirst)], [{ amount: 2900, asOf: "2026-09-29" }, { amount: 2900, asOf: "2026-09-29" }],
      "3e CSV with a Balance column: the balance on the newest row, whichever way the file is sorted");
    t.eq([SI.csvClosingBalance("Date,Description,Amount\n2026-09-02,Coffee,4.50"), SI.csvClosingBalance("Date,Description,Amount,Balance\n2026-09-02,A,1,10\n2026-09-02,B,1,9"),
          SI.csvClosingBalance("Date,Description,Amount,Balance\n2026-09-02,A,1,10\n2026-09-29,B,1,abc")],
      [null, null, null], "3f no Balance column, a single day (order unknown), or an unreadable balance: nothing offered");
  }

  // ── 4. MATH-LOCK: entered balances give the same figures as linked ones ─────────────────────────
  const shared = (chqId) => ({
    profile: { name: "Sam", country: "CA", province: "ON" },
    incomes: [{ id: 1, label: "Pay", amount: "5200", freq: "monthly", anchorDay: 23, type: "employment" }],
    bills: [{ name: "Rent", amount: "1400", date: "1", nextDueDate: "2026-11-01", freq: "monthly" },
            { name: "Phone", amount: "60", date: "20", nextDueDate: "2026-10-20", freq: "monthly" }],
    transactions: [["2026-10-01", "FRESHCO", 120, "Groceries"], ["2026-10-05", "TIM HORTONS", 40, "Coffee & Dining"],
                   ["2026-10-09", "NO FRILLS", 160, "Groceries"], ["2026-10-12", "WINNERS", 100, "Shopping"]]
      .map(([date, name, amount, cat], i) => ({ id: `t${i}`, date, name, amount, cat, pending: false, account_id: chqId })),
  });
  // Due the 20th, before the 23rd payday, so the hand-worked figure below carries its $150 minimum: since the audit's
  // H1 fix (2026-10-26) only minimums due before the next deposit are reserved (it was due the 25th, after payday).
  const student = { id: "d-student", name: "Student loan", balance: "12000", rate: "5", min: "150", dueDay: 20 };
  // LINKED, as the app stores it: onPlaidSuccess's mapping, promoteAccounts, then the balance sync's debt rows.
  const plaid = [
    { id: "pl_chq", mask: "4521", type: "depository", subtype: "checking", balance: { available: 2150, current: 2175 } },
    { id: "pl_sav", mask: "8803", type: "depository", subtype: "savings", balance: { available: 3000, current: 3000 } },
    { id: "pl_card", mask: "2291", type: "credit", subtype: "credit card", balance: { available: 4360, current: 640 } },
    { id: "pl_loan", mask: "7788", type: "loan", subtype: "auto", balance: { current: 9800 } },
  ].map(a => ({ id: a.id, name: `TD ••${a.mask}`, type: a.type, subtype: a.subtype, balance: normalizeAccountBalance(a), institution: "TD", _item: "item_td" }));
  const promoted = promoteAccounts([], [student], plaid);
  const syncRows = promoted.accounts.filter(a => F.isCreditLiability(a) && !promoted.debts.some(d => d.account_id === a.id))
    .map(a => ({ name: a.name, balance: Math.abs(a.balance).toFixed(2), rate: "", min: "", fromBank: true, account_id: a.id }));
  const LINKED = { ...shared("pl_chq"), accounts: promoted.accounts, debts: [...promoted.debts, ...syncRows], bankConnected: promoted.bankConnected };
  // ENTERED: an imported statement (its rows and a $0 account, as commitStatementTxns makes it), then four balances typed in.
  let ENTERED = { ...shared("stmt_acct_0"), debts: [student], bankConnected: false,
    accounts: [{ id: "stmt_acct_0", name: "October statement", type: "checking", balance: 0, institution: "Statement", currency: "CAD" }] };
  ENTERED = MB.enterBalance(ENTERED, { accountId: "stmt_acct_0", kind: "chequing", amount: "2,150.00", asOf: "2026-10-14" }, today);
  ENTERED = MB.enterBalance(ENTERED, { kind: "savings", amount: "3000", asOf: "2026-10-14" }, today);
  ENTERED = MB.enterBalance(ENTERED, { kind: "card", amount: "640", asOf: "2026-10-14" }, today);
  ENTERED = MB.enterBalance(ENTERED, { kind: "loan", loanType: "auto", amount: "9,800", asOf: "2026-10-14" }, today);

  const figures = (data) => {
    const ss = SafeSpendEngine.calculate(data, today);
    const view = safeToSpendView(ss, { hasCashAccount: (data.accounts || []).some(F.isCashAccount), hasIncome: true });
    const pace = suggestedDailyView(view.headline, data.incomes, data.transactions, today, data);
    const watch = W.WATCH_RANGES.map(r => {
      const g = ForecastEngine.generate(data, Math.max(r, 30), null, today);
      const s = W.rangeSummary(g.forecast, r, { avgDailySpend: g.avgDailySpend });
      return `${r}d ${s.check.line} low ${s.text.low}`;
    });
    const nw = F.FinancialCalcEngine.netWorth(data);
    const debts = F.buildDebtListForSimulator(data.debts, data.liabilities, data).map(x => [x.balance, x.rate, x.min, !!x.rateEstimated]);
    return {
      safe: [ss.balance, ss.upcomingBills, ss.debtPayments, ss.safetyBuf, ss.savingsAlloc, ss.safeAmount, view.balanceText, view.headlineText],
      pace: [pace.dailyText, pace.daysLeft],
      watch,
      netWorth: [nw.assets, nw.liabilities, nw.netWorth, F.netWorthRows(data).total],
      coach: [DE.coachSafeToSpendLine(data, today), DE.coachPurchaseLine(data, "can I afford a $600 phone?", today),
              (data.accounts || []).filter(F.isCashAccount).reduce((s, a) => s + parseFloat(a.balance || 0), 0).toFixed(2), JSON.stringify(debts)],
      whatIf: [DE.displayedSafeToSpend(data, today), nw.liabilities],
      emergencyFund: F.FinancialCalcEngine.emergencyFundMonths(data, {}, today).toFixed(4),
    };
  };
  {
    const L = figures(LINKED), E = figures(ENTERED);
    t.eq(L.safe, [5150, 60, 150, 270, 156, 4514, "$5,150", "$4,514"], "4a LINKED, hand-worked: $5,150 − $60 − $150 − $270 − $156 = $4,514 safe to spend");
    t.eq(L.pace, ["$322", 14], "4b LINKED: pace $322 a day ($4,514 / 14 = $322.43, rounded down)");
    t.eq(L.netWorth, [5150, 22440, -17290, -17290], "4c LINKED: net worth $5,150 − $22,440 = −$17,290");
    // The student loan's $150 now falls on the 20th, inside these 7 days, beside the $60 phone bill (see `student`).
    t.eq(L.watch[0], "7d $5,150.00 + $0.00 − $210.00 − $210.00 = $4,730.00 low $4,730", "4d LINKED: Watch, 7 days: $5,150.00 + $0.00 − $210.00 − $210.00 = $4,730.00");
    for (const k of Object.keys(L)) t.eq(E[k], L[k], `4e ENTERED = LINKED: ${k}`);
    t.eq(E.safe[7], "$4,514", "4f the no-bank household reaches a real safe to spend: $4,514, not $0");
    // No bank, no statement: chequing typed in during onboarding, nothing else.
    const bare = MB.enterBalance({ ...shared("x"), transactions: [], debts: [], accounts: [] }, { kind: "chequing", amount: "2150", asOf: "2026-10-14" }, today);
    const bareLinked = { ...shared("pl_chq"), transactions: [], debts: [], accounts: [plaid[0]], bankConnected: true };
    t.eq(figures(bare), figures(bareLinked), "4g chequing only, no transactions: the same figures as the same chequing linked");
    t.eq(figures(bare).safe.slice(5), [1934, "$2,150", "$1,934"], "4h …$2,150 − $60 − $156 = $1,934 safe to spend");
  }

  // ── 5. Linked households and both demos are unchanged ───────────────────────────────────────────
  {
    const demo = (c) => ({ profile: D.demoProfileFor(c), accounts: D.demoAccountsFor(c), debts: D.demoDebtsFor(c, today), incomes: D.buildDemoIncomes(today, c),
      bills: D.buildDemoBills(today, c), transactions: D.buildDemoTxns(today, c), bankConnected: true, demo: true });
    const ca = figures(demo("CA")), us = figures(demo("US"));
    t.eq([ca.safe[6], ca.safe[7], ca.pace[0]], ["$3,083", "$1,944", "$138"], "5a CA demo: $3,083 in accounts, $1,944 safe to spend, $138 pace");
    t.eq(ca.watch.map(x => x.split(" low ")[0]), ["7d $3,083.88 + $0.00 − $65.00 − $234.23 = $2,784.65", "30d $3,083.88 + $6,240.00 − $2,176.99 − $1,003.85 = $6,143.04",
      "90d $3,083.88 + $18,720.00 − $6,530.97 − $3,011.55 = $12,261.36"], "5b CA demo: the Watch 7/30/90 check lines, as main b003f5b printed them on this date");
    t.eq(MB.enteredBalanceNote(LINKED.accounts, today), { lines: [], stale: null }, "5c a linked household's How we got this carries no entered line");
    t.eq([us.safe[6], us.safe[7], us.pace[0], ca.netWorth[3], us.netWorth[3]], ["$3,672", "$2,415", "$172", 12593.88, 18692.55], "5d US demo $3,672 / $2,415 / $172; net worth CA $12,593.88, US $18,692.55");
    t.eq(us.watch.map(x => x.split(" low ")[0]), ["7d $3,672.55 + $0.00 − $0.00 − $304.09 = $3,368.46", "30d $3,672.55 + $5,350.00 − $2,370.99 − $1,303.26 = $5,348.30",
      "90d $3,672.55 + $16,050.00 − $7,112.97 − $3,909.79 = $8,699.79"], "5e US demo: Watch 7/30/90 check lines unchanged");
    t.ok(D.demoAccountsFor("CA").every(a => !MB.isEditableAccount(a)) && D.demoAccountsFor("US").every(a => !MB.isEditableAccount(a)), "5f no demo account is editable");
    t.ok(LINKED.accounts.every(a => !MB.isEditableAccount(a)), "5g no linked account is editable: they stay bank-fed");
  }

  // ── 6. The screens ───────────────────────────────────────────────────────────────────────────────
  let A = {};
  try { A = loadApp(["HowWeGotThis", "BalanceForm", "ManualBalanceStep", "SettingsSectionContent", "Dashboard"]); } catch (e) { t.ok(false, `App.jsx bundles the balance screens: ${describe(e)}`); }
  const noop = () => {};
  const render = (C, props) => { try { return textOf(A.render(A.h(C, props))); } catch (e) { return `render failed: ${describe(e)}`; } };
  {
    const note = { lines: ["Balance you entered, as of Oct 5."], stale: { accountId: "m1", days: 9, text: "Entered 9 days ago." } };
    const txt = render(A.HowWeGotThis, { title: "Safe to spend", value: "$4,514", inputs: [{ label: "In your accounts", value: "$5,150" }], entered: note, onUpdateBalance: noop, onClose: noop });
    t.ok(/Balance you entered, as of Oct 5\./.test(txt) && /Entered 9 days ago\.\s*Update/.test(txt), `6a How we got this: the entered line, and "Entered 9 days ago." with Update ("${txt.slice(0, 220)}")`);
    const plain = render(A.HowWeGotThis, { title: "Safe to spend", value: "$1,944", inputs: [{ label: "In your accounts", value: "$3,083" }], onClose: noop });
    t.ok(!/entered/i.test(plain), "6b with no entered balance it reads as before");

    const card = { id: "m2", name: "Credit card", type: "credit", subtype: "credit card", balance: -640, institution: "Manual", balanceEntered: true, balanceAsOf: "2026-10-14" };
    const sheet = render(A.BalanceForm, { account: card, onSubmit: noop, onCancel: noop });
    t.ok(/Amount owed/.test(sheet) && /As of/.test(sheet) && /Chequing/.test(sheet) && /Loan/.test(sheet), `6c the balance editor: kind, amount owed for a card, the as-of date ("${sheet.slice(0, 200)}")`);
    let html = "";
    try { html = A.render(A.h(A.BalanceForm, { account: { ...card, balance: -2150 }, onSubmit: noop, onCancel: noop })); } catch (e) { html = describe(e); }
    t.ok(/value="2,150\.00"/.test(html) && /value="2026-10-14"/.test(html), "6c2 the editor opens on the entered amount, \"2,150.00\", and its as-of date");
    const step = render(A.ManualBalanceStep, { onDone: noop, onSkip: noop });
    t.ok(/Your chequing balance/.test(step) && /As of/.test(step) && /Not now/.test(step), `6d onboarding asks for the chequing balance ("${step.slice(0, 200)}")`);
    t.ok(/bankStage==="skipped"&&<ManualBalanceStep/.test(APP), "6e …on the \"Enter it myself\" path, before income, bills and Today");

    const accts = [{ id: "m1", name: "Chequing", type: "depository", subtype: "checking", balance: 2150, institution: "Manual", balanceEntered: true, balanceAsOf: "2026-10-14" },
                   { id: "p1", name: "TD ••4521", type: "depository", subtype: "checking", balance: 900, institution: "TD", _item: "item1" }];
    const settings = render(A.SettingsSectionContent, { sectionKey: "accounts", data: { accounts: accts }, setAppData: noop, color: "#00f", onAddBank: noop });
    t.eq([(settings.match(/Update balance/g) || []).length, /as of Oct 14/.test(settings), /Manage in Connected Banks/.test(settings), /Add an account/.test(settings)], [1, true, true, true],
      `6f Settings → Accounts: Update balance on the manual account only, its as-of date, the linked one stays bank-fed, and Add an account ("${settings.slice(0, 260)}")`);

    const staleHome = MB.enterBalance({ ...shared("x"), transactions: [], debts: [], accounts: [] }, { kind: "chequing", amount: "2150", asOf: "2026-10-05" }, today);
    const home = render(A.Dashboard, { data: staleHome, setAppData: noop, setScreen: noop, setShowNotifs: noop, onUpgrade: noop, onWhatIf: noop });
    t.ok(/Entered 9 days ago\.\s*Update/.test(home), `6g Today: one quiet line, "Entered 9 days ago." with Update ("${home.slice(home.indexOf("Entered") - 60, home.indexOf("Entered") + 60)}")`);
    t.eq((home.match(/Entered 9 days ago/g) || []).length, 1, "6h …once");
    const fresh = render(A.Dashboard, { data: bareOf(MB, shared, today), setAppData: noop, setScreen: noop, setShowNotifs: noop, onUpgrade: noop, onWhatIf: noop });
    t.ok(!/Entered \d+ days? ago/.test(fresh) && /\$1,934/.test(fresh), "6i a balance entered today: no stale line, and Today shows $1,934");
    // Watch's starting balance and net worth say the same.
    let WX = {};
    try { WX = loadApp(["watchRangeExplanation"]); } catch (e) { t.ok(false, `App.jsx bundles watchRangeExplanation: ${describe(e)}`); }
    try {
      const g = ForecastEngine.generate(bareOf(MB, shared, today), 30, null, today);
      const S = W.rangeSummary(g.forecast, 7, { avgDailySpend: g.avgDailySpend });
      const ex = WX.watchRangeExplanation("start", { summary: S, range: 7, forecast: g.forecast, avgDailySpend: g.avgDailySpend, data: bareOf(MB, shared, today), watchIncome: {}, close: noop });
      t.eq(ex.entered && ex.entered.lines, ["Balance you entered, as of Oct 14."], "6k Watch, Starting balance: \"Balance you entered, as of Oct 14.\"");
    } catch (e) { t.ok(false, `6k Watch, Starting balance: ${describe(e)}`); }
    t.ok(/entered=\{ex\.entered\}/.test(APP) && (APP.match(/entered=\{enteredBalanceNote\(/g) || []).length >= 2 && /entered=\{cashNote\}/.test(APP),
      "6l How we got this carries the entered line for safe to spend, both Watch starting-balance sheets and net worth");
    const noCash = render(A.Dashboard, { data: { ...shared("x"), accounts: [], transactions: [] }, setAppData: noop, setScreen: noop, setShowNotifs: noop, onUpgrade: noop, onWhatIf: noop });
    t.ok(/Enter your balance/.test(noCash), "6j with no account Today offers to enter a balance");
  }

  // ── 7. Fix round: Today says where safe to spend came from, and never "Debt free!" on no record ──
  {
    const entered = (id, extra = {}) => ({ id, name: id, type: "depository", subtype: "checking", balance: 100, institution: "Manual", balanceEntered: true, balanceAsOf: "2026-10-14", ...extra });
    const linked = { id: "p1", name: "TD ••4521", type: "depository", subtype: "checking", balance: 900, institution: "TD", _item: "item1" };
    t.eq(MB.balanceSourceLine([entered("Chequing"), entered("Savings", { subtype: "savings" })]), { kind: "entered", text: "From the balance you entered." },
      "7a only entered balances behind safe to spend: \"From the balance you entered.\"");
    t.eq(MB.balanceSourceLine([linked, entered("Savings")]), { kind: "mixed", text: "From your bank and the balances you entered." },
      "7b linked and entered: \"From your bank and the balances you entered.\"");
    t.eq([MB.balanceSourceLine([linked]), MB.balanceSourceLine([]), MB.balanceSourceLine(D.demoAccountsFor("CA")), MB.balanceSourceLine(D.demoAccountsFor("US")),
          MB.balanceSourceLine([{ id: "stmt_acct_0", type: "checking", balance: 0, institution: "Statement" }])],
      [null, null, null, null, null], "7c linked only, none, both demos, and a statement with no balance entered: no source line (unchanged)");

    const noRecord = { debts: [], accounts: [entered("Chequing")] };
    t.eq([MB.debtTileKind(noRecord, 0), MB.debtTileKind({ ...noRecord, debts: [{ id: "d1", name: "Visa", balance: "0" }] }, 0),
          MB.debtTileKind({ debts: [], accounts: [{ id: "c1", type: "credit", subtype: "credit card", balance: 0, institution: "TD", _item: "i" }] }, 0),
          MB.debtTileKind({ debts: [{ id: "d1", name: "Visa", balance: "640" }], accounts: [] }, 640)],
      ["none", "free", "free", "total"], "7d no debts and no card or loan account: \"none\"; debts on record all at $0: \"free\"; anything owed: \"total\"");
    const demoData = (c) => ({ accounts: D.demoAccountsFor(c), debts: D.demoDebtsFor(c), profile: D.demoProfileFor(c) });
    t.eq([MB.debtTileKind(demoData("CA"), F.FinancialCalcEngine.netWorth(demoData("CA")).liabilities), MB.debtTileKind(demoData("US"), F.FinancialCalcEngine.netWorth(demoData("US")).liabilities)],
      ["total", "total"], "7e both demos keep their Total debt tile");
    const fixCopy = ["From the balance you entered.", "From your bank and the balances you entered.", "No debts entered", "Add a debt"];
    t.eq(fixCopy.filter(s => BANNED.test(s)), [], "7f the new strings use no banned word");
    t.eq(fixCopy.flatMap(s => adviceProblems(s).map(p => `${s}: ${p}`)), [], "7g …and no sentence starts with a money instruction verb");

    const home = (data) => render(A.Dashboard, { data, setAppData: noop, setScreen: noop, setShowNotifs: noop, onUpgrade: noop, onWhatIf: noop, setGoalsTab: noop });
    const E = home(bareOf(MB, shared, today));
    t.ok(/From the balance you entered\./.test(E) && !/estimated/i.test(E) && !/Connect bank for real numbers/.test(E),
      `7h Today, entered only: the source line, and no "· estimated" tag or "Estimated · Connect bank" line ("${E.slice(E.indexOf("Safe to spend until"), E.indexOf("Safe to spend until") + 260)}")`);
    t.ok(/No debts entered\s*Add\b/.test(E) && !/Debt free!/.test(E) && !/Amazing!/.test(E), "7i …\"No debts entered\" with Add, never \"Debt free! Amazing!\"");
    const linkedHome = { ...shared("pl_chq"), transactions: [], debts: [], accounts: [{ ...linked, id: "pl_chq", balance: 2150 }], bankConnected: true };
    const L = home(linkedHome);
    t.ok(/· live/.test(L) && !/From the balance you entered|From your bank and the balances/.test(L) && !/Connect bank for real numbers/.test(L),
      "7j Today, linked only: \"· live\" as before, no source line");
    const mixed = MB.enterBalance(linkedHome, { kind: "savings", amount: "3000", asOf: "2026-10-14" }, today);
    const M = home(mixed);
    t.ok(/From your bank and the balances you entered\./.test(M) && /· live/.test(M) && !/Connect bank for real numbers/.test(M), "7k Today, mixed: \"From your bank and the balances you entered.\"");
    // An account from before this change: Manual, a balance, no "as of" date (nothing was entered here).
    const legacy = { ...shared("m1"), transactions: [], debts: [], accounts: [{ id: "m1", name: "Chequing", type: "checking", balance: 2150, institution: "Manual" }] };
    const S0 = home(legacy);
    t.ok(/· estimated/.test(S0) && /Estimated · Connect bank for real numbers/.test(S0) && !/From the balance/.test(S0), "7l an account with no balance entered reads as before: \"· estimated\" and the Estimated line");
    const paidOff = home({ ...bareOf(MB, shared, today), debts: [{ id: "d1", name: "Visa", balance: "0", rate: "19.99", min: "" }] });
    t.ok(/All entered debts are at \$0\./.test(paidOff) && !/No debts entered|Debt free|Amazing!|🎉/.test(paidOff), "7m debts on record, all at $0: exactly \"All entered debts are at $0.\"");
    const SRC = [APP, ...fs.readdirSync(path.join(REPO, "src", "lib")).filter(f => f.endsWith(".js")).map(f => fs.readFileSync(path.join(REPO, "src", "lib", f), "utf8"))].join("\n");
    t.ok(!/Debt free!|Amazing!/.test(SRC), "7m2 \"Debt free!\" and \"Amazing!\" appear nowhere in src");
    t.ok(!BANNED.test("All entered debts are at $0.") && !adviceProblems("All entered debts are at $0.").length, "7m3 the new sentence passes both copy rules");
    for (const c of D.DEMO_COUNTRIES) {
      const d = { profile: D.demoProfileFor(c), accounts: D.demoAccountsFor(c), debts: D.demoDebtsFor(c, today), incomes: D.buildDemoIncomes(today, c),
        bills: D.buildDemoBills(today, c), transactions: D.buildDemoTxns(today, c), bankConnected: true, demo: true };
      const txt = home(d);
      t.ok(/Total debt/.test(txt) && !/No debts entered|From the balance you entered|From your bank and the balances/.test(txt), `7n ${c} demo Today: Total debt as before, no source line`);
    }
    t.ok(/<Sheet title="Add a debt"/.test(APP) && /<InlineDebtEditor[^>]*startAdding/.test(APP), "7o Add opens the debt editor, ready to add one");

    // (a) Today's header: no linked bank, nothing here is "Live".
    const DS = await import("../src/lib/demoStatus.js");
    const NOW = Date.now();
    t.eq([DS.statusChip({ demo: false, lastRefreshRaw: null, nowMs: NOW, bankConnected: false, enteredBalances: true }),
          DS.statusChip({ demo: false, lastRefreshRaw: null, nowMs: NOW, bankConnected: false, enteredBalances: false }),
          DS.statusChip({ demo: false, lastRefreshRaw: null, nowMs: NOW, bankConnected: true, enteredBalances: true }),
          DS.statusChip({ demo: true, lastRefreshRaw: null, nowMs: NOW, bankConnected: false, enteredBalances: true }).label],
      [{ label: "Balances you entered", detail: "" }, null, { label: "Live", detail: "· up to date" }, DS.DEMO_STATUS_LABEL],
      "7p header chip: no bank and balances entered, \"Balances you entered\"; no bank and nothing entered, no chip; a linked bank, \"Live · up to date\" as before; demo as before");
    t.ok(/Balances you entered/.test(E) && !/Live\s*· up to date/.test(E), "7q Today, entered only: the header says \"Balances you entered\", not \"Live · up to date\"");
    t.ok(/Live\s*· up to date/.test(L) && !/Balances you entered/.test(L), "7r Today, linked only: \"Live · up to date\", unchanged");
    t.ok(!/Live\s*·/.test(S0) && !/Balances you entered/.test(S0), "7s Today, no bank and no balance entered: no chip at all");
    for (const s of [DS.ENTERED_STATUS_LABEL]) t.ok(!BANNED.test(s) && !adviceProblems(s).length, `7t "${s}" passes both copy rules`);

    // (b) The setup checklist ticks "bank" for an entered chequing balance, under its new name.
    const CK = await import("../src/lib/setupChecklist.js");
    const bankItem = (d) => CK.setupChecklist(d).find(i => i.id === "bank");
    t.eq(bankItem({}).label, "Bank linked, statement imported or balance entered", "7u the checklist item is renamed");
    t.eq([bankItem({ accounts: [entered("Chequing")] }).done, bankItem({ accounts: [{ id: "m1", type: "checking", institution: "Manual", balance: 0 }] }).done,
          bankItem({ accounts: [entered("Savings", { subtype: "savings" })] }).done, bankItem({ bankConnected: true }).done, bankItem({ accounts: [{ institution: "Statement" }] }).done],
      [true, false, false, true, true], "7v it ticks for an entered chequing balance (not a $0 placeholder or savings alone); a bank or a statement still tick it");
    t.ok(!BANNED.test(bankItem({}).label) && !adviceProblems(bankItem({}).label).length, "7w the new name passes both copy rules");
    t.ok(/✓\s*Bank linked, statement imported or balance entered\s*, done/.test(E), "7x Today's checklist shows the renamed item, ticked, for a household that entered its chequing balance");
  }

  process.exitCode = t.summary("manualBalances") ? 1 : 0;
})();

function bareOf(MB, shared, today) {
  return MB.enterBalance({ ...shared("x"), transactions: [], debts: [], accounts: [] }, { kind: "chequing", amount: "2150", asOf: "2026-10-14" }, today);
}
