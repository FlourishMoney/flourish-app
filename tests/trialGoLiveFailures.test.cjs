// tests/trialGoLiveFailures.test.cjs
// -----------------------------------------------------------------------------
// TRIAL_PLAN_FIRST, THE DAY IT GOES LIVE: the four ways it can go wrong, because this is billing (2026-11-13).
// The rule every check here holds to: a household is never charged on a day other than the one its screen stated.
//   1  the switch is ON and a store's 14-day offer does NOT exist yet: no plan claims a trial, each says it is charged
//      today, and that is what the store does;
//   2  a store's offer EXISTS and the switch is OFF: Android buys the plan with no trial, as its screen says. An iPhone
//      cannot decline Apple's offer (KNOWN, and why the offers and the switch go on in one sitting,
//      docs/ops/TRIAL-FIRST-GO-LIVE.md): the row, and the reminder 3 days before the first charge, still follow;
//   3  a billing status read fails at the moment the trial ends: the server never answers "not paid" for a read that
//      failed, the app never puts up the plans it cannot close, and nothing is sold on no answer;
//   4  a trial started on the website, then a store app is opened (and the other way round): nothing more is sold, and
//      the first charge's date on the chip is the one for where the trial was BOUGHT, on whatever device it is read.
// The real billing.js, storeSubscriptions.js and trial-reminder-sweep.js against stand-ins (tests/_trialFakes.cjs); the
// app's own decisions from src/lib. Synthetic data only.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");
const { fakeAdmin, fakeStripe, loadWith } = require("./_trialFakes.cjs");

const REPO = path.join(__dirname, "..");
const APP = fs.readFileSync(path.join(REPO, "src", "App.jsx"), "utf8");
const BILLING = require.resolve("../netlify/functions/billing.js");
const SWEEP = require.resolve("../netlify/functions/trial-reminder-sweep.js");
const WEB = { origin: "https://flourishmoney.app" };
const NATIVE = { origin: "capacitor://localhost" };
const post = (body, headers = WEB) => ({ httpMethod: "POST", headers, body: JSON.stringify(body) });
const DAY = 86400000;
const iso = (ms) => new Date(ms).toISOString();
const REAL_NOW = Date.now();
// The switch went on 20 days ago; this account was opened after it, so it has no account trial.
const SINCE = iso(REAL_NOW - 20 * DAY);
const U = "00000000-0000-4000-8000-000000000031";
const PRICES = { STRIPE_PRICE_MONTHLY_CAD: "price_monthly_1199", STRIPE_PRICE_ANNUAL_CAD: "price_annual_9999", STRIPE_PRICE_FOUNDING_ANNUAL_CAD: "price_founding_7999" };
const ENV_KEYS = ["TRIAL_PLAN_FIRST", "TRIAL_PLAN_FIRST_SINCE", "BILLING_ENABLED", "IAP_ENABLED", "WAITLIST_UNSUBSCRIBE_SECRET", ...Object.keys(PRICES)];
function setEnv(o) { for (const k of ENV_KEYS) delete process.env[k]; Object.assign(process.env, o); }
const ON = { BILLING_ENABLED: "true", IAP_ENABLED: "true", TRIAL_PLAN_FIRST: "true", TRIAL_PLAN_FIRST_SINCE: SINCE, ...PRICES };
const OFF = { BILLING_ENABLED: "true", IAP_ENABLED: "true", ...PRICES };
const profile = () => ({ user_id: U, plan: "trial", founder_flag: false, trial_started_at: iso(REAL_NOW - 15 * DAY) });
const memoryStorage = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); } }; };

// ── The stores' products, as RevenueCat hands them to the app ───────────────────────────────────────
const PLANS = [["monthly", "$11.99", "a month"], ["annual", "$99.99", "a year"], ["founding_annual", "$79.99", "a year"]];
const IOS_ID = { monthly: "app.flourishmoney.plus.monthly", annual: "app.flourishmoney.plus.annual", founding_annual: "app.flourishmoney.founding.annual" };
const AND_ID = { monthly: "flourish_plus:monthly", annual: "flourish_plus:annual", founding_annual: "flourish_plus:founding" };
const FREE_2W = { price: 0, periodUnit: "WEEK", periodNumberOfUnits: 2, cycles: 1 };
const iosProduct = (plan, price, intro = null) => ({ identifier: IOS_ID[plan], priceString: price, introPrice: intro });
// Google Play: the base plan, and (when the offer is live and this person is eligible) the free-trial option, which
// RevenueCat makes the default option.
function androidProduct(plan, price, { offer = false } = {}) {
  const base = { id: AND_ID[plan].split(":")[1], isBasePlan: true, freePhase: null };
  const trial = { id: `${base.id}:free-14-${base.id}`, isBasePlan: false, freePhase: { billingPeriod: { iso8601: "P2W" }, billingCycleCount: 1 } };
  return { identifier: AND_ID[plan], priceString: price, subscriptionOptions: offer ? [base, trial] : [base], defaultOption: offer ? trial : base };
}

