// tests/billingUpgradeScreen.test.cjs
// -----------------------------------------------------------------------------
// THE UPGRADE SCREEN: WHEN IT EXISTS AT ALL, AND WHAT IT IS ALLOWED TO SAY.
//
// Billing is off. It goes live on 2026-10-26 by setting BILLING_ENABLED in Netlify, and until
// then no household should see a price, a plan or a link to one — and the iOS and Android builds
// must never see one at all, because Apple and Google require their own purchase systems for
// digital subscriptions and shipping a web checkout is a rejected build.
//
// What this pins:
//   • every billing surface is hidden while the flag is off, and the status call 404s
//   • the founding offer is shown only to a waitlist founding household (1 to 50) — decided by the SERVER
//   • the success redirect never changes anybody's plan
//   • nothing billing-related renders in a native shell
//   • the free-limit prompt keeps its ordinary message when billing is off
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");

const APP = fs.readFileSync(path.join(__dirname, "..", "src", "App.jsx"), "utf8");
const AUTH_PATH = require.resolve("../netlify/functions/_lib/auth.js");
const API_PATH = require.resolve("../netlify/functions/_lib/stripeApi.js");
const BILLING_PATH = require.resolve("../netlify/functions/billing.js");

// A fake supabase-js surface. rpc() answers the 0016 founding lookup the way the SQL does: case and
// whitespace ignored, test rows skipped, positions 1 to 50 only.
function fakeAdmin(state) {
  const api = (table) => {
    const q = {
      _f: [],
      select() { return q; },
      eq(col, val) { q._f.push(r => r[col] === val); return q; },
      not(col, op, val) { q._f.push(r => (op === "is" && val === null ? r[col] != null : true)); return q; },
      _rows() { return (state.rows[table] || []).filter(r => q._f.every(fn => fn(r))); },
      async maybeSingle() { return { data: q._rows()[0] || null, error: null }; },
      then(res) { return Promise.resolve({ data: q._rows(), error: null }).then(res); },
    };
    return q;
  };
  const norm = (e) => String(e || "").replace(/\s+/g, "").toLowerCase();
  const rpc = async (name, args) => {
    // waitlist_founding_number_for_email (0017). This file's fixtures never void a number or pass 50.
    if (name === "founding_seats_taken") return { data: state.seats || 0, error: null };   // 0032 (2026-10-29)
    if (name !== "waitlist_founding_number_for_email") return { data: null, error: { message: "no such function" } };
    const hits = (state.rows.waitlist || []).filter(r => norm(r.email) === norm(args.p_email) && norm(args.p_email)
      && !r.is_test && Number.isInteger(r.founding_position) && r.founding_position >= 1);
    return { data: hits.length ? Math.min(...hits.map(r => r.founding_position)) : null, error: null };
  };
  const user = state.user || { email: "a@b.c", email_confirmed_at: "2026-10-01T00:00:00Z", app_metadata: { email_confirmation: "link" } };
  return { from: api, rpc, auth: { admin: { getUserById: async () => ({ data: { user } }) } } };
}

function loadBilling({ user_id = "u1", state, stripePost }) {
  delete require.cache[BILLING_PATH];
  delete require.cache[AUTH_PATH];
  delete require.cache[API_PATH];
  const real = require("../netlify/functions/_lib/auth.js");
  require.cache[AUTH_PATH].exports = {
    ...real,
    getUserFromRequest: async () => ({ user_id, error: null }),
    getAdminClient: () => fakeAdmin(state),
  };
  require.cache[API_PATH] = { id: API_PATH, filename: API_PATH, loaded: true,
    exports: { stripeGet: async () => ({ data: [] }), stripePost: stripePost || (async () => ({ id: "cs_1", url: "https://stripe.test/pay" })) } };
  const mod = require(BILLING_PATH);
  delete require.cache[BILLING_PATH];
  return mod;
}
const post = (body) => ({ httpMethod: "POST", headers: {}, body: JSON.stringify(body) });
// A waitlist of n households holding positions 1..n (and none after 50, as the 0014 trigger does).
const waitlist = (n) => Array.from({ length: n }, (_, i) => ({
  email: `h${i + 1}@example.test`, is_test: false, founding_position: i < 50 ? i + 1 : null,
}));
// Confirmed by clicking our link, as a founding household's account must be (round 3).
const confirmed = (email) => ({ email, email_confirmed_at: "2026-10-01T00:00:00Z", app_metadata: { email_confirmation: "link" } });

