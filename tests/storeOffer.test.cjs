// tests/storeOffer.test.cjs
// -----------------------------------------------------------------------------
// VERSION 1.1, ITEM 2: THE OFFER, EXACTLY AS DECIDED AND NO WIDER (founder's decisions, 2026-10-20).
//
// In-app purchases start paying right away. No store product has a free trial or an introductory offer; the
// 14-day account trial (#84) is the only trial, the same on the web and in every app, and after it the free plan.
//   1. The account trial runs in a selling build exactly as everywhere else, on the app's side and the server's.
//   2. One answer: the app's storePlan and the server agree for every plan, paid or not.
//   3. A store purchase is paid from the moment the store confirms it; when it ends, the free plan.
//   4. The words for each plan: the store's own price string, word for word; no plan we don't sell.
//   5. The words: no trial, no free month, no website price, no saving or "best" claim, no money instruction,
//      no dash, no banned word, Canadian spelling, and the renewal terms the stores require.
//   6. The screen: one render site; the approved disclosure and the approved three links (Terms of Use, on iOS
//      Apple's standard EULA; Privacy Policy; Restore purchases); it can always be closed.
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
const S = require("../netlify/functions/_lib/storeSubscriptions.js");
const NOW = Date.parse("2026-11-15T12:00:00Z");
const DAY = 86400000;
const BANNED = /\blearns?\b|\bremembers?\b|\bsmarter\b|better over time|\bsets? aside\b|\bholds? back\b|GST\/HST credit|GST credit|[–—]|\b(Mint|YNAB|Monarch|Rocket Money|Copilot|Quicken|Wealthsimple|KOHO|Credit Karma|Borrowell|Simplifi|EveryDollar|PocketGuard|Goodbudget|Emma)\b/;
const SAVING = /\bsav(e|es|ing|ings)\b|cheaper|best value|\bthe best\b|% off|\bdiscount|\bdeal\b|for less\b/i;
const US = /\b(color|center|favorite|behavior|honor|labor|canceled|canceling|traveled|fulfill|analyze|organize|realize)\b/i;

