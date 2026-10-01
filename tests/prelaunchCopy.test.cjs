// tests/prelaunchCopy.test.cjs
// -----------------------------------------------------------------------------
// THE LAST COPY AND CLAIMS BATCH BEFORE LAUNCH (prelaunch-copy). Each section pins one item.
//
//   2. First screen: bills are ACCOUNTED FOR, not paid, and the number is safe to spend until payday,
//      not "to spend freely today"; "everything above this number is yours" said the opposite of the
//      truth. Can I afford this? speaks of payday, not today.
//   3. Meet: the card heading "Flourish noticed" read as the app learning; it is "This week".
// Words this copy must never use about the engine: "sets aside", "holds back", "learns", "remembers".
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");
const { loadApp, textOf, describe, REPO } = require("./_renderApp.cjs");

const APP = fs.readFileSync(path.join(REPO, "src", "App.jsx"), "utf8");
const BANNED = /sets? aside|holds? back|\blearns\b|\bremembers\b/i;

(async () => {
  const t = create();
  const D = await import("../src/lib/demoFixture.js");
  const now = new Date();
  const demo = { accounts: D.demoAccountsFor("CA"), debts: D.demoDebtsFor("CA"), incomes: D.buildDemoIncomes(now, "CA"),
    bills: D.buildDemoBills(now, "CA"), transactions: D.buildDemoTxns(now, "CA"), profile: D.demoProfileFor("CA") };
  let A = {};
  try { A = loadApp(["FirstVisitScreen", "MeetAgenda"]); } catch (e) { t.ok(false, `App.jsx bundles: ${describe(e)}`); }

  // ── 2. First screen ──────────────────────────────────────────────────────────────────────────
  {
    const ACCOUNTED = "Bills due before payday, minimum debt payments, a spending buffer and a savings amount are accounted for.";
    let txt = "";
    try { txt = textOf(A.render(A.h(A.FirstVisitScreen, { data: demo, onDismiss: () => {} }))); } catch (e) { t.ok(false, `2 First Visit renders: ${describe(e)}`); }
    t.ok(txt.includes("safe to spend until payday"), "2a under the number: \"safe to spend until payday\"");
    t.ok(txt.includes(ACCOUNTED), "2b the line under it says what is accounted for, word for word");
    t.ok(!/to spend freely today|Bills paid|Buffer set|Everything above this number|No guilt/.test(txt), "2c the old claims are gone from the screen");
    t.ok(!/to spend freely today|Bills paid\. Buffer set|Everything above this number|left in your safe limit today/.test(APP), "2d …and from the source");
    t.ok(/sub: `\$\{r\.remainingText\} left to spend until payday`,/.test(APP), "2e Can I afford this? says what is left until payday, not today");
    t.ok(!BANNED.test(txt) && !BANNED.test(ACCOUNTED), "2f none of the banned verbs");
  }

  // ── 3. Meet ──────────────────────────────────────────────────────────────────────────────────
  {
    let txt = "";
    try { txt = textOf(A.render(A.h(A.MeetAgenda, { data: { ...demo, demo: true }, isCouple: false, setScreen: () => {} }))); } catch (e) { t.ok(false, `3 Meet renders: ${describe(e)}`); }
    t.ok(/\bThis week\b/.test(txt), "3a the Meet card heading is \"This week\"");
    t.ok(!/Flourish noticed/.test(txt) && !/Flourish noticed/.test(APP), "3b \"Flourish noticed\" is gone from the screen and the source");
  }

  t.summary("prelaunchCopy.test");
  setImmediate(() => process.exit(process.exitCode || 0));
})();
