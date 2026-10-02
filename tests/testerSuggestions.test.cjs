// tests/testerSuggestions.test.cjs
// -----------------------------------------------------------------------------
// THE TESTERS COMMUNITY SUGGESTIONS (branch tester-suggestions), one section per item.
//
// Every new line of copy also passes the advice scan (sourcedFigures.test.cjs section 11, which reads
// every string in src) and the banned-word rules checked here: no "learns", "remembers", "smarter"
// or "better over time", never the retired benefit's name, never a competitor's name, no em or en
// dashes.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");
const { loadApp, textOf, describe, REPO } = require("./_renderApp.cjs");
const { adviceProblems } = require("./_copyStrings.cjs");

const APP = fs.readFileSync(path.join(REPO, "src", "App.jsx"), "utf8");
const BANNED = /\blearns\b|\bremembers\b|\bsmarter\b|better over time|GST\/HST credit|GST credit|—|–|\b(Mint|YNAB|Monarch|Rocket Money|Copilot|Quicken|Wealthsimple|KOHO|Credit Karma|Borrowell|Simplifi|EveryDollar|PocketGuard|Goodbudget|Emma)\b/;

(async () => {
  const t = create();
  const noAdvice = (label, texts) => t.eq(texts.flatMap(x => adviceProblems(x).map(w => `${w}: ${x.slice(0, 60)}`)), [], `${label}: passes the advice scan (no money instruction, no verdict)`);
  const noBanned = (label, text) => t.ok(!BANNED.test(text), `${label}: no banned word, competitor or dash${BANNED.test(text) ? ` (found "${text.match(BANNED)[0]}")` : ""}`);
  let A = {};
  try { A = loadApp(["Settings", "Dashboard", "MeetAgenda", "FAQ", "TERMS", "SupportPage", "SpendScreen", "WHAT_MAKES_DIFFERENT"]); } catch (e) { t.ok(false, `App.jsx bundles: ${describe(e)}`); }
  const D = await import("../src/lib/demoFixture.js");
  const noop = () => {};
  const demo = (c = "CA", extra = {}) => { const now = new Date(); return { profile: D.demoProfileFor(c), accounts: D.demoAccountsFor(c), debts: D.demoDebtsFor(c),
    incomes: D.buildDemoIncomes(now, c), bills: D.buildDemoBills(now, c), transactions: D.buildDemoTxns(now, c), bankConnected: true, ...extra }; };

  // ── 1. The walkthrough and the setup checklist ───────────────────────────────────────────────
  {
    const T = await import("../src/lib/tour.js");
    const N = await import("../src/lib/navigation.js");
    t.eq(T.TOUR_STEPS.map(s => s.screen), N.TABS, "1a one step per tab, in tab order (Today, Watch, Do, Learn, Meet)");
    t.eq(T.TOUR_STEPS.map(s => s.title), ["Today", "Watch", "Do", "Learn", "Meet"], "1b each step is named for its tab");
    t.eq(T.TOUR_STEPS.map(s => s.body), [
      "Your number. What's safe to spend until payday, after bills, minimum debt payments, a spending buffer and a savings amount are accounted for. Tap it to see the math.",
      "Every bill and payday on one dated list, so a tight day shows up before it arrives.",
      "Your plans. Budgets, goals and debt payoff dates, calculated from your numbers.",
      "Your coach. Ask what a number means. It explains flourish's math and never invents a figure.",
      "15 minutes a week. An agenda built from your week, for you or for you and your partner.",
    ], "1c the copy, word for word (Watch without \"The next 90 days.\": Watch opens on 30 days)");
    noBanned("1d tour", T.TOUR_STEPS.map(s => s.title + " " + s.body).join(" "));
    noAdvice("1d2 tour", T.TOUR_STEPS.map(s => s.body));
    t.ok(!/AI Financial Guidance|tax tips, debt strategy|Activity & Budgets|Goals & Credit|Today Screen/.test(APP), "1e the stale tour (old screen names, \"Ask anything: tax tips, debt strategy\") is gone");
    t.ok(/const TOUR=TOUR_STEPS;/.test(APP) && />\s*Skip\s*<\/button>/.test(APP) && !/Skip Tour/.test(APP), "1f the tour reads lib/tour.js and every step has Skip");
    t.ok(/role="dialog" aria-modal="true" aria-labelledby="tour-title"/.test(APP), "1g the tour is a labelled dialog");
    // The sentences hold in the build
    t.ok(/aria-label="How Flourish got this number"/.test(APP) && /setExplain\("safeToSpend"\)/.test(APP), "1h (Today: the number is a button that opens its math)");
    t.ok(/const RANGES = \[7, 30, 90\];/.test(APP) && /useState\(30\)/.test(APP), "1i (Watch: 30 days by default, 90 is a range, so \"The next 90 days\" was not shipped)");
    t.ok(fs.readFileSync(path.join(REPO, "netlify", "functions", "coach.js"), "utf8").includes("validateSnapshotProse(first, factText)"), "1j (Learn: a coach reply is checked against the figures it was given)");
    // Replay the tour
    const settings = (props = {}) => textOf(A.render(A.h(A.Settings, { data: demo(), setAppData: noop, setScreen: noop, onClose: noop, onReset: noop, theme: "dark", toggleTheme: noop,
      bankConnected: true, billingUi: { show: false }, onOpenUpgrade: noop, onReplayTour: noop, ...props })));
    t.ok(settings().includes("Replay the tour"), "1k Settings → Help & Support offers \"Replay the tour\"");
    t.ok(/const replayTour=\(\)=>\{ setShowSettings\(false\); setScreen\(TOUR_STEPS\[0\]\.screen\); setTourStep\(0\); \};/.test(APP), "1l …which closes Settings and starts again from Today");

    // The checklist ticks itself off from real state
    const C = await import("../src/lib/setupChecklist.js");
    const ids = (d, o) => C.setupChecklist(d, o).filter(i => i.done).map(i => i.id);
    t.eq(ids({}), [], "1m an empty household: nothing ticked");
    t.eq(ids({ incomes: [{ amount: "2400", freq: "biweekly" }] }), ["payday"], "1n an income with an amount ticks payday");
    t.eq(ids({ incomes: [{ amount: "" }], bills: [{ name: "Rent" }] }), ["bills"], "1o a bill ticks bills (an income with no amount does not tick payday)");
    t.eq(ids({ accounts: [{ institution: "Statement" }] }), ["bank"], "1p an imported statement ticks bank");
    t.eq(ids({ bankConnected: true }), ["bank"], "1q a linked bank ticks bank");
    t.eq(ids({}, { numberSeen: true }), ["number"], "1r the first number seen ticks number");
    t.eq(ids({ profile: { meetingSchedule: { lastMeetingAt: "2026-10-01T12:00:00Z" } } }), ["meeting"], "1s a meeting marked done ticks meeting");
    const full = { incomes: [{ amount: "1" }], bills: [{}], bankConnected: true, profile: { meetingSchedule: { lastMeetingAt: "2026-10-01" } } };
    t.eq([C.showSetupChecklist({}), C.showSetupChecklist({}, { dismissed: true }), C.showSetupChecklist({ demo: true }), C.showSetupChecklist(full, { numberSeen: true })],
      [true, false, false, false], "1t shown until dismissed or complete, and never in demo mode");
    noBanned("1u checklist", C.setupChecklist({}).map(i => i.label).join(" "));
    // On Today
    const today = (d) => textOf(A.render(A.h(A.Dashboard, { data: d, setAppData: noop, setScreen: noop, setShowNotifs: noop, onUpgrade: noop, onWhatIf: noop })));
    const own = { ...demo(), bills: [] };
    const tx = today(own).replace(/\s+,/g, ",");
    t.ok(tx.includes("Getting set up") && tx.includes("Bills added") && tx.includes("Bills added, not done yet") && tx.includes("Payday set, done"), "1v Today shows the checklist with what is and isn't done");
    t.ok(!today({ ...demo(), demo: true }).includes("Getting set up"), "1w …and never in demo mode");
    // Meet: a meeting can be marked done, never in demo
    const meet = (d) => textOf(A.render(A.h(A.MeetAgenda, { data: d, isCouple: false, setScreen: noop, setAppData: noop })));
    t.ok(meet(demo()).includes("Mark this meeting done") && !meet({ ...demo(), demo: true }).includes("Mark this meeting done"), "1x Meet offers \"Mark this meeting done\", never in demo mode");
    t.ok(/lastMeetingAt: new Date\(\)\.toISOString\(\)/.test(APP), "1y …which sets the schedule's lastMeetingAt");
  }

  // ── 2. Share Flourish works on a store app ───────────────────────────────────────────────────
  {
    const S = await import("../src/lib/share.js");
    t.eq(S.SHARE_URL, "https://flourishmoney.app", "2a the link is https://flourishmoney.app");
    const calls = [];
    const native = (p) => { calls.push(["native", p.url]); return Promise.resolve(); };
    const copy = (u) => { calls.push(["copy", u]); return Promise.resolve(); };
    // Android: no Web Share API in the WebView. The native sheet is used.
    t.eq(await S.shareFlourish({ platform: "android", nativeShare: native, webShare: null, copy }), "shared", "2b Android: the native share sheet opens (the WebView has no navigator.share)");
    t.eq(calls, [["native", "https://flourishmoney.app"]], "2c …with the flourishmoney.app link, and nothing copied");
    calls.length = 0;
    // Android where the plugin is missing or refuses: the link is copied, so the tap still does something.
    t.eq(await S.shareFlourish({ platform: "android", nativeShare: () => Promise.reject(new Error("not implemented")), webShare: null, copy }), "copied", "2d Android without the plugin: the link is copied");
    t.eq(calls, [["copy", "https://flourishmoney.app"]], "2e …the link itself");
    calls.length = 0;
    t.eq(await S.shareFlourish({ platform: "ios", nativeShare: () => Promise.reject(new Error("Share canceled")), copy }), "cancelled", "2f a share the person cancels does nothing more");
    t.eq(calls, [], "2g …and copies nothing");
    t.eq(await S.shareFlourish({ platform: "web", webShare: null, copy }), "copied", "2h a browser with no Web Share API copies the link");
    t.eq(await S.shareFlourish({ platform: "web", webShare: () => Promise.resolve(), copy }), "shared", "2i a browser with it shares");
    t.eq(await S.shareFlourish({ platform: "android", nativeShare: () => Promise.reject(new Error("x")), copy: () => Promise.reject(new Error("denied")) }), "failed", "2j if even copying fails, the caller shows the link");
    t.ok(/if\(outcome==="copied"\) alertModal\(\{message:`Link copied: \$\{SHARE_URL\}`\}\);/.test(APP) && /else if\(outcome==="failed"\) alertModal\(\{message:`Share this link: \$\{SHARE_URL\}`\}\);/.test(APP),
      "2k Settings says the link was copied, or shows it");
    const pkg = JSON.parse(fs.readFileSync(path.join(REPO, "package.json"), "utf8"));
    const spm = fs.readFileSync(path.join(REPO, "ios", "App", "CapApp-SPM", "Package.swift"), "utf8");
    const gradle = fs.readFileSync(path.join(REPO, "android", "capacitor.settings.gradle"), "utf8") + fs.readFileSync(path.join(REPO, "android", "app", "capacitor.build.gradle"), "utf8");
    t.ok(/^\^8\./.test(pkg.dependencies["@capacitor/share"] || "") && /CapacitorShare/.test(spm) && /:capacitor-share/.test(gradle), "2l @capacitor/share 8 is a dependency and registered in both native projects");
    noBanned("2m share copy", S.SHARE_TEXT);
  }

  // ── 3. Rate flourish, and the one automatic ask ──────────────────────────────────────────────
  {
    const SR = await import("../src/lib/storeReview.js");
    t.eq(SR.rateUrl("android"), "https://play.google.com/store/apps/details?id=com.flourishmoney.app", "3a Android: the Play listing for com.flourishmoney.app");
    const gradle = fs.readFileSync(path.join(REPO, "android", "app", "build.gradle"), "utf8");
    t.ok(gradle.includes(`applicationId "${SR.ANDROID_PACKAGE}"`), "3b (that is the app's applicationId)");
    t.eq([SR.APP_STORE_ID, SR.rateUrl("ios")], [null, null], "3c iOS: no App Store ID in the repo, so no row until it is set");
    t.eq(SR.rateUrl("ios", "6754321098"), "https://apps.apple.com/app/id6754321098?action=write-review", "3d …and once set, the App Store write-review page");
    t.eq(SR.rateUrl("web"), null, "3e the web has no store to review in");
    const real = globalThis.Capacitor;
    const as = (pl, fn) => { Object.defineProperty(globalThis, "Capacitor", { value: { ...real, getPlatform: () => pl, isNativePlatform: () => pl !== "web" }, configurable: true, writable: true }); try { return fn(); } finally { Object.defineProperty(globalThis, "Capacitor", { value: real, configurable: true, writable: true }); } };
    const settingsOn = (pl) => as(pl, () => textOf(A.render(A.h(A.Settings, { data: demo(), setAppData: noop, setScreen: noop, onClose: noop, onReset: noop, theme: "dark", toggleTheme: noop,
      bankConnected: true, billingUi: { show: false }, onOpenUpgrade: noop, onReplayTour: noop }))));
    t.eq(["android", "ios", "web"].map(pl => settingsOn(pl).includes("Rate flourish")), [true, false, false], "3f Settings shows \"Rate flourish\" on Android, and not on iOS (no ID yet) or the web");
    t.ok(/window\.location\.href=url/.test(APP), "3g the row opens the store page itself; nothing asks first");
  }

  // ── 4. FAQ on /support and in Help & Support ─────────────────────────────────────────────────
  {
    const { SUPPORT_EMAIL } = await import("../src/lib/supportContact.js");
    t.eq(A.FAQ.map(f => f.q), ["What is safe to spend?", "Is my bank login safe?", "My bank won't connect.", "Where do the numbers come from?", "What is the money meeting?",
      "Can I turn the AI coach off?", "Is this financial advice?", "How do I delete my account?", "How do I contact you?"], "4a the nine questions, in order");
    t.eq(A.FAQ.map(f => f.a), [
      "What's left until your next payday after bills due before payday, minimum debt payments, a spending buffer and a savings amount are accounted for. Tap the number to see the math.",
      "Bank connections go through Plaid and are read-only. flourish never sees or stores your bank password and cannot move money.",
      "Import a PDF or CSV statement, or enter your numbers by hand. Everything works without a bank connection.",
      "flourish calculates your figures from your accounts, bills and paydays. Tax and benefit amounts come from the CRA or IRS, with the year, and What-If shows any rate it assumes. The coach explains the numbers and never makes one up.",
      A.TERMS["Money meeting"],
      "Yes, in Settings. With it off, nothing is sent to AI, and every number, forecast and what-if still works.",
      "No. flourish explains your numbers and your options. It isn't a licensed adviser, and the decisions are yours.",
      "Settings, then Delete Account. You can also use flourishmoney.app/delete-account.",
      `Email ${SUPPORT_EMAIL}.`,
    ], "4b the answers (the money meeting is TERMS[\"Money meeting\"]; contact is SUPPORT_EMAIL; \"where do the numbers come from\" corrected to what is true)");
    noBanned("4c FAQ", A.FAQ.map(f => f.q + " " + f.a).join(" "));
    noAdvice("4d FAQ", A.FAQ.map(f => f.a));
    const support = textOf(A.render(A.h(A.SupportPage, { onBack: noop })));
    t.ok(A.FAQ.every(f => support.includes(f.q)) && support.includes("Questions and answers"), "4e /support (also Settings → Help & Support) shows every question");
    const html = A.render(A.h(A.SupportPage, { onBack: noop }));
    t.ok(/<details/.test(html) && /<summary[^>]*>What is safe to spend\?<\/summary>/.test(html) && /href="\/delete-account"/.test(html) && html.includes(`href="mailto:${SUPPORT_EMAIL}"`),
      "4f each answer opens from its question, with working delete and email links");
    // The claims hold in the build
    t.ok(APP.includes("Flourish never sees your bank login. You sign in with your bank through Plaid.") && /Read-only\. We can never move your money/.test(APP), "4g (bank: the existing read-only and never-sees-the-login claims, locked by bankLoginClaim.test)");
    t.ok(/ensureAiEnabled\("AI features are disabled\./.test(APP) && (APP.match(/ensureAiEnabled\("AI disabled"\)/g) || []).length >= 2, "4h (AI off: every call that sends to AI is gated)");
    // "Everything works without a bank connection": Activity no longer treats a household with no bank as sample data
    const noBank = { ...demo(), bankConnected: false, accounts: [{ id: "s1", name: "Chequing", type: "checking", balance: "2400", institution: "Statement" }] };
    const spend = (d) => textOf(A.render(A.h(A.SpendScreen, { data: d, setAppData: noop, setScreen: noop })));
    t.ok(spend(noBank).includes("From your statements and entries") && !spend(noBank).includes("Sample data"), "4i a household with no bank sees its own data as its own, not \"Sample data\"");
    t.ok(spend({ ...demo(), demo: true }).includes("Sample data") && spend(demo()).includes("Live from your bank"), "4j (the demo is still sample data; a linked bank is still live)");
    t.ok(/const isDemo=!!data\.demo;/.test(APP), "4k only the demo counts as sample data on Activity");
  }

  // ── 5. What makes flourish different ─────────────────────────────────────────────────────────
  {
    const W = A.WHAT_MAKES_DIFFERENT;
    t.eq(W, "flourish shows what's safe to spend before payday, not just what you spent. Safe to spend shows its math, line by line. A weekly 15-minute money meeting is built from your own week. Bank connections are read-only, and it works without one.",
      "5a the card, word for word (\"Every number shows its math.\" narrowed to what is true)");
    t.ok(!/(?<!read-)\bonly\b|better than|\bbest\b|unlike/i.test(W), "5b no \"only\" (read-only is about the connection), no \"better than\", no comparison");
    noBanned("5c different card", W);
    noAdvice("5d different card", [W]);
    const support = textOf(A.render(A.h(A.SupportPage, { onBack: noop })));
    t.ok(support.includes("What makes flourish different") && support.includes(W), "5e Help & Support shows the card");
    // The claims hold
    t.ok(/kind: "deduction"|kind:"deduction"/.test(fs.readFileSync(path.join(REPO, "src", "lib", "safeToSpendView.js"), "utf8")), "5f (safe to spend is shown as its rows: the math, line by line)");
    t.ok(/Your 15-minute money meeting/.test(APP), "5g (Meet is the 15-minute money meeting, built from the week)");
  }

  t.summary("testerSuggestions.test");
  setImmediate(() => process.exit(process.exitCode || 0));
})();