(async () => {
  const t = create();
  const vis = await import("../src/lib/billingVisibility.js");
  const cohort = require("../netlify/functions/_lib/foundingCohort.js");
  const savedFlag = process.env.BILLING_ENABLED;

  // ── 1. Hidden while the flag is off ──────────────────────────────────────────────────────────
  {
    delete process.env.BILLING_ENABLED;
    const state = { rows: { profiles: [{ user_id: "u1", founder_flag: true }] } };
    const billing = loadBilling({ state });
    const res = await billing.handler(post({ action: "status" }));
    t.eq(res.statusCode, 404, "1a the status call 404s while BILLING_ENABLED is off");
    t.eq(JSON.parse(res.body).enabled, undefined, "1b …and says nothing about billing existing");

    // Whatever the client does with a 404, the answer is the same: show nothing.
    for (const status of [null, undefined, {}, { error: "not_found" }, { enabled: false }, "404"]) {
      t.eq(vis.billingUiState({ status, native: false, paid: false }).show, false,
        `1c a status of ${JSON.stringify(status)} hides every billing surface`);
    }
    t.eq(vis.offeredPlans({ status: null }).every(p => p.key !== "founding_annual"), true,
      "1d …and the founding price is never offered without a server answer");

    process.env.BILLING_ENABLED = "true";
    const on = loadBilling({ state });
    const res2 = await on.handler(post({ action: "status" }));
    t.eq(res2.statusCode, 200, "1e turning the flag on is the ONLY step needed — the same call now answers");
    t.eq(JSON.parse(res2.body).enabled, true, "1f …with billing on");
    t.eq(vis.billingUiState({ status: JSON.parse(res2.body), native: false, paid: false }).show, true,
      "1g …and the screen becomes visible on that answer alone");
  }

  // ── 2. The founding offer belongs to the first 50 who subscribe (2026-10-29: founding seats) ──────
  {
    process.env.BILLING_ENABLED = "true";
    t.eq(cohort.FOUNDING_COHORT_LIMIT, 50, "2a the cohort is 50 households");
    t.eq(cohort.isFoundingPosition(1), true, "2b position 1 is a founding position");
    t.eq(cohort.isFoundingPosition(50), true, "2c …and so is 50");
    // 2026-10-14 (0017): a test row's number is void and never reissued, so a real household's number can
    // be past 50. The limit is on REAL holders, kept by the database; the 51st real household gets none
    // (2g below; foundingBilling 10d; the 0017 trigger).
    t.eq([cohort.isFoundingPosition(0), cohort.isFoundingPosition(53)], [false, true], "2d 0 is not a founding number; 53 is, when the database issued it after voided test numbers");
    t.eq(cohort.isFoundingPosition(null), false, "2e a position that could not be established is NOT a founding position");

    // The seats held decide (0032), not the waitlist position: 49 held, one left; 50 held, none.
    const ask = async (email, seats) => {
      const state = { rows: { waitlist: waitlist(60), subscriptions: [] }, user: confirmed(email), seats };
      const billing = loadBilling({ state });
      return JSON.parse((await billing.handler(post({ action: "status" }))).body);
    };
    const at50 = await ask("h51@example.test", 49), at51 = await ask("h1@example.test", 50);
    t.eq(at50.founding.available, true, "2f with 49 seats held, a confirmed household (waitlist #51 here) is offered the founding price");
    t.eq(at51.founding.available, false, "2g with 50 held nobody is (waitlist #1 here) — the SERVER decides, from the seats, not the client");
    t.eq(at50.founding.cohortLimit, 50, "2h …and the limit travels with the answer, so the label cannot drift");

    t.ok(vis.offeredPlans({ status: at50 }).some(p => p.key === "founding_annual"),
      "2i the screen shows the founding plan to a founding household");
    t.ok(vis.offeredPlans({ status: at51 }).every(p => p.key !== "founding_annual"),
      "2j …and not to anyone else, who still sees the regular plans");
    t.eq(vis.offeredPlans({ status: at51 }).map(p => p.key).join(","), "monthly,annual", "2j2 …monthly and annual");
    t.eq(vis.offeredPlans({ status: at50 }).find(p => p.key === "founding_annual").note,
      "Founding price for the first 50 households. Locked in while you stay subscribed.",
      "2k the label is exactly the approved sentence, with the server's number in it");

    // And the rule is enforced where money changes hands, not only where the price is shown.
    let stripeCalls = 0;
    const state = { rows: { waitlist: waitlist(60) }, user: confirmed("h1@example.test"), seats: 50 };
    const billing = loadBilling({ state, stripePost: async () => { stripeCalls++; return { url: "x" }; } });
    const res = await billing.handler(post({ action: "create_checkout_session", plan_key: "founding_annual" }));
    t.eq(res.statusCode, 403, "2l a client posting for the founding price once 50 seats are held is refused");
    t.eq(stripeCalls, 0, "2m …before Stripe is asked for anything");
  }

  // ── 3. The redirect back from Stripe never sets a plan ───────────────────────────────────────
  {
    const success = vis.billingReturnNotice("?billing=success&session_id=cs_test_123");
    t.eq(success.kind, "success", "3a the success return is recognised");
    t.ok(/will update when Stripe confirms/.test(success.text), "3b …and says the plan follows the confirmation");
    t.eq(Object.keys(success).sort().join(","), "kind,text",
      "3c the return carries a MESSAGE and nothing else — there is no plan in it to apply");
    t.eq(vis.billingReturnNotice("?billing=cancelled").kind, "cancelled", "3d a cancelled checkout is its own message");
    t.ok(/Nothing was charged/.test(vis.billingReturnNotice("?billing=cancelled").text), "3e …and says so plainly");
    for (const junk of ["", "?", "?billing=", "?billing=premium", "?foo=bar", null, undefined, "?billing=success&billing=evil"])
      if (junk !== "?billing=success&billing=evil")
        t.eq(vis.billingReturnNotice(junk)?.kind ?? null, junk === "?billing=cancelled" ? "cancelled" : null,
          `3f a redirect of ${JSON.stringify(junk)} grants nothing`);

    // The wiring, read from the source: the handler refreshes from the server and assigns no plan.
    const handler = APP.match(/billingReturnNotice\([\s\S]{0,1200}?\n\s{2}\},\s*\[[^\]]*\]\);/);
    t.ok(!!handler, "3g the return is handled in App.jsx");
    const body = handler ? handler[0] : "";
    t.ok(/refreshPlanFromProfile/.test(body), "3h …by re-reading the plan from the server");
    t.ok(!/setIsPremium|isPremium\s*:\s*true|plan\s*:\s*["'](premium|plus|pro)/.test(body),
      "3i …and never by setting a paid plan from the redirect itself");
  }

  // ── 4. Nothing billing-related in a native shell ─────────────────────────────────────────────
  {
    const on = { enabled: true, founding: { available: true, cohortLimit: 50 } };
    const shells = [
      ["iOS", { Capacitor: { getPlatform: () => "ios" }, location: { protocol: "capacitor:" } }],
      ["Android", { Capacitor: { getPlatform: () => "android" }, location: { protocol: "http:" } }],
      ["a shell whose bridge has not loaded", { location: { protocol: "capacitor:" } }],
      ["a file:// shell", { location: { protocol: "file:" } }],
    ];
    for (const [label, win] of shells) {
      t.eq(vis.isNativeApp(win), true, `4a ${label} is a native app`);
      t.eq(vis.billingUiState({ status: on, native: vis.isNativeApp(win), paid: false }).show, false,
        `4b …and shows no billing surface even with billing ON and a founding slot free`);
    }
    t.eq(vis.isNativeApp({ location: { protocol: "https:" } }), false, "4c the web app is not a native app");
    t.eq(vis.billingUiState({ status: on, native: false, paid: false }).mode, "plans", "4d …and does show the plans");
    t.eq(vis.billingUiState({ status: on, native: false, paid: true }).mode, "manage",
      "4e a paying household is offered the portal instead of the plans");

    // The screen itself is rendered behind the same gate in App.jsx.
    t.ok(/showUpgrade\s*&&\s*billingUi\.show/.test(APP) || /billingUi\.show\s*&&/.test(APP),
      "4f App.jsx renders the upgrade screen only when that gate says show");
  }

  // ── 5. The free-limit prompt is unchanged while billing is off ───────────────────────────────
  {
    const limits = await import("../src/lib/usageLimits.js");
    t.eq(limits.FREE_TIER_LIMITS.coachMessagesPerWeek, 2, "5a the free limit is still 2 coach messages a week");
    t.ok(/\{freeMsgsLeft\}\/\{FREE_LIMIT\}/.test(APP), "5b the prompt still shows how many are left of the limit");
    t.ok(/left this week/.test(APP), "5c …with its ordinary wording, which billing did not touch");
    t.ok(!/left this week[\s\S]{0,400}formatPrice|left this week[\s\S]{0,400}\$11\.99/.test(APP),
      "5d …and no price appears beside it");
    // No price is typed into App.jsx: every amount comes from src/lib/pricing.js.
    t.ok(!/\b(11\.99|99\.99|79\.99|7\.99|59\.99)\b/.test(APP),
      "5e no price is hard-coded in App.jsx — pricing.js is the only source");
  }

  // ── 6. Found reviewing this work: two ways a price still reached somewhere it must not ───────
  {
    // (a) Android. isCapacitorIOS() is iOS-only, so every surface gated on it — the feature
    // paywall with its price table, the dashboard's upgrade card — rendered in the ANDROID build.
    // Google requires its own billing for digital subscriptions just as Apple does.
    t.ok(/showPaywall\s*&&\s*!isNativeApp\(\)/.test(APP),
      "6a the feature paywall, which lists prices, is hidden in EVERY native shell, not just iOS");
    t.ok(/!data\.isPremium&&!isNativeApp\(\)&&onUpgrade/.test(APP),
      "6b …and so is the dashboard's upgrade card");
    t.ok(!/showPaywall\s*&&\s*!isCapacitorIOS\(\)/.test(APP),
      "6c no billing surface is gated on iOS alone any more");

    // (b) Currency. The only Stripe price ids that exist are CAD (STRIPE_PRICE_*_CAD), so a US
    // profile was shown $7.99/$59.99 and would have been charged $11.99 CAD. The screen may only
    // show a price the server can actually charge.
    const st = { enabled: true, founding: { available: true, cohortLimit: 50 } };
    const us = vis.offeredPlans({ status: st, country: "US" });
    const ca = vis.offeredPlans({ status: st, country: "CA" });
    t.eq(us.map(p => p.price).join(" "), ca.map(p => p.price).join(" "),
      "6d a US profile is shown the same prices as a CA one — the only prices that can be charged");
    t.ok(us.every(p => !/7\.99|59\.99/.test(p.price)), "6e …not the unreviewed US amounts");
    t.ok(ca.every(p => /CAD/.test(p.note) || p.key === "founding_annual" || /Save/.test(p.note)),
      "6f …and the currency is stated");
  }

  // ── The subscriber's line (Amanda, 2026-10-20) ───────────────────────────────────────────────────
  // Plan switching is off in Stripe's portal (it could sell the founding price to anyone, runbook section 3),
  // so no screen may promise it.
  {
    const { loadApp, textOf, describe } = require("./_renderApp.cjs");
    let A = null;
    try { A = loadApp(["UpgradeScreen"]); } catch (e) { t.ok(false, `5a App.jsx bundles: ${describe(e)}`); }
    if (A) {
      const txt = textOf(A.render(A.h(A.UpgradeScreen, { status: { enabled: true, paid: true, manageable: true }, mode: "manage", notice: null, onClose: () => {} })));
      t.ok(txt.includes("Change your card or cancel in Stripe's billing portal."), "5a the checkout screen tells a subscriber: change your card or cancel, in Stripe's billing portal");
      t.ok(/Manage subscription/.test(txt), "5b …with its Manage subscription button");
    }
    const APP_SRC = fs.readFileSync(path.join(__dirname, "..", "src", "App.jsx"), "utf8");
    t.ok(/\? "Change your card or cancel\."/.test(APP_SRC), "5c the Settings card says the same, shorter");
    t.ok(!/switch plan/i.test(APP_SRC), "5d no screen promises a plan switch");
    // The approved return lines (2026-10-20, ChatGPT and Grok), word for word.
    t.eq([vis.billingReturnNotice("?billing=success&session_id=cs_test_1").text, vis.billingReturnNotice("?billing=portal_return").text],
      ["Payment received. Your plan will update when Stripe confirms it, usually within a few seconds.", "Back from Stripe's billing portal."],
      "5e coming back from checkout and from the portal: the approved lines");
    t.ok(/\? "You can cancel any time\." : "14 days free\. Cancel any time\."/.test(APP_SRC), "5f the web locked screen: \"You can cancel any time.\"");
  }

  // ── 6. The plans, founding first, select then review (audit H14, 2026-10-26) ─────────────────────
  // Nothing here changes who pays, when or how much: the plans and every amount are still offeredPlans'
  // (the server's answer and pricing.js), and checkout still posts only a plan key.
  {
    const U = await import("../src/lib/upgradeFlow.js");
    const withFounding = vis.offeredPlans({ status: { enabled: true, founding: { available: true, cohortLimit: 50 } } });
    const without = vis.offeredPlans({ status: { enabled: true, founding: { available: false, cohortLimit: 50 } } });
    t.eq(U.upgradeChoices(withFounding).map(p => p.key), ["founding_annual", "monthly", "annual"], "6a the founding price first when the server offers it");
    t.eq(U.upgradeChoices(without).map(p => p.key), ["monthly", "annual"], "6b …and never when it does not (the client adds no plan)");
    t.eq(U.upgradeChoices(withFounding).map(p => p.price).sort(), withFounding.map(p => p.price).sort(), "6c the same plans and prices as offeredPlans, only in a different order");
    t.eq(U.selectedChoice(U.upgradeChoices(withFounding)), "founding_annual", "6d the founding price is selected when the screen opens");
    t.eq(U.selectedChoice(U.upgradeChoices(without)), "monthly", "6e without it, the first plan is");
    t.eq(U.selectedChoice(U.upgradeChoices(without), "annual"), "annual", "6f a choice stays chosen");
    t.eq(U.selectedChoice(U.upgradeChoices(without), "founding_annual"), "monthly", "6g a key that is not offered falls back to the first plan");
    t.eq(U.selectedChoice([]), null, "6h no plans, nothing selected");
    t.eq(U.trialEndLabel(Date.UTC(2026, 10, 9, 17), { trialActive: true }), "November 9, 2026", "6i the trial line names the end date");
    t.eq(U.trialEndLabel(Date.UTC(2026, 10, 9, 17), { trialActive: false }), null, "6j …only on the trial");
    t.eq(U.upgradeTrialLine(null), null, "6k no date, no trial line");
    t.eq(U.reviewChargeLine("monthly") !== U.reviewChargeLine("annual") && U.reviewChargeLine("annual") === U.reviewChargeLine("founding_annual"), true,
      "6l the review's charge line is per billing period: monthly, or yearly for both annual plans");

    const APP_SRC = fs.readFileSync(path.join(__dirname, "..", "src", "App.jsx"), "utf8");
    const up = APP_SRC.slice(APP_SRC.indexOf("function UpgradeScreen("), APP_SRC.indexOf("\nfunction ", APP_SRC.indexOf("function UpgradeScreen(") + 10));
    t.ok(/function UpgradeScreen\(\{status, mode, notice, onClose, onManage\}\)\{/.test(up), "6m the screen's props are unchanged, so every caller still opens it the same way");
    t.ok(/const choices = upgradeChoices\(plans\);/.test(up) && /const plans = offeredPlans\(\{status\}\);/.test(up), "6n the rows are offeredPlans in upgradeChoices' order");
    t.ok(/<input type="radio" name="upgrade-plan" value=\{plan\.key\} checked=\{on\} onChange=\{\(\)=>setPicked\(plan\.key\)\}/.test(up),
      "6o a row is a radio button: tapping it selects the plan");
    t.eq((up.match(/onClick=\{\(\)=>go\(/g) || []).length, 1, "6p exactly one control starts checkout…");
    t.ok(/<button data-review-confirm="" onClick=\{\(\)=>go\(chosen\.key\)\}/.test(up), "6q …the review step's confirm, for the chosen plan");
    t.ok(/onClick=\{\(\)=>\{setError\(""\);setStep\("review"\);\}\}/.test(up) && /\(step==="review"&&chosen\) \?/.test(up), "6r Continue goes to the review step, not to Stripe");
    t.ok(/onClick=\{\(\)=>\{setStep\("choose"\);setError\(""\);\}\}/.test(up), "6s the review step has a way back to the plans");
    t.ok(/body: JSON\.stringify\(planKey==="__portal__"\s*\? \{action:"create_portal_session"\}\s*: \{action:"create_checkout_session", plan_key:planKey\}\)/.test(up),
      "6t checkout still posts only the plan key");

    const { loadApp, textOf, describe } = require("./_renderApp.cjs");
    let A = null;
    try { A = loadApp(["UpgradeScreen"]); } catch (e) { t.ok(false, `6u App.jsx bundles: ${describe(e)}`); }
    if (A) {
      const html = A.render(A.h(A.UpgradeScreen, { status: { enabled: true, paid: false, founding: { available: true, cohortLimit: 50 } }, mode: "plans", notice: null, onClose: () => {} }));
      const order = [...html.matchAll(/data-plan-choice="([a-z_]+)" data-selected="(true|false)"/g)].map(m => m[1] + (m[2] === "true" ? "*" : ""));
      t.eq(order, ["founding_annual*", "monthly", "annual"], "6u rendered: founding first and selected, then monthly and annual");
      const txt = textOf(html);
      t.ok(txt.includes(U.UPGRADE_COPY.headline) && U.UPGRADE_COPY.bullets.every(b => txt.includes(b)) && txt.includes(U.UPGRADE_COPY.continue),
        "6v the headline, the three lines and Continue are on the screen");
      t.ok(!txt.includes("Opening checkout…") && !txt.includes(U.UPGRADE_COPY.reviewConfirm), "6w nothing is on its way to Stripe when the screen opens");
      const plain = textOf(A.render(A.h(A.UpgradeScreen, { status: { enabled: true, paid: false }, mode: "plans", notice: null, onClose: () => {} })));
      t.ok(!/Founding/.test(plain) && plain.includes("$11.99 a month") && plain.includes("$99.99 a year"), "6x no founding offer: monthly and annual only, at the landing's prices");
    }

    // The approved words (2026-10-27): the code and docs/product/SIGNUP-PATH-WORDS.md say the same, line for line.
    const S = await import("../src/lib/signupUi.js");
    const mine = [...U.SIGNUP_PATH_WORDS, ...Object.values(S.SIGNUP_COPY)];
    const DOC = fs.readFileSync(path.join(__dirname, "..", "docs", "product", "SIGNUP-PATH-WORDS.md"), "utf8");
    const inDoc = [...DOC.matchAll(/^\| \d+ \| [a-z0-9-]+ \| `([^`]+)` \|/gm)].map(m => m[1]);
    t.eq(inDoc.length, 14, "6y the approved list has fourteen lines");
    t.eq(mine.filter(w => !inDoc.includes(w)), [], "6z every approved line in the code is in the list, word for word");
    t.eq(inDoc.filter(w => !mine.includes(w)), [], "6z2 …and the list has none the code does not");
    t.eq(U.upgradeTrialLine("November 9, 2026"), "Your trial ends on November 9, 2026.", "6z3 the trial line carries the server's date");
    const lib = ["upgradeFlow.js", "signupUi.js"].map(f => fs.readFileSync(path.join(__dirname, "..", "src", "lib", f), "utf8")).join("\n");
    t.ok(!/\[WORDS:/.test(lib + APP_SRC), "6z4 no [WORDS: placeholder is left in the app");
  }

  if (savedFlag === undefined) delete process.env.BILLING_ENABLED; else process.env.BILLING_ENABLED = savedFlag;
  t.summary("billingUpgradeScreen.test");
})();
