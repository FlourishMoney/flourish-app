// tests/prelaunchCopy.test.cjs
// -----------------------------------------------------------------------------
// THE LAST COPY AND CLAIMS BATCH BEFORE LAUNCH (prelaunch-copy). Each section pins one item.
//
//   2. First screen: bills are ACCOUNTED FOR, not paid, and the number is safe to spend until payday,
//      not "to spend freely today"; "everything above this number is yours" said the opposite of the
//      truth. Can I afford this? speaks of payday, not today.
//   3. Meet: the card heading "Flourish noticed" read as the app learning; it is "This week".
//   5. Watch: the heading states the selected range, not "The next 90 days." on every range.
//   1. Store-app copy states what the build does, with no price, plan, trial length or upgrade path:
//      Terms section 7, the coach gate once the week's messages are used, and the one-bank limit.
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
  try { A = loadApp(["FirstVisitScreen", "MeetAgenda", "TermsOfService", "PremiumGate", "PlanAhead"]); } catch (e) { t.ok(false, `App.jsx bundles: ${describe(e)}`); }

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

  // ── 1. Store-app copy ─────────────────────────────────────────────────────────────────────────
  // The bundle's @capacitor/core installs a "web" Capacitor as it loads, so a store app is simulated by
  // switching the platform the app reads at render time.
  {
    const real = globalThis.Capacitor;
    const setPlatform = (p) => Object.defineProperty(globalThis, "Capacitor", { value: { ...real, getPlatform: () => p, isNativePlatform: () => p !== "web" }, configurable: true, writable: true });
    const native = (fn) => { setPlatform("ios"); try { return fn(); } finally { setPlatform("web"); } };
    const terms = native(() => textOf(A.render(A.h(A.TermsOfService, { onBack: () => {} }))));
    const s7 = terms.slice(terms.indexOf("7. "), terms.indexOf("8. ")).trim();
    t.eq(s7, "7. Cost and usage limits The iOS and Android apps are free, and there is nothing to buy in them. Some features have daily or weekly usage limits, and some are not available in this version; the app says so where that applies.",
      "1a native Terms section 7 says what the store app does, word for word");
    const webTerms = textOf(A.render(A.h(A.TermsOfService, { onBack: () => {} })));
    t.ok(/7\. Subscription & Billing/.test(webTerms), "1b (the web keeps its section 7)");
    const coachGate = native(() => textOf(A.render(A.h(A.PremiumGate, { feature: "AI Coach", desc: "x", nativeNote: "You've used this week's 2 coach messages. They reset Monday." }))));
    t.ok(/You've used this week's 2 coach messages\. They reset Monday\./.test(coachGate) && !/isn't included/.test(coachGate),
      "1c on a store app the coach gate says the week's messages are used and when they reset, not that the coach is missing");
    t.ok(/nativeNote=\{`You've used this week's \$\{FREE_TIER_LIMITS\.coachMessagesPerWeek\} coach messages\. They reset Monday\.`\}/.test(APP), "1d …and that is what the coach tab passes");
    const credit = native(() => textOf(A.render(A.h(A.PremiumGate, { feature: "Credit Coaching", desc: "x" }))));
    t.ok(/Credit Coaching isn't included in this version\./.test(credit), "1e other gates keep the neutral line");
    t.ok(!/what to do next/.test(APP.slice(APP.indexOf('feature="AI Coach"'), APP.indexOf('feature="AI Coach"') + 200)), "1f the coach is described as explaining your options, not telling you what to do");
    t.ok(/isNativeApp\(\) && \/plan_limit\/\.test\(String\(err\.message\|\|""\)\)\)/.test(APP) && /"Only one bank can be connected in this version\. You can import a statement for another account\."/.test(APP),
      "1g a store app never shows the server's plan_limit code: it says what this version does");
  }

  // ── 5. Watch heading ─────────────────────────────────────────────────────────────────────────
  {
    let txt = "";
    try { txt = textOf(A.render(A.h(A.PlanAhead, { data: demo, setAppData: () => {}, setScreen: () => {} }))); } catch (e) { t.ok(false, `5 Watch renders: ${describe(e)}`); }
    t.ok(/The next 30 days\./.test(txt) && !/The next 90 days\./.test(txt), "5a Watch opens on 30 days and its heading says so");
    t.ok(/RANGES\.map\(r=><button key=\{r\} onClick=\{\(\)=>setRange\(r\)\}/.test(APP) && /subtitle=\{`The next \$\{range\} days\.`\}/.test(APP),
      "5b the heading reads the same range the 7 / 30 / 90 toggle sets");
  }

  t.summary("prelaunchCopy.test");
  setImmediate(() => process.exit(process.exitCode || 0));
})();
