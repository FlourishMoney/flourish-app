// tests/trialSwitchWords.test.cjs
// -----------------------------------------------------------------------------
// THE LINES THAT ARE TRUE ONLY WHILE TRIAL_PLAN_FIRST IS OFF NOW FOLLOW THE SWITCH (2026-11-13).
// The rule for every one of them: with the switch off (or no answer about it) the screen says today's words, word for
// word; with it on, the approved line (Amanda, 2026-11-13: ChatGPT 100, Grok 100), word for word.
//   1  index.html's two descriptions, put in by the build that turns the switch on (scripts/trial-first-meta.mjs);
//   2  the eight lines: the switch off, each is today's line exactly; on, each is the approved line exactly;
//   3  on the screens themselves (the real components, rendered);
//   4  the website's return from a Stripe checkout: "Payment received" unless that checkout started the 14 days;
//   5  the store plans' disclosure: the approved line unless a plan on the screen claims the 14 days;
//   6  what was left alone on purpose: the website's review line and the reminder email;
//   7  no placeholder is left: the build guard passes the words module, and the builds still run it.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { loadApp, textOf, describe, REPO } = require("./_renderApp.cjs");
const { fakeAdmin, fakeStripe, loadWith } = require("./_trialFakes.cjs");
const { tempDir } = require("./_tmp.cjs");

const APP = fs.readFileSync(path.join(REPO, "src", "App.jsx"), "utf8");
const INDEX = fs.readFileSync(path.join(REPO, "index.html"), "utf8");
const BILLING = require.resolve("../netlify/functions/billing.js");
const U = "00000000-0000-4000-8000-000000000051";
const SINCE = "2026-11-20T15:00:00Z";
const ON_ENV = { TRIAL_PLAN_FIRST: "true", TRIAL_PLAN_FIRST_SINCE: SINCE };

// Today's words, as they are live on 2026-11-13 (main 8b3dd40).
const TODAY = {
  "trialfirst-checkout-done": "Payment received. Your plan will update when Stripe confirms it, usually within a few seconds.",
  "trialfirst-signup-title": "Create your free account",
  "trialfirst-demo-meeting": "A scripted preview. Create a free account to run this meeting on your own numbers.",
  "trialfirst-demo-coach": "That's the coach working on sample data. Create a free account to ask it about your own.",
  "trialfirst-demo-coach-button": "Create free account →",
  "trialfirst-meeting-locked": "Start your trial to run the meeting with your coach.",
};
const DISCLOSURE = {
  ios: "Payment is charged to your Apple Account when you confirm. Your subscription renews automatically unless you cancel at least 24 hours before the current period ends. You can manage or cancel it in your Apple Account settings.",
  android: "Payment is charged through Google Play when you confirm. Your subscription renews automatically unless you cancel before the renewal date. You can manage or cancel it in Google Play under Subscriptions.",
};
// The switch on: the approved words, 2026-11-13, exactly as Amanda pasted them.
const APPROVED = {
  "trialfirst-checkout-done": "Your 14 days free have started. Nothing was charged today. Your plan updates when Stripe confirms your subscription. You'll then see your first-charge date.",
  "trialfirst-disclosure-ios": "With 14 days free, nothing is charged when you confirm. Your Apple Account is charged when the 14 days end, or up to 24 hours before. A plan without 14 days free is charged when you confirm. Renews unless cancelled in Apple Account settings at least 24 hours before the trial or period ends.",
  "trialfirst-disclosure-android": "With 14 days free, nothing is charged when you confirm. The first charge goes through Google Play on the date shown. A plan without 14 days free is charged when you confirm. It renews automatically unless cancelled in Google Play under Subscriptions before the first charge or renewal date.",
  "trialfirst-signup-title": "Create your account",
  "trialfirst-demo-meeting": "A scripted preview on sample data. Create an account and choose a plan to run it on your own numbers.",
  "trialfirst-demo-coach": "That's the coach working on sample data. Create an account and choose a plan to ask about your own numbers.",
  "trialfirst-demo-coach-button": "Create account →",
  "trialfirst-meeting-locked": "Choose a plan to run the meeting with your coach.",
};
const EIGHT = Object.keys(APPROVED).sort();
const META_OFF = "Know what&#39;s safe to spend until payday. A Canadian money app where safe to spend is built around your paydays. Every feature free for 14 days.";
const META_ON = "Know what&#39;s safe to spend until payday. A Canadian money app where safe to spend is built around your paydays. Eligible new subscribers get 14 days free, then the plan renews at the listed price unless cancelled.";

