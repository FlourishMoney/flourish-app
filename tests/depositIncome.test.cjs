// tests/depositIncome.test.cjs
// -----------------------------------------------------------------------------
// ASK, DON'T GUESS: a deposit counts as income only once it repeats in a pay-like pattern, or the
// household confirms it (src/lib/depositClassify.js).
//
// The defect: income detection took any deposit with "deposit" in its name as pay. One expense
// reimbursement could double a household's projected income (it flipped the detected cadence from
// every two weeks to weekly), and a single e-transfer from a friend could create an income by itself.
//
// Covers, for every kind of household (salaried, shift and gig work, benefits, roommates, separated
// parents):
//   1. a reimbursement deposit no longer raises projected income, and cannot anchor a payday
//   2. a single e-transfer from a person is not income until confirmed, and is raised once
//   3. a real new job's pay IS picked up once it repeats (and gig, benefit and quarterly patterns)
//   4. "Always for deposits from <merchant>" with the bank-noise guard
//   5. marking a past deposit "This isn't income" in Activity
//   6. bank transactions are never altered
//
// Frozen dates only.
// -----------------------------------------------------------------------------
"use strict";

const { create } = require("./_runner.cjs");

(async () => {
  const D = await import("../src/lib/depositClassify.js");
  const { detectIncomeFromTxns } = await import("../src/lib/plaidNormalize.js");
  const { ForecastEngine } = await import("../src/lib/forecastEngine.js");
  const { FinancialCalcEngine, toMonthly } = await import("../src/lib/financialCalculations.js");
  const { isUsableMerchantKey } = await import("../src/lib/categoryOverrides.js");
  const t = create();

  const TODAY = new Date(2026, 2, 30, 12, 0, 0); // Mon Mar 30 2026
  const ago = (n) => { const d = new Date(TODAY); d.setDate(d.getDate() - n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  const dep = (id, n, name, amount, cat = "Income", extra = {}) => ({ id, date: ago(n), name, amount: -Math.abs(amount), cat, ...extra });
  const spend = (id, n, name, amount, cat = "Groceries") => ({ id, date: ago(n), name, amount, cat });
  const chq = [{ id: "chq", name: "Chequing", type: "depository", subtype: "checking", balance: 1500 }];
  const hh = (transactions, extra = {}) => ({ accounts: chq, incomes: [], bills: [], debts: [], transactions, ...extra });
  const income30 = (data) => ForecastEngine.generate(data, 30, null, TODAY).forecast.reduce((s, e) => s + e.income, 0);

  // ── 1. A reimbursement no longer raises projected income ──────────────────────────────────────
  {
    // Pay every two weeks (29, 15 and 1 days ago), and one expense reimbursement 8 days ago.
    const pay = [dep("p1", 29, "ACME PAYROLL", 2000), dep("p2", 15, "ACME PAYROLL", 2000), dep("p3", 1, "ACME PAYROLL", 2000)];
    const reimb = dep("r1", 8, "ACME EXPENSE REIMBURSEMENT DEPOSIT", 1200);
    const txns = [...pay, reimb, spend("s1", 3, "LOBLAWS", 80)];
    const data = hh(txns);

    // What the old detector did with it: four "deposits" a week apart, so pay became WEEKLY.
    const raw = detectIncomeFromTxns(txns);
    t.eq(raw.freq, "weekly", "sanity: read raw, the reimbursement makes a two-weekly paycheque look weekly");
    const fixed = detectIncomeFromTxns(D.incomeEvidence(data));
    t.eq(fixed.freq, "biweekly", "held out, the pay is correctly every two weeks");
    t.eq(fixed.perDeposit, 2000, "and $2,000 a deposit");

    // The income each would create (the app's auto-adopt path), and what the forecast then projects.
    const asIncome = (d) => [{ id: 1, label: d.label, amount: String(d.perDeposit), freq: d.freq, anchorDay: d.anchorDay }];
    const rawMonthly = FinancialCalcEngine.cashFlow(hh(txns, { incomes: asIncome(raw) }), {}, TODAY).monthlyIncome;
    const fixedMonthly = FinancialCalcEngine.cashFlow(hh(txns, { incomes: asIncome(fixed) }), {}, TODAY).monthlyIncome;
    t.approx(fixedMonthly, toMonthly(2000, "biweekly"), 0.01, "monthly income is $2,000 every two weeks");
    t.ok(rawMonthly > fixedMonthly * 1.9, `sanity: the old reading roughly doubled it ($${Math.round(rawMonthly)} vs $${Math.round(fixedMonthly)})`);
    const withReimb = income30(hh(txns, { incomes: asIncome(fixed) }));
    const withoutReimb = income30(hh(txns.filter(x => x !== reimb), { incomes: asIncome(detectIncomeFromTxns(D.incomeEvidence(hh(txns.filter(x => x !== reimb)))) ) }));
    t.eq(withReimb, withoutReimb, "the reimbursement adds nothing to 30 days of projected income");
    t.eq(D.depositStatus(reimb, D.depositContext(data)).counts, false, "the reimbursement does not count as income");
    t.eq(D.depositsToAsk(data, TODAY).map(x => x.id), ["r1"], "and it is the one deposit raised: \"Is this income?\"");
  }
  {
    // An entered income, and a reimbursement within 8% of the paycheque: it must not become the payday anchor.
    const inc = [{ id: 1, label: "Main job", amount: "2000", freq: "biweekly" }];
    const pay = [dep("p1", 26, "ACME PAYROLL", 2000), dep("p2", 12, "ACME PAYROLL", 2000)];
    const reimb = dep("r1", 3, "EXPENSE REIMB DEPOSIT", 1950);
    const days = (d) => ForecastEngine.generate(d, 30, null, TODAY).forecast.filter(e => e.isPayday).map(e => e.day);
    t.eq(days(hh([...pay, reimb], { incomes: inc })), days(hh(pay, { incomes: inc })),
         "a reimbursement near the pay amount does not move the projected paydays");
    t.eq(days(hh(pay, { incomes: inc })), [2, 16, 30], "paydays stay phased off the real pay (12 days ago + 14)");
  }

  // ── 2. A single e-transfer from a person is not counted until confirmed ────────────────────────
  {
    const et = dep("e1", 4, "INTERAC E-TRANSFER FROM JAMIE LEE", 400, "Transfer", { isTransfer: true });
    const data = hh([et, spend("s1", 2, "COSTCO", 120)]);
    const ctx = D.depositContext(data);
    t.eq(D.depositLook(et), "etransfer", "it looks like an e-transfer from a person");
    t.eq(D.depositStatus(et, ctx).counts, false, "a single e-transfer is not income");
    t.eq(D.depositStatus(et, ctx).why, "held", "it is held out, not decided");
    t.eq(detectIncomeFromTxns(D.incomeEvidence(data)), null, "income detection finds nothing to create");
    t.eq(D.depositsToAsk(data, TODAY).map(x => x.id), ["e1"], "it is raised: \"Is this income?\"");

    const yes = { ...data, depositDecisions: D.decideDeposit({}, et, "income", TODAY) };
    t.eq(D.depositStatus(et, D.depositContext(yes)).counts, true, "confirmed as income, it counts");
    t.ok(D.incomeEvidence(yes).includes(et), "and income detection may use it");
    t.eq(D.depositsToAsk(yes, TODAY).length, 0, "and it is not asked about again");

    for (const r of D.NOT_INCOME_REASONS) {
      const no = { ...data, depositDecisions: D.decideDeposit({}, et, r, TODAY) };
      t.ok(!D.depositStatus(et, D.depositContext(no)).counts && D.depositsToAsk(no, TODAY).length === 0, `answered "${D.reasonLabel(r)}": not income, not asked again`);
    }
    const later = { ...data, depositDecisions: D.decideDeposit({}, et, D.NOT_NOW, TODAY) };
    t.eq(D.depositsToAsk(later, TODAY).length, 0, "\"Not now\" means raised once: it is not asked again");
    t.eq(D.depositStatus(et, D.depositContext(later)).counts, false, "and it still does not count");

    const small = hh([dep("e2", 2, "INTERAC E-TRANSFER FROM SAM", 30, "Transfer")]);
    t.eq(D.depositsToAsk(small, TODAY).length, 0, `a $30 e-transfer is too small to ask about (min $${D.ASK_MIN_AMOUNT})`);
    const old = hh([dep("e3", 45, "INTERAC E-TRANSFER FROM SAM", 300, "Transfer")]);
    t.eq(D.depositsToAsk(old, TODAY).length, 0, `one older than ${D.ASK_WINDOW_DAYS} days is not raised`);
    const own = hh([dep("t1", 3, "TRANSFER FROM SAVINGS", 500, "Transfer", { isTransfer: true, transferPairId: "x+t1" })]);
    t.eq(D.depositStatus(own.transactions[0], D.depositContext(own)).why, "own-move", "a paired move from the household's own savings is never income");
    t.eq(D.depositsToAsk(own, TODAY).length, 0, "and needs no question");
    const unpaired = hh([dep("t2", 3, "ONLINE TRANSFER FROM ACCT 4411", 500, "Transfer", { isTransfer: true })]);
    t.eq(D.depositsToAsk(unpaired, TODAY).length, 1, "an unpaired \"transfer\" is held out and raised once");
  }

  // ── 3. A real new job's pay is picked up once it repeats ──────────────────────────────────────
  {
    const first = dep("j1", 16, "NORTHWIND LTD PAY", 1800);
    const one = hh([first]);
    t.eq(D.depositStatus(first, D.depositContext(one)).counts, false, "the first cheque from a new job is not income yet");
    t.eq(D.depositsToAsk(one, TODAY).map(x => x.id), ["j1"], "it is raised, so the household can say yes now");
    const second = dep("j2", 2, "NORTHWIND LTD PAY", 1800);
    const two = hh([first, second]);
    t.ok(D.depositStatus(first, D.depositContext(two)).counts && D.depositStatus(second, D.depositContext(two)).counts, "once it repeats two weeks later, both count");
    const det = detectIncomeFromTxns(D.incomeEvidence(two));
    t.ok(det && det.perDeposit === 1800 && det.freq === "biweekly", `and income detection picks up $1,800 every two weeks (${det && det.perDeposit}/${det && det.freq})`);
    t.eq(D.depositsToAsk(two, TODAY).length, 0, "and nothing is asked any more");

    const gig = hh([dep("g1", 21, "UBER BV PAYOUT", 310), dep("g2", 14, "UBER BV PAYOUT", 880), dep("g3", 7, "UBER BV PAYOUT", 540)]);
    t.ok(gig.transactions.every(x => D.depositStatus(x, D.depositContext(gig)).counts), "gig payouts that swing week to week still count once they repeat weekly");
    const gst = hh([dep("q1", 91, "GST/HST CREDIT CANADA", 160), dep("q2", 0, "GST/HST CREDIT CANADA", 160)]);
    t.ok(gst.transactions.every(x => D.depositStatus(x, D.depositContext(gst)).counts), "a quarterly GST/HST credit counts once it repeats");
    const ccb = hh([dep("c1", 50, "CANADA CHILD BENEFIT", 560), dep("c2", 20, "CANADA CHILD BENEFIT", 560)]);
    t.ok(ccb.transactions.every(x => D.depositStatus(x, D.depositContext(ccb)).counts), "a monthly benefit counts once it repeats");
    const support = hh([dep("f1", 62, "E-TRANSFER FROM R MARTIN", 800, "Transfer"), dep("f2", 31, "E-TRANSFER FROM R MARTIN", 800, "Transfer"), dep("f3", 1, "E-TRANSFER FROM R MARTIN", 800, "Transfer")]);
    t.ok(support.transactions.every(x => D.depositStatus(x, D.depositContext(support)).counts), "a steady monthly e-transfer from one person (child support) counts after three");
    t.ok(!D.depositStatus(support.transactions[0], D.depositContext(hh(support.transactions.slice(0, 2)))).counts, "but not after two: a person's e-transfers need three, at a steady amount");
    const swing = hh([dep("w1", 62, "E-TRANSFER FROM SAM", 40, "Transfer"), dep("w2", 31, "E-TRANSFER FROM SAM", 300, "Transfer"), dep("w3", 1, "E-TRANSFER FROM SAM", 95, "Transfer")]);
    t.ok(!D.depositStatus(swing.transactions[0], D.depositContext(swing)).counts, "a friend's e-transfers of any size are not a paycheque");
    const anon = hh([dep("a1", 62, "E-TRANSFER DEPOSIT", 800, "Transfer"), dep("a2", 31, "E-TRANSFER DEPOSIT", 800, "Transfer"), dep("a3", 1, "E-TRANSFER DEPOSIT", 800, "Transfer")]);
    t.ok(!D.depositStatus(anon.transactions[0], D.depositContext(anon)).counts, "deposits the bank doesn't name the sender of never form a pattern on their own");
    const refunds = hh([dep("x1", 9, "AMAZON.CA REFUND", 80, "Shopping"), dep("x2", 6, "AMAZON.CA REFUND", 60, "Shopping")]);
    t.ok(!D.depositStatus(refunds.transactions[0], D.depositContext(refunds)).counts, "two refunds a few days apart are not pay");
  }

  // ── 4. "Always for deposits from <merchant>", and the bank-noise guard ─────────────────────────
  {
    const et1 = dep("e1", 20, "INTERAC E-TRANSFER FROM JAMIE LEE", 450, "Transfer");
    const et2 = dep("e2", 2, "INTERAC E-TRANSFER FROM JAMIE LEE", 450, "Transfer");
    const rules = D.setDepositRule({}, et1.name, "shared", TODAY);
    const key = Object.keys(rules)[0];
    t.ok(!!key && D.isUsableDepositKey(key), `a rule is written against the sender (${key})`);
    const data = hh([et1, et2], { depositRules: rules });
    t.eq(D.depositStatus(et2, D.depositContext(data)).reason, "shared", "a later deposit from the same person is a shared bill with no question");
    t.eq(D.depositsToAsk(data, TODAY).length, 0, "and it is not raised");
    t.eq(D.countDepositsFrom(data.transactions, et1.name), 2, "the confirmation can say how many deposits the rule covers");
    t.eq(D.depositRuleFor(rules, et2.name), "shared", "the rule can be shown on any of its deposits");
    const decided = { ...data, depositDecisions: D.decideDeposit({}, et2, "income", TODAY) };
    t.eq(D.depositStatus(et2, D.depositContext(decided)).counts, true, "an answer on one deposit wins over the rule");
    t.eq(D.clearDepositRule(rules, et1.name), {}, "and the rule can be removed");

    const employer = dep("n1", 3, "NORTHWIND LTD PAY", 1800);
    const ruledIn = hh([employer], { depositRules: D.setDepositRule({}, employer.name, "income", TODAY) });
    t.eq(D.depositStatus(employer, D.depositContext(ruledIn)).counts, true, "\"Always income\" for an employer counts the first deposit");

    // The guard: generic bank wording cannot carry a rule, or it would swallow every such deposit.
    for (const name of ["E-TRANSFER DEPOSIT", "INTERAC E-TRANSFER", "MOBILE DEPOSIT", "BRANCH DEPOSIT 0042", "DEPOSIT", "ATM DEPOSIT", "E-TRANSFER DEPOSIT FROM", "ONLINE TRANSFER FROM SAVINGS"]) {
      t.eq(D.setDepositRule({}, name, "reimbursement", TODAY), {}, `no rule for "${name}"`);
    }
    t.ok(isUsableMerchantKey("mobile deposit") && !D.isUsableDepositKey("mobile deposit"),
         "sanity: the spending guard would accept \"mobile deposit\"; the deposit guard does not");
    t.ok(D.isUsableDepositKey("northwind ltd pay") && D.isUsableDepositKey("interac e-transfer from jamie lee"), "a named payer or person passes");
    t.eq(D.setDepositRule({}, "NORTHWIND LTD PAY", "bogus", TODAY), {}, "an unknown reason is refused");
    for (const name of ["ZELLE PAYMENT FROM", "VENMO CASHOUT", "INTERNET TRANSFER", "WIRE TRANSFER IN", "INTEREST PAID", "PAYMENT - THANK YOU"]) {
      t.eq(D.setDepositRule({}, name, "gift", TODAY), {}, `no rule for "${name}" (names no sender)`);
    }
    t.ok(D.isUsableDepositKey("zelle payment from sam rivera"), "a named person on a payment network still passes");
    const empty = { transactions: [dep("z", 2, "X PAYROLL", 100)] };
    t.ok(D.depositContext(empty) === D.depositContext({ transactions: empty.transactions }), "with no answers yet, the context is computed once and reused");

    // Statement rows are renumbered on every import, so an answer is keyed on what the row says.
    const a = { id: "stmt_4", date: "2026-03-20", name: "ACME EXPENSE REIMB", amount: -300 };
    const b = { id: "stmt_9", date: "2026-03-20", name: "ACME EXPENSE REIMB", amount: -300 };
    t.eq(D.depositTxnKey(a), D.depositTxnKey(b), "the same statement row, renumbered, keeps its answer");
    t.eq(D.depositTxnKey({ id: "plaid_abc", date: "x", name: "y", amount: -1 }), "plaid_abc", "a bank id is used as-is");
  }

  // ── 5. Activity: "This isn't income" on a deposit that was counting ────────────────────────────
  {
    const pays = [dep("p1", 29, "ACME PAYROLL", 2000), dep("p2", 15, "ACME PAYROLL", 2000), dep("p3", 1, "ACME PAYROLL", 2000)];
    const base = hh(pays);
    t.ok(D.depositStatus(pays[1], D.depositContext(base)).counts, "sanity: a repeating pay deposit counts");
    const marked = { ...base, depositDecisions: D.decideDeposit({}, pays[1], "reimbursement", TODAY) };
    t.eq(D.depositStatus(pays[1], D.depositContext(marked)).counts, false, "marked a reimbursement, it stops counting");
    t.ok(!D.incomeEvidence(marked).includes(pays[1]) && D.incomeEvidence(marked).includes(pays[0]), "only that deposit leaves the income evidence");
    const undone = { ...marked, depositDecisions: D.clearDepositDecision(marked.depositDecisions, pays[1]) };
    t.eq(D.depositStatus(pays[1], D.depositContext(undone)).counts, true, "undoing the answer restores it");
  }

  // ── 7. The "Always for deposits from ..." toggle starts off, and the payer is shown as the bank wrote it ─
  {
    const fs = require("fs"), path = require("path");
    const r1 = dep("r1", 4, "Expense Reimbursement Northwind", 286.4);
    const plain = hh([r1]);
    for (const mode of ["ask", "mark"]) {
      t.eq(D.depositSheetInitial(r1, D.depositContext(plain), mode).always, false, `"${mode}" sheet: Always starts off`);
      const ruled = { ...plain, depositRules: D.setDepositRule({}, r1.name, "reimbursement", TODAY) };
      t.eq(D.depositSheetInitial(r1, D.depositContext(ruled), mode).always, false, `"${mode}" sheet: still off when a rule already exists`);
      const answered = { ...plain, depositDecisions: D.decideDeposit({}, r1, "refund", TODAY) };
      const init = D.depositSheetInitial(r1, D.depositContext(answered), mode);
      t.eq([init.always, init.reason], [false, "refund"], `"${mode}" sheet: off, with the earlier answer selected`);
    }
    t.eq(D.depositSheetInitial(r1, D.depositContext({ ...plain, depositDecisions: D.decideDeposit({}, r1, "income", TODAY) }), "mark").reason, null,
         "\"This isn't income\" does not preselect Yes");
    const app = fs.readFileSync(path.join(__dirname, "../src/App.jsx"), "utf8");
    const sheet = app.slice(app.indexOf("function DepositSheet("), app.indexOf("\nfunction ", app.indexOf("function DepositSheet(") + 10));
    t.ok(/const init = depositSheetInitial\(txn, ctx, mode\)/.test(sheet) && /useState\(init\.always\)/.test(sheet), "the sheet's toggle starts from depositSheetInitial");
    t.eq((sheet.match(/setAlways\(/g) || []).length, 0, "nothing in the sheet turns it on but the household's own tap");
    t.ok(/<Toggle on=\{always\} onChange=\{setAlways\}/.test(sheet), "…the toggle itself");
    t.ok((app.match(/<DepositSheet key=\{depositTxnKey\(/g) || []).length === 2, "each deposit opens a fresh sheet (Today and Activity), so nothing carries over");
    t.ok(/const payee = String\(txn\.name \|\| ""\)\.trim\(\)/.test(sheet) && !/\{key\}|\$\{key\}/.test(sheet),
         "the payer is shown as the bank gave it (\"Expense Reimbursement Northwind\"); the lowercased key is for matching only");
    t.eq(D.depositRuleFor(D.setDepositRule({}, "EXPENSE REIMBURSEMENT NORTHWIND", "reimbursement", TODAY), r1.name), "reimbursement",
         "and matching still ignores case");
  }

  // ── 6. Bank transactions are never altered ─────────────────────────────────────────────────────
  {
    const txns = [dep("p1", 15, "ACME PAYROLL", 2000), dep("p2", 1, "ACME PAYROLL", 2000), dep("r1", 4, "EXPENSE REIMB", 300), dep("e1", 2, "E-TRANSFER FROM SAM", 90, "Transfer")];
    const before = JSON.stringify(txns);
    const data = hh(txns, { incomes: [{ id: 1, label: "Job", amount: "2000", freq: "biweekly" }],
                            depositDecisions: D.decideDeposit({}, txns[2], "reimbursement", TODAY),
                            depositRules: D.setDepositRule({}, txns[3].name, "gift", TODAY) });
    D.incomeEvidence(data); D.anchorEvidence(data); D.depositsToAsk(data, TODAY); ForecastEngine.generate(data, 30, null, TODAY);
    t.eq(JSON.stringify(txns), before, "classifying, answering and forecasting leave every transaction exactly as the bank sent it");
  }

  t.summary("depositIncome.test");
})();
