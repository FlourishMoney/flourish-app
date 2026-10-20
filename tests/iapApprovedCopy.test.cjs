// tests/iapApprovedCopy.test.cjs
// -----------------------------------------------------------------------------
// VERSION 1.1: THE APPROVED IN-APP PURCHASE LINES, WORD FOR WORD (2026-10-20, ChatGPT and Grok agreed).
//
//   1  the iPhone and Android paywall disclosures, and each shows on its own platform under the plans;
//   2  the three links under both, in order, each wired to something that works: Terms of Use (iOS: Apple's
//      standard EULA, opened by the system; Android: the app's Terms), Privacy Policy, Restore purchases;
//   3  the founding plan's line, on the founding card only;
//   4  Terms section 7 in a selling build;
//   5  Settings' What's new for 1.1 (the approved paragraph, one sentence per note);
//   6  the free plan's bank limit in a store app is FREE_BANK_LINE on both connect paths, and the server's two
//      upgrade texts can never reach an app screen (the app builds its error from the code, never the message).
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");
const { loadApp, textOf, describe, REPO } = require("./_renderApp.cjs");

const APPROVED = {
  ios: "Payment is charged to your Apple Account when you confirm. Your subscription renews automatically unless you cancel at least 24 hours before the current period ends. You can manage or cancel it in your Apple Account settings.",
  android: "Payment is charged through Google Play when you confirm. Your subscription renews automatically unless you cancel before the renewal date. You can manage or cancel it in Google Play under Subscriptions.",
  links: ["Terms of Use", "Privacy Policy", "Restore purchases"],
  founding: "For the first 50 founding members. Your price stays the same while you stay subscribed.",
  terms7: "A new account has every feature for its first 14 days, at no charge. After that, the free plan has usage limits: 2 coach messages a week, 1 What-If a day and 1 connected bank, and it does not include Credit or the coach-run meeting. Each limit is shown where it applies. Flourish Plus lifts these limits. In the iOS and Android apps it is sold as an auto-renewing subscription through the App Store or Google Play, at the price shown in the app before you buy. Payment is charged to your Apple or Google account when you confirm. The subscription renews automatically at the end of each period unless you cancel it in your App Store or Google Play account settings before it renews (for Apple, at least 24 hours before the period ends). Cancelling takes effect at the end of the current period. Refunds for purchases made in the apps are handled by Apple or Google under their own policies. The founding price is for the first 50 founding members and stays the same while that subscription stays active.",
  whatsNew: "Flourish Plus is now available in the app. Every new account still gets every feature for its first 14 days. After that, you can stay on the free plan or choose Flourish Plus for the coach with no weekly limit, What-If as often as you like, more than one connected bank, Credit and the coach-run money meeting.",
};
const UPGRADE_TEXTS = ["Connecting more than one bank is a Plus feature. Upgrade to add unlimited banks.", "Free plan supports one bank. Upgrade to Plus to add more."];

