// tests/storeOffer.test.cjs
// -----------------------------------------------------------------------------
// VERSION 1.1, ITEM 2: THE OFFER, EXACTLY AS DECIDED AND NO WIDER.
//
// One free month as the store's own introductory offer, then a hard paywall. The trial starts when the
// household confirms the subscription in the store, never on install and never on update.
//   1. Never on install: a store build that sells starts no trial of its own, and a fresh account there is
//      not entitled, on the app's side and the server's.
//   2. Never on update: a 1.0 trial cached on the phone, or the profile's 14-day signup trial, does not
//      carry into a selling build; the web keeps its trial exactly as it is.
//   3. Only on confirmation: the store's free month reaches the server as 'trialing' and opens the app;
//      when it ends unpaid, the paywall is back, with no free tier.
//   4. The free month is claimed only when the store says this account may have it.
//   5. The words: the store's own prices, no saving or "best" claim, no money instruction, no dash, no banned
//      word, Canadian spelling, and the renewal terms the stores require.
//   6. The screen: one render site, only in a selling build; restore, terms, privacy, sign out and delete.
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

  // ── 1. Never on install ──────────────────────────────────────────────────────────────────────
  {
    const boot = APP.slice(APP.indexOf("    applyGrandfatherIfEligible();"), APP.indexOf("    applyGrandfatherIfEligible();") + 2200);
    t.ok(/if\(!storeBillingBuild\(\)\)\{\s*startTrialIfEligible\(\);\s*expireTrialIfNeeded\(\);\s*\}/.test(boot), "1a a store build that sells never runs the boot-time trial start (every other build runs it, as before)");
    const fresh = { plan: "trial", trial_started_at: new Date(NOW - DAY).toISOString(), trial_ends_at: new Date(NOW + 13 * DAY).toISOString() };
    t.eq(R.deriveEntitlement(fresh, null, NOW, { native: true, storeBilling: true }), { plan: "free", unlimited: false, paidSubscription: false },
      "1b the server: an account signed up yesterday, in a selling store build, has no trial until it confirms one in the store");
    t.eq(P.storePlan("trial", { paid: false }), "free", "1c the app agrees: the profile's signup trial is not a trial in a selling build");
  }

  // ── 2. Never on update ───────────────────────────────────────────────────────────────────────
  {
    const boot = APP.slice(APP.indexOf("    applyGrandfatherIfEligible();"), APP.indexOf("    applyGrandfatherIfEligible();") + 2200);
    t.ok(/\} else if\(getPlan\(\)==="trial"\)\{\s*setPlan\("free"\);/.test(boot), "2a a trial cached on the phone by 1.0 is set to free on the first launch of a selling build: nothing carries over");
    t.ok(!/flourish_trial_started_at|flourish_trial_ends_at/.test(boot.slice(boot.indexOf("} else if(getPlan()===\"trial\")"), boot.indexOf("} else if(getPlan()===\"trial\")") + 200)),
      "2b …and no trial date is written or moved");
    const p = { plan: "trial", trial_started_at: new Date(NOW - 3 * DAY).toISOString() };
    t.eq([R.deriveEntitlement(p, null, NOW, {}).plan, R.deriveEntitlement(p, null, NOW, { native: true }).plan, R.deriveEntitlement(p, null, NOW, { native: true, storeBilling: true }).plan], ["trial", "trial", "free"],
      "2c the web's 14-day trial is unchanged, a 1.0.x store build keeps it, and only a selling build drops it");
    for (const plan of ["free", "trial", "premium", "beta_founder"]) for (const paid of [false, true]) {
      const row = plan === "premium" ? { plan: "plus" } : plan === "beta_founder" ? { founder_flag: true } : plan === "trial" ? p : { plan: "free" };
      const server = R.deriveEntitlement(row, paid ? { provider: "app_store", status: "active", current_period_end: new Date(NOW + 9 * DAY).toISOString() } : null, NOW, { native: true, storeBilling: true }).plan;
      t.eq(P.storePlan(plan, { paid }), server, `2d the app's storePlan and the server agree (${plan}, ${paid ? "paid" : "unpaid"})`);
    }
  }

  // ── 3. Only on confirmation ──────────────────────────────────────────────────────────────────
  {
    const sub = (period, expires) => ({ entitlements: { plus: { product_identifier: "app.flourishmoney.plus.monthly", expires_date: expires } },
      subscriptions: { "app.flourishmoney.plus.monthly": { store: "app_store", period_type: period, expires_date: expires, ownership_type: "PURCHASED" } } });
    const before = S.storeRowFromSubscriber({ entitlements: {}, subscriptions: {} }, NOW);
    t.eq([before.row, P.storePlan("free", { paid: false })], [null, "free"], "3a before the household confirms anything in the store: no row, the paywall");
    const trial = S.storeRowFromSubscriber(sub("trial", new Date(NOW + 30 * DAY).toISOString()), NOW).row;
    t.eq([trial.status, R.isPaidSubscription(trial, NOW), P.storePlan("free", { paid: R.isPaidSubscription(trial, NOW) })], ["trialing", true, "premium"],
      "3b the household confirms the store's free month: the row is 'trialing' and the whole app opens");
    t.eq(R.isPaidSubscription(trial, NOW + 31 * DAY), false, "3c the month is over unpaid (the store did not renew): not paid");
    const ended = S.storeRowFromSubscriber(sub("trial", new Date(NOW - DAY).toISOString()), NOW).row;
    t.eq([ended.status, P.storePlan("free", { paid: R.isPaidSubscription(ended, NOW) })], ["canceled", "free"], "3d …so the paywall is back: a hard paywall, no free tier after the trial");
    const renewed = S.storeRowFromSubscriber(sub("normal", new Date(NOW + 30 * DAY).toISOString()), NOW).row;
    t.eq(renewed.status, "active", "3e the first paid month after the free one: 'active'");
  }

  // ── 4. The free month only when the store says so ────────────────────────────────────────────
  {
    const iosPkg = (intro) => ({ product: { identifier: "app.flourishmoney.plus.monthly", priceString: "$11.99", introPrice: intro } });
    const freeMonth = { price: 0, priceString: "$0.00", cycles: 1, period: "P1M", periodUnit: "MONTH", periodNumberOfUnits: 1 };
    const ok = { "app.flourishmoney.plus.monthly": { status: 2 } };
    t.eq([O.introEligible(iosPkg(freeMonth), "ios", ok), O.introEligible(iosPkg(freeMonth), "ios", { "app.flourishmoney.plus.monthly": { status: 1 } }), O.introEligible(iosPkg(freeMonth), "ios", { "app.flourishmoney.plus.monthly": { status: 0 } }),
      O.introEligible(iosPkg(freeMonth), "ios", {}), O.introEligible(iosPkg(null), "ios", ok), O.introEligible(iosPkg({ ...freeMonth, price: 0.99 }), "ios", ok), O.introEligible(iosPkg({ ...freeMonth, periodUnit: "WEEK" }), "ios", ok)],
      [true, false, false, false, false, false, false], "4a iOS: a free one-month intro offer AND the store's \"eligible\"; ineligible, unknown, none, a paid intro or a week: no claim");
    const andPkg = (free) => ({ product: { identifier: "flourish_plus:monthly", priceString: "$11.99", defaultOption: { freePhase: free } } });
    t.eq([O.introEligible(andPkg({ billingPeriod: { iso8601: "P1M" } }), "android"), O.introEligible(andPkg(null), "android"), O.introEligible(andPkg({ billingPeriod: { iso8601: "P7D" } }), "android"), O.introEligible(andPkg({ billingPeriod: { iso8601: "P1M" } }), "web")],
      [true, false, false, false], "4b Google: a one-month free phase on the offer Google returns; none, or another length: no claim; never on the web");
    const yes = O.offerCopy({ plan: "monthly", priceString: "$11.99", eligible: true, platform: "ios" });
    const no = O.offerCopy({ plan: "monthly", priceString: "$11.99", eligible: false, platform: "ios" });
    t.eq([yes.trialLine, yes.button, no.trialLine, no.button], ["The first month is free. Then $11.99 a month.", "Try the first month free", null, "Subscribe for $11.99 a month"],
      "4c the free month is mentioned only when eligible; otherwise the price, as the store will charge it");
    t.eq([O.offerCopy({ plan: "annual", priceString: "$99.99", platform: "android" }).price, O.offerCopy({ plan: "founding_annual", priceString: "$79.99" }).price, O.offerCopy({ plan: "weekly", priceString: "$1" }), O.offerCopy({ plan: "monthly", priceString: "" })],
      ["$99.99 a year", "$79.99 a year", null, null], "4d prices are the store's own strings, word for word; no plan we don't sell, and no price we don't have");
  }

  // ── 5. The words ─────────────────────────────────────────────────────────────────────────────
  {
    const all = [];
    for (const plan of ["monthly", "annual", "founding_annual"]) for (const eligible of [true, false]) for (const platform of ["ios", "android"]) {
      const c = O.offerCopy({ plan, priceString: "$11.99", eligible, platform });
      all.push(c.name, c.price, c.button, ...(c.trialLine ? [c.trialLine] : []), ...c.terms);
    }
    all.push(...Object.values(O.PAYWALL_COPY).filter((v) => typeof v === "string"), ...Object.values(O.PAYWALL_COPY.outcomes).filter(Boolean));
    const texts = [...new Set(all)];
    t.ok(texts.length >= 30, `5a (the scan sees the offer's words: ${texts.length} strings)`);
    t.eq(texts.filter((x) => BANNED.test(x)), [], "5b no em or en dash, none of the banned words, no GST/HST credit, no competitor");
    t.eq(texts.filter((x) => SAVING.test(x)), [], "5c no saving claimed between plans, nothing called the best, no discount");
    t.eq(texts.flatMap((x) => adviceProblems(x).map((w) => `${w}: ${x}`)), [], "5d no money instruction, no verdict");
    t.eq(texts.filter((x) => US.test(x)), [], "5e Canadian spelling (cancelled, not canceled)");
    const ios = O.offerCopy({ plan: "monthly", priceString: "$11.99", eligible: true, platform: "ios" }).terms.join(" ");
    const and = O.offerCopy({ plan: "annual", priceString: "$99.99", eligible: false, platform: "android" }).terms.join(" ");
    t.ok(/Apple Account/.test(ios) && /at least 24 hours before/.test(ios) && /renews at \$11\.99 a month/.test(ios) && /manage or cancel it in your Apple Account settings/.test(ios),
      "5f the App Store terms: who is charged, when, that it renews, the 24-hour rule, and where to cancel");
    t.ok(/Google Play account/.test(and) && /Payments and subscriptions/.test(and) && /renews at \$99\.99 a year/.test(and), "5g …and Google Play's");
    t.ok(/Nothing is charged today\./.test(ios) && !/Nothing is charged today/.test(and), "5h \"nothing is charged today\" only with the free month");
  }

  // ── 6. The screen ────────────────────────────────────────────────────────────────────────────
  {
    t.eq((APP.match(/<StorePaywall /g) || []).length <= 1, true, "6a at most one render site for the store paywall (item 3 places it)");
    const comp = APP.slice(APP.indexOf("function StorePaywall("), APP.indexOf("function Paywall("));
    for (const [what, rx] of [["restore", /onClick=\{doRestore\}/], ["terms", /onViewLegal\("terms"\)/], ["privacy", /onViewLegal\("privacy"\)/], ["sign out", /onClick=\{onSignOut\}/], ["delete", /onClick=\{onDeleteAccount\}/]]) {
      t.ok(rx.test(comp), `6b the paywall always offers ${what}`);
    }
    t.ok(/<ModalHost\/>/.test(comp), "6c it brings the one ModalHost, so the delete confirmation works with no shell behind it");
    t.ok(/offerCopy\(\{ plan, priceString: p\.product\.priceString, eligible: introEligible\(p, platform, elig\), platform \}\)/.test(comp), "6d every card's words come from the store's price and the store's eligibility");
    t.ok(/storeBuy\(deps, pkg\)/.test(comp) && /serverStatus: \(\)=>askStore\("store_status"\)/.test(comp) && /serverSync: \(\)=>askStore\("store_sync"\)/.test(comp), "6e a purchase goes through lib/storeBilling.js buy: the server is asked first and last");
    let A = null;
    try { A = loadApp(["StorePaywall"]); } catch (e) { t.ok(false, `App.jsx bundles: ${describe(e)}`); }
    if (A) {
      const html = textOf(A.render(A.h(A.StorePaywall, { purchases: null, platform: "ios", status: null, askStore: async () => null, onResolved() {}, onViewLegal() {}, onSignOut() {}, onDeleteAccount() {} })));
      t.ok(html.includes(O.PAYWALL_COPY.title) && html.includes(O.PAYWALL_COPY.dataSafe) && html.includes("Restore purchases") && html.includes("Delete my account"),
        "6f it renders: the title, that the household's data is safe, restore and delete");
      t.ok(!/\$\d/.test(html) && !/free/i.test(html), "6g before the store answers it states no price and no free month");
    }
  }

  t.summary("storeOffer.test");
})();