(async () => {
  const t = create();
  const O = await import("../src/lib/storeOffer.js");
  const P = await import("../src/lib/planFromProfile.js");
  const APP = read("src", "App.jsx");

  // ── 1. The account trial is the only trial ─────────────────────────────────────────────────────
  {
    const boot = APP.slice(APP.indexOf("    applyGrandfatherIfEligible();"), APP.indexOf("    applyGrandfatherIfEligible();") + 1600);
    t.ok(/\n    startTrialIfEligible\(\);\n    expireTrialIfNeeded\(\);\n/.test(boot) && !/storeBillingBuild\(\)/.test(boot) && !/setPlan\("free"\)/.test(boot),
      "1a every build runs the boot-time trial lifecycle, a selling store build included: nothing drops a trial on install or update");
    const fresh = { plan: "trial", trial_started_at: new Date(NOW - DAY).toISOString(), trial_ends_at: new Date(NOW + 13 * DAY).toISOString() };
    t.eq([R.deriveEntitlement(fresh, null, NOW).plan, R.deriveEntitlement(fresh, null, NOW, { native: true, storeBilling: true }).plan], ["trial", "trial"],
      "1b the server: an account signed up yesterday has its 14-day trial, from any app");
    t.eq(P.storePlan("trial", { paid: false }), "trial", "1c the app agrees: the profile's account trial counts in a selling build");
    const over = { plan: "trial", trial_started_at: new Date(NOW - 15 * DAY).toISOString() };
    t.eq([R.deriveEntitlement(over, null, NOW).plan, R.deriveEntitlement(over, null, NOW, { native: true, storeBilling: true }).plan], ["free", "free"],
      "1d after 14 days, the free plan, everywhere");
  }

  // ── 2. One answer ────────────────────────────────────────────────────────────────────────────
  {
    const p = { plan: "trial", trial_started_at: new Date(NOW - 3 * DAY).toISOString() };
    for (const plan of ["free", "trial", "premium", "beta_founder"]) for (const paid of [false, true]) for (const provider of ["app_store", "play_store", "stripe"]) {
      const row = plan === "premium" ? { plan: "plus" } : plan === "beta_founder" ? { founder_flag: true } : plan === "trial" ? p : { plan: "free" };
      const server = R.deriveEntitlement(row, paid ? { provider, status: "active", current_period_end: new Date(NOW + 9 * DAY).toISOString() } : null, NOW, { native: true, storeBilling: true }).plan;
      t.eq(P.storePlan(plan, { paid }), server, `2a the app's storePlan and the server agree (${plan}, ${paid ? `paid via ${provider}` : "unpaid"})`);
    }
  }

  // ── 3. A store purchase pays at once ─────────────────────────────────────────────────────────
  {
    const sub = (period, expires) => ({ entitlements: { plus: { product_identifier: "app.flourishmoney.plus.monthly", expires_date: expires } },
      subscriptions: { "app.flourishmoney.plus.monthly": { store: "app_store", period_type: period, expires_date: expires, ownership_type: "PURCHASED" } } });
    const before = S.storeRowFromSubscriber({ entitlements: {}, subscriptions: {} }, NOW);
    t.eq([before.row, P.storePlan("free", { paid: false })], [null, "free"], "3a before the household buys anything: no row, the free plan (not a wall)");
    const bought = S.storeRowFromSubscriber(sub("normal", new Date(NOW + 30 * DAY).toISOString()), NOW).row;
    t.eq([bought.status, R.isPaidSubscription(bought, NOW), P.storePlan("free", { paid: R.isPaidSubscription(bought, NOW) })], ["active", true, "premium"],
      "3b the store confirms the purchase: the row is 'active', paid from the first day, and the whole app opens");
    const ended = S.storeRowFromSubscriber(sub("normal", new Date(NOW - DAY).toISOString()), NOW).row;
    t.eq([ended.status, P.storePlan("free", { paid: R.isPaidSubscription(ended, NOW) })], ["canceled", "free"], "3c it ends unrenewed: the free plan, with the household's data as it was");
  }

  // ── 4. The words for each plan ───────────────────────────────────────────────────────────────
  {
    const m = O.offerCopy({ plan: "monthly", priceString: "$11.99", platform: "ios" });
    t.eq([m.name, m.price, m.button, m.note], ["Monthly", "$11.99 a month", "Subscribe for $11.99 a month", null], "4a monthly: the store's price, as the store will charge it");
    const f = O.offerCopy({ plan: "founding_annual", priceString: "$79.99", platform: "android" });
    t.eq([f.name, f.price, f.note], ["Founding annual", "$79.99 a year", O.FOUNDING_LINE], "4b founding annual: its price and the approved founding line");
    t.eq([O.offerCopy({ plan: "annual", priceString: " CA$99.99 ", platform: "android" }).price, O.offerCopy({ plan: "weekly", priceString: "$1" }), O.offerCopy({ plan: "monthly", priceString: "" }), O.offerCopy({ plan: "monthly", priceString: 11.99 })],
      ["CA$99.99 a year", null, null, null], "4c prices are the store's own strings, word for word; no plan we don't sell, and no price we don't have");
    t.ok(!("introEligible" in O) && !/introPrice|freePhase|eligib|checkTrialOrIntroductoryPriceEligibility/.test(read("src", "lib", "storeOffer.js")), "4d nothing asks the store about a trial or an introductory price");
    t.eq(O.APPLE_EULA_URL, "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/", "4e Apple's standard EULA, at Apple's own address");
  }

  // ── 5. The words ─────────────────────────────────────────────────────────────────────────────
  {
    const all = [];
    for (const plan of ["monthly", "annual", "founding_annual"]) for (const platform of ["ios", "android"]) {
      const c = O.offerCopy({ plan, priceString: "$11.99", platform });
      all.push(c.name, c.price, c.button, ...(c.note ? [c.note] : []), O.storeDisclosure(platform));
    }
    all.push(...Object.values(O.PAYWALL_COPY).filter((v) => typeof v === "string"), ...Object.values(O.PAYWALL_COPY.outcomes).filter(Boolean));
    const texts = [...new Set(all)];
    t.ok(texts.length >= 20, `5a (the scan sees the offer's words: ${texts.length} strings)`);
    t.eq(texts.filter((x) => BANNED.test(x)), [], "5b no em or en dash, none of the banned words, no GST/HST credit, no competitor");
    t.eq(texts.filter((x) => SAVING.test(x)), [], "5c no saving claimed between plans, nothing called the best, no discount");
    t.eq(texts.flatMap((x) => adviceProblems(x).map((w) => `${w}: ${x}`)), [], "5d no money instruction, no verdict");
    t.eq(texts.filter((x) => US.test(x)), [], "5e Canadian spelling (cancelled, not canceled; licence, the noun)");
    t.eq(texts.filter((x) => /\bfree\b(?! plan)|\btrial\b|\bintro|first month/i.test(x)), [], "5f no store trial, no free month, no introductory price anywhere on the paywall");
    t.eq(texts.filter((x) => /website|flourishmoney\.app(?!\b)|https?:|checkout|stripe|\$\s?(79|99|11)\.\d\d(?! a)/i.test(x.replace("hello@flourishmoney.app", ""))), [], "5g no website price, no checkout, no link to pay outside the app");
    const F = await import("../src/lib/freePlan.js");
    const T7 = F.STORE_TERMS_SECTION_7_IAP;
    t.eq([BANNED.test(T7), SAVING.test(T7), US.test(T7), adviceProblems(T7), /\$\s?\d|website|https?:|checkout/i.test(T7), /nothing to buy/i.test(T7)], [false, false, false, [], false, false],
      "5j Terms section 7 in a selling build: no banned word, saving, US spelling, money instruction, price or website, and never \"nothing to buy\"");
    t.ok(T7.includes(F.STORE_TERMS_SECTION_7.slice(F.STORE_TERMS_SECTION_7.indexOf("the free plan has usage limits"))),
      "5k …and its free-plan limits are the 1.0 line's, read from the same figures (iapApprovedCopy.test pins it word for word)");
    const ios = O.storeDisclosure("ios"), and = O.storeDisclosure("android");
    t.ok(/charged to your Apple Account when you confirm/.test(ios) && /at least 24 hours before the current period ends/.test(ios) && /renews automatically/.test(ios) && /manage or cancel it in your Apple Account settings/.test(ios),
      "5h the App Store disclosure: who is charged, when, that it renews, the 24-hour rule, and where to cancel");
    t.ok(/charged through Google Play/.test(and) && /cancel before the renewal date/.test(and) && /Google Play under Subscriptions/.test(and), "5i …and Google Play's");
  }

  // ── 6. The screen ────────────────────────────────────────────────────────────────────────────
  {
    // Two since 2026-10-23: the on-request overlay (item 3) and the no-plan paywall, which has no Close.
    t.eq((APP.match(/<StorePaywall /g) || []).length, 2, "6a two render sites for the store paywall: item 3's overlay and the no-plan paywall");
    const comp = APP.slice(APP.indexOf("function StorePaywall("), APP.indexOf("function NoPlanScreen("));
    for (const [what, rx] of [["restore", /onClick=\{doRestore\}/], ["terms", /onViewLegal\("terms"\)/], ["privacy", /onViewLegal\("privacy"\)/], ["a close button", /onClose&&<div[^\n]*aria-label="Close" onClick=\{onClose\}/]]) {
      t.ok(rx.test(comp), `6b the paywall always offers ${what}`);
    }
    t.ok(/\{platform==="ios"\s*\? <a href=\{APPLE_EULA_URL\} target="_blank" rel="noopener noreferrer"[^>]*>\{PAYWALL_COPY\.terms\}<\/a>\s*: <button onClick=\{\(\)=>onViewLegal\("terms"\)\} style=\{link\}>\{PAYWALL_COPY\.terms\}<\/button>\}/.test(comp)
      && /\{!held && cards\.length>0 && <div[^>]*>\{storeDisclosure\(platform\)\}<\/div>\}/.test(comp),
      "6c on iOS \"Terms of Use\" opens Apple's standard EULA, on Android the app's Terms; the disclosure sits under the plans once");
    t.ok(!/onSignOut|onDeleteAccount|<ModalHost\/>/.test(comp), "6d no sign out or delete of its own (it can always be closed; Settings has both) and no ModalHost of its own");
    t.ok(/offerCopy\(\{ plan, priceString: p\.product\.priceString, platform \}\)/.test(comp), "6e every card's words come from the store's price");
    t.ok(/storeBuy\(deps, pkg\)/.test(comp) && /serverStatus: \(\)=>askStore\("store_status"\)/.test(comp) && /serverSync: \(\)=>askStore\("store_sync"\)/.test(comp), "6f a purchase goes through lib/storeBilling.js buy: the server is asked first and last");
    let A = null;
    try { A = loadApp(["StorePaywall"]); } catch (e) { t.ok(false, `App.jsx bundles: ${describe(e)}`); }
    if (A) {
      const props = (platform) => ({ purchases: null, platform, status: null, askStore: async () => null, onResolved() {}, onViewLegal() {}, onManage() {}, onClose() {} });
      const ios = textOf(A.render(A.h(A.StorePaywall, props("ios"))));
      const and = textOf(A.render(A.h(A.StorePaywall, props("android"))));
      const order = (html) => ["Terms of Use", "Privacy Policy", "Restore purchases"].map((x) => html.indexOf(x));
      t.ok([O.PAYWALL_COPY.title, O.PAYWALL_COPY.lead, O.PAYWALL_COPY.dataSafe].every((x) => ios.includes(x)) && order(ios).every((i, k, a) => i >= 0 && (k === 0 || i > a[k - 1])),
        "6g it renders on iOS: the title, what Plus adds, that the household's data is safe, then Terms of Use, Privacy Policy, Restore purchases in that order");
      t.ok(order(and).every((i, k, a) => i >= 0 && (k === 0 || i > a[k - 1])) && !/EULA|licence agreement/i.test(ios + and), "6h …and on Android; no other link line");
      t.ok(!/\$\d/.test(ios) && !/\bfree\b(?! plan)|trial/i.test(ios), "6i before the store answers it states no price, and never a trial");
    }
  }

  t.summary("storeOffer.test");
})();
