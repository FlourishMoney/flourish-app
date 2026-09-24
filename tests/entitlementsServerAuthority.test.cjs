// tests/entitlementsServerAuthority.test.cjs
// -----------------------------------------------------------------------------
// THE SERVER PROFILE DECIDES WHAT AN ACCOUNT MAY DO. Item 7 of the Wednesday prompt, for the items
// in scope here (2, 3 and 4; items 5 and 6 are handled separately).
//
// The cases this file owns, which no single other suite covers:
//   - a new signup is a trial, not a founder (read off the migration that creates it);
//   - server-side, a 3-day-old trial is unlimited and a 15-day-old one is not;
//   - an extended trial_ends_at keeps a 20-day-old trial unlimited (decision P18);
//   - a stale "beta_founder" in localStorage does NOT survive a profile that says free. This one
//     runs the REAL refreshPlanFromProfile body, read out of App.jsx at test time, because that is
//     the code that decides whether the cache wins or loses.
//
// The week-boundary cases live in tests/coachLimits.test.cjs; the rule itself in
// tests/planFromProfile.test.cjs.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");
const S = require("../netlify/functions/_lib/planRules.js");

const REPO = path.join(__dirname, "..");
const read = (...p) => fs.readFileSync(path.join(REPO, ...p), "utf8");
const DAY = 86400000;
const NOW = Date.parse("2026-09-21T12:00:00Z");
const ago = (d) => new Date(NOW - d * DAY).toISOString();
const ahead = (d) => new Date(NOW + d * DAY).toISOString();

