// tests/trialPlanFirst.test.cjs
// -----------------------------------------------------------------------------
// TRIAL_PLAN_FIRST (Amanda, 2026-11-10): the usual app-store trial, behind a switch that is off by default.
//   1. the switch (item 4): off is today's rule exactly; on, only an account made after its time loses the account
//      trial; the store builds learn it from the server.
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

  process.env = saved;
  t.summary("trialPlanFirst.test");
})();