(async () => {
  const t = create();
  const O = await import("../src/lib/storeOffer.js");
  const F = await import("../src/lib/freePlan.js");
  const APP = fs.readFileSync(path.join(REPO, "src", "App.jsx"), "utf8");
  const PLAID = fs.readFileSync(path.join(REPO, "netlify", "functions", "plaid.js"), "utf8");
  const comp = APP.slice(APP.indexOf("function StorePaywall("), APP.indexOf("function Paywall("));

  // ── 1. The disclosures ────────────────────────────────────────────────────────────────────────
  t.eq([O.STORE_DISCLOSURE.ios, O.STORE_DISCLOSURE.android], [APPROVED.ios, APPROVED.android], "1a the iPhone and Android disclosures, word for word");
  t.eq([O.storeDisclosure("ios"), O.storeDisclosure("android"), Object.isFrozen(O.STORE_DISCLOSURE)], [APPROVED.ios, APPROVED.android, true], "1b each platform gets its own (frozen)");

  // ── 2. The three links ────────────────────────────────────────────────────────────────────────
  t.eq([O.PAYWALL_COPY.terms, O.PAYWALL_COPY.privacy, O.PAYWALL_COPY.restore], APPROVED.links, "2a the three link labels, word for word");
  t.ok(!("eula" in O.PAYWALL_COPY), "2b no other link line (the unapproved EULA label is gone)");
  const swift = fs.readFileSync(path.join(REPO, "node_modules", "@capacitor", "ios", "Capacitor", "Capacitor", "WebViewDelegationHandler.swift"), "utf8");
  t.ok(/\? <a href=\{APPLE_EULA_URL\} target="_blank" rel="noopener noreferrer"/.test(comp) && O.APPLE_EULA_URL === "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/"
    && /createWebViewWith configuration[\s\S]{0,300}UIApplication\.shared\.open\(url/.test(swift),
    "2c iOS: Terms of Use opens Apple's standard EULA in a new window, which Capacitor hands to the system (Safari)");
  t.ok(/: <button onClick=\{\(\)=>onViewLegal\("terms"\)\}/.test(comp) && /<button onClick=\{\(\)=>onViewLegal\("privacy"\)\}/.test(comp) && /<button onClick=\{doRestore\}/.test(comp),
    "2d Android: Terms of Use opens the app's Terms; both: Privacy Policy opens the app's policy, Restore purchases runs a restore");
  t.ok(/onViewLegal=\{\(which\)=>setPaywallLegal\(which\)\}/.test(APP) && /paywallLegal==="terms" \? <div[^\n]*<TermsOfService onBack=\{\(\)=>setPaywallLegal\(null\)\}\/>/.test(APP)
    && /: paywallLegal==="privacy" \? <div[^\n]*<PrivacyPolicy onBack=\{\(\)=>setPaywallLegal\(null\)\}\/>/.test(APP), "2e …and the paywall shows the page it was asked for, with a way back");

  // ── 3. The founding line ──────────────────────────────────────────────────────────────────────
  t.eq(O.FOUNDING_LINE, APPROVED.founding, "3a the founding line, word for word");
  t.eq(["monthly", "annual", "founding_annual"].map((plan) => O.offerCopy({ plan, priceString: "CA$1.00", platform: "ios" }).note), [null, null, APPROVED.founding], "3b …on the founding card only");

  // ── 4. Terms section 7 ────────────────────────────────────────────────────────────────────────
  t.eq(F.STORE_TERMS_SECTION_7_IAP, APPROVED.terms7, "4a Terms section 7 in a selling build, word for word");
  t.ok(/\{isNativeApp\(\) \? \(storeBillingBuild\(\) \? STORE_TERMS_SECTION_7_IAP : STORE_TERMS_SECTION_7\) : <>/.test(APP), "4b …shown in a store app that sells; a 1.0.x build keeps its own line");

  // ── 5. What's new ─────────────────────────────────────────────────────────────────────────────
  const W = JSON.parse(fs.readFileSync(path.join(REPO, "src", "whatsNew.json"), "utf8"));
  t.eq([W.version, W.notes.join(" ")], ["1.1.0", APPROVED.whatsNew], "5a What's new for 1.1.0 is the approved paragraph, word for word (one sentence per note)");

  // ── 6. The bank limit ─────────────────────────────────────────────────────────────────────────
  t.ok(UPGRADE_TEXTS.every((x) => PLAID.includes(x)) && /error: "plan_limit", message: "Connecting more than one bank/.test(PLAID) && /error: "plan_limit", message: "Free plan supports one bank/.test(PLAID),
    "6a (the server's two texts are the message beside the code plan_limit)");
  const call = APP.slice(APP.indexOf("async function callPlaid("), APP.indexOf("async function callPlaid(") + 3000);
  t.ok(/const err = new Error\(data\.error \|\| "Plaid error"\);/.test(call) && !/data\.message/.test(call), "6b the app builds a Plaid error from the code only, never the server's message");
  t.eq(UPGRADE_TEXTS.filter((x) => APP.includes(x) || APP.includes(x.split(". ")[1])), [], "6c neither upgrade text is anywhere in the app");
  t.ok(/: \(isNativeApp\(\) && \/plan_limit\/\.test\(String\(err\.message\|\|""\)\)\)[\s\S]{0,200}\? FREE_BANK_LINE/.test(APP), "6d onboarding's connect: a store app shows FREE_BANK_LINE");
  t.ok(/if\(isNativeApp\(\) && \/plan_limit\/\.test\(String\(err\?\.message\|\|""\)\)\)\{ alertModal\(\{ message: FREE_BANK_LINE \}\); return; \}/.test(APP), "6e Settings' add-bank: a store app shows FREE_BANK_LINE (it used to say \"Please try again\")");

  // The paywall renders the approved lines where they belong.
  let A = null;
  try { A = loadApp(["StorePaywall"]); } catch (e) { t.ok(false, `App.jsx bundles: ${describe(e)}`); }
  if (A) {
    const html = textOf(A.render(A.h(A.StorePaywall, { purchases: null, platform: "ios", status: null, askStore: async () => null, onResolved() {}, onViewLegal() {}, onManage() {}, onClose() {} })));
    const at = APPROVED.links.map((x) => html.indexOf(x));
    t.ok(at.every((i, k) => i >= 0 && (k === 0 || i > at[k - 1])), "7a the three links render in the approved order");
  }
  t.summary("iapApprovedCopy.test");
})();
