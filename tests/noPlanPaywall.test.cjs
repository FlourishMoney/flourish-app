// tests/noPlanPaywall.test.cjs
// -----------------------------------------------------------------------------
// THE NO-PLAN PAYWALL (founder's decision, 2026-10-23: "Yes, drop the free plan. 14 days free, then Plus.").
//
//   1  when it shows is the server's answer (billing.js status and store_status `access`), never a guess:
//      no answer is never "no plan", and the live demo never shows it
//   2  what it offers: subscribe (Stripe on the website; the store's own purchase in a store build that sells,
//      with no web price or link there), restore purchases, check again, manage, sign out, export, delete,
//      Privacy Policy, Terms and Support; it has no Close
//   3  nothing is lost: it is drawn OVER every screen a signed-in household can be on, inside the same fragment as
//      that screen (so nothing remounts), and nothing it does writes, clears or replaces the household's data
//   4  the server tells the app, by the rule that refuses the paid calls
//   5  words: approved lines reused, new ones are [WORDS: …] placeholders, listed here
// The same paywall in a real browser is tests/noPlanPaywall.browser.test.cjs.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");
const { loadApp, textOf, describe } = require("./_renderApp.cjs");

const REPO = path.join(__dirname, "..");
const read = (...p) => fs.readFileSync(path.join(REPO, ...p), "utf8");