(async () => {
  const t = create();
  const saved = { ...process.env };
  const lib = await import(path.join(REPO, "src", "lib", "trialPlanFirst.js"));
  const W = await import(path.join(REPO, "src", "lib", "trialWords.js"));
  const offer = await import(path.join(REPO, "src", "lib", "storeOffer.js"));
  const store = await import(path.join(REPO, "src", "lib", "storeBilling.js"));
  const words = W.trialWords;
  const card = (platform, plan, price, per, product, eligibility) => lib.trialDisclosure({ platform,
    eligible: lib.storeTrialEligible({ platform, product, eligibility }), price: `${price} ${per}`, planKey: plan, words });
  const claimsTrial = (lines) => lines.some((l) => /14 days|free|First charge|Cancel before/i.test(l));

  try {
    // ════ 1. THE SWITCH ON, THE STORE'S OFFER NOT THERE YET ═══════════════════════════════════════════
    for (const [plan, price, per] of PLANS) {
      // iPhone: no introductory offer on the product. Whatever RevenueCat's eligibility call says (eligible, unknown,
      // nothing at all), no trial is claimed and the line says what the store will do: charge today.
      for (const [name, elig] of [["eligible", { [IOS_ID[plan]]: { status: 2 } }], ["no offer", { [IOS_ID[plan]]: { status: 3 } }], ["unknown", { [IOS_ID[plan]]: { status: 0 } }], ["no answer", {}]]) {
        const d = card("ios", plan, price, per, iosProduct(plan, price), elig);
        t.eq([d.claim, d.lines[0], claimsTrial(d.lines)], [false, `${price} ${per}, charged today. Renews until you cancel.`, false],
          `1a iPhone, ${plan}, no offer in App Store Connect (RevenueCat says "${name}"): no trial claimed, "charged today"`);
      }
      // Android: no offer in Play Console, so the default option is the base plan itself.
      const p = androidProduct(plan, price);
      const d = card("android", plan, price, per, p, {});
      t.eq([d.claim, d.lines[0], claimsTrial(d.lines)], [false, `${price} ${per}, charged today. Renews until you cancel.`, false],
        `1b Android, ${plan}, no offer in Play Console: no trial claimed, "charged today"`);
      t.eq(lib.androidPurchaseOption(p, d.claim), p.subscriptionOptions[0], `1c …and the base plan is what is bought (${plan})`);
    }
    // Shapes that are not the 14 days free never claim it either.
    const m = "monthly";
    const not14 = [["1 week free", { ...FREE_2W, periodNumberOfUnits: 1 }], ["1 month free", { price: 0, periodUnit: "MONTH", periodNumberOfUnits: 1, cycles: 1 }],
      ["2 weeks at a price", { ...FREE_2W, price: 0.99 }]];
    for (const [name, intro] of not14) {
      t.eq(lib.storeTrialEligible({ platform: "ios", product: iosProduct(m, "$11.99", intro), eligibility: { [IOS_ID[m]]: { status: 2 } } }), false, `1d an iPhone offer that is ${name} is not claimed as 14 days free`);
    }
    for (const status of [0, 1, 3]) {
      t.eq(lib.storeTrialEligible({ platform: "ios", product: iosProduct(m, "$11.99", FREE_2W), eligibility: { [IOS_ID[m]]: { status } } }), false, `1e the offer exists but RevenueCat's answer is ${status} (not "eligible"): not claimed`);
    }
    t.ok(APP.includes('{busy===plan?PAYWALL_COPY.checking:(trial?.claim ? trialWords("trialfirst-button") : copy.button)}'),
      "1f the button says \"Start free trial\" only on a plan that claimed it; otherwise \"Subscribe for {price}\"");
    // The website does not wait for the stores: its 14 days are Stripe's, started by our own checkout.
    {
      setEnv(ON);
      const stripe = fakeStripe({ "/customers": { id: "cus_31" } });
      const admin = fakeAdmin({ profiles: [profile()], subscriptions: [] }, { rpc: async (n) => (n === "purchase_attempt_begin" ? { data: { result: "held" }, error: null } : { data: null, error: null }) });
      const res = await loadWith(BILLING, { admin, stripe, userId: U }).handler(post({ action: "create_checkout_session", plan_key: "monthly", trial: true }));
      const made = stripe.calls.find((c) => c.method === "POST" && c.url === "/checkout/sessions");
      t.eq([res.statusCode, made && made.body.subscription_data.trial_period_days, made && made.body.payment_method_collection], [200, 14, "always"],
        "1g the website gives its own 14 days (Stripe), with a card, whether or not a store offer exists");
    }

    // ════ 2. THE STORE'S OFFER THERE, THE SWITCH OFF ══════════════════════════════════════════════════
    {
      setEnv(OFF);
      const res = await loadWith(BILLING, { admin: fakeAdmin({ profiles: [profile()], subscriptions: [] }), userId: U }).handler(post({ action: "store_status" }, NATIVE));
      const body = JSON.parse(res.body);
      t.eq([res.statusCode, "trial_plan_first" in body, lib.trialPlanFirstOf(body)], [200, false, null], "2a off: a store app is told nothing about a trial");
    }
    t.eq([(APP.match(/<StorePaywall [\s\S]{0,700}?trialFirst=\{tpfStatus\}/g) || []).length, (APP.match(/<StorePaywall /g) || []).length], [2, 2], "2b both store plans screens take the switch from the server's answer and nothing else");
    t.ok(APP.includes("const trial = (trialFirst && copy) ? trialDisclosure({ platform, eligible: storeTrialEligible({ platform, product: p.product, eligibility: introElig }), price: copy.price, planKey: plan, words: trialWords }) : null;"),
      "2c off: no plan card carries trial lines, whatever the store's product says");
    for (const [plan, price, per] of PLANS) {
      const live = androidProduct(plan, price, { offer: true });
      const c = offer.offerCopy({ plan, priceString: price, platform: "android" });
      t.eq(c.button, `Subscribe for ${price} ${per}`, `2d off: the Android button is today's (${plan})`);
      // What the screen said is what is bought: the base plan by name, not the default option (which is now the trial).
      const bought = lib.androidPurchaseOption(live, false);
      t.eq([bought && bought.isBasePlan, bought && bought.freePhase, live.defaultOption.isBasePlan], [true, null, false],
        `2e off, the Play offer live: Android buys the base plan, so it is charged when confirmed, as its screen says (${plan})`);
      // …and with the switch on, the trial the card claimed is the one bought.
      const d = card("android", plan, price, per, live, {});
      t.eq([d.claim, lib.androidPurchaseOption(live, d.claim)], [true, null], `2f on, the Play offer live: the card claims the 14 days and the default option (the trial) is bought (${plan})`);
    }
    t.ok(offer.STORE_DISCLOSURE.android.startsWith("Payment is charged through Google Play when you confirm.") && offer.STORE_DISCLOSURE.ios.startsWith("Payment is charged to your Apple Account when you confirm."),
      "2g off: the screen states the charge is made when the purchase is confirmed");
    t.ok(APP.includes("const base = platform===\"android\" ? androidPurchaseOption(p.product, !!(trialFirst && storeTrialEligible({ platform, product: p.product, eligibility: introElig }))) : null;")
      && APP.includes("return base ? purchases.purchaseSubscriptionOption({ subscriptionOption: base }) : purchases.purchasePackage({ aPackage: p });"),
      "2h KNOWN: only Android can buy a plan without its offer; an iPhone buys the product, and Apple applies its offer whatever the switch says");
    {
      // 2i-2k What still follows for an iPhone household that bought in that gap: the row says trialing with Apple's
      // end date, and the reminder (date and amount of the first charge, how to cancel) is sent with the switch off.
      const S = require("../netlify/functions/_lib/storeSubscriptions.js");
      const end = REAL_NOW + 2.5 * DAY;
      const row = S.storeRowFromSubscriber({ subscriptions: { [IOS_ID.monthly]: { store: "app_store", period_type: "trial", expires_date: iso(end), is_sandbox: false } } }, REAL_NOW).row;
      t.eq([row.status, row.provider, row.current_period_end, row.plan_key], ["trialing", "app_store", iso(end), "monthly"], "2i the switch plays no part in what the server writes: Apple's trial is a trialing row with Apple's end date");
      setEnv({ ...OFF, WAITLIST_UNSUBSCRIBE_SECRET: "go-live-test-secret" });
      const state = { subscriptions: [{ user_id: U, ...row }], trial_reminders: [], trial_reminder_optouts: [], __unique: { trial_reminders: ["provider", "subscription_ref"] } };
      const sent = [];
      const out = await loadWith(SWEEP, { admin: fakeAdmin(state) })._test.sweep({ admin: fakeAdmin(state), now: REAL_NOW, send: async (payload) => { sent.push(payload); return true; } });
      t.eq([out.sent, sent.length], [1, 1], "2j off: the reminder 3 days before the first charge is still sent for that trial");
      const R = require("../netlify/functions/_lib/trialReminder.js");
      const dates = R.reminderDates("ios", end);
      t.ok(sent[0] && sent[0].text.includes(`On ${dates.charge}, you'll be charged $11.99 CAD, plus any applicable tax, unless you cancel first.`) && dates.charge === R.reminderDateLabel(end - DAY),
        "2k …naming the day before Apple's trial ends (Apple may charge up to 24 hours early) and the plan's price");
    }

    // ════ 3. A STATUS READ FAILS AS THE TRIAL ENDS ════════════════════════════════════════════════════
    {
      setEnv(ON);
      // The trial ended a minute ago; the row still says trialing (the store's or Stripe's renewal has not been heard).
      const ended = (provider) => ({ user_id: U, provider, status: "trialing", plan_key: "monthly", provider_customer_id: "cus_31",
        provider_subscription_id: provider === "stripe" ? "sub_31" : null, current_period_end: iso(REAL_NOW - 60000), cancel_at_period_end: false });
      for (const provider of ["stripe", "app_store", "play_store"]) {
        for (const table of ["subscriptions", "profiles"]) {
          for (const [action, headers] of [["status", WEB], ["store_status", NATIVE]]) {
            const admin = fakeAdmin({ profiles: [profile()], subscriptions: [ended(provider)] }, { failRead: (tb, op) => tb === table && op === "select" });
            const res = await loadWith(BILLING, { admin, userId: U }).handler(post({ action }, headers));
            const body = JSON.parse(res.body);
            t.eq([res.statusCode, "paid" in body, "trial_plan_first" in body], [503, false, false], `3a ${action}, ${provider} trial just ended, the ${table} read fails: 503, never "not paid" and never a guess about the trial`);
          }
        }
      }
      {
        const admin = fakeAdmin({ profiles: [profile()], subscriptions: [ended("app_store")] }, { failRead: (tb, op) => tb === "subscriptions" && op === "select" });
        const res = await loadWith(BILLING, { admin, userId: U }).handler(post({ action: "store_hold", attempt_id: "store-attempt-0031", platform: "ios" }, NATIVE));
        t.eq([res.statusCode, JSON.parse(res.body).held], [503, undefined], "3b the hold before a store's purchase sheet: a read that fails opens no sheet");
      }
      {
        const stripe = fakeStripe({});
        const admin = fakeAdmin({ profiles: [profile()], subscriptions: [ended("stripe")] }, { failRead: (tb, op) => tb === "subscriptions" && op === "select" });
        const res = await loadWith(BILLING, { admin, stripe, userId: U }).handler(post({ action: "create_checkout_session", plan_key: "monthly", trial: false }));
        t.eq([res.statusCode, stripe.calls.some((c) => c.url === "/checkout/sessions")], [503, false], "3c the website's checkout: with the row unread, nothing is created");
      }
      {
        // The read works but the renewal has not been heard yet: the row alone says "not paid". Stripe itself is asked
        // before any checkout, and it says the subscription is live, so the household is never charged a second time.
        const stripe = fakeStripe({ "/subscriptions?customer=": { data: [{ id: "sub_31", status: "active" }] } });
        const admin = fakeAdmin({ profiles: [profile()], subscriptions: [ended("stripe")] });
        const st = JSON.parse((await loadWith(BILLING, { admin, stripe, userId: U }).handler(post({ action: "status" }))).body);
        const res = await loadWith(BILLING, { admin, stripe, userId: U }).handler(post({ action: "create_checkout_session", plan_key: "annual", trial: false }));
        t.eq([st.paid, st.trial_plan_first.trialing, res.statusCode, JSON.parse(res.body).error, stripe.calls.some((c) => c.url === "/checkout/sessions")], [false, false, 409, "already_subscribed", false],
          "3d the renewal not heard yet (the row says the trial ended): checkout asks Stripe, finds the live subscription and creates nothing");
      }
    }
    {
      // The app, with no answer. Its last definite "paid" stands until the trial's own end, then it is UNKNOWN (never "not
      // paid"); the plans it cannot close need the server to have said "must choose", which a paid answer cleared.
      const st = memoryStorage();
      const end = REAL_NOW + 3 * DAY;
      store.rememberGate(st, U, true, iso(end), REAL_NOW, store.WEB_PAID_KEY);
      store.rememberGate(st, U, true, iso(end), REAL_NOW);
      t.eq([store.recalledGate(st, U, end - 1000, store.WEB_PAID_KEY), store.recalledGate(st, U, end - 1000)], [true, true], "3e no answer before the trial ends: the household is still paid, on the website and in a store app");
      t.eq([store.recalledGate(st, U, end + 1000, store.WEB_PAID_KEY), store.recalledGate(st, U, end + 1000)], [null, null], "3f no answer after it ends: unknown, which is never \"not paid\"");
      lib.rememberRequired(st, U, true);
      lib.rememberRequired(st, U, false);   // the answer that said "paid" (the trial started)
      t.eq(lib.recalledRequired(st, U), false, "3g the plans that cannot be closed are not remembered for a household that has started its trial");
      t.ok(APP.includes("const plansRequired = !!user?.id && !appData?.demo && (tpfAnswered ? plansStageNow===\"required\"\n    : (recalledRequired(deviceStorage(), user.id) && !householdLinkToken\n       && recalledGate(deviceStorage(), user.id, Date.now(), WEB_PAID_KEY)!==true && recalledGate(deviceStorage(), user.id, Date.now())!==true));"),
        "3h with no answer, those plans show only if the server last said \"must choose\" and this device remembers no payment");
      let bought = 0;
      const deps = (serverStatus, serverHold) => ({ serverStatus, serverHold, serverSync: async () => ({ paid: true }), purchasePackage: async () => { bought++; }, sleep: async () => {}, attempt: { current: null } });
      const noAnswer = await store.buy(deps(async () => null, async () => ({ held: true })), { product: {} });
      const threw = await store.buy(deps(async () => { throw new Error("timeout"); }, async () => ({ held: true })), { product: {} });
      const noHold = await store.buy(deps(async () => ({ paid: false }), async () => null), { product: {} });
      t.eq([noAnswer, threw, noHold, bought], [{ outcome: "failed", reason: "status_unavailable" }, { outcome: "failed", reason: "status_unavailable" }, { outcome: "failed", reason: "hold_unavailable" }, 0],
        "3i a status call that times out, or a hold that does, opens no purchase sheet: nothing is sold on no answer");
      t.eq((APP.match(/const wait = \[5000, 20000, 60000\]\[attempt\];/g) || []).length, 2, "3j both status calls are asked again after 5, 20 and 60 seconds (and when the network returns)");
    }

    // ════ 4. A TRIAL STARTED ON THE WEBSITE, THEN A STORE APP (AND THE OTHER WAY ROUND) ═══════════════
    {
      setEnv(ON);
      const end = REAL_NOW + 13 * DAY;
      const webTrial = { user_id: U, provider: "stripe", status: "trialing", plan_key: "monthly", provider_customer_id: "cus_31", provider_subscription_id: "sub_31", current_period_end: iso(end), cancel_at_period_end: false };
      const state = () => ({ profiles: [profile()], subscriptions: [{ ...webTrial }] });
      const body = JSON.parse((await loadWith(BILLING, { admin: fakeAdmin(state()), userId: U }).handler(post({ action: "store_status" }, NATIVE))).body);
      t.eq([body.paid, body.provider, body.founding.available, body.trial_plan_first.trialing, body.trial_plan_first.trial_ends], [true, "stripe", false, true, iso(end)],
        "4a the store app is told: this household already has its plan, on the website, in its trial, ending when Stripe says");
      const hold = JSON.parse((await loadWith(BILLING, { admin: fakeAdmin(state()), userId: U }).handler(post({ action: "store_hold", attempt_id: "store-attempt-0031", platform: "ios" }, NATIVE))).body);
      t.eq(hold, { held: false, paid: true, provider: "stripe" }, "4b …and no purchase sheet may open for it");
      let bought = 0;
      const r = await store.buy({ serverStatus: async () => body, serverHold: async () => hold, serverSync: async () => ({ paid: true }), purchasePackage: async () => { bought++; }, attempt: { current: null } }, { product: iosProduct("monthly", "$11.99", FREE_2W) });
      t.eq([r.outcome, bought], ["already_paid", 0], "4c so the app sells nothing, even with Apple's own 14-day offer on the product: no second trial on top of a running one");
      t.eq(lib.plansFirstStage({ tpf: body.trial_plan_first, paid: body.paid, profilePlan: "free", canSell: true }), null, "4d …and never holds that household at the plans");

      // THE CHIP'S DATE. Stripe and Google Play charge when the trial ends; Apple may charge up to 24 hours before. So the
      // date is the one for where the trial was BOUGHT, on whatever device it is read: a website trial read on an iPhone
      // is charged on its end date, and an iPhone trial read on the website or on Android may be charged the day before.
      const chipFor = typeof lib.chipChargeDateFor === "function" ? lib.chipChargeDateFor : () => "no chipChargeDateFor";
      const label = (provider) => { const d = chipFor(provider, iso(end)); return d instanceof Date ? d.getTime() : d; };
      t.eq([label("stripe"), label("play_store"), label("app_store")], [end, end, end - DAY], "4e the first charge's date: the trial's end for the website and Google Play, the day before for Apple");
      t.eq([label(undefined), label(null), label("something else")], [end - DAY, end - DAY, end - DAY], "4f where it was bought is not known: the earliest it could be, never a day late");
      t.eq([chipFor("stripe", null), chipFor("app_store", "soon")], [null, null], "4g no end date, no chip");
      t.ok(APP.includes("{tpfStatus?.trialing&&chipChargeDateFor(tpfPaySource?.provider, tpfStatus.trial_ends)&&<div data-trial-first-chip=\"\"")
        && APP.includes("{trialWords(\"trialfirst-chip\", { date: chargeDateLabel(chipChargeDateFor(tpfPaySource?.provider, tpfStatus.trial_ends)) })}"),
        "4h the chip takes its date from the provider in the server's answer…");
      t.ok(!/chipChargeDate\w*\(window\.Capacitor/.test(APP), "4i …and never from the device it is shown on");
      const webStatus = JSON.parse((await loadWith(BILLING, { admin: fakeAdmin(state()), userId: U }).handler(post({ action: "status" }))).body);
      const apple = { ...webTrial, provider: "app_store", provider_subscription_id: null };
      const appleOnWeb = JSON.parse((await loadWith(BILLING, { admin: fakeAdmin({ profiles: [profile()], subscriptions: [apple] }), userId: U }).handler(post({ action: "status" }))).body);
      t.eq([webStatus.provider, webStatus.trial_plan_first.trialing, appleOnWeb.provider, appleOnWeb.trial_plan_first.trialing, appleOnWeb.trial_plan_first.trial_ends], ["stripe", true, "app_store", true, iso(end)],
        "4j the server's status names the provider beside the trial, on the website too (an iPhone trial read there)");

      // The other way round: a trial that began in a store, then the website. Stripe's 14 days are not given again.
      for (const [name, row] of [["running", apple], ["cancelled and over", { ...apple, status: "canceled", current_period_end: iso(REAL_NOW - DAY) }]]) {
        const stripe = fakeStripe({ "/customers": { id: "cus_31" } });
        const admin = fakeAdmin({ profiles: [profile()], subscriptions: [{ ...row }] }, { rpc: async (n) => (n === "purchase_attempt_begin" ? { data: { result: "held" }, error: null } : { data: null, error: null }) });
        const st = JSON.parse((await loadWith(BILLING, { admin, stripe, userId: U }).handler(post({ action: "status" }))).body);
        const res = await loadWith(BILLING, { admin, stripe, userId: U }).handler(post({ action: "create_checkout_session", plan_key: "monthly", trial: true }));
        const made = stripe.calls.find((c) => c.method === "POST" && c.url === "/checkout/sessions");
        t.eq([st.trial_plan_first.web_trial_eligible, res.statusCode, !!made], [false, 409, false], `4k a store trial (${name}), then the website: no second 14 days from Stripe, and a request for one creates nothing`);
      }
    }
  } finally {
    for (const k of ENV_KEYS) { if (k in saved) process.env[k] = saved[k]; else delete process.env[k]; }
  }

  t.summary("trialGoLiveFailures.test");
  setImmediate(() => process.exit(process.exitCode || 0));
})();
