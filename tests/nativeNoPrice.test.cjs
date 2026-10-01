// tests/nativeNoPrice.test.cjs
// -----------------------------------------------------------------------------
// A STORE BUILD NEVER PRINTS A PRICE, A TRIAL, "PLUS" AS A PLAN, OR AN UPGRADE CALL TO ACTION.
//
// The iOS and Android apps have nothing to buy. This renders every native-reachable surface that
// could carry one (Terms, Privacy, Delete account, the feature gates, Meet, Settings, the sidebar,
// Today, the coach, the sign-in screen, What-If) AS THE STORE APP, for the household most likely to
// see a sales surface: free, trial over, coach messages used. Then it scans the text for:
//   - any product price from src/lib/pricing.js ($11.99, $99.99, $79.99, $7.99, $59.99), or any amount
//     written as a price (dollars and cents beside "/mo", "/yr", "per month", "per year", "CAD", "USD");
//   - the word "trial";
//   - "Plus" as a plan name ("Flourish Plus", "Plus feature", "with Plus", "to Plus");
//   - an upgrade call to action ("Upgrade", "See plans", "Get Flourish", "Start N days free",
//     "Subscribe", "Buy", "Unlock").
// Each surface is also rendered as the WEB app; where the web carries those words, the scan must find
// them there, so a pass on native means the guard held, not that the scan went blind.
// The sales screens themselves (Paywall, UpgradeScreen) must only be rendered behind the native guard.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");
const { loadApp, textOf, describe, REPO } = require("./_renderApp.cjs");

const SURFACES = ["TermsOfService", "PrivacyPolicy", "DeleteAccount", "PremiumGate", "MeetAgenda", "Settings",
  "DesktopSidebar", "Dashboard", "AICoach", "AuthScreen", "WhatIfSimulator"];

