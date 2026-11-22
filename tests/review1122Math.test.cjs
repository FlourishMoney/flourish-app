// tests/review1122Math.test.cjs — MATH-LOCK
// -----------------------------------------------------------------------------
// THE MONEY-MATH FINDINGS OF THE FULL-APP REVIEW (2026-11-22), each checked against the real code.
//
//   G3    Money Wrapped's "spent" counted credit card payments and transfers            REAL, fixed
//   G10   Money Personality's shares were divided by a total that held them too        REAL, fixed
//   G5    "Watch's range summary compares one day's average to a multi-day total"      NOT REAL
//   G7    a one-time bill due today, entered after noon, was dated a month ahead       REAL, fixed
//   G8    an income with a 2 or 3 letter name never matched its deposit by name        REAL, fixed
//   P4-01 one bank payment could confirm several bills, and any payment could teach
//         a variable bill its amount                                                    REAL, fixed
//   P4-08 one debt the bank reports in detail hid every other bank debt                 REAL, fixed
//   P4-09 a linked mortgage or student loan was listed twice                            REAL, fixed
//   P4-04 a payoff longer than 100 years was reported as finished                       REAL, fixed
//   P8-02 the payoff method choice changed nothing                                      REAL, fixed
//   G13   a $0 chore became 50 cents                                                    REAL, fixed
//   P8-05 a bill with a negative or zero amount could be added                          REAL, fixed
//   G11   "the Wealth tab compounds yearly, so screens disagree"                        NOT REAL
//   P4-10 "-50 is read as 50 in Can I afford this?"                                     NOT REAL (by design)
//
// Every figure below is a worked example with synthetic data.
// -----------------------------------------------------------------------------
"use strict";
const fs = require("fs");
const path = require("path");
const { create } = require("./_runner.cjs");
const { loadApp, describe, REPO } = require("./_renderApp.cjs");

const APP = fs.readFileSync(path.join(REPO, "src", "App.jsx"), "utf8");
const sliceFrom = (start, end) => { const i = APP.indexOf(start); if (i < 0) return ""; const j = APP.indexOf(end, i); return j < 0 ? "" : APP.slice(i, j + end.length); };

