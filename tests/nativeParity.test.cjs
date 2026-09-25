// tests/nativeParity.test.cjs
// -----------------------------------------------------------------------------
// THE TWO STORE APPS MUST BEHAVE THE SAME, AND HONESTLY.
//
// isCapacitorIOS() was true only on iOS, so every rule written with it quietly meant "iOS, and on
// Android do the web thing". That is how the Android build ended up showing prices while iOS did
// not, and how iOS handed every user premium on the client while Android enforced the free tier.
//
// Two rules, checked here:
//   1. No behaviour differs between the two store apps. A platform gate is isNativeApp() unless it
//      is genuinely about an Apple-only API — and today none is, so the count below is zero. A real
//      Apple-only need may reintroduce one; it must come with the reason, and this number moves.
//   2. On native the client shows what the SERVER enforces. No client-side unlock, no price, no
//      upgrade call to action.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");

const SRC = path.join(__dirname, "..", "src");
const APP = fs.readFileSync(path.join(SRC, "App.jsx"), "utf8");
const IOS = { Capacitor: { getPlatform: () => "ios" }, location: { protocol: "capacitor:" } };
const ANDROID = { Capacitor: { getPlatform: () => "android" }, location: { protocol: "http:" } };
const WEB = { location: { protocol: "https:" } };

const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);

