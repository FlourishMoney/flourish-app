// tests/trialGoLiveSameMoment.test.cjs
// -----------------------------------------------------------------------------
// TRIAL_PLAN_FIRST, GO-LIVE ITEM 4 (2026-11-13): Terms section 7 follows the switch (#133), in the same moment the
// plans screen does, on the website, iPhone and Android, the founding plan included.
//   1  the switch off: the live wording, word for word, unchanged (the Terms' section 7 on the website and in a store
//      app that sells; the website's plans screen; the store plans' cards);
//   2  the same moment: the Terms ask GET /api/trial-plan-first and the plans screen takes the billing status call's
//      trial_plan_first. Both come from the one rule (_lib/planRules.js trialPlanFirstSince), and across every way the
//      two settings can be set there is no state where one has changed and the other has not;
//   3  the switch on, from the server's real answers: section 7 is the approved text on all three, and every plan,
//      founding included, states the 14 days, the first charge and how to cancel, as section 7 describes them.
// The real trial-plan-first.js and billing.js against stand-ins; the real screens rendered from src/App.jsx.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");
const { loadApp, textOf, describe, REPO } = require("./_renderApp.cjs");
const { fakeAdmin, loadWith } = require("./_trialFakes.cjs");

const APP = fs.readFileSync(path.join(REPO, "src", "App.jsx"), "utf8");
const BILLING = require.resolve("../netlify/functions/billing.js");
const FLAG_FN = require.resolve("../netlify/functions/trial-plan-first.js");
const SINCE = "2026-11-20T15:00:00Z";
// The switch's day as the Terms state it: in the reader's own time zone (November 20 in Canada; the 21st from UTC+9 on).
const SINCE_DAY = new Date(SINCE).toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric" });
const U = "00000000-0000-4000-8000-000000000041";
const ORIGIN = { web: "https://flourishmoney.app", ios: "capacitor://localhost", android: "https://localhost" };
const ENV_KEYS = ["TRIAL_PLAN_FIRST", "TRIAL_PLAN_FIRST_SINCE", "BILLING_ENABLED", "IAP_ENABLED"];
function setEnv(o) { for (const k of ENV_KEYS) delete process.env[k]; Object.assign(process.env, { BILLING_ENABLED: "true", IAP_ENABLED: "true", ...o }); }

// ── The live wording, switch off (2026-11-13, main bb10c3d), word for word ──────────────────────────
const FOUNDING = "The founding price is for the first 50 households who subscribe to Founding annual. It is not reserved for anyone, it stays the same while that subscription stays active, and it does not come back once that subscription ends.";
const LIVE_WEB_7 = "7. Subscription & Billing Free Tier: Core features are available at no charge with a 14-day trial of premium features. Flourish Plus: Premium features require a paid subscription. Subscription fees are billed in advance on a monthly or annual basis. Prices are in Canadian dollars (CAD) and do not include sales tax. Applicable GST/HST and provincial sales taxes are calculated from your billing address and added at checkout. You may cancel at any time; cancellations take effect at the end of the current billing period. No refunds are provided for partial billing periods unless required by applicable law.";
const LIVE_STORE_7 = "7. Cost and usage limits A new account has every feature for its first 14 days, at no charge. After that, the free plan has usage limits: 2 coach messages a week, 1 What-If a day and 1 connected bank, and it does not include Credit or the coach-run meeting. Each limit is shown where it applies. Flourish Plus lifts these limits. In the iOS and Android apps it is sold as an auto-renewing subscription through the App Store or Google Play, at the price shown in the app before you buy. Payment is charged to your Apple or Google account when you confirm. The subscription renews automatically at the end of each period unless you cancel it in your App Store or Google Play account settings before it renews (for Apple, at least 24 hours before the period ends). Cancelling takes effect at the end of the current period. Refunds for purchases made in the apps are handled by Apple or Google under their own policies. " + FOUNDING;
const LIVE_WEB_PLANS = "Flourish Plus Close All of flourish, in one subscription The coach, with no weekly limit What-If as often as you like More than one bank, all in one place All of flourish, in one subscription Founding Annual $79.99 a year Founding price for the first 50 households who subscribe. Locked in while you stay subscribed. Monthly $11.99 a month CAD plus tax Annual $99.99 a year CAD plus tax Review my plan Payment is handled by Stripe. Your plan changes once Stripe confirms the payment.";
// Section 7 while the switch is on, as approved 2026-11-11 (tests/trialGoLiveWords.test.cjs pins it too).
const ON_7 = [
  `flourish is sold as a subscription: flourish monthly, flourish annual and, while offered, flourish founding annual. ${FOUNDING} A new account chooses a plan to keep using flourish. A partner who joins a household can use the same subscription. Prices are in Canadian dollars, plus sales tax on the website.`,
  "Eligible new subscribers get 14 days free. Apple, Google or Stripe decides who is eligible, and the website needs a card to start. The plans screen shows whether the 14 days apply and the first-charge date. Unless you cancel before the first charge, you will be charged automatically. Apple may charge up to 24 hours before the trial ends. Your plan then renews automatically each billing period until you cancel.",
  "To cancel on iPhone: Settings, your name, then Subscriptions, at least 24 hours before the trial or period ends. On Android: Google Play, your profile, Payments & subscriptions, then Subscriptions. On the website: Settings, then Manage subscription. Cancel before the first charge and you pay nothing; after that, cancelling takes effect at the period's end.",
  `An account opened before ${SINCE_DAY} keeps its 14-day account trial to its end, then moves to the free plan: 2 coach messages a week, 1 What-If a day, 1 connected bank, and no Credit or coach-run meeting.`,
  "Apple or Google handle refunds for in-app purchases under their own policies. On the website, partial periods are not refunded unless the law requires it.",
].join(" ");

