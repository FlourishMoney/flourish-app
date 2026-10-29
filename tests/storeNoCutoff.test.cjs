// tests/storeNoCutoff.test.cjs
// -----------------------------------------------------------------------------
// VERSION 1.1, ITEM 3: NOBODY IS CUT OFF MID TASK (rules of 2026-10-20: one plan rule for every app, no store trial).
//
// 1. A 1.0.x store build sells nothing: no paywall can show in it, and the server gives it the same answer as every
//    app (the 14-day account trial, then the free plan, or full access for a paid plan from any provider).
// 2. In 1.1: the same rule. A household in its 14-day account trial is entitled; after it, the free plan, until it
//    subscribes. No store product has a free month or an introductory offer, and nothing depends on install history.
// 3. When: when the household asks (a locked screen's "See plans", Settings), and one exception (1.1.3, Amanda
//    2026-10-28, lib/foundingPlans.js): a founding household with no paid plan is shown it once, by itself. Nothing
//    else raises it on its own, and a confirmed subscription closes it.
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

  // ── 1. A 1.0.x store build sells nothing ─────────────────────────────────────────────────────
  {
    t.eq([B.storeBillingOn({ native: true, env: {} }), B.storeBillingOn({ native: true, env: { VITE_IAP_ENABLED: "false" } })], [false, false], "1a a 1.0.x store build is not a selling build");
    t.ok(/const storePaywallOverlay = \(storeBilling && \(paywallUp \|\| foundingSwitchOpen\)\) \?/.test(APP) && /useEffect\(\(\)=>\{ if\(!storeBilling \|\| storeEntitled===true\) setPaywallUp\(false\); \},\[storeBilling, storeEntitled\]\);/.test(APP)
      && /const storeSubscription = storeBilling \? \{/.test(APP) && /if\(storeBilling\)\{ setPaywallUp\(true\); return; \}/.test(APP) && (APP.match(/setFoundingSwitchOpen\(true\)/g) || []).length === 1,
      "1b …so no paywall can show in it: every way in sits behind storeBilling");
    const p = { plan: "free", trial_started_at: new Date(NOW - 60 * DAY).toISOString() };
    const paidWeb = { provider: "stripe", status: "active", current_period_end: new Date(NOW + DAY).toISOString() };
    t.eq([R.deriveEntitlement(p, paidWeb, NOW, { native: true }).plan, R.deriveEntitlement(p, paidWeb, NOW).plan, R.deriveEntitlement(p, null, NOW, { native: true }).plan], ["premium", "premium", "free"],
      "1c the server gives a 1.0.x build the same answer as every app: a paid plan counts, and after the trial the free plan");
    t.ok(!/native/.test(read("src", "lib", "featureAccess.js").replace(/\/\/[^\n]*/g, "")), "1d no feature opens or closes by platform (lib/featureAccess.js takes none)");
  }

  // ── 2. In 1.1: one rule, no store trial ────────────────────────────────────────────────────────
  {
    t.eq([P.storePlan("trial", { paid: false }), P.storePlan("free", { paid: false }), P.storePlan("free", { paid: true })], ["trial", "free", "premium"],
      "2a the 14-day account trial counts in a selling build; after it the free plan, until the household subscribes");
    const comp = APP.slice(APP.indexOf("function StorePaywall("), APP.indexOf("function Paywall("));
    t.ok(/function StorePaywall\(\{purchases, platform, status, askStore, onResolved, onViewLegal, onManage, onClose, inTrial=false\}\)/.test(comp) && !/installed|existing|before1|legacy|history/i.test(comp.replace(/\/\/[^\n]*/g, "")),
      "2b one paywall: nothing on it depends on when the household installed or what it did before (inTrial is today's trial, 2026-10-29)");
    t.ok(!/checkTrialOrIntroductoryPriceEligibility|introEligible|trialLine|free month/i.test(comp) && !("introEligible" in O)
      && ["monthly", "annual", "founding_annual"].every((plan) => { const c = O.offerCopy({ plan, priceString: "$X", platform: "ios" }); return c && !/free|trial|intro/i.test(JSON.stringify(c)); }),
      "2c no store trial and no introductory offer: the paywall never asks the store for one, and no plan's words promise one");
    t.eq([P.storePlan("beta_founder", { paid: false }), P.storePlan("premium", { paid: false })], ["beta_founder", "premium"],
      "2d no grandfathering by install date or history; the only standing access is the repo's own founder flag and a granted paid plan");
  }

  // ── 3. When: only when the household asks ─────────────────────────────────────────────────────
  {
    t.eq((APP.match(/setPaywallUp\(true\)/g) || []).length, 3, "3a three ways in: the household's own tap on openUpgrade (a locked screen's See plans) or Settings' See plans, and the founding exception (3i)");
    const auto = APP.slice(APP.indexOf("  const foundingOpenedRef = useRef(new Set());"), APP.indexOf("  const foundingOpenedRef = useRef(new Set());") + 900);
    t.ok(/if\(!foundingPlansAutoOpen\(\{ storeBilling, userId: user\?\.id, askedFor: storeAskedFor, status: storeStatus,/.test(auto)
      && /rememberFoundingPlansShown\(store, user\.id\);\n    setPaywallUp\(true\);/.test(auto),
      "3i the one automatic opening is the founding rule's (lib/foundingPlans.js foundingPlansAutoOpen), remembered per account before it opens");
    t.ok(/onSubscribe: storeStatus\?\.paid \? null : \(\)=>setPaywallUp\(true\),/.test(APP) && /\{storeSubscription\.onSubscribe&&<Btn label="See plans" onClick=\{storeSubscription\.onSubscribe\}/.test(APP),
      "3b Settings offers See plans only to a household not paying yet");
    t.eq((APP.match(/storeOn=\{storeBilling\}/g) || []).length, 2, "3c the locked screens (Credit, the coach) get their See plans only in a selling build");
    t.ok(!/paywallDecision|paywallOpenRef/.test(APP) && !("paywallDecision" in B), "3d nothing raises it on its own: no safe-point decision, no automatic paywall");
    t.ok(/if\(!storeBilling \|\| storeEntitled===true\) setPaywallUp\(false\);/.test(APP), "3e a confirmed subscription closes it at once");
    t.ok(/const storeEntitledNow = \(!storeBilling \|\| !user\?\.id \|\| profilePlan===null \|\| storeAskedFor!==user\.id \|\| !storeStatus\)\s*\? null/.test(APP)
      && /const storeEntitled = storeEntitledNow !== null \? storeEntitledNow\s*: \(storeBilling && user\?\.id \? recalledGate\(deviceStorage\(\), user\.id\) : null\);/.test(APP),
      "3h until this account's own server answer is in, the last definite answer stands in (review fix M5); with none, it is unknown");
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
    t.ok(/onClose=\{\(\)=>\{ setPaywallUp\(false\); setFoundingSwitchOpen\(false\); setPaywallLegal\(null\); \}\}/.test(ov) && !/onSignOut|onDeleteAccount/.test(ov),
      "4g it can always be closed, so it carries no sign out or delete of its own: Settings has both, unchanged");
  }

  // ── 5. Nothing is lost ───────────────────────────────────────────────────────────────────────
  {
    const comp = APP.slice(APP.indexOf("function StorePaywall("), APP.indexOf("function Paywall("));
    const ov = APP.slice(APP.indexOf("const storePaywallOverlay ="), APP.indexOf("// ── Legal screens — always accessible"));
    const lib = read("src", "lib", "storeBilling.js") + read("src", "lib", "storeOffer.js");
    const WRITES = /setAppData|clearState|clearAllUserLocal|localStorage\.(removeItem|clear|setItem)|setOnboarded|setHousehold/;
    t.ok(!WRITES.test(comp) && !WRITES.test(ov.replace(/onSignOut=\{signOut\}|onDeleteAccount=\{deleteAllData\}/g, "")) && !WRITES.test(lib),
      "5a the paywall, its overlay and the purchase flow never write, clear or replace the household's data (only the household's own sign out or delete can)");
    const at = APP.indexOf("useEffect(()=>{ if(!storeBilling || storeEntitled===true) setPaywallUp(false); },[storeBilling, storeEntitled]);");
    const fx = at >= 0 ? APP.slice(at, at + 2600) : "";
    t.ok(fx.length > 0 && !WRITES.test(fx) && !/AbortController|\.abort\(/.test(fx), "5b closing the paywall (and the status refresh after it) writes nothing and cancels no request in flight");
    t.ok(/if\(!storeBilling \|\| profilePlan===null\) return;/.test(APP), "5c the plan is never set from a store answer before the profile is in");
  }

  // ── 6. The screens that change, and their words ──────────────────────────────────────────────
  {
    const lines = [O.subscriptionLine({ paid: true, provider: "app_store" }), O.subscriptionLine({ paid: true, provider: "play_store" }), O.subscriptionLine({ paid: true, provider: "stripe" }),
      O.subscriptionLine(null, { entitled: true }), O.subscriptionLine(null), O.storeCancelNote("app_store"), O.storeCancelNote("play_store")];
    t.eq(lines.slice(0, 5), ["Your subscription is through the App Store.", "Your subscription is through Google Play.", "This account has full access.", "This account has full access.", "There's no subscription on this account yet."],
      "6a Settings says where a store subscription is, in words, with no price and no link off the app; a website subscriber reads \"This account has full access.\" (the website is never named)");
    t.eq([O.storeCancelNote("stripe"), O.storeCancelNote(null)], [null, null], "6b the delete note is only for a store subscription");
    t.eq(lines.filter((x) => BANNED.test(x) || /\$\d/.test(x)), [], "6c no dash, no banned word, no price");
    t.eq(lines.flatMap((x) => adviceProblems(x).map((w) => `${w}: ${x}`)), [], "6d no money instruction");
    t.ok(/const storeNote = storeBilling && storeStatus\?\.paid \? storeCancelNote\(storeStatus\.provider\)\s*: \(!nativeApp && billingStatus\?\.paid \? storeCancelNote\(billingStatus\.provider\) : null\);/.test(APP) && /This cannot be undone\."\+\(storeNote\?` \$\{storeNote\}`:""\)/.test(APP),
      "6e the delete confirmation adds the store note for a store subscriber (in the app, and on the website); everyone else reads it exactly as before");
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
