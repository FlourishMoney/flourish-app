// tests/freeV1Plans.test.cjs
// -----------------------------------------------------------------------------
// FREE V1 ON THE WEBSITE: THE PLANS SCREEN CLOSES ONTO FREE (2026-11-23).
//
// While plans come first (TRIAL_PLAN_FIRST), a new account with no plan, and one whose subscription was cancelled or
// lapsed, was held at a plans screen it could not close ("required"). On the website it now opens once and can be
// closed ("offer_once"), and closing it leaves the account on the free plan. The store apps are unchanged until their
// next builds: they still get "required" (their screens are bundled, and these rules reach them only then).
//   1  the rule (lib/trialPlanFirst.js plansFirstStage), for the website and for a store app
//   2  everyone else is exactly as before, on both
//   3  the app asks it for the website as the website, and never holds the website on a remembered "required"
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");

const APP = fs.readFileSync(path.join(__dirname, "..", "src", "App.jsx"), "utf8");

(async () => {
  const t = create();
  const { plansFirstStage } = await import("../src/lib/trialPlanFirst.js");
  const ON_NEW = { on: true, account_trial: false };
  const ON_OLD = { on: true, account_trial: true };
  const ask = (o) => plansFirstStage({ canSell: true, ...o });

  // ── 1. the rule ──────────────────────────────────────────────────────────────────────────────────
  t.eq(ask({ tpf: ON_NEW, native: false }), "offer_once", "1a website: a new account with no plan sees the plans once, closable (was \"required\")");
  t.eq(ask({ tpf: ON_NEW, native: false, profilePlan: "free" }), "offer_once", "1b website: after a cancel or a lapse (plan back to free): once, closable");
  t.eq(ask({ tpf: ON_NEW, native: true }), "required", "1c store app: a new account with no plan is still held at the plans, as today");
  t.eq(ask({ tpf: ON_NEW, native: true, profilePlan: "free" }), "required", "1d store app: after a cancel, still held, as today");
  t.eq(ask({ tpf: ON_NEW }), "required", "1e no platform given: today's answer (a caller that says nothing is never loosened)");

  // ── 2. everyone else, both platforms, exactly as before ─────────────────────────────────────────
  for (const native of [false, true]) {
    const p = native ? "store app" : "website";
    t.eq(ask({ tpf: ON_NEW, native, paid: true }), null, `2a ${p}: paid (a trial in Stripe or a store included): no plans screen`);
    t.eq(ask({ tpf: ON_NEW, native, coveredBy: "household" }), null, `2b ${p}: a partner's cover: none`);
    t.eq(ask({ tpf: ON_NEW, native, coveredBy: "gift" }), null, `2c ${p}: a gift year: none`);
    t.eq([ask({ tpf: ON_NEW, native, profilePlan: "beta_founder" }), ask({ tpf: ON_NEW, native, profilePlan: "premium" })], [null, null], `2d ${p}: a founder or complimentary plan: none`);
    t.eq(ask({ tpf: ON_NEW, native, pendingInvite: true }), null, `2e ${p}: a partner's invite waiting: none`);
    t.eq(ask({ tpf: ON_NEW, native, demo: true }), null, `2f ${p}: the demo: none`);
    t.eq(plansFirstStage({ tpf: ON_NEW, native, canSell: false }), null, `2g ${p}: nothing to sell here: none`);
    t.eq(ask({ tpf: ON_OLD, native, profilePlan: "trial" }), null, `2h ${p}: inside its 14-day account trial: none, as today`);
    t.eq(ask({ tpf: ON_OLD, native, profilePlan: "free" }), "offer_once", `2i ${p}: an older account after its trial: once, closable, as today`);
    t.eq(ask({ tpf: null, native }), null, `2j ${p}: the switch off: none`);
  }

  // ── 3. the app ───────────────────────────────────────────────────────────────────────────────────
  const call = APP.slice(APP.indexOf("const plansStageNow = plansFirstStage({"), APP.indexOf("const plansStageNow = plansFirstStage({") + 400);
  t.ok(/native: isNativeApp\(\)/.test(call), "3a the app asks for its own platform (the website as the website)");
  const req = APP.slice(APP.indexOf("const plansRequired = "), APP.indexOf("const plansRequired = ") + 500);
  t.ok(/: \(isNativeApp\(\) && recalledRequired\(deviceStorage\(\), user\.id\)/.test(req),
    "3b before the status answers, only a store app is held on a remembered \"required\" (the website never is)");
  t.ok(/plansStageNow==="required"/.test(req), "3c an answered \"required\" still holds a store app, as today");

  t.summary("freeV1Plans.test");
})();