(async () => {
  const t = create();

  // ── 1. A new signup is a trial, not a founder ────────────────────────────────────────────────
  // The trigger is SQL, so this reads what the migration installs. Applying it to the local
  // database and inserting a real auth.users row produced exactly this: trial / false / 14 days.
  {
    const m = read("supabase", "migrations", "0007_trial_only_signups.sql");
    const fn = m.slice(m.indexOf("create or replace function public.handle_new_user()"), m.indexOf("-- 3. Guard trial_ends_at"));
    t.ok(/values \(new\.id, 'trial', now\(\), now\(\) \+ interval '14 days', false\)/.test(fn),
      "1a a new row is plan trial, trial_started_at now, trial_ends_at +14 days, founder_flag FALSE");
    t.ok(!/founder_cutoff/.test(fn), "1b the 2027-01-01 founder cutoff is gone from the live function");
    t.ok(!/2027-01-01/.test(fn), "1c …the date too");
    // Existing rows must not move: the file may not contain an UPDATE outside its comments.
    const live = m.split("\n").filter(l => l.trim() && !l.trim().startsWith("--")).join("\n");
    t.ok(!/\bupdate\b/i.test(live), "1d the migration runs no UPDATE, so no existing row changes");
    t.ok(/add column if not exists trial_ends_at/.test(live), "1e it adds trial_ends_at, nullable");
    t.ok(/trial_ends_at\s+is distinct from/.test(live), "1f and guards it, or a browser could extend its own trial");
    t.ok(/-- ROLLBACK/.test(m) && /drop column if exists trial_ends_at/.test(m), "1g the rollback is in the file");
    t.ok(/group by plan, founder_flag/.test(m), "1h and a counts-only verification query");
    t.ok(!/select .*email/i.test(m), "1i which lists no address");
  }

  // ── 2. Server-side trial arithmetic ──────────────────────────────────────────────────────────
  {
    t.eq(S.isUnlimitedProfile({ plan: "trial", trial_started_at: ago(3) }, NOW), true, "2a a 3-day-old trial is unlimited server-side");
    t.eq(S.isUnlimitedProfile({ plan: "trial", trial_started_at: ago(15) }, NOW), false, "2b a 15-day-old trial is not");
    t.eq(S.derivePlan({ plan: "trial", trial_started_at: ago(15) }, NOW), "free", "2c …it reads as free");
    // Decision P18: billing is late, the founder runs the extension statement, the cohort keeps working.
    t.eq(S.isUnlimitedProfile({ plan: "trial", trial_started_at: ago(20), trial_ends_at: ahead(8) }, NOW), true,
      "2d an extended trial_ends_at keeps a 20-day-old trial unlimited");
    t.eq(S.isUnlimitedProfile({ plan: "trial", trial_started_at: ago(20) }, NOW), false,
      "2e …and without the extension the same row is not, so the extension is doing the work");
    t.eq(S.isUnlimitedProfile({ founder_flag: true, plan: "free", trial_started_at: ago(400) }, NOW), true,
      "2f an existing founder is unaffected by any of this");
  }

  // ── 3. A stale beta_founder in localStorage loses to the server ──────────────────────────────
  // Runs the REAL refreshPlanFromProfile from App.jsx, compiled with stubs, so this tests the code
  // that ships rather than a description of it.
  {
    const app = read("src", "App.jsx");
    const start = app.indexOf("const refreshPlanFromProfile = async (userId) => {");
    t.ok(start > 0, "3a refreshPlanFromProfile is in App.jsx");
    const bodyStart = app.indexOf("async (userId)", start);
    let i = app.indexOf("{", bodyStart), depth = 0, end = -1;
    for (let k = i; k < app.length; k++) {
      if (app[k] === "{") depth++;
      else if (app[k] === "}") { depth--; if (depth === 0) { end = k + 1; break; } }
    }
    const fnText = app.slice(bodyStart, end);

    const make = (profile) => {
      const store = new Map([["flourish_plan", "beta_founder"]]);
      const calls = { setPlan: [], setIsPremium: [] };
      const supabase = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: profile }) }) }) }) };
      const localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) };
      const setPlan = (p) => { calls.setPlan.push(p); store.set("flourish_plan", p); return true; };
      const setIsPremium = (v) => calls.setIsPremium.push(v);
      const { derivePlan } = require("../netlify/functions/_lib/planRules.js"); // same rule, CJS side
      const fn = new Function("supabase", "derivePlan", "setPlan", "setIsPremium", "isCapacitorIOS", "localStorage", "console",
        `return (${fnText});`)(supabase, derivePlan, setPlan, setIsPremium, () => false, localStorage, { error() {} });
      return { fn, store, calls };
    };

    {
      const { fn, store, calls } = make({ plan: "free", founder_flag: false, trial_started_at: null, trial_ends_at: null });
      const result = await fn("user-1");
      t.eq(result, "free", "3b a profile that says free resolves to free…");
      t.eq(store.get("flourish_plan"), "free", "3c …and OVERWRITES a stale beta_founder sitting in localStorage");
      t.eq(JSON.stringify(calls.setIsPremium), JSON.stringify([false]), "3d …and the premium flag follows the server, not the cache");
    }
    {
      const { store } = make({ plan: "free", founder_flag: false });
      t.eq(store.get("flourish_plan"), "beta_founder", "3e (control) the stale value is really there before the call");
    }
    {
      const { fn, store } = make({ plan: "trial", founder_flag: false, trial_started_at: ago(1), trial_ends_at: ahead(13) });
      t.eq(await fn("user-2"), "trial", "3f a fresh trial row resolves to trial");
      t.eq(store.get("flourish_trial_ends_at"), ahead(13), "3g …and the end date is cached for the UI");
    }
    {
      const { fn, store } = make({ plan: "free", founder_flag: true });
      t.eq(await fn("user-3"), "beta_founder", "3h a REAL founder row still resolves to beta_founder");
      t.eq(store.get("flourish_plan"), "beta_founder", "3i …so existing founders keep what they have");
    }
    {
      const { fn, store, calls } = make(null);
      t.eq(await fn("user-4"), null, "3j no profile row: nothing is derived");
      t.eq(calls.setPlan.length, 0, "3k …and the cache is left alone rather than being downgraded on a missing read");
      t.eq(store.get("flourish_plan"), "beta_founder", "3l …so a transient read failure cannot strip a founder");
    }
    {
      const { fn, calls } = make(undefined);
      t.eq(await fn(null), null, "3m no user id: no read, no write");
      t.eq(calls.setPlan.length, 0, "3n …nothing cached");
    }
  }

  // ── 4. A beta code grants nothing any more ───────────────────────────────────────────────────
  {
    const app = read("src", "App.jsx");
    const limits = read("src", "lib", "usageLimits.js");
    t.ok(!/applyBetaCodeFounderUpgrade\(/.test(app), "4a nothing in App.jsx calls the old grant");
    t.ok(!/export function applyBetaCodeFounderUpgrade/.test(limits), "4b …and it no longer exists to be called");
    t.ok(/onPromoValid=\{async \(\)=>\{ await refreshPlanFromProfile/.test(app),
      "4c the promo field re-reads the server profile instead of granting a plan");
    t.ok(/validateBetaCode\(promo\)/.test(app), "4d …and still checks the code against the server");
  }

  // ── 5. The Upgrade button grants nothing ─────────────────────────────────────────────────────
  // ChatGPT's HIGH 2 on PR #2: the paywall CTA was wired to a handler that ran setPlan("premium")
  // and setIsPremium(true) in the browser. No payment exists — Stripe is planned for 26 Oct — so
  // tapping "Start 14 days free" handed a free account every client-side paid gate until the next
  // profile read, and with a failed read (KNOWN-DEFECTS #10) it could sit there.
  //
  // This runs the REAL onClick out of App.jsx, compiled with stubs, and watches the plan.
  {
    const app = read("src", "App.jsx");
    const cta = app.indexOf("{/* CTA — says what is true.");
    t.ok(cta > 0, "5a the paywall CTA is where this test reads it from");
    const oc = app.indexOf("onClick={", cta);
    t.ok(oc > cta, "5b …and it has an onClick");
    let i = app.indexOf("{", oc + 8), depth = 0, end = -1;
    for (let k = i; k < app.length; k++) {
      if (app[k] === "{") depth++;
      else if (app[k] === "}") { depth--; if (depth === 0) { end = k; break; } }
    }
    const handler = app.slice(i + 1, end);

    const calls = { setPlan: [], setIsPremium: [], note: [] };
    const store = new Map([["flourish_plan", "free"]]);
    let ran = null;
    try {
      new Function("setUpgradeNote", "setPlan", "setIsPremium", "localStorage",
        `return (${handler});`)(
          (v) => calls.note.push(v),
          (v) => { calls.setPlan.push(v); store.set("flourish_plan", v); },
          (v) => calls.setIsPremium.push(v),
          { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) }
        )();
      ran = "ok";
    } catch (e) { ran = `threw: ${e.message}`; }

    t.eq(ran, "ok", "5c the real handler runs (anything it reaches beyond the stubs would show here)");
    t.eq(calls.setPlan.length, 0, "5d clicking Upgrade sets NO plan");
    t.eq(calls.setIsPremium.length, 0, "5e …and no premium flag");
    t.eq(store.get("flourish_plan"), "free", "5f …so a free account is still free after the click");
    t.eq(calls.note.length, 1, "5g …and it says something instead of doing nothing");
    const note = calls.note[0] || "";
    t.ok(/aren't open yet|open soon/i.test(note), "5h …that paid plans are not open yet");
    t.ok(/hasn't changed|not changed/i.test(note) && /charged/i.test(note),
      "5i …and that nothing was charged and nothing changed, which is the true part");

    // And the wiring that made the grant possible is gone, so it cannot come back by prop.
    t.ok(!/setPlan\("premium"\)/.test(app), "5j nothing in App.jsx sets the plan to premium in the browser");
    t.ok(/function Paywall\(\{onClose,onPromoValid,country\}\)/.test(app), "5k Paywall takes no upgrade handler at all");
    // The gate widened from iOS to every native shell (Play requires its own billing too), so the
    // anchor moved with it. Asserted rather than assumed: indexOf returning -1 would slice from the
    // END of the file and make 5l and 5m pass on an empty string.
    const ANCHOR = "if(showPaywall && !isNativeApp())";
    t.ok(app.includes(ANCHOR), "5k2 the paywall render site is where this test thinks it is");
    const site = app.slice(app.indexOf(ANCHOR), app.indexOf(ANCHOR) + 400);
    t.ok(!/onUpgrade=/.test(site), "5l …and the screen that renders it passes none");
    t.ok(/onPromoValid=/.test(site), "5m …while the promo path still re-reads the server profile");
  }

  t.summary("entitlementsServerAuthority.test");
})();
