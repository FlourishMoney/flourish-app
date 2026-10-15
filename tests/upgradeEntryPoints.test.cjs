// tests/upgradeEntryPoints.test.cjs
// -----------------------------------------------------------------------------
// EVERY "UPGRADE" OPENS THE REAL CHECKOUT ONCE BILLING IS ON (billing day, 2026-10-26).
//
// Five screens (Today, Goals, the Credit gate, the coach's out-of-messages gate, What-If; six call sites)
// opened the old feature Paywall directly, whose button says "Paid plans aren't open yet". They now go
// through openUpgrade(): with BILLING_ENABLED on it opens the real checkout (UpgradeScreen); with it off it
// opens the old Paywall, whose text stays exactly as today. Round 5: so do the three web trial prompts
// (the sidebar trial card, the "N days left" banner, "Your free trial has ended"), which called
// setShowPaywall(true) from an onClick and showed "Save 31%" and "Paid plans aren't open yet" with billing on.
//   1. the call sites: every one, whatever the prop (onUpgrade, onClick, anything else);
//   2. what the buttons say: billing off, today's words; billing on, "See plans", with no free trial
//      promised in front of a paid checkout;
//   3. the checkout's prices are the landing page's own words, and no other figure;
//   4. a store app: none of it shows (the gates and the card stay native-guarded).
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");
const { loadApp, textOf, describe, REPO } = require("./_renderApp.cjs");

const APP = fs.readFileSync(path.join(REPO, "src", "App.jsx"), "utf8");
const MONEY = /\$\s?\d[\d,]*(?:\.\d+)?/g;

