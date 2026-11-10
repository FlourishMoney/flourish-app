// tests/trialPlanFirst.test.cjs
// -----------------------------------------------------------------------------
// TRIAL_PLAN_FIRST (Amanda, 2026-11-10): the usual app-store trial, behind a switch that is off by default.
//   1. the switch (item 4): off is today's rule exactly; on, only an account made after its time loses the account
//      trial; the store builds learn it from the server.
//   2. the plans screen first (item 1): who sees it and how, the lines above each plan's button, the stores' own
//      eligibility answer, and the app's wiring. The checkout and the founding seats: tests/trialPlanFirstBilling.test.cjs.
//   3. people already signed up (item 2): mid-trial keeps it to its end, unchanged; an ended trial sees the new plans
//      once, closable, with a trial only where the store says so; nobody who has access loses it early.
//   5. the words (item 5): every new line is a listed placeholder, the builds refuse while one is left, and "no card"
//      goes from the two screens before a plan is chosen while the switch is on.
//   7. the consoles list (item 7): every main-plan product, the trial's length, the immutable fields, the order.
// Synthetic data only (tests/_trialFakes.cjs).
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");
const { fakeAdmin, loadWith } = require("./_trialFakes.cjs");

const REPO = path.join(__dirname, "..");
const APP = fs.readFileSync(path.join(REPO, "src", "App.jsx"), "utf8");
const SINCE = "2026-11-13T15:00:00Z";
const NOW = Date.parse("2026-11-20T12:00:00Z");
const iso = (ms) => new Date(ms).toISOString();
const day = 86400000;
const BILLING = require.resolve("../netlify/functions/billing.js");
const FLAG_FN = require.resolve("../netlify/functions/trial-plan-first.js");
const WEB = { origin: "https://flourishmoney.app" };
const NATIVE = { origin: "capacitor://localhost" };
const post = (body, headers = WEB) => ({ httpMethod: "POST", headers, body: JSON.stringify(body) });
const ENV_KEYS = ["TRIAL_PLAN_FIRST", "TRIAL_PLAN_FIRST_SINCE", "BILLING_ENABLED", "IAP_ENABLED"];
function setEnv(o) { for (const k of ENV_KEYS) delete process.env[k]; Object.assign(process.env, o); }