(async () => {
  const t = create();
  const saved = { ...process.env };
  const ENV_KEYS = ["TRIAL_PLAN_FIRST", "TRIAL_PLAN_FIRST_SINCE", "BILLING_ENABLED", "STRIPE_PRICE_MONTHLY_CAD", "STRIPE_PRICE_ANNUAL_CAD", "STRIPE_PRICE_FOUNDING_ANNUAL_CAD"];
  const setEnv = (o) => { for (const k of ENV_KEYS) delete process.env[k]; Object.assign(process.env, o); };
  const W = await import(path.join(REPO, "src", "lib", "trialWords.js"));
  const offer = await import(path.join(REPO, "src", "lib", "storeOffer.js"));
  const vis = await import(path.join(REPO, "src", "lib", "billingVisibility.js"));
  const flow = await import(path.join(REPO, "src", "lib", "upgradeFlow.js"));
  const META = await import(path.join(REPO, "scripts", "trial-first-meta.mjs"));
  const descriptions = (html) => [...html.matchAll(/<meta (?:name="description"|property="og:description") content="([^"]*)" \/>/g)].map((m) => m[1]);

  try {
    // ════ 1. index.html ═══════════════════════════════════════════════════════════════════════════════
    t.eq(descriptions(INDEX), [META_OFF, META_OFF], "1a index.html in the repo is today's: both descriptions end \"Every feature free for 14 days.\"");
    const OFF_SETTINGS = [["both unset", {}], ["the switch alone", { TRIAL_PLAN_FIRST: "true" }], ["the time alone", { TRIAL_PLAN_FIRST_SINCE: SINCE }],
      ["the switch \"false\"", { TRIAL_PLAN_FIRST: "false", TRIAL_PLAN_FIRST_SINCE: SINCE }], ["the switch \"TRUE\"", { TRIAL_PLAN_FIRST: "TRUE", TRIAL_PLAN_FIRST_SINCE: SINCE }],
      ["a date with no time", { TRIAL_PLAN_FIRST: "true", TRIAL_PLAN_FIRST_SINCE: "2026-11-20" }], ["a time with no zone", { TRIAL_PLAN_FIRST: "true", TRIAL_PLAN_FIRST_SINCE: "2026-11-20T15:00:00" }]];
    for (const [name, env] of OFF_SETTINGS) t.ok(META.trialFirstMeta(INDEX, env) === INDEX, `1b the build with ${name}: index.html comes out exactly as it went in`);
    const built = META.trialFirstMeta(INDEX, ON_ENV);
    t.eq(descriptions(built), [META_ON, META_ON], "1c the build with the switch on: both descriptions end with the approved sentence, word for word");
    t.ok(!built.includes("Every feature free for 14 days.") && built.split("Eligible new subscribers").length === 3, "1d …and the old sentence is nowhere in the file, the new one exactly twice");
    const strip = (h) => h.replace(/<meta (?:name="description"|property="og:description") content="[^"]*" \/>/g, "");
    t.ok(strip(built) === strip(INDEX) && built.length === INDEX.length + 2 * (META_ON.length - META_OFF.length), "1e nothing else in the file changes");
    // The same rule as the server's, so the page and GET /api/trial-plan-first cannot be set apart.
    const rules = require("../netlify/functions/_lib/planRules.js");
    for (const [name, env] of [...OFF_SETTINGS, ["on", ON_ENV], ["on, with an offset", { TRIAL_PLAN_FIRST: "true", TRIAL_PLAN_FIRST_SINCE: "2026-11-20T10:00:00-05:00" }]]) {
      t.eq(META.trialFirstMeta(INDEX, env) !== INDEX, rules.trialPlanFirstSince(env) !== null, `1f ${name}: the page follows the server's own rule`);
    }
    {
      // The build really runs it: the plugin in vite.config.js, given the file as Vite gives it.
      for (const k of ["TRIAL_PLAN_FIRST", "TRIAL_PLAN_FIRST_SINCE"]) delete process.env[k];
      const cfg = (await import(path.join(REPO, "vite.config.js"))).default;
      const plugin = (cfg.plugins || []).flat().find((p) => p && p.name === "trial-first-meta");
      t.ok(plugin && typeof plugin.transformIndexHtml === "function", "1g vite.config.js carries the step");
      const offOut = plugin ? plugin.transformIndexHtml(INDEX) : null;
      Object.assign(process.env, ON_ENV);
      const onOut = plugin ? plugin.transformIndexHtml(INDEX) : null;
      for (const k of ["TRIAL_PLAN_FIRST", "TRIAL_PLAN_FIRST_SINCE"]) delete process.env[k];
      t.eq([offOut === INDEX, onOut && descriptions(onOut)], [true, [META_ON, META_ON]], "1h …and it reads the build's own environment each time: off, the file as it is; on, the approved sentence");
    }

    {
      // 1i-1k A REAL BUILD, twice: `vite build` with the switch off and on, into a folder of its own each time.
      const dir = tempDir("meta");   // removed when this test's process ends (tests/_tmp.cjs)
      const build = (name, env) => {
        const out = path.join(dir, name);
        const base = { ...process.env, VITE_SUPABASE_URL: "https://placeholder.invalid", VITE_SUPABASE_PUBLISHABLE_KEY: "placeholder" };
        for (const k of ["TRIAL_PLAN_FIRST", "TRIAL_PLAN_FIRST_SINCE"]) delete base[k];
        const r = spawnSync(process.execPath, [path.join(REPO, "node_modules", "vite", "bin", "vite.js"), "build", "--outDir", out, "--emptyOutDir", "--logLevel", "error"], { cwd: REPO, encoding: "utf8", env: { ...base, ...env } });
        let html = null; try { html = fs.readFileSync(path.join(out, "index.html"), "utf8"); } catch { html = null; }
        return { status: r.status, html };
      };
      const off = build("off", {}), on = build("on", ON_ENV), half = build("half", { TRIAL_PLAN_FIRST: "true", TRIAL_PLAN_FIRST_SINCE: "2026-11-20" });
      t.eq([off.status, off.html && descriptions(off.html)], [0, [META_OFF, META_OFF]], "1i a real build with the switch off: the published page's two descriptions are today's");
      t.eq([on.status, on.html && descriptions(on.html), !!on.html && on.html.includes("Every feature free for 14 days.")], [0, [META_ON, META_ON], false], "1j a real build with the switch on: both are the approved sentence, and the old one is gone");
      const same = (h) => String(h).replace(/assets\/[A-Za-z0-9_.-]+/g, "assets/X");
      t.ok(!!off.html && !!half.html && same(half.html) === same(off.html) && same(strip(on.html)) === same(strip(off.html)), "1k a date with no time builds as off; and on, nothing but the two descriptions differs in the page");
    }
    {
      // 1l-1m index.html reworded or reformatted so the step cannot change it: on, the build stops; off, nothing happens.
      const reworded = INDEX.split("Every feature free for 14 days.").join("Every feature free for two weeks.");
      const oneTag = INDEX.replace('<meta property="og:description" content="' + META_OFF + '" />', '<meta property="og:description" content="' + META_OFF + '">');
      for (const [name, html] of [["reworded", reworded], ["one tag reformatted", oneTag]]) {
        let err = null; try { META.trialFirstMeta(html, ON_ENV); } catch (e) { err = e; }
        t.ok(err && /trial-first-meta: TRIAL_PLAN_FIRST is on/.test(err.message), `1l ${name}, the switch on: the build stops instead of publishing the old sentence`);
        t.ok(META.trialFirstMeta(html, {}) === html, `1m ${name}, the switch off: untouched, and no error`);
      }
    }

    // ════ 2. THE EIGHT LINES ══════════════════════════════════════════════════════════════════════════
    t.eq(W.SWITCH_OFF_WORDS, TODAY, "2a today's lines are kept word for word");
    for (const id of Object.keys(TODAY)) {
      t.eq([W.switchWords(id, false), W.switchWords(id, undefined), W.switchWords(id, null), W.switchWords(id, "true"), W.switchWords(id, 1)], Array(5).fill(TODAY[id]),
        `2b ${id}: off, no answer, or anything but a definite "on": today's line`);
      t.eq(W.switchWords(id, true), APPROVED[id], `2c ${id}: on: the approved line, word for word`);
    }
    let threw = false; try { W.switchWords("trialfirst-button", true); } catch { threw = true; }
    t.ok(threw, "2d a line with no words for the switch off is refused, never guessed");
    for (const [p, id] of [["ios", "trialfirst-disclosure-ios"], ["android", "trialfirst-disclosure-android"]]) {
      t.eq([offer.storeDisclosure(p), offer.storeDisclosure(p, {}), offer.storeDisclosure(p, { trialClaimed: false }), offer.storeDisclosure(p, { trialClaimed: "yes" })], Array(4).fill(DISCLOSURE[p]),
        `2e ${p}: no plan claims the 14 days: the approved disclosure of 2026-10-20, word for word`);
      t.eq(offer.storeDisclosure(p, { trialClaimed: true }), APPROVED[id], `2f ${p}: a plan claims the 14 days: the approved line, word for word`);
    }
    t.eq(offer.STORE_DISCLOSURE, DISCLOSURE, "2g the approved disclosures themselves are untouched");

    // ════ 3. ON THE SCREENS ═══════════════════════════════════════════════════════════════════════════
    // Each old sentence now lives in one place (the words module); the screens ask for it by id.
    for (const [id, words] of Object.entries(TODAY)) {
      t.ok(!APP.includes(words), `3a "${words.slice(0, 40)}…" is no longer typed into App.jsx`);
    }
    const calls = Object.fromEntries(Object.keys(TODAY).map((id) => [id, (APP.match(new RegExp(`switchWords\\("${id}", (tpfOn|tpfOnNow)\\)`, "g")) || []).length]));
    t.eq(calls, { "trialfirst-checkout-done": 0, "trialfirst-signup-title": 1, "trialfirst-demo-meeting": 1, "trialfirst-demo-coach": 1, "trialfirst-demo-coach-button": 1, "trialfirst-meeting-locked": 1 },
      "3b each screen line is asked for once, with the switch (the checkout notice is asked for in lib/billingVisibility.js)");
    t.ok(/^  useEffect\(\(\)=>\{ setTpfOn\(tpfOn\); \},\[tpfOn\]\);$/m.test(APP) && /^  const tpfOn = !!tpfStatus \|\| tpfPublic===true;$/m.test(APP)
      && /^function useTpfOn\(\)\{ return useSyncExternalStore\(tpfSubscribe, tpfSnapshot, tpfSnapshot\); \}$/m.test(APP) && (APP.match(/^  const tpfOnNow = useTpfOn\(\);/gm) || []).length === 2
      && APP.includes("function setTpfOn(v){ const on = v === true;") && APP.includes("const TPF_STORE = { on: false, subs: new Set() };"),
      "3c the screens deep in the app hear the switch from the server's answers, and it is off until one says on");

    let A = {};
    try { A = loadApp(["AICoach", "MeetAgenda", "setTpfOn", "buildDemoState"]); } catch (e) { t.ok(false, `App.jsx bundles: ${describe(e)}`); }
    if (A.AICoach) {
      const demo = A.buildDemoState("CA");
      t.ok(demo && demo.demo === true, "3d the demo's own data");
      const coach = () => textOf(A.render(A.h(A.AICoach, { data: demo, isOnline: true, onExitDemo: () => {} })));
      const meet = () => textOf(A.render(A.h(A.MeetAgenda, { data: demo, isCouple: false, setScreen: () => {}, setAppData: () => {} })));
      A.setTpfOn(false);
      let c = "", m = "";
      try { c = coach(); } catch (e) { t.ok(false, `the demo coach renders: ${describe(e)}`); }
      try { m = meet(); } catch (e) { t.ok(false, `the demo meeting renders: ${describe(e)}`); }
      t.ok(c.includes(`${TODAY["trialfirst-demo-coach"]} ${TODAY["trialfirst-demo-coach-button"]}`) && !c.includes("[WORDS:"), "3e the demo coach, switch off: today's line and button, word for word");
      t.ok(m.includes(TODAY["trialfirst-demo-meeting"]) && !m.includes("[WORDS:"), "3f the demo meeting, switch off: today's line, word for word");
      A.setTpfOn(true);
      try { c = coach(); m = meet(); } catch (e) { t.ok(false, `the demo renders with the switch on: ${describe(e)}`); }
      t.ok(c.includes(`${APPROVED["trialfirst-demo-coach"]} ${APPROVED["trialfirst-demo-coach-button"]}`) && !/free account/i.test(c) && !c.includes("[WORDS:"), "3g the demo coach, switch on: the approved line and button, and \"free account\" is gone");
      t.ok(m.includes(APPROVED["trialfirst-demo-meeting"]) && !/free account/i.test(m) && !m.includes("[WORDS:"), "3h the demo meeting, switch on: the approved line, and \"free account\" is gone");
      // A signed-in account with no plan, on the website: the meeting's locked line.
      const mine = { ...demo, demo: false };
      const locked = () => textOf(A.render(A.h(A.MeetAgenda, { data: mine, isCouple: false, setScreen: () => {}, setAppData: () => {} })));
      let on = "", off = "";
      try { on = locked(); A.setTpfOn(false); off = locked(); } catch (e) { t.ok(false, `the meeting renders for a signed-in account: ${describe(e)}`); }
      t.ok(off.includes(TODAY["trialfirst-meeting-locked"]) && !off.includes("[WORDS:"), "3i the meeting with no plan, switch off: \"Start your trial to run the meeting with your coach.\"");
      t.ok(on.includes(APPROVED["trialfirst-meeting-locked"]) && !on.includes("Start your trial") && !on.includes("[WORDS:"), "3j …switch on: \"Choose a plan to run the meeting with your coach.\", and no trial to \"start\" is promised");
      A.setTpfOn(false);
    }
    t.ok(APP.includes('{mode === "signup" ? switchWords("trialfirst-signup-title", tpfOn) : mode === "check_email" ? "Almost there" : "Welcome back"}')
      && /function AuthScreen\(\{[^)]*tpfOn = false[^)]*\}\)/.test(APP) && /<AuthScreen [^\n]*tpfOn=\{tpfOn\}/.test(APP),
      "3k the sign-up card's heading takes the switch the landing already takes (off unless the server says on)");

    // ════ 4. BACK FROM STRIPE ═════════════════════════════════════════════════════════════════════════
    t.eq(vis.billingReturnNotice("?billing=success&session_id=cs_1"), { kind: "success", text: TODAY["trialfirst-checkout-done"] }, "4a back from a checkout that took a payment: \"Payment received. …\", word for word");
    t.eq([vis.billingReturnNotice("?billing=success&trial=0&session_id=cs_1").text, vis.billingReturnNotice("?billing=success&trial=true").text, vis.billingReturnNotice("?trial=1"), vis.billingReturnNotice("?billing=cancelled&trial=1")],
      [TODAY["trialfirst-checkout-done"], TODAY["trialfirst-checkout-done"], null, { kind: "cancelled", text: "Checkout cancelled. Nothing was charged." }],
      "4b only the server's own mark (trial=1 on a success return) changes it; a cancelled checkout says what it always said");
    t.eq(vis.billingReturnNotice("?billing=success&trial=1&session_id=cs_1"), { kind: "success", text: APPROVED["trialfirst-checkout-done"] }, "4c back from a checkout that started the 14 days: \"Your 14 days free have started. Nothing was charged today. …\", never \"Payment received\"");
    t.ok(vis.BILLING_RETURN_PARAMS.includes("trial") && vis.BILLING_RETURN_PARAMS.includes("billing") && vis.BILLING_RETURN_PARAMS.includes("session_id"), "4d the mark comes off the address bar with the rest");
    {
      // The server puts the mark on a trial checkout only: the real checkout, switch off and on, eligible and not.
      const PRICES = { STRIPE_PRICE_MONTHLY_CAD: "price_m", STRIPE_PRICE_ANNUAL_CAD: "price_a", STRIPE_PRICE_FOUNDING_ANNUAL_CAD: "price_f" };
      const successUrl = async (env, body, { hadSub = false } = {}) => {
        setEnv({ BILLING_ENABLED: "true", ...PRICES, ...env });
        const stripe = fakeStripe({ "/customers": { id: "cus_51" }, ...(hadSub ? { "/subscriptions?customer=cus_51&status=all&limit=1": { data: [{ id: "sub_old", status: "canceled" }] } } : {}) });
        const admin = fakeAdmin({ profiles: [{ user_id: U, plan: "trial", founder_flag: false, trial_started_at: "2026-11-21T10:00:00Z" }], subscriptions: [] },
          { rpc: async (n) => (n === "purchase_attempt_begin" ? { data: { result: "held" }, error: null } : { data: null, error: null }) });
        const res = await loadWith(BILLING, { admin, stripe, userId: U }).handler({ httpMethod: "POST", headers: { origin: "https://flourishmoney.app" }, body: JSON.stringify({ action: "create_checkout_session", plan_key: "monthly", ...body }) });
        const made = stripe.calls.find((c) => c.method === "POST" && c.url === "/checkout/sessions");
        return [res.statusCode, made ? made.body.success_url : null, made ? !!made.body.subscription_data.trial_period_days : null];
      };
      t.eq(await successUrl({}, {}), [200, "https://flourishmoney.app/?billing=success&session_id={CHECKOUT_SESSION_ID}", false], "4e the switch off: the return address is today's exactly, and no trial");
      t.eq(await successUrl(ON_ENV, { trial: true }), [200, "https://flourishmoney.app/?billing=success&trial=1&session_id={CHECKOUT_SESSION_ID}", true], "4f on, a checkout that starts the 14 days: marked");
      t.eq(await successUrl(ON_ENV, { trial: false }, { hadSub: true }), [200, "https://flourishmoney.app/?billing=success&session_id={CHECKOUT_SESSION_ID}", false], "4g on, an account that has subscribed before (charged today): not marked, so it reads \"Payment received\"");
    }

    // ════ 5. THE STORE PLANS' DISCLOSURE, ON THE SCREEN ═══════════════════════════════════════════════
    t.ok(APP.includes("{storeDisclosure(platform, { trialClaimed })}") && APP.includes("const trialClaimed = cards.some(c=>c.trial?.claim===true);") && (APP.match(/storeDisclosure\(/g) || []).length === 1,
      "5a the one disclosure under the store plans changes only when a card on that screen claims the 14 days");
    t.ok(APP.includes("const trial = (trialFirst && copy) ? trialDisclosure({ platform, eligible: storeTrialEligible({ platform, product: p.product, eligibility: introElig }), price: copy.price, planKey: plan, words: trialWords }) : null;"),
      "5b …and a card can claim them only with the switch on and the store's own yes, so off it is always the approved line");

    // ════ 6. LEFT ALONE, ON PURPOSE ═══════════════════════════════════════════════════════════════════
    t.eq([flow.reviewChargeLine("monthly"), flow.reviewChargeLine("annual")],
      ["If you subscribe, you're charged today in CAD plus tax, then every month until you cancel. You can cancel in Settings → Manage subscription. Any trial ends when you subscribe.",
        "If you subscribe, you're charged today in CAD plus tax, then every year until you cancel. You can cancel in Settings → Manage subscription. Any trial ends when you subscribe."],
      "6a the website's review line: today's words, unchanged");
    t.ok(APP.includes("{trialOf(chosen) ? <TrialTerms disclosure={trialOf(chosen)}/> : <div style={{color:C.mutedHi,fontSize:14,lineHeight:1.6}}>{reviewChargeLine(chosen.key)}</div>}")
      && APP.includes("const trialOf = (plan) => trialFirst ? trialDisclosure({ platform:\"web\", eligible: webEligible, price: plan.price, planKey: plan.key, words: trialWords }) : null;"),
      "6b …and it already follows the switch: on, the approved trial lines take its place for every plan");
    const SW = require("../netlify/functions/_lib/trialWords.js");
    t.eq([SW.TRIAL_EMAIL_WORDS["trialfirst-email-charge"], SW.TRIAL_EMAIL_WORDS["trialfirst-email-keep"], Object.values(SW.TRIAL_EMAIL_WORDS).some((w) => /\[WORDS:/.test(w))],
      ["On {date}, you'll be charged {amount}, plus any applicable tax, unless you cancel first.", "To keep your plan, you don't need to do anything.", false],
      "6c the reminder email's charge lines: the approved words of 2026-11-10, unchanged, and no placeholder (an email holding one is never sent)");

    // ════ 7. NO PLACEHOLDER IS LEFT ═══════════════════════════════════════════════════════════════════
    const guard = spawnSync(process.execPath, [path.join(REPO, "scripts", "check-pending-words.mjs"), path.join("src", "lib", "trialWords.js")], { cwd: REPO, encoding: "utf8" });
    t.eq([guard.status, String(guard.stderr).includes("[WORDS:")], [0, false], "7a the build guard passes the words module: the eight lines are in");
    t.eq([EIGHT.map((id) => W.TRIAL_WORDS[id] === APPROVED[id]), Object.values(W.TRIAL_WORDS).some((w) => /\[WORDS:/.test(w)), Object.values(W.SWITCH_OFF_WORDS).some((w) => /\[WORDS:/.test(w))],
      [Array(8).fill(true), false, false], "7b each of the eight is the approved line in the module, and no line there is a placeholder");
    // The approved lines keep the house rules: no "free account", no em dash, lowercase flourish where it is named.
    t.ok(Object.values(APPROVED).every((w) => !/free account|\u2014|Flourish/.test(w)), "7b2 none of them says \"free account\", uses an em dash, or capitalises flourish");
    const toml = fs.readFileSync(path.join(REPO, "netlify.toml"), "utf8");
    const pkg = JSON.parse(fs.readFileSync(path.join(REPO, "package.json"), "utf8"));
    t.ok(/\[context\.production\]\s+command\s+= "npm run build && node scripts\/check-pending-words\.mjs dist netlify\/functions"/.test(toml) && /node scripts\/check-pending-words\.mjs dist$/.test(pkg.scripts["build:native"]),
      "7c the production web build and every store build still run that guard");
  } finally {
    for (const k of ENV_KEYS) { if (k in saved) process.env[k] = saved[k]; else delete process.env[k]; }
  }

  t.summary("trialSwitchWords.test");
  setImmediate(() => process.exit(process.exitCode || 0));
})();
