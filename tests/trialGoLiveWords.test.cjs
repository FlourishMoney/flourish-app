// tests/trialGoLiveWords.test.cjs
// -----------------------------------------------------------------------------
// TRIAL_PLAN_FIRST'S GO-LIVE WORDS (approved 2026-11-11, ChatGPT 100 and Grok 100), behind the switch:
//   1  Terms section 7 while it is on: one text for the website and a store app that sells, word for word, with
//      terms-7-founding and the switch's date; off (or no answer), today's section 7 everywhere, unchanged;
//   2  the Terms learn the switch and its date from the server themselves (GET /api/trial-plan-first, since);
//   3  the landing's main button: "Get started" while on (top and bottom, trialfirst-landing under it), today's
//      "Try flourish free for 14 days" while off;
//   4  index.html's meta sentence: the approved sentence is listed for it, and (2026-11-13) the build puts it in while
//      the switch is on (scripts/trial-first-meta.mjs; tests/trialSwitchWords.test.cjs holds the build step itself).
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");
const { loadApp, textOf, describe, REPO } = require("./_renderApp.cjs");
const { loadWith } = require("./_trialFakes.cjs");

const APP = fs.readFileSync(path.join(REPO, "src", "App.jsx"), "utf8");
const SINCE = "2026-11-20T15:00:00Z";
const FOUNDING = "The founding price is for the first 50 households who subscribe to Founding annual. It is not reserved for anyone, it stays the same while that subscription stays active, and it does not come back once that subscription ends.";
// The approved text, word for word, with [terms-7-founding] and {date} put in (paragraph breaks as approved).
const APPROVED_7 = [
  `flourish is sold as a subscription: flourish monthly, flourish annual and, while offered, flourish founding annual. ${FOUNDING} A new account chooses a plan to keep using flourish. A partner who joins a household can use the same subscription. Prices are in Canadian dollars, plus sales tax on the website.`,
  "Eligible new subscribers get 14 days free. Apple, Google or Stripe decides who is eligible, and the website needs a card to start. The plans screen shows whether the 14 days apply and the first-charge date. Unless you cancel before the first charge, you will be charged automatically. Apple may charge up to 24 hours before the trial ends. Your plan then renews automatically each billing period until you cancel.",
  "To cancel on iPhone: Settings, your name, then Subscriptions, at least 24 hours before the trial or period ends. On Android: Google Play, your profile, Payments & subscriptions, then Subscriptions. On the website: Settings, then Manage subscription. Cancel before the first charge and you pay nothing; after that, cancelling takes effect at the period's end.",
  "An account opened before November 20, 2026 keeps its 14-day account trial to its end, then moves to the free plan: 2 coach messages a week, 1 What-If a day, 1 connected bank, and no Credit or coach-run meeting.",
  "Apple or Google handle refunds for in-app purchases under their own policies. On the website, partial periods are not refunded unless the law requires it.",
];
const ENV_KEYS = ["TRIAL_PLAN_FIRST", "TRIAL_PLAN_FIRST_SINCE"];
function setEnv(o) { for (const k of ENV_KEYS) delete process.env[k]; Object.assign(process.env, o); }

