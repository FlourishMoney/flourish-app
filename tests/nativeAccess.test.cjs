// tests/nativeAccess.test.cjs
// -----------------------------------------------------------------------------
// A STORE APP FOLLOWS THE WEB'S RULES (founder's decision, 2026-10-20; it replaced "on a store app nothing
// closes when the trial ends", prelaunch-copy round 2, item 1).
//
// For the same household, the iOS app, the Android app and the web now give the same answer:
//   - in the 14-day trial: Credit, the coach-run meeting, the coach and What-If are all open, unlimited;
//   - after it, on the free plan: Credit and the meeting are closed, the coach has 2 messages a week and
//     What-If 1 a day (FREE_TIER_LIMITS);
//   - a founder, a beta founder or a household paying on the web ("premium"): everything open.
// What a store app shows when something is closed sells nothing: no price, no upgrade button, no Plus
// pitch (section 5; the wording itself is src/lib/freePlan.js). Rendered through the real App.jsx bundle,
// with the platform switched at render time. The server's half is tests/nativeTrialLimits.test.cjs.
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
      "canUseCoach", "isTrialActive", "getPlan", "FREE_TIER_LIMITS", "getSimulationsRemaining", "canRunSimulation", "recordSimulationUse",
      "TermsOfService"]);
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

  const PLATFORMS = ["ios", "android", "web"];
  // A price is an amount per month or year, or in CAD; the agenda's own figures ("Phone $65 out") are not one.
  const PURCHASE = /\bupgrade\b|Flourish Plus|See plans|Get Flourish|Start \d+ days free|Cancel any time|\$[\d,.]+\s*(\/|per |a )\s*(month|year|mo\b|yr\b)|\bCAD\b|per month|per year|flourishmoney\.app/i;
  const HOUSEHOLDS = {
    trial:   () => setUser({ plan: "trial", trialEndsInDays: 10 }),
    free:    () => setUser({ plan: "free" }),
    founder: () => setUser({ plan: "beta_founder" }),
    paid:    () => setUser({ plan: "premium" }),
  };
  const OPEN = { trial: true, free: false, founder: true, paid: true };
  const isPremium = () => ["premium", "beta_founder", "trial"].includes(A.getPlan()) && (A.getPlan() !== "trial" || A.isTrialActive());

  // ── 1. Credit and the coach-run meeting: open in the trial and for a founder or a paying household,
  //       closed on the free plan, the same on every platform ─────────────────────────────────────────
  for (const [who, set] of Object.entries(HOUSEHOLDS)) {
    set();
    for (const p of PLATFORMS) {
      t.eq(as(p, () => [A.creditAvailable({ isPremium: isPremium() }), A.facilitatorAvailable()]), [OPEN[who], OPEN[who]],
        `1a ${p}: ${who}: Credit and the coach-run meeting are ${OPEN[who] ? "open" : "closed"}`);
    }
  }
  const app = fs.readFileSync(path.join(REPO, "src", "App.jsx"), "utf8");
  t.ok(/\(creditAvailable\(\{ isPremium \}\)\?<CreditScreen /.test(app), "1b the Do → Credit route asks that rule, with no platform");
  t.ok(/const canFacilitate = facilitatorAvailable\(\);/.test(app), "1c Meet asks that rule, with no platform");
  t.ok(!/creditAvailable\(\{[^}]*native|facilitatorAvailable\(\{[^}]*native|coachUnlimited\(\{[^}]*native/.test(app), "1d no call passes a store-app flag");
  setUser({ plan: "trial", trialEndsInDays: 10 });
  let credit = "";
  try { credit = render("ios", "CreditScreen", { data, setScreen: noop }); } catch (e) { t.ok(false, `1e Credit renders: ${describe(e)}`); }
  t.ok(credit.length > 100 && !PURCHASE.test(credit), `1e in the trial the Credit screen renders in the iOS app, selling nothing (${credit.length} chars)`);
  const trialMeet = render("ios", "MeetAgenda", { data, isCouple: false, setScreen: noop });
  t.ok(/Start solo check-in/.test(trialMeet), "1f in the trial Meet offers the meeting in the iOS app");

  // ── 2. after the trial, the closed features sell nothing in a store app ──────────────────────────────
  setUser({ plan: "free" });
  for (const p of ["ios", "android"]) {
    const meet = render(p, "MeetAgenda", { data, isCouple: false, setScreen: noop });
    t.ok(!/Start solo check-in/.test(meet), `2a ${p}: free plan: Meet does not offer the meeting`);
    t.ok(!PURCHASE.test(meet), `2b ${p}: …and sells nothing`);
    const gate = render(p, "PremiumGate", { feature: "Credit Coaching", desc: "What goes into a credit score.", onUpgrade: noop });
    t.ok(gate.length > 20 && !PURCHASE.test(gate), `2c ${p}: the closed Credit screen sells nothing: no price, no upgrade button, no Plus pitch`);
  }
  const webGate = render("web", "PremiumGate", { feature: "Credit Coaching", desc: "What goes into a credit score.", onUpgrade: noop });
  t.ok(PURCHASE.test(webGate), "2d (not vacuous: the web's closed Credit screen does offer the paid plan)");

  // ── 3. the coach: the trial lifts the weekly limit, the free plan has it ─────────────────────────────
  for (const p of PLATFORMS) {
    setUser({ plan: "trial", coachUsed: 2, trialEndsInDays: 10 });
    t.eq(as(p, () => [A.canUseCoach(), A.coachUnlimited({ isPremium: true })]), [true, true], `3a ${p}: in the trial the weekly limit is lifted, even after 2 messages`);
    setUser({ plan: "free", coachUsed: 0 });
    t.eq(as(p, () => A.canUseCoach()), true, `3b ${p}: free plan: the week's first message is allowed`);
    setUser({ plan: "free", coachUsed: 2 });
    t.eq(as(p, () => A.canUseCoach()), false, `3c ${p}: …and after ${A.FREE_TIER_LIMITS.coachMessagesPerWeek}, the limit applies`);
    for (const plan of ["beta_founder", "premium"]) {
      setUser({ plan, coachUsed: 2 });
      t.eq(as(p, () => A.canUseCoach()), true, `3d ${p}: a ${plan} household is not limited`);
    }
  }
  setUser({ plan: "free", coachUsed: 0 });
  const coach = render("ios", "AICoach", { data, isOnline: true, isPremium: false, coachMsgCount: 0, setScreen: noop, setAppData: noop });
  t.ok(/left this week/.test(coach) && !PURCHASE.test(coach), "3e in the iOS app the free coach shows its weekly count, selling nothing");
  const note = (app.match(/nativeNote=\{`([^`]+)`\}/) || [])[1] || "";
  t.eq(note, "You've used this week's ${FREE_TIER_LIMITS.coachMessagesPerWeek} coach messages. They reset Monday.", "3f the coach gate's store-app line is the limit and when it lifts");

  // ── 4. What-If: unlimited in the trial, 1 a day on the free plan ─────────────────────────────────────
  {
    const SIM = "flourish_sim_usage";
    const whatIf = (p, who) => {
      HOUSEHOLDS[who](); A.store.set(SIM, "");
      const before = as(p, () => A.getSimulationsRemaining());
      as(p, () => A.recordSimulationUse());
      return [before, as(p, () => A.getSimulationsRemaining()), as(p, () => A.canRunSimulation())];
    };
    t.eq(A.FREE_TIER_LIMITS.simulationsPerDay, 1, "4a (the free plan's What-If limit is 1 a day)");
    for (const p of PLATFORMS) {
      t.eq(whatIf(p, "trial"), [Infinity, Infinity, true], `4b ${p}: in the trial What-If is unlimited`);
      t.eq(whatIf(p, "free"), [1, 0, false], `4c ${p}: free plan: 1 a day, then the limit applies`);
      for (const who of ["founder", "paid"]) t.eq(whatIf(p, who), [Infinity, Infinity, true], `4d ${p}: ${who}: unlimited`);
    }
    t.ok(/if \(!canRunSimulation\(\)\) \{/.test(app) && /recordSimulationUse\(\);/.test(app), "4e What-If checks and counts with the one rule");
    t.eq((app.match(/canRunSimulation\(|recordSimulationUse\(|getSimulationsRemaining\(/g) || []).length, 2, "4f …at its only two call sites");
  }

  t.summary("nativeAccess.test");
  setImmediate(() => process.exit(process.exitCode || 0));
})();