(async () => {
  const t = create();
  const F = await import("../src/lib/financialCalculations.js");
  const MW = await import("../src/lib/moneyWrapped.js");
  const BS = await import("../src/lib/budgetSpend.js");
  const FE = await import("../src/lib/forecastEdits.js");
  const FW = await import("../src/lib/forecastWalk.js");
  const W = await import("../src/lib/watchRange.js");
  const WP = await import("../src/lib/wealthProjection.js");
  const AF = await import("../src/lib/affordability.js");
  const D = await import("../src/lib/demoFixture.js");
  const { ForecastEngine } = await import("../src/lib/forecastEngine.js");
  const { reconcileBills } = await import("../src/lib/billReconcile.js");

  let A = {};
  try { A = loadApp(["calcPersonality", "debtResultSentence"]); }
  catch (e) { t.ok(false, `App.jsx bundles: ${describe(e)}`); }
  let A2 = {};
  try { A2 = loadApp(["choreReward"]); } catch { /* not written yet: G13 fails below */ }

  // ── G3. Money Wrapped: what counts as "spent" ───────────────────────────────────────────────
  // $200 groceries, $100 dining, a $30 subscription paid by "autopay", a $5 bank fee; and three things
  // that are not spending: a $1,500 credit card payment, a $500 transfer to savings, a $3,000 pay.
  const wrappedTxns = [
    { id: "w1", name: "LOBLAWS #1021", amount: 200, cat: "Groceries", date: "2026-11-03" },
    { id: "w2", name: "THE KEG", amount: 100, cat: "Coffee & Dining", date: "2026-11-05" },
    { id: "w3", name: "SPOTIFY AUTOPAY", amount: 30, cat: "Subscriptions", date: "2026-11-06" },
    { id: "w4", name: "MONTHLY ACCOUNT FEE", amount: 5, cat: "Fees", date: "2026-11-01" },
    { id: "w5", name: "TD VISA PAYMENT", amount: 1500, cat: "Transfer", date: "2026-11-10" },
    { id: "w6", name: "TFR TO SAVINGS", amount: 500, cat: "Transfer", date: "2026-11-11" },
    { id: "w7", name: "ACME PAYROLL", amount: -3000, cat: "Income", date: "2026-11-13" },
  ];
  {
    const fn = typeof MW.wrappedSpend === "function" ? MW.wrappedSpend : null;
    t.ok(!!fn, "G3a Money Wrapped has one rule for what counts as spent (moneyWrapped.wrappedSpend)");
    const kept = fn ? fn(wrappedTxns, { debts: [] }) : wrappedTxns.filter(x => x.amount > 0); // the old line 3125 filter
    const total = kept.reduce((s, x) => s + Math.abs(x.amount || 0), 0);
    t.eq(total, 335, "G3b spent is $335 (groceries, dining, the subscription, the fee), not $2,335 with the card payment and the transfer");
    t.eq(kept.length, 4, "G3c across 4 transactions, not 6");
    const biggest = [...kept].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))[0];
    t.eq(biggest && biggest.name, "LOBLAWS #1021", "G3d the biggest purchase is the $200 groceries, not the $1,500 card payment");
    t.ok(kept.some(x => x.id === "w3"), "G3e a subscription paid by a bare \"autopay\" is spending (the budget tally's rule, isCardPaymentCharge)");
    // The same figure the Activity screen totals (App.jsx Transactions totalSpent): money out, not Transfer or Income, not a card payment.
    const activity = wrappedTxns.filter(x => x.amount > 0 && !new Set(["Transfer", "Income"]).has(x.cat) && !BS.isCardPaymentCharge(x, [])).reduce((a, x) => a + x.amount, 0);
    t.eq(total, activity, "G3f and it is the figure the Activity screen totals for the same transactions");
    const kept2 = fn ? fn([{ id: "c1", name: "RESTAURANT X", amount: 80, cat: "Coffee & Dining" }], { categoryOf: () => "Transfer" }) : [{}];
    t.eq(kept2.length, 0, "G3g a charge the household re-labelled as a transfer is left out (the caller passes the corrected category)");
    const comp = sliceFrom("function MoneyWrapped({data, onClose}) {", "const totalSpent");
    t.ok(/const txns = wrappedSpend\(data\.transactions/.test(comp), "G3h the Money Wrapped screen builds its transactions with that rule");
    t.ok(!/const txns = \(data\.transactions \|\| \[\]\)\.filter\(t => t\.amount > 0\);/.test(comp), "G3i and no longer takes every amount above zero");
  }

  // ── G10. Money Personality: the shares ──────────────────────────────────────────────────────
  // $300 food and $100 shopping, and a $1,600 card payment. Food is 75% of the spending, not 15%.
  {
    const txns = [
      { id: "p1", name: "LOBLAWS", amount: 300, cat: "Groceries" },
      { id: "p2", name: "WINNERS", amount: 100, cat: "Shopping" },
      { id: "p3", name: "RBC VISA PAYMENT", amount: 1600, cat: "Transfer" },
    ];
    const data = { profile: { country: "CA", retirement: { rrspBalance: "5000" } }, accounts: [], goals: [], incomes: [], debts: [] };
    const p = A.calcPersonality ? A.calcPersonality(txns, data) : { scores: {} };
    t.approx(p.scores.convenience, 0.75, 1e-9, "G10a food is $300 of $400 spent: 75% (was $300 of $2,000: 15%)");
    t.approx(p.scores.lifestyle, 0.25, 1e-9, "G10b shopping is $100 of $400: 25% (was 5%)");
    t.eq(p.topKey, "convenience", "G10c so the personality is the food one, not \"builder\" at 30% beating food at 15%");
    const none = A.calcPersonality ? A.calcPersonality([{ id: "p9", name: "RBC VISA PAYMENT", amount: 1600, cat: "Transfer" }], data) : { scores: {} };
    t.eq([none.scores.convenience, none.scores.lifestyle], [0, 0], "G10d only a card payment: no spending shares at all (and no divide by zero)");
  }

  // ── G5. NOT REAL: the drift figure is a one-day figure against a one-day average ────────────────
  {
    const now = new Date(2026, 10, 19, 12);
    const data = { profile: D.demoProfileFor("CA"), accounts: D.demoAccountsFor("CA"), debts: D.demoDebtsFor("CA", now), incomes: D.buildDemoIncomes(now, "CA"),
      bills: D.buildDemoBills(now, "CA"), transactions: D.buildDemoTxns(now, "CA"), bankConnected: true, demo: true };
    const g = ForecastEngine.generate(data, 90, null, now);
    for (const r of W.WATCH_RANGES) {
      const s = W.rangeSummary(g.forecast, r, { avgDailySpend: g.avgDailySpend });
      t.ok(s && !("spendDriftCents" in s), `G5a ${r}d: the range summary has no drift figure at all (watchRange.js has none)`);
      t.ok(s && Math.abs(s.spendCents - Math.round(g.avgDailySpend * 100 * r)) <= 2, `G5b ${r}d: its spending is the daily figure x ${r} days, to within 2 cents (${s && s.spendCents} vs ${Math.round(g.avgDailySpend * 100 * r)})`);
      t.eq(s && s.spendEstimateCents, Math.round(g.avgDailySpend * r * 100), `G5c ${r}d: and the estimate it carries is the daily figure times the days, never one day's`);
    }
    let maxDrift = 0, days = 0;
    for (let i = 1; i < g.forecast.length; i++) {
      const ev = g.forecast[i];
      const w = FW.forecastWalk({ opening: g.forecast[i - 1].balance, income: ev.income, bills: ev.bills, avgDailySpend: g.avgDailySpend, closing: ev.balance, isToday: false });
      if (!w.hasWalk) continue;
      days++; maxDrift = Math.max(maxDrift, w.spendDriftCents);
    }
    t.ok(days >= 90 && maxDrift <= 1, `G5d the drift figure lives in the ONE-DAY walk (forecastWalk.js), one day's spending against one day's average: at most 1 cent over ${days} days (max ${maxDrift})`);
    const readers = fs.readdirSync(path.join(REPO, "src", "lib")).filter(f => f !== "forecastWalk.js" && fs.readFileSync(path.join(REPO, "src", "lib", f), "utf8").includes("spendDriftCents"));
    t.ok(readers.length === 0 && !APP.includes("spendDriftCents"), "G5e and no screen reads it: only the tests do");
  }

  // ── G7. A one-time bill's date ───────────────────────────────────────────────────────────
  {
    const body = sliceFrom("const nextOccurrenceISO = (dom) => {", "\n  };");
    const at = (y, m, d, h) => {
      const nowMs = new Date(y, m, d, h, 0, 0).getTime();
      class FakeDate extends Date { constructor(...a) { if (a.length === 0) super(nowMs); else super(...a); } }
      try { return new Function("Date", `${body}; return nextOccurrenceISO;`)(FakeDate); } catch { return () => "unloaded"; }
    };
    t.ok(body.length > 0, "G7a the bill form's date helper is found");
    t.eq(at(2026, 10, 15, 15)(15), "2026-11-15", "G7b Nov 15 at 3 pm, a one-time bill due on the 15th: today, Nov 15 (was Dec 15)");
    t.eq(at(2026, 10, 15, 9)(15), "2026-11-15", "G7c the same bill entered at 9 am: Nov 15, as before");
    t.eq(at(2026, 10, 15, 23)(15), "2026-11-15", "G7d and at 11 pm: still Nov 15");
    t.eq(at(2026, 10, 15, 15)(14), "2026-12-14", "G7e a day already past this month goes to next month: the 14th becomes Dec 14");
    t.eq(at(2026, 10, 15, 15)(16), "2026-11-16", "G7f a day still ahead stays this month: Nov 16");
    t.eq(at(2026, 10, 30, 18)(31), "2026-11-30", "G7g Nov 30 at 6 pm, due on the 31st: November's last day, today (was Dec 31)");
    t.eq(at(2026, 11, 31, 20)(30), "2027-01-30", "G7h Dec 31 at 8 pm, due on the 30th: Jan 30 of next year");
  }

  // ── G8. A short income name and its deposit ──────────────────────────────────────────────────
  // Thursday Nov 19. Pay of $2,000 is due on the 20th and landed two days early, on the 18th. It is
  // already in the $3,000 balance, so the forecast must not add it again tomorrow.
  {
    const today = new Date(2026, 10, 19, 12);
    const mk = (incomes, deposits) => ({
      profile: { country: "CA" },
      accounts: [{ id: "chq", type: "depository", subtype: "checking", balance: 3000, name: "Chequing" }],
      incomes, bills: [], debts: [], bankConnected: true,
      transactions: deposits.map(([name, amount, date, cat], i) => ({ id: `d${i}`, name, amount: -amount, date, cat: cat || "Other" })),
    });
    const pay = (label, id = 1) => ({ id, label, amount: 2000, freq: "monthly", anchorDay: 20 });
    const three = (name) => [[name, 2000, "2026-11-18"], [name, 2000, "2026-10-20"], [name, 2000, "2026-09-18"]];
    const tomorrow = (data) => ForecastEngine.generate(data, 30, null, today).forecast[1].income;
    const planned = (data) => FE.incomeOccurrences(data, today, 35).filter(o => !o.skipped).map(o => `${o.label} ${FE.isoOf(o.date)} $${o.amount}`);

    t.eq(tomorrow(mk([pay("Acme Corp")], three("ACME CORP 004512"))), 0, "G8a a long name (\"Acme Corp\"): the pay that landed early is not added again (unchanged)");
    t.eq(tomorrow(mk([pay("UW")], three("UW 004512"))), 0, "G8b a two-letter name (\"UW\"): the same, $0 more tomorrow (was $2,000 counted twice)");
    t.eq(tomorrow(mk([pay("Job")], three("JOB 004512"))), 0, "G8c a three-letter name (\"Job\"): the same (was $2,000 counted twice)");
    t.eq(planned(mk([pay("UW")], three("UW 004512"))), ["UW 2026-12-20 $2000"], "G8d and the next pay planned is December's");
    t.eq(tomorrow(mk([pay("UW")], three("UWO 004512"))), 2000, "G8e whole word only: \"UWO 004512\" is not the income \"UW\", so tomorrow's pay stays planned");
    t.eq(tomorrow(mk([pay("UW")], [["UW 004512", 150, "2026-11-18"], ["UW 004512", 2000, "2026-10-20"], ["UW 004512", 2000, "2026-09-18"]])), 2000,
      "G8f the amount still has to fit: a $150 deposit under the same word does not stand in for the $2,000 pay");
    const two = mk([pay("UW", 1), pay("Job", 2)], [["JOB 77", 2000, "2026-11-18"], ["JOB 77", 2000, "2026-10-20"], ["UW 12", 2000, "2026-10-20"]]);
    t.eq(planned(two).filter(s => s.includes("2026-11-20")), ["UW 2026-11-20 $2000"], "G8g two jobs paying the same amount: the deposit named for \"Job\" clears Job's pay, and UW's is still expected");
  }

  // ── P4-01. A bank payment confirms one bill, and only its own ─────────────────────────────────
  {
    const APRIL = new Date(2026, 3, 10);
    const vb = (id, name, amount, dayOfMonth) => ({ id, name, amount, dayOfMonth, recurring: true, variable: true, origin: "manual" });
    const fb = (id, name, amount, dayOfMonth) => ({ id, name, amount, dayOfMonth, recurring: true, variable: false, origin: "manual" });
    const amounts = (r) => r.updatedManualBills.map(b => b.amount);
    {
      const r = reconcileBills([vb("h", "Hydro", 120, 15), vb("g", "Gas", 60, 16)], [{ id: "t1", name: "HYDRO ONE 123456789", amount: 80, date: "2026-04-15" }], APRIL);
      t.eq(amounts(r), [80, 60], "P4-01a one $80 Hydro One payment: Hydro learns $80 and Gas keeps its $60 (was both $80)");
      t.eq(r.forecastBills.map(b => b.matched), [true, false], "P4-01b and it confirms one bill, not two");
    }
    {
      const r = reconcileBills([vb("h", "Hydro", 120, 15)], [{ id: "t2", name: "TIM HORTONS #4421", amount: 4.75, date: "2026-04-15" }], APRIL);
      t.eq(amounts(r), [120], "P4-01c a $4.75 coffee on the due day does not become the Hydro bill (was $4.75)");
      t.eq(r.forecastBills[0].matched, false, "P4-01d the bill stays an estimate");
    }
    {
      const r = reconcileBills([vb("h", "Hydro", 120, 15)], [{ id: "t3", name: "HYDRO ONE REFUND", amount: -2000, date: "2026-04-15" }], APRIL);
      t.eq(amounts(r), [120], "P4-01e money IN is never a bill payment: a $2,000 credit does not set the bill to $2,000 (was $2,000)");
    }
    {
      const r = reconcileBills([fb("a", "Gym", 50, 10), fb("b", "Storage", 50, 11)], [{ id: "t4", name: "GOODLIFE FITNESS", amount: 50, date: "2026-04-10" }], APRIL);
      t.eq(r.forecastBills.map(b => b.matched), [true, false], "P4-01f two $50 bills a day apart and one $50 payment: one is confirmed (the nearer), the other stays expected (was both)");
    }
    {
      const r = reconcileBills([fb("a", "Goodlife", 50, 10), fb("b", "Storage", 50, 12)],
        [{ id: "t5", name: "GOODLIFE FITNESS", amount: 51, date: "2026-04-12" }, { id: "t6", name: "PUBLIC STORAGE", amount: 49, date: "2026-04-10" }], APRIL);
      t.eq(r.forecastBills.map(b => b.amount), [51, 49], "P4-01g each bill takes the payment with its own name ($51 Goodlife, $49 Storage), not the nearest date ($49, $51)");
    }
    {
      const r = reconcileBills([fb("r", "Rent", 1850, 1)], [{ id: "t7", name: "E-TRANSFER SENT 0041", amount: 1850, date: "2026-04-01" }], APRIL);
      t.eq(r.forecastBills[0].matched, true, "P4-01h a fixed bill is still confirmed by its amount and date when the names share nothing (rent paid by e-transfer)");
    }
  }

  // ── P4-08. Bank debts the bank gives no detail for ───────────────────────────────────────────
  {
    const sum = (list) => Math.round(list.reduce((s, e) => s + e.balance, 0) * 100) / 100;
    const names = (list) => list.map(e => e.name);
    // Bank A reports its Visa in detail. Bank B's line of credit comes only as an account balance.
    const debts = [
      { id: "d1", name: "TD Visa", balance: "1200.00", rate: "", min: "", fromBank: true, account_id: "cardA" },
      { id: "d2", name: "Scotia Line of Credit", balance: "5000.00", rate: "", min: "", fromBank: true, account_id: "locB" },
      { id: "d3", name: "Loan from Dad", balance: "3000", rate: "", min: "100" },
    ];
    const liabilities = { credit: [{ account_id: "cardA", name: "TD Visa", balance: 1200, apr: 19.99, minPayment: 35 }], mortgage: [], student: [] };
    const list = F.buildDebtListForSimulator(debts, liabilities, {});
    t.eq(sum(list), 9200, "P4-08a $1,200 Visa + $5,000 line of credit + $3,000 from Dad = $9,200 (was $4,200: the line of credit was missing)");
    t.eq(names(list).filter(n => n === "TD Visa").length, 1, "P4-08b the Visa is still listed once, from the bank's own detail");
    t.ok(names(list).includes("Scotia Line of Credit"), "P4-08c the line of credit is on the list");
    // One student loan reported in detail; two cards known only by their balances.
    const debts2 = [
      { id: "c1", name: "BMO Mastercard", balance: "1200.00", rate: "", min: "", fromBank: true, account_id: "cardX" },
      { id: "c2", name: "Tangerine Card", balance: "800.00", rate: "", min: "", fromBank: true, account_id: "cardY" },
    ];
    const list2 = F.buildDebtListForSimulator(debts2, { credit: [], mortgage: [], student: [{ account_id: "sl1", name: "Student Loan", balance: 10000, interestRate: 6 }] }, {});
    t.eq(sum(list2), 12000, "P4-08d a $10,000 student loan and two cards ($1,200, $800): $12,000 (was $10,000, both cards hidden)");
    // A card the bank reports at $0 stays off the list (the bank's detail is the truth for that card).
    const list3 = F.buildDebtListForSimulator([{ id: "z", name: "TD Visa", balance: "40.00", fromBank: true, account_id: "cardA" }],
      { credit: [{ account_id: "cardA", name: "TD Visa", balance: 0 }, { account_id: "cardQ", name: "Other", balance: 10 }], mortgage: [], student: [] }, {});
    t.eq(names(list3), ["Other"], "P4-08e a card the bank reports in detail is never also taken from its balance row");
    t.eq(F.buildDebtListForSimulator(debts, null, {}).length, 3, "P4-08f with no detail from any bank, the list is the three debts as before");
  }

  // ── P4-09. A linked mortgage or student loan is one debt ──────────────────────────────────────
  {
    const accounts = [{ id: "m1", type: "loan", subtype: "mortgage", balance: 250000, name: "RBC Mortgage" }, { id: "s1", type: "loan", subtype: "student", balance: 9000, name: "NSLSC Loan" }];
    const debts = [
      { id: "h1", name: "Mortgage", balance: "251000", rate: "5.1", min: "1500", sameAsAccountId: "m1" },
      { id: "h2", name: "Student loan", balance: "9100", rate: "", min: "120", sameAsAccountId: "s1" },
    ];
    const liabilities = { credit: [], mortgage: [{ account_id: "m1", name: "RBC Mortgage", balance: 250000, interestRate: 5.2, monthlyPayment: 1480 }],
      student: [{ account_id: "s1", name: "NSLSC Loan", balance: 9000, interestRate: 6.5 }] };
    const list = F.buildDebtListForSimulator(debts, liabilities, { accounts });
    t.eq(list.length, 2, "P4-09a a linked mortgage and a linked student loan are two entries (was four)");
    t.eq(Math.round(list.reduce((s, e) => s + e.balance, 0)), 259000, "P4-09b $250,000 + $9,000 = $259,000 owed (was $518,000, each counted twice)");
    const m = list.find(e => e.account_id === "m1") || {}, s = list.find(e => e.account_id === "s1") || {};
    t.eq([m.balance, m.rate, m.min, m.linked], [250000, 5.1, 1500, true], "P4-09c the mortgage: the bank's balance, with the rate and payment the household entered");
    t.eq([s.balance, s.rate, s.min, s.linked], [9000, 6.5, 120, true], "P4-09d the student loan: the bank's balance and rate (none was entered), and the $120 payment the household entered");
    const unlinked = F.buildDebtListForSimulator([], liabilities, { accounts });
    t.eq(unlinked.map(e => [e.balance, e.rate, e.min]), [[250000, 5.2, 1480], [9000, 6.5, 90]], "P4-09e with nothing linked the bank's own figures stand, as before");
  }

  // ── P4-04. A payoff that takes more than 100 years ───────────────────────────────────────────
  {
    const slow = F.simulateDebtPayoff({ balance: 20000, apr: 0.99, monthlyPayment: 20 }); // interest is $16.50 a month; $3.50 reaches the balance
    t.ok(!Number.isFinite(slow.monthsToPayoff), "P4-04a $20,000 at 0.99% paying $20 a month takes about 176 years: it is not reported as paid off in 1,200 months");
    t.ok(!Number.isFinite(slow.totalInterest) && slow.payoffDate === null, "P4-04b and no total interest or payoff date is given for it (was $4,000 of interest and a date 100 years out, with most of the balance still owed)");
    t.eq(slow.beyondHorizon, true, "P4-04c it is marked as longer than the 100 years the model runs");
    const free = F.simulateDebtPayoff({ balance: 100000, apr: 0, monthlyPayment: 50 });
    t.ok(!Number.isFinite(free.monthsToPayoff), "P4-04d $100,000 at 0% paying $50 a month (2,000 months): not reported as done at 1,200 (was total interest of -$40,000)");
    const edge = F.simulateDebtPayoff({ balance: 60000, apr: 0, monthlyPayment: 50 });
    t.eq([edge.monthsToPayoff, edge.totalPaid, edge.totalInterest], [1200, 60000, 0], "P4-04e a debt that clears in exactly 1,200 months is still a payoff: $60,000 paid, $0 interest");
    const never = F.simulateDebtPayoff({ balance: 10000, apr: 12, monthlyPayment: 100 });
    t.ok(!Number.isFinite(never.monthsToPayoff) && !never.beyondHorizon, "P4-04f a payment that only covers the interest is still \"never\", and is not marked as a long payoff");
    const usual = F.simulateDebtPayoff({ balance: 1000, apr: 12, monthlyPayment: 100 });
    t.eq([usual.monthsToPayoff, usual.totalPaid, usual.totalInterest], [11, 1058.98, 58.98], "P4-04g the usual case is untouched: $1,000 at 12% and $100 a month is 11 months, $58.98 of interest");
    // What-If's sentence. Both the current payment and the boosted one run past 100 years, so no payoff
    // date and no interest total may be printed. The sentence it falls to is the existing "is not paid
    // off" one; its reason ("does not cover the interest") is not exact for this case, and exact words
    // for it need approval before they can be added (no placeholder may sit in App.jsx).
    if (A.debtResultSentence) {
      const r = F.simulateDebtPayoffBoost({ balance: 20000, apr: 0.99, currentPayment: 20, extraPayment: 1 });
      const said = A.debtResultSentence(r, 1, 20);
      t.ok(/is not paid off/.test(said) && !/total interest|payoff date/.test(said), `P4-04h What-If says the balance is not paid off, with no payoff date or interest total (it printed a date 100 years out and $4,000 of interest). Said: ${said}`);
      t.ok(!/\[WORDS:/.test(said), "P4-04i and shows no placeholder");
      const r2 = F.simulateDebtPayoffBoost({ balance: 20000, apr: 0.99, currentPayment: 20, extraPayment: 200 });
      t.ok(/^At the current \$20 a month the balance is not paid off\. Paying \$200 more a month pays it off by /.test(A.debtResultSentence(r2, 200, 20)), "P4-04j with $200 more a month it does clear, and the sentence says so against a current payment that does not");
    } else t.ok(false, "P4-04h What-If's sentence could not be loaded");
  }

  // ── P8-02. The payoff method choice ─────────────────────────────────────────────────────────
  {
    const debts = [{ name: "Car loan", balance: 8200, rate: 6.99 }, { name: "Visa", balance: 3400, rate: 19.99 }, { name: "Store card", balance: 2600, rate: 28.99 }, { name: "Line of credit", balance: 1500, rate: 9.5 }];
    const order = typeof F.orderDebtsForMethod === "function" ? F.orderDebtsForMethod : () => [];
    t.eq(order(debts, "avalanche").map(d => d.name), ["Store card", "Visa", "Line of credit", "Car loan"], "P8-02a Avalanche lists the highest rate first: 28.99%, 19.99%, 9.5%, 6.99%");
    t.eq(order(debts, "snowball").map(d => d.name), ["Line of credit", "Store card", "Visa", "Car loan"], "P8-02b Snowball lists the smallest balance first: $1,500, $2,600, $3,400, $8,200");
    t.ok(order(debts, "avalanche").length > 0 && order(debts, "avalanche")[0].name !== order(debts, "snowball")[0].name, "P8-02c so picking the other method changes what is shown (it changed nothing)");
    t.eq(debts.map(d => d.name), ["Car loan", "Visa", "Store card", "Line of credit"], "P8-02d the list passed in is not reordered");
    t.ok(/orderDebtsForMethod\(debts,\s*method\)\.map\(/.test(APP), "P8-02e the Debt Sim list follows the method chosen (it was always highest rate first, whichever was picked)");
  }

  // ── G13. A chore's reward ──────────────────────────────────────────────────────────────────
  {
    const r = typeof A2.choreReward === "function" ? A2.choreReward : () => "missing";
    t.eq(r("0"), 0, "G13a a chore set to $0 pays $0 (was 50 cents)");
    t.eq([r(""), r("abc")], [0.5, 0.5], "G13b a blank reward is still the 50 cent default");
    t.eq([r("2"), r("0.25"), r("1.50")], [2, 0.25, 1.5], "G13c an entered reward is kept: $2, 25 cents, $1.50");
    t.eq(r("-3"), 0.5, "G13d a negative reward is not accepted (it falls back to the default)");
    t.ok(/reward:choreReward\(newChoreReward\)/.test(APP) && !/parseFloat\(newChoreReward\)\|\|0\.50/.test(APP), "G13e the Family screen's add-chore form uses it");
  }

  // ── P8-05. Adding a bill needs an amount above zero ──────────────────────────────────────────
  {
    const body = sliceFrom("const saveBill = name => {", "\n  };");
    const run = (amount, name = "Hydro") => {
      const calls = [];
      const noop = () => {};
      try {
        const saveBill = new Function("amount", "billType", "oneOffDate", "dueDate", "freq", "setAppData", "setSaved", "setTimeout", "setAdding", "setAmount", "setDueDate", "setCustomName", "setBillType", "setFreq",
          `${body}; return saveBill;`)(amount, "fixed", "", "5", "monthly", (fn) => calls.push(fn({ bills: [] })), noop, noop, noop, noop, noop, noop, noop, noop);
        saveBill(name);
      } catch (e) { return `threw ${e.message}`; }
      return calls.map(c => c.bills.map(b => `${b.name} ${b.amount}`).join(","));
    };
    t.ok(body.length > 0, "P8-05a the Bills screen's add form is found");
    t.eq(run("-50"), [], "P8-05b a bill of -$50 is not added (it was, and the forecast then ADDED $50 on its due day)");
    t.eq(run("0"), [], "P8-05c nor a bill of $0");
    t.eq(run("45.50"), ["Hydro 45.50"], "P8-05d a bill of $45.50 is added as before");
    t.eq(run("45.50", ""), [], "P8-05e and still not without a name");
  }

  // ── G11. NOT REAL: the Wealth tab's "7% a year" is 7% a year ─────────────────────────────────
  {
    t.eq(WP.projectWealth(1000, 0, 1), 1070, "G11a $1,000 for one year at the stated 7% a year is $1,070 (monthly compounding of 7%/12 would be $1,072, which is 7.23% a year)");
    let v = 20000; for (let y = 0; y < 20; y++) v = v * 1.07 + 300 * 12;
    t.eq(WP.projectWealth(20000, 300, 20), Math.round(v), "G11b the locked figure of wealthProjection.test 4a: 7% a year, a year's contributions added each year");
    t.ok(/const r = 0\.06\/12;\s*\n\s*const n = 30\*12;/.test(APP), "G11c the Retirement tab is a different projection (6%, 30 years, RRSP and TFSA only), so no figure is shared between the two screens");
  }

  // ── P4-10. NOT REAL: a typed minus in "Can I afford this?" ───────────────────────────────────
  {
    const r = AF.affordabilityCheck(1944, "-50");
    t.eq([r && r.amount, r && r.remaining, r && r.state], [50, 1894, "yes"], "P4-10a \"-50\" is read as a $50 purchase by design (affordability.test 4d): the field asks how much you are about to spend");
    t.eq(AF.affordabilityCheck(1944, -50), null, "P4-10b a negative NUMBER is no question at all (null), so nothing is ever added to safe to spend");
  }

  t.summary("review1122Math");
})();