(async () => {
  const t = create();
  const saved = { ...process.env };
  const rules = require("../netlify/functions/_lib/planRules.js");
  const client = await import(path.join(REPO, "src", "lib", "planFromProfile.js"));
  const lib = await import(path.join(REPO, "src", "lib", "trialPlanFirst.js"));

  // ── 1. THE SWITCH ───────────────────────────────────────────────────────────────────────────────
  {
    // 1a only exactly "true" with a real time is on.
    for (const [env, want] of [
      [{}, null], [{ TRIAL_PLAN_FIRST: "true" }, null], [{ TRIAL_PLAN_FIRST: "true", TRIAL_PLAN_FIRST_SINCE: "soon" }, null],
      [{ TRIAL_PLAN_FIRST: "TRUE", TRIAL_PLAN_FIRST_SINCE: SINCE }, null], [{ TRIAL_PLAN_FIRST: "1", TRIAL_PLAN_FIRST_SINCE: SINCE }, null],
      [{ TRIAL_PLAN_FIRST_SINCE: SINCE }, null], [{ TRIAL_PLAN_FIRST: "true", TRIAL_PLAN_FIRST_SINCE: SINCE }, Date.parse(SINCE)],
    ]) t.eq(rules.trialPlanFirstSince(env), want, `1a ${JSON.stringify(env)} -> ${want === null ? "off" : "on"}`);

    // 1b off: every row in a matrix gets exactly the answer it got before the switch existed (no third argument).
    const rows = [];
    for (const plan of ["trial", "free", "plus", "pro", null]) for (const founder_flag of [false, true])
      for (const started of [null, -40, -10, 3, 8, 30]) rows.push({ plan, founder_flag,
        trial_started_at: started === null ? null : iso(Date.parse(SINCE) + started * day),
        trial_ends_at: started === null ? null : iso(Date.parse(SINCE) + (started + 14) * day) });
    setEnv({});
    const before = rows.map((r) => rules.derivePlan(r, NOW, { planFirstSince: null }));
    t.eq(rows.map((r) => rules.derivePlan(r, NOW)), before, `1b off: all ${rows.length} rows answer as today`);
    setEnv({ TRIAL_PLAN_FIRST: "false", TRIAL_PLAN_FIRST_SINCE: SINCE });
    t.eq(rows.map((r) => rules.derivePlan(r, NOW)), before, "1c a time but the switch not \"true\": as today");
    t.eq(rows.map((r) => client.derivePlan(r, NOW)), before, "1d the client with no answer from the server: as today");

    // 1e on: an account made at or after the time has no account trial; one made before keeps it to its end.
    setEnv({ TRIAL_PLAN_FIRST: "true", TRIAL_PLAN_FIRST_SINCE: SINCE });
    const newRow = { plan: "trial", founder_flag: false, trial_started_at: iso(Date.parse(SINCE) + 3 * day), trial_ends_at: iso(Date.parse(SINCE) + 17 * day) };
    const atRow = { ...newRow, trial_started_at: SINCE };
    const midRow = { plan: "trial", founder_flag: false, trial_started_at: iso(Date.parse(SINCE) - 2 * day), trial_ends_at: iso(Date.parse(SINCE) + 12 * day) };
    const endedRow = { plan: "trial", founder_flag: false, trial_started_at: iso(Date.parse(SINCE) - 40 * day), trial_ends_at: iso(Date.parse(SINCE) - 26 * day) };
    t.eq(rules.derivePlan(newRow, NOW), "free", "1e on: a new account has no account trial");
    t.eq(rules.derivePlan(atRow, NOW), "free", "1f …nor one made at the exact time");
    t.eq(rules.derivePlan(midRow, NOW), "trial", "1g someone mid-trial keeps it, unchanged");
    t.eq(rules.derivePlan(midRow, Date.parse(midRow.trial_ends_at)), "free", "1h …to its own end, not a day longer");
    t.eq(rules.derivePlan(endedRow, NOW), "free", "1i an ended account trial is still ended");
    t.eq(rules.derivePlan({ ...newRow, founder_flag: true }, NOW), "beta_founder", "1j a beta founder is unchanged");
    t.eq(rules.derivePlan({ ...newRow, plan: "plus" }, NOW), "premium", "1k complimentary access (plan plus) is unchanged");
    t.eq(rules.deriveEntitlement(newRow, { status: "trialing", current_period_end: iso(NOW + 5 * day) }, NOW).plan, "premium", "1l a new account in its store or Stripe trial has full access");
    t.eq(rules.deriveEntitlement(newRow, null, NOW).plan, "free", "1m …and without a subscription, none of the account trial");

    // 1n parity: the client, told the server's account_trial, answers what the server does, for every row.
    const since = Date.parse(SINCE);
    t.eq(rows.map((r) => client.derivePlan(r, NOW, { accountTrial: rules.accountTrialApplies(r, since) })),
      rows.map((r) => rules.derivePlan(r, NOW)), "1n the client and the server agree on every row with the switch on");
  }

  // ── 1o-1x the status calls ──────────────────────────────────────────────────────────────────────
  {
    const state = () => ({ profiles: [{ user_id: "u1", plan: "trial", founder_flag: false, trial_started_at: iso(Date.parse(SINCE) + day) }], subscriptions: [] });
    setEnv({ BILLING_ENABLED: "true", IAP_ENABLED: "true" });
    let admin = fakeAdmin(state());
    let res = await loadWith(BILLING, { admin }).handler(post({ action: "status" }));
    let body = JSON.parse(res.body);
    t.eq([res.statusCode, "trial_plan_first" in body], [200, false], "1o off: the web status has no trial_plan_first key");
    t.eq(admin.calls.filter((c) => c.table === "profiles" && /trial_started_at/.test(c.cols)).length, 0, "1p …and reads no trial start for it");
    admin = fakeAdmin(state());
    res = await loadWith(BILLING, { admin }).handler(post({ action: "store_status" }, NATIVE));
    body = JSON.parse(res.body);
    t.eq([res.statusCode, "trial_plan_first" in body], [200, false], "1q off: store_status has none either");

    setEnv({ BILLING_ENABLED: "true", IAP_ENABLED: "true", TRIAL_PLAN_FIRST: "true", TRIAL_PLAN_FIRST_SINCE: SINCE });
    res = await loadWith(BILLING, { admin: fakeAdmin(state()) }).handler(post({ action: "status" }));
    body = JSON.parse(res.body);
    t.eq(body.trial_plan_first, { on: true, trial_days: 14, account_trial: false, trialing: false, trial_ends: null, web_trial_eligible: true }, "1r on: the web is told: no account trial, eligible for Stripe's 14 days");
    res = await loadWith(BILLING, { admin: fakeAdmin(state()) }).handler(post({ action: "store_status" }, NATIVE));
    body = JSON.parse(res.body);
    t.eq(body.trial_plan_first, { on: true, trial_days: 14, account_trial: false, trialing: false, trial_ends: null }, "1s a store app is told the same, and no web eligibility (its store decides)");
    const old = state(); old.profiles[0].trial_started_at = iso(Date.parse(SINCE) - 3 * day);
    res = await loadWith(BILLING, { admin: fakeAdmin(old) }).handler(post({ action: "status" }));
    t.eq(JSON.parse(res.body).trial_plan_first.account_trial, true, "1t an account from before keeps its account trial");
    res = await loadWith(BILLING, { admin: fakeAdmin(state(), { failRead: (tb) => tb === "profiles" }) }).handler(post({ action: "status" }));
    t.eq(res.statusCode, 503, "1u a profile read that fails is a 503, never a guess");
    res = await loadWith(BILLING, { admin: fakeAdmin(state(), { failRead: (tb) => tb === "profiles" }) }).handler(post({ action: "store_status" }, NATIVE));
    t.eq(res.statusCode, 503, "1v …in a store app too");

    // the public check before sign-in
    setEnv({});
    res = await loadWith(FLAG_FN, {}).handler({ httpMethod: "GET", headers: WEB });
    t.eq(res.statusCode, 404, "1w GET /api/trial-plan-first: 404 while off");
    setEnv({ TRIAL_PLAN_FIRST: "true", TRIAL_PLAN_FIRST_SINCE: SINCE });
    res = await loadWith(FLAG_FN, {}).handler({ httpMethod: "GET", headers: NATIVE });
    t.eq([res.statusCode, JSON.parse(res.body)], [200, { on: true }], "1x …200 { on: true } while on, from the app too");
    res = await loadWith(FLAG_FN, {}).handler({ httpMethod: "POST", headers: WEB, body: "{}" });
    t.eq(res.statusCode, 405, "1y …and nothing but GET");
    t.ok(/from\s+= "\/api\/trial-plan-first"\s+to\s+= "\/\.netlify\/functions\/trial-plan-first"/.test(fs.readFileSync(path.join(REPO, "netlify.toml"), "utf8")), "1z the address is routed");
  }

  // ── 1za-1zh the app ─────────────────────────────────────────────────────────────────────────────
  {
    t.eq(lib.trialPlanFirstOf({ paid: false }), null, "1za no key: off");
    t.eq(lib.trialPlanFirstOf({ trial_plan_first: { on: false } }), null, "1zb on false: off");
    t.eq(lib.accountTrialFrom(null), true, "1zc no answer keeps the account trial");
    t.eq(lib.accountTrialFrom({ trial_plan_first: { on: true, account_trial: false } }), false, "1zd only the server's false takes it away");
    const mem = new Map(); const st = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
    lib.rememberAccountTrial(st, "u1", { trial_plan_first: { on: true, account_trial: false } });
    t.eq(lib.recalledAccountTrial(st, "u1"), false, "1ze the device remembers the answer for the next sign-in");
    t.eq(lib.recalledAccountTrial(st, "u2"), true, "1zf …for that account only");
    lib.rememberAccountTrial(st, "u1", { paid: false });
    t.eq(lib.recalledAccountTrial(st, "u1"), true, "1zg the switch off clears it");
    t.ok(APP.includes("const cp = derivePlan(prof, Date.now(), { accountTrial: recalledAccountTrial(deviceStorage(), userId) });"), "1zh App reads the plan with the remembered answer");
    t.ok(APP.includes("const cp = derivePlan(last.prof, Date.now(), { accountTrial: accountTrialFrom({ trial_plan_first: tpfStatus }) });"), "1zi …and again once the server answers");
    t.ok(APP.includes("const trialExpired = accountTrialKept && !trialActive"), "1zj a new account is never told an account trial ended");
  }

  // ── 2. THE PLANS SCREEN FIRST ───────────────────────────────────────────────────────────────────
  {
    const W = await import(path.join(REPO, "src", "lib", "trialWords.js"));
    const on = { on: true, account_trial: false, trial_days: 14 };
    const stage = (o) => lib.plansFirstStage({ tpf: on, canSell: true, profilePlan: "free", ...o });
    t.eq(stage({}), "required", "2a a new account with no plan: the plans come first and cannot be closed");
    t.eq([stage({ paid: true }), stage({ coveredBy: "partner" }), stage({ profilePlan: "premium" }), stage({ profilePlan: "beta_founder" }), stage({ demo: true }), stage({ canSell: false }), stage({ tpf: null })],
      [null, null, null, null, null, null, null], "2b …never for a payer, a partner's cover, complimentary access, a beta founder, the demo, a build that cannot sell, or the switch off");
    t.eq(stage({ tpf: { ...on, account_trial: true }, profilePlan: "free" }), "offer_once", "2c an account whose own account trial ended: the new plans, once, closable");
    t.eq(stage({ tpf: { ...on, account_trial: true }, profilePlan: "trial" }), null, "2d someone mid-trial: nothing changes until it ends");

    const NOWD = Date.parse("2026-11-13T17:00:00Z");
    const d = lib.trialDisclosure({ platform: "ios", eligible: true, price: "$11.99 a month", planKey: "monthly", now: NOWD, words: W.trialWords });
    t.eq(d.claim, true, "2e eligible: the plan claims the 14 days");
    t.eq(d.lines, ["[WORDS: trialfirst-free-days]", "[WORDS: trialfirst-then] [price $11.99 a month]", "[WORDS: trialfirst-first-charge] [date November 27, 2026]",
      "[WORDS: trialfirst-cancel-before] [date November 27, 2026]", "[WORDS: trialfirst-cancel-ios]"],
      "2f …14 days free, the price after and how often, the first charge's date, cancel before it and nothing is charged, how to cancel on an iPhone");
    t.eq(lib.trialDisclosure({ platform: "android", eligible: true, price: "$99.99 a year", planKey: "annual", now: NOWD, words: W.trialWords }).lines[4], "[WORDS: trialfirst-cancel-android]", "2g …on Android, Android's way to cancel");
    t.eq(lib.trialDisclosure({ platform: "web", eligible: true, price: "$79.99 a year", planKey: "founding_annual", now: NOWD, words: W.trialWords }).lines[4], "[WORDS: trialfirst-cancel-web]", "2h …on the website, the website's (founding included)");
    const no = lib.trialDisclosure({ platform: "ios", eligible: false, price: "$11.99 a month", planKey: "monthly", now: NOWD, words: W.trialWords });
    t.eq([no.claim, no.lines], [false, ["[WORDS: trialfirst-no-trial] [price $11.99 a month]", "[WORDS: trialfirst-cancel-ios]"]], "2i not eligible: the plain price and how to cancel");
    t.ok(!JSON.stringify(no).includes("free-days") && !JSON.stringify(no).includes("first-charge") && !JSON.stringify(no).includes("cancel-before"), "2j …and no trial claim of any kind");
    t.eq(lib.chargeDateLabel(lib.firstChargeAt(NOWD)), "November 27, 2026", "2k the first charge is 14 days out");

    // the stores' own answer
    const ios = (status, intro) => lib.storeTrialEligible({ platform: "ios", product: { identifier: "app.flourishmoney.plus.monthly", introPrice: intro }, eligibility: { "app.flourishmoney.plus.monthly": { status } } });
    const twoWeeks = { price: 0, periodUnit: "WEEK", periodNumberOfUnits: 2, cycles: 1 };
    t.eq(ios(2, twoWeeks), true, "2l iPhone: RevenueCat says eligible and the intro offer is 2 weeks free: the claim is made");
    t.eq([ios(0, twoWeeks), ios(1, twoWeeks), ios(3, twoWeeks)], [false, false, false], "2m …unknown, ineligible or no intro offer: no claim");
    t.eq([ios(2, { ...twoWeeks, price: 1.99 }), ios(2, { price: 0, periodUnit: "MONTH", periodNumberOfUnits: 1, cycles: 1 }), ios(2, null)], [false, false, false], "2n …an intro that is not free, not 14 days, or missing: no claim");
    t.eq(lib.storeTrialEligible({ platform: "ios", product: { identifier: "x", introPrice: twoWeeks }, eligibility: {} }), false, "2o …and no answer from RevenueCat (the call failed): no claim");
    const android = (iso, cycles = 1) => lib.storeTrialEligible({ platform: "android", product: { defaultOption: { freePhase: iso ? { billingPeriod: { iso8601: iso }, billingCycleCount: cycles } : null } } });
    t.eq([android("P2W"), android("P14D")], [true, true], "2p Android: the default option (eligible offers only) has 14 days free: the claim is made");
    t.eq([android("P1M"), android(null), lib.storeTrialEligible({ platform: "android", product: {} })], [false, false, false], "2q …anything else: no claim");
    const base = { isBasePlan: true, id: "monthly" }, offer = { isBasePlan: false, id: "monthly:free-14" };
    t.eq([lib.androidPurchaseOption({ subscriptionOptions: [offer, base] }, false), lib.androidPurchaseOption({ subscriptionOptions: [offer, base] }, true)], [base, null],
      "2r Android buys the base plan unless the card claimed the trial (nobody put on a trial they were not shown)");

    // the app
    const store = APP.slice(APP.indexOf("function StorePaywall("), APP.indexOf("// THE FALLBACK (audit 2026-10-26, B4)"));
    const web = APP.slice(APP.indexOf("function UpgradeScreen("), APP.indexOf("// Couple mode (audit round 3 a)"));
    t.ok(/<TrialLines disclosure=\{trial\}\/>\s*<button onClick=\{\(\)=>doBuy\(plan,pkg\)\}/.test(store), "2s store: each plan's lines sit directly above its button");
    t.ok(/checkTrialOrIntroductoryPriceEligibility\(\{ productIdentifiers: ids \}\)/.test(store) && /catch\{ elig = \{\}; \}/.test(store), "2t store: the iPhone asks RevenueCat, and a failed answer claims nothing");
    t.ok(/purchases\.purchaseSubscriptionOption\(\{ subscriptionOption: base \}\)/.test(store), "2u store: Android buys the base plan unless the card claimed the trial");
    t.ok(/\{trialOf\(plan\)&&<TrialLines disclosure=\{trialOf\(plan\)\}\/>\}/.test(web) && /\{trialOf\(chosen\) \? <TrialLines disclosure=\{trialOf\(chosen\)\}\/>/.test(web), "2v web: each plan's lines, and again above the confirm button");
    t.ok(web.includes("plan_key:planKey, ...(trialFirst ? { trial: trialFirst.web_trial_eligible===true } : {})"), "2w web: the checkout says which terms the screen showed");
    t.ok(/\{!required&&<button onClick=\{onClose\}/.test(web), "2x web: the first plans screen has no Close");
    const gate = APP.slice(APP.indexOf("if(!firstVisitDone&&appData&&!appData.demo)return"), APP.indexOf("if(showUpgrade && billingUi.show)return"));
    t.ok(/if\(plansRequired && firstVisitDone\)\{/.test(gate), "2y the gate comes after the first safe-to-spend number (the activation moment is kept)");
    const req = gate.slice(gate.indexOf("if(plansRequired"));
    const reqStore = req.slice(req.indexOf("<StorePaywall"), req.indexOf("/>}", req.indexOf("<StorePaywall")));
    t.ok(reqStore.includes("trialFirst={tpfStatus} onSignOut={plansSignOut}") && !reqStore.includes("onClose="), "2z store: the first plans screen has no close, only sign out (and Restore)");
  }

  // ── 3. PEOPLE ALREADY SIGNED UP ─────────────────────────────────────────────────────────────────
  {
    const since = Date.parse(SINCE);
    // 3a nobody from before the switch loses anything, at any moment: every row from before, with and without a
    // subscription of each kind, gets the same entitlement with the switch on as with it off.
    const subs = [null, { status: "active", current_period_end: iso(since + 30 * day) }, { status: "trialing", current_period_end: iso(since + 5 * day) },
      { status: "canceled", current_period_end: iso(since - day) }, { status: "past_due", current_period_end: iso(since + 3 * day) }];
    const olds = [];
    for (const plan of ["trial", "free", "plus", "pro"]) for (const founder_flag of [false, true]) for (const started of [-40, -13, -1, -0.01])
      olds.push({ plan, founder_flag, trial_started_at: iso(since + started * day), trial_ends_at: iso(since + (started + 14) * day) });
    const times = [since - day, since, since + day, since + 7 * day, since + 13 * day, since + 20 * day];
    setEnv({});
    const offAns = []; for (const r of olds) for (const s of subs) for (const n of times) offAns.push(JSON.stringify(rules.deriveEntitlement(r, s, n)));
    setEnv({ TRIAL_PLAN_FIRST: "true", TRIAL_PLAN_FIRST_SINCE: SINCE });
    const onAns = []; for (const r of olds) for (const s of subs) for (const n of times) onAns.push(JSON.stringify(rules.deriveEntitlement(r, s, n)));
    t.eq(onAns, offAns, `3a every account from before the switch (${olds.length} rows x ${subs.length} subscriptions x ${times.length} moments) has exactly what it had`);

    // 3b someone mid-trial: the server says so, the app keeps the account trial, and nothing is forced.
    const mid = { plan: "trial", founder_flag: false, trial_started_at: iso(since - 2 * day), trial_ends_at: iso(since + 12 * day) };
    const midState = { profiles: [{ user_id: "u1", ...mid }], subscriptions: [] };
    process.env.BILLING_ENABLED = "true";
    const res = await loadWith(BILLING, { admin: fakeAdmin(midState) }).handler(post({ action: "status" }));
    const tpf = JSON.parse(res.body).trial_plan_first;
    t.eq([tpf.account_trial, lib.accountTrialFrom({ trial_plan_first: tpf })], [true, true], "3b mid-trial: the server and the app keep the account trial");
    t.eq(lib.plansFirstStage({ tpf, canSell: true, profilePlan: "trial" }), null, "3c …nothing is forced: the plans open when asked, as today");
    t.eq([rules.derivePlan(mid, Date.parse(mid.trial_ends_at) - 1), rules.derivePlan(mid, Date.parse(mid.trial_ends_at))], ["trial", "free"], "3d …and it ends on its own end date, unchanged");
    t.eq(tpf.web_trial_eligible, true, "3e …and if they choose a plan on the website, Stripe's 14 days still apply (never had a subscription)");

    // 3f an ended trial: the new plans once, closable; the free plan stays.
    t.eq(lib.plansFirstStage({ tpf: { on: true, account_trial: true }, canSell: true, profilePlan: "free" }), "offer_once", "3f an ended account trial: the new plans, once");
    const mem = new Map(); const st = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
    t.eq(lib.plansOfferedBefore(st, "u9"), false, "3g …not yet offered on this device");
    lib.notePlansOffered(st, "u9");
    t.eq([lib.plansOfferedBefore(st, "u9"), lib.plansOfferedBefore(st, "u8")], [true, false], "3h …then never again for that account, and only that account");
    t.ok(APP.includes("!k.startsWith(PLANS_OFFERED_PREFIX)") && APP.includes("if(plansOfferedBefore(deviceStorage(), user.id)) return;\n    notePlansOffered(deviceStorage(), user.id);\n    openUpgrade();"),
      "3i the app opens it once (kept through sign-out: the same account), through the usual plans screen, which can be closed");
    t.ok(/if\(!user\?\.id \|\| plansStageNow!=="offer_once" \|\| !onboarded \|\| !firstVisitDone\) return;/.test(APP), "3j …only after onboarding and the first number");
    const hadSub = { profiles: [{ user_id: "u1", plan: "trial", trial_started_at: iso(since - 60 * day) }], subscriptions: [{ user_id: "u1", provider: "stripe", status: "canceled", provider_subscription_id: "sub_old", current_period_end: iso(since - 5 * day) }] };
    const r2 = await loadWith(BILLING, { admin: fakeAdmin(hadSub) }).handler(post({ action: "status" }));
    t.eq(JSON.parse(r2.body).trial_plan_first.web_trial_eligible, false, "3k an account that had a subscription before is offered no web trial");

    // 3l complimentary access, a founder and a covered partner: nothing changes.
    t.eq([lib.plansFirstStage({ tpf: { on: true, account_trial: true }, canSell: true, profilePlan: "premium" }), lib.plansFirstStage({ tpf: { on: true, account_trial: false }, canSell: true, profilePlan: "premium" }),
      lib.plansFirstStage({ tpf: { on: true, account_trial: false }, canSell: true, profilePlan: "beta_founder" }), lib.plansFirstStage({ tpf: { on: true, account_trial: false }, canSell: true, profilePlan: "free", coveredBy: "partner" })],
      [null, null, null, null], "3l complimentary access (old or new), a beta founder and a covered partner see nothing new");
  }

  // ── 5. THE WORDS ────────────────────────────────────────────────────────────────────────────────
  {
    const { spawnSync } = require("child_process");
    const PW = require("./_pendingWords.cjs");
    const W = await import(path.join(REPO, "src", "lib", "trialWords.js"));
    const SW = require("../netlify/functions/_lib/trialWords.js");
    const ids = [...Object.keys(W.TRIAL_WORDS), ...Object.keys(SW.TRIAL_EMAIL_WORDS)].sort();
    t.eq(PW.pendingTrialWordIds().slice().sort(), ids, "5a every line, in the app and in the emails, is listed in TRIAL-PLAN-FIRST-WORDS.md with its placeholder");
    t.ok([...Object.entries(W.TRIAL_WORDS), ...Object.entries(SW.TRIAL_EMAIL_WORDS)].every(([id, w]) => w === `[WORDS: ${id}]`), "5b …and every one is still a placeholder");
    const used = [...APP.matchAll(/trialWords\("([a-z0-9-]+)"/g)].map((m) => m[1]);
    t.ok(used.length >= 10 && used.every((id) => ids.includes(id)), "5c the app uses only listed lines");
    for (const f of [path.join("src", "lib", "trialWords.js"), path.join("netlify", "functions", "_lib", "trialWords.js")]) {
      const r = spawnSync(process.execPath, [path.join(REPO, "scripts", "check-pending-words.mjs"), path.join(REPO, f)], { encoding: "utf8" });
      t.ok(r.status === 1 && /trialfirst-/.test(r.stderr), `5d the build guard refuses ${f} while a line is a placeholder`);
    }
    const toml = fs.readFileSync(path.join(REPO, "netlify.toml"), "utf8");
    const pkg = require("../package.json");
    t.ok(/command\s+= "npm run build && node scripts\/check-pending-words\.mjs dist netlify\/functions"/.test(toml) && /check-pending-words\.mjs dist$/.test(pkg.scripts["build:native"]),
      "5e …and it runs on the production web build (the bundle and the functions) and on every store build");
    t.ok(APP.includes('{tpfOn ? trialWords("trialfirst-welcome") : "Free to start · Canada & USA · No credit card"}'), "5f onboarding: no \"No credit card\" while the switch is on; today's line while off");
    t.ok(APP.includes('{tpfOn ? trialWords("trialfirst-landing") : "Every feature free for 14 days. Also on iPhone and Android."}'), "5g the landing: the same");
    const fake = (status, body) => async () => ({ status, ok: status >= 200 && status < 300, json: async () => body });
    t.eq([await lib.askTrialPlanFirstOn(fake(200, { on: true })), await lib.askTrialPlanFirstOn(fake(404, {})), await lib.askTrialPlanFirstOn(fake(500, {})),
      await lib.askTrialPlanFirstOn(async () => { throw new Error("offline"); }), await lib.askTrialPlanFirstOn(fake(200, { on: "yes" }))], [true, false, null, null, null],
      "5h before sign-in the app asks the server: on, off, or no answer (today's lines)");
    t.ok(APP.includes("const tpfOn = !!tpfStatus || tpfPublic===true;"), "5i signed in, the status call's answer counts too");
    const list = fs.readFileSync(path.join(REPO, "docs", "product", "TRIAL-PLAN-FIRST-NO-CARD.md"), "utf8");
    t.ok(["No credit card", "Every feature free for 14 days", "index.html", "REEL-PAYCHEQUE-APPROVED-2026-11-08.md", "LEGAL-PACKET.md", "App Store and Google Play listings"].every((x) => list.includes(x)),
      "5j the \"no card\" places are listed for the day it goes live");
  }

  // ── 7. THE CONSOLES LIST ────────────────────────────────────────────────────────────────────────
  {
    const doc = fs.readFileSync(path.join(REPO, "docs", "ops", "TRIAL-PLAN-FIRST-CONSOLES.md"), "utf8");
    t.ok(["app.flourishmoney.plus.monthly", "app.flourishmoney.plus.annual", "app.flourishmoney.founding.annual", "`flourish_plus`", "`monthly`, `annual`, `founding`"].every((x) => doc.includes(x)), "7a every main-plan product, founding included, in both stores");
    t.ok(/Type: \*\*Free\*\*\. Duration: \*\*2 Weeks\*\*/.test(doc) && /Free trial\*\*, Duration \*\*2 weeks\*\*/.test(doc), "7b 14 days free on both: Apple's Free 2 Weeks, Play's free-trial phase of 2 weeks");
    t.ok(/customer\.subscription\.created/.test(doc) && /customer\.subscription\.trial_will_end/.test(doc) && /TRIAL_PLAN_FIRST_SINCE/.test(doc), "7c the Stripe events the server now hears, and the two Netlify settings");
    t.ok((doc.match(/\*\*Cannot be changed later:\*\*/g) || []).length >= 2 && /\*\*Permanent once created\.\*\*/.test(doc), "7d which fields cannot be changed later");
    t.ok(/Prices stay exactly as they are/.test(doc) && /## Order on the day/.test(doc), "7e prices unchanged, and the order on the day");
  }

  process.env = saved;
  t.summary("trialPlanFirst.test");
})();
