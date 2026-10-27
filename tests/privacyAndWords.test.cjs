// tests/privacyAndWords.test.cjs
// -----------------------------------------------------------------------------
// THE 2026-10-21 WORDING, WORD FOR WORD (ChatGPT AGREE and Grok AGREE), AND WHERE EACH LINE MAY SHOW.
//
//   A  the Privacy Policy: A1 to A6 exactly, A7 its Last updated date (October 26, 2026, when the website-analytics line came in);
//      in a store app, A2 from its Apple and Google sentence and no Stripe line (a store app never names the website);
//   B  B1 (App Store) and B2 (Google Play) on a store app's Subscription card, only for an account that holds a
//      founding spot while paying for a regular store plan: every case, both ways;
//   C  the launch email's sentence;
//   D  the website Settings card's Flourish Plus line.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");
const { loadApp, textOf, describe, REPO } = require("./_renderApp.cjs");
const { adviceProblems } = require("./_copyStrings.cjs");

const A = {
  A1: "This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use the Flourish Money application (\"App\"), available at flourishmoney.app and in the Flourish iPhone and Android apps.",
  A2: "Payments: If you subscribe on flourishmoney.app, Stripe processes your payment. Stripe collects your card details and billing address to charge you and to calculate sales tax. We receive your subscription status, plan, renewal dates, and the amounts and tax charged. We never see or store your full card number. If you subscribe in the iPhone or Android app, Apple or Google processes your payment. RevenueCat sends us subscription information such as the store, product, subscription status and renewal or expiry dates, linked to your account ID. We do not receive your full payment card details from Apple or Google.",
  A3: "Waitlist: If you join the waitlist, we collect your email address and country, the page or link you joined from, and a record of what you agreed to receive and when.",
  A4: "We do not collect your IP address for tracking purposes. We use it briefly to limit repeated sign-up and coach requests, which protects your account and the service from abuse.",
  A5: "We retain data only as long as necessary to provide the service or as required by law. Payment and tax records are kept as required by Canadian tax law, generally for six years from the end of the last tax year they relate to, even after you delete your account.",
  A6: ["• Stripe: payments on flourishmoney.app and sales tax calculation", "• Apple and Google: payments for subscriptions bought in the iPhone or Android app",
    "• RevenueCat: records subscriptions bought in the iPhone or Android app (subscription status, plan and renewal dates, linked to your account ID)",
    "• Resend: sends account and waitlist emails", "• Sentry: crash and error reports"],
};
const B1 = "You hold a founding spot. Founding annual is a separate plan, so to avoid being charged for two, cancel your current plan in your Apple Account settings first. You keep access until it ends, then choose Founding annual in See plans.";
const B2 = "You hold a founding spot. To avoid being charged during a plan change, cancel your current plan in Google Play under Subscriptions first. You keep access until it ends, then choose Founding annual in See plans.";
const C = "flourish is now available in Canada at flourishmoney.app, on the App Store and on Google Play.";
const D = "Flourish Plus adds Credit and the coach-run meeting, and lifts the free plan's limits on the coach and What-If.";