(async () => {
  const t = create();

  // ── 1. the call sites ────────────────────────────────────────────────────────────────────────────
  {
    t.eq((APP.match(/onUpgrade=\{\(\)=>setShowPaywall\(true\)\}/g) || []).length, 0, "1a no screen opens the old Paywall directly any more");
    t.eq((APP.match(/onUpgrade=\{openUpgrade\}/g) || []).length, 7, "1b all seven upgrade props go through openUpgrade (the six, and the coach's own)");
    for (const [name, rx] of [
      ["What-If", /<WhatIfSimulator [^\n]*onUpgrade=\{openUpgrade\}/], ["Today", /if\(screen==="home"\)return <Dashboard [^\n]*onUpgrade=\{openUpgrade\}/],
      ["Goals", /<Goals [^\n]*onUpgrade=\{openUpgrade\}/], ["the Credit gate", /<PremiumGate billingOn=\{billingUi\.show\} feature="Credit Coaching" [^\n]*onUpgrade=\{openUpgrade\}/],
      ["the coach's gate", /<PremiumGate billingOn=\{billingUi\.show\} feature="AI Coach" [^\n]*onUpgrade=\{openUpgrade\}/],
      ["Today (the default screen)", /\n    return <Dashboard [^\n]*onUpgrade=\{openUpgrade\}/],
    ]) t.ok(rx.test(APP), `1c ${name} opens checkout through openUpgrade`);
    t.ok(/const openUpgrade = \(\)=>\{ if\(billingUi\.show\) setShowUpgrade\(true\); else setShowPaywall\(true\); \};/.test(APP),
      "1d openUpgrade: billing on, the real checkout; billing off, the old Paywall, as today");
    t.ok(APP.includes("Paid plans aren't open yet. Nothing has been charged and your plan hasn't changed. We'll email you the moment checkout is live."),
      "1e the old Paywall's words are unchanged (billing off)");
    t.eq((APP.match(/isDesktop=\{isDesktop\} onUpgrade=\{openUpgrade\} billingOn=\{billingUi\.show\}/g) || []).length, 2, "1f both Today renders know whether billing is on");
    // Round 5: not only onUpgrade props. The one place left that opens the old Paywall is openUpgrade itself.
    const opens = [...APP.matchAll(/setShowPaywall\(true\)/g)].map(m => APP.slice(APP.lastIndexOf("\n", m.index) + 1, APP.indexOf("\n", m.index)).trim());
    t.eq(opens, ["const openUpgrade = ()=>{ if(billingUi.show) setShowUpgrade(true); else setShowPaywall(true); };"],
      "1g nothing opens the old Paywall directly (onClick included): only openUpgrade, with billing off");
    for (const [name, rx] of [
      ["the sidebar trial card", /<div onClick=\{openUpgrade\} [^\n]*\n(?:[^\n]*\n){1,4}[^\n]*>Upgrade to Flourish Plus →<\/div>/],
      ["the \"N days left\" banner", /trialActive&&trialDaysLeft<=7&&\([\s\S]{0,1200}?<button onClick=\{openUpgrade\} [^\n]*>\n\s*Upgrade →\n/],
      ["\"Your free trial has ended\"", />Your free trial has ended<\/span>\n\s*<button onClick=\{openUpgrade\} [^\n]*>\n\s*Upgrade Now\n/],
    ]) t.ok(rx.test(APP), `1h ${name} opens checkout through openUpgrade`);
  }

  // ── 2. what the buttons say ─────────────────────────────────────────────────────────────────────
  let A = {};
  try { A = loadApp(["PremiumGate"]); } catch (e) { t.ok(false, `App.jsx bundles: ${describe(e)}`); }
  if (A.PremiumGate) {
    const gate = (props) => textOf(A.render(A.h(A.PremiumGate, { feature: "Credit Coaching", desc: "Factor by factor.", onUpgrade: () => {}, ...props })));
    A.store.clear();
    t.ok(gate({}).includes("Start 14 days free →") && gate({}).includes("14 days free. Cancel any time."), "2a billing off, no trial yet: today's words");
    A.store.set("flourish_trial_started_at", "2026-09-01T00:00:00Z");
    t.ok(gate({}).includes("Get Flourish Plus →") && gate({ billingOn: false }).includes("Cancel any time."), "2b billing off, trial used: today's words");
    for (const trial of [null, "2026-09-01T00:00:00Z"]) {
      if (trial) A.store.set("flourish_trial_started_at", trial); else A.store.clear();
      const on = gate({ billingOn: true });
      t.ok(on.includes("See plans →") && on.includes("Cancel any time."), `2c billing on (${trial ? "trial used" : "no trial yet"}): "See plans", and cancel any time`);
      t.ok(!/days free|Try Free|free trial/i.test(on), "2d …and no free trial promised in front of a paid checkout");
      t.eq(on.match(MONEY), null, "2e …and no price on the gate");
    }
  }
  {
    const card = APP.slice(APP.indexOf("{!data.isPremium&&!isNativeApp()&&onUpgrade&&("), APP.indexOf("{!data.isPremium&&!isNativeApp()&&onUpgrade&&(") + 1400);
    t.ok(/\{billingOn \? "See plans →" : "Try Free →"\}/.test(card), "2f the Today card: \"See plans\" with billing on, \"Try Free\" (today's) with it off");
    t.ok(/function Dashboard\(\{[^)]*billingOn=false,/.test(APP), "2g …and off unless told otherwise");
    t.eq(card.match(MONEY), null, "2h the Today card names no price");
  }

  // ── 3. the checkout's prices are the landing page's own words ───────────────────────────────────
  {
    const vis = await import("../src/lib/billingVisibility.js");
    const O = await import("../src/lib/foundingOffer.js");
    const copy = O.foundingOfferCopy(), card = O.foundingCardParts(null);
    const landing = [...Object.values(copy), ...Object.values(card).filter(Boolean)].join("\n");
    const plans = vis.offeredPlans({ status: { enabled: true, founding: { available: true, cohortLimit: 50 } } });
    t.eq(plans.map(p => [p.key, p.price]), [["monthly", "$11.99 a month"], ["annual", "$99.99 a year"], ["founding_annual", "$79.99 a year"]],
      "3a the three prices, in the landing page's words");
    for (const p of plans) {
      t.ok(landing.includes(p.price), `3b "${p.price}" is word for word on the landing page`);
      const others = [p.label, p.sub, p.note].filter(Boolean).join(" ").match(MONEY);
      t.eq(others, null, `3c ${p.key}: no other figure beside it (no monthly equivalent, no saving)`);
    }
    t.ok(plans.every(p => !/%/.test(`${p.note} ${p.sub || ""}`)), "3d no percentage either");
    t.ok(landing.includes("plus tax") && plans.filter(p => p.key !== "founding_annual").every(p => p.note === "CAD plus tax"), "3e …and \"plus tax\", as the landing page says");
    t.ok(!/monthlyEquivalentOfAnnual|annualSavingsPercent/.test(fs.readFileSync(path.join(REPO, "src", "lib", "billingVisibility.js"), "utf8")),
      "3f the checkout no longer works out figures of its own");
  }

  // ── 4. a store app: nothing about paying ────────────────────────────────────────────────────────
  {
    // In its own process: a bundle loaded above for the web leaves a web Capacitor object on the global.
    const { execFileSync } = require("child_process");
    // A store app as tests/nativeNoPurchase.test.cjs builds one: served from capacitor://localhost.
    const script = `const { loadApp, textOf } = require(${JSON.stringify(path.join(__dirname, "_renderApp.cjs"))});
Object.defineProperty(globalThis, "location", { value: { protocol: "capacitor:", pathname: "/", hash: "", search: "", origin: "capacitor://localhost", href: "capacitor://localhost/" }, configurable: true, writable: true });
const N = loadApp(["PremiumGate"], { native: true });
process.stdout.write(textOf(N.render(N.h(N.PremiumGate, { feature: "Credit Coaching", desc: "Factor by factor.", onUpgrade: () => {}, billingOn: true }))));
setImmediate(() => process.exit(0));`;
    let txt = "";
    try { txt = execFileSync(process.execPath, ["-e", script], { cwd: REPO, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }); }
    catch (e) { t.ok(false, `App.jsx renders natively: ${describe(e)}`); }
    t.ok(/isn't included in this version/.test(txt), "4a (the gate rendered as a store app)");
    t.ok(!/See plans|Flourish Plus|days free|Cancel any time/.test(txt), "4b in a store app the gate shows no way to pay, even told billing is on");
    t.ok(/!data\.isPremium&&!isNativeApp\(\)&&onUpgrade&&\(/.test(APP), "4c the Today card is still hidden in a store app");
  }

  t.summary("upgradeEntryPoints.test");
  setImmediate(() => process.exit(process.exitCode || 0));
})();
