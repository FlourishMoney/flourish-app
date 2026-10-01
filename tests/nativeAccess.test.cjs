// tests/nativeAccess.test.cjs
// -----------------------------------------------------------------------------
// ON A STORE APP NOTHING CLOSES WHEN THE TRIAL ENDS (prelaunch-copy, round 2, item 1).
//
// iOS and Android 1.0.0 have nothing to buy. So for a native user 30 days after signup, on the free
// plan, with the 14-day trial long over:
//   - Do → Credit opens (no gate);
//   - Meet offers the coach-run meeting (no "isn't included" line);
//   - the coach keeps its weekly message limit, worded as a limit, and that limit applies to EVERY native
//     user, a trial user included (only a paid or founder flag lifts it, and that is left as it was);
//   - no lock, trial or upgrade copy shows on any of these surfaces.
// The web keeps its rules: the free plan does not open Credit or the meeting, and a trial lifts the
// coach limit. Rendered through the real App.jsx bundle, with the platform switched at render time.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");
const { loadApp, textOf, describe, REPO } = require("./_renderApp.cjs");

const DAY = 86400000;
const LOCK = /isn't included|not available|locked|\btrial\b|\bupgrade\b|Flourish Plus|See plans|Get Flourish|Start \d+ days free/i;

function weekKey(d = new Date()) {
  const since = (d.getUTCDay() + 6) % 7;
  const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - since));
  return `${m.getUTCFullYear()}-${String(m.getUTCMonth() + 1).padStart(2, "0")}-${String(m.getUTCDate()).padStart(2, "0")}`;
}