(async () => {
  const t = create();
  const F = await import(path.join(REPO, "src", "lib", "freePlan.js"));
  const P = await import(path.join(REPO, "src", "lib", "pendingWords.js"));
  const lib = await import(path.join(REPO, "src", "lib", "trialPlanFirst.js"));
  const W = await import(path.join(REPO, "src", "lib", "trialWords.js"));

  // ── 1. section 7, the text ──────────────────────────────────────────────────────────────────────
  t.eq(P.pendingWords("terms-7-founding"), FOUNDING, "1a the founding sentence is terms-7-founding, as approved");
  t.eq(F.trialFirstTermsSection7(SINCE), APPROVED_7, "1b section 7 while the switch is on: the approved text, word for word, dated from the switch");
  t.eq(F.TRIAL_FIRST_TERMS_7_HEADING, "7. Plans and billing", "1c …under the approved heading");
  t.eq([F.trialFirstTermsSection7(null), F.trialFirstTermsSection7(""), F.trialFirstTermsSection7("soon")], [null, null, null],
    "1d no time, no text: the Terms keep today's section 7");
  const all7 = APPROVED_7.join(" ");
  t.ok(!/Flourish Plus/i.test(all7) && !/Flourish\b/.test(all7.replace(/^flourish/, "")), "1e no \"Flourish Plus\", and flourish is lowercase throughout");

  // ── 1. section 7, on the screen ─────────────────────────────────────────────────────────────────
  let A = {}, S = {};
  try { A = loadApp(["TermsOfService", "TrialButton"]); } catch (e) { t.ok(false, `App.jsx bundles: ${describe(e)}`); }
  try { S = loadApp(["TermsOfService"], { env: { VITE_IAP_ENABLED: "true" } }); } catch (e) { t.ok(false, `App.jsx bundles (selling store build): ${describe(e)}`); }
  const real = globalThis.Capacitor;
  const as = (p, fn) => {
    Object.defineProperty(globalThis, "Capacitor", { value: p === "web" ? undefined : { getPlatform: () => p, isNativePlatform: () => true }, configurable: true, writable: true });
    try { return fn(); } finally { Object.defineProperty(globalThis, "Capacitor", { value: real, configurable: true, writable: true }); }
  };
  const terms = (X, p, props = {}) => as(p, () => textOf(X.render(X.h(X.TermsOfService, { onBack: () => {}, ...props }))));
  const ON = APPROVED_7.join(" ");
  const webOff = terms(A, "web"), webOn = terms(A, "web", { tpfSince: SINCE });
  t.ok(webOff.includes("7. Subscription & Billing") && webOff.includes("a 14-day trial of premium features") && !webOff.includes("Plans and billing") && webOff.includes("Last updated October 14, 2026"),
    "1f the website, switch off: today's section 7 and date, unchanged");
  t.ok(webOn.includes(`7. Plans and billing ${ON}`) && !webOn.includes("a 14-day trial of premium features") && !webOn.includes("Flourish Plus") && webOn.includes("Last updated November 20, 2026"),
    "1g the website, switch on: the approved section 7, dated the day it went on");
  for (const p of ["ios", "android"]) {
    const off = terms(S, p), on = terms(S, p, { tpfSince: SINCE });
    t.ok(off.includes(`7. Cost and usage limits ${F.STORE_TERMS_SECTION_7_IAP}`) && !off.includes("Plans and billing"), `1h a selling store build (${p}), switch off: today's section 7`);
    t.ok(on.includes(`7. Plans and billing ${ON}`) && !on.includes(F.STORE_TERMS_SECTION_7_IAP.slice(0, 60)) && on.includes("Last updated November 20, 2026"),
      `1i …switch on: the same approved text as the website (${p})`);
  }
  const quiet = terms(A, "android", { tpfSince: SINCE });
  t.ok(quiet.includes(`7. Cost and usage limits ${F.STORE_TERMS_SECTION_7}`) && !quiet.includes("Plans and billing"),
    "1j a store build that sells nothing keeps its own section 7 even with the switch on (it sells no subscription)");

  // ── 2. the Terms ask the server ─────────────────────────────────────────────────────────────────
  const fake = (status, body) => async () => ({ status, ok: status >= 200 && status < 300, json: async () => body });
  t.eq([await lib.askTrialPlanFirst(fake(200, { on: true, since: "2026-11-20T15:00:00.000Z" })), await lib.askTrialPlanFirst(fake(200, { on: true })),
    await lib.askTrialPlanFirst(fake(200, { on: true, since: "soon" })), await lib.askTrialPlanFirst(fake(404, {})), await lib.askTrialPlanFirst(fake(500, {})),
    await lib.askTrialPlanFirst(async () => { throw new Error("offline"); })],
    [{ on: true, since: "2026-11-20T15:00:00.000Z" }, { on: true, since: null }, { on: true, since: null }, false, null, null],
    "2a the public answer with its time: on with since, off, or no answer");
  const T = APP.slice(APP.indexOf("function TermsOfService("), APP.indexOf("<div style={h2}>8. Intellectual Property</div>"));
  t.ok(/useEffect\(\(\)=>\{ let live=true; askTrialPlanFirst\(fetch, API_BASE\)\.then\(a=>\{ if\(!live\) return; if\(a===false\) setTpfSince\(null\); else if\(a&&a\.since\) setTpfSince\(a\.since\); \}\)/.test(T),
    "2b the Terms ask GET /api/trial-plan-first themselves: off clears it, no answer keeps what they had");
  t.ok(T.includes("const tpfTerms = (!isNativeApp() || storeBillingBuild()) ? trialFirstTermsSection7(tpfSince) : null;"), "2c the website and a selling store build only");
  setEnv({ TRIAL_PLAN_FIRST: "true", TRIAL_PLAN_FIRST_SINCE: SINCE });
  const FLAG_FN = require.resolve("../netlify/functions/trial-plan-first.js");
  let res = await loadWith(FLAG_FN, {}).handler({ httpMethod: "GET", headers: { origin: "capacitor://localhost" } });
  t.eq(JSON.parse(res.body), { on: true, since: "2026-11-20T15:00:00.000Z" }, "2d the server sends the switch's time with its answer");
  setEnv({});
  res = await loadWith(FLAG_FN, {}).handler({ httpMethod: "GET", headers: { origin: "https://flourishmoney.app" } });
  t.eq(res.statusCode, 404, "2e …and nothing while it is off");

  // ── 3. the landing's main button ────────────────────────────────────────────────────────────────
  t.eq(W.TRIAL_WORDS["trialfirst-get-started"], "Get started", "3a the approved button words");
  const btn = (props) => as("web", () => { const html = A.render(A.h(A.TrialButton, { onClick: () => {}, ...props })); const m = html.match(/<button[^>]*>([\s\S]*?)<\/button>/); return m ? textOf(m[1]) : null; });
  t.eq([btn({}), btn({ tpfOn: false }), btn({ tpfOn: true })], ["Try flourish free for 14 days", "Try flourish free for 14 days", "Get started"],
    "3b switch off: today's words; on: \"Get started\"");
  t.eq((APP.match(/<TrialButton onClick=\{goSignup\} tpfOn=\{tpfOn\}\/>/g) || []).length, 2, "3c both main buttons on the landing (top and bottom) follow the switch");
  t.ok(APP.includes('{trialFirst && <TrialButton onClick={goSignup} tpfOn={tpfOn}/>}\n                {trialFirst && <p className="fll-trial-line">{tpfOn ? trialWords("trialfirst-landing") : "Every feature free for 14 days. Also on iPhone and Android."}</p>}')
    && APP.includes('<TrialButton onClick={goSignup} tpfOn={tpfOn}/>\n              {tpfOn && <p className="fll-trial-line">{trialWords("trialfirst-landing")}</p>}'),
    "3d …each with trialfirst-landing under it while on (the bottom one adds nothing while off)");

  // ── 4. index.html: at build time since 2026-11-13 (it was "by hand on the day") ─────────────────────
  const list = fs.readFileSync(path.join(REPO, "docs", "product", "TRIAL-PLAN-FIRST-NO-CARD.md"), "utf8");
  const META = await import(path.join(REPO, "scripts", "trial-first-meta.mjs"));
  t.ok(list.includes("\"Eligible new subscribers get 14 days free, then the plan renews at the listed price unless cancelled.\"") && list.includes("Since 2026-11-13 it follows the switch at build time instead (`scripts/trial-first-meta.mjs`)") && /^1\. \*\*`index\.html`\*\* meta description and og:description/m.test(list)
    && META.META_ON === "Eligible new subscribers get 14 days free, then the plan renews at the listed price unless cancelled.",
    "4a the approved meta sentence is listed for index.html, and it is the one the build puts in while the switch is on");

  t.summary("trialGoLiveWords.test");
  setImmediate(() => process.exit(process.exitCode || 0));
})();
