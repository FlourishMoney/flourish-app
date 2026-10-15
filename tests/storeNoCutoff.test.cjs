// tests/storeNoCutoff.test.cjs
// -----------------------------------------------------------------------------
// VERSION 1.1, ITEM 3: NOBODY IS CUT OFF MID TASK.
//
// 1. Before 1.1: a household on a 1.0.x store build keeps full access. Nothing in this branch changes what such
//    a build shows or what the server tells it, and no paywall exists in it.
// 2. In 1.1: the same paywall with the same free month for a household that installed before 1.1 and one that
//    installs after, which each start themselves; no permanent grandfathering by install date or history.
// 3. When: only at a safe point (the first answer after start or sign-in, each return from the background);
//    an answer that changes in between waits, and an unknown answer never puts the paywall up.
// 4. How: drawn OVER the app, never in place of it. Every screen, sheet and half-typed form stays mounted with its
//    state; open sheets and dialogs stay above it and can be finished; Terms and Privacy open inside it.
// 5. Nothing is lost: the paywall and its purchase flow never write, clear or replace the household's data.
// 6. The screens that change for an existing store user: the paywall, Settings' Subscription card, and the
//    delete confirmation's store note. Their words carry no price and break no copy rule.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");
const { adviceProblems } = require("./_copyStrings.cjs");
const { loadApp, textOf, describe } = require("./_renderApp.cjs");

const REPO = path.join(__dirname, "..");
const read = (...p) => fs.readFileSync(path.join(REPO, ...p), "utf8");
const R = require("../netlify/functions/_lib/planRules.js");
const NOW = Date.parse("2026-11-15T12:00:00Z");
const DAY = 86400000;
const BANNED = /\blearns?\b|\bremembers?\b|\bsmarter\b|better over time|\bsets? aside\b|\bholds? back\b|[–—]/;

