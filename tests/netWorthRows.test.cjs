// tests/netWorthRows.test.cjs
// -----------------------------------------------------------------------------
// NET WORTH IS THE SIGNED SUM OF WHAT IS LISTED UNDER IT (demo-fixes B1).
//
// The demo read "+$9,174" over a list that added up to +$12,593.88: the Visa was in the demo twice,
// as bank credit account a3 and as a hand-entered debt with no account_id, so the headline took it off
// twice, while the Worth list (which never listed bank credit accounts) showed it once. The fixture's
// debt is now linked to its account, and the headline and the list both come from netWorthRows, so the
// figure is always the sum of the rows beneath it.
//
// MATH-LOCK, hand-worked, to the cent:
//   Chequing                  +2,150.37
//   Savings                   +4,000.00
//   TFSA (investment)        +10,250.55
//   Visa (bank card account)  −1,287.42   (its debt entry carries account_id: counted once, here)
//   Car loan (installment)    −9,875.10
//   Mastercard (hand-entered)   −640.25   (a debt with no account: always counts)
//   = 2,150.37 + 4,000.00 + 10,250.55 − 1,287.42 − 9,875.10 − 640.25 = +4,598.15
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");
const { loadApp, textOf, describe, REPO } = require("./_renderApp.cjs");

(async () => {
  const t = create();
  const F = await import("../src/lib/financialCalculations.js");
  const D = await import("../src/lib/demoFixture.js");
  const { formatMoney } = await import("../src/lib/format.js");

  // ── 1. MATH-LOCK ───────────────────────────────────────────────────────────────────────────────
  const fx = {
    profile: { country: "CA" },
    accounts: [
      { id: "c1", name: "Chequing", type: "checking", balance: 2150.37 },
      { id: "s1", name: "Savings", type: "savings", balance: 4000 },
      { id: "t1", name: "TFSA", type: "investment", balance: 10250.55 },
      { id: "v1", name: "Visa ••1111", type: "credit", balance: -1287.42 },
    ],
    debts: [
      { name: "Visa", balance: "1287.42", rate: "19.99", min: "40", account_id: "v1" },
      { name: "Car loan", balance: "9875.10", rate: "6.49", min: "310" },
      { name: "Mastercard", balance: "640.25", rate: "21.99", min: "25" },
    ],
  };
  const r = F.netWorthRows(fx);
  t.eq(r.rows.map(x => [x.label, x.kind, x.cents]), [
    ["Chequing", "cash", 215037], ["Savings", "cash", 400000], ["TFSA", "investment", 1025055],
    ["Visa ••1111", "credit", -128742], ["Car loan", "debt", -987510], ["Mastercard", "debt", -64025],
  ], "1a every account and debt, signed, once (the Visa's linked debt entry is the card already listed)");
  t.eq(r.totalCents, 459815, "1b the rows add up to +$4,598.15");
  t.eq(Math.round(F.FinancialCalcEngine.netWorth(fx).netWorth * 100), r.totalCents, "1c the headline figure is that sum, to the cent");
  const unlinked = { ...fx, debts: fx.debts.map(d => d.name === "Visa" ? { ...d, account_id: undefined } : d) };
  t.eq([F.netWorthRows(unlinked).totalCents, Math.round(F.FinancialCalcEngine.netWorth(unlinked).netWorth * 100)], [459815 - 128742, 459815 - 128742],
    "1d the same card entered twice with nothing linking them is two rows, and the headline still equals the list (the duplicate is visible, not hidden)");
  const foreign = { ...fx, accounts: [...fx.accounts, { id: "u1", name: "US chequing", type: "checking", balance: 500, currency: "USD" }] };
  t.eq([F.netWorthRows(foreign).totalCents, Math.round(F.FinancialCalcEngine.netWorth(foreign).netWorth * 100)], [459815, 459815], "1e an account in another currency is left out of both");

  // ── 2. Both demos ─────────────────────────────────────────────────────────────────────────────
  for (const [c, want, card] of [["CA", 1259388, "Visa card"], ["US", 1869255, "Chase Sapphire"]]) {
    const data = { profile: D.demoProfileFor(c), accounts: D.demoAccountsFor(c), debts: D.demoDebtsFor(c) };
    const rows = F.netWorthRows(data);
    t.eq([rows.totalCents, Math.round(F.FinancialCalcEngine.netWorth(data).netWorth * 100)], [want, want], `2a ${c} demo: net worth is ${formatMoney(want / 100, { cents: true })}, the sum of its rows`);
    t.eq(rows.rows.filter(x => x.label.startsWith(card)).length, 1, `2b ${c} demo: the ${card} is counted once`);
    t.ok(D.demoDebtsFor(c).some(d => d.name === card && d.account_id), `2c ${c} demo: its debt entry is linked to the card account`);
  }

  // ── 3. The Worth screen lists those rows and shows their sum ─────────────────────────────────────
  const APP = fs.readFileSync(path.join(REPO, "src", "App.jsx"), "utf8");
  const worth = APP.slice(APP.indexOf('{tab==="worth"&&(()=>{'), APP.indexOf('{tab==="tax"&&(()=>{'));
  t.ok(/const nwRows = netWorthRows\(data\);/.test(worth) && /const allItems = nwRows\.rows\.map\(/.test(worth), "3a the list is netWorthRows");
  t.ok(/const realNetWorth = nwRows\.total;/.test(worth) && /<CountUp to=\{Math\.abs\(realNetWorth\)\} decimals=\{2\}/.test(worth), "3b the headline is the rows' total, in cents");
  t.ok(/aria-label="Net worth: how Flourish got it"/.test(worth) && /\{explainNetWorth&&<HowWeGotThis title="Net worth"/.test(worth)
    && /inputs=\{\[\.\.\.nwRows\.rows\.map\(/.test(worth) && /label:"= Net worth"/.test(worth), "3c tapping it opens How we got this, with each row and the sum");
  let A = {};
  try { A = loadApp(["Goals"]); } catch (e) { t.ok(false, `App.jsx bundles: ${describe(e)}`); }
  for (const c of D.DEMO_COUNTRIES) {
    const now = new Date();
    const data = { profile: D.demoProfileFor(c), accounts: D.demoAccountsFor(c), debts: D.demoDebtsFor(c), incomes: D.buildDemoIncomes(now, c), bills: D.buildDemoBills(now, c),
      transactions: D.buildDemoTxns(now, c), goals: [], bankConnected: true, demo: true };
    let txt = "";
    try { txt = textOf(A.render(A.h(A.Goals, { data, initialTab: "worth", setScreen: () => {}, setAppData: () => {} }))); } catch (e) { t.ok(false, `3d ${c} Worth renders: ${describe(e)}`); continue; }
    const rows = F.netWorthRows(data).rows;
    const missing = rows.filter(x => !txt.includes(x.label) || !txt.includes(`${x.cents < 0 ? "−" : "+"}${formatMoney(Math.abs(x.cents) / 100, { cents: true })}`));
    t.eq(missing.map(x => x.label), [], `3d ${c} demo: the Worth screen lists every row, signed, to the cent`);
    const listed = [...txt.matchAll(/(Asset ↑|Investment 📈|Liability ↓)/g)].length;
    t.eq(listed, rows.length, `3e ${c} demo: and nothing else (${rows.length} rows)`);
  }
  t.summary("netWorthRows.test");
  setImmediate(() => process.exit(process.exitCode || 0));
})();
