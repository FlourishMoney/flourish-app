// tests/demoFixture.test.cjs
// -----------------------------------------------------------------------------
// Truth-fix item 8: prove BY ASSERTION (not by eye) that the demo fixture is now
// internally consistent and exercises the real ANCHOR path — findAnchor matches the
// payroll deposits to the Full-time Job, and the forecast phases the biweekly cadence
// off that real deposit rather than counting forward from today (the fallback).
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");

(async () => {
  const { DEMO, DEMO_INCOMES, buildDemoTxns, demoAccountsFor, demoDebtsFor } = await import("../src/lib/demoFixture.js");
  const { findAnchor, nextFutureDeposit } = await import("../src/lib/incomeSchedule.js");
  const { ForecastEngine } = await import("../src/lib/forecastEngine.js");
  const t = create();

  const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

  // Frozen "now" — the fixture dates the payroll deposits at 1 / 12 / 26 days ago.
  const now = new Date(2026, 8, 15, 12, 0, 0); // Sep 15 2026
  const txns = buildDemoTxns(now);
  const job = DEMO_INCOMES.find(i => i.label === "Full-time Job");

  // The fixture is consistent: the declared income and the deposits are the same amount.
  t.eq(DEMO.income, 2840, "DEMO.income equals the Full-time Job amount (was 1847.50, a 35% mismatch)");
  t.eq(job.amount, "2840", "Full-time Job declares $2,840 biweekly");
  const payrolls = txns.filter(x => x.name === "Payroll Deposit");
  t.eq(payrolls.length, 3, "three payroll deposits in the fixture");
  t.ok(payrolls.every(p => Math.abs(p.amount) === 2840), "every payroll deposit pays 2840 — matches the income");

  // ANCHOR PATH: findAnchor matches (it returned null before, which forced the fallback).
  const anchor = findAnchor(job, 2840, txns);
  t.ok(anchor !== null, "findAnchor MATCHES the payroll deposits — the demo takes the anchor path, not the fallback");
  t.eq(anchor && ymd(anchor), ymd(addDays(now, -1)), "the anchor is the MOST RECENT payroll deposit (1 day ago = Sep 14)");

  // The next deposit is phased off the anchor (anchor + 14 = Sep 28), NOT today+14 (the fallback = Sep 29).
  const nd = nextFutureDeposit(DEMO_INCOMES, txns, now);
  t.eq(nd && ymd(nd.date), ymd(addDays(now, 13)), "next deposit = anchor + 14 (Sep 28), the anchor-path date");
  t.eq(nd && nd.confidence, "high", "confidence is high because it is phased off real deposit history");
  t.ok(nd && ymd(nd.date) !== ymd(addDays(now, 14)), "and it is NOT today+14 (Sep 29) — the coincidental fallback date is gone");

  // End to end: the forecast pays the Full-time Job on the anchor-derived date.
  const { forecast } = ForecastEngine.generate({ accounts: [{ id: "c", type: "checking", balance: 1243.88 }], incomes: DEMO_INCOMES, bills: [], debts: [], transactions: txns }, 30, null, now);
  const paydayEntry = forecast.find(f => f.day > 0 && f.income >= 2840);
  t.ok(!!paydayEntry, "the forecast contains a Full-time Job payday");
  t.eq(paydayEntry && ymd(paydayEntry.date), ymd(addDays(now, 13)), "and it lands on the anchor-derived Sep 28, end to end");

  // ── The demo household carries no card-issuer brand ──────────────────────────────────────────
  // The sample family's credit card was called "TD Visa": a real bank's real product, on a screen
  // every visitor sees before signing up, with invented debt attached to it. The name is generic
  // now, and stays that way.
  {
    const names = [...demoAccountsFor("CA").map(a => a.name), ...demoDebtsFor("CA").map(d => d.name)].join(" | ");
    const ISSUER = /\bTD Visa\b|\bRBC\b|\bScotia|\bCIBC\b|\bBMO\b|\bAmex\b|American Express|Mastercard/i;
    t.ok(!ISSUER.test(names), `9a no card-issuer brand on the demo household's cards or debts (${names})`);
    t.ok(/Visa card/.test(names), "9b …the card is the generic 'Visa card'");
    const card = demoDebtsFor("CA").find(d => /Visa card/.test(d.name));
    t.eq(card && card.balance, "3420", "9c …and renaming it changed no amount");

    // The accounts and their institutions are generic too, and renaming them moved no money.
    const accts = demoAccountsFor("CA");
    const REAL = /\bTD\b|Questrade|\bRBC\b|Scotia|\bCIBC\b|\bBMO\b|Wealthsimple|Tangerine|Desjardins|Simplii|EQ Bank/i;
    const labels = accts.flatMap(a => [a.name, a.institution]).join(" | ");
    t.ok(!REAL.test(labels), `9d no real institution name on any demo account or institution (${labels})`);
    t.eq(accts.map(a => a.name.replace(/ ••\d+$/, "")).join(","), "Chequing,Savings,Visa card,TFSA,RRSP", "9e …the accounts read Chequing, Savings, Visa card, TFSA, RRSP");
    t.eq(accts.map(a => a.institution).join(","), "Your bank,Your bank,Your bank,Your brokerage,Your bank", "9f …and each institution is generic");
    t.eq(accts.map(a => a.balance).join(","), "1243.88,1840,-3420,12480,8650", "9g …with every balance exactly as before");
  }

  t.summary("demoFixture.test");
})();