(async () => {
  const t = create();
  const APP = fs.readFileSync(path.join(REPO, "src", "App.jsx"), "utf8");
  const O = await import("../src/lib/storeOffer.js");
  let R = null;
  try { R = loadApp(["PrivacyPolicy", "Settings"]); } catch (e) { t.ok(false, `App.jsx bundles: ${describe(e)}`); }

  // ── A. The Privacy Policy ─────────────────────────────────────────────────────────────────────
  if (R) {
    // textOf puts a space between elements; on the page "<strong>Stripe</strong>: …" reads "Stripe: …".
    const pp = textOf(R.render(R.h(R.PrivacyPolicy, { onBack() {} }))).replace(/\s+/g, " ").replace(/ :/g, ":");
    for (const k of ["A1", "A2", "A3", "A4", "A5"]) t.ok(pp.includes(A[k]), `${k} word for word`);
    t.ok(A.A6.every((line) => pp.includes(line)), "A6 the five new lines in section 6");
    t.ok(pp.includes("Last updated October 26, 2026"), "A7 Last updated October 26, 2026");
    const i1 = pp.indexOf("Bank connection data (Plaid):"), i2 = pp.indexOf(A.A2), i3 = pp.indexOf(A.A3), i4 = pp.indexOf("2. How We Use Your Information");
    t.ok(i1 > 0 && i1 < i2 && i2 < i3 && i3 < i4, "A2 and A3 follow the Plaid paragraph, still in section 1");
    const s6 = pp.slice(pp.indexOf("6. Data Sharing"), pp.indexOf("7. Your Rights"));
    t.ok(A.A6.every((line) => s6.includes(line)) && s6.indexOf("• Netlify") < s6.indexOf(A.A6[0]), "A6 in section 6's list, after the existing providers");

    // In a store app: A2 from "If you subscribe in the iPhone or Android app", with its label, and no Stripe line.
    const A2_STORE = "Payments: " + A.A2.slice(A.A2.indexOf("If you subscribe in the iPhone or Android app"));
    const real = globalThis.Capacitor;
    const setPlatform = (pl) => Object.defineProperty(globalThis, "Capacitor", { value: { ...real, getPlatform: () => pl, isNativePlatform: () => pl !== "web" }, configurable: true, writable: true });
    for (const pl of ["ios", "android"]) {
      let nat = "";
      setPlatform(pl);
      try { nat = textOf(R.render(R.h(R.PrivacyPolicy, { onBack() {} }))).replace(/\s+/g, " ").replace(/ :/g, ":"); } finally { setPlatform("web"); }
      t.ok(A2_STORE.startsWith("Payments: If you subscribe in the iPhone or Android app, Apple or Google processes your payment.") && nat.includes(A2_STORE) && !nat.includes(A.A2),
        `A2 ${pl}: from the Apple and Google sentence, word for word, with its label`);
      t.ok(!/Stripe/.test(nat), `A6 ${pl}: no Stripe anywhere in the store app's policy`);
      t.ok(A.A6.slice(1).every((line) => nat.includes(line)), `A6 ${pl}: the other four new lines are there`);
      // Still naming the website, and open for approved words (reported, not changed): A1's opening sentence and the
      // Contact section's "Website:" line. The privacy@ address is an email address, not the website.
      const rest = nat.replace(A.A1, "").replace("Website: flourishmoney.app", "").replace(/privacy@flourishmoney\.app/g, "");
      t.ok(!/flourishmoney\.app/.test(rest), `A ${pl}: no other mention of flourishmoney.app in the store app's policy`);
      t.ok(nat.includes("Last updated October 26, 2026") && ["A1", "A3", "A4", "A5"].every((k) => nat.includes(A[k])), `A ${pl}: A1, A3, A4, A5 and the date as on the website`);
    }
  }

  // ── B. The founding spot line ─────────────────────────────────────────────────────────────────
  t.eq([O.FOUNDING_SPOT_LINE.app_store, O.FOUNDING_SPOT_LINE.play_store], [B1, B2], "B the two lines, word for word");
  const held = { renews: true, period_end: "2026-11-21T00:00:00Z" };
  const st = (o) => ({ paid: true, provider: "app_store", plan_key: "monthly", founding: { available: false, held_on_regular_plan: held }, ...o });
  const cases = [
    ["App Store, monthly, founding spot", st({}), B1],
    ["App Store, annual, founding spot", st({ plan_key: "annual" }), B1],
    ["Google Play, monthly, founding spot", st({ provider: "play_store" }), B2],
    ["Google Play, annual, founding spot", st({ provider: "play_store", plan_key: "annual" }), B2],
    ["no founding spot", st({ founding: { available: false, held_on_regular_plan: null } }), null],
    ["already on Founding annual", st({ plan_key: "founding_annual" }), null],
    ["already on Founding annual (even if the server ever said held)", st({ plan_key: "founding_annual", provider: "play_store" }), null],
    ["not paying", st({ paid: false }), null],
    ["a website subscription", st({ provider: "stripe" }), null],
    ["no status yet", null, null],
  ];
  for (const [why, status, want] of cases) t.eq(O.foundingSpotLine(status), want, `B ${why}: ${want === B1 ? "B1" : want === B2 ? "B2" : "nothing"}`);
  t.ok(/const storeSubscription = storeBilling \? \{\n    line: subscriptionLine\(storeStatus, \{ entitled: storeEntitled \}\),\n[^\n]*\n    foundingSpotLine: foundingSpotLine\(storeStatus\),/.test(APP),
    "B never on the website: the Subscription card (and its line) exists only in a store build that sells");
  if (R) {
    const props = (ss) => ({ data: { profile: {} }, setAppData() {}, setScreen() {}, onClose() {}, onReset() {}, theme: "dark", toggleTheme() {}, billingUi: { show: false }, onOpenUpgrade() {}, storeSubscription: ss });
    const base = { line: "Your subscription is through the App Store.", onRestore() {}, onManage() {} };
    let shown = "", none = "", web = "";
    try { shown = textOf(R.render(R.h(R.Settings, props({ ...base, foundingSpotLine: B1 })))); none = textOf(R.render(R.h(R.Settings, props({ ...base, foundingSpotLine: null })))); web = textOf(R.render(R.h(R.Settings, props(null)))); }
    catch (e) { t.ok(false, `Settings renders: ${describe(e)}`); }
    t.ok(shown.includes(B1) && !none.includes("founding spot") && !web.includes("founding spot"), "B the card shows the line when given it, and nothing otherwise (the website has no card)");
  }
  t.eq([B1, B2].flatMap((x) => adviceProblems(x)), [], "B no money instruction or verdict");
  t.ok([B1, B2].every((x) => !/flourishmoney\.app|website|on the web/i.test(x) && !/[–—]/.test(x)), "B neither line names the website, and no dash");

  // ── C. The launch email ───────────────────────────────────────────────────────────────────────
  const E = require("../netlify/functions/_lib/foundingLinkEmail.js");
  t.ok(E.launchParagraphs().includes(C) && !E.launchParagraphs().includes("flourish is now available in Canada at flourishmoney.app."), "C the launch email's sentence, word for word");

  // ── D. The website Settings card ──────────────────────────────────────────────────────────────
  t.ok(APP.includes(`: "${D}"}`) && !APP.includes("Unlimited coaching and the full picture from your linked accounts."), "D the website Settings card's Flourish Plus line, word for word");
  t.ok(/\{billingUi\?\.show&&onOpenUpgrade&&\(/.test(APP), "D …on the card that shows only when the server says billing is on and this is not a store app");
  t.summary("privacyAndWords.test");
})();
