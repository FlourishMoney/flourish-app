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
  try { A = loadApp(["Settings", "Dashboard", "MeetAgenda", "FAQ", "TERMS", "SupportPage", "SpendScreen", "WHAT_MAKES_DIFFERENT", "FeedbackSheet", "WeekOneCard"]); } catch (e) { t.ok(false, `App.jsx bundles: ${describe(e)}`); }
  const D = await import("../src/lib/demoFixture.js");
  const noop = () => {};
  const settingsText = () => textOf(A.render(A.h(A.Settings, { data: demo(), setAppData: noop, setScreen: noop, onClose: noop, onReset: noop, theme: "dark", toggleTheme: noop,
    bankConnected: true, billingUi: { show: false }, onOpenUpgrade: noop, onReplayTour: noop })));
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
      "Your coach. Ask what a number means. It explains Flourish's math and never invents a figure.",
      "15 minutes a week. An agenda built from your week, for you or for you and your partner.",
    ], "1c the copy, word for word (Watch without \"The next 90 days.\": Watch opens on 30 days)");
    noBanned("1d tour", T.TOUR_STEPS.map(s => s.title + " " + s.body).join(" "));
    noAdvice("1d2 tour", T.TOUR_STEPS.map(s => s.body));
    t.ok(!/AI Financial Guidance|tax tips, debt strategy|Activity & Budgets|Goals & Credit|Today Screen/.test(APP), "1e the stale tour (old screen names, \"Ask anything: tax tips, debt strategy\") is gone");
    t.ok(/const TOUR=TOUR_STEPS;/.test(APP) && />\s*Skip\s*<\/button>/.test(APP) && !/Skip Tour/.test(APP), "1f the tour reads lib/tour.js and every step has Skip");
    t.ok(/role="dialog" aria-modal="true" aria-labelledby="tour-title"/.test(APP), "1g the tour is a labelled dialog");
    // The sentences hold in the build
    t.ok(/aria-label="How Flourish got this number"/.test(APP) && /setExplain\("safeToSpend"\)/.test(APP), "1h (Today: the number is a button that opens its math)");
    const WR = await import("../src/lib/watchRange.js");
    t.ok(/const RANGES = WATCH_RANGES;/.test(APP) && WR.WATCH_RANGES.join() === "7,30,90" && /function PlanAhead\(\{data, setAppData, setScreen, initialRange = 30\}\)/.test(APP),
      "1i (Watch: 30 days by default, 90 is a range, so \"The next 90 days\" was not shipped)");
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

  // ── 3. Rate Flourish, and the one automatic ask ──────────────────────────────────────────────
  {
    const SR = await import("../src/lib/storeReview.js");
    t.eq(SR.rateUrl("android"), "https://play.google.com/store/apps/details?id=com.flourishmoney.app", "3a Android: the Play listing for com.flourishmoney.app");
    const gradle = fs.readFileSync(path.join(REPO, "android", "app", "build.gradle"), "utf8");
    t.ok(gradle.includes(`applicationId "${SR.ANDROID_PACKAGE}"`), "3b (that is the app's applicationId)");
    // Prompt 4b: the App Store ID, from App Store Connect (apps/6792967778, "Flourish: Money, Handled"). Pinned.
    t.eq(SR.APP_STORE_ID, "6792967778", "3c iOS: the App Store ID is 6792967778");
    t.eq(SR.rateUrl("ios"), "https://apps.apple.com/app/id6792967778?action=write-review", "3c2 …and Rate opens its App Store write-review page");
    t.eq(SR.rateUrl("ios", "6754321098"), "https://apps.apple.com/app/id6754321098?action=write-review", "3d …and once set, the App Store write-review page");
    t.eq(SR.rateUrl("web"), null, "3e the web has no store to review in");
    const real = globalThis.Capacitor;
    const as = (pl, fn) => { Object.defineProperty(globalThis, "Capacitor", { value: { ...real, getPlatform: () => pl, isNativePlatform: () => pl !== "web" }, configurable: true, writable: true }); try { return fn(); } finally { Object.defineProperty(globalThis, "Capacitor", { value: real, configurable: true, writable: true }); } };
    const settingsOn = (pl) => as(pl, () => textOf(A.render(A.h(A.Settings, { data: demo(), setAppData: noop, setScreen: noop, onClose: noop, onReset: noop, theme: "dark", toggleTheme: noop,
      bankConnected: true, billingUi: { show: false }, onOpenUpgrade: noop, onReplayTour: noop }))));
    t.eq(["android", "ios", "web"].map(pl => settingsOn(pl).includes("Rate Flourish")), [true, true, false], "3f Settings shows \"Rate Flourish\" on Android and iOS, and not on the web");
    t.ok(/window\.location\.href=url/.test(APP), "3g the row opens the store page itself; nothing asks first");
  }

  // ── 4. FAQ on /support and in Help & Support ─────────────────────────────────────────────────
  {
    const { SUPPORT_EMAIL } = await import("../src/lib/supportContact.js");
    t.eq(A.FAQ.map(f => f.q), ["What is safe to spend?", "Is my bank login safe?", "My bank won't connect.", "Where do the numbers come from?", "What is the money meeting?",
      "Can I turn the AI coach off?", "Is this financial advice?", "How do I delete my account?", "How do I contact you?"], "4a the nine questions, in order");
    t.eq(A.FAQ.map(f => f.a), [
      "What's left until your next payday after bills due before payday, minimum debt payments, a spending buffer and a savings amount are accounted for. Tap the number to see the math.",
      "Bank connections go through Plaid and are read-only. Flourish never sees or stores your bank password and cannot move money.",
      "Import a PDF or CSV statement, or enter your numbers by hand. Everything works without a bank connection.",
      "Flourish calculates your figures from your accounts, bills and paydays. Tax and benefit amounts come from the CRA or IRS, with the year, and What-If shows any rate it assumes. The coach explains the numbers and never makes one up.",
      A.TERMS["Money meeting"],
      "Yes, in Settings. With it off, nothing is sent to AI, and every number, forecast and what-if still works.",
      "No. Flourish explains your numbers and your options. It isn't a licensed adviser, and the decisions are yours.",
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

  // ── 5. What makes Flourish different ─────────────────────────────────────────────────────────
  {
    const W = A.WHAT_MAKES_DIFFERENT;
    t.eq(W, "Flourish shows what's safe to spend before payday, not just what you spent. Safe to spend shows its math, line by line. A weekly 15-minute money meeting is built from your own week. Bank connections are read-only, and it works without one.",
      "5a the card, word for word (\"Every number shows its math.\" narrowed to what is true)");
    t.ok(!/(?<!read-)\bonly\b|better than|\bbest\b|unlike/i.test(W), "5b no \"only\" (read-only is about the connection), no \"better than\", no comparison");
    noBanned("5c different card", W);
    noAdvice("5d different card", [W]);
    const support = textOf(A.render(A.h(A.SupportPage, { onBack: noop })));
    t.ok(support.includes("What makes Flourish different") && support.includes(W), "5e Help & Support shows the card");
    // The claims hold
    t.ok(/kind: "deduction"|kind:"deduction"/.test(fs.readFileSync(path.join(REPO, "src", "lib", "safeToSpendView.js"), "utf8")), "5f (safe to spend is shown as its rows: the math, line by line)");
    t.ok(/Your weekly 15-minute money meeting/.test(APP), "5g (Meet is the weekly 15-minute money meeting, built from the week)");
  }

  // ── 6. Feedback, saved to our own table ──────────────────────────────────────────────────────
  {
    const F = await import("../src/lib/feedback.js");
    t.eq(F.FEEDBACK_KINDS.map(k => k.value), ["idea", "problem", "praise"], "6a three kinds: idea, problem, praise");
    t.eq(F.WEEK_ONE_QUESTION, "What did Flourish help you understand about your money this week?", "6b the day-7 question, word for word");
    noBanned("6c feedback copy", [F.WEEK_ONE_QUESTION, ...F.FEEDBACK_KINDS.map(k => k.label)].join(" "));
    // Signed out: nothing is written
    const calls = [];
    const client = { from: (tbl) => ({ insert: async (row) => { calls.push([tbl, row]); return { error: null }; } }) };
    t.eq(await F.submitFeedback({ client, userId: null, kind: "idea", message: "Hello" }), { ok: false, reason: "signed_out" }, "6d signed out: refused");
    t.eq(await F.submitFeedback({ client, userId: undefined, kind: F.WEEK_ONE_KIND, message: "Hello" }), { ok: false, reason: "signed_out" }, "6e …the day-7 answer too");
    t.eq(calls, [], "6f …and nothing reached the database");
    t.eq(await F.submitFeedback({ client, userId: "u1", kind: "idea", message: "   " }), { ok: false, reason: "invalid" }, "6g an empty message is not sent");
    t.eq(await F.submitFeedback({ client, userId: "u1", kind: "rating", message: "5 stars" }), { ok: false, reason: "invalid" }, "6h nor an unknown kind");
    t.eq(calls, [], "6i (still nothing written)");
    t.eq(await F.submitFeedback({ client, userId: "u1", kind: "problem", message: " The forecast skipped my rent. ", platform: "android" }), { ok: true }, "6j signed in: sent");
    t.eq(calls, [["feedback", { user_id: "u1", kind: "problem", message: "The forecast skipped my rent.", app_version: null, platform: "android" }]], "6k …one row in our own feedback table");
    const failing = { from: () => ({ insert: async () => ({ error: { message: "x" } }) }) };
    t.eq((await F.submitFeedback({ client: failing, userId: "u1", kind: "praise", message: "Nice" })).reason, "error", "6l a failed write says so");
    // The form, signed out (the demo is signed out)
    const sheet = textOf(A.render(A.h(A.FeedbackSheet, { onClose: noop })));
    t.ok(sheet.includes("Sign in to send feedback") && !/>Send</.test(A.render(A.h(A.FeedbackSheet, { onClose: noop }))), "6m signed out, the form says so and offers no Send");
    t.ok(/submitFeedback\(\{ client:supabase, userId:account\?\.id, kind, message, platform:currentPlatform\(\), appVersion:appVersionLabel\(\) \}\)/.test(APP), "6n the form sends as the signed-in account only");
    t.ok(settingsText().includes("Send feedback"), "6o Settings → Help & Support offers \"Send feedback\"");
    // The day-7 question
    const day = 24 * 60 * 60 * 1000, start = new Date("2026-10-01T09:00:00");
    const due = (o) => F.weekOneDue({ signedUpAt: start.toISOString(), signedIn: true, ...o });
    t.eq([due({ now: new Date(start.getTime() + 6.9 * day) }), due({ now: new Date(start.getTime() + 7 * day) }), due({ now: new Date(start.getTime() + 30 * day) })],
      [false, true, true], "6p shown from day 7 after signup (not before)");
    t.eq([due({ now: new Date(start.getTime() + 8 * day), done: true }), due({ now: new Date(start.getTime() + 8 * day), demo: true }), due({ now: new Date(start.getTime() + 8 * day), signedIn: false })],
      [false, false, false], "6q once (not after it was answered or skipped), never in demo, never signed out");
    t.eq(A.render(A.h(A.WeekOneCard, { data: demo(), setAppData: noop })), "", "6r signed out, the card renders nothing");
    t.ok(/weekOneCheckIn:\{\[field\]:new Date\(\)\.toISOString\(\)\}/.test(APP) && /finish\("skippedAt"\)/.test(APP), "6s answering or skipping is recorded on the profile (a date, never the answer)");
    // The table
    const sql = fs.readFileSync(path.join(REPO, "supabase", "migrations", "0013_feedback.sql"), "utf8");
    t.ok(/create table if not exists public\.feedback/.test(sql) && /references auth\.users\(id\) on delete cascade/.test(sql), "6t migration 0013 adds public.feedback, deleted with the account");
    t.ok(/enable row level security/.test(sql) && /for insert to authenticated with check \(auth\.uid\(\) = user_id\)/.test(sql), "6u RLS: a signed-in person may insert their own rows");
    t.ok(!/for (select|update|delete|all)\b/.test(sql) && /grant insert\s+on table public\.feedback to authenticated;/.test(sql) && !/to anon/.test(sql), "6v …and nothing else: no read-back, no anon access");
    t.ok(/for \(const table of \["meeting_records", "subscriptions", "feedback"\]\)/.test(fs.readFileSync(path.join(REPO, "netlify", "functions", "plaid.js"), "utf8")), "6w deleting the account deletes the feedback too");
    // Prompt 4b item 5: production already had an older public.feedback (no created_at, 0 rows), so
    // the first run stopped at the created_at index (ERROR 42703) and changed nothing. Step 0 moves an
    // empty older table aside, stops on one with rows, and never drops anything. (Run against the
    // Supabase Postgres 17.6 image in a local throwaway container for this commit: fresh, old and
    // empty, old with a row, and a second run of each.)
    const code = sql.replace(/--[^\n]*/g, "");
    const step0 = code.slice(code.indexOf("do $$"), code.indexOf("create table if not exists public.feedback"));
    t.ok(step0.length > 200 && /information_schema\.columns[\s\S]*column_name = 'created_at'/.test(step0), "6y step 0 looks for an older public.feedback without created_at, before the table is created");
    t.ok(/select count\(\*\) from public\.feedback/.test(step0) && /if rows_in_old > 0 then\s*raise exception/.test(step0), "6y2 …with rows in it, it stops with an error and changes nothing");
    t.ok(/alter table public\.feedback rename to feedback_legacy_unused;/.test(step0) && /rename constraint/.test(step0) && /alter index public\.%I rename to %I/.test(step0),
      "6y3 …empty, it is renamed public.feedback_legacy_unused, its constraint and index names with it");
    t.ok(/raise exception 'public\.feedback has created_at but not the shape/.test(step0), "6y4 a public.feedback with created_at but another shape stops it too");
    t.ok(!/\bdrop\s+table\b/i.test(code) && !/\bdrop\s+(column|schema)\b/i.test(code), "6y5 the migration drops nothing");
    const newTable = code.slice(code.indexOf("create table if not exists public.feedback"), code.indexOf(");", code.indexOf("create table if not exists public.feedback")));
    t.ok(newTable.length > 100 && !/\bemail\b/i.test(newTable), "6y6 the new table has no email column");
    t.ok(/revoke all\s+on table public\.feedback from anon, authenticated;\s*grant insert\s+on table public\.feedback to authenticated;/.test(code), "6y7 the default Data API grants are revoked, then INSERT alone is granted");
    t.ok(!/\bemail\b/.test(fs.readFileSync(path.join(REPO, "src", "lib", "feedback.js"), "utf8").replace(/\/\/[^\n]*/g, "")) && !Object.keys(F.feedbackRow({ userId: "u", kind: "idea", message: "Hi" })).includes("email"),
      "6y8 …and the form never stores an email address");
    const allSrc = fs.readdirSync(path.join(REPO, "src", "lib")).map(f => fs.readFileSync(path.join(REPO, "src", "lib", f), "utf8")).join("\n") + APP;
    t.ok(!/typeform|forms\.gle|docs\.google\.com\/forms|formspree|tally\.so|jotform|surveymonkey/i.test(allSrc), "6x no third-party form service");
  }

  // ── 7. What's new ────────────────────────────────────────────────────────────────────────────
  {
    const W = JSON.parse(fs.readFileSync(path.join(REPO, "src", "whatsNew.json"), "utf8"));
    const pkg = JSON.parse(fs.readFileSync(path.join(REPO, "package.json"), "utf8"));
    const pbx = fs.readFileSync(path.join(REPO, "ios", "App", "App.xcodeproj", "project.pbxproj"), "utf8");
    const gradle = fs.readFileSync(path.join(REPO, "android", "app", "build.gradle"), "utf8");
    const iosBuilds = [...new Set([...pbx.matchAll(/CURRENT_PROJECT_VERSION = (\d+);/g)].map(m => Number(m[1])))];
    const iosVersions = [...new Set([...pbx.matchAll(/MARKETING_VERSION = ([\d.]+);/g)].map(m => m[1]))];
    t.eq([W.version, pkg.version, iosVersions, (gradle.match(/versionName "([^"]+)"/) || [])[1]], ["1.0.0", "1.0.0", ["1.0.0"], "1.0.0"], "7a one version, 1.0.0, in whatsNew.json, package.json, Xcode and Gradle");
    t.eq([W.builds.ios, iosBuilds, W.builds.android, Number((gradle.match(/versionCode (\d+)/) || [])[1])], [526902, [526902], 13, 13], "7b the builds in whatsNew.json are the ones the projects build: iOS 526902, Android 13");
    t.ok(Array.isArray(W.notes) && W.notes.length >= 3, "7c release notes are in the same file");
    noBanned("7d release notes", W.notes.join(" "));
    noAdvice("7e release notes", W.notes);
    const st = settingsText();
    t.ok(st.includes("What's new") && st.includes("Version 1.0.0") && /aria-expanded="false" aria-controls="whats-new-notes"/.test(A.render(A.h(A.Settings, { data: demo(), setAppData: noop, setScreen: noop, onClose: noop, onReset: noop, theme: "dark", toggleTheme: noop, bankConnected: true, billingUi: { show: false }, onOpenUpgrade: noop }))),
      "7f Settings shows What's new and the version, and opens the notes from it");
    t.ok(/\{WHATS_NEW\.notes\.map\(\(n,i\)=><li key=\{i\}/.test(APP), "7f2 …the notes from whatsNew.json");
    t.ok(/appVersion:appVersionLabel\(\)/.test(APP), "7g feedback is sent with the version it came from");
  }

  // ── 2b. Brand casing (prompt 4b item 2) ─────────────────────────────────────────────────────
  // In-app copy says "Flourish". Every string this PR added names it with a capital F; the lowercase
  // wordmark is an image and the header lockup, not copy, and is not checked here.
  {
    const lower = /(^|[^A-Za-z_.@/-])flourish(?![A-Za-z_.@-])/;
    const Tr = await import("../src/lib/tour.js"), Ck = await import("../src/lib/setupChecklist.js"), Fb = await import("../src/lib/feedback.js"), Sh = await import("../src/lib/share.js");
    const WN = JSON.parse(fs.readFileSync(path.join(REPO, "src", "whatsNew.json"), "utf8"));
    const strings = [
      ...Tr.TOUR_STEPS.flatMap(st => [st.title, st.body]),
      ...A.FAQ.flatMap(f => [f.q, f.a]), A.WHAT_MAKES_DIFFERENT, "What makes Flourish different",
      Fb.WEEK_ONE_QUESTION, ...Fb.FEEDBACK_KINDS.map(k => k.label), ...WN.notes,
      ...Ck.setupChecklist({}).map(i => i.label), Sh.SHARE_TITLE, Sh.SHARE_TEXT,
    ];
    t.eq(strings.filter(x => lower.test(x)), [], "2b every string this PR added says \"Flourish\" with a capital F");
    t.ok(/<Btn label="Rate Flourish"/.test(APP) && />What makes Flourish different<\/h2>/.test(APP) && !/label="Rate flourish"/.test(APP), "2c …including the Rate row and the card's heading");
  }

  // ── 3b. The meeting is weekly everywhere (prompt 4b item 3) ──────────────────────────────────
  {
    const MS = await import("../src/lib/meetingSchedule.js");
    const Tr = await import("../src/lib/tour.js"), Ck = await import("../src/lib/setupChecklist.js");
    t.eq([MS.DEFAULT_MEETING_CADENCE, MS.meetingScheduleOf(undefined).cadence, MS.meetingScheduleOf({}).cadence], ["weekly", "weekly", "weekly"],
      "3b1 a household with no schedule gets a weekly one");
    const chosen = { cadence: "biweekly", dayOfWeek: 3, lastMeetingAt: "2026-09-20T10:00:00.000Z", enabled: true };
    t.eq(MS.meetingScheduleOf(chosen), chosen, "3b2 a schedule a household already chose keeps every field, cadence included");
    t.eq(MS.meetingScheduleOf({ cadence: "monthly" }).cadence, "monthly", "3b3 …monthly too");
    const last = new Date(2026, 0, 4);
    t.eq([MS.computeNextMeeting({ dayOfWeek: 0, lastMeetingAt: last }, new Date(2026, 0, 5)).nextDate.getDate(),
          MS.computeNextMeeting({ cadence: "biweekly", dayOfWeek: 0, lastMeetingAt: last }, new Date(2026, 0, 5)).nextDate.getDate()], [11, 18],
      "3b4 no cadence stored: next meeting a week on (Jan 11); a stored biweekly one stays two weeks (Jan 18)");
    t.ok(!/cadence:"biweekly"/.test(APP) && (APP.match(/meetingScheduleOf\(/g) || []).length >= 3,
      "3b5 the Meet screen, its schedule and \"Mark this meeting done\" all take the default from meetingScheduleOf, none writes biweekly");
    const meetBody = Tr.TOUR_STEPS.find(st => st.title === "Meet").body;
    const copy = [meetBody, A.FAQ.find(f => /money meeting/.test(f.q)).a, A.WHAT_MAKES_DIFFERENT, ...Ck.setupChecklist({}).map(i => i.label)];
    t.ok(/a week\b/.test(meetBody) && /on the week\b/.test(copy[1]) && /\bweekly\b/.test(A.WHAT_MAKES_DIFFERENT) && /subtitle="Your weekly 15-minute money meeting"/.test(APP),
      "3b6 the tour, the FAQ, the card and Meet's heading all say weekly");
    t.eq(copy.filter(x => /biweekly|bi-weekly|two weeks|2 weeks|fortnight|every other week|monthly/i.test(x)), [], "3b7 …and none of them, or the setup checklist, names another cadence");
  }

  // ── 8. Accessibility (the browser half is a11y.browser.test.cjs) ─────────────────────────────
  {
    const pal = (name) => { const m = APP.match(new RegExp(`const ${name} = \\{([\\s\\S]*?)\\n\\};`)); const o = {};
      for (const [, k, v] of (m ? m[1] : "").matchAll(/(\w+):"([^"]+)"/g)) o[k] = v; return o; };
    const hex = (h) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
    const rgba = (s) => { const m = s.match(/rgba\((\d+),(\d+),(\d+),([\d.]+)\)/); return m ? [[+m[1], +m[2], +m[3]], +m[4]] : [hex(s), 1]; };
    const mix = (fg, a, bg) => fg.map((c, i) => c * a + bg[i] * (1 - a));
    const lum = (c) => { const l = c.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2]; };
    const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
    for (const name of ["DARK_C", "LIGHT_C"]) {
      const P = pal(name);
      for (const [ink, base] of [["greenInk", "green"], ["tealInk", "teal"], ["redInk", "red"]]) {
        t.ok(/^#[0-9A-F]{6}$/i.test(P[ink] || ""), `8a ${name}.${ink} is defined`);
        if (!P[ink]) continue;
        // The worst case: the colour's own tint (up to 0x33 = 20%) on the darkest (light) or lightest (dark) surface.
        for (const surf of ["bg", "card", "cardAlt"]) {
          const s0 = rgba(P[surf])[0];
          const tinted = mix(hex(P[base]), 0x33 / 255, s0);
          const r = ratio(hex(P[ink]), tinted);
          t.ok(r >= 4.5, `8b ${name}: ${ink} on a ${base} tint over ${surf} clears AA 4.5:1 (${r.toFixed(2)})`);
        }
      }
    }
    t.ok(/aria-pressed=\{on\}/.test(APP), "8c segmented tabs say which one is selected (aria-pressed)");
    t.ok(/aria-label="Confirm budget amount"/.test(APP) && /aria-label="Add chore"/.test(APP), "8d the two icon-only buttons the browser check does not reach are named");
    const icon = [...APP.matchAll(/<button\b((?:[^<>]|=>|\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\})*?)>([^<{]{1,6})<\/button>/g)]
      .filter(m => { const x = m[2].trim(); return x && !/[A-Za-z0-9]/.test(x) && !/aria-label|title=/.test(m[1]); }).map(m => m[2].trim());
    t.eq(icon, [], "8e no icon-only button in App.jsx without an aria-label");
    const pkg = JSON.parse(fs.readFileSync(path.join(REPO, "package.json"), "utf8"));
    t.ok(/node tests\/a11y\.browser\.test\.cjs/.test(pkg.scripts["test:math"]), "8f the axe check runs in the gate");
    t.ok(!!(pkg.devDependencies || {})["axe-core"], "8g axe-core is a dev dependency, not shipped");
  }

  t.summary("testerSuggestions.test");
  setImmediate(() => process.exit(process.exitCode || 0));
})();