(async () => {
  const t = create();
  const G = await import("../src/lib/paywallGate.js");
  const R = require("../netlify/functions/_lib/planRules.js");
  const APP = read("src", "App.jsx");

  // ── 1. When it shows ─────────────────────────────────────────────────────────────────────────────
  {
    const none = { access: { entitled: false, basis: "none", grace_ends_at: null } };
    const paid = { access: { entitled: true, basis: "paid", grace_ends_at: null } };
    t.eq(G.accessFromStatus(none), { entitled: false, basis: "none", graceEndsAt: null }, "1a the server's answer is read as it is");
    t.eq([G.accessFromStatus(null), G.accessFromStatus({}), G.accessFromStatus({ access: null }), G.accessFromStatus({ access: { entitled: "no" } })], [null, null, null, null],
      "1b no answer, or one we do not recognise, is no answer");
    const shows = (o) => G.paywallShows(o);
    t.eq(shows({ signedIn: true, access: G.accessFromStatus(none) }), true, "1c signed in, the server says no plan: the paywall shows");
    t.eq(shows({ signedIn: true, access: G.accessFromStatus(paid) }), false, "1d the server says a plan: it does not");
    t.eq([shows({ signedIn: true, access: null, recalled: null }), shows({ signedIn: true, access: null, recalled: true })], [false, false],
      "1e no answer (offline, blocked, the plan unreadable on the server): never \"no plan\" for an account not known to have none");
    t.eq(shows({ signedIn: true, access: null, recalled: false }), true, "1f …while an account the server last said had no plan stays on the paywall offline");
    t.eq(shows({ signedIn: true, access: G.accessFromStatus(paid), recalled: false }), false, "1g a fresh answer beats the remembered one");
    t.eq([shows({ signedIn: false, access: G.accessFromStatus(none) }), shows({ signedIn: true, demo: true, access: G.accessFromStatus(none), recalled: false })], [false, false],
      "1h signed out, or the live demo: never");

    const store = new Map();
    const ls = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) };
    G.rememberAccess(ls, "u1", G.accessFromStatus(none));
    t.eq([G.recalledAccess(ls, "u1"), G.recalledAccess(ls, "u2")], [false, null], "1i the remembered answer belongs to its own account only");
    G.rememberAccess(ls, "u1", G.accessFromStatus(paid));
    t.eq(G.recalledAccess(ls, "u1"), true, "1j …and is replaced by the next one");
    t.eq(JSON.parse(store.get("flourish_access_gate")), { uid: "u1", entitled: true }, "1k …and holds nothing but the account and the answer");

    t.ok(/const noPlan = paywallShows\(\{ signedIn: !!user\?\.id, demo: !!appData\?\.demo, access: serverAccess,/.test(APP), "1l the App asks this module, with the demo flag");
    t.ok(/\(storeBilling && storeAskedFor===user\.id && accessFromStatus\(storeStatus\)\) \|\| \(billingAskedFor===user\.id && accessFromStatus\(billingStatus\)\)/.test(APP),
      "1m …with this account's own answer only: store_status in a store build that sells, the billing status everywhere else");
    t.ok(/\},\[user\?\.id, nativeApp, billingRecheck\]\);/.test(APP) && /setBillingRecheck\(n=>n\+1\)/.test(APP), "1n the billing status is asked again on Check again and when the page comes back into view");
  }

  // ── 2. What it offers ────────────────────────────────────────────────────────────────────────────
  let A = null;
  try { A = loadApp(["NoPlanScreen"]); } catch (e) { t.ok(false, `App.jsx bundles: ${describe(e)}`); }
  if (A) {
    const noop = () => {};
    const base = { onCheckAgain: noop, onSignOut: noop, onExport: noop, onDelete: noop, onViewLegal: noop };
    const web = textOf(A.render(A.h(A.NoPlanScreen, { ...base, web: { onSeePlans: noop }, onManage: noop })));
    for (const w of [G.NO_PLAN_COPY.heading, G.NO_PLAN_COPY.body, G.NO_PLAN_COPY.dataSafe, G.NO_PLAN_COPY.seePlans, G.NO_PLAN_COPY.checkAgain, G.NO_PLAN_COPY.manage,
      G.NO_PLAN_COPY.exportData, G.NO_PLAN_COPY.signOut, G.NO_PLAN_COPY.deleteAccount, G.NO_PLAN_COPY.privacy, G.NO_PLAN_COPY.terms, G.NO_PLAN_COPY.support]) {
      t.ok(web.includes(w), `2a the website's paywall offers: ${w}`);
    }
    t.ok(!/\bClose\b|✕/.test(web), "2b …and has no Close");
    const store = textOf(A.render(A.h(A.NoPlanScreen, { ...base, store: A.h("div", null, "STORE PAYWALL"), onManage: noop })));
    t.ok(store.includes("STORE PAYWALL") && !store.includes(G.NO_PLAN_COPY.seePlans), "2c a store build that sells: the store's own paywall in place of See plans");
    t.ok(!/\$|flourishmoney\.app|https?:/.test(store.replace("STORE PAYWALL", "")), "2d …and no web price or link anywhere on it");
    t.ok([G.NO_PLAN_COPY.exportData, G.NO_PLAN_COPY.signOut, G.NO_PLAN_COPY.deleteAccount, G.NO_PLAN_COPY.support].every((w) => store.includes(w)),
      "2e …with export, sign out, delete and Support beside it (its own Terms of Use, Privacy Policy and Restore purchases are on it)");
    const noSale = textOf(A.render(A.h(A.NoPlanScreen, { ...base })));
    t.ok(noSale.includes(G.NO_PLAN_COPY.noStorePurchase) && !noSale.includes(G.NO_PLAN_COPY.seePlans) && !/\$|flourishmoney\.app/.test(noSale),
      "2f a store build that cannot sell: nothing to buy and no link to pay, and the household can still export, sign out or delete");
    t.ok(!noSale.includes(G.NO_PLAN_COPY.manage), "2g Manage shows only when there is a subscription to manage");

    const ov = APP.slice(APP.indexOf("const noPlanOverlay = noPlan ?"), APP.indexOf("const covered = "));
    t.ok(/<StorePaywall [\s\S]*?title=\{NO_PLAN_COPY\.heading\} lead=\{NO_PLAN_COPY\.body\}\/>/.test(ov) && !/<StorePaywall [^>]*onClose=/.test(ov),
      "2h in a store build the store's paywall is drawn with this paywall's words and no Close");
    t.ok(/web=\{!nativeApp && billingUi\.show \? \{ onSeePlans: \(\)=>setNoPlanView\("plans"\) \} : null\}/.test(ov) && /: \(noPlanView==="plans" && !nativeApp && billingUi\.show\) \? <UpgradeScreen /.test(ov),
      "2i the website's checkout only on the website, with billing on, inside the paywall");
    t.ok(/noPlanView==="privacy" \? [\s\S]*?<PrivacyPolicy onBack=\{\(\)=>setNoPlanView\(null\)\}\/>/.test(ov) && /<TermsOfService onBack=\{\(\)=>setNoPlanView\(null\)\}\/>/.test(ov) && /<SupportPage onBack=\{\(\)=>setNoPlanView\(null\)\}/.test(ov) && !/setScreen/.test(ov),
      "2j Privacy Policy, Terms and Support open inside the paywall (no route change, so nothing behind it unmounts)");
    t.ok(/onSignOut=\{signOut\} onExport=\{\(\)=>downloadExport\(appData\)\} onDelete=\{deleteAllData\}/.test(ov), "2k sign out, export and delete are Settings' own, unchanged");
    t.ok(/const noPlanManage = storeBilling\s*\? \(\(storeStatus\?\.provider==="app_store" \|\| storeStatus\?\.provider==="play_store"\) \? manageStoreSubscription : null\)\s*: \(!nativeApp && billingStatus\?\.manageable \? openBillingPortal : null\);/.test(APP),
      "2l Manage: the store's own screen in a store build, Stripe's portal on the website, never a web link in a store app");
  }

  // ── 3. Nothing is lost ───────────────────────────────────────────────────────────────────────────
  {
    const covers = APP.slice(APP.indexOf("const covered = "), APP.indexOf("const unread = (() =>"));
    const returns = covers.match(/\)return [^\n]{0,40}/g) || [];
    t.ok(returns.length >= 8 && returns.every((r) => /\)return covered\(</.test(r)), `3a every screen from the AI disclosure to the web paywall is drawn with the overlay (${returns.length})`);
    t.ok(/const covered = \(el\)=> <>\{el\}\{noPlanOverlay\}\{noPlanOverlay&&<ModalHost\/>\}<\/>;/.test(APP),
      "3b …inside one fragment whose first child is the screen, so the paywall arriving or going never remounts it (and it brings the ModalHost those screens lack)");
    t.eq((APP.match(/<ModalHost\/>\{storePaywallOverlay\}\{noPlanOverlay\}/g) || []).length, 2, "3c both shells draw it beside their one ModalHost, so their tree never changes shape either");
    t.ok(/zIndex:9998/.test(APP.slice(APP.indexOf("const noPlanOverlay = noPlan ?"), APP.indexOf("const noPlanOverlay = noPlan ?") + 400)), "3d at the store paywall's level: the confirmations (ModalHost) show above it");
    const comp = APP.slice(APP.indexOf("function NoPlanScreen("), APP.indexOf("function Paywall("));
    const ov = APP.slice(APP.indexOf("const checkAccessAgain = async"), APP.indexOf("const covered = "));
    for (const [name, src] of [["NoPlanScreen", comp], ["the overlay", ov], ["lib/paywallGate.js", read("src", "lib", "paywallGate.js")]]) {
      t.ok(!/setAppData|setOnboarded|setHousehold|clearState|removeItem|localStorage\.clear|upsertUserData|deleteUserData/.test(src.replace(/\/\/[^\n]*/g, "")),
        `3e ${name} never writes, clears or replaces the household's data`);
    }
    t.ok(/useEffect\(\(\)=>\{ if\(!noPlan\)\{ setNoPlanView\(null\); setNoPlanChecking\(false\); \} \},\[noPlan\]\);/.test(APP), "3f when it goes, only its own views reset");
    const exp = G.exportPayload({ profile: { name: "Sam" }, bills: [{ id: "b1" }], forecastEdits: { a: 1 } }, (k, fb) => JSON.parse(fb), new Date("2026-10-24T00:00:00Z"));
    t.eq([exp.profile.name, exp.bills.length, exp.forecastEdits.a, exp._meta.exportedAt], ["Sam", 1, 1, "2026-10-24T00:00:00.000Z"], "3g the export carries the household's data");
    t.ok(/const exportMyData = \(\) => downloadExport\(data\);/.test(APP), "3h Settings exports through the same function");
  }

  // ── 3b. Review round (2026-10-24) ──────────────────────────────────────────────────────────────────
  {
    const ret = APP.slice(APP.indexOf("const notice = billingReturnNotice("), APP.indexOf("const notice = billingReturnNotice(") + 1400);
    t.ok(/if\(notice\.kind!=="success"\) return;\s*const timers = \[2000, 6000, 15000, 30000\]\.map\(ms=>setTimeout\(\(\)=>setBillingRecheck\(n=>n\+1\), ms\)\);\s*return \(\)=>timers\.forEach\(clearTimeout\);/.test(ret),
      "3i back from a Stripe checkout: the status is asked again over the next half minute, so a household that just paid is not left on the paywall");
    t.ok(/if\(billingAskedFor && billingAskedFor!==user\.id\) setBillingStatus\(null\);/.test(APP) && /if\(storeAskedFor && storeAskedFor!==user\.id\) setStoreStatus\(null\);/.test(APP),
      "3j another account on the same device never inherits the last one's answer while its own is asked");
  }

  // ── 4. The server tells the app ──────────────────────────────────────────────────────────────────
  {
    t.eq(R.accessAnswer({ known: true, unlimited: false, entitlement: "free" }), { entitled: false, basis: "none", grace_ends_at: null }, "4a no plan: entitled false");
    t.eq([["beta_founder", "founder"], ["premium", "paid"], ["trial", "trial"]].map(([e]) => R.accessAnswer({ known: true, unlimited: true, entitlement: e }).basis), ["founder", "paid", "trial"],
      "4b a founder, a paid plan and a trial are entitled, and say why");
    t.eq([R.accessAnswer({ known: false, unlimited: false }), R.accessAnswer(null)], [null, null], "4c a plan the server could not read is no answer");
    const billing = read("netlify", "functions", "billing.js");
    t.ok(/const access = accessAnswer\(await getUserPlan\(user_id\)\);/.test(billing) && /founding: \{ available: foundingAvailable, cohortLimit: FOUNDING_COHORT_LIMIT, confirmEmail \},\n\s*access,/.test(billing)
      && /access: accessAnswer\(await getUserPlan\(user_id\)\),\n\s*\}\);/.test(billing), "4d billing.js puts it in status (web and store app) and store_status (after the sync)");
  }

  // ── 4b. The 30 days from go-live (migration 0029) ──────────────────────────────────────────────────
  {
    const ends = new Date(Date.now() + 20 * 86400000).toISOString();
    t.eq(R.accessAnswer({ known: true, unlimited: true, entitlement: "grace", grace_ends_at: ends }), { entitled: true, basis: "grace", grace_ends_at: ends }, "4e in its 30 days: entitled, with the end date");
    const grace = G.accessFromStatus({ access: { entitled: true, basis: "grace", grace_ends_at: ends } });
    t.eq([G.paywallShows({ signedIn: true, access: grace }), G.graceNoticeEnds(grace)], [false, ends], "4f no paywall, and the small notice with the server's date");
    t.eq([G.graceNoticeEnds(G.accessFromStatus({ access: { entitled: true, basis: "paid", grace_ends_at: null } })), G.graceNoticeEnds(G.accessFromStatus({ access: { entitled: true, basis: "grace", grace_ends_at: new Date(Date.now() - 1000).toISOString() } })), G.graceNoticeEnds(null)],
      [null, null, null], "4g no notice for a paying household, after the date, or with no answer");
    t.ok(/const graceEnds = graceNoticeEnds\(serverAccess\);/.test(APP) && (APP.match(/\{graceEnds&&/g) || []).length === 2, "4h the notice sits where the trial chip does, on the phone and the desktop, in every app");
    // The app's own plan cache follows the same rule, so the coach and What-If open on the device too.
    const store = new Map();
    global.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
    const U = await import("../src/lib/usageLimits.js");
    U.setPlan("grace"); store.set("flourish_grace_ends_at", ends);
    t.eq([U.getPlan(), U.isGraceActive(), U.isUnlimited(), U.canUseCoach()], ["grace", true, true, true], "4i on the device, the 30 days open every feature");
    store.set("flourish_grace_ends_at", new Date(Date.now() - 1000).toISOString());
    t.eq([U.isGraceActive(), U.isUnlimited()], [false, false], "4j …and end on their date, even offline");
    const refresh = APP.slice(APP.indexOf("const refreshPlanFromProfile"), APP.indexOf("const refreshPlanFromProfile") + 2200);
    t.ok(/\.select\("grace_ends_at"\)/.test(refresh) && /const cp = derivePlan\(\{ \.\.\.prof, grace_ends_at: graceEndsAt \}\);/.test(refresh) && /\.select\("plan,trial_started_at,trial_ends_at,founder_flag"\)/.test(refresh),
      "4k the app reads the end date on its own, so a database without 0029 never fails the plan read");
  }

  // ── 5. Words ─────────────────────────────────────────────────────────────────────────────────────
  {
    const placeholders = [...G.NO_PLAN_PLACEHOLDERS];
    t.ok(placeholders.length >= 3 && placeholders.every((w) => /^\[WORDS: [^\]]+\]$/.test(w)), "5a every new line is a [WORDS: …] placeholder until the founder's words are in");
    const approved = [["dataSafe", "Your accounts, bills and history stay as they are."], ["seePlans", "See plans"], ["checkAgain", "Check again"], ["manage", "Manage subscription"],
      ["signOut", "Sign out"], ["exportData", "⬇ Export my data (JSON)"], ["deleteAccount", "Delete Account"], ["privacy", "Privacy Policy"], ["terms", "Terms"], ["support", "Support"]];
    for (const [k, w] of approved) {
      t.eq(G.NO_PLAN_COPY[k], w, `5b ${k} reuses an approved line, word for word`);
      t.ok(APP.includes(`"${w}"`) || APP.includes(`>${w}<`) || read("src", "lib", "storeOffer.js").includes(`"${w}"`), `5c …that already ships: ${w}`);
    }
  }

  t.summary("noPlanPaywall");
})();
