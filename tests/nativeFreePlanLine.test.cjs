// tests/nativeFreePlanLine.test.cjs
// -----------------------------------------------------------------------------
// WHAT A STORE APP SAYS ABOUT THE TRIAL AND THE FREE PLAN: THE FOUNDER'S WORDS, AND NOTHING TO BUY
// (wording approved 2026-10-19; the store apps follow the web's rules from 2026-10-20).
//
// The iOS and Android apps follow the web's rules but show no price, no upgrade button and no link to pay
// on the web (Apple 3.1.1 and 3.1.3(f), Google Play's payments policy). So:
//   1  the five approved lines in src/lib/freePlan.js are word for word what the founder approved;
//   2  every store-app line, and the server's two refusals, sells nothing and follows the copy rules, and
//      the word "trial" appears only inside the two approved trial lines;
//   3  their figures are the limits the app and the server enforce, read, never retyped;
//   4  the trial chip and the end-of-trial banner render in a store app only, with nothing to buy;
//   5  every screen that used its own words now uses these: the locked screens, the coach, What-If, Meet;
//   6  section 7 of the Terms in a store app is the freePlan.js text.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");
const { loadApp, textOf, describe, REPO } = require("./_renderApp.cjs");

const APP = fs.readFileSync(path.join(REPO, "src", "App.jsx"), "utf8");
const PLAID = fs.readFileSync(path.join(REPO, "netlify", "functions", "plaid.js"), "utf8");
const APPROVED = {
  TRIAL_ENDED_BANNER: "Your free trial has ended",
  LOCKED_LINE: "This part isn't included in the free plan. On the free plan you keep safe to spend, your bills and paydays, and your weekly agenda.",
  coachLimitLine: "You've used this week's 2 coach messages. You get 2 more on Monday.",
  WHAT_IF_LIMIT_LINE: "You've run today's What-If. You can run another tomorrow.",
  trialChip: "12 days left in your trial",
};
const SELLS = [
  ["a price", /\$\s?\d[\d,]*(\.\d{2})?\s*(\/|per |a )\s*(mo|month|yr|year)\b|\bCAD\b|\bUSD\b/i],
  ["an upgrade call", /\bupgrade\b|\bsubscribe\b|\bbuy (now|plus|flourish)\b|\bunlock\b|See plans|Get Flourish|days free/i],
  ["a paid plan by name", /Flourish Plus|\bPlus\b|\bpremium\b|\bpaid plan\b|\bfounding\b/i],
  ["a website", /flourishmoney\.app|https?:\/\/|www\.|\bwebsite\b|on the web\b/i],
];
const TRIAL = /\btrial\b/i;
const COPY = [
  ["an em or en dash", /[–—]/],
  ["a banned word", /\blearns?\b|\bremembers?\b|\bsmarter\b|better over time|sets aside|holds back|web app/i],
];
const offences = (s) => [...SELLS, ...COPY].filter(([, rx]) => rx.test(s)).map(([n, rx]) => `${n} ("${(s.match(rx) || [""])[0]}")`);