const PLANS = [["monthly", "$11.99", "a month"], ["annual", "$99.99", "a year"], ["founding_annual", "$79.99", "a year"]];
const IOS_ID = { monthly: "app.flourishmoney.plus.monthly", annual: "app.flourishmoney.plus.annual", founding_annual: "app.flourishmoney.founding.annual" };
const AND_ID = { monthly: "flourish_plus:monthly", annual: "flourish_plus:annual", founding_annual: "flourish_plus:founding" };
// Each store's product with its 14-day offer live, as RevenueCat hands it to the app.
const storeProduct = (platform, plan, price) => (platform === "ios"
  ? { identifier: IOS_ID[plan], priceString: price, introPrice: { price: 0, periodUnit: "WEEK", periodNumberOfUnits: 2, cycles: 1 } }
  : { identifier: AND_ID[plan], priceString: price, subscriptionOptions: [{ id: "base", isBasePlan: true, freePhase: null }],
      defaultOption: { id: "base:free-14", isBasePlan: false, freePhase: { billingPeriod: { iso8601: "P2W" }, billingCycleCount: 1 } } });

(async () => {
  const t = create();
  const saved = { ...process.env };
  const lib = await import(path.join(REPO, "src", "lib", "trialPlanFirst.js"));
  const W = await import(path.join(REPO, "src", "lib", "trialWords.js"));
  const offer = await import(path.join(REPO, "src", "lib", "storeOffer.js"));

  let A = {}, S = {};
  try { A = loadApp(["TermsOfService", "UpgradeScreen"]); } catch (e) { t.ok(false, `App.jsx bundles: ${describe(e)}`); }
  try { S = loadApp(["TermsOfService"], { env: { VITE_IAP_ENABLED: "true" } }); } catch (e) { t.ok(false, `App.jsx bundles (a store build that sells): ${describe(e)}`); }
  const real = globalThis.Capacitor;
  const as = (p, fn) => {
    Object.defineProperty(globalThis, "Capacitor", { value: p === "web" ? undefined : { getPlatform: () => p, isNativePlatform: () => true }, configurable: true, writable: true });
    try { return fn(); } finally { Object.defineProperty(globalThis, "Capacitor", { value: real, configurable: true, writable: true }); }
  };
  const termsText = (p, since) => as(p, () => textOf((p === "web" ? A : S).render((p === "web" ? A : S).h((p === "web" ? A : S).TermsOfService, { onBack: () => {}, ...(since ? { tpfSince: since } : {}) }))));
  const section7 = (text) => text.slice(text.search(/7\. (Subscription & Billing|Cost and usage limits|Plans and billing)/), text.indexOf("8. Intellectual Property")).trim();
  const plansText = (props) => as("web", () => textOf(A.render(A.h(A.UpgradeScreen, { onClose: () => {}, mode: "upgrade", ...props }))));
  const webStatus = (extra = {}) => ({ enabled: true, provider: null, paid: false, period_end: null, manageable: false, web_attention: false, founding: { available: true, cohortLimit: 50, confirmEmail: false }, ...extra });
  // The store plans' card, exactly as StorePaywall builds it (the line is pinned below, 1f).
  const storeCard = (platform, plan, price, trialFirst, now = Date.now()) => {
    const copy = offer.offerCopy({ plan, priceString: price, platform });
    const product = storeProduct(platform, plan, price);
    const eligibility = platform === "ios" ? { [product.identifier]: { status: 2 } } : {};
    const trial = (trialFirst && copy) ? lib.trialDisclosure({ platform, eligible: lib.storeTrialEligible({ platform, product, eligibility }), price: copy.price, planKey: plan, now, words: W.trialWords }) : null;
    return { copy, trial, button: trial && trial.claim ? W.trialWords("trialfirst-button") : copy.button };
  };

  // The server's real answers, for one setting of the environment: what the Terms hear and what each plans screen hears.
  const profile = () => ({ user_id: U, plan: "trial", founder_flag: false, trial_started_at: "2026-11-21T10:00:00Z" });
  async function answers(env) {
    setEnv(env);
    const flag = loadWith(FLAG_FN, {});
    const fetchFor = (origin) => async () => { const r = await flag.handler({ httpMethod: "GET", headers: { origin } }); return { status: r.statusCode, ok: r.statusCode === 200, json: async () => JSON.parse(r.body) }; };
    const out = {};
    for (const p of ["web", "ios", "android"]) {
      const terms = await lib.askTrialPlanFirst(fetchFor(ORIGIN[p]));
      const admin = fakeAdmin({ profiles: [profile()], subscriptions: [] });
      const res = await loadWith(BILLING, { admin, userId: U }).handler({ httpMethod: "POST", headers: { origin: ORIGIN[p] }, body: JSON.stringify({ action: p === "web" ? "status" : "store_status" }) });
      out[p] = { terms, status: res.statusCode, trialFirst: lib.trialPlanFirstOf(JSON.parse(res.body)) };
    }
    return out;
  }

  try {
    // ════ 1. THE SWITCH OFF: THE LIVE WORDING, UNCHANGED ══════════════════════════════════════════════
    const off = await answers({});
    for (const p of ["web", "ios", "android"]) {
      t.eq([off[p].terms, off[p].status, off[p].trialFirst], [false, 200, null], `1a off (${p}): the Terms hear "off", and the plans screen hears nothing about a trial`);
    }
    const webOffTerms = termsText("web", null);
    t.eq(section7(webOffTerms), LIVE_WEB_7, "1b off, the website: section 7 is the live text, word for word");
    t.ok(webOffTerms.includes("Last updated October 14, 2026"), "1c …with its live date");
    for (const p of ["ios", "android"]) {
      const text = termsText(p, null);
      t.eq(section7(text), LIVE_STORE_7, `1d off, the ${p === "ios" ? "iPhone" : "Android"} app: section 7 is the live text, word for word, the founding sentence included`);
    }
    t.eq(plansText({ status: webStatus(), trialFirst: off.web.trialFirst }), LIVE_WEB_PLANS, "1e off, the website's plans screen: the live words, all three plans, no trial line");
    t.ok(APP.includes("const trial = (trialFirst && copy) ? trialDisclosure({ platform, eligible: storeTrialEligible({ platform, product: p.product, eligibility: introElig }), price: copy.price, planKey: plan, words: trialWords }) : null;")
      && APP.includes("<TrialTerms disclosure={trial}/>") && APP.includes('{busy===plan?PAYWALL_COPY.checking:(trial?.claim ? trialWords("trialfirst-button") : copy.button)}'),
      "1f the store plans' card is built from the switch, the store's product and its own answer (the line this suite follows)");
    for (const p of ["ios", "android"]) for (const [plan, price, per] of PLANS) {
      const c = storeCard(p, plan, price, off[p].trialFirst);
      t.eq([c.trial, c.button], [null, `Subscribe for ${price} ${per}`], `1g off, ${p}, ${plan}: today's card, no trial line, today's button`);
    }

    // ════ 2. THE SAME MOMENT ══════════════════════════════════════════════════════════════════════════
    // Every way the two settings can be left. Whatever they are, the Terms and the plans screen agree, on all three.
    const SETTINGS = [
      ["both unset", {}, false],
      ["the switch alone", { TRIAL_PLAN_FIRST: "true" }, false],
      ["the time alone", { TRIAL_PLAN_FIRST_SINCE: SINCE }, false],
      ["the switch \"false\" with a time", { TRIAL_PLAN_FIRST: "false", TRIAL_PLAN_FIRST_SINCE: SINCE }, false],
      ["the switch \"TRUE\" with a time", { TRIAL_PLAN_FIRST: "TRUE", TRIAL_PLAN_FIRST_SINCE: SINCE }, false],
      ["the switch with a date and no time", { TRIAL_PLAN_FIRST: "true", TRIAL_PLAN_FIRST_SINCE: "2026-11-20" }, false],
      ["the switch with a time and no zone", { TRIAL_PLAN_FIRST: "true", TRIAL_PLAN_FIRST_SINCE: "2026-11-20T15:00:00" }, false],
      ["the switch with a full time", { TRIAL_PLAN_FIRST: "true", TRIAL_PLAN_FIRST_SINCE: SINCE }, true],
      ["the switch with a full time and an offset", { TRIAL_PLAN_FIRST: "true", TRIAL_PLAN_FIRST_SINCE: "2026-11-20T10:00:00-05:00" }, true],
    ];
    for (const [name, env, want] of SETTINGS) {
      const a = await answers(env);
      const seen = ["web", "ios", "android"].map((p) => [!!(a[p].terms && a[p].terms.since), !!a[p].trialFirst]);
      t.eq(seen, [[want, want], [want, want], [want, want]], `2a ${name}: the Terms and the plans screen are both ${want ? "on" : "off"}, on the website, iPhone and Android`);
    }
    {
      const rules = fs.readFileSync(path.join(REPO, "netlify", "functions", "_lib", "planRules.js"), "utf8");
      const flagFn = fs.readFileSync(path.join(REPO, "netlify", "functions", "trial-plan-first.js"), "utf8");
      const state = fs.readFileSync(path.join(REPO, "netlify", "functions", "_lib", "trialPlanFirst.js"), "utf8");
      t.ok(/function trialPlanFirstSince\(env = process\.env\)/.test(rules) && flagFn.includes("const since = trialPlanFirstSince();") && state.includes("const since = trialPlanFirstSince();"),
        "2b one rule, read on each call: what the Terms hear and what the plans screen hears cannot be set apart");
      const T = APP.slice(APP.indexOf("function TermsOfService("), APP.indexOf("<div style={h2}>8. Intellectual Property</div>"));
      t.ok(T.includes("askTrialPlanFirst(fetch, API_BASE)") && T.includes("const tpfTerms = (!isNativeApp() || storeBillingBuild()) ? trialFirstTermsSection7(tpfSince) : null;"),
        "2c the Terms ask the server each time they open, on the website and in a store app that sells");
    }

    // ════ 3. THE SWITCH ON, FROM THE SERVER'S REAL ANSWERS ════════════════════════════════════════════
    const on = await answers({ TRIAL_PLAN_FIRST: "true", TRIAL_PLAN_FIRST_SINCE: SINCE });
    for (const p of ["web", "ios", "android"]) {
      const text = termsText(p, on[p].terms && on[p].terms.since);
      t.eq(section7(text), `7. Plans and billing ${ON_7}`, `3a on (${p}): section 7 is the approved text, the founding plan and its sentence included`);
      t.ok(text.includes(`Last updated ${SINCE_DAY}`) && !text.includes("Flourish Plus") && !text.includes("Payment is charged to your Apple or Google account when you confirm"),
        `3b …dated the day the switch went on, with nothing left of the old section (${p})`);
    }
    {
      // The screen reads the clock itself: rendered again if the day turned over while it was being drawn.
      let text, at;
      for (let i = 0; i < 3; i++) {
        at = lib.trialDates("web");
        text = plansText({ status: webStatus(), trialFirst: on.web.trialFirst, required: true, onSignOut: () => {} });
        if (lib.chargeDateLabel(lib.trialDates("web").charge) === lib.chargeDateLabel(at.charge)) break;
      }
      // Stripe's 14 days from now: the first charge 14 days on, the last day to cancel 13 days on (not the screen's own sum).
      const days = (n) => new Date(Date.now() + n * 86400000).toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric" });
      t.eq([lib.chargeDateLabel(at.charge), lib.chargeDateLabel(at.cancelBy)], [days(14), days(13)], "3c0 the website's dates: the first charge 14 days from today, the last day to cancel the day before");
      const lines = (price, per) => `14 days free Then ${price} ${per}, renewing until you cancel. First charge: ${lib.chargeDateLabel(at.charge)} Cancel before ${lib.chargeDateLabel(at.cancelBy)} to avoid the first charge. To cancel: in flourish, go to Settings, then Manage subscription.`;
      t.ok(text.includes(`Founding Annual $79.99 a year Founding price for the first 50 households who subscribe. Locked in while you stay subscribed. ${lines("$79.99", "a year")}`)
        && text.includes(`Monthly $11.99 a month CAD plus tax ${lines("$11.99", "a month")}`) && text.includes(`Annual $99.99 a year CAD plus tax ${lines("$99.99", "a year")}`),
        "3c on, the website's plans screen: every plan, founding included, states the 14 days, the first charge and how to cancel");
      t.ok(text.includes("Choose your plan Pick a plan to keep using flourish. If you qualify for 14 days free, you'll be charged automatically on the first-charge date shown unless you cancel."),
        "3d …under \"Choose your plan\", as section 7 says (\"A new account chooses a plan to keep using flourish\")");
    }
    // A fixed moment, midday in Canada: 14 days on is December 5, so the iPhone states December 4 and Android December 5.
    const CLOCK = Date.parse("2026-11-21T18:00:00Z");
    const dayOf = (isoTime) => new Date(isoTime).toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric" });
    for (const p of ["ios", "android"]) for (const [plan, price, per] of PLANS) {
      const c = storeCard(p, plan, price, on[p].trialFirst, CLOCK);
      const charge = dayOf(p === "ios" ? "2026-12-04T18:00:00Z" : "2026-12-05T18:00:00Z"), cancelBy = dayOf("2026-12-04T18:00:00Z");
      t.eq([c.trial && c.trial.claim, c.button, c.trial && c.trial.lines.slice(0, 4)],
        [true, "Start free trial", ["14 days free", `Then ${price} ${per}, renewing until you cancel.`, `First charge: ${charge}`, `Cancel before ${cancelBy} to avoid the first charge.`]],
        `3e on, ${p}, ${plan}: the card states the 14 days, the price after, the first charge and the last day to cancel`);
    }
    {
      // What section 7 says of each store is what that store's card does.
      const ios = lib.trialDates("ios", Date.parse("2026-11-21T18:00:00Z")), and = lib.trialDates("android", Date.parse("2026-11-21T18:00:00Z")), web = lib.trialDates("web", Date.parse("2026-11-21T18:00:00Z"));
      t.ok(ON_7.includes("Apple may charge up to 24 hours before the trial ends.") && ios.charge.getTime() === Date.parse("2026-12-04T18:00:00Z") && and.charge.getTime() === Date.parse("2026-12-05T18:00:00Z") && web.charge.getTime() === and.charge.getTime(),
        "3f \"Apple may charge up to 24 hours before the trial ends\": the iPhone's first-charge date is the day before; Android's and the website's is the end itself");
      t.ok(ON_7.includes("at least 24 hours before the trial or period ends") && [ios, and, web].every((d) => d.cancelBy.getTime() === Date.parse("2026-12-04T18:00:00Z")),
        "3g \"at least 24 hours before\": every card's last day to cancel is the day before the trial ends");
      const cancel = (p) => W.trialWords(`trialfirst-cancel-${p}`);
      t.ok(ON_7.includes("To cancel on iPhone: Settings, your name, then Subscriptions") && cancel("ios") === "To cancel: open Settings, tap your name, then Subscriptions."
        && ON_7.includes("On Android: Google Play, your profile, Payments & subscriptions, then Subscriptions.") && cancel("android") === "To cancel: open Google Play, tap your profile, then Payments & subscriptions, then Subscriptions."
        && ON_7.includes("On the website: Settings, then Manage subscription.") && cancel("web") === "To cancel: in flourish, go to Settings, then Manage subscription.",
        "3h how to cancel is the same in section 7 and on each platform's card");
    }
  } finally {
    for (const k of ENV_KEYS) { if (k in saved) process.env[k] = saved[k]; else delete process.env[k]; }
  }

  t.summary("trialGoLiveSameMoment.test");
  setImmediate(() => process.exit(process.exitCode || 0));
})();
