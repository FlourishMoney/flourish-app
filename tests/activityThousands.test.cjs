// tests/activityThousands.test.cjs
// -----------------------------------------------------------------------------
// WATCH → ACTIVITY (live defect, health checks of Sept 27, Oct 4 and Oct 14): the payroll row printed
// "+$2840.00" and the month summary "+$2840 in" or "+$5966 in", with no thousands separator, while every
// other figure on the page has one. Both now go through format.js formatNumber. Display only: the same
// figures, the same rounding.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");
const { loadApp, textOf, describe, REPO } = require("./_renderApp.cjs");

(async () => {
  const t = create();
  const D = await import("../src/lib/demoFixture.js");
  const { formatNumber } = await import("../src/lib/format.js");
  let A = {};
  try { A = loadApp(["SpendScreen"]); } catch (e) { t.ok(false, `App.jsx bundles: ${describe(e)}`); }
  const now = new Date();
  const data = { demo: true, profile: D.demoProfileFor("CA"), accounts: D.demoAccountsFor("CA"), debts: D.demoDebtsFor("CA"), incomes: D.buildDemoIncomes(now, "CA"),
    bills: D.buildDemoBills(now, "CA"), transactions: D.buildDemoTxns(now, "CA"), bankConnected: true };
  if (A.SpendScreen) {
    let txt = "";
    try { txt = textOf(A.render(A.h(A.SpendScreen, { data, setAppData: () => {}, setScreen: () => {} }))); } catch (e) { t.ok(false, `SpendScreen renders: ${describe(e)}`); }
    t.ok(txt.includes("+$2,840.00"), "1a the payroll row reads +$2,840.00");
    t.ok(!/\+\$\d{4,}/.test(txt), `1b no amount of $1,000 or more is printed without its separator (${(txt.match(/\+\$\d{4,}[\d.]*/g) || []).join(", ") || "none"})`);
    const inLine = (txt.match(/\+\$[\d,]+ in/g) || []);
    t.ok(inLine.length >= 1 && inLine.every(s => /^\+\$\d{1,3}(,\d{3})* in$/.test(s)), `1c the money-in summary has its separator (${inLine.join(", ")})`);
  }
  t.eq([formatNumber(2840, { cents: true }), formatNumber(5966), formatNumber(5966.5), formatNumber(999.99, { cents: true })], ["2,840.00", "5,966", "5,967", "999.99"],
    "2a the formatter: separators, and the same rounding toFixed gave");
  const APP = fs.readFileSync(path.join(REPO, "src", "App.jsx"), "utf8");
  t.ok(/\{txn\.amount<0\?"\+":"−"\}\$\{formatNumber\(Math\.abs\(txn\.amount\),\{cents:true\}\)\}/.test(APP) && /\+\$\{formatNumber\(totalIn\|\|0\)\} in/.test(APP),
    "2b both lines use formatNumber");
  t.summary("activityThousands.test");
  setImmediate(() => process.exit(process.exitCode || 0));
})();