(async () => {
  const t = create();
  const vis = await import("../src/lib/billingVisibility.js");
  const limits = await import("../src/lib/usageLimits.js");

  // ── 1. both stores are "native", the web is not ──────────────────────────────────────────────
  t.eq(vis.isNativeApp(IOS), true, "1a iOS is a store app");
  t.eq(vis.isNativeApp(ANDROID), true, "1b so is Android — the platform the old rule missed");
  t.eq(vis.isNativeApp(WEB), false, "1c the web is not");

  // ── 2. no rule anywhere in src/ is gated on iOS alone ────────────────────────────────────────
  const iosOnly = walk(SRC)
    .filter((f) => /\.(jsx?|tsx?)$/.test(f) && fs.readFileSync(f, "utf8").includes("isCapacitorIOS"))
    .map((f) => path.relative(SRC, f));
  t.eq(iosOnly.join(",") || "(none)", "(none)",
    "2a nothing in src/ branches on iOS alone, so the two store apps cannot drift. Reintroducing " +
    "isCapacitorIOS is allowed only for a genuinely Apple-only API, with the reason written down.");

  // ── 3. the client-side premium unlock is gone ────────────────────────────────────────────────
  t.ok(!/iosFreeUnlock/.test(APP), "3a iosFreeUnlock no longer exists");
  t.ok(/const \[isPremium,setIsPremium\]=useState\(\(\)=>saved\?\.isPremium\|\|false\)/.test(APP),
    "3b isPremium starts false and is never seeded from the platform");
  t.ok(/setIsPremium\(cp === "premium" \|\| cp === "beta_founder" \|\| cp === "trial"\)/.test(APP),
    "3c the plan comes from the profile the server wrote");
  t.ok(/startTrialIfEligible\(\);\s*\n\s*expireTrialIfNeeded\(\);/.test(APP),
    "3d the trial runs everywhere, so native gets 14 days and then the free tier");

  // ── 4. on native the client plan IS the server plan, identically on both stores ──────────────
  // Compiles the REAL refreshPlanFromProfile out of App.jsx and runs it twice — once with the
  // platform reporting iOS, once Android — against the same server row. A platform branch put back
  // inside this function makes the two runs disagree and fails 4c.
  {
    const start = APP.indexOf("const refreshPlanFromProfile = async (userId) => {");
    t.ok(start > 0, "4a refreshPlanFromProfile is still in App.jsx");
    const bodyStart = APP.indexOf("async (userId)", start);
    let depth = 0, end = -1;
    for (let k = APP.indexOf("{", bodyStart); k < APP.length; k++) {
      if (APP[k] === "{") depth++;
      else if (APP[k] === "}") { depth--; if (depth === 0) { end = k + 1; break; } }
    }
    const fnText = APP.slice(bodyStart, end);
    const { derivePlan } = require("../netlify/functions/_lib/planRules.js"); // the server's own rule

    const runOn = async (win, profile) => {
      const store = new Map();
      const premium = [];
      const supabase = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: profile }) }) }) }) };
      const fn = new Function(
        "supabase", "derivePlan", "setPlan", "setIsPremium", "isCapacitorIOS", "isNativeApp", "localStorage", "console",
        `return (${fnText});`,
      )(
        supabase, derivePlan, (p) => store.set("flourish_plan", p), (v) => premium.push(v),
        () => win.Capacitor?.getPlatform?.() === "ios", () => vis.isNativeApp(win),
        { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) },
        { error() {} },
      );
      return { plan: await fn("user-1"), premium };
    };

    const freeRow = { plan: "free", founder_flag: false, trial_started_at: null, trial_ends_at: null };
    const ios = await runOn(IOS, freeRow);
    const android = await runOn(ANDROID, freeRow);
    t.eq(ios.plan, "free", "4b a server row that says free reads as free on iOS — no client unlock");
    t.eq(JSON.stringify(ios), JSON.stringify(android),
      "4c …and Android resolves to exactly the same plan and premium flag from the same row");
    t.eq(JSON.stringify(ios.premium), JSON.stringify([false]), "4d free means the premium flag is off");

    const founderRow = { plan: "free", founder_flag: true, trial_started_at: null, trial_ends_at: null };
    const iosF = await runOn(IOS, founderRow);
    t.eq(iosF.plan, "beta_founder", "4e (control) a row the server DID grant still unlocks, so 4b is not vacuous");
    t.eq(JSON.stringify(iosF), JSON.stringify(await runOn(ANDROID, founderRow)), "4f …on both stores alike");
  }

  // ── 5. nothing to buy on native ──────────────────────────────────────────────────────────────
  t.ok(!/\b(11\.99|99\.99|79\.99|7\.99|59\.99)\b/.test(APP), "5a no price is hard-coded in App.jsx");
  const on = { enabled: true, founding: { available: true, cohortLimit: 50 } };
  for (const [name, win] of [["iOS", IOS], ["Android", ANDROID]]) {
    const ui = vis.billingUiState({ status: on, native: vis.isNativeApp(win), paid: false });
    t.eq(ui.show, false, `5b no billing surface on ${name}, even with billing switched on`);
  }
  t.eq(vis.billingUiState({ status: on, native: false, paid: false }).show, true,
    "5c …while the web still shows it, so this is a platform rule and not a dead feature");
  t.eq((APP.match(/!isNativeApp\(\)&&trialExpired/g) || []).length, 1, "5d the expired-trial upgrade bar is native-gated");
  t.ok(/!isPremium&&!isNativeApp\(\)&&trialActive/.test(APP), "5e so is the trial countdown with its Upgrade button");

  // ── 6. what native says at the limit, and what it does not say ───────────────────────────────
  t.eq(limits.FREE_TIER_LIMITS.coachMessagesPerWeek, 2, "6a the free tier is 2 coach messages a week");
  t.eq(limits.FREE_TIER_LIMITS.simulationsPerDay, 1, "6b and 1 simulation a day");
  // The native limit strings, found by their NATIVE guard — the web branch of the same ternary
  // keeps its upsell, so matching on the text alone would sweep that in too.
  const coach = APP.match(/if\(isNativeApp\(\)\)\{ setLimitNote\(`([^`]*)`\)/);
  const sim = APP.match(/isNativeApp\(\)\s*\n?\s*\? `(You've used[^`]*)`/);
  t.ok(!!coach, "6c the coach limit message is reached only through isNativeApp()");
  t.ok(!!sim, "6d the simulation limit message is too");
  const nativeCopy = [coach && coach[1], sim && sim[1]].filter(Boolean);
  t.ok(/^You've used this week's \$\{FREE_LIMIT\} coach messages\. They reset Monday\.$/.test(nativeCopy[0] || ""),
    "6e the coach one states the limit and when it lifts, and nothing else");
  t.ok(/simulation/.test(nativeCopy[1] || "") && /resets?" : "They reset"\} tomorrow\.$/.test(nativeCopy[1] || ""),
    "6f the simulation one does the same");
  for (const [i, str] of nativeCopy.entries()) {
    t.ok(!/upgrade|plus|flourishmoney\.app|website|subscribe|\$\d/i.test(str),
      `6g native limit message ${i + 1} sells nothing — no upgrade, no Plus, no website, no price`);
  }
  // The web keeps its upsell, so the split above is a real platform branch and not copy we deleted.
  t.ok(/: `You've used all \$\{FREE_TIER_LIMITS\.simulationsPerDay\} simulations for today\. Upgrade to Flourish Plus/.test(APP),
    "6h (control) the WEB branch still upsells, so native is quiet by choice, not by deletion");
  t.ok(/verdict: isNativeApp\(\) \? "Daily limit reached"/.test(APP),
    "6i the simulation verdict on native is a fact, not 'Upgrade to continue'");

  // ── 7. the store apps ship the bundle they were built with ───────────────────────────────────
  const cap = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "capacitor.config.json"), "utf8"));
  t.eq(cap.server, undefined, "7a capacitor.config.json has no server.url, so native loads its own dist");
  t.eq(cap.webDir, "dist", "7b …which is dist, bundled at build time");

  t.summary("nativeParity.test");
})();