(async () => {
  const t = create();
  const P = await import("../src/lib/pricing.js");
  const D = await import("../src/lib/demoFixture.js");

  const prices = [];
  for (const c of Object.values(P.PRICING)) for (const k of ["monthly", "annual", "foundingAnnual"]) if (c[k] != null) prices.push(P.formatPrice(c[k]));
  t.ok(prices.length >= 5 && prices.includes("$11.99"), `0a the product prices were read from pricing.js (${prices.join(", ")})`);
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const RULES = [
    ["a product price", new RegExp(prices.map(esc).join("|"))],
    // Priced the way a product is: dollars AND cents beside a period or a currency ("$11.99/mo", "$99.99
    // CAD"). A What-If example such as "Invest $300/month" is the household's own money, not a price.
    ["an amount written as a price", /\$\s?\d[\d,]*\.\d{2}\s*(?:\/\s?(?:mo|month|yr|year)\b|per (?:month|year)\b|CAD\b|USD\b)/i],
    ["the word trial", /\btrial\b/i],
    ["Plus as a plan name", /Flourish Plus|\bPlus (?:feature|plan|includes|member)|\b(?:with|to|on) Plus\b/],
    // "Buy" only as a call to buy US ("Buy Plus", "Buy now"): "nothing to buy" and a What-If "Buy a $800
    // laptop" are not sales copy.
    ["an upgrade call to action", /\bupgrade\b|See plans|Get Flourish|Start \d+ days free|\bSubscribe\b|\bBuy (?:now|Plus|Flourish|it now)\b|\bUnlock\b/i],
  ];
  const offences = (txt) => RULES.filter(([, rx]) => rx.test(txt)).map(([name, rx]) => `${name} ("${(txt.match(rx) || [""])[0]}")`);

  let A = {};
  try { A = loadApp(SURFACES); } catch (e) { t.ok(false, `App.jsx bundles: ${describe(e)}`); }
  // A free household whose trial is over: the state that shows every gate.
  A.store.set("flourish_plan", "free");
  const real = globalThis.Capacitor;
  const setPlatform = (p) => Object.defineProperty(globalThis, "Capacitor", { value: { ...real, getPlatform: () => p, isNativePlatform: () => p !== "web" }, configurable: true, writable: true });
  const as = (platform, fn) => { setPlatform(platform); try { return fn(); } finally { setPlatform("web"); } };

  const now = new Date();
  const data = { accounts: D.demoAccountsFor("CA"), debts: D.demoDebtsFor("CA"), incomes: D.buildDemoIncomes(now, "CA"),
    bills: D.buildDemoBills(now, "CA"), transactions: D.buildDemoTxns(now, "CA"), profile: D.demoProfileFor("CA"), bankConnected: true };
  const noop = () => {};
  const props = {
    TermsOfService: { onBack: noop }, PrivacyPolicy: { onBack: noop }, DeleteAccount: { onBack: noop },
    PremiumGate: [{ feature: "Credit Coaching", desc: "Factor-by-factor breakdown.", onUpgrade: noop },
                  { feature: "AI Coach", desc: "Coaching from your own numbers.", onUpgrade: noop, nativeNote: "You've used this week's 2 coach messages. They reset Monday." }],
    MeetAgenda: { data, isCouple: false, setScreen: noop },
    Settings: { data, setAppData: noop, setScreen: noop, onClose: noop, onReset: noop, theme: "light", toggleTheme: noop,
      bankConnected: true, billingUi: { show: false, reason: "native" }, onOpenUpgrade: noop },
    DesktopSidebar: { data, setScreen: noop },
    Dashboard: { data, setAppData: noop, setScreen: noop, setShowNotifs: noop, onUpgrade: noop, onWhatIf: noop },
    AICoach: { data, isOnline: true, isPremium: false, coachMsgCount: 2, onUpgrade: noop, setScreen: noop, setAppData: noop },
    AuthScreen: { onAuth: noop, onTryDemo: noop },
    WhatIfSimulator: { data, onClose: noop, onUpgrade: noop },
  };

  const webHits = {};
  for (const name of SURFACES) {
    for (const p of [].concat(props[name])) {
      let nat = "", web = "";
      try {
        nat = as("ios", () => textOf(A.render(A.h(A[name], p))));
        web = as("web", () => textOf(A.render(A.h(A[name], p))));
      } catch (e) { t.ok(false, `${name} renders: ${describe(e)}`); continue; }
      const label = name + (p.feature ? ` (${p.feature})` : "");
      t.ok(nat.length > 20, `1 ${label} rendered as the store app (${nat.length} chars)`);
      t.eq(offences(nat), [], `1 ${label} on a store app prints no price, trial, Plus plan or upgrade call to action`);
      if (offences(web).length) webHits[label] = offences(web);
    }
  }
  // The scan is not blind: on the web these surfaces DO sell, and it sees them.
  t.ok(Object.keys(webHits).length >= 2, `2a the same scan finds the sales copy on the web (${Object.keys(webHits).join("; ")})`);
  t.ok(webHits["PremiumGate (Credit Coaching)"] && webHits["TermsOfService"], "2b …including PremiumGate's pitch and the Terms' pricing section");

  // ── 3. The sales screens are only ever rendered behind the native guard ─────────────────────
  const app = fs.readFileSync(path.join(REPO, "src", "App.jsx"), "utf8");
  t.ok(/if\(showPaywall && !isNativeApp\(\)\)return <Paywall /.test(app), "3a the Paywall renders only when not a store app");
  t.ok(/if\(showUpgrade && billingUi\.show\)return <UpgradeScreen /.test(app), "3b the upgrade screen renders only when billing is shown, which it never is on a store app");
  const { billingUiState } = await import("../src/lib/billingVisibility.js");
  t.eq(billingUiState({ status: { enabled: true, plans: [{}] }, native: true, paid: false }).show, false, "3c billing is never shown on a store app, even with billing on");
  t.eq((app.match(/<Paywall /g) || []).length, 1, "3d there is one Paywall render site, the guarded one");
  t.eq((app.match(/<UpgradeScreen /g) || []).length, 1, "3e …and one upgrade screen render site, the guarded one");

  t.summary("nativeNoPrice.test");
  setImmediate(() => process.exit(process.exitCode || 0));
})();
