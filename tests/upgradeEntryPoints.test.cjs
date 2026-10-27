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
    t.eq((APP.match(/onUpgrade=\{openUpgrade\}/g) || []).length, 9, "1b all nine upgrade props go through openUpgrade (the six, the coach's own, and the two trial countdowns, H13)");
    for (const [name, rx] of [
      ["What-If", /<WhatIfSimulator [^\n]*onUpgrade=\{openUpgrade\}/], ["Today", /if\(screen==="home"\)return <Dashboard [^\n]*onUpgrade=\{openUpgrade\}/],
      ["Goals", /<Goals [^\n]*onUpgrade=\{openUpgrade\}/], ["the Credit gate", /<PremiumGate billingOn=\{billingUi\.show\} storeOn=\{storeBilling\} feature="Credit Coaching" [^\n]*onUpgrade=\{openUpgrade\}/],
      ["the coach's gate", /<PremiumGate billingOn=\{billingUi\.show\} storeOn=\{storeBilling\} feature="AI Coach" [^\n]*onUpgrade=\{openUpgrade\}/],
      ["Today (the default screen)", /\n    return <Dashboard [^\n]*onUpgrade=\{openUpgrade\}/],
    ]) t.ok(rx.test(APP), `1c ${name} opens checkout through openUpgrade`);
    // B4 (audit 2026-10-26): with no billing answer, openUpgrade asks the status again before the old Paywall.
    t.ok(/const openUpgrade = async \(\)=>\{ if\(storeBilling\)\{ setPaywallUp\(true\); return; \} if\(billingUi\.show\)\{ setShowUpgrade\(true\); return; \} if\(await recheckBilling\(\)\) setShowUpgrade\(true\); else setShowPaywall\(true\); \};/.test(APP),
      "1d openUpgrade: a selling store build (1.1), the store's own paywall; otherwise billing on, the real checkout; no answer, the status is asked again, and only then the old Paywall");
    t.ok(!APP.includes("Paid plans aren't open yet") && !APP.includes("Free for 14 days, then"),
      "1e the old Paywall never says plans aren't open, and never offers a free trial (B4)");
    t.eq((APP.match(/isDesktop=\{isDesktop\} onUpgrade=\{openUpgrade\} billingOn=\{billingUi\.show\}/g) || []).length, 2, "1f both Today renders know whether billing is on");
    // Round 5: not only onUpgrade props. The one place left that opens the old Paywall is openUpgrade itself.
    const opens = [...APP.matchAll(/setShowPaywall\(true\)/g)].map(m => APP.slice(APP.lastIndexOf("\n", m.index) + 1, APP.indexOf("\n", m.index)).trim());
    t.eq(opens, ["const openUpgrade = async ()=>{ if(storeBilling){ setPaywallUp(true); return; } if(billingUi.show){ setShowUpgrade(true); return; } if(await recheckBilling()) setShowUpgrade(true); else setShowPaywall(true); };"],
      "1g nothing opens the old Paywall directly (onClick included): only openUpgrade, once the status has been asked again");
    for (const [name, rx] of [
      ["the sidebar trial card", /<div onClick=\{openUpgrade\} [^\n]*\n(?:[^\n]*\n){1,4}[^\n]*>Upgrade to Flourish Plus →<\/div>/],
      // H13 (audit 2026-10-26): the countdown is TrialCountdown, on the phone layout and in the desktop sidebar.
      ["the \"N days left\" banner", /\{countdown&&<TrialCountdown countdown=\{countdown\} onUpgrade=\{openUpgrade\}\/>\}/],
      ["the sidebar's trial countdown", /\{countdown&&<TrialCountdown countdown=\{countdown\} onUpgrade=\{openUpgrade\} sidebar\/>\}/],
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
    t.ok(gate({}).includes("Get Flourish Plus →") && gate({ billingOn: false }).includes("You can cancel any time."), "2b billing off, trial used: the approved words (2026-10-20)");
    for (const trial of [null, "2026-09-01T00:00:00Z"]) {
      if (trial) A.store.set("flourish_trial_started_at", trial); else A.store.clear();
      const on = gate({ billingOn: true });
      t.ok(on.includes("See plans →") && on.includes("You can cancel any time."), `2c billing on (${trial ? "trial used" : "no trial yet"}): "See plans", and cancel any time`);
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
    t.ok(txt.includes("This part isn't included in the free plan. On the free plan you keep safe to spend, your bills and paydays, and your weekly agenda."), "4a (the gate rendered as a store app: the founder's locked-screen line)");
    t.ok(!/See plans|Flourish Plus|days free|Cancel any time/.test(txt), "4b in a store app the gate shows no way to pay, even told billing is on");
    t.ok(/!data\.isPremium&&!isNativeApp\(\)&&onUpgrade&&\(/.test(APP), "4c the Today card is still hidden in a store app");
  }

  // ── 5. the trial countdown (audit H13, 2026-10-26) ──────────────────────────────────────────────
  {
    const U = await import("../src/lib/upgradeFlow.js");
    const { trialChip } = await import("../src/lib/freePlan.js");
    t.eq(U.trialCountdown({ trialActive: true, daysLeft: 13 }), { daysLeft: 13, label: trialChip(13), urgent: false },
      "5a on the trial with 13 days left: a countdown, in the store apps' approved words (\"13 days left in your trial\")");
    t.eq(trialChip(13), "13 days left in your trial", "5b …which names the trial, not Plus");
    t.eq(U.trialCountdown({ trialActive: true, daysLeft: 2 }).urgent, true, "5c the last two days are urgent");
    t.eq(U.trialCountdown({ trialActive: true, daysLeft: 1 }).label, "1 day left in your trial", "5d one day, singular");
    t.eq(U.trialCountdown({ trialActive: true, daysLeft: 13, paid: true }), null, "5e a household the server says pays sees no countdown");
    t.eq(U.trialCountdown({ trialActive: true, daysLeft: 13, native: true }), null, "5f nor does a store app (it has NativeTrialChip)");
    t.eq(U.trialCountdown({ trialActive: false, daysLeft: 13 }), null, "5g nor anyone off the trial");
    for (const d of [0, -1, null, NaN]) t.eq(U.trialCountdown({ trialActive: true, daysLeft: d }), null, `5h no countdown for ${d} days left`);
    // The wiring: the countdown is gated on the trial, never on isPremium, which the trial sets.
    t.ok(/const countdown = trialCountdown\(\{ trialActive, daysLeft: trialDaysLeft, native: isNativeApp\(\),\s*paid: billingStatus\?\.paid === true \|\| storeStatus\?\.paid === true \}\);/.test(APP),
      "5i the app asks trialCountdown with the trial, the days left, the store-app test and the server's paid answer");
    t.ok(!/!isPremium&&!isNativeApp\(\)&&trialActive&&trialDaysLeft<=7/.test(APP), "5j the old banner, gated on !isPremium (so it never showed), is gone");
    t.ok(/isPremium&&!isNativeApp\(\)&&!trialActive&&<div[^\n]*>✦ Flourish Plus<\/div>/.test(APP), "5k the sidebar does not call a trial household \"Flourish Plus\"");
    let A2 = {};
    try { A2 = loadApp(["TrialCountdown"]); } catch (e) { t.ok(false, `5l App.jsx bundles: ${describe(e)}`); }
    if (A2.TrialCountdown) {
      for (const sidebar of [false, true]) {
        const html = A2.render(A2.h(A2.TrialCountdown, { countdown: U.trialCountdown({ trialActive: true, daysLeft: 9 }), onUpgrade: () => {}, sidebar }));
        const txt = textOf(html);
        t.ok(txt.includes("9 days left in your trial") && txt.includes("Upgrade →") && !/Flourish Plus/.test(txt),
          `5l the ${sidebar ? "sidebar card" : "phone bar"} says the days left in the trial and offers Upgrade → (${JSON.stringify(txt)})`);
        t.ok(/role="status"/.test(html) && /min-height:44px/.test(html), `5m …as a status line, with a 44 px button (${sidebar ? "sidebar" : "bar"})`);
      }
    }
  }

  t.summary("upgradeEntryPoints.test");
  setImmediate(() => process.exit(process.exitCode || 0));
})();
