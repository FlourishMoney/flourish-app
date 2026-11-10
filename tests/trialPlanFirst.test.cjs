// tests/trialPlanFirst.test.cjs
// -----------------------------------------------------------------------------
// TRIAL_PLAN_FIRST (Amanda, 2026-11-10): the usual app-store trial, behind a switch that is off by default.
//   1. the switch (item 4): off is today's rule exactly; on, only an account made after its time loses the account
//      trial; the store builds learn it from the server.
//   2. the plans screen first (item 1): who sees it and how, the lines above each plan's button, the stores' own
//      eligibility answer, and the app's wiring. The checkout and the founding seats: tests/trialPlanFirstBilling.test.cjs.
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

  process.env = saved;
  t.summary("trialPlanFirst.test");
})();