(async () => {
  const t = create();
  const F = await import("../src/lib/freePlan.js");
  const U = await import("../src/lib/usageLimits.js");
  const L = require("../netlify/functions/_lib/coachLimits.js");

  // ── 1. the approved lines, word for word ──────────────────────────────────────────────────────────
  t.eq(F.TRIAL_ENDED_BANNER, APPROVED.TRIAL_ENDED_BANNER, "1a the end-of-trial banner");
  t.eq(F.LOCKED_LINE, APPROVED.LOCKED_LINE, "1b the locked screen (Credit, the coach-run meeting)");
  t.eq(F.coachLimitLine(), APPROVED.coachLimitLine, "1c the coach limit");
  t.eq(F.WHAT_IF_LIMIT_LINE, APPROVED.WHAT_IF_LIMIT_LINE, "1d the What-If limit");
  t.eq(F.trialChip(12), APPROVED.trialChip, "1e the trial chip, 12 days left");
  t.eq([F.trialChip(2), F.trialChip(1)], ["2 days left in your trial", "1 day left in your trial"], "1f …and as its number changes");

  // ── 2. every line sells nothing; "trial" only where the founder put it ────────────────────────────
  const lines = {
    TRIAL_ENDED_BANNER: F.TRIAL_ENDED_BANNER, LOCKED_LINE: F.LOCKED_LINE, coachLimitLine: F.coachLimitLine(),
    WHAT_IF_LIMIT_LINE: F.WHAT_IF_LIMIT_LINE, trialChip: F.trialChip(12), FREE_BANK_LINE: F.FREE_BANK_LINE,
    STORE_TERMS_SECTION_7: F.STORE_TERMS_SECTION_7,
    "server: facilitator refusal": L.FACILITATOR_FREE_MESSAGE, "server: What-If refusal": L.SIMULATOR_LIMIT_MESSAGE,
  };
  for (const [name, s] of Object.entries(lines)) {
    t.eq(offences(s), [], `2a ${name} sells nothing and follows the copy rules`);
    t.eq(TRIAL.test(s), name === "TRIAL_ENDED_BANNER" || name === "trialChip", `2b ${name} ${TRIAL.test(s) ? "names" : "does not name"} the trial`);
  }
  t.ok(!/free plan/i.test(F.STORE_TERMS_SECTION_7), "2c the Terms name no plan at all (tests/sidebarDueSoonTier.test.cjs)");
  t.eq(offences("Upgrade to Flourish Plus for $11.99/month at flourishmoney.app — today"),
    ["a price (\"$11.99/month\")", "an upgrade call (\"Upgrade\")", "a paid plan by name (\"Flourish Plus\")", "a website (\"flourishmoney.app\")", "an em or en dash (\"—\")"],
    "2d (not vacuous: a sales line trips every rule)");

  // ── 3. the figures are the enforced limits ───────────────────────────────────────────────────────────
  t.eq([U.FREE_TIER_LIMITS.coachMessagesPerWeek, L.FREE_CHAT_WEEKLY], [2, 2], "3a the app and the server both allow 2 coach messages a week, as the coach line says");
  t.eq([U.FREE_TIER_LIMITS.simulationsPerDay, L.FREE_SIMULATIONS_DAILY], [1, 1], "3b …and 1 What-If explanation a day, as \"today's What-If\" says");
  t.eq(F.coachLimitLine(3), "You've used this week's 3 coach messages. You get 3 more on Monday.", "3c the coach line takes its number from the limit, not from the text");
  const caps = [...PLAID.matchAll(/\(count \|\| 0\) >= (\d+)|activeCount >= (\d+)/g)].map(m => Number(m[1] || m[2]));
  t.eq(caps, [F.FREE_BANKS, F.FREE_BANKS], `3d plaid.js caps the free plan at FREE_BANKS (${F.FREE_BANKS}) on both of its write paths`);

  // ── 4. the trial chip and the end-of-trial banner ────────────────────────────────────────────────────
  let A = {};
  try { A = loadApp(["NativeTrialEndedLine", "NativeTrialChip", "TermsOfService", "PremiumGate"]); } catch (e) { t.ok(false, `App.jsx bundles: ${describe(e)}`); }
  const real = globalThis.Capacitor;
  const as = (p, fn) => {
    Object.defineProperty(globalThis, "Capacitor", { value: { ...real, getPlatform: () => p, isNativePlatform: () => p !== "web" }, configurable: true, writable: true });
    try { return fn(); } finally { Object.defineProperty(globalThis, "Capacitor", { value: real, configurable: true, writable: true }); }
  };
  const banner = as("ios", () => A.render(A.h(A.NativeTrialEndedLine, { onDismiss: () => {} })));
  t.eq(textOf(banner).replace("×", "").trim(), APPROVED.TRIAL_ENDED_BANNER, "4a the banner says exactly the founder's line");
  t.eq((banner.match(/<button/g) || []).length, 1, "4b its one button…");
  t.ok(/aria-label="Dismiss"/.test(banner), "4c …puts it away");
  const chip = as("android", () => A.render(A.h(A.NativeTrialChip, { daysLeft: 12 })));
  t.eq(textOf(chip).trim(), APPROVED.trialChip, "4d the chip says exactly the founder's line");
  t.ok(!/<button|<a\b|onclick/i.test(chip), "4e …and is not a button or a link");
  const bannerAt = APP.match(/\{isNativeApp\(\)&&trialExpired&&!isPremium&&!trialEndNoteHidden&&(<div[^>]*>)?<NativeTrialEndedLine onDismiss=\{hideTrialEndNote\}\/>/g) || [];
  t.eq(bannerAt.length, 2, "4f the banner shows in a store app only, after the trial, without full access: on phones and in the iPad sidebar");
  const chipAt = APP.match(/\{isNativeApp\(\)&&trialActive&&trialDaysLeft>0&&(<div[^>]*>)?<NativeTrialChip daysLeft=\{trialDaysLeft\}\/>/g) || [];
  t.eq(chipAt.length, 2, "4g the chip shows in a store app only, during the trial: on phones and in the iPad sidebar");
  t.eq((APP.match(/!isNativeApp\(\)&&trialExpired/g) || []).length, 1, "4h the web's upgrade bar stays web-only");
  t.ok(/localStorage\.setItem\("flourish_trial_end_note_seen","1"\)/.test(APP) && /localStorage\.getItem\("flourish_trial_end_note_seen"\)==="1"/.test(APP),
    "4i put away, the banner stays away on this device");

  // ── 5. every store-app screen uses these lines ─────────────────────────────────────────────────────
  const gate = as("ios", () => textOf(A.render(A.h(A.PremiumGate, { feature: "Credit Coaching", desc: "x", onUpgrade: () => {} }))));
  t.ok(gate.includes(APPROVED.LOCKED_LINE), "5a a locked screen (Credit) in a store app says the founder's line");
  t.ok(/\{isNativeApp\(\) \? LOCKED_LINE : "Start your trial to run the meeting with your coach\."\}/.test(APP), "5b …and so does Meet, when the coach-run meeting is locked (the web keeps its own)");
  const send = APP.slice(APP.indexOf("const sendToFacilitator = async"), APP.indexOf("const sendToFacilitator = async") + 3500);
  t.ok(/if \(r\.status === 402 && j\.error === "plan_limit"\) \{[\s\S]{0,300}setMeetError\(\{ kind:"limit", text: isNativeApp\(\) \? LOCKED_LINE : \(j\.message \|\| LOCKED_LINE\) \}\);/.test(send),
    "5c …and so does the server's refusal of the meeting (402 plan_limit), shown as a limit with no Try again");
  t.ok(/kind:"limit", text: isNativeApp\(\)\s*\n\s*\? coachLimitLine\(\)/.test(send), "5d Meet's coach limit in a store app is the founder's coach line");
  t.ok(/feature="AI Coach"[^>]*nativeNote=\{coachLimitLine\(\)\}/.test(APP), "5e the coach tab's limit screen says it");
  t.ok(/if\(isNativeApp\(\)\)\{ setLimitNote\(coachLimitLine\(FREE_LIMIT\)\); return; \}/.test(APP), "5f …and so does the coach when the week's messages run out");
  t.ok(/const limitMsg = isNativeApp\(\)\s*\n\s*\? coachLimitLine\(\)/.test(APP), "5g …and when the server refuses a message (429)");
  t.ok(/cashDetail: isNativeApp\(\)\s*\n\s*\? WHAT_IF_LIMIT_LINE/.test(APP) && /verdictReason: isNativeApp\(\)\s*\n\s*\? WHAT_IF_LIMIT_LINE/.test(APP), "5h What-If's limit says the founder's line");
  t.ok(!/They reset Monday\.`\s*:|isNativeApp\(\)[^\n]{0,40}They reset Monday|setLimitNote\(`/.test(APP), "5i no store-app branch keeps the old coach wording");

  // ── 6. the Terms ──────────────────────────────────────────────────────────────────────────────────
  const terms = as("android", () => textOf(A.render(A.h(A.TermsOfService, { onBack: () => {} }))));
  t.ok(terms.includes(`7. Cost and usage limits${F.STORE_TERMS_SECTION_7}`) || terms.includes(`7. Cost and usage limits ${F.STORE_TERMS_SECTION_7}`),
    "6a in a store app, Terms section 7 is the freePlan.js text");

  t.summary("nativeFreePlanLine.test");
  setImmediate(() => process.exit(process.exitCode || 0));
})();
