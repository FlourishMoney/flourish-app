// tests/demoCoach.test.cjs
// -----------------------------------------------------------------------------
// Two things are pinned here, and both are defects that actually happened.
//
// 1. THE DEMO FIXTURE IS PHASE-STABLE. Its transactions are dated relative to "now",
//    so before anchoring, a visitor saw safe-to-spend anywhere from $2,009 to $359
//    depending on the day, and the "next deposit" flipped between the $2,840
//    paycheque and the $560 benefit. Screenshots were therefore not reproducible.
//
// 2. THE SCRIPTED DEMO COACH INVENTS NOTHING. Every dollar figure it prints must be
//    a string some engine actually produced for that same snapshot — checked by
//    extracting every $ figure from the conversation and requiring it to be in the
//    set of engine outputs, on every date.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");

(async () => {
  const { SafeSpendEngine } = await import("../src/lib/safeSpendEngine.js");
  const { safeToSpendView } = await import("../src/lib/safeToSpendView.js");
  const { suggestedDailyView } = await import("../src/lib/suggestedDaily.js");
  const { nextFutureDeposit, daysToNextFutureDeposit } = await import("../src/lib/incomeSchedule.js");
  const { selectHighestRateDebt } = await import("../src/lib/decisionEngine.js");
  const { meetAgendaFor } = await import("../src/lib/meetSnapshot.js");
  const { formatMoney } = await import("../src/lib/format.js");
  const { DEMO, buildDemoIncomes, buildDemoBills, buildDemoTxns } = await import("../src/lib/demoFixture.js");
  const { demoCoachExchanges, demoFacilitatorLine } = await import("../src/lib/demoCoach.js");
  const t = create();

  // The demo's accounts + debts, as buildDemoState assembles them.
  const ACCOUNTS = [
    { id: "a1", type: "checking", balance: DEMO.balance }, { id: "a2", type: "savings", balance: 1840.00 },
    { id: "a3", type: "credit", balance: -3420.00 }, { id: "a4", type: "investment", balance: 12480.00 },
    { id: "a5", type: "investment", balance: 8650.00 },
  ];
  const DEBTS = [ { name: "Visa card", balance: "3420", rate: "19.99", min: "68" },
                  { name: "Car Loan", balance: "8200", rate: "6.99", min: "280" } ];
  const snapFor = (d) => ({
    profile: { name: "Alex", country: "CA" }, accounts: ACCOUNTS,
    incomes: buildDemoIncomes(d), bills: buildDemoBills(d), debts: DEBTS,
    transactions: buildDemoTxns(d), bankConnected: true, demo: true,
  });

  // Spread across a month, over month ends, a 28-day Feb, a leap Feb and a year boundary.
  const DATES = ["2026-09-16", "2026-09-22", "2026-10-01", "2026-10-31", "2026-02-27", "2028-02-29", "2026-12-31"];

  // ── 1. Phase stability ─────────────────────────────────────────────────────────────────────────
  const signatures = new Set();
  for (const s of DATES) {
    const d = new Date(`${s}T12:00:00`);
    const snap = snapFor(d);
    const ss = SafeSpendEngine.calculate(snap, d);
    const view = safeToSpendView(ss);
    const pace = suggestedDailyView(view.headline, snap.incomes, snap.transactions, d);
    const nd = nextFutureDeposit(snap.incomes, snap.transactions, d);
    const days = daysToNextFutureDeposit(snap.incomes, snap.transactions, d);
    signatures.add([view.headlineText, pace.dailyText, nd && nd.amount, nd && nd.sourceLabel,
                    days, ss.upcomingBills, ss.safetyBuf, ss.savingsAlloc, view.balanceText].join("|"));
  }
  t.eq(signatures.size, 1, `anchored demo fixture yields IDENTICAL figures on all ${DATES.length} dates (was: $2,009 one day, $359 two days later)`);
  t.eq([...signatures][0], "$1,944|$138|2840|Full-time Job|13|65|435|291|$3,083",
    "…and that one signature is the published demo: $1,944 safe, $138/day, $2,840 paycheque 13 days out, $3,083 balance, $65 of committed bills");

  // The demo must SHOW the product's claim — that a balance is not spendable because money is already
  // committed. That needs a bill inside the reservation window, i.e. a five-row breakdown.
  {
    const d = new Date("2026-09-16T12:00:00");
    const snap = snapFor(d);
    const ss = SafeSpendEngine.calculate(snap, d);
    const view = safeToSpendView(ss);
    t.eq(view.rows.length, 5, "the demo breakdown has five rows (balance + four deductions), not a bare balance");
    t.ok(view.rows.some(r => r.key === "upcomingBills"), "…including an Upcoming bills row — the committed-money demonstration");
    t.eq(ss.soonBills.length, 1, "…and exactly one bill is inside the window, so Today's \"one thing to know\" line has something to name");
    const rowSum = view.rows.reduce((s, r) => s + (r.kind === "balance" ? r.display : -r.display), 0);
    t.eq(rowSum, view.headline, "…and the five displayed rows still reconcile exactly to the headline");
  }

  // ── 2. The scripted coach prints only engine outputs ───────────────────────────────────────────
  for (const s of DATES) {
    const d = new Date(`${s}T12:00:00`);
    const snap = snapFor(d);
    const ss = SafeSpendEngine.calculate(snap, d);
    const view = safeToSpendView(ss);
    const pace = suggestedDailyView(view.headline, snap.incomes, snap.transactions, d);
    const nd = nextFutureDeposit(snap.incomes, snap.transactions, d);
    const debt = selectHighestRateDebt(snap.debts);
    const agenda = meetAgendaFor(snap);

    // Everything an engine produced for THIS snapshot, as displayed strings.
    const allowed = new Set([view.headlineText, view.balanceText, pace.dailyText,
                             formatMoney(nd.amount), formatMoney(debt.balance)]);
    view.rows.forEach(r => allowed.add(r.value));
    // The debt exchange quotes the Meet agenda verbatim, so the agenda's own figures are engine output.
    (JSON.stringify(agenda).match(/\$[\d,]+/g) || []).forEach(x => allowed.add(x));

    const exchanges = demoCoachExchanges(snap, d);
    t.ok(exchanges.length >= 3, `${s}: the demo coach offers at least three exchanges`);

    const prose = exchanges.map(x => x.a).join("  ") + "  " + (demoFacilitatorLine(snap, d) || "");
    const printed = prose.match(/\$[\d,]+/g) || [];
    t.ok(printed.length > 0, `${s}: the conversation actually quotes figures`);
    const invented = printed.filter(p => !allowed.has(p));
    t.eq(invented.join(","), "", `${s}: every dollar figure printed is an engine output (invented: none)`);

    // The headline figures specifically must appear — not just "nothing invented", but "the right ones".
    t.ok(prose.includes(view.headlineText), `${s}: quotes the engine safe-to-spend (${view.headlineText})`);
    t.ok(prose.includes(pace.dailyText), `${s}: quotes the engine suggested daily (${pace.dailyText})`);
    t.ok(prose.includes(formatMoney(nd.amount)), `${s}: quotes the real next-deposit amount (${formatMoney(nd.amount)})`);
    t.ok(prose.includes(`${debt.rate}%`), `${s}: quotes the debt's real rate (${debt.rate}%)`);
    t.ok(prose.includes(formatMoney(debt.balance)), `${s}: quotes the debt's real balance`);
  }

  // The facilitator line reads the agenda and nothing else.
  {
    const d = new Date("2026-09-16T12:00:00");
    const snap = snapFor(d);
    const line = demoFacilitatorLine(snap, d);
    const decision = (meetAgendaFor(snap).decisions || [])[0];
    t.ok(!!line, "Meet gets a scripted facilitator line");
    t.ok(line.includes(decision.text), "…and it quotes the agenda's decision verbatim");
    t.ok(line.includes(decision.options[0].outcome) && line.includes(decision.options[1].outcome),
      "…including both engine-computed outcomes");
  }

  t.summary("demoCoach.test");
})();