(async () => {
  const t = create();
  const D = await import("../src/lib/demoFixture.js");
  let A = {};
  try {
    A = loadApp(["MeetAgenda", "CreditScreen", "AICoach", "PremiumGate", "creditAvailable", "facilitatorAvailable", "coachUnlimited",
      "canUseCoach", "isTrialActive", "getPlan", "FREE_TIER_LIMITS"]);
  } catch (e) { t.ok(false, `App.jsx bundles: ${describe(e)}`); }
  const real = globalThis.Capacitor;
  const setPlatform = (p) => Object.defineProperty(globalThis, "Capacitor", { value: { ...real, getPlatform: () => p, isNativePlatform: () => p !== "web" }, configurable: true, writable: true });
  const as = (p, fn) => { setPlatform(p); try { return fn(); } finally { setPlatform("web"); } };
  const render = (p, name, props) => as(p, () => textOf(A.render(A.h(A[name], props))));

  // A household that signed up 30 days ago: free plan, trial ended 16 days ago, coach unused this week.
  const now = Date.now();
  const setUser = ({ plan, coachUsed = 0, trialEndsInDays = -16 }) => {
    A.store.set("flourish_plan", plan);
    A.store.set("flourish_trial_started_at", new Date(now - 30 * DAY).toISOString());
    A.store.set("flourish_trial_ends_at", new Date(now + trialEndsInDays * DAY).toISOString());
    A.store.set("flourish_coach_usage", JSON.stringify({ period: weekKey(), count: coachUsed }));
  };
  setUser({ plan: "free" });
  t.eq([A.getPlan(), A.isTrialActive()], ["free", false], "0 (the household: 30 days after signup, free plan, trial over)");

  const made = new Date(now - 30 * DAY);
  const data = { accounts: D.demoAccountsFor("CA"), debts: D.demoDebtsFor("CA"), incomes: D.buildDemoIncomes(made, "CA"),
    bills: D.buildDemoBills(made, "CA"), transactions: D.buildDemoTxns(made, "CA"), profile: D.demoProfileFor("CA"), bankConnected: true };
  const noop = () => {};

  // ── 1. Credit ────────────────────────────────────────────────────────────────────────────────
  t.eq(as("ios", () => A.creditAvailable({ native: true, isPremium: false })), true, "1a a native free user 30 days in can open Credit");
  t.eq(A.creditAvailable({ native: false, isPremium: false }), false, "1b (the web free plan still cannot)");
  const app = fs.readFileSync(path.join(REPO, "src", "App.jsx"), "utf8");
  t.ok(/\(creditAvailable\(\{ native: nativeApp, isPremium \}\)\?<CreditScreen /.test(app), "1c the Do → Credit route asks that rule");
  let credit = "";
  try { credit = render("ios", "CreditScreen", { data, setScreen: noop }); } catch (e) { t.ok(false, `1d Credit renders: ${describe(e)}`); }
  t.ok(credit.length > 100 && !LOCK.test(credit), `1d the Credit screen renders for them with no lock, trial or upgrade copy (${credit.length} chars)`);

  // ── 2. The Meet facilitator ──────────────────────────────────────────────────────────────────
  t.eq(as("ios", () => A.facilitatorAvailable({ native: true })), true, "2a a native free user 30 days in can run the coach meeting");
  t.eq(A.facilitatorAvailable({ native: false }), false, "2b (the web free plan still cannot)");
  const meet = render("ios", "MeetAgenda", { data, isCouple: false, setScreen: noop });
  t.ok(/Start solo check-in/.test(meet), "2c Meet offers them the meeting");
  t.ok(!LOCK.test(meet), "2d …with no lock, trial or upgrade copy");
  const webMeet = render("web", "MeetAgenda", { data, isCouple: false, setScreen: noop });
  t.ok(!/Start solo check-in/.test(webMeet) && /Start your trial/.test(webMeet), "2e (the web free plan still sees its own line)");

  // ── 3. The coach: a weekly limit for every native user ───────────────────────────────────────
  t.eq(as("ios", () => A.canUseCoach({ native: true })), true, "3a with this week's messages unused, the coach opens");
  const coach = render("ios", "AICoach", { data, isOnline: true, isPremium: false, coachMsgCount: 0, setScreen: noop, setAppData: noop });
  t.ok(/left this week/.test(coach) && !LOCK.test(coach), "3b the coach shows its weekly count as a limit, with no lock, trial or upgrade copy");
  setUser({ plan: "free", coachUsed: 2 });
  t.eq(as("ios", () => A.canUseCoach({ native: true })), false, "3c once the week's 2 messages are used, the limit applies");
  const note = (app.match(/nativeNote=\{`([^`]+)`\}/) || [])[1] || "";
  t.eq(note, "You've used this week's ${FREE_TIER_LIMITS.coachMessagesPerWeek} coach messages. They reset Monday.", "3d the coach gate's native line is a usage limit");
  const gate = render("ios", "PremiumGate", { feature: "AI Coach", desc: "Coaching from your own numbers.", nativeNote: note.replace("${FREE_TIER_LIMITS.coachMessagesPerWeek}", String(A.FREE_TIER_LIMITS.coachMessagesPerWeek)) });
  t.ok(/You've used this week's 2 coach messages\. They reset Monday\./.test(gate) && !LOCK.test(gate), "3e …worded as a limit, never as a plan, trial or upgrade");
  // The same limit for a native user still IN the trial: on a store app the trial lifts nothing.
  setUser({ plan: "trial", coachUsed: 2, trialEndsInDays: 10 });
  t.eq(A.isTrialActive(), true, "3f (a household still in its trial)");
  t.eq([as("ios", () => A.canUseCoach({ native: true })), as("ios", () => A.coachUnlimited({ native: true, isPremium: true }))], [false, false],
    "3g on a store app the weekly limit applies to them too: it is the same for everyone");
  t.eq([A.canUseCoach(), A.coachUnlimited({ native: false, isPremium: true })], [true, true], "3h (on the web a trial still lifts it, as before)");
  setUser({ plan: "beta_founder", coachUsed: 2 });
  t.eq(as("ios", () => A.coachUnlimited({ native: true, isPremium: true })), true, "3i a founder flag still lifts it on a store app (plan flags left as they were)");

  t.summary("nativeAccess.test");
  setImmediate(() => process.exit(process.exitCode || 0));
})();
