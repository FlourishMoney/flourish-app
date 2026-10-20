// tests/termsTax.test.cjs
// -----------------------------------------------------------------------------
// THE TERMS SAY WHAT CHECKOUT DOES WITH TAX (billing day, round 5; wording approved by ChatGPT and Grok).
//
// The Terms said prices were "displayed in CAD for Canadian users and USD for US users, inclusive of
// applicable taxes", while every other page says "plus tax", checkout charges CAD only, and Stripe Tax adds
// GST/HST at checkout from the billing address. Pinned:
//   1. the new sentence, word for word, rendered on the web Terms; the old one gone;
//   2. the rest of the paragraph unchanged;
//   3. the Terms' "Last updated" date moved (the Privacy Policy's is not touched);
//   4. the store apps' Terms paragraph is src/lib/freePlan.js STORE_TERMS_SECTION_7 (nothing to buy there;
//      since 2026-10-20 it says the apps follow the web's trial and free plan limits).
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");
const { loadApp, textOf, describe, REPO } = require("./_renderApp.cjs");

const APP = fs.readFileSync(path.join(REPO, "src", "App.jsx"), "utf8");
const NEW = "Prices are in Canadian dollars (CAD) and do not include sales tax. Applicable GST/HST and provincial sales taxes are calculated from your billing address and added at checkout.";

(async () => {
  const t = create();
  const { STORE_TERMS_SECTION_7 } = await import("../src/lib/freePlan.js");
  const terms = APP.slice(APP.indexOf("function TermsOfService({onBack}){"), APP.indexOf("function ", APP.indexOf("function TermsOfService({onBack}){") + 30));

  t.ok(terms.includes(NEW), "1a the approved sentence, word for word");
  t.ok(!/inclusive of applicable taxes|USD for US users/.test(APP), "1b the old sentence is gone everywhere in the app");
  for (const kept of ["Subscription fees are billed in advance on a monthly or annual basis.",
    "You may cancel at any time; cancellations take effect at the end of the current billing period.",
    "No refunds are provided for partial billing periods unless required by applicable law.",
    "Premium features require a paid subscription."]) {
    t.ok(terms.includes(kept), `2 the rest of the paragraph stays: "${kept.slice(0, 50)}…"`);
  }
  t.ok(/\. Prices are in Canadian dollars \(CAD\) and do not include sales tax\. Applicable GST\/HST and provincial sales taxes are calculated from your billing address and added at checkout\. You may cancel at any time;/.test(terms),
    "2b …in the same place: after the billing sentence, before cancellation");
  t.ok(/const last="October 14, 2026";/.test(terms), "3a the Terms' Last updated date is October 14, 2026");
  const privacy = APP.slice(APP.indexOf("function PrivacyPolicy("), APP.indexOf("function ", APP.indexOf("function PrivacyPolicy(") + 30));
  t.ok(privacy.length > 100 && !/October 14, 2026/.test(privacy), "3b the Privacy Policy's date is not touched");
  t.ok(/\{isNativeApp\(\) \? \(storeBillingBuild\(\) \? STORE_TERMS_SECTION_7_IAP : STORE_TERMS_SECTION_7\) : <>/.test(terms) && /^There is nothing to buy in the iOS and Android apps\. /.test(STORE_TERMS_SECTION_7),
    "4 a 1.0.x store app's Terms paragraph is STORE_TERMS_SECTION_7, which starts by saying there is nothing to buy in them; a 1.1 selling build has its own (storeOffer.test 5j)");

  let A = {};
  try { A = loadApp(["TermsOfService"]); } catch (e) { t.ok(false, `App.jsx bundles: ${describe(e)}`); }
  if (A.TermsOfService) {
    const txt = textOf(A.render(A.h(A.TermsOfService, { onBack: () => {} })));
    t.ok(txt.includes(NEW) && txt.includes("Last updated October 14, 2026"), "5 rendered on the web: the sentence and the date");
  }

  // 6. Counsel's documents quote what is in the app (2026-10-15).
  const packet = fs.readFileSync(path.join(REPO, "docs", "ops", "LEGAL-PACKET.md"), "utf8");
  const pTerms = packet.slice(packet.indexOf("## 3. Terms of Service"), packet.indexOf("\n## 4."));
  t.ok(pTerms.includes(NEW) && pTerms.includes("last updated October 14, 2026"), "6a the legal packet's Terms quote the sentence and the date in the app");
  t.ok(pTerms.includes(`"${STORE_TERMS_SECTION_7}"`), "6b …and the store apps' paragraph as the app has it");
  const before = fs.readFileSync(path.join(REPO, "docs", "ops", "BEFORE-MONDAY.md"), "utf8");
  const offerTerms = before.slice(before.indexOf("## 3. Founding offer terms"), before.indexOf("\n## 4."));
  t.ok(offerTerms.includes(NEW), "6c the founding terms summary quotes the Terms sentence in the app");
  t.ok(![packet, offerTerms].some(d => /inclusive of applicable taxes|USD for US users, plus|regular annual price|regular price applies|regular plan|regular price change|provided free of charge on iOS/i.test(d)),
    "6d neither says the old sentence, \"regular annual price\" or the old iOS line");
  t.ok(/standard price for everyone else/.test(offerTerms) && /standard price for everyone else/.test(packet), "6e both say \"standard price for everyone else\"");

  t.summary("termsTax.test");
  setImmediate(() => process.exit(process.exitCode || 0));
})();