(async () => {
  const t = create();
  const B = await import("../src/lib/storeBilling.js");
  const O = await import("../src/lib/storeOffer.js");
  const P = await import("../src/lib/planFromProfile.js");
  const APP = read("src", "App.jsx");

  // ── 1. Before 1.1 ────────────────────────────────────────────────────────────────────────────
  {
    t.eq([B.storeBillingOn({ native: true, env: {} }), B.storeBillingOn({ native: true, env: { VITE_IAP_ENABLED: "false" } })], [false, false], "1a a 1.0.x store build is not a selling build");
    t.ok(/const storePaywallOverlay = \(storeBilling && paywallUp\) \?/.test(APP) && /if\(!storeBilling\)\{ setPaywallUp\(false\); return; \}/.test(APP), "1b …so no paywall can show in it");
    const p = { plan: "free", trial_started_at: new Date(NOW - 60 * DAY).toISOString() };
    t.eq(R.deriveEntitlement(p, { provider: "stripe", status: "active", current_period_end: new Date(NOW + DAY).toISOString() }, NOW, { native: true }).plan, "free",
      "1c the server tells a 1.0.x build exactly what it told it before (the profile's answer), whatever is bought elsewhere");
    t.ok(/return !!native \|\| !!isPremium;/.test(read("src", "lib", "featureAccess.js")) && /return !!native \|\| isUnlimited\(\);/.test(read("src", "lib", "featureAccess.js")),
      "1d and on a store build nothing closes when a trial ends (Credit and the meeting stay open): full access until 1.1");
  }

  // ── 2. In 1.1: the same paywall and the same free month for everyone ─────────────────────────
  {
    for (const [who, profile] of [["installed before 1.1, months of history", "free"], ["installed before 1.1, a 1.0 trial cached", "trial"], ["new in 1.1", "free"]]) {
      t.eq(P.storePlan(profile, { paid: false }), "free", `2a ${who}: not entitled until it subscribes`);
    }
    const comp = APP.slice(APP.indexOf("function StorePaywall("), APP.indexOf("function Paywall("));
    t.ok(/function StorePaywall\(\{purchases, platform, status, askStore, onResolved, onViewLegal, onSignOut, onDeleteAccount\}\)/.test(comp) && !/installed|existing|before1|legacy|history/i.test(comp.replace(/\/\/[^\n]*/g, "")),
      "2b one paywall: nothing on it depends on when the household installed or what it did before");
    t.ok(/introEligible\(p, platform, elig\)/.test(comp) && !/eligible\s*=\s*true/.test(comp), "2c the free month is the store's to give, the same rule for everyone; the household starts it itself by confirming");
    t.eq([P.storePlan("beta_founder", { paid: false }), P.storePlan("premium", { paid: false })], ["beta_founder", "premium"],
      "2d no grandfathering by install date or history; the only standing access is the repo's own founder flag and a granted paid plan (reported as a contradiction with the brief)");
  }

  // ── 3. When: safe points only ────────────────────────────────────────────────────────────────
  {
    const D = B.paywallDecision;
    t.eq([D({ open: true, entitled: false }), D({ open: false, entitled: false }), D({ open: true, entitled: null }), D({ open: false, entitled: null }), D({ open: true, entitled: true }), D({ open: false, entitled: true })],
      [{ up: true, open: false }, { up: null, open: false }, { up: null, open: true }, { up: null, open: false }, { up: false, open: false }, { up: false, open: false }],
      "3a up only at a pending safe point with a definite \"not entitled\"; never on an unknown answer; a confirmed subscription always takes it down");
    // A session: start (safe point), entitled; mid-session the answer flips to not entitled; it waits for the next safe point.
    let open = true, up = false;
    const step = (entitled) => { const d = D({ open, entitled }); open = d.open; if (d.up !== null) up = d.up; return up; };
    t.eq([step(null), step(true), step(false), step(false)], [false, false, false, false], "3b mid-session, a changed answer never puts the paywall in front of the household");
    open = true;                                          // back from the background
    t.eq(step(false), true, "3c …it waits for the next safe point (back from the background), then shows");
    t.eq(step(true), false, "3d subscribing takes it down at once");
    t.ok(/useEffect\(\(\)=>\{ paywallOpenRef\.current = true; \},\[user\?\.id\]\);/.test(APP) && /if\(document\.visibilityState!=="visible"\) return;\s*paywallOpenRef\.current = true;/.test(APP),
      "3e the app opens a safe point at start or sign-in and on each return from the background, and nowhere else");
    t.eq((APP.match(/paywallOpenRef\.current = true/g) || []).length, 2, "3f …exactly those two places");
    t.ok(/const d = paywallDecision\(\{ open: paywallOpenRef\.current, entitled: storeEntitled \}\);/.test(APP), "3g the decision is lib/storeBilling.js paywallDecision");
    t.ok(/const storeEntitled = \(!storeBilling \|\| !user\?\.id \|\| profilePlan===null \|\| storeAskedFor!==user\.id \|\| !storeStatus\)\s*\? null/.test(APP),
      "3h entitlement is unknown (null) until this account's own server answer is in: offline never locks a household out");
  }

  // ── 4. How: over the app, never in place of it ───────────────────────────────────────────────
  {
    t.eq((APP.match(/<ModalHost\/>\{storePaywallOverlay\}/g) || []).length, 2, "4a the overlay is drawn inside both shells (phone and desktop), next to the one ModalHost");
    t.ok(!/return\s*\(?\s*<StorePaywall/.test(APP) && !/return <><StorePaywall/.test(APP), "4b it never replaces the app: no early return renders it");
    t.eq((APP.match(/<StorePaywall /g) || []).length, 1, "4c one render site");
    const ov = APP.slice(APP.indexOf("const storePaywallOverlay ="), APP.indexOf("const storePaywallOverlay =") + 1400);
    t.ok(/position:"fixed",inset:0,zIndex:9998/.test(ov) && /role="dialog" aria-modal="true"/.test(ov), "4d a full-screen dialog at zIndex 9998, over every screen and the tab bar");
    const z = [...APP.matchAll(/zIndex:(\d+)/g)].map((m) => Number(m[1]));
    t.ok(z.filter((n) => n > 9998).length >= 6 && Math.max(...z) === 10000, "4e sheets and dialogs (9999) and the ModalHost (10000) stay above it: an open sheet can still be finished and saved, and the delete confirmation shows on top");
    t.ok(/paywallLegal==="terms" \? [\s\S]*?<TermsOfService onBack=\{\(\)=>setPaywallLegal\(null\)\}\/>/.test(ov) && /onViewLegal=\{\(which\)=>setPaywallLegal\(which\)\}/.test(ov) && !/setScreen/.test(ov),
      "4f Terms and Privacy open inside the overlay, so nothing behind it unmounts");
    t.ok(/onSignOut=\{signOut\}/.test(ov) && /onDeleteAccount=\{deleteAllData\}/.test(ov), "4g sign out and delete are the app's own, unchanged flows");
  }

  // ── 5. Nothing is lost ───────────────────────────────────────────────────────────────────────
  {
    const comp = APP.slice(APP.indexOf("function StorePaywall("), APP.indexOf("function Paywall("));
    const ov = APP.slice(APP.indexOf("const storePaywallOverlay ="), APP.indexOf("const content=()=>{"));
    const lib = read("src", "lib", "storeBilling.js") + read("src", "lib", "storeOffer.js");
    const WRITES = /setAppData|clearState|clearAllUserLocal|localStorage\.(removeItem|clear|setItem)|setOnboarded|setHousehold/;
    t.ok(!WRITES.test(comp) && !WRITES.test(ov.replace(/onSignOut=\{signOut\}|onDeleteAccount=\{deleteAllData\}/g, "")) && !WRITES.test(lib),
      "5a the paywall, its overlay and the purchase flow never write, clear or replace the household's data (only the household's own sign out or delete can)");
    const fx = APP.slice(APP.indexOf("const paywallOpenRef = useRef(true);"), APP.indexOf("const paywallOpenRef = useRef(true);") + 2600);
    t.ok(!WRITES.test(fx) && !/AbortController|\.abort\(/.test(fx), "5b deciding the paywall writes nothing and cancels no request in flight");
    t.ok(/if\(!storeBilling \|\| profilePlan===null\) return;/.test(APP), "5c the plan is never set from a store answer before the profile is in");
  }

  // ── 6. The screens that change, and their words ──────────────────────────────────────────────
  {
    const lines = [O.subscriptionLine({ paid: true, provider: "app_store" }), O.subscriptionLine({ paid: true, provider: "play_store" }), O.subscriptionLine({ paid: true, provider: "stripe" }),
      O.subscriptionLine(null, { entitled: true }), O.subscriptionLine(null), O.storeCancelNote("app_store"), O.storeCancelNote("play_store")];
    t.eq(lines.slice(0, 5), ["Your subscription is through the App Store.", "Your subscription is through Google Play.", "Your subscription is through the Flourish website.", "This account has full access.", "There's no subscription on this account yet."],
      "6a Settings says where the subscription is, in words, with no price and no link off the app");
    t.eq([O.storeCancelNote("stripe"), O.storeCancelNote(null)], [null, null], "6b the delete note is only for a store subscription");
    t.eq(lines.filter((x) => BANNED.test(x) || /\$\d/.test(x)), [], "6c no dash, no banned word, no price");
    t.eq(lines.flatMap((x) => adviceProblems(x).map((w) => `${w}: ${x}`)), [], "6d no money instruction");
    t.ok(/const storeNote = storeBilling && storeStatus\?\.paid \? storeCancelNote\(storeStatus\.provider\) : null;/.test(APP) && /This cannot be undone\."\+\(storeNote\?` \$\{storeNote\}`:""\)/.test(APP),
      "6e the delete confirmation adds the store note for a store subscriber only; everyone else reads it exactly as before");
    let A = null;
    try { A = loadApp(["Settings"]); } catch (e) { t.ok(false, `App.jsx bundles: ${describe(e)}`); }
    if (A) {
      const D = await import("../src/lib/demoFixture.js");
      const data = { accounts: D.demoAccountsFor("CA"), debts: [], incomes: [], bills: [], transactions: [], profile: D.demoProfileFor("CA") };
      const props = { data, setAppData() {}, onClose() {}, theme: "dark", toggleTheme() {}, onDeleteData() {}, onSignOut() {} };
      const off = textOf(A.render(A.h(A.Settings, props)));
      const on = textOf(A.render(A.h(A.Settings, { ...props, storeSubscription: { line: O.subscriptionLine({ paid: true, provider: "app_store" }), onManage() {}, onRestore() {} } })));
      t.ok(!/Restore purchases/.test(off) && !off.includes("Your subscription is through"), "6f Settings without the card (every build before 1.1): no Subscription card");
      t.ok(on.includes("Your subscription is through the App Store.") && on.includes("Manage subscription") && on.includes("Restore purchases") && !/\$\d/.test(on.replace(off, "")), "6g …with it: where the subscription is, Manage and Restore, no price");
    }
  }

  t.summary("storeNoCutoff.test");
})();
